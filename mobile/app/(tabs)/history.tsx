import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { ConfirmDeleteSheet } from '../../src/components/ConfirmDeleteSheet';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ReportListItem } from '../../src/components/ReportListItem';
import { Screen } from '../../src/components/Screen';
import { useReportRepository } from '../../src/services/reportRepositoryContext';
import type { SavedReportListItem } from '../../src/services/reportRepository';
import { useReportPagination } from '../../src/services/useReportPagination';
import { tokens } from '../../src/theme/tokens';

export default function HistoryScreen() {
  const { repository, revision, deletingAll } = useReportRepository();
  const [query, setQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<SavedReportListItem | null>(null);
  const [failedDelete, setFailedDelete] = useState<SavedReportListItem | null>(null);
  const [loadErrorContext, setLoadErrorContext] = useState<'read' | 'refresh'>('read');
  const deleteGeneration = useRef(0);
  const deletingAllRef = useRef(deletingAll);
  deletingAllRef.current = deletingAll;
  const pagination = useReportPagination({ repository, query, revision, deletingAll });

  const deleteReport = async (report: SavedReportListItem) => {
    const generation = ++deleteGeneration.current;
    setPendingDelete(null);
    setLoadErrorContext('refresh');
    try {
      await repository.delete(report.id);
      if (generation !== deleteGeneration.current || deletingAllRef.current) return;
      setFailedDelete(null);
    } catch {
      if (generation !== deleteGeneration.current || deletingAllRef.current) return;
      setLoadErrorContext('read');
      setFailedDelete(report);
    }
  };

  const header = (
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.title}>History</Text>
      <Text style={styles.subtitle}>Saved only on this device.</Text>
      <PrimaryButton label="View Private Trends" onPress={() => router.push('/trends')} />
      <TextInput
        accessibilityLabel="Search saved analyses"
        onChangeText={(value) => { setLoadErrorContext('read'); setQuery(value); }}
        placeholder="Search saved analyses"
        placeholderTextColor={tokens.colors.textSecondary}
        style={styles.search}
        value={query}
      />
      {pagination.status === 'loading' ? (
        <View accessibilityLabel="Loading saved analyses" style={styles.loading}>
          <ActivityIndicator color={tokens.colors.accent} />
        </View>
      ) : null}
      {pagination.status === 'error' ? (
        <>
          <Text accessibilityRole="alert" style={styles.error}>Could not {loadErrorContext === 'refresh' ? 'refresh' : 'load'} saved analyses. Please try again.</Text>
          <PrimaryButton label="Retry loading saved analyses" onPress={pagination.retry} />
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

  const footer = pagination.pageError ? (
    <View style={styles.footer}>
      <Text accessibilityRole="alert" style={styles.error}>Could not load more saved analyses.</Text>
      <PrimaryButton label="Retry loading more saved analyses" onPress={pagination.retry} />
    </View>
  ) : pagination.loadingMore ? (
    <View accessibilityLabel="Loading more saved analyses" style={styles.loading}><ActivityIndicator color={tokens.colors.accent} /></View>
  ) : null;

  return (
    <Screen style={styles.screen}>
      <FlatList
        ListEmptyComponent={pagination.status === 'ready'
          ? <Text style={styles.empty}>{query ? 'No saved analyses match your search.' : 'No saved analyses yet.'}</Text>
          : null}
        ListFooterComponent={footer}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        data={pagination.items}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(report) => report.id}
        onEndReached={pagination.loadMore}
        onEndReachedThreshold={0.4}
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
  footer: { gap: tokens.spacing.sm, paddingTop: tokens.spacing.lg },
  separator: { height: tokens.spacing.md },
  title: { color: tokens.colors.textPrimary, fontSize: 28, fontWeight: '700' },
  subtitle: { color: tokens.colors.textSecondary, fontSize: 16 },
  search: { borderColor: tokens.colors.textSecondary, borderRadius: tokens.radius.md, borderWidth: 1, color: tokens.colors.textPrimary, minHeight: tokens.minTouchTarget, paddingHorizontal: tokens.spacing.md },
  empty: { color: tokens.colors.textSecondary, fontSize: 16, paddingTop: tokens.spacing.lg, textAlign: 'center' },
  error: { color: tokens.colors.error, fontSize: 16 },
  loading: { alignItems: 'center', minHeight: tokens.minTouchTarget, justifyContent: 'center' },
});
