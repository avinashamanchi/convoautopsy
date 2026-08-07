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
}>;

export type LoadSample = Readonly<{
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
  latencyMs: Readonly<{ p50: number; p95: number; p99: number }>;
  activeReservations: number;
}>;

export function parseLoadOptions(args: readonly string[]): LoadOptions;
export function createWranglerArguments(options: Readonly<{
  root: string;
  port: number;
  persistencePath: string;
  envFile: string;
}>): readonly string[];
export function scheduledOffsets(rps: number, seconds: number): number[];
export function createRequestIdentity(runId: string, index: number): Readonly<{ installationToken: string; syntheticIp: string }>;
export function nearestRank(values: readonly number[], percentile: number): number;
export function aggregateResults(samples: readonly LoadSample[], activeReservations: number): LoadSummary;
