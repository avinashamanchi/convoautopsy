const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const INSTALLATION_COHORT_SIZE = 100;

export function parseLoadOptions(args) {
  const values = [...args];
  let ci = false;
  let target;
  let fixtureSecretFile;
  let providerAuthorized = false;
  let syntheticContentAcknowledged = false;
  let sustainedSeconds;
  let burstSeconds;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--ci') ci = true;
    else if (value === '--authorize-provider') providerAuthorized = true;
    else if (value === '--synthetic-content') syntheticContentAcknowledged = true;
    else if (value === '--target') target = requiredValue(values, ++index, '--target');
    else if (value === '--fixture-secret-file') fixtureSecretFile = requiredValue(values, ++index, value);
    else if (value === '--sustained-seconds') sustainedSeconds = positiveInteger(requiredValue(values, ++index, value), value);
    else if (value === '--burst-seconds') burstSeconds = positiveInteger(requiredValue(values, ++index, value), value);
    else throw new Error(`Unknown argument: ${value}`);
  }

  let mode = 'fixture';
  if (target !== undefined) {
    const url = parseHttpUrl(target);
    if (!LOOPBACK_HOSTS.has(url.hostname)) {
      if (!providerAuthorized || !syntheticContentAcknowledged) {
        throw new Error('Refusing non-loopback target without both provider authorization and synthetic-content acknowledgement');
      }
      if (sustainedSeconds === undefined || burstSeconds === undefined) {
        throw new Error('Refusing non-loopback target without explicit --sustained-seconds and --burst-seconds cost bounds');
      }
      mode = 'real-provider-soak';
      if (fixtureSecretFile !== undefined) throw new Error('A fixture secret file is valid only for loopback fixtures');
    } else if (fixtureSecretFile === undefined) {
      throw new Error('A loopback target requires a fixture secret file');
    }
    target = url.origin;
  }

  return Object.freeze({
    ci,
    target,
    fixtureSecretFile,
    mode,
    startWrangler: target === undefined,
    sustainedRps: 5,
    sustainedSeconds: sustainedSeconds ?? (ci ? 5 : 3_600),
    burstRps: 20,
    burstSeconds: burstSeconds ?? (ci ? 2 : 300),
    readinessMs: 30_000,
    diagnosticsMs: 2_000,
    clientMs: 25_000,
  });
}

export function createPlannedWorkload(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Invalid load options');
  const scheduledRequests = options.sustainedRps * options.sustainedSeconds
    + options.burstRps * options.burstSeconds;
  if (!Number.isSafeInteger(scheduledRequests) || scheduledRequests <= 0) throw new Error('Invalid planned request count');
  const paddingRequests = (10 - (scheduledRequests % 10)) % 10;
  const totalRequests = scheduledRequests + paddingRequests;
  const analysisRequests = totalRequests * 7 / 10;
  const responseRequests = totalRequests * 3 / 10;
  return Object.freeze({
    scheduledRequests,
    paddingRequests,
    totalRequests,
    analysisRequests,
    responseRequests,
    providerUnits: analysisRequests * 3 + responseRequests,
  });
}

export function createWranglerArguments({ root, port, persistencePath, envFile }) {
  if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) throw new Error('Invalid Wrangler port');
  for (const value of [root, persistencePath, envFile]) {
    if (typeof value !== 'string' || value.length === 0) throw new Error('Invalid Wrangler path');
  }
  return Object.freeze([
    `${root}/node_modules/wrangler/bin/wrangler.js`,
    'dev',
    '--config', `${root}/wrangler.load.jsonc`,
    '--local',
    '--ip', '127.0.0.1',
    '--port', String(port),
    '--persist-to', persistencePath,
    '--env-file', envFile,
    '--log-level', 'error',
    '--show-interactive-dev-session=false',
  ]);
}

export function scheduledOffsets(rps, seconds) {
  if (!Number.isSafeInteger(rps) || rps <= 0 || !Number.isSafeInteger(seconds) || seconds <= 0) {
    throw new Error('RPS and duration must be positive integers');
  }
  const count = rps * seconds;
  if (!Number.isSafeInteger(count)) throw new Error('Request count exceeds safe bounds');
  return Array.from({ length: count }, (_, index) => index * (1_000 / rps));
}

export function createRequestIdentity(runId, index) {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(runId) || !Number.isSafeInteger(index) || index < 0 || index >= 131_072) {
    throw new Error('Invalid load identity input');
  }
  const cohortIndex = index % INSTALLATION_COHORT_SIZE;
  return Object.freeze({
    installationToken: `load_${runId}_${String(cohortIndex).padStart(3, '0')}`,
    syntheticIp: '198.18.0.1',
  });
}

export function createFixedWorkloadCohort(totalRequests) {
  if (!Number.isSafeInteger(totalRequests) || totalRequests <= 0 || totalRequests > INSTALLATION_COHORT_SIZE) {
    throw new Error('Fixed workload count must fit the installation pool');
  }
  return Object.freeze({
    strategy: 'fixed-pool',
    installationPoolSize: INSTALLATION_COHORT_SIZE,
    exercisedInstallations: totalRequests,
  });
}

export function createCapacityCohort(simultaneousClients, maxInFlight) {
  if (!Number.isSafeInteger(simultaneousClients) || simultaneousClients <= 0 || simultaneousClients > 10_000
    || !Number.isSafeInteger(maxInFlight) || maxInFlight <= 0 || maxInFlight >= simultaneousClients) {
    throw new Error('Invalid capacity cohort');
  }
  return Object.freeze({
    simultaneousClients,
    admittedInstallations: maxInFlight,
    overloadInstallations: simultaneousClients - maxInFlight,
  });
}

export function createCapacityIdentity(runId, index, simultaneousClients) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(runId)
    || !Number.isSafeInteger(simultaneousClients) || simultaneousClients <= 0 || simultaneousClients > 10_000
    || !Number.isSafeInteger(index) || index < 0 || index >= simultaneousClients) {
    throw new Error('Invalid capacity identity input');
  }
  return Object.freeze({
    installationToken: `load_${runId}_capacity_${String(index).padStart(5, '0')}`,
    syntheticIp: '198.18.0.1',
    route: routeForRequestIndex(index),
  });
}

export async function settleWithConcurrency(values, maxConcurrency, operation) {
  if (!Array.isArray(values)
    || !Number.isSafeInteger(maxConcurrency)
    || maxConcurrency <= 0
    || typeof operation !== 'function') {
    throw new Error('Invalid bounded concurrency input');
  }
  const results = new Array(values.length);
  let nextIndex = 0;
  const workerCount = Math.min(maxConcurrency, values.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: 'fulfilled', value: await operation(values[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export function createQuotaSafeWorkloadPlan(totalRequests) {
  if (!Number.isSafeInteger(totalRequests) || totalRequests <= 0 || totalRequests % 10 !== 0) {
    throw new Error('Quota-safe workload count must be a positive multiple of ten');
  }
  const analysisRequests = totalRequests * 7 / 10;
  const responseRequests = totalRequests * 3 / 10;
  const analysisInstallations = Math.ceil(analysisRequests / 3);
  const responseInstallations = Math.ceil(responseRequests / 6);
  return Object.freeze({
    totalRequests,
    analysisRequests,
    responseRequests,
    analysisInstallations,
    responseInstallations,
    totalInstallations: analysisInstallations + responseInstallations,
  });
}

export function createQuotaSafeWorkloadIdentity(runId, index, plan) {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(runId)
    || !Number.isSafeInteger(index)
    || index < 0
    || !validQuotaSafeWorkloadPlan(plan)
    || index >= plan.totalRequests) {
    throw new Error('Invalid quota-safe workload identity input');
  }
  const route = routeForRequestIndex(index);
  const analysisOrdinal = analysisRequestsBefore(index);
  const routeOrdinal = route === '/v1/analyses' ? analysisOrdinal : index - analysisOrdinal;
  const perInstallation = route === '/v1/analyses' ? 3 : 6;
  const installationIndex = Math.floor(routeOrdinal / perInstallation);
  const prefix = route === '/v1/analyses' ? 'analysis' : 'response';
  return Object.freeze({
    installationToken: `load_${runId}_${prefix}_${String(installationIndex).padStart(5, '0')}`,
    syntheticIp: '198.18.0.1',
    route,
  });
}

export function requireFreshFinalDiagnostics(observations, finalInjectedStage) {
  if (!Array.isArray(observations) || typeof finalInjectedStage !== 'string' || !finalInjectedStage) {
    throw new Error('Invalid final diagnostics input');
  }
  const last = observations.at(-1);
  if (!last
    || last.stage !== finalInjectedStage
    || !Number.isSafeInteger(last.activeReservations)
    || last.activeReservations < 0) {
    throw new Error('Missing fresh final diagnostics');
  }
  return last.activeReservations;
}

export async function pollDiagnosticValue(read, predicate, {
  timeoutMs,
  intervalMs = 25,
  now = () => performance.now(),
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  if (typeof read !== 'function' || typeof predicate !== 'function'
    || !Number.isFinite(timeoutMs) || timeoutMs <= 0
    || !Number.isFinite(intervalMs) || intervalMs <= 0
    || typeof now !== 'function' || typeof wait !== 'function') {
    throw new Error('Invalid diagnostics poll input');
  }
  const deadline = now() + timeoutMs;
  let latest = -1;
  let peak = 0;
  while (now() < deadline) {
    try {
      const observed = await read();
      if (!Number.isSafeInteger(observed) || observed < 0) {
        throw new Error('Invalid diagnostics observation');
      }
      latest = observed;
      peak = Math.max(peak, observed);
      if (predicate(observed)) return Object.freeze({ matched: true, value: latest, peak });
    } catch {
      // A busy local Worker can transiently delay diagnostics; the outer deadline remains authoritative.
    }
    const remaining = deadline - now();
    if (remaining > 0) await wait(Math.min(intervalMs, remaining));
  }
  return Object.freeze({ matched: false, value: latest, peak });
}

export function routeForRequestIndex(index) {
  if (!Number.isSafeInteger(index) || index < 0) throw new Error('Invalid load request index');
  const cohortPosition = index % INSTALLATION_COHORT_SIZE;
  const cohortCycle = Math.floor(index / INSTALLATION_COHORT_SIZE);
  return (cohortPosition + cohortCycle * 3) % 10 < 7 ? '/v1/analyses' : '/v1/responses';
}

export function exactRouteMix(routeCounts, total) {
  if (!Number.isSafeInteger(total) || total <= 0 || total % 10 !== 0) return false;
  if (!routeCounts || typeof routeCounts !== 'object' || Array.isArray(routeCounts)) return false;
  if (Object.keys(routeCounts).some((route) => route !== '/v1/analyses' && route !== '/v1/responses')) return false;
  const analyses = routeCounts['/v1/analyses'] ?? 0;
  const responses = routeCounts['/v1/responses'] ?? 0;
  return Number.isSafeInteger(analyses)
    && Number.isSafeInteger(responses)
    && analyses + responses === total
    && analyses * 10 === total * 7
    && responses * 10 === total * 3;
}

export function abusiveRateLimitObserved(samples) {
  return Array.isArray(samples) && samples.some((sample) => sample?.injected === true
    && sample.status === 429
    && sample.code === 'RATE_LIMITED');
}

export function nearestRank(values, percentile) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  if (!Number.isFinite(percentile) || percentile <= 0 || percentile > 1) throw new Error('Invalid percentile');
  const ordered = values.filter((value) => Number.isFinite(value) && value >= 0).toSorted((left, right) => left - right);
  if (ordered.length === 0) return 0;
  return ordered[Math.ceil(percentile * ordered.length) - 1];
}

export function aggregateResults(samples, activeReservations) {
  if (!Number.isSafeInteger(activeReservations) || activeReservations < 0) throw new Error('Invalid reservation count');
  const nonInjected = samples.filter((sample) => !sample.injected);
  const failures = nonInjected.filter((sample) => sample.status < 200 || sample.status >= 300);
  const statusCounts = countBy(samples, (sample) => String(sample.status), numericKeyOrder);
  const codeCounts = countBy(samples, (sample) => sample.code, lexicalKeyOrder);
  const routeCounts = countBy(nonInjected, (sample) => sample.route, lexicalKeyOrder);
  const latencies = nonInjected.map((sample) => sample.latencyMs);
  return Object.freeze({
    requests: samples.length,
    nonInjectedRequests: nonInjected.length,
    nonInjectedFailures: failures.length,
    nonInjectedFailureRate: nonInjected.length === 0 ? 0 : failures.length / nonInjected.length,
    statusCounts,
    codeCounts,
    routeCounts,
    latencyMs: Object.freeze({
      p50: nearestRank(latencies, 0.5),
      p95: nearestRank(latencies, 0.95),
      p99: nearestRank(latencies, 0.99),
    }),
    activeReservations,
  });
}

export function createFatalSummary({ stage, samples, activeReservations }) {
  const observedReservations = Number.isSafeInteger(activeReservations) && activeReservations >= 0
    ? activeReservations
    : undefined;
  const summary = aggregateResults(samples, observedReservations ?? 0);
  return Object.freeze({
    gate: 'fail',
    failureCodes: [`LOAD_GATE_${safeStage(stage)}`],
    ...summary,
    activeReservations: observedReservations ?? 'not-measured',
  });
}

export async function fetchBoundedJsonWithDeadline(input, init, {
  timeoutMs,
  maxBytes,
  parentSignal,
  fetchImplementation = globalThis.fetch,
}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid diagnostics deadline');
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('Invalid diagnostics body bound');
  if (parentSignal.aborted) throw abortReason(parentSignal);

  const deadline = performance.now() + timeoutMs;
  const controller = new AbortController();
  const stop = () => controller.abort(abortReason(parentSignal));
  parentSignal.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(() => {
    controller.abort(new DOMException('Diagnostics deadline exceeded', 'TimeoutError'));
  }, Math.max(0, deadline - performance.now()));
  let reader;

  try {
    const response = await settleBeforeAbort(
      fetchImplementation(input, { ...init, signal: controller.signal }),
      controller.signal,
    );
    if (!response.body) throw new Error('missing diagnostics body');
    reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await settleBeforeAbort(reader.read(), controller.signal);
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error('diagnostics body bound');
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return Object.freeze({
      ok: response.ok,
      status: response.status,
      value: JSON.parse(new TextDecoder().decode(bytes)),
    });
  } catch (error) {
    if (reader) void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timer);
    parentSignal.removeEventListener('abort', stop);
    try {
      reader?.releaseLock();
    } catch {
      // Cancellation may still own a pending read; it will release when settled.
    }
  }
}

export async function fetchApiResponseWithDeadline(input, init, {
  timeoutMs,
  maxBytes,
  parentSignal,
  fetchImplementation = globalThis.fetch,
}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid API deadline');
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('Invalid API body bound');
  if (parentSignal.aborted) throw abortReason(parentSignal);

  const controller = new AbortController();
  const stop = () => controller.abort(abortReason(parentSignal));
  parentSignal.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(() => {
    controller.abort(new DOMException('API request deadline exceeded', 'TimeoutError'));
  }, timeoutMs);
  let reader;

  try {
    const response = await settleBeforeAbort(
      fetchImplementation(input, { ...init, signal: controller.signal }),
      controller.signal,
    );
    if (response.ok) {
      if (response.body) await settleBeforeAbort(response.body.cancel(), controller.signal);
      return Object.freeze({ ok: true, status: response.status });
    }
    if (!response.body) throw new Error('missing API error body');
    reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await settleBeforeAbort(reader.read(), controller.signal);
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error('API error body bound');
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return Object.freeze({
      ok: false,
      status: response.status,
      value: JSON.parse(new TextDecoder().decode(bytes)),
    });
  } catch (error) {
    if (reader) void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timer);
    parentSignal.removeEventListener('abort', stop);
    try {
      reader?.releaseLock();
    } catch {
      // A pending cancellation owns the reader until it settles.
    }
  }
}

function countBy(values, keyFor, order) {
  const entries = new Map();
  for (const value of values) {
    const key = keyFor(value);
    entries.set(key, (entries.get(key) ?? 0) + 1);
  }
  return Object.freeze(Object.fromEntries([...entries].toSorted(([left], [right]) => order(left, right))));
}

function validQuotaSafeWorkloadPlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return false;
  if (!Number.isSafeInteger(plan.totalRequests) || plan.totalRequests <= 0 || plan.totalRequests % 10 !== 0) return false;
  return plan.analysisRequests === plan.totalRequests * 7 / 10
    && plan.responseRequests === plan.totalRequests * 3 / 10
    && plan.analysisInstallations === Math.ceil(plan.analysisRequests / 3)
    && plan.responseInstallations === Math.ceil(plan.responseRequests / 6)
    && plan.totalInstallations === plan.analysisInstallations + plan.responseInstallations;
}

function analysisRequestsBefore(index) {
  const block = Math.floor(index / INSTALLATION_COHORT_SIZE);
  const position = index % INSTALLATION_COHORT_SIZE;
  const shift = block * 3 % 10;
  let count = block * 70 + Math.floor(position / 10) * 7;
  const remainder = position % 10;
  for (let offset = 0; offset < remainder; offset += 1) {
    if ((offset + shift) % 10 < 7) count += 1;
  }
  return count;
}

function numericKeyOrder(left, right) {
  return Number(left) - Number(right);
}

function lexicalKeyOrder(left, right) {
  return left.localeCompare(right);
}

function safeStage(stage) {
  return [
    'STARTUP',
    'SUSTAINED',
    'BURST',
    'MIX',
    'CAPACITY',
    'CAPACITY_HOLD',
    'CAPACITY_WAIT',
    'CAPACITY_OVERLOAD',
    'CAPACITY_RELEASE',
    'CAPACITY_DRAIN',
    'TOKEN_LIMIT',
    'EVALUATION',
  ].includes(stage) ? stage : 'INTERNAL';
}

function settleBeforeAbort(operation, signal) {
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (complete, value) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', stop);
      complete(value);
    };
    const stop = () => finish(reject, abortReason(signal));
    signal.addEventListener('abort', stop, { once: true });
    Promise.resolve(operation).then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error),
    );
    if (signal.aborted) stop();
  });
}

function abortReason(signal) {
  return signal.reason ?? new DOMException('Load gate stopped', 'AbortError');
}

function requiredValue(values, index, flag) {
  const value = values[index];
  if (value === undefined || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function positiveInteger(value, flag) {
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${flag} requires a positive integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${flag} exceeds safe bounds`);
  return parsed;
}

function parseHttpUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Target must be an absolute HTTP URL');
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Target must be an HTTP origin without credentials, path, query, or fragment');
  }
  return url;
}
