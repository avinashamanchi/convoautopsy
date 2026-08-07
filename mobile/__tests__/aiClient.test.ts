import { AiClientError, createAiClient, createResponseClient } from '../src/services/aiClient';
import type { AnalysisResult, ParsedMessage } from '../src/domain/analysis';
import { parseConversation } from '../src/domain/parser';
import { SECURE_STORAGE_UNAVAILABLE_MESSAGE, SecureStorageUnavailableError, type ConsentRecord } from '../src/services/consentStore';

const mockExpoFetch = jest.fn();
jest.mock('expo/fetch', () => ({ fetch: (...args: unknown[]) => mockExpoFetch(...args) }));

const consent: ConsentRecord = {
  version: '2026-08-07.2',
  grantedAt: '2026-08-07T12:00:00.000Z',
  provider: 'Groq',
};

const anonymousMessages: ParsedMessage[] = [
  { id: 'line-1', sender: 'Person A', text: 'Can we talk?', sourceLine: 1 },
  { id: 'line-2', sender: 'Person B', text: 'Not right now.', sourceLine: 2 },
];

const aiResult: AnalysisResult = {
  schemaVersion: 1,
  mode: 'ai',
  intensityScore: 12,
  conflictMode: 'Collaborating',
  messages: [
    { sender: 'Person A', text: 'Can we talk?', pattern: 'Neutral', egoState: 'Adult', possibleInterpretation: 'A possible interpretation.' },
    { sender: 'Person B', text: 'Not right now.', pattern: 'Neutral', egoState: 'Adult', possibleInterpretation: 'A possible interpretation.' },
  ],
};

const responseDraft = {
  id: 'reviewed-draft-1',
  text: 'Could we pause and return to this calmly?',
  hint: 'Review and edit before sending.',
};

function response(body: unknown, init: ResponseInit = {}) {
  const { headers, ...rest } = init;
  const responseHeaders = new Headers({ 'content-type': 'application/json', ...headers });
  const requestId = typeof body === 'object' && body !== null && !Array.isArray(body)
    ? ('requestId' in body ? body.requestId : 'error' in body && typeof body.error === 'object' && body.error !== null && 'requestId' in body.error ? body.error.requestId : null)
    : null;
  if (typeof requestId === 'string' && !responseHeaders.has('x-request-id')) responseHeaders.set('x-request-id', requestId);
  return new Response(JSON.stringify(body), { status: 200, ...rest, headers: responseHeaders });
}

function paddedJsonResponse(body: unknown, totalBytes: number, requestId: string) {
  const json = JSON.stringify(body);
  const byteLength = new TextEncoder().encode(json).byteLength;
  if (byteLength > totalBytes) throw new Error('fixture exceeds requested byte size');
  return new Response(`${json}${' '.repeat(totalBytes - byteLength)}`, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-length': String(totalBytes),
      'x-request-id': requestId,
    },
  });
}

function remoteMessages(count: number, text: string): ParsedMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `line-${index + 1}`,
    sender: `Person ${String.fromCharCode(65 + index)}`,
    text,
    sourceLine: index + 1,
  }));
}

type FetchMock = jest.Mock<Promise<Response>, [RequestInfo | URL, RequestInit?]>;
const noRevenueCatId = async () => '$RCAnonymousID:mobile-test';

function client(fetchImpl: FetchMock) {
  return createAiClient({
    endpoint: 'https://ai.example.test',
    fetch: fetchImpl,
    getConsent: async () => consent,
    getInstallationToken: async () => '4b479c21-5169-41b5-ba54-3d0c5bdb82ba',
    getRevenueCatAppUserId: async () => '$RCAnonymousID:mobile-test',
  });
}

async function expectCode(promise: Promise<unknown>, code: AiClientError['code']) {
  await expect(promise).rejects.toMatchObject({ code });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

it('sends only anonymous parsed Person labels with consent and a device token', async () => {
  const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(response({ analysis: aiResult, requestId: 'req-1' }));

  await expect(client(fetchImpl)(anonymousMessages, new AbortController().signal)).resolves.toEqual(aiResult);

  const requestBody = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
  expect(requestBody).toEqual({
    schemaVersion: 1,
    consentVersion: '2026-08-07.2',
    installationToken: '4b479c21-5169-41b5-ba54-3d0c5bdb82ba',
    revenueCatAppUserId: '$RCAnonymousID:mobile-test',
    messages: [
      { sender: 'Person A', text: 'Can we talk?' },
      { sender: 'Person B', text: 'Not right now.' },
    ],
  });
  expect(JSON.stringify(requestBody.messages)).not.toContain('Alex');
});

it('uses the Expo streaming fetch implementation for native analysis by default', async () => {
  const originalFetch = globalThis.fetch;
  const incompatibleGlobalFetch = jest.fn().mockRejectedValue(new Error('React Native global fetch has no response stream'));
  Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: incompatibleGlobalFetch });
  mockExpoFetch.mockResolvedValueOnce(response({ analysis: aiResult, requestId: 'req-expo-stream' }));
  const analyze = createAiClient({
    endpoint: 'https://ai.example.test',
    getConsent: async () => consent,
    getInstallationToken: async () => '4b479c21-5169-41b5-ba54-3d0c5bdb82ba',
    getRevenueCatAppUserId: async () => '$RCAnonymousID:mobile-test',
  });

  try {
    let result: AnalysisResult | undefined;
    let failure: unknown;
    try {
      result = await analyze(anonymousMessages, new AbortController().signal);
    } catch (error) {
      failure = error;
    }
    expect(mockExpoFetch).toHaveBeenCalledTimes(1);
    expect(incompatibleGlobalFetch).not.toHaveBeenCalled();
    expect(failure).toBeUndefined();
    expect(result).toEqual(aiResult);
  } finally {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: originalFetch });
    mockExpoFetch.mockReset();
  }
});

it('fails closed before fetch when billing identity is still unavailable', async () => {
  const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(response({ analysis: aiResult, requestId: 'req-free' }));
  const analyze = createAiClient({
    endpoint: 'https://ai.example.test',
    fetch: fetchImpl,
    getConsent: async () => consent,
    getInstallationToken: async () => '4b479c21-5169-41b5-ba54-3d0c5bdb82ba',
    getRevenueCatAppUserId: async () => null,
  });

  await expectCode(analyze(anonymousMessages, new AbortController().signal), 'NOT_CONFIGURED');
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('fails closed before fetch when billing identity lookup fails', async () => {
  const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(response({ analysis: aiResult, requestId: 'req-billing-failure' }));
  const analyze = createAiClient({
    endpoint: 'https://ai.example.test',
    fetch: fetchImpl,
    getConsent: async () => consent,
    getInstallationToken: async () => '4b479c21-5169-41b5-ba54-3d0c5bdb82ba',
    getRevenueCatAppUserId: async () => { throw new Error('billing unavailable'); },
  });

  await expectCode(analyze(anonymousMessages, new AbortController().signal), 'NOT_CONFIGURED');
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('never serializes known participant names found in accepted message bodies', async () => {
  const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(response({ analysis: aiResult, requestId: 'req-mentions' }));
  const parsed = parseConversation('Alex: Jordan, please call me\nJordan: Hi Alex\nthis rejected line mentions Alex');

  await client(fetchImpl)(parsed.messages, new AbortController().signal);

  const body = String(fetchImpl.mock.calls[0][1]?.body);
  expect(body).not.toMatch(/Alex|Jordan/i);
  expect(body).toContain('Person A');
  expect(body).toContain('Person B');
  expect(parsed.rejected[0].text).toContain('Alex');
});

it('rejects parsed messages that are not anonymous labels before making a request', async () => {
  const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  const namedMessage = [{ ...anonymousMessages[0], sender: 'Alex' }];

  await expectCode(client(fetchImpl)(namedMessage, new AbortController().signal), 'INVALID_RESPONSE');
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('rejects labels beyond Person Z before making a request', async () => {
  const fetchImpl = jest.fn();
  const outOfContractMessage = [{ ...anonymousMessages[0], sender: 'Person AA' }];

  await expectCode(client(fetchImpl)(outOfContractMessage, new AbortController().signal), 'INVALID_RESPONSE');
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('accepts the largest remote-analysis request of 10 messages and 280 Unicode code points each', async () => {
  const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>()
    .mockResolvedValue(response({ analysis: aiResult, requestId: 'req-largest-analysis' }));

  await expect(client(fetchImpl)(remoteMessages(10, '🧠'.repeat(280)), new AbortController().signal)).resolves.toEqual(aiResult);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it.each([
  ['an eleventh message', remoteMessages(11, 'ok')],
  ['a 281-code-point message', remoteMessages(1, '🧠'.repeat(281))],
] as const)('rejects %s before consent, identity, quota, or fetch work', async (_case, messages) => {
  const getConsent = jest.fn(async () => consent);
  const getInstallationToken = jest.fn(async () => '4b479c21-5169-41b5-ba54-3d0c5bdb82ba');
  const getRevenueCatAppUserId = jest.fn(async () => '$RCAnonymousID:mobile-test');
  const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>()
    .mockResolvedValue(response({ analysis: aiResult, requestId: 'req-must-not-run' }));
  const analyze = createAiClient({
    endpoint: 'https://ai.example.test',
    fetch: fetchImpl,
    getConsent,
    getInstallationToken,
    getRevenueCatAppUserId,
  });

  await expectCode(analyze(messages, new AbortController().signal), 'INVALID_RESPONSE');
  expect(getConsent).not.toHaveBeenCalled();
  expect(getInstallationToken).not.toHaveBeenCalled();
  expect(getRevenueCatAppUserId).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('maps a network rejection to OFFLINE without exposing the transport error', async () => {
  const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockRejectedValue(new Error('network details: do not expose'));

  await expectCode(client(fetchImpl)(anonymousMessages, new AbortController().signal), 'OFFLINE');
});

it('maps caller cancellation to CANCELLED', async () => {
  const controller = new AbortController();
  controller.abort();
  const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();

  await expectCode(client(fetchImpl)(anonymousMessages, controller.signal), 'CANCELLED');
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('does not fetch after cancellation while consent lookup is pending', async () => {
  const consentLookup = deferred<ConsentRecord | null>();
  const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  const analyze = createAiClient({ endpoint: 'https://ai.example.test', fetch: fetchImpl, getConsent: () => consentLookup.promise, getInstallationToken: async () => 'token', getRevenueCatAppUserId: noRevenueCatId });
  const controller = new AbortController();
  const request = analyze(anonymousMessages, controller.signal);

  controller.abort();
  consentLookup.resolve(consent);

  await expectCode(request, 'CANCELLED');
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('does not fetch after cancellation while secure token lookup is pending', async () => {
  const tokenLookup = deferred<string>();
  const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  const analyze = createAiClient({ endpoint: 'https://ai.example.test', fetch: fetchImpl, getConsent: async () => consent, getInstallationToken: () => tokenLookup.promise, getRevenueCatAppUserId: noRevenueCatId });
  const controller = new AbortController();
  const request = analyze(anonymousMessages, controller.signal);

  controller.abort();
  tokenLookup.resolve('4b479c21-5169-41b5-ba54-3d0c5bdb82ba');

  await expectCode(request, 'CANCELLED');
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('preserves the secure-storage error without attempting a request', async () => {
  const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  const analyze = createAiClient({
    endpoint: 'https://ai.example.test',
    fetch: fetchImpl,
    getConsent: async () => consent,
    getInstallationToken: async () => { throw new SecureStorageUnavailableError(); },
    getRevenueCatAppUserId: noRevenueCatId,
  });

  await expect(analyze(anonymousMessages, new AbortController().signal)).rejects.toThrow(SECURE_STORAGE_UNAVAILABLE_MESSAGE);
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('maps a 20-second abort to TIMEOUT', async () => {
  jest.useFakeTimers();
  const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>((_input, init) => new Promise((_resolve, reject) => {
    (init?.signal as AbortSignal).addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  }));
  const request = client(fetchImpl)(anonymousMessages, new AbortController().signal);
  const expectation = expectCode(request, 'TIMEOUT');

  await jest.advanceTimersByTimeAsync(20_000);
  await expectation;
  jest.useRealTimers();
});

it('times out and aborts a fetch implementation that ignores AbortSignal', async () => {
  jest.useFakeTimers();
  let requestSignal: AbortSignal | undefined;
  const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>((_input, init) => {
    requestSignal = init?.signal as AbortSignal;
    return new Promise<Response>(() => undefined);
  });
  let error: unknown;
  const request = client(fetchImpl)(anonymousMessages, new AbortController().signal).catch((reason) => { error = reason; });

  await jest.advanceTimersByTimeAsync(20_000);
  await request;

  expect(error).toMatchObject({ code: 'TIMEOUT' });
  expect(requestSignal?.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

it('times out while a response body never finishes parsing', async () => {
  jest.useFakeTimers();
  let rejectRead!: (reason?: unknown) => void;
  const read = jest.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>((_resolve, reject) => { rejectRead = reject; }));
  const cancel = jest.fn(() => {
    rejectRead(new Error('stream canceled'));
    return Promise.resolve();
  });
  const responseWithStalledBody = {
    body: { getReader: () => ({ read, cancel, releaseLock: jest.fn() }) },
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: jest.fn(),
  } as unknown as Response;
  const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(responseWithStalledBody);
  let error: unknown;
  const request = client(fetchImpl)(anonymousMessages, new AbortController().signal).catch((reason) => { error = reason; });

  await jest.advanceTimersByTimeAsync(20_000);
  await request;

  expect(error).toMatchObject({ code: 'TIMEOUT' });
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(responseWithStalledBody.json).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

it('uses the bounded streaming reader for analysis responses and never calls response.json()', async () => {
  const payload = new TextEncoder().encode(JSON.stringify({ analysis: aiResult, requestId: 'req-streamed-analysis' }));
  const read = jest.fn()
    .mockResolvedValueOnce({ done: false, value: payload })
    .mockResolvedValueOnce({ done: true, value: undefined });
  const cancel = jest.fn().mockResolvedValue(undefined);
  const json = jest.fn().mockRejectedValue(new Error('unbounded parser must not run'));
  const streamed = {
    body: { getReader: () => ({ read, cancel, releaseLock: jest.fn() }) },
    headers: new Headers({ 'content-type': 'application/json', 'x-request-id': 'req-streamed-analysis' }),
    ok: true,
    status: 200,
    json,
  } as unknown as Response;
  const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(streamed);

  await expect(client(fetchImpl)(anonymousMessages, new AbortController().signal)).resolves.toEqual(aiResult);
  expect(json).not.toHaveBeenCalled();
  expect(read).toHaveBeenCalledTimes(2);
});

it('accepts an analysis response whose UTF-8 body is exactly 40 KiB', async () => {
  const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(
    paddedJsonResponse({ analysis: aiResult, requestId: 'req-analysis-40k' }, 40 * 1024, 'req-analysis-40k'),
  );

  await expect(client(fetchImpl)(anonymousMessages, new AbortController().signal)).resolves.toEqual(aiResult);
});

it('rejects declared and streamed oversized analysis bodies without accumulating them', async () => {
  const declaredRead = jest.fn();
  const declaredCancel = jest.fn().mockResolvedValue(undefined);
  const declared = {
    body: { getReader: () => ({ read: declaredRead, cancel: declaredCancel, releaseLock: jest.fn() }) },
    headers: new Headers({ 'content-type': 'application/json', 'content-length': '40961', 'x-request-id': 'req-large' }),
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ analysis: aiResult, requestId: 'req-large' }),
  } as unknown as Response;
  const streamRead = jest.fn()
    .mockResolvedValueOnce({ done: false, value: new Uint8Array(25_000) })
    .mockResolvedValueOnce({ done: false, value: new Uint8Array(20_000) });
  const streamCancel = jest.fn().mockResolvedValue(undefined);
  const streamed = {
    body: { getReader: () => ({ read: streamRead, cancel: streamCancel, releaseLock: jest.fn() }) },
    headers: new Headers({ 'content-type': 'application/json', 'x-request-id': 'req-stream-large' }),
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ analysis: aiResult, requestId: 'req-stream-large' }),
  } as unknown as Response;

  for (const item of [declared, streamed]) {
    const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(item);
    await expectCode(client(fetchImpl)(anonymousMessages, new AbortController().signal), 'INVALID_RESPONSE');
  }
  expect(declaredRead).not.toHaveBeenCalled();
  expect(declaredCancel).toHaveBeenCalledTimes(1);
  expect(streamRead).toHaveBeenCalledTimes(2);
  expect(streamCancel).toHaveBeenCalledTimes(1);
});

it.each([
  [400, 'INVALID_REQUEST', 'INVALID_RESPONSE'],
  [413, 'PAYLOAD_TOO_LARGE', 'INVALID_RESPONSE'],
  [503, 'ENTITLEMENT_UNAVAILABLE', 'SERVICE_UNAVAILABLE'],
  [503, 'INTERNAL_ERROR', 'SERVICE_UNAVAILABLE'],
  [503, 'PROVIDER_UNAVAILABLE', 'SERVICE_UNAVAILABLE'],
] as const)('maps public %i responses without exposing their body', async (status, serverCode, expectedCode) => {
  const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(response({ error: { code: serverCode, requestId: 'req-error' } }, { status }));

  await expectCode(client(fetchImpl)(anonymousMessages, new AbortController().signal), expectedCode);
});

it('maps a rate limit response and preserves only its public retry time', async () => {
  const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(response(
    { error: { code: 'RATE_LIMITED', requestId: 'req-rate', retryAfterSeconds: 60 } },
    { status: 429, headers: { 'retry-after': '60' } },
  ));

  await expect(client(fetchImpl)(anonymousMessages, new AbortController().signal)).rejects.toEqual(
    expect.objectContaining({ code: 'RATE_LIMITED', retryAfterSeconds: 60 }),
  );
});

it('rejects malformed JSON and an analysis result with a non-AI mode', async () => {
  const invalidJson = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(new Response('{bad', { status: 200 }));
  await expectCode(client(invalidJson)(anonymousMessages, new AbortController().signal), 'INVALID_RESPONSE');

  const localMode = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(response({ analysis: { ...aiResult, mode: 'local' }, requestId: 'req-2' }));
  await expectCode(client(localMode)(anonymousMessages, new AbortController().signal), 'INVALID_RESPONSE');
});

it('rejects a response whose request header conflicts with its public envelope', async () => {
  const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(response(
    { analysis: aiResult, requestId: 'req-body' },
    { headers: { 'x-request-id': 'req-header' } },
  ));

  await expectCode(client(fetchImpl)(anonymousMessages, new AbortController().signal), 'INVALID_RESPONSE');
});

it('requires a configured HTTPS endpoint for production', async () => {
  const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  const missing = createAiClient({ endpoint: '', fetch: fetchImpl, isProduction: true, getConsent: async () => consent, getInstallationToken: async () => 'token', getRevenueCatAppUserId: noRevenueCatId });
  const insecure = createAiClient({ endpoint: 'http://localhost:8787', fetch: fetchImpl, isProduction: true, getConsent: async () => consent, getInstallationToken: async () => 'token', getRevenueCatAppUserId: noRevenueCatId });

  await expectCode(missing(anonymousMessages, new AbortController().signal), 'NOT_CONFIGURED');
  await expectCode(insecure(anonymousMessages, new AbortController().signal), 'NOT_CONFIGURED');
});

describe('reviewed AI response client', () => {
  const input = {
    sender: 'Person A',
    goal: 'resolve' as const,
    tone: 'direct' as const,
    analysis: { ...aiResult, mode: 'local' as const },
  };

  function responseClient(fetchImpl: FetchMock, overrides: Partial<Parameters<typeof createResponseClient>[0]> = {}) {
    return createResponseClient({
      endpoint: 'https://ai.example.test',
      fetch: fetchImpl,
      getConsent: async () => consent,
      getInstallationToken: async () => '4b479c21-5169-41b5-ba54-3d0c5bdb82ba',
      getRevenueCatAppUserId: async () => '$RCAnonymousID:mobile-test',
      ...overrides,
    });
  }

  it('sends only the reviewed response DTO and validates the matching request ID', async () => {
    const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(response(
      { response: responseDraft, requestId: 'req-response-1' },
      { headers: { 'x-request-id': 'req-response-1' } },
    ));

    await expect(responseClient(fetchImpl)(input, new AbortController().signal)).resolves.toEqual(responseDraft);

    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://ai.example.test/v1/responses');
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({
      schemaVersion: 1,
      consentVersion: '2026-08-07.2',
      installationToken: '4b479c21-5169-41b5-ba54-3d0c5bdb82ba',
      revenueCatAppUserId: '$RCAnonymousID:mobile-test',
      sender: 'Person A',
      goal: 'resolve',
      tone: 'direct',
      analysis: input.analysis,
    });
  });

  it('checks current consent before any response request', async () => {
    const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
    const craft = responseClient(fetchImpl, { getConsent: async () => null });

    await expectCode(craft(input, new AbortController().signal), 'NOT_CONFIGURED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('accepts the largest reviewed response request of 10 messages and 280 Unicode code points each', async () => {
    const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(response(
      { response: responseDraft, requestId: 'req-largest-draft' },
    ));
    const largestInput = {
      ...input,
      analysis: {
        ...input.analysis,
        messages: remoteMessages(10, '🧠'.repeat(280)).map(({ sender, text }) => ({
          sender,
          text,
          pattern: 'Neutral' as const,
          egoState: 'Adult' as const,
          possibleInterpretation: 'Possible interpretation.',
        })),
      },
    };

    await expect(responseClient(fetchImpl)(largestInput, new AbortController().signal)).resolves.toEqual(responseDraft);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['an eleventh message', remoteMessages(11, 'ok')],
    ['a 281-code-point message', remoteMessages(1, '🧠'.repeat(281))],
  ] as const)('rejects reviewed response input with %s before consent, identity, quota, or fetch work', async (_case, messages) => {
    const getConsent = jest.fn(async () => consent);
    const getInstallationToken = jest.fn(async () => '4b479c21-5169-41b5-ba54-3d0c5bdb82ba');
    const getRevenueCatAppUserId = jest.fn(async () => '$RCAnonymousID:mobile-test');
    const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(response(
      { response: responseDraft, requestId: 'req-must-not-run' },
    ));
    const overLimitInput = {
      ...input,
      analysis: {
        ...input.analysis,
        messages: messages.map(({ sender, text }) => ({
          sender,
          text,
          pattern: 'Neutral' as const,
          egoState: 'Adult' as const,
          possibleInterpretation: 'Possible interpretation.',
        })),
      },
    };

    await expectCode(responseClient(fetchImpl, { getConsent, getInstallationToken, getRevenueCatAppUserId })(overLimitInput, new AbortController().signal), 'INVALID_RESPONSE');
    expect(getConsent).not.toHaveBeenCalled();
    expect(getInstallationToken).not.toHaveBeenCalled();
    expect(getRevenueCatAppUserId).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a 151-code-point response interpretation before consent, identity, quota, or fetch work', async () => {
    const getConsent = jest.fn(async () => consent);
    const getInstallationToken = jest.fn(async () => '4b479c21-5169-41b5-ba54-3d0c5bdb82ba');
    const getRevenueCatAppUserId = jest.fn(async () => '$RCAnonymousID:mobile-test');
    const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
    const overLimitInput = {
      ...input,
      analysis: {
        ...input.analysis,
        messages: [{ ...input.analysis.messages[0], possibleInterpretation: '🧠'.repeat(151) }],
      },
    };

    await expectCode(responseClient(fetchImpl, { getConsent, getInstallationToken, getRevenueCatAppUserId })(overLimitInput, new AbortController().signal), 'INVALID_RESPONSE');
    expect(getConsent).not.toHaveBeenCalled();
    expect(getInstallationToken).not.toHaveBeenCalled();
    expect(getRevenueCatAppUserId).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed for mismatched request IDs, extra envelope data, and unbounded drafts', async () => {
    const cases = [
      response({ response: responseDraft, requestId: 'req-body' }, { headers: { 'x-request-id': 'req-header' } }),
      response({ response: responseDraft, requestId: 'req-extra', debug: 'private' }, { headers: { 'x-request-id': 'req-extra' } }),
      response({ response: { ...responseDraft, text: 'x'.repeat(1_001) }, requestId: 'req-large' }, { headers: { 'x-request-id': 'req-large' } }),
      new Response('{not-json', { status: 200, headers: { 'content-type': 'application/json', 'x-request-id': 'req-json' } }),
    ];

    for (const item of cases) {
      const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(item);
      await expectCode(responseClient(fetchImpl)(input, new AbortController().signal), 'INVALID_RESPONSE');
    }
  });

  it('requires the response request ID header for both success and public errors', async () => {
    const missingSuccessHeader = new Response(JSON.stringify({ response: responseDraft, requestId: 'req-missing-success' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    const missingErrorHeader = new Response(JSON.stringify({ error: { code: 'SERVICE_BUSY', requestId: 'req-missing-error' } }), {
      status: 503,
      headers: { 'content-type': 'application/json', 'x-public-error-code': 'SERVICE_BUSY' },
    });
    const mismatchedErrorHeader = response(
      { error: { code: 'SERVICE_BUSY', requestId: 'req-error-body' } },
      { status: 503, headers: { 'x-public-error-code': 'SERVICE_BUSY', 'x-request-id': 'req-error-header' } },
    );

    for (const item of [missingSuccessHeader, missingErrorHeader, mismatchedErrorHeader]) {
      const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(item);
      await expectCode(responseClient(fetchImpl)(input, new AbortController().signal), 'INVALID_RESPONSE');
    }
  });

  it('rejects a response without a bounded reader and never calls text()', async () => {
    const text = jest.fn().mockResolvedValue(JSON.stringify({ response: responseDraft, requestId: 'req-no-reader' }));
    const noReader = {
      body: null,
      headers: new Headers({ 'content-type': 'application/json', 'x-request-id': 'req-no-reader' }),
      ok: true,
      status: 200,
      text,
    } as unknown as Response;
    const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(noReader);

    await expectCode(responseClient(fetchImpl)(input, new AbortController().signal), 'INVALID_RESPONSE');
    expect(text).not.toHaveBeenCalled();
  });

  it('cancels the reader for invalid content type and reader failure', async () => {
    const invalidTypeCancel = jest.fn().mockResolvedValue(undefined);
    const invalidTypeRead = jest.fn();
    const invalidType = {
      body: { getReader: () => ({ read: invalidTypeRead, cancel: invalidTypeCancel }) },
      headers: new Headers({ 'content-type': 'text/plain', 'x-request-id': 'req-type' }),
      ok: true,
      status: 200,
      text: jest.fn(),
    } as unknown as Response;
    const readerFailureCancel = jest.fn().mockResolvedValue(undefined);
    const readerFailure = {
      body: { getReader: () => ({ read: jest.fn().mockRejectedValue(new Error('private stream details')), cancel: readerFailureCancel }) },
      headers: new Headers({ 'content-type': 'application/json', 'x-request-id': 'req-reader' }),
      ok: true,
      status: 200,
      text: jest.fn(),
    } as unknown as Response;

    for (const item of [invalidType, readerFailure]) {
      const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(item);
      await expectCode(responseClient(fetchImpl)(input, new AbortController().signal), 'INVALID_RESPONSE');
    }

    expect(invalidTypeRead).not.toHaveBeenCalled();
    expect(invalidTypeCancel).toHaveBeenCalledTimes(1);
    expect(readerFailureCancel).toHaveBeenCalledTimes(1);
  });

  it('stops reading and cancels a chunked response as soon as the byte cap is exceeded', async () => {
    const cancel = jest.fn().mockResolvedValue(undefined);
    const read = jest.fn()
      .mockResolvedValueOnce({ done: false, value: new Uint8Array(20_000) })
      .mockResolvedValueOnce({ done: false, value: new Uint8Array(20_000) });
    const text = jest.fn();
    const oversizedResponse = {
      body: { getReader: () => ({ read, cancel }) },
      headers: new Headers({ 'content-type': 'application/json' }),
      ok: true,
      status: 200,
      text,
    } as unknown as Response;
    const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(oversizedResponse);

    await expectCode(responseClient(fetchImpl)(input, new AbortController().signal), 'INVALID_RESPONSE');

    expect(read).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(text).not.toHaveBeenCalled();
  });

  it('accepts a reviewed-draft response at exactly 32 KiB and rejects the next byte before reading', async () => {
    const exact = paddedJsonResponse({ response: responseDraft, requestId: 'req-draft-32k' }, 32 * 1024, 'req-draft-32k');
    const overRead = jest.fn();
    const overCancel = jest.fn().mockResolvedValue(undefined);
    const over = {
      body: { getReader: () => ({ read: overRead, cancel: overCancel, releaseLock: jest.fn() }) },
      headers: new Headers({
        'content-type': 'application/json',
        'content-length': String((32 * 1024) + 1),
        'x-request-id': 'req-draft-over',
      }),
      ok: true,
      status: 200,
    } as unknown as Response;

    await expect(responseClient(jest.fn().mockResolvedValue(exact))(input, new AbortController().signal)).resolves.toEqual(responseDraft);
    await expectCode(responseClient(jest.fn().mockResolvedValue(over))(input, new AbortController().signal), 'INVALID_RESPONSE');
    expect(overRead).not.toHaveBeenCalled();
    expect(overCancel).toHaveBeenCalledTimes(1);
  });

  it.each([
    [429, 'RATE_LIMITED', 'RATE_LIMITED'],
    [429, 'PLAN_LIMIT_REACHED', 'PLAN_LIMIT_REACHED'],
    [503, 'SERVICE_BUSY', 'SERVICE_BUSY'],
    [503, 'DAILY_BUDGET_REACHED', 'DAILY_BUDGET_REACHED'],
    [503, 'ENTITLEMENT_UNAVAILABLE', 'SERVICE_UNAVAILABLE'],
    [503, 'INTERNAL_ERROR', 'SERVICE_UNAVAILABLE'],
    [503, 'PROVIDER_UNAVAILABLE', 'SERVICE_UNAVAILABLE'],
  ] as const)('maps content-free public response failure %s/%s', async (status, serverCode, expectedCode) => {
    const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(response(
      { error: { code: serverCode, requestId: `req-${serverCode}`, retryAfterSeconds: 31 } },
      {
        status,
        headers: {
          'retry-after': '31',
          'x-public-error-code': serverCode,
          'x-request-id': `req-${serverCode}`,
        },
      },
    ));

    await expect(responseClient(fetchImpl)(input, new AbortController().signal)).rejects.toEqual(
      expect.objectContaining({ code: expectedCode, retryAfterSeconds: 31, message: expectedCode }),
    );
  });

  it('uses one deadline across consent lookup and never starts a late request', async () => {
    jest.useFakeTimers();
    const consentLookup = deferred<ConsentRecord | null>();
    const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
    const request = responseClient(fetchImpl, { getConsent: () => consentLookup.promise, timeoutMs: 25 })(input, new AbortController().signal);
    const expectation = expectCode(request, 'TIMEOUT');

    await jest.advanceTimersByTimeAsync(25);
    consentLookup.resolve(consent);
    await expectation;

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });

  it('keeps TIMEOUT semantics while canceling a stalled streamed response body', async () => {
    jest.useFakeTimers();
    let rejectRead!: (reason?: unknown) => void;
    const read = jest.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>((_resolve, reject) => { rejectRead = reject; }));
    const cancel = jest.fn().mockImplementation(() => {
      rejectRead(new Error('native stream stopped without an AbortError name'));
      return Promise.resolve();
    });
    const stalledResponse = {
      body: { getReader: () => ({ read, cancel }) },
      headers: new Headers({ 'content-type': 'application/json' }),
      ok: true,
      status: 200,
      text: jest.fn(),
    } as unknown as Response;
    const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(stalledResponse);
    const request = responseClient(fetchImpl, { timeoutMs: 25 })(input, new AbortController().signal);
    const expectation = expectCode(request, 'TIMEOUT');

    await jest.advanceTimersByTimeAsync(25);
    await expectation;

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });

  it('keeps CANCELLED semantics while canceling a stalled streamed response body', async () => {
    let rejectRead!: (reason?: unknown) => void;
    const readStarted = deferred<void>();
    const read = jest.fn(() => {
      readStarted.resolve();
      return new Promise<ReadableStreamReadResult<Uint8Array>>((_resolve, reject) => { rejectRead = reject; });
    });
    const cancel = jest.fn().mockImplementation(() => {
      rejectRead(new Error('native stream stopped without an AbortError name'));
      return Promise.resolve();
    });
    const stalledResponse = {
      body: { getReader: () => ({ read, cancel }) },
      headers: new Headers({ 'content-type': 'application/json' }),
      ok: true,
      status: 200,
      text: jest.fn(),
    } as unknown as Response;
    const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(stalledResponse);
    const controller = new AbortController();
    const request = responseClient(fetchImpl)(input, controller.signal);
    await readStarted.promise;

    controller.abort();

    await expectCode(request, 'CANCELLED');
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('cancels the whole response operation before a pending lookup can dispatch', async () => {
    const tokenLookup = deferred<string>();
    const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
    const controller = new AbortController();
    const request = responseClient(fetchImpl, { getInstallationToken: () => tokenLookup.promise })(input, controller.signal);

    controller.abort();
    tokenLookup.resolve('4b479c21-5169-41b5-ba54-3d0c5bdb82ba');

    await expectCode(request, 'CANCELLED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
