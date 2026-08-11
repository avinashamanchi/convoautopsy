/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { env } from 'cloudflare:workers';
import { reset, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AdmissionDurableObject,
  completeAdmission,
  deriveAdmissionSubjectDigest,
  releaseAdmission,
  reserveAdmission,
  type AdmissionRequest,
} from '../src/admission';

const TEST_MAX_DAILY_UNITS = '1000';
const DAY = 24 * 60 * 60 * 1_000;

function namespace(): DurableObjectNamespace {
  return env.AI_ADMISSION;
}

function stub(): DurableObjectStub {
  return namespace().get(namespace().idFromName('global'));
}

function request(overrides: Partial<AdmissionRequest> = {}): AdmissionRequest {
  const subjectDigest = testDigest(overrides.subjectDigest ?? crypto.randomUUID());
  return {
    plan: 'pro',
    route: '/v1/responses',
    now: Date.parse('2099-08-07T12:00:00Z'),
    ...overrides,
    subjectDigest,
  };
}

function testDigest(label: string): string {
  if (/^[a-f0-9]{64}$/.test(label)) return label;
  const encoded = Array.from(new TextEncoder().encode(label), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return encoded.repeat(Math.ceil(64 / encoded.length)).slice(0, 64);
}

async function reserve(
  overrides: Partial<AdmissionRequest> = {},
  config: { maxGlobalInFlight?: unknown; maxDailyProviderUnits?: unknown } = {},
) {
  return await reserveAdmission(namespace(), request(overrides), {
    maxGlobalInFlight: config.maxGlobalInFlight,
    maxDailyProviderUnits: Object.hasOwn(config, 'maxDailyProviderUnits')
      ? config.maxDailyProviderUnits
      : TEST_MAX_DAILY_UNITS,
  });
}

async function release(leaseId: string): Promise<void> {
  await releaseAdmission(namespace(), leaseId);
}

async function completeFailure(leaseId: string, now: number): Promise<void> {
  await completeAdmission(namespace(), leaseId, 'provider_failure', now);
}

async function counts() {
  return runInDurableObject(stub(), (_instance, state) => ({
    inflight: state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM inflight').one().count,
    budget: state.storage.sql.exec<{ total: number | null }>('SELECT SUM(provider_units) AS total FROM daily_budget').one().total ?? 0,
    usage: state.storage.sql.exec<{ total: number | null }>('SELECT SUM(count) AS total FROM plan_usage').one().total ?? 0,
  }));
}

async function reserveAllowed(overrides: Partial<AdmissionRequest>): Promise<string> {
  const result = await reserve(overrides);
  expect(result.allowed).toBe(true);
  if (!result.allowed) throw new Error('Expected reservation to be allowed');
  return result.leaseId;
}

afterEach(async () => {
  vi.useRealTimers();
  await reset();
});

describe('atomic AI admission', () => {
  it('emits a machine-safe budget warning at 80 percent without identifiers or content', async () => {
    await runInDurableObject(stub(), (_instance, state) => {
      state.storage.sql.exec('INSERT INTO daily_budget (day, provider_units) VALUES (?, ?)', '2099-08-07', 799);
    });

    const result = await reserve({ plan: 'pro', route: '/v1/responses' });

    expect(result).toMatchObject({ allowed: true, budgetWarning: 'at-least-80' });
    expect(JSON.stringify(result)).not.toMatch(/subject|identifier|message|content/i);
    if (result.allowed) await release(result.leaseId);
  });

  it('refunds failed user allowance, retains provider cost, and opens a bounded global circuit after five rolling failures', async () => {
    const now = Date.parse('2099-08-07T12:00:00Z');
    for (let index = 0; index < 5; index += 1) {
      const result = await reserve({ plan: 'pro', subjectDigest: `circuit-failure-${index}`, now: now + index });
      expect(result.allowed).toBe(true);
      if (result.allowed) await completeFailure(result.leaseId, now + index);
    }

    expect(await counts()).toEqual({ inflight: 0, budget: 5, usage: 0 });
    await expect(reserve({ plan: 'pro', subjectDigest: 'circuit-open', now: now + 5 })).resolves.toMatchObject({
      allowed: false,
      code: 'PROVIDER_UNAVAILABLE',
      retryAfterSeconds: 30,
    });
  });

  it('refunds and records a failure when an accepted lease completes after UTC retention advances', async () => {
    const beforeMidnight = Date.parse('2099-08-31T23:59:59.900Z');
    const oldLease = await reserveAllowed({
      plan: 'pro',
      route: '/v1/analyses',
      subjectDigest: 'cross-midnight-failure',
      now: beforeMidnight,
    });
    const newLease = await reserveAllowed({
      plan: 'pro',
      route: '/v1/responses',
      subjectDigest: 'next-month-retention',
      now: Date.parse('2099-09-01T00:00:00.100Z'),
    });
    await release(newLease);

    await expect(completeFailure(oldLease, Date.parse('2099-09-01T00:00:00.200Z'))).resolves.toBeUndefined();

    expect(await counts()).toEqual({ inflight: 0, budget: 4, usage: 1 });
    await runInDurableObject(stub(), (_instance, state) => {
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM provider_failures').one().count).toBe(1);
    });
  });

  it('allows exactly one half-open probe and closes only after its success', async () => {
    const now = Date.parse('2099-08-07T12:00:00Z');
    for (let index = 0; index < 5; index += 1) {
      const failed = await reserve({ plan: 'pro', subjectDigest: `half-open-failure-${index}`, now: now + index });
      if (!failed.allowed) throw new Error('Expected failure reservation');
      await completeFailure(failed.leaseId, now + index);
    }

    const probeTime = now + 30_004;
    const [probe, blocked] = await Promise.all([
      reserve({ plan: 'pro', subjectDigest: 'half-open-probe', now: probeTime }),
      reserve({ plan: 'pro', subjectDigest: 'half-open-blocked', now: probeTime }),
    ]);
    expect([probe, blocked].filter((item) => item.allowed)).toHaveLength(1);
    expect([probe, blocked].filter((item) => !item.allowed)).toEqual([
      expect.objectContaining({ code: 'PROVIDER_UNAVAILABLE', retryAfterSeconds: expect.any(Number) }),
    ]);
    const allowed = [probe, blocked].find((item) => item.allowed);
    if (!allowed?.allowed) throw new Error('Expected half-open probe');
    await completeAdmission(namespace(), allowed.leaseId, 'success', probeTime + 1);

    const recovered = await reserve({ plan: 'pro', subjectDigest: 'after-recovery', now: probeTime + 2 });
    expect(recovered.allowed).toBe(true);
    if (recovered.allowed) await release(recovered.leaseId);
  });

  it('reopens a bounded circuit when the half-open probe returns invalid output', async () => {
    const now = Date.parse('2099-08-07T12:00:00Z');
    for (let index = 0; index < 5; index += 1) {
      const failed = await reserve({ plan: 'pro', subjectDigest: `invalid-probe-failure-${index}`, now: now + index });
      if (!failed.allowed) throw new Error('Expected failure reservation');
      await completeFailure(failed.leaseId, now + index);
    }

    const firstProbeTime = now + 30_004;
    const firstProbe = await reserve({ plan: 'pro', subjectDigest: 'invalid-probe-first', now: firstProbeTime });
    if (!firstProbe.allowed) throw new Error('Expected half-open probe');
    await completeAdmission(namespace(), firstProbe.leaseId, 'invalid_output', firstProbeTime + 1);

    await expect(reserve({ plan: 'pro', subjectDigest: 'invalid-probe-blocked', now: firstProbeTime + 2 })).resolves.toMatchObject({
      allowed: false,
      code: 'PROVIDER_UNAVAILABLE',
      retryAfterSeconds: 30,
    });

    const secondProbeTime = firstProbeTime + 30_001;
    const secondProbe = await reserve({ plan: 'pro', subjectDigest: 'invalid-probe-second', now: secondProbeTime });
    expect(secondProbe.allowed).toBe(true);
    if (!secondProbe.allowed) throw new Error('Expected a new half-open probe after the bounded cooldown');
    await completeAdmission(namespace(), secondProbe.leaseId, 'success', secondProbeTime + 1);

    const recovered = await reserve({ plan: 'pro', subjectDigest: 'after-invalid-probe-recovery', now: secondProbeTime + 2 });
    expect(recovered.allowed).toBe(true);
    if (recovered.allowed) await release(recovered.leaseId);
  });

  it('retains global provider cost while refunding unusable invalid output across rotating subjects', async () => {
    const now = Date.parse('2099-08-07T12:00:00Z');
    for (let index = 0; index < 333; index += 1) {
      const result = await reserve({
        plan: 'pro',
        route: '/v1/analyses',
        subjectDigest: `distributed-invalid-${index}`,
        now: now + index,
      });
      if (!result.allowed) throw new Error(`Expected distributed reservation ${index}`);
      await completeAdmission(namespace(), result.leaseId, 'invalid_output', now + index);
    }

    expect(await counts()).toEqual({ inflight: 0, budget: 999, usage: 0 });
    await expect(reserve({
      plan: 'pro',
      route: '/v1/analyses',
      subjectDigest: 'distributed-invalid-final',
      now: now + 334,
    })).resolves.toMatchObject({ allowed: false, code: 'DAILY_BUDGET_REACHED' });
  }, 20_000);

  it('retains provider cost on the invocation UTC day when failure completes after midnight', async () => {
    const beforeMidnight = Date.parse('2099-08-07T23:59:59.900Z');
    const leaseId = await reserveAllowed({
      plan: 'pro',
      route: '/v1/analyses',
      subjectDigest: 'provider-cost-cross-midnight',
      now: beforeMidnight,
    });

    await completeAdmission(namespace(), leaseId, 'provider_failure', Date.parse('2099-08-08T00:00:00.100Z'));

    expect(await counts()).toEqual({ inflight: 0, budget: 3, usage: 0 });
    await runInDurableObject(stub(), (_instance, state) => {
      expect(state.storage.sql.exec<{ provider_units: number }>(
        'SELECT provider_units FROM daily_budget WHERE day = ?',
        '2099-08-07',
      ).one().provider_units).toBe(3);
    });
  });

  it('does not advance the outage circuit for five caller-content rejections', async () => {
    const now = Date.parse('2099-08-07T12:00:00Z');
    for (let index = 0; index < 5; index += 1) {
      const result = await reserve({
        plan: 'pro',
        subjectDigest: `caller-rejection-${index}`,
        now: now + index,
      });
      if (!result.allowed) throw new Error('Expected caller-rejection reservation');
      await completeAdmission(namespace(), result.leaseId, 'caller_error', now + index);
    }

    const next = await reserve({ plan: 'pro', subjectDigest: 'caller-rejection-next', now: now + 5 });
    expect(next.allowed).toBe(true);
    if (next.allowed) await release(next.leaseId);
    await runInDurableObject(stub(), (_instance, state) => {
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM provider_failures').one().count).toBe(0);
    });
    expect(await counts()).toEqual({ inflight: 0, budget: 6, usage: 1 });
  });

  it('opens a bounded safe circuit immediately for an upstream authentication or model configuration failure', async () => {
    const now = Date.parse('2099-08-07T12:00:00Z');
    const result = await reserve({ plan: 'pro', subjectDigest: 'configuration-failure', now });
    if (!result.allowed) throw new Error('Expected configuration-failure reservation');
    await completeAdmission(namespace(), result.leaseId, 'configuration_failure', now + 1);

    await expect(reserve({ plan: 'pro', subjectDigest: 'configuration-blocked', now: now + 2 })).resolves.toMatchObject({
      allowed: false,
      code: 'PROVIDER_UNAVAILABLE',
      retryAfterSeconds: 30,
    });

    const probe = await reserve({ plan: 'pro', subjectDigest: 'configuration-probe', now: now + 30_001 });
    expect(probe.allowed).toBe(true);
    if (probe.allowed) await completeAdmission(namespace(), probe.leaseId, 'success', now + 30_002);
  });

  it('refunds both user allowance and global budget only for a proven pre-provider abort', async () => {
    const now = Date.parse('2099-08-07T12:00:00Z');
    const leaseId = await reserveAllowed({
      plan: 'pro',
      route: '/v1/analyses',
      subjectDigest: 'proven-pre-provider-abort',
      now,
    });

    await completeAdmission(namespace(), leaseId, 'pre_provider_abort', now + 1);

    expect(await counts()).toEqual({ inflight: 0, budget: 0, usage: 0 });
  });

  it('compensates an abort observed after success accounting without refunding provider cost', async () => {
    const now = Date.parse('2099-08-07T12:00:00Z');
    const leaseId = await reserveAllowed({
      plan: 'pro',
      route: '/v1/analyses',
      subjectDigest: 'success-then-caller-abort',
      now,
    });

    await completeAdmission(namespace(), leaseId, 'success', now + 1);
    await completeAdmission(namespace(), leaseId, 'caller_error', now + 2);

    expect(await counts()).toEqual({ inflight: 0, budget: 3, usage: 0 });
    await runInDurableObject(stub(), (_instance, state) => {
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM lease_accounting').one().count).toBe(0);
    });
  });

  it('expires a successful completion receipt without refunding delivered work', async () => {
    const now = Date.parse('2099-08-07T12:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const leaseId = await reserveAllowed({
      plan: 'pro',
      route: '/v1/analyses',
      subjectDigest: 'delivered-success-receipt-expiry',
      now,
    });

    await completeAdmission(namespace(), leaseId, 'success', now + 1);
    const scheduledAlarm = await runInDurableObject(stub(), (_instance, state) => state.storage.getAlarm());

    expect(scheduledAlarm).not.toBeNull();
    if (scheduledAlarm === null) return;
    vi.setSystemTime(scheduledAlarm + 1);
    expect(await runDurableObjectAlarm(stub())).toBe(true);
    expect(await counts()).toEqual({ inflight: 0, budget: 3, usage: 1 });
    await runInDurableObject(stub(), (_instance, state) => {
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM success_receipt').one().count).toBe(0);
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM lease_accounting').one().count).toBe(0);
    });
  });

  it('preserves a compensatable success receipt across UTC retention advancement', async () => {
    const beforeMidnight = Date.parse('2099-08-31T23:59:59.900Z');
    const oldLease = await reserveAllowed({
      plan: 'pro',
      route: '/v1/analyses',
      subjectDigest: 'success-receipt-cross-month',
      now: beforeMidnight,
    });
    await completeAdmission(namespace(), oldLease, 'success', beforeMidnight + 1);
    const newLease = await reserveAllowed({
      plan: 'pro',
      route: '/v1/responses',
      subjectDigest: 'success-receipt-next-month',
      now: Date.parse('2099-09-01T00:00:00.100Z'),
    });
    await release(newLease);

    await expect(completeAdmission(
      namespace(),
      oldLease,
      'caller_error',
      Date.parse('2099-09-01T00:00:00.200Z'),
    )).resolves.toBeUndefined();

    expect(await counts()).toEqual({ inflight: 0, budget: 4, usage: 1 });
  });

  it('retries a response-lost completion idempotently without double-refunding', async () => {
    const now = Date.parse('2099-08-07T12:00:00Z');
    const leaseId = await reserveAllowed({
      plan: 'pro',
      route: '/v1/analyses',
      subjectDigest: 'response-lost-completion',
      now,
    });
    const actual = stub();
    let attempts = 0;
    const responseLostNamespace = {
      idFromName: (name: string) => namespace().idFromName(name),
      get: () => ({
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          attempts += 1;
          const response = await actual.fetch(input, init);
          if (attempts === 1) throw new Error('response lost after durable completion');
          return response;
        },
      }),
    } as unknown as DurableObjectNamespace;

    await completeAdmission(responseLostNamespace, leaseId, 'invalid_output', now + 1);

    expect(attempts).toBe(2);
    expect(await counts()).toEqual({ inflight: 0, budget: 3, usage: 0 });
  });

  it('returns the post-reservation global in-flight count for safe bucketing', async () => {
    const first = await reserve({ subjectDigest: 'metric-inflight-first' });
    const second = await reserve({ subjectDigest: 'metric-inflight-second' });

    expect(first).toMatchObject({ allowed: true, inFlight: 1 });
    expect(second).toMatchObject({ allowed: true, inFlight: 2 });
    if (first.allowed) await release(first.leaseId);
    if (second.allowed) await release(second.leaseId);
  });

  it('reports only active reservations and removes expired leases before counting', async () => {
    const activeLease = await reserveAllowed({ subjectDigest: 'diagnostic-active' });
    const expiredLease = await reserveAllowed({ subjectDigest: 'diagnostic-expired' });
    const now = Date.parse('2099-08-07T12:01:00Z');
    await runInDurableObject(stub(), (_instance, state) => {
      state.storage.sql.exec('UPDATE inflight SET expires_at = ? WHERE lease_id = ?', now - 1, expiredLease);
      state.storage.sql.exec('UPDATE inflight SET expires_at = ? WHERE lease_id = ?', now + 60_000, activeLease);
    });

    const activeReservations = await runInDurableObject(stub(), (instance) => (
      (instance as AdmissionDurableObject).activeReservationCount(now)
    ));
    expect(activeReservations).toBe(1);
    await release(activeLease);
  });

  it('bounds a stalled Durable Object release so alarms can recover the lease', async () => {
    vi.useFakeTimers();
    const pending = new Promise<Response>(() => undefined);
    const hangingNamespace = {
      idFromName: () => ({ toString: () => 'global' }),
      get: () => ({ fetch: () => pending }),
    } as unknown as DurableObjectNamespace;
    let settled = false;
    const result = releaseAdmission(hangingNamespace, 'stalled-lease').then(
      () => { settled = true; },
      () => { settled = true; },
    );

    await vi.advanceTimersByTimeAsync(2_000);

    expect(settled).toBe(true);
    await result;
    vi.useRealTimers();
  });

  it.each(['success', 'provider_failure'] as const)('bounds and retries a stalled %s completion before returning a retryable failure', async (outcome) => {
    vi.useFakeTimers();
    let attempts = 0;
    const hangingNamespace = {
      idFromName: () => ({ toString: () => 'global' }),
      get: () => ({
        fetch: () => {
          attempts += 1;
          return new Promise<Response>(() => undefined);
        },
      }),
    } as unknown as DurableObjectNamespace;
    let caught: unknown;
    const result = completeAdmission(hangingNamespace, 'stalled-completion', outcome, Date.now()).catch((error: unknown) => {
      caught = error;
    });

    await vi.advanceTimersByTimeAsync(10_000);
    await result;

    expect(attempts).toBe(3);
    expect(caught).toMatchObject({ code: 'INTERNAL_ERROR', status: 503, retryAfterSeconds: expect.any(Number) });
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it('admits exactly 100 of 160 concurrent reservations and releases every lease', async () => {
    const subjectDigest = 'digest-concurrency';
    const results = await Promise.all(Array.from({ length: 160 }, () => reserve({ subjectDigest })));

    expect(results.filter((item) => item.allowed)).toHaveLength(100);
    expect(results.filter((item) => !item.allowed)).toHaveLength(60);
    expect(results.filter((item) => !item.allowed).every((item) => item.code === 'SERVICE_BUSY' && item.retryAfterSeconds > 0)).toBe(true);
    await Promise.all(results.flatMap((item) => item.allowed ? [release(item.leaseId)] : []));
    expect((await counts()).inflight).toBe(0);
  });

  it('honors a positive safe global concurrency override', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => reserve(
      { subjectDigest: 'digest-small-capacity' },
      { maxGlobalInFlight: '4' },
    )));

    expect(results.filter((item) => item.allowed)).toHaveLength(4);
    expect(results.filter((item) => !item.allowed)).toHaveLength(4);
  });

  it.each([
    { route: '/v1/analyses' as const, limit: 3 },
    { route: '/v1/responses' as const, limit: 6 },
  ])('allows Free $limit times for $route over rolling 30 UTC-day buckets', async ({ route, limit }) => {
    const subjectDigest = `digest-free-${route}`;
    const now = Date.parse('2099-08-01T12:00:00Z');
    for (let index = 0; index < limit; index += 1) {
      await release(await reserveAllowed({ plan: 'free', subjectDigest, route, now: now + index }));
    }

    const limited = await reserve({ plan: 'free', subjectDigest, route, now: now + limit });
    expect(limited).toMatchObject({ allowed: false, code: 'PLAN_LIMIT_REACHED' });
    if (limited.allowed) throw new Error('Expected plan limit rejection');
    expect(limited.retryAfterSeconds).toBeGreaterThan(0);

    const afterThirtyDays = await reserve({ plan: 'free', subjectDigest, route, now: now + 30 * DAY });
    expect(afterThirtyDays.allowed).toBe(true);
    if (afterThirtyDays.allowed) await release(afterThirtyDays.leaseId);
  });

  it.each([
    { route: '/v1/analyses' as const, limit: 75 },
    { route: '/v1/responses' as const, limit: 150 },
  ])('allows Pro $limit times for $route and resets at the next UTC calendar month', async ({ route, limit }) => {
    const subjectDigest = `digest-pro-${route}`;
    const now = Date.parse('2099-08-31T23:00:00Z');
    for (let index = 0; index < limit; index += 1) {
      await release(await reserveAllowed({ plan: 'pro', subjectDigest, route, now: now + index }));
    }

    await expect(reserve({ plan: 'pro', subjectDigest, route, now: now + limit })).resolves.toMatchObject({
      allowed: false,
      code: 'PLAN_LIMIT_REACHED',
    });
    const september = await reserve({ plan: 'pro', subjectDigest, route, now: Date.parse('2099-09-01T00:00:00Z') });
    expect(september.allowed).toBe(true);
    if (september.allowed) await release(september.leaseId);
  });

  it('preserves Pro capacity after 95 percent while rejecting Free work', async () => {
    await runInDurableObject(stub(), (_instance, state) => {
      state.storage.sql.exec('INSERT INTO daily_budget (day, provider_units) VALUES (?, ?)', '2099-08-07', 950);
    });

    await expect(reserve({ plan: 'free', subjectDigest: 'digest-free-budget' })).resolves.toMatchObject({
      allowed: false,
      code: 'DAILY_BUDGET_REACHED',
    });
    const pro = await reserve({ plan: 'pro', subjectDigest: 'digest-pro-budget' });
    expect(pro.allowed).toBe(true);
    if (pro.allowed) await release(pro.leaseId);
    expect((await counts()).budget).toBe(951);
  });

  it('rejects every plan when projected usage reaches 100 percent and resets on the next UTC day', async () => {
    await runInDurableObject(stub(), (_instance, state) => {
      state.storage.sql.exec('INSERT INTO daily_budget (day, provider_units) VALUES (?, ?)', '2099-08-07', 999);
    });

    for (const plan of ['free', 'pro'] as const) {
      const rejected = await reserve({ plan, subjectDigest: `digest-${plan}-stop` });
      expect(rejected).toMatchObject({ allowed: false, code: 'DAILY_BUDGET_REACHED' });
      if (rejected.allowed) throw new Error('Expected daily budget rejection');
      expect(rejected.retryAfterSeconds).toBeGreaterThan(0);
    }
    const tomorrow = await reserve({ plan: 'pro', now: Date.parse('2099-08-08T00:00:00Z') });
    expect(tomorrow.allowed).toBe(true);
    if (tomorrow.allowed) await release(tomorrow.leaseId);
  });

  it('charges analyses three units and response drafts one unit', async () => {
    const analysisLease = await reserveAllowed({ route: '/v1/analyses' });
    await release(analysisLease);
    const responseLease = await reserveAllowed({ route: '/v1/responses' });
    await release(responseLease);

    expect((await counts()).budget).toBe(4);
  });

  it('leaves quota, budget, and in-flight counts unchanged on rejection', async () => {
    const subjectDigest = 'digest-unchanged';
    for (let index = 0; index < 6; index += 1) {
      await release(await reserveAllowed({ plan: 'free', subjectDigest }));
    }
    const before = await counts();

    await expect(reserve({ plan: 'free', subjectDigest })).resolves.toMatchObject({ allowed: false, code: 'PLAN_LIMIT_REACHED' });

    expect(await counts()).toEqual(before);
  });

  it('uses an indexed once-daily retention pass that prunes obsolete rows and preserves current rows', async () => {
    const now = Date.parse('2099-08-07T12:00:00Z');
    await runInDurableObject(stub(), (_instance, state) => {
      state.storage.sql.exec(
        'INSERT INTO plan_usage (subject_digest, period, route, count) VALUES (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?)',
        testDigest('old-free'), 'free:2099-07-08', '/v1/responses', 1,
        testDigest('current-free'), 'free:2099-08-07', '/v1/responses', 1,
        testDigest('old-pro'), 'pro:2099-07', '/v1/responses', 1,
        testDigest('current-pro'), 'pro:2099-08', '/v1/responses', 1,
      );
      state.storage.sql.exec(
        'INSERT INTO daily_budget (day, provider_units) VALUES (?, ?), (?, ?)',
        '2099-08-06', 20,
        '2099-08-07', 30,
      );
      const indexes = state.storage.sql.exec<{ name: string }>('PRAGMA index_list(plan_usage)').toArray();
      expect(indexes.map((index) => index.name)).toContain('plan_usage_period_idx');
    });

    await release(await reserveAllowed({ now, subjectDigest: 'retention-first' }));

    await runInDurableObject(stub(), (_instance, state) => {
      const periods = state.storage.sql.exec<{ period: string }>('SELECT DISTINCT period FROM plan_usage ORDER BY period').toArray();
      const days = state.storage.sql.exec<{ day: string }>('SELECT day FROM daily_budget ORDER BY day').toArray();
      const marker = state.storage.sql.exec<{ last_retention_day: string }>(
        'SELECT last_retention_day FROM maintenance_state WHERE id = 1',
      ).one();
      expect(periods.map((row) => row.period)).toEqual(['free:2099-08-07', 'pro:2099-08']);
      expect(days.map((row) => row.day)).toEqual(['2099-08-07']);
      expect(marker.last_retention_day).toBe('2099-08-07');
    });
  });

  it('runs retention at most once per UTC day and runs again on the next UTC day', async () => {
    const firstDay = Date.parse('2099-08-07T12:00:00Z');
    await release(await reserveAllowed({ now: firstDay, subjectDigest: 'retention-marker-first' }));
    await runInDurableObject(stub(), (_instance, state) => {
      state.storage.sql.exec(
        'INSERT INTO plan_usage (subject_digest, period, route, count) VALUES (?, ?, ?, ?)',
        testDigest('late-old-free'), 'free:2099-07-01', '/v1/responses', 1,
      );
      state.storage.sql.exec('INSERT INTO daily_budget (day, provider_units) VALUES (?, ?)', '2099-08-01', 9);
    });

    await release(await reserveAllowed({ now: firstDay + 1_000, subjectDigest: 'retention-marker-second' }));
    await runInDurableObject(stub(), (_instance, state) => {
      expect(state.storage.sql.exec<{ count: number }>(
        "SELECT COUNT(*) AS count FROM plan_usage WHERE period = 'free:2099-07-01'",
      ).one().count).toBe(1);
      expect(state.storage.sql.exec<{ count: number }>(
        "SELECT COUNT(*) AS count FROM daily_budget WHERE day = '2099-08-01'",
      ).one().count).toBe(1);
    });

    await release(await reserveAllowed({
      now: Date.parse('2099-08-08T00:00:00Z'),
      subjectDigest: 'retention-marker-next-day',
    }));
    await runInDurableObject(stub(), (_instance, state) => {
      expect(state.storage.sql.exec<{ count: number }>(
        "SELECT COUNT(*) AS count FROM plan_usage WHERE period = 'free:2099-07-01'",
      ).one().count).toBe(0);
      expect(state.storage.sql.exec<{ count: number }>(
        "SELECT COUNT(*) AS count FROM daily_budget WHERE day = '2099-08-01'",
      ).one().count).toBe(0);
      expect(state.storage.sql.exec<{ last_retention_day: string }>(
        'SELECT last_retention_day FROM maintenance_state WHERE id = 1',
      ).one().last_retention_day).toBe('2099-08-08');
    });
  });

  it('retention on a rejected reservation prunes only obsolete rows and does not increment current state', async () => {
    const now = Date.parse('2099-08-07T12:00:00Z');
    const subjectDigest = testDigest('retention-rejected-current');
    await runInDurableObject(stub(), (_instance, state) => {
      state.storage.sql.exec(
        'INSERT INTO plan_usage (subject_digest, period, route, count) VALUES (?, ?, ?, ?), (?, ?, ?, ?)',
        subjectDigest, 'free:2099-08-07', '/v1/responses', 6,
        testDigest('retention-rejected-old'), 'free:2099-07-01', '/v1/responses', 4,
      );
      state.storage.sql.exec('INSERT INTO daily_budget (day, provider_units) VALUES (?, ?)', '2099-08-06', 8);
    });

    await expect(reserve({ plan: 'free', now, subjectDigest })).resolves.toMatchObject({
      allowed: false,
      code: 'PLAN_LIMIT_REACHED',
    });

    await runInDurableObject(stub(), (_instance, state) => {
      expect(state.storage.sql.exec<{ count: number }>(
        'SELECT count FROM plan_usage WHERE subject_digest = ? AND period = ? AND route = ?',
        subjectDigest, 'free:2099-08-07', '/v1/responses',
      ).one().count).toBe(6);
      expect(state.storage.sql.exec<{ count: number }>(
        "SELECT COUNT(*) AS count FROM plan_usage WHERE period = 'free:2099-07-01'",
      ).one().count).toBe(0);
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM inflight').one().count).toBe(0);
      expect(state.storage.sql.exec<{ total: number | null }>('SELECT SUM(provider_units) AS total FROM daily_budget').one().total ?? 0).toBe(0);
    });
  });

  it.each([
    { maxDailyProviderUnits: undefined },
    { maxDailyProviderUnits: '' },
    { maxDailyProviderUnits: '0' },
    { maxDailyProviderUnits: '1.5' },
    { maxDailyProviderUnits: String(Number.MAX_SAFE_INTEGER + 1) },
    { maxDailyProviderUnits: 'not-a-number' },
    { maxDailyProviderUnits: TEST_MAX_DAILY_UNITS, maxGlobalInFlight: '0' },
    { maxDailyProviderUnits: TEST_MAX_DAILY_UNITS, maxGlobalInFlight: '2.5' },
    { maxDailyProviderUnits: TEST_MAX_DAILY_UNITS, maxGlobalInFlight: String(Number.MAX_SAFE_INTEGER + 1) },
  ])('fails closed without mutation for invalid configuration %#', async (config) => {
    const before = await counts();
    let caught: unknown;
    try {
      await reserve({}, config);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(await counts()).toEqual(before);
  });

  it('expires abandoned leases through the alarm and recomputes the next alarm', async () => {
    const first = await reserveAllowed({ subjectDigest: 'digest-alarm-1' });
    const second = await reserveAllowed({ subjectDigest: 'digest-alarm-2' });
    const future = Date.now() + 60_000;
    await runInDurableObject(stub(), async (_instance, state) => {
      state.storage.sql.exec('UPDATE inflight SET expires_at = ? WHERE lease_id = ?', Date.now() - 1, first);
      state.storage.sql.exec('UPDATE inflight SET expires_at = ? WHERE lease_id = ?', future, second);
      await state.storage.setAlarm(Date.now() + 1_000);
    });

    expect(await runDurableObjectAlarm(stub())).toBe(true);
    expect((await counts()).inflight).toBe(1);
    await runInDurableObject(stub(), async (_instance, state) => {
      expect(await state.storage.getAlarm()).toBe(future);
    });
  });

  it('reconciles an expired unresolved lease by refunding user allowance but retaining provider cost', async () => {
    const leaseId = await reserveAllowed({
      plan: 'pro',
      route: '/v1/analyses',
      subjectDigest: 'expired-unresolved-accounting',
    });
    await runInDurableObject(stub(), async (_instance, state) => {
      state.storage.sql.exec('UPDATE inflight SET expires_at = ? WHERE lease_id = ?', Date.now() - 1, leaseId);
      await state.storage.setAlarm(Date.now() + 1_000);
    });

    expect(await runDurableObjectAlarm(stub())).toBe(true);

    expect(await counts()).toEqual({ inflight: 0, budget: 3, usage: 0 });
    await runInDurableObject(stub(), (_instance, state) => {
      expect(state.storage.sql.exec<{ reason: string }>(
        'SELECT reason FROM accounting_reconciliation ORDER BY observed_at DESC LIMIT 1',
      ).one().reason).toBe('expired_unresolved');
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM lease_accounting').one().count).toBe(0);
    });
  });

  it('compensates every accepted increment when alarm scheduling fails and remains idempotent after alarm recovery', async () => {
    const internal = {
      ...request({ subjectDigest: 'alarm-failure-compensation' }),
      maxGlobalInFlight: 100,
      maxDailyProviderUnits: 1_000,
    };
    await runInDurableObject(stub(), async (instance, state) => {
      const setAlarm = vi.spyOn(state.storage, 'setAlarm').mockRejectedValueOnce(new Error('forced alarm failure'));
      const response = await instance.fetch!(new Request('https://admission.internal/reserve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(internal),
      }));
      setAlarm.mockRestore();

      expect(response.status).toBe(500);
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM inflight').one().count).toBe(0);
      expect(state.storage.sql.exec<{ total: number | null }>('SELECT SUM(count) AS total FROM plan_usage').one().total ?? 0).toBe(0);
      expect(state.storage.sql.exec<{ total: number | null }>('SELECT SUM(provider_units) AS total FROM daily_budget').one().total ?? 0).toBe(0);
    });

    const leaseId = await reserveAllowed({ subjectDigest: 'alarm-recovery-idempotent' });
    await runInDurableObject(stub(), async (_instance, state) => {
      state.storage.sql.exec('UPDATE inflight SET expires_at = ? WHERE lease_id = ?', Date.now() - 1, leaseId);
      await state.storage.setAlarm(Date.now() + 1_000);
    });
    expect(await runDurableObjectAlarm(stub())).toBe(true);
    await release(leaseId);
    await release(leaseId);
    expect((await counts()).inflight).toBe(0);
  });

  it('makes lease release idempotent', async () => {
    const leaseId = await reserveAllowed({ subjectDigest: 'digest-release' });

    await release(leaseId);
    await release(leaseId);

    expect((await counts()).inflight).toBe(0);
  });

  it('derives domain-separated HMAC subjects without exposing raw identifiers', async () => {
    const raw = '$RCAnonymousID:MARKER_RAW_ADMISSION_IDENTIFIER';
    const secret = 'test-admission-secret';
    const customer = await deriveAdmissionSubjectDigest(raw, 'customer', secret);
    const installation = await deriveAdmissionSubjectDigest(raw, 'installation', secret);

    expect(customer).toMatch(/^[a-f0-9]{64}$/);
    expect(installation).toMatch(/^[a-f0-9]{64}$/);
    expect(customer).not.toBe(installation);
    expect(`${customer}${installation}`).not.toContain(raw);
  });
});
