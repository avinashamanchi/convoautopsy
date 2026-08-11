/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { env } from 'cloudflare:workers';
import { reset, runInDurableObject } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { deriveAdmissionSubjectDigest } from '../src/admission';
import type { AnalysisResult, CraftResponseRequest } from '../src/contract';
import { createApp, type AiProvider, type Env } from '../src/index';
import { ProviderUnavailableError } from '../src/errors';

const installationToken = 'installation-token-which-is-long-enough';

const analysis: AnalysisResult = {
  schemaVersion: 1,
  mode: 'ai',
  intensityScore: 42,
  conflictMode: 'Collaborating',
  messages: [
    {
      sender: 'Person A',
      text: 'Please listen to me.',
      pattern: 'Neutral',
      egoState: 'Adult',
      possibleInterpretation: 'This may be an attempt to be heard.',
    },
  ],
};

function request(path: string, body?: unknown, init?: RequestInit): Request {
  return new Request(`https://proxy.example${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    ...init,
  });
}

function app(provider: AiProvider = validProvider()) {
  return createApp({ provider, logger: { info: () => undefined }, rateLimitSecret: 'test-only-rate-key' });
}

function validProvider(): AiProvider {
  return {
    analyze: async () => analysis,
    craftResponse: async () => ({ id: 'draft-1', text: 'I would like to talk calmly.', hint: 'State a clear request.' }),
  };
}

function analysisRequest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    consentVersion: '2026-08-07.2',
    installationToken,
    messages: [{ sender: 'Person A', text: 'Please listen to me.' }],
    ...overrides,
  };
}

function admissionStub(): DurableObjectStub {
  return env.AI_ADMISSION.get(env.AI_ADMISSION.idFromName('global'));
}

function envWithRejectedCompletions(): Env {
  const actualNamespace = env.AI_ADMISSION;
  const namespace = {
    idFromName: (name: string) => actualNamespace.idFromName(name),
    get: (id: DurableObjectId) => {
      const actual = actualNamespace.get(id);
      return {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          if (new URL(String(input)).pathname === '/complete') return Promise.reject(new Error('completion unavailable'));
          return actual.fetch(input, init);
        },
      };
    },
  } as unknown as DurableObjectNamespace;
  return { ...(env as unknown as Env), AI_ADMISSION: namespace };
}

async function currentInFlight(): Promise<number> {
  return runInDurableObject(admissionStub(), (_instance, state) => (
    state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM inflight').one().count
  ));
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function deferredValue<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

beforeEach(async () => {
  await reset();
});

describe('AI proxy routes', () => {
  it('returns a validated analysis from POST /v1/analyses', async () => {
    const response = await app().fetch(request('/v1/analyses', analysisRequest()), env as unknown as Env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ analysis, requestId: expect.any(String) });
  });

  it('emits matching request IDs on success and errors and exposes the header to allowed web origins', async () => {
    const origin = 'https://avinashamanchi.github.io';
    const success = await app().fetch(request('/v1/analyses', analysisRequest(), { headers: { Origin: origin } }), env as unknown as Env);
    const failure = await app().fetch(request('/v1/analyses', analysisRequest({ consentVersion: 'old-consent' }), { headers: { Origin: origin } }), env as unknown as Env);
    const successBody = await success.json() as { requestId: string };
    const failureBody = await failure.json() as { error: { requestId: string } };

    expect(success.headers.get('x-request-id')).toBe(successBody.requestId);
    expect(failure.headers.get('x-request-id')).toBe(failureBody.error.requestId);
    expect(success.headers.get('access-control-expose-headers')).toContain('x-request-id');
    expect(failure.headers.get('access-control-expose-headers')).toContain('x-request-id');
  });

  it('rejects non-POST methods and unknown routes without echoing request content', async () => {
    const getResponse = await app().fetch(new Request('https://proxy.example/v1/analyses'), env as unknown as Env);
    const unknownResponse = await app().fetch(request('/v1/unknown', analysisRequest()), env as unknown as Env);

    expect(getResponse.status).toBe(405);
    expect(unknownResponse.status).toBe(404);
    await expect(getResponse.json()).resolves.toMatchObject({ error: { code: 'INVALID_REQUEST', requestId: expect.any(String) } });
  });

  it('returns safe public errors for missing and invalid JSON', async () => {
    const missing = await app().fetch(new Request('https://proxy.example/v1/analyses', { method: 'POST' }), env as unknown as Env);
    const malformed = await app().fetch(new Request('https://proxy.example/v1/analyses', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad json',
    }), env as unknown as Env);

    expect(missing.status).toBe(400);
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({ error: { code: 'INVALID_REQUEST', requestId: expect.any(String) } });
  });

  it('enforces the 128 KiB bound before JSON parsing', async () => {
    const exactBoundary = new Request('https://proxy.example/v1/analyses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(128 * 1024),
    });
    const oversized = new Request('https://proxy.example/v1/analyses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(128 * 1024 + 1),
    });

    const exactResponse = await app().fetch(exactBoundary, env as unknown as Env);
    const response = await app().fetch(oversized, env as unknown as Env);

    expect(exactResponse.status).toBe(400);
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
  });

  it('settles a stalled streaming body on a wall deadline before rate, admission, or provider work', async () => {
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    let cancelled = false;
    let rateLimitCalls = 0;
    let providerCalled = false;
    const actualRateLimiter = env.RATE_LIMITER;
    const guardedEnv = {
      ...(env as unknown as Env),
      RATE_LIMITER: {
        idFromName: (name: string) => actualRateLimiter.idFromName(name),
        get: (id: DurableObjectId) => {
          const actual = actualRateLimiter.get(id);
          return {
            fetch: (input: RequestInfo | URL, init?: RequestInit) => {
              rateLimitCalls += 1;
              return actual.fetch(input, init);
            },
          };
        },
      } as unknown as DurableObjectNamespace,
    };
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        controller.enqueue(new TextEncoder().encode('{'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const stalled = new Request('https://proxy.example/v1/analyses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    const pending = createApp({
      provider: {
        analyze: async () => {
          providerCalled = true;
          return analysis;
        },
        craftResponse: validProvider().craftResponse,
      },
      logger: { info: () => undefined },
      rateLimitSecret: 'test-only-rate-key',
      bodyReadTimeoutMs: 20,
    }).fetch(stalled, guardedEnv);
    const response = await Promise.race([
      pending,
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 75)),
    ]);

    if (!response) {
      streamController.close();
      await pending;
    }
    expect(response).toBeDefined();
    if (!response) return;
    expect(response.status).toBe(408);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'INVALID_REQUEST' } });
    expect(cancelled).toBe(true);
    expect(rateLimitCalls).toBe(0);
    expect(providerCalled).toBe(false);
    expect(await currentInFlight()).toBe(0);
  });

  it('settles a stalled streaming body when the caller aborts before pre-admission work', async () => {
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    let cancelled = false;
    const requestController = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        controller.enqueue(new TextEncoder().encode('{'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const stalled = new Request('https://proxy.example/v1/analyses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: requestController.signal,
    });
    const pending = createApp({
      provider: validProvider(),
      logger: { info: () => undefined },
      rateLimitSecret: 'test-only-rate-key',
      bodyReadTimeoutMs: 10_000,
    }).fetch(stalled, env as unknown as Env);
    requestController.abort();
    const response = await Promise.race([
      pending,
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 75)),
    ]);

    if (!response) {
      streamController.close();
      await pending;
    }
    expect(response).toBeDefined();
    if (!response) return;
    expect(response.status).toBe(408);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'INVALID_REQUEST' } });
    expect(cancelled).toBe(true);
    expect(await currentInFlight()).toBe(0);
  });

  it('rejects remote analysis text above 280 Unicode code points before admission', async () => {
    let providerCalled = false;
    const provider: AiProvider = {
      analyze: async () => {
        providerCalled = true;
        return analysis;
      },
      craftResponse: validProvider().craftResponse,
    };
    const response = await app(provider).fetch(request('/v1/analyses', analysisRequest({
      messages: [{ sender: 'Person A', text: '🫠'.repeat(281) }],
    })), env as unknown as Env);

    expect(response.status).toBe(400);
    expect(providerCalled).toBe(false);
    await runInDurableObject(admissionStub(), (_instance, state) => {
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM plan_usage').one().count).toBe(0);
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM daily_budget').one().count).toBe(0);
    });
  });

  it.each([
    ['an eleventh message', Array.from({ length: 11 }, () => ({ ...analysis.messages[0] }))],
    ['a 281-code-point message', [{ ...analysis.messages[0], text: '🫠'.repeat(281) }]],
    ['a 151-code-point interpretation', [{ ...analysis.messages[0], possibleInterpretation: 'x'.repeat(151) }]],
  ])('rejects response drafting with %s before admission', async (_case, messages) => {
    let providerCalled = false;
    const response = await app({
      analyze: validProvider().analyze,
      craftResponse: async () => {
        providerCalled = true;
        return { id: 'must-not-run', text: 'No.', hint: 'No.' };
      },
    }).fetch(request('/v1/responses', {
      schemaVersion: 1,
      consentVersion: '2026-08-07.2',
      installationToken,
      sender: 'Person A',
      goal: 'resolve',
      tone: 'empathetic',
      analysis: { ...analysis, mode: 'local', messages },
    }), env as unknown as Env);

    expect(response.status).toBe(400);
    expect(providerCalled).toBe(false);
    await runInDurableObject(admissionStub(), (_instance, state) => {
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM plan_usage').one().count).toBe(0);
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM daily_budget').one().count).toBe(0);
    });
  });

  it('accepts the largest remote analysis request and bounded response contract end to end', async () => {
    const messages = Array.from({ length: 10 }, (_, index) => ({
      sender: `Person ${String.fromCharCode(65 + index)}`,
      text: '🫠'.repeat(280),
    }));
    const largestAnalysis = {
      schemaVersion: 1 as const,
      mode: 'ai' as const,
      intensityScore: 50,
      conflictMode: 'Collaborating' as const,
      messages: messages.map((message) => ({
        ...message,
        pattern: 'Neutral' as const,
        egoState: 'Adult' as const,
        possibleInterpretation: 'x'.repeat(150),
      })),
    };
    const response = await app({
      analyze: async () => largestAnalysis,
      craftResponse: validProvider().craftResponse,
    }).fetch(request('/v1/analyses', analysisRequest({ messages })), env as unknown as Env);
    const encoded = new TextEncoder().encode(await response.clone().text());

    expect(response.status).toBe(200);
    expect(encoded.byteLength).toBeLessThanOrEqual(40 * 1_024);
    await expect(response.json()).resolves.toMatchObject({ analysis: { messages: expect.arrayContaining([
      expect.objectContaining({ text: '🫠'.repeat(280), possibleInterpretation: 'x'.repeat(150) }),
    ]) } });
  });

  it('rejects a provider result that does not echo every reviewed remote message exactly', async () => {
    const response = await app().fetch(request('/v1/analyses', analysisRequest({
      messages: [
        { sender: 'Person A', text: 'first reviewed message' },
        { sender: 'Person B', text: 'second reviewed message' },
      ],
    })), env as unknown as Env);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'PROVIDER_INVALID_RESPONSE' } });
  });

  it('rejects an eleventh remote analysis message without provider work or quota charge', async () => {
    let providerCalled = false;
    const provider: AiProvider = {
      analyze: async () => {
        providerCalled = true;
        return analysis;
      },
      craftResponse: validProvider().craftResponse,
    };
    const response = await app(provider).fetch(request('/v1/analyses', analysisRequest({
      messages: Array.from({ length: 11 }, (_, index) => ({
        sender: `Person ${String.fromCharCode(65 + index)}`,
        text: `message ${index}`,
      })),
    })), env as unknown as Env);

    expect(response.status).toBe(400);
    expect(providerCalled).toBe(false);
    await runInDurableObject(admissionStub(), (_instance, state) => {
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM plan_usage').one().count).toBe(0);
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM daily_budget').one().count).toBe(0);
    });
  });

  it('requires an installation token and the current consent version', async () => {
    const invalidToken = await app().fetch(request('/v1/analyses', analysisRequest({ installationToken: 'short' })), env as unknown as Env);
    const oldConsent = await app().fetch(request('/v1/analyses', analysisRequest({ consentVersion: '2026-08-07' })), env as unknown as Env);

    expect(invalidToken.status).toBe(400);
    expect(oldConsent.status).toBe(403);
    await expect(oldConsent.json()).resolves.toMatchObject({ error: { code: 'CONSENT_REQUIRED' } });
  });

  it('limits malformed provider output to a safe public error', async () => {
    const response = await app({
      analyze: async () => ({ unexpected: 'provider response MARKER_PROVIDER_FAILURE' } as unknown as AnalysisResult),
      craftResponse: validProvider().craftResponse,
    }).fetch(request('/v1/analyses', analysisRequest()), env as unknown as Env);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'PROVIDER_INVALID_RESPONSE' } });
    expect(await currentInFlight()).toBe(0);
  });

  it('refunds invalid model output without letting one installation open the global outage circuit', async () => {
    let invalidCalls = 0;
    const invalidProvider: AiProvider = {
      analyze: async () => {
        invalidCalls += 1;
        return { callerInfluenced: 'not the analysis contract' } as unknown as AnalysisResult;
      },
      craftResponse: validProvider().craftResponse,
    };
    for (let index = 0; index < 5; index += 1) {
      const response = await app(invalidProvider).fetch(request('/v1/analyses', analysisRequest()), env as unknown as Env);
      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'PROVIDER_INVALID_RESPONSE' } });
    }

    const otherInstallation = await app().fetch(request('/v1/analyses', analysisRequest({
      installationToken: 'different-installation-after-invalid-output',
    })), env as unknown as Env);

    expect(invalidCalls).toBe(5);
    expect(otherInstallation.status).toBe(200);
    await runInDurableObject(admissionStub(), (_instance, state) => {
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM provider_failures').one().count).toBe(0);
      expect(state.storage.sql.exec<{ total: number | null }>('SELECT SUM(count) AS total FROM plan_usage').one().total ?? 0).toBe(1);
      expect(state.storage.sql.exec<{ total: number | null }>('SELECT SUM(provider_units) AS total FROM daily_budget').one().total ?? 0).toBe(18);
    });
  });

  it('maps provider timeouts to a retryable safe public error', async () => {
    const response = await app({
      analyze: async () => { throw new DOMException('slow', 'TimeoutError'); },
      craftResponse: validProvider().craftResponse,
    }).fetch(request('/v1/analyses', analysisRequest()), env as unknown as Env);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'PROVIDER_UNAVAILABLE' } });
    expect(await currentInFlight()).toBe(0);
  });

  it('maps upstream provider outages to a retryable safe public error', async () => {
    const response = await app({
      analyze: async () => { throw new ProviderUnavailableError(); },
      craftResponse: validProvider().craftResponse,
    }).fetch(request('/v1/analyses', analysisRequest()), env as unknown as Env);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'PROVIDER_UNAVAILABLE' } });
    expect(await currentInFlight()).toBe(0);
  });

  it('does not open the global outage circuit after five caller-content provider rejections', async () => {
    let providerCalls = 0;
    const callerRejected: AiProvider = {
      analyze: async () => {
        providerCalls += 1;
        throw Object.assign(new Error('caller content rejected'), { providerFailureKind: 'caller' as const });
      },
      craftResponse: validProvider().craftResponse,
    };
    for (let index = 0; index < 5; index += 1) {
      const response = await app(callerRejected).fetch(request('/v1/analyses', analysisRequest({
        installationToken: `caller-rejection-installation-${index}`,
      })), env as unknown as Env);
      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'PROVIDER_INVALID_RESPONSE' } });
    }

    const next = await app().fetch(request('/v1/analyses', analysisRequest({
      installationToken: 'caller-rejection-next-installation',
    })), env as unknown as Env);

    expect(providerCalls).toBe(5);
    expect(next.status).toBe(200);
    await runInDurableObject(admissionStub(), (_instance, state) => {
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM provider_failures').one().count).toBe(0);
      expect(state.storage.sql.exec<{ total: number | null }>('SELECT SUM(provider_units) AS total FROM daily_budget').one().total ?? 0).toBe(18);
    });
  });

  it('fails closed and logs only an internal outcome for provider authentication or model configuration failure', async () => {
    const marker = 'MARKER_PROVIDER_CONFIGURATION_DETAIL';
    const metrics: import('../src/metrics').SafeMetric[] = [];
    const configured = createApp({
      provider: {
        analyze: async () => {
          throw Object.assign(new Error(marker), { providerFailureKind: 'configuration' as const });
        },
        craftResponse: validProvider().craftResponse,
      },
      logger: { info: (metric) => { metrics.push(metric); } },
      rateLimitSecret: 'test-only-rate-key',
      entitlementResolver: async () => ({ plan: 'pro', cache: 'hit' }),
    });

    const response = await configured.fetch(request('/v1/analyses', analysisRequest({
      revenueCatAppUserId: '$RCAnonymousID:verified-pro-configuration-failure',
    })), env as unknown as Env);
    const blocked = await app().fetch(request('/v1/analyses', analysisRequest({
      installationToken: 'configuration-circuit-second-installation',
    })), env as unknown as Env);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
    expect(blocked.status).toBe(503);
    await expect(blocked.json()).resolves.toMatchObject({ error: { code: 'PROVIDER_UNAVAILABLE' } });
    expect(metrics[0]).toMatchObject({ outcome: 'INTERNAL_ERROR', statusClass: '5xx', plan: 'pro' });
    expect(JSON.stringify(metrics)).not.toContain(marker);
    expect(JSON.stringify(metrics)).not.toMatch(/"message"|"content"|"error"|"installationToken"/i);
  });

  it('opens the provider circuit after five failures, refunds user quota, retains provider cost, and makes no sixth provider call', async () => {
    let providerCalls = 0;
    const failingProvider: AiProvider = {
      analyze: async () => { providerCalls += 1; throw new ProviderUnavailableError(); },
      craftResponse: validProvider().craftResponse,
    };

    for (let index = 0; index < 6; index += 1) {
      const response = await app(failingProvider).fetch(request('/v1/analyses', analysisRequest({
        installationToken: `circuit-installation-token-${index}`,
      })), env as unknown as Env);
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'PROVIDER_UNAVAILABLE' } });
    }

    expect(providerCalls).toBe(5);
    await runInDurableObject(admissionStub(), (_instance, state) => {
      expect(state.storage.sql.exec<{ total: number | null }>('SELECT SUM(count) AS total FROM plan_usage').one().total ?? 0).toBe(0);
      expect(state.storage.sql.exec<{ total: number | null }>('SELECT SUM(provider_units) AS total FROM daily_budget').one().total ?? 0).toBe(15);
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM inflight').one().count).toBe(0);
    });
  });

  it('returns retryable entitlement-unavailable before admission for an identified customer', async () => {
    let providerCalled = false;
    const response = await createApp({
      provider: {
        analyze: async () => {
          providerCalled = true;
          return analysis;
        },
        craftResponse: validProvider().craftResponse,
      },
      logger: { info: () => undefined },
      rateLimitSecret: 'test-only-rate-key',
      entitlementResolver: async () => ({ plan: 'unknown', cache: 'error' } as never),
    }).fetch(request('/v1/analyses', analysisRequest({ revenueCatAppUserId: '$RCAnonymousID:identified-pro' })), env as unknown as Env);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'ENTITLEMENT_UNAVAILABLE', retryAfterSeconds: expect.any(Number) },
    });
    expect(providerCalled).toBe(false);
    await runInDurableObject(admissionStub(), (_instance, state) => {
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM plan_usage').one().count).toBe(0);
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM daily_budget').one().count).toBe(0);
    });
  });

  it('keeps an absent RevenueCat identifier as verified Free', async () => {
    const plans: string[] = [];
    const response = await createApp({
      provider: validProvider(),
      logger: { info: (metric) => { plans.push(metric.plan); } },
      rateLimitSecret: 'test-only-rate-key',
    }).fetch(request('/v1/analyses', analysisRequest()), env as unknown as Env);

    expect(response.status).toBe(200);
    expect(plans).toEqual(['free']);
  });

  it('meters rotating installations under one verified Free RevenueCat identity', async () => {
    const provider = validProvider();
    let providerCalls = 0;
    const identifiedFree = createApp({
      provider: {
        analyze: async (messages) => {
          providerCalls += 1;
          return provider.analyze(messages);
        },
        craftResponse: provider.craftResponse,
      },
      logger: { info: () => undefined },
      rateLimitSecret: 'test-only-rate-key',
      entitlementResolver: async () => ({ plan: 'free', cache: 'hit' }),
    });
    const responses: Response[] = [];
    for (let index = 0; index < 4; index += 1) {
      responses.push(await identifiedFree.fetch(request('/v1/analyses', analysisRequest({
        installationToken: `rotating-free-installation-${index}`,
        revenueCatAppUserId: '$RCAnonymousID:stable-verified-free',
      })), env as unknown as Env));
    }

    expect(responses.map(({ status }) => status)).toEqual([200, 200, 200, 429]);
    await expect(responses[3].json()).resolves.toMatchObject({ error: { code: 'PLAN_LIMIT_REACHED' } });
    expect(providerCalls).toBe(3);
    await runInDurableObject(admissionStub(), (_instance, state) => {
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(DISTINCT subject_digest) AS count FROM plan_usage').one().count).toBe(1);
    });
  });

  it('does not return provider success when durable success accounting cannot be confirmed', async () => {
    const response = await app().fetch(
      request('/v1/analyses', analysisRequest()),
      envWithRejectedCompletions(),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INTERNAL_ERROR', retryAfterSeconds: expect.any(Number) },
    });
    expect(await currentInFlight()).toBe(1);
  });

  it('compensates user allowance when every durable success response is lost after commit', async () => {
    const completionOutcomes: string[] = [];
    const actualAdmission = env.AI_ADMISSION;
    const responseLostEnv = {
      ...(env as unknown as Env),
      AI_ADMISSION: {
        idFromName: (name: string) => actualAdmission.idFromName(name),
        get: (id: DurableObjectId) => {
          const actual = actualAdmission.get(id);
          return {
            fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
              if (new URL(String(input)).pathname !== '/complete' || typeof init?.body !== 'string') {
                return actual.fetch(input, init);
              }
              const outcome = (JSON.parse(init.body) as { outcome: string }).outcome;
              completionOutcomes.push(outcome);
              const response = await actual.fetch(input, init);
              if (outcome === 'success') throw new Error('success completion response lost after durable commit');
              return response;
            },
          };
        },
      } as unknown as DurableObjectNamespace,
    };

    const response = await app().fetch(
      request('/v1/analyses', analysisRequest()),
      responseLostEnv,
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ error: { code: 'INTERNAL_ERROR', retryAfterSeconds: expect.any(Number) } });
    expect(JSON.stringify(body)).not.toContain('analysis');
    expect(completionOutcomes).toEqual(['success', 'success', 'success', 'caller_error']);
    await runInDurableObject(admissionStub(), (_instance, state) => {
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM inflight').one().count).toBe(0);
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM success_receipt').one().count).toBe(0);
      expect(state.storage.sql.exec<{ total: number | null }>('SELECT SUM(count) AS total FROM plan_usage').one().total ?? 0).toBe(0);
      expect(state.storage.sql.exec<{ total: number | null }>('SELECT SUM(provider_units) AS total FROM daily_budget').one().total ?? 0).toBe(3);
    });
  });

  it('returns retryable accounting failure when provider-failure completion cannot be confirmed', async () => {
    const response = await app({
      analyze: async () => { throw new ProviderUnavailableError(); },
      craftResponse: validProvider().craftResponse,
    }).fetch(request('/v1/analyses', analysisRequest()), envWithRejectedCompletions());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INTERNAL_ERROR', retryAfterSeconds: expect.any(Number) },
    });
    expect(await currentInFlight()).toBe(1);
  });

  it('returns a content-free 80 percent budget warning header and metric', async () => {
    const day = new Date().toISOString().slice(0, 10);
    await runInDurableObject(admissionStub(), (_instance, state) => {
      state.storage.sql.exec('INSERT INTO daily_budget (day, provider_units) VALUES (?, ?)', day, 1_039_997);
    });
    const metrics: import('../src/metrics').SafeMetric[] = [];
    const response = await createApp({
      provider: validProvider(),
      logger: { info: (metric) => { metrics.push(metric); } },
      rateLimitSecret: 'test-only-rate-key',
    }).fetch(request('/v1/analyses', analysisRequest()), env as unknown as Env);

    expect(response.status).toBe(200);
    expect(response.headers.get('x-provider-budget-warning')).toBe('at-least-80');
    expect(metrics[0]).toMatchObject({ budgetWarning: 'at-least-80' });
    expect(JSON.stringify(metrics[0])).not.toMatch(/installation|message|content|requestId/i);
  });

  it('holds exactly one lease during provider work and releases it after success', async () => {
    const entered = deferred();
    const finish = deferred();
    const pending = app({
      analyze: async () => {
        entered.resolve();
        await finish.promise;
        return analysis;
      },
      craftResponse: validProvider().craftResponse,
    }).fetch(request('/v1/analyses', analysisRequest()), env as unknown as Env);

    await entered.promise;
    expect(await currentInFlight()).toBe(1);
    finish.resolve();
    expect((await pending).status).toBe(200);
    expect(await currentInFlight()).toBe(0);
  });

  it('rejects a pre-aborted request before body parsing or accounting work', async () => {
    const controller = new AbortController();
    controller.abort();
    let providerCalled = false;
    const provider: AiProvider = {
      analyze: async () => {
        providerCalled = true;
        return analysis;
      },
      craftResponse: validProvider().craftResponse,
    };

    const response = await app(provider).fetch(request('/v1/analyses', analysisRequest(), {
      signal: controller.signal,
    }), env as unknown as Env);

    expect(response.status).toBe(408);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'INVALID_REQUEST' } });
    expect(providerCalled).toBe(false);
    await runInDurableObject(admissionStub(), (_instance, state) => {
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM inflight').one().count).toBe(0);
      expect(state.storage.sql.exec<{ total: number | null }>('SELECT SUM(count) AS total FROM plan_usage').one().total ?? 0).toBe(0);
      expect(state.storage.sql.exec<{ total: number | null }>('SELECT SUM(provider_units) AS total FROM daily_budget').one().total ?? 0).toBe(0);
    });
  });

  it('fully compensates a proven abort after reservation but before provider invocation', async () => {
    const controller = new AbortController();
    let providerCalled = false;
    let reserveCalls = 0;
    const completionOutcomes: string[] = [];
    const actualAdmission = env.AI_ADMISSION;
    const observedEnv = {
      ...(env as unknown as Env),
      AI_ADMISSION: {
        idFromName: (name: string) => actualAdmission.idFromName(name),
        get: (id: DurableObjectId) => {
          const actual = actualAdmission.get(id);
          return {
            fetch: (input: RequestInfo | URL, init?: RequestInit) => {
              const pathname = new URL(String(input)).pathname;
              if (pathname === '/reserve') reserveCalls += 1;
              if (pathname === '/complete' && typeof init?.body === 'string') {
                completionOutcomes.push((JSON.parse(init.body) as { outcome: string }).outcome);
              }
              return actual.fetch(input, init);
            },
          };
        },
      } as unknown as DurableObjectNamespace,
    };
    const response = await createApp({
      provider: {
        analyze: async () => {
          providerCalled = true;
          return analysis;
        },
        craftResponse: validProvider().craftResponse,
      },
      logger: { info: () => undefined },
      rateLimitSecret: 'test-only-rate-key',
      entitlementResolver: async () => {
        controller.abort();
        return { plan: 'free', cache: 'hit' };
      },
    }).fetch(request('/v1/analyses', analysisRequest(), { signal: controller.signal }), observedEnv);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
    expect(reserveCalls).toBe(1);
    expect(completionOutcomes).toEqual(['pre_provider_abort']);
    expect(providerCalled).toBe(false);
    await runInDurableObject(admissionStub(), (_instance, state) => {
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM inflight').one().count).toBe(0);
      expect(state.storage.sql.exec<{ total: number | null }>('SELECT SUM(count) AS total FROM plan_usage').one().total ?? 0).toBe(0);
      expect(state.storage.sql.exec<{ total: number | null }>('SELECT SUM(provider_units) AS total FROM daily_budget').one().total ?? 0).toBe(0);
    });
  });

  it('refunds analysis allowance but retains provider cost when the caller aborts during invoked work', async () => {
    const controller = new AbortController();
    const entered = deferred();
    const providerResult = deferredValue<AnalysisResult>();
    const pending = app({
      analyze: async () => {
        entered.resolve();
        return providerResult.promise;
      },
      craftResponse: validProvider().craftResponse,
    }).fetch(request('/v1/analyses', analysisRequest(), { signal: controller.signal }), env as unknown as Env);

    await entered.promise;
    expect(await currentInFlight()).toBe(1);
    controller.abort();
    providerResult.resolve(analysis);
    const response = await pending;

    expect(response.status).toBe(408);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'INVALID_REQUEST' } });
    await runInDurableObject(admissionStub(), (_instance, state) => {
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM inflight').one().count).toBe(0);
      expect(state.storage.sql.exec<{ total: number | null }>('SELECT SUM(count) AS total FROM plan_usage').one().total ?? 0).toBe(0);
      expect(state.storage.sql.exec<{ total: number | null }>('SELECT SUM(provider_units) AS total FROM daily_budget').one().total ?? 0).toBe(3);
    });
  });

  it('refunds response allowance but retains provider cost when the caller aborts during invoked work', async () => {
    const controller = new AbortController();
    const entered = deferred();
    const providerResult = deferredValue<{ id: string; text: string; hint: string }>();
    const input: CraftResponseRequest = {
      schemaVersion: 1,
      consentVersion: '2026-08-07.2',
      installationToken,
      sender: 'Person A',
      goal: 'resolve',
      tone: 'empathetic',
      analysis,
    };
    const pending = app({
      analyze: validProvider().analyze,
      craftResponse: async () => {
        entered.resolve();
        return providerResult.promise;
      },
    }).fetch(request('/v1/responses', input, { signal: controller.signal }), env as unknown as Env);

    await entered.promise;
    expect(await currentInFlight()).toBe(1);
    controller.abort();
    providerResult.resolve({ id: 'must-not-deliver', text: 'This draft must not be delivered.', hint: 'Do not deliver.' });
    const response = await pending;
    const body = await response.json();

    expect(response.status).toBe(408);
    expect(body).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
    expect(JSON.stringify(body)).not.toContain('must-not-deliver');
    await runInDurableObject(admissionStub(), (_instance, state) => {
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM inflight').one().count).toBe(0);
      expect(state.storage.sql.exec<{ total: number | null }>('SELECT SUM(count) AS total FROM plan_usage').one().total ?? 0).toBe(0);
      expect(state.storage.sql.exec<{ total: number | null }>('SELECT SUM(provider_units) AS total FROM daily_budget').one().total ?? 0).toBe(1);
    });
  });

  it('compensates a caller abort triggered while success accounting is in flight', async () => {
    const controller = new AbortController();
    const completionOutcomes: string[] = [];
    const actualAdmission = env.AI_ADMISSION;
    const observedEnv = {
      ...(env as unknown as Env),
      AI_ADMISSION: {
        idFromName: (name: string) => actualAdmission.idFromName(name),
        get: (id: DurableObjectId) => {
          const actual = actualAdmission.get(id);
          return {
            fetch: (input: RequestInfo | URL, init?: RequestInit) => {
              if (new URL(String(input)).pathname === '/complete' && typeof init?.body === 'string') {
                const outcome = (JSON.parse(init.body) as { outcome: string }).outcome;
                completionOutcomes.push(outcome);
                if (outcome === 'success') controller.abort();
              }
              return actual.fetch(input, init);
            },
          };
        },
      } as unknown as DurableObjectNamespace,
    };

    const response = await app().fetch(request('/v1/analyses', analysisRequest(), {
      signal: controller.signal,
    }), observedEnv);
    const body = await response.json();

    expect(response.status).toBe(408);
    expect(body).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
    expect(JSON.stringify(body)).not.toContain('analysis');
    expect(completionOutcomes).toEqual(['success', 'caller_error']);
    await runInDurableObject(admissionStub(), (_instance, state) => {
      expect(state.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM inflight').one().count).toBe(0);
      expect(state.storage.sql.exec<{ total: number | null }>('SELECT SUM(count) AS total FROM plan_usage').one().total ?? 0).toBe(0);
      expect(state.storage.sql.exec<{ total: number | null }>('SELECT SUM(provider_units) AS total FROM daily_budget').one().total ?? 0).toBe(3);
    });
  });

  it('releases the lease when provider cancellation surfaces as an abort', async () => {
    const response = await app({
      analyze: async () => { throw new DOMException('cancelled', 'AbortError'); },
      craftResponse: validProvider().craftResponse,
    }).fetch(request('/v1/analyses', analysisRequest()), env as unknown as Env);

    expect(response.status).toBe(502);
    expect(await currentInFlight()).toBe(0);
  });

  it('returns SERVICE_BUSY with a matching positive Retry-After without calling the provider', async () => {
    const expiresAt = Date.now() + 60_000;
    await runInDurableObject(admissionStub(), (_instance, state) => {
      for (let index = 0; index < 100; index += 1) {
        state.storage.sql.exec('INSERT INTO inflight (lease_id, expires_at) VALUES (?, ?)', `seed-${index}`, expiresAt);
      }
    });
    let providerCalled = false;
    const response = await app({
      analyze: async () => {
        providerCalled = true;
        return analysis;
      },
      craftResponse: validProvider().craftResponse,
    }).fetch(request('/v1/analyses', analysisRequest()), env as unknown as Env);
    const body = await response.json() as { error: { code: string; retryAfterSeconds: number } };

    expect(response.status).toBe(503);
    expect(body.error.code).toBe('SERVICE_BUSY');
    expect(body.error.retryAfterSeconds).toBeGreaterThan(0);
    expect(response.headers.get('Retry-After')).toBe(String(body.error.retryAfterSeconds));
    expect(providerCalled).toBe(false);
  });

  it('returns PLAN_LIMIT_REACHED with Retry-After and stores only the HMAC subject', async () => {
    const subjectDigest = await deriveAdmissionSubjectDigest(installationToken, 'installation', 'test-only-rate-key');
    const period = `free:${new Date().toISOString().slice(0, 10)}`;
    await runInDurableObject(admissionStub(), (_instance, state) => {
      state.storage.sql.exec(
        'INSERT INTO plan_usage (subject_digest, period, route, count) VALUES (?, ?, ?, ?)',
        subjectDigest,
        period,
        '/v1/analyses',
        3,
      );
    });
    const response = await app().fetch(request('/v1/analyses', analysisRequest()), env as unknown as Env);
    const body = await response.json() as { error: { code: string; retryAfterSeconds: number } };

    expect(response.status).toBe(429);
    expect(body.error.code).toBe('PLAN_LIMIT_REACHED');
    expect(response.headers.get('Retry-After')).toBe(String(body.error.retryAfterSeconds));
    expect(body.error.retryAfterSeconds).toBeGreaterThan(0);
    await runInDurableObject(admissionStub(), (_instance, state) => {
      const rows = state.storage.sql.exec<{ subject_digest: string }>('SELECT subject_digest FROM plan_usage').toArray();
      expect(rows.every((row) => /^[a-f0-9]{64}$/.test(row.subject_digest))).toBe(true);
      expect(JSON.stringify(rows)).not.toContain(installationToken);
    });
  });

  it('returns DAILY_BUDGET_REACHED before provider work at the Free reserve threshold', async () => {
    const day = new Date().toISOString().slice(0, 10);
    await runInDurableObject(admissionStub(), (_instance, state) => {
      state.storage.sql.exec('INSERT INTO daily_budget (day, provider_units) VALUES (?, ?)', day, 1_234_997);
    });
    let providerCalled = false;
    const response = await app({
      analyze: async () => {
        providerCalled = true;
        return analysis;
      },
      craftResponse: validProvider().craftResponse,
    }).fetch(request('/v1/analyses', analysisRequest()), env as unknown as Env);
    const body = await response.json() as { error: { code: string; retryAfterSeconds: number } };

    expect(response.status).toBe(503);
    expect(body.error.code).toBe('DAILY_BUDGET_REACHED');
    expect(response.headers.get('Retry-After')).toBe(String(body.error.retryAfterSeconds));
    expect(providerCalled).toBe(false);
  });

  it('allows native requests, allowlists web origins, and varies CORS by Origin', async () => {
    const allowed = await app().fetch(request('/v1/analyses', analysisRequest(), { headers: { Origin: 'https://avinashamanchi.github.io' } }), env as unknown as Env);
    const rejected = await app().fetch(request('/v1/analyses', analysisRequest(), { headers: { Origin: 'https://evil.example' } }), env as unknown as Env);

    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://avinashamanchi.github.io');
    expect(rejected.headers.get('access-control-allow-origin')).toBeNull();
    expect(allowed.headers.get('vary')).toBe('Origin');
  });

  it('only grants successful CORS preflight to known routes', async () => {
    const known = await app().fetch(new Request('https://proxy.example/v1/analyses', {
      method: 'OPTIONS', headers: { Origin: 'https://avinashamanchi.github.io' },
    }), env as unknown as Env);
    const unknown = await app().fetch(new Request('https://proxy.example/v1/nope', {
      method: 'OPTIONS', headers: { Origin: 'https://avinashamanchi.github.io' },
    }), env as unknown as Env);

    expect(known.status).toBe(204);
    expect(known.headers.get('access-control-allow-origin')).toBe('https://avinashamanchi.github.io');
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('returns a response draft from POST /v1/responses', async () => {
    const input: CraftResponseRequest = {
      schemaVersion: 1,
      consentVersion: '2026-08-07.2',
      installationToken,
      sender: 'Person A',
      goal: 'resolve',
      tone: 'empathetic',
      analysis,
    };

    const response = await app().fetch(request('/v1/responses', input), env as unknown as Env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ response: { id: 'draft-1' }, requestId: expect.any(String) });
  });

  it('passes only the minimized anonymous DTO to the craft provider', async () => {
    let received: unknown;
    const input: CraftResponseRequest = {
      schemaVersion: 1,
      consentVersion: '2026-08-07.2',
      installationToken,
      sender: 'Person A',
      goal: 'resolve',
      tone: 'empathetic',
      analysis,
    };
    const provider: AiProvider = {
      analyze: validProvider().analyze,
      craftResponse: async (value) => {
        received = value;
        return validProvider().craftResponse(value);
      },
    };

    const response = await app(provider).fetch(request('/v1/responses', input), env as unknown as Env);

    expect(response.status).toBe(200);
    expect(received).toEqual({
      sender: input.sender,
      goal: input.goal,
      tone: input.tone,
      analysis: {
        intensityScore: analysis.intensityScore,
        conflictMode: analysis.conflictMode,
        messages: analysis.messages,
      },
    });
    expect(JSON.stringify(received)).not.toContain(installationToken);
    expect(JSON.stringify(received)).not.toContain('consentVersion');
    expect(JSON.stringify(received)).not.toContain('schemaVersion');
    expect(JSON.stringify(received)).not.toContain('mode');
  });

  it('keeps analysis and response limits in independent route buckets', async () => {
    const routeToken = 'route-bucket-installation-token';
    const routeHeaders = { 'CF-Connecting-IP': '192.0.2.88' };
    const input: CraftResponseRequest = {
      schemaVersion: 1, consentVersion: '2026-08-07.2', installationToken: routeToken, sender: 'Person A', goal: 'resolve', tone: 'empathetic', analysis,
    };
    for (let index = 0; index < 3; index += 1) {
      expect((await app().fetch(request('/v1/analyses', analysisRequest({ installationToken: routeToken }), { headers: routeHeaders }), env as unknown as Env)).status).toBe(200);
    }
    for (let index = 0; index < 6; index += 1) {
      expect((await app().fetch(request('/v1/responses', input, { headers: routeHeaders }), env as unknown as Env)).status).toBe(200);
    }
  });
});
