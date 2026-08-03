import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { Screen } from '../src/components/Screen';
import { tokens } from '../src/theme/tokens';

const SUPPORT_URL = 'https://github.com/avinashamanchi/convoautopsy/issues';

export default function PrivacyScreen() {
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
        <Text accessibilityRole="header" style={styles.title}>Privacy and retention</Text>
        <PrivacyCopy />
        <Text selectable style={styles.link}>{SUPPORT_URL}</Text>
        <PrimaryButton label="Back to settings" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}

export function PrivacyCopy() {
  return (
    <View style={styles.copyGroup}>
      <Text style={styles.copy}>Saved reports are stored locally on your device unless you explicitly share them using your device’s share sheet.</Text>
      <Text style={styles.copy}>On-device analysis works without network transmission. If you choose AI-assisted analysis after giving consent, anonymized speaker labels and message text are sent to Groq through the ConvoAutopsy proxy. The optional AI output can be wrong and is not a factual conclusion about people or relationships.</Text>
      <Text style={styles.copy}>ConvoAutopsy does not sell data, track users, serve ads, access contacts, or automatically send messages.</Text>
      <Text style={styles.copy}>For security and rate limiting, the proxy receives a pseudonymous installation token and network signal. The token is stored locally and can be removed by revoking AI consent or deleting all app data.</Text>
      <Text style={styles.copy}>You control retention: delete individual reports in History, revoke AI consent in Settings, or use Delete all app data to attempt removal of reports, preferences, consent, installation token, ConvoAutopsy-owned cached exports, and the active in-memory session. A partial deletion is shown as a failure so you can retry.</Text>
      <Text style={styles.copy}>For support or privacy questions, open the issue tracker below.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: tokens.spacing.md, paddingBottom: tokens.spacing.xl },
  title: { color: tokens.colors.textPrimary, fontSize: 30, fontWeight: '700' },
  copyGroup: { gap: tokens.spacing.md },
  copy: { color: tokens.colors.textSecondary, fontSize: 16, lineHeight: 24 },
  link: { color: tokens.colors.accent, fontSize: 15 },
});
