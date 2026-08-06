/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { analysisSourceMessage } from '../utils/analysisSourceMessage'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const analyzeConversation = vi.fn()
const grantAiConsent = vi.fn()
const getAiConsent = vi.fn(() => null)
const getConversations = vi.fn(() => [])
const saveConversation = vi.fn()
const clearSession = vi.fn()

vi.mock('../utils/storage', () => ({
  clearSession,
  deleteConversation: vi.fn(),
  getConversations,
  hasOnboarded: vi.fn(() => true),
  saveConversation,
}))

vi.mock('../utils/analyzeConversation', () => ({
  analyzeConversation,
  DEMO_RESULT: {},
  DEMO_TEXT: 'Alex: demo',
}))

vi.mock('../utils/aiConsent', () => ({
  getAiConsent,
  grantAiConsent,
}))

vi.mock('../components/AnalysisResult', () => ({ default: () => <div>Result</div> }))
vi.mock('../components/Onboarding', () => ({ default: () => null }))
vi.mock('../components/ResponseCrafter', () => ({ default: () => null }))
vi.mock('../components/AiConsentModal', () => ({
  default: ({ onAgree }) => <button onClick={onAgree}>Agree and continue</button>,
}))

const roots = []

afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  getAiConsent.mockReturnValue(null)
  getConversations.mockReturnValue([])
})

function renderDashboard() {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  return { container, root }
}

function setTextareaValue(textarea, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  setter.call(textarea, value)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('analysisSourceMessage', () => {
  it('distinguishes a missing AI configuration from a remote outage', () => {
    expect(analysisSourceMessage('local', 'NOT_CONFIGURED')).toBe('AI-assisted analysis is not configured—showing the on-device estimate.')
    expect(analysisSourceMessage('local', 'REMOTE_UNAVAILABLE')).toBe('AI service unavailable—showing the on-device estimate.')
  })

  it('does not mislabel intentional local or consent-declined analysis as an outage', () => {
    expect(analysisSourceMessage('local', 'LOCAL_REQUESTED')).toBe('On-device estimate.')
    expect(analysisSourceMessage('local', null)).toBe('On-device estimate.')
    expect(analysisSourceMessage('ai', null)).toBe('AI-assisted analysis')
  })

  it('keeps the conversation on-device with a distinct message when consent persistence fails', async () => {
    grantAiConsent.mockReturnValue(null)
    analyzeConversation.mockResolvedValue({
      result: { messages: [{ sender: 'Person A' }], analysis_mode: 'local' },
      source: 'local',
      fallbackReason: 'NOT_CONFIGURED',
    })
    const { container, root } = renderDashboard()
    const Dashboard = (await import('./Dashboard')).default

    await act(async () => { root.render(<Dashboard user={{ username: 'avi' }} onLogout={vi.fn()} />) })
    const textarea = container.querySelector('textarea')
    await act(async () => { setTextareaValue(textarea, 'Alex: Hello') })
    await act(async () => { container.querySelector('.dash-analyze-btn').click() })
    const agree = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Agree and continue')
    await act(async () => { agree.click() })

    expect(grantAiConsent).toHaveBeenCalledTimes(1)
    expect(analyzeConversation).toHaveBeenCalledWith(
      'Alex: Hello',
      expect.objectContaining({ allowRemote: false, localReason: 'CONSENT_STORAGE_UNAVAILABLE' }),
    )
    expect(container.textContent).toContain('AI consent could not be saved—showing the on-device estimate.')
  })

  it('shows a Unicode-aware 100,000-character counter and rejects larger input before consent', async () => {
    const { container, root } = renderDashboard()
    const Dashboard = (await import('./Dashboard')).default
    await act(async () => { root.render(<Dashboard user={{ username: 'avi' }} onLogout={vi.fn()} />) })
    const textarea = container.querySelector('textarea')

    await act(async () => { setTextareaValue(textarea, '🫠'.repeat(100_001)) })
    expect(container.textContent).toContain('100,001 of 100,000 characters')
    await act(async () => { container.querySelector('.dash-analyze-btn').click() })

    expect(container.textContent).toContain('Conversation must be 100,000 characters or fewer')
    expect(grantAiConsent).not.toHaveBeenCalled()
    expect(analyzeConversation).not.toHaveBeenCalled()
  })

  it('invalidates a deferred analysis when the user starts a new analysis', async () => {
    getAiConsent.mockReturnValue({ version: '2026-08-02', installationToken: 'installation-token-0001' })
    let resolveAnalysis
    analyzeConversation.mockImplementation(() => new Promise((resolve) => { resolveAnalysis = resolve }))
    const { container, root } = renderDashboard()
    const Dashboard = (await import('./Dashboard')).default
    await act(async () => { root.render(<Dashboard user={{ username: 'avi' }} onLogout={vi.fn()} />) })
    const textarea = container.querySelector('textarea')
    await act(async () => { setTextareaValue(textarea, 'Alex: Hello') })
    await act(async () => { container.querySelector('.dash-analyze-btn').click() })

    await act(async () => { container.querySelector('.dash-new-btn').click() })
    await act(async () => {
      resolveAnalysis({ result: { messages: [{ sender: 'Person A' }], analysis_mode: 'ai' }, source: 'ai', fallbackReason: null })
      await Promise.resolve()
    })

    expect(saveConversation).not.toHaveBeenCalled()
    expect(container.querySelector('.dash-input-view')).not.toBeNull()
  })

  it('invalidates a deferred analysis before logout', async () => {
    getAiConsent.mockReturnValue({ version: '2026-08-02', installationToken: 'installation-token-0001' })
    let resolveAnalysis
    analyzeConversation.mockImplementation(() => new Promise((resolve) => { resolveAnalysis = resolve }))
    const onLogout = vi.fn()
    const { container, root } = renderDashboard()
    const Dashboard = (await import('./Dashboard')).default
    await act(async () => { root.render(<Dashboard user={{ username: 'avi' }} onLogout={onLogout} />) })
    await act(async () => { setTextareaValue(container.querySelector('textarea'), 'Alex: Hello') })
    await act(async () => { container.querySelector('.dash-analyze-btn').click() })
    await act(async () => { container.querySelector('.dash-logout').click() })
    await act(async () => {
      resolveAnalysis({ result: { messages: [{ sender: 'Person A' }], analysis_mode: 'ai' }, source: 'ai', fallbackReason: null })
      await Promise.resolve()
    })

    expect(clearSession).toHaveBeenCalledTimes(1)
    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(saveConversation).not.toHaveBeenCalled()
  })

  it('invalidates a deferred analysis when history selection changes the active report', async () => {
    getAiConsent.mockReturnValue({ version: '2026-08-02', installationToken: 'installation-token-0001' })
    getConversations.mockReturnValue([{
      id: 1,
      timestamp: Date.now(),
      title: 'Saved report',
      text: 'Person A: Saved',
      source: 'local',
      result: { overall_tension_score: 10, messages: [{ sender: 'Person A' }] },
    }])
    let resolveAnalysis
    analyzeConversation.mockImplementation(() => new Promise((resolve) => { resolveAnalysis = resolve }))
    const { container, root } = renderDashboard()
    const Dashboard = (await import('./Dashboard')).default
    await act(async () => { root.render(<Dashboard user={{ username: 'avi' }} onLogout={vi.fn()} />) })
    await act(async () => { setTextareaValue(container.querySelector('textarea'), 'Alex: Hello') })
    await act(async () => { container.querySelector('.dash-analyze-btn').click() })

    await act(async () => { container.querySelector('.dash-convo-item').click() })
    await act(async () => {
      resolveAnalysis({ result: { messages: [{ sender: 'Person A' }], analysis_mode: 'ai' }, source: 'ai', fallbackReason: null })
      await Promise.resolve()
    })

    expect(saveConversation).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Result')
  })

  it('rejects imported files above the 100,000-character limit', async () => {
    const oversizedText = '🫠'.repeat(100_001)
    const readAsText = vi.fn(function readFixture() {
      this.onload?.({ target: { result: oversizedText } })
    })
    class ImmediateFileReader {
      readAsText = readAsText
    }
    vi.stubGlobal('FileReader', ImmediateFileReader)
    const { container, root } = renderDashboard()
    const Dashboard = (await import('./Dashboard')).default
    await act(async () => { root.render(<Dashboard user={{ username: 'avi' }} onLogout={vi.fn()} />) })
    const input = container.querySelector('input[type="file"]')
    const file = new File(['test fixture'], 'conversation.txt', { type: 'text/plain' })
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })

    await act(async () => {
      input.dispatchEvent(new window.Event('change', { bubbles: true }))
      expect(readAsText).toHaveBeenCalledWith(file)
    })

    expect(container.textContent).toContain('Conversation must be 100,000 characters or fewer')
    expect(container.querySelector('textarea').value).toBe('')
  })
})
