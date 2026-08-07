import { PublicError } from './errors';

const WINDOW_MS = 60_000;
const DIGEST_DOMAIN = 'convoautopsy-rate-limit-v2';

export type RateRoute = '/v1/analyses' | '/v1/responses';
export type RateScope = 'ip' | 'token';

type WindowState = { windowStart: number; count: number };
export type RateLimitResult = { windowStart: number; count: number; allowed: boolean; retryAfterSeconds: number };
export type RateLimitKeys = { ipDigest: string; tokenDigest: string };

export function limitsForRateScope(scope: RateScope, route: RateRoute): number {
  if (scope === 'token') return route === '/v1/analyses' ? 10 : 20;
  if (scope === 'ip') return route === '/v1/analyses' ? 1_000 : 2_000;
  throw new Error('Invalid rate-limit scope');
}

export async function deriveRateLimitKeys(
  token: string,
  ip: string,
  secret: string,
  route: RateRoute,
): Promise<RateLimitKeys> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const [ipDigest, tokenDigest] = await Promise.all([
    digestKey(key, `${DIGEST_DOMAIN}\nscope=ip\nroute=${route}\nidentity=${ip}`),
    digestKey(key, `${DIGEST_DOMAIN}\nscope=token\nroute=${route}\nidentity=${token}`),
  ]);
  return { ipDigest, tokenDigest };
}

export function evaluateWindow(current: WindowState | undefined, now: number, limit: number): RateLimitResult {
  const windowStart = !current || now >= current.windowStart + WINDOW_MS ? now : current.windowStart;
  const count = (!current || windowStart !== current.windowStart ? 0 : current.count) + 1;
  const allowed = count <= limit;
  return {
    windowStart,
    count,
    allowed,
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((windowStart + WINDOW_MS - now) / 1_000)),
  };
}

export async function checkRateLimits(
  namespace: DurableObjectNamespace,
  keys: RateLimitKeys,
  route: RateRoute,
): Promise<Pick<RateLimitResult, 'allowed' | 'retryAfterSeconds'>> {
  const [ipResult, tokenResult] = await Promise.all([
    checkRateLimit(namespace, keys.ipDigest, 'ip', route),
    checkRateLimit(namespace, keys.tokenDigest, 'token', route),
  ]);
  const allowed = ipResult.allowed && tokenResult.allowed;
  return {
    allowed,
    retryAfterSeconds: allowed ? 0 : Math.max(ipResult.retryAfterSeconds, tokenResult.retryAfterSeconds),
  };
}

export class RateLimitDurableObject {
  constructor(private readonly state: DurableObjectState) {
    this.state.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS rate_window (id INTEGER PRIMARY KEY CHECK (id = 1), window_start INTEGER NOT NULL, count INTEGER NOT NULL)',
    );
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const check = await parseCheck(request);
    if (!check) return new Response(null, { status: 400 });

    const now = Date.now();
    const result = this.state.storage.transactionSync(() => {
      const row = this.state.storage.sql.exec<{ window_start: number; count: number }>(
        'SELECT window_start, count FROM rate_window WHERE id = 1',
      ).toArray()[0];
      if (row && (!Number.isInteger(row.window_start) || !Number.isInteger(row.count) || row.count < 0)) {
        throw new Error('Invalid rate limiter state');
      }
      const next = evaluateWindow(
        row ? { windowStart: row.window_start, count: row.count } : undefined,
        now,
        limitsForRateScope(check.scope, check.route),
      );
      this.state.storage.sql.exec(
        'INSERT INTO rate_window (id, window_start, count) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET window_start = excluded.window_start, count = excluded.count',
        next.windowStart,
        next.count,
      );
      return next;
    });
    await this.state.storage.setAlarm(result.windowStart + WINDOW_MS);
    return Response.json({ allowed: result.allowed, retryAfterSeconds: result.retryAfterSeconds });
  }

  async alarm(): Promise<void> {
    const nextAlarm = this.state.storage.transactionSync(() => {
      const row = this.state.storage.sql.exec<{ window_start: number }>(
        'SELECT window_start FROM rate_window WHERE id = 1',
      ).toArray()[0];
      if (!row) return undefined;
      const expiresAt = row.window_start + WINDOW_MS;
      if (expiresAt <= Date.now()) {
        this.state.storage.sql.exec('DELETE FROM rate_window WHERE id = 1');
        return undefined;
      }
      return expiresAt;
    });
    if (nextAlarm) await this.state.storage.setAlarm(nextAlarm);
  }
}

async function checkRateLimit(
  namespace: DurableObjectNamespace,
  digest: string,
  scope: RateScope,
  route: RateRoute,
): Promise<Pick<RateLimitResult, 'allowed' | 'retryAfterSeconds'>> {
  try {
    const response = await namespace.get(namespace.idFromName(digest)).fetch('https://rate-limiter.internal/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scope, route }),
    });
    if (!response.ok) throw new Error('Rate limiter unavailable');
    const result = await response.json() as unknown;
    if (!isRateLimitResult(result)) throw new Error('Invalid rate limiter response');
    return result;
  } catch {
    throw new PublicError('INTERNAL_ERROR', 500);
  }
}

function isRateLimitResult(value: unknown): value is Pick<RateLimitResult, 'allowed' | 'retryAfterSeconds'> {
  return typeof value === 'object' && value !== null
    && typeof (value as { allowed?: unknown }).allowed === 'boolean'
    && Number.isInteger((value as { retryAfterSeconds?: unknown }).retryAfterSeconds)
    && (value as { retryAfterSeconds: number }).retryAfterSeconds >= 0
    && (value as { retryAfterSeconds: number }).retryAfterSeconds <= 60;
}

async function parseCheck(request: Request): Promise<{ scope: RateScope; route: RateRoute } | undefined> {
  try {
    const value = await request.json() as { scope?: unknown; route?: unknown };
    const scope = value.scope === 'ip' || value.scope === 'token' ? value.scope : undefined;
    const route = value.route === '/v1/analyses' || value.route === '/v1/responses' ? value.route : undefined;
    return scope && route ? { scope, route } : undefined;
  } catch {
    return undefined;
  }
}

async function digestKey(key: CryptoKey, value: string): Promise<string> {
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
