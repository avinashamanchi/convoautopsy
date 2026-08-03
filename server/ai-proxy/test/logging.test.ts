import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { createApp, type AiProvider, type Env } from '../src/index';

const CONTENT_MARKER = 'MARKER_CONVERSATION_CONTENT_DO_NOT_LOG';
const PROVIDER_MARKER = 'MARKER_PROVIDER_CONTENT_DO_NOT_LOG';
const token = 'installation-token-which-is-long-enough';

describe('privacy-safe logging', () => {
  it('does not log request or provider content on success or failure', async () => {
    const records: unknown[] = [];
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
    const app = createApp({ provider, logger: { info: (record) => records.push(record) }, rateLimitSecret: 'test-only-rate-key' });
    const analysisResponse = await app.fetch(new Request('https://proxy.example/v1/analyses', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ schemaVersion: 1, consentVersion: '2026-08-02', installationToken: token, messages: [{ sender: 'Person A', text: CONTENT_MARKER }] }),
    }), env as unknown as Env);
    const responseResponse = await app.fetch(new Request('https://proxy.example/v1/responses', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 1, consentVersion: '2026-08-02', installationToken: token, sender: 'Person A', goal: 'resolve', tone: 'empathetic',
        analysis: { schemaVersion: 1, mode: 'ai', intensityScore: 1, conflictMode: 'Avoiding', messages: [{ sender: 'Person A', text: CONTENT_MARKER, pattern: 'Neutral', egoState: 'Adult', possibleInterpretation: 'ok' }] },
      }),
    }), env as unknown as Env);

    const analysisBody = await analysisResponse.json() as { requestId: string };
    expect(analysisResponse.status).toBe(200);
    expect(responseResponse.status).toBe(502);
    const serialized = JSON.stringify(records);
    expect(serialized).not.toContain(CONTENT_MARKER);
    expect(serialized).not.toContain(PROVIDER_MARKER);
    expect(records).toEqual(expect.arrayContaining([expect.objectContaining({ requestId: analysisBody.requestId })]));
    expect(records).toEqual(expect.arrayContaining([expect.objectContaining({ route: '/v1/analyses', status: 200 }), expect.objectContaining({ route: '/v1/responses', status: 502, code: 'PROVIDER_INVALID_RESPONSE' })]));
  });
});
