import { useCallback, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useBilling } from '../src/billing/BillingProvider';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { Screen } from '../src/components/Screen';
import type { TrendSummary } from '../src/services/reportRepository';
import { useReportRepository } from '../src/services/reportRepositoryContext';
import { tokens } from '../src/theme/tokens';

const WINDOW_MILLISECONDS = 30 * 24 * 60 * 60 * 1_000;
const systemNow = () => new Date();

export default function TrendsScreen({ now = systemNow }: Readonly<{ now?: () => Date }>) {
  const { entitlementActive } = useBilling();
  const { repository, revision, deletingAll } = useReportRepository();
  const [summary, setSummary] = useState<TrendSummary | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const generationRef = useRef(0);
  const window = useMemo(() => {
    const to = now();
    return {
      fromInclusive: new Date(to.getTime() - WINDOW_MILLISECONDS).toISOString(),
      toExclusive: to.toISOString(),
    };
  }, [now]);

  useFocusEffect(useCallback(() => {
    void attempt;
    void revision;
    const generation = ++generationRef.current;
    if (!entitlementActive || deletingAll) {
      setSummary(null);
      setStatus('ready');
      return () => { generationRef.current += 1; };
    }
    setStatus('loading');
    void repository.getTrendSummary(window.fromInclusive, window.toExclusive).then(
      (next) => {
        if (generation !== generationRef.current) return;
        setSummary(next);
        setStatus('ready');
      },
      () => {
        if (generation === generationRef.current) setStatus('error');
      },
    );
    return () => { if (generationRef.current === generation) generationRef.current += 1; };
  }, [attempt, deletingAll, entitlementActive, repository, revision, window.fromInclusive, window.toExclusive]));

  if (!entitlementActive) {
    return (
      <Screen>
        <Text accessibilityRole="header" style={styles.title}>Private Trends</Text>
        <Text style={styles.message}>Private Trends is a Convo Pro feature.</Text>
        <Text style={styles.message}>Summaries are computed only from analyses saved on this device.</Text>
        <PrimaryButton label="Unlock Private Trends" onPress={() => router.push('/upgrade?source=trends')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Private Trends</Text>
        <Text style={styles.message}>Local window: {window.fromInclusive} to {window.toExclusive} (end exclusive).</Text>
        <Text style={styles.message}>Nothing in this summary is sent to remote AI.</Text>
        {status === 'loading' ? (
          <View accessibilityLabel="Loading private trends" style={styles.loading}><ActivityIndicator color={tokens.colors.accent} /></View>
        ) : null}
        {status === 'error' ? (
          <View style={styles.section}>
            <Text accessibilityRole="alert" style={styles.error}>Private trends could not be loaded.</Text>
            <PrimaryButton label="Retry loading private trends" onPress={() => setAttempt((value) => value + 1)} />
          </View>
        ) : null}
        {status === 'ready' && summary?.reportCount === 0 ? <Text style={styles.message}>No saved analyses in this window.</Text> : null}
        {status === 'ready' && summary && summary.reportCount > 0 ? (
          <View style={styles.section}>
            <Text style={styles.metric}>{summary.reportCount} saved analyses</Text>
            <Text style={styles.metric}>Average intensity: {summary.averageIntensity ?? 'Not available'}</Text>
            <Text style={styles.sectionTitle}>Conflict modes</Text>
            {Object.entries(summary.conflictModes).sort(([left], [right]) => left.localeCompare(right)).map(([label, count]) => (
              <Text key={label} style={styles.message}>{label}: {count}</Text>
            ))}
            <Text style={styles.sectionTitle}>Message patterns</Text>
            {Object.entries(summary.patterns).sort(([left], [right]) => left.localeCompare(right)).map(([label, count]) => (
              <Text key={label} style={styles.message}>{label}: {count}</Text>
            ))}
          </View>
        ) : null}
        <Text style={styles.limitation}>Patterns are descriptive signals from saved analyses, not diagnoses or predictions.</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: tokens.spacing.md, paddingBottom: tokens.spacing.xl },
  title: { color: tokens.colors.textPrimary, fontSize: 28, fontWeight: '700' },
  message: { color: tokens.colors.textSecondary, fontSize: 16, lineHeight: 24 },
  limitation: { color: tokens.colors.textSecondary, fontSize: 14, fontStyle: 'italic', lineHeight: 22 },
  loading: { alignItems: 'center', minHeight: tokens.minTouchTarget, justifyContent: 'center' },
  section: { gap: tokens.spacing.sm },
  sectionTitle: { color: tokens.colors.textPrimary, fontSize: 18, fontWeight: '700', marginTop: tokens.spacing.sm },
  metric: { color: tokens.colors.textPrimary, fontSize: 18, fontWeight: '600' },
  error: { color: tokens.colors.error, fontSize: 16, lineHeight: 24 },
});
