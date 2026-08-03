import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { checkRateLimit, deriveRateLimitKey, evaluateWindow } from '../src/rateLimit';

describe('rate limits', () => {
  it('uses one Durable Object per HMAC digest and atomically allows exactly ten concurrent analyses', async () => {
    const token = 'installation-token-which-is-long-enough';
    const digest = await deriveRateLimitKey(token, '203.0.113.10', 'test-hmac-key', '/v1/analyses');

    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toContain(token);
    expect(digest).not.toContain('203.0.113.10');
    const results = await Promise.all(Array.from({ length: 40 }, () => checkRateLimit(env.RATE_LIMITER, digest, '/v1/analyses')));

    expect(results.filter((result) => result.allowed)).toHaveLength(10);
    expect(results.filter((result) => !result.allowed)).toHaveLength(30);
    expect(results.filter((result) => !result.allowed).every((result) => !result.allowed && result.retryAfterSeconds >= 1 && result.retryAfterSeconds <= 60)).toBe(true);
  });

  it('keeps response route objects independent and atomically allows exactly twenty concurrent drafts', async () => {
    const digest = await deriveRateLimitKey('other-installation-token-long-enough', '203.0.113.11', 'test-hmac-key', '/v1/responses');
    const results = await Promise.all(Array.from({ length: 50 }, () => checkRateLimit(env.RATE_LIMITER, digest, '/v1/responses')));

    expect(results.filter((result) => result.allowed)).toHaveLength(20);
    expect(results.filter((result) => !result.allowed)).toHaveLength(30);
  });

  it('resets an expired fixed window deterministically', () => {
    expect(evaluateWindow({ windowStart: 1_000, count: 10 }, 61_000, 10)).toEqual({ windowStart: 61_000, count: 1, allowed: true, retryAfterSeconds: 0 });
    expect(evaluateWindow({ windowStart: 61_000, count: 10 }, 61_500, 10)).toEqual({ windowStart: 61_000, count: 11, allowed: false, retryAfterSeconds: 60 });
  });
});
