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

  it('does not expose an automatic-send function', () => {
    expect((responseCrafter as Record<string, unknown>).sendResponses).toBeUndefined();
    expect((responseCrafter as Record<string, unknown>).autoSend).toBeUndefined();
  });
});
