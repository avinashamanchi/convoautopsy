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
