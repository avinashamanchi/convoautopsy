export type EntitlementPlan = 'free' | 'pro';
export type EntitlementSnapshot = Readonly<{
  plan: EntitlementPlan;
  checkedAt: number;
  expiresAt: number | null;
}>;

export interface EntitlementEnv {
  REVENUECAT_SECRET_API_KEY?: string;
  ENTITLEMENT_CACHE?: KVNamespace;
  fetch?: typeof globalThis.fetch;
}

const REVENUECAT_ORIGIN = 'https://api.revenuecat.com';
const ENTITLEMENT_ID = 'convo_pro';
const CACHE_TTL_SECONDS = 5 * 60;
const FETCH_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 64 * 1024;
const CACHE_KEY_DOMAIN = 'convoautopsy:revenuecat-entitlement:v1\0';

export async function resolvePlan(
  appUserId: string | null | undefined,
  env: EntitlementEnv,
  now: number,
): Promise<EntitlementPlan> {
  const secret = env.REVENUECAT_SECRET_API_KEY;
  const cache = env.ENTITLEMENT_CACHE;
  if (!validAppUserId(appUserId) || !secret || !cache) return 'free';

  try {
    const cacheKey = await digestCacheKey(appUserId, secret);
    const cached = parseSnapshot(await cache.get(cacheKey));
    if (cached && snapshotIsCurrent(cached, now)) return cached.plan;

    const snapshot = await fetchSnapshot(appUserId, secret, env.fetch ?? globalThis.fetch, now);
    await cache.put(cacheKey, JSON.stringify(snapshot), { expirationTtl: CACHE_TTL_SECONDS });
    return snapshotIsEntitled(snapshot, now) ? snapshot.plan : 'free';
  } catch {
    return 'free';
  }
}

function validAppUserId(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0 && Array.from(value).length <= 100;
}

async function digestCacheKey(appUserId: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(`${CACHE_KEY_DOMAIN}${appUserId}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseSnapshot(value: string | null): EntitlementSnapshot | null {
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || !hasOnlyKeys(parsed, ['plan', 'checkedAt', 'expiresAt'])) return null;
    if (parsed.plan !== 'free' && parsed.plan !== 'pro') return null;
    if (!Number.isFinite(parsed.checkedAt)) return null;
    if (parsed.expiresAt !== null && !Number.isFinite(parsed.expiresAt)) return null;
    return {
      plan: parsed.plan,
      checkedAt: parsed.checkedAt as number,
      expiresAt: parsed.expiresAt as number | null,
    };
  } catch {
    return null;
  }
}

function snapshotIsCurrent(snapshot: EntitlementSnapshot, now: number): boolean {
  return snapshot.checkedAt <= now
    && now - snapshot.checkedAt < CACHE_TTL_SECONDS * 1_000
    && snapshotIsEntitled(snapshot, now);
}

function snapshotIsEntitled(snapshot: EntitlementSnapshot, now: number): boolean {
  return snapshot.plan === 'free' || snapshot.expiresAt === null || snapshot.expiresAt > now;
}

async function fetchSnapshot(
  appUserId: string,
  secret: string,
  fetchPort: typeof globalThis.fetch,
  now: number,
): Promise<EntitlementSnapshot> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new DOMException('RevenueCat deadline exceeded', 'TimeoutError'));
    }, FETCH_TIMEOUT_MS);
  });

  try {
    const operation = async () => {
      const response = await fetchPort(`${REVENUECAT_ORIGIN}/v1/subscribers/${encodeURIComponent(appUserId)}`, {
        method: 'GET',
        headers: { authorization: `Bearer ${secret}`, accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error('RevenueCat unavailable');
      }
      const body = await readBoundedJson(response, controller);
      return snapshotFromCustomer(body, now);
    };
    return await Promise.race([operation(), deadline]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function readBoundedJson(response: Response, controller: AbortController): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    controller.abort();
    await response.body?.cancel();
    throw new Error('RevenueCat response too large');
  }
  if (!response.body) throw new Error('RevenueCat response missing');

  const reader = response.body.getReader();
  const cancelReader = () => { void reader.cancel(); };
  controller.signal.addEventListener('abort', cancelReader, { once: true });
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        controller.abort();
        await reader.cancel();
        throw new Error('RevenueCat response too large');
      }
      chunks.push(value);
    }
  } finally {
    controller.signal.removeEventListener('abort', cancelReader);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function snapshotFromCustomer(value: unknown, now: number): EntitlementSnapshot {
  if (!isRecord(value) || !isRecord(value.subscriber) || !isRecord(value.subscriber.entitlements)) {
    throw new Error('Invalid RevenueCat response');
  }
  const entitlements = value.subscriber.entitlements;
  if (!(ENTITLEMENT_ID in entitlements)) return { plan: 'free', checkedAt: now, expiresAt: null };

  const entitlement = entitlements[ENTITLEMENT_ID];
  if (!isRecord(entitlement) || !('expires_date' in entitlement)) throw new Error('Invalid RevenueCat entitlement');
  const rawExpiration = entitlement.expires_date;
  if (rawExpiration === null) return { plan: 'pro', checkedAt: now, expiresAt: null };
  if (typeof rawExpiration !== 'string') throw new Error('Invalid RevenueCat expiration');
  const expiresAt = Date.parse(rawExpiration);
  if (!Number.isFinite(expiresAt)) throw new Error('Invalid RevenueCat expiration');
  return { plan: expiresAt > now ? 'pro' : 'free', checkedAt: now, expiresAt };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => key in value);
}
