import { describe, expect, it } from 'vitest';

import { ProviderInvalidResponseError, ProviderUnavailableError } from '../src/errors';
import { createGroqProvider, readBoundedResponse, type ProviderCraftInput } from '../src/provider';

const craftInput: ProviderCraftInput = {
  sender: 'Person A',
  goal: 'resolve',
  tone: 'empathetic',
  analysis: {
    intensityScore: 42,
    conflictMode: 'Collaborating',
    messages: [{
      sender: 'Person A',
      text: 'Please listen to me.',
      pattern: 'Neutral',
      egoState: 'Adult',
      possibleInterpretation: 'This may be an attempt to be heard.',
    }],
  },
};

type Settlement =
  | { status: 'fulfilled'; value: unknown }
  | { status: 'rejected'; error: unknown }
  | { status: 'timeout' };

function settleWithin(promise: Promise<unknown>, timeoutMs = 30): Promise<Settlement> {
  return Promise.race([
    promise.then(
      (value): Settlement => ({ status: 'fulfilled', value }),
      (error): Settlement => ({ status: 'rejected', error }),
    ),
    new Promise<Settlement>((resolve) => setTimeout(() => resolve({ status: 'timeout' }), timeoutMs)),
  ]);
}

describe('Groq adapter response validation', () => {
  it('maps malformed upstream HTTP JSON to an invalid provider response', async () => {
    const provider = createGroqProvider('test-only-key', async () => new Response(null, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    await expect(provider.analyze([{ sender: 'Person A', text: 'hello' }])).rejects.toBeInstanceOf(ProviderInvalidResponseError);
  });

  it('maps malformed provider content JSON to an invalid provider response', async () => {
    const provider = createGroqProvider('test-only-key', async () => Response.json({
      choices: [{ message: { content: '{not json' } }],
    }));

    await expect(provider.analyze([{ sender: 'Person A', text: 'hello' }])).rejects.toBeInstanceOf(ProviderInvalidResponseError);
  });

  it('uses the current Groq completion-token field and sends only the minimal craft DTO', async () => {
    let outbound: Record<string, unknown> | undefined;
    const provider = createGroqProvider('test-only-key', async (_url, init) => {
      outbound = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        choices: [{ message: { content: JSON.stringify({ id: 'draft-1', text: 'Let us talk.', hint: 'Stay calm.' }) } }],
      });
    });

    await provider.craftResponse(craftInput);

    expect(outbound).toMatchObject({ max_completion_tokens: 700 });
    expect(outbound).not.toHaveProperty('max_tokens');
    const messages = outbound?.messages as Array<{ role: string; content: string }>;
    const userPayload = JSON.parse(messages.find((message) => message.role === 'user')?.content ?? '{}') as Record<string, unknown>;
    expect(userPayload).toMatchObject(craftInput);
    expect(userPayload).not.toHaveProperty('installationToken');
    expect(userPayload).not.toHaveProperty('consentVersion');
    expect(userPayload).not.toHaveProperty('schemaVersion');
    expect(userPayload.analysis).not.toHaveProperty('mode');
  });

  it('keeps the deadline active while reading a stalled successful response body', async () => {
    const body = new ReadableStream<Uint8Array>({ start() { /* deliberately never closes */ } });
    const provider = createGroqProvider(
      'test-only-key',
      async () => new Response(body, { status: 200 }),
      { timeoutMs: 10 },
    );

    await expect(provider.analyze([{ sender: 'Person A', text: 'hello' }])).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it('rejects an oversized upstream response without buffering it completely', async () => {
    let cancelled = false;
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(40));
      },
      cancel() { cancelled = true; },
    });
    const provider = createGroqProvider(
      'test-only-key',
      async () => new Response(body, { status: 200 }),
      { maxResponseBytes: 64 },
    );

    await expect(provider.analyze([{ sender: 'Person A', text: 'hello' }])).rejects.toBeInstanceOf(ProviderInvalidResponseError);
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(3);
  });

  it('never waits for an uncooperative cancel on HTTP errors or oversized bodies', async () => {
    const neverCancel = () => new Promise<void>(() => undefined);
    const httpErrorBody = new ReadableStream<Uint8Array>({ cancel: neverCancel });
    const provider = createGroqProvider(
      'test-only-key',
      async () => new Response(httpErrorBody, { status: 503 }),
      { timeoutMs: 10 },
    );

    const httpError = await settleWithin(provider.analyze([{ sender: 'Person A', text: 'hello' }]));

    const declaredBody = new ReadableStream<Uint8Array>({ cancel: neverCancel });
    const declared = await settleWithin(readBoundedResponse(
      new Response(declaredBody, { headers: { 'content-length': '65' } }),
      new AbortController().signal,
      64,
    ));

    const streamedBody = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(65)); },
      cancel: neverCancel,
    });
    const streamed = await settleWithin(readBoundedResponse(
      new Response(streamedBody),
      new AbortController().signal,
      64,
    ));

    expect(httpError).toMatchObject({ status: 'rejected', error: expect.any(ProviderUnavailableError) });
    expect(declared).toMatchObject({ status: 'rejected', error: expect.any(ProviderInvalidResponseError) });
    expect(streamed).toMatchObject({ status: 'rejected', error: expect.any(ProviderInvalidResponseError) });
  });
});
