import { z } from 'zod';
import { isCodePointLengthBetween } from './textLimits';

const boundedString = (minimum: number, maximum: number) => z.string().refine(
  (value) => isCodePointLengthBetween(value, minimum, maximum),
  { message: `Must contain between ${minimum} and ${maximum} Unicode characters.` },
);

export const PatternLabelSchema = z.enum([
  'Criticism',
  'Contempt',
  'Defensiveness',
  'Stonewalling',
  'Neutral',
]);

export const EgoStateSchema = z.enum(['Parent', 'Adult', 'Child']);

export const ConflictModeSchema = z.enum([
  'Competing',
  'Avoiding',
  'Compromising',
  'Collaborating',
  'Accommodating',
  'Competing vs Avoiding',
]);

export const AnalysisMessageSchema = z
  .object({
    sender: z.string().regex(/^Person [A-Z]$/),
    text: boundedString(1, 1_000),
    pattern: PatternLabelSchema,
    egoState: EgoStateSchema,
    possibleInterpretation: boundedString(1, 300),
  })
  .strict();

export const AnalysisResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    mode: z.enum(['local', 'ai']),
    intensityScore: z.number().int().min(0).max(100),
    conflictMode: ConflictModeSchema,
    messages: z.array(AnalysisMessageSchema).min(1).max(100),
  })
  .strict();

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type AnalysisMessage = z.infer<typeof AnalysisMessageSchema>;
export type PatternLabel = z.infer<typeof PatternLabelSchema>;
export type EgoState = z.infer<typeof EgoStateSchema>;

export const ResponseDraftSchema = z
  .object({
    id: boundedString(1, 100),
    text: boundedString(1, 1_000),
    hint: boundedString(1, 200),
  })
  .strict();

export type ResponseDraft = z.infer<typeof ResponseDraftSchema>;

export type ParsedMessage = {
  id: string;
  sender: string;
  text: string;
  sourceLine: number;
};

export type RejectedLine = {
  sourceLine: number;
  text: string;
  reason: string;
};

export type ParseResult = {
  messages: ParsedMessage[];
  rejected: RejectedLine[];
};
