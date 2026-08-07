/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { env } from 'cloudflare:workers';
import { reset, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AdmissionDurableObject,
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
    now: Date.parse('2026-08-07T12:00:00Z'),
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
    const now = Date.parse('2026-08-07T12:01:00Z');
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
    const now = Date.parse('2026-08-01T12:00:00Z');
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
    const now = Date.parse('2026-08-31T23:00:00Z');
    for (let index = 0; index < limit; index += 1) {
      await release(await reserveAllowed({ plan: 'pro', subjectDigest, route, now: now + index }));
    }

    await expect(reserve({ plan: 'pro', subjectDigest, route, now: now + limit })).resolves.toMatchObject({
      allowed: false,
      code: 'PLAN_LIMIT_REACHED',
    });
    const september = await reserve({ plan: 'pro', subjectDigest, route, now: Date.parse('2026-09-01T00:00:00Z') });
    expect(september.allowed).toBe(true);
    if (september.allowed) await release(september.leaseId);
  });

  it('preserves Pro capacity after 95 percent while rejecting Free work', async () => {
    await runInDurableObject(stub(), (_instance, state) => {
      state.storage.sql.exec('INSERT INTO daily_budget (day, provider_units) VALUES (?, ?)', '2026-08-07', 950);
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
      state.storage.sql.exec('INSERT INTO daily_budget (day, provider_units) VALUES (?, ?)', '2026-08-07', 999);
    });

    for (const plan of ['free', 'pro'] as const) {
      const rejected = await reserve({ plan, subjectDigest: `digest-${plan}-stop` });
      expect(rejected).toMatchObject({ allowed: false, code: 'DAILY_BUDGET_REACHED' });
      if (rejected.allowed) throw new Error('Expected daily budget rejection');
      expect(rejected.retryAfterSeconds).toBeGreaterThan(0);
    }
    const tomorrow = await reserve({ plan: 'pro', now: Date.parse('2026-08-08T00:00:00Z') });
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
    const now = Date.parse('2026-08-07T12:00:00Z');
    await runInDurableObject(stub(), (_instance, state) => {
      state.storage.sql.exec(
        'INSERT INTO plan_usage (subject_digest, period, route, count) VALUES (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?)',
        testDigest('old-free'), 'free:2026-07-08', '/v1/responses', 1,
        testDigest('current-free'), 'free:2026-08-07', '/v1/responses', 1,
        testDigest('old-pro'), 'pro:2026-07', '/v1/responses', 1,
        testDigest('current-pro'), 'pro:2026-08', '/v1/responses', 1,
      );
      state.storage.sql.exec(
        'INSERT INTO daily_budget (day, provider_units) VALUES (?, ?), (?, ?)',
        '2026-08-06', 20,
        '2026-08-07', 30,
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
      expect(periods.map((row) => row.period)).toEqual(['free:2026-08-07', 'pro:2026-08']);
      expect(days.map((row) => row.day)).toEqual(['2026-08-07']);
      expect(marker.last_retention_day).toBe('2026-08-07');
    });
  });

  it('runs retention at most once per UTC day and runs again on the next UTC day', async () => {
    const firstDay = Date.parse('2026-08-07T12:00:00Z');
    await release(await reserveAllowed({ now: firstDay, subjectDigest: 'retention-marker-first' }));
    await runInDurableObject(stub(), (_instance, state) => {
      state.storage.sql.exec(
        'INSERT INTO plan_usage (subject_digest, period, route, count) VALUES (?, ?, ?, ?)',
        testDigest('late-old-free'), 'free:2026-07-01', '/v1/responses', 1,
      );
      state.storage.sql.exec('INSERT INTO daily_budget (day, provider_units) VALUES (?, ?)', '2026-08-01', 9);
    });

    await release(await reserveAllowed({ now: firstDay + 1_000, subjectDigest: 'retention-marker-second' }));
    await runInDurableObject(stub(), (_instance, state) => {
      expect(state.storage.sql.exec<{ count: number }>(
        "SELECT COUNT(*) AS count FROM plan_usage WHERE period = 'free:2026-07-01'",
      ).one().count).toBe(1);
      expect(state.storage.sql.exec<{ count: number }>(
        "SELECT COUNT(*) AS count FROM daily_budget WHERE day = '2026-08-01'",
      ).one().count).toBe(1);
    });

    await release(await reserveAllowed({
      now: Date.parse('2026-08-08T00:00:00Z'),
      subjectDigest: 'retention-marker-next-day',
    }));
    await runInDurableObject(stub(), (_instance, state) => {
      expect(state.storage.sql.exec<{ count: number }>(
        "SELECT COUNT(*) AS count FROM plan_usage WHERE period = 'free:2026-07-01'",
      ).one().count).toBe(0);
      expect(state.storage.sql.exec<{ count: number }>(
        "SELECT COUNT(*) AS count FROM daily_budget WHERE day = '2026-08-01'",
      ).one().count).toBe(0);
      expect(state.storage.sql.exec<{ last_retention_day: string }>(
        'SELECT last_retention_day FROM maintenance_state WHERE id = 1',
      ).one().last_retention_day).toBe('2026-08-08');
    });
  });

  it('retention on a rejected reservation prunes only obsolete rows and does not increment current state', async () => {
    const now = Date.parse('2026-08-07T12:00:00Z');
    const subjectDigest = testDigest('retention-rejected-current');
    await runInDurableObject(stub(), (_instance, state) => {
      state.storage.sql.exec(
        'INSERT INTO plan_usage (subject_digest, period, route, count) VALUES (?, ?, ?, ?), (?, ?, ?, ?)',
        subjectDigest, 'free:2026-08-07', '/v1/responses', 6,
        testDigest('retention-rejected-old'), 'free:2026-07-01', '/v1/responses', 4,
      );
      state.storage.sql.exec('INSERT INTO daily_budget (day, provider_units) VALUES (?, ?)', '2026-08-06', 8);
    });

    await expect(reserve({ plan: 'free', now, subjectDigest })).resolves.toMatchObject({
      allowed: false,
      code: 'PLAN_LIMIT_REACHED',
    });

    await runInDurableObject(stub(), (_instance, state) => {
      expect(state.storage.sql.exec<{ count: number }>(
        'SELECT count FROM plan_usage WHERE subject_digest = ? AND period = ? AND route = ?',
        subjectDigest, 'free:2026-08-07', '/v1/responses',
      ).one().count).toBe(6);
      expect(state.storage.sql.exec<{ count: number }>(
        "SELECT COUNT(*) AS count FROM plan_usage WHERE period = 'free:2026-07-01'",
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
