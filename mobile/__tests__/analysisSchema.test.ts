import valid from '../../contracts/fixtures/analysis.valid.json';
import invalid from '../../contracts/fixtures/analysis.invalid.json';
import { AnalysisResultSchema } from '../src/domain/analysis';

it('accepts the canonical valid fixture', () => {
  expect(AnalysisResultSchema.safeParse(valid).success).toBe(true);
});

it('rejects the canonical out-of-range fixture', () => {
  expect(AnalysisResultSchema.safeParse(invalid).success).toBe(false);
});
