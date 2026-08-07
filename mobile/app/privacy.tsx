import { router } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { Screen } from '../src/components/Screen';
import { tokens } from '../src/theme/tokens';

const PRIVACY_URL = 'https://avinashamanchi.github.io/convoautopsy/privacy.html';
const TERMS_URL = 'https://avinashamanchi.github.io/convoautopsy/terms.html';
const SUPPORT_URL = 'https://avinashamanchi.github.io/convoautopsy/support.html';

export default function PrivacyScreen() {
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
        <Text accessibilityRole="header" style={styles.title}>Privacy and retention</Text>
        <PrivacyCopy />
        <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(PRIVACY_URL); }} style={styles.link}><Text style={styles.linkText}>Open full privacy policy</Text></Pressable>
        <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(TERMS_URL); }} style={styles.link}><Text style={styles.linkText}>Open Terms of Use</Text></Pressable>
        <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(SUPPORT_URL); }} style={styles.link}><Text style={styles.linkText}>Open support page</Text></Pressable>
        <PrimaryButton label="Back to settings" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}

export function PrivacyCopy() {
  return (
    <View style={styles.copyGroup}>
      <Text style={styles.copy}>Saved reports, source text you choose to retain, and response drafts are stored locally on your device unless you explicitly share them. Depending on your iOS and iCloud settings, local app data may be included in device or iCloud backups.</Text>
      <Text style={styles.copy}>On-device analysis and drafts work without network transmission. For optional AI-assisted analysis or one AI-assisted draft, the exact reviewed message text is sent through Cloudflare to Groq only after you confirm it and consent. The output can be wrong and is not a factual conclusion about people or relationships.</Text>
      <Text style={styles.copy}>For purchases and subscription status, RevenueCat processes a pseudonymous app-user ID and purchase and entitlement history. The ConvoAutopsy service may cache verified entitlement status for up to five minutes.</Text>
      <Text style={styles.copy}>The service uses HMAC-derived rate and quota identifiers instead of raw installation tokens or IP addresses. It retains bounded quota usage rows, a daily provider budget, two-minute recovery leases, and content-free operational metrics. These records enforce fair-use, reliability, abuse prevention, and cost limits; they do not contain conversation text.</Text>
      <Text style={styles.copy}>ConvoAutopsy does not sell data, track users, serve ads, access contacts, or automatically send messages.</Text>
      <Text style={styles.copy}>Delete All makes a best-effort attempt to remove app-owned local reports, drafts, preferences, consent, the installation token, cached artifacts, and the active session. It cannot recall data you shared or remove copies in backups or provider infrastructure. It does not immediately remove short-lived service safety and accounting records. Deleting data or uninstalling the app does not cancel an App Store subscription.</Text>
      <Text style={styles.copy}>For content-free support or privacy questions, open the support page below. Do not include conversation text or other sensitive information.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: tokens.spacing.md, paddingBottom: tokens.spacing.xl },
  title: { color: tokens.colors.textPrimary, fontSize: 30, fontWeight: '700' },
  copyGroup: { gap: tokens.spacing.md },
  copy: { color: tokens.colors.textSecondary, fontSize: 16, lineHeight: 24 },
  link: { justifyContent: 'center', minHeight: tokens.minTouchTarget },
  linkText: { color: tokens.colors.accent, fontSize: 15, fontWeight: '700' },
});
