import { describe, expect, it } from 'vitest';

import fixture from '../../../contracts/fixtures/analysis.valid.json';
import {
  AnalysisResultSchema,
  AnalyzeRequestSchema,
  CraftResponseRequestSchema,
  normalizeAnalysisProviderOutput,
} from '../src/contract';

describe('request contract', () => {
  it('accepts the canonical v1 analysis fixture', () => {
    expect(AnalysisResultSchema.parse(fixture)).toEqual(fixture);
  });

  it('accepts a bounded, consented analysis request', () => {
    const result = AnalyzeRequestSchema.safeParse({
      schemaVersion: 1,
      consentVersion: '2026-08-07.2',
      installationToken: 'installation-token-which-is-long-enough',
      messages: [{ sender: 'Person A', text: 'Please listen to me.' }],
    });

    expect(result.success).toBe(true);
  });

  it('requires the redaction-review consent version on both Worker request schemas', () => {
    const analysisRequest = {
      schemaVersion: 1,
      consentVersion: '2026-08-02',
      installationToken: 'installation-token-which-is-long-enough',
      messages: [{ sender: 'Person A', text: 'Please listen.' }],
    };
    const responseRequest = {
      ...analysisRequest,
      sender: 'Person A',
      goal: 'resolve',
      tone: 'empathetic',
      analysis: fixture,
    };

    expect(AnalyzeRequestSchema.safeParse(analysisRequest).success).toBe(false);
    expect(CraftResponseRequestSchema.safeParse(responseRequest).success).toBe(false);
  });

  it('rejects extra fields and invalid installation tokens', () => {
    const result = AnalyzeRequestSchema.safeParse({
      schemaVersion: 1,
      consentVersion: '2026-08-07.2',
      installationToken: 'short',
      messages: [{ sender: 'Person A', text: 'Please listen to me.', injected: true }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects more than 10 remote-analysis messages and individual messages longer than 280 characters', () => {
    const manyMessages = Array.from({ length: 11 }, () => ({ sender: 'Person A', text: 'ok' }));

    expect(AnalyzeRequestSchema.safeParse({
      schemaVersion: 1,
      consentVersion: '2026-08-07.2',
      installationToken: 'installation-token-which-is-long-enough',
      messages: manyMessages,
    }).success).toBe(false);
    expect(AnalyzeRequestSchema.safeParse({
      schemaVersion: 1,
      consentVersion: '2026-08-07.2',
      installationToken: 'installation-token-which-is-long-enough',
      messages: [{ sender: 'Person A', text: 'x'.repeat(281) }],
    }).success).toBe(false);
  });

  it('applies the same remote message and interpretation bounds to response drafting', () => {
    const message = {
      sender: 'Person A',
      text: 'x'.repeat(280),
      pattern: 'Neutral',
      egoState: 'Adult',
      possibleInterpretation: 'y'.repeat(150),
    };
    const request = (messages: unknown[]) => ({
      schemaVersion: 1,
      consentVersion: '2026-08-07.2',
      installationToken: 'installation-token-which-is-long-enough',
      sender: 'Person A',
      goal: 'resolve',
      tone: 'empathetic',
      analysis: { schemaVersion: 1, mode: 'local', intensityScore: 42, conflictMode: 'Collaborating', messages },
    });

    expect(CraftResponseRequestSchema.safeParse(request(Array.from({ length: 10 }, () => message))).success).toBe(true);
    expect(CraftResponseRequestSchema.safeParse(request(Array.from({ length: 11 }, () => message))).success).toBe(false);
    expect(CraftResponseRequestSchema.safeParse(request([{ ...message, text: '🫠'.repeat(281) }])).success).toBe(false);
    expect(CraftResponseRequestSchema.safeParse(request([{ ...message, possibleInterpretation: 'y'.repeat(151) }])).success).toBe(false);
  });

  it('counts Unicode code points instead of UTF-16 code units at the 280-character remote boundary', () => {
    const request = (text: string) => ({
      schemaVersion: 1,
      consentVersion: '2026-08-07.2',
      installationToken: 'installation-token-which-is-long-enough',
      messages: [{ sender: 'Person A', text }],
    });

    expect(AnalyzeRequestSchema.safeParse(request('🫠'.repeat(280))).success).toBe(true);
    expect(AnalyzeRequestSchema.safeParse(request('🫠'.repeat(281))).success).toBe(false);
  });

  it('accepts an optional RevenueCat identifier of at most 100 Unicode code points on both request routes', () => {
    const base = {
      schemaVersion: 1 as const,
      consentVersion: '2026-08-07.2' as const,
      installationToken: 'installation-token-which-is-long-enough',
      revenueCatAppUserId: '🫠'.repeat(100),
    };
    const analysisRequest = { ...base, messages: [{ sender: 'Person A', text: 'Please listen.' }] };
    const responseRequest = {
      ...base,
      sender: 'Person A', goal: 'resolve', tone: 'empathetic',
      analysis: fixture,
    };

    expect(AnalyzeRequestSchema.safeParse(analysisRequest).success).toBe(true);
    expect(CraftResponseRequestSchema.safeParse(responseRequest).success).toBe(true);
    expect(AnalyzeRequestSchema.safeParse({ ...analysisRequest, revenueCatAppUserId: '🫠'.repeat(101) }).success).toBe(false);
    expect(CraftResponseRequestSchema.safeParse({ ...responseRequest, revenueCatAppUserId: '🫠'.repeat(101) }).success).toBe(false);
  });

  it('rejects client-asserted subscription plan fields', () => {
    const request = {
      schemaVersion: 1,
      consentVersion: '2026-08-07.2',
      installationToken: 'installation-token-which-is-long-enough',
      messages: [{ sender: 'Person A', text: 'Please listen.' }],
    };

    expect(AnalyzeRequestSchema.safeParse({ ...request, isPro: true }).success).toBe(false);
    expect(AnalyzeRequestSchema.safeParse({ ...request, plan: 'pro' }).success).toBe(false);
    expect(CraftResponseRequestSchema.safeParse({
      ...request,
      sender: 'Person A', goal: 'resolve', tone: 'empathetic', analysis: fixture,
      isPro: true,
    }).success).toBe(false);
  });

  it('enforces anonymous Person A through Person Z labels at every provider boundary', () => {
    const rawInput = {
      schemaVersion: 1,
      consentVersion: '2026-08-07.2',
      installationToken: 'installation-token-which-is-long-enough',
      messages: [{ sender: 'Alice', text: 'Please listen.' }],
    };
    const rawNestedAnalysis = {
      schemaVersion: 1,
      mode: 'ai',
      intensityScore: 42,
      conflictMode: 'Collaborating',
      messages: [{
        sender: 'Alice',
        text: 'Please listen.',
        pattern: 'Neutral',
        egoState: 'Adult',
        possibleInterpretation: 'A request to be heard.',
      }],
    };

    expect(AnalyzeRequestSchema.safeParse(rawInput).success).toBe(false);
    expect(AnalysisResultSchema.safeParse(rawNestedAnalysis).success).toBe(false);
    expect(CraftResponseRequestSchema.safeParse({
      schemaVersion: 1,
      consentVersion: '2026-08-07.2',
      installationToken: 'installation-token-which-is-long-enough',
      sender: 'Alice',
      goal: 'resolve',
      tone: 'empathetic',
      analysis: { ...rawNestedAnalysis, messages: [{ ...rawNestedAnalysis.messages[0], sender: 'Person A' }] },
    }).success).toBe(false);
    expect(AnalyzeRequestSchema.safeParse({ ...rawInput, messages: [{ sender: 'Person AA', text: 'Please listen.' }] }).success).toBe(false);
  });

  it('renames the legacy hidden_meaning provider field and stamps the AI boundary', () => {
    const result = normalizeAnalysisProviderOutput({
      schemaVersion: 99,
      mode: 'local',
      intensityScore: 42,
      conflictMode: 'Collaborating',
      messages: [{
        sender: 'Person A',
        text: 'Please listen to me.',
        pattern: 'Neutral',
        egoState: 'Adult',
        hidden_meaning: 'This may be an attempt to be heard.',
      }],
    });

    expect(result).toMatchObject({
      schemaVersion: 1,
      mode: 'ai',
      messages: [{ possibleInterpretation: 'This may be an attempt to be heard.' }],
    });
  });

  it('rejects extra provider fields after normalization', () => {
    expect(() => normalizeAnalysisProviderOutput({
      intensityScore: 42,
      conflictMode: 'Collaborating',
      messages: [{
        sender: 'Person A',
        text: 'Please listen to me.',
        pattern: 'Neutral',
        egoState: 'Adult',
        possibleInterpretation: 'This may be an attempt to be heard.',
        extra: 'not allowed',
      }],
    })).toThrow();
  });

  it('rejects provider analysis outside the same bounded remote result contract', () => {
    const message = {
      sender: 'Person A',
      text: 'x'.repeat(280),
      pattern: 'Neutral',
      egoState: 'Adult',
      possibleInterpretation: 'y'.repeat(150),
    };
    expect(() => normalizeAnalysisProviderOutput({
      intensityScore: 42,
      conflictMode: 'Collaborating',
      messages: Array.from({ length: 11 }, () => message),
    })).toThrow();
    expect(() => normalizeAnalysisProviderOutput({
      intensityScore: 42,
      conflictMode: 'Collaborating',
      messages: [{ ...message, possibleInterpretation: 'y'.repeat(151) }],
    })).toThrow();
  });
});
