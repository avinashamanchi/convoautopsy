export const AI_CONSENT_VERSION = '2026-08-02'

const CONSENT_KEY = 'convoautopsy.ai-consent.v1'
const INSTALLATION_TOKEN_KEY = 'convoautopsy.installation-token.v1'

function readStorage(key) {
  try { return localStorage.getItem(key) }
  catch { return null }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function getAiConsent() {
  try {
    const consent = JSON.parse(readStorage(CONSENT_KEY))
    const installationToken = readStorage(INSTALLATION_TOKEN_KEY)
    if (consent?.version !== AI_CONSENT_VERSION || typeof consent.grantedAt !== 'string' || !/^[A-Za-z0-9_-]{16,256}$/.test(installationToken || '')) return null
    return { version: AI_CONSENT_VERSION, grantedAt: consent.grantedAt, installationToken }
  } catch {
    return null
  }
}

export function grantAiConsent() {
  const existing = getAiConsent()
  const installationToken = existing?.installationToken || globalThis.crypto?.randomUUID?.()
  if (!installationToken) return null
  const consent = { version: AI_CONSENT_VERSION, grantedAt: new Date().toISOString() }
  if (!writeStorage(INSTALLATION_TOKEN_KEY, installationToken) || !writeStorage(CONSENT_KEY, JSON.stringify(consent))) return null
  return { ...consent, installationToken }
}

export default function AiConsentModal({ onAgree, onDecline, isRunning }) {
  return (
    <div className="ai-consent-backdrop" role="presentation">
      <div className="ai-consent-modal" role="dialog" aria-modal="true" aria-labelledby="ai-consent-title">
        <h2 id="ai-consent-title">Before AI-assisted analysis</h2>
        <p>Names are replaced with Person labels. Message text is sent to Groq through ConvoAutopsy&apos;s server. ConvoAutopsy does not intentionally store that text. Automated output can be wrong. On-device analysis is available without sharing.</p>
        <div className="ai-consent-actions">
          <button onClick={onAgree} disabled={isRunning}>{isRunning ? 'Starting AI analysis…' : 'Agree and continue'}</button>
          <button onClick={onDecline} disabled={isRunning}>Use on-device analysis</button>
        </div>
      </div>
    </div>
  )
}
