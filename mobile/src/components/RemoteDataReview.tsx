import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ParsedMessage } from '../domain/analysis';
import { applyRedactions, detectRedactions, type RedactionCandidate } from '../domain/redaction';
import { codePointCount, MAX_INPUT_CODE_POINTS } from '../domain/textLimits';
import {
  REMOTE_ANALYSIS_MAX_MESSAGES,
  REMOTE_ANALYSIS_MAX_TEXT_CODE_POINTS,
  REMOTE_INTERPRETATION_MAX_CODE_POINTS,
} from '../services/remoteLimits';
import { tokens } from '../theme/tokens';
import { PrimaryButton } from './PrimaryButton';

export type ReviewableMessage = ParsedMessage & {
  pattern?: string;
  egoState?: string;
  possibleInterpretation?: string;
};

export type ResponseReviewContext = Readonly<{
  sender: string;
  goal: string;
  tone: string;
  intensityScore: number;
  conflictMode: string;
}>;

type RemoteDataReviewProps = {
  messages: ReviewableMessage[];
  responseContext?: ResponseReviewContext;
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

export function RemoteDataReview({ messages, responseContext, isConfirming, onConfirm, onCancel }: RemoteDataReviewProps) {
  const [items, setItems] = useState(() => createReviewItems(messages));
  const confirmedRef = useRef(false);

  useEffect(() => {
    setItems(createReviewItems(messages));
    confirmedRef.current = false;
  }, [messages]);

  const hasInvalidText = items.length === 0
    || items.length > REMOTE_ANALYSIS_MAX_MESSAGES
    || items.some(({ messageField, interpretationField }) => (
    !isValidField(messageField, REMOTE_ANALYSIS_MAX_TEXT_CODE_POINTS)
    || (interpretationField !== undefined && !isValidField(interpretationField, REMOTE_INTERPRETATION_MAX_CODE_POINTS))
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
      {responseContext ? (
        <View style={styles.readOnlyGroup}>
          <Text accessibilityLabel={`Response sender sent, read-only: ${responseContext.sender}`} style={styles.readOnly}>Response sender (sent, read-only): {responseContext.sender}</Text>
          <Text accessibilityLabel={`Response goal sent, read-only: ${responseContext.goal}`} style={styles.readOnly}>Goal (sent, read-only): {responseContext.goal}</Text>
          <Text accessibilityLabel={`Response tone sent, read-only: ${responseContext.tone}`} style={styles.readOnly}>Tone (sent, read-only): {responseContext.tone}</Text>
          <Text accessibilityLabel={`Analysis intensity sent, read-only: ${responseContext.intensityScore}`} style={styles.readOnly}>Analysis intensity (sent, read-only): {responseContext.intensityScore}</Text>
          <Text accessibilityLabel={`Analysis conflict sent, read-only: ${responseContext.conflictMode}`} style={styles.readOnly}>Analysis conflict (sent, read-only): {responseContext.conflictMode}</Text>
        </View>
      ) : null}
      {items.length > REMOTE_ANALYSIS_MAX_MESSAGES ? (
        <Text accessibilityRole="alert" style={styles.error}>Remote AI can review up to 10 messages at a time. On-device analysis remains available.</Text>
      ) : null}
      {items.map((item, index) => {
        const messageNumber = index + 1;
        const context = `${item.message.sender} message ${messageNumber}`;
        const outgoingText = reviewedField(item.messageField);
        const outgoingInterpretation = item.interpretationField ? reviewedField(item.interpretationField) : null;
        return (
          <View key={item.message.id} style={styles.message}>
            <Text accessibilityLabel={`Message ${messageNumber} sender sent, read-only: ${item.message.sender}`} style={styles.sender}>
              Sender (sent, read-only): {item.message.sender}
            </Text>
            {item.message.pattern !== undefined ? (
              <Text accessibilityLabel={`Message ${messageNumber} pattern sent, read-only: ${item.message.pattern}`} style={styles.readOnly}>
                Pattern (sent, read-only): {item.message.pattern}
              </Text>
            ) : null}
            {item.message.egoState !== undefined ? (
              <Text accessibilityLabel={`Message ${messageNumber} ego state sent, read-only: ${item.message.egoState}`} style={styles.readOnly}>
                Ego state (sent, read-only): {item.message.egoState}
              </Text>
            ) : null}
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
            {!outgoingText.trim() ? <Text accessibilityRole="alert" style={styles.error}>Message text cannot be empty.</Text> : null}
            {codePointCount(outgoingText) > REMOTE_ANALYSIS_MAX_TEXT_CODE_POINTS ? (
              <Text accessibilityRole="alert" style={styles.error}>Message text must be 280 characters or fewer for remote AI.</Text>
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
                {!outgoingInterpretation?.trim() ? <Text accessibilityRole="alert" style={styles.error}>Possible interpretation cannot be empty.</Text> : null}
                {codePointCount(outgoingInterpretation ?? '') > REMOTE_INTERPRETATION_MAX_CODE_POINTS ? (
                  <Text accessibilityRole="alert" style={styles.error}>Possible interpretation must be 150 characters or fewer for remote AI.</Text>
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
  const outgoing = reviewedField(field);
  return Boolean(outgoing.trim()) && codePointCount(outgoing) <= maximumCodePoints;
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
  readOnly: { color: tokens.colors.textSecondary, fontSize: 14, lineHeight: 20 },
  readOnlyGroup: { backgroundColor: tokens.colors.background, borderRadius: tokens.radius.sm, gap: tokens.spacing.xs, padding: tokens.spacing.sm },
  sender: { color: tokens.colors.textPrimary, fontSize: 16, fontWeight: '700' },
  title: { color: tokens.colors.textPrimary, fontSize: 20, fontWeight: '700' },
  warning: { color: tokens.colors.warning, fontSize: 15, lineHeight: 22 },
});
