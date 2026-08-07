import type { EntitlementPlan } from './entitlements';
import { PublicError, type PublicErrorCode } from './errors';

export type AdmissionRoute = '/v1/analyses' | '/v1/responses';
export type AdmissionRequest = {
  plan: EntitlementPlan;
  subjectDigest: string;
  route: AdmissionRoute;
  now: number;
};
export type AdmissionResult =
  | { allowed: true; leaseId: string; inFlight: number; budgetWarning: BudgetWarning }
  | { allowed: false; code: AdmissionRejectionCode; retryAfterSeconds: number };

export type BudgetWarning = 'under-80' | 'at-least-80';
export type AdmissionCompletionOutcome =
  | 'success'
  | 'provider_failure'
  | 'invalid_output'
  | 'caller_error'
  | 'configuration_failure'
  | 'pre_provider_abort';
type AdmissionRejectionCode = Extract<PublicErrorCode, 'PLAN_LIMIT_REACHED' | 'SERVICE_BUSY' | 'DAILY_BUDGET_REACHED' | 'PROVIDER_UNAVAILABLE'>;
type AdmissionRejection = Extract<AdmissionResult, { allowed: false }>;
type AdmissionConfig = { maxGlobalInFlight?: unknown; maxDailyProviderUnits?: unknown };
type InternalReservation = AdmissionRequest & {
  maxGlobalInFlight: number;
  maxDailyProviderUnits: number;
};
type ReservedLease = {
  allowed: true;
  leaseId: string;
  inFlight: number;
  expiresAt: number;
  day: string;
  period: string;
  providerUnits: number;
  budgetWarning: BudgetWarning;
  isProbe: boolean;
};

type LeaseAccounting = {
  lease_id: string;
  subject_digest: string;
  period: string;
  route: AdmissionRoute;
  day: string;
  provider_units: number;
  is_probe: number;
};

type SuccessReceipt = LeaseAccounting & { expires_at: number };

type CircuitRow = { state: string; opened_at: number; probe_lease_id: string | null };

const DEFAULT_MAX_GLOBAL_IN_FLIGHT = 100;
const LEASE_TTL_MS = 2 * 60_000;
const RELEASE_DEADLINE_MS = 2_000;
const COMPLETION_ATTEMPT_DEADLINE_MS = 750;
const COMPLETION_ATTEMPTS = 3;
const SUCCESS_RECEIPT_TTL_MS = 60_000;
const PROVIDER_FAILURE_WINDOW_MS = 60_000;
const PROVIDER_FAILURE_THRESHOLD = 5;
const PROVIDER_CIRCUIT_COOLDOWN_MS = 30_000;
const FREE_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60_000;
const SUBJECT_DOMAIN = 'convoautopsy:ai-admission-subject:v1\0';
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

export async function deriveAdmissionSubjectDigest(
  identifier: string,
  kind: 'customer' | 'installation',
  secret: string,
): Promise<string> {
  if (!identifier || !secret) throw new PublicError('INTERNAL_ERROR', 500);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${SUBJECT_DOMAIN}${kind}\0${identifier}`),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function reserveAdmission(
  namespace: DurableObjectNamespace,
  request: AdmissionRequest,
  config: AdmissionConfig,
): Promise<AdmissionResult> {
  const maxGlobalInFlight = config.maxGlobalInFlight === undefined
    ? DEFAULT_MAX_GLOBAL_IN_FLIGHT
    : parseSafePositiveInteger(config.maxGlobalInFlight);
  const maxDailyProviderUnits = parseSafePositiveInteger(config.maxDailyProviderUnits);
  if (!validAdmissionRequest(request)) throw new PublicError('INTERNAL_ERROR', 500);

  const internal: InternalReservation = { ...request, maxGlobalInFlight, maxDailyProviderUnits };
  try {
    const response = await globalStub(namespace).fetch('https://admission.internal/reserve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(internal),
    });
    if (!response.ok) throw new Error('Admission coordinator unavailable');
    const result: unknown = await response.json();
    if (!isAdmissionResult(result)) throw new Error('Invalid admission coordinator response');
    return result;
  } catch (error) {
    if (error instanceof PublicError) throw error;
    throw new PublicError('INTERNAL_ERROR', 500);
  }
}

export async function releaseAdmission(namespace: DurableObjectNamespace, leaseId: string): Promise<void> {
  if (!leaseId) throw new PublicError('INTERNAL_ERROR', 500);
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new DOMException('Admission release deadline exceeded', 'TimeoutError'));
    }, RELEASE_DEADLINE_MS);
  });
  try {
    const operation = globalStub(namespace).fetch('https://admission.internal/release', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ leaseId }),
      signal: controller.signal,
    });
    const response = await Promise.race([operation, deadline]);
    if (!response.ok) throw new Error('Admission coordinator unavailable');
  } catch {
    throw new PublicError('INTERNAL_ERROR', 500);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export async function completeAdmission(
  namespace: DurableObjectNamespace,
  leaseId: string,
  outcome: AdmissionCompletionOutcome,
  now: number,
): Promise<void> {
  if (!leaseId || !isCompletionOutcome(outcome) || !validTimestamp(now)) {
    throw new PublicError('INTERNAL_ERROR', 500);
  }
  const body = JSON.stringify({ leaseId, outcome, now });
  for (let attempt = 0; attempt < COMPLETION_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new DOMException('Admission completion deadline exceeded', 'TimeoutError'));
      }, COMPLETION_ATTEMPT_DEADLINE_MS);
    });
    try {
      const operation = globalStub(namespace).fetch('https://admission.internal/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: controller.signal,
      });
      const response = await Promise.race([operation, deadline]);
      if (response.ok) return;
    } catch {
      // A lost response is safe to retry because completion is durable and idempotent.
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }
  throw new PublicError('INTERNAL_ERROR', 503, 1);
}

export class AdmissionDurableObject {
  constructor(protected readonly state: DurableObjectState) {
    this.state.storage.sql.exec('CREATE TABLE IF NOT EXISTS daily_budget(day TEXT PRIMARY KEY, provider_units INTEGER NOT NULL)');
    this.state.storage.sql.exec('CREATE TABLE IF NOT EXISTS inflight(lease_id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)');
    this.state.storage.sql.exec('CREATE TABLE IF NOT EXISTS plan_usage(subject_digest TEXT NOT NULL, period TEXT NOT NULL, route TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(subject_digest, period, route))');
    this.state.storage.sql.exec('CREATE INDEX IF NOT EXISTS plan_usage_period_idx ON plan_usage(period)');
    this.state.storage.sql.exec('CREATE TABLE IF NOT EXISTS maintenance_state(id INTEGER PRIMARY KEY CHECK(id = 1), last_retention_day TEXT NOT NULL)');
    this.state.storage.sql.exec('CREATE TABLE IF NOT EXISTS lease_accounting(lease_id TEXT PRIMARY KEY, subject_digest TEXT NOT NULL, period TEXT NOT NULL, route TEXT NOT NULL, day TEXT NOT NULL, provider_units INTEGER NOT NULL, is_probe INTEGER NOT NULL CHECK(is_probe IN (0, 1)))');
    this.state.storage.sql.exec('CREATE TABLE IF NOT EXISTS success_receipt(lease_id TEXT PRIMARY KEY, subject_digest TEXT NOT NULL, period TEXT NOT NULL, route TEXT NOT NULL, day TEXT NOT NULL, provider_units INTEGER NOT NULL, is_probe INTEGER NOT NULL CHECK(is_probe IN (0, 1)), expires_at INTEGER NOT NULL)');
    this.state.storage.sql.exec('CREATE INDEX IF NOT EXISTS success_receipt_expires_idx ON success_receipt(expires_at)');
    this.state.storage.sql.exec('CREATE TABLE IF NOT EXISTS provider_failures(failure_id TEXT PRIMARY KEY, observed_at INTEGER NOT NULL)');
    this.state.storage.sql.exec('CREATE INDEX IF NOT EXISTS provider_failures_observed_idx ON provider_failures(observed_at)');
    this.state.storage.sql.exec("CREATE TABLE IF NOT EXISTS accounting_reconciliation(event_id TEXT PRIMARY KEY, observed_at INTEGER NOT NULL, reason TEXT NOT NULL CHECK(reason = 'expired_unresolved'))");
    this.state.storage.sql.exec('CREATE INDEX IF NOT EXISTS accounting_reconciliation_observed_idx ON accounting_reconciliation(observed_at)');
    this.state.storage.sql.exec("CREATE TABLE IF NOT EXISTS provider_circuit(id INTEGER PRIMARY KEY CHECK(id = 1), state TEXT NOT NULL, opened_at INTEGER NOT NULL, probe_lease_id TEXT)");
    this.state.storage.sql.exec("INSERT OR IGNORE INTO provider_circuit (id, state, opened_at, probe_lease_id) VALUES (1, 'closed', 0, NULL)");
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const path = new URL(request.url).pathname;
    if (path === '/reserve') return this.reserve(request);
    if (path === '/release') return this.release(request);
    if (path === '/complete') return this.complete(request);
    return new Response(null, { status: 404 });
  }

  async alarm(): Promise<void> {
    const nextAlarm = this.state.storage.transactionSync(() => {
      this.assertCircuit();
      const now = Date.now();
      this.deleteExpiredLeases(now);
      this.deleteExpiredSuccessReceipts(now);
      return this.earliestAccountingDeadline();
    });
    await this.scheduleAlarm(nextAlarm);
  }

  async activeReservationCount(now: number): Promise<number> {
    if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid diagnostics timestamp');
    const state = this.state.storage.transactionSync(() => {
      this.assertCircuit();
      this.deleteExpiredLeases(now);
      this.deleteExpiredSuccessReceipts(now);
      return { count: this.inflightCount(), nextAlarm: this.earliestAccountingDeadline() };
    });
    try {
      await this.scheduleAlarm(state.nextAlarm);
    } catch {
      // Counting is diagnostic-only; the existing lease alarm remains the recovery boundary.
    }
    return state.count;
  }

  private async reserve(request: Request): Promise<Response> {
    const input = await parseJson(request);
    if (!isInternalReservation(input)) return new Response(null, { status: 400 });

    const reservation = this.state.storage.transactionSync(() => this.reserveSync(input));
    const nextAlarm = this.earliestAccountingDeadline();
    try {
      await this.scheduleAlarm(nextAlarm);
    } catch {
      if (reservation.allowed) {
        this.state.storage.transactionSync(() => this.rollbackReservation(reservation, input));
        try {
          await this.scheduleAlarm(this.earliestAccountingDeadline());
        } catch {
          // The lease and its accounting are already compensated; a later request can reschedule.
        }
      }
      return new Response(null, { status: 500 });
    }
    return Response.json(publicResult(reservation));
  }

  private async release(request: Request): Promise<Response> {
    const input = await parseJson(request);
    if (!isRecord(input) || typeof input.leaseId !== 'string' || !input.leaseId) {
      return new Response(null, { status: 400 });
    }
    const nextAlarm = this.state.storage.transactionSync(() => {
      const leaseId = input.leaseId as string;
      const accounting = this.leaseAccounting(leaseId);
      this.assertCircuit();
      this.state.storage.sql.exec('DELETE FROM inflight WHERE lease_id = ?', leaseId);
      this.state.storage.sql.exec('DELETE FROM lease_accounting WHERE lease_id = ?', leaseId);
      if (accounting?.is_probe === 1) this.closeCircuit();
      return this.earliestAccountingDeadline();
    });
    try {
      await this.scheduleAlarm(nextAlarm);
    } catch {
      // The release is complete. An existing alarm remains the recovery boundary.
    }
    return new Response(null, { status: 204 });
  }

  private async complete(request: Request): Promise<Response> {
    const input = await parseJson(request);
    if (!isRecord(input)
      || typeof input.leaseId !== 'string'
      || !input.leaseId
      || !isCompletionOutcome(input.outcome)
      || !validTimestamp(input.now)) {
      return new Response(null, { status: 400 });
    }

    const nextAlarm = this.state.storage.transactionSync(() => {
      this.completeSync(input.leaseId as string, input.outcome as AdmissionCompletionOutcome, input.now as number);
      return this.earliestAccountingDeadline();
    });
    try {
      await this.scheduleAlarm(nextAlarm);
    } catch {
      // Completion is durable and idempotent; an existing alarm remains the recovery boundary.
    }
    return new Response(null, { status: 204 });
  }

  private completeSync(leaseId: string, outcome: AdmissionCompletionOutcome, now: number): void {
    const circuit = this.assertCircuit();
    this.deleteExpiredSuccessReceipts(now);
    const receipt = this.successReceipt(leaseId);
    if (receipt) {
      if (outcome === 'caller_error') {
        this.refundUserAllowance(receipt);
        this.state.storage.sql.exec('DELETE FROM success_receipt WHERE lease_id = ?', leaseId);
      }
      return;
    }
    const accounting = this.leaseAccounting(leaseId);
    if (!accounting) {
      this.state.storage.sql.exec('DELETE FROM inflight WHERE lease_id = ?', leaseId);
      return;
    }

    if (outcome !== 'success') {
      this.refundUserAllowance(accounting);
      if (outcome === 'pre_provider_abort') this.refundProviderBudget(accounting);
    }
    this.state.storage.sql.exec('DELETE FROM inflight WHERE lease_id = ?', leaseId);

    if (outcome === 'success') {
      this.state.storage.sql.exec(
        'INSERT INTO success_receipt (lease_id, subject_digest, period, route, day, provider_units, is_probe, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        accounting.lease_id,
        accounting.subject_digest,
        accounting.period,
        accounting.route,
        accounting.day,
        accounting.provider_units,
        accounting.is_probe,
        Math.min(8_640_000_000_000_000, now + SUCCESS_RECEIPT_TTL_MS),
      );
      this.state.storage.sql.exec('DELETE FROM lease_accounting WHERE lease_id = ?', leaseId);
      if (accounting.is_probe === 1) this.closeCircuit();
      return;
    }

    this.state.storage.sql.exec('DELETE FROM lease_accounting WHERE lease_id = ?', leaseId);

    if (outcome === 'pre_provider_abort') {
      if (accounting.is_probe === 1) this.openCircuit(now);
      return;
    }

    if (outcome === 'invalid_output' || outcome === 'caller_error') {
      if (accounting.is_probe === 1) this.openCircuit(now);
      return;
    }

    if (outcome === 'configuration_failure') {
      this.openCircuit(now);
      return;
    }

    this.state.storage.sql.exec('DELETE FROM provider_failures WHERE observed_at < ?', now - PROVIDER_FAILURE_WINDOW_MS);
    this.state.storage.sql.exec(
      'INSERT INTO provider_failures (failure_id, observed_at) VALUES (?, ?)',
      crypto.randomUUID(),
      now,
    );
    const failures = this.providerFailureCount();
    if (accounting.is_probe === 1) {
      this.openCircuit(now);
    } else if (circuit.state === 'closed' && failures >= PROVIDER_FAILURE_THRESHOLD) {
      this.openCircuit(now);
    }
  }

  private reserveSync(input: InternalReservation): AdmissionRejection | ReservedLease {
    this.assertCircuit();
    this.deleteExpiredLeases(input.now);
    this.deleteExpiredSuccessReceipts(input.now);
    this.runDailyRetention(input.now);

    this.state.storage.sql.exec('DELETE FROM provider_failures WHERE observed_at < ?', input.now - PROVIDER_FAILURE_WINDOW_MS);
    const circuit = this.assertCircuit();
    let isProbe = false;
    if (circuit.state === 'open') {
      const retryAt = circuit.opened_at + PROVIDER_CIRCUIT_COOLDOWN_MS;
      if (input.now < retryAt) return reject('PROVIDER_UNAVAILABLE', retrySeconds(input.now, retryAt));
      isProbe = true;
    } else if (circuit.state === 'half_open') {
      return reject('PROVIDER_UNAVAILABLE', 1);
    } else if (this.providerFailureCount() >= PROVIDER_FAILURE_THRESHOLD) {
      this.openCircuit(input.now);
      return reject('PROVIDER_UNAVAILABLE', Math.ceil(PROVIDER_CIRCUIT_COOLDOWN_MS / 1_000));
    }

    const quota = this.quotaState(input);
    if (quota.count >= quota.limit) {
      return reject('PLAN_LIMIT_REACHED', quota.retryAfterSeconds);
    }

    const inflight = this.inflightCount();
    if (inflight >= input.maxGlobalInFlight) {
      const earliest = this.earliestAccountingDeadline();
      return reject('SERVICE_BUSY', retrySeconds(input.now, earliest ?? input.now + LEASE_TTL_MS));
    }

    const day = utcDay(input.now);
    const providerUnits = input.route === '/v1/analyses' ? 3 : 1;
    const usedProviderUnits = this.providerUnits(day);
    if (!Number.isSafeInteger(usedProviderUnits) || usedProviderUnits < 0) throw new Error('Invalid budget state');
    const projected = usedProviderUnits + providerUnits;
    const budgetWarning: BudgetWarning = projected / input.maxDailyProviderUnits >= 0.8
      ? 'at-least-80'
      : 'under-80';
    const dailyRetry = retrySeconds(input.now, nextUtcDay(input.now));
    if (!Number.isSafeInteger(projected) || projected >= input.maxDailyProviderUnits) {
      return reject('DAILY_BUDGET_REACHED', dailyRetry);
    }
    const freeReserveThreshold = input.maxDailyProviderUnits - Math.floor(input.maxDailyProviderUnits / 20);
    if (input.plan === 'free' && projected >= freeReserveThreshold) {
      return reject('DAILY_BUDGET_REACHED', dailyRetry);
    }

    const leaseId = crypto.randomUUID();
    const expiresAt = input.now + LEASE_TTL_MS;
    this.state.storage.sql.exec('INSERT INTO inflight (lease_id, expires_at) VALUES (?, ?)', leaseId, expiresAt);
    this.state.storage.sql.exec(
      'INSERT INTO daily_budget (day, provider_units) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET provider_units = provider_units + excluded.provider_units',
      day,
      providerUnits,
    );
    this.state.storage.sql.exec(
      'INSERT INTO plan_usage (subject_digest, period, route, count) VALUES (?, ?, ?, 1) ON CONFLICT(subject_digest, period, route) DO UPDATE SET count = count + 1',
      input.subjectDigest,
      quota.period,
      input.route,
    );
    this.state.storage.sql.exec(
      'INSERT INTO lease_accounting (lease_id, subject_digest, period, route, day, provider_units, is_probe) VALUES (?, ?, ?, ?, ?, ?, ?)',
      leaseId,
      input.subjectDigest,
      quota.period,
      input.route,
      day,
      providerUnits,
      isProbe ? 1 : 0,
    );
    if (isProbe) {
      this.state.storage.sql.exec(
        "UPDATE provider_circuit SET state = 'half_open', probe_lease_id = ? WHERE id = 1 AND state = 'open'",
        leaseId,
      );
      const updated = this.assertCircuit();
      if (updated.state !== 'half_open' || updated.probe_lease_id !== leaseId) throw new Error('Invalid circuit transition');
    }
    return { allowed: true, leaseId, inFlight: inflight + 1, expiresAt, day, period: quota.period, providerUnits, budgetWarning, isProbe };
  }

  private quotaState(input: InternalReservation): { count: number; limit: number; period: string; retryAfterSeconds: number } {
    const limit = planLimit(input.plan, input.route);
    if (input.plan === 'pro') {
      // A verified active convo_pro entitlement receives one deterministic UTC calendar-month allowance.
      const period = `pro:${utcMonth(input.now)}`;
      const count = this.usageForPeriod(input.subjectDigest, period, input.route);
      return { count, limit, period, retryAfterSeconds: retrySeconds(input.now, nextUtcMonth(input.now)) };
    }

    const period = `free:${utcDay(input.now)}`;
    const windowStart = `free:${utcDay(input.now - (FREE_WINDOW_DAYS - 1) * DAY_MS)}`;
    const rows = this.state.storage.sql.exec<{ period: string; count: number }>(
      'SELECT period, count FROM plan_usage WHERE subject_digest = ? AND route = ? AND period >= ? AND period <= ? ORDER BY period ASC',
      input.subjectDigest,
      input.route,
      windowStart,
      period,
    ).toArray();
    let count = 0;
    for (const row of rows) {
      assertUsageCount(row.count);
      count += row.count;
      if (!Number.isSafeInteger(count)) throw new Error('Invalid quota state');
    }
    let retryAfterSeconds = retrySeconds(input.now, input.now + DAY_MS);
    let remaining = count;
    for (const row of rows) {
      remaining -= row.count;
      if (remaining < limit) {
        retryAfterSeconds = retrySeconds(input.now, Date.parse(`${row.period.slice(5)}T00:00:00Z`) + FREE_WINDOW_DAYS * DAY_MS);
        break;
      }
    }
    return { count, limit, period, retryAfterSeconds };
  }

  private usageForPeriod(subjectDigest: string, period: string, route: AdmissionRoute): number {
    const row = this.state.storage.sql.exec<{ count: number }>(
      'SELECT count FROM plan_usage WHERE subject_digest = ? AND period = ? AND route = ?',
      subjectDigest,
      period,
      route,
    ).toArray()[0];
    if (!row) return 0;
    assertUsageCount(row.count);
    return row.count;
  }

  private providerUnits(day: string): number {
    return this.state.storage.sql.exec<{ provider_units: number }>(
      'SELECT provider_units FROM daily_budget WHERE day = ?',
      day,
    ).toArray()[0]?.provider_units ?? 0;
  }

  private leaseAccounting(leaseId: string): LeaseAccounting | undefined {
    const row = this.state.storage.sql.exec<LeaseAccounting>(
      'SELECT lease_id, subject_digest, period, route, day, provider_units, is_probe FROM lease_accounting WHERE lease_id = ?',
      leaseId,
    ).toArray()[0];
    if (!row) return undefined;
    if (row.lease_id !== leaseId
      || !DIGEST_PATTERN.test(row.subject_digest)
      || (row.route !== '/v1/analyses' && row.route !== '/v1/responses')
      || !/^(free:\d{4}-\d{2}-\d{2}|pro:\d{4}-\d{2})$/.test(row.period)
      || !/^\d{4}-\d{2}-\d{2}$/.test(row.day)
      || (row.provider_units !== 1 && row.provider_units !== 3)
      || (row.is_probe !== 0 && row.is_probe !== 1)) {
      throw new Error('Invalid lease accounting state');
    }
    return row;
  }

  private successReceipt(leaseId: string): SuccessReceipt | undefined {
    const row = this.state.storage.sql.exec<SuccessReceipt>(
      'SELECT lease_id, subject_digest, period, route, day, provider_units, is_probe, expires_at FROM success_receipt WHERE lease_id = ?',
      leaseId,
    ).toArray()[0];
    if (!row) return undefined;
    if (row.lease_id !== leaseId
      || !DIGEST_PATTERN.test(row.subject_digest)
      || (row.route !== '/v1/analyses' && row.route !== '/v1/responses')
      || !/^(free:\d{4}-\d{2}-\d{2}|pro:\d{4}-\d{2})$/.test(row.period)
      || !/^\d{4}-\d{2}-\d{2}$/.test(row.day)
      || (row.provider_units !== 1 && row.provider_units !== 3)
      || (row.is_probe !== 0 && row.is_probe !== 1)
      || !validTimestamp(row.expires_at)) {
      throw new Error('Invalid success receipt state');
    }
    return row;
  }

  private refundUserAllowance(accounting: LeaseAccounting): void {
    const usage = this.usageForPeriod(accounting.subject_digest, accounting.period, accounting.route);
    if (usage < 1) throw new Error('Invalid refundable allowance state');
    this.state.storage.sql.exec(
      'UPDATE plan_usage SET count = count - 1 WHERE subject_digest = ? AND period = ? AND route = ?',
      accounting.subject_digest,
      accounting.period,
      accounting.route,
    );
    this.state.storage.sql.exec(
      'DELETE FROM plan_usage WHERE subject_digest = ? AND period = ? AND route = ? AND count = 0',
      accounting.subject_digest,
      accounting.period,
      accounting.route,
    );
  }

  private refundProviderBudget(accounting: LeaseAccounting): void {
    const budget = this.providerUnits(accounting.day);
    if (budget < accounting.provider_units) throw new Error('Invalid refundable provider budget state');
    this.state.storage.sql.exec(
      'UPDATE daily_budget SET provider_units = provider_units - ? WHERE day = ?',
      accounting.provider_units,
      accounting.day,
    );
    this.state.storage.sql.exec('DELETE FROM daily_budget WHERE day = ? AND provider_units = 0', accounting.day);
  }

  private assertCircuit(): CircuitRow {
    const row = this.state.storage.sql.exec<CircuitRow>(
      'SELECT state, opened_at, probe_lease_id FROM provider_circuit WHERE id = 1',
    ).toArray()[0];
    const validBase = row
      && Number.isSafeInteger(row.opened_at)
      && row.opened_at >= 0;
    const validState = row?.state === 'closed'
      ? row.probe_lease_id === null
      : row?.state === 'open'
        ? row.probe_lease_id === null && row.opened_at > 0
        : row?.state === 'half_open'
          ? typeof row.probe_lease_id === 'string' && row.probe_lease_id.length > 0 && row.opened_at > 0
          : false;
    if (!validBase || !validState) throw new Error('Invalid provider circuit state');
    return row;
  }

  private providerFailureCount(): number {
    const count = this.state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM provider_failures').one().count;
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid provider failure state');
    return count;
  }

  private openCircuit(now: number): void {
    this.state.storage.sql.exec(
      "UPDATE provider_circuit SET state = 'open', opened_at = ?, probe_lease_id = NULL WHERE id = 1",
      now,
    );
  }

  private closeCircuit(): void {
    this.state.storage.sql.exec('DELETE FROM provider_failures');
    this.state.storage.sql.exec(
      "UPDATE provider_circuit SET state = 'closed', opened_at = 0, probe_lease_id = NULL WHERE id = 1",
    );
  }

  private inflightCount(): number {
    const count = this.state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM inflight').one().count;
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid inflight state');
    return count;
  }

  private earliestAccountingDeadline(): number | undefined {
    const value = this.state.storage.sql.exec<{ expires_at: number | null }>(
      'SELECT MIN(expires_at) AS expires_at FROM (SELECT expires_at FROM inflight UNION ALL SELECT expires_at FROM success_receipt)',
    ).one().expires_at;
    if (value === null) return undefined;
    if (!Number.isSafeInteger(value)) throw new Error('Invalid accounting deadline state');
    return value;
  }

  private deleteExpiredLeases(now: number): void {
    const expired = this.state.storage.sql.exec<LeaseAccounting>(
      'SELECT lease_id, subject_digest, period, route, day, provider_units, is_probe FROM lease_accounting WHERE lease_id IN (SELECT lease_id FROM inflight WHERE expires_at <= ?)',
      now,
    ).toArray();
    for (const accounting of expired) {
      const validated = this.leaseAccounting(accounting.lease_id);
      if (!validated) continue;
      this.refundUserAllowance(validated);
      this.state.storage.sql.exec(
        'INSERT INTO accounting_reconciliation (event_id, observed_at, reason) VALUES (?, ?, ?)',
        crypto.randomUUID(),
        now,
        'expired_unresolved',
      );
      if (validated.is_probe === 1) this.openCircuit(now);
    }
    this.state.storage.sql.exec(
      'DELETE FROM lease_accounting WHERE lease_id IN (SELECT lease_id FROM inflight WHERE expires_at <= ?)',
      now,
    );
    this.state.storage.sql.exec('DELETE FROM inflight WHERE expires_at <= ?', now);
  }

  private deleteExpiredSuccessReceipts(now: number): void {
    this.state.storage.sql.exec('DELETE FROM success_receipt WHERE expires_at <= ?', now);
  }

  private runDailyRetention(now: number): void {
    const day = utcDay(now);
    const lastRetentionDay = this.state.storage.sql.exec<{ last_retention_day: string }>(
      'SELECT last_retention_day FROM maintenance_state WHERE id = 1',
    ).toArray()[0]?.last_retention_day;
    if (lastRetentionDay !== undefined && lastRetentionDay >= day) return;

    const oldestRetainedFreePeriod = `free:${utcDay(now - (FREE_WINDOW_DAYS - 1) * DAY_MS)}`;
    const currentProPeriod = `pro:${utcMonth(now)}`;
    this.state.storage.sql.exec(
      "DELETE FROM plan_usage WHERE ((period >= 'free:' AND period < ?) OR (period >= 'pro:' AND period < ?)) AND NOT EXISTS (SELECT 1 FROM lease_accounting WHERE lease_accounting.subject_digest = plan_usage.subject_digest AND lease_accounting.period = plan_usage.period AND lease_accounting.route = plan_usage.route) AND NOT EXISTS (SELECT 1 FROM success_receipt WHERE success_receipt.subject_digest = plan_usage.subject_digest AND success_receipt.period = plan_usage.period AND success_receipt.route = plan_usage.route)",
      oldestRetainedFreePeriod,
      currentProPeriod,
    );
    this.state.storage.sql.exec(
      'DELETE FROM daily_budget WHERE day < ? AND NOT EXISTS (SELECT 1 FROM lease_accounting WHERE lease_accounting.day = daily_budget.day) AND NOT EXISTS (SELECT 1 FROM success_receipt WHERE success_receipt.day = daily_budget.day)',
      day,
    );
    this.state.storage.sql.exec('DELETE FROM provider_failures WHERE observed_at < ?', now - PROVIDER_FAILURE_WINDOW_MS);
    this.state.storage.sql.exec('DELETE FROM accounting_reconciliation WHERE observed_at < ?', now - 7 * DAY_MS);
    this.state.storage.sql.exec(
      'INSERT INTO maintenance_state (id, last_retention_day) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET last_retention_day = excluded.last_retention_day',
      day,
    );
  }

  private rollbackReservation(reservation: ReservedLease, input: InternalReservation): void {
    this.state.storage.sql.exec('DELETE FROM inflight WHERE lease_id = ?', reservation.leaseId);
    this.state.storage.sql.exec('DELETE FROM lease_accounting WHERE lease_id = ?', reservation.leaseId);
    this.state.storage.sql.exec(
      'UPDATE daily_budget SET provider_units = provider_units - ? WHERE day = ?',
      reservation.providerUnits,
      reservation.day,
    );
    this.state.storage.sql.exec('DELETE FROM daily_budget WHERE day = ? AND provider_units <= 0', reservation.day);
    this.state.storage.sql.exec(
      'UPDATE plan_usage SET count = count - 1 WHERE subject_digest = ? AND period = ? AND route = ?',
      input.subjectDigest,
      reservation.period,
      input.route,
    );
    this.state.storage.sql.exec(
      'DELETE FROM plan_usage WHERE subject_digest = ? AND period = ? AND route = ? AND count <= 0',
      input.subjectDigest,
      reservation.period,
      input.route,
    );
    if (reservation.isProbe) this.openCircuit(input.now);
  }

  private async scheduleAlarm(expiresAt: number | undefined): Promise<void> {
    if (expiresAt === undefined) await this.state.storage.deleteAlarm();
    else await this.state.storage.setAlarm(expiresAt);
  }
}

function globalStub(namespace: DurableObjectNamespace): DurableObjectStub {
  return namespace.get(namespace.idFromName('global'));
}

function parseSafePositiveInteger(value: unknown): number {
  const validString = typeof value === 'string' && /^[1-9]\d*$/.test(value);
  const parsed = typeof value === 'number' ? value : validString ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new PublicError('INTERNAL_ERROR', 500);
  return parsed;
}

function validAdmissionRequest(value: AdmissionRequest): boolean {
  return (value.plan === 'free' || value.plan === 'pro')
    && (value.route === '/v1/analyses' || value.route === '/v1/responses')
    && DIGEST_PATTERN.test(value.subjectDigest)
    && validTimestamp(value.now)
    && value.now <= 8_640_000_000_000_000 - LEASE_TTL_MS;
}

function validTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 8_640_000_000_000_000;
}

function isCompletionOutcome(value: unknown): value is AdmissionCompletionOutcome {
  return value === 'success'
    || value === 'provider_failure'
    || value === 'invalid_output'
    || value === 'caller_error'
    || value === 'configuration_failure'
    || value === 'pre_provider_abort';
}

function isInternalReservation(value: unknown): value is InternalReservation {
  if (!isRecord(value)) return false;
  return validAdmissionRequest(value as AdmissionRequest)
    && Number.isSafeInteger(value.maxGlobalInFlight) && (value.maxGlobalInFlight as number) > 0
    && Number.isSafeInteger(value.maxDailyProviderUnits) && (value.maxDailyProviderUnits as number) > 0;
}

function isAdmissionResult(value: unknown): value is AdmissionResult {
  if (!isRecord(value) || typeof value.allowed !== 'boolean') return false;
  if (value.allowed) {
    return typeof value.leaseId === 'string' && value.leaseId.length > 0
      && Number.isSafeInteger(value.inFlight) && (value.inFlight as number) > 0
      && (value.budgetWarning === 'under-80' || value.budgetWarning === 'at-least-80');
  }
  return (value.code === 'PLAN_LIMIT_REACHED' || value.code === 'SERVICE_BUSY' || value.code === 'DAILY_BUDGET_REACHED' || value.code === 'PROVIDER_UNAVAILABLE')
    && Number.isSafeInteger(value.retryAfterSeconds)
    && (value.retryAfterSeconds as number) > 0;
}

function publicResult(result: AdmissionRejection | ReservedLease): AdmissionResult {
  return result.allowed
    ? { allowed: true, leaseId: result.leaseId, inFlight: result.inFlight, budgetWarning: result.budgetWarning }
    : result;
}

function reject(code: AdmissionRejectionCode, retryAfterSeconds: number): AdmissionRejection {
  return { allowed: false, code, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
}

function planLimit(plan: EntitlementPlan, route: AdmissionRoute): number {
  if (plan === 'free') return route === '/v1/analyses' ? 3 : 6;
  return route === '/v1/analyses' ? 75 : 150;
}

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function utcMonth(now: number): string {
  return new Date(now).toISOString().slice(0, 7);
}

function nextUtcDay(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

function nextUtcMonth(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

function retrySeconds(now: number, deadline: number): number {
  return Math.max(1, Math.ceil((deadline - now) / 1_000));
}

function assertUsageCount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid quota state');
}

async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
