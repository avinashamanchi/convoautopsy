import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { EmptyState } from '../../src/components/EmptyState';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Screen } from '../../src/components/Screen';
import type { SavedReport } from '../../src/services/reportRepository';
import { useReportRepository } from '../../src/services/reportRepositoryContext';
import { tokens } from '../../src/theme/tokens';

export default function ResponsesScreen() {
  const { repository } = useReportRepository();
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      setStatus('loading');
      try {
        const saved = await repository.list();
        if (!active) return;
        setReports(saved);
        setStatus('ready');
      } catch {
        if (active) setStatus('error');
      }
    })();
    return () => { active = false; };
  }, [attempt, repository]);

  if (status === 'loading') return <Screen><Text style={styles.message}>Loading saved analyses…</Text></Screen>;
  if (status === 'error') {
    return (
      <Screen>
        <Text accessibilityRole="alert" style={styles.error}>Saved analyses could not be loaded. Please try again.</Text>
        <PrimaryButton label="Retry loading saved analyses" onPress={() => setAttempt((value) => value + 1)} />
      </Screen>
    );
  }
  if (reports.length === 0) {
    return <Screen><EmptyState title="Responses" description="Save an analysis first, then choose it here to draft a response." /></Screen>;
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Choose an analysis</Text>
        <Text style={styles.message}>Drafts stay on this device until you manually copy or share one.</Text>
        {reports.map((report, index) => (
          <PrimaryButton
            key={report.id}
            label={`Draft responses for ${report.title}`}
            onPress={() => router.push(`/response/${report.id}`)}
            testID={`response-report-row-${index}`}
          />
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: tokens.spacing.md, paddingBottom: tokens.spacing.xl },
  title: { color: tokens.colors.textPrimary, fontSize: 28, fontWeight: '700' },
  message: { color: tokens.colors.textSecondary, fontSize: 16, lineHeight: 24 },
  error: { color: tokens.colors.error, fontSize: 16, lineHeight: 24 },
});
