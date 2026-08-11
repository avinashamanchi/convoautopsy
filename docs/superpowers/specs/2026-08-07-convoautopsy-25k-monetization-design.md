# ConvoAutopsy 25k MAU, Monetization, and Product Design

**Date:** 2026-08-07
**Status:** Approved by the product owner through blanket approval of the recommended architecture and implementation choices
**Scope:** iOS-first launch foundation for 25,000 monthly active users; Android remains a later distribution phase

## 1. Outcome

ConvoAutopsy remains a private, guest-first conversation reflection tool. Its deterministic local analysis and Private Trends stay useful without an account, payment, or network. ConvoAutopsy Pro removes the 10-report local-history cap and provides larger bounded remote-AI fair-use allowances through Apple In-App Purchase and RevenueCat. The design does not introduce cloud conversation history, mandatory login, advertising, or claims of therapy, diagnosis, hidden intent, or psychological certainty.

The launch capacity target is 25,000 monthly active users with:

- 5 remote AI requests per second sustained for one hour;
- 20 remote AI requests per second for a five-minute burst;
- 100 concurrent remote-analysis clients;
- p95 remote response latency below 12 seconds and p99 below 20 seconds;
- under 1% non-injected request failures;
- crash-free sessions of at least 99.8%; and
- explicit AI-spend behavior at 80%, 95%, and 100% of the approved daily budget.

## 2. Product and identity model

### Guest-first launch

No account is required. Installation identity remains pseudonymous and device-scoped. Local analysis, manual response drafting, local saving within the free cap, privacy controls, data deletion, and purchase restoration remain available without registration.

RevenueCat may generate an anonymous App User ID. The app exposes a copyable support identifier, never uses an email address as the RevenueCat identifier, and includes Restore Purchases. RevenueCat customer state is refreshed when the app returns to the foreground and whenever a paid feature is entered.

### Optional identity later

Sign in with Apple is deferred until a concrete cross-device feature exists. If introduced, it links a non-guessable internal UUID to RevenueCat and an explicitly enabled encrypted-sync account. It does not make cloud upload the default. The design must then include guest-to-account linking, logout, session revocation, account deletion, sync deletion, and purchase-preserving restore behavior.

The legacy web username/password stored in browser local storage is not an account system and must never be reused.

## 3. Free and Pro boundaries

The free product is not a temporary demo:

- unlimited deterministic local analyses;
- up to 10 locally saved reports;
- deterministic local response templates;
- Private Trends summaries computed locally from saved analyses;
- complete redaction preview and data-deletion controls;
- 3 remote AI analyses per rolling 30-day window; and
- 6 remote AI response drafts per rolling 30-day window.

ConvoAutopsy Pro provides:

- up to 75 remote AI analyses and 150 remote AI response drafts per UTC calendar month; and
- paginated local report history without an artificial count cap.

Free remote allowances reset on a rolling 30-day window. Pro remote allowances reset at the start of each UTC calendar month.

These are fair-use ceilings, not expiring purchased credits. When a ceiling is reached, the app explains when the allowance resets and continues to offer local analysis. No screen promises unlimited remote AI.

Recommended App Store products are:

- entitlement: `convo_pro`;
- monthly: `com.avinashamanchi.convoautopsy.pro.monthly`;
- annual: `com.avinashamanchi.convoautopsy.pro.annual`;
- launch reference pricing: USD 7.99 monthly and USD 49.99 annually; and
- all in-app price copy comes from StoreKit localization, never hard-coded UI strings.

Expo Go shows a non-purchasing preview. Purchases, restoration, refunds, renewal, expiration, interrupted purchase, offline entitlement cache, and account switching are verified in the exact development/TestFlight build submitted to Apple.

## 4. Payment and entitlement architecture

`react-native-purchases` owns StoreKit interaction. A `BillingProvider` exposes a small app-owned interface: availability, current entitlement, products, purchase, restore, foreground refresh, and customer-info updates. Feature screens consume the app interface rather than importing RevenueCat directly.

The client never authorizes paid server work by sending `isPro`. It sends its RevenueCat App User ID and existing installation token over HTTPS. The Worker:

1. HMAC-derives storage keys so raw RevenueCat and installation identifiers are not stored in Durable Objects or logs.
2. Fetches current customer entitlement from RevenueCat using a server-only secret when the cached snapshot is older than five minutes.
3. Fails closed to the free plan when entitlement verification is unavailable and the cache is absent or expired.
4. Applies atomic per-plan route quotas before invoking the provider.
5. Never returns or logs subscription payloads, identifiers, conversation content, or raw provider output.

RevenueCat webhook processing is a later server-side support optimization, not the sole authorization source. If enabled, it must verify HMAC over the raw body, reject stale signatures, store event IDs idempotently, tolerate additional fields, and treat webhook delivery as at-least-once.

## 5. Remote AI admission and cost safety

The Cloudflare Worker adds an `AiAdmissionDurableObject` with one environment-wide coordinator name. Each accepted request reserves:

- one in-flight slot;
- 3 provider units for `/v1/analyses` or 1 provider unit for `/v1/responses`; and
- the plan-specific route allowance for its documented reset window.

Reservations expire automatically and are released in `finally`. Configuration is server-only and validated at startup:

- `MAX_GLOBAL_IN_FLIGHT` defaults to 100;
- `MAX_DAILY_PROVIDER_UNITS` is required in production;
- 80% produces an operational warning metric;
- 95% rejects free remote requests with a retryable budget response while preserving Pro capacity; and
- 100% opens the provider circuit for every plan until the UTC daily reset.

Provider failures use a bounded rolling circuit breaker. No request is queued indefinitely. Overload and budget responses include stable public codes and integer `Retry-After` values. Local analysis remains available during all remote outages.

Current per-IP and per-installation minute limits remain an abuse layer, but they are not the billing ledger. Network limits are tuned so shared school, workplace, and carrier networks do not block ordinary users. Plan quota, installation rate limit, network abuse limit, global concurrency, and daily budget are independently tested.

## 6. Privacy-first product upgrades

### Reviewed redaction preview

Before remote analysis, the app deterministically detects likely email addresses, phone numbers, URLs, handles, and obvious long numeric identifiers. It shows the exact outgoing Person A/Person B text in an editable review step. Detection is described as assistance, not guaranteed anonymization. The user may cancel without transmitting anything.

The consent record is versioned again when this screen ships. Remote requests contain only the reviewed text, anonymous sender labels, schema version, consent version, installation token, and RevenueCat App User ID.

### Local trends

Private Trends is free. Its summaries are derived on-device from saved `AnalysisResult` fields only: report date, intensity bucket, conflict mode, and pattern counts. They never require source text, AI calls, account identity, purchase entitlement, or analytics telemetry. Trends explicitly say that they summarize app classifications and do not establish another person's intent or a clinical condition.

### Before-send coaching

The response flow keeps deterministic local templates, goals, and tone variants available to everyone. A user may request a remote draft after reviewed consent, subject to the Free or Pro remote fair-use allowance. A draft is never sent automatically; the only outbound action is an explicit copy or iOS share-sheet action.

## 7. Local data durability and scale

SQLite becomes explicitly versioned beyond migration 1. Repository reads use keyset pagination with a default page size of 50 and a hard maximum of 100. Search is executed in SQL with escaped wildcard input instead of loading and filtering every report in JavaScript.

The report list uses `FlatList` incremental loading. The response chooser uses the same paginated source instead of mapping the full repository into a `ScrollView`. Trend aggregates run in bounded SQL queries or over paginated summary rows, never over raw source text.

Delete All continues to coordinate reports, preferences, consent, installation token, owned cache artifacts, and analysis session state. Purchase entitlement is restored through Apple and is not represented as deleted app content.

## 8. Observability and operations

Remote telemetry uses an explicit content-free allowlist:

- request ID;
- route;
- public result code and status class;
- plan class (`free`, `pro`, or `unknown`);
- latency, body-size, provider-unit, and in-flight buckets;
- entitlement-cache result;
- rate-limit/admission outcome; and
- release version.

It excludes IP addresses, installation and RevenueCat IDs, sender labels, messages, analysis results, response drafts, prompt/provider bodies, screenshots, filenames, SQL, arbitrary exception text, and user-entered metadata.

Operational alerts cover crash-free sessions, p95/p99 latency, error ratio, entitlement verification failures, provider circuit state, budget thresholds, Durable Object failures, and purchase-load failures. Runbooks define provider outage, RevenueCat outage, budget exhaustion, Worker rollback, and data-deletion support behavior.

## 9. Load and failure gates

Before production submission:

- run 5 requests/second for 60 minutes and 20/second for five minutes with a 70/30 analysis/response mix;
- simulate 100 legitimate installations behind one shared network key;
- verify no quota or global concurrency over-admission across Worker isolates;
- inject provider timeouts, malformed outputs, RevenueCat timeout/429/500, Durable Object failures, app cancellation, and offline transitions;
- confirm all reservations expire or release and no content appears in logs;
- verify 80/95/100 budget behavior deterministically;
- load 10,000 local reports and confirm page queries stay under 250 ms on the oldest supported iPhone; and
- exercise purchase, restore, renewal, expiration, refund, reinstall, and new-device restoration in sandbox/TestFlight.

## 10. Explicit non-goals for this wave

- Mandatory registration.
- Cloud conversation or report synchronization.
- Cross-app shared identity.
- Android billing or Play Store deployment.
- Automatic messaging or contact access.
- Advertising, data brokerage, or behavioral analytics.
- Claims of therapy, diagnosis, deception detection, or certainty about hidden intent.
- A promise of unlimited provider-backed AI.
