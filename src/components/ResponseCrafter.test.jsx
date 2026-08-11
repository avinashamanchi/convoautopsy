/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const craftResponse = vi.fn()
const getAiConsent = vi.fn()
const prepareResponseReview = vi.fn((params) => ({
  participants: [],
  sender: params.sender,
  goal: params.goal,
  tone: params.tone,
  analysis: { schemaVersion: 1, mode: 'ai', intensityScore: 1, conflictMode: 'Collaborating' },
  messages: params.result.messages.map((message) => ({
    sender: message.sender,
    text: message.text,
    pattern: 'Neutral',
    egoState: 'Adult',
    possibleInterpretation: message.hidden_meaning || 'Possible interpretation.',
  })),
}))

vi.mock('../utils/craftResponse', () => ({
  craftResponse,
  GOAL_OPTIONS: [{ id: 'resolve', label: 'Resolve it', icon: 'R' }],
  TONE_OPTIONS: [{ id: 'empathetic', label: 'Empathetic', icon: 'E' }],
  getPersonSenders: (result) => [...new Set(result.messages.map((message) => message.sender))],
  prepareResponseReview,
}))
vi.mock('../utils/aiConsent', () => ({ getAiConsent }))

const result = { messages: [{ sender: 'Person A', text: 'Hello', hidden_meaning: 'This may be a greeting.' }] }
const roots = []

afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  vi.clearAllMocks()
  getAiConsent.mockReturnValue(null)
  vi.unstubAllGlobals()
})

async function renderCrafter(props = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  const Component = (await import('./ResponseCrafter')).default
  await act(async () => { root.render(<Component result={result} conversationText="A: Hello" {...props} />) })
  return { container, root, Component }
}

async function chooseAll(container) {
  for (const label of ['Person A', 'Resolve it', 'Empathetic']) {
    const button = [...container.querySelectorAll('button')].find((item) => item.textContent.includes(label))
    await act(async () => { button.click() })
  }
}

describe('ResponseCrafter request lifecycle', () => {
  it('drops a deferred result after its report props change', async () => {
    let resolveRequest
    craftResponse.mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve }))
    const { container, root, Component } = await renderCrafter()
    await chooseAll(container)

    await act(async () => {
      root.render(<Component result={{ messages: [{ sender: 'Person B', text: 'New' }] }} conversationText="B: New" />)
    })
    await act(async () => {
      resolveRequest({ drafts: [{ id: 'old', text: 'Stale response', hint: 'Old' }], source: 'local' })
      await Promise.resolve()
    })

    expect(container.textContent).not.toContain('Stale response')
    expect(container.textContent).toContain('Person B')
  })

  it('shows copied state only after clipboard success', async () => {
    craftResponse.mockResolvedValue({ drafts: [{ id: 'd', text: 'Draft text', hint: 'Hint' }], source: 'local' })
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    const { container } = await renderCrafter()
    await chooseAll(container)
    const copy = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Copy')
    await act(async () => { copy.click(); await Promise.resolve() })

    expect(container.textContent).not.toContain('Copied!')
    expect(container.textContent).toContain('Copy failed')
  })

  it('reviews every response free-text field before dispatch and binds the confirmed snapshot', async () => {
    getAiConsent.mockReturnValue({ version: '2026-08-07.2', installationToken: 'installation-token-0001' })
    craftResponse.mockResolvedValue({ drafts: [{ id: 'd', text: 'Draft text', hint: 'Hint' }], source: 'ai' })
    const { container } = await renderCrafter()
    await chooseAll(container)

    expect(craftResponse).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Review exact text sent for AI')
    expect(container.textContent).toContain('Person A')
    expect(container.textContent).toContain('resolve')
    expect(container.textContent).toContain('empathetic')
    expect(container.textContent).toMatch(/analysis mode\s*ai/i)
    expect(container.textContent).toMatch(/intensity score\s*1/i)
    expect(container.textContent).toMatch(/conflict mode\s*Collaborating/i)
    expect(container.textContent).toMatch(/pattern\s*Neutral/i)
    expect(container.textContent).toMatch(/ego state\s*Adult/i)
    expect(container.textContent).toMatch(/installation token.*identifier values.*not displayed/is)
    expect(container.textContent).not.toContain('installation-token-0001')
    expect(container.querySelector('[aria-label="Outgoing text for Person A message 1"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Outgoing possible interpretation for Person A message 1"]')).not.toBeNull()

    const confirm = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Confirm exact data')
    await act(async () => { confirm.click(); await Promise.resolve() })

    expect(craftResponse).toHaveBeenCalledTimes(1)
    expect(craftResponse.mock.calls[0][1]).toMatchObject({ reviewedSnapshot: expect.any(Object) })
  })

  it('explains a remote response limit fallback instead of labeling it only as on-device', async () => {
    getAiConsent.mockReturnValue({ version: '2026-08-07.2', installationToken: 'installation-token-0001' })
    craftResponse.mockResolvedValue({ drafts: [{ id: 'd', text: 'Local draft', hint: 'Local' }], source: 'local', fallbackReason: 'REMOTE_INPUT_LIMIT' })
    const { container } = await renderCrafter()
    await chooseAll(container)
    const confirm = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Confirm exact data')

    await act(async () => { confirm.click(); await Promise.resolve() })

    expect(container.textContent).toMatch(/Remote AI accepts up to 10 messages.*280 characters.*150 characters.*showing on-device drafts/i)
  })
})
