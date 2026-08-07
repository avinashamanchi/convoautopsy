import {
  PurchaseCancelledError,
  RevenueCatBillingService,
  type RevenueCatModule,
} from '../src/billing/revenueCatService';

const monthlyId = 'com.avinashamanchi.convoautopsy.pro.monthly';
const annualId = 'com.avinashamanchi.convoautopsy.pro.annual';

function createRevenueCatFake(overrides: Partial<RevenueCatModule> = {}): RevenueCatModule {
  return {
    configure: jest.fn(),
    getOfferings: jest.fn().mockResolvedValue({
      current: {
        availablePackages: [
          { product: { identifier: monthlyId, title: 'Convo Pro Monthly', priceString: '$7.99' } },
          { product: { identifier: annualId, title: 'Convo Pro Annual', priceString: 'CA$59.99' } },
          { product: { identifier: 'unconfigured.product', title: 'Other', priceString: '$1.99' } },
        ],
      },
    }),
    getCustomerInfo: jest.fn().mockResolvedValue({ entitlements: { active: { convo_pro: {} } } }),
    getAppUserID: jest.fn().mockResolvedValue('$RCAnonymousID:test-user'),
    purchasePackage: jest.fn().mockResolvedValue({ customerInfo: { entitlements: { active: { convo_pro: {} } } } }),
    restorePurchases: jest.fn().mockResolvedValue({ entitlements: { active: {} } }),
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
    ...overrides,
  };
}

it('maps only configured products and reads convo_pro entitlement', async () => {
  const fakeRevenueCat = createRevenueCatFake();
  const service = new RevenueCatBillingService({
    apiKey: 'appl_public',
    entitlementId: 'convo_pro',
    productIds: [monthlyId, annualId],
    executionEnvironment: 'standalone',
    moduleLoader: async () => fakeRevenueCat,
  });

  await expect(service.load()).resolves.toMatchObject({
    availability: 'ready',
    entitlementActive: true,
    products: [
      { id: monthlyId, localizedPrice: '$7.99', period: 'monthly' },
      { id: annualId, localizedPrice: 'CA$59.99', period: 'annual' },
    ],
  });
  await expect(service.getAppUserId()).resolves.toBe('$RCAnonymousID:test-user');
  expect(fakeRevenueCat.configure).toHaveBeenCalledTimes(1);
  expect(fakeRevenueCat.configure).toHaveBeenCalledWith({ apiKey: 'appl_public' });
});

it('treats Expo Go as preview without loading the native module', async () => {
  const loader = jest.fn();
  const service = new RevenueCatBillingService({
    apiKey: 'appl_public',
    entitlementId: 'convo_pro',
    productIds: [],
    executionEnvironment: 'storeClient',
    moduleLoader: loader,
  });

  await expect(service.load()).resolves.toMatchObject({ availability: 'preview' });
  expect(loader).not.toHaveBeenCalled();
});

it('configures the native module only once while concurrent requests start', async () => {
  const fakeRevenueCat = createRevenueCatFake();
  const loader = jest.fn().mockResolvedValue(fakeRevenueCat);
  const service = new RevenueCatBillingService({
    apiKey: 'appl_public',
    entitlementId: 'convo_pro',
    productIds: [monthlyId],
    executionEnvironment: 'standalone',
    moduleLoader: loader,
  });

  await Promise.all([service.load(), service.getAppUserId()]);

  expect(loader).toHaveBeenCalledTimes(1);
  expect(fakeRevenueCat.configure).toHaveBeenCalledTimes(1);
});

it('marks an empty configured offering as unavailable', async () => {
  const fakeRevenueCat = createRevenueCatFake({
    getOfferings: jest.fn().mockResolvedValue({ current: { availablePackages: [] } }),
  });
  const service = new RevenueCatBillingService({
    apiKey: 'appl_public',
    entitlementId: 'convo_pro',
    productIds: [monthlyId],
    executionEnvironment: 'standalone',
    moduleLoader: async () => fakeRevenueCat,
  });

  await expect(service.load()).resolves.toMatchObject({ availability: 'unavailable', products: [] });
});

it('turns a native purchase cancellation into a PurchaseCancelledError', async () => {
  const fakeRevenueCat = createRevenueCatFake({
    purchasePackage: jest.fn().mockRejectedValue({ userCancelled: true, message: 'Cancelled' }),
  });
  const service = new RevenueCatBillingService({
    apiKey: 'appl_public',
    entitlementId: 'convo_pro',
    productIds: [monthlyId],
    executionEnvironment: 'standalone',
    moduleLoader: async () => fakeRevenueCat,
  });

  await service.load();

  await expect(service.purchase(monthlyId)).rejects.toBeInstanceOf(PurchaseCancelledError);
});

it('keeps a pre-initialization subscription active until it is unsubscribed', async () => {
  let nativeListener: Parameters<RevenueCatModule['addCustomerInfoUpdateListener']>[0] | undefined;
  const fakeRevenueCat = createRevenueCatFake({
    addCustomerInfoUpdateListener: jest.fn((listener) => { nativeListener = listener; }),
  });
  const service = new RevenueCatBillingService({
    apiKey: 'appl_public',
    entitlementId: 'convo_pro',
    productIds: [monthlyId],
    executionEnvironment: 'standalone',
    moduleLoader: async () => fakeRevenueCat,
  });
  const listener = jest.fn();

  const unsubscribe = service.subscribe(listener);
  await service.load();

  nativeListener?.({ entitlements: { active: {} } });

  expect(listener).toHaveBeenCalledWith({
    availability: 'ready',
    entitlementActive: false,
    products: [
      { id: monthlyId, title: 'Convo Pro Monthly', localizedPrice: '$7.99', period: 'monthly' },
    ],
  });

  unsubscribe();

  expect(fakeRevenueCat.removeCustomerInfoUpdateListener).toHaveBeenCalledWith(nativeListener);
});
