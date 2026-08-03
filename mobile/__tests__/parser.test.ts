import { parseConversation } from '../src/domain/parser';

it('anonymizes every speaker and reports rejected lines', () => {
  const parsed = parseConversation('Alex: Hello\ninvalid line\nJordan - Hi\nSam: Welcome');
  expect(parsed.messages).toEqual([
    { id: 'line-1', sender: 'Person A', text: 'Hello', sourceLine: 1 },
    { id: 'line-3', sender: 'Person B', text: 'Hi', sourceLine: 3 },
    { id: 'line-4', sender: 'Person C', text: 'Welcome', sourceLine: 4 },
  ]);
  expect(parsed.rejected).toEqual([
    { sourceLine: 2, text: 'invalid line', reason: 'Use Name: Message format.' },
  ]);
});

it('rejects input beyond the explicit limits', () => {
  expect(() => parseConversation('x'.repeat(100_001))).toThrow('INPUT_TOO_LARGE');
  expect(() => parseConversation('Name: ' + 'x'.repeat(1_001))).toThrow('MESSAGE_TOO_LARGE');
});

it('counts Unicode code points, not UTF-16 code units, at the input and message limits', () => {
  expect(() => parseConversation('😀'.repeat(100_000))).not.toThrow();
  expect(() => parseConversation('😀'.repeat(100_001))).toThrow('INPUT_TOO_LARGE');
  expect(() => parseConversation(`Name: ${'😀'.repeat(1_000)}`)).not.toThrow();
  expect(() => parseConversation(`Name: ${'😀'.repeat(1_001)}`)).toThrow('MESSAGE_TOO_LARGE');
});

it('accepts exactly 100 messages and 26 speakers, then rejects the next accepted line', () => {
  const hundredMessages = Array.from({ length: 100 }, (_, index) => `Alex: message ${index}`).join('\n');
  expect(parseConversation(hundredMessages).messages).toHaveLength(100);
  expect(() => parseConversation(`${hundredMessages}\nAlex: one too many`)).toThrow('TOO_MANY_MESSAGES');

  const twentySixSpeakers = Array.from({ length: 26 }, (_, index) => `Speaker${index}: hello`).join('\n');
  expect(parseConversation(twentySixSpeakers).messages).toHaveLength(26);
  expect(() => parseConversation(`${twentySixSpeakers}\nSpeaker26: one too many`)).toThrow('TOO_MANY_SPEAKERS');
});

it('replaces every known participant mention only after all speakers are discovered', () => {
  const parsed = parseConversation(
    "Alex: Jordan, please call me. Alexandra is not Alex.\nJORDAN: Hi alex\nAlexandra: Alex and Jordan, hello\nA.B: Alex? A.B is here",
  );

  expect(parsed.messages).toEqual([
    { id: 'line-1', sender: 'Person A', text: 'Person B, please call me. Person C is not Person A.', sourceLine: 1 },
    { id: 'line-2', sender: 'Person B', text: 'Hi Person A', sourceLine: 2 },
    { id: 'line-3', sender: 'Person C', text: 'Person A and Person B, hello', sourceLine: 3 },
    { id: 'line-4', sender: 'Person D', text: 'Person A? Person D is here', sourceLine: 4 },
  ]);
  expect(parsed.messages.map((message) => message.text).join('\n')).not.toMatch(/Alex|Jordan|A\.B/i);
});
