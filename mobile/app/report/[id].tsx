import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ResultSummary } from '../../src/components/ResultSummary';
import { Screen } from '../../src/components/Screen';
import { ShareableReportCard } from '../../src/components/ShareableReportCard';
import { captureAndShareReport, reportExportFailureMessage, type ExportOutcome } from '../../src/services/exportReport';
import { useReportRepository } from '../../src/services/reportRepositoryContext';
import type { SavedReport } from '../../src/services/reportRepository';
import { tokens } from '../../src/theme/tokens';

export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repository, revision, deletingAll } = useReportRepository();
  const [report, setReport] = useState<SavedReport | null>(null);
  const [status, setStatus] = useState<'loading' | 'missing' | 'error' | 'ready'>('loading');
  const [shareStatus, setShareStatus] = useState<'idle' | 'sharing'>('idle');
  const [shareOutcome, setShareOutcome] = useState<ExportOutcome | null>(null);
  const reportRef = useRef<View>(null);
  const readGeneration = useRef(0);

  useFocusEffect(useCallback(() => {
    void revision;
    const generation = ++readGeneration.current;
    if (deletingAll) {
      setReport(null);
      setStatus('loading');
      setShareOutcome(null);
      return () => { readGeneration.current += 1; };
    }
    void (async () => {
      try {
        const saved = typeof id === 'string' ? await repository.get(id) : null;
        if (generation !== readGeneration.current) return;
        setReport(saved);
        setStatus(saved ? 'ready' : 'missing');
      } catch {
        if (generation === readGeneration.current) setStatus('error');
      }
    })();
    return () => { readGeneration.current += 1; };
  }, [deletingAll, id, repository, revision]));

  if (deletingAll) return <Screen><Text style={styles.message}>Saved app data is being deleted…</Text></Screen>;
  if (status === 'loading') return <Screen><Text style={styles.message}>Loading saved analysis…</Text></Screen>;
  if (status === 'missing') return <Screen><Text accessibilityRole="alert" style={styles.message}>This saved analysis no longer exists.</Text></Screen>;
  if (status === 'error' || !report) return <Screen><Text accessibilityRole="alert" style={styles.error}>This saved analysis could not be read.</Text></Screen>;

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
        <Text accessibilityRole="header" style={styles.title}>{report.title}</Text>
        <Text style={styles.message}>Saved {new Date(report.updatedAt).toLocaleString()}</Text>
        <ResultSummary result={report.result} />
        <PrimaryButton label={shareStatus === 'sharing' ? 'Preparing report…' : 'Share report image'} disabled={shareStatus === 'sharing'} onPress={() => { void shareReport(); }} />
        <PrimaryButton label="Convo Pro" onPress={() => router.push('/upgrade?source=report')} />
        <PrimaryButton label="Open Responses" onPress={() => router.replace('/(tabs)/responses')} testID="open-responses" />
        {shareOutcome?.ok ? <Text accessibilityLiveRegion="polite" style={styles.message}>Share sheet opened. This does not confirm completion.</Text> : null}
        {shareOutcome && !shareOutcome.ok ? <Text accessibilityRole="alert" style={styles.error}>{reportExportFailureMessage(shareOutcome)}</Text> : null}
        <View pointerEvents="none" style={styles.captureContainer}>
          <ShareableReportCard generatedAt={report.updatedAt} ref={reportRef} result={report.result} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: tokens.spacing.md, paddingBottom: tokens.spacing.xl },
  title: { color: tokens.colors.textPrimary, fontSize: 28, fontWeight: '700' },
  message: { color: tokens.colors.textSecondary, fontSize: 16 },
  error: { color: tokens.colors.error, fontSize: 16 },
  captureContainer: { left: -10000, position: 'absolute', top: 0 },
});
