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

describe('load gate runner contract', () => {
  it('uses the exact full and CI phase durations and bounded deadlines', () => {
    expect(parseLoadOptions([])).toMatchObject({
      sustainedRps: 5,
      sustainedSeconds: 60,
      burstRps: 20,
      burstSeconds: 30,
      readinessMs: 30_000,
      diagnosticsMs: 2_000,
      clientMs: 25_000,
    });
    expect(parseLoadOptions(['--ci'])).toMatchObject({ sustainedSeconds: 5, burstSeconds: 2 });
  });

  it('requires separate provider authorization and synthetic-content acknowledgement for non-loopback targets', () => {
    expect(() => parseLoadOptions(['--target', 'https://example.com'])).toThrow('Refusing non-loopback target');
    expect(() => parseLoadOptions(['--target', 'https://example.com', '--authorize-provider'])).toThrow('Refusing non-loopback target');
    expect(() => parseLoadOptions(['--target', 'https://example.com', '--synthetic-content'])).toThrow('Refusing non-loopback target');
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
    ])).toMatchObject({
      target: 'https://example.com',
      startWrangler: false,
      mode: 'real-provider-soak',
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
});
