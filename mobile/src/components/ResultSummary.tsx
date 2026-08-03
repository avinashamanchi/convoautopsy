import { StyleSheet, Text, View } from 'react-native';
import type { AnalysisResult } from '../domain/analysis';
import { tokens } from '../theme/tokens';

export function ResultSummary({ result }: { result: AnalysisResult }) {
  const modeLabel = result.mode === 'local' ? 'On-device (local)' : 'AI-assisted (remote)';

  return (
    <View testID="result-summary" style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        {result.mode === 'local' ? 'On-device estimate' : 'AI-assisted estimate'}
      </Text>
      <Text accessibilityLabel={`Intensity score: ${result.intensityScore} out of 100`} style={styles.metric}>Intensity score (estimate): {result.intensityScore}/100</Text>
      <Text style={styles.metric}>Conflict-style estimate: {result.conflictMode}</Text>
      <Text style={styles.mode}>Analysis mode: {modeLabel}</Text>
      {result.messages.map((message, index) => (
        <View accessibilityLabel={`Pattern for ${message.sender}: ${message.pattern}`} key={`${message.sender}-${index}`} testID="pattern-card" style={styles.message}>
          <Text style={styles.sender}>{message.sender}</Text>
          <Text style={styles.text}>{message.text}</Text>
          <Text style={styles.pattern}>Pattern: {message.pattern}</Text>
          <Text style={styles.interpretationLabel}>Possible interpretation</Text>
          <Text style={styles.interpretation}>{message.possibleInterpretation}</Text>
        </View>
      ))}
      <Text testID="result-limitation" style={styles.limitation}>
        This educational estimate is not a factual conclusion about people or relationships.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: tokens.spacing.md },
  title: { color: tokens.colors.textPrimary, fontSize: 28, fontWeight: '700' },
  metric: { color: tokens.colors.textPrimary, fontSize: 16, fontWeight: '600' },
  mode: { color: tokens.colors.textSecondary, fontSize: 14 },
  message: { backgroundColor: tokens.colors.surface, borderRadius: tokens.radius.md, gap: tokens.spacing.xs, padding: tokens.spacing.md },
  sender: { color: tokens.colors.accent, fontSize: 14, fontWeight: '700' },
  text: { color: tokens.colors.textPrimary, fontSize: 16, lineHeight: 22 },
  pattern: { color: tokens.colors.textSecondary, fontSize: 14, marginTop: tokens.spacing.xs },
  interpretationLabel: { color: tokens.colors.textPrimary, fontSize: 14, fontWeight: '700', marginTop: tokens.spacing.xs },
  interpretation: { color: tokens.colors.textSecondary, fontSize: 14, lineHeight: 20 },
  limitation: { color: tokens.colors.textSecondary, fontSize: 14, lineHeight: 20 },
});
