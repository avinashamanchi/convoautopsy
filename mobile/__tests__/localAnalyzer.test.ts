import { analyzeLocally } from '../src/domain/localAnalyzer';
import { parseConversation } from '../src/domain/parser';

it('returns a labeled local estimate without claiming hidden intent', () => {
  const messages = parseConversation(
    "Alex: Why do you always do this?\nJordan: Whatever. I'm done.",
  ).messages;
  const result = analyzeLocally(messages);
  expect(result.schemaVersion).toBe(1);
  expect(result.mode).toBe('local');
  expect(result.intensityScore).toBeGreaterThan(0);
  expect(result.messages[0].pattern).toBe('Criticism');
  expect(result.messages[0].possibleInterpretation).toBe(
    'This wording may reflect feeling unheard and expressing it through blame.',
  );
});

it('is deterministic for identical parsed input', () => {
  const messages = parseConversation('A: Can we talk?\nB: I understand.').messages;
  expect(analyzeLocally(messages)).toEqual(analyzeLocally(messages));
});
