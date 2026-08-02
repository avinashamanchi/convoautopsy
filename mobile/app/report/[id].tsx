import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { ResultSummary } from '../../src/components/ResultSummary';
import { Screen } from '../../src/components/Screen';
import { useReportRepository } from '../../src/services/reportRepositoryContext';
import type { SavedReport } from '../../src/services/reportRepository';
import { tokens } from '../../src/theme/tokens';

export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repository } = useReportRepository();
  const [report, setReport] = useState<SavedReport | null>(null);
  const [status, setStatus] = useState<'loading' | 'missing' | 'error' | 'ready'>('loading');

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const saved = typeof id === 'string' ? await repository.get(id) : null;
        if (!active) return;
        setReport(saved);
        setStatus(saved ? 'ready' : 'missing');
      } catch {
        if (active) setStatus('error');
      }
    })();
    return () => { active = false; };
  }, [id, repository]);

  if (status === 'loading') return <Screen><Text style={styles.message}>Loading saved analysis…</Text></Screen>;
  if (status === 'missing') return <Screen><Text accessibilityRole="alert" style={styles.message}>This saved analysis no longer exists.</Text></Screen>;
  if (status === 'error' || !report) return <Screen><Text accessibilityRole="alert" style={styles.error}>This saved analysis could not be read.</Text></Screen>;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>{report.title}</Text>
        <Text style={styles.message}>Saved {new Date(report.updatedAt).toLocaleString()}</Text>
        <ResultSummary result={report.result} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: tokens.spacing.md, paddingBottom: tokens.spacing.xl },
  title: { color: tokens.colors.textPrimary, fontSize: 28, fontWeight: '700' },
  message: { color: tokens.colors.textSecondary, fontSize: 16 },
  error: { color: tokens.colors.error, fontSize: 16 },
});
