# ConvoAutopsy iOS release checklist

This checklist separates repository state from credentialed and externally observed state. A checked code item is not evidence of a signed build, TestFlight result, App Store acceptance, or publication.

Current audit date: 2026-08-10.

## Code-complete repository gates

- [x] Bundle and Maestro app ID are `com.avinashamanchi.convoautopsy`; the app is iPhone-only and declares `ios.usesAppleSignIn: false` because it offers no account or Apple sign-in.
- [x] The Expo app under `mobile/` is the only supported iOS release target. Root `ios`, `sync`, and `build:app` commands deterministically reject the historical Capacitor path; its old target ID remains historical rather than being presented as a second candidate.
- [x] Production Expo config fails closed unless the AI proxy is a credential-free HTTPS production DNS origin and the RevenueCat value is a non-placeholder Apple public SDK key. It rejects trailing-dot/single-label hosts, example and special-use suffixes including `.alt`, local/private/reserved/documentation addresses, and literal IPv6. Error messages name only the variable; neither value is copied into Expo `extra`.
- [x] EAS configuration is credential-free, store-distributed, remote-versioned, auto-incrementing, and contains no submit profile or Apple credentials.
- [x] Billing maps the exact monthly/annual products to their periods while preserving RevenueCat/StoreKit localized prices.
- [x] The paywall truthfully states Free and Pro local, report, analysis, and draft allowances; UTC/rolling windows; no-rollover fair-use status; renewal/cancellation timing; restore behavior; and deletion-versus-cancellation.
- [x] Private Trends is free and computed from reports saved on the device. Paid value remains removal of the 10-report cap plus the disclosed remote fair-use allowances; Trends has no entitlement gate or upgrade CTA.
- [x] Continue Free, Restore Purchases, Privacy, Terms, direct Apple subscription management, and official Apple purchase/refund help remain available. Expo Go is identified as preview-only for purchases.
- [x] Local reports, drafts, preferences, consent, installation token, cache artifacts, and session state have a coordinated best-effort deletion path with visible partial failure and retry.
- [x] In-app and public Privacy, Terms, and Support content covers local/device/iCloud storage; reviewed Cloudflare-to-Groq processing after confirmation/consent; RevenueCat purchase data; five-minute entitlement cache; HMAC-derived quota/rate identifiers; bounded usage/budget/lease/metric state; and deletion limitations.
- [x] Legal and marketing copy uses `reviewed` or `pseudonymous` where data has not been proven anonymous. It makes no Pro-only trends claim and no promise to eliminate lawful liability or user rights.
- [x] Deterministic, demo, and rendered-panel possible-interpretation data is explicitly hedged with `may`, `might`, or `could` plus a context caveat; it does not present `I am`, `I feel`, `I care`, or `I need` as the speaker's hidden state.
- [x] The approved monetization design and implementation plan match the shipped model: Private Trends is free/local, Pro removes the saved-report cap and raises remote fair-use limits, Free resets on a rolling 30-day window, and Pro resets by UTC calendar month.
- [x] The redacted scanner denies secret-shaped client-public variables except the exact RevenueCat Apple SDK variable, recognizes RevenueCat `sk_` and Expo/EAS token literals in source or built artifacts, and detects provider, Cloudflare, Apple, App Store Connect, private-key, certificate, and provisioning material. It reports only paths and rule IDs while allowing public `appl_` keys and sanitized examples.
- [x] Each isolated iOS CI job scans the tracked tree plus only its own built artifacts and audits production dependencies. Worker CI and the Pages pre-upload build both perform production/fixture dry builds, scan `dist-load`, and run the short 100/101 load gate.
- [x] Manual release readiness is `workflow_dispatch` only, cannot deploy or submit, and specifies the local fixture profile: 5 RPS for 3,600 seconds, 20 RPS for 300 seconds, then 100/101 capacity.
- [x] The monetization packet records exact IDs, config/secret locations, recommended restore-transfer behavior, setup, rollback, test matrix, and state labels.
- [x] Screenshot planning targets a valid 6.9-inch iPhone size with synthetic scenes, short customer-language overlays, native-pixel/alpha/clarity checks, and reviewed wording. It does not claim screenshots exist.
- [x] `apple-review-guideline-applicability.md` records every Apple Safety, Performance, Business, Design, and Legal family as implemented, externally gated, or not applicable.
- [x] A production-only Expo config plugin strips unused Bonjour/local-network declarations, disables arbitrary ATS loads, and removes localhost transport exceptions from the generated release Info.plist.

## Local verification for the current candidate

Do not reuse an earlier commit’s results for a later candidate. Record fresh evidence here only after all commands complete.

- [x] Full root: 15 test files / 119 tests, zero-warning source lint, and production build passed locally under Node 22. The documented large-chunk warning remains visible.
- [x] Full mobile: 38 suites / 412 tests, TypeScript, declared lint, Expo Doctor 18/18 in the release checkout, and iOS Expo export passed locally under Node 22. The exact staged-snapshot typecheck also passed without relying on ignored generated declarations.
- [x] Full Worker: 11 files / 193 tests, TypeScript, zero-warning lint, production dry build, and local-fixture dry build passed locally under Node 22.
- [x] Redacted scan of tracked files plus web, mobile, production Worker, and fixture Worker outputs passed.
- [x] Root and Worker production dependency audits with `--omit=dev --audit-level=high` returned 0 vulnerabilities at the current audit. Mobile CI now fails closed on any high/critical advisory except the two explicitly reviewed `image-size` parser advisories (GitHub sources `1138808` and `1138809`) through Expo/Metro; the current report has 12 transitive findings, and npm offers only a forced breaking Expo downgrade.
- [x] Missing and sanitized-example production Expo configs exited nonzero; a synthetic valid config passed with the authoritative bundle ID and neither public value in `extra`.
- [x] The first exact short local fixture run stopped at `LOAD_GATE_CAPACITY` after 65 successful scheduled samples. Four identical subsequent runs passed 100/101 with zero leaks. The independent controller then ran three more consecutive identical 100/101 gates successfully, and the review-fix candidate added another successful 100/101 run. The original anomaly remains preserved verbatim in the Task 8B report rather than being erased.
- [x] Workflow/publication tests, YAML structure checks, `git diff --check`, and explicit exclusion checks are part of the final candidate verification. The ignored report preserves commands and results.

Historical note: commit `d2a02edbced8d3984058ebc0814b97612824ac22` had a separate clean baseline, but it predates the paid allowance, current legal/configuration work, and new load gates. It is not evidence for this candidate. The web build historically emitted a non-blocking large-chunk warning; do not suppress or misrepresent it.

## Review closure record

- The independent controller rechecked the original Task 8B candidate: root 45/45, mobile 333/333, Worker 126/126, Expo Doctor 18/18, iOS export, both Worker dry builds, scans, audits, production-config guards, workflow tests, and three consecutive short load gates passed.
- Reviewer follow-up then found release-truth gaps in proxy-origin validation, client-secret scanning, retained-text wording, marketing claims, the Trends paywall, the legacy Capacitor commands, and the Pages pre-upload workflow. Focused regressions were observed red before each fix category; the appended Task 8B report preserves the counts.
- A second re-review found `.alt`, certainty inside deterministic/demo interpretation values, and stale Pro-Trends/reset-window instructions in the approved spec and plan. Each was driven red before correction; the Task 8B report records focused and broad evidence.
- The follow-up does not change any external-state label: signed builds, device tests, purchases, TestFlight, App Store review, and publication remain pending until directly observed.

## External configuration pending — all unchecked

- [ ] Confirm Apple Developer Program membership and App Store Connect access.
- [ ] Accept current Paid Apps agreement and complete tax and banking requirements.
- [ ] If enrolling as an organization, obtain/validate its D-U-N-S record. Do not claim this is required for an individual enrollment.
- [ ] Register bundle ID `com.avinashamanchi.convoautopsy` and create the App Store Connect app record.
- [ ] Create the `Convo Pro` subscription group and exact monthly/annual products; complete durations, localization, pricing, availability, and review information.
- [ ] Keep offer codes, win-back offers, promoted IAP, Family Sharing, alternative digital payments, and custom product pages disabled for v1.
- [ ] Connect the App Store app to RevenueCat; import both products; attach entitlement `convo_pro`; configure the current offering/packages; verify the actual restore-transfer setting; and verify that no unreviewed webhook is configured.
- [ ] Create/bind Cloudflare production Durable Objects and migrations, `ENTITLEMENT_CACHE` KV, reviewed daily budget, Worker route/domain, and observability destination.
- [ ] Enter `GROQ_API_KEY`, `REVENUECAT_SECRET_API_KEY`, and `RATE_LIMIT_HMAC_SECRET` only in the Cloudflare secret store; deploy and verify the production Worker.
- [ ] Revoke any historical exposed provider/GitHub token and complete an authorized history purge if required. Scanner output must remain redacted.
- [ ] Configure the EAS project and production environment variables, log in, and create a signed development/production build with the required current Xcode/iOS SDK toolchain.
- [ ] Publish the Privacy, Terms, and Support pages and confirm anonymous HTTP 200 responses at the exact metadata URLs. Fresh anonymous checks on 2026-08-10 returned HTTP 404 for all three.

## Signed device and TestFlight pending — all unchecked

- [ ] Compile and test native Swift Vision OCR. Expo Go fallback is not native OCR acceptance.
- [ ] Test local paste/import, reviewed preview, on-device analysis, history, trends, drafts, Delete All, offline behavior, and share-sheet opening on a physical iPhone.
- [ ] Sandbox/TestFlight test monthly and annual purchase, cancellation, restore, renewal, expiration, billing retry, refund/revocation, offline launch, reinstall, same-account fresh-device transfer, and RevenueCat outage/cache behavior.
- [ ] Verify the localized price and billing period on at least two storefronts; no hard-coded price may appear.
- [ ] Test VoiceOver, 200% Dynamic Type, Reduce Motion, contrast, focus order, and all purchase/legal controls in the signed candidate.
- [ ] Capture the planned 6.9-inch synthetic screenshots from the exact candidate; validate accepted pixels, no alpha, sharp text, safe margins, thumbnail readability, and absence of private/development content.

## App Store forms, review, and publication pending — all unchecked

- [ ] Reconcile App Privacy answers with the exact release binary, RevenueCat/Apple SDK privacy manifests, server behavior, and Apple’s current definitions.
- [ ] Complete Apple's updated age-rating questionnaire, export compliance, subscription review details, localization, screenshots, support/privacy/terms URLs, and review notes.
- [ ] Review Notes state no credentials are required and include the exact local, consented remote, save/trends/draft, Delete All, subscription, restore, and support paths.
- [ ] Complete the Accessibility Nutrition Label from signed-device VoiceOver, Voice Control, Larger Text, contrast, and Reduce Motion evidence; do not claim unverified support.
- [ ] Complete the product page name, icon, subtitle, description, promotional text, keywords, and 1–10 screenshots with accurate reviewed wording, no placeholders, and no private conversation data.
- [ ] Verify required device capabilities and every generated Info.plist usage description against the exact archive on a current iOS 26 device.
- [ ] Explicitly disable Mac with Apple silicon and Apple Vision Pro availability for v1 unless the exact signed iPhone build, picker, local OCR, and privacy behavior are separately tested and supported there.
- [ ] Complete primary language, SKU, seller/copyright, categories, content-rights declaration, availability, and Digital Services Act status in the authorized App Store Connect account.
- [ ] Upload the exact verified signed build and confirm processing in App Store Connect.
- [ ] Submit for review and observe Apple’s actual review outcome.
- [ ] If accepted, release according to the chosen schedule and verify the live listing, legal links, products, purchase, and restore.

## Current environment limitations

- [ ] The local machine has only Command Line Tools selected and no usable full Xcode archive proof. CocoaPods 1.17.0 is now installed, but CocoaPods alone cannot compile or sign the candidate.
- [ ] EAS was observed as `Not logged in` again on 2026-08-09; no EAS build or submission is inferred.
- [ ] The AI proxy is not deployed and no Cloudflare, Groq, RevenueCat secret, Expo, Apple, or signing credential has been entered into this repository.

No App Store acceptance, publication, legal-URL availability, external configuration, or signed-device result is claimed by this checklist.
