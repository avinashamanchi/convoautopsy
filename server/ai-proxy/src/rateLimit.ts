const WINDOW_SECONDS = 60;

export async function deriveRateLimitKey(token: string, ip: string, secret: string, route = ''): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${token}\n${ip}\n${route}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function checkRateLimit(
  storage: KVNamespace,
  key: string,
  limit: number,
): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> {
  const stored = await storage.get(key);
  const count = stored !== null && /^\d+$/.test(stored) ? Number.parseInt(stored, 10) : 0;
  const next = count + 1;
  await storage.put(key, String(next), { expirationTtl: WINDOW_SECONDS });
  return next <= limit ? { allowed: true } : { allowed: false, retryAfterSeconds: WINDOW_SECONDS };
}
