import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolvePlan, type EntitlementEnv } from '../src/entitlements';

const NOW = Date.parse('2026-08-07T00:00:00Z');
const APP_USER_ID = '$RCAnonymousID:MARKER_RAW_REVENUECAT_ID';
const SECRET = 'server-side-revenuecat-secret';

type StoredValue = { value: string; options?: KVNamespacePutOptions };

class MemoryCache {
  readonly entries = new Map<string, StoredValue>();

  async get(key: string): Promise<string | null> {
    return this.entries.get(key)?.value ?? null;
  }

  async put(key: string, value: string, options?: KVNamespacePutOptions): Promise<void> {
    this.entries.set(key, { value, options });
  }
}

function customer(
  expiresDate: string | null,
  entitlementId = 'convo_pro',
  gracePeriodExpiresDate: string | null = null,
) {
  return {
    request_date: '2026-08-07T00:00:00Z',
    request_date_ms: NOW,
    subscriber: {
      entitlements: {
        [entitlementId]: {
          expires_date: expiresDate,
          grace_period_expires_date: gracePeriodExpiresDate,
          product_identifier: 'com.avinashamanchi.convoautopsy.pro.monthly',
          purchase_date: '2026-08-01T00:00:00Z',
        },
      },
      first_seen: '2026-08-01T00:00:00Z',
      last_seen: '2026-08-07T00:00:00Z',
      management_url: null,
      non_subscriptions: {},
      original_app_user_id: APP_USER_ID,
      original_application_version: null,
      original_purchase_date: null,
      other_purchases: {},
      subscriptions: {
        'com.avinashamanchi.convoautopsy.pro.monthly': {
          auto_resume_date: null,
          billing_issues_detected_at: null,
          expires_date: expiresDate,
          grace_period_expires_date: gracePeriodExpiresDate,
          is_sandbox: true,
          original_purchase_date: '2026-08-01T00:00:00Z',
          ownership_type: 'PURCHASED',
          period_type: 'normal',
          purchase_date: '2026-08-01T00:00:00Z',
          refunded_at: null,
          store: 'app_store',
          store_transaction_id: 'transaction-1',
          unsubscribe_detected_at: null,
        },
      },
    },
  };
}

function env(fetchImpl: typeof fetch, cache = new MemoryCache(), secret: string | undefined = SECRET): EntitlementEnv {
  return {
    REVENUECAT_SECRET_API_KEY: secret,
    ENTITLEMENT_CACHE: cache as unknown as KVNamespace,
    fetch: fetchImpl,
  };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function fakeResponse(body: unknown): Response {
  return { ok: true, status: 200, headers: new Headers(), body } as unknown as Response;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('RevenueCat entitlement resolution', () => {
  it('returns pro only for a currently active exact convo_pro entitlement', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(customer('2026-09-01T00:00:00Z')));

    await expect(resolvePlan(APP_USER_ID, env(fetchImpl), NOW)).resolves.toBe('pro');

    const [input, init] = fetchImpl.mock.calls[0];
    const url = new URL(String(input));
    expect(url.origin).toBe('https://api.revenuecat.com');
    expect(url.pathname).toBe(`/v1/subscribers/${encodeURIComponent(APP_USER_ID)}`);
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${SECRET}`);
  });

  it('returns free for an expired entitlement or a different entitlement name', async () => {
    const expired = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(customer('2026-08-06T23:59:59Z')));
    const wrongName = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(customer('2026-09-01T00:00:00Z', 'convo_pro_plus')));

    await expect(resolvePlan(APP_USER_ID, env(expired), NOW)).resolves.toBe('free');
    await expect(resolvePlan(APP_USER_ID, env(wrongName), NOW)).resolves.toBe('free');
  });

  it('keeps convo_pro active through a future grace deadline and caches only that effective deadline', async () => {
    const cache = new MemoryCache();
    const graceDeadline = '2026-08-07T00:04:00Z';
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(customer('2026-08-06T23:59:00Z', 'convo_pro', graceDeadline)))
      .mockRejectedValueOnce(new Error('refresh unavailable'));

    await expect(resolvePlan(APP_USER_ID, env(fetchImpl, cache), NOW)).resolves.toBe('pro');

    const [{ value }] = [...cache.entries.values()];
    expect(JSON.parse(value)).toEqual({ plan: 'pro', checkedAt: NOW, expiresAt: Date.parse(graceDeadline) });
    await expect(resolvePlan(APP_USER_ID, env(fetchImpl, cache), Date.parse(graceDeadline))).resolves.toBe('free');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('returns free after both the normal and grace deadlines expire', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(
      customer('2026-08-06T23:58:00Z', 'convo_pro', '2026-08-06T23:59:00Z'),
    ));

    await expect(resolvePlan(APP_USER_ID, env(fetchImpl), NOW)).resolves.toBe('free');
  });

  it('fails closed when the grace deadline is malformed', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(
      customer('2026-09-01T00:00:00Z', 'convo_pro', 'not-a-date'),
    ));

    await expect(resolvePlan(APP_USER_ID, env(fetchImpl), NOW)).resolves.toBe('free');
  });

  it('fails closed without network access when the identifier or server secret is absent', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(resolvePlan(null, env(fetchImpl), NOW)).resolves.toBe('free');
    await expect(resolvePlan(APP_USER_ID, env(fetchImpl, new MemoryCache(), ''), NOW)).resolves.toBe('free');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(['.', '..'])('rejects dot-segment app-user ID %s before sending Authorization', async (appUserId) => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(resolvePlan(appUserId, env(fetchImpl), NOW)).resolves.toBe('free');

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reuses a HMAC-keyed cache entry for five minutes without storing customer data', async () => {
    const cache = new MemoryCache();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(customer('2026-09-01T00:00:00Z')));
    const testEnv = env(fetchImpl, cache);

    await expect(resolvePlan(APP_USER_ID, testEnv, NOW)).resolves.toBe('pro');
    await expect(resolvePlan(APP_USER_ID, testEnv, NOW + 5 * 60_000 - 1)).resolves.toBe('pro');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(cache.entries.size).toBe(1);
    const [[key, entry]] = [...cache.entries];
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain(APP_USER_ID);
    expect(JSON.parse(entry.value)).toEqual({ plan: 'pro', checkedAt: NOW, expiresAt: Date.parse('2026-09-01T00:00:00Z') });
    expect(entry.value).not.toContain(APP_USER_ID);
    expect(entry.value).not.toContain('subscriber');
    expect(entry.options).toEqual({ expirationTtl: 300 });
  });

  it('keys the same identifier differently when the HMAC secret changes', async () => {
    const firstCache = new MemoryCache();
    const secondCache = new MemoryCache();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(customer('2026-09-01T00:00:00Z')));

    await resolvePlan(APP_USER_ID, env(fetchImpl, firstCache, 'first-server-secret'), NOW);
    await resolvePlan(APP_USER_ID, env(fetchImpl, secondCache, 'second-server-secret'), NOW);

    const [firstKey] = firstCache.entries.keys();
    const [secondKey] = secondCache.entries.keys();
    expect(firstKey).not.toBe(secondKey);
    expect(`${firstKey}${secondKey}`).not.toContain(APP_USER_ID);
  });

  it('fails closed when an expired cache entry cannot be refreshed', async () => {
    const cache = new MemoryCache();
    const initialFetch = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(customer('2026-09-01T00:00:00Z')));
    await expect(resolvePlan(APP_USER_ID, env(initialFetch, cache), NOW)).resolves.toBe('pro');
    const failingFetch = vi.fn<typeof fetch>().mockRejectedValue(new Error('provider payload must not escape'));

    await expect(resolvePlan(APP_USER_ID, env(failingFetch, cache), NOW + 5 * 60_000)).resolves.toBe('free');
  });

  it('aborts at the five-second deadline even when fetch ignores AbortSignal', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn<typeof fetch>((_input, init) => {
      requestSignal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });
    const result = resolvePlan(APP_USER_ID, env(fetchImpl), NOW);

    await vi.advanceTimersByTimeAsync(5_000);

    await expect(result).resolves.toBe('free');
    expect(requestSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('applies the five-second deadline while the response body is stalled', async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise<void>(() => undefined);
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream, { status: 200 }));
    const result = resolvePlan(APP_USER_ID, env(fetchImpl), NOW);

    await vi.advanceTimersByTimeAsync(5_000);
    const outcome = await Promise.race([result, Promise.resolve<'pending'>('pending')]);

    expect(outcome).toBe('free');
    expect(cancelled).toBe(true);
  });

  it('cancels a response that arrives after the deadline without starting body reads', async () => {
    vi.useFakeTimers();
    const pendingFetch = deferred<Response>();
    const getReader = vi.fn(() => ({
      read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
      cancel: vi.fn().mockResolvedValue(undefined),
    }));
    const cancel = vi.fn().mockRejectedValue(new Error('late response cancellation detail'));
    const fetchImpl = vi.fn<typeof fetch>().mockReturnValue(pendingFetch.promise);
    const result = resolvePlan(APP_USER_ID, env(fetchImpl), NOW);

    await vi.advanceTimersByTimeAsync(5_000);
    await expect(result).resolves.toBe('free');
    pendingFetch.resolve(fakeResponse({ getReader, cancel }));
    await Promise.resolve();
    await Promise.resolve();

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(getReader).not.toHaveBeenCalled();
  });

  it('does no reader work after the deadline and absorbs reader cancellation rejection', async () => {
    vi.useFakeTimers();
    const pendingRead = deferred<ReadableStreamReadResult<Uint8Array>>();
    const read = vi.fn()
      .mockImplementationOnce(() => pendingRead.promise)
      .mockResolvedValue({ done: true, value: undefined });
    const cancel = vi.fn().mockRejectedValue(new Error('reader cancellation detail'));
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(fakeResponse({
      getReader: () => ({ read, cancel }),
      cancel: vi.fn().mockResolvedValue(undefined),
    }));
    const result = resolvePlan(APP_USER_ID, env(fetchImpl), NOW);
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(5_000);
    await expect(result).resolves.toBe('free');
    pendingRead.resolve({ done: false, value: new Uint8Array([123]) });
    await Promise.resolve();
    await Promise.resolve();

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['non-OK response', () => new Response('upstream marker', { status: 503 })],
    ['malformed JSON', () => new Response('{bad json', { status: 200 })],
    ['malformed customer shape', () => jsonResponse({ subscriber: { entitlements: [] } })],
  ])('fails closed for a %s', async (_name, responseFactory) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(responseFactory());

    await expect(resolvePlan(APP_USER_ID, env(fetchImpl), NOW)).resolves.toBe('free');
  });

  it('cancels and rejects a RevenueCat body larger than 64 KiB', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(64 * 1024 + 1));
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream, { status: 200 }));

    await expect(resolvePlan(APP_USER_ID, env(fetchImpl), NOW)).resolves.toBe('free');
    expect(cancelled).toBe(true);
  });

  it('fails closed on cache read and write failures', async () => {
    const readFailure = {
      get: vi.fn().mockRejectedValue(new Error('raw cache read detail')),
      put: vi.fn(),
    } as unknown as KVNamespace;
    const fetchForReadFailure = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(customer('2026-09-01T00:00:00Z')));
    await expect(resolvePlan(APP_USER_ID, { ...env(fetchForReadFailure), ENTITLEMENT_CACHE: readFailure }, NOW)).resolves.toBe('free');
    expect(fetchForReadFailure).not.toHaveBeenCalled();

    const writeFailure = {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockRejectedValue(new Error('raw cache write detail')),
    } as unknown as KVNamespace;
    const fetchForWriteFailure = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(customer('2026-09-01T00:00:00Z')));
    await expect(resolvePlan(APP_USER_ID, { ...env(fetchForWriteFailure), ENTITLEMENT_CACHE: writeFailure }, NOW)).resolves.toBe('free');
  });
});
