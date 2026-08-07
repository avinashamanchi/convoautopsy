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
  identityStatus: 'loading' | 'ready' | 'unavailable';
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
  const [identityStatus, setIdentityStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const operation = useRef(Promise.resolve());
  const mountedRef = useRef(true);
  const reloadGeneration = useRef(0);

  const applySnapshot = useCallback((next: BillingSnapshot) => {
    setSnapshot(next);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      reloadGeneration.current += 1;
    };
  }, []);

  const reload = useCallback(async () => {
    const generation = reloadGeneration.current + 1;
    reloadGeneration.current = generation;
    if (!mountedRef.current) {
      return;
    }
    setBusy(true);
    setMessage(null);
    setAppUserId(null);
    setIdentityStatus('loading');
    try {
      const next = await service.load();
      if (!mountedRef.current || generation !== reloadGeneration.current) {
        return;
      }
      applySnapshot(next);
      const nextAppUserId = next.availability === 'ready' ? await service.getAppUserId() : null;
      if (mountedRef.current && generation === reloadGeneration.current) {
        const validIdentity = validAppUserId(nextAppUserId);
        setAppUserId(validIdentity);
        setIdentityStatus(validIdentity ? 'ready' : 'unavailable');
      }
    } catch {
      if (mountedRef.current && generation === reloadGeneration.current) {
        setAppUserId(null);
        setIdentityStatus('unavailable');
        setMessage('Could not refresh billing.');
      }
    } finally {
      if (mountedRef.current && generation === reloadGeneration.current) {
        setBusy(false);
      }
    }
  }, [applySnapshot, service]);

  const runExclusive = useCallback((work: () => Promise<BillingSnapshot>) => {
    const next = operation.current.catch(() => undefined).then(async () => {
      setBusy(true);
      setMessage(null);
      try {
        const nextSnapshot = await work();
        applySnapshot(nextSnapshot);
        const nextAppUserId = nextSnapshot.availability === 'ready' ? await service.getAppUserId() : null;
        const validIdentity = validAppUserId(nextAppUserId);
        setAppUserId(validIdentity);
        setIdentityStatus(validIdentity ? 'ready' : 'unavailable');
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
        unsubscribe = service.subscribe((next) => {
          applySnapshot(next);
          if (next.availability !== 'ready') {
            setAppUserId(null);
            setIdentityStatus('unavailable');
          }
        });
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
    <BillingContext.Provider value={{ ...snapshot, busy, message, appUserId, identityStatus, purchase, restore, reload }}>
      {children}
    </BillingContext.Provider>
  );
}

function validAppUserId(value: string | null): string | null {
  return typeof value === 'string' && value.trim().length > 0 && Array.from(value).length <= 100 ? value : null;
}

export function useBilling(): BillingContextValue {
  const billing = useContext(BillingContext);
  if (!billing) {
    throw new Error('useBilling must be used within BillingProvider');
  }
  return billing;
}
