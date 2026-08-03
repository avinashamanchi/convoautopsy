import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SavedReport } from '../services/reportRepository';
import { tokens } from '../theme/tokens';

type ReportListItemProps = {
  report: SavedReport;
  onDelete(): void;
  onOpen(): void;
  testID?: string;
};

export function ReportListItem({ report, onDelete, onOpen, testID }: ReportListItemProps) {
  return (
    <View style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${report.title}`} onPress={onOpen} style={styles.open} testID={testID}>
        <Text style={styles.title}>{report.title}</Text>
        <Text style={styles.meta}>Saved {new Date(report.updatedAt).toLocaleDateString()}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${report.title}`} onPress={onDelete} style={styles.delete}>
        <Text style={styles.deleteText}>Delete</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', backgroundColor: tokens.colors.surface, borderRadius: tokens.radius.md, flexDirection: 'row', gap: tokens.spacing.sm, padding: tokens.spacing.md },
  open: { flex: 1, gap: tokens.spacing.xs, minHeight: tokens.minTouchTarget },
  title: { color: tokens.colors.textPrimary, fontSize: 17, fontWeight: '700' },
  meta: { color: tokens.colors.textSecondary, fontSize: 14 },
  delete: { alignItems: 'center', justifyContent: 'center', minHeight: tokens.minTouchTarget, paddingHorizontal: tokens.spacing.sm },
  deleteText: { color: tokens.colors.error, fontSize: 15, fontWeight: '700' },
});
