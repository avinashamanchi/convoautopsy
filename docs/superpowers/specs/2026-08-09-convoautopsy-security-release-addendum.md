# ConvoAutopsy Security, Capacity, and App Review Addendum

**Status:** Approved through the owner's standing approval on 2026-08-09.
**Extends:** `2026-08-07-convoautopsy-25k-monetization-design.md`.

## Outcome and claims

ConvoAutopsy remains guest-first and local-first. Reviewed conversation text may leave the device only after explicit consent and redaction review. This work aims to make compromise materially harder and overload safe; it cannot make an Internet-connected product “unhackable” or guarantee App Review approval.

The capacity contract is 25,000 MAU and 1,000 foreground sessions. Remote AI is deliberately bounded separately: excess requests receive a content-free `429` or `503` with retry guidance instead of creating an unbounded queue or provider bill.

## Selected approach

Keep the existing Expo client and Cloudflare Worker. Do not replatform or weaken the local-first boundary. Add server-issued installation identity, bind paid identity to that installation, preserve the existing global admission and daily-budget controls, and require repeatable abuse/load evidence before release.

## Trust boundaries and required controls

- Treat every mobile header, installation identifier, RevenueCat identifier, IP header, and AI response as attacker-controlled until verified.
- Replace arbitrary client-chosen installation tokens with a short-lived, signed server credential. Rotation must not reset quota and replay must not cross installations.
- Bind the RevenueCat app-user identity used for entitlement checks to the verified installation credential. A copied identifier alone must never grant Pro admission.
- Keep per-installation, per-network, plan-quota, global-concurrency, and daily-provider-budget checks. Admission and quota consumption must be atomic and idempotent.
- Preserve body caps, deadlines, strict input/output schemas, safe logs, strict browser CORS, HTTPS-only production configuration, and content-free public errors.
- App Attest or DeviceCheck is defense in depth for signed development/production builds, not a substitute for server authorization and not an Expo Go gate.

## Capacity and failure design

- A 1,000-session synthetic test proves the client and gateway stay responsive; it does not authorize 1,000 simultaneous AI calls.
- The AI capacity gate retains the product's designed concurrency ceiling. A burst beyond the ceiling must shed load within a bounded deadline and include `Retry-After`.
- Cloudflare Durable Objects must not become an accidental high-throughput singleton. Shard only after measured evidence shows the current admission object is the bottleneck, while retaining one authoritative daily budget.
- Metrics may include status, duration, bucketed sizes, plan, and hashed identifiers; they may never include conversation content, reports, prompts, provider responses, or raw tokens.

## App Store release design

- The privacy policy, terms, and support URLs must be public HTTPS pages and must match the App Privacy answers and AI-provider disclosure.
- The app must explain that reviewed text is sent to an AI provider and obtain affirmative consent before the first transmission.
- Digital Pro features use Apple in-app purchase through RevenueCat. Purchase, cancellation, pending, restore, expiry, refund, and revoked entitlement states must be visible and testable.
- Screenshots must show real in-app screens with fictional data, disclose paid features, and avoid unsupported mental-health, relationship, or accuracy claims.
- A signed Xcode 26 / iOS 26 SDK archive, generated privacy report, VoiceOver/Dynamic Type pass, TestFlight purchase test, live backend, and detailed review notes are external release gates.

## Verification order

1. Write attacks first: quota reset, stolen paid identifier, replay, malformed/bomb bodies, timeout, overload, log leakage, and dependency/config regressions.
2. Implement signed installation enrollment and entitlement binding without changing the analysis schema.
3. Run focused tests, full client/Worker suites, secret and dependency scans, Expo export, and local load/abuse fixtures.
4. Record signed-device, provider-console, legal-URL, and App Store Connect evidence separately; absence of this evidence remains BLOCKED, never PASS.

## Non-goals

No social network, user-to-user content, silent cloud transcript storage, ad tracking, custom card payments, or claim that a local/Expo test is a production capacity or App Review result.
