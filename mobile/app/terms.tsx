import { router } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { Screen } from '../src/components/Screen';
import { legalLinks } from '../src/legal/links';
import { tokens } from '../src/theme/tokens';

export default function TermsScreen() {
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
        <Text accessibilityRole="header" style={styles.title}>Terms of Use</Text>
        <Text style={styles.copy}>ConvoAutopsy provides educational conversation-analysis tools. It does not provide medical, legal, or relationship advice, and its estimates can be wrong.</Text>
        <Text style={styles.copy}>Subscriptions are optional. Your saved reports remain on this device unless you explicitly share them.</Text>
        <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(legalLinks.terms); }} style={styles.link}>
          <Text style={styles.linkText}>Open full Terms of Use</Text>
        </Pressable>
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
});
