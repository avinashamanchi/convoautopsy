import Constants from 'expo-constants';
import type { BillingProduct, BillingService, BillingSnapshot } from './contracts';

type RevenueCatCustomerInfo = {
  entitlements: { active: Record<string, unknown> };
};

type RevenueCatPackage = {
  product: { identifier: string; title: string; priceString: string };
};

export type RevenueCatModule = {
  configure(configuration: { apiKey: string }): void;
  getOfferings(): Promise<{ current: { availablePackages: readonly RevenueCatPackage[] } | null }>;
  getCustomerInfo(): Promise<RevenueCatCustomerInfo>;
  getAppUserID(): Promise<string>;
  purchasePackage(aPackage: RevenueCatPackage): Promise<{ customerInfo: RevenueCatCustomerInfo }>;
  restorePurchases(): Promise<RevenueCatCustomerInfo>;
  addCustomerInfoUpdateListener(listener: (customerInfo: RevenueCatCustomerInfo) => void): void;
  removeCustomerInfoUpdateListener(listener: (customerInfo: RevenueCatCustomerInfo) => void): boolean;
};

type RevenueCatBillingServiceOptions = {
  apiKey: string | undefined;
  entitlementId: string;
  productIds: readonly string[];
  executionEnvironment?: string | null;
  moduleLoader?: () => Promise<RevenueCatModule>;
};

const unavailableSnapshot: BillingSnapshot = {
  availability: 'unavailable',
  entitlementActive: false,
  products: [],
};

const previewSnapshot: BillingSnapshot = {
  availability: 'preview',
  entitlementActive: false,
  products: [],
};

export class PurchaseCancelledError extends Error {
  constructor() {
    super('Purchase cancelled.');
    this.name = 'PurchaseCancelledError';
  }
}

export class RevenueCatBillingService implements BillingService {
  private module: RevenueCatModule | null = null;
  private modulePromise: Promise<RevenueCatModule> | null = null;
  private snapshot: BillingSnapshot = unavailableSnapshot;
  private readonly packagesByProductId = new Map<string, RevenueCatPackage>();
  private readonly configuredProductIds: ReadonlySet<string>;
  private readonly moduleLoader: () => Promise<RevenueCatModule>;

  constructor(private readonly options: RevenueCatBillingServiceOptions) {
    this.configuredProductIds = new Set(options.productIds);
    this.moduleLoader = options.moduleLoader ?? (async () => (await import('react-native-purchases')).default);
  }

  async load(): Promise<BillingSnapshot> {
    if (this.isPreview()) {
      this.snapshot = previewSnapshot;
      return this.snapshot;
    }

    const revenueCat = await this.getModule();
    if (!revenueCat) {
      this.snapshot = unavailableSnapshot;
      return this.snapshot;
    }

    const [offerings, customerInfo] = await Promise.all([
      revenueCat.getOfferings(),
      revenueCat.getCustomerInfo(),
    ]);
    this.packagesByProductId.clear();
    const products = (offerings.current?.availablePackages ?? [])
      .filter((item) => this.configuredProductIds.has(item.product.identifier))
      .map((item) => {
        this.packagesByProductId.set(item.product.identifier, item);
        return this.toBillingProduct(item);
      });

    this.snapshot = {
      availability: products.length > 0 ? 'ready' : 'unavailable',
      entitlementActive: this.isEntitlementActive(customerInfo),
      products,
    };
    return this.snapshot;
  }

  async purchase(productId: string): Promise<BillingSnapshot> {
    const revenueCat = await this.requireModule();
    if (!this.packagesByProductId.has(productId)) {
      await this.load();
    }
    const packageToPurchase = this.packagesByProductId.get(productId);
    if (!packageToPurchase) {
      throw new Error('This subscription is not currently available.');
    }

    try {
      const result = await revenueCat.purchasePackage(packageToPurchase);
      return this.applyCustomerInfo(result.customerInfo);
    } catch (error) {
      if (this.isCancellation(error)) {
        throw new PurchaseCancelledError();
      }
      throw error;
    }
  }

  async restore(): Promise<BillingSnapshot> {
    const revenueCat = await this.requireModule();
    return this.applyCustomerInfo(await revenueCat.restorePurchases());
  }

  subscribe(listener: (snapshot: BillingSnapshot) => void): () => void {
    if (!this.module) {
      return () => undefined;
    }
    const nativeListener = (customerInfo: RevenueCatCustomerInfo) => {
      listener(this.applyCustomerInfo(customerInfo));
    };
    this.module.addCustomerInfoUpdateListener(nativeListener);
    return () => { this.module?.removeCustomerInfoUpdateListener(nativeListener); };
  }

  async getAppUserId(): Promise<string | null> {
    const revenueCat = await this.getModule();
    return revenueCat ? revenueCat.getAppUserID() : null;
  }

  private async requireModule(): Promise<RevenueCatModule> {
    const revenueCat = await this.getModule();
    if (!revenueCat) {
      throw new Error('Billing is not available in this environment.');
    }
    return revenueCat;
  }

  private async getModule(): Promise<RevenueCatModule | null> {
    if (this.isPreview() || !this.options.apiKey) {
      return null;
    }
    if (!this.modulePromise) {
      this.modulePromise = this.moduleLoader()
        .then((module) => {
          module.configure({ apiKey: this.options.apiKey! });
          this.module = module;
          return module;
        })
        .catch((error: unknown) => {
          this.modulePromise = null;
          throw error;
        });
    }
    return this.modulePromise;
  }

  private applyCustomerInfo(customerInfo: RevenueCatCustomerInfo): BillingSnapshot {
    this.snapshot = {
      ...this.snapshot,
      entitlementActive: this.isEntitlementActive(customerInfo),
    };
    return this.snapshot;
  }

  private isEntitlementActive(customerInfo: RevenueCatCustomerInfo): boolean {
    return Boolean(customerInfo.entitlements.active[this.options.entitlementId]);
  }

  private isPreview(): boolean {
    return this.options.executionEnvironment === 'storeClient';
  }

  private toBillingProduct(item: RevenueCatPackage): BillingProduct {
    return {
      id: item.product.identifier,
      title: item.product.title,
      localizedPrice: item.product.priceString,
    };
  }

  private isCancellation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'userCancelled' in error
      && (error as { userCancelled?: unknown }).userCancelled === true;
  }
}

export function createRevenueCatBillingService(options: Omit<RevenueCatBillingServiceOptions, 'executionEnvironment'>): RevenueCatBillingService {
  return new RevenueCatBillingService({ ...options, executionEnvironment: Constants.executionEnvironment });
}
