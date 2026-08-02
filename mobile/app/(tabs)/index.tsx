import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { ConversationEditor } from '../../src/components/ConversationEditor';
import { Screen } from '../../src/components/Screen';
import { useAnalysisSession } from '../../src/state/AnalysisSession';
import { tokens } from '../../src/theme/tokens';

export default function HomeScreen() {
  const { error: errorParam } = useLocalSearchParams<{ error?: string }>();
  const { draft, setDraft, status } = useAnalysisSession();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof errorParam === 'string') {
      setError(errorParam);
    }
  }, [errorParam]);

  return (
    <Screen>
      <View style={styles.container}>
        <Text accessibilityRole="header" style={styles.title}>Analyze a conversation</Text>
        <Text style={styles.body}>
          Your text stays on this device unless you choose AI-assisted analysis.
        </Text>
        <ConversationEditor
          disabled={status === 'analyzing-local' || status === 'analyzing-ai'}
          error={error}
          onChange={(value) => {
            setError(null);
            setDraft(value);
          }}
          onImportFile={() => setError('File import is not available yet. Paste the conversation instead.')}
          onImportScreenshot={() => setError('Screenshot import is not available yet. Paste the conversation instead.')}
          onReview={() => router.push('/preview')}
          value={draft}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { color: tokens.colors.textPrimary, fontSize: 32, fontWeight: '700', marginBottom: 12 },
  body: { color: tokens.colors.textSecondary, fontSize: 16, lineHeight: 24, marginBottom: tokens.spacing.lg },
});
