import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { ResultSummary } from '../src/components/ResultSummary';
import { Screen } from '../src/components/Screen';
import { useAnalysisSession } from '../src/state/AnalysisSession';
import { tokens } from '../src/theme/tokens';

export default function ResultScreen() {
  const { activeResult, reset } = useAnalysisSession();

  if (!activeResult) {
    return (
      <Screen>
        <Text accessibilityRole="alert" style={styles.error}>No analysis result is available yet.</Text>
        <PrimaryButton label="Return to editor" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <ResultSummary result={activeResult} />
        <PrimaryButton
          label="Analyze another conversation"
          onPress={() => {
            reset();
            router.replace('/');
          }}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: tokens.spacing.lg, paddingBottom: tokens.spacing.xl },
  error: { color: tokens.colors.error, fontSize: 16, marginBottom: tokens.spacing.md },
});
