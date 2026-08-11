import { describe, expect, it } from 'vitest';

import { createSafeMetric, type SafeMetricInput } from '../src/metrics';

describe('content-free operational metrics', () => {
  it('constructs only the closed allowlist and ignores runtime extras', () => {
    const input = {
      route: '/v1/analyses',
      plan: 'pro',
      status: 200,
      latencyMs: 1_400,
      bodyBytes: 4_096,
      providerUnits: 3,
      inFlight: 22,
      entitlementCache: 'hit',
      budgetWarning: 'at-least-80',
      outcome: 'allowed',
      message: 'MARKER_CONVERSATION_CONTENT',
      requestId: 'MARKER_REQUEST_ID',
      installationToken: 'MARKER_INSTALLATION_ID',
      error: new Error('MARKER_RAW_ERROR'),
    } as unknown as SafeMetricInput;

    const metric = createSafeMetric(input);

    expect(metric).toEqual({
      route: '/v1/analyses',
      plan: 'pro',
      statusClass: '2xx',
      latencyBucket: '<5s',
      bodySizeBucket: '<16KiB',
      providerUnitBucket: '3',
      inFlightBucket: '<50',
      entitlementCache: 'hit',
      budgetWarning: 'at-least-80',
      outcome: 'allowed',
    });
    expect(Object.keys(metric)).toEqual([
      'route',
      'plan',
      'statusClass',
      'latencyBucket',
      'bodySizeBucket',
      'providerUnitBucket',
      'inFlightBucket',
      'entitlementCache',
      'budgetWarning',
      'outcome',
    ]);
    expect(Object.isFrozen(metric)).toBe(true);
    expect(JSON.stringify(metric)).not.toMatch(/MARKER_|message|requestId|installationToken|error/);
  });

  it.each([
    [{ route: '/v1/responses', plan: 'free', status: 404, latencyMs: 99, bodyBytes: 0, providerUnits: 0, inFlight: 0, entitlementCache: 'bypass', budgetWarning: 'under-80', outcome: 'INVALID_REQUEST' }, ['4xx', '<100ms', '0', '0', '0']],
    [{ route: 'unknown', plan: 'unknown', status: 503, latencyMs: 999, bodyBytes: 1_023, providerUnits: 1, inFlight: 9, entitlementCache: 'error', budgetWarning: 'unknown', outcome: 'SERVICE_BUSY' }, ['5xx', '<1s', '<1KiB', '1', '<10']],
    [{ route: '/v1/analyses', plan: 'pro', status: 200, latencyMs: 4_999, bodyBytes: 16_383, providerUnits: 3, inFlight: 49, entitlementCache: 'miss', budgetWarning: 'at-least-80', outcome: 'allowed' }, ['2xx', '<5s', '<16KiB', '3', '<50']],
    [{ route: '/v1/analyses', plan: 'pro', status: 200, latencyMs: 11_999, bodyBytes: 65_535, providerUnits: 2, inFlight: 99, entitlementCache: 'hit', budgetWarning: 'under-80', outcome: 'allowed' }, ['2xx', '<12s', '<64KiB', 'unknown', '<100']],
    [{ route: '/v1/analyses', plan: 'pro', status: 302, latencyMs: 19_999, bodyBytes: 131_072, providerUnits: Number.NaN, inFlight: 100, entitlementCache: 'unknown', budgetWarning: 'invalid', outcome: 'allowed' }, ['other', '<20s', '<=128KiB', 'unknown', '100+']],
    [{ route: '/v1/analyses', plan: 'pro', status: 200, latencyMs: 20_000, bodyBytes: 131_073, providerUnits: 3, inFlight: Number.NaN, entitlementCache: 'hit', budgetWarning: 'at-least-80', outcome: 'allowed' }, ['2xx', '>=20s', '>128KiB', '3', 'unknown']],
    [{ route: '/v1/analyses', plan: 'pro', status: 200, latencyMs: Number.NaN, bodyBytes: Number.NaN, providerUnits: 3, inFlight: -1, entitlementCache: 'hit', budgetWarning: 'under-80', outcome: 'allowed' }, ['2xx', '>=20s', 'unknown', '3', 'unknown']],
  ] as const)('buckets finite operational values without preserving raw numbers %#', (input, expected) => {
    const metric = createSafeMetric(input);

    expect([
      metric.statusClass,
      metric.latencyBucket,
      metric.bodySizeBucket,
      metric.providerUnitBucket,
      metric.inFlightBucket,
    ]).toEqual(expected);
  });
});
