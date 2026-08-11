/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import {
  deleteAllWebData,
  deleteConversation,
  getConversations,
  getLegacyRecoveryStatus,
  hasOnboarded,
  initializeLocalProfile,
  saveConversation,
} from './storage'

const RECOVERY_KEY = 'convoautopsy.web.legacy-recovery.v1'

describe('guest-first web storage migration', () => {
  let storageWindow

  beforeEach(() => {
    storageWindow = new JSDOM('', { url: 'https://convoautopsy.test' }).window
    vi.stubGlobal('Storage', storageWindow.Storage)
    vi.stubGlobal('localStorage', storageWindow.localStorage)
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    storageWindow.close()
  })

  it('migrates only the selected legacy session and preserves every profile bucket in a recovery envelope without reading credentials', () => {
    localStorage.setItem('ca_users', JSON.stringify([
      { username: 'Avi', password: 'MARKER_PLAINTEXT_PASSWORD' },
    ]))
    localStorage.setItem('ca_session', JSON.stringify({ username: 'Avi' }))
    localStorage.setItem('ca_convos', JSON.stringify({
      Avi: [{ id: 1, title: 'Current session report' }],
      Other: [{ id: 2, title: 'Other profile report' }],
    }))
    localStorage.setItem('ca_onboarded', JSON.stringify(['Avi', 'Other']))
    localStorage.setItem('unrelated.setting', 'keep')
    const getItem = vi.spyOn(Storage.prototype, 'getItem')

    const profile = initializeLocalProfile()

    expect(profile).toEqual({ id: 'local', displayName: 'Local profile' })
    expect(getItem).not.toHaveBeenCalledWith('ca_users')
    expect(getConversations()).toEqual([{ id: 1, title: 'Current session report' }])
    expect(hasOnboarded()).toBe(true)
    expect(JSON.stringify(localStorage)).not.toContain('MARKER_PLAINTEXT_PASSWORD')
    expect(JSON.parse(localStorage.getItem(RECOVERY_KEY))).toMatchObject({
      schemaVersion: 1,
      selectedProfile: 'Avi',
      reportBuckets: {
        Avi: [{ id: 1, title: 'Current session report' }],
        Other: [{ id: 2, title: 'Other profile report' }],
      },
      migration: {
        migratedReportIndexes: [0],
        preservedOnlyReportIndexes: [],
      },
    })
    for (const key of ['ca_users', 'ca_session', 'ca_convos', 'ca_onboarded']) {
      expect(localStorage.getItem(key)).toBeNull()
    }
    expect(localStorage.getItem('unrelated.setting')).toBe('keep')
    expect(initializeLocalProfile()).toEqual(profile)
    expect(getConversations()).toEqual([{ id: 1, title: 'Current session report' }])
  })

  it('preserves every legacy bucket without cross-exposing reports when there is no selected session', () => {
    localStorage.setItem('ca_convos', JSON.stringify({
      Avi: [{ id: 1, title: 'Avi private report' }],
      Other: [{ id: 2, title: 'Other private report' }],
    }))
    localStorage.setItem('ca_onboarded', JSON.stringify(['Avi', 'Other']))

    initializeLocalProfile()

    expect(getConversations()).toEqual([])
    expect(JSON.parse(localStorage.getItem(RECOVERY_KEY))).toMatchObject({
      schemaVersion: 1,
      selectedProfile: null,
      reportBuckets: {
        Avi: [{ id: 1, title: 'Avi private report' }],
        Other: [{ id: 2, title: 'Other private report' }],
      },
      migration: { migratedReportIndexes: [], preservedOnlyReportIndexes: [] },
    })
    expect(localStorage.getItem('ca_convos')).toBeNull()
    expect(localStorage.getItem('ca_onboarded')).toBeNull()
  })

  it('does not overwrite a current report when a selected legacy report has the same id', () => {
    localStorage.setItem('convoautopsy.web.reports.v1', JSON.stringify([
      { id: 7, title: 'Current report' },
    ]))
    localStorage.setItem('ca_session', JSON.stringify({ username: 'Avi' }))
    localStorage.setItem('ca_convos', JSON.stringify({
      Avi: [{ id: 7, title: 'Legacy collision' }],
      Other: [{ id: 8, title: 'Other profile report' }],
    }))

    initializeLocalProfile()

    expect(getConversations()).toEqual([{ id: 7, title: 'Current report' }])
    expect(JSON.parse(localStorage.getItem(RECOVERY_KEY))).toMatchObject({
      reportBuckets: {
        Avi: [{ id: 7, title: 'Legacy collision' }],
        Other: [{ id: 8, title: 'Other profile report' }],
      },
      migration: { migratedReportIndexes: [], preservedOnlyReportIndexes: [0] },
    })
    expect(localStorage.getItem('ca_convos')).toBeNull()
  })

  it('keeps guest startup available when browser storage reads are blocked', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    getItem.mockClear()

    expect(() => initializeLocalProfile()).not.toThrow()
    expect(getItem).not.toHaveBeenCalledWith('ca_users')
    getItem.mockRestore()
  })

  it.each([
    ['quota throws', function quotaFailure(key, value, originalSetItem) {
      if (key === RECOVERY_KEY) throw new DOMException('quota', 'QuotaExceededError')
      return originalSetItem.call(this, key, value)
    }],
    ['the browser silently denies the exact write', function deniedWrite(key, value, originalSetItem) {
      if (key === RECOVERY_KEY) return undefined
      return originalSetItem.call(this, key, value)
    }],
  ])('retains all legacy sources when %s', (_label, failWrite) => {
    localStorage.setItem('ca_users', JSON.stringify([{ username: 'Avi', password: 'legacy' }]))
    localStorage.setItem('ca_session', JSON.stringify({ username: 'Avi' }))
    localStorage.setItem('ca_convos', JSON.stringify({ Avi: [{ id: 1, title: 'Keep me' }] }))
    localStorage.setItem('ca_onboarded', JSON.stringify(['Avi']))
    const originalSetItem = Storage.prototype.setItem
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItemWithQuotaFailure(key, value) {
      return failWrite.call(this, key, value, originalSetItem)
    })

    initializeLocalProfile()

    for (const key of ['ca_users', 'ca_session', 'ca_convos', 'ca_onboarded']) {
      expect(localStorage.getItem(key)).not.toBeNull()
    }
    expect(localStorage.getItem(RECOVERY_KEY)).toBeNull()
    setItem.mockRestore()
  })

  it('keeps every legacy source when a source is malformed instead of deleting unpreserved reports', () => {
    localStorage.setItem('ca_users', 'legacy-credential-source')
    localStorage.setItem('ca_session', JSON.stringify({ username: 'Avi' }))
    localStorage.setItem('ca_convos', '{"Avi":[')
    localStorage.setItem('ca_onboarded', JSON.stringify(['Avi']))

    initializeLocalProfile()

    expect(localStorage.getItem(RECOVERY_KEY)).toBeNull()
    for (const key of ['ca_users', 'ca_session', 'ca_convos', 'ca_onboarded']) {
      expect(localStorage.getItem(key)).not.toBeNull()
    }
    expect(getConversations()).toEqual([])
  })

  it('surfaces a malformed recovery envelope instead of silently hiding preserved legacy data', () => {
    localStorage.setItem(RECOVERY_KEY, '{"schemaVersion":1,"reportBuckets":')

    expect(getLegacyRecoveryStatus()).toMatchObject({
      available: false,
      needsAttention: true,
    })
    expect(localStorage.getItem(RECOVERY_KEY)).not.toBeNull()
  })

  it('retries a partial source deletion idempotently without duplicating the migrated report', () => {
    localStorage.setItem('ca_users', JSON.stringify([{ username: 'Avi', password: 'legacy' }]))
    localStorage.setItem('ca_session', JSON.stringify({ username: 'Avi' }))
    localStorage.setItem('ca_convos', JSON.stringify({ Avi: [{ id: 1, title: 'Keep once' }] }))
    localStorage.setItem('ca_onboarded', JSON.stringify(['Avi']))
    const originalRemoveItem = Storage.prototype.removeItem
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function failReportsDeleteOnce(key) {
      if (key === 'ca_convos') throw new DOMException('locked', 'SecurityError')
      return originalRemoveItem.call(this, key)
    })

    initializeLocalProfile()

    expect(localStorage.getItem('ca_convos')).not.toBeNull()
    expect(getConversations()).toEqual([{ id: 1, title: 'Keep once' }])
    removeItem.mockRestore()

    initializeLocalProfile()

    expect(getConversations()).toEqual([{ id: 1, title: 'Keep once' }])
    for (const key of ['ca_users', 'ca_session', 'ca_convos', 'ca_onboarded']) {
      expect(localStorage.getItem(key)).toBeNull()
    }
  })

  it('does not resurrect a committed migration when legacy source removal was silently denied', () => {
    localStorage.setItem('ca_session', JSON.stringify({ username: 'Avi' }))
    localStorage.setItem('ca_convos', JSON.stringify({ Avi: [{ id: 6, title: 'Delete after migration' }] }))
    const originalRemoveItem = Storage.prototype.removeItem
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function silentlyKeepReports(key) {
      if (key === 'ca_convos') return undefined
      return originalRemoveItem.call(this, key)
    })

    initializeLocalProfile()

    expect(getConversations()).toEqual([{ id: 6, title: 'Delete after migration' }])
    expect(JSON.parse(localStorage.getItem(RECOVERY_KEY)).migration.committed).toBe(true)
    expect(deleteConversation(6)).toBe(true)
    removeItem.mockRestore()

    initializeLocalProfile()

    expect(getConversations()).toEqual([])
    expect(localStorage.getItem('ca_convos')).toBeNull()
  })

  it('surfaces a retired credential key that could not be removed without reading its value', () => {
    localStorage.setItem('ca_users', 'never-read-this-secret')
    const originalRemoveItem = Storage.prototype.removeItem
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function silentlyKeepCredentials(key) {
      if (key === 'ca_users') return undefined
      return originalRemoveItem.call(this, key)
    })
    const getItem = vi.spyOn(Storage.prototype, 'getItem')

    initializeLocalProfile()
    expect(getLegacyRecoveryStatus()).toMatchObject({ available: false, needsAttention: true })
    expect(getItem).not.toHaveBeenCalledWith('ca_users')

    removeItem.mockRestore()
  })

  it('does not resurrect a migrated legacy report after the user deletes it', () => {
    localStorage.setItem('ca_session', JSON.stringify({ username: 'Avi' }))
    localStorage.setItem('ca_convos', JSON.stringify({ Avi: [{ id: 7, title: 'Delete permanently' }] }))

    initializeLocalProfile()
    expect(getConversations()).toHaveLength(1)
    expect(deleteConversation(7)).toBe(true)
    expect(getConversations()).toEqual([])

    initializeLocalProfile()

    expect(getConversations()).toEqual([])
  })

  it('fails closed without writing when a report-list read is transiently blocked during one-report deletion', () => {
    const reports = [{ id: 1, title: 'Delete me' }, { id: 2, title: 'Keep me' }]
    localStorage.setItem('convoautopsy.web.reports.v1', JSON.stringify(reports))
    const originalGetItem = Storage.prototype.getItem
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function failReportRead(key) {
      if (key === 'convoautopsy.web.reports.v1') throw new DOMException('blocked once', 'SecurityError')
      return originalGetItem.call(this, key)
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    expect(deleteConversation(1)).toBe(false)
    expect(setItem).not.toHaveBeenCalledWith('convoautopsy.web.reports.v1', expect.anything())

    getItem.mockRestore()
    expect(getConversations()).toEqual(reports)
  })

  it('fails closed without replacing malformed report storage during one-report deletion', () => {
    const malformed = '{"id":1}'
    localStorage.setItem('convoautopsy.web.reports.v1', malformed)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    expect(deleteConversation(1)).toBe(false)
    expect(setItem).not.toHaveBeenCalledWith('convoautopsy.web.reports.v1', expect.anything())
    expect(localStorage.getItem('convoautopsy.web.reports.v1')).toBe(malformed)
  })

  it.each([
    ['quota', () => { throw new DOMException('quota', 'QuotaExceededError') }],
    ['denied write', () => undefined],
  ])('returns a verified failure instead of durable save success when report persistence is %s', (_label, failWrite) => {
    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function failReportWrite(key, value) {
      if (key === 'convoautopsy.web.reports.v1') return failWrite()
      return originalSetItem.call(this, key, value)
    })

    expect(saveConversation({ id: 44, title: 'Unsaved' })).toMatchObject({
      ok: false,
      error: 'PERSISTENCE_FAILED',
    })
    expect(getConversations()).toEqual([])
  })

  it('returns a verified persistence result only after the exact report list can be read back', () => {
    const conversation = { id: 45, title: 'Saved exactly' }

    expect(saveConversation(conversation)).toEqual({
      ok: true,
      conversation,
      reports: [conversation],
    })
    expect(getConversations()).toEqual([conversation])
  })

  it('makes retry idempotent when a report write persisted but its first readback was uncertain', () => {
    const conversation = { id: 46, title: 'Persist exactly once' }
    const originalGetItem = Storage.prototype.getItem
    const originalSetItem = Storage.prototype.setItem
    let failNextReportRead = false
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function failOneReadback(key) {
      if (key === 'convoautopsy.web.reports.v1' && failNextReportRead) {
        failNextReportRead = false
        throw new DOMException('transient readback failure', 'SecurityError')
      }
      return originalGetItem.call(this, key)
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function persistThenHideReadback(key, value) {
      const result = originalSetItem.call(this, key, value)
      if (key === 'convoautopsy.web.reports.v1') failNextReportRead = true
      return result
    })

    expect(saveConversation(conversation)).toMatchObject({ ok: false, error: 'PERSISTENCE_FAILED' })
    getItem.mockRestore()
    setItem.mockRestore()

    expect(saveConversation(conversation)).toMatchObject({ ok: true })
    expect(getConversations()).toEqual([conversation])
  })

  it('deletes every app-owned browser artifact while preserving unrelated site storage', async () => {
    for (const [key, value] of [
      ['convoautopsy.web.profile.v1', '{}'],
      ['convoautopsy.web.reports.v1', '[]'],
      ['convoautopsy.web.onboarded.v1', 'true'],
      ['convoautopsy.ai-consent.v1', '{}'],
      ['convoautopsy.installation-token.v1', 'token'],
      ['convoautopsy.cache.preview.v1', 'cached'],
      ['ca_users', 'legacy'],
      ['unrelated.setting', 'keep'],
    ]) localStorage.setItem(key, value)

    await expect(deleteAllWebData()).resolves.toEqual({ ok: true, failed: [] })

    expect(Object.keys(localStorage).sort()).toEqual(['unrelated.setting'])
  })

  it('reports a partial deletion and supports a retry instead of claiming success', async () => {
    localStorage.setItem('convoautopsy.web.reports.v1', '[]')
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem')
      .mockImplementationOnce(() => { throw new Error('locked') })

    await expect(deleteAllWebData()).resolves.toMatchObject({ ok: false, failed: expect.any(Array) })

    removeItem.mockRestore()
    await expect(deleteAllWebData()).resolves.toEqual({ ok: true, failed: [] })
  })

  it('reports a silently retained credential during Delete All without reading its value', async () => {
    localStorage.setItem('ca_users', 'retired-secret-must-not-be-read')
    const originalRemoveItem = Storage.prototype.removeItem
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function silentlyRetainCredential(key) {
      if (key === 'ca_users') return undefined
      return originalRemoveItem.call(this, key)
    })
    const getItem = vi.spyOn(Storage.prototype, 'getItem')

    await expect(deleteAllWebData()).resolves.toEqual({ ok: false, failed: ['ca_users'] })
    expect(getItem).not.toHaveBeenCalledWith('ca_users')
    expect(Object.keys(localStorage)).toContain('ca_users')

    removeItem.mockRestore()
  })
})
