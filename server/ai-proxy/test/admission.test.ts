/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { env } from 'cloudflare:workers';
import { reset, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';

import {
  deriveAdmissionSubjectDigest,
  releaseAdmission,
  reserveAdmission,
  type AdmissionRequest,
} from '../src/admission';

const MAX_DAILY_UNITS = '1000';
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
      : MAX_DAILY_UNITS,
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
  await reset();
});

describe('atomic AI admission', () => {
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

  it.each([
    { maxDailyProviderUnits: undefined },
    { maxDailyProviderUnits: '' },
    { maxDailyProviderUnits: '0' },
    { maxDailyProviderUnits: '1.5' },
    { maxDailyProviderUnits: String(Number.MAX_SAFE_INTEGER + 1) },
    { maxDailyProviderUnits: 'not-a-number' },
    { maxDailyProviderUnits: MAX_DAILY_UNITS, maxGlobalInFlight: '0' },
    { maxDailyProviderUnits: MAX_DAILY_UNITS, maxGlobalInFlight: '2.5' },
    { maxDailyProviderUnits: MAX_DAILY_UNITS, maxGlobalInFlight: String(Number.MAX_SAFE_INTEGER + 1) },
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
