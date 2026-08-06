# ConvoAutopsy iOS release checklist

## Code-complete gates

- [x] Local reports, preferences, consent, local installation token, ConvoAutopsy-owned cache artifacts, and the in-memory session have a coordinated best-effort deletion path with subsystem failures and retry.
- [x] Settings requires the exact phrase `DELETE` before enabling the destructive control, and supports consent revocation and privacy/retention navigation.
- [x] In-app and built static privacy content disclose local storage, optional Groq-through-proxy use after consent, local alternative, no tracking/ads/contacts/automatic messaging, pseudonymous token/network rate limiting, deletion, output limitations, and support URL.
- [x] Credential-free EAS configuration, icon, splash configuration, bundle ID, build number, purpose strings, and initial metadata are in the repository.
- [x] The web consent dialog has initial focus, focus trap, Escape handling, and focus restoration tests.
- [x] Node 22 CI covers clean installs plus root web test/lint/build, mobile test/typecheck/lint/iOS export, and Worker test/typecheck/lint.
- [x] The Pages publication job itself depends on those web, mobile, and Worker gates, dry-runs the Worker bundle, and runs a deterministic redacted scan of the tracked tree plus the web, mobile, and Worker bundles before artifact upload.
- [x] The Maestro release flow uses production-control semantic IDs and, after an explicit Share press, asserts the stock English-locale iOS share-sheet `Copy` control. It proves only that the system sheet opened, never that a share completed.
- [x] Mobile parser limits count Unicode code points with exact 100-message and 26-speaker boundary tests; History distinguishes an empty library from no search matches.
- [x] Web and mobile inputs, parsers, contracts, provider responses, and exports use the shared Unicode code-point limits and anonymous `Person A` through `Person Z` sender policy. The Worker separately preserves its 128 KiB raw UTF-8 request cap.
- [x] The Worker uses independent HMAC-digest SQLite Durable Object buckets for source IP and installation token on each route. Token or IP rotation cannot bypass the stricter bucket; no raw identifier is stored in a Durable Object name.
- [x] Picker and draft-export artifacts live under the dedicated `convoautopsy-artifacts` cache tree, success/failure/fallback paths clean their artifacts, and Delete All recursively targets only that tree.
- [x] Repository revisions refresh mounted History and Responses screens, delete-all invalidates in-flight reads and writes before storage completes, and response-draft restore/reset persistence is covered by race tests.
- [x] Native installation and report IDs use the Expo Crypto UUID API. Shareable web and mobile reports state their analysis mode and a neutral educational limitation.

## Automated verification record

The ignored task scratch report is supplemental only and is not release evidence. Historical evidence does not validate later commits.

The exact committed candidate `d2a02edbced8d3984058ebc0814b97612824ac22` passed from a fresh `git clone --no-hardlinks` under Node 22:

- Root web: 8 test files / 39 tests, lint, production build, and production dependency audit with 0 vulnerabilities.
- Mobile: 29 suites / 203 tests, typecheck, lint, Expo Doctor 18/18, iOS export (1,445 modules; 4.43 MB Hermes bundle), and production dependency audit with 0 vulnerabilities.
- Worker: 5 test files / 34 tests, typecheck, lint, Wrangler dry-run bundle (165.96 KiB / 30.57 KiB gzip), and production dependency audit with 0 vulnerabilities.
- Release structure: all workflow YAML parsed, the redacted tracked/bundle secret scan passed, the icon was confirmed as an opaque 1024×1024 RGB PNG, and a clean iOS Expo prebuild completed without changing tracked files.

The web build still emits a non-blocking 1,466.83 kB chunk-size warning. That optimization should be measured separately and is not hidden by this release record.

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
- [ ] Swift OCR is uncompiled, Expo Go physical observations are pending, and the current machine has only Command Line Tools selected rather than a usable Xcode installation.
- [x] Automated @2x/@3x report-capture tests target 1080×1920 pixels, and the configured app icon is an opaque 1024×1024 RGB PNG. Physical share-output and App Store screenshot review remain pending; the required capture set is documented in `convoautopsy-screenshot-matrix.md`.
- [x] Current production dependency audits are clean without a breaking Expo 57 migration. The web chunk-size warning remains documented rather than suppressed.

No App Store acceptance or publication is claimed by this checklist.
