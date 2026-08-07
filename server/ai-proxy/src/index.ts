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
import { resolveEntitlement } from './entitlements';
import { createGroqProvider, type AiProvider, type ProviderCraftInput } from './provider';
import { checkRateLimits, deriveRateLimitKeys } from './rateLimit';
import { deriveAdmissionSubjectDigest, releaseAdmission, reserveAdmission } from './admission';
import {
  createSafeMetric,
  type EntitlementCacheMetric,
  type MetricPlan,
  type MetricRoute,
  type SafeMetric,
} from './metrics';

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

type OperationalContext = {
  plan: MetricPlan;
  bodyBytes: number | undefined;
  providerUnits: number | undefined;
  inFlight: number | undefined;
  entitlementCache: EntitlementCacheMetric;
};

type Logger = { info(metric: SafeMetric, requestId: string): void | Promise<void> };
type AppOptions = { provider?: AiProvider; logger?: Logger; rateLimitSecret?: string };
type BodyByteObserver = (bodyBytes: number) => void;
const MAX_BODY_BYTES = 128 * 1024;

export function createApp(options: AppOptions = {}) {
  return {
    fetch: async (request: Request, env: Env): Promise<Response> => {
      const started = Date.now();
      const requestId = crypto.randomUUID();
      const route = toRoute(request.url);
      const operational: OperationalContext = {
        plan: 'unknown',
        bodyBytes: undefined,
        providerUnits: undefined,
        inFlight: undefined,
        entitlementCache: 'unknown',
      };
      let status = 500;
      let code: PublicErrorCode | undefined;
      try {
        const response = await handle(request, env, route, requestId, options, operational);
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
        const metric = createSafeMetric({
          route,
          plan: operational.plan,
          status,
          latencyMs: Date.now() - started,
          bodyBytes: operational.bodyBytes,
          providerUnits: operational.providerUnits,
          inFlight: operational.inFlight,
          entitlementCache: operational.entitlementCache,
          outcome: code ?? 'allowed',
        });
        try {
          const logging = (options.logger ?? consoleLogger).info(metric, requestId);
          if (logging !== undefined) void Promise.resolve(logging).catch(() => undefined);
        } catch {
          // Operational telemetry must never replace or delay the request result.
        }
      }
    },
  };
}

async function handle(
  request: Request,
  env: Env,
  route: MetricRoute,
  requestId: string,
  options: AppOptions,
  operational: OperationalContext,
): Promise<Response> {
  const origin = request.headers.get('origin');
  if (route === 'unknown') throw new PublicError('INVALID_REQUEST', 404);
  if (request.method === 'OPTIONS') return corsResponse(origin);
  if (request.method !== 'POST') throw new PublicError('INVALID_REQUEST', 405);

  const boundedBody = await readBoundedJson(request, (bodyBytes) => {
    operational.bodyBytes = bodyBytes;
  });
  const body = boundedBody.value;
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
  const entitlement = await resolveEntitlement(parsed.data.revenueCatAppUserId, env, now);
  const verifiedPlan = entitlement.plan;
  operational.plan = verifiedPlan;
  operational.entitlementCache = entitlement.cache;
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
  operational.inFlight = reservation.inFlight;
  operational.providerUnits = route === '/v1/analyses' ? 3 : 1;

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

async function readBoundedJson(request: Request, observeBodyBytes: BodyByteObserver): Promise<{ value: unknown; bodyBytes: number }> {
  const declaredHeader = request.headers.get('content-length');
  if (declaredHeader !== null) {
    const declaredLength = Number(declaredHeader);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      observeBodyBytes(MAX_BODY_BYTES + 1);
      throw new PublicError('PAYLOAD_TOO_LARGE', 413);
    }
  }
  if (!request.body) {
    observeBodyBytes(0);
    throw new PublicError('INVALID_REQUEST', 400);
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      observeBodyBytes(MAX_BODY_BYTES + 1);
      await reader.cancel().catch(() => undefined);
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
  observeBodyBytes(total);
  try {
    return { value: JSON.parse(new TextDecoder().decode(bytes)), bodyBytes: total };
  } catch {
    throw new PublicError('INVALID_REQUEST', 400);
  }
}

function hasConsentMismatch(body: unknown): boolean {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    && 'consentVersion' in body && (body as { consentVersion?: unknown }).consentVersion !== CONSENT_VERSION;
}

function toRoute(url: string): MetricRoute {
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

const consoleLogger: Logger = {
  info: (metric, requestId) => console.log(JSON.stringify({ requestId, metric })),
};

export default createApp();
