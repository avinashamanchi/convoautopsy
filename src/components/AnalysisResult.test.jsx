/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('gsap', () => ({ gsap: { fromTo: vi.fn() } }))
vi.mock('html2canvas', () => ({ default: vi.fn() }))

const roots = []
afterEach(() => act(() => roots.splice(0).forEach((root) => root.unmount())))

describe('shareable report receipt', () => {
  it('captures an explicit analysis mode and a neutral limitation', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    roots.push(root)
    const AnalysisResult = (await import('./AnalysisResult')).default
    await act(async () => root.render(<AnalysisResult result={{
      analysis_mode: 'local',
      overall_tension_score: 10,
      conflict_mode: 'Collaborating',
      messages: [{ sender: 'Person A', text: 'Hello', gottman_flag: 'Neutral', ego_state: 'Adult', hidden_meaning: 'Calm.' }],
    }} onBack={vi.fn()} />))

    expect(container.textContent).toContain('On-device estimate')
    expect(container.textContent).toContain('Automated communication estimate; not a clinical diagnosis or factual finding.')
  })
})
