import { AnalysisResultSchema, type AnalysisResult, type ParsedMessage } from '../domain/analysis';
import { CONSENT_VERSION, type ConsentRecord } from './consentStore';

export type AiClientErrorCode =
  | 'OFFLINE'
  | 'CANCELLED'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
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

type AiClientDependencies = {
  endpoint?: string;
  fetch?: FetchPort;
  getConsent(): Promise<ConsentRecord | null>;
  getInstallationToken(): Promise<string>;
  isProduction?: boolean;
  timeoutMs?: number;
};

type PublicErrorEnvelope = {
  error: { code: string; requestId: string; retryAfterSeconds?: number };
};

export function createAiClient({
  endpoint = process.env.EXPO_PUBLIC_AI_PROXY_URL,
  fetch: fetchPort = globalThis.fetch,
  getConsent,
  getInstallationToken,
  isProduction = true,
  timeoutMs = 20_000,
}: AiClientDependencies) {
  return async function analyzeRemotely(messages: ParsedMessage[], callerSignal: AbortSignal): Promise<AnalysisResult> {
    if (callerSignal.aborted) throw new AiClientError('CANCELLED');
    const anonymousMessages = toAnonymousMessages(messages);
    const consent = await getConsent();
    if (!consent || consent.version !== CONSENT_VERSION || consent.provider !== 'Groq') {
      throw new AiClientError('NOT_CONFIGURED');
    }
    const installationToken = await getInstallationToken();
    const url = analysisUrl(endpoint, isProduction);
    if (!url || !fetchPort) throw new AiClientError('NOT_CONFIGURED');

    const timeoutController = new AbortController();
    const combinedController = new AbortController();
    const abortFromCaller = () => combinedController.abort();
    const abortFromTimeout = () => combinedController.abort();
    callerSignal.addEventListener('abort', abortFromCaller, { once: true });
    timeoutController.signal.addEventListener('abort', abortFromTimeout, { once: true });
    const timeout = setTimeout(() => timeoutController.abort(), timeoutMs);

    try {
      const response = await fetchPort(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          schemaVersion: 1,
          consentVersion: consent.version,
          installationToken,
          messages: anonymousMessages,
        }),
        signal: combinedController.signal,
      });
      const body = await readJson(response);
      if (!response.ok) throw publicError(response, body);
      return validAnalysis(response, body);
    } catch (error) {
      if (error instanceof AiClientError) throw error;
      if (timeoutController.signal.aborted) throw new AiClientError('TIMEOUT');
      if (callerSignal.aborted || isAbortError(error)) throw new AiClientError('CANCELLED');
      throw new AiClientError('OFFLINE');
    } finally {
      clearTimeout(timeout);
      callerSignal.removeEventListener('abort', abortFromCaller);
      timeoutController.signal.removeEventListener('abort', abortFromTimeout);
    }
  };
}

function analysisUrl(endpoint: string | undefined, isProduction: boolean): string | null {
  if (!endpoint) return null;
  try {
    const url = new URL(endpoint);
    if (isProduction && url.protocol !== 'https:') return null;
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return new URL('/v1/analyses', url).toString();
  } catch {
    return null;
  }
}

function toAnonymousMessages(messages: ParsedMessage[]) {
  if (messages.length === 0 || messages.some((message) => !/^Person [A-Z]+$/.test(message.sender) || !message.text)) {
    throw new AiClientError('INVALID_RESPONSE');
  }
  return messages.map(({ sender, text }) => ({ sender, text }));
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new AiClientError('INVALID_RESPONSE');
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

function publicError(response: Response, body: unknown): AiClientError {
  if (!isPublicErrorEnvelope(body) || !requestIdMatchesHeader(response, body.error.requestId)) {
    return new AiClientError('INVALID_RESPONSE');
  }
  if (response.status === 429 && body.error.code === 'RATE_LIMITED') {
    const bodyRetry = validRetryAfter(body.error.retryAfterSeconds);
    const headerRetry = validRetryAfter(Number(response.headers.get('retry-after')));
    if (bodyRetry !== undefined && headerRetry !== undefined && bodyRetry !== headerRetry) {
      return new AiClientError('INVALID_RESPONSE');
    }
    return new AiClientError('RATE_LIMITED', bodyRetry ?? headerRetry);
  }
  if (response.status === 503 && body.error.code === 'SERVICE_UNAVAILABLE') {
    return new AiClientError('SERVICE_UNAVAILABLE');
  }
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
  return header === null || header === requestId;
}

function validRetryAfter(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function isRequestId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200;
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
