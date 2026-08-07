import { AppState } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import {
  CONVO_PRO_ENTITLEMENT,
  CONVO_PRO_PRODUCT_IDS,
  type BillingAvailability,
  type BillingProduct,
  type BillingService,
  type BillingSnapshot,
} from './contracts';
import { PurchaseCancelledError, createRevenueCatBillingService } from './revenueCatService';

export type BillingContextValue = {
  availability: BillingAvailability;
  entitlementActive: boolean;
  products: readonly BillingProduct[];
  busy: boolean;
  message: string | null;
  appUserId: string | null;
  purchase(productId: string): Promise<void>;
  restore(): Promise<void>;
  reload(): Promise<void>;
};

const initialSnapshot: BillingSnapshot = { availability: 'unavailable', entitlementActive: false, products: [] };
const BillingContext = createContext<BillingContextValue | null>(null);

const appBillingService = createRevenueCatBillingService({
  apiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
  entitlementId: CONVO_PRO_ENTITLEMENT,
  productIds: CONVO_PRO_PRODUCT_IDS,
});

export function BillingProvider({ children, service = appBillingService }: PropsWithChildren<{ service?: BillingService }>) {
  const [snapshot, setSnapshot] = useState<BillingSnapshot>(initialSnapshot);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [appUserId, setAppUserId] = useState<string | null>(null);
  const operation = useRef(Promise.resolve());

  const applySnapshot = useCallback((next: BillingSnapshot) => {
    setSnapshot(next);
  }, []);

  const reload = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await service.load();
      applySnapshot(next);
      setAppUserId(await service.getAppUserId());
    } catch {
      setMessage('Could not refresh billing.');
    } finally {
      setBusy(false);
    }
  }, [applySnapshot, service]);

  const runExclusive = useCallback((work: () => Promise<BillingSnapshot>) => {
    const next = operation.current.catch(() => undefined).then(async () => {
      setBusy(true);
      setMessage(null);
      try {
        applySnapshot(await work());
        setAppUserId(await service.getAppUserId());
      } catch (error) {
        if (!(error instanceof PurchaseCancelledError)) {
          setMessage('Could not update billing.');
        }
      } finally {
        setBusy(false);
      }
    });
    operation.current = next;
    return next;
  }, [applySnapshot, service]);

  const purchase = useCallback((productId: string) => runExclusive(() => service.purchase(productId)), [runExclusive, service]);
  const restore = useCallback(() => runExclusive(() => service.restore()), [runExclusive, service]);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: () => void = () => undefined;
    void (async () => {
      await reload();
      if (mounted) {
        unsubscribe = service.subscribe((next) => { applySnapshot(next); });
      }
    })();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void reload();
      }
    });
    return () => {
      mounted = false;
      unsubscribe();
      appStateSubscription.remove();
    };
  }, [applySnapshot, reload, service]);

  return (
    <BillingContext.Provider value={{ ...snapshot, busy, message, appUserId, purchase, restore, reload }}>
      {children}
    </BillingContext.Provider>
  );
}

export function useBilling(): BillingContextValue {
  const billing = useContext(BillingContext);
  if (!billing) {
    throw new Error('useBilling must be used within BillingProvider');
  }
  return billing;
}
