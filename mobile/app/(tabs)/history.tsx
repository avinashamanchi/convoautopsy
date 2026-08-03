import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { ConfirmDeleteSheet } from '../../src/components/ConfirmDeleteSheet';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ReportListItem } from '../../src/components/ReportListItem';
import { Screen } from '../../src/components/Screen';
import { useReportRepository } from '../../src/services/reportRepositoryContext';
import type { SavedReport } from '../../src/services/reportRepository';
import { tokens } from '../../src/theme/tokens';

export default function HistoryScreen() {
  const { repository, revision, deletingAll } = useReportRepository();
  const [query, setQuery] = useState('');
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [loadError, setLoadError] = useState<'none' | 'read' | 'refresh'>('none');
  const [pendingDelete, setPendingDelete] = useState<SavedReport | null>(null);
  const [failedDelete, setFailedDelete] = useState<SavedReport | null>(null);
  const readGeneration = useRef(0);
  const deleteGeneration = useRef(0);
  const deletingAllRef = useRef(deletingAll);
  const nextRevisionLoadError = useRef<'read' | 'refresh'>('read');
  deletingAllRef.current = deletingAll;

  const loadReports = useCallback(async (nextQuery: string, errorType: 'read' | 'refresh') => {
    const generation = ++readGeneration.current;
    try {
      const nextReports = await repository.list(nextQuery);
      if (generation !== readGeneration.current) return false;
      setReports(nextReports);
      setFailedDelete(null);
      setLoadError('none');
      return true;
    } catch {
      if (generation !== readGeneration.current) return false;
      setLoadError(errorType);
      return false;
    }
  }, [repository]);

  useFocusEffect(useCallback(() => {
    void revision;
    if (deletingAll) {
      readGeneration.current += 1;
      deleteGeneration.current += 1;
      setReports([]);
      setPendingDelete(null);
      setFailedDelete(null);
      setLoadError('none');
      return;
    }
    const errorType = nextRevisionLoadError.current;
    nextRevisionLoadError.current = 'read';
    void loadReports(query, errorType);
    return () => { readGeneration.current += 1; };
  }, [deletingAll, loadReports, query, revision]));

  const deleteReport = async (report: SavedReport) => {
    const generation = ++deleteGeneration.current;
    setPendingDelete(null);
    nextRevisionLoadError.current = 'refresh';
    try {
      await repository.delete(report.id);
      if (generation !== deleteGeneration.current || deletingAllRef.current) return;
      setReports((current) => current.filter((item) => item.id !== report.id));
      setFailedDelete(null);
    } catch {
      nextRevisionLoadError.current = 'read';
      if (generation !== deleteGeneration.current || deletingAllRef.current) return;
      setFailedDelete(report);
    }
  };

  const header = (
    <View style={styles.header}>
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
    </View>
  );

  return (
    <Screen style={styles.screen}>
      <FlatList
        ListEmptyComponent={loadError === 'none' ? <Text style={styles.empty}>{query ? 'No saved analyses match your search.' : 'No saved analyses yet.'}</Text> : null}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        data={reports}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(report) => report.id}
        renderItem={({ item, index }) => (
          <ReportListItem
            onDelete={() => setPendingDelete(item)}
            onOpen={() => router.push(`/report/${item.id}`)}
            report={item}
            testID={`report-row-${index}`}
          />
        )}
        testID="history-list"
      />
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
  screen: { padding: 0 },
  content: { flexGrow: 1, padding: tokens.spacing.lg, paddingBottom: tokens.spacing.xl },
  header: { gap: tokens.spacing.md, marginBottom: tokens.spacing.md },
  separator: { height: tokens.spacing.md },
  title: { color: tokens.colors.textPrimary, fontSize: 28, fontWeight: '700' },
  subtitle: { color: tokens.colors.textSecondary, fontSize: 16 },
  search: { borderColor: tokens.colors.textSecondary, borderRadius: tokens.radius.md, borderWidth: 1, color: tokens.colors.textPrimary, minHeight: tokens.minTouchTarget, paddingHorizontal: tokens.spacing.md },
  empty: { color: tokens.colors.textSecondary, fontSize: 16, paddingTop: tokens.spacing.lg, textAlign: 'center' },
  error: { color: tokens.colors.error, fontSize: 16 },
});
