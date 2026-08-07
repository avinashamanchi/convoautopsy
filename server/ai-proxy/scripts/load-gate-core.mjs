const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

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
    sustainedSeconds: sustainedSeconds ?? (ci ? 5 : 60),
    burstRps: 20,
    burstSeconds: burstSeconds ?? (ci ? 2 : 30),
    readinessMs: 30_000,
    diagnosticsMs: 2_000,
    clientMs: 25_000,
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
  const host = index;
  const second = 18 + Math.floor(host / 65_536);
  const within = host % 65_536;
  const third = Math.floor(within / 256);
  const fourth = within % 256;
  return Object.freeze({
    installationToken: `load_${runId}_${String(index).padStart(6, '0')}`,
    syntheticIp: `198.${second}.${third}.${fourth}`,
  });
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
  const latencies = nonInjected.map((sample) => sample.latencyMs);
  return Object.freeze({
    requests: samples.length,
    nonInjectedRequests: nonInjected.length,
    nonInjectedFailures: failures.length,
    nonInjectedFailureRate: nonInjected.length === 0 ? 0 : failures.length / nonInjected.length,
    statusCounts,
    codeCounts,
    latencyMs: Object.freeze({
      p50: nearestRank(latencies, 0.5),
      p95: nearestRank(latencies, 0.95),
      p99: nearestRank(latencies, 0.99),
    }),
    activeReservations,
  });
}

function countBy(values, keyFor, order) {
  const entries = new Map();
  for (const value of values) {
    const key = keyFor(value);
    entries.set(key, (entries.get(key) ?? 0) + 1);
  }
  return Object.freeze(Object.fromEntries([...entries].toSorted(([left], [right]) => order(left, right))));
}

function numericKeyOrder(left, right) {
  return Number(left) - Number(right);
}

function lexicalKeyOrder(left, right) {
  return left.localeCompare(right);
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
