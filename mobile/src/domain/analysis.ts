import { z } from 'zod';

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
    sender: z.string().regex(/^Person [A-Z]+$/),
    text: z.string().min(1).max(1000),
    pattern: PatternLabelSchema,
    egoState: EgoStateSchema,
    possibleInterpretation: z.string().min(1).max(300),
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
    id: z.string().min(1),
    text: z.string().min(1).max(1000),
    hint: z.string().min(1).max(200),
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
