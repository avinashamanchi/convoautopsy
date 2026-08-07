import {
  AnalysisResultSchema,
  ResponseDraftSchema,
  type AnalysisResult,
  type ParsedMessage,
  type ResponseDraft,
} from '../domain/analysis';
import { fetch as expoFetch } from 'expo/fetch';
import type { ResponseGoal, ResponseTone } from '../domain/responseCrafter';
import { CONSENT_VERSION, SecureStorageUnavailableError, type ConsentRecord } from './consentStore';
import {
  REMOTE_ANALYSIS_MAX_MESSAGES,
  REMOTE_ANALYSIS_MAX_RESPONSE_BYTES,
  REMOTE_ANALYSIS_MAX_TEXT_CODE_POINTS,
  REMOTE_INTERPRETATION_MAX_CODE_POINTS,
  REMOTE_DRAFT_MAX_RESPONSE_BYTES,
} from './remoteLimits';

export {
  REMOTE_ANALYSIS_MAX_MESSAGES,
  REMOTE_ANALYSIS_MAX_RESPONSE_BYTES,
  REMOTE_ANALYSIS_MAX_TEXT_CODE_POINTS,
  REMOTE_INTERPRETATION_MAX_CODE_POINTS,
  REMOTE_DRAFT_MAX_RESPONSE_BYTES,
} from './remoteLimits';

export type AiClientErrorCode =
  | 'OFFLINE'
  | 'CANCELLED'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'PLAN_LIMIT_REACHED'
  | 'SERVICE_BUSY'
  | 'DAILY_BUDGET_REACHED'
  | 'SERVICE_UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'NOT_CONFIGURED';

export class AiClientError extends Error {
  readonly code: AiClientErrorCode;
  readonly retryAfterSeconds?: number;

  constructor(code: AiClientErrorCode, retryAfterSeconds?: number) {
    super(code);
    this.name = 'AiClientError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type FetchPort = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const expoResponseFetch: FetchPort = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  return expoFetch(url, init as never) as unknown as Promise<Response>;
};

type AiClientDependencies = {
  endpoint?: string;
  fetch?: FetchPort;
  getConsent(): Promise<ConsentRecord | null>;
  getInstallationToken(): Promise<string>;
  getRevenueCatAppUserId(): Promise<string | null>;
  isProduction?: boolean;
  timeoutMs?: number;
};

type PublicErrorEnvelope = {
  error: { code: string; requestId: string; retryAfterSeconds?: number };
};

export type AiResponseRequest = Readonly<{
  sender: string;
  goal: ResponseGoal;
  tone: ResponseTone;
  analysis: AnalysisResult;
}>;

export function createAiClient({
  endpoint = process.env.EXPO_PUBLIC_AI_PROXY_URL,
  fetch: fetchPort = expoResponseFetch,
  getConsent,
  getInstallationToken,
  getRevenueCatAppUserId,
  isProduction = true,
  timeoutMs = 20_000,
}: AiClientDependencies) {
  return async function analyzeRemotely(messages: readonly Readonly<ParsedMessage>[], callerSignal: AbortSignal): Promise<AnalysisResult> {
    if (callerSignal.aborted) throw new AiClientError('CANCELLED');
    const requestController = new AbortController();
    let timedOut = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let rejectCancellation!: (reason: AiClientError) => void;
    const abortFromCaller = () => {
      requestController.abort();
      rejectCancellation(new AiClientError('CANCELLED'));
    };
    const cancellation = new Promise<never>((_resolve, reject) => {
      rejectCancellation = reject;
      callerSignal.addEventListener('abort', abortFromCaller, { once: true });
    });
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        timedOut = true;
        requestController.abort();
        reject(new AiClientError('TIMEOUT'));
      }, timeoutMs);
    });

    const ensureActive = () => {
      if (callerSignal.aborted) throw new AiClientError('CANCELLED');
      if (timedOut || requestController.signal.aborted) throw new AiClientError('TIMEOUT');
    };

    const operation = async (): Promise<AnalysisResult> => {
      ensureActive();
      const anonymousMessages = toAnonymousMessages(messages);
      const consent = await getConsent();
      ensureActive();
      if (!consent || consent.version !== CONSENT_VERSION || consent.provider !== 'Groq') {
        throw new AiClientError('NOT_CONFIGURED');
      }
      const installationToken = await getInstallationToken();
      ensureActive();
      const url = analysisUrl(endpoint, isProduction);
      if (!url || !fetchPort) throw new AiClientError('NOT_CONFIGURED');
      const revenueCatAppUserId = await requireBillingIdentity(getRevenueCatAppUserId);
      ensureActive();
      const response = await fetchPort(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          schemaVersion: 1,
          consentVersion: consent.version,
          installationToken,
          revenueCatAppUserId,
          messages: anonymousMessages,
        }),
        signal: requestController.signal,
      });
      ensureActive();
      const body = await readBoundedJson(response, requestController.signal, REMOTE_ANALYSIS_MAX_RESPONSE_BYTES);
      ensureActive();
      if (!response.ok) throw publicError(response, body);
      return validAnalysis(response, body);
    };

    try {
      return await Promise.race([operation(), cancellation, deadline]);
    } catch (error) {
      if (error instanceof AiClientError) throw error;
      if (error instanceof SecureStorageUnavailableError) throw error;
      if (timedOut) throw new AiClientError('TIMEOUT');
      if (callerSignal.aborted || isAbortError(error)) throw new AiClientError('CANCELLED');
      throw new AiClientError('OFFLINE');
    } finally {
      if (timeout !== null) clearTimeout(timeout);
      callerSignal.removeEventListener('abort', abortFromCaller);
    }
  };
}

export function createResponseClient({
  endpoint = process.env.EXPO_PUBLIC_AI_PROXY_URL,
  fetch: fetchPort = expoResponseFetch,
  getConsent,
  getInstallationToken,
  getRevenueCatAppUserId,
  isProduction = true,
  timeoutMs = 20_000,
}: AiClientDependencies) {
  return async function craftReviewedResponse(input: AiResponseRequest, callerSignal: AbortSignal): Promise<ResponseDraft> {
    if (callerSignal.aborted) throw new AiClientError('CANCELLED');
    const requestController = new AbortController();
    let timedOut = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let rejectCancellation!: (reason: AiClientError) => void;
    const abortFromCaller = () => {
      requestController.abort();
      rejectCancellation(new AiClientError('CANCELLED'));
    };
    const cancellation = new Promise<never>((_resolve, reject) => {
      rejectCancellation = reject;
      callerSignal.addEventListener('abort', abortFromCaller, { once: true });
    });
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        timedOut = true;
        requestController.abort();
        reject(new AiClientError('TIMEOUT'));
      }, timeoutMs);
    });
    const ensureActive = () => {
      if (callerSignal.aborted) throw new AiClientError('CANCELLED');
      if (timedOut || requestController.signal.aborted) throw new AiClientError('TIMEOUT');
    };

    const operation = async (): Promise<ResponseDraft> => {
      ensureActive();
      const reviewedInput = toReviewedResponseInput(input);
      const consent = await getConsent();
      ensureActive();
      if (!consent || consent.version !== CONSENT_VERSION || consent.provider !== 'Groq') {
        throw new AiClientError('NOT_CONFIGURED');
      }
      const installationToken = await getInstallationToken();
      ensureActive();
      const url = routeUrl(endpoint, '/v1/responses', isProduction);
      if (!url || !fetchPort) throw new AiClientError('NOT_CONFIGURED');
      const revenueCatAppUserId = await requireBillingIdentity(getRevenueCatAppUserId);
      ensureActive();
      const response = await fetchPort(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          schemaVersion: 1,
          consentVersion: consent.version,
          installationToken,
          revenueCatAppUserId,
          ...reviewedInput,
        }),
        signal: requestController.signal,
      });
      ensureActive();
      const body = await readBoundedJson(response, requestController.signal, REMOTE_DRAFT_MAX_RESPONSE_BYTES);
      ensureActive();
      if (!response.ok) throw publicError(response, body);
      return validResponseDraft(response, body);
    };

    try {
      return await Promise.race([operation(), cancellation, deadline]);
    } catch (error) {
      if (error instanceof AiClientError) throw error;
      if (error instanceof SecureStorageUnavailableError) throw error;
      if (timedOut) throw new AiClientError('TIMEOUT');
      if (callerSignal.aborted || isAbortError(error)) throw new AiClientError('CANCELLED');
      throw new AiClientError('OFFLINE');
    } finally {
      if (timeout !== null) clearTimeout(timeout);
      callerSignal.removeEventListener('abort', abortFromCaller);
    }
  };
}

function analysisUrl(endpoint: string | undefined, isProduction: boolean): string | null {
  return routeUrl(endpoint, '/v1/analyses', isProduction);
}

function routeUrl(endpoint: string | undefined, path: '/v1/analyses' | '/v1/responses', isProduction: boolean): string | null {
  if (!endpoint) return null;
  try {
    const url = new URL(endpoint);
    if (isProduction && url.protocol !== 'https:') return null;
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return new URL(path, url).toString();
  } catch {
    return null;
  }
}

function toReviewedResponseInput(input: AiResponseRequest): AiResponseRequest {
  if (!/^Person [A-Z]$/.test(input.sender)
    || !['resolve', 'boundary', 'feelings', 'understand', 'apologize', 'request'].includes(input.goal)
    || !['empathetic', 'assertive', 'deescalating', 'direct', 'diplomatic'].includes(input.tone)
    || !withinRemoteResponseBounds(input.analysis.messages)) {
    throw new AiClientError('INVALID_RESPONSE');
  }
  const analysis = AnalysisResultSchema.safeParse({
    schemaVersion: input.analysis.schemaVersion,
    mode: input.analysis.mode,
    intensityScore: input.analysis.intensityScore,
    conflictMode: input.analysis.conflictMode,
    messages: input.analysis.messages.map((message) => ({
      sender: message.sender,
      text: message.text,
      pattern: message.pattern,
      egoState: message.egoState,
      possibleInterpretation: message.possibleInterpretation,
    })),
  });
  if (!analysis.success || !analysis.data.messages.some(({ sender }) => sender === input.sender)) {
    throw new AiClientError('INVALID_RESPONSE');
  }
  return { sender: input.sender, goal: input.goal, tone: input.tone, analysis: analysis.data };
}

function toAnonymousMessages(messages: readonly Readonly<ParsedMessage>[]) {
  if (!withinRemoteMessageBounds(messages)
    || messages.some((message) => !/^Person [A-Z]$/.test(message.sender) || !message.text)) {
    throw new AiClientError('INVALID_RESPONSE');
  }
  return messages.map(({ sender, text }) => ({ sender, text }));
}

function withinRemoteMessageBounds(messages: readonly Readonly<{ text: string }>[]): boolean {
  return messages.length > 0
    && messages.length <= REMOTE_ANALYSIS_MAX_MESSAGES
    && messages.every(({ text }) => Array.from(text).length > 0
      && Array.from(text).length <= REMOTE_ANALYSIS_MAX_TEXT_CODE_POINTS);
}

function withinRemoteResponseBounds(
  messages: readonly Readonly<{ text: string; possibleInterpretation: string }>[],
): boolean {
  return withinRemoteMessageBounds(messages)
    && messages.every(({ possibleInterpretation }) => (
      Array.from(possibleInterpretation).length > 0
      && Array.from(possibleInterpretation).length <= REMOTE_INTERPRETATION_MAX_CODE_POINTS
    ));
}

async function requireBillingIdentity(getAppUserId: () => Promise<string | null>): Promise<string> {
  try {
    const appUserId = await getAppUserId();
    if (typeof appUserId !== 'string' || !appUserId.trim() || Array.from(appUserId).length > 100) {
      throw new AiClientError('NOT_CONFIGURED');
    }
    return appUserId;
  } catch (error) {
    if (error instanceof AiClientError) throw error;
    throw new AiClientError('NOT_CONFIGURED');
  }
}

async function readBoundedJson(response: Response, signal: AbortSignal, maximumBytes: number): Promise<unknown> {
  const body = response.body;
  if (!body || typeof body.getReader !== 'function') {
    await body?.cancel?.().catch(() => undefined);
    throw new AiClientError('INVALID_RESPONSE');
  }

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = body.getReader();
  } catch {
    await body.cancel().catch(() => undefined);
    throw new AiClientError('INVALID_RESPONSE');
  }

  let cancellationStarted = false;
  const cancelReader = async () => {
    if (cancellationStarted) return;
    cancellationStarted = true;
    await reader.cancel().catch(() => undefined);
  };
  const cancelOnAbort = () => { void cancelReader(); };
  signal.addEventListener('abort', cancelOnAbort, { once: true });

  try {
    if (signal.aborted) {
      await cancelReader();
      throw new DOMException('aborted', 'AbortError');
    }

    const contentType = response.headers.get('content-type');
    if (!contentType?.toLowerCase().startsWith('application/json')) {
      await cancelReader();
      throw new AiClientError('INVALID_RESPONSE');
    }

    const declaredHeader = response.headers.get('content-length');
    if (declaredHeader !== null) {
      const declaredLength = Number(declaredHeader);
      if (!Number.isSafeInteger(declaredLength) || declaredLength < 0 || declaredLength > maximumBytes) {
        await cancelReader();
        throw new AiClientError('INVALID_RESPONSE');
      }
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch {
        await cancelReader();
        if (signal.aborted) throw new DOMException('aborted', 'AbortError');
        throw new AiClientError('INVALID_RESPONSE');
      }
      if (result.done) break;
      if (!(result.value instanceof Uint8Array)) {
        await cancelReader();
        throw new AiClientError('INVALID_RESPONSE');
      }
      totalBytes += result.value.byteLength;
      if (totalBytes > maximumBytes) {
        await cancelReader();
        throw new AiClientError('INVALID_RESPONSE');
      }
      chunks.push(result.value);
    }

    if (signal.aborted) {
      await cancelReader();
      throw new DOMException('aborted', 'AbortError');
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    } catch {
      await cancelReader();
      throw new AiClientError('INVALID_RESPONSE');
    }
  } finally {
    signal.removeEventListener('abort', cancelOnAbort);
    reader.releaseLock?.();
  }
}

function validAnalysis(response: Response, body: unknown): AnalysisResult {
  if (!isRecord(body) || !hasOnlyKeys(body, ['analysis', 'requestId']) || !isRequestId(body.requestId) || !requestIdMatchesHeader(response, body.requestId)) {
    throw new AiClientError('INVALID_RESPONSE');
  }
  const parsed = AnalysisResultSchema.safeParse(body.analysis);
  if (!parsed.success || parsed.data.mode !== 'ai') throw new AiClientError('INVALID_RESPONSE');
  return parsed.data;
}

function validResponseDraft(response: Response, body: unknown): ResponseDraft {
  if (!isRecord(body) || !hasOnlyKeys(body, ['response', 'requestId']) || !isRequestId(body.requestId) || !requestIdMatchesHeader(response, body.requestId)) {
    throw new AiClientError('INVALID_RESPONSE');
  }
  const parsed = ResponseDraftSchema.safeParse(body.response);
  if (!parsed.success) throw new AiClientError('INVALID_RESPONSE');
  return parsed.data;
}

function publicError(response: Response, body: unknown): AiClientError {
  if (!isPublicErrorEnvelope(body) || !requestIdMatchesHeader(response, body.error.requestId)) {
    return new AiClientError('INVALID_RESPONSE');
  }
  const publicCodeHeader = response.headers.get('x-public-error-code');
  if (publicCodeHeader !== null && publicCodeHeader !== body.error.code) return new AiClientError('INVALID_RESPONSE');
  const bodyRetry = validRetryAfter(body.error.retryAfterSeconds);
  const retryHeaderValue = response.headers.get('retry-after');
  const headerRetry = retryHeaderValue === null ? undefined : validRetryAfter(Number(retryHeaderValue));
  if (retryHeaderValue !== null && headerRetry === undefined) return new AiClientError('INVALID_RESPONSE');
  if (bodyRetry !== undefined && headerRetry !== undefined && bodyRetry !== headerRetry) return new AiClientError('INVALID_RESPONSE');
  const retryAfterSeconds = bodyRetry ?? headerRetry;
  if (response.status === 429 && body.error.code === 'RATE_LIMITED') return new AiClientError('RATE_LIMITED', retryAfterSeconds);
  if (response.status === 429 && body.error.code === 'PLAN_LIMIT_REACHED') return new AiClientError('PLAN_LIMIT_REACHED', retryAfterSeconds);
  if (response.status === 503 && body.error.code === 'SERVICE_BUSY') return new AiClientError('SERVICE_BUSY', retryAfterSeconds);
  if (response.status === 503 && body.error.code === 'DAILY_BUDGET_REACHED') return new AiClientError('DAILY_BUDGET_REACHED', retryAfterSeconds);
  if (response.status === 503 && (body.error.code === 'ENTITLEMENT_UNAVAILABLE' || body.error.code === 'INTERNAL_ERROR')) {
    return new AiClientError('SERVICE_UNAVAILABLE', retryAfterSeconds);
  }
  if (response.status === 503 && body.error.code === 'PROVIDER_UNAVAILABLE') return new AiClientError('SERVICE_UNAVAILABLE', retryAfterSeconds);
  return new AiClientError('INVALID_RESPONSE');
}

function isPublicErrorEnvelope(value: unknown): value is PublicErrorEnvelope {
  return isRecord(value)
    && isRecord(value.error)
    && hasOnlyKeys(value, ['error'])
    && hasOnlyKeys(value.error, ['code', 'requestId', 'retryAfterSeconds'])
    && typeof value.error.code === 'string'
    && isRequestId(value.error.requestId)
    && (value.error.retryAfterSeconds === undefined || validRetryAfter(value.error.retryAfterSeconds) !== undefined);
}

function requestIdMatchesHeader(response: Response, requestId: string): boolean {
  const header = response.headers.get('x-request-id');
  return header === requestId;
}

function validRetryAfter(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 31_536_000 ? value : undefined;
}

function isRequestId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,200}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
