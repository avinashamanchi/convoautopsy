import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ResponseDraft } from '../domain/analysis';
import type { DraftShareOutcome } from '../services/exportReport';
import { tokens } from '../theme/tokens';
import { PrimaryButton } from './PrimaryButton';

type ResponseDraftCardProps = {
  draft: ResponseDraft;
  onCopy(text: string): Promise<boolean | void>;
  onShare(text: string): Promise<DraftShareOutcome>;
};

export function ResponseDraftCard({ draft, onCopy, onShare }: ResponseDraftCardProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<'copy' | 'share' | null>(null);

  const runAction = async (action: 'copy' | 'share') => {
    setBusy(action);
    setMessage(null);
    try {
      if (action === 'copy') await onCopy(draft.text);
      else {
        const outcome = await onShare(draft.text);
        if (!outcome.ok) throw new Error(outcome.code);
      }
      setMessage(action === 'copy' ? 'Copied to clipboard. Review before sending.' : 'Share sheet opened. Review before sending.');
    } catch {
      setMessage(action === 'copy' ? 'Could not copy this draft. Please try again.' : 'Could not share this draft. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.reviewLabel}>Draft—review before sending</Text>
      <Text selectable style={styles.text}>{draft.text}</Text>
      <Text style={styles.hint}>{draft.hint}</Text>
      {message ? <Text accessibilityRole={message.startsWith('Could not') ? 'alert' : undefined} style={styles.message}>{message}</Text> : null}
      <View style={styles.actions}>
        <PrimaryButton label="Copy draft" disabled={busy !== null} onPress={() => { void runAction('copy'); }} />
        <PrimaryButton label="Share draft" disabled={busy !== null} onPress={() => { void runAction('share'); }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: tokens.colors.surface, borderColor: tokens.colors.textSecondary, borderRadius: tokens.radius.md, borderWidth: 1, gap: tokens.spacing.sm, padding: tokens.spacing.md },
  reviewLabel: { color: tokens.colors.accent, fontSize: 14, fontWeight: '700' },
  text: { color: tokens.colors.textPrimary, fontSize: 16, lineHeight: 24 },
  hint: { color: tokens.colors.textSecondary, fontSize: 14, lineHeight: 20 },
  message: { color: tokens.colors.textSecondary, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: tokens.spacing.sm },
});
