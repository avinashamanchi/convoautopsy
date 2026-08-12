# ConvoAutopsy landing and live-demo design

**Date:** 2026-08-11
**Status:** Approved for implementation

## Product frame

- **Subject:** Educational conversation-pattern analysis and response drafting with explicit uncertainty.
- **Audience:** People reflecting on a difficult exchange who need clarity without being given a diagnosis or definitive account of another person's intent.
- **Single page job:** Demonstrate the conversation-to-pattern-to-response workflow immediately and provide a clear path into a reviewed sample.

## Scope

This redesign refines the public landing and entry experience. It preserves dashboard behavior, analysis contracts, consent, storage, provider boundaries, and legal pages. The existing 3D scene may remain as a progressive enhancement, but the first-viewport demo cannot depend on WebGL.

## Visual system

| Token | Value | Use |
| --- | --- | --- |
| Inkwell | `#08070C` | Primary background |
| Bone | `#F2EFF5` | Primary copy |
| Review violet | `#9B87F5` | Pattern and primary-action state |
| Signal rose | `#F26FA8` | Emotional-intensity accent |
| Glass | `#1C1925` | Panels and dividers |

- **Display:** Instrument Serif, with an editorial serif fallback.
- **Body:** Inter, with a system sans-serif fallback.
- **Utility:** IBM Plex Mono, with a system monospace fallback.
- **Layout:** A restrained analysis table: concise thesis beside a vertical filmstrip of conversation, pattern review, and response draft.
- **Signature:** Chat bubbles separate into evidence fragments, resolve into hedged pattern labels, and reassemble as a calmer response option.

## Page structure

1. Sticky navigation: ConvoAutopsy wordmark, Demo, Method, Privacy, Support, and Analyze a sample.
2. First viewport: direct educational framing, non-diagnostic qualifier, primary action, and complete live simulation.
3. Method strip: local estimate versus optional remote analysis, always labeled.
4. Three-step explanation: paste, review transfer, inspect patterns and response options.
5. Focused capabilities and explicit interpretation limits.
6. Privacy, retention, and consent summary with public policy links.
7. Final sample action and legal/support footer.

Unverified social proof, certainty about hidden meanings, diagnoses, and guaranteed relationship outcomes must not appear.

## Live-demo behavior

The demo is a local deterministic presentation of reviewed sample content. It never calls the Worker or provider.

The state machine is:

`sample exchange -> evidence fragments -> hedged pattern estimate -> response option`

- Autoplay begins only while visible and includes Pause, Replay, and direct stage controls.
- Labels consistently say estimate, may, or could; they do not assert intent.
- The result includes a short educational-not-professional-advice note.
- Reduced-motion users see the completed response option with the evidence trail available.
- A static DOM fallback remains usable if WebGL or animation fails.
- Existing 3D effects are suspended on small screens, reduced motion, and constrained rendering contexts.

## Navigation and responsive behavior

- Anchors account for the sticky header and preserve keyboard focus.
- The mobile menu reports expanded state and contains all primary destinations.
- Conversation bubbles, labels, and response text remain readable at 320 CSS pixels.
- The primary sample action is reachable before the long-scroll sections.
- Advanced visuals are decorative and hidden from accessibility APIs.

## Implementation boundary

The React/Vite landing page receives one isolated first-viewport demo component and shared navigation primitives. Demo state must not call `analyzeConversation`, `craftResponse`, storage utilities, or authenticated dashboard state. The existing live analysis section remains clearly separate from the deterministic hero sample.

## Verification

Automated checks cover:

- deterministic stage progression, pause, replay, reduced motion, and viewport suspension;
- zero Worker, provider, storage, or authentication calls from the demo;
- hedged/non-diagnostic copy requirements;
- navigation, labels, focus, and mobile-menu semantics;
- graceful behavior without WebGL;
- preservation of dashboard and real-analysis tests.

Visual checks cover desktop, tablet, 390-pixel iPhone, and 320-pixel narrow layouts, keyboard focus, reduced motion, and a forced no-WebGL fallback.

## Acceptance criteria

- The complete analysis story is understandable in the first viewport.
- A visitor can reach the sample flow, method, privacy, and support directly.
- The demo cannot be mistaken for a real provider response or definitive interpretation.
- Existing web, mobile, Worker, security, and Pages gates remain green.
