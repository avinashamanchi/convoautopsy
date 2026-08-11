import { act, render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useEffect } from 'react';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BillingProvider, useBilling, type BillingContextValue } from '../src/billing/BillingProvider';
import type { BillingService, BillingSnapshot } from '../src/billing/contracts';
import { PurchaseCancelledError } from '../src/billing/revenueCatService';

const proSnapshot: BillingSnapshot = {
  availability: 'ready',
  entitlementStatus: 'pro',
  products: [{ id: 'com.avinashamanchi.convoautopsy.pro.monthly', title: 'Monthly', localizedPrice: '$7.99', period: 'monthly' }],
};

const freeSnapshot: BillingSnapshot = {
  availability: 'ready',
  entitlementStatus: 'free',
  products: proSnapshot.products,
};

function createBillingService(overrides: Partial<BillingService> = {}): BillingService {
  return {
    load: jest.fn().mockResolvedValue(proSnapshot),
    purchase: jest.fn().mockResolvedValue(proSnapshot),
    restore: jest.fn().mockResolvedValue(proSnapshot),
    subscribe: jest.fn().mockReturnValue(() => undefined),
    getAppUserId: jest.fn().mockResolvedValue('$RCAnonymousID:test-user'),
    ...overrides,
  };
}

function BillingProbe({ onValue }: { onValue: (value: BillingContextValue) => void }) {
  const value = useBilling();
  useEffect(() => { onValue(value); }, [onValue, value]);
  return null;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

let appStateListener: ((state: string) => void) | undefined;
let appStateSubscription: { remove: jest.Mock };

beforeEach(() => {
  appStateListener = undefined;
  appStateSubscription = { remove: jest.fn() };
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    appStateListener = listener as (state: string) => void;
    return appStateSubscription;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('loads billing, subscribes to customer updates, and refreshes when foregrounded', async () => {
  let billing: BillingContextValue | undefined;
  let customerUpdate: ((snapshot: BillingSnapshot) => void) | undefined;
  const service = createBillingService({
    subscribe: jest.fn((listener) => {
      customerUpdate = listener;
      return () => undefined;
    }),
  });

  render(<BillingProvider service={service}><BillingProbe onValue={(value) => { billing = value; }} /></BillingProvider>);

  expect(billing?.entitlementStatus).toBe('loading');
  expect(billing?.identityStatus).toBe('loading');
  await waitFor(() => expect(billing?.entitlementStatus).toBe('pro'));
  expect(billing?.entitlementActive).toBe(true);
  expect(billing?.identityStatus).toBe('ready');
  expect(billing?.appUserId).toBe('$RCAnonymousID:test-user');
  expect(service.subscribe).toHaveBeenCalledTimes(1);

  act(() => { customerUpdate?.(freeSnapshot); });
  await waitFor(() => expect(billing?.entitlementStatus).toBe('free'));
  expect(billing?.entitlementActive).toBe(false);

  act(() => { appStateListener?.('active'); });
  await waitFor(() => expect(service.load).toHaveBeenCalledTimes(2));
});

it('marks billing identity unavailable when RevenueCat cannot provide a pseudonymous ID', async () => {
  let billing: BillingContextValue | undefined;
  const service = createBillingService({ getAppUserId: jest.fn().mockResolvedValue(null) });

  render(<BillingProvider service={service}><BillingProbe onValue={(value) => { billing = value; }} /></BillingProvider>);

  await waitFor(() => expect(billing?.identityStatus).toBe('unavailable'));
  expect(billing?.appUserId).toBeNull();
});

it('keeps a verified billing identity when offerings are missing', async () => {
  let billing: BillingContextValue | undefined;
  const service = createBillingService({
    load: jest.fn().mockResolvedValue({ availability: 'unavailable', entitlementStatus: 'free', products: [] }),
  });

  render(<BillingProvider service={service}><BillingProbe onValue={(value) => { billing = value; }} /></BillingProvider>);

  await waitFor(() => expect(billing?.entitlementStatus).toBe('free'));
  expect(billing?.availability).toBe('unavailable');
  expect(billing?.identityStatus).toBe('ready');
  expect(billing?.appUserId).toBe('$RCAnonymousID:test-user');
});

it('keeps a verified billing identity after the user cancels a purchase', async () => {
  let billing: BillingContextValue | undefined;
  const service = createBillingService({
    purchase: jest.fn().mockRejectedValue(new PurchaseCancelledError()),
  });

  render(<BillingProvider service={service}><BillingProbe onValue={(value) => { billing = value; }} /></BillingProvider>);
  await waitFor(() => expect(billing?.identityStatus).toBe('ready'));

  await act(async () => { await billing?.purchase('com.avinashamanchi.convoautopsy.pro.monthly'); });

  expect(billing?.identityStatus).toBe('ready');
  expect(billing?.appUserId).toBe('$RCAnonymousID:test-user');
  expect(billing?.message).toBeNull();
});

it('preserves the previous entitlement when a foreground refresh fails', async () => {
  let billing: BillingContextValue | undefined;
  const service = createBillingService({
    load: jest.fn().mockResolvedValueOnce(proSnapshot).mockRejectedValueOnce(new Error('network unavailable')),
  });

  render(<BillingProvider service={service}><BillingProbe onValue={(value) => { billing = value; }} /></BillingProvider>);
  await waitFor(() => expect(billing?.entitlementStatus).toBe('pro'));

  act(() => { appStateListener?.('active'); });

  await waitFor(() => expect(billing?.message).toBe('Could not refresh billing.'));
  expect(billing?.entitlementStatus).toBe('pro');
  expect(billing?.identityStatus).toBe('ready');
  expect(billing?.appUserId).toBe('$RCAnonymousID:test-user');
});

it('does not clear a verified identity while a foreground reload is pending', async () => {
  let billing: BillingContextValue | undefined;
  const pendingReload = deferred<BillingSnapshot>();
  const service = createBillingService({
    load: jest.fn().mockResolvedValueOnce(proSnapshot).mockReturnValueOnce(pendingReload.promise),
  });

  render(<BillingProvider service={service}><BillingProbe onValue={(value) => { billing = value; }} /></BillingProvider>);
  await waitFor(() => expect(billing?.identityStatus).toBe('ready'));

  act(() => { appStateListener?.('active'); });
  await waitFor(() => expect(service.load).toHaveBeenCalledTimes(2));

  expect(billing?.identityStatus).toBe('ready');
  expect(billing?.appUserId).toBe('$RCAnonymousID:test-user');
  await act(async () => { pendingReload.resolve(proSnapshot); });
});

it('stops the initial reload when unmounted before billing finishes loading', async () => {
  let resolveLoad: ((snapshot: BillingSnapshot) => void) | undefined;
  const load = jest.fn(() => new Promise<BillingSnapshot>((resolve) => { resolveLoad = resolve; }));
  const service = createBillingService({ load });
  const rendered = render(<BillingProvider service={service}><BillingProbe onValue={() => undefined} /></BillingProvider>);
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

  rendered.unmount();
  await act(async () => { resolveLoad?.(proSnapshot); });

  expect(service.getAppUserId).not.toHaveBeenCalled();
  expect(service.subscribe).not.toHaveBeenCalled();
  expect(appStateSubscription.remove).toHaveBeenCalledTimes(1);
});

it('waits for a purchase to finish before starting a restore', async () => {
  let billing: BillingContextValue | undefined;
  let resolvePurchase: ((snapshot: BillingSnapshot) => void) | undefined;
  const purchase = jest.fn(() => new Promise<BillingSnapshot>((resolve) => { resolvePurchase = resolve; }));
  const restore = jest.fn().mockResolvedValue(freeSnapshot);
  const service = createBillingService({ purchase, restore });

  render(<BillingProvider service={service}><BillingProbe onValue={(value) => { billing = value; }} /></BillingProvider>);
  await waitFor(() => expect(billing?.availability).toBe('ready'));

  let purchasePromise: Promise<void> | undefined;
  let restorePromise: Promise<void> | undefined;
  await act(async () => {
    purchasePromise = billing?.purchase('com.avinashamanchi.convoautopsy.pro.monthly');
    restorePromise = billing?.restore();
    await Promise.resolve();
  });
  expect(purchase).toHaveBeenCalledTimes(1);
  expect(restore).not.toHaveBeenCalled();

  await act(async () => { resolvePurchase?.(proSnapshot); await purchasePromise; });
  await restorePromise;
  expect(restore).toHaveBeenCalledTimes(1);
});

it('serializes a foreground reload before a purchase so stale Free cannot finish last', async () => {
  let billing: BillingContextValue | undefined;
  const pendingReload = deferred<BillingSnapshot>();
  const pendingPurchase = deferred<BillingSnapshot>();
  const purchase = jest.fn(() => pendingPurchase.promise);
  const service = createBillingService({
    load: jest.fn().mockResolvedValueOnce(freeSnapshot).mockReturnValueOnce(pendingReload.promise),
    purchase,
  });

  render(<BillingProvider service={service}><BillingProbe onValue={(value) => { billing = value; }} /></BillingProvider>);
  await waitFor(() => expect(billing?.entitlementStatus).toBe('free'));

  act(() => { appStateListener?.('active'); });
  await waitFor(() => expect(service.load).toHaveBeenCalledTimes(2));
  let purchasePromise: Promise<void> | undefined;
  act(() => { purchasePromise = billing?.purchase('com.avinashamanchi.convoautopsy.pro.monthly'); });
  await act(async () => { await Promise.resolve(); });
  expect(purchase).not.toHaveBeenCalled();

  await act(async () => { pendingReload.resolve(freeSnapshot); });
  await waitFor(() => expect(purchase).toHaveBeenCalledTimes(1));
  await act(async () => { pendingPurchase.resolve(proSnapshot); await purchasePromise; });
  expect(billing?.entitlementStatus).toBe('pro');
});

it('does not let a subscriber update queued during purchase overwrite completed Pro', async () => {
  let billing: BillingContextValue | undefined;
  let customerUpdate: ((snapshot: BillingSnapshot) => void) | undefined;
  const purchaseIdentity = deferred<string | null>();
  const service = createBillingService({
    load: jest.fn().mockResolvedValue(freeSnapshot),
    purchase: jest.fn().mockResolvedValue(proSnapshot),
    getAppUserId: jest.fn()
      .mockResolvedValueOnce('$RCAnonymousID:test-user')
      .mockReturnValueOnce(purchaseIdentity.promise),
    subscribe: jest.fn((listener) => {
      customerUpdate = listener;
      return () => undefined;
    }),
  });

  render(<BillingProvider service={service}><BillingProbe onValue={(value) => { billing = value; }} /></BillingProvider>);
  await waitFor(() => expect(billing?.entitlementStatus).toBe('free'));

  let purchasePromise: Promise<void> | undefined;
  act(() => { purchasePromise = billing?.purchase('com.avinashamanchi.convoautopsy.pro.monthly'); });
  await waitFor(() => expect(service.getAppUserId).toHaveBeenCalledTimes(2));
  expect(billing?.entitlementStatus).toBe('pro');
  act(() => { customerUpdate?.(freeSnapshot); });
  await act(async () => { purchaseIdentity.resolve('$RCAnonymousID:test-user'); await purchasePromise; });

  expect(billing?.entitlementStatus).toBe('pro');
});

it('does not let a subscriber entitlement callback roll a freshly loaded product catalog backward', async () => {
  let billing: BillingContextValue | undefined;
  let customerUpdate: ((snapshot: BillingSnapshot) => void) | undefined;
  const pendingReload = deferred<BillingSnapshot>();
  const oldCatalog: BillingSnapshot = {
    availability: 'ready',
    entitlementStatus: 'free',
    products: [{ id: 'com.avinashamanchi.convoautopsy.pro.monthly', title: 'Old monthly', localizedPrice: '$7.99', period: 'monthly' }],
  };
  const freshCatalog: BillingSnapshot = {
    availability: 'ready',
    entitlementStatus: 'free',
    products: [{ id: 'com.avinashamanchi.convoautopsy.pro.annual', title: 'Fresh annual', localizedPrice: '$59.99', period: 'annual' }],
  };
  const service = createBillingService({
    load: jest.fn().mockResolvedValueOnce(oldCatalog).mockReturnValueOnce(pendingReload.promise),
    subscribe: jest.fn((listener) => {
      customerUpdate = listener;
      return () => undefined;
    }),
  });

  render(<BillingProvider service={service}><BillingProbe onValue={(value) => { billing = value; }} /></BillingProvider>);
  await waitFor(() => expect(billing?.products[0]?.title).toBe('Old monthly'));
  act(() => { appStateListener?.('active'); });
  await waitFor(() => expect(service.load).toHaveBeenCalledTimes(2));
  act(() => { customerUpdate?.(oldCatalog); });
  await act(async () => { pendingReload.resolve(freshCatalog); });

  await waitFor(() => expect(billing?.products[0]?.title).toBe('Fresh annual'));
  expect(billing?.products).toEqual(freshCatalog.products);
});

it('keeps response billing identity behind BillingProvider with no direct purchases import', async () => {
  const source = await readFile(join(process.cwd(), 'app/response/[reportId].tsx'), 'utf8');

  expect(source).toContain("from '../../src/billing/BillingProvider'");
  expect(source).not.toMatch(/import\(['"]react-native-purchases['"]\)|from ['"]react-native-purchases['"]/);
});
