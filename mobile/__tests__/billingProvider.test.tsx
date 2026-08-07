import { act, render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useEffect } from 'react';
import { BillingProvider, useBilling, type BillingContextValue } from '../src/billing/BillingProvider';
import type { BillingService, BillingSnapshot } from '../src/billing/contracts';

const readySnapshot: BillingSnapshot = {
  availability: 'ready',
  entitlementActive: true,
  products: [{ id: 'com.avinashamanchi.convoautopsy.pro.monthly', title: 'Monthly', localizedPrice: '$7.99' }],
};

function createBillingService(overrides: Partial<BillingService> = {}): BillingService {
  return {
    load: jest.fn().mockResolvedValue(readySnapshot),
    purchase: jest.fn().mockResolvedValue(readySnapshot),
    restore: jest.fn().mockResolvedValue(readySnapshot),
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

  await waitFor(() => expect(billing?.entitlementActive).toBe(true));
  expect(service.subscribe).toHaveBeenCalledTimes(1);

  act(() => { customerUpdate?.({ ...readySnapshot, entitlementActive: false }); });
  await waitFor(() => expect(billing?.entitlementActive).toBe(false));

  act(() => { appStateListener?.('active'); });
  await waitFor(() => expect(service.load).toHaveBeenCalledTimes(2));
});

it('preserves the previous entitlement when a foreground refresh fails', async () => {
  let billing: BillingContextValue | undefined;
  const service = createBillingService({
    load: jest.fn().mockResolvedValueOnce(readySnapshot).mockRejectedValueOnce(new Error('network unavailable')),
  });

  render(<BillingProvider service={service}><BillingProbe onValue={(value) => { billing = value; }} /></BillingProvider>);
  await waitFor(() => expect(billing?.entitlementActive).toBe(true));

  act(() => { appStateListener?.('active'); });

  await waitFor(() => expect(billing?.message).toBe('Could not refresh billing.'));
  expect(billing?.entitlementActive).toBe(true);
});

it('stops the initial reload when unmounted before billing finishes loading', async () => {
  let resolveLoad: ((snapshot: BillingSnapshot) => void) | undefined;
  const load = jest.fn(() => new Promise<BillingSnapshot>((resolve) => { resolveLoad = resolve; }));
  const service = createBillingService({ load });
  const rendered = render(<BillingProvider service={service}><BillingProbe onValue={() => undefined} /></BillingProvider>);
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

  rendered.unmount();
  await act(async () => { resolveLoad?.(readySnapshot); });

  expect(service.getAppUserId).not.toHaveBeenCalled();
  expect(service.subscribe).not.toHaveBeenCalled();
  expect(appStateSubscription.remove).toHaveBeenCalledTimes(1);
});

it('waits for a purchase to finish before starting a restore', async () => {
  let billing: BillingContextValue | undefined;
  let resolvePurchase: ((snapshot: BillingSnapshot) => void) | undefined;
  const purchase = jest.fn(() => new Promise<BillingSnapshot>((resolve) => { resolvePurchase = resolve; }));
  const restore = jest.fn().mockResolvedValue({ ...readySnapshot, entitlementActive: false });
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

  await act(async () => { resolvePurchase?.(readySnapshot); await purchasePromise; });
  await restorePromise;
  expect(restore).toHaveBeenCalledTimes(1);
});
