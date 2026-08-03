import { useCallback, useMemo, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ResponseDraft } from '../../src/domain/analysis';
import { craftLocalResponses, type ResponseGoal, type ResponseTone } from '../../src/domain/responseCrafter';
import { ResponseDraftCard } from '../../src/components/ResponseDraftCard';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Screen } from '../../src/components/Screen';
import type { SavedReport } from '../../src/services/reportRepository';
import { useReportRepository } from '../../src/services/reportRepositoryContext';
import { shareDraftText } from '../../src/services/exportReport';
import { tokens } from '../../src/theme/tokens';

const goals: readonly { id: ResponseGoal; label: string }[] = [
  { id: 'resolve', label: 'Resolve the conflict' },
  { id: 'boundary', label: 'Set a boundary' },
  { id: 'feelings', label: 'Express how I feel' },
  { id: 'understand', label: 'Seek understanding' },
  { id: 'apologize', label: 'Apologize & take responsibility' },
  { id: 'request', label: 'Request a behavior change' },
];

const tones: readonly { id: ResponseTone; label: string }[] = [
  { id: 'empathetic', label: 'Empathetic & warm' },
  { id: 'assertive', label: 'Assertive & confident' },
  { id: 'deescalating', label: 'De-escalating & calm' },
  { id: 'direct', label: 'Direct & clear' },
  { id: 'diplomatic', label: 'Diplomatic & balanced' },
];

export default function ResponseScreen() {
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const { repository, revision, deletingAll } = useReportRepository();
  const [report, setReport] = useState<SavedReport | null>(null);
  const [loadStatus, setLoadStatus] = useState<'loading' | 'missing' | 'error' | 'ready'>('loading');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [sender, setSender] = useState<string | null>(null);
  const [goal, setGoal] = useState<ResponseGoal | null>(null);
  const [tone, setTone] = useState<ResponseTone | null>(null);
  const [drafts, setDrafts] = useState<ResponseDraft[]>([]);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retryDrafts, setRetryDrafts] = useState<ResponseDraft[] | null>(null);
  const loadGeneration = useRef(0);
  const persistenceGeneration = useRef(0);
  const loadedReportId = useRef<string | null>(null);

  useFocusEffect(useCallback(() => {
    void loadAttempt;
    void revision;
    const generation = ++loadGeneration.current;
    persistenceGeneration.current += 1;
    setSaving(false);
    if (deletingAll) {
      setReport(null);
      setDrafts([]);
      setRetryDrafts(null);
      setSender(null);
      setGoal(null);
      setTone(null);
      setSaveError(false);
      setSaving(false);
      setLoadStatus('loading');
      loadedReportId.current = null;
      return () => { loadGeneration.current += 1; };
    }
    void (async () => {
      const routeChanged = loadedReportId.current !== reportId;
      if (routeChanged) setLoadStatus('loading');
      try {
        const saved = typeof reportId === 'string' ? await repository.get(reportId) : null;
        if (generation !== loadGeneration.current) return;
        loadedReportId.current = saved ? reportId : null;
        if (routeChanged) {
          setSender(null);
          setGoal(null);
          setTone(null);
        }
        setReport(saved);
        setDrafts(saved?.responseDrafts.map((draft) => ({ ...draft })) ?? []);
        setRetryDrafts(null);
        setSaveError(false);
        setLoadStatus(saved ? 'ready' : 'missing');
      } catch {
        if (generation === loadGeneration.current) setLoadStatus('error');
      }
    })();
    return () => { loadGeneration.current += 1; };
  }, [deletingAll, loadAttempt, reportId, repository, revision]));

  const senders = useMemo(() => Array.from(new Set(report?.result.messages.map((message) => message.sender) ?? [])), [report]);
  const progress = !sender ? 'Step 2 of 4: Sender' : !goal ? 'Step 3 of 4: Goal' : !tone ? 'Step 4 of 4: Tone' : 'Ready to generate';

  const persistDrafts = async (nextDrafts: ResponseDraft[]) => {
    if (!report) return;
    const generation = ++persistenceGeneration.current;
    setSaving(true);
    setSaveError(false);
    const draftsToSave = nextDrafts.map((draft) => ({ ...draft }));
    const updated = { ...report, responseDrafts: draftsToSave, updatedAt: new Date().toISOString() };
    try {
      await repository.save(updated);
      if (generation !== persistenceGeneration.current) return;
      setReport(updated);
      setDrafts(draftsToSave);
      setRetryDrafts(null);
    } catch {
      if (generation !== persistenceGeneration.current) return;
      setSaveError(true);
    } finally {
      if (generation === persistenceGeneration.current) setSaving(false);
    }
  };

  const generate = () => {
    if (!sender || !goal || !tone) return;
    const nextDrafts = craftLocalResponses({ sender, goal, tone });
    setDrafts(nextDrafts);
    setRetryDrafts(nextDrafts);
    void persistDrafts(nextDrafts);
  };

  const resetWizard = () => {
    setSender(null);
    setGoal(null);
    setTone(null);
    setDrafts([]);
    setRetryDrafts([]);
    setSaveError(false);
    void persistDrafts([]);
  };

  if (deletingAll) return <Screen><Text style={styles.message}>Saved app data is being deleted…</Text></Screen>;
  if (loadStatus === 'loading') return <Screen><Text style={styles.message}>Loading saved analysis…</Text></Screen>;
  if (loadStatus === 'missing') return <Screen><Text accessibilityRole="alert" style={styles.error}>This saved analysis no longer exists.</Text></Screen>;
  if (loadStatus === 'error' || !report) {
    return (
      <Screen>
        <Text accessibilityRole="alert" style={styles.error}>This saved analysis could not be read.</Text>
        <PrimaryButton label="Retry loading analysis" onPress={() => setLoadAttempt((value) => value + 1)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Craft a response</Text>
        <Text style={styles.progress}>{progress}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Report</Text>
          <Text style={styles.message}>Selected report: {report.title}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Who is sending this?</Text>
          {sender ? <Text style={styles.message}>Selected sender: {sender}</Text> : null}
          {senders.map((person) => (
            <PrimaryButton
              key={person}
              label={person}
              selected={sender === person}
              disabled={saving}
              onPress={() => { setSender(person); setGoal(null); setTone(null); }}
              testID={`sender-${person.toLowerCase().replaceAll(' ', '-')}`}
            />
          ))}
        </View>
        {sender ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>3. What is your goal?</Text>
            {goal ? <Text style={styles.message}>Selected goal: {goals.find((option) => option.id === goal)?.label}</Text> : null}
            {goals.map((option) => (
              <PrimaryButton
                key={option.id}
                label={option.label}
                selected={goal === option.id}
                disabled={saving}
                onPress={() => { setGoal(option.id); setTone(null); }}
                testID={`goal-${option.id}`}
              />
            ))}
          </View>
        ) : null}
        {goal ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>4. What tone fits?</Text>
            {tone ? <Text style={styles.message}>Selected tone: {tones.find((option) => option.id === tone)?.label}</Text> : null}
            {tones.map((option) => (
              <PrimaryButton key={option.id} label={option.label} selected={tone === option.id} disabled={saving} onPress={() => setTone(option.id)} testID={`tone-${option.id}`} />
            ))}
          </View>
        ) : null}

        <PrimaryButton label="Generate drafts" disabled={!sender || !goal || !tone || saving} onPress={generate} testID="generate-responses" />
        <PrimaryButton label="Reset draft choices" disabled={saving} onPress={resetWizard} />
        {saveError ? (
          <View style={styles.section}>
            <Text accessibilityRole="alert" style={styles.error}>Could not save these drafts. Please try again.</Text>
            <PrimaryButton label="Retry saving drafts" disabled={saving || !retryDrafts} onPress={() => { if (retryDrafts) void persistDrafts(retryDrafts); }} />
          </View>
        ) : null}
        {drafts.map((draft) => (
          <ResponseDraftCard
            key={draft.id}
            draft={draft}
            onCopy={Clipboard.setStringAsync}
            onShare={shareDraftText}
            shareTestID={`share-response-${drafts.indexOf(draft)}`}
          />
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: tokens.spacing.md, paddingBottom: tokens.spacing.xl },
  title: { color: tokens.colors.textPrimary, fontSize: 28, fontWeight: '700' },
  progress: { color: tokens.colors.accent, fontSize: 16, fontWeight: '700' },
  section: { gap: tokens.spacing.sm },
  sectionTitle: { color: tokens.colors.textPrimary, fontSize: 18, fontWeight: '700' },
  message: { color: tokens.colors.textSecondary, fontSize: 16, lineHeight: 24 },
  error: { color: tokens.colors.error, fontSize: 16, lineHeight: 24 },
});
