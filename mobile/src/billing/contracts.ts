export type BillingAvailability = 'ready' | 'preview' | 'unavailable';
export type BillingProduct = Readonly<{ id: string; title: string; localizedPrice: string }>;
export type BillingSnapshot = Readonly<{ availability: BillingAvailability; entitlementActive: boolean; products: readonly BillingProduct[] }>;
export const CONVO_PRO_ENTITLEMENT = 'convo_pro';
export const CONVO_PRO_PRODUCT_IDS = Object.freeze([
  'com.avinashamanchi.convoautopsy.pro.monthly',
  'com.avinashamanchi.convoautopsy.pro.annual',
]);

export interface BillingService {
  load(): Promise<BillingSnapshot>;
  purchase(productId: string): Promise<BillingSnapshot>;
  restore(): Promise<BillingSnapshot>;
  subscribe(listener: (snapshot: BillingSnapshot) => void): () => void;
  getAppUserId(): Promise<string | null>;
}
