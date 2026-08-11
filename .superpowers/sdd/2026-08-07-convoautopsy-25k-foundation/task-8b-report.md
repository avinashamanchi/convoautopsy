# Task 8B implementation report

Date: 2026-08-07

Scope: repository-controlled payment truth, production configuration, legal/support copy, secret scanning, CI/readiness workflows, and the App Store release packet. No credential, deployment, signed build, TestFlight action, App Store submission, screenshot, review result, or publication is claimed.

## Preserved boundaries

- Started from `6884f7bc94ef268cefa67ed00fa8cce6765b64e8`.
- Did not edit or stage the user-owned `server/ai-proxy/src/rateLimit.ts` change.
- Did not edit or stage `docs/superpowers/plans/2026-08-07-convoautopsy-app-store-readiness.md`.
- Intentionally reconciled the dirty Phase B config/legal/settings/App Store/screenshot paths listed in the task brief.
- Added no credential, private email address, deployment, submission, or external-completion claim.

## RED evidence captured before implementation

Existing focused baseline:

- Mobile: 4 suites / 23 tests passed.
- Root release/scanner: 2 files / 9 tests passed.

New Phase B RED:

- Mobile: 5 suites failed; 28 failed / 15 passed. Failures showed missing monthly/annual product periods; absent Free/Pro quota, renewal/cancel/restore, and Expo Go copy; old bundle ID and no production guard; and missing legal/deletion disclosures.
- Root: 4 failed / 11 passed. Failures showed no detection for six requested credential assignment classes or signing/provisioning artifacts, no per-job built-artifact scans/short load gate/production-only audits, and no 3,600-second/300-second manual fixture profile.
- CI root-working-directory hardening was separately driven RED: publication gate 1 failed / 7 passed until every scan step explicitly declared `working-directory: .`.

These failures were feature-specific; implementation began only after the RED outputs were observed and reported to the controller.

## Implemented behavior

- Added exact monthly/annual billing periods derived from the configured product IDs while retaining RevenueCat localized price strings.
- Rebuilt the paywall truth around unlimited local features, the 10-report Free cap, exact rolling/UTC remote limits, no-rollover fair-use status, StoreKit-localized period display, auto-renew/cancel/charge timing, restore, and deletion-versus-cancellation.
- Changed bundle/Maestro ID to `com.avinashamanchi.convoautopsy`; declared `ios.usesAppleSignIn: false`; retained iPhone-only support.
- Added a production Expo factory that fails closed on unsafe/missing proxy origin or RevenueCat Apple public key, emits variable-name-only errors, and keeps both values out of `extra`.
- Completed reviewed/pseudonymous privacy, terms, deletion, backup, Cloudflare/Groq, RevenueCat, five-minute cache, HMAC/quota/budget/lease/metrics, no-tracking, and content-free support disclosures in app and public pages.
- Expanded the redacted scanner for RevenueCat secret, Cloudflare/CF, Expo, Apple, App Store Connect, private key, `.p8`, `.p12`, `.mobileprovision`, and provisioning-profile material while allowing the public RevenueCat variable and sanitized examples.
- Made each iOS CI job scan the tracked tree plus its own built artifacts; added fixture dry build, short load gate, and production-only audits.
- Kept manual readiness `workflow_dispatch` only, dry-run/no-submit, with 5 RPS for 3,600 seconds, 20 RPS for 300 seconds, and 100/101 capacity.
- Added the exact monetization setup/rollback/test packet and expanded truthful metadata, checklist, and 6.9-inch screenshot plan without claiming external completion or image existence.

## Focused GREEN

- Mobile billing/provider/paywall/config/settings/legal: 6 suites / 47 tests passed.
- Root scanner/workflow/publication: 2 files / 15 tests passed.
- Scoped Phase B ESLint: zero warnings.
- Mobile TypeScript: passed.
- Tracked-tree secret scan: passed.

## Broad local verification

- Root: 8 files / 45 tests passed; zero-warning source lint passed; production build passed. The documented 1,466.83 kB web chunk warning remains visible.
- Mobile: 38 suites / 333 tests passed; TypeScript passed; declared Expo lint passed; scoped Phase B lint passed with zero warnings; Expo Doctor passed 18/18; iOS export passed with 1,494 modules and a 5.96 MB Hermes bundle.
- Worker: 10 files / 126 tests passed; TypeScript and zero-warning lint passed; production dry build passed at 195.00 KiB / 36.24 KiB gzip; local fixture dry build passed at 202.35 KiB / 38.75 KiB gzip.
- Redacted tracked + web/mobile/production-Worker/fixture-Worker scan passed.
- Root, mobile, and Worker production dependency audits each returned `found 0 vulnerabilities` with `--omit=dev --audit-level=high`.
- Missing and sanitized-example production Expo configs exited nonzero. A synthetic valid production config passed, used the intended bundle/Apple-sign-in settings, and exposed neither synthetic proxy origin nor SDK key in `extra`.
- Both modified workflow YAML files parsed successfully.

## Short load-gate evidence — intermittent first run retained

The first identical short local fixture invocation failed before completing capacity. It is not masked:

```json
{"gate":"fail","failureCodes":["LOAD_GATE_CAPACITY"],"requests":65,"nonInjectedRequests":65,"nonInjectedFailures":0,"nonInjectedFailureRate":0,"statusCounts":{"200":65},"codeCounts":{"allowed":65},"latencyMs":{"p50":28.504374999999527,"p95":50.6626669999996,"p99":66.23641699999916},"activeReservations":0}
```

An immediate identical rerun passed:

```json
{"gate":"pass","failureCodes":[],"capacityPeakReservations":100,"requests":166,"nonInjectedRequests":165,"nonInjectedFailures":0,"nonInjectedFailureRate":0,"statusCounts":{"200":165,"503":1},"codeCounts":{"allowed":165,"SERVICE_BUSY":1},"latencyMs":{"p50":1590.9115410000004,"p95":1613.3228749999998,"p99":1870.0725000000002},"activeReservations":0}
```

Three additional bounded identical runs all passed:

```json
{"gate":"pass","failureCodes":[],"capacityPeakReservations":100,"requests":166,"nonInjectedRequests":165,"nonInjectedFailures":0,"nonInjectedFailureRate":0,"statusCounts":{"200":165,"503":1},"codeCounts":{"allowed":165,"SERVICE_BUSY":1},"latencyMs":{"p50":1547.0001670000001,"p95":1565.922708,"p99":1811.0469999999987},"activeReservations":0}
{"gate":"pass","failureCodes":[],"capacityPeakReservations":100,"requests":166,"nonInjectedRequests":165,"nonInjectedFailures":0,"nonInjectedFailureRate":0,"statusCounts":{"200":165,"503":1},"codeCounts":{"allowed":165,"SERVICE_BUSY":1},"latencyMs":{"p50":1450.6267080000007,"p95":1466.6413750000002,"p99":1715.5625},"activeReservations":0}
{"gate":"pass","failureCodes":[],"capacityPeakReservations":100,"requests":166,"nonInjectedRequests":165,"nonInjectedFailures":0,"nonInjectedFailureRate":0,"statusCounts":{"200":165,"503":1},"codeCounts":{"allowed":165,"SERVICE_BUSY":1},"latencyMs":{"p50":1464.3270839999996,"p95":1482.7197500000002,"p99":1756.5466670000005},"activeReservations":0}
```

Task 8B did not change Worker or rate-limit code in response. The candidate remains unqualified on this gate until the controller independently reruns it; the release checklist leaves the short-load item unchecked.

## Pending external evidence

Apple membership/agreements/tax/banking/D-U-N-S-if-organization, App Store record/products/forms, RevenueCat offering/transfer/webhook state, Cloudflare resources/secrets/domain/deployment, EAS project/env/build, legal URL HTTP 200, signed native purchase/restore/OCR/accessibility/offline/device tests, screenshots, TestFlight, upload, review, publication, and live-listing verification all remain pending.

## Reviewer follow-up and controller closure

The independent controller first verified commit `8b4388fb3c8746f87ae1b9583eb6dbde4a1afed8`: root 45/45, mobile 333/333, Worker 126/126, Expo Doctor 18/18, iOS export, production and fixture dry builds, scans, audits, configuration guards, and workflow checks passed. It also ran three consecutive identical short 100/101 gates successfully. That evidence qualifies the original short gate while retaining the first 65-request anomaly above.

Review then identified release-truth gaps. This follow-up preserved and did not stage the user-owned `server/ai-proxy/src/rateLimit.ts` edit or the untracked readiness plan.

### Follow-up RED evidence before production edits

- Root focused: 22 tests, 7 failed and 15 passed. The failures covered two scanner rules, two customer-copy truth checks, two legacy-release identity checks, and the Pages pre-upload load gate.
- Mobile focused: 43 tests, 12 failed and 31 passed. The failures covered six adversarial proxy-origin cases, four free-Trends behaviors, and two retained/save/share copy checks.
- Incremental controller findings were also driven red before edits: customer copy had 1 failure / 1 pass for rendered signup and interpretation wording; proxy config had 7 failures / 31 passes for special-use DNS suffixes.

### Follow-up implementation

- Hardened the production proxy-origin allow boundary against trailing-dot and single-label hosts, subdomains of example domains, private/reserved/documentation addresses, literal IPv6, and local/special-use suffixes including `.arpa`, `.internal`, `.lan`, `.home`, `.corp`, and `.onion`. Errors remain value-free.
- Hardened the scanner for any secret-shaped client-public variable except the exact public RevenueCat Apple SDK variable, recognizable RevenueCat `sk_` and Expo/EAS token literals, and source/built artifacts. Public `appl_` keys remain allowed; output remains path/rule-only.
- Replaced anonymity overclaims with pseudonymous-label and residual-identifier disclosures. Saving without the original source still truthfully discloses that parsed message text is retained; exported report images omit message text.
- Replaced clinical, intent, certainty, verdict, and guaranteed-response claims with educational estimate, possible-interpretation, and reflection wording across landing, onboarding, signup, result, and demo-panel copy. The explicit negative limitation that output is not a clinical diagnosis or factual finding remains.
- Made Private Trends free and local, removed its entitlement gate and upgrade CTA, and retained its deletion/race/retry behavior. Paid value remains unlimited saved reports plus the disclosed remote fair-use allowances.
- Hard-disabled the historical Capacitor release scripts with a deterministic guard that points to `mobile/` Expo/EAS as the only iOS release target, without changing the old target ID.
- Added fixture dry build, short load gate, production-only audits, and `dist-load` scanning to the Pages workflow before artifact upload.

### Fresh follow-up verification

- Focused green: root 4 files / 22 tests; mobile 3 suites / 43 tests; incremental copy/config checks 3/3 and 38/38.
- Full root: 10 files / 52 tests, zero-warning lint, and production build passed under Node 22. The existing 1,466.75 kB large-chunk warning remains visible.
- Full mobile: 38 suites / 356 tests, TypeScript, declared lint, Expo Doctor 18/18, and iOS export passed under Node 22. Export bundled 1,494 modules into a 5.96 MB Hermes bundle.
- Full Worker: 10 files / 126 tests, TypeScript, zero-warning lint, production dry build at 195.00 KiB / 36.24 KiB gzip, and fixture dry build at 202.35 KiB / 38.75 KiB gzip passed under Node 22.
- The redacted tracked plus web/mobile/production-Worker/fixture-Worker scan passed. Root, mobile, and Worker production audits each returned 0 vulnerabilities.
- Missing and sanitized-example production configs exited nonzero. A synthetic valid production config passed with the authoritative bundle ID and neither public value in Expo `extra`.
- All three workflow YAML files parsed. Publication/workflow/identity regressions passed.
- A fresh exact short gate passed with 100 active reservations, 165 allowed requests, one expected `SERVICE_BUSY`, zero non-injected failures, and zero leaked reservations:

```json
{"gate":"pass","failureCodes":[],"capacityPeakReservations":100,"requests":166,"nonInjectedRequests":165,"nonInjectedFailures":0,"nonInjectedFailureRate":0,"statusCounts":{"200":165,"503":1},"codeCounts":{"allowed":165,"SERVICE_BUSY":1},"latencyMs":{"p50":1569.9429999999993,"p95":1585.0259999999998,"p99":1835.8948330000003},"activeReservations":0}
```

No credential, deployment, signed build, device purchase, TestFlight action, App Store submission, review outcome, publication, or external URL availability is inferred from this follow-up.

## Second re-review: interpretation and product-truth alignment

This pass started from `5e801b322fc30b3c1704fca48a2014ff3554bd10`. It preserved and did not stage the user-owned `server/ai-proxy/src/rateLimit.ts` edit or the untracked readiness plan.

### Second-pass RED evidence

- Root focused: 3 files / 13 tests, with 3 expected failures and 10 passes. Failures proved that deterministic/demo interpretation values were still direct speaker-state assertions, rendered panel values lacked context caveats, and the approved spec/plan still described entitlement-month resets and Pro-gated Trends.
- Mobile production config: 40 tests, with 2 expected failures and 38 passes. The only failures were `.alt` and its subdomain.

### Second-pass implementation

- Added `.alt` to the fail-closed special-use DNS suffix policy and covered both the suffix and a nested subdomain with value-free errors.
- Replaced every local `HIDDEN` value, every `DEMO_RESULT.hidden_meaning`, and every rendered `DiagnosisPanel` interpretation with an explicit `may`, `might`, or `could` hedge plus `context can change that interpretation`. None asserts `I am`, `I feel`, `I care`, or `I need` as another person's state.
- Reconciled the approved monetization design and implementation plan: Private Trends is free/local; paid value is removal of the 10-report cap plus larger remote fair-use allowances; Free uses a rolling 30-day window; Pro uses a UTC calendar month. Task 6 Step 5 now instructs free local aggregation for both tiers and contains no upgrade route.

### Second-pass verification

- Focused green: root 3 files / 13 tests and mobile config 40/40.
- Full root: 12 files / 55 tests, zero-warning lint, and production build passed under Node 22. The existing 1,467.40 kB large-chunk warning remains visible.
- Full mobile: 38 suites / 358 tests, TypeScript, declared lint, Expo Doctor 18/18, and iOS export passed under Node 22; export again bundled 1,494 modules into a 5.96 MB Hermes bundle.
- Actual production-config probes rejected both `worker.alt` and `api.worker.alt`; a synthetic valid origin passed without either public value in Expo `extra`.
- The tracked plus built-output secret scan and 4 files / 13 relevant publication, release-identity, documentation-consistency, and customer-copy tests passed.
- Final state scans found no entitlement-month, rolling-entitlement-window, Pro-gated Trends, or Trends upgrade-route instruction in the approved spec/plan. Direct first-person speaker-state assertions remain only inside example conversation text, not possible-interpretation values.
- Worker code was untouched in this pass; the controller retains final full-Worker verification responsibility.

No external pending item or release-state label changed. This pass does not claim credentials, deployment, a signed build, device purchases, TestFlight, submission, review, publication, or live URL availability.

## Whole-branch release-gap closure

This pass started from `4aa44239e7de60375b66537c0bed59a5a3cc76bb`. It preserved and will not stage the user-owned `server/ai-proxy/src/rateLimit.ts` modification or the untracked `docs/superpowers/plans/2026-08-07-convoautopsy-app-store-readiness.md` file.

### Initial audit RED evidence

- Web focused: 8 files failed, with 21 failures and 20 passes. The failures covered the current consent version, guest-first migration/deletion, exact outbound-data review, and strict proxy response correlation.
- Mobile focused: after correcting a test-only `import.meta` transform issue, 6 suites failed and 1 passed, with 12 failures and 100 passes. The failures covered editable possible-interpretation review, bounded analysis reads, billing-identity fail-closed behavior, a single billing source of truth, support ID, and server-derived reset timing.
- Worker focused: 6 files failed, with 11 failures and 67 passes. The failures covered the 80% budget warning, rolling provider circuit/refunds, shared-NAT safety, deterministic route mix, and the load-runner contract.

### Implemented closure

- Updated browser and mobile AI consent to `2026-08-07` and retained explicit reviewed-data, provider, pseudonymity, and local fallback disclosures.
- Replaced the browser's retired plaintext local-account simulation with a browser-local guest profile. Only the current legacy session is migrated; credentials are never read. Legacy data is removed only after every required replacement value is written and read back, and blocked browser storage cannot crash guest startup.
- Added editable exact outbound-data review for browser analysis and response drafting. Message text and possible interpretations are immutable after confirmation, confirmation is deduplicated, malformed required fields fail closed without fetch, and a matching nonempty `x-request-id` is required.
- Added a typed `Delete All` browser path with visible partial failure/retry and a persistent, scoped success statement that does not claim provider, backup, or subscription deletion.
- Added editable mobile review/redaction for `possibleInterpretation`, bounded streamed analysis parsing, Expo's streaming native fetch as the default for both AI routes, and a Jest-only Expo-fetch mapping rather than falling back to React Native's non-streaming response implementation.
- Consolidated remote billing identity through `BillingProvider`, added a copyable pseudonymous support ID, failed remote requests closed until the identity is ready, and preserved a verified identity after normal purchase cancellation.
- Rendered allowance reset durations from validated server `retryAfterSeconds` values rather than fixed client copy.
- Added a closed 80% provider-budget signal, atomic quota/budget/in-flight refund accounting, a five-failure rolling availability circuit with a 30-second cooldown and one half-open probe, and retention-safe accounting for leases that cross UTC day/month boundaries.
- Split invalid/caller-influenced model output from provider availability failures: both are refunded, but only availability/timeouts can advance the global outage circuit.
- Added a shared-NAT-safe production rate limiter with strict per-install limits and higher IP ceilings. The load runner now reuses exactly 100 installations behind `198.18.0.1`, rotates each installation across routes, enforces an exact 70/30 non-injected mix, verifies 100/101 capacity, and intentionally proves repeated-token `RATE_LIMITED` behavior.

### Additional review RED/GREEN evidence

- Web cleanup RED: 3 failures / 30 passes proved missing reviewed fields were string-coerced and the delete-all success scope disappeared after modal close. GREEN: 3 files / 33 tests.
- Storage-denied startup RED under Node 22: 1 failure / 3 passes. Migration write-failure RED then proved legacy data was deleted after a quota error. GREEN: 5/5 storage tests.
- Mobile audit RED: 2 failures / 45 passes proved the analysis default used the incompatible React Native fetch and purchase cancellation cleared a known identity. Both focused tests passed after implementation. A subsequent full-suite RED exposed Expo native classes in Jest; the Jest-only module mapping closed that test-environment issue while production retained Expo fetch.
- Worker/load audit RED: 3 files, 6 failures / 63 passes. The failures reproduced cross-midnight refund loss, invalid-output circuit poisoning, a 1,001-token instead of 100-token cohort, absent exact-mix/throttle assertions, and injected-route counting. GREEN: 3 files / 69 tests.
- Long-profile route rotation RED: 1 focused failure showed one installation received 10/10 analysis routes. GREEN: the same installation receives exactly 7 analysis and 3 response routes across ten cohort cycles while every 100-request block remains 70/30.

### Fresh final verification

- Web: 15 files / 73 tests; zero-warning ESLint; production Vite build. The existing large-chunk warning remains visible at 1,472.93 kB / 411.34 kB gzip.
- Mobile: 38 suites / 367 tests; TypeScript; Expo lint; Expo Doctor 18/18; iOS export with 1,495 modules and a 5.97 MB Hermes bundle.
- Worker: 11 files / 137 tests; TypeScript; zero-warning ESLint; production dry build at 206.27 KiB / 38.29 KiB gzip; fixture dry build at 213.75 KiB / 40.70 KiB gzip.
- Redacted tracked plus web/mobile/production-Worker/fixture-Worker secret scan passed.
- Root, mobile, and Worker production dependency audits each returned `found 0 vulnerabilities`.
- `git diff --check` passed.
- The first direct Expo Doctor lookup attempted under the system Node 26 runtime could not resolve a local command. The declared `npx --yes expo-doctor` command under Node 22 then passed all 18 checks; the failed attempt is not treated as evidence.

Final deterministic short gate:

```json
{"gate":"pass","failureCodes":[],"capacityPeakReservations":100,"requests":182,"nonInjectedRequests":170,"nonInjectedFailures":0,"nonInjectedFailureRate":0,"statusCounts":{"200":178,"429":3,"503":1},"codeCounts":{"allowed":178,"RATE_LIMITED":3,"SERVICE_BUSY":1},"routeCounts":{"/v1/analyses":119,"/v1/responses":51},"latencyMs":{"p50":1584.3293749999993,"p95":1602.9537920000002,"p99":1992.454667},"activeReservations":0}
```

The three 429 samples are intentional injected repeated-token probes. There were zero non-injected failures, the non-injected routes were exactly 70/30, the expected 101st capacity request returned `SERVICE_BUSY`, and final reservations were zero.

### Changed-path inventory

- Web/docs: `README.md`, `docs/operations/convoautopsy-ai-runbook.md`, `public/privacy.html`, `src/App.jsx`, `src/components/AiConsentModal.jsx`, `src/components/Onboarding.jsx`, `src/components/RemoteDataReview.jsx`, `src/components/RemoteDataReview.test.jsx`, `src/components/ResponseCrafter.jsx`, `src/components/ResponseCrafter.test.jsx`, `src/index.css`, `src/pages/Dashboard.jsx`, `src/pages/Dashboard.test.jsx`, `src/pages/LandingPage.jsx`, `src/utils/aiConsent.js`, `src/utils/aiConsent.test.js`, `src/utils/analyzeConversation.js`, `src/utils/analyzeConversation.test.js`, `src/utils/craftResponse.js`, `src/utils/craftResponse.test.js`, `src/utils/customerCopy.test.js`, `src/utils/storage.js`, and `src/utils/storage.test.js`.
- Mobile: `mobile/package.json`, `mobile/__mocks__/expo-fetch.ts`, `mobile/__tests__/aiClient.test.ts`, `mobile/__tests__/billingProvider.test.tsx`, `mobile/__tests__/legalCopy.test.tsx`, `mobile/__tests__/previewSessionLifecycle.test.tsx`, `mobile/__tests__/remoteAnalysisFlow.test.tsx`, `mobile/__tests__/remoteDataReview.test.tsx`, `mobile/__tests__/reportRevisionScreens.test.tsx`, `mobile/__tests__/responseFlow.test.tsx`, `mobile/__tests__/settings.test.tsx`, `mobile/app/(tabs)/settings.tsx`, `mobile/app/preview.tsx`, `mobile/app/privacy.tsx`, `mobile/app/response/[reportId].tsx`, `mobile/src/billing/BillingProvider.tsx`, `mobile/src/components/RemoteDataReview.tsx`, `mobile/src/services/aiClient.ts`, and `mobile/src/services/retryTiming.ts`.
- Worker/load: `server/ai-proxy/scripts/load-gate-core.d.mts`, `server/ai-proxy/scripts/load-gate-core.mjs`, `server/ai-proxy/scripts/load-gate.mjs`, `server/ai-proxy/src/admission.ts`, `server/ai-proxy/src/fairRateLimit.ts`, `server/ai-proxy/src/index.ts`, `server/ai-proxy/src/loadFixture.ts`, `server/ai-proxy/src/metrics.ts`, `server/ai-proxy/test/admission.test.ts`, `server/ai-proxy/test/fairRateLimit.test.ts`, `server/ai-proxy/test/loadGate.test.ts`, `server/ai-proxy/test/logging.test.ts`, `server/ai-proxy/test/metrics.test.ts`, `server/ai-proxy/test/rateLimit.test.ts`, and `server/ai-proxy/test/worker.test.ts`.
- Evidence: `.superpowers/sdd/2026-08-07-convoautopsy-25k-foundation/task-8b-report.md`.

No credential, deployment, signed binary, physical-device purchase/restore result, TestFlight action, App Store Connect submission, Apple review outcome, publication, or live URL availability is claimed by this pass. Those remain external release gates.

### Final independent circuit review

The final read-only review found one additional half-open edge and it was closed before commit. RED: the new admission regression failed 1/34 because an `invalid_output` completion refunded and deleted the sole probe lease but left the circuit permanently `half_open`; the next reservation returned the dead-state one-second rejection instead of a bounded cooldown. GREEN: invalid output from the half-open probe now reopens the circuit at the completion time without recording an additional provider-availability failure, while invalid output from an ordinary closed-state request still cannot advance the outage circuit. After one 30-second cooldown, a new probe can recover the circuit.

Fresh Node 22 evidence after that fix: focused admission 34/34; full Worker 11 files / 138 tests; TypeScript; zero-warning ESLint; production dry build at 206.35 KiB / 38.29 KiB gzip; fixture dry build at 213.83 KiB / 40.70 KiB gzip. The final deterministic load gate again passed with exact 70/30 ordinary route mix, 100/101 capacity enforcement, three intentional abusive-token throttles, zero non-injected failures, and zero leaked reservations:

```json
{"gate":"pass","failureCodes":[],"capacityPeakReservations":100,"requests":182,"nonInjectedRequests":170,"nonInjectedFailures":0,"nonInjectedFailureRate":0,"statusCounts":{"200":178,"429":3,"503":1},"codeCounts":{"allowed":178,"RATE_LIMITED":3,"SERVICE_BUSY":1},"routeCounts":{"/v1/analyses":119,"/v1/responses":51},"latencyMs":{"p50":1541.1757080000007,"p95":1560.801292,"p99":1940.1609169999992},"activeReservations":0}
```

## Accounting and client-truth hardening

This final pass started from `9c6c24d425ccc9439fffcd2a5a90f46042a43b34`. It preserved and will not stage the user-owned `server/ai-proxy/src/rateLimit.ts` modification or the untracked `docs/superpowers/plans/2026-08-07-convoautopsy-app-store-readiness.md` file.

### Strict RED evidence

- The first Worker hardening baseline had 7 failures / 32 passes; the consolidated Worker RED set reached 50 failures / 83 passes. The failures covered completion truth, outcome-specific refunds, expired leases, circuit classification, entitlement uncertainty, stable customer subjects, response bounds, provider deadlines and prompt contracts, and truthful load planning.
- Mobile began with 8 failing suites and 29 failures / 118 passes. The failures covered stale billing/catalog races, identity readiness, local-save behavior while billing was unresolved, cross-surface error truth, consent lifecycle, exact recipient disclosure, post-redaction request limits, and immutable reviewed payloads.
- Web began with 6 failing files and 17 failures / 22 passes. The failures covered malformed recovery state, report resurrection, uncertain writes, fail-closed deletion, exact review limits, recipient truth, and current consent enforcement.
- Incremental RED cases then reproduced: a supplied RevenueCat ID being treated as Free during verification failure; a provider invocation losing global cost accounting; success returned before durable completion; cross-period expired leases; stale subscriber/catalog completion; malformed and partially committed web migration; failed one-report deletion hidden from the UI; an uncooperative initial provider fetch; an obsolete exact consent version; unavailable native billing identity; unresolved billing preventing offline Free saves; web and mobile outgoing values expanding past limits after redaction; underspecified/inference-overclaiming provider prompts; credential values being read during Delete All; a 60/30-second load default instead of the approved 3,600/300-second profile; implicit real-provider durations; and an inbound stream that never closed before rate limiting.
- The stalled-body regression was captured by two tests that remained pending after 75 ms before implementation. A subsequent full Worker run caught the changed pre-aborted response contract; coverage was split so a pre-aborted body now proves safe `INVALID_REQUEST`/408 before accounting, while a coordinated abort after reservation proves the exact `pre_provider_abort` completion and both refunds.
- The mobile release typecheck caught a review-conversion type mismatch after runtime tests were green. The review state and conversion boundary now use truthful reviewable-message types; the focused 32-test response suite and TypeScript gate passed afterward.

### Implemented hardening

- Admission now accounts by observable outcome: unusable invoked-provider results refund the user's allowance but retain provider units; only a proven pre-provider abort refunds both. Completion is idempotent, bounded-retry, and required before success. Expired unresolved leases release capacity, refund user allowance, retain provider cost, and record only a content-free reconciliation event.
- Availability, caller/content rejection, configuration failure, invalid output, and half-open-probe behavior have distinct circuit semantics. Corrupt/unavailable admission state fails closed.
- A supplied RevenueCat ID that cannot be verified is `unknown` and cannot enter admission; only an absent ID is verified Free. Customer admission subjects remain stable across installation rotation.
- Worker, mobile, and web share the bounded remote response contract: at most 10 messages, 280 Unicode code points per message, and 150 per possible interpretation. Mobile and web validate the actual post-redaction outgoing values.
- Provider input has bounded initial-fetch and body-read deadlines, exact JSON keys/enums/order requirements, untrusted-data instructions, tentative `may`/`might` interpretation language, no diagnosis/hidden-intent/deception/certainty claims, and explicit draft-only/no-auto-send behavior.
- Inbound request bodies have a 128 KiB cap plus a 5-second overall wall deadline. Every stream read races the remaining deadline and request abort signal; timeout/abort returns a content-free `INVALID_REQUEST`/408, performs best-effort non-awaited cancellation, and reaches no rate-limit, entitlement, admission, or provider work.
- Billing catalog refreshes cannot let stale completions overwrite current state. Remote AI requires both verified entitlement state and a ready pseudonymous billing identity, while unresolved billing still receives the conservative Free 10-report local-history gate and never disables local analysis.
- Browser recovery is committed/idempotent, cannot resurrect retired reports after a committed migration, verifies uncertain writes, and surfaces retryable partial cleanup. One-report and Delete All paths fail closed, retain UI truth on uncertainty, verify final app-owned key state, and never read a retired credential value.
- Consent version `2026-08-07.2` is enforced across web, mobile, Worker, and load fixtures. Recipient copy distinguishes Cloudflare/ConvoAutopsy technical fields, RevenueCat entitlement verification, and only the reviewed conversation fields forwarded to Groq. Speaker-label pseudonymization no longer overclaims removal of names inside message text.
- The full deterministic load default is the approved stub-only 3,600 seconds at 5 RPS plus 300 seconds at 20 RPS: exactly 24,000 requests, 16,800 analyses, 7,200 drafts, and 57,600 planned provider units with no real provider spend. A machine-readable plan prints before work. Non-loopback targets require provider authorization, synthetic-content acknowledgement, and both explicit duration bounds.

### Fresh final Node 22 verification

- Web: 15 files / 109 tests passed; zero-warning ESLint passed; production Vite build passed at 1,488.59 kB / 415.47 kB gzip with the existing large-chunk warning.
- Mobile: 38 suites / 401 tests passed; TypeScript and Expo lint passed; Expo Doctor passed 18/18; iOS export passed with 1,496 modules and a 5.98 MB Hermes bundle.
- Worker: 11 files / 186 tests passed; TypeScript and zero-warning ESLint passed; production dry build passed at 216.80 KiB / 40.55 KiB gzip; fixture dry build passed at 224.28 KiB / 42.72 KiB gzip.
- The tracked plus web/mobile/production-Worker/fixture-Worker secret scan passed. Root, mobile, and Worker production dependency audits each returned `found 0 vulnerabilities`.
- Final deterministic CI gate printed its plan before work and passed: 70 ordinary requests in an exact 49-analysis / 21-response mix, 100 peak reservations, one expected 101st-request `SERVICE_BUSY`, one intentional abusive-token `RATE_LIMITED`, zero ordinary failures, p95 88.73 ms, p99 98.15 ms, and zero final reservations.
- Independent final read-only review reported no remaining concrete code blocker. Its combined focused checks passed Worker 159/159, mobile 80/80, web 51/51, and `git diff --check`.

The approximately 65-minute full 24,000-request stub soak was not executed in this pass; its duration, counts, and safety contract are unit-verified and the actual CI mechanism was exercised. The oldest-supported physical iPhone 10,000-report performance gate also remains unobserved. Both stay explicit release evidence gates. No deployment, credential configuration, signed build, physical-device purchase/restore result, TestFlight action, App Store submission, review, publication, or live-listing availability is claimed.

## Final abort and remote-result contract follow-up

This separate follow-up started from `60195e408adf5a2ce2f650b9a7ac6265f8bace6f`. It preserved and will not stage the user-owned `server/ai-proxy/src/rateLimit.ts` modification or the untracked readiness plan.

### Strict RED and GREEN

- Worker RED: 2/2 new analysis/response tests failed because a caller abort while provider work was pending still returned HTTP 200 and completed success accounting. Independent review then found the smaller abort-during-success-completion interval: the route returned 200, and a second `caller_error` completion left usage at one instead of zero. Receipt-lifecycle RED proved no cleanup alarm was scheduled, and a UTC month rollover deleted the allowance needed for compensation and produced `INTERNAL_ERROR`. A final Worker RED lost all three success-completion responses after the Durable Object had committed success; the route correctly withheld the result but never issued `caller_error`, leaving the user charged. GREEN: the complete focused admission plus route set passed 90/90. A pre-aborted request remains `INVALID_REQUEST`/408 before accounting, and an abort after reservation but before invocation still uses `pre_provider_abort` and refunds both counters.
- Mobile RED: 6 new cases failed because remote output accepted 11 messages, 281-code-point text, a 151-code-point interpretation, substituted sender/text, and reordered messages. Strict extra-key/type cases were already fail-closed. GREEN: the client/consumer focused suites passed 83/83.
- Web RED: 4 new cases failed because remote output accepted a 151-code-point interpretation, substituted sender/text, and reordered messages. Existing checks already rejected 11 messages, 281-code-point text, extra keys, and wrong types. GREEN: the focused remote-analysis suite passed 24/24.

### Implemented behavior

- Both analysis and response routes now recheck the caller signal after invoked provider work returns and on both sides of durable success completion. An observed post-invocation abort completes with `caller_error`, refunds user allowance, retains the already-spent global provider units, releases the lease, and returns only a safe `INVALID_REQUEST`/408 envelope. The tests independently verify retained costs of three analysis units and one response unit, zero allowance, zero in-flight leases, and no delivered provider result.
- Successful completion retains a content-free, 60-second compensatable receipt containing only pseudonymous accounting fields. The receipt makes the post-success abort correction idempotent, protects its exact plan/budget rows across UTC retention advancement, participates in the Durable Object's earliest accounting alarm, and expires without refunding work that was actually delivered.
- If durable success accounting cannot be confirmed after all bounded retries, the Worker performs bounded best-effort `caller_error` compensation before rethrowing the original retryable accounting failure. This is idempotent whether success committed or not: an undelivered result refunds user allowance and retains invoked-provider cost, while a fully unavailable coordinator remains protected by lease expiry.
- Mobile and web now use dedicated remote-analysis result validators instead of the general on-device schema. They require strict keys/types/enums, `mode: ai`, no more than 10 messages, no more than 280 Unicode code points of message text, and no more than 150 Unicode code points of possible interpretation.
- Each client validates exact sender/text identity and order against a frozen internal copy of the immutable reviewed snapshot. Mobile maps a mismatch to `INVALID_RESPONSE`; its screen flow proves the invalid result cannot expose an AI result, Save action, or response-drafting entry and retains the on-device alternative. Web discards invalid output and constructs a fresh local `REMOTE_UNAVAILABLE` fallback. General on-device analysis limits were not changed.

### Fresh final Node 22 evidence

- Web: 15 files / 119 tests; zero-warning ESLint; production build at 1,488.72 kB / 415.47 kB gzip with only the existing large-chunk warning.
- Mobile: 38 suites / 410 tests; TypeScript; Expo lint; Expo Doctor 18/18; iOS export with 1,497 modules, 23 assets, and a 5.98 MB Hermes bundle.
- Worker: 11 files / 193 tests; TypeScript; zero-warning ESLint; production dry build at 220.38 KiB / 41.02 KiB gzip; fixture dry build at 227.86 KiB / 43.17 KiB gzip.
- The final short fixture gate passed with the printed 70-request plan, exact 49/21 route mix, 100 peak reservations, expected `SERVICE_BUSY` and injected `RATE_LIMITED`, zero ordinary failures, p95 48.71 ms, p99 55.51 ms, and zero final reservations.
- Tracked and built-output secret scanning passed. Root, mobile, and Worker production audits each reported zero vulnerabilities. `git diff --check` passed.
- Final independent read-only review reported no blocker or important issue; its focused admission and route set passed 90/90, TypeScript passed, and targeted diff checking was clean.

No external release state is inferred or claimed by this follow-up.
