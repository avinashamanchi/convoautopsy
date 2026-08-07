import { AiClientError, createAiClient, createResponseClient } from '../src/services/aiClient';
import type { AnalysisResult, ParsedMessage } from '../src/domain/analysis';
import { parseConversation } from '../src/domain/parser';
import { SECURE_STORAGE_UNAVAILABLE_MESSAGE, SecureStorageUnavailableError, type ConsentRecord } from '../src/services/consentStore';

const consent: ConsentRecord = {
  version: '2026-08-07',
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
  return new Response(JSON.stringify(body), { status: 200, ...rest, headers: { 'content-type': 'application/json', ...headers } });
}

type FetchMock = jest.Mock<Promise<Response>, [RequestInfo | URL, RequestInit?]>;
const noRevenueCatId = async () => null;

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
    consentVersion: '2026-08-07',
    installationToken: '4b479c21-5169-41b5-ba54-3d0c5bdb82ba',
    revenueCatAppUserId: '$RCAnonymousID:mobile-test',
    messages: [
      { sender: 'Person A', text: 'Can we talk?' },
      { sender: 'Person B', text: 'Not right now.' },
    ],
  });
  expect(JSON.stringify(requestBody.messages)).not.toContain('Alex');
});

it('omits the RevenueCat identifier when billing is unavailable', async () => {
  const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(response({ analysis: aiResult, requestId: 'req-free' }));
  const analyze = createAiClient({
    endpoint: 'https://ai.example.test',
    fetch: fetchImpl,
    getConsent: async () => consent,
    getInstallationToken: async () => '4b479c21-5169-41b5-ba54-3d0c5bdb82ba',
    getRevenueCatAppUserId: async () => null,
  });

  await analyze(anonymousMessages, new AbortController().signal);

  expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).not.toHaveProperty('revenueCatAppUserId');
});

it('continues as a free request when billing identifier lookup fails', async () => {
  const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(response({ analysis: aiResult, requestId: 'req-billing-failure' }));
  const analyze = createAiClient({
    endpoint: 'https://ai.example.test',
    fetch: fetchImpl,
    getConsent: async () => consent,
    getInstallationToken: async () => '4b479c21-5169-41b5-ba54-3d0c5bdb82ba',
    getRevenueCatAppUserId: async () => { throw new Error('billing unavailable'); },
  });

  await expect(analyze(anonymousMessages, new AbortController().signal)).resolves.toEqual(aiResult);
  expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).not.toHaveProperty('revenueCatAppUserId');
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
  const responseWithStalledJson = {
    ok: true,
    headers: new Headers(),
    json: () => new Promise<unknown>(() => undefined),
  } as unknown as Response;
  const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>().mockResolvedValue(responseWithStalledJson);
  let error: unknown;
  const request = client(fetchImpl)(anonymousMessages, new AbortController().signal).catch((reason) => { error = reason; });

  await jest.advanceTimersByTimeAsync(20_000);
  await request;

  expect(error).toMatchObject({ code: 'TIMEOUT' });
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

it.each([
  [400, 'INVALID_REQUEST', 'INVALID_RESPONSE'],
  [413, 'PAYLOAD_TOO_LARGE', 'INVALID_RESPONSE'],
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
      consentVersion: '2026-08-07',
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

  it.each([
    [429, 'RATE_LIMITED', 'RATE_LIMITED'],
    [429, 'PLAN_LIMIT_REACHED', 'PLAN_LIMIT_REACHED'],
    [503, 'SERVICE_BUSY', 'SERVICE_BUSY'],
    [503, 'DAILY_BUDGET_REACHED', 'DAILY_BUDGET_REACHED'],
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
      rejectRead(new DOMException('aborted', 'AbortError'));
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
      rejectRead(new DOMException('aborted', 'AbortError'));
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
