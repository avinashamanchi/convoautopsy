import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { AnalysisModePicker } from '../src/components/AnalysisModePicker';
import { ParsedMessageList } from '../src/components/ParsedMessageList';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { Screen } from '../src/components/Screen';
import type { ParseResult } from '../src/domain/analysis';
import { useAnalysisSession } from '../src/state/AnalysisSession';
import { tokens } from '../src/theme/tokens';

const NO_MESSAGES_ERROR = "Couldn't find any messages. Use Name: Message on each line.";
const AI_NOTICE = 'AI-assisted analysis will be connected after the secure service is configured.';

export default function PreviewScreen() {
  const { draft, parsed, preparePreview, runLocal } = useAnalysisSession();
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const preparedDraft = useRef<string | null>(null);

  useEffect(() => {
    if (preparedDraft.current === draft) {
      return;
    }
    preparedDraft.current = draft;
    setPreview(preparePreview());
  }, [draft, preparePreview]);

  useEffect(() => {
    if (preview && preview.messages.length === 0) {
      router.replace({ pathname: '/', params: { error: NO_MESSAGES_ERROR } });
    }
  }, [preview]);

  const activePreview = preview ?? parsed;

  if (!activePreview || activePreview.messages.length === 0) {
    return null;
  }

  function runLocalAndOpenResult() {
    runLocal();
    router.replace('/result');
  }

  function startConsentFlow() {
    setAiNotice(AI_NOTICE);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Review your conversation</Text>
        <Text style={styles.description}>Check the parsed messages before choosing an analysis mode.</Text>
        <ParsedMessageList parsed={activePreview} />
        <PrimaryButton label="Edit conversation" onPress={() => router.back()} />
        <AnalysisModePicker aiNotice={aiNotice} onRunLocal={runLocalAndOpenResult} onStartAi={startConsentFlow} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: tokens.spacing.md, paddingBottom: tokens.spacing.xl },
  title: { color: tokens.colors.textPrimary, fontSize: 28, fontWeight: '700' },
  description: { color: tokens.colors.textSecondary, fontSize: 16, lineHeight: 22 },
});
