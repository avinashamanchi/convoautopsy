import { describe, expect, it } from 'vitest';

import {
  aggregateResults,
  createFatalSummary,
  createWranglerArguments,
  createRequestIdentity,
  nearestRank,
  parseLoadOptions,
  scheduledOffsets,
} from '../scripts/load-gate-core.mjs';

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

  it('generates unique valid tokens and unique RFC 2544 synthetic identities', () => {
    const values = Array.from({ length: 1_001 }, (_, index) => createRequestIdentity('run-abcdef0123456789', index));

    expect(new Set(values.map((value) => value.installationToken)).size).toBe(1_001);
    expect(new Set(values.map((value) => value.syntheticIp)).size).toBe(1_001);
    expect(values.every((value) => /^[A-Za-z0-9_-]{16,256}$/.test(value.installationToken))).toBe(true);
    expect(values.every((value) => {
      const [first, second] = value.syntheticIp.split('.').map(Number);
      return first === 198 && (second === 18 || second === 19);
    })).toBe(true);
  });

  it('uses nearest-rank percentiles and exposes only aggregate safe output', () => {
    expect(nearestRank([10, 20, 30, 40, 50], 0.5)).toBe(30);
    expect(nearestRank([10, 20, 30, 40, 50], 0.95)).toBe(50);
    const summary = aggregateResults([
      { status: 200, latencyMs: 100, code: 'allowed', injected: false },
      { status: 200, latencyMs: 300, code: 'allowed', injected: false },
      { status: 503, latencyMs: 200, code: 'SERVICE_BUSY', injected: true },
    ], 0);

    expect(summary).toEqual({
      requests: 3,
      nonInjectedRequests: 2,
      nonInjectedFailures: 0,
      nonInjectedFailureRate: 0,
      statusCounts: { '200': 2, '503': 1 },
      codeCounts: { SERVICE_BUSY: 1, allowed: 2 },
      latencyMs: { p50: 100, p95: 300, p99: 300 },
      activeReservations: 0,
    });
    expect(JSON.stringify(summary)).not.toMatch(/body|token|identity|message|error|content/i);
  });

  it('preserves partial samples and reports unavailable final diagnostics as not measured', () => {
    const summary = createFatalSummary({
      stage: 'CAPACITY',
      samples: [
        { status: 200, latencyMs: 100, code: 'allowed', injected: false },
        { status: 503, latencyMs: 300, code: 'PROVIDER_UNAVAILABLE', injected: false },
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
});
