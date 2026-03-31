const GOTTMAN = {
  Criticism:    [/you always/i, /you never/i, /what's wrong with you/i, /you're so/i, /you don't even/i, /your fault/i, /you make me/i, /why do you always/i],
  Contempt:     [/i don't even care/i, /i don't care anymore/i, /whatever\b/i, /pathetic/i, /ridiculous/i, /grow up/i, /🙄/],
  Defensiveness:[/that's not what/i, /i didn't say/i, /not my fault/i, /it wasn't me/i, /i was just/i, /stop blaming/i, /that's not fair/i, /you're twisting/i],
  Stonewalling: [/^fine\.?$/im, /^ok\.?$/im, /^k\.?$/im, /i'm done/i, /i don't want to talk/i, /leave me alone/i, /forget it/i, /never mind/i, /going to bed/i],
}

const EGO = {
  Parent: [/you should/i, /you need to/i, /you must/i, /i told you/i, /always do this/i, /never listen/i, /you always/i, /you never/i],
  Child:  [/i don't care/i, /whatever/i, /it's not fair/i, /i hate/i, /not fair/i, /^fine/im],
  Adult:  [/i think/i, /i feel/i, /can we/i, /let's/i, /i understand/i, /from my perspective/i, /i'd like to/i],
}

const HIDDEN = {
  Criticism:    'I feel unheard and resort to blame.',
  Contempt:     'I care deeply but feel completely powerless.',
  Defensiveness:'I feel attacked and need to protect myself.',
  Stonewalling: 'I am overwhelmed and shutting down to cope.',
  Neutral:      'No clear hostility detected in this message.',
}

const WEIGHTS = { Contempt: 30, Criticism: 22, Stonewalling: 18, Defensiveness: 14, Neutral: 0 }

function classify(text) {
  let gottman_flag = 'Neutral'
  for (const [flag, pats] of Object.entries(GOTTMAN)) {
    if (pats.some(p => p.test(text))) { gottman_flag = flag; break }
  }
  let ego_state = 'Adult', best = 0
  for (const [state, pats] of Object.entries(EGO)) {
    const score = pats.filter(p => p.test(text)).length
    if (score > best) { best = score; ego_state = state }
  }
  return { gottman_flag, ego_state, hidden_meaning: HIDDEN[gottman_flag] }
}

export function parseConversation(raw) {
  const lines = raw.split('\n').filter(l => l.trim())
  const map = {}
  const messages = []
  for (const line of lines) {
    const m = line.match(/^([^:\-\n]{1,40})[\:\-]\s*(.+)$/)
    if (!m) continue
    const name = m[1].trim(), text = m[2].trim()
    if (!name || !text) continue
    if (!map[name]) map[name] = Object.keys(map).length === 0 ? 'Person A' : 'Person B'
    messages.push({ sender: map[name], rawName: name, text })
  }
  return messages
}

function localAnalyze(text) {
  const messages = parseConversation(text)
  if (!messages.length) return null
  const analyzed = messages.map(m => ({ ...m, ...classify(m.text) }))
  const total = analyzed.reduce((s, m) => s + WEIGHTS[m.gottman_flag], 0)
  const max = Math.max(analyzed.length * 30, 1)
  const overall_tension_score = Math.min(100, Math.round((total / max) * 140))
  const c = analyzed.filter(m => ['Criticism','Contempt'].includes(m.gottman_flag)).length
  const a = analyzed.filter(m => m.gottman_flag === 'Stonewalling').length
  const conflict_mode = c > 0 && a > 0 ? 'Competing vs Avoiding' : c > 0 ? 'Competing' : a > 0 ? 'Avoiding' : 'Collaborating'
  return { messages: analyzed, overall_tension_score, conflict_mode }
}

export async function analyzeConversation(text) {
  const key = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GROQ_API_KEY) ||
              (typeof window !== 'undefined' && window.__GROQ_API_KEY)
  if (!key) return localAnalyze(text)
  try {
    const parsed = parseConversation(text)
    if (!parsed.length) return null
    const prompt = `Analyze this conversation using Gottman's Four Horsemen, Thomas-Kilmann conflict modes, and Transactional Analysis. Return ONLY valid JSON:\n{"overall_tension_score":<0-100 integer>,"conflict_mode":"<Competing|Avoiding|Compromising|Collaborating|Accommodating|Competing vs Avoiding>","messages":[{"sender":"<Person A or Person B>","text":"<exact message text>","gottman_flag":"<Criticism|Contempt|Defensiveness|Stonewalling|Neutral>","ego_state":"<Parent|Adult|Child>","hidden_meaning":"<1 sentence what they really mean>"}]}\n\nConversation:\n${parsed.map(m => `${m.sender}: ${m.text}`).join('\n')}`
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 2000 })
    })
    if (!res.ok) throw new Error()
    const data = await res.json()
    const json = data.choices[0].message.content.match(/\{[\s\S]*\}/)?.[0]
    if (json) return JSON.parse(json)
    throw new Error()
  } catch {
    return localAnalyze(text)
  }
}

export const DEMO_TEXT = `Alex: I literally told you I'd be there by 7. Why do you always do this?
Jordan: I said 7:30. You never listen to anything I say.
Alex: That's not what I said. Stop twisting my words.
Jordan: Whatever. I'm done with this conversation.
Alex: You always run away when things get hard.
Jordan: I don't even care anymore. Figure it out yourself.`

export const DEMO_RESULT = {
  overall_tension_score: 84,
  conflict_mode: 'Competing vs Avoiding',
  messages: [
    { sender: 'Person A', text: "I literally told you I'd be there by 7. Why do you always do this?", gottman_flag: 'Criticism', ego_state: 'Parent', hidden_meaning: 'I feel dismissed and resort to blame to feel heard.' },
    { sender: 'Person B', text: "I said 7:30. You never listen to anything I say.", gottman_flag: 'Criticism', ego_state: 'Parent', hidden_meaning: 'I feel chronically unheard and need to be validated.' },
    { sender: 'Person A', text: "That's not what I said. Stop twisting my words.", gottman_flag: 'Defensiveness', ego_state: 'Adult', hidden_meaning: 'I feel attacked and need to defend my reality.' },
    { sender: 'Person B', text: "Whatever. I'm done with this conversation.", gottman_flag: 'Stonewalling', ego_state: 'Child', hidden_meaning: 'I am overwhelmed and shutting down to protect myself.' },
    { sender: 'Person A', text: "You always run away when things get hard.", gottman_flag: 'Criticism', ego_state: 'Parent', hidden_meaning: 'I feel abandoned and am lashing out in frustration.' },
    { sender: 'Person B', text: "I don't even care anymore. Figure it out yourself.", gottman_flag: 'Contempt', ego_state: 'Child', hidden_meaning: 'I care deeply but feel completely powerless in this dynamic.' },
  ]
}
