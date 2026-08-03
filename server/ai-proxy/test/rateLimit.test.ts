import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { checkRateLimits, deriveRateLimitKeys, evaluateWindow } from '../src/rateLimit';

describe('rate limits', () => {
  it('uses independent HMAC-digest Durable Objects and atomically allows exactly ten concurrent analyses', async () => {
    const token = 'installation-token-which-is-long-enough';
    const keys = await deriveRateLimitKeys(token, '203.0.113.10', 'test-hmac-key', '/v1/analyses');

    expect(keys.ipDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(keys.tokenDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(keys.ipDigest).not.toBe(keys.tokenDigest);
    expect(JSON.stringify(keys)).not.toContain(token);
    expect(JSON.stringify(keys)).not.toContain('203.0.113.10');
    const results = await Promise.all(Array.from({ length: 40 }, () => checkRateLimits(env.RATE_LIMITER, keys, '/v1/analyses')));

    expect(results.filter((result) => result.allowed)).toHaveLength(10);
    expect(results.filter((result) => !result.allowed)).toHaveLength(30);
    expect(results.filter((result) => !result.allowed).every((result) => !result.allowed && result.retryAfterSeconds >= 1 && result.retryAfterSeconds <= 60)).toBe(true);
  });

  it('keeps response route objects independent and atomically allows exactly twenty concurrent drafts', async () => {
    const keys = await deriveRateLimitKeys('other-installation-token-long-enough', '203.0.113.11', 'test-hmac-key', '/v1/responses');
    const results = await Promise.all(Array.from({ length: 50 }, () => checkRateLimits(env.RATE_LIMITER, keys, '/v1/responses')));

    expect(results.filter((result) => result.allowed)).toHaveLength(20);
    expect(results.filter((result) => !result.allowed)).toHaveLength(30);
  });

  it('enforces the IP bucket when valid installation tokens rotate', async () => {
    const results = [];
    for (let index = 0; index < 11; index += 1) {
      const keys = await deriveRateLimitKeys(`rotating-token-${index}-long-enough`, '203.0.113.44', 'rotation-hmac-key', '/v1/analyses');
      results.push(await checkRateLimits(env.RATE_LIMITER, keys, '/v1/analyses'));
    }

    expect(results.slice(0, 10).every((result) => result.allowed)).toBe(true);
    expect(results[10]).toMatchObject({ allowed: false });
  });

  it('enforces the token bucket when source IPs rotate', async () => {
    const results = [];
    for (let index = 0; index < 11; index += 1) {
      const keys = await deriveRateLimitKeys('stable-token-for-ip-rotation', `198.51.100.${index + 1}`, 'rotation-hmac-key', '/v1/analyses');
      results.push(await checkRateLimits(env.RATE_LIMITER, keys, '/v1/analyses'));
    }

    expect(results.slice(0, 10).every((result) => result.allowed)).toBe(true);
    expect(results[10]).toMatchObject({ allowed: false });
  });

  it('resets an expired fixed window deterministically', () => {
    expect(evaluateWindow({ windowStart: 1_000, count: 10 }, 61_000, 10)).toEqual({ windowStart: 61_000, count: 1, allowed: true, retryAfterSeconds: 0 });
    expect(evaluateWindow({ windowStart: 61_000, count: 10 }, 61_500, 10)).toEqual({ windowStart: 61_000, count: 11, allowed: false, retryAfterSeconds: 60 });
  });
});
