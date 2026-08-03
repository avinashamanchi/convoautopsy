import { Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { PrimaryButton } from './PrimaryButton';
import { tokens } from '../theme/tokens';

export type ConversationEditorProps = {
  value: string;
  disabled: boolean;
  error: string | null;
  onChange(value: string): void;
  onReview(): void;
  onImportFile(): void;
  onImportScreenshot(): void;
};

export function ConversationEditor({
  value,
  disabled,
  error,
  onChange,
  onReview,
  onImportFile,
  onImportScreenshot,
}: ConversationEditorProps) {
  const { fontScale } = useWindowDimensions();
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Conversation</Text>
      <Text style={styles.hint}>Use one message per line, for example: Name: Message</Text>
      <TextInput
        accessibilityLabel="Conversation text"
        editable={!disabled}
        multiline
        onChangeText={onChange}
        placeholder="Alex: Can we talk?\nJordan: Yes."
        placeholderTextColor={tokens.colors.textSecondary}
        style={styles.input}
        textAlignVertical="top"
        value={value}
      />
      <Text accessibilityLiveRegion="polite" style={styles.count}>{value.length.toLocaleString()} characters</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <PrimaryButton
        disabled={disabled || !value.trim()}
        label="Review conversation"
        onPress={onReview}
      />
      <View testID="editor-import-actions" style={[styles.imports, fontScale >= 2 && styles.stackedActions]}>
        <Pressable accessibilityLabel="Import conversation file" accessibilityRole="button" disabled={disabled} onPress={onImportFile} style={styles.importButton}>
          <Text style={styles.importText}>Import file</Text>
        </Pressable>
        <Pressable accessibilityLabel="Import conversation screenshot" accessibilityRole="button" disabled={disabled} onPress={onImportScreenshot} style={styles.importButton}>
          <Text style={styles.importText}>Import screenshot</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: tokens.spacing.sm },
  label: { color: tokens.colors.textPrimary, fontSize: 18, fontWeight: '700' },
  hint: { color: tokens.colors.textSecondary, fontSize: 14, lineHeight: 20 },
  input: {
    backgroundColor: tokens.colors.surface,
    borderColor: tokens.colors.textSecondary,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    color: tokens.colors.textPrimary,
    fontSize: 16,
    minHeight: 200,
    padding: tokens.spacing.md,
  },
  count: { color: tokens.colors.textSecondary, fontSize: 13, textAlign: 'right' },
  error: { color: tokens.colors.error, fontSize: 14, lineHeight: 20 },
  imports: { flexDirection: 'row', gap: tokens.spacing.sm, justifyContent: 'center' }, stackedActions: { alignItems: 'stretch', flexDirection: 'column' },
  importButton: { flexShrink: 1, minHeight: tokens.minTouchTarget, justifyContent: 'center', paddingHorizontal: tokens.spacing.sm },
  importText: { color: tokens.colors.textSecondary, fontSize: 14, textDecorationLine: 'underline' },
});
