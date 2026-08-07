import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useBilling } from '../src/billing/BillingProvider';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { Screen } from '../src/components/Screen';
import { tokens } from '../src/theme/tokens';

type PurchaseOutcome = 'idle' | 'purchasing' | 'finishing' | 'cancelled' | 'success' | 'failed';
type RestoreOutcome = 'idle' | 'restoring' | 'finishing' | 'success' | 'none' | 'failed';

export default function UpgradeScreen() {
  const { availability, busy, entitlementActive, message, products, purchase, restore } = useBilling();
  const [purchaseOutcome, setPurchaseOutcome] = useState<PurchaseOutcome>('idle');
  const [restoreOutcome, setRestoreOutcome] = useState<RestoreOutcome>('idle');
  const [billingActionActive, setBillingActionActive] = useState(false);
  const billingActionLock = useRef(false);

  useEffect(() => {
    if (purchaseOutcome !== 'finishing' || busy) return;
    setPurchaseOutcome(entitlementActive ? 'success' : message ? 'failed' : 'cancelled');
  }, [busy, entitlementActive, message, purchaseOutcome]);

  useEffect(() => {
    if (restoreOutcome !== 'finishing' || busy) return;
    setRestoreOutcome(entitlementActive ? 'success' : message ? 'failed' : 'none');
  }, [busy, entitlementActive, message, restoreOutcome]);

  const chooseProduct = async (productId: string) => {
    if (billingActionLock.current) return;
    billingActionLock.current = true;
    setBillingActionActive(true);
    setRestoreOutcome('idle');
    setPurchaseOutcome('purchasing');
    try {
      await purchase(productId);
      setPurchaseOutcome('finishing');
    } finally {
      billingActionLock.current = false;
      setBillingActionActive(false);
    }
  };

  const restorePurchases = async () => {
    if (billingActionLock.current) return;
    billingActionLock.current = true;
    setBillingActionActive(true);
    setPurchaseOutcome('idle');
    setRestoreOutcome('restoring');
    try {
      await restore();
      setRestoreOutcome('finishing');
    } finally {
      billingActionLock.current = false;
      setBillingActionActive(false);
    }
  };

  const billingActionsDisabled = busy || billingActionActive;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Convo Pro</Text>
        <Text style={styles.copy}>Unlock unlimited saved analyses while keeping your conversations on this device.</Text>
        {entitlementActive ? <Text accessibilityLiveRegion="polite" style={styles.success}>Convo Pro is active.</Text> : null}
        {availability === 'ready' ? products.map((product) => (
          <View key={product.id} style={styles.product}>
            <Text style={styles.productTitle}>{product.title}</Text>
            <Text style={styles.price}>{product.localizedPrice}</Text>
            <PrimaryButton
              disabled={billingActionsDisabled}
              label={`Choose ${product.title} for ${product.localizedPrice}`}
              onPress={() => { void chooseProduct(product.id); }}
            />
          </View>
        )) : null}
        {availability === 'preview' ? <Text style={styles.notice}>Purchases are available in the App Store version of ConvoAutopsy.</Text> : null}
        {availability === 'unavailable' ? <Text accessibilityRole="alert" style={styles.notice}>Purchases are temporarily unavailable.</Text> : null}
        {availability !== 'ready' && busy ? <ActivityIndicator accessibilityLabel="Loading subscriptions" color={tokens.colors.accent} /> : null}
        {purchaseOutcome === 'purchasing' || purchaseOutcome === 'finishing' ? <Text accessibilityLiveRegion="polite" style={styles.notice}>Completing purchase…</Text> : null}
        {purchaseOutcome === 'cancelled' ? <Text accessibilityLiveRegion="polite" style={styles.notice}>Purchase cancelled. You can continue using the free plan.</Text> : null}
        {purchaseOutcome === 'success' ? <Text accessibilityLiveRegion="polite" style={styles.success}>Convo Pro is active.</Text> : null}
        {purchaseOutcome === 'failed' ? <Text accessibilityRole="alert" style={styles.error}>Could not complete purchase. Please try again.</Text> : null}
        {restoreOutcome === 'restoring' || restoreOutcome === 'finishing' ? <Text accessibilityLiveRegion="polite" style={styles.notice}>Restoring purchases…</Text> : null}
        {restoreOutcome === 'success' ? <Text accessibilityLiveRegion="polite" style={styles.success}>Purchases restored. Convo Pro is active.</Text> : null}
        {restoreOutcome === 'none' ? <Text accessibilityLiveRegion="polite" style={styles.notice}>No Convo Pro purchase was found for this App Store account.</Text> : null}
        {restoreOutcome === 'failed' ? <Text accessibilityRole="alert" style={styles.error}>Could not restore purchases. Please try again.</Text> : null}
        <PrimaryButton disabled={billingActionsDisabled} label={billingActionsDisabled && restoreOutcome !== 'idle' ? 'Restoring Purchases…' : 'Restore Purchases'} onPress={() => { void restorePurchases(); }} />
        <PrimaryButton label="Continue Free" onPress={() => router.back()} />
        <View style={styles.legal}>
          <PrimaryButton label="Privacy" onPress={() => router.push('/privacy')} />
          <PrimaryButton label="Terms of Use" onPress={() => router.push('/terms')} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: tokens.spacing.md, paddingBottom: tokens.spacing.xl },
  title: { color: tokens.colors.textPrimary, fontSize: 32, fontWeight: '700' },
  copy: { color: tokens.colors.textSecondary, fontSize: 16, lineHeight: 24 },
  product: { backgroundColor: tokens.colors.surface, borderRadius: tokens.radius.md, gap: tokens.spacing.sm, padding: tokens.spacing.md },
  productTitle: { color: tokens.colors.textPrimary, fontSize: 18, fontWeight: '700' },
  price: { color: tokens.colors.textSecondary, fontSize: 16 },
  notice: { color: tokens.colors.textSecondary, fontSize: 15, lineHeight: 22 },
  success: { color: tokens.colors.success, fontSize: 15, lineHeight: 22 },
  error: { color: tokens.colors.error, fontSize: 15, lineHeight: 22 },
  legal: { gap: tokens.spacing.sm },
});
