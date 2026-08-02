import { parserErrorMessage } from '../src/domain/parserErrors';

it.each([
  ['INPUT_TOO_LARGE', 'Conversation is over 100,000 characters. Shorten it and try again.'],
  ['MESSAGE_TOO_LARGE', 'One message is over 1,000 characters. Shorten that line and try again.'],
  ['TOO_MANY_MESSAGES', 'Conversation has more than 100 messages. Remove some lines and try again.'],
  ['TOO_MANY_SPEAKERS', 'Conversation has more than 26 speakers. Use fewer names and try again.'],
] as const)('maps %s to an actionable correction', (code, message) => {
  expect(parserErrorMessage(new Error(code))).toBe(message);
});

it('maps an unexpected parser failure to a safe editor recovery message', () => {
  expect(parserErrorMessage(new TypeError('bad input'))).toBe(
    'Could not review this conversation. Use Name: Message on each line and keep it within the stated limits.',
  );
});
