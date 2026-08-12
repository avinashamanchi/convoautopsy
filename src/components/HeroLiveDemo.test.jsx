/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HeroLiveDemo from './HeroLiveDemo'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

class VisibleObserver {
  constructor(callback) { this.callback = callback }
  observe(target) { this.callback([{ isIntersecting: true, target }], this) }
  unobserve() {}
  disconnect() {}
}

let container
let root

function setReducedMotion(matches) {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

function renderDemo() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => { root.render(<HeroLiveDemo />) })
  return container
}

function button(name) {
  return [...container.querySelectorAll('button')].find((item) => item.textContent.match(name))
}

describe('ConvoAutopsy hero walkthrough', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', VisibleObserver)
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('The reviewed sample cannot use the network.') }))
    setReducedMotion(false)
  })

  afterEach(() => {
    act(() => { root?.unmount() })
    container?.remove()
    root = undefined
    container = undefined
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('autoplays only while visible and can be paused', () => {
    const view = renderDemo()
    const region = view.querySelector('[role="region"]')

    expect(region.getAttribute('aria-label')).toMatch(/conversation reflection demo/i)
    expect(region.dataset.demoStage).toBe('exchange')
    expect(button(/pause demo/i)).toBeTruthy()

    act(() => { vi.advanceTimersByTime(2400) })
    expect(region.dataset.demoStage).toBe('evidence')
    act(() => { button(/pause demo/i).click() })
    act(() => { vi.advanceTimersByTime(4800) })
    expect(region.dataset.demoStage).toBe('evidence')
  })

  it('supports direct stage inspection and replay', () => {
    const view = renderDemo()
    const region = view.querySelector('[role="region"]')

    act(() => { button(/^Estimate$/i).click() })
    expect(region.dataset.demoStage).toBe('patterns')
    expect(view.textContent).toMatch(/may resemble criticism/i)
    expect(view.textContent).toMatch(/could reflect defensiveness/i)
    expect(view.textContent).toMatch(/not.*intent/i)

    act(() => { button(/replay/i).click() })
    expect(region.dataset.demoStage).toBe('exchange')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('shows the complete response option without autoplay for reduced motion', () => {
    setReducedMotion(true)
    const view = renderDemo()

    expect(view.querySelector('[role="region"]').dataset.demoStage).toBe('response')
    expect(view.textContent).toMatch(/response option/i)
    expect(view.textContent).toMatch(/review and edit/i)
    expect(vi.getTimerCount()).toBe(0)
  })
})
