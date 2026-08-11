import { describe, expect, it } from 'vitest';

import * as loadGateCore from '../scripts/load-gate-core.mjs';

const {
  aggregateResults,
  createFatalSummary,
  createWranglerArguments,
  createRequestIdentity,
  abusiveRateLimitObserved,
  exactRouteMix,
  nearestRank,
  parseLoadOptions,
  routeForRequestIndex,
  scheduledOffsets,
} = loadGateCore;

const createPlannedWorkload = (loadGateCore as unknown as {
  createPlannedWorkload?: (options: ReturnType<typeof parseLoadOptions>) => Readonly<{
    scheduledRequests: number;
    paddingRequests: number;
    totalRequests: number;
    analysisRequests: number;
    responseRequests: number;
    providerUnits: number;
  }>;
}).createPlannedWorkload!;

type FetchBoundedJsonWithDeadline = (
  input: string,
  init: RequestInit,
  options: Readonly<{
    timeoutMs: number;
    maxBytes: number;
    parentSignal: AbortSignal;
    fetchImplementation?: typeof fetch;
  }>,
) => Promise<Readonly<{ ok: boolean; status: number; value: unknown }>>;

const fetchBoundedJsonWithDeadline = (loadGateCore as unknown as {
  fetchBoundedJsonWithDeadline?: FetchBoundedJsonWithDeadline;
}).fetchBoundedJsonWithDeadline!;

type QuotaSafeWorkloadPlan = Readonly<{
  totalRequests: number;
  analysisRequests: number;
  responseRequests: number;
  analysisInstallations: number;
  responseInstallations: number;
  totalInstallations: number;
}>;

const createQuotaSafeWorkloadPlan = (loadGateCore as unknown as {
  createQuotaSafeWorkloadPlan?: (totalRequests: number) => QuotaSafeWorkloadPlan;
}).createQuotaSafeWorkloadPlan!;
const createQuotaSafeWorkloadIdentity = (loadGateCore as unknown as {
  createQuotaSafeWorkloadIdentity?: (
    runId: string,
    index: number,
    plan: QuotaSafeWorkloadPlan,
  ) => Readonly<{ installationToken: string; syntheticIp: string; route: '/v1/analyses' | '/v1/responses' }>;
}).createQuotaSafeWorkloadIdentity!;
const requireFreshFinalDiagnostics = (loadGateCore as unknown as {
  requireFreshFinalDiagnostics?: (
    observations: readonly Readonly<{ stage: string; activeReservations: number }>[] ,
    finalInjectedStage: string,
  ) => number;
}).requireFreshFinalDiagnostics!;
const fetchApiResponseWithDeadline = (loadGateCore as unknown as {
  fetchApiResponseWithDeadline?: (
    input: string,
    init: RequestInit,
    options: Readonly<{
      timeoutMs: number;
      maxBytes: number;
      parentSignal: AbortSignal;
      fetchImplementation?: typeof fetch;
    }>,
  ) => Promise<Readonly<{ ok: boolean; status: number; value?: unknown }>>;
}).fetchApiResponseWithDeadline!;
const createFixedWorkloadCohort = (loadGateCore as unknown as {
  createFixedWorkloadCohort?: (totalRequests: number) => Readonly<{
    strategy: 'fixed-pool';
    installationPoolSize: number;
    exercisedInstallations: number;
  }>;
}).createFixedWorkloadCohort!;
const createCapacityCohort = (loadGateCore as unknown as {
  createCapacityCohort?: (
    simultaneousClients: number,
    maxInFlight: number,
  ) => Readonly<{
    simultaneousClients: number;
    admittedInstallations: number;
    overloadInstallations: number;
  }>;
}).createCapacityCohort!;
const createCapacityIdentity = (loadGateCore as unknown as {
  createCapacityIdentity?: (
    runId: string,
    index: number,
    simultaneousClients: number,
  ) => Readonly<{
    installationToken: string;
    syntheticIp: string;
    route: '/v1/analyses' | '/v1/responses';
  }>;
}).createCapacityIdentity!;
const pollDiagnosticValue = (loadGateCore as unknown as {
  pollDiagnosticValue?: (
    read: () => Promise<number>,
    predicate: (value: number) => boolean,
    options: Readonly<{
      timeoutMs: number;
      intervalMs: number;
      now: () => number;
      wait: (milliseconds: number) => Promise<void>;
    }>,
  ) => Promise<Readonly<{ matched: boolean; value: number; peak: number }>>;
}).pollDiagnosticValue!;
const settleWithConcurrency = (loadGateCore as unknown as {
  settleWithConcurrency?: <T, R>(
    values: readonly T[],
    maxConcurrency: number,
    operation: (value: T, index: number) => Promise<R>,
  ) => Promise<PromiseSettledResult<R>[]>;
}).settleWithConcurrency!;

describe('load gate runner contract', () => {
  it('uses the exact full and CI phase durations and bounded deadlines', () => {
    expect(parseLoadOptions([])).toMatchObject({
      sustainedRps: 5,
      sustainedSeconds: 3_600,
      burstRps: 20,
      burstSeconds: 300,
      readinessMs: 30_000,
      diagnosticsMs: 2_000,
      clientMs: 25_000,
    });
    expect(parseLoadOptions(['--ci'])).toMatchObject({ sustainedSeconds: 5, burstSeconds: 2 });
    expect(createPlannedWorkload(parseLoadOptions([]))).toEqual({
      scheduledRequests: 24_000,
      paddingRequests: 0,
      totalRequests: 24_000,
      analysisRequests: 16_800,
      responseRequests: 7_200,
      providerUnits: 57_600,
    });
  });

  it('reports the fixed short-workload pool separately from installations actually exercised', () => {
    const ciRequestCount = 5 * 5 + 20 * 2;
    const paddedRequestCount = ciRequestCount + (10 - (ciRequestCount % 10)) % 10;
    const identities = Array.from({ length: paddedRequestCount }, (_, index) => createRequestIdentity('short-report-identity', index));

    expect(createFixedWorkloadCohort(paddedRequestCount)).toEqual({
      strategy: 'fixed-pool',
      installationPoolSize: 100,
      exercisedInstallations: new Set(identities.map(({ installationToken }) => installationToken)).size,
    });
    expect(new Set(identities.map(({ installationToken }) => installationToken)).size).toBe(70);
  });

  it('models 1,000 simultaneous clients as 100 admitted and 900 bounded overloads', () => {
    const cohort = createCapacityCohort(1_000, 100);
    const identities = Array.from({ length: cohort.simultaneousClients }, (_, index) => (
      createCapacityIdentity('capacity-proof-run', index, cohort.simultaneousClients)
    ));

    expect(cohort).toEqual({
      simultaneousClients: 1_000,
      admittedInstallations: 100,
      overloadInstallations: 900,
    });
    expect(new Set(identities.map(({ installationToken }) => installationToken)).size).toBe(1_000);
    expect(exactRouteMix(
      Object.fromEntries(['/v1/analyses', '/v1/responses'].map((route) => [
        route,
        identities.filter((identity) => identity.route === route).length,
      ])),
      1_000,
    )).toBe(true);
  });

  it('settles every overload probe while bounding local transport concurrency', async () => {
    let active = 0;
    let peak = 0;
    const results = await settleWithConcurrency(
      Array.from({ length: 37 }, (_, index) => index),
      4,
      async (value) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active -= 1;
        if (value === 19) throw new Error('synthetic failure');
        return value * 2;
      },
    );

    expect(peak).toBe(4);
    expect(active).toBe(0);
    expect(results).toHaveLength(37);
    expect(results[0]).toEqual({ status: 'fulfilled', value: 0 });
    expect(results[19]?.status).toBe('rejected');
    expect(results[36]).toEqual({ status: 'fulfilled', value: 72 });
  });

  it('requires separate provider authorization and synthetic-content acknowledgement for non-loopback targets', () => {
    expect(() => parseLoadOptions(['--target', 'https://example.com'])).toThrow('Refusing non-loopback target');
    expect(() => parseLoadOptions(['--target', 'https://example.com', '--authorize-provider'])).toThrow('Refusing non-loopback target');
    expect(() => parseLoadOptions(['--target', 'https://example.com', '--synthetic-content'])).toThrow('Refusing non-loopback target');
    expect(() => parseLoadOptions([
      '--target', 'https://example.com', '--authorize-provider', '--synthetic-content',
    ])).toThrow('explicit --sustained-seconds and --burst-seconds');
    expect(() => parseLoadOptions([
      '--target', 'https://example.com', '--authorize-provider', '--synthetic-content', '--sustained-seconds', '60',
    ])).toThrow('explicit --sustained-seconds and --burst-seconds');
    expect(() => parseLoadOptions(['--target', 'http://127.0.0.1:8787'])).toThrow('fixture secret file');
    expect(parseLoadOptions([
      '--target',
      'http://127.0.0.1:8787',
      '--fixture-secret-file',
      '/tmp/convo-load-secret',
    ])).toMatchObject({
      target: 'http://127.0.0.1:8787',
      startWrangler: false,
      mode: 'fixture',
      fixtureSecretFile: '/tmp/convo-load-secret',
    });
    expect(parseLoadOptions([
      '--target',
      'https://example.com',
      '--authorize-provider',
      '--synthetic-content',
      '--sustained-seconds',
      '60',
      '--burst-seconds',
      '30',
    ])).toMatchObject({
      target: 'https://example.com',
      startWrangler: false,
      mode: 'real-provider-soak',
      sustainedSeconds: 60,
      burstSeconds: 30,
    });
  });

  it('keeps ephemeral secret values out of Wrangler process arguments', () => {
    const secret = 'a'.repeat(64);
    const hmacSecret = 'b'.repeat(64);
    const args = createWranglerArguments({
      root: '/workspace/server/ai-proxy',
      port: 8787,
      persistencePath: '/tmp/load-state',
      envFile: '/tmp/load-state/fixture.env',
    });

    expect(args).toContain('/tmp/load-state/fixture.env');
    expect(args).not.toContain('--var');
    expect(JSON.stringify(args)).not.toContain(secret);
    expect(JSON.stringify(args)).not.toContain(hmacSecret);
    expect(args.some((value) => value.startsWith('LOAD_FIXTURE_SECRET:'))).toBe(false);
    expect(args.some((value) => value.startsWith('RATE_LIMIT_HMAC_SECRET:'))).toBe(false);
  });

  it('schedules exactly rps times seconds requests in monotonic order', () => {
    expect(scheduledOffsets(5, 2)).toEqual([0, 200, 400, 600, 800, 1_000, 1_200, 1_400, 1_600, 1_800]);
    const burst = scheduledOffsets(20, 2);
    expect(burst).toHaveLength(40);
    expect(burst[0]).toBe(0);
    expect(burst.at(-1)).toBe(1_950);
    expect(burst.every((value, index) => index === 0 || value > burst[index - 1])).toBe(true);
  });

  it('reuses exactly 100 valid installations behind one shared RFC 2544 NAT address', () => {
    const values = Array.from({ length: 1_001 }, (_, index) => createRequestIdentity('run-abcdef0123456789', index));

    expect(new Set(values.map((value) => value.installationToken)).size).toBe(100);
    expect(values[0].installationToken).toBe(values[100].installationToken);
    expect(new Set(values.slice(0, 100).map((value) => value.syntheticIp))).toEqual(new Set(['198.18.0.1']));
    expect(values.every((value) => /^[A-Za-z0-9_-]{16,256}$/.test(value.installationToken))).toBe(true);
    expect(values.every((value) => {
      const [first, second] = value.syntheticIp.split('.').map(Number);
      return first === 198 && (second === 18 || second === 19);
    })).toBe(true);
  });

  it('uses a deterministic 70 percent analysis and 30 percent response production-route mix', () => {
    const routes = Array.from({ length: 100 }, (_, index) => routeForRequestIndex(index));

    expect(routes.filter((route) => route === '/v1/analyses')).toHaveLength(70);
    expect(routes.filter((route) => route === '/v1/responses')).toHaveLength(30);
    expect(exactRouteMix({ '/v1/analyses': 70, '/v1/responses': 30 }, 100)).toBe(true);
    expect(exactRouteMix({ '/v1/analyses': 118, '/v1/responses': 48 }, 166)).toBe(false);
    expect(exactRouteMix({ '/v1/analyses': 69, '/v1/responses': 31 }, 100)).toBe(false);
  });

  it('rotates each fixed cohort installation across routes so the burst does not manufacture token throttling', () => {
    const routesForFirstInstallation = Array.from({ length: 10 }, (_, cycle) => routeForRequestIndex(cycle * 100));

    expect(routesForFirstInstallation.filter((route) => route === '/v1/analyses')).toHaveLength(7);
    expect(routesForFirstInstallation.filter((route) => route === '/v1/responses')).toHaveLength(3);
  });

  it.each([
    { rps: 5, seconds: 3_600, analyses: 12_600, responses: 5_400, analysisIds: 4_200, responseIds: 900, totalIds: 5_100 },
    { rps: 20, seconds: 300, analyses: 4_200, responses: 1_800, analysisIds: 1_400, responseIds: 300, totalIds: 1_700 },
  ])('builds a quota-safe real-provider cohort for $rps rps over $seconds seconds', ({ rps, seconds, analyses, responses, analysisIds, responseIds, totalIds }) => {
    const plan = createQuotaSafeWorkloadPlan(rps * seconds);
    const identities = Array.from({ length: plan.totalRequests }, (_, index) => (
      createQuotaSafeWorkloadIdentity('long-profile-abcdef012345', index, plan)
    ));
    const counts = new Map<string, { analyses: number; responses: number }>();
    for (const identity of identities) {
      const current = counts.get(identity.installationToken) ?? { analyses: 0, responses: 0 };
      if (identity.route === '/v1/analyses') current.analyses += 1;
      else current.responses += 1;
      counts.set(identity.installationToken, current);
    }

    expect(plan).toEqual({
      totalRequests: rps * seconds,
      analysisRequests: analyses,
      responseRequests: responses,
      analysisInstallations: analysisIds,
      responseInstallations: responseIds,
      totalInstallations: totalIds,
    });
    expect(Math.max(...[...counts.values()].map((value) => value.analyses))).toBeLessThanOrEqual(3);
    expect(Math.max(...[...counts.values()].map((value) => value.responses))).toBeLessThanOrEqual(6);
    expect(new Set(identities.map((identity) => identity.syntheticIp))).toEqual(new Set(['198.18.0.1']));
    expect(exactRouteMix({ '/v1/analyses': analyses, '/v1/responses': responses }, rps * seconds)).toBe(true);
  });

  it('sizes the complete 24,000-request release profile without exceeding Free admission allowances', () => {
    expect(createQuotaSafeWorkloadPlan(24_000)).toEqual({
      totalRequests: 24_000,
      analysisRequests: 16_800,
      responseRequests: 7_200,
      analysisInstallations: 5_600,
      responseInstallations: 1_200,
      totalInstallations: 6_800,
    });
  });

  it('requires an intentional repeated-token probe to observe production RATE_LIMITED behavior', () => {
    expect(abusiveRateLimitObserved([
      { route: '/v1/analyses', status: 200, latencyMs: 1, code: 'allowed', injected: true },
      { route: '/v1/analyses', status: 429, latencyMs: 1, code: 'RATE_LIMITED', injected: true },
    ])).toBe(true);
    expect(abusiveRateLimitObserved([
      { route: '/v1/analyses', status: 429, latencyMs: 1, code: 'PLAN_LIMIT_REACHED', injected: true },
    ])).toBe(false);
  });

  it('uses nearest-rank percentiles and exposes only aggregate safe output', () => {
    expect(nearestRank([10, 20, 30, 40, 50], 0.5)).toBe(30);
    expect(nearestRank([10, 20, 30, 40, 50], 0.95)).toBe(50);
    const summary = aggregateResults([
      { route: '/v1/analyses', status: 200, latencyMs: 100, code: 'allowed', injected: false },
      { route: '/v1/responses', status: 200, latencyMs: 300, code: 'allowed', injected: false },
      { route: '/v1/analyses', status: 503, latencyMs: 200, code: 'SERVICE_BUSY', injected: true },
    ], 0);

    expect(summary).toEqual({
      requests: 3,
      nonInjectedRequests: 2,
      nonInjectedFailures: 0,
      nonInjectedFailureRate: 0,
      statusCounts: { '200': 2, '503': 1 },
      codeCounts: { SERVICE_BUSY: 1, allowed: 2 },
      routeCounts: { '/v1/analyses': 1, '/v1/responses': 1 },
      latencyMs: { p50: 100, p95: 300, p99: 300 },
      activeReservations: 0,
    });
    expect(JSON.stringify(summary)).not.toMatch(/body|token|identity|message|error|content/i);
  });

  it('preserves partial samples and reports unavailable final diagnostics as not measured', () => {
    const summary = createFatalSummary({
      stage: 'CAPACITY',
      samples: [
        { route: '/v1/analyses', status: 200, latencyMs: 100, code: 'allowed', injected: false },
        { route: '/v1/responses', status: 503, latencyMs: 300, code: 'PROVIDER_UNAVAILABLE', injected: false },
      ],
      activeReservations: undefined,
    });

    expect(summary).toEqual({
      gate: 'fail',
      failureCodes: ['LOAD_GATE_CAPACITY'],
      requests: 2,
      nonInjectedRequests: 2,
      nonInjectedFailures: 1,
      nonInjectedFailureRate: 0.5,
      statusCounts: { '200': 1, '503': 1 },
      codeCounts: { allowed: 1, PROVIDER_UNAVAILABLE: 1 },
      routeCounts: { '/v1/analyses': 1, '/v1/responses': 1 },
      latencyMs: { p50: 100, p95: 300, p99: 300 },
      activeReservations: 'not-measured',
    });
  });

  it('keeps capacity substages visible in content-free fatal summaries', () => {
    expect(createFatalSummary({
      stage: 'CAPACITY_RELEASE',
      samples: [],
      activeReservations: 100,
    })).toMatchObject({
      failureCodes: ['LOAD_GATE_CAPACITY_RELEASE'],
      activeReservations: 100,
    });
  });

  it('refuses to reuse a capacity diagnostic as the final token-abuse diagnostic', () => {
    expect(() => requireFreshFinalDiagnostics([
      { stage: 'capacity', activeReservations: 0 },
    ], 'token-abuse')).toThrow('fresh final diagnostics');
    expect(requireFreshFinalDiagnostics([
      { stage: 'capacity', activeReservations: 0 },
      { stage: 'token-abuse', activeReservations: 0 },
    ], 'token-abuse')).toBe(0);
  });

  it('retries transient diagnostics failures until the bounded poll observes capacity', async () => {
    let attempts = 0;
    let elapsed = 0;
    const result = await pollDiagnosticValue(async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('transient fixture contention');
      return 100;
    }, (value) => value === 100, {
      timeoutMs: 100,
      intervalMs: 10,
      now: () => elapsed,
      wait: async (milliseconds) => { elapsed += milliseconds; },
    });

    expect(result).toEqual({ matched: true, value: 100, peak: 100 });
    expect(attempts).toBe(3);
  });

  it.each([
    { observed: 100, expected: 100 },
    { observed: 0, expected: 0 },
  ])('keeps the actually observed reservation value $expected in fatal output', ({ observed, expected }) => {
    expect(createFatalSummary({ stage: 'CAPACITY', samples: [], activeReservations: observed })).toMatchObject({
      requests: 0,
      activeReservations: expected,
    });
  });

  it('bounds a diagnostics body that never completes so fatal output and cleanup remain reachable', async () => {
    let bodyCancelled = false;
    let requestSignal: AbortSignal | undefined;
    const stalledBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"activeReservations":'));
      },
      cancel() {
        bodyCancelled = true;
      },
    });
    const fetchImplementation = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal as AbortSignal | undefined;
      await new Promise((resolve) => setTimeout(resolve, 40));
      return new Response(stalledBody, { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    let failure: unknown;
    let fatalSummary: ReturnType<typeof createFatalSummary> | undefined;
    let cleanupReached = false;
    const started = performance.now();

    try {
      await fetchBoundedJsonWithDeadline('http://127.0.0.1:8787/__fixture/diagnostics', {
        headers: { authorization: `Bearer ${'a'.repeat(64)}` },
      }, {
        timeoutMs: 80,
        maxBytes: 1_024,
        parentSignal: new AbortController().signal,
        fetchImplementation,
      });
    } catch (error) {
      failure = error;
      fatalSummary = createFatalSummary({ stage: 'CAPACITY', samples: [], activeReservations: undefined });
    } finally {
      cleanupReached = true;
    }

    expect(performance.now() - started).toBeLessThan(500);
    expect(failure).toMatchObject({ name: 'TimeoutError' });
    expect(requestSignal?.aborted).toBe(true);
    expect(bodyCancelled).toBe(true);
    expect(fatalSummary).toMatchObject({
      gate: 'fail',
      failureCodes: ['LOAD_GATE_CAPACITY'],
      activeReservations: 'not-measured',
    });
    expect(cleanupReached).toBe(true);
  }, 1_000);

  it('clears the diagnostics timer and parent abort listener after a complete body', async () => {
    const parent = new AbortController();
    let requestSignal: AbortSignal | undefined;
    const fetchImplementation = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal as AbortSignal | undefined;
      return Response.json({ activeReservations: 0 });
    }) as typeof fetch;

    const result = await fetchBoundedJsonWithDeadline('http://127.0.0.1:8787/__fixture/diagnostics', {}, {
      timeoutMs: 30,
      maxBytes: 1_024,
      parentSignal: parent.signal,
      fetchImplementation,
    });
    parent.abort();
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(result).toEqual({ ok: true, status: 200, value: { activeReservations: 0 } });
    expect(requestSignal?.aborted).toBe(false);
  });

  it('keeps the request deadline active through a stalled error-body read', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"error":'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchImplementation = (async () => new Response(body, { status: 503 })) as typeof fetch;
    const started = performance.now();

    const error = await fetchApiResponseWithDeadline('https://load.example/v1/analyses', {}, {
      timeoutMs: 20,
      maxBytes: 16 * 1_024,
      parentSignal: new AbortController().signal,
      fetchImplementation,
    }).catch((caught: unknown) => caught);

    expect(performance.now() - started).toBeLessThan(500);
    expect(error).toMatchObject({ name: 'TimeoutError' });
    expect(cancelled).toBe(true);
  });

  it('keeps the request deadline active through stalled successful-body cancellation', async () => {
    let requestSignal: AbortSignal | undefined;
    const body = {
      cancel: () => new Promise<void>(() => undefined),
    } as unknown as ReadableStream<Uint8Array>;
    const fetchImplementation = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal as AbortSignal;
      return { ok: true, status: 200, body } as Response;
    }) as typeof fetch;
    const started = performance.now();

    const error = await fetchApiResponseWithDeadline('https://load.example/v1/analyses', {}, {
      timeoutMs: 20,
      maxBytes: 16 * 1_024,
      parentSignal: new AbortController().signal,
      fetchImplementation,
    }).catch((caught: unknown) => caught);

    expect(performance.now() - started).toBeLessThan(500);
    expect(error).toMatchObject({ name: 'TimeoutError' });
    expect(requestSignal?.aborted).toBe(true);
  });
});
