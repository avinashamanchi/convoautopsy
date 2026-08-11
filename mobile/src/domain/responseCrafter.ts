import type { ResponseDraft } from './analysis';

export type ResponseGoal = 'resolve' | 'boundary' | 'feelings' | 'understand' | 'apologize' | 'request';
export type ResponseTone = 'empathetic' | 'assertive' | 'deescalating' | 'direct' | 'diplomatic';

export const RESPONSE_GOALS: readonly ResponseGoal[] = [
  'resolve', 'boundary', 'feelings', 'understand', 'apologize', 'request',
];

export const RESPONSE_TONES: readonly ResponseTone[] = [
  'empathetic', 'assertive', 'deescalating', 'direct', 'diplomatic',
];

type DraftTemplate = Pick<ResponseDraft, 'text' | 'hint'>;
type TemplateMatrix = Record<ResponseGoal, Record<ResponseTone, readonly [DraftTemplate, DraftTemplate, DraftTemplate]>>;

const templates: TemplateMatrix = {
  resolve: {
    empathetic: [
      { text: "I've been thinking about our conversation and I want to understand your perspective. Could you tell me what [specific moment] was like for you?", hint: 'Opens the door without blame' },
      { text: "I want to make space for your perspective rather than prove a point. What would you like me to understand right now?", hint: 'Invites clarification first' },
      { text: "I feel unheard, and I want to explain my side carefully. Would you be willing to share your side without interruptions if I go second?", hint: 'Proposes a structured reset' },
    ],
    assertive: [
      { text: "I want to address this directly — not to escalate. I feel like we may be going in circles, and that is not working for me. Can we talk about what happened?", hint: 'Direct but not aggressive' },
      { text: "Here's where I stand: I'm open to your perspective, but I need mine to be heard too. Can we have that honest conversation?", hint: 'Holds ground while staying open' },
      { text: "I'd like to work toward resolving this. Are you open to talking about what would help us move forward?", hint: 'Invites shared participation' },
    ],
    deescalating: [
      { text: "I'd like to slow down. I don't want to fight — I care about this, which is why I'm still here. Would you be open to talking?", hint: 'Drops defenses first' },
      { text: "I'm going to pause my own defensiveness for a moment. I am feeling hurt and want to focus on what I need. Would you be open to sharing what you need?", hint: 'Breaks the attack-defend cycle' },
      { text: "I am finding this heated and I am having trouble listening well. Could we take a short pause and come back to this? I would like to continue later.", hint: 'Buys time without abandoning' },
    ],
    direct: [
      { text: 'I need clarity about how I can move forward. What specifically would you like to change?', hint: 'Solution-focused and brief' },
      { text: 'Could you say what you mean directly? I need [your truth].', hint: 'Invites directness' },
      { text: "Here's what I need from this conversation: [specific outcome]. Would you be willing to discuss that?", hint: 'States the goal upfront' },
    ],
    diplomatic: [
      { text: "From my perspective, [your view]. I would like to hear your perspective too. Is there an option we have not considered?", hint: 'Makes room for both perspectives' },
      { text: "I want to hear your perspective, and I need my perspective heard too. Would you be open to each of us describing our view first?", hint: 'Invites mutual acknowledgment' },
      { text: "I want to focus on a practical next step instead of who is right. What outcome would you be willing to discuss?", hint: 'Shifts from blame to a next step' },
    ],
  },
  boundary: {
    empathetic: [
      { text: 'I care about our relationship, which is why I need to say this: when [behavior] happens, I feel [impact]. I need that to change going forward.', hint: 'Frames boundary with care' },
      { text: "I want to be honest with you because I value this. I can't continue if [behavior] keeps happening. I need [specific change].", hint: 'Honest and non-threatening' },
      { text: "This isn't about punishing you — it's about what I need to feel okay in this. I need [boundary] to be respected.", hint: 'Removes blame and states a need' },
    ],
    assertive: [
      { text: '[Behavior] is not okay with me. I need it to stop, and I need that to be understood.', hint: 'Unambiguous and firm' },
      { text: "[Behavior] crosses a line for me. I'm not negotiating on this — I need you to respect that boundary.", hint: 'Non-negotiable but calm' },
      { text: "I've let this slide before, but I can't anymore. [Boundary]. This is something I need from you.", hint: 'Acknowledges past tolerance' },
    ],
    deescalating: [
      { text: "I'm not saying this to start a fight. I need you to know that [behavior] affects me, and I would like to discuss it.", hint: 'Defuses before stating' },
      { text: 'I want to stay calm about this because it matters. I need [boundary] — not as an ultimatum, just as something I genuinely need.', hint: 'Distinguishes need from threat' },
      { text: 'Can I share something without it becoming an argument? I need [boundary]. That is what I am asking for.', hint: 'Requests safe space first' },
    ],
    direct: [
      { text: '[Behavior] has to stop. Here is what I need instead: [specific request].', hint: 'Two sentences and maximum clarity' },
      { text: 'I need [boundary]. That is the short version. Can you respect that?', hint: 'Minimal and seeks agreement' },
      { text: 'Let me be direct: [boundary statement]. I need to know if you can respect that.', hint: 'Ends with a clear question' },
    ],
    diplomatic: [
      { text: 'I would like this relationship to work, and I need to be honest. I need [boundary] to feel comfortable. Is that something you can commit to?', hint: 'States a personal goal clearly' },
      { text: "I'm not trying to make this complicated — I have a need: [boundary]. I'd like to hear if that works for you.", hint: 'Invites dialogue around the need' },
      { text: 'Would you be willing to respect [boundary]? I hope that would improve how I experience this relationship.', hint: 'Proposes rather than demands' },
    ],
  },
  feelings: {
    empathetic: [
      { text: 'I need to share something honestly. When [situation] happened, I felt [emotion]. I am not blaming you; I need you to know.', hint: 'Pure expression without blame' },
      { text: "I've been carrying [emotion] since our conversation and I need to express it. I'd like to feel heard, not fixed.", hint: 'States what support would help' },
      { text: "I don't want to make this bigger than it is, but I've been feeling [emotion] and it matters to me that you know.", hint: 'Minimizes defensiveness' },
    ],
    assertive: [
      { text: 'I felt [emotion] when [situation], and that is real for me. I am sharing it because I want to be understood more clearly.', hint: 'States a personal experience' },
      { text: "Here's my honest experience: [what you felt and why]. I'm not asking you to fix it — I need it acknowledged.", hint: 'Removes pressure while being clear' },
      { text: 'I felt [emotion] and I think it is worth naming. [What caused it]. That affected me.', hint: 'Simple and complete' },
    ],
    deescalating: [
      { text: 'I do not want to fight about this. I want to share how I felt: [emotion and context]. Can you hear that?', hint: 'Requests specific listening' },
      { text: "Without making this a whole thing, I've been feeling [emotion] since [situation]. I needed you to know.", hint: 'Keeps the scope calm' },
      { text: 'Can I say something without it turning into a debate? I felt [emotion]. I wanted to name it.', hint: 'Asks for emotional safety' },
    ],
    direct: [
      { text: 'I felt [emotion] when [situation]. That is my honest reaction and I needed to say it.', hint: 'Three sentences and done' },
      { text: '[Emotion] — that is where I have been since this happened. I wanted you to know directly.', hint: 'Leads with the feeling' },
      { text: 'Short version: I felt [emotion], and [reason]. I needed to tell you that.', hint: 'Explicitly brief' },
    ],
    diplomatic: [
      { text: 'I want to share my experience without making an accusation. I felt [emotion] when [situation]. I hope that gives useful context.', hint: 'Frames it as information rather than attack' },
      { text: 'From my end, this has left me feeling [emotion]. I am curious if you realized that, or if this came from somewhere different for you.', hint: 'Opens mutual exploration' },
      { text: 'I had a feeling come up that I think is worth sharing: [emotion and context]. How did this land for you?', hint: 'Invites their perspective' },
    ],
  },
  understand: {
    empathetic: [
      { text: 'I want to understand your perspective before I say anything else. Can you help me see this from your side? I am listening.', hint: 'Suspends your own view' },
      { text: 'I realize I might have missed something. What was going on for you in that moment?', hint: 'Admits a possible blind spot' },
      { text: 'Before I react any more, I want to understand: what were you feeling when you said that?', hint: 'Asks about feeling rather than facts' },
    ],
    assertive: [
      { text: 'I need to understand your reasoning. Can you explain your perspective on [specific thing]?', hint: 'Direct request for explanation' },
      { text: 'Help me understand: what were you trying to communicate when [situation]?', hint: 'Invites clarification' },
      { text: "I want clarity on one thing: [specific question]. What's your honest answer?", hint: 'Narrows to the essential question' },
    ],
    deescalating: [
      { text: 'Before we go further, can I ask — what were you feeling in that moment? I want to understand, not argue.', hint: 'Pauses the fight to ask' },
      { text: 'Let us slow down. Help me understand where you are coming from — not to counter you, just to get it.', hint: 'Explicitly non-combative' },
      { text: "I don't want to assume I know what you meant. Can you tell me what was going on for you?", hint: 'Rejects assumption and invites clarity' },
    ],
    direct: [
      { text: 'What did you mean by [specific thing]? I want a direct answer.', hint: 'No preamble, just the question' },
      { text: 'Can you explain [specific thing]? I need to understand before I respond.', hint: 'Signals you are holding back until clear' },
      { text: 'What are you trying to tell me here? I want to hear it clearly.', hint: 'Calls for a clear message' },
    ],
    diplomatic: [
      { text: "I'd like to understand your perspective better. What's the part of this I am missing?", hint: 'Acknowledges your own gap' },
      { text: "I think there might be something I am not seeing from your side. What is it?", hint: 'Gentle and curious' },
      { text: 'Could you help me understand how you arrived at [their position]? I am curious.', hint: 'Interest rather than challenge' },
    ],
  },
  apologize: {
    empathetic: [
      { text: 'I have been thinking about this and I want to apologize. I said [thing] and regret saying it. I am sorry for any impact it had.', hint: 'Specific rather than generic' },
      { text: "I'm sorry. I understand now that [impact]. I did not handle that well and I want to own that.", hint: 'Takes responsibility without defensiveness' },
      { text: 'I need to apologize for [specific behavior]. Looking back, I can see how that came across. I am sorry.', hint: 'Shows understanding of impact' },
    ],
    assertive: [
      { text: 'I want to take responsibility: [specific behavior] was wrong and I am apologizing for it.', hint: 'Clear ownership without hedging' },
      { text: 'I owe you an apology for [specific behavior]. That is not how I want to show up in this, and I am owning it.', hint: 'Connects to accountability' },
      { text: 'I was wrong about [thing]. I am sorry — no excuses.', hint: 'Absolute minimum and clear' },
    ],
    deescalating: [
      { text: 'Can I say I am sorry? I do not want to keep going in circles. I regret [behavior] and would like to understand its impact.', hint: 'Breaks the cycle first' },
      { text: 'I want to step back from the argument and apologize. I am sorry for [behavior]. Let us start from there.', hint: 'Resets before continuing' },
      { text: "I've been in defensive mode and that has not been fair to you. I am sorry for [specific thing]. Can we reset?", hint: 'Names the pattern being broken' },
    ],
    direct: [
      { text: 'I am sorry for [behavior]. That was wrong and I know it.', hint: 'Under 15 words' },
      { text: 'I owe you an apology: [behavior]. I am sorry.', hint: 'Names the debt and pays it' },
      { text: 'I was wrong, I am sorry for [behavior], and I want to do better.', hint: 'Past, present, and future' },
    ],
    diplomatic: [
      { text: 'I want to start by taking responsibility for my part. I am sorry for [behavior] — that was not fair.', hint: 'Initiates without waiting' },
      { text: 'I want to take responsibility for my part in this. I am sorry for [behavior]. If you are open to it, I would like to hear your view too.', hint: 'Opens the door to accountability' },
      { text: 'I am sorry for [behavior]. I regret doing that and did not want to cause harm.', hint: 'Names personal responsibility' },
    ],
  },
  request: {
    empathetic: [
      { text: 'I want to ask for something gently. When [trigger situation], it helps me when [desired behavior]. Is that something you would be willing to try?', hint: 'Frames as a request rather than demand' },
      { text: 'I need something from you and I want to be honest about it. [Desired behavior] would make a real difference for me. Can we work toward that?', hint: 'Vulnerable and specific' },
      { text: 'I am not trying to make demands — I have a genuine need. [Specific request]. Would that be possible?', hint: 'Pre-empts resistance' },
    ],
    assertive: [
      { text: 'I need [specific change]. I am asking directly because I need this to happen.', hint: 'States urgency without aggression' },
      { text: 'Here is what I need going forward: [specific behavior]. Can I count on that?', hint: 'Ends with a commitment question' },
      { text: 'I want to make one request: [desired change]. Is that reasonable?', hint: 'Minimizes scope of the ask' },
    ],
    deescalating: [
      { text: 'Without making this a big thing, can I ask for [specific change]? I think it would help me.', hint: 'Low-stakes framing' },
      { text: 'I have one ask that I think would help: [request]. What do you think?', hint: 'Invites collaboration' },
      { text: 'Can I make a small but important request? [Specific change]. Would that work for you?', hint: 'Acknowledges weight without drama' },
    ],
    direct: [
      { text: 'I need [specific behavior] to change. Can you do that?', hint: 'Binary and unambiguous' },
      { text: '[Specific request]. Is that something you can commit to?', hint: 'One line and one ask' },
      { text: 'Going forward, I need [change]. Yes or no?', hint: 'Invites a clear answer' },
    ],
    diplomatic: [
      { text: 'I think [desired change] would help me. Does that feel fair to you?', hint: 'Explains a personal benefit' },
      { text: "I'd like to suggest a change that I think would make things better: [request]. What do you think?", hint: 'Proposal rather than ultimatum' },
      { text: 'What if we tried [desired approach]? I hope that could work for me; what do you think?', hint: 'Hypothetical reduces pressure' },
    ],
  },
};

export function craftLocalResponses(input: {
  sender: string;
  goal: ResponseGoal;
  tone: ResponseTone;
}): ResponseDraft[] {
  void input.sender;
  return templates[input.goal][input.tone].map((template, index) => ({
    ...template,
    id: `${input.goal}-${input.tone}-${index + 1}`,
  }));
}
