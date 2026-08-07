import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AiConsentSheet } from '../../src/components/AiConsentSheet';
import { RemoteDataReview } from '../../src/components/RemoteDataReview';
import type { AnalysisResult, ParsedMessage, ResponseDraft } from '../../src/domain/analysis';
import { craftLocalResponses, type ResponseGoal, type ResponseTone } from '../../src/domain/responseCrafter';
import { ResponseDraftCard } from '../../src/components/ResponseDraftCard';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Screen } from '../../src/components/Screen';
import type { SavedReport } from '../../src/services/reportRepository';
import { useReportRepository } from '../../src/services/reportRepositoryContext';
import { shareDraftText } from '../../src/services/exportReport';
import { AiClientError, createResponseClient, type AiResponseRequest } from '../../src/services/aiClient';
import { CONSENT_VERSION, SECURE_STORAGE_UNAVAILABLE_MESSAGE, createConsentStore } from '../../src/services/consentStore';
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
  const { repository, preferences, revision, deletingAll } = useReportRepository();
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
  const [reviewMessages, setReviewMessages] = useState<ParsedMessage[]>([]);
  const [remoteStage, setRemoteStage] = useState<'idle' | 'review' | 'consent'>('idle');
  const [reviewConfirming, setReviewConfirming] = useState(false);
  const [remoteRunning, setRemoteRunning] = useState(false);
  const [remoteNotice, setRemoteNotice] = useState<string | null>(null);
  const loadGeneration = useRef(0);
  const persistenceGeneration = useRef(0);
  const loadedReportId = useRef<string | null>(null);
  const mountedRef = useRef(false);
  const deletingAllRef = useRef(deletingAll);
  const remoteGeneration = useRef(0);
  const remoteAbort = useRef<AbortController | null>(null);
  const reviewConfirmingRef = useRef(false);
  const remoteRunningRef = useRef(false);
  const pendingRemoteRequest = useRef<(AiResponseRequest & { reportId: string }) | null>(null);
  deletingAllRef.current = deletingAll;

  const consentStore = useMemo(() => createConsentStore({ preferences }), [preferences]);
  const craftReviewedResponse = useMemo(() => createResponseClient({
    getConsent: consentStore.getConsent,
    getInstallationToken: consentStore.getInstallationToken,
    getRevenueCatAppUserId: getRevenueCatAppUserIdHint,
  }), [consentStore]);

  const cancelRemoteWorkflow = useCallback(() => {
    remoteGeneration.current += 1;
    remoteAbort.current?.abort();
    remoteAbort.current = null;
    reviewConfirmingRef.current = false;
    remoteRunningRef.current = false;
    pendingRemoteRequest.current = null;
    if (mountedRef.current) {
      setReviewConfirming(false);
      setRemoteRunning(false);
      setRemoteStage('idle');
      setReviewMessages([]);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      remoteGeneration.current += 1;
      remoteAbort.current?.abort();
      remoteAbort.current = null;
      reviewConfirmingRef.current = false;
      remoteRunningRef.current = false;
      pendingRemoteRequest.current = null;
    };
  }, []);

  useFocusEffect(useCallback(() => {
    void loadAttempt;
    void revision;
    const generation = ++loadGeneration.current;
    cancelRemoteWorkflow();
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
      return () => { loadGeneration.current += 1; cancelRemoteWorkflow(); };
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
    return () => { loadGeneration.current += 1; cancelRemoteWorkflow(); };
  }, [cancelRemoteWorkflow, deletingAll, loadAttempt, reportId, repository, revision]));

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
    cancelRemoteWorkflow();
    setRemoteNotice(null);
    const nextDrafts = craftLocalResponses({ sender, goal, tone });
    setDrafts(nextDrafts);
    setRetryDrafts(nextDrafts);
    void persistDrafts(nextDrafts);
  };

  const resetWizard = () => {
    cancelRemoteWorkflow();
    setRemoteNotice(null);
    setSender(null);
    setGoal(null);
    setTone(null);
    setDrafts([]);
    setRetryDrafts([]);
    setSaveError(false);
    void persistDrafts([]);
  };

  const isCurrentRemoteRun = (generation: number, expectedReportId: string) => (
    mountedRef.current
    && remoteGeneration.current === generation
    && loadedReportId.current === expectedReportId
    && !deletingAllRef.current
  );

  async function runRemoteRequest(grantConsent: boolean) {
    const request = pendingRemoteRequest.current;
    if (!request || remoteRunningRef.current || !mountedRef.current) return;
    const generation = remoteGeneration.current;
    remoteRunningRef.current = true;
    setRemoteRunning(true);
    setRemoteNotice(null);
    const controller = new AbortController();
    remoteAbort.current = controller;
    try {
      if (grantConsent) await consentStore.grantConsent();
      if (!isCurrentRemoteRun(generation, request.reportId)) return;
      const remoteInput: AiResponseRequest = {
        sender: request.sender,
        goal: request.goal,
        tone: request.tone,
        analysis: request.analysis,
      };
      const draft = await craftReviewedResponse(remoteInput, controller.signal);
      if (controller.signal.aborted || !isCurrentRemoteRun(generation, request.reportId)) return;
      const latest = await repository.get(request.reportId);
      if (!latest || !isCurrentRemoteRun(generation, request.reportId)) return;
      const aiDraft = responseDraftForStorage(draft, latest.responseDrafts);
      const nextDrafts = [...latest.responseDrafts.map((item) => ({ ...item })), aiDraft];
      const updated = { ...latest, responseDrafts: nextDrafts, updatedAt: new Date().toISOString() };
      await repository.save(updated);
      if (!isCurrentRemoteRun(generation, request.reportId)) return;
      setReport(updated);
      setDrafts(nextDrafts);
      setRetryDrafts(null);
      setSaveError(false);
      setRemoteStage('idle');
      setReviewMessages([]);
      setRemoteNotice('One AI-assisted draft was saved. Review it before sending.');
      pendingRemoteRequest.current = null;
    } catch (error) {
      if (!isCurrentRemoteRun(generation, request.reportId)) return;
      setRemoteStage('idle');
      setReviewMessages([]);
      setRemoteNotice(remoteFailureMessage(error));
    } finally {
      if (isCurrentRemoteRun(generation, request.reportId)) {
        remoteRunningRef.current = false;
        remoteAbort.current = null;
        setRemoteRunning(false);
      }
    }
  }

  function startRemoteReview() {
    if (!report || !sender || !goal || !tone || saving || remoteRunningRef.current) return;
    cancelRemoteWorkflow();
    const generation = remoteGeneration.current;
    pendingRemoteRequest.current = {
      reportId: report.id,
      sender,
      goal,
      tone,
      analysis: report.result,
    };
    setReviewMessages(report.result.messages.map((message, index) => ({
      id: `review-${generation}-${index}`,
      sender: message.sender,
      text: message.text,
      sourceLine: index + 1,
    })));
    setRemoteNotice(null);
    setRemoteStage('review');
  }

  async function confirmReviewedText(messages: ParsedMessage[]) {
    const pending = pendingRemoteRequest.current;
    if (!pending || reviewConfirmingRef.current || remoteStage !== 'review') return;
    const generation = remoteGeneration.current;
    const reviewedAnalysis = analysisWithReviewedText(pending.analysis, messages);
    if (!reviewedAnalysis) {
      setRemoteStage('idle');
      setRemoteNotice('The reviewed text could not be validated. On-device drafts remain available.');
      return;
    }
    pendingRemoteRequest.current = { ...pending, analysis: reviewedAnalysis };
    reviewConfirmingRef.current = true;
    setReviewConfirming(true);
    try {
      const currentConsent = await consentStore.getConsent();
      if (!isCurrentRemoteRun(generation, pending.reportId)) return;
      reviewConfirmingRef.current = false;
      setReviewConfirming(false);
      setReviewMessages([]);
      if (currentConsent?.version === CONSENT_VERSION && currentConsent.provider === 'Groq') {
        setRemoteStage('idle');
        void runRemoteRequest(false);
      } else {
        setRemoteStage('consent');
      }
    } catch {
      if (!isCurrentRemoteRun(generation, pending.reportId)) return;
      reviewConfirmingRef.current = false;
      setReviewConfirming(false);
      setReviewMessages([]);
      setRemoteStage('idle');
      setRemoteNotice('AI consent could not be checked. On-device drafts remain available.');
    }
  }

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
              disabled={saving || remoteRunning || remoteStage !== 'idle'}
              onPress={() => { cancelRemoteWorkflow(); setSender(person); setGoal(null); setTone(null); }}
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
                disabled={saving || remoteRunning || remoteStage !== 'idle'}
                onPress={() => { cancelRemoteWorkflow(); setGoal(option.id); setTone(null); }}
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
              <PrimaryButton key={option.id} label={option.label} selected={tone === option.id} disabled={saving || remoteRunning || remoteStage !== 'idle'} onPress={() => { cancelRemoteWorkflow(); setTone(option.id); }} testID={`tone-${option.id}`} />
            ))}
          </View>
        ) : null}

        <PrimaryButton label="Generate on-device drafts" disabled={!sender || !goal || !tone || saving || remoteRunning} onPress={generate} testID="generate-responses" />
        <PrimaryButton
          label="Review text for one AI draft"
          disabled={!sender || !goal || !tone || saving || remoteRunning || remoteStage !== 'idle'}
          onPress={startRemoteReview}
          testID="review-ai-response"
        />
        <PrimaryButton label="Reset draft choices" disabled={saving || remoteRunning} onPress={resetWizard} />
        {remoteStage === 'review' ? (
          <RemoteDataReview
            isConfirming={reviewConfirming}
            messages={reviewMessages}
            onCancel={cancelRemoteWorkflow}
            onConfirm={(messages) => { void confirmReviewedText(messages); }}
          />
        ) : null}
        {remoteStage === 'consent' ? (
          <AiConsentSheet
            feature="response-draft"
            isRunning={remoteRunning}
            onAgree={() => { void runRemoteRequest(true); }}
            onCancel={cancelRemoteWorkflow}
          />
        ) : null}
        {remoteNotice ? <Text accessibilityRole="alert" style={styles.message}>{remoteNotice}</Text> : null}
        {saveError ? (
          <View style={styles.section}>
            <Text accessibilityRole="alert" style={styles.error}>Could not save these drafts. Please try again.</Text>
            <PrimaryButton label="Retry saving drafts" disabled={saving || !retryDrafts} onPress={() => { if (retryDrafts) void persistDrafts(retryDrafts); }} />
          </View>
        ) : null}
        {drafts.map((draft, index) => (
          <View key={draft.id} style={styles.section}>
            <Text style={styles.draftSource}>{draft.id.startsWith('ai-') ? 'AI-assisted draft' : 'On-device draft'}</Text>
            <ResponseDraftCard
              draft={draft}
              onCopy={Clipboard.setStringAsync}
              onShare={shareDraftText}
              shareTestID={`share-response-${index}`}
            />
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

async function getRevenueCatAppUserIdHint(): Promise<string | null> {
  try {
    const purchases = (await import('react-native-purchases')).default;
    return await purchases.getAppUserID();
  } catch {
    return null;
  }
}

function analysisWithReviewedText(analysis: AnalysisResult, reviewedMessages: ParsedMessage[]): AnalysisResult | null {
  if (analysis.messages.length !== reviewedMessages.length) return null;
  const messages = analysis.messages.map((message, index) => {
    const reviewed = reviewedMessages[index];
    if (!reviewed || reviewed.sender !== message.sender || !reviewed.text.trim()) return null;
    const length = Array.from(reviewed.text).length;
    if (length < 1 || length > 1_000) return null;
    return {
      sender: message.sender,
      text: reviewed.text,
      pattern: message.pattern,
      egoState: message.egoState,
      possibleInterpretation: message.possibleInterpretation,
    };
  });
  if (messages.some((message) => message === null)) return null;
  return {
    schemaVersion: 1,
    mode: analysis.mode,
    intensityScore: analysis.intensityScore,
    conflictMode: analysis.conflictMode,
    messages: messages as AnalysisResult['messages'],
  };
}

function responseDraftForStorage(draft: ResponseDraft, existing: readonly ResponseDraft[]): ResponseDraft {
  const existingIds = new Set(existing.map(({ id }) => id));
  const base = `ai-${draft.id}`.slice(0, 100);
  let id = base;
  let suffix = 2;
  while (existingIds.has(id)) {
    const marker = `-${suffix}`;
    id = `${base.slice(0, 100 - marker.length)}${marker}`;
    suffix += 1;
  }
  return { id, text: draft.text, hint: draft.hint };
}

function remoteFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message === SECURE_STORAGE_UNAVAILABLE_MESSAGE) return SECURE_STORAGE_UNAVAILABLE_MESSAGE;
  if (!(error instanceof AiClientError)) return 'The AI draft could not be completed. On-device drafts remain available.';
  if (error.code === 'RATE_LIMITED') {
    return error.retryAfterSeconds
      ? `AI draft rate limit reached. Try again in ${error.retryAfterSeconds} seconds.`
      : 'AI draft rate limit reached. Try again later.';
  }
  if (error.code === 'PLAN_LIMIT_REACHED') return 'AI draft allowance has been used for this period.';
  if (error.code === 'SERVICE_BUSY') return 'AI drafting is busy right now.';
  if (error.code === 'DAILY_BUDGET_REACHED') return "AI drafting is paused for today's service budget.";
  if (error.code === 'SERVICE_UNAVAILABLE') return 'AI drafting is temporarily unavailable.';
  if (error.code === 'TIMEOUT') return 'AI drafting timed out.';
  if (error.code === 'CANCELLED') return 'AI drafting was canceled.';
  if (error.code === 'OFFLINE') return 'AI drafting needs a network connection.';
  if (error.code === 'INVALID_RESPONSE') return 'The AI draft response could not be validated.';
  if (error.code === 'NOT_CONFIGURED') return 'AI drafting is not configured.';
  return 'The AI draft could not be completed. On-device drafts remain available.';
}

const styles = StyleSheet.create({
  content: { gap: tokens.spacing.md, paddingBottom: tokens.spacing.xl },
  draftSource: { color: tokens.colors.accent, fontSize: 15, fontWeight: '700' },
  title: { color: tokens.colors.textPrimary, fontSize: 28, fontWeight: '700' },
  progress: { color: tokens.colors.accent, fontSize: 16, fontWeight: '700' },
  section: { gap: tokens.spacing.sm },
  sectionTitle: { color: tokens.colors.textPrimary, fontSize: 18, fontWeight: '700' },
  message: { color: tokens.colors.textSecondary, fontSize: 16, lineHeight: 24 },
  error: { color: tokens.colors.error, fontSize: 16, lineHeight: 24 },
});
