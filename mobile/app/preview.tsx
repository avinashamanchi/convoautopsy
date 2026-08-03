import { useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { AiConsentSheet } from '../src/components/AiConsentSheet';
import { AnalysisModePicker } from '../src/components/AnalysisModePicker';
import { ParsedMessageList } from '../src/components/ParsedMessageList';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { Screen } from '../src/components/Screen';
import type { ParseResult } from '../src/domain/analysis';
import { parserErrorMessage } from '../src/domain/parserErrors';
import { createAiClient } from '../src/services/aiClient';
import { SECURE_STORAGE_UNAVAILABLE_MESSAGE, createConsentStore } from '../src/services/consentStore';
import { useReportRepository } from '../src/services/reportRepositoryContext';
import { useAnalysisSession } from '../src/state/AnalysisSession';
import { tokens } from '../src/theme/tokens';

const NO_MESSAGES_ERROR = "Couldn't find any messages. Use Name: Message on each line.";
const AI_FAILURE = "AI-assisted analysis couldn't be completed. Your conversation is still available.";

export default function PreviewScreen() {
  const { draft, parsed, preparePreview, runLocal, startRemote, setRemoteResult, cancel } = useAnalysisSession();
  const { preferences } = useReportRepository();
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [consentVisible, setConsentVisible] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const preparedDraft = useRef<string | null>(null);
  const activeRemoteRunRef = useRef<number | null>(null);
  const remoteRunCounterRef = useRef(0);
  const consentCheckCounterRef = useRef(0);
  const mountedRef = useRef(false);
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  const consentStore = useMemo(() => createConsentStore({ preferences }), [preferences]);
  const analyzeRemotely = useMemo(
    () => createAiClient({
      getConsent: consentStore.getConsent,
      getInstallationToken: consentStore.getInstallationToken,
    }),
    [consentStore],
  );

  useEffect(() => {
    if (preparedDraft.current === draft) {
      return;
    }
    preparedDraft.current = draft;
    try {
      setPreview(preparePreview());
    } catch (error) {
      router.replace({ pathname: '/', params: { error: parserErrorMessage(error) } });
    }
  }, [draft, preparePreview]);

  useEffect(() => {
    if (preview && preview.messages.length === 0) {
      router.replace({ pathname: '/', params: { error: NO_MESSAGES_ERROR } });
    }
  }, [preview]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRemoteRunRef.current = null;
      consentCheckCounterRef.current += 1;
      cancelRef.current();
    };
  }, []);

  const activePreview = preview ?? parsed;

  if (!activePreview || activePreview.messages.length === 0) {
    return null;
  }
  const messagesForAi = activePreview.messages;

  function runLocalAndOpenResult() {
    runLocal();
    router.replace('/result');
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
    if (!mountedRef.current || activeRemoteRunRef.current !== null) return;
    const run = ++remoteRunCounterRef.current;
    activeRemoteRunRef.current = run;
    setAiRunning(true);
    setAiNotice(null);

    try {
      if (grantConsent) await consentStore.grantConsent();
      if (!isCurrentRun(run)) return;
      const attempt = startRemote();
      const result = await analyzeRemotely(messagesForAi, attempt.signal);
      if (attempt.signal.aborted || !isCurrentRun(run)) return;
      setRemoteResult(result, attempt.requestId);
      if (!isCurrentRun(run)) return;
      setConsentVisible(false);
      router.replace('/result');
    } catch (error) {
      if (!isCurrentRun(run)) return;
      cancel();
      if (!isCurrentRun(run)) return;
      setConsentVisible(false);
      setAiNotice(error instanceof Error && error.message === SECURE_STORAGE_UNAVAILABLE_MESSAGE
        ? SECURE_STORAGE_UNAVAILABLE_MESSAGE
        : AI_FAILURE);
    } finally {
      finishRemoteRun(run);
    }
  }

  async function startConsentFlow() {
    if (!mountedRef.current || activeRemoteRunRef.current !== null) return;
    const consentCheck = ++consentCheckCounterRef.current;
    setAiNotice(null);
    try {
      const currentConsent = await consentStore.getConsent();
      if (!mountedRef.current || consentCheckCounterRef.current !== consentCheck) return;
      if (currentConsent) {
        void runAiAnalysis(false);
      } else {
        setConsentVisible(true);
      }
    } catch {
      if (!mountedRef.current || consentCheckCounterRef.current !== consentCheck) return;
      setAiNotice(AI_FAILURE);
    }
  }

  function cancelAiAnalysis() {
    consentCheckCounterRef.current += 1;
    activeRemoteRunRef.current = null;
    cancel();
    setAiRunning(false);
    setConsentVisible(false);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Review your conversation</Text>
        <Text style={styles.description}>Check the parsed messages before choosing an analysis mode.</Text>
        <ParsedMessageList parsed={activePreview} />
        <PrimaryButton label="Edit conversation" onPress={() => router.back()} />
        <AnalysisModePicker aiNotice={aiNotice} onRunLocal={runLocalAndOpenResult} onStartAi={() => { void startConsentFlow(); }} />
        {consentVisible ? (
          <AiConsentSheet
            isRunning={aiRunning}
            onAgree={() => { void runAiAnalysis(true); }}
            onCancel={cancelAiAnalysis}
          />
        ) : null}
        {aiNotice ? <PrimaryButton label="Run on-device analysis instead" onPress={runLocalAndOpenResult} /> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: tokens.spacing.md, paddingBottom: tokens.spacing.xl },
  title: { color: tokens.colors.textPrimary, fontSize: 28, fontWeight: '700' },
  description: { color: tokens.colors.textSecondary, fontSize: 16, lineHeight: 22 },
});
