/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const craftResponse = vi.fn()

vi.mock('../utils/craftResponse', () => ({
  craftResponse,
  GOAL_OPTIONS: [{ id: 'resolve', label: 'Resolve it', icon: 'R' }],
  TONE_OPTIONS: [{ id: 'empathetic', label: 'Empathetic', icon: 'E' }],
  getPersonSenders: (result) => [...new Set(result.messages.map((message) => message.sender))],
}))
vi.mock('../utils/aiConsent', () => ({ getAiConsent: () => null }))

const result = { messages: [{ sender: 'Person A', text: 'Hello' }] }
const roots = []

afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  vi.clearAllMocks()
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
})
