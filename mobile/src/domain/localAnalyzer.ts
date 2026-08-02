import {
  AnalysisResultSchema,
  type AnalysisResult,
  type EgoState,
  type ParsedMessage,
  type PatternLabel,
} from './analysis';

const PATTERNS: Record<PatternLabel, RegExp[]> = {
  Criticism: [
    /you always/i,
    /you never/i,
    /what's wrong with you/i,
    /you're so/i,
    /you don't even/i,
    /your fault/i,
    /you make me/i,
    /why do you always/i,
  ],
  Contempt: [
    /i don't even care/i,
    /i don't care anymore/i,
    /whatever\b/i,
    /pathetic/i,
    /ridiculous/i,
    /grow up/i,
    /🙄/,
  ],
  Defensiveness: [
    /that's not what/i,
    /i didn't say/i,
    /not my fault/i,
    /it wasn't me/i,
    /i was just/i,
    /stop blaming/i,
    /that's not fair/i,
    /you're twisting/i,
  ],
  Stonewalling: [
    /^fine\.?$/im,
    /^ok\.?$/im,
    /^k\.?$/im,
    /i'm done/i,
    /i don't want to talk/i,
    /leave me alone/i,
    /forget it/i,
    /never mind/i,
    /going to bed/i,
  ],
  Neutral: [],
};

const EGO_PATTERNS: Record<EgoState, RegExp[]> = {
  Parent: [
    /you should/i,
    /you need to/i,
    /you must/i,
    /i told you/i,
    /always do this/i,
    /never listen/i,
    /you always/i,
    /you never/i,
  ],
  Adult: [
    /i think/i,
    /i feel/i,
    /can we/i,
    /let's/i,
    /i understand/i,
    /from my perspective/i,
    /i'd like to/i,
  ],
  Child: [/i don't care/i, /whatever/i, /it's not fair/i, /i hate/i, /not fair/i, /^fine/im],
};

const INTERPRETATIONS: Record<PatternLabel, string> = {
  Criticism: 'This wording may reflect feeling unheard and expressing it through blame.',
  Contempt: 'This wording may reflect feeling powerless while creating emotional distance.',
  Defensiveness: 'This wording may reflect feeling attacked and trying to protect oneself.',
  Stonewalling: 'This wording may reflect feeling overwhelmed and needing to disengage.',
  Neutral: 'This wording may reflect an attempt to communicate without a clear hostile pattern.',
};

const WEIGHTS: Record<PatternLabel, number> = {
  Contempt: 30,
  Criticism: 22,
  Stonewalling: 18,
  Defensiveness: 14,
  Neutral: 0,
};

function classifyPattern(text: string): PatternLabel {
  const labels: PatternLabel[] = [
    'Criticism',
    'Contempt',
    'Defensiveness',
    'Stonewalling',
  ];
  return labels.find((label) => PATTERNS[label].some((pattern) => pattern.test(text))) ?? 'Neutral';
}

function classifyEgoState(text: string): EgoState {
  const states: EgoState[] = ['Parent', 'Child', 'Adult'];
  let egoState: EgoState = 'Adult';
  let bestScore = 0;

  for (const state of states) {
    const score = EGO_PATTERNS[state].filter((pattern) => pattern.test(text)).length;
    if (score > bestScore) {
      bestScore = score;
      egoState = state;
    }
  }

  return egoState;
}

function determineConflictMode(patterns: PatternLabel[]) {
  const competing = patterns.filter(
    (pattern) => pattern === 'Criticism' || pattern === 'Contempt',
  ).length;
  const avoiding = patterns.filter((pattern) => pattern === 'Stonewalling').length;

  if (competing > 0 && avoiding > 0) {
    return 'Competing vs Avoiding' as const;
  }
  if (competing > 0) {
    return 'Competing' as const;
  }
  if (avoiding > 0) {
    return 'Avoiding' as const;
  }
  return 'Collaborating' as const;
}

export function analyzeLocally(messages: ParsedMessage[]): AnalysisResult {
  const analyzedMessages = messages.map(({ sender, text }) => {
    const pattern = classifyPattern(text);
    return {
      sender,
      text,
      pattern,
      egoState: classifyEgoState(text),
      possibleInterpretation: INTERPRETATIONS[pattern],
    };
  });
  const totalWeight = analyzedMessages.reduce(
    (total, message) => total + WEIGHTS[message.pattern],
    0,
  );
  const intensityScore = Math.min(
    100,
    Math.round((totalWeight / Math.max(analyzedMessages.length * 30, 1)) * 140),
  );
  const conflictMode = determineConflictMode(analyzedMessages.map((message) => message.pattern));

  return AnalysisResultSchema.parse({
    schemaVersion: 1,
    mode: 'local',
    intensityScore,
    conflictMode,
    messages: analyzedMessages,
  });
}
