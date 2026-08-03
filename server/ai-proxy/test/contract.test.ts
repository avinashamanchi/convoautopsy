import { describe, expect, it } from 'vitest';

import fixture from '../../../contracts/fixtures/analysis.valid.json';
import { AnalysisResultSchema, AnalyzeRequestSchema, normalizeAnalysisProviderOutput } from '../src/contract';

describe('request contract', () => {
  it('accepts the canonical v1 analysis fixture', () => {
    expect(AnalysisResultSchema.parse(fixture)).toEqual(fixture);
  });

  it('accepts a bounded, consented analysis request', () => {
    const result = AnalyzeRequestSchema.safeParse({
      schemaVersion: 1,
      consentVersion: '2026-08-02',
      installationToken: 'installation-token-which-is-long-enough',
      messages: [{ sender: 'Person A', text: 'Please listen to me.' }],
    });

    expect(result.success).toBe(true);
  });

  it('rejects extra fields and invalid installation tokens', () => {
    const result = AnalyzeRequestSchema.safeParse({
      schemaVersion: 1,
      consentVersion: '2026-08-02',
      installationToken: 'short',
      messages: [{ sender: 'Person A', text: 'Please listen to me.', injected: true }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects more than 100 messages and individual messages longer than 1,000 characters', () => {
    const manyMessages = Array.from({ length: 101 }, () => ({ sender: 'Person A', text: 'ok' }));

    expect(AnalyzeRequestSchema.safeParse({
      schemaVersion: 1,
      consentVersion: '2026-08-02',
      installationToken: 'installation-token-which-is-long-enough',
      messages: manyMessages,
    }).success).toBe(false);
    expect(AnalyzeRequestSchema.safeParse({
      schemaVersion: 1,
      consentVersion: '2026-08-02',
      installationToken: 'installation-token-which-is-long-enough',
      messages: [{ sender: 'Person A', text: 'x'.repeat(1_001) }],
    }).success).toBe(false);
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
});
