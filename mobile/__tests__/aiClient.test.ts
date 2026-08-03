import { AiClientError, createAiClient } from '../src/services/aiClient';
import type { AnalysisResult, ParsedMessage } from '../src/domain/analysis';
import { parseConversation } from '../src/domain/parser';
import { SECURE_STORAGE_UNAVAILABLE_MESSAGE, SecureStorageUnavailableError, type ConsentRecord } from '../src/services/consentStore';

const consent: ConsentRecord = {
  version: '2026-08-02',
  grantedAt: '2026-08-02T12:00:00.000Z',
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

function response(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', ...init.headers }, ...init });
}

type FetchMock = jest.Mock<Promise<Response>, [RequestInfo | URL, RequestInit?]>;

function client(fetchImpl: FetchMock) {
  return createAiClient({
    endpoint: 'https://ai.example.test',
    fetch: fetchImpl,
    getConsent: async () => consent,
    getInstallationToken: async () => '4b479c21-5169-41b5-ba54-3d0c5bdb82ba',
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
    consentVersion: '2026-08-02',
    installationToken: '4b479c21-5169-41b5-ba54-3d0c5bdb82ba',
    messages: [
      { sender: 'Person A', text: 'Can we talk?' },
      { sender: 'Person B', text: 'Not right now.' },
    ],
  });
  expect(JSON.stringify(requestBody.messages)).not.toContain('Alex');
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
  const analyze = createAiClient({ endpoint: 'https://ai.example.test', fetch: fetchImpl, getConsent: () => consentLookup.promise, getInstallationToken: async () => 'token' });
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
  const analyze = createAiClient({ endpoint: 'https://ai.example.test', fetch: fetchImpl, getConsent: async () => consent, getInstallationToken: () => tokenLookup.promise });
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
  const missing = createAiClient({ endpoint: '', fetch: fetchImpl, isProduction: true, getConsent: async () => consent, getInstallationToken: async () => 'token' });
  const insecure = createAiClient({ endpoint: 'http://localhost:8787', fetch: fetchImpl, isProduction: true, getConsent: async () => consent, getInstallationToken: async () => 'token' });

  await expectCode(missing(anonymousMessages, new AbortController().signal), 'NOT_CONFIGURED');
  await expectCode(insecure(anonymousMessages, new AbortController().signal), 'NOT_CONFIGURED');
});
