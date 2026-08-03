import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

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
    consentVersion: '2026-08-02',
    installationToken,
    messages: [{ sender: 'Person A', text: 'Please listen to me.' }],
    ...overrides,
  };
}

describe('AI proxy routes', () => {
  it('returns a validated analysis from POST /v1/analyses', async () => {
    const response = await app().fetch(request('/v1/analyses', analysisRequest()), env as unknown as Env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ analysis, requestId: expect.any(String) });
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

  it('accepts 1,000 Unicode code points even when UTF-8 uses more bytes', async () => {
    const response = await app().fetch(request('/v1/analyses', analysisRequest({
      messages: [{ sender: 'Person A', text: '🫠'.repeat(1_000) }],
    })), env as unknown as Env);

    expect(response.status).toBe(200);
  });

  it('requires an installation token and the current consent version', async () => {
    const invalidToken = await app().fetch(request('/v1/analyses', analysisRequest({ installationToken: 'short' })), env as unknown as Env);
    const oldConsent = await app().fetch(request('/v1/analyses', analysisRequest({ consentVersion: 'old-consent' })), env as unknown as Env);

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
  });

  it('maps provider timeouts to a retryable safe public error', async () => {
    const response = await app({
      analyze: async () => { throw new DOMException('slow', 'TimeoutError'); },
      craftResponse: validProvider().craftResponse,
    }).fetch(request('/v1/analyses', analysisRequest()), env as unknown as Env);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'PROVIDER_UNAVAILABLE' } });
  });

  it('maps upstream provider outages to a retryable safe public error', async () => {
    const response = await app({
      analyze: async () => { throw new ProviderUnavailableError(); },
      craftResponse: validProvider().craftResponse,
    }).fetch(request('/v1/analyses', analysisRequest()), env as unknown as Env);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'PROVIDER_UNAVAILABLE' } });
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
      consentVersion: '2026-08-02',
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
      consentVersion: '2026-08-02',
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
      schemaVersion: 1, consentVersion: '2026-08-02', installationToken: routeToken, sender: 'Person A', goal: 'resolve', tone: 'empathetic', analysis,
    };
    for (let index = 0; index < 10; index += 1) {
      expect((await app().fetch(request('/v1/analyses', analysisRequest({ installationToken: routeToken }), { headers: routeHeaders }), env as unknown as Env)).status).toBe(200);
    }
    for (let index = 0; index < 20; index += 1) {
      expect((await app().fetch(request('/v1/responses', input, { headers: routeHeaders }), env as unknown as Env)).status).toBe(200);
    }
  });
});
