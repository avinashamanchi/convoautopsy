import type { ParseResult, ParsedMessage, RejectedLine } from './analysis';

export const MAX_INPUT_CHARS = 100_000;
export const MAX_MESSAGES = 100;
export const MAX_MESSAGE_CHARS = 1_000;

const MESSAGE_LINE = /^([^:\-\n]{1,40})[:\-]\s*(.+)$/;
const INVALID_LINE_REASON = 'Use Name: Message format.';

export function parseConversation(raw: string): ParseResult {
  if (raw.length > MAX_INPUT_CHARS) {
    throw new Error('INPUT_TOO_LARGE');
  }

  const senderMap = new Map<string, string>();
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
    if (text.length > MAX_MESSAGE_CHARS) {
      throw new Error('MESSAGE_TOO_LARGE');
    }
    if (messages.length >= MAX_MESSAGES) {
      throw new Error('TOO_MANY_MESSAGES');
    }

    let sender = senderMap.get(originalSender);
    if (!sender) {
      if (senderMap.size >= 26) {
        throw new Error('TOO_MANY_SPEAKERS');
      }
      sender = `Person ${String.fromCharCode(65 + senderMap.size)}`;
      senderMap.set(originalSender, sender);
    }

    messages.push({
      id: `line-${sourceLine}`,
      sender,
      text,
      sourceLine,
    });
  });

  return { messages, rejected };
}
