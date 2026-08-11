export type BillingAvailability = 'ready' | 'preview' | 'unavailable';
export type EntitlementStatus = 'loading' | 'unknown' | 'free' | 'pro';
export type VerifiedEntitlementStatus = Extract<EntitlementStatus, 'free' | 'pro'>;
export type ServiceEntitlementStatus = Exclude<EntitlementStatus, 'loading'>;
export type BillingPeriod = 'monthly' | 'annual';
export type BillingProduct = Readonly<{ id: string; title: string; localizedPrice: string; period: BillingPeriod }>;
export type BillingSnapshot = Readonly<{
  availability: BillingAvailability;
  entitlementStatus: ServiceEntitlementStatus;
  products: readonly BillingProduct[];
}>;
export const CONVO_PRO_ENTITLEMENT = 'convo_pro';
export const CONVO_PRO_PRODUCT_IDS = Object.freeze([
  'com.avinashamanchi.convoautopsy.pro.monthly',
  'com.avinashamanchi.convoautopsy.pro.annual',
]);

export function billingPeriodForProductId(productId: string): BillingPeriod | null {
  if (productId === CONVO_PRO_PRODUCT_IDS[0]) return 'monthly';
  if (productId === CONVO_PRO_PRODUCT_IDS[1]) return 'annual';
  return null;
}

export interface BillingService {
  load(): Promise<BillingSnapshot>;
  purchase(productId: string): Promise<BillingSnapshot>;
  restore(): Promise<BillingSnapshot>;
  subscribe(listener: (snapshot: BillingSnapshot) => void): () => void;
  getAppUserId(): Promise<string | null>;
}
