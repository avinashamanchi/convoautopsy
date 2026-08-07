export const AI_CONSENT_VERSION = '2026-08-07'

const CONSENT_KEY = 'convoautopsy.ai-consent.v1'
const INSTALLATION_TOKEN_KEY = 'convoautopsy.installation-token.v1'

function readStorage(key) {
  try { return localStorage.getItem(key) }
  catch { return null }
}

function writeStorage(key, value) {
  try { localStorage.setItem(key, value); return true }
  catch { return false }
}

export function getAiConsent() {
  try {
    const consent = JSON.parse(readStorage(CONSENT_KEY))
    const installationToken = readStorage(INSTALLATION_TOKEN_KEY)
    if (consent?.version !== AI_CONSENT_VERSION || typeof consent.grantedAt !== 'string' || !/^[A-Za-z0-9_-]{16,256}$/.test(installationToken || '')) return null
    return { version: AI_CONSENT_VERSION, grantedAt: consent.grantedAt, installationToken }
  } catch { return null }
}

export function grantAiConsent() {
  const existing = getAiConsent()
  const installationToken = existing?.installationToken || globalThis.crypto?.randomUUID?.()
  if (!installationToken) return null
  const consent = { version: AI_CONSENT_VERSION, grantedAt: new Date().toISOString() }
  if (!writeStorage(INSTALLATION_TOKEN_KEY, installationToken) || !writeStorage(CONSENT_KEY, JSON.stringify(consent))) return null
  return { ...consent, installationToken }
}
