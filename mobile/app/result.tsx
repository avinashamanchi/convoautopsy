import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { ResultSummary } from '../src/components/ResultSummary';
import { Screen } from '../src/components/Screen';
import { useReportRepository } from '../src/services/reportRepositoryContext';
import { useAnalysisSession } from '../src/state/AnalysisSession';
import { tokens } from '../src/theme/tokens';

export default function ResultScreen() {
  const { activeResult, draft, reset } = useAnalysisSession();
  const { repository } = useReportRepository();
  const [saveOptionsVisible, setSaveOptionsVisible] = useState(false);
  const [retainSourceText, setRetainSourceText] = useState(false);
  const [title, setTitle] = useState('Saved analysis');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  if (!activeResult) {
    return (
      <Screen>
        <Text accessibilityRole="alert" style={styles.error}>No analysis result is available yet.</Text>
        <PrimaryButton label="Return to editor" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  const save = async () => {
    setSaveStatus('saving');
    try {
      const timestamp = new Date().toISOString();
      await repository.save({
        id: `report-${Date.now().toString(36)}`,
        title: title.trim() || 'Saved analysis',
        createdAt: timestamp,
        updatedAt: timestamp,
        sourceText: retainSourceText ? draft : null,
        result: activeResult,
        responseDrafts: [],
      });
      setSaveStatus('saved');
      setSaveOptionsVisible(false);
    } catch {
      setSaveStatus('failed');
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <ResultSummary result={activeResult} />
        {saveStatus === 'saved' ? <Text accessibilityLiveRegion="polite" style={styles.success}>Analysis saved on this device.</Text> : null}
        {saveStatus === 'failed' ? <Text accessibilityRole="alert" style={styles.error}>Could not save this analysis. Please try again.</Text> : null}
        {saveOptionsVisible ? (
          <View style={styles.saveOptions}>
            <Text style={styles.saveTitle}>Save this analysis</Text>
            <TextInput
              accessibilityLabel="Saved analysis title"
              onChangeText={setTitle}
              placeholder="Saved analysis"
              placeholderTextColor={tokens.colors.textSecondary}
              style={styles.titleInput}
              value={title}
            />
            <Text style={styles.privacyTitle}>Keep original conversation text?</Text>
            <Text style={styles.privacyCopy}>Off by default. Saving without it keeps only the analysis and anonymized parsed messages.</Text>
            <Switch
              accessibilityLabel="Keep original conversation text"
              onValueChange={setRetainSourceText}
              trackColor={{ false: tokens.colors.textSecondary, true: tokens.colors.accent }}
              value={retainSourceText}
            />
            <PrimaryButton label={saveStatus === 'saving' ? 'Saving…' : 'Save privately'} disabled={saveStatus === 'saving'} onPress={() => { void save(); }} />
          </View>
        ) : <PrimaryButton label="Save analysis" onPress={() => { setSaveStatus('idle'); setSaveOptionsVisible(true); }} />}
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
  success: { color: tokens.colors.success, fontSize: 16 },
  saveOptions: { backgroundColor: tokens.colors.surface, borderRadius: tokens.radius.md, gap: tokens.spacing.sm, padding: tokens.spacing.md },
  saveTitle: { color: tokens.colors.textPrimary, fontSize: 20, fontWeight: '700' },
  titleInput: { borderColor: tokens.colors.textSecondary, borderRadius: tokens.radius.sm, borderWidth: 1, color: tokens.colors.textPrimary, minHeight: tokens.minTouchTarget, paddingHorizontal: tokens.spacing.sm },
  privacyTitle: { color: tokens.colors.textPrimary, fontSize: 16, fontWeight: '700' },
  privacyCopy: { color: tokens.colors.textSecondary, fontSize: 14, lineHeight: 20 },
});
