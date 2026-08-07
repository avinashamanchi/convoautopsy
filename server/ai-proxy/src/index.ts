import {
  AnalyzeRequestSchema,
  CONSENT_VERSION,
  CraftResponseRequestSchema,
  AnalysisResultSchema,
  ResponseDraftSchema,
  type AnalyzeRequest,
  type CraftResponseRequest,
} from './contract';
import { asPublicError, ProviderInvalidResponseError, ProviderUnavailableError, PublicError, type PublicErrorCode } from './errors';
import { resolvePlan } from './entitlements';
import { createGroqProvider, type AiProvider, type ProviderCraftInput } from './provider';
import { checkRateLimits, deriveRateLimitKeys } from './rateLimit';
import { deriveAdmissionSubjectDigest, releaseAdmission, reserveAdmission } from './admission';

export type { AiProvider } from './provider';
export { RateLimitDurableObject } from './rateLimit';
export { AdmissionDurableObject } from './admission';

export interface Env {
  RATE_LIMITER: DurableObjectNamespace;
  AI_ADMISSION: DurableObjectNamespace;
  GROQ_API_KEY: string;
  RATE_LIMIT_HMAC_SECRET: string;
  MAX_GLOBAL_IN_FLIGHT?: string;
  MAX_DAILY_PROVIDER_UNITS: string;
  REVENUECAT_SECRET_API_KEY?: string;
  ENTITLEMENT_CACHE?: KVNamespace;
}

type SafeLog = {
  requestId: string;
  route: '/v1/analyses' | '/v1/responses' | 'unknown';
  status: number;
  latencyBucket: '<100ms' | '<1s' | '<5s' | '>=5s';
  code?: PublicErrorCode;
};

type Logger = { info(record: SafeLog): void };
type AppOptions = { provider?: AiProvider; logger?: Logger; rateLimitSecret?: string };
const MAX_BODY_BYTES = 128 * 1024;

export function createApp(options: AppOptions = {}) {
  return {
    fetch: async (request: Request, env: Env): Promise<Response> => {
      const started = Date.now();
      const requestId = crypto.randomUUID();
      const route = toRoute(request.url);
      let status = 500;
      let code: PublicErrorCode | undefined;
      try {
        const response = await handle(request, env, route, requestId, options);
        status = response.status;
        code = response.headers.get('x-public-error-code') as PublicErrorCode | null ?? undefined;
        response.headers.delete('x-public-error-code');
        return response;
      } catch (error) {
        const publicError = asPublicError(error);
        status = publicError.status;
        code = publicError.code;
        return errorResponse(publicError, requestId, route === 'unknown' ? null : request.headers.get('origin'));
      } finally {
        const record: SafeLog = { requestId, route, status, latencyBucket: bucket(Date.now() - started) };
        if (code) record.code = code;
        (options.logger ?? consoleLogger).info(record);
      }
    },
  };
}

async function handle(request: Request, env: Env, route: SafeLog['route'], requestId: string, options: AppOptions): Promise<Response> {
  const origin = request.headers.get('origin');
  if (route === 'unknown') throw new PublicError('INVALID_REQUEST', 404);
  if (request.method === 'OPTIONS') return corsResponse(origin);
  if (request.method !== 'POST') throw new PublicError('INVALID_REQUEST', 405);

  const body = await readBoundedJson(request);
  if (hasConsentMismatch(body)) throw new PublicError('CONSENT_REQUIRED', 403);
  const schema = route === '/v1/analyses' ? AnalyzeRequestSchema : CraftResponseRequestSchema;
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new PublicError('INVALID_REQUEST', 400);

  const secret = options.rateLimitSecret ?? env.RATE_LIMIT_HMAC_SECRET;
  if (!secret) throw new PublicError('INTERNAL_ERROR', 500);
  const keys = await deriveRateLimitKeys(
    parsed.data.installationToken,
    request.headers.get('CF-Connecting-IP') ?? '0.0.0.0',
    secret,
    route,
  );
  const rate = await checkRateLimits(env.RATE_LIMITER, keys, route);
  if (!rate.allowed) throw new PublicError('RATE_LIMITED', 429, rate.retryAfterSeconds);

  const now = Date.now();
  const verifiedPlan = await resolvePlan(parsed.data.revenueCatAppUserId, env, now);
  const verifiedCustomerId = verifiedPlan === 'pro' ? parsed.data.revenueCatAppUserId : undefined;
  const subjectDigest = await deriveAdmissionSubjectDigest(
    verifiedCustomerId ?? parsed.data.installationToken,
    verifiedCustomerId === undefined ? 'installation' : 'customer',
    secret,
  );
  const reservation = await reserveAdmission(env.AI_ADMISSION, {
    plan: verifiedPlan,
    subjectDigest,
    route,
    now,
  }, {
    maxGlobalInFlight: env.MAX_GLOBAL_IN_FLIGHT,
    maxDailyProviderUnits: env.MAX_DAILY_PROVIDER_UNITS,
  });
  if (!reservation.allowed) {
    const status = reservation.code === 'PLAN_LIMIT_REACHED' ? 429 : 503;
    throw new PublicError(reservation.code, status, reservation.retryAfterSeconds);
  }

  const provider = options.provider ?? createGroqProvider(env.GROQ_API_KEY);
  try {
    if (route === '/v1/analyses') {
      let analysis;
      try {
        analysis = AnalysisResultSchema.parse(await provider.analyze((parsed.data as AnalyzeRequest).messages));
      } catch (error) {
        if (error instanceof DOMException && error.name === 'TimeoutError') throw error;
        if (error instanceof ProviderInvalidResponseError || error instanceof ProviderUnavailableError) throw error;
        if (error instanceof Error && !(error instanceof PublicError)) throw new ProviderInvalidResponseError();
        throw error;
      }
      return json({ analysis, requestId }, 200, origin);
    }

    let response;
    try {
      const input = parsed.data as CraftResponseRequest;
      const providerInput: ProviderCraftInput = {
        sender: input.sender,
        goal: input.goal,
        tone: input.tone,
        analysis: {
          intensityScore: input.analysis.intensityScore,
          conflictMode: input.analysis.conflictMode,
          messages: input.analysis.messages,
        },
      };
      response = ResponseDraftSchema.parse(await provider.craftResponse(providerInput));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') throw error;
      if (error instanceof ProviderInvalidResponseError || error instanceof ProviderUnavailableError) throw error;
      if (error instanceof Error && !(error instanceof PublicError)) throw new ProviderInvalidResponseError();
      throw error;
    }
    return json({ response, requestId }, 200, origin);
  } finally {
    try {
      await releaseAdmission(env.AI_ADMISSION, reservation.leaseId);
    } catch {
      // Lease expiry and the coordinator alarm recover capacity without replacing a valid response.
    }
  }
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) throw new PublicError('PAYLOAD_TOO_LARGE', 413);
  if (!request.body) throw new PublicError('INVALID_REQUEST', 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new PublicError('PAYLOAD_TOO_LARGE', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new PublicError('INVALID_REQUEST', 400);
  }
}

function hasConsentMismatch(body: unknown): boolean {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    && 'consentVersion' in body && (body as { consentVersion?: unknown }).consentVersion !== CONSENT_VERSION;
}

function toRoute(url: string): SafeLog['route'] {
  const pathname = new URL(url).pathname;
  return pathname === '/v1/analyses' || pathname === '/v1/responses' ? pathname : 'unknown';
}

function json(value: unknown, status: number, origin: string | null): Response {
  const headers = corsHeaders(origin);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(value), { status, headers });
}

function errorResponse(error: PublicError, requestId: string, origin: string | null): Response {
  const headers = corsHeaders(origin);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('x-public-error-code', error.code);
  if (error.retryAfterSeconds) headers.set('Retry-After', String(error.retryAfterSeconds));
  return new Response(JSON.stringify({ error: { code: error.code, requestId, ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}) } }), { status: error.status, headers });
}

function corsResponse(origin: string | null): Response {
  const headers = corsHeaders(origin);
  if (isAllowedOrigin(origin)) {
    headers.set('access-control-allow-methods', 'POST, OPTIONS');
    headers.set('access-control-allow-headers', 'content-type');
    headers.set('access-control-max-age', '86400');
  }
  return new Response(null, { status: 204, headers });
}

function corsHeaders(origin: string | null): Headers {
  const headers = new Headers({ Vary: 'Origin' });
  if (isAllowedOrigin(origin) && origin) headers.set('access-control-allow-origin', origin);
  return headers;
}

function isAllowedOrigin(origin: string | null): boolean {
  return origin === null || origin === 'https://avinashamanchi.github.io'
    || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function bucket(elapsed: number): SafeLog['latencyBucket'] {
  if (elapsed < 100) return '<100ms';
  if (elapsed < 1_000) return '<1s';
  if (elapsed < 5_000) return '<5s';
  return '>=5s';
}

const consoleLogger: Logger = { info: (record) => console.log(JSON.stringify(record)) };

export default createApp();
