import valid from '../../contracts/fixtures/analysis.valid.json';
import invalid from '../../contracts/fixtures/analysis.invalid.json';
import { AnalysisResultSchema } from '../src/domain/analysis';

it('accepts the canonical valid fixture', () => {
  expect(AnalysisResultSchema.safeParse(valid).success).toBe(true);
});

it('rejects the canonical out-of-range fixture', () => {
  expect(AnalysisResultSchema.safeParse(invalid).success).toBe(false);
});

it('uses Unicode code points for every bounded analysis and response string', () => {
  const exactMessage = {
    ...valid.messages[0],
    text: '😀'.repeat(1_000),
    possibleInterpretation: '😀'.repeat(300),
  };
  expect(AnalysisResultSchema.safeParse({ ...valid, messages: [exactMessage] }).success).toBe(true);
  expect(AnalysisResultSchema.safeParse({ ...valid, messages: [{ ...exactMessage, text: `${exactMessage.text}😀` }] }).success).toBe(false);
  expect(AnalysisResultSchema.safeParse({ ...valid, messages: [{ ...exactMessage, possibleInterpretation: `${exactMessage.possibleInterpretation}😀` }] }).success).toBe(false);
});

it('rejects labels outside the shared Person A through Person Z contract', () => {
  expect(AnalysisResultSchema.safeParse({
    ...valid,
    messages: [{ ...valid.messages[0], sender: 'Person AA' }],
  }).success).toBe(false);
});
