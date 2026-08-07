import { describe, expect, it } from 'vitest';

import { LoadControlDurableObject, prepareFixtureApiRequest, validFixtureSecret } from '../src/loadFixture';

const secret = 'a'.repeat(64);

describe('local load fixture boundary', () => {
  it('accepts only an exact ephemeral 256-bit hexadecimal secret', () => {
    expect(validFixtureSecret(secret)).toBe(true);
    expect(validFixtureSecret('a'.repeat(63))).toBe(false);
    expect(validFixtureSecret('g'.repeat(64))).toBe(false);
    expect(validFixtureSecret(undefined)).toBe(false);
  });

  it('maps an authenticated reserved synthetic identity and strips fixture headers', () => {
    const source = new Request('http://127.0.0.1:8787/v1/analyses', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-load-fixture-secret': secret,
        'x-load-fixture-ip': '198.19.255.255',
      },
      body: '{}',
    });

    const prepared = prepareFixtureApiRequest(source, secret);

    expect(prepared?.headers.get('CF-Connecting-IP')).toBe('198.19.255.255');
    expect(prepared?.headers.get('x-load-fixture-secret')).toBeNull();
    expect(prepared?.headers.get('x-load-fixture-ip')).toBeNull();
  });

  it('refuses unauthenticated or out-of-range synthetic identities', () => {
    const request = (fixtureSecret: string, syntheticIp: string) => new Request('http://127.0.0.1:8787/v1/analyses', {
      method: 'POST',
      headers: { 'x-load-fixture-secret': fixtureSecret, 'x-load-fixture-ip': syntheticIp },
      body: '{}',
    });

    expect(prepareFixtureApiRequest(request('b'.repeat(64), '198.18.0.1'), secret)).toBeNull();
    expect(prepareFixtureApiRequest(request(secret, '192.0.2.1'), secret)).toBeNull();
  });

  it('holds provider work across isolates until the fixture control Durable Object releases it', async () => {
    const control = new LoadControlDurableObject({} as DurableObjectState, { LOAD_FIXTURE_SECRET: secret });
    const call = (path: string, method: string) => control.fetch(new Request(`https://control.internal${path}`, {
      method,
      headers: { authorization: `Bearer ${secret}` },
    }));
    expect((await call('/hold', 'POST')).status).toBe(204);
    let settled = false;
    const waiting = call('/wait', 'GET').then((response) => {
      expect(response.status).toBe(204);
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    expect((await call('/release', 'POST')).status).toBe(204);
    await waiting;
    expect(settled).toBe(true);
    expect((await call('/wait', 'GET')).status).toBe(204);
  });
});
