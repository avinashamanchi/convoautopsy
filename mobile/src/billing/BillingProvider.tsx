import { AppState } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import {
  CONVO_PRO_ENTITLEMENT,
  CONVO_PRO_PRODUCT_IDS,
  type BillingAvailability,
  type BillingProduct,
  type BillingService,
  type BillingSnapshot,
  type EntitlementStatus,
} from './contracts';
import { PurchaseCancelledError, createRevenueCatBillingService } from './revenueCatService';

export type BillingContextValue = {
  availability: BillingAvailability;
  entitlementStatus: EntitlementStatus;
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

type ProviderSnapshot = Readonly<{
  availability: BillingAvailability;
  entitlementStatus: EntitlementStatus;
  products: readonly BillingProduct[];
}>;

type OperationSource = 'reload' | 'purchase' | 'restore' | 'subscriber';

const initialSnapshot: ProviderSnapshot = {
  availability: 'unavailable',
  entitlementStatus: 'loading',
  products: [],
};
const BillingContext = createContext<BillingContextValue | null>(null);

const appBillingService = createRevenueCatBillingService({
  apiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
  entitlementId: CONVO_PRO_ENTITLEMENT,
  productIds: CONVO_PRO_PRODUCT_IDS,
});

export function BillingProvider({ children, service = appBillingService }: PropsWithChildren<{ service?: BillingService }>) {
  const [snapshot, setSnapshot] = useState<ProviderSnapshot>(initialSnapshot);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [appUserId, setAppUserId] = useState<string | null>(null);
  const [identityStatus, setIdentityStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const snapshotRef = useRef<ProviderSnapshot>(initialSnapshot);
  const identityRef = useRef<{ appUserId: string | null; status: 'loading' | 'ready' | 'unavailable' }>({
    appUserId: null,
    status: 'loading',
  });
  const operationTail = useRef(Promise.resolve());
  const operationSequence = useRef(0);
  const lastAppliedSequence = useRef(0);
  const proBarrierSequence = useRef(0);
  const pendingBusyOperations = useRef(0);
  const mountedRef = useRef(true);

  const commitSnapshot = useCallback((next: BillingSnapshot, sequence: number) => {
    if (!mountedRef.current || sequence <= lastAppliedSequence.current) return;
    const current = snapshotRef.current;
    if (current.entitlementStatus === 'pro'
      && next.entitlementStatus === 'free'
      && sequence <= proBarrierSequence.current) {
      lastAppliedSequence.current = sequence;
      return;
    }
    const entitlementStatus = next.entitlementStatus === 'unknown'
      && (current.entitlementStatus === 'free' || current.entitlementStatus === 'pro')
      ? current.entitlementStatus
      : next.entitlementStatus;
    const committed = { ...next, entitlementStatus };
    lastAppliedSequence.current = sequence;
    snapshotRef.current = committed;
    setSnapshot(committed);
  }, []);

  const markInitialEntitlementUnknown = useCallback(() => {
    if (!mountedRef.current || snapshotRef.current.entitlementStatus !== 'loading') return;
    const next = { ...snapshotRef.current, entitlementStatus: 'unknown' as const };
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  const refreshIdentity = useCallback(async () => {
    try {
      const nextAppUserId = validAppUserId(await service.getAppUserId());
      if (!mountedRef.current) return;
      if (nextAppUserId) {
        identityRef.current = { appUserId: nextAppUserId, status: 'ready' };
        setAppUserId(nextAppUserId);
        setIdentityStatus('ready');
      } else if (identityRef.current.status !== 'ready') {
        identityRef.current = { appUserId: null, status: 'unavailable' };
        setAppUserId(null);
        setIdentityStatus('unavailable');
      }
    } catch {
      if (mountedRef.current && identityRef.current.status !== 'ready') {
        identityRef.current = { appUserId: null, status: 'unavailable' };
        setAppUserId(null);
        setIdentityStatus('unavailable');
      }
    }
  }, [service]);

  const enqueue = useCallback((
    source: OperationSource,
    work: () => Promise<BillingSnapshot> | BillingSnapshot,
  ): Promise<void> => {
    const sequence = ++operationSequence.current;
    const tracksBusy = source !== 'subscriber';
    if (tracksBusy && mountedRef.current) {
      pendingBusyOperations.current += 1;
      setBusy(true);
    }
    const pending = operationTail.current.catch(() => undefined).then(async () => {
      if (!mountedRef.current) return;
      if (source !== 'subscriber') setMessage(null);
      let completedSnapshot: BillingSnapshot | null = null;
      try {
        completedSnapshot = await work();
        if (!mountedRef.current) return;
        commitSnapshot(completedSnapshot, sequence);
        if (source !== 'subscriber') await refreshIdentity();
        if (!mountedRef.current) return;
        if ((source === 'purchase' || source === 'restore') && completedSnapshot.entitlementStatus === 'pro') {
          proBarrierSequence.current = operationSequence.current;
        }
      } catch (error) {
        if (!mountedRef.current) return;
        if (source === 'reload') {
          markInitialEntitlementUnknown();
          await refreshIdentity();
          if (mountedRef.current) setMessage('Could not refresh billing.');
        } else if (!(error instanceof PurchaseCancelledError)) {
          setMessage('Could not update billing.');
        }
      } finally {
        if (tracksBusy) {
          pendingBusyOperations.current = Math.max(0, pendingBusyOperations.current - 1);
          if (mountedRef.current && pendingBusyOperations.current === 0) setBusy(false);
        }
      }
    });
    operationTail.current = pending;
    return pending;
  }, [commitSnapshot, markInitialEntitlementUnknown, refreshIdentity]);

  const reload = useCallback(() => enqueue('reload', () => service.load()), [enqueue, service]);
  const purchase = useCallback(
    (productId: string) => enqueue('purchase', () => service.purchase(productId)),
    [enqueue, service],
  );
  const restore = useCallback(() => enqueue('restore', () => service.restore()), [enqueue, service]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationSequence.current += 1;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: () => void = () => undefined;
    void (async () => {
      await reload();
      if (mounted && mountedRef.current) {
        unsubscribe = service.subscribe((next) => {
          void enqueue('subscriber', () => ({
            ...snapshotRef.current,
            entitlementStatus: next.entitlementStatus,
          }));
        });
      }
    })();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reload();
    });
    return () => {
      mounted = false;
      unsubscribe();
      appStateSubscription.remove();
    };
  }, [enqueue, reload, service]);

  return (
    <BillingContext.Provider value={{
      ...snapshot,
      entitlementActive: snapshot.entitlementStatus === 'pro',
      busy,
      message,
      appUserId,
      identityStatus,
      purchase,
      restore,
      reload,
    }}>
      {children}
    </BillingContext.Provider>
  );
}

function validAppUserId(value: string | null): string | null {
  return typeof value === 'string' && value.trim().length > 0 && Array.from(value).length <= 100 ? value : null;
}

export function useBilling(): BillingContextValue {
  const billing = useContext(BillingContext);
  if (!billing) throw new Error('useBilling must be used within BillingProvider');
  return billing;
}
