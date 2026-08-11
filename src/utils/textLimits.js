export const MAX_INPUT_CHARACTERS = 100_000
export const MAX_MESSAGES = 100
export const MAX_PARTICIPANTS = 26
export const MAX_MESSAGE_CHARACTERS = 1_000
export const REMOTE_ANALYSIS_MAX_MESSAGES = 10
export const REMOTE_ANALYSIS_MAX_MESSAGE_CHARACTERS = 280
export const REMOTE_RESPONSE_MAX_INTERPRETATION_CHARACTERS = 150

export function normalizeText(value) {
  return String(value).normalize('NFC')
}

export function countCodePoints(value) {
  return Array.from(String(value)).length
}

export function isCodePointLength(value, min, max) {
  if (typeof value !== 'string') return false
  const length = countCodePoints(value)
  return length >= min && length <= max
}

export function isAnonymousSender(value) {
  return typeof value === 'string' && /^Person [A-Z]$/.test(value)
}
