/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('gsap', () => ({ gsap: { fromTo: vi.fn(), to: vi.fn() } }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const roots = []
afterEach(() => act(() => roots.splice(0).forEach((root) => root.unmount())))

describe('educational demo interpretations', () => {
  it('renders each panel interpretation as hedged, context-dependent, and never a direct speaker-state assertion', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    roots.push(root)
    const DiagnosisPanel = (await import('./DiagnosisPanel')).default

    await act(async () => root.render(<DiagnosisPanel visible />))

    const interpretations = [...container.querySelectorAll('.dp-hidden-text')].map((element) => element.textContent)
    expect(interpretations).toHaveLength(4)
    for (const interpretation of interpretations) {
      expect(interpretation).toMatch(/\b(?:may|might|could)\b/i)
      expect(interpretation).toMatch(/context can change/i)
      expect(interpretation).not.toMatch(/\bI (?:am|feel|care|need)\b/i)
    }
    expect(container.textContent).toContain('possible interpretation')
    expect(container.textContent).toContain('may be incomplete or wrong')
  })
})
