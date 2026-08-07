import { z } from 'zod';
import {
  ConflictModeSchema,
  EgoStateSchema,
  PatternLabelSchema,
  type AnalysisResult,
} from '../domain/analysis';
import { isCodePointLengthBetween } from '../domain/textLimits';
import {
  REMOTE_ANALYSIS_MAX_MESSAGES,
  REMOTE_ANALYSIS_MAX_TEXT_CODE_POINTS,
  REMOTE_INTERPRETATION_MAX_CODE_POINTS,
} from './remoteLimits';

const codePointString = (maximum: number) => z.string().refine(
  (value) => isCodePointLengthBetween(value, 1, maximum),
  { message: `Must contain between 1 and ${maximum} Unicode characters.` },
);

const RemoteAnalysisMessageSchema = z.object({
  sender: z.string().regex(/^Person [A-Z]$/),
  text: codePointString(REMOTE_ANALYSIS_MAX_TEXT_CODE_POINTS),
  pattern: PatternLabelSchema,
  egoState: EgoStateSchema,
  possibleInterpretation: codePointString(REMOTE_INTERPRETATION_MAX_CODE_POINTS),
}).strict();

const RemoteAnalysisResultSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal('ai'),
  intensityScore: z.number().int().min(0).max(100),
  conflictMode: ConflictModeSchema,
  messages: z.array(RemoteAnalysisMessageSchema).min(1).max(REMOTE_ANALYSIS_MAX_MESSAGES),
}).strict();

type ReviewedMessage = Readonly<{ sender: string; text: string }>;

export function validateRemoteAnalysisResult(
  value: unknown,
  reviewedMessages: readonly ReviewedMessage[],
): AnalysisResult | null {
  const parsed = RemoteAnalysisResultSchema.safeParse(value);
  if (!parsed.success || parsed.data.messages.length !== reviewedMessages.length) return null;
  const matches = parsed.data.messages.every((message, index) => (
    message.sender === reviewedMessages[index]?.sender
    && message.text === reviewedMessages[index]?.text
  ));
  return matches ? parsed.data : null;
}
