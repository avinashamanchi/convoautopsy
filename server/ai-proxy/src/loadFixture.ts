import { AdmissionDurableObject as BaseAdmissionDurableObject } from './admission';
import type { AnalysisResult } from './contract';
import { createApp, type AiProvider, type Env } from './index';

export { RateLimitDurableObject } from './fairRateLimit';

type LoadFixtureEnv = Env & {
  LOAD_FIXTURE_SECRET?: string;
  LOAD_FIXTURE_LOCAL_ONLY?: string;
  LOAD_CONTROL: DurableObjectNamespace;
};

const analysis: AnalysisResult = {
  schemaVersion: 1,
  mode: 'ai',
  intensityScore: 24,
  conflictMode: 'Collaborating',
  messages: [{
    sender: 'Person A',
    text: 'Synthetic load-gate conversation.',
    pattern: 'Neutral',
    egoState: 'Adult',
    possibleInterpretation: 'This may be an attempt to find common ground.',
  }],
};

export class LoadControlDurableObject {
  private held = false;
  private readonly waiters = new Set<() => void>();

  constructor(_state: DurableObjectState, private readonly env: { LOAD_FIXTURE_SECRET?: string }) {}

  async fetch(request: Request): Promise<Response> {
    if (!authorizedBearer(request, this.env.LOAD_FIXTURE_SECRET)) return new Response(null, { status: 401 });
    const path = new URL(request.url).pathname;
    if (request.method === 'POST' && path === '/hold') {
      this.held = true;
      return new Response(null, { status: 204 });
    }
    if (request.method === 'POST' && path === '/release') {
      this.held = false;
      for (const release of this.waiters) release();
      this.waiters.clear();
      return new Response(null, { status: 204 });
    }
    if (request.method === 'GET' && path === '/wait') {
      if (this.held) await new Promise<void>((resolve) => { this.waiters.add(resolve); });
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  }
}

export class AdmissionDurableObject extends BaseAdmissionDurableObject {
  constructor(state: DurableObjectState, private readonly env: LoadFixtureEnv) {
    super(state);
  }

  override async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname !== '/__fixture/diagnostics') return super.fetch(request);
    if (request.method !== 'GET' || !authorizedBearer(request, this.env.LOAD_FIXTURE_SECRET)) {
      return new Response(null, { status: 401 });
    }
    const activeReservations = await this.activeReservationCount(Date.now());
    return Response.json({ activeReservations });
  }
}

export function validFixtureSecret(value: string | undefined): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function prepareFixtureApiRequest(request: Request, configuredSecret: string | undefined): Request | null {
  const suppliedSecret = request.headers.get('x-load-fixture-secret') ?? undefined;
  const syntheticIp = request.headers.get('x-load-fixture-ip');
  if (!validFixtureSecret(configuredSecret)
    || !constantTimeEqual(suppliedSecret, configuredSecret)
    || !validSyntheticIp(syntheticIp)) return null;

  const headers = new Headers(request.headers);
  headers.delete('x-load-fixture-secret');
  headers.delete('x-load-fixture-ip');
  headers.set('CF-Connecting-IP', syntheticIp);
  return new Request(request, { headers });
}

const worker = {
  async fetch(request: Request, env: LoadFixtureEnv): Promise<Response> {
    const url = new URL(request.url);
    if (env.LOAD_FIXTURE_LOCAL_ONLY !== '1' || !isLoopbackHostname(url.hostname)) {
      return new Response(null, { status: 404 });
    }
    const path = url.pathname;
    if (!validFixtureSecret(env.LOAD_FIXTURE_SECRET)) return new Response(null, { status: 500 });

    if (path === '/__fixture/ready') {
      if (request.method !== 'GET' || !authorizedBearer(request, env.LOAD_FIXTURE_SECRET)) return new Response(null, { status: 401 });
      return Response.json({ ready: true });
    }
    if (path === '/__fixture/control/hold' || path === '/__fixture/control/release') {
      if (request.method !== 'POST' || !authorizedBearer(request, env.LOAD_FIXTURE_SECRET)) return new Response(null, { status: 401 });
      const action = path.endsWith('/hold') ? 'hold' : 'release';
      return controlStub(env).fetch(`https://control.internal/${action}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${env.LOAD_FIXTURE_SECRET}` },
      });
    }
    if (path === '/__fixture/diagnostics') {
      if (request.method !== 'GET' || !authorizedBearer(request, env.LOAD_FIXTURE_SECRET)) return new Response(null, { status: 401 });
      const stub = env.AI_ADMISSION.get(env.AI_ADMISSION.idFromName('global'));
      const response = await stub.fetch('https://admission.internal/__fixture/diagnostics', {
        method: 'GET',
        headers: { authorization: `Bearer ${env.LOAD_FIXTURE_SECRET}` },
      });
      if (!response.ok) return new Response(null, { status: 503 });
      const value: unknown = await response.json();
      if (!isDiagnostic(value)) return new Response(null, { status: 503 });
      return Response.json({ activeReservations: value.activeReservations });
    }

    const prepared = prepareFixtureApiRequest(request, env.LOAD_FIXTURE_SECRET);
    if (!prepared) return new Response(null, { status: 401 });
    const app = createApp({
      provider: createFixtureProvider(env),
      logger: { info: () => undefined },
      entitlementResolver: async () => ({ plan: 'pro', cache: 'bypass' }),
    });
    return app.fetch(prepared, env);
  },
};

function createFixtureProvider(env: LoadFixtureEnv): AiProvider {
  const wait = async () => {
    const response = await controlStub(env).fetch('https://control.internal/wait', {
      method: 'GET',
      headers: { authorization: `Bearer ${env.LOAD_FIXTURE_SECRET}` },
    });
    if (response.status !== 204) throw new Error('Fixture control unavailable');
  };
  return {
    async analyze() {
      await wait();
      return analysis;
    },
    async craftResponse() {
      await wait();
      return Object.freeze({ id: 'fixture-draft', text: 'I would like to discuss this calmly.', hint: 'Use a clear request.' });
    },
  };
}

function controlStub(env: LoadFixtureEnv): DurableObjectStub {
  return env.LOAD_CONTROL.get(env.LOAD_CONTROL.idFromName('global'));
}

function authorizedBearer(request: Request, configuredSecret: string | undefined): boolean {
  if (!validFixtureSecret(configuredSecret)) return false;
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return false;
  return constantTimeEqual(authorization.slice('Bearer '.length), configuredSecret);
}

function constantTimeEqual(left: string | undefined, right: string): boolean {
  if (left === undefined || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < right.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function validSyntheticIp(value: string | null): value is string {
  if (value === null) return false;
  const parts = value.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  return octets[0] === 198
    && (octets[1] === 18 || octets[1] === 19)
    && octets[2] >= 0 && octets[2] <= 255
    && octets[3] >= 0 && octets[3] <= 255;
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

function isDiagnostic(value: unknown): value is { activeReservations: number } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).length === 1
    && 'activeReservations' in value
    && Number.isSafeInteger(value.activeReservations)
    && (value.activeReservations as number) >= 0;
}

export default worker;
