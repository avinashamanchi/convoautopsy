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
      { text: "I've been thinking about our conversation and I want to genuinely understand your perspective. Can we talk about what specifically hurt you?", hint: 'Opens the door without blame' },
      { text: "I hear that you're frustrated, and that makes sense. I want us to resolve this — not just prove a point. What do you need right now?", hint: 'Acknowledges feelings first' },
      { text: "I think we're both feeling unheard, which is exhausting. Can we each share our side without interrupting? I'll go second.", hint: 'Proposes a structured reset' },
    ],
    assertive: [
      { text: "I want to address this directly — not to escalate, but because going in circles isn't working. Can we talk about what happened?", hint: 'Direct but not aggressive' },
      { text: "Here's where I stand: I'm open to your perspective, but I need mine to be heard too. Can we have that honest conversation?", hint: 'Holds ground while staying open' },
      { text: "I'd like to resolve this, but it takes both of us engaging. What would it take for us to move past this?", hint: 'Puts responsibility on both sides' },
    ],
    deescalating: [
      { text: "Let's both slow down. I don't want to fight — I care about this, which is why I'm still here. Can we talk?", hint: 'Drops defenses first' },
      { text: "I'm going to stop defending myself for a second. I think we're both hurt and reacting to that. What if we focused on what we each need?", hint: 'Breaks the attack-defend cycle' },
      { text: "This is getting heated and neither of us is listening anymore. Can we take a short pause and come back to this? I'm not walking away — I want this to go somewhere.", hint: 'Buys time without abandoning' },
    ],
    direct: [
      { text: 'I need us to resolve this. What specifically needs to change for that to happen?', hint: 'Solution-focused and brief' },
      { text: 'Can we skip the back-and-forth and just say what we mean? I need [your truth].', hint: 'Invites radical honesty' },
      { text: "Here's what I need from this conversation: [specific outcome]. Can we agree on that?", hint: 'States the goal upfront' },
    ],
    diplomatic: [
      { text: "There are valid points on both sides. From my perspective, [your view]. I can also see where you're coming from. Is there middle ground we haven't tried?", hint: 'Validates both sides' },
      { text: "I don't want to dismiss how you're feeling. I also need my perspective heard. What if we each acknowledged the other's side first?", hint: 'Creates mutual acknowledgment' },
      { text: "We both have a point. Can we focus on what a good outcome looks like for both of us, instead of who's right?", hint: 'Shifts from blame to solution' },
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
      { text: "I'm not saying this to start a fight. I need you to know that [behavior] affects me, and I need us to address it.", hint: 'Defuses before stating' },
      { text: 'I want to stay calm about this because it matters. I need [boundary] — not as an ultimatum, just as something I genuinely need.', hint: 'Distinguishes need from threat' },
      { text: 'Can I share something without it becoming an argument? I need [boundary]. That is what I am asking for.', hint: 'Requests safe space first' },
    ],
    direct: [
      { text: '[Behavior] has to stop. Here is what I need instead: [specific request].', hint: 'Two sentences and maximum clarity' },
      { text: 'I need [boundary]. That is the short version. Can we agree on that?', hint: 'Minimal and seeks agreement' },
      { text: 'Let me be direct: [boundary statement]. I need to know if you can respect that.', hint: 'Ends with a clear question' },
    ],
    diplomatic: [
      { text: 'I think we both want this to work, and part of that means being honest. I need [boundary] to feel comfortable. Is that something you can commit to?', hint: 'Frames it as a shared goal' },
      { text: "I'm not trying to make this complicated — I have a need: [boundary]. I'd like to hear if that works for you.", hint: 'Invites dialogue around the need' },
      { text: 'Would it be possible for us to agree on [boundary]? I think it would make things better between us.', hint: 'Proposes rather than demands' },
    ],
  },
  feelings: {
    empathetic: [
      { text: 'I need to share something honestly. When [situation] happened, I felt [emotion]. I am not blaming you; I need you to know.', hint: 'Pure expression without blame' },
      { text: "I've been carrying [emotion] since our conversation and I need to express it. I'd like to feel heard, not fixed.", hint: 'States what support would help' },
      { text: "I don't want to make this bigger than it is, but I've been feeling [emotion] and it matters to me that you know.", hint: 'Minimizes defensiveness' },
    ],
    assertive: [
      { text: 'I felt [emotion] when [situation], and that is real for me. I am sharing it because I want us to understand each other better.', hint: 'States a personal experience' },
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
      { text: 'I want to share my experience without making you feel accused. I felt [emotion] when [situation]. I think that is useful for both of us to know.', hint: 'Frames it as information rather than attack' },
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
      { text: 'I have been thinking about this and I want to apologize. I said [thing] and that was wrong of me. I am sorry for how that hurt you.', hint: 'Specific rather than generic' },
      { text: "I'm sorry. I understand now that [impact]. I did not handle that well and I want to own that.", hint: 'Takes responsibility without defensiveness' },
      { text: 'I need to apologize for [specific behavior]. Looking back, I can see how that came across. I am sorry.', hint: 'Shows understanding of impact' },
    ],
    assertive: [
      { text: 'I want to take responsibility: [specific behavior] was wrong and I am apologizing for it.', hint: 'Clear ownership without hedging' },
      { text: 'I owe you an apology for [specific behavior]. That is not how I want to show up in this, and I am owning it.', hint: 'Connects to accountability' },
      { text: 'I was wrong about [thing]. I am sorry — no excuses.', hint: 'Absolute minimum and clear' },
    ],
    deescalating: [
      { text: 'Can I say I am sorry? I do not want to keep going in circles. I know [behavior] hurt you and I regret it.', hint: 'Breaks the cycle first' },
      { text: 'I want to step back from the argument and apologize. I am sorry for [behavior]. Let us start from there.', hint: 'Resets before continuing' },
      { text: "I've been in defensive mode and that has not been fair to you. I am sorry for [specific thing]. Can we reset?", hint: 'Names the pattern being broken' },
    ],
    direct: [
      { text: 'I am sorry for [behavior]. That was wrong and I know it.', hint: 'Under 15 words' },
      { text: 'I owe you an apology: [behavior]. I am sorry.', hint: 'Names the debt and pays it' },
      { text: 'I was wrong, I am sorry for [behavior], and I want to do better.', hint: 'Past, present, and future' },
    ],
    diplomatic: [
      { text: 'I think we both have things to apologize for, and I want to start. I am sorry for [behavior] — that was not fair.', hint: 'Initiates without waiting' },
      { text: 'I want to take responsibility for my part in this. I am sorry for [behavior]. I hope we can both acknowledge where things went wrong.', hint: 'Opens the door to mutual accountability' },
      { text: 'I am sorry for [behavior]. I know that affected you and I did not want to cause that.', hint: 'Names the impact' },
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
      { text: 'Without making this a big thing, can I ask for [specific change]? I think it would help both of us.', hint: 'Low-stakes framing' },
      { text: 'I have one ask that I think would help: [request]. What do you think?', hint: 'Invites collaboration' },
      { text: 'Can I make a small but important request? [Specific change]. Would that work for you?', hint: 'Acknowledges weight without drama' },
    ],
    direct: [
      { text: 'I need [specific behavior] to change. Can you do that?', hint: 'Binary and unambiguous' },
      { text: '[Specific request]. Is that something you can commit to?', hint: 'One line and one ask' },
      { text: 'Going forward, I need [change]. Yes or no?', hint: 'Invites a clear answer' },
    ],
    diplomatic: [
      { text: 'I think it would help both of us if [desired change]. Does that feel fair to you?', hint: 'Mutual benefit framing' },
      { text: "I'd like to suggest a change that I think would make things better: [request]. What do you think?", hint: 'Proposal rather than ultimatum' },
      { text: 'What if we tried [desired approach]? I think that could work well for both of us.', hint: 'Hypothetical reduces pressure' },
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
