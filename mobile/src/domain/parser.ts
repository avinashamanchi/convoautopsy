import type { ParseResult, ParsedMessage, RejectedLine } from './analysis';
import { codePointCount, MAX_INPUT_CODE_POINTS, MAX_MESSAGE_CODE_POINTS } from './textLimits';

export const MAX_INPUT_CHARS = MAX_INPUT_CODE_POINTS;
export const MAX_MESSAGES = 100;
export const MAX_MESSAGE_CHARS = MAX_MESSAGE_CODE_POINTS;

const MESSAGE_LINE = /^([^:\-\n]+)[:\-]\s*(.+)$/;
const INVALID_LINE_REASON = 'Use Name: Message format.';

type Speaker = { original: string; label: string };

export function parseConversation(raw: string): ParseResult {
  if (codePointCount(raw) > MAX_INPUT_CHARS) {
    throw new Error('INPUT_TOO_LARGE');
  }

  const senderMap = new Map<string, Speaker>();
  const messages: ParsedMessage[] = [];
  const rejected: RejectedLine[] = [];

  raw.split(/\r?\n/).forEach((line, index) => {
    const sourceLine = index + 1;
    if (!line.trim()) {
      return;
    }

    const match = line.match(MESSAGE_LINE);
    if (!match) {
      rejected.push({ sourceLine, text: line, reason: INVALID_LINE_REASON });
      return;
    }

    const originalSender = match[1].trim().normalize('NFC');
    const text = match[2].trim().normalize('NFC');
    if (!originalSender || codePointCount(originalSender) > 40 || !text) {
      rejected.push({ sourceLine, text: line, reason: INVALID_LINE_REASON });
      return;
    }
    if (codePointCount(text) > MAX_MESSAGE_CHARS) {
      throw new Error('MESSAGE_TOO_LARGE');
    }
    if (messages.length >= MAX_MESSAGES) {
      throw new Error('TOO_MANY_MESSAGES');
    }

    const senderKey = participantKey(originalSender);
    let speaker = senderMap.get(senderKey);
    if (!speaker) {
      if (senderMap.size >= 26) {
        throw new Error('TOO_MANY_SPEAKERS');
      }
      speaker = { original: originalSender, label: `Person ${String.fromCharCode(65 + senderMap.size)}` };
      senderMap.set(senderKey, speaker);
    }

    messages.push({
      id: `line-${sourceLine}`,
      sender: speaker.label,
      text,
      sourceLine,
    });
  });

  return {
    messages: anonymizeParticipantMentions(messages, Array.from(senderMap.values())),
    rejected,
  };
}

function anonymizeParticipantMentions(messages: ParsedMessage[], speakers: Speaker[]): ParsedMessage[] {
  if (speakers.length === 0) return messages;
  const byName = new Map(speakers.map((speaker) => [participantKey(speaker.original), speaker.label]));
  const alternatives = speakers
    .map((speaker) => speaker.original.normalize('NFC'))
    .sort((left, right) => codePointCount(right) - codePointCount(left))
    .map(escapeRegExp)
    .join('|');
  const mentions = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_])(?:${alternatives})(?![\\p{L}\\p{M}\\p{N}_])`, 'giu');

  return messages.map((message) => ({
    ...message,
    text: message.text.normalize('NFC').replace(mentions, (match) => byName.get(participantKey(match)) ?? match),
  }));
}

function participantKey(value: string): string {
  return value.normalize('NFC').toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
