import type { ParseResult, ParsedMessage, RejectedLine } from './analysis';

export const MAX_INPUT_CHARS = 100_000;
export const MAX_MESSAGES = 100;
export const MAX_MESSAGE_CHARS = 1_000;

const MESSAGE_LINE = /^([^:\-\n]{1,40})[:\-]\s*(.+)$/;
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

    const originalSender = match[1].trim();
    const text = match[2].trim();
    if (!originalSender || !text) {
      rejected.push({ sourceLine, text: line, reason: INVALID_LINE_REASON });
      return;
    }
    if (codePointCount(text) > MAX_MESSAGE_CHARS) {
      throw new Error('MESSAGE_TOO_LARGE');
    }
    if (messages.length >= MAX_MESSAGES) {
      throw new Error('TOO_MANY_MESSAGES');
    }

    const senderKey = originalSender.toLowerCase();
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

/** JavaScript string length counts UTF-16 code units; product limits are characters. */
function codePointCount(value: string): number {
  return Array.from(value).length;
}

function anonymizeParticipantMentions(messages: ParsedMessage[], speakers: Speaker[]): ParsedMessage[] {
  if (speakers.length === 0) return messages;
  const byName = new Map(speakers.map((speaker) => [speaker.original.toLowerCase(), speaker.label]));
  const alternatives = speakers
    .map((speaker) => speaker.original)
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join('|');
  const mentions = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_])(?:${alternatives})(?![\\p{L}\\p{M}\\p{N}_])`, 'giu');

  return messages.map((message) => ({
    ...message,
    text: message.text.replace(mentions, (match) => byName.get(match.toLowerCase()) ?? match),
  }));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
