import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { ConfirmDeleteSheet } from '../../src/components/ConfirmDeleteSheet';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ReportListItem } from '../../src/components/ReportListItem';
import { Screen } from '../../src/components/Screen';
import { useReportRepository } from '../../src/services/reportRepositoryContext';
import type { SavedReport } from '../../src/services/reportRepository';
import { tokens } from '../../src/theme/tokens';

export default function HistoryScreen() {
  const { repository } = useReportRepository();
  const [query, setQuery] = useState('');
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [loadError, setLoadError] = useState<'none' | 'read' | 'refresh'>('none');
  const [pendingDelete, setPendingDelete] = useState<SavedReport | null>(null);
  const [failedDelete, setFailedDelete] = useState<SavedReport | null>(null);

  const loadReports = useCallback(async (nextQuery: string, errorType: 'read' | 'refresh') => {
    try {
      setReports(await repository.list(nextQuery));
      setLoadError('none');
      return true;
    } catch {
      setLoadError(errorType);
      return false;
    }
  }, [repository]);

  useEffect(() => { void loadReports(query, 'read'); }, [loadReports, query]);

  const deleteReport = async (report: SavedReport) => {
    setPendingDelete(null);
    try {
      await repository.delete(report.id);
      setReports((current) => current.filter((item) => item.id !== report.id));
      setFailedDelete(null);
      await loadReports(query, 'refresh');
    } catch {
      setFailedDelete(report);
    }
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
        {loadError !== 'none' ? (
          <>
            <Text accessibilityRole="alert" style={styles.error}>Could not {loadError === 'refresh' ? 'refresh' : 'load'} saved analyses. Please try again.</Text>
            <PrimaryButton label="Retry loading saved analyses" onPress={() => { void loadReports(query, 'read'); }} />
          </>
        ) : null}
        {failedDelete ? (
          <>
            <Text accessibilityRole="alert" style={styles.error}>Could not delete “{failedDelete.title}”. Please try again.</Text>
            <PrimaryButton label={`Retry deleting ${failedDelete.title}`} onPress={() => { void deleteReport(failedDelete); }} />
          </>
        ) : null}
        {loadError === 'none' && reports.length === 0 ? <Text style={styles.empty}>{query ? 'No saved analyses match your search.' : 'No saved analyses yet.'}</Text> : null}
        {reports.map((report, index) => (
          <ReportListItem
            key={report.id}
            onDelete={() => setPendingDelete(report)}
            onOpen={() => router.push(`/report/${report.id}`)}
            report={report}
            testID={`report-row-${index}`}
          />
        ))}
      </View>
      <ConfirmDeleteSheet
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => { if (pendingDelete) void deleteReport(pendingDelete); }}
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
