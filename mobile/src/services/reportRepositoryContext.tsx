import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { tokens } from '../theme/tokens';
import { openExpoSqlitePort } from './expoSqlitePort';
import type { PreferenceStore, ReportRepository } from './reportRepository';
import { createSqlitePreferenceStore } from './sqlitePreferenceStore';
import { createSqliteReportRepository } from './sqliteReportRepository';
import { createInvalidatingReportRepository, type InvalidatingReportRepository } from './reportRepositoryCoordinator';

type ReportRepositoryContextValue = {
  preferences: PreferenceStore;
  repository: InvalidatingReportRepository;
  revision: number;
  deletingAll: boolean;
};

const ReportRepositoryContext = createContext<ReportRepositoryContextValue | null>(null);

type ReportRepositoryProviderProps = PropsWithChildren<{
  repository?: ReportRepository;
  preferenceStore?: PreferenceStore;
}>;

export function ReportRepositoryProvider({ children, repository: injectedRepository, preferenceStore: injectedPreferences }: ReportRepositoryProviderProps) {
  const [value, setValue] = useState<ReportRepositoryContextValue | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;
    setValue(null);
    setError(false);
    void (async () => {
      try {
        let repository: ReportRepository;
        let preferences: PreferenceStore;
        if (injectedRepository && injectedPreferences) {
          repository = injectedRepository;
          preferences = injectedPreferences;
        } else {
          const port = await openExpoSqlitePort();
          repository = createSqliteReportRepository(port);
          preferences = createSqlitePreferenceStore(port);
        }
        await repository.initialize();
        if (!active) return;
        const coordinated = createInvalidatingReportRepository(repository);
        const commit = (snapshot: ReturnType<InvalidatingReportRepository['getSnapshot']>) => {
          if (active) setValue({ repository: coordinated, preferences, ...snapshot });
        };
        unsubscribe = coordinated.subscribe(commit);
        commit(coordinated.getSnapshot());
      } catch {
        if (active) setError(true);
      }
    })();
    return () => { active = false; unsubscribe?.(); };
  }, [attempt, injectedPreferences, injectedRepository]);

  if (error) {
    return (
      <View style={styles.status}>
        <Text accessibilityRole="alert" style={styles.error}>Storage is unavailable. Your saved analyses could not be opened.</Text>
        <PrimaryButton label="Retry storage" onPress={() => setAttempt((current) => current + 1)} />
      </View>
    );
  }

  if (!value) {
    return (
      <View style={styles.status} accessibilityLabel="Initializing local storage">
        <ActivityIndicator color={tokens.colors.accent} />
        <Text style={styles.loading}>Preparing private local storage…</Text>
      </View>
    );
  }

  return <ReportRepositoryContext.Provider value={value}>{children}</ReportRepositoryContext.Provider>;
}

export function useReportRepository() {
  const value = useContext(ReportRepositoryContext);
  if (!value) throw new Error('useReportRepository must be used within ReportRepositoryProvider');
  return value;
}

const styles = StyleSheet.create({
  status: { alignItems: 'center', backgroundColor: tokens.colors.background, flex: 1, gap: tokens.spacing.md, justifyContent: 'center', padding: tokens.spacing.lg },
  error: { color: tokens.colors.error, fontSize: 16, lineHeight: 24, textAlign: 'center' },
  loading: { color: tokens.colors.textSecondary, fontSize: 16 },
});
