# ConvoAutopsy monetization and release setup

This packet records the repository-controlled choices and the credentialed work that remains. It is not evidence that Apple, RevenueCat, Cloudflare, Expo, TestFlight, or App Store configuration has been completed.

## Fixed product identity

| Item | Exact value |
|---|---|
| iOS bundle ID | `com.avinashamanchi.convoautopsy` |
| RevenueCat entitlement | `convo_pro` |
| Monthly product | `com.avinashamanchi.convoautopsy.pro.monthly` |
| Annual product | `com.avinashamanchi.convoautopsy.pro.annual` |
| Free local usage | Unlimited on-device analyses and drafts; up to 10 saved reports |
| Private Trends | Free on both tiers; computed locally from reports saved on the device |
| Free remote fair use | 3 analyses and 6 AI-assisted drafts per rolling 30 days |
| Pro local usage | Unlimited on-device analyses, drafts, and saved reports |
| Pro remote fair use | 75 analyses and 150 AI-assisted drafts per UTC calendar month |

Remote allowances are service fair-use limits, not credits, and do not roll over. The app derives monthly/annual labels from the configured product IDs and renders the App Store localized price supplied by RevenueCat. No price belongs in source code or this packet.

Private Trends is not a subscription benefit. The paid value proposition is unlimited saved reports instead of the 10-report Free cap, plus the larger disclosed remote fair-use allowances.

## Repository configuration map

- `mobile/app.config.ts`: bundle ID, iPhone-only declaration, no Sign in with Apple capability, and the fail-closed production environment guard.
- `mobile/eas.json`: credential-free store build profile with remote versioning and automatic build-number increment.
- `mobile/src/billing/contracts.ts`: entitlement and product IDs plus billing periods.
- `mobile/src/billing/revenueCatService.ts`: current-offering lookup, purchase, restore, and entitlement listener.
- `mobile/app/upgrade.tsx`: localized offer presentation, allowances, renewal/cancellation disclosure, restore, and Continue Free.
- `mobile/app/trends.tsx`: free, on-device summaries with no entitlement gate or upgrade route.
- `server/ai-proxy/src/entitlements.ts`: server-side `convo_pro` verification and five-minute content-free entitlement cache.
- `server/ai-proxy/wrangler.jsonc`: production bindings and content-free daily provider budget; it contains no credentials.

## Apple setup — external and pending

1. Confirm Apple Developer Program membership, agreements, tax, and banking. If enrolling as an organization, obtain and validate the organization’s D-U-N-S record; do not treat D-U-N-S as required for an individual enrollment.
2. Register `com.avinashamanchi.convoautopsy` and create the App Store Connect app record.
3. Create one subscription group named `Convo Pro` and the exact monthly and annual products above. Set durations, availability, localized display names/descriptions, and prices in App Store Connect.
4. Complete subscription review information, App Privacy, age rating, export compliance, and all required agreements. Do not copy the draft privacy answers without checking the exact candidate and Apple’s current definitions.
5. Build with production EAS variables, upload a signed candidate, and test buy, cancel, restore, renewal, expiration, billing retry, refund/revocation, offline launch, and account/device transfer in Sandbox/TestFlight.

## RevenueCat setup — external and pending

1. Create or select the iOS app with bundle ID `com.avinashamanchi.convoautopsy`; connect App Store Connect using RevenueCat’s supported credential flow.
2. Import both exact products, attach them to entitlement `convo_pro`, and place monthly and annual packages in the current offering. The client ignores unconfigured product IDs.
3. Configure the public Apple SDK key as the EAS environment variable `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`. It is client-visible by design. Never place a RevenueCat secret API key in an `EXPO_PUBLIC_` variable or `eas.json`.
4. Put `REVENUECAT_SECRET_API_KEY` only in the Cloudflare Worker secret store. Bind the production `ENTITLEMENT_CACHE` KV namespace. The Worker verifies entitlement on the server and does not trust a client Pro flag.
5. Recommended restore choice for this account-free, pseudonymous installation-ID app: select **Transfer purchases to the new App User ID** so Restore Purchases can move the App Store receipt entitlement to the current pseudonymous installation. Record and device-test the actual dashboard choice before release because transfer behavior is external configuration.
6. No webhook is required for v1 authorization; the request-time RevenueCat check is authoritative. Verify that no unreviewed webhook target is configured. A future webhook must authenticate the raw request, reject stale/replayed events, store event IDs idempotently, and tolerate at-least-once delivery before it can affect entitlement state.

## Cloudflare, Groq, and EAS — external and pending

- Cloudflare secrets, entered only through hidden secret prompts: `GROQ_API_KEY`, `REVENUECAT_SECRET_API_KEY`, and `RATE_LIMIT_HMAC_SECRET`.
- Cloudflare resources: production `RATE_LIMITER` and `AI_ADMISSION` Durable Objects, `ENTITLEMENT_CACHE` KV, `MAX_DAILY_PROVIDER_UNITS`, migrations, route/domain, and observability destination. Never use the local load-fixture Worker as production.
- EAS production public variables: `EXPO_PUBLIC_AI_PROXY_URL` as a credential-free HTTPS production origin and `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` as the non-placeholder `appl_` public key. Production config fails closed when either is missing or unsafe.
- Expo and Apple credentials belong in their managed credential stores, never Git, client-prefixed variables, workflow text, artifacts, or support reports.

## Test and rollback matrix

| Area | Required signed/external proof | Rollback or containment |
|---|---|---|
| Offer display | Monthly and annual localized price/period on at least two storefronts | Remove the affected package from the current RevenueCat offering; preserve Restore Purchases |
| Purchase/entitlement | Sandbox buy activates `convo_pro`; server verifies the same user ID | Remove product from offering, investigate receipts, and ship a corrected binary; never grant Pro from a client flag |
| Restore/transfer | Same Apple account restores on a fresh install under the recorded transfer setting | Revert the RevenueCat transfer setting only after impact review; tell testers which receipt/app-user ID owns access |
| Renewal/cancel/refund | Renewal, expiration, billing retry, cancellation, and refund/revocation update access | Use RevenueCat customer evidence and Apple transaction state; do not manually fabricate client entitlement |
| Provider cost/capacity | Short CI gate and manual 5 RPS/3,600 s, 20 RPS/300 s, then 100/101 local fixture gate | Lower the reviewed daily budget/circuit-open, roll back the Worker deployment, and retain local features |
| Private Trends | Free users can read local summaries without a purchase or network request | Keep Trends local and free; do not use it as a subscription-restoration signal |
| Mobile release | Signed purchase, restore, OCR, offline, VoiceOver, Dynamic Type, and legal-link checks | Stop phased release or remove the build from sale in App Store Connect; local data must remain readable |

## Release-state labels

- **Code-complete:** repository behavior, copy, scanner, workflows, and packet are implemented and reviewed.
- **Locally verified:** automated tests, type/lint, exports, dry builds, scans, audits, and the short fixture gate pass for the exact candidate.
- **External configuration pending:** Apple, RevenueCat, Cloudflare, Groq, EAS, legal URL, and account configuration are not inferred from repository files.
- **Signed device/TestFlight pending:** native purchases, restore, OCR, account transitions, accessibility, and screenshots require a signed build and device evidence.
- **App Store review/publication pending:** upload, forms, review outcome, listing, and public availability require direct App Store Connect evidence.
