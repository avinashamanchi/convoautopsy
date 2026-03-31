const TEMPLATES = {
  resolve: {
    empathetic: [
      { text: "I've been thinking about our conversation and I want to genuinely understand your perspective. Can we talk about what specifically hurt you?", hint: "Opens the door without blame" },
      { text: "I hear that you're frustrated, and that actually makes sense. I want us to resolve this — not just prove a point. What do you need right now?", hint: "Acknowledges feelings first" },
      { text: "I think we're both feeling unheard, which is exhausting. Can we each share our side without interrupting? I'll go second.", hint: "Proposes a structured reset" },
    ],
    assertive: [
      { text: "I want to address this directly — not to escalate, but because going in circles isn't working. Can we actually talk about what happened?", hint: "Direct but not aggressive" },
      { text: "Here's where I stand: I'm open to your perspective, but I need mine to be heard too. Can we have that honest conversation?", hint: "Holds ground while staying open" },
      { text: "I'd like to resolve this, but it takes both of us engaging. What would it take for us to move past this?", hint: "Puts responsibility on both sides" },
    ],
    deescalating: [
      { text: "Let's both slow down. I don't want to fight — I actually care about this, which is why I'm still here. Can we just talk?", hint: "Drops defenses first" },
      { text: "I'm going to stop defending myself for a second. I think we're both hurt and reacting to that. What if we focused on what we each need?", hint: "Breaks the attack-defend cycle" },
      { text: "This is getting heated and neither of us is listening anymore. Can we take a short pause and come back to this? I'm not walking away — I want this to go somewhere.", hint: "Buys time without abandoning" },
    ],
    direct: [
      { text: "I need us to actually resolve this. What specifically needs to change for that to happen?", hint: "Solution-focused and brief" },
      { text: "Can we skip the back-and-forth and just say what we actually mean? I'll start: I need [your truth].", hint: "Invites radical honesty" },
      { text: "Here's what I need from this conversation: [specific outcome]. Can we agree on that?", hint: "States the goal upfront" },
    ],
    diplomatic: [
      { text: "There are valid points on both sides. From my perspective, [your view]. I can also see where you're coming from. Is there middle ground we haven't tried?", hint: "Validates both sides" },
      { text: "I don't want to dismiss how you're feeling — that's real. I also need my perspective heard. What if we each acknowledged the other's side first?", hint: "Creates mutual acknowledgment" },
      { text: "We both have a point. Can we focus on what a good outcome looks like for both of us, instead of who's right?", hint: "Shifts from blame to solution" },
    ],
  },
  boundary: {
    empathetic: [
      { text: "I care about our relationship, which is exactly why I need to say this: when [behavior] happens, I feel [impact]. I need that to change going forward.", hint: "Frames boundary with care" },
      { text: "I want to be honest with you because I value this. I can't continue if [behavior] keeps happening. I need [specific change].", hint: "Honest and non-threatening" },
      { text: "This isn't about punishing you — it's about what I need to feel okay in this. I need [boundary] to be respected.", hint: "Removes blame, states need" },
    ],
    assertive: [
      { text: "[Behavior] is not okay with me. I need it to stop, and I need that to be understood.", hint: "Unambiguous and firm" },
      { text: "[Behavior] crosses a line for me. I'm not negotiating on this — I need you to respect that boundary.", hint: "Non-negotiable but calm" },
      { text: "I've let this slide before, but I can't anymore. [Boundary]. This is something I need from you.", hint: "Acknowledges past tolerance" },
    ],
    deescalating: [
      { text: "I'm not saying this to start a fight. I just need you to know that [behavior] really affects me, and I need us to address it.", hint: "Defuses before stating" },
      { text: "I want to stay calm about this because it matters. I need [boundary] — not as an ultimatum, just as something I genuinely need.", hint: "Distinguishes need from threat" },
      { text: "Can I share something without it becoming an argument? I need [boundary]. That's all I'm asking.", hint: "Requests safe space first" },
    ],
    direct: [
      { text: "[Behavior] has to stop. Here's what I need instead: [specific request].", hint: "Two sentences, maximum clarity" },
      { text: "I need [boundary]. That's the short version. Can we agree on that?", hint: "Minimal, expects agreement" },
      { text: "Let me be direct: [boundary statement]. I need to know if you can respect that.", hint: "Ends with a yes/no question" },
    ],
    diplomatic: [
      { text: "I think we both want this to work, and part of that means being honest. I need [boundary] to feel comfortable. Is that something you can commit to?", hint: "Frames it as shared goal" },
      { text: "I'm not trying to make this complicated — I just have a need: [boundary]. I'd like to hear if that works for you.", hint: "Invites dialogue around the need" },
      { text: "Would it be possible for us to agree on [boundary]? I think it would make things genuinely better between us.", hint: "Proposes rather than demands" },
    ],
  },
  feelings: {
    empathetic: [
      { text: "I need to share something honestly. When [situation] happened, I felt [emotion]. I'm not blaming you — I just need you to know.", hint: "Pure expression, no blame" },
      { text: "I've been carrying [emotion] since our conversation and I need to express it. I'd like to feel heard, not fixed.", hint: "States what they need from you" },
      { text: "I don't want to make this bigger than it is, but I've been feeling [emotion] and it matters to me that you know.", hint: "Minimizes defensiveness" },
    ],
    assertive: [
      { text: "I felt [emotion] when [situation], and that's real. I'm sharing it because I want us to understand each other better.", hint: "States feeling as fact" },
      { text: "Here's my honest experience: [what you felt and why]. I'm not asking you to fix it — I just need it acknowledged.", hint: "Removes pressure while being clear" },
      { text: "I felt [emotion] and I think it's worth naming. [What caused it]. That affected me.", hint: "Simple and complete" },
    ],
    deescalating: [
      { text: "I don't want to fight about this. I just want to share how I felt: [emotion and context]. Can you hear that?", hint: "Requests specific listening" },
      { text: "Without making this a whole thing — I've been feeling [emotion] since [situation]. I just needed you to know.", hint: "Acknowledges it doesn't need to escalate" },
      { text: "Can I just say something without it turning into a debate? I felt [emotion]. I just wanted to name it.", hint: "Asks for emotional safety" },
    ],
    direct: [
      { text: "I felt [emotion] when [situation]. That's my honest reaction and I needed to say it.", hint: "Three sentences, done" },
      { text: "[Emotion] — that's where I've been since this happened. I wanted you to know directly.", hint: "Leads with the feeling" },
      { text: "Short version: I felt [emotion], and [reason]. I needed to tell you that.", hint: "Explicitly brief" },
    ],
    diplomatic: [
      { text: "I want to share my experience without making you feel accused. I felt [emotion] when [situation]. I think that's useful for both of us to know.", hint: "Framed as information, not attack" },
      { text: "From my end, this has left me feeling [emotion]. I'm curious if you realized that, or if this came from somewhere different for you.", hint: "Opens mutual exploration" },
      { text: "I had a feeling come up that I think is worth sharing: [emotion and context]. How did this land for you?", hint: "Invites their perspective after" },
    ],
  },
  understand: {
    empathetic: [
      { text: "I want to genuinely understand your perspective before I say anything else. Can you help me see this from your side? I'm listening.", hint: "Suspends your own view" },
      { text: "I realize I might have missed something. What was actually going on for you in that moment?", hint: "Admits possible blindspot" },
      { text: "Before I react any more, I want to understand: what were you feeling when you said that?", hint: "Asks about feeling, not facts" },
    ],
    assertive: [
      { text: "I need to understand your reasoning. Can you explain your perspective on [specific thing]?", hint: "Direct request for explanation" },
      { text: "Help me understand: what were you actually trying to communicate when [situation]?", hint: "Assumes positive intent" },
      { text: "I want clarity on one thing: [specific question]. What's your honest answer?", hint: "Narrows to the essential question" },
    ],
    deescalating: [
      { text: "Before we go further, can I ask — what were you actually feeling in that moment? I want to understand, not argue.", hint: "Pauses the fight to ask" },
      { text: "Let's slow down. Help me understand where you're coming from — not to counter you, just to actually get it.", hint: "Explicitly non-combative" },
      { text: "I don't want to assume I know what you meant. Can you tell me what was actually going on for you?", hint: "Rejects assumption, invites truth" },
    ],
    direct: [
      { text: "What did you mean by [specific thing]? I want a direct answer.", hint: "No preamble, just the question" },
      { text: "Can you explain [specific thing]? I need to understand before I respond.", hint: "Signals you're holding back until clear" },
      { text: "What are you actually trying to tell me here? I want to hear it clearly.", hint: "Calls for the real message" },
    ],
    diplomatic: [
      { text: "I'd love to understand your perspective better. What's the part of this I'm missing?", hint: "Acknowledges your own gap" },
      { text: "I think there might be something I'm not seeing from your side. What is it?", hint: "Gentle and curious" },
      { text: "Could you help me understand how you arrived at [their position]? I'm genuinely curious.", hint: "Interest, not challenge" },
    ],
  },
  apologize: {
    empathetic: [
      { text: "I've been thinking about this and I want to genuinely apologize. I said [thing] and that was wrong of me. I'm sorry for how that hurt you.", hint: "Specific, not generic" },
      { text: "I'm sorry — not a defensive sorry. I actually understand now that [impact]. I didn't handle that well and I want to own that.", hint: "Distinguishes real apology" },
      { text: "I need to apologize for [specific behavior]. Looking back, I can see how that came across and why you reacted the way you did. I'm sorry.", hint: "Shows understanding of impact" },
    ],
    assertive: [
      { text: "I want to take responsibility: [specific behavior] was wrong and I'm apologizing for it.", hint: "Clear ownership, no hedging" },
      { text: "I owe you an apology for [specific behavior]. That's not who I want to be in this, and I'm owning it.", hint: "Connects to identity" },
      { text: "I was wrong about [thing]. I'm sorry — no excuses.", hint: "Absolute minimum, maximum impact" },
    ],
    deescalating: [
      { text: "Can I just say I'm sorry? I don't want to keep going in circles. I know [behavior] hurt you and I genuinely regret it.", hint: "Breaks the cycle first" },
      { text: "I want to step back from the argument and just apologize. I'm sorry for [behavior]. Let's start from there.", hint: "Resets before continuing" },
      { text: "I've been in defensive mode and that's not fair to you. I'm sorry for [specific thing]. Can we reset?", hint: "Names the pattern being broken" },
    ],
    direct: [
      { text: "I'm sorry for [behavior]. That was wrong and I know it.", hint: "Under 15 words" },
      { text: "I owe you an apology: [behavior]. I'm sorry.", hint: "Names the debt and pays it" },
      { text: "I was wrong, I'm sorry for [behavior], and I want to do better.", hint: "Past + present + future" },
    ],
    diplomatic: [
      { text: "I think we both have things to apologize for, and I want to start. I'm sorry for [behavior] — that wasn't fair.", hint: "Initiates without waiting" },
      { text: "I want to take responsibility for my part in this. I'm sorry for [behavior]. I hope we can both acknowledge where things went wrong.", hint: "Opens door for mutual accountability" },
      { text: "I'm sorry for [behavior]. I know that affected you and I genuinely didn't want to cause that.", hint: "Names the impact" },
    ],
  },
  request: {
    empathetic: [
      { text: "I want to ask for something, and I want to do it gently. When [trigger situation], it really helps me when [desired behavior]. Is that something you'd be willing to try?", hint: "Frames as a request, not demand" },
      { text: "I need something from you and I want to be honest about it. [Desired behavior] would make a real difference for me. Can we work toward that?", hint: "Vulnerable and specific" },
      { text: "I'm not trying to make demands — I just have a genuine need. [Specific request]. Would that be possible?", hint: "Pre-empts resistance" },
    ],
    assertive: [
      { text: "I need [specific change]. I'm asking directly because I need this to actually happen.", hint: "States urgency without aggression" },
      { text: "Here's what I need going forward: [specific behavior]. Can I count on that?", hint: "Ends with a commitment question" },
      { text: "I want to make one request: [desired change]. That's it. Is that reasonable?", hint: "Minimizes scope of ask" },
    ],
    deescalating: [
      { text: "Without making this a big thing — can I ask for [specific change]? I think it would help both of us.", hint: "Low stakes framing" },
      { text: "I have one ask that I think would really help: [request]. What do you think?", hint: "Invites collaboration" },
      { text: "Can I make a small but important request? [Specific change]. Would that work for you?", hint: "Acknowledges weight without drama" },
    ],
    direct: [
      { text: "I need [specific behavior] to change. Can you do that?", hint: "Binary, no ambiguity" },
      { text: "[Specific request]. Is that something you can commit to?", hint: "One line, one ask" },
      { text: "Going forward, I need [change]. Yes or no?", hint: "Forces a real answer" },
    ],
    diplomatic: [
      { text: "I think it would help both of us if [desired change]. Does that feel fair to you?", hint: "Mutual benefit framing" },
      { text: "I'd like to suggest a change that I think would make things better: [request]. What do you think?", hint: "Proposal, not ultimatum" },
      { text: "What if we tried [desired approach]? I think that could work well for both of us.", hint: "Hypothetical reduces pressure" },
    ],
  },
}

export const GOAL_OPTIONS = [
  { id: 'resolve',    label: 'Resolve the conflict',            icon: '🤝' },
  { id: 'boundary',   label: 'Set a boundary',                  icon: '🛑' },
  { id: 'feelings',   label: 'Express how I feel',              icon: '💬' },
  { id: 'understand', label: 'Seek understanding',              icon: '🔍' },
  { id: 'apologize',  label: 'Apologize & take responsibility', icon: '🙏' },
  { id: 'request',    label: 'Request a behavior change',       icon: '✏️' },
]

export const TONE_OPTIONS = [
  { id: 'empathetic',   label: 'Empathetic & warm',     icon: '🫂' },
  { id: 'assertive',    label: 'Assertive & confident', icon: '💪' },
  { id: 'deescalating', label: 'De-escalating & calm',  icon: '🕊️' },
  { id: 'direct',       label: 'Direct & clear',        icon: '🎯' },
  { id: 'diplomatic',   label: 'Diplomatic & balanced', icon: '⚖️' },
]

export function getPersonSenders(result) {
  if (!result?.messages) return ['Person A', 'Person B']
  return [...new Set(result.messages.map(m => m.sender))]
}

export function getPersonPattern(result, sender) {
  if (!result?.messages) return 'mixed communication patterns'
  const flags = result.messages
    .filter(m => m.sender === sender && m.gottman_flag !== 'Neutral')
    .map(m => m.gottman_flag)
  if (!flags.length) return 'mostly neutral communication'
  const counts = {}
  flags.forEach(f => counts[f] = (counts[f] || 0) + 1)
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([f]) => f).join(', ')
}

function localCraftResponse({ sender, goal, tone }) {
  const templates = TEMPLATES[goal]?.[tone] || TEMPLATES.resolve.empathetic
  return templates.map((t, i) => ({ id: i + 1, text: t.text, hint: t.hint }))
}

async function groqCraftResponse({ sender, goal, tone, result }) {
  const key = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GROQ_API_KEY) ||
              (typeof window !== 'undefined' && window.__GROQ_API_KEY)
  if (!key) throw new Error('No key')
  const pattern = getPersonPattern(result, sender)
  const goalLabel = GOAL_OPTIONS.find(g => g.id === goal)?.label || goal
  const toneLabel = TONE_OPTIONS.find(t => t.id === tone)?.label || tone
  const prompt = `You are an expert relationship communication coach. Generate exactly 3 response options for ${sender} based on this analysis.

ANALYSIS:
- Tension score: ${result.overall_tension_score}/100
- Conflict mode: ${result.conflict_mode}
- ${sender}'s pattern: ${pattern}

PARAMETERS:
- Goal: ${goalLabel}
- Tone: ${toneLabel}

Each response: 2-4 natural, human-sounding sentences. Match the tone exactly. Be specific and actionable.

Return ONLY this JSON:
[{"id":1,"text":"...","hint":"one brief phrase describing this approach"},{"id":2,"text":"...","hint":"..."},{"id":3,"text":"...","hint":"..."}]`

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.75, max_tokens: 700 })
  })
  if (!res.ok) throw new Error('Groq error')
  const data = await res.json()
  const json = data.choices[0].message.content.match(/\[[\s\S]*\]/)?.[0]
  if (json) return JSON.parse(json)
  throw new Error('No JSON')
}

export async function craftResponse(params) {
  try { return await groqCraftResponse(params) }
  catch { return localCraftResponse(params) }
}
