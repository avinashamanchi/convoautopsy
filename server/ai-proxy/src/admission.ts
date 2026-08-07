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
  | { allowed: true; leaseId: string }
  | { allowed: false; code: AdmissionRejectionCode; retryAfterSeconds: number };

type AdmissionRejectionCode = Extract<PublicErrorCode, 'PLAN_LIMIT_REACHED' | 'SERVICE_BUSY' | 'DAILY_BUDGET_REACHED'>;
type AdmissionRejection = Extract<AdmissionResult, { allowed: false }>;
type AdmissionConfig = { maxGlobalInFlight?: unknown; maxDailyProviderUnits?: unknown };
type InternalReservation = AdmissionRequest & {
  maxGlobalInFlight: number;
  maxDailyProviderUnits: number;
};
type ReservedLease = {
  allowed: true;
  leaseId: string;
  expiresAt: number;
  day: string;
  period: string;
  providerUnits: number;
};

const DEFAULT_MAX_GLOBAL_IN_FLIGHT = 100;
const LEASE_TTL_MS = 2 * 60_000;
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
  try {
    const response = await globalStub(namespace).fetch('https://admission.internal/release', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ leaseId }),
    });
    if (!response.ok) throw new Error('Admission coordinator unavailable');
  } catch {
    throw new PublicError('INTERNAL_ERROR', 500);
  }
}

export class AdmissionDurableObject {
  constructor(private readonly state: DurableObjectState) {
    this.state.storage.sql.exec('CREATE TABLE IF NOT EXISTS daily_budget(day TEXT PRIMARY KEY, provider_units INTEGER NOT NULL)');
    this.state.storage.sql.exec('CREATE TABLE IF NOT EXISTS inflight(lease_id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)');
    this.state.storage.sql.exec('CREATE TABLE IF NOT EXISTS plan_usage(subject_digest TEXT NOT NULL, period TEXT NOT NULL, route TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(subject_digest, period, route))');
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const path = new URL(request.url).pathname;
    if (path === '/reserve') return this.reserve(request);
    if (path === '/release') return this.release(request);
    return new Response(null, { status: 404 });
  }

  async alarm(): Promise<void> {
    const nextAlarm = this.state.storage.transactionSync(() => {
      this.deleteExpiredLeases(Date.now());
      return this.earliestLeaseExpiry();
    });
    await this.scheduleAlarm(nextAlarm);
  }

  private async reserve(request: Request): Promise<Response> {
    const input = await parseJson(request);
    if (!isInternalReservation(input)) return new Response(null, { status: 400 });

    const reservation = this.state.storage.transactionSync(() => this.reserveSync(input));
    const nextAlarm = this.earliestLeaseExpiry();
    try {
      await this.scheduleAlarm(nextAlarm);
    } catch {
      if (reservation.allowed) {
        this.state.storage.transactionSync(() => this.rollbackReservation(reservation, input));
        try {
          await this.scheduleAlarm(this.earliestLeaseExpiry());
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
      this.state.storage.sql.exec('DELETE FROM inflight WHERE lease_id = ?', input.leaseId as string);
      return this.earliestLeaseExpiry();
    });
    try {
      await this.scheduleAlarm(nextAlarm);
    } catch {
      // The release is complete. An existing alarm remains the recovery boundary.
    }
    return new Response(null, { status: 204 });
  }

  private reserveSync(input: InternalReservation): AdmissionRejection | ReservedLease {
    this.deleteExpiredLeases(input.now);
    this.cleanObsoleteFreeBuckets(input.now);

    const quota = this.quotaState(input);
    if (quota.count >= quota.limit) {
      return reject('PLAN_LIMIT_REACHED', quota.retryAfterSeconds);
    }

    const inflight = this.inflightCount();
    if (inflight >= input.maxGlobalInFlight) {
      const earliest = this.earliestLeaseExpiry();
      return reject('SERVICE_BUSY', retrySeconds(input.now, earliest ?? input.now + LEASE_TTL_MS));
    }

    const day = utcDay(input.now);
    const providerUnits = input.route === '/v1/analyses' ? 3 : 1;
    const usedProviderUnits = this.providerUnits(day);
    if (!Number.isSafeInteger(usedProviderUnits) || usedProviderUnits < 0) throw new Error('Invalid budget state');
    const projected = usedProviderUnits + providerUnits;
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
    return { allowed: true, leaseId, expiresAt, day, period: quota.period, providerUnits };
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

  private inflightCount(): number {
    const count = this.state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM inflight').one().count;
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid inflight state');
    return count;
  }

  private earliestLeaseExpiry(): number | undefined {
    const value = this.state.storage.sql.exec<{ expires_at: number | null }>('SELECT MIN(expires_at) AS expires_at FROM inflight').one().expires_at;
    if (value === null) return undefined;
    if (!Number.isSafeInteger(value)) throw new Error('Invalid lease state');
    return value;
  }

  private deleteExpiredLeases(now: number): void {
    this.state.storage.sql.exec('DELETE FROM inflight WHERE expires_at <= ?', now);
  }

  private cleanObsoleteFreeBuckets(now: number): void {
    const oldestRetained = `free:${utcDay(now - (FREE_WINDOW_DAYS - 1) * DAY_MS)}`;
    this.state.storage.sql.exec("DELETE FROM plan_usage WHERE period LIKE 'free:%' AND period < ?", oldestRetained);
  }

  private rollbackReservation(reservation: ReservedLease, input: InternalReservation): void {
    this.state.storage.sql.exec('DELETE FROM inflight WHERE lease_id = ?', reservation.leaseId);
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
    && Number.isSafeInteger(value.now)
    && value.now >= 0
    && value.now <= 8_640_000_000_000_000 - LEASE_TTL_MS;
}

function isInternalReservation(value: unknown): value is InternalReservation {
  if (!isRecord(value)) return false;
  return validAdmissionRequest(value as AdmissionRequest)
    && Number.isSafeInteger(value.maxGlobalInFlight) && (value.maxGlobalInFlight as number) > 0
    && Number.isSafeInteger(value.maxDailyProviderUnits) && (value.maxDailyProviderUnits as number) > 0;
}

function isAdmissionResult(value: unknown): value is AdmissionResult {
  if (!isRecord(value) || typeof value.allowed !== 'boolean') return false;
  if (value.allowed) return typeof value.leaseId === 'string' && value.leaseId.length > 0;
  return (value.code === 'PLAN_LIMIT_REACHED' || value.code === 'SERVICE_BUSY' || value.code === 'DAILY_BUDGET_REACHED')
    && Number.isSafeInteger(value.retryAfterSeconds)
    && (value.retryAfterSeconds as number) > 0;
}

function publicResult(result: AdmissionRejection | ReservedLease): AdmissionResult {
  return result.allowed ? { allowed: true, leaseId: result.leaseId } : result;
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
