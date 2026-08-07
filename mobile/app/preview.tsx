import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useBilling } from '../src/billing/BillingProvider';
import { AiConsentSheet } from '../src/components/AiConsentSheet';
import { AnalysisModePicker } from '../src/components/AnalysisModePicker';
import { ParsedMessageList } from '../src/components/ParsedMessageList';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { RemoteDataReview } from '../src/components/RemoteDataReview';
import { Screen } from '../src/components/Screen';
import type { ParsedMessage, ParseResult } from '../src/domain/analysis';
import { parserErrorMessage } from '../src/domain/parserErrors';
import { AiClientError, createAiClient } from '../src/services/aiClient';
import { SECURE_STORAGE_UNAVAILABLE_MESSAGE, createConsentStore } from '../src/services/consentStore';
import { useReportRepository } from '../src/services/reportRepositoryContext';
import { useAnalysisSession } from '../src/state/AnalysisSession';
import { tokens } from '../src/theme/tokens';
import { formatRetryDuration } from '../src/services/retryTiming';

const NO_MESSAGES_ERROR = "Couldn't find any messages. Use Name: Message on each line.";
const AI_FAILURE = "AI-assisted analysis couldn't be completed. Your conversation is still available.";

export default function PreviewScreen() {
  const {
    draft,
    parsed,
    preparePreview,
    runLocal,
    confirmRemoteReview,
    startRemote,
    setRemoteResult,
    cancel,
  } = useAnalysisSession();
  const { preferences } = useReportRepository();
  const { appUserId, identityStatus } = useBilling();
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [reviewConfirming, setReviewConfirming] = useState(false);
  const [consentVisible, setConsentVisible] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const preparedDraft = useRef<string | null>(null);
  const activeRemoteRunRef = useRef<number | null>(null);
  const remoteRunCounterRef = useRef(0);
  const consentCheckCounterRef = useRef(0);
  const consentLookupPendingRef = useRef(false);
  const reviewConfirmingRef = useRef(false);
  const remoteWorkflowActiveRef = useRef(false);
  const mountedRef = useRef(false);
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  const consentStore = useMemo(() => createConsentStore({ preferences }), [preferences]);
  const analyzeRemotely = useMemo(
    () => createAiClient({
      getConsent: consentStore.getConsent,
      getInstallationToken: consentStore.getInstallationToken,
      getRevenueCatAppUserId: async () => {
        if (identityStatus !== 'ready' || !appUserId) throw new AiClientError('NOT_CONFIGURED');
        return appUserId;
      },
    }),
    [appUserId, consentStore, identityStatus],
  );
  const cancelPendingWork = useCallback(() => {
    consentCheckCounterRef.current += 1;
    consentLookupPendingRef.current = false;
    reviewConfirmingRef.current = false;
    remoteWorkflowActiveRef.current = false;
    activeRemoteRunRef.current = null;
    setAiRunning(false);
    setReviewConfirming(false);
    setReviewVisible(false);
    setConsentVisible(false);
    cancel();
  }, [cancel]);

  useEffect(() => {
    if (preparedDraft.current === draft) return;
    if (preparedDraft.current !== null && remoteWorkflowActiveRef.current) cancelPendingWork();
    preparedDraft.current = draft;
    setReviewVisible(false);
    setConsentVisible(false);
    try {
      setPreview(preparePreview());
    } catch (error) {
      router.replace({ pathname: '/', params: { error: parserErrorMessage(error) } });
    }
  }, [cancelPendingWork, draft, preparePreview]);

  useEffect(() => {
    if (preview && preview.messages.length === 0) {
      router.replace({ pathname: '/', params: { error: NO_MESSAGES_ERROR } });
    }
  }, [preview]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      const hasUnfinishedWork = remoteWorkflowActiveRef.current
        || activeRemoteRunRef.current !== null
        || consentLookupPendingRef.current;
      mountedRef.current = false;
      activeRemoteRunRef.current = null;
      consentCheckCounterRef.current += 1;
      consentLookupPendingRef.current = false;
      reviewConfirmingRef.current = false;
      remoteWorkflowActiveRef.current = false;
      if (hasUnfinishedWork) cancelRef.current();
    };
  }, []);

  const activePreview = preview ?? parsed;

  if (!activePreview || activePreview.messages.length === 0) return null;

  function runLocalAndOpenResult() {
    cancelPendingWork();
    runLocal();
    router.replace('/result');
  }

  function editConversation() {
    cancelPendingWork();
    router.back();
  }

  function finishRemoteRun(run: number) {
    if (mountedRef.current && activeRemoteRunRef.current === run) {
      activeRemoteRunRef.current = null;
      setAiRunning(false);
    }
  }

  function isCurrentRun(run: number) {
    return mountedRef.current && activeRemoteRunRef.current === run;
  }

  async function runAiAnalysis(grantConsent: boolean) {
    if (!mountedRef.current || activeRemoteRunRef.current !== null || !remoteWorkflowActiveRef.current) return;
    const run = ++remoteRunCounterRef.current;
    activeRemoteRunRef.current = run;
    setAiRunning(true);
    setAiNotice(null);

    try {
      if (grantConsent) await consentStore.grantConsent();
      if (!isCurrentRun(run)) return;
      const attempt = startRemote();
      const result = await analyzeRemotely(attempt.messages, attempt.signal);
      if (attempt.signal.aborted || !isCurrentRun(run)) return;
      setRemoteResult(result, attempt.requestId);
      if (!isCurrentRun(run)) return;
      finishRemoteRun(run);
      setConsentVisible(false);
      remoteWorkflowActiveRef.current = false;
      router.replace('/result');
    } catch (error) {
      if (!isCurrentRun(run)) return;
      cancel();
      if (!isCurrentRun(run)) return;
      setConsentVisible(false);
      remoteWorkflowActiveRef.current = false;
      setAiNotice(aiFailureMessage(error));
    } finally {
      finishRemoteRun(run);
    }
  }

  function startReviewFlow() {
    if (!mountedRef.current || remoteWorkflowActiveRef.current || activeRemoteRunRef.current !== null) return;
    cancel();
    setAiNotice(null);
    setConsentVisible(false);
    setReviewVisible(true);
    remoteWorkflowActiveRef.current = true;
  }

  async function confirmReview(messages: ParsedMessage[]) {
    if (!mountedRef.current || !remoteWorkflowActiveRef.current || reviewConfirmingRef.current) return;
    reviewConfirmingRef.current = true;
    setReviewConfirming(true);
    confirmRemoteReview(messages);
    const consentCheck = ++consentCheckCounterRef.current;
    consentLookupPendingRef.current = true;
    setAiNotice(null);
    try {
      const currentConsent = await consentStore.getConsent();
      if (!mountedRef.current || consentCheckCounterRef.current !== consentCheck || !remoteWorkflowActiveRef.current) return;
      consentLookupPendingRef.current = false;
      reviewConfirmingRef.current = false;
      setReviewConfirming(false);
      setReviewVisible(false);
      if (currentConsent) void runAiAnalysis(false);
      else setConsentVisible(true);
    } catch {
      if (!mountedRef.current || consentCheckCounterRef.current !== consentCheck) return;
      consentLookupPendingRef.current = false;
      reviewConfirmingRef.current = false;
      setReviewConfirming(false);
      setReviewVisible(false);
      remoteWorkflowActiveRef.current = false;
      cancel();
      setAiNotice(AI_FAILURE);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Review your conversation</Text>
        <Text style={styles.description}>Check the parsed messages before choosing an analysis mode.</Text>
        <ParsedMessageList parsed={activePreview} />
        <PrimaryButton label="Edit conversation" onPress={editConversation} />
        <AnalysisModePicker aiNotice={aiNotice} onRunLocal={runLocalAndOpenResult} onStartAi={startReviewFlow} />
        {reviewVisible ? (
          <RemoteDataReview
            isConfirming={reviewConfirming}
            messages={activePreview.messages}
            onCancel={cancelPendingWork}
            onConfirm={(messages) => { void confirmReview(messages); }}
          />
        ) : null}
        {consentVisible ? (
          <AiConsentSheet
            isRunning={aiRunning}
            onAgree={() => { void runAiAnalysis(true); }}
            onCancel={cancelPendingWork}
          />
        ) : null}
        {aiNotice ? <PrimaryButton label="Run on-device analysis instead" onPress={runLocalAndOpenResult} /> : null}
      </ScrollView>
    </Screen>
  );
}

function aiFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message === SECURE_STORAGE_UNAVAILABLE_MESSAGE) return SECURE_STORAGE_UNAVAILABLE_MESSAGE;
  if (error instanceof AiClientError && error.code === 'NOT_CONFIGURED') return 'AI-assisted analysis is not configured. On-device analysis is available.';
  if (error instanceof AiClientError && error.code === 'RATE_LIMITED' && error.retryAfterSeconds) {
    return `AI-assisted analysis rate limit reached. Try again in ${error.retryAfterSeconds} seconds.`;
  }
  if (error instanceof AiClientError && error.code === 'PLAN_LIMIT_REACHED') {
    const reset = formatRetryDuration(error.retryAfterSeconds);
    return reset
      ? `AI-assisted analysis allowance reached. It resets in ${reset}.`
      : 'AI-assisted analysis allowance reached for this period.';
  }
  if (error instanceof AiClientError && (error.code === 'SERVICE_UNAVAILABLE' || error.code === 'OFFLINE' || error.code === 'TIMEOUT')) return 'AI-assisted analysis is temporarily unavailable. Your conversation is still available.';
  return AI_FAILURE;
}

const styles = StyleSheet.create({
  content: { gap: tokens.spacing.md, paddingBottom: tokens.spacing.xl },
  title: { color: tokens.colors.textPrimary, fontSize: 28, fontWeight: '700' },
  description: { color: tokens.colors.textSecondary, fontSize: 16, lineHeight: 22 },
});
