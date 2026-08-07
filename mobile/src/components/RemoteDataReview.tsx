import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ParsedMessage } from '../domain/analysis';
import { applyRedactions, detectRedactions, type RedactionCandidate } from '../domain/redaction';
import { codePointCount, MAX_INPUT_CODE_POINTS, MAX_MESSAGE_CODE_POINTS } from '../domain/textLimits';
import { tokens } from '../theme/tokens';
import { PrimaryButton } from './PrimaryButton';

type RemoteDataReviewProps = {
  messages: ParsedMessage[];
  isConfirming: boolean;
  onConfirm(messages: ParsedMessage[]): void;
  onCancel(): void;
};

type ReviewItem = {
  message: ParsedMessage;
  text: string;
  candidates: RedactionCandidate[];
  selectedIds: Set<string>;
};

export function RemoteDataReview({ messages, isConfirming, onConfirm, onCancel }: RemoteDataReviewProps) {
  const [items, setItems] = useState(() => createReviewItems(messages));

  useEffect(() => {
    setItems(createReviewItems(messages));
  }, [messages]);

  const hasInvalidText = items.some(({ text }) => !text.trim() || codePointCount(text) > MAX_MESSAGE_CODE_POINTS);

  function editMessage(index: number, text: string) {
    const candidates = codePointCount(text) <= MAX_INPUT_CODE_POINTS ? detectRedactions(text) : [];
    setItems((current) => current.map((item, itemIndex) => (
      itemIndex === index
        ? { ...item, text, candidates, selectedIds: new Set(candidates.map(({ id }) => id)) }
        : item
    )));
  }

  function toggleCandidate(index: number, candidateId: string) {
    setItems((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const selectedIds = new Set(item.selectedIds);
      if (selectedIds.has(candidateId)) selectedIds.delete(candidateId);
      else selectedIds.add(candidateId);
      return { ...item, selectedIds };
    }));
  }

  function confirm() {
    if (isConfirming || hasInvalidText) return;
    onConfirm(items.map(({ message, text, selectedIds }) => ({
      ...message,
      text: applyRedactions(text, selectedIds),
    })));
  }

  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>Review exact text sent for AI</Text>
      <Text accessibilityRole="alert" style={styles.warning}>
        Automatic detection can miss identifying details. Review the exact text below.
      </Text>
      {items.map((item, index) => {
        const messageNumber = index + 1;
        const context = `${item.message.sender} message ${messageNumber}`;
        const outgoingText = reviewedText(item.text, item.selectedIds);
        return (
          <View key={item.message.id} style={styles.message}>
            <Text style={styles.sender}>{item.message.sender}</Text>
            <TextInput
              accessibilityLabel={`Outgoing text for ${context}`}
              editable={!isConfirming}
              multiline
              onChangeText={(text) => editMessage(index, text)}
              style={styles.input}
              textAlignVertical="top"
              value={item.text}
            />
            {item.candidates.map((candidate) => {
              const selected = item.selectedIds.has(candidate.id);
              return (
                <Pressable
                  accessibilityLabel={`Redact ${candidate.kind} ${candidate.value} in ${context}`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isConfirming, selected }}
                  disabled={isConfirming}
                  key={candidate.id}
                  onPress={() => toggleCandidate(index, candidate.id)}
                  style={({ pressed }) => [
                    styles.candidate,
                    selected && styles.selectedCandidate,
                    pressed && !isConfirming && styles.pressed,
                  ]}
                >
                  <Text style={styles.candidateText}>{selected ? '✓ ' : ''}{candidate.kind}: {candidate.value}</Text>
                </Pressable>
              );
            })}
            <Text accessibilityLabel={`Text sent for ${context}: ${outgoingText}`} style={styles.outgoing}>
              {outgoingText}
            </Text>
            {!item.text.trim() ? <Text accessibilityRole="alert" style={styles.error}>Message text cannot be empty.</Text> : null}
            {codePointCount(item.text) > MAX_MESSAGE_CODE_POINTS ? (
              <Text accessibilityRole="alert" style={styles.error}>Message text must be 1,000 characters or fewer.</Text>
            ) : null}
          </View>
        );
      })}
      <PrimaryButton
        disabled={isConfirming || hasInvalidText}
        label={isConfirming ? 'Confirming reviewed text…' : 'Confirm exact text'}
        onPress={confirm}
      />
      <PrimaryButton label="Cancel remote analysis" onPress={onCancel} />
    </View>
  );
}

function reviewedText(text: string, selectedIds: Set<string>): string {
  return codePointCount(text) <= MAX_INPUT_CODE_POINTS ? applyRedactions(text, selectedIds) : text;
}

function createReviewItems(messages: ParsedMessage[]): ReviewItem[] {
  return messages.map((message) => {
    const candidates = detectRedactions(message.text);
    return {
      message: { ...message },
      text: message.text,
      candidates,
      selectedIds: new Set(candidates.map(({ id }) => id)),
    };
  });
}

const styles = StyleSheet.create({
  candidate: {
    borderColor: tokens.colors.textSecondary,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: tokens.minTouchTarget,
    paddingHorizontal: tokens.spacing.sm,
  },
  candidateText: { color: tokens.colors.textPrimary, fontSize: 14 },
  container: { backgroundColor: tokens.colors.surface, borderRadius: tokens.radius.md, gap: tokens.spacing.md, padding: tokens.spacing.md },
  error: { color: tokens.colors.error, fontSize: 14 },
  input: {
    borderColor: tokens.colors.textSecondary,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    color: tokens.colors.textPrimary,
    fontSize: 16,
    minHeight: 88,
    padding: tokens.spacing.sm,
  },
  message: { gap: tokens.spacing.sm },
  outgoing: { color: tokens.colors.textSecondary, fontSize: 14, lineHeight: 20 },
  pressed: { opacity: 0.8 },
  selectedCandidate: { borderColor: tokens.colors.accent, borderWidth: 2 },
  sender: { color: tokens.colors.textPrimary, fontSize: 16, fontWeight: '700' },
  title: { color: tokens.colors.textPrimary, fontSize: 20, fontWeight: '700' },
  warning: { color: tokens.colors.warning, fontSize: 15, lineHeight: 22 },
});
