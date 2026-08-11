# ConvoAutopsy Apple Review Guidelines Hardening Plan

> **For implementation:** Execute each task in order with RED-before-production TDD, preserve the user's unrelated rate-limit edit, and keep external release actions blocked until verified.

**Goal:** Align ConvoAutopsy's iOS package and reviewer materials with every applicable current Apple App Review requirement.

**Architecture:** Preserve the guest-first local analysis path, explicit exact-data AI consent, and RevenueCat subscription model. Add direct subscription management and official purchase/refund help, then document the safety, privacy, content-rights, and claim boundaries Apple will review.

**Tech stack:** Expo SDK 54, React Native, Expo Router, SQLite, RevenueCat, Cloudflare Worker, Jest, TypeScript.

---

### Task 1: Record complete applicability

**Files:**
- Create: `docs/app-store/apple-review-guideline-applicability.md`
- Modify: `docs/app-store/convoautopsy-ios-release-checklist.md`

1. Map all five guideline sections to `IMPLEMENTED`, `EXTERNAL GATE`, or `NOT APPLICABLE`.
2. Record the no-account/local mode, exact-data AI consent, sensitive-content limitations, subscription model, deletion behavior, and public-link requirements.

### Task 2: Add Apple management and refund help

**Files:**
- Test: `mobile/__tests__/upgradeFlow.test.tsx`
- Modify: `mobile/src/legal/links.ts`
- Modify: `mobile/app/upgrade.tsx`
- Modify: `public/support.html`

1. Add failing tests for direct Apple subscription-management and purchase/refund-help controls.
2. Observe RED, add the official URLs and accessible controls, and retain the Free path.
3. Update support copy and rerun focused tests to green.

### Task 3: Make reviewer instructions exact

**Files:**
- Modify: `docs/app-store/convoautopsy-ios-metadata.md`
- Modify: `docs/app-store/convoautopsy-monetization-setup.md`
- Modify: `docs/app-store/convoautopsy-ios-release-checklist.md`

1. Document the local reviewer path, exact-data remote path, consent, content rights, claim/safety limits, products, restore, and deletion.
2. Gate optional offers, signed OCR/purchase testing, provider deployment, screenshots, and App Store forms.

### Task 3A: Enforce HTTPS-only production transport

**Files:**
- Test: `mobile/__tests__/releaseConfig.test.ts`
- Create: `mobile/plugins/withReleaseNetworkPolicy.cjs`
- Modify: `mobile/app.config.ts`

1. Add a failing release-policy contract test, then register a production-only Info.plist config plugin that removes Bonjour/local-network keys, disables arbitrary ATS loads, and removes localhost transport exceptions.

### Task 4: Verify

**Files:** none

1. Run focused and full mobile tests, Worker tests, root tests, typecheck, lint, Expo Doctor, audit gates, cache-free iOS export, and capacity gate.
2. Confirm `server/ai-proxy/src/rateLimit.ts` remains unstaged and unchanged by this task.
3. Stage only intended paths and commit independently.
