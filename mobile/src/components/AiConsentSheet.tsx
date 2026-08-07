import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from './PrimaryButton';
import { tokens } from '../theme/tokens';

type AiConsentSheetProps = {
  isRunning: boolean;
  feature?: 'analysis' | 'response-draft';
  onAgree(): void;
  onCancel(): void;
};

export function AiConsentSheet({ isRunning, feature = 'analysis', onAgree, onCancel }: AiConsentSheetProps) {
  const responseDraft = feature === 'response-draft';
  return (
    <View accessibilityRole="alert" style={styles.sheet}>
      <Text accessibilityRole="header" style={styles.title}>
        {responseDraft ? 'Before AI-assisted response drafting' : 'Before AI-assisted analysis'}
      </Text>
      <Text style={styles.copy}>
        Speaker labels are replaced with Person labels. {responseDraft ? 'The reviewed message text' : 'Message text'} is sent to Groq through ConvoAutopsy&apos;s server. {responseDraft
          ? 'The request also contains the visible read-only response sender, goal, tone, analysis intensity and conflict, plus every message sender, pattern, ego state, and reviewed possible interpretation.'
          : 'Each reviewed message sender label is sent with its text.'} ConvoAutopsy does not intentionally store that content. Automated output can be wrong. {responseDraft ? 'On-device response drafts are' : 'On-device analysis is'} available without sharing.
      </Text>
      <Text style={styles.copy}>
        Remote technical fields are sent to ConvoAutopsy&apos;s Cloudflare service: schema and consent versions, a random installation token for abuse prevention, and a pseudonymous RevenueCat app-user ID for plan and allowance verification. For response drafting, analysis schema and mode are also server-only fields. The service sends the app-user ID to RevenueCat for verification. The review does not display either raw identifier because they are technical pseudonymous values, not conversation content. Neither raw technical identifier is forwarded to Groq. RevenueCat does not receive your conversation text.
      </Text>
      <PrimaryButton
        disabled={isRunning}
        label={isRunning ? (responseDraft ? 'Starting AI draft…' : 'Starting AI analysis…') : 'Agree and continue'}
        onPress={onAgree}
      />
      <PrimaryButton label={isRunning ? (responseDraft ? 'Cancel AI draft' : 'Cancel AI analysis') : 'Cancel'} onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: tokens.colors.surface, borderRadius: tokens.radius.md, gap: tokens.spacing.md, padding: tokens.spacing.md },
  title: { color: tokens.colors.textPrimary, fontSize: 20, fontWeight: '700' },
  copy: { color: tokens.colors.textSecondary, fontSize: 15, lineHeight: 22 },
});
