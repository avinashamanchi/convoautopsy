# ConvoAutopsy Landing Live Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move a truthful deterministic conversation-analysis story into ConvoAutopsy's first viewport and simplify entry navigation without changing real analysis behavior.

**Architecture:** Add a DOM-based hero demo with a pure stage module, leaving Worker analysis and dashboard state isolated. Recompose the landing hero/nav around the demo; keep the existing 3D scene as optional decoration that can fail or suspend without affecting content.

**Tech Stack:** React, Vite, Vitest, Testing Library, GSAP, React Three Fiber, CSS

## Global Constraints

- Demo stages are exactly `exchange`, `evidence`, `patterns`, and `response`.
- Demo copy stays hedged and non-diagnostic.
- The demo cannot call Worker/provider, authentication, storage, `analyzeConversation`, or `craftResponse`.
- Reduced motion and missing WebGL render complete usable DOM content.
- Preserve dashboard and real live-analysis behavior.

---

### Task 1: Deterministic hero-demo state

**Files:**
- Create: `src/components/heroDemoMachine.js`
- Create: `src/components/heroDemoMachine.test.js`

**Interfaces:**
- Produces: `HERO_DEMO_STAGES`, `nextHeroDemoStage(stage)`, and `initialHeroDemoStage(reducedMotion)`.

- [ ] **Step 1: Write failing pure-state tests**

```js
expect(HERO_DEMO_STAGES).toEqual(['exchange', 'evidence', 'patterns', 'response'])
expect(nextHeroDemoStage('response')).toBe('exchange')
expect(initialHeroDemoStage(true)).toBe('response')
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/components/heroDemoMachine.test.js`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement immutable helpers and verify GREEN**

Export the fixed array, indexed wraparound, and reduced-motion initializer; rerun the focused test and expect PASS.

### Task 2: Accessible first-viewport conversation demo

**Files:**
- Create: `src/components/HeroLiveDemo.jsx`
- Create: `src/components/HeroLiveDemo.test.jsx`
- Modify: `src/pages/LandingPage.css`

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces: `<HeroLiveDemo />` with Pause/Play, Replay, and four direct stage controls.

- [ ] **Step 1: Write failing component tests**

Assert the named demo region, all controls, fake-timer pause/replay behavior, reduced-motion completion, timer cleanup, hedged words, and no calls to mocked analysis/storage modules or `fetch`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/components/HeroLiveDemo.test.jsx`
Expected: FAIL because the component does not exist.

- [ ] **Step 3: Build the isolated DOM simulation**

Render reviewed sample bubbles, evidence fragments, labels using `may`/`could`, and a calm response option. Use IntersectionObserver, one timeout, reduced-motion detection, and polite status text.

- [ ] **Step 4: Add the filmstrip visual treatment and verify GREEN**

Run: `npm test -- src/components/HeroLiveDemo.test.jsx`
Expected: PASS without network, storage, or real analysis calls.

### Task 3: Recompose navigation and hero

**Files:**
- Modify: `src/pages/LandingPage.jsx`
- Modify: `src/pages/LandingPage.css`
- Create: `src/pages/LandingPage.entry.test.jsx`

**Interfaces:**
- Consumes: `<HeroLiveDemo />` and existing entry callbacks.
- Preserves: the lower real-analysis demo and Dashboard transition.

- [ ] **Step 1: Write failing entry-contract tests**

Assert Demo, Method, Privacy, Support, and Analyze a sample navigation; hero demo placement; mobile-menu state; non-diagnostic copy; and preserved CTA callback.

- [ ] **Step 2: Run the focused entry test and verify RED**

Run: `npm test -- src/pages/LandingPage.entry.test.jsx`
Expected: FAIL against the current hero.

- [ ] **Step 3: Implement the approved first viewport and concise navigation**

Place `HeroLiveDemo` in the hero's right column, bind `Analyze a sample` to the existing sample entry callback, add semantic anchor IDs, and make WebGL decoration nonessential/hidden on constrained contexts.

- [ ] **Step 4: Run focused and full web verification**

Run: `npm test && npm run lint && npm run build`
Expected: PASS.

### Task 4: Responsive, accessibility, and release verification

**Files:**
- Modify only for verified defects: `src/pages/LandingPage.jsx`, `src/pages/LandingPage.css`, `src/components/HeroLiveDemo.jsx`

- [ ] **Step 1: Capture desktop, tablet, 390-pixel, and 320-pixel screenshots**

Verify the hero story, filmstrip, controls, lower real-analysis distinction, and footer without overflow.

- [ ] **Step 2: Verify keyboard, reduced motion, and forced no-WebGL behavior**

Expected: visible focus, complete DOM demo, working CTA, and no content loss.

- [ ] **Step 3: Run complete web/mobile/Worker/security gates and commit**

Run the root web suite/build/lint, mobile test/typecheck/lint/export, Worker test/typecheck/lint/build/load gate, and tracked/bundle secret scans. Expected: all PASS.
