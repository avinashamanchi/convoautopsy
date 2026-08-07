import { z } from 'zod';
import { ConflictModeSchema, PatternLabelSchema } from './analysis';
import type { TrendSummary } from '../services/reportRepository';

const CountSchema = z.coerce.number().int().nonnegative();

const AggregateRowSchema = z.object({
  report_count: CountSchema,
  average_intensity: z.union([z.null(), z.coerce.number().int().min(0).max(100)]),
}).strict();

const conflictCountRowSchema = z.object({
  label: ConflictModeSchema,
  count: CountSchema,
}).strict();

const patternCountRowSchema = z.object({
  label: PatternLabelSchema,
  count: CountSchema,
}).strict();

export type TrendAggregateRow = z.input<typeof AggregateRowSchema>;
export type TrendCountRow = Readonly<{ label: unknown; count: unknown }>;

export function assertTrendWindow(fromInclusive: string, toExclusive: string): void {
  const from = Date.parse(fromInclusive);
  const to = Date.parse(toExclusive);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new Error('INVALID_TREND_WINDOW');
}

export function parseTrendSummary(
  aggregateInput: TrendAggregateRow,
  conflictInputs: readonly TrendCountRow[],
  patternInputs: readonly TrendCountRow[],
): TrendSummary {
  try {
    const aggregate = AggregateRowSchema.parse(aggregateInput);
    const conflictModes = Object.fromEntries(conflictInputs.map((input) => {
      const row = conflictCountRowSchema.parse(input);
      return [row.label, row.count];
    }));
    const patterns = Object.fromEntries(patternInputs.map((input) => {
      const row = patternCountRowSchema.parse(input);
      return [row.label, row.count];
    }));
    return {
      reportCount: aggregate.report_count,
      averageIntensity: aggregate.report_count === 0 ? null : aggregate.average_intensity,
      conflictModes,
      patterns,
    };
  } catch {
    throw new Error('CORRUPT_REPORT');
  }
}
