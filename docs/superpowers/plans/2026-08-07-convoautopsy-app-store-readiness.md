# ConvoAutopsy App Store Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the ConvoAutopsy repository-controlled iOS release configuration, legal surfaces, and App Store packet internally consistent and verifiable without embedding credentials or claiming publication.

**Architecture:** Keep the existing Expo SDK 54 native app and local-first analysis boundary. Make production EAS builds store-signed, remotely auto-incremented, and binary-reproducible; keep AI proxy deployment, native OCR, TestFlight, screenshots, and App Review as explicit external gates.

**Tech Stack:** Expo SDK 54, React Native 0.81, Expo Router, EAS Build, Jest, GitHub Pages, Cloudflare Worker.

## Global Constraints

- iOS first; Android work is out of scope.
- Production code and metadata must contain no Apple, Expo, Cloudflare, Groq, or App Store Connect credentials.
- App Store uploads must use Xcode 26 and the iOS 26 SDK or later.
- Screenshots must come from the signed candidate, use synthetic content, and contain no Expo Go chrome.
- Optional AI remains consented and proxy-only; local analysis remains available.

---

### Task 1: Lock the production build contract

**Files:**
- Create: `mobile/__tests__/releaseConfig.test.ts`
- Modify: `mobile/app.config.ts`
- Modify: `mobile/eas.json`
- Create: `mobile/.env.example`

**Interfaces:**
- Consumes: Expo `ExpoConfig`, EAS build profiles, `EXPO_PUBLIC_AI_PROXY_URL`.
- Produces: a credential-free production profile using remote build-number auto-increment and the SDK-selected Xcode 26 image.

- [ ] **Step 1: Write the failing release configuration test**

Assert `updates.enabled === false`, iPhone-only support, export compliance false, the three exact public legal URLs, `cli.appVersionSource === "remote"`, `cli.requireCommit === true`, and production `{ distribution: "store", autoIncrement: true, ios: { image: "auto" } }` without a `submit` credential block.

- [ ] **Step 2: Run the test and verify the current config fails**

Run: `npm test -- --runInBand __tests__/releaseConfig.test.ts`
Expected: FAIL on the missing deterministic update/build and legal URL contract.

- [ ] **Step 3: Implement the minimal release config**

Set `updates: { enabled: false }`, add `termsOfUseUrl`, point `supportUrl` at the public support page, set EAS remote versioning/clean-commit enforcement, and add a documented public proxy URL example without a real secret.

- [ ] **Step 4: Re-run the focused test**

Run: `npm test -- --runInBand __tests__/releaseConfig.test.ts`
Expected: PASS.

### Task 2: Reconcile metadata with observable deployment state

**Files:**
- Modify: `docs/app-store/convoautopsy-ios-release-checklist.md`
- Modify: `docs/app-store/convoautopsy-ios-metadata.md`

**Interfaces:**
- Consumes: anonymous HTTP results for Privacy, Terms, and Support; current Apple upload requirements.
- Produces: truthful submission blockers and a complete reviewer path.

- [ ] **Step 1: Record the current public URL results**

Document that all three GitHub Pages legal URLs returned HTTP 404 on 2026-08-07 and remain submission blockers until anonymously rechecked.

- [ ] **Step 2: Record the current toolchain and account boundary**

Document that EAS is not logged in, full Xcode/CocoaPods are absent, and SDK 54 defaults to an Xcode 26 EAS image but no credentialed archive has run.

- [ ] **Step 3: Preserve screenshot truthfulness**

Keep every real screenshot and TestFlight checkbox open until the exact signed candidate is captured and reviewed.

### Task 3: Verify the repository-controlled candidate

**Files:**
- Verify only: `mobile/`, root web app, `server/ai-proxy/`, release documentation.

- [ ] **Step 1: Run mobile verification**

Run: `npm test -- --runInBand && npm run typecheck && npm run lint && npx expo-doctor && npm run export:ios` from `mobile/`.

- [ ] **Step 2: Run root and proxy verification**

Run the existing root and Worker test, typecheck, lint, build, audit, and redacted secret-scan commands defined by their package scripts and workflows.

- [ ] **Step 3: Stop at external gates**

Do not deploy the proxy, publish Pages, build with Apple credentials, submit, or claim publication without the authorized account owner completing those external actions.
