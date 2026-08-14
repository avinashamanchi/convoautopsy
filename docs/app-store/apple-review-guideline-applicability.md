# ConvoAutopsy — Apple App Review guideline applicability

Reviewed against Apple's App Review overview and App Review Guidelines on 2026-08-14. This matrix records source decisions and external gates; it cannot guarantee Apple's independent review outcome.

| Guideline | Status | ConvoAutopsy decision and evidence |
| --- | --- | --- |
| 1.1 Objectionable content | IMPLEMENTED | The app analyzes private user-provided conversations and does not provide a public catalog. Terms prohibit harassment, surveillance, threats, defamation, privacy violations, and illegal use. |
| 1.2 User-generated content | N/A | No public posting, feed, profiles, following, matching, anonymous chat, or user-to-user distribution. If community sharing is added, moderation/report/block/contact controls are mandatory first. |
| 1.3 Kids Category | N/A | Personal reflection app not directed to children and not submitted to Kids Category. |
| 1.4 Physical harm | IMPLEMENTED | Educational reflection only; not medical, mental-health, legal, relationship, crisis, or professional advice. Emergency and no-factual-conclusion language is in the terms and UI. |
| 1.5 Developer information | EXTERNAL GATE | Accurate seller, review contact, support contact, and legal entity must be entered in App Store Connect. |
| 1.6 Data security | IMPLEMENTED + EXTERNAL GATE | Local SQLite, exact-data review, consent, pseudonymous tokens, signed requests, quotas, rate/cost limits, deletion, and tests exist. Deployed Worker/Groq/RevenueCat and signed archive evidence remain external. |
| 1.7 Reporting criminal activity | N/A | No crime-reporting feature. |
| 2.1 App completeness | EXTERNAL GATE | Do not submit until local and remote paths, OCR, legal links, providers, subscriptions, deletion, offline behavior, and exact candidate are fully working without placeholders. |
| 2.2 Beta testing | EXTERNAL GATE | Development/TestFlight only for unfinished builds; no beta/demo/test language in production metadata. |
| 2.3 Accurate metadata | IMPLEMENTED + EXTERNAL GATE | Drafts state on-device vs AI behavior, exact limits, no automatic messaging, claims, and subscriptions. Final screenshots/forms must match the signed build. |
| 2.4 Hardware compatibility | IMPLEMENTED + EXTERNAL GATE | iPhone-only portrait v1, native OCR module, local mode, bounded histories, accessible controls. Verify signed OCR, memory, Dynamic Type/VoiceOver, and disable untested Mac/Vision availability. |
| 2.5 Software requirements | IMPLEMENTED + EXTERNAL GATE | Public APIs, HTTPS, sandbox, no executable download/background mode, Files/photo picker and clear photo purpose string. Archive manifest and IPv6-only checks remain. |
| 3.1.1 In-App Purchase | IMPLEMENTED + EXTERNAL GATE | Digital Convo Pro uses Apple IAP via RevenueCat only. StoreKit-localized purchase, restore, management, Free continuation, privacy, and terms are coded; products/signed testing remain external. |
| 3.1.2 Subscriptions | IMPLEMENTED + EXTERNAL GATE | Monthly/annual Pro supplies ongoing remote allowance and storage value. Full localized price/period, renewal, cancellation, restore, uninstall, and fair-use limits are disclosed. |
| 3.1.3 Other purchase methods and 3.2 | N/A | No external digital checkout, reader content, ads, crypto, lending, banking, or enterprise-only service. |
| 4.1 Copycats | IMPLEMENTED | Original brand/workflow; verify final assets and screenshots. |
| 4.2 Minimum functionality | IMPLEMENTED | Native on-device parsing/analysis/drafts, OCR import, private reports/trends, exact-data AI review, deletion, and sharing—not a web clipping. |
| 4.3 Spam | IMPLEMENTED | Distinct conversation-reflection purpose; do not reuse other-app metadata, screenshots, icons, or binaries. |
| 4.4–4.7 Extensions/Apple services/alternate icons/mini apps | N/A | None present. |
| 4.8 Login services | N/A | No ConvoAutopsy account/login. Account creation cannot ship without account deletion and login-service review. |
| 4.9 Apple Pay | N/A | No physical-goods checkout or Apple Pay. |
| 4.10 Built-in capabilities | IMPLEMENTED | Pro gates workflow/remote allowance, not the photo picker or another built-in capability itself. |
| 5.1 Privacy | IMPLEMENTED + EXTERNAL GATE | In-app/static copy enumerates local fields, exact remote fields, Cloudflare/Groq/RevenueCat, identifiers, retention, backups, consent revocation, deletion, and no tracking. Public pages and provider settings must match. |
| 5.1.1 Collection/minimization | IMPLEMENTED | Local path needs no network. Remote text is user-reviewed, editable where meaningful, and sent only after consent; no contacts, ads, or automatic messages. |
| 5.1.1(v) Account deletion | N/A | No app account. Delete All handles app-controlled local data with explicit limits/retry. Adding account creation makes in-app account deletion mandatory. |
| 5.1.2 Data use/sharing | IMPLEMENTED + EXTERNAL GATE | Exact fields are shown before third-party AI processing; technical IDs are disclosed and not forwarded to Groq. Verify provider retention, contracts, deployed purge behavior, and privacy labels. |
| 5.2 Intellectual property | IMPLEMENTED + EXTERNAL GATE | Users must have rights/permission to process conversations; verify bundled/screenshot assets and seller copyright. |
| 5.3–5.5 Gambling/VPN/device management | N/A | None present. |
| 5.6 Developer conduct | EXTERNAL GATE | Honest safety/AI claims, accurate privacy answers, functional support, no review manipulation, and responsive review communication are required. |

## 2026 submission questionnaire decision

- **Social media capabilities: No.** ConvoAutopsy has no social feed or discovery surface and cannot redistribute, amplify, or expose user-generated content to many users. Private analysis and a user-invoked share sheet do not publish content to a many-user discovery surface. Enter `No` for Apple's social-media capability question; this answer becomes submission-blocking in September 2026. Re-review this decision before adding any public feed, discovery, community, or many-user sharing feature.
- Apple has required uploads to use the iOS 26 SDK or later since April 28, 2026. The repository remains on Expo SDK 54 for the already-tested iOS 15.1+ product surface; Expo's current `sdk-54` EAS image uses Xcode 26.0. The final build log and processed archive must still prove the actual SDK. Expo Go remains preview-only; production acceptance requires a signed development/TestFlight build.

## Submission-stopping external gates

- Privacy, Terms, and Support return HTTPS 200 and match the released app and deployed Worker/provider retention.
- Cloudflare/Groq and RevenueCat configuration is live; product/entitlement/offering/webhook/transfer behavior is measured.
- The signed candidate passes local mode, exact-data remote consent, OCR/photo permission, offline/error paths, Delete All, purchase/restore/refund/reinstall/transfer, accessibility, privacy-manifest, crash, and IPv6-only tests.
- Screenshots use synthetic conversations, never private messages, and accurately show the submitted build/device sizes.
- Paid Apps Agreement, tax/banking, age rating, App Privacy, content rights, category, DSA status, availability, export compliance, and IAP metadata are complete.
- Historical deployed-proxy token revocation/purge behavior is verified before release.

Optional offer codes, win-back, Family Sharing, promoted IAP, custom product pages, and alternative payments remain disabled for v1.
