import { describe, expect, it } from 'vitest';
import { limitsForRateScope } from '../src/fairRateLimit';

describe('shared-NAT-safe production rate policy', () => {
  it('keeps strict per-install limits while allowing 100 installations behind one IP', () => {
    expect(limitsForRateScope('token', '/v1/analyses')).toBe(10);
    expect(limitsForRateScope('token', '/v1/responses')).toBe(20);
    expect(limitsForRateScope('ip', '/v1/analyses')).toBeGreaterThanOrEqual(1_000);
    expect(limitsForRateScope('ip', '/v1/responses')).toBeGreaterThanOrEqual(2_000);
  });
});
