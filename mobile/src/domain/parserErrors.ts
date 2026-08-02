const FALLBACK_MESSAGE =
  'Could not review this conversation. Use Name: Message on each line and keep it within the stated limits.';

const PARSER_ERROR_MESSAGES: Record<string, string> = {
  INPUT_TOO_LARGE: 'Conversation is over 100,000 characters. Shorten it and try again.',
  MESSAGE_TOO_LARGE: 'One message is over 1,000 characters. Shorten that line and try again.',
  TOO_MANY_MESSAGES: 'Conversation has more than 100 messages. Remove some lines and try again.',
  TOO_MANY_SPEAKERS: 'Conversation has more than 26 speakers. Use fewer names and try again.',
};

export function parserErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return PARSER_ERROR_MESSAGES[error.message] ?? FALLBACK_MESSAGE;
  }
  return FALLBACK_MESSAGE;
}
