import { z } from 'zod';

export const CONSENT_VERSION = '2026-08-07.2' as const;
export const REMOTE_ANALYSIS_MAX_MESSAGES = 10;
export const REMOTE_ANALYSIS_MAX_TEXT_CODE_POINTS = 280;
export const REMOTE_ANALYSIS_MAX_INTERPRETATION_CODE_POINTS = 150;
export const REMOTE_ANALYSIS_MAX_RESPONSE_BYTES = 40 * 1_024;

function codePointString(min: number, max: number) {
  return z.string().superRefine((value, context) => {
    const length = Array.from(value).length;
    if (length < min || length > max) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `String must contain between ${min} and ${max} characters`,
      });
    }
  });
}

export const InstallationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{16,256}$/);
export const RevenueCatAppUserIdSchema = codePointString(1, 100);
export const AnonymousSenderSchema = z.string().regex(/^Person [A-Z]$/);

export const InputMessageSchema = z
  .object({
    sender: AnonymousSenderSchema,
    text: codePointString(1, 1_000),
  })
  .strict();

export const RemoteInputMessageSchema = z
  .object({
    sender: AnonymousSenderSchema,
    text: codePointString(1, REMOTE_ANALYSIS_MAX_TEXT_CODE_POINTS),
  })
  .strict();

export const AnalysisMessageSchema = z
  .object({
    sender: AnonymousSenderSchema,
    text: codePointString(1, 1_000),
    pattern: z.enum(['Criticism', 'Contempt', 'Defensiveness', 'Stonewalling', 'Neutral']),
    egoState: z.enum(['Parent', 'Adult', 'Child']),
    possibleInterpretation: codePointString(1, 300),
  })
  .strict();

export const RemoteAnalysisMessageSchema = z
  .object({
    sender: AnonymousSenderSchema,
    text: codePointString(1, REMOTE_ANALYSIS_MAX_TEXT_CODE_POINTS),
    pattern: z.enum(['Criticism', 'Contempt', 'Defensiveness', 'Stonewalling', 'Neutral']),
    egoState: z.enum(['Parent', 'Adult', 'Child']),
    possibleInterpretation: codePointString(1, REMOTE_ANALYSIS_MAX_INTERPRETATION_CODE_POINTS),
  })
  .strict();

export const AnalysisResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    mode: z.enum(['local', 'ai']),
    intensityScore: z.number().int().min(0).max(100),
    conflictMode: z.enum([
      'Competing',
      'Avoiding',
      'Compromising',
      'Collaborating',
      'Accommodating',
      'Competing vs Avoiding',
    ]),
    messages: z.array(AnalysisMessageSchema).min(1).max(100),
  })
  .strict();

export const RemoteAnalysisResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    mode: z.literal('ai'),
    intensityScore: z.number().int().min(0).max(100),
    conflictMode: z.enum([
      'Competing',
      'Avoiding',
      'Compromising',
      'Collaborating',
      'Accommodating',
      'Competing vs Avoiding',
    ]),
    messages: z.array(RemoteAnalysisMessageSchema).min(1).max(REMOTE_ANALYSIS_MAX_MESSAGES),
  })
  .strict();

export const RemoteCraftAnalysisResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    mode: z.enum(['local', 'ai']),
    intensityScore: z.number().int().min(0).max(100),
    conflictMode: z.enum([
      'Competing',
      'Avoiding',
      'Compromising',
      'Collaborating',
      'Accommodating',
      'Competing vs Avoiding',
    ]),
    messages: z.array(RemoteAnalysisMessageSchema).min(1).max(REMOTE_ANALYSIS_MAX_MESSAGES),
  })
  .strict();

export const AnalyzeRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    consentVersion: z.literal(CONSENT_VERSION),
    installationToken: InstallationTokenSchema,
    revenueCatAppUserId: RevenueCatAppUserIdSchema.optional(),
    messages: z.array(RemoteInputMessageSchema).min(1).max(REMOTE_ANALYSIS_MAX_MESSAGES),
  })
  .strict();

export const CraftResponseRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    consentVersion: z.literal(CONSENT_VERSION),
    installationToken: InstallationTokenSchema,
    revenueCatAppUserId: RevenueCatAppUserIdSchema.optional(),
    sender: AnonymousSenderSchema,
    goal: z.enum(['resolve', 'boundary', 'feelings', 'understand', 'apologize', 'request']),
    tone: z.enum(['empathetic', 'assertive', 'deescalating', 'direct', 'diplomatic']),
    analysis: RemoteCraftAnalysisResultSchema,
  })
  .strict();

export const ResponseDraftSchema = z
  .object({
    id: codePointString(1, 100),
    text: codePointString(1, 1_000),
    hint: codePointString(1, 200),
  })
  .strict();

export function normalizeAnalysisProviderOutput(value: unknown): RemoteAnalysisResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid analysis provider output');
  }

  const raw = value as Record<string, unknown>;
  const messages = Array.isArray(raw.messages)
    ? raw.messages.map((message) => {
      if (typeof message !== 'object' || message === null || Array.isArray(message)) return message;
      const item = message as Record<string, unknown>;
      if ('hidden_meaning' in item && !('possibleInterpretation' in item)) {
        const { hidden_meaning: hiddenMeaning, ...rest } = item;
        return { ...rest, possibleInterpretation: hiddenMeaning };
      }
      return item;
    })
    : raw.messages;

  return RemoteAnalysisResultSchema.parse({ ...raw, schemaVersion: 1, mode: 'ai', messages });
}

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type RemoteAnalysisResult = z.infer<typeof RemoteAnalysisResultSchema>;
export type CraftResponseRequest = z.infer<typeof CraftResponseRequestSchema>;
export type ResponseDraft = z.infer<typeof ResponseDraftSchema>;
