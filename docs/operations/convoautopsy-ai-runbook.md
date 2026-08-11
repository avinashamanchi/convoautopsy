# ConvoAutopsy AI Operations Runbook

## Scope and privacy boundary

This runbook covers the Cloudflare AI proxy, RevenueCat entitlement checks, Durable Object admission, and the Groq provider boundary. Unlimited deterministic local analysis is the safe fallback for every remote incident.

Operational metrics contain only route, verified plan, HTTP status class, latency bucket, request-body-size bucket, provider-unit bucket, post-reservation in-flight bucket, entitlement-cache outcome, the closed `under-80`/`at-least-80` provider-budget warning, and public outcome code. The request ID is a separate correlation value. Never add conversation text, provider output, raw errors, headers, IP addresses, installation tokens, RevenueCat IDs, sender labels, goals, tones, or message counts to logs, dashboards, traces, alerts, or tickets.

## Routine checks

Review these aggregate signals at the start of each on-call shift and after every deployment:

- HTTP 5xx and public outcome-code counts by route.
- p50, p95, and p99 latency; investigate before p95 reaches 12 seconds or p99 reaches 20 seconds.
- in-flight buckets and `SERVICE_BUSY` counts.
- entitlement-cache `error` counts without customer identifiers.
- provider spend and the current UTC-day provider-unit budget in the provider and Cloudflare operator consoles.
- the deterministic local gate with `npm run test:load:ci`; use `npm run test:load` before a production release.

The deterministic gate starts an ephemeral loopback Worker, uses a stub provider, and puts both its fixed short-workload installation pool and its separate 1,000-identity capacity cohort behind the same `198.18.0.1` network address. The capacity phase holds 100 admitted requests, then exercises all 900 overload identities through an explicitly reported 32-request local transport window while admission remains saturated. This avoids confusing a small CI runner's socket limit with application capacity: it proves bounded admission and overload behavior, not 1,000 simultaneously successful live provider calls. The result reports the short pool size separately from the number of installation identities actually exercised; the CI profile schedules 65 requests, pads to an exact 70/30 mix, and therefore exercises 70 of the 100 available workload identities. Capacity and abusive-token samples are explicitly injected and excluded from that workload route mix. The full `npm run test:load` profile is also stub-only: 3,600 seconds at 5 requests per second followed by 300 seconds at 20 requests per second, or 24,000 scheduled requests over about 65 minutes before capacity checks. Its exact mix is 16,800 analyses and 7,200 response drafts, representing 57,600 planned provider units while consuming no real provider units. Before any requests, every profile prints a machine-readable `load-plan` record with the mode, request counts, padding, route mix, and planned provider units; review that record before allowing a run to continue.

The gate must show exactly 100 peak reservations, 900 distinct 503 `SERVICE_BUSY` overload results, no ordinary 429 responses, the exact workload route mix, a fresh zero-reservation diagnostic after capacity and again after token abuse, and zero final reservations. Per-token limits must still reject an abusive installation while the shared-network limit admits the legitimate 100-installation capacity cohort. Long and real-provider profiles use a separately reported deterministic identity pool sized so each absent-ID Free identity stays within three analyses and six drafts; never reuse the short fixed pool for a 24,000-request profile.

## Daily provider-budget thresholds

### 80%: alert and investigate

At 80% of the UTC-day provider budget:

1. Page the application operator when the `at-least-80` metric or `x-provider-budget-warning` response signal appears and acknowledge the alert.
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

An absent RevenueCat ID is verified Free. A supplied ID whose cache, configuration, or upstream verification is unavailable resolves to `unknown`, returns retryable `ENTITLEMENT_UNAVAILABLE` before admission, and consumes no plan allowance or provider budget; it is never silently metered as Free. The resolver never trusts a client-supplied plan.

1. Confirm the outage using RevenueCat status and aggregate cache outcomes.
2. Keep local analysis available and use: “Subscription verification is temporarily unavailable. Local analysis still works on this device. Please try AI analysis again later.”
3. Do not bypass verification or paste customer IDs into logs or tickets.
4. After recovery, verify `miss` followed by `hit`, then test purchase restoration in a signed TestFlight build.

### Groq/provider outage

Provider failures return a bounded public outcome. The admission coordinator refunds the user's plan allowance for unusable results but retains global provider-cost units after any provider invocation, including invalid output, caller/content rejection, availability failure, configuration failure, or client disconnect. Global units are refunded only for a confirmed pre-provider abort. Completion is idempotent and retried three times; a result is never returned as successful until its accounting completion is confirmed. An unresolved expired lease releases capacity, refunds user allowance, retains global cost, and records only a content-free reconciliation reason and time.

Network/deadline failures, HTTP 408/429, and 5xx responses advance the rolling availability breaker. HTTP 400/413/422 responses are caller/content-context rejections: they do not advance the breaker. HTTP 401/403 and model/configuration 404 responses fail closed as internal configuration incidents and immediately start a bounded 30-second safe circuit. Schema-invalid model output does not open a closed outage circuit, but invalid output from the sole half-open probe reopens the bounded cooldown so the circuit cannot stick.

1. Five provider failures inside 60 seconds open the global provider circuit for 30 seconds. Confirm the sixth request is rejected before Groq is called.
2. After cooldown, exactly one request is admitted as the half-open probe. Other requests remain rejected; a probe failure restarts the 30-second cooldown and a probe success closes the circuit and clears the rolling failures.
3. Confirm elevated public codes, zero leaked reservations, refunded user allowance, and retained provider-cost units for invoked work. Confirm ordinary `PROVIDER_INVALID_RESPONSE` does not increase the availability-breaker count. A corrupt or unavailable circuit/admission record must fail closed rather than call Groq.
4. Display or publish: “AI analysis is temporarily unavailable. Your conversation stays on this device; use Local analysis and try again later.”
5. Do not retry automatically in a tight loop and do not send real conversation content to a diagnostic provider.
6. Run the local stub gate. A green stub gate separates proxy capacity from the external provider outage.

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

The release gate never contacts a real provider. A non-loopback target is accepted only when `--authorize-provider`, `--synthetic-content`, `--sustained-seconds <seconds>`, and `--burst-seconds <seconds>` are all supplied. The explicit durations are required cost bounds, so the 24,000-request default cannot accidentally target a real provider. Inspect the printed `load-plan` and its planned provider units before the first request is allowed to proceed. That mode does not call fixture diagnostics/control endpoints and reports reservation checking as not measured; it is not a substitute for the deterministic release gate. Obtain provider authorization, use only synthetic conversation text, choose a reviewed cost window, and record the soak as not run unless it was actually observed.
