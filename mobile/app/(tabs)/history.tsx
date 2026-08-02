import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { ConfirmDeleteSheet } from '../../src/components/ConfirmDeleteSheet';
import { ReportListItem } from '../../src/components/ReportListItem';
import { Screen } from '../../src/components/Screen';
import { useReportRepository } from '../../src/services/reportRepositoryContext';
import type { SavedReport } from '../../src/services/reportRepository';
import { tokens } from '../../src/theme/tokens';

export default function HistoryScreen() {
  const { repository } = useReportRepository();
  const [query, setQuery] = useState('');
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [error, setError] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SavedReport | null>(null);

  const loadReports = useCallback(async (nextQuery: string) => {
    try {
      setError(false);
      setReports(await repository.list(nextQuery));
    } catch {
      setError(true);
    }
  }, [repository]);

  useEffect(() => { void loadReports(query); }, [loadReports, query]);

  const deleteReport = async () => {
    if (!pendingDelete) return;
    await repository.delete(pendingDelete.id);
    setPendingDelete(null);
    await loadReports(query);
  };

  return (
    <Screen>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>History</Text>
        <Text style={styles.subtitle}>Saved only on this device.</Text>
        <TextInput
          accessibilityLabel="Search saved analyses"
          onChangeText={setQuery}
          placeholder="Search saved analyses"
          placeholderTextColor={tokens.colors.textSecondary}
          style={styles.search}
          value={query}
        />
        {error ? <Text accessibilityRole="alert" style={styles.error}>Saved analyses could not be read.</Text> : null}
        {!error && reports.length === 0 ? <Text style={styles.empty}>No saved analyses yet.</Text> : null}
        {reports.map((report) => (
          <ReportListItem
            key={report.id}
            onDelete={() => setPendingDelete(report)}
            onOpen={() => router.push(`/report/${report.id}`)}
            report={report}
          />
        ))}
      </View>
      <ConfirmDeleteSheet
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => { void deleteReport(); }}
        title={pendingDelete?.title ?? ''}
        visible={pendingDelete !== null}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, gap: tokens.spacing.md },
  title: { color: tokens.colors.textPrimary, fontSize: 28, fontWeight: '700' },
  subtitle: { color: tokens.colors.textSecondary, fontSize: 16 },
  search: { borderColor: tokens.colors.textSecondary, borderRadius: tokens.radius.md, borderWidth: 1, color: tokens.colors.textPrimary, minHeight: tokens.minTouchTarget, paddingHorizontal: tokens.spacing.md },
  empty: { color: tokens.colors.textSecondary, fontSize: 16, paddingTop: tokens.spacing.lg, textAlign: 'center' },
  error: { color: tokens.colors.error, fontSize: 16 },
});
