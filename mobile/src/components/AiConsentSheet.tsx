import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from './PrimaryButton';
import { tokens } from '../theme/tokens';

type AiConsentSheetProps = {
  isRunning: boolean;
  onAgree(): void;
  onCancel(): void;
};

export function AiConsentSheet({ isRunning, onAgree, onCancel }: AiConsentSheetProps) {
  return (
    <View accessibilityRole="alert" style={styles.sheet}>
      <Text accessibilityRole="header" style={styles.title}>Before AI-assisted analysis</Text>
      <Text style={styles.copy}>
        Names are replaced with Person labels. Message text is sent to Groq through ConvoAutopsy&apos;s server. ConvoAutopsy does not intentionally store that text. Automated output can be wrong. On-device analysis is available without sharing.
      </Text>
      <PrimaryButton
        disabled={isRunning}
        label={isRunning ? 'Starting AI analysis…' : 'Agree and continue'}
        onPress={onAgree}
      />
      <PrimaryButton label={isRunning ? 'Cancel AI analysis' : 'Cancel'} onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: tokens.colors.surface, borderRadius: tokens.radius.md, gap: tokens.spacing.md, padding: tokens.spacing.md },
  title: { color: tokens.colors.textPrimary, fontSize: 20, fontWeight: '700' },
  copy: { color: tokens.colors.textSecondary, fontSize: 15, lineHeight: 22 },
});
