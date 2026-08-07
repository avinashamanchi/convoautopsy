import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ParsedMessage } from '../domain/analysis';
import { applyRedactions, detectRedactions, type RedactionCandidate } from '../domain/redaction';
import { codePointCount, MAX_INPUT_CODE_POINTS, MAX_MESSAGE_CODE_POINTS } from '../domain/textLimits';
import { tokens } from '../theme/tokens';
import { PrimaryButton } from './PrimaryButton';

export type ReviewableMessage = ParsedMessage & { possibleInterpretation?: string };

type RemoteDataReviewProps = {
  messages: ReviewableMessage[];
  isConfirming: boolean;
  onConfirm(messages: ReviewableMessage[]): void;
  onCancel(): void;
};

type ReviewField = {
  text: string;
  candidates: RedactionCandidate[];
  selectedIds: Set<string>;
};

type ReviewItem = {
  message: ReviewableMessage;
  messageField: ReviewField;
  interpretationField?: ReviewField;
};

export function RemoteDataReview({ messages, isConfirming, onConfirm, onCancel }: RemoteDataReviewProps) {
  const [items, setItems] = useState(() => createReviewItems(messages));
  const confirmedRef = useRef(false);

  useEffect(() => {
    setItems(createReviewItems(messages));
    confirmedRef.current = false;
  }, [messages]);

  const hasInvalidText = items.some(({ messageField, interpretationField }) => (
    !isValidField(messageField, MAX_MESSAGE_CODE_POINTS)
    || (interpretationField !== undefined && !isValidField(interpretationField, 300))
  ));

  function editField(index: number, field: 'messageField' | 'interpretationField', text: string) {
    const nextField = createReviewField(text);
    setItems((current) => current.map((item, itemIndex) => (
      itemIndex === index
        ? { ...item, [field]: nextField }
        : item
    )));
  }

  function toggleCandidate(index: number, field: 'messageField' | 'interpretationField', candidateId: string) {
    setItems((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const currentField = item[field];
      if (!currentField) return item;
      const selectedIds = new Set(currentField.selectedIds);
      if (selectedIds.has(candidateId)) selectedIds.delete(candidateId);
      else selectedIds.add(candidateId);
      return { ...item, [field]: { ...currentField, selectedIds } };
    }));
  }

  function confirm() {
    if (confirmedRef.current || isConfirming || hasInvalidText) return;
    confirmedRef.current = true;
    const confirmed = items.map(({ message, messageField, interpretationField }) => Object.freeze({
      ...message,
      text: reviewedField(messageField),
      ...(interpretationField ? { possibleInterpretation: reviewedField(interpretationField) } : {}),
    }));
    onConfirm(Object.freeze(confirmed) as ReviewableMessage[]);
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
        const outgoingText = reviewedField(item.messageField);
        const outgoingInterpretation = item.interpretationField ? reviewedField(item.interpretationField) : null;
        return (
          <View key={item.message.id} style={styles.message}>
            <Text style={styles.sender}>{item.message.sender}</Text>
            <TextInput
              accessibilityLabel={`Outgoing text for ${context}`}
              editable={!isConfirming}
              multiline
              onChangeText={(text) => editField(index, 'messageField', text)}
              style={styles.input}
              textAlignVertical="top"
              value={item.messageField.text}
            />
            {item.messageField.candidates.map((candidate) => {
              const selected = item.messageField.selectedIds.has(candidate.id);
              return (
                <Pressable
                  accessibilityLabel={`Redact ${candidate.kind} ${candidate.value} in ${context}`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isConfirming, selected }}
                  disabled={isConfirming}
                  key={candidate.id}
                  onPress={() => toggleCandidate(index, 'messageField', candidate.id)}
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
            {!item.messageField.text.trim() ? <Text accessibilityRole="alert" style={styles.error}>Message text cannot be empty.</Text> : null}
            {codePointCount(item.messageField.text) > MAX_MESSAGE_CODE_POINTS ? (
              <Text accessibilityRole="alert" style={styles.error}>Message text must be 1,000 characters or fewer.</Text>
            ) : null}
            {item.interpretationField ? (
              <>
                <TextInput
                  accessibilityLabel={`Outgoing possible interpretation for ${context}`}
                  editable={!isConfirming}
                  multiline
                  onChangeText={(text) => editField(index, 'interpretationField', text)}
                  style={styles.input}
                  textAlignVertical="top"
                  value={item.interpretationField.text}
                />
                {item.interpretationField.candidates.map((candidate) => {
                  const selected = item.interpretationField?.selectedIds.has(candidate.id) ?? false;
                  return (
                    <Pressable
                      accessibilityLabel={`Redact ${candidate.kind} ${candidate.value} in possible interpretation for ${context}`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: isConfirming, selected }}
                      disabled={isConfirming}
                      key={`interpretation-${candidate.id}`}
                      onPress={() => toggleCandidate(index, 'interpretationField', candidate.id)}
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
                <Text accessibilityLabel={`Possible interpretation sent for ${context}: ${outgoingInterpretation}`} style={styles.outgoing}>
                  {outgoingInterpretation}
                </Text>
                {!item.interpretationField.text.trim() ? <Text accessibilityRole="alert" style={styles.error}>Possible interpretation cannot be empty.</Text> : null}
                {codePointCount(item.interpretationField.text) > 300 ? (
                  <Text accessibilityRole="alert" style={styles.error}>Possible interpretation must be 300 characters or fewer.</Text>
                ) : null}
              </>
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

function reviewedField(field: ReviewField): string {
  return codePointCount(field.text) <= MAX_INPUT_CODE_POINTS ? applyRedactions(field.text, field.selectedIds) : field.text;
}

function createReviewField(text: string): ReviewField {
  const candidates = codePointCount(text) <= MAX_INPUT_CODE_POINTS ? detectRedactions(text) : [];
  return { text, candidates, selectedIds: new Set(candidates.map(({ id }) => id)) };
}

function isValidField(field: ReviewField, maximumCodePoints: number): boolean {
  return Boolean(field.text.trim()) && codePointCount(field.text) <= maximumCodePoints;
}

function createReviewItems(messages: ReviewableMessage[]): ReviewItem[] {
  return messages.map((message) => {
    return {
      message: { ...message },
      messageField: createReviewField(message.text),
      ...(message.possibleInterpretation !== undefined
        ? { interpretationField: createReviewField(message.possibleInterpretation) }
        : {}),
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
