# ConvoAutopsy iOS release checklist

## Code-complete gates

- [x] Local reports, preferences, consent, local installation token, ConvoAutopsy-owned cache artifacts, and the in-memory session have a coordinated best-effort deletion path with subsystem failures and retry.
- [x] Settings requires the exact phrase `DELETE` before enabling the destructive control, and supports consent revocation and privacy/retention navigation.
- [x] In-app and built static privacy content disclose local storage, optional Groq-through-proxy use after consent, local alternative, no tracking/ads/contacts/automatic messaging, pseudonymous token/network rate limiting, deletion, output limitations, and support URL.
- [x] Credential-free EAS configuration, icon, splash configuration, bundle ID, build number, purpose strings, and initial metadata are in the repository.
- [x] The web consent dialog has initial focus, focus trap, Escape handling, and focus restoration tests.
- [x] Node 22 CI covers clean installs plus root web test/lint/build, mobile test/typecheck/lint/iOS export, and Worker test/typecheck/lint.
- [x] The Maestro release flow uses production-control semantic IDs and only proves that a user opens the system share sheet.
- [x] Mobile parser limits count Unicode code points with exact 100-message and 26-speaker boundary tests; History distinguishes an empty library from no search matches.
- [x] The Worker uses a per-digest SQLite Durable Object rate limiter: exported `RateLimitDurableObject`, `RATE_LIMITER` binding, v1 SQLite migration, Worker type, and Miniflare Durable Object configuration are present. No KV namespace is configured or required.

## Automated verification record

Observed results and command output are recorded in `.superpowers/sdd/2026-08-02-convoautopsy-ios/task-13-report.md` after each run. The clean-checkout verification is the release evidence; a working-tree check alone is not acceptance evidence.

## Physical-device checkpoint (user observation required)

- [ ] Expo Go scan, navigation, text input, parsing, local analysis, history, response drafts, screenshot selection fallback, offline behavior, Dynamic Type, VoiceOver, and opening the share sheet. Do not mark these checked until observed on a physical iPhone.
- [ ] Native Swift Vision OCR compile and device behavior in an EAS development build. OCR is explicitly not accepted in Expo Go.

## Credentialed and external gates (not complete)

- [ ] Apple Developer Program membership and App Store Connect access.
- [ ] Expo login and EAS project initialization.
- [ ] Registered iOS test device.
- [ ] Development build with the native Swift OCR module compiled and tested. Expo Go fallback remains expected until this build exists.
- [ ] Deploy and verify the AI proxy. Its historical token revocation/purge and retention behavior remain a release blocker.
- [ ] Verify the public privacy URL after GitHub Pages publication.
- [ ] Create the App Store Connect record and complete App Privacy and age-rating questionnaires.
- [ ] Capture approved device screenshots.
- [ ] Create and test a TestFlight build.
- [ ] Upload a build, submit for review, and verify review outcome.
- [ ] Verify the public App Store listing after publication.

## Current release blockers and requirements

- [ ] Apple’s current upload gate is Xcode 26 or later using the iOS 26 SDK or later for apps uploaded to App Store Connect, effective 2026-04-28. This repository has no full Xcode 26/toolchain proof.
- [ ] Apple Developer membership, Expo login, EAS build/submit, TestFlight, screenshots, App Store Connect record, review, and publication have not been performed.
- [ ] The AI proxy is undeployed; no Cloudflare or Groq credential has been entered. The current tree is credential-free.
- [ ] Historical GitHub token revocation and an authorized history purge remain pending; history scans must not print candidate values.
- [ ] Swift OCR is uncompiled, Expo Go physical observations are pending, and audit/tooling findings are advisory until separately remediated.
- [ ] The required @2x/@3x PNG dimensions remain unverified.
- [ ] The deferred Expo 57 audit correction and a risky web chunk rewrite were intentionally not attempted in this release-verification task.

No App Store acceptance or publication is claimed by this checklist.
