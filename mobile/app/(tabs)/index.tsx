import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { ConversationEditor } from '../../src/components/ConversationEditor';
import { Screen } from '../../src/components/Screen';
import { pickConversationFile, pickConversationScreenshot } from '../../src/services/importConversation';
import { isOcrAvailable, recognizeConversationText } from '../../src/services/ocr';
import { useAnalysisSession } from '../../src/state/AnalysisSession';
import { tokens } from '../../src/theme/tokens';

export default function HomeScreen() {
  const { error: errorParam } = useLocalSearchParams<{ error?: string }>();
  const { draft, setDraft, status } = useAnalysisSession();
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const screenshotUri = useRef<string | null>(null);

  useEffect(() => {
    if (typeof errorParam === 'string') {
      setError(errorParam);
    }
  }, [errorParam]);

  useEffect(() => () => { screenshotUri.current = null; }, []);

  const importFile = async () => {
    setImporting(true);
    setError(null);
    const result = await pickConversationFile();
    if (result.ok) setDraft(result.text);
    else if (result.code !== 'CANCELLED') setError(fileImportError(result.code));
    setImporting(false);
  };

  const importScreenshot = async () => {
    setImporting(true);
    setError(null);
    const result = await pickConversationScreenshot();
    if (!result.ok) {
      if (result.code !== 'CANCELLED') setError('Could not select that screenshot. Please try again.');
      setImporting(false);
      return;
    }

    screenshotUri.current = result.uri;
    if (!isOcrAvailable()) {
      setError('Screenshot selected. On-device text extraction is available in the ConvoAutopsy development build. You can paste the text now.');
      screenshotUri.current = null;
      setImporting(false);
      return;
    }

    try {
      setDraft(await recognizeConversationText(result.uri));
    } catch (ocrError) {
      setError(ocrImportError(ocrError));
    } finally {
      screenshotUri.current = null;
      setImporting(false);
    }
  };

  return (
    <Screen>
      <View style={styles.container}>
        <Text accessibilityRole="header" style={styles.title}>Analyze a conversation</Text>
        <Text style={styles.body}>
          Your text stays on this device unless you choose AI-assisted analysis.
        </Text>
        <ConversationEditor
          disabled={status === 'analyzing-local' || status === 'analyzing-ai' || importing}
          error={error}
          onChange={(value) => {
            setError(null);
            setDraft(value);
          }}
          onImportFile={() => { void importFile(); }}
          onImportScreenshot={() => { void importScreenshot(); }}
          onReview={() => router.push('/preview')}
          value={draft}
        />
      </View>
    </Screen>
  );
}

function fileImportError(code: Exclude<Extract<Awaited<ReturnType<typeof pickConversationFile>>, { ok: false }>['code'], 'CANCELLED'>): string {
  switch (code) {
  case 'UNSUPPORTED_TYPE': return 'Choose a .txt, .log, or .csv conversation file.';
  case 'EMPTY_FILE': return 'That file is empty. Choose a conversation with text.';
  case 'FILE_TOO_LARGE': return 'That file exceeds the 1 MiB or 100,000-character import limit.';
  case 'UNREADABLE_FILE': return 'Could not read that file. Please choose another file.';
  }
}

function ocrImportError(error: unknown): string {
  if (error instanceof Error && error.message === 'OCR_EMPTY') {
    return 'No text was found in that screenshot. You can paste the conversation instead.';
  }
  return 'Could not extract text from that screenshot. You can paste the conversation instead.';
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { color: tokens.colors.textPrimary, fontSize: 32, fontWeight: '700', marginBottom: 12 },
  body: { color: tokens.colors.textSecondary, fontSize: 16, lineHeight: 24, marginBottom: tokens.spacing.lg },
});
