import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { checkRateLimit, deriveRateLimitKey } from '../src/rateLimit';

describe('rate limits', () => {
  it('stores only an HMAC digest and blocks the eleventh analysis request for 60 seconds', async () => {
    const token = 'installation-token-which-is-long-enough';
    const key = await deriveRateLimitKey(token, '203.0.113.10', 'test-hmac-key');

    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain(token);
    expect(key).not.toContain('203.0.113.10');
    for (let index = 0; index < 10; index += 1) {
      await expect(checkRateLimit(env.RATE_LIMITS, key, 10)).resolves.toMatchObject({ allowed: true });
    }
    await expect(checkRateLimit(env.RATE_LIMITS, key, 10)).resolves.toEqual({ allowed: false, retryAfterSeconds: 60 });
    expect(await env.RATE_LIMITS.get(key)).toBe('11');
  });

  it('uses the independent 20 request response-route limit', async () => {
    const key = await deriveRateLimitKey('other-installation-token-long-enough', '203.0.113.11', 'test-hmac-key');

    for (let index = 0; index < 20; index += 1) await checkRateLimit(env.RATE_LIMITS, key, 20);

    await expect(checkRateLimit(env.RATE_LIMITS, key, 20)).resolves.toEqual({ allowed: false, retryAfterSeconds: 60 });
  });
});
