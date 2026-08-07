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
  Criticism:    'This wording may reflect feeling unheard or moving toward blame; context can change that interpretation.',
  Contempt:     'This wording might reflect frustration, distance, or powerlessness; context can change that interpretation.',
  Defensiveness:'This wording may reflect feeling challenged or protecting a perspective; context can change that interpretation.',
  Stonewalling: 'This wording could reflect overwhelm, disengagement, or a wish to pause; context can change that interpretation.',
  Neutral:      'This wording may not show a clear hostile pattern; context can change that interpretation.',
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
  return index >= 0 && index < MAX_PARTICIPANTS ? `Person ${String.fromCharCode(65 + index)}` : null
}

export function parseConversation(raw) {
  const normalized = normalizeText(raw)
  if (countCodePoints(normalized) > MAX_INPUT_CHARACTERS) return []
  const lines = normalized.split('\n').filter(l => l.trim())
  const map = new Map()
  const messages = []
  for (const line of lines) {
    const m = line.match(/^([^:\n-]+)[:-]\s*(.+)$/u)
    if (!m) continue
    const name = normalizeText(m[1].trim())
    const text = normalizeText(m[2].trim())
    if (!name || !text || countCodePoints(name) > 40 || countCodePoints(text) > MAX_MESSAGE_CHARACTERS) return []
    const key = name.toLowerCase()
    if (!map.has(key)) {
      const label = personLabel(map.size)
      if (!label) return []
      map.set(key, label)
    }
    messages.push({ sender: map.get(key), rawName: name, text })
    if (messages.length > MAX_MESSAGES) return []
  }
  return messages
}

export function redactKnownParticipantNames(text, names) {
  return [...new Set(names.map(normalizeText))]
    .sort((a, b) => countCodePoints(b) - countCodePoints(a))
    .reduce((redacted, name) => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return redacted.replace(new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{M}\\p{N}_])`, 'giu'), '$1[Person]')
    }, normalizeText(text))
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

const CONSENT_VERSION = '2026-08-07.2'
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

export function prepareAnalysisReview(text) {
  const parsed = parseConversation(text)
  if (!parsed.length) return null
  const names = [...new Set(parsed.map(message => message.rawName))]
  const participants = []
  const labels = new Set()
  for (const message of parsed) {
    if (labels.has(message.sender)) continue
    labels.add(message.sender)
    participants.push({ sourceLabel: message.rawName, outboundLabel: message.sender })
  }
  return {
    participants,
    messages: parsed.map(({ sender, text: messageText }) => ({
      sender,
      text: redactKnownParticipantNames(messageText, names),
    })),
  }
}

function reviewedAnalysisMessages(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.messages) || snapshot.messages.length === 0 || snapshot.messages.length > REMOTE_ANALYSIS_MAX_MESSAGES) return null
  if (snapshot.messages.some((message) => !message || typeof message !== 'object' || typeof message.text !== 'string')) return null
  const messages = snapshot.messages.map((message) => ({ sender: message?.sender, text: normalizeText(message?.text) }))
  return messages.every((message) => isAnonymousSender(message.sender)
      && isCodePointLength(message.text, 1, REMOTE_ANALYSIS_MAX_MESSAGE_CHARACTERS))
    ? messages
    : null
}

export function exceedsRemoteAnalysisLimits(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.messages)) return false
  return snapshot.messages.length > REMOTE_ANALYSIS_MAX_MESSAGES
    || snapshot.messages.some(message => typeof message?.text === 'string'
      && countCodePoints(normalizeText(message.text)) > REMOTE_ANALYSIS_MAX_MESSAGE_CHARACTERS)
}

function isRequestId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 200
}

function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every(key => allowed.includes(key))
}

function isAnalysisResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !hasOnlyKeys(value, ['schemaVersion', 'mode', 'intensityScore', 'conflictMode', 'messages'])) return false
  if (value.schemaVersion !== 1 || !MODES.has(value.mode) || !Number.isInteger(value.intensityScore) || value.intensityScore < 0 || value.intensityScore > 100 || !CONFLICT_MODES.has(value.conflictMode) || !Array.isArray(value.messages) || value.messages.length === 0 || value.messages.length > REMOTE_ANALYSIS_MAX_MESSAGES) return false
  return value.messages.every(message => message && typeof message === 'object' && !Array.isArray(message)
    && hasOnlyKeys(message, ['sender', 'text', 'pattern', 'egoState', 'possibleInterpretation'])
    && isAnonymousSender(message.sender)
    && isCodePointLength(message.text, 1, REMOTE_ANALYSIS_MAX_MESSAGE_CHARACTERS)
    && PATTERNS.has(message.pattern)
    && EGO_STATES.has(message.egoState)
    && isCodePointLength(message.possibleInterpretation, 1, 300))
}

function isSuccessEnvelope(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && hasOnlyKeys(value, ['analysis', 'requestId'])
    && isRequestId(value.requestId)
    && isAnalysisResult(value.analysis)
}

function requestIdMatchesHeader(response, requestId) {
  const header = response.headers.get('x-request-id')
  return typeof header === 'string' && header.length > 0 && header === requestId
}

export async function analyzeConversation(text, options = {}) {
  const fallback = (fallbackReason) => ({ result: localAnalyze(text), source: 'local', fallbackReason })
  if (!remoteOptionsReady(options)) return fallback('NOT_CONFIGURED')
  if (exceedsRemoteAnalysisLimits(options.reviewedSnapshot)) return fallback('REMOTE_INPUT_LIMIT')
  const url = proxyUrl('/v1/analyses')
  const messages = reviewedAnalysisMessages(options.reviewedSnapshot)
  if (!url || !messages) return fallback('NOT_CONFIGURED')
  try {
    const { response: res, data } = await fetchBoundedJson(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ schemaVersion: 1, consentVersion: options.consentVersion, installationToken: options.installationToken, messages }),
    }, options)
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
    { sender: 'Person A', text: "I literally told you I'd be there by 7. Why do you always do this?", gottman_flag: 'Criticism', ego_state: 'Parent', hidden_meaning: 'This wording may reflect feeling dismissed or moving toward blame; context can change that interpretation.' },
    { sender: 'Person B', text: "I said 7:30. You never listen to anything I say.", gottman_flag: 'Criticism', ego_state: 'Parent', hidden_meaning: 'This wording might reflect feeling unheard or seeking validation; context can change that interpretation.' },
    { sender: 'Person A', text: "That's not what I said. Stop twisting my words.", gottman_flag: 'Defensiveness', ego_state: 'Adult', hidden_meaning: 'This wording may reflect feeling challenged or defending a perspective; context can change that interpretation.' },
    { sender: 'Person B', text: "Whatever. I'm done with this conversation.", gottman_flag: 'Stonewalling', ego_state: 'Child', hidden_meaning: 'This wording could reflect overwhelm, disengagement, or a wish to pause; context can change that interpretation.' },
    { sender: 'Person A', text: "You always run away when things get hard.", gottman_flag: 'Criticism', ego_state: 'Parent', hidden_meaning: 'This wording may reflect frustration or fear of disconnection; context can change that interpretation.' },
    { sender: 'Person B', text: "I don't even care anymore. Figure it out yourself.", gottman_flag: 'Contempt', ego_state: 'Child', hidden_meaning: 'This wording might reflect frustration, distance, or powerlessness; context can change that interpretation.' },
  ]
}
import { fetchBoundedJson } from './fetchBoundedJson'
import {
  MAX_INPUT_CHARACTERS,
  MAX_MESSAGE_CHARACTERS,
  MAX_MESSAGES,
  MAX_PARTICIPANTS,
  REMOTE_ANALYSIS_MAX_MESSAGE_CHARACTERS,
  REMOTE_ANALYSIS_MAX_MESSAGES,
  countCodePoints,
  isAnonymousSender,
  isCodePointLength,
  normalizeText,
} from './textLimits'
