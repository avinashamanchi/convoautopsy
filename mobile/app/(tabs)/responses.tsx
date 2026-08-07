import { router } from 'expo-router';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '../../src/components/EmptyState';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Screen } from '../../src/components/Screen';
import { useReportRepository } from '../../src/services/reportRepositoryContext';
import { useReportPagination } from '../../src/services/useReportPagination';
import { tokens } from '../../src/theme/tokens';

export default function ResponsesScreen() {
  const { repository, revision, deletingAll } = useReportRepository();
  const pagination = useReportPagination({ repository, revision, deletingAll });

  if (pagination.status === 'loading' && pagination.items.length === 0) {
    return <Screen><View accessibilityLabel="Loading saved analyses" style={styles.loading}><ActivityIndicator color={tokens.colors.accent} /><Text style={styles.message}>Loading saved analyses…</Text></View></Screen>;
  }
  if (pagination.status === 'error' && pagination.items.length === 0) {
    return (
      <Screen>
        <Text accessibilityRole="alert" style={styles.error}>Saved analyses could not be loaded. Please try again.</Text>
        <PrimaryButton label="Retry loading saved analyses" onPress={pagination.retry} />
      </Screen>
    );
  }
  if (pagination.items.length === 0) {
    return <Screen><EmptyState title="Responses" description="Save an analysis first, then choose it here to draft a response." /></Screen>;
  }

  const header = (
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.title}>Choose an analysis</Text>
      <Text style={styles.message}>Drafts stay on this device until you manually copy or share one.</Text>
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
        contentContainerStyle={styles.content}
        data={pagination.items}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyExtractor={(report) => report.id}
        ListFooterComponent={footer}
        ListHeaderComponent={header}
        onEndReached={pagination.loadMore}
        onEndReachedThreshold={0.4}
        renderItem={({ item, index }) => (
          <PrimaryButton
            label={`Draft responses for ${item.title}`}
            onPress={() => router.push(`/response/${item.id}`)}
            testID={`response-report-row-${index}`}
          />
        )}
        testID="responses-list"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 0 },
  content: { padding: tokens.spacing.lg, paddingBottom: tokens.spacing.xl },
  header: { gap: tokens.spacing.md, marginBottom: tokens.spacing.md },
  footer: { gap: tokens.spacing.sm, paddingTop: tokens.spacing.lg },
  separator: { height: tokens.spacing.md },
  title: { color: tokens.colors.textPrimary, fontSize: 28, fontWeight: '700' },
  message: { color: tokens.colors.textSecondary, fontSize: 16, lineHeight: 24 },
  error: { color: tokens.colors.error, fontSize: 16, lineHeight: 24 },
  loading: { alignItems: 'center', gap: tokens.spacing.sm, justifyContent: 'center', minHeight: tokens.minTouchTarget },
});
