/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteAllWebData,
  getConversations,
  hasOnboarded,
  initializeLocalProfile,
} from './storage'

describe('guest-first web storage migration', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('migrates only the current legacy session without reading or retaining plaintext credentials', () => {
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
    for (const key of ['ca_users', 'ca_session', 'ca_convos', 'ca_onboarded']) {
      expect(localStorage.getItem(key)).toBeNull()
    }
    expect(localStorage.getItem('unrelated.setting')).toBe('keep')
    expect(initializeLocalProfile()).toEqual(profile)
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

  it('retains legacy data for a safe retry when a required migration write fails', () => {
    localStorage.setItem('ca_users', JSON.stringify([{ username: 'Avi', password: 'legacy' }]))
    localStorage.setItem('ca_session', JSON.stringify({ username: 'Avi' }))
    localStorage.setItem('ca_convos', JSON.stringify({ Avi: [{ id: 1, title: 'Keep me' }] }))
    localStorage.setItem('ca_onboarded', JSON.stringify(['Avi']))
    const originalSetItem = Storage.prototype.setItem
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItemWithQuotaFailure(key, value) {
      if (key === 'convoautopsy.web.reports.v1') throw new DOMException('quota', 'QuotaExceededError')
      return originalSetItem.call(this, key, value)
    })

    initializeLocalProfile()

    for (const key of ['ca_users', 'ca_session', 'ca_convos', 'ca_onboarded']) {
      expect(localStorage.getItem(key)).not.toBeNull()
    }
    setItem.mockRestore()

    initializeLocalProfile()

    expect(getConversations()).toEqual([{ id: 1, title: 'Keep me' }])
    expect(hasOnboarded()).toBe(true)
    for (const key of ['ca_users', 'ca_session', 'ca_convos', 'ca_onboarded']) {
      expect(localStorage.getItem(key)).toBeNull()
    }
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
})
