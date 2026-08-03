import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ConversationEditor } from '../../src/components/ConversationEditor';
import { Screen } from '../../src/components/Screen';
import { nativeImportConversationService, type ImportResult } from '../../src/services/importConversation';
import { isOcrAvailable, recognizeConversationText } from '../../src/services/ocr';
import { useAnalysisSession } from '../../src/state/AnalysisSession';
import { tokens } from '../../src/theme/tokens';

type HomeScreenProps = {
  imports?: Pick<typeof nativeImportConversationService, 'pickConversationFile' | 'pickConversationScreenshot' | 'deletePickerArtifact'>;
  ocr?: { isAvailable(): boolean; recognizeText(uri: string): Promise<string> };
};

export default function HomeScreen({
  imports = nativeImportConversationService,
  ocr = { isAvailable: isOcrAvailable, recognizeText: recognizeConversationText },
}: HomeScreenProps) {
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

  useEffect(() => () => {
    const uri = screenshotUri.current;
    screenshotUri.current = null;
    if (uri) void imports.deletePickerArtifact(uri).catch(() => undefined);
  }, [imports]);

  const importFile = async () => {
    setImporting(true);
    setError(null);
    const result = await imports.pickConversationFile();
    if (result.ok) setDraft(result.text);
    else if (result.code !== 'CANCELLED') setError(fileImportError(result.code));
    setImporting(false);
  };

  const importScreenshot = async () => {
    setImporting(true);
    setError(null);
    let artifactUri: string | null = null;
    try {
      const result = await imports.pickConversationScreenshot();
      if (!result.ok) {
        if (result.code !== 'CANCELLED') setError('Could not select that screenshot. Please try again.');
        return;
      }
      artifactUri = result.uri;
      screenshotUri.current = artifactUri;
      if (!ocr.isAvailable()) {
        setError('Screenshot selected. On-device text extraction is available in the ConvoAutopsy development build. You can paste the text now.');
        return;
      }
      setDraft(await ocr.recognizeText(artifactUri));
    } catch (ocrError) {
      setError(ocrImportError(ocrError));
    } finally {
      if (artifactUri) {
        try {
          await imports.deletePickerArtifact(artifactUri);
        } catch {
          setError('Could not clear the temporary screenshot file. Delete all app data can retry this cleanup.');
        }
      }
      screenshotUri.current = null;
      setImporting(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          testID="analyze-scroll"
        >
          <View>
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
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function fileImportError(code: Exclude<Extract<ImportResult, { ok: false }>['code'], 'CANCELLED'>): string {
  switch (code) {
  case 'UNSUPPORTED_TYPE': return 'Choose a .txt, .log, or .csv conversation file.';
  case 'EMPTY_FILE': return 'That file is empty. Choose a conversation with text.';
  case 'FILE_TOO_LARGE': return 'That file exceeds the 1 MiB or 100,000-character import limit.';
  case 'UNREADABLE_FILE': return 'Could not read that file. Please choose another file.';
  default: return 'Could not import that file. Please choose another file.';
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
  scrollContent: { flexGrow: 1, paddingBottom: tokens.spacing.xl },
  title: { color: tokens.colors.textPrimary, fontSize: 32, fontWeight: '700', marginBottom: 12 },
  body: { color: tokens.colors.textSecondary, fontSize: 16, lineHeight: 24, marginBottom: tokens.spacing.lg },
});
