# ConvoAutopsy AI Operations Runbook

## Scope and privacy boundary

This runbook covers the Cloudflare AI proxy, RevenueCat entitlement checks, Durable Object admission, and the Groq provider boundary. Unlimited deterministic local analysis is the safe fallback for every remote incident.

Operational metrics contain only route, verified plan, HTTP status class, latency bucket, request-body-size bucket, provider-unit bucket, post-reservation in-flight bucket, entitlement-cache outcome, and public outcome code. The request ID is a separate correlation value. Never add conversation text, provider output, raw errors, headers, IP addresses, installation tokens, RevenueCat IDs, sender labels, goals, tones, or message counts to logs, dashboards, traces, alerts, or tickets.

## Routine checks

Review these aggregate signals at the start of each on-call shift and after every deployment:

- HTTP 5xx and public outcome-code counts by route.
- p50, p95, and p99 latency; investigate before p95 reaches 12 seconds or p99 reaches 20 seconds.
- in-flight buckets and `SERVICE_BUSY` counts.
- entitlement-cache `error` counts without customer identifiers.
- provider spend and the current UTC-day provider-unit budget in the provider and Cloudflare operator consoles.
- the deterministic local gate with `npm run test:load:ci`; use `npm run test:load` before a production release.

The deterministic gate starts an ephemeral loopback Worker, uses a stub provider, generates unique synthetic rate identities in `198.18.0.0/15`, and deletes its temporary state. It must show exactly 100 peak reservations, a 503 `SERVICE_BUSY` result for request 101, no ordinary 429 responses, and zero final reservations.

## Daily provider-budget thresholds

### 80%: alert and investigate

At 80% of the UTC-day provider budget:

1. Page the application operator and acknowledge the alert.
2. Confirm the signal in the provider spend console and Cloudflare aggregate metrics; do not inspect conversation payloads.
3. Check for deploy changes, retry storms, entitlement-cache errors, route mix, and abnormal request-rate buckets.
4. Freeze nonessential AI releases and prepare the local-mode status copy below.
5. Do not raise the budget until the owner confirms the provider cost and abuse assessment.

### 95%: Free remote throttling

At 95%, the admission coordinator automatically rejects new Free remote work with `DAILY_BUDGET_REACHED` while preserving the final 5% for verified Pro users.

1. Confirm Free rejection counts rise and verified Pro requests remain admitted.
2. Publish the local-mode status copy and direct all users to unlimited Local analysis.
3. Do not grant Pro from a client flag, cached UI state, support override, or webhook alone.
4. Escalate if Pro is rejected before the absolute budget or if Free remains admitted after the reserve threshold.

### 100%: circuit open

At 100%, admission rejects all remote provider work with `DAILY_BUDGET_REACHED`; local analysis remains available.

1. Treat the remote AI path as circuit-open until the next UTC reset or an operator-approved budget change.
2. Confirm provider calls stop and in-flight reservations return to zero or expire through their alarms.
3. Keep the circuit open during suspected abuse, cost-accounting uncertainty, or a content-leak incident.
4. An emergency manual circuit-open can be produced by setting `MAX_DAILY_PROVIDER_UNITS` to `1` in an reviewed Worker configuration and deploying it. Restore `1300000` only after the incident owner approves reopening.

## Dependency outages

### RevenueCat outage

The entitlement resolver fails closed to Free with cache outcome `error`; it never trusts a client-supplied plan.

1. Confirm the outage using RevenueCat status and aggregate cache outcomes.
2. Keep local analysis available and use: “Subscription verification is temporarily unavailable. Local analysis still works on this device. Please try AI analysis again later.”
3. Do not bypass verification or paste customer IDs into logs or tickets.
4. After recovery, verify `miss` followed by `hit`, then test purchase restoration in a signed TestFlight build.

### Groq/provider outage

Provider failures return the bounded public `PROVIDER_UNAVAILABLE` or `PROVIDER_INVALID_RESPONSE` outcome and release admission in `finally`.

1. Confirm elevated public codes and zero leaked reservations.
2. Display or publish: “AI analysis is temporarily unavailable. Your conversation stays on this device; use Local analysis and try again later.”
3. Do not retry automatically in a tight loop and do not send real conversation content to a diagnostic provider.
4. Run the local stub gate. A green stub gate separates proxy capacity from the external provider outage.

## Worker rollback

1. Freeze new deploys and identify the last known-good version from the Cloudflare deployment history.
2. From `server/ai-proxy`, run `npx --yes node@22.22.0 ./node_modules/wrangler/bin/wrangler.js deployments list` and record only version metadata.
3. Roll back with `npx --yes node@22.22.0 ./node_modules/wrangler/bin/wrangler.js rollback <version-id> --message "incident rollback"` after the incident owner confirms the version.
4. Run `npm run test:load:ci`, verify public routes, and confirm final active reservations are zero.
5. Do not claim recovery until aggregate error rates and latency return to baseline.

## Secret rotation

Rotate a secret when exposure is suspected, on provider instruction, or according to the organization schedule. Never put a secret value in shell history, command arguments, source control, logs, or tickets.

1. Generate the replacement in an approved secret manager.
2. Run the relevant interactive command from `server/ai-proxy`: `npx --yes node@22.22.0 ./node_modules/wrangler/bin/wrangler.js secret put GROQ_API_KEY`, `... secret put REVENUECAT_SECRET_API_KEY`, or `... secret put RATE_LIMIT_HMAC_SECRET`. Enter the value only at the hidden prompt.
3. Deploy and verify the stub gate plus one authorized synthetic health request.
4. Revoke the old provider credential after the new credential is confirmed.
5. A rate-limit HMAC rotation intentionally changes pseudonymous cache/admission keys and may reset anonymous limits; monitor abuse aggregates during the transition.

## Suspected content leak

1. Declare a security/privacy incident and open the remote circuit immediately. Stop log exports, tails, and nonessential access.
2. Preserve content-free timestamps, deploy IDs, request IDs, access records, and metric buckets. Do not copy suspected conversation content into the incident ticket or chat.
3. Identify the exact sink and retention system with the security/privacy owner. Restrict access and follow approved deletion, legal-hold, and notification procedures; do not improvise deletion where a legal hold applies.
4. Rotate affected Groq, RevenueCat, Cloudflare, and logging credentials using hidden-input tools.
5. Add a failing leak test that reproduces the unsafe path with synthetic marker text, fix the closed allowlist, and run the full Worker and load suites.
6. Reopen remote AI only after security/privacy approval, a reviewed deployment, zero marker leakage, and zero leaked reservations.

## Authorized real-provider soak

The release gate never contacts a real provider. A non-loopback target is accepted only when both `--authorize-provider` and `--synthetic-content` are supplied. That mode does not call fixture diagnostics/control endpoints and reports reservation checking as not measured; it is not a substitute for the deterministic release gate. Obtain provider authorization, use only synthetic conversation text, set an explicit cost window, and record the soak as not run unless it was actually observed.
