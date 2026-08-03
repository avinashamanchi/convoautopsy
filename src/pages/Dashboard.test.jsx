/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { analysisSourceMessage } from '../utils/analysisSourceMessage'

const analyzeConversation = vi.fn()
const grantAiConsent = vi.fn()

vi.mock('../utils/storage', () => ({
  clearSession: vi.fn(),
  deleteConversation: vi.fn(),
  getConversations: vi.fn(() => []),
  hasOnboarded: vi.fn(() => true),
  saveConversation: vi.fn(),
}))

vi.mock('../utils/analyzeConversation', () => ({
  analyzeConversation,
  DEMO_RESULT: {},
  DEMO_TEXT: 'Alex: demo',
}))

vi.mock('../utils/aiConsent', () => ({
  getAiConsent: vi.fn(() => null),
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
})
