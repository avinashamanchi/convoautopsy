import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { ResultSummary } from '../src/components/ResultSummary';
import { Screen } from '../src/components/Screen';
import { ShareableReportCard } from '../src/components/ShareableReportCard';
import { captureAndShareReport, reportExportFailureMessage, type ExportOutcome } from '../src/services/exportReport';
import { useReportRepository } from '../src/services/reportRepositoryContext';
import { useAnalysisSession } from '../src/state/AnalysisSession';
import { tokens } from '../src/theme/tokens';
import { createNativeUuid, type UuidProvider } from '../src/services/uuid';
import { useBilling } from '../src/billing/BillingProvider';
import { canSaveReport } from '../src/billing/saveGate';

type ResultScreenProps = { createReportId?: UuidProvider };

export default function ResultScreen({ createReportId = createNativeUuid }: ResultScreenProps) {
  const { activeResult, draft, reset } = useAnalysisSession();
  const { repository } = useReportRepository();
  const { entitlementActive } = useBilling();
  const [saveOptionsVisible, setSaveOptionsVisible] = useState(false);
  const [retainSourceText, setRetainSourceText] = useState(false);
  const [title, setTitle] = useState('Saved analysis');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [shareStatus, setShareStatus] = useState<'idle' | 'sharing'>('idle');
  const [shareOutcome, setShareOutcome] = useState<ExportOutcome | null>(null);
  const reportRef = useRef<View>(null);
  const [reportGeneratedAt] = useState(() => new Date().toISOString());

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
      const gate = canSaveReport((await repository.list()).length, entitlementActive);
      if (!gate.allowed) {
        setSaveStatus('idle');
        router.push('/upgrade?source=history-limit');
        return;
      }
      const timestamp = new Date().toISOString();
      await repository.save({
        id: createReportId(),
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

  const shareReport = async () => {
    setShareStatus('sharing');
    setShareOutcome(null);
    const outcome = await captureAndShareReport(reportRef.current);
    setShareOutcome(outcome);
    setShareStatus('idle');
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <ResultSummary result={activeResult} />
        <PrimaryButton label={shareStatus === 'sharing' ? 'Preparing report…' : 'Share report image'} disabled={shareStatus === 'sharing'} onPress={() => { void shareReport(); }} />
        {shareOutcome?.ok ? <Text accessibilityLiveRegion="polite" style={styles.success}>Share sheet opened. This does not confirm completion.</Text> : null}
        {shareOutcome && !shareOutcome.ok ? <Text accessibilityRole="alert" style={styles.error}>{reportExportFailureMessage(shareOutcome)}</Text> : null}
        {saveStatus === 'saved' ? <Text accessibilityLiveRegion="polite" style={styles.success}>Analysis saved on this device.</Text> : null}
        {saveStatus === 'saved' ? <PrimaryButton label="Open History" onPress={() => router.replace('/(tabs)/history')} testID="open-history" /> : null}
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
            <PrimaryButton label={saveStatus === 'saving' ? 'Saving…' : 'Save privately'} disabled={saveStatus === 'saving'} onPress={() => { void save(); }} testID="save-without-source" />
          </View>
        ) : <PrimaryButton label="Save analysis" onPress={() => { setSaveStatus('idle'); setSaveOptionsVisible(true); }} testID="save-report" />}
        <PrimaryButton
          label="Analyze another conversation"
          onPress={() => {
            reset();
            router.replace('/');
          }}
        />
        <View pointerEvents="none" style={styles.captureContainer}>
          <ShareableReportCard generatedAt={reportGeneratedAt} ref={reportRef} result={activeResult} />
        </View>
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
  captureContainer: { left: -10000, position: 'absolute', top: 0 },
});
