import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { createApp, type AiProvider, type Env } from '../src/index';
import type { SafeMetric } from '../src/metrics';

const CONTENT_MARKER = 'MARKER_CONVERSATION_CONTENT_DO_NOT_LOG';
const PROVIDER_MARKER = 'MARKER_PROVIDER_CONTENT_DO_NOT_LOG';
const REVENUECAT_ID_MARKER = '$RCAnonymousID:MARKER_REVENUECAT_ID_DO_NOT_LOG';
const token = 'installation-token-which-is-long-enough';

describe('privacy-safe logging', () => {
  it('emits a frozen exact-key metric and keeps its request ID in a separate logger argument', async () => {
    const records: Array<{ metric: SafeMetric; requestId: string }> = [];
    const provider: AiProvider = {
      analyze: async () => ({
        schemaVersion: 1,
        mode: 'ai',
        intensityScore: 1,
        conflictMode: 'Avoiding',
        messages: [{ sender: 'Person A', text: CONTENT_MARKER, pattern: 'Neutral', egoState: 'Adult', possibleInterpretation: PROVIDER_MARKER }],
      }),
      craftResponse: async () => { throw new Error(PROVIDER_MARKER); },
    };
    const app = createApp({
      provider,
      logger: { info: (metric, requestId) => { records.push({ metric, requestId }); } },
      rateLimitSecret: 'test-only-rate-key',
    });
    const analysisResponse = await app.fetch(new Request('https://proxy.example/v1/analyses', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ schemaVersion: 1, consentVersion: '2026-08-07', installationToken: token, revenueCatAppUserId: REVENUECAT_ID_MARKER, messages: [{ sender: 'Person A', text: CONTENT_MARKER }] }),
    }), env as unknown as Env);
    const responseResponse = await app.fetch(new Request('https://proxy.example/v1/responses', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 1, consentVersion: '2026-08-07', installationToken: token, sender: 'Person A', goal: 'resolve', tone: 'empathetic',
        analysis: { schemaVersion: 1, mode: 'ai', intensityScore: 1, conflictMode: 'Avoiding', messages: [{ sender: 'Person A', text: CONTENT_MARKER, pattern: 'Neutral', egoState: 'Adult', possibleInterpretation: 'ok' }] },
      }),
    }), env as unknown as Env);

    const analysisBody = await analysisResponse.json() as { requestId: string };
    expect(analysisResponse.status).toBe(200);
    expect(responseResponse.status).toBe(502);
    const serialized = JSON.stringify(records.map(({ metric }) => metric));
    expect(serialized).not.toContain(CONTENT_MARKER);
    expect(serialized).not.toContain(PROVIDER_MARKER);
    expect(serialized).not.toContain(REVENUECAT_ID_MARKER);
    expect(serialized).not.toMatch(/requestId|installationToken|revenueCat|message|goal|tone|header|error/i);
    expect(records[0].requestId).toBe(analysisBody.requestId);
    expect(records[0].metric).toEqual({
      route: '/v1/analyses',
      plan: 'free',
      statusClass: '2xx',
      latencyBucket: expect.any(String),
      bodySizeBucket: '<1KiB',
      providerUnitBucket: '3',
      inFlightBucket: '<10',
      entitlementCache: 'bypass',
      outcome: 'allowed',
    });
    expect(Object.keys(records[0].metric)).toEqual([
      'route',
      'plan',
      'statusClass',
      'latencyBucket',
      'bodySizeBucket',
      'providerUnitBucket',
      'inFlightBucket',
      'entitlementCache',
      'outcome',
    ]);
    expect(Object.isFrozen(records[0].metric)).toBe(true);
    expect(records[1].metric).toMatchObject({
      route: '/v1/responses',
      plan: 'free',
      statusClass: '5xx',
      bodySizeBucket: '<1KiB',
      providerUnitBucket: '1',
      inFlightBucket: '<10',
      entitlementCache: 'bypass',
      outcome: 'PROVIDER_INVALID_RESPONSE',
    });
  });

  it('never replaces a valid response when the operational logger throws', async () => {
    const provider: AiProvider = {
      analyze: async () => ({
        schemaVersion: 1,
        mode: 'ai',
        intensityScore: 1,
        conflictMode: 'Avoiding',
        messages: [{ sender: 'Person A', text: 'Safe output.', pattern: 'Neutral', egoState: 'Adult', possibleInterpretation: 'Safe interpretation.' }],
      }),
      craftResponse: async () => ({ id: 'draft', text: 'Safe draft.', hint: 'Safe hint.' }),
    };
    const app = createApp({
      provider,
      logger: { info: () => { throw new Error('logger unavailable'); } },
      rateLimitSecret: 'test-only-rate-key',
    });

    const response = await app.fetch(new Request('https://proxy.example/v1/analyses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 1,
        consentVersion: '2026-08-07',
        installationToken: 'logger-failure-token-long-enough',
        messages: [{ sender: 'Person A', text: 'Safe input.' }],
      }),
    }), env as unknown as Env);

    expect(response.status).toBe(200);
  });

  it('absorbs a rejected async logger without awaiting or replacing the response', async () => {
    let rejectLogger: ((reason?: unknown) => void) | undefined;
    const pendingThenable = {
      then(_resolve: () => void, reject: (reason?: unknown) => void) {
        rejectLogger = reject;
      },
    } as unknown as Promise<void>;
    const provider: AiProvider = {
      analyze: async () => ({
        schemaVersion: 1,
        mode: 'ai',
        intensityScore: 1,
        conflictMode: 'Avoiding',
        messages: [{ sender: 'Person A', text: 'Safe output.', pattern: 'Neutral', egoState: 'Adult', possibleInterpretation: 'Safe interpretation.' }],
      }),
      craftResponse: async () => ({ id: 'draft', text: 'Safe draft.', hint: 'Safe hint.' }),
    };
    const app = createApp({
      provider,
      logger: { info: () => pendingThenable },
      rateLimitSecret: 'test-only-rate-key',
    });

    const response = await app.fetch(new Request('https://proxy.example/v1/analyses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 1,
        consentVersion: '2026-08-07',
        installationToken: 'async-logger-token-long-enough',
        messages: [{ sender: 'Person A', text: 'Safe input.' }],
      }),
    }), env as unknown as Env);
    await Promise.resolve();

    expect(response.status).toBe(200);
    expect(rejectLogger).toEqual(expect.any(Function));
    rejectLogger?.(new Error('async logger unavailable'));
    await Promise.resolve();
  });

  it('records observed body sizes for every rejected body path', async () => {
    const metrics: SafeMetric[] = [];
    const app = createApp({
      logger: { info: (metric) => { metrics.push(metric); } },
      rateLimitSecret: 'test-only-rate-key',
    });

    const invalidJson = new Request('https://proxy.example/v1/analyses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(1_024),
    });
    const declaredOversize = new Request('https://proxy.example/v1/analyses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(128 * 1_024 + 1) },
      body: '{}',
    });
    const streamedOversize = new Request('https://proxy.example/v1/analyses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(128 * 1_024 + 1),
    });
    const noBody = new Request('https://proxy.example/v1/analyses', { method: 'POST' });

    for (const request of [invalidJson, declaredOversize, streamedOversize, noBody]) {
      await app.fetch(request, env as unknown as Env);
    }

    expect(metrics.map(({ outcome, bodySizeBucket }) => ({ outcome, bodySizeBucket }))).toEqual([
      { outcome: 'INVALID_REQUEST', bodySizeBucket: '<16KiB' },
      { outcome: 'PAYLOAD_TOO_LARGE', bodySizeBucket: '>128KiB' },
      { outcome: 'PAYLOAD_TOO_LARGE', bodySizeBucket: '>128KiB' },
      { outcome: 'INVALID_REQUEST', bodySizeBucket: '0' },
    ]);
  });
});
