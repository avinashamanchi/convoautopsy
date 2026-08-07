const PROFILE_KEY = 'convoautopsy.web.profile.v1'
const REPORTS_KEY = 'convoautopsy.web.reports.v1'
const ONBOARDED_KEY = 'convoautopsy.web.onboarded.v1'

const LEGACY_SESSION_KEY = ['ca', 'session'].join('_')
const LEGACY_REPORTS_KEY = ['ca', 'convos'].join('_')
const LEGACY_ONBOARDED_KEY = ['ca', 'onboarded'].join('_')
const LEGACY_CREDENTIALS_KEY = ['ca', 'users'].join('_')

const LOCAL_PROFILE = Object.freeze({ id: 'local', displayName: 'Local profile' })

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) ?? fallback)
  } catch {
    return fallback
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

function remove(key) {
  try {
    localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

function isMissing(key) {
  try {
    return localStorage.getItem(key) === null
  } catch {
    return true
  }
}

function ensureWritten(key, value) {
  if (!isMissing(key)) return true
  return write(key, value) && !isMissing(key)
}

export function initializeLocalProfile() {
  const existing = read(PROFILE_KEY, null)
  const legacySession = read(LEGACY_SESSION_KEY, null)
  const legacyName = typeof legacySession?.username === 'string' ? legacySession.username : null
  const legacyReports = read(LEGACY_REPORTS_KEY, {})
  const migratedReports = legacyName && Array.isArray(legacyReports?.[legacyName])
    ? legacyReports[legacyName]
    : []
  const legacyOnboarded = read(LEGACY_ONBOARDED_KEY, [])
  const migratedOnboarded = Boolean(legacyName && Array.isArray(legacyOnboarded) && legacyOnboarded.includes(legacyName))

  const profileReady = Boolean(existing) || ensureWritten(PROFILE_KEY, LOCAL_PROFILE)
  const reportsReady = ensureWritten(REPORTS_KEY, migratedReports)
  const onboardedReady = ensureWritten(ONBOARDED_KEY, migratedOnboarded)

  // Never read retired credentials, and only remove legacy data after every required
  // browser write can be read back. A later startup safely retries partial migration.
  if (profileReady && reportsReady && onboardedReady) {
    for (const key of [LEGACY_CREDENTIALS_KEY, LEGACY_SESSION_KEY, LEGACY_REPORTS_KEY, LEGACY_ONBOARDED_KEY]) remove(key)
  }
  return { ...LOCAL_PROFILE }
}

export function getConversations() {
  const reports = read(REPORTS_KEY, [])
  return Array.isArray(reports) ? reports : []
}

export function saveConversation(conversationOrLegacyProfile, maybeConversation) {
  const conversation = maybeConversation ?? conversationOrLegacyProfile
  write(REPORTS_KEY, [conversation, ...getConversations()])
}

export function deleteConversation(idOrLegacyProfile, maybeId) {
  const id = maybeId ?? idOrLegacyProfile
  write(REPORTS_KEY, getConversations().filter((conversation) => conversation.id !== id))
}

export function hasOnboarded() {
  return read(ONBOARDED_KEY, false) === true
}

export function markOnboarded() {
  write(ONBOARDED_KEY, true)
}

export function clearSession() {
  remove(LEGACY_SESSION_KEY)
}

function isAppOwnedKey(key) {
  return key.startsWith('convoautopsy.') || [
    LEGACY_CREDENTIALS_KEY,
    LEGACY_SESSION_KEY,
    LEGACY_REPORTS_KEY,
    LEGACY_ONBOARDED_KEY,
  ].includes(key)
}

export async function deleteAllWebData() {
  let keys = []
  try {
    keys = Object.keys(localStorage).filter(isAppOwnedKey)
  } catch {
    return { ok: false, failed: ['browser storage'] }
  }

  const failed = keys.filter((key) => !remove(key))
  return { ok: failed.length === 0, failed }
}
