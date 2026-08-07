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
        Names are replaced with Person labels. {responseDraft ? 'The reviewed message text' : 'Message text'} is sent to Groq through ConvoAutopsy&apos;s server. ConvoAutopsy does not intentionally store that text. Automated output can be wrong. {responseDraft ? 'On-device response drafts are' : 'On-device analysis is'} available without sharing.
      </Text>
      <Text style={styles.copy}>
        If you use a subscription, your RevenueCat app user ID may be sent to our server to verify your plan; RevenueCat does not receive your conversation text.
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
