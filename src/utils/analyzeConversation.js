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

function personLabel(index) {
  let value = index
  let label = ''
  do {
    label = String.fromCharCode(65 + (value % 26)) + label
    value = Math.floor(value / 26) - 1
  } while (value >= 0)
  return `Person ${label}`
}

export function parseConversation(raw) {
  const lines = raw.split('\n').filter(l => l.trim())
  const map = {}
  const messages = []
  for (const line of lines) {
    const m = line.match(/^([^:\n-]{1,40})[:-]\s*(.+)$/)
    if (!m) continue
    const name = m[1].trim(), text = m[2].trim()
    if (!name || !text) continue
    if (!map[name]) map[name] = personLabel(Object.keys(map).length)
    messages.push({ sender: map[name], rawName: name, text })
  }
  return messages
}

export function redactKnownParticipantNames(text, names) {
  return names.reduce((redacted, name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return redacted.replace(new RegExp(`(^|[^\\w])${escaped}(?=$|[^\\w])`, 'gi'), '$1[Person]')
  }, text)
}

export function localAnalyze(text) {
  const messages = parseConversation(text)
  if (!messages.length) return null
  const analyzed = messages.map(({ sender, text: messageText }) => ({ sender, text: messageText, ...classify(messageText) }))
  const total = analyzed.reduce((s, m) => s + WEIGHTS[m.gottman_flag], 0)
  const max = Math.max(analyzed.length * 30, 1)
  const overall_tension_score = Math.min(100, Math.round((total / max) * 140))
  const c = analyzed.filter(m => ['Criticism','Contempt'].includes(m.gottman_flag)).length
  const a = analyzed.filter(m => m.gottman_flag === 'Stonewalling').length
  const conflict_mode = c > 0 && a > 0 ? 'Competing vs Avoiding' : c > 0 ? 'Competing' : a > 0 ? 'Avoiding' : 'Collaborating'
  return { messages: analyzed, overall_tension_score, conflict_mode, analysis_mode: 'local' }
}

const CONSENT_VERSION = '2026-08-02'
const MAX_MESSAGES = 100
const MAX_MESSAGE_LENGTH = 1000
const MODES = new Set(['local', 'ai'])
const CONFLICT_MODES = new Set(['Competing', 'Avoiding', 'Compromising', 'Collaborating', 'Accommodating', 'Competing vs Avoiding'])
const PATTERNS = new Set(['Criticism', 'Contempt', 'Defensiveness', 'Stonewalling', 'Neutral'])
const EGO_STATES = new Set(['Parent', 'Adult', 'Child'])

export function toLegacyResult(result) {
  return {
    overall_tension_score: result.intensityScore,
    conflict_mode: result.conflictMode,
    messages: result.messages.map(message => ({
      sender: message.sender,
      text: message.text,
      gottman_flag: message.pattern,
      ego_state: message.egoState,
      hidden_meaning: message.possibleInterpretation,
    })),
    analysis_mode: result.mode,
  }
}

function remoteOptionsReady(options) {
  return options?.allowRemote === true
    && options.consentVersion === CONSENT_VERSION
    && typeof options.installationToken === 'string'
    && /^[A-Za-z0-9_-]{16,256}$/.test(options.installationToken)
}

function proxyUrl(path) {
  const endpoint = import.meta.env?.VITE_AI_PROXY_URL
  if (!endpoint) return null
  try {
    const url = new URL(endpoint)
    const localHost = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localHost)) return null
    return new URL(path, url).toString()
  } catch {
    return null
  }
}

function anonymousMessages(text) {
  const parsed = parseConversation(text)
  if (!parsed.length || parsed.length > MAX_MESSAGES || parsed.some(message => message.text.length > MAX_MESSAGE_LENGTH)) return null
  const names = [...new Set(parsed.map(message => message.rawName))]
  return parsed.map(({ sender, text: messageText }) => ({ sender, text: redactKnownParticipantNames(messageText, names) }))
}

function isRequestId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 200
}

function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every(key => allowed.includes(key))
}

function isAnalysisResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !hasOnlyKeys(value, ['schemaVersion', 'mode', 'intensityScore', 'conflictMode', 'messages'])) return false
  if (value.schemaVersion !== 1 || !MODES.has(value.mode) || !Number.isInteger(value.intensityScore) || value.intensityScore < 0 || value.intensityScore > 100 || !CONFLICT_MODES.has(value.conflictMode) || !Array.isArray(value.messages) || value.messages.length === 0 || value.messages.length > MAX_MESSAGES) return false
  return value.messages.every(message => message && typeof message === 'object' && !Array.isArray(message)
    && hasOnlyKeys(message, ['sender', 'text', 'pattern', 'egoState', 'possibleInterpretation'])
    && /^Person [A-Z]+$/.test(message.sender)
    && typeof message.text === 'string' && message.text.length > 0 && message.text.length <= MAX_MESSAGE_LENGTH
    && PATTERNS.has(message.pattern)
    && EGO_STATES.has(message.egoState)
    && typeof message.possibleInterpretation === 'string' && message.possibleInterpretation.length > 0 && message.possibleInterpretation.length <= 300)
}

function isSuccessEnvelope(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && hasOnlyKeys(value, ['analysis', 'requestId'])
    && isRequestId(value.requestId)
    && isAnalysisResult(value.analysis)
}

function requestIdMatchesHeader(response, requestId) {
  const header = response.headers.get('x-request-id')
  return header === null || header === requestId
}

function abortError() { return new DOMException('Request cancelled', 'AbortError') }

async function fetchWithDeadline(url, init, options) {
  if (options.signal?.aborted) throw abortError()
  const controller = new AbortController()
  let timer
  let cancel
  const cancelled = new Promise((_, reject) => {
    cancel = () => { controller.abort(); reject(abortError()) }
    options.signal?.addEventListener('abort', cancel, { once: true })
  })
  const timedOut = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')) }, options.timeoutMs ?? 20_000)
  })
  try { return await Promise.race([fetch(url, { ...init, signal: controller.signal }), cancelled, timedOut]) }
  finally { clearTimeout(timer); options.signal?.removeEventListener('abort', cancel) }
}

export async function analyzeConversation(text, options = {}) {
  const fallback = (fallbackReason) => ({ result: localAnalyze(text), source: 'local', fallbackReason })
  if (!remoteOptionsReady(options)) return fallback('NOT_CONFIGURED')
  const url = proxyUrl('/v1/analyses')
  const messages = anonymousMessages(text)
  if (!url || !messages) return fallback('NOT_CONFIGURED')
  try {
    const res = await fetchWithDeadline(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ schemaVersion: 1, consentVersion: options.consentVersion, installationToken: options.installationToken, messages }),
    }, options)
    const data = await res.json()
    if (!res.ok || !isSuccessEnvelope(data) || !requestIdMatchesHeader(res, data.requestId) || data.analysis.mode !== 'ai') throw new Error()
    return { result: toLegacyResult(data.analysis), source: 'ai', fallbackReason: null }
  } catch (error) {
    if (error?.name === 'AbortError' && options.signal?.aborted) throw error
    return fallback('REMOTE_UNAVAILABLE')
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
