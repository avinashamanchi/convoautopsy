/** @vitest-environment jsdom */
import { act, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import AiConsentModal from './AiConsentModal'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

function Harness() {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  return (
    <>
      <button ref={triggerRef} onClick={() => setOpen(true)}>Run AI-assisted analysis</button>
      {open && <AiConsentModal isRunning={false} onAgree={() => setOpen(false)} onDecline={() => setOpen(false)} returnFocusRef={triggerRef} />}
    </>
  )
}

function renderHarness() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => { root.render(<Harness />) })
}

afterEach(() => {
  act(() => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
})

it('focuses the consent action, traps tabbing, closes on Escape, and restores the trigger focus', () => {
  renderHarness()
  const trigger = document.querySelector('button')
  act(() => { trigger.click() })

  const dialog = document.querySelector('[role="dialog"]')
  const agree = dialog.querySelector('button')
  const decline = dialog.querySelectorAll('button')[1]
  expect(document.activeElement).toBe(agree)

  act(() => { agree.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' })) })
  expect(document.activeElement).toBe(decline)
  act(() => { decline.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' })) })
  expect(document.activeElement).toBe(agree)
  act(() => { agree.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })) })

  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})
