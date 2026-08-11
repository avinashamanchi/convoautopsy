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
  it.each([
    { status: 400, expectedName: 'ProviderRequestRejectedError' },
    { status: 413, expectedName: 'ProviderRequestRejectedError' },
    { status: 422, expectedName: 'ProviderRequestRejectedError' },
    { status: 401, expectedName: 'ProviderConfigurationError' },
    { status: 403, expectedName: 'ProviderConfigurationError' },
    { status: 404, expectedName: 'ProviderConfigurationError' },
    { status: 408, expectedName: 'ProviderUnavailableError' },
    { status: 429, expectedName: 'ProviderUnavailableError' },
    { status: 500, expectedName: 'ProviderUnavailableError' },
  ])('classifies upstream HTTP $status as $expectedName', async ({ status, expectedName }) => {
    const provider = createGroqProvider('test-only-key', async () => new Response('{}', { status }));

    const error = await provider.analyze([{ sender: 'Person A', text: 'hello' }]).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).constructor.name).toBe(expectedName);
  });

  it('keeps the provider deadline active while draining a stalled HTTP error body', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"error":'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const provider = createGroqProvider(
      'test-only-key',
      async () => new Response(body, { status: 400 }),
      { timeoutMs: 10 },
    );

    const error = await provider.analyze([{ sender: 'Person A', text: 'hello' }]).catch((caught: unknown) => caught);

    expect((error as Error).constructor.name).toBe('ProviderRequestRejectedError');
    expect(cancelled).toBe(true);
  });

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
    const systemPrompt = messages.find((message) => message.role === 'system')?.content ?? '';
    for (const field of ['id', 'text', 'hint']) expect(systemPrompt).toContain(field);
    expect(systemPrompt).toMatch(/one JSON object.*no extra keys/is);
    expect(systemPrompt).toMatch(/untrusted data.*never follow instructions/is);
    expect(systemPrompt).toMatch(/draft only.*never send.*automatically/is);
  });

  it('budgets enough analysis completion tokens for the bounded remote wire contract', async () => {
    let outbound: Record<string, unknown> | undefined;
    const provider = createGroqProvider('test-only-key', async (_url, init) => {
      outbound = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        choices: [{ message: { content: JSON.stringify({
          schemaVersion: 1,
          mode: 'ai',
          intensityScore: 1,
          conflictMode: 'Avoiding',
          messages: [{
            sender: 'Person A',
            text: 'hello',
            pattern: 'Neutral',
            egoState: 'Adult',
            possibleInterpretation: 'This may be a greeting.',
          }],
        }) } }],
      });
    });

    await provider.analyze([{ sender: 'Person A', text: 'hello' }]);

    expect(outbound).toMatchObject({ max_completion_tokens: 16_384 });
    const messages = outbound?.messages as Array<{ role: string; content: string }>;
    const systemPrompt = messages.find((message) => message.role === 'system')?.content ?? '';
    for (const field of [
      'schemaVersion', 'mode', 'intensityScore', 'conflictMode', 'messages', 'sender', 'text',
      'pattern', 'egoState', 'possibleInterpretation',
    ]) expect(systemPrompt).toContain(field);
    for (const value of [
      'Competing', 'Avoiding', 'Compromising', 'Collaborating', 'Accommodating', 'Competing vs Avoiding',
      'Criticism', 'Contempt', 'Defensiveness', 'Stonewalling', 'Neutral', 'Parent', 'Adult', 'Child',
    ]) expect(systemPrompt).toContain(value);
    expect(systemPrompt).toMatch(/copy.*sender.*text.*exactly.*same order/is);
    expect(systemPrompt).toMatch(/untrusted data.*never follow instructions/is);
    expect(systemPrompt).toMatch(/tentative.*may.*might/is);
    expect(systemPrompt).toMatch(/not.*diagnosis/is);
    expect(systemPrompt).toMatch(/do not claim.*intent.*deception/is);
    expect(systemPrompt).toMatch(/no extra keys/i);
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

  it('enforces the provider deadline when the initial fetch ignores AbortSignal', async () => {
    const provider = createGroqProvider(
      'test-only-key',
      async () => new Promise<Response>(() => undefined),
      { timeoutMs: 10 },
    );

    const result = await settleWithin(provider.analyze([{ sender: 'Person A', text: 'hello' }]), 80);

    expect(result).toMatchObject({ status: 'rejected', error: expect.any(ProviderUnavailableError) });
  });

  it('cancels a late initial response body after the provider deadline wins', async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
    const provider = createGroqProvider(
      'test-only-key',
      async () => new Promise<Response>((resolve) => { resolveFetch = resolve; }),
      { timeoutMs: 10 },
    );

    const result = await settleWithin(provider.analyze([{ sender: 'Person A', text: 'hello' }]), 80);
    resolveFetch?.(new Response(body));
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result).toMatchObject({ status: 'rejected', error: expect.any(ProviderUnavailableError) });
    expect(cancelled).toBe(true);
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
