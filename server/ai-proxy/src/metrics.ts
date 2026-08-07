import type { PublicErrorCode } from './errors';

export type MetricRoute = '/v1/analyses' | '/v1/responses' | 'unknown';
export type MetricPlan = 'unknown' | 'free' | 'pro';
export type StatusClass = '2xx' | '4xx' | '5xx' | 'other';
export type LatencyBucket = '<100ms' | '<1s' | '<5s' | '<12s' | '<20s' | '>=20s';
export type BodySizeBucket = '0' | '<1KiB' | '<16KiB' | '<64KiB' | '<=128KiB' | '>128KiB' | 'unknown';
export type ProviderUnitBucket = '0' | '1' | '3' | 'unknown';
export type InFlightBucket = '0' | '<10' | '<50' | '<100' | '100+' | 'unknown';
export type EntitlementCacheMetric = 'unknown' | 'bypass' | 'hit' | 'miss' | 'error';
export type BudgetWarningMetric = 'unknown' | 'under-80' | 'at-least-80';
export type MetricOutcome = 'allowed' | PublicErrorCode;

export type SafeMetric = Readonly<{
  route: MetricRoute;
  plan: MetricPlan;
  statusClass: StatusClass;
  latencyBucket: LatencyBucket;
  bodySizeBucket: BodySizeBucket;
  providerUnitBucket: ProviderUnitBucket;
  inFlightBucket: InFlightBucket;
  entitlementCache: EntitlementCacheMetric;
  budgetWarning: BudgetWarningMetric;
  outcome: MetricOutcome;
}>;

export type SafeMetricInput = Readonly<{
  route: MetricRoute;
  plan: MetricPlan;
  status: number;
  latencyMs: number;
  bodyBytes: number | undefined;
  providerUnits: number | undefined;
  inFlight: number | undefined;
  entitlementCache: EntitlementCacheMetric;
  budgetWarning: unknown;
  outcome: MetricOutcome;
}>;

export function createSafeMetric(input: SafeMetricInput): SafeMetric {
  return Object.freeze({
    route: normalizeRoute(input.route),
    plan: normalizePlan(input.plan),
    statusClass: statusClass(input.status),
    latencyBucket: latencyBucket(input.latencyMs),
    bodySizeBucket: bodySizeBucket(input.bodyBytes),
    providerUnitBucket: providerUnitBucket(input.providerUnits),
    inFlightBucket: inFlightBucket(input.inFlight),
    entitlementCache: normalizeEntitlementCache(input.entitlementCache),
    budgetWarning: normalizeBudgetWarning(input.budgetWarning),
    outcome: normalizeOutcome(input.outcome),
  });
}

function normalizeRoute(value: MetricRoute): MetricRoute {
  return value === '/v1/analyses' || value === '/v1/responses' ? value : 'unknown';
}

function normalizePlan(value: MetricPlan): MetricPlan {
  return value === 'free' || value === 'pro' ? value : 'unknown';
}

function statusClass(status: number): StatusClass {
  if (Number.isInteger(status) && status >= 200 && status < 300) return '2xx';
  if (Number.isInteger(status) && status >= 400 && status < 500) return '4xx';
  if (Number.isInteger(status) && status >= 500 && status < 600) return '5xx';
  return 'other';
}

function latencyBucket(value: number): LatencyBucket {
  if (Number.isFinite(value) && value >= 0) {
    if (value < 100) return '<100ms';
    if (value < 1_000) return '<1s';
    if (value < 5_000) return '<5s';
    if (value < 12_000) return '<12s';
    if (value < 20_000) return '<20s';
  }
  return '>=20s';
}

function bodySizeBucket(value: number | undefined): BodySizeBucket {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return 'unknown';
  if (value === 0) return '0';
  if (value < 1_024) return '<1KiB';
  if (value < 16 * 1_024) return '<16KiB';
  if (value < 64 * 1_024) return '<64KiB';
  if (value <= 128 * 1_024) return '<=128KiB';
  return '>128KiB';
}

function providerUnitBucket(value: number | undefined): ProviderUnitBucket {
  return value === 0 || value === 1 || value === 3 ? String(value) as ProviderUnitBucket : 'unknown';
}

function inFlightBucket(value: number | undefined): InFlightBucket {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return 'unknown';
  if (value === 0) return '0';
  if (value < 10) return '<10';
  if (value < 50) return '<50';
  if (value < 100) return '<100';
  return '100+';
}

function normalizeEntitlementCache(value: EntitlementCacheMetric): EntitlementCacheMetric {
  return value === 'bypass' || value === 'hit' || value === 'miss' || value === 'error' ? value : 'unknown';
}

function normalizeBudgetWarning(value: unknown): BudgetWarningMetric {
  return value === 'under-80' || value === 'at-least-80' ? value : 'unknown';
}

function normalizeOutcome(value: MetricOutcome): MetricOutcome {
  return value === 'allowed'
    || value === 'INVALID_REQUEST'
    || value === 'CONSENT_REQUIRED'
    || value === 'PAYLOAD_TOO_LARGE'
    || value === 'RATE_LIMITED'
    || value === 'PLAN_LIMIT_REACHED'
    || value === 'SERVICE_BUSY'
    || value === 'DAILY_BUDGET_REACHED'
    || value === 'PROVIDER_UNAVAILABLE'
    || value === 'PROVIDER_INVALID_RESPONSE'
    || value === 'INTERNAL_ERROR'
    ? value
    : 'INTERNAL_ERROR';
}
