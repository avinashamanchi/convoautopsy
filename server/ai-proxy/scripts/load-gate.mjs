import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

import {
  aggregateResults,
  abusiveRateLimitObserved,
  createFatalSummary,
  createRequestIdentity,
  createWranglerArguments,
  exactRouteMix,
  fetchBoundedJsonWithDeadline,
  parseLoadOptions,
  routeForRequestIndex,
  scheduledOffsets,
} from './load-gate-core.mjs';

const PUBLIC_CODES = new Set([
  'INVALID_REQUEST',
  'CONSENT_REQUIRED',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'PLAN_LIMIT_REACHED',
  'SERVICE_BUSY',
  'DAILY_BUDGET_REACHED',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_INVALID_RESPONSE',
  'INTERNAL_ERROR',
]);
const SYNTHETIC_ANALYSIS = Object.freeze({
  schemaVersion: 1,
  mode: 'ai',
  intensityScore: 24,
  conflictMode: 'Collaborating',
  messages: [Object.freeze({
    sender: 'Person A',
    text: 'Synthetic load-gate conversation.',
    pattern: 'Neutral',
    egoState: 'Adult',
    possibleInterpretation: 'This may be an attempt to find common ground.',
  })],
});
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const options = parseLoadOptions(process.argv.slice(2));
const timers = new Set();
const outstanding = new AbortController();
const runId = randomBytes(8).toString('hex');
let fixtureSecret = randomBytes(32).toString('hex');
let requestIndex = 0;
let child;
let temporaryState;
let currentStage = 'STARTUP';
let target = options.target;
let fixtureReady = false;
let lastObservedReservations;
const partialSamples = [];

const stopForSignal = () => outstanding.abort();
process.once('SIGINT', stopForSignal);
process.once('SIGTERM', stopForSignal);

try {
  if (options.startWrangler) {
    const port = await reserveLoopbackPort();
    target = `http://127.0.0.1:${port}`;
    temporaryState = await mkdtemp(join(tmpdir(), 'convoautopsy-load-'));
    const envFile = join(temporaryState, 'fixture.env');
    await writeFixtureEnv(envFile, fixtureSecret);
    child = startWrangler(port, temporaryState, envFile);
  } else if (options.mode === 'fixture') {
    fixtureSecret = (await readFile(options.fixtureSecretFile, 'utf8')).trim();
    if (!/^[a-f0-9]{64}$/.test(fixtureSecret)) throw new Error('invalid fixture secret');
  }
  if (!target) throw new Error('missing target');

  if (options.mode === 'fixture') {
    await waitUntilReady(target);
    fixtureReady = true;
  }
  currentStage = 'SUSTAINED';
  const sustained = await runScheduledPhase(target, options.sustainedRps, options.sustainedSeconds);
  partialSamples.push(...sustained);
  currentStage = 'BURST';
  const burst = await runScheduledPhase(target, options.burstRps, options.burstSeconds);
  partialSamples.push(...burst);
  currentStage = 'MIX';
  const padding = await runRouteMixPaddingPhase(target);
  partialSamples.push(...padding);
  const samples = partialSamples;
  let activeReservations = 0;
  let capacityPeakReservations = 0;
  const failures = [];

  if (sustained.length !== options.sustainedRps * options.sustainedSeconds) failures.push('SUSTAINED_COUNT');
  if (burst.length !== options.burstRps * options.burstSeconds) failures.push('BURST_COUNT');
  if ((sustained.length + burst.length + padding.length) % 10 !== 0) failures.push('ROUTE_MIX_COUNT');

  if (options.mode === 'fixture') {
    currentStage = 'CAPACITY';
    const capacity = await runCapacityPhase(target);
    samples.push(...capacity.samples);
    activeReservations = capacity.activeReservations;
    capacityPeakReservations = capacity.peakReservations;
    failures.push(...capacity.failures);

    currentStage = 'TOKEN_LIMIT';
    const abusiveToken = await runAbusiveTokenPhase(target);
    samples.push(...abusiveToken);
    if (!abusiveRateLimitObserved(abusiveToken)) failures.push('TOKEN_RATE_LIMIT');
  }

  const summary = aggregateResults(samples, activeReservations);
  currentStage = 'EVALUATION';
  if (!exactRouteMix(summary.routeCounts, summary.nonInjectedRequests)) failures.push('ROUTE_MIX');
  if (summary.latencyMs.p95 > 12_000) failures.push('P95_LATENCY');
  if (summary.latencyMs.p99 > 20_000) failures.push('P99_LATENCY');
  if (summary.nonInjectedFailureRate > 0.01) failures.push('FAILURE_RATE');
  if (samples.some((sample) => !sample.injected && sample.status === 429)) failures.push('UNEXPECTED_429');
  if (options.mode === 'fixture' && summary.activeReservations !== 0) failures.push('RESERVATION_LEAK');

  const output = options.mode === 'fixture'
    ? {
        gate: failures.length === 0 ? 'pass' : 'fail',
        failureCodes: [...new Set(failures)].sort(),
        capacityPeakReservations,
        ...summary,
      }
    : {
        gate: failures.length === 0 ? 'pass' : 'fail',
        failureCodes: [...new Set(failures)].sort(),
        ...summary,
        activeReservations: 'not-measured',
      };
  process.stdout.write(`${JSON.stringify(output)}\n`);
  if (failures.length > 0) process.exitCode = 1;
} catch {
  if (options.mode === 'fixture' && fixtureReady && target) {
    try {
      await fixtureDiagnostics(target);
    } catch {
      // A bounded final diagnostic is best effort; absence is reported explicitly.
    }
  }
  process.stdout.write(`${JSON.stringify(createFatalSummary({
    stage: currentStage,
    samples: partialSamples,
    activeReservations: options.mode === 'fixture' ? lastObservedReservations : undefined,
  }))}\n`);
  process.exitCode = 1;
} finally {
  outstanding.abort();
  clearTrackedTimers();
  process.removeListener('SIGINT', stopForSignal);
  process.removeListener('SIGTERM', stopForSignal);
  if (child) await terminateChild(child);
  if (temporaryState) await rm(temporaryState, { recursive: true, force: true });
}

async function runScheduledPhase(target, rps, seconds) {
  const started = performance.now();
  const operations = scheduledOffsets(rps, seconds).map(async (offset) => {
    await waitUntil(started + offset);
    return sendApiRequest(target, nextIdentity(), false);
  });
  return settledSamples(await Promise.allSettled(operations));
}

async function runRouteMixPaddingPhase(target) {
  const count = (10 - (requestIndex % 10)) % 10;
  const operations = Array.from({ length: count }, () => sendApiRequest(target, nextIdentity(), false));
  return settledSamples(await Promise.allSettled(operations));
}

async function runCapacityPhase(target) {
  const failures = [];
  await fixtureControl(target, 'hold');
  const pending = Array.from({ length: 100 }, () => sendApiRequest(target, nextIdentity(), false));
  let busySample;
  let activeReservations = 0;
  let peakReservations = 0;
  try {
    const heldDiagnostic = await pollDiagnostics(target, (value) => value === 100, options.clientMs);
    peakReservations = heldDiagnostic.peak;
    if (!heldDiagnostic.matched) failures.push('CAPACITY_DIAGNOSTICS');
    else {
      const responseIdentity = createRequestIdentity(runId, 99);
      busySample = await sendApiRequest(target, Object.freeze({ ...responseIdentity, route: '/v1/responses' }), true);
      if (busySample.status !== 503 || busySample.code !== 'SERVICE_BUSY') failures.push('CAPACITY_101');
    }
  } finally {
    await fixtureControl(target, 'release');
  }

  const held = settledSamples(await Promise.allSettled(pending));
  if (held.length !== 100 || held.some((sample) => sample.status < 200 || sample.status >= 300)) failures.push('CAPACITY_100');
  const releasedDiagnostic = await pollDiagnostics(target, (value) => value === 0, options.clientMs);
  peakReservations = Math.max(peakReservations, releasedDiagnostic.peak);
  activeReservations = releasedDiagnostic.value;
  if (!releasedDiagnostic.matched) failures.push('CAPACITY_RELEASE_DIAGNOSTICS');
  return {
    samples: busySample ? [...held, busySample] : held,
    activeReservations,
    peakReservations,
    failures,
  };
}

async function runAbusiveTokenPhase(target) {
  const identity = Object.freeze({ ...createRequestIdentity(runId, 0), route: '/v1/analyses' });
  const samples = [];
  for (let index = 0; index < 11; index += 1) {
    samples.push(await sendApiRequest(target, identity, true));
  }
  return samples;
}

async function sendApiRequest(target, identity, injected) {
  const started = performance.now();
  const route = identity.route;
  const headers = { 'content-type': 'application/json' };
  if (options.mode === 'fixture') {
    headers['x-load-fixture-secret'] = fixtureSecret;
    headers['x-load-fixture-ip'] = identity.syntheticIp;
  }
  try {
    const response = await fetchWithDeadline(`${target}${route}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(createApiPayload(route, identity.installationToken)),
    }, options.clientMs);
    const code = response.ok ? 'allowed' : await safePublicCode(response);
    if (response.ok) await cancelBody(response.body);
    return Object.freeze({ route, status: response.status, latencyMs: performance.now() - started, code, injected });
  } catch {
    return Object.freeze({ route, status: 0, latencyMs: performance.now() - started, code: 'CLIENT_FAILURE', injected });
  }
}

function createApiPayload(route, installationToken) {
  const common = {
    schemaVersion: 1,
    consentVersion: '2026-08-07',
    installationToken,
  };
  if (route === '/v1/analyses') {
    return {
      ...common,
      messages: [{ sender: 'Person A', text: 'Synthetic load-gate conversation.' }],
    };
  }
  return {
    ...common,
    sender: 'Person A',
    goal: 'resolve',
    tone: 'diplomatic',
    analysis: SYNTHETIC_ANALYSIS,
  };
}

async function waitUntilReady(target) {
  const deadline = performance.now() + options.readinessMs;
  while (performance.now() < deadline) {
    if (child && child.exitCode !== null) throw new Error('fixture exited');
    try {
      const response = await fetchWithDeadline(`${target}/__fixture/ready`, {
        headers: { authorization: `Bearer ${fixtureSecret}` },
      }, options.diagnosticsMs);
      await cancelBody(response.body);
      if (response.ok) return;
    } catch {
      // Readiness polling is bounded by the outer monotonic deadline.
    }
    await delay(100);
  }
  throw new Error('fixture readiness deadline');
}

async function fixtureControl(target, action) {
  const response = await fetchWithDeadline(`${target}/__fixture/control/${action}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${fixtureSecret}` },
  }, options.diagnosticsMs);
  await cancelBody(response.body);
  if (response.status !== 204) throw new Error('fixture control failed');
}

async function pollDiagnostics(target, predicate, timeoutMs) {
  const deadline = performance.now() + timeoutMs;
  let latest = -1;
  let peak = 0;
  while (performance.now() < deadline) {
    latest = await fixtureDiagnostics(target);
    peak = Math.max(peak, latest);
    if (predicate(latest)) return { matched: true, value: latest, peak };
    await delay(25);
  }
  return { matched: false, value: latest, peak };
}

async function fixtureDiagnostics(target) {
  const result = await fetchBoundedJsonWithDeadline(`${target}/__fixture/diagnostics`, {
    headers: { authorization: `Bearer ${fixtureSecret}` },
  }, {
    timeoutMs: options.diagnosticsMs,
    maxBytes: 1_024,
    parentSignal: outstanding.signal,
  });
  if (!result.ok) throw new Error('diagnostics failed');
  const value = result.value;
  if (!isDiagnostic(value)) throw new Error('invalid diagnostics');
  lastObservedReservations = value.activeReservations;
  return value.activeReservations;
}

function nextIdentity() {
  const index = requestIndex++;
  return Object.freeze({ ...createRequestIdentity(runId, index), route: routeForRequestIndex(index) });
}

function settledSamples(results) {
  return results.map((result) => result.status === 'fulfilled'
    ? result.value
    : Object.freeze({ route: '/v1/analyses', status: 0, latencyMs: options.clientMs, code: 'CLIENT_FAILURE', injected: false }));
}

async function safePublicCode(response) {
  try {
    const value = await readBoundedJson(response, 16 * 1_024);
    const code = value?.error?.code;
    return typeof code === 'string' && PUBLIC_CODES.has(code) ? code : 'UNKNOWN';
  } catch {
    return 'UNKNOWN';
  }
}

async function readBoundedJson(response, maxBytes) {
  if (!response.body) throw new Error('missing body');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error('body bound');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function fetchWithDeadline(url, init, timeoutMs) {
  if (outstanding.signal.aborted) throw new DOMException('Load gate stopped', 'AbortError');
  const controller = new AbortController();
  const stop = () => controller.abort();
  outstanding.signal.addEventListener('abort', stop, { once: true });
  const timer = trackTimer(setTimeout(() => controller.abort(), timeoutMs));
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTrackedTimer(timer);
    outstanding.signal.removeEventListener('abort', stop);
  }
}

async function waitUntil(deadline) {
  const remaining = deadline - performance.now();
  if (remaining > 0) await delay(remaining);
}

async function delay(milliseconds) {
  if (outstanding.signal.aborted) throw new DOMException('Load gate stopped', 'AbortError');
  await new Promise((resolve, reject) => {
    const stop = () => {
      clearTrackedTimer(timer);
      reject(new DOMException('Load gate stopped', 'AbortError'));
    };
    const timer = trackTimer(setTimeout(() => {
      outstanding.signal.removeEventListener('abort', stop);
      clearTrackedTimer(timer);
      resolve();
    }, Math.max(0, milliseconds)));
    outstanding.signal.addEventListener('abort', stop, { once: true });
  });
}

async function cancelBody(body) {
  try {
    await body?.cancel();
  } catch {
    // Response disposal is best effort and never changes aggregate gate results.
  }
}

function startWrangler(port, persistencePath, envFile) {
  const args = createWranglerArguments({ root, port, persistencePath, envFile });
  const subprocess = spawn(process.execPath, args, {
    cwd: root,
    env: scrubProviderSecrets(process.env),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  subprocess.stdout?.resume();
  subprocess.stderr?.resume();
  return subprocess;
}

async function writeFixtureEnv(path, secret) {
  const rateLimitSecret = randomBytes(32).toString('hex');
  await writeFile(path, [
    `LOAD_FIXTURE_SECRET=${secret}`,
    'LOAD_FIXTURE_LOCAL_ONLY=1',
    `RATE_LIMIT_HMAC_SECRET=${rateLimitSecret}`,
    'GROQ_API_KEY=fixture-unused',
    '',
  ].join('\n'), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
}

function scrubProviderSecrets(environment) {
  const result = { ...environment };
  for (const key of Object.keys(result)) {
    if (/GROQ|REVENUECAT|LOAD_FIXTURE|RATE_LIMIT_HMAC/i.test(key)) delete result[key];
  }
  return result;
}

async function terminateChild(subprocess) {
  if (subprocess.exitCode !== null || subprocess.signalCode !== null) return;
  subprocess.kill('SIGTERM');
  if (await waitForChildExit(subprocess, 5_000)) return;
  subprocess.kill('SIGKILL');
  await waitForChildExit(subprocess, 2_000);
}

async function waitForChildExit(subprocess, timeoutMs) {
  if (subprocess.exitCode !== null || subprocess.signalCode !== null) return true;
  return await new Promise((resolve) => {
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    const finish = (exited) => {
      clearTimeout(timer);
      subprocess.removeListener('exit', onExit);
      resolve(exited);
    };
    subprocess.once('exit', onExit);
  });
}

async function reserveLoopbackPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!port) throw new Error('port unavailable');
  return port;
}

function isDiagnostic(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).length === 1
    && Number.isSafeInteger(value.activeReservations)
    && value.activeReservations >= 0;
}

function trackTimer(timer) {
  timers.add(timer);
  return timer;
}

function clearTrackedTimer(timer) {
  clearTimeout(timer);
  timers.delete(timer);
}

function clearTrackedTimers() {
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
}
