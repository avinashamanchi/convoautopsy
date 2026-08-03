import { useEffect, useMemo, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ResponseDraft } from '../../src/domain/analysis';
import { craftLocalResponses, type ResponseGoal, type ResponseTone } from '../../src/domain/responseCrafter';
import { ResponseDraftCard } from '../../src/components/ResponseDraftCard';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Screen } from '../../src/components/Screen';
import type { SavedReport } from '../../src/services/reportRepository';
import { useReportRepository } from '../../src/services/reportRepositoryContext';
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

async function shareDraftText(text: string) {
  const file = new File(Paths.cache, `convoautopsy-response-${Date.now()}.txt`);
  file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', dialogTitle: 'Share response draft' });
}

export default function ResponseScreen() {
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const { repository } = useReportRepository();
  const [report, setReport] = useState<SavedReport | null>(null);
  const [loadStatus, setLoadStatus] = useState<'loading' | 'missing' | 'error' | 'ready'>('loading');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [sender, setSender] = useState<string | null>(null);
  const [goal, setGoal] = useState<ResponseGoal | null>(null);
  const [tone, setTone] = useState<ResponseTone | null>(null);
  const [drafts, setDrafts] = useState<ResponseDraft[]>([]);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoadStatus('loading');
      try {
        const saved = typeof reportId === 'string' ? await repository.get(reportId) : null;
        if (!active) return;
        setReport(saved);
        setLoadStatus(saved ? 'ready' : 'missing');
      } catch {
        if (active) setLoadStatus('error');
      }
    })();
    return () => { active = false; };
  }, [loadAttempt, reportId, repository]);

  const senders = useMemo(() => Array.from(new Set(report?.result.messages.map((message) => message.sender) ?? [])), [report]);
  const progress = !sender ? 'Step 1 of 4: Report' : !goal ? 'Step 2 of 4: Sender' : !tone ? 'Step 3 of 4: Goal' : 'Step 4 of 4: Tone';

  const persistDrafts = async (nextDrafts: ResponseDraft[]) => {
    if (!report) return;
    setSaving(true);
    setSaveError(false);
    const updated = { ...report, responseDrafts: nextDrafts, updatedAt: new Date().toISOString() };
    try {
      await repository.save(updated);
      setReport(updated);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  const generate = () => {
    if (!sender || !goal || !tone) return;
    const nextDrafts = craftLocalResponses({ sender, goal, tone });
    setDrafts(nextDrafts);
    void persistDrafts(nextDrafts);
  };

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
          <Text style={styles.message}>{report.title}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Who is sending this?</Text>
          {senders.map((person) => <PrimaryButton key={person} label={person} onPress={() => setSender(person)} />)}
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. What is your goal?</Text>
          {goals.map((option) => <PrimaryButton key={option.id} label={option.label} onPress={() => setGoal(option.id)} />)}
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. What tone fits?</Text>
          {tones.map((option) => <PrimaryButton key={option.id} label={option.label} onPress={() => setTone(option.id)} />)}
        </View>

        <PrimaryButton label="Generate drafts" disabled={!sender || !goal || !tone || saving} onPress={generate} />
        <PrimaryButton label="Reset draft choices" onPress={() => { setSender(null); setGoal(null); setTone(null); setDrafts([]); setSaveError(false); }} />
        {saveError ? (
          <View style={styles.section}>
            <Text accessibilityRole="alert" style={styles.error}>Could not save these drafts. Please try again.</Text>
            <PrimaryButton label="Retry saving drafts" disabled={saving} onPress={() => { void persistDrafts(drafts); }} />
          </View>
        ) : null}
        {drafts.map((draft) => (
          <ResponseDraftCard
            key={draft.id}
            draft={draft}
            onCopy={Clipboard.setStringAsync}
            onShare={shareDraftText}
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
