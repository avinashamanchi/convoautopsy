import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useBilling } from '../src/billing/BillingProvider';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { Screen } from '../src/components/Screen';
import { legalLinks } from '../src/legal/links';
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
  const periodLabel = (period: 'monthly' | 'annual') => period === 'monthly' ? 'month' : 'year';

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Convo Pro</Text>
        <View style={styles.plan}>
          <Text accessibilityRole="header" style={styles.planTitle}>Free</Text>
          <Text style={styles.copy}>Unlimited on-device analyses and response drafts.</Text>
          <Text style={styles.copy}>Save up to 10 reports.</Text>
          <Text style={styles.copy}>Includes 3 remote AI analyses and 6 remote AI-assisted drafts per rolling 30 days.</Text>
        </View>
        <View style={styles.plan}>
          <Text accessibilityRole="header" style={styles.planTitle}>Convo Pro</Text>
          <Text style={styles.copy}>Unlimited on-device analyses and response drafts. Unlimited saved reports.</Text>
          <Text style={styles.copy}>Includes 75 remote AI analyses and 150 remote AI-assisted drafts per UTC calendar month.</Text>
        </View>
        <Text style={styles.copy}>Remote allowances are fair-use limits, are not credits, and do not roll over.</Text>
        {entitlementActive ? <Text accessibilityLiveRegion="polite" style={styles.success}>Convo Pro is active.</Text> : null}
        {availability === 'ready' ? products.map((product) => (
          <View key={product.id} style={styles.product}>
            <Text style={styles.productTitle}>{product.title}</Text>
            <Text style={styles.price}>{product.localizedPrice} / {periodLabel(product.period)}</Text>
            <PrimaryButton
              disabled={billingActionsDisabled}
              label={`Choose ${product.title} for ${product.localizedPrice} per ${periodLabel(product.period)}`}
              onPress={() => { void chooseProduct(product.id); }}
            />
          </View>
        )) : null}
        {availability === 'preview' ? <Text style={styles.notice}>Expo Go is preview-only for purchases. Use a development, TestFlight, or App Store build to buy or restore Convo Pro.</Text> : null}
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
        <Text style={styles.legalCopy}>Your Apple ID is charged when you confirm a purchase. A monthly or annual subscription automatically renews unless canceled at least 24 hours before the current billing period ends. Your Apple ID may be charged for renewal within 24 hours before the current period ends. Manage or cancel in your App Store account settings.</Text>
        <Text style={styles.legalCopy}>Uninstalling ConvoAutopsy or deleting app data does not cancel a subscription. Restore Purchases checks this App Store account for an eligible Convo Pro purchase.</Text>
        <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(legalLinks.manageSubscriptions); }} style={styles.externalLink}>
          <Text style={styles.externalLinkText}>Manage Apple subscription</Text>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(legalLinks.purchaseSupport); }} style={styles.externalLink}>
          <Text style={styles.externalLinkText}>Apple purchase and refund help</Text>
        </Pressable>
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
  plan: { backgroundColor: tokens.colors.surface, borderRadius: tokens.radius.md, gap: tokens.spacing.xs, padding: tokens.spacing.md },
  planTitle: { color: tokens.colors.textPrimary, fontSize: 20, fontWeight: '700' },
  copy: { color: tokens.colors.textSecondary, fontSize: 16, lineHeight: 24 },
  product: { backgroundColor: tokens.colors.surface, borderRadius: tokens.radius.md, gap: tokens.spacing.sm, padding: tokens.spacing.md },
  productTitle: { color: tokens.colors.textPrimary, fontSize: 18, fontWeight: '700' },
  price: { color: tokens.colors.textSecondary, fontSize: 16 },
  notice: { color: tokens.colors.textSecondary, fontSize: 15, lineHeight: 22 },
  success: { color: tokens.colors.success, fontSize: 15, lineHeight: 22 },
  error: { color: tokens.colors.error, fontSize: 15, lineHeight: 22 },
  externalLink: { justifyContent: 'center', minHeight: tokens.minTouchTarget },
  externalLinkText: { color: tokens.colors.accent, fontSize: 15, fontWeight: '700' },
  legalCopy: { color: tokens.colors.textSecondary, fontSize: 13, lineHeight: 19 },
  legal: { gap: tokens.spacing.sm },
});
