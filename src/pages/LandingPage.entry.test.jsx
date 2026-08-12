/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const animation = vi.hoisted(() => {
  const timeline = { fromTo: vi.fn() }
  timeline.fromTo.mockReturnValue(timeline)
  return {
    gsap: {
      registerPlugin: vi.fn(),
      timeline: vi.fn(() => timeline),
      context: vi.fn((callback) => { callback(); return { revert: vi.fn() } }),
      fromTo: vi.fn(),
      utils: { toArray: vi.fn(() => []) },
    },
    ScrollTrigger: { create: vi.fn() },
  }
})

vi.mock('gsap', () => ({ gsap: animation.gsap }))
vi.mock('gsap/ScrollTrigger', () => ({ ScrollTrigger: animation.ScrollTrigger }))
vi.mock('@react-three/fiber', () => ({ Canvas: () => <div data-canvas-fallback /> }))
vi.mock('../components/PhoneScene', () => ({ default: () => null }))

import LandingPage from './LandingPage'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

class HiddenObserver {
  constructor(callback) { this.callback = callback }
  observe(target) { this.callback([{ isIntersecting: false, target }], this) }
  unobserve() {}
  disconnect() {}
}

let container
let root

function renderLanding(overrides = {}) {
  const onGetStarted = vi.fn()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root.render(
      <LandingPage
        user={null}
        onGetStarted={onGetStarted}
        onGoToDashboard={vi.fn()}
        {...overrides}
      />,
    )
  })
  return { container, onGetStarted }
}

function findLink(name) {
  return [...container.querySelectorAll('a')].find((item) => item.textContent.trim() === name)
}

function findButton(name) {
  return [...container.querySelectorAll('button')].find((item) => item.textContent.match(name))
}

describe('ConvoAutopsy public entry', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', HiddenObserver)
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  })

  afterEach(() => {
    act(() => { root?.unmount() })
    container?.remove()
    root = undefined
    container = undefined
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('offers direct demo, method, privacy, support, and sample navigation', () => {
    renderLanding()
    const nav = container.querySelector('nav[aria-label="Primary navigation"]')

    expect(nav).toBeTruthy()
    expect(findLink('Demo')?.getAttribute('href')).toBe('#demo')
    expect(findLink('Method')?.getAttribute('href')).toBe('#method')
    expect(findLink('Privacy')?.getAttribute('href')).toBe('#privacy')
    expect(findLink('Support')?.getAttribute('href')).toBe('https://avinashamanchi.github.io/convoautopsy/support.html')
    expect(findButton(/analyze a sample/i)).toBeTruthy()
  })

  it('places the complete non-diagnostic walkthrough in the hero', () => {
    renderLanding()
    const hero = container.querySelector('.lp-hero')

    expect(hero.querySelector('[aria-label="Conversation reflection demo"]')).toBeTruthy()
    expect(hero.textContent).toMatch(/educational estimate/i)
    expect(hero.textContent).toMatch(/cannot determine intent/i)
  })

  it('toggles all mobile destinations and preserves the sample callback', () => {
    const { onGetStarted } = renderLanding()
    const menu = container.querySelector('button[aria-controls="landing-mobile-menu"]')

    expect(menu?.getAttribute('aria-expanded')).toBe('false')
    act(() => { menu.click() })
    expect(menu.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('.lp-mobile-menu')?.textContent).toMatch(/Demo.*Method.*Privacy.*Support/s)

    act(() => { findButton(/analyze a sample/i).click() })
    expect(onGetStarted).toHaveBeenCalledTimes(1)
  })
})
