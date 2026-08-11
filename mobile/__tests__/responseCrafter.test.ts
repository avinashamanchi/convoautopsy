import * as responseCrafter from '../src/domain/responseCrafter';
import {
  craftLocalResponses,
  RESPONSE_GOALS,
  RESPONSE_TONES,
} from '../src/domain/responseCrafter';

describe('craftLocalResponses', () => {
  it.each(RESPONSE_GOALS.flatMap((goal) => RESPONSE_TONES.map((tone) => [goal, tone] as const)))
  ('creates three stable, reviewable drafts for %s in a %s tone', (goal, tone) => {
    const input = { sender: 'Person A', goal, tone };
    const first = craftLocalResponses(input);
    const second = craftLocalResponses(input);

    expect(first).toHaveLength(3);
    expect(first).toEqual(second);
    expect(first.map((draft) => draft.id)).toEqual([
      `${goal}-${tone}-1`,
      `${goal}-${tone}-2`,
      `${goal}-${tone}-3`,
    ]);
    for (const draft of first) {
      expect(draft.text.trim()).not.toBe('');
      expect(draft.hint.trim()).not.toBe('');
    }
  });

  it('keeps user-edit markers and uses an invitation-to-clarify hint', () => {
    const boundary = craftLocalResponses({ sender: 'Person A', goal: 'boundary', tone: 'direct' });
    const understanding = craftLocalResponses({ sender: 'Person A', goal: 'understand', tone: 'assertive' });

    expect(boundary.map((draft) => draft.text).join('\n')).toContain('[Behavior]');
    expect(understanding[1].hint).toBe('Invites clarification');
  });

  it('does not state unverified feelings, behavior, or shared goals as facts', () => {
    const allDraftText = RESPONSE_GOALS.flatMap((goal) => (
      RESPONSE_TONES.flatMap((tone) => craftLocalResponses({ sender: 'Person A', goal, tone }))
    )).map((draft) => `${draft.text}\n${draft.hint}`).join('\n');

    const unsupportedClaims = [
      /\b(?:you(?:'re| are)|they(?:'re| are))\s+(?:frustrated|hurt|feeling|not listening)\b/i,
      /\b(?:we both|both of us)\s+(?:feel|are|have|want|need|owe)\b/i,
      /\bneither of us\b/i,
      /\bI (?:know|think|believe)\s+(?:that )?(?:you|they|we)\b/i,
      /\b(?:a|the)\s+(?:good|better)\s+outcome\s+for\s+both\s+of\s+us\b/i,
      /\b(?:because )?going in circles (?:isn't|is not) working\b/i,
    ];

    for (const claim of unsupportedClaims) expect(allDraftText).not.toMatch(claim);
  });

  it('does not expose an automatic-send function', () => {
    expect((responseCrafter as Record<string, unknown>).sendResponses).toBeUndefined();
    expect((responseCrafter as Record<string, unknown>).autoSend).toBeUndefined();
  });
});
