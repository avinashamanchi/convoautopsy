import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { Screen } from '../src/components/Screen';
import { legalLinks } from '../src/legal/links';
import { tokens } from '../src/theme/tokens';

export default function TermsScreen() {
  const [openFailed, setOpenFailed] = useState(false);
  const openTerms = async () => {
    setOpenFailed(false);
    try {
      await Linking.openURL(legalLinks.terms);
    } catch {
      setOpenFailed(true);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
        <Text accessibilityRole="header" style={styles.title}>Terms of Use</Text>
        <Text style={styles.copy}>ConvoAutopsy is an educational tool for personal reflection and is not medical, legal, relationship, crisis, or other professional advice. Its on-device estimates and optional AI output can be incomplete, biased, or wrong and are not factual conclusions about another person.</Text>
        <Text style={styles.copy}>Use only content you have the right to process. You are responsible for reviewing output and deciding whether, when, and how to communicate. Do not use ConvoAutopsy to harass, surveil, threaten, defame, violate privacy, or break the law.</Text>
        <Text style={styles.copy}>Do not rely on ConvoAutopsy in an emergency or when someone may be in danger. Contact appropriate local emergency or professional services.</Text>
        <Text style={styles.copy}>Monthly and annual subscriptions automatically renew unless canceled at least 24 hours before the current billing period ends. Your Apple ID is charged at confirmation and may be charged for renewal within 24 hours before the period ends. Manage or cancel in App Store account settings. Uninstalling the app or deleting app data does not cancel a subscription. Restore Purchases checks the current App Store account.</Text>
        <Text style={styles.copy}>The app and third-party services may be unavailable or change. To the extent permitted by law, ConvoAutopsy is provided as available without a promise of uninterrupted or error-free operation. Nothing here excludes rights or remedies that cannot legally be excluded.</Text>
        <Pressable accessibilityRole="link" onPress={() => { void openTerms(); }} style={styles.link}>
          <Text style={styles.linkText}>Open full Terms of Use</Text>
        </Pressable>
        {openFailed ? (
          <>
            <Text accessibilityRole="alert" style={styles.error}>Could not open the Terms of Use. Check your connection and try again.</Text>
            <Text selectable style={styles.url}>{legalLinks.terms}</Text>
            <PrimaryButton label="Retry opening Terms of Use" onPress={() => { void openTerms(); }} />
          </>
        ) : null}
        <PrimaryButton label="Back" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: tokens.spacing.md, paddingBottom: tokens.spacing.xl },
  title: { color: tokens.colors.textPrimary, fontSize: 30, fontWeight: '700' },
  copy: { color: tokens.colors.textSecondary, fontSize: 16, lineHeight: 24 },
  link: { justifyContent: 'center', minHeight: tokens.minTouchTarget },
  linkText: { color: tokens.colors.accent, fontSize: 15, fontWeight: '700' },
  error: { color: tokens.colors.error, fontSize: 15, lineHeight: 22 },
  url: { color: tokens.colors.textSecondary, fontSize: 14, lineHeight: 20 },
});
