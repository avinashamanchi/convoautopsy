export type LoadOptions = Readonly<{
  ci: boolean;
  target?: string;
  fixtureSecretFile?: string;
  mode: 'fixture' | 'real-provider-soak';
  startWrangler: boolean;
  sustainedRps: 5;
  sustainedSeconds: number;
  burstRps: 20;
  burstSeconds: number;
  readinessMs: 30_000;
  diagnosticsMs: 2_000;
  clientMs: 25_000;
  capacityHoldMs: 90_000;
}>;

export type LoadSample = Readonly<{
  route: '/v1/analyses' | '/v1/responses';
  status: number;
  latencyMs: number;
  code: string;
  injected: boolean;
}>;

export type LoadSummary = Readonly<{
  requests: number;
  nonInjectedRequests: number;
  nonInjectedFailures: number;
  nonInjectedFailureRate: number;
  statusCounts: Readonly<Record<string, number>>;
  codeCounts: Readonly<Record<string, number>>;
  routeCounts: Readonly<Record<string, number>>;
  latencyMs: Readonly<{ p50: number; p95: number; p99: number }>;
  activeReservations: number;
}>;

export type FatalLoadSummary = Readonly<Omit<LoadSummary, 'activeReservations'> & {
  gate: 'fail';
  failureCodes: readonly string[];
  activeReservations: number | 'not-measured';
}>;

export function parseLoadOptions(args: readonly string[]): LoadOptions;
export function createPlannedWorkload(options: LoadOptions): Readonly<{
  scheduledRequests: number;
  paddingRequests: number;
  totalRequests: number;
  analysisRequests: number;
  responseRequests: number;
  providerUnits: number;
}>;
export function createWranglerArguments(options: Readonly<{
  root: string;
  port: number;
  persistencePath: string;
  envFile: string;
}>): readonly string[];
export function scheduledOffsets(rps: number, seconds: number): number[];
export function createRequestIdentity(runId: string, index: number): Readonly<{ installationToken: string; syntheticIp: string }>;
export function createFixedWorkloadCohort(totalRequests: number): Readonly<{
  strategy: 'fixed-pool';
  installationPoolSize: number;
  exercisedInstallations: number;
}>;
export function createCapacityCohort(simultaneousClients: number, maxInFlight: number): Readonly<{
  simultaneousClients: number;
  admittedInstallations: number;
  overloadInstallations: number;
}>;
export function createCapacityIdentity(
  runId: string,
  index: number,
  simultaneousClients: number,
): Readonly<{
  installationToken: string;
  syntheticIp: string;
  route: '/v1/analyses' | '/v1/responses';
}>;
export function settleWithConcurrency<T, R>(
  values: readonly T[],
  maxConcurrency: number,
  operation: (value: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]>;
export type QuotaSafeWorkloadPlan = Readonly<{
  totalRequests: number;
  analysisRequests: number;
  responseRequests: number;
  analysisInstallations: number;
  responseInstallations: number;
  totalInstallations: number;
}>;
export function createQuotaSafeWorkloadPlan(totalRequests: number): QuotaSafeWorkloadPlan;
export function createQuotaSafeWorkloadIdentity(
  runId: string,
  index: number,
  plan: QuotaSafeWorkloadPlan,
): Readonly<{
  installationToken: string;
  syntheticIp: string;
  route: '/v1/analyses' | '/v1/responses';
}>;
export function requireFreshFinalDiagnostics(
  observations: readonly Readonly<{ stage: string; activeReservations: number }>[],
  finalInjectedStage: string,
): number;
export function pollDiagnosticValue(
  read: () => Promise<number>,
  predicate: (value: number) => boolean,
  options: Readonly<{
    timeoutMs: number;
    intervalMs?: number;
    now?: () => number;
    wait?: (milliseconds: number) => Promise<void>;
  }>,
): Promise<Readonly<{ matched: boolean; value: number; peak: number }>>;
export function routeForRequestIndex(index: number): '/v1/analyses' | '/v1/responses';
export function exactRouteMix(routeCounts: Readonly<Record<string, number>>, total: number): boolean;
export function abusiveRateLimitObserved(samples: readonly LoadSample[]): boolean;
export function nearestRank(values: readonly number[], percentile: number): number;
export function aggregateResults(samples: readonly LoadSample[], activeReservations: number): LoadSummary;
export function createFatalSummary(options: Readonly<{
  stage: string;
  samples: readonly LoadSample[];
  activeReservations?: number;
}>): FatalLoadSummary;
export function fetchBoundedJsonWithDeadline(
  input: string,
  init: RequestInit,
  options: Readonly<{
    timeoutMs: number;
    maxBytes: number;
    parentSignal: AbortSignal;
    fetchImplementation?: typeof fetch;
  }>,
): Promise<Readonly<{ ok: boolean; status: number; value: unknown }>>;
export function fetchApiResponseWithDeadline(
  input: string,
  init: RequestInit,
  options: Readonly<{
    timeoutMs: number;
    maxBytes: number;
    parentSignal: AbortSignal;
    fetchImplementation?: typeof fetch;
  }>,
): Promise<Readonly<{ ok: boolean; status: number; value?: unknown }>>;
