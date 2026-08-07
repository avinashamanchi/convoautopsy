import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from './PrimaryButton';
import { tokens } from '../theme/tokens';

type AnalysisModePickerProps = {
  onRunLocal(): void;
  onStartAi(): void;
  aiNotice: string | null;
  aiDecisionReady: boolean;
  aiDecisionNotice: string | null;
};

export function AnalysisModePicker({ onRunLocal, onStartAi, aiNotice, aiDecisionReady, aiDecisionNotice }: AnalysisModePickerProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.description}>Run an on-device estimate, or choose AI-assisted analysis when it is configured.</Text>
      <PrimaryButton label="Run on-device analysis" onPress={onRunLocal} testID="run-local-analysis" />
      <PrimaryButton disabled={!aiDecisionReady} label="Use AI-assisted analysis" onPress={onStartAi} />
      {!aiDecisionReady && aiDecisionNotice ? <Text accessibilityRole="alert" style={styles.notice}>{aiDecisionNotice}</Text> : null}
      {aiNotice ? <Text accessibilityRole="alert" style={styles.notice}>{aiNotice}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: tokens.spacing.sm, marginTop: tokens.spacing.lg },
  description: { color: tokens.colors.textSecondary, fontSize: 14, lineHeight: 20 },
  notice: { color: tokens.colors.warning, fontSize: 14, lineHeight: 20 },
});
