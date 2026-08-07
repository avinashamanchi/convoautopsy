/** @vitest-environment jsdom */

import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AI_CONSENT_VERSION, getAiConsent, grantAiConsent } from './aiConsent'

describe('web AI consent contract', () => {
  let storageWindow

  beforeEach(() => {
    storageWindow = new JSDOM('', { url: 'https://convoautopsy.test' }).window
    vi.stubGlobal('localStorage', storageWindow.localStorage)
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    storageWindow.close()
  })

  it('uses the Worker consent version and rejects the retired browser consent', () => {
    localStorage.setItem('convoautopsy.installation-token.v1', 'installation-token-0001')
    localStorage.setItem('convoautopsy.ai-consent.v1', JSON.stringify({
      version: '2026-08-07',
      grantedAt: '2026-08-07T00:00:00.000Z',
    }))

    expect(AI_CONSENT_VERSION).toBe('2026-08-07.2')
    expect(getAiConsent()).toBeNull()
  })

  it('persists only the current consent version', () => {
    const granted = grantAiConsent()

    expect(granted).toMatchObject({ version: '2026-08-07.2' })
    expect(JSON.parse(localStorage.getItem('convoautopsy.ai-consent.v1'))).toMatchObject({ version: '2026-08-07.2' })
  })
})
