import {
  REMOTE_ANALYSIS_MAX_MESSAGE_CHARACTERS,
  REMOTE_ANALYSIS_MAX_MESSAGES,
  REMOTE_RESPONSE_MAX_INTERPRETATION_CHARACTERS,
  isAnonymousSender,
  isCodePointLength,
} from './textLimits'

const CONFLICT_MODES = new Set(['Competing', 'Avoiding', 'Compromising', 'Collaborating', 'Accommodating', 'Competing vs Avoiding'])
const PATTERNS = new Set(['Criticism', 'Contempt', 'Defensiveness', 'Stonewalling', 'Neutral'])
const EGO_STATES = new Set(['Parent', 'Adult', 'Child'])

function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every(key => allowed.includes(key))
}

export function isRemoteAnalysisResult(value, reviewedMessages) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !hasOnlyKeys(value, ['schemaVersion', 'mode', 'intensityScore', 'conflictMode', 'messages'])
    || value.schemaVersion !== 1
    || value.mode !== 'ai'
    || !Number.isInteger(value.intensityScore)
    || value.intensityScore < 0
    || value.intensityScore > 100
    || !CONFLICT_MODES.has(value.conflictMode)
    || !Array.isArray(value.messages)
    || value.messages.length === 0
    || value.messages.length > REMOTE_ANALYSIS_MAX_MESSAGES
    || value.messages.length !== reviewedMessages.length) return false

  return value.messages.every((message, index) => message && typeof message === 'object' && !Array.isArray(message)
    && hasOnlyKeys(message, ['sender', 'text', 'pattern', 'egoState', 'possibleInterpretation'])
    && isAnonymousSender(message.sender)
    && isCodePointLength(message.text, 1, REMOTE_ANALYSIS_MAX_MESSAGE_CHARACTERS)
    && PATTERNS.has(message.pattern)
    && EGO_STATES.has(message.egoState)
    && isCodePointLength(message.possibleInterpretation, 1, REMOTE_RESPONSE_MAX_INTERPRETATION_CHARACTERS)
    && message.sender === reviewedMessages[index]?.sender
    && message.text === reviewedMessages[index]?.text)
}
