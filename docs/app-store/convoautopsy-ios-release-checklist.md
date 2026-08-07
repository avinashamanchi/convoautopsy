# ConvoAutopsy iOS release checklist

This checklist separates repository state from credentialed and externally observed state. A checked code item is not evidence of a signed build, TestFlight result, App Store acceptance, or publication.

## Code-complete repository gates

- [x] Bundle and Maestro app ID are `com.avinashamanchi.convoautopsy`; the app is iPhone-only and declares `ios.usesAppleSignIn: false` because it offers no account or Apple sign-in.
- [x] Production Expo config fails closed unless the AI proxy is a credential-free HTTPS production origin and the RevenueCat value is a non-placeholder Apple public SDK key. Error messages name only the variable; neither value is copied into Expo `extra`.
- [x] EAS configuration is credential-free, store-distributed, remote-versioned, auto-incrementing, and contains no submit profile or Apple credentials.
- [x] Billing maps the exact monthly/annual products to their periods while preserving RevenueCat/StoreKit localized prices.
- [x] The paywall truthfully states Free and Pro local, report, analysis, and draft allowances; UTC/rolling windows; no-rollover fair-use status; renewal/cancellation timing; restore behavior; and deletion-versus-cancellation.
- [x] Continue Free, Restore Purchases, Privacy, and Terms remain available when offerings fail. Expo Go is identified as preview-only for purchases.
- [x] Local reports, drafts, preferences, consent, installation token, cache artifacts, and session state have a coordinated best-effort deletion path with visible partial failure and retry.
- [x] In-app and public Privacy, Terms, and Support content covers local/device/iCloud storage; reviewed Cloudflare-to-Groq processing after confirmation/consent; RevenueCat purchase data; five-minute entitlement cache; HMAC-derived quota/rate identifiers; bounded usage/budget/lease/metric state; and deletion limitations.
- [x] Legal and marketing copy uses `reviewed` or `pseudonymous` where data has not been proven anonymous. It makes no Pro-only trends claim and no promise to eliminate lawful liability or user rights.
- [x] The redacted scanner detects provider, RevenueCat secret, Cloudflare, Expo, Apple, App Store Connect, private-key, certificate, and provisioning material while allowing the public RevenueCat Apple SDK variable and sanitized examples.
- [x] Each isolated iOS CI job scans the tracked tree plus only its own built artifacts and audits production dependencies. Worker CI also performs production/fixture dry builds and the short 100/101 load gate.
- [x] Manual release readiness is `workflow_dispatch` only, cannot deploy or submit, and specifies the local fixture profile: 5 RPS for 3,600 seconds, 20 RPS for 300 seconds, then 100/101 capacity.
- [x] The monetization packet records exact IDs, config/secret locations, recommended restore-transfer behavior, setup, rollback, test matrix, and state labels.
- [x] Screenshot planning targets a valid 6.9-inch iPhone size with synthetic scenes, short customer-language overlays, native-pixel/alpha/clarity checks, and reviewed wording. It does not claim screenshots exist.

## Local verification for the current candidate

Do not reuse an earlier commit’s results for a later candidate. Record fresh evidence here only after all commands complete.

- [x] Full root: 8 test files / 45 tests, zero-warning source lint, and production build passed locally under Node 22. The documented large-chunk warning remains visible.
- [x] Full mobile: 38 suites / 333 tests, TypeScript, declared lint, zero-warning Phase B lint, Expo Doctor 18/18, and iOS Expo export passed locally under Node 22.
- [x] Full Worker: 10 files / 126 tests, TypeScript, zero-warning lint, production dry build, and local-fixture dry build passed locally under Node 22.
- [x] Redacted scan of tracked files plus web, mobile, production Worker, and fixture Worker outputs passed.
- [x] Production dependency audits with `--omit=dev --audit-level=high` returned 0 vulnerabilities for all three lockfiles.
- [ ] The first exact short local fixture run stopped at `LOAD_GATE_CAPACITY` after 65 successful scheduled samples. Four identical subsequent runs passed 100/101 with zero leaks. Keep this gate unqualified until an independent controller run; all content-free JSON is preserved in the Task 8B report.
- [x] Workflow/publication tests, YAML structure checks, `git diff --check`, and explicit exclusion checks are part of the final candidate verification. The ignored report preserves commands and results.

Historical note: commit `d2a02edbced8d3984058ebc0814b97612824ac22` had a separate clean baseline, but it predates the paid allowance, current legal/configuration work, and new load gates. It is not evidence for this candidate. The web build historically emitted a non-blocking large-chunk warning; do not suppress or misrepresent it.

## External configuration pending — all unchecked

- [ ] Confirm Apple Developer Program membership and App Store Connect access.
- [ ] Accept current Paid Apps agreement and complete tax and banking requirements.
- [ ] If enrolling as an organization, obtain/validate its D-U-N-S record. Do not claim this is required for an individual enrollment.
- [ ] Register bundle ID `com.avinashamanchi.convoautopsy` and create the App Store Connect app record.
- [ ] Create the `Convo Pro` subscription group and exact monthly/annual products; complete durations, localization, pricing, availability, and review information.
- [ ] Connect the App Store app to RevenueCat; import both products; attach entitlement `convo_pro`; configure the current offering/packages; verify the actual restore-transfer setting; and verify that no unreviewed webhook is configured.
- [ ] Create/bind Cloudflare production Durable Objects and migrations, `ENTITLEMENT_CACHE` KV, reviewed daily budget, Worker route/domain, and observability destination.
- [ ] Enter `GROQ_API_KEY`, `REVENUECAT_SECRET_API_KEY`, and `RATE_LIMIT_HMAC_SECRET` only in the Cloudflare secret store; deploy and verify the production Worker.
- [ ] Revoke any historical exposed provider/GitHub token and complete an authorized history purge if required. Scanner output must remain redacted.
- [ ] Configure the EAS project and production environment variables, log in, and create a signed development/production build with the required current Xcode/iOS SDK toolchain.
- [ ] Publish the Privacy, Terms, and Support pages and confirm anonymous HTTP 200 responses at the exact metadata URLs. The 2026-08-07 pre-publication check returned HTTP 404 for all three.

## Signed device and TestFlight pending — all unchecked

- [ ] Compile and test native Swift Vision OCR. Expo Go fallback is not native OCR acceptance.
- [ ] Test local paste/import, reviewed preview, on-device analysis, history, trends, drafts, Delete All, offline behavior, and share-sheet opening on a physical iPhone.
- [ ] Sandbox/TestFlight test monthly and annual purchase, cancellation, restore, renewal, expiration, billing retry, refund/revocation, offline launch, reinstall, same-account fresh-device transfer, and RevenueCat outage/cache behavior.
- [ ] Verify the localized price and billing period on at least two storefronts; no hard-coded price may appear.
- [ ] Test VoiceOver, 200% Dynamic Type, Reduce Motion, contrast, focus order, and all purchase/legal controls in the signed candidate.
- [ ] Capture the planned 6.9-inch synthetic screenshots from the exact candidate; validate accepted pixels, no alpha, sharp text, safe margins, thumbnail readability, and absence of private/development content.

## App Store forms, review, and publication pending — all unchecked

- [ ] Reconcile App Privacy answers with the exact release binary, RevenueCat/Apple SDK privacy manifests, server behavior, and Apple’s current definitions.
- [ ] Complete age rating, export compliance, subscription review details, localization, screenshots, support/privacy/terms URLs, and review notes.
- [ ] Upload the exact verified signed build and confirm processing in App Store Connect.
- [ ] Submit for review and observe Apple’s actual review outcome.
- [ ] If accepted, release according to the chosen schedule and verify the live listing, legal links, products, purchase, and restore.

## Current environment limitations

- [ ] The local machine has only Command Line Tools selected, with no usable full Xcode/CocoaPods archive proof.
- [ ] EAS was observed as `Not logged in` on 2026-08-07; no EAS build or submission is inferred.
- [ ] The AI proxy is not deployed and no Cloudflare, Groq, RevenueCat secret, Expo, Apple, or signing credential has been entered into this repository.

No App Store acceptance, publication, legal-URL availability, external configuration, or signed-device result is claimed by this checklist.
