# ConvoAutopsy 25k Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a guest-first ConvoAutopsy iOS foundation that safely supports 25,000 monthly active users, sells bounded Convo Pro subscriptions, protects remote-AI spend, and adds reviewed redaction plus scalable local insights.

**Architecture:** Keep deterministic analysis and conversation history on-device. Add an app-owned RevenueCat boundary for StoreKit and a Cloudflare Durable Object entitlement/admission layer that independently enforces plan quotas, abuse limits, global concurrency, and daily provider budget. Add local redaction review, keyset-paginated history, and content-free operational load gates without introducing mandatory identity or cloud conversation storage.

**Tech Stack:** Expo SDK 54, React Native 0.81, Expo Router, TypeScript 5.9, Jest, Expo SQLite, SecureStore, RevenueCat React Native SDK, Cloudflare Workers, SQLite Durable Objects, Vitest, Zod, Node 22.22.0.

## Global Constraints

- Target 25,000 monthly active users, 5 remote requests/second sustained, 20 requests/second burst, and 100 concurrent remote clients.
- No mandatory registration, cloud conversation history, advertising, automatic messaging, or behavioral analytics.
- Unlimited deterministic local analysis remains free and usable during every remote outage or budget cutoff.
- Private Trends is a free local feature computed from saved analyses and never requires purchase entitlement or remote AI.
- Free remote allowance is 3 analyses and 6 response drafts per rolling 30-day window; Pro allowance is 75 analyses and 150 response drafts per UTC calendar month.
- RevenueCat entitlement is `convo_pro`; products are `com.avinashamanchi.convoautopsy.pro.monthly` and `com.avinashamanchi.convoautopsy.pro.annual`.
- Never trust a client-supplied `isPro` value; the Worker verifies current entitlement with a server-only RevenueCat secret.
- Never hard-code a selling price in the app; display only StoreKit-localized prices returned by RevenueCat.
- Remote content logs are forbidden. Logs use the allowlisted content-free fields in the approved design.
- All new behavior follows strict red-green-refactor TDD under Node 22.22.0.
- Expo Go may show a billing preview but cannot be used as purchase verification.

---

## File Map

- `mobile/src/billing/contracts.ts` — app-owned billing types and plan identifiers.
- `mobile/src/billing/revenueCatService.ts` — the only direct RevenueCat adapter.
- `mobile/src/billing/BillingProvider.tsx` — lifecycle, foreground refresh, and app context.
- `mobile/app/upgrade.tsx` — localized purchase, restore, legal, and Continue Free UI.
- `mobile/src/domain/redaction.ts` — deterministic candidate detection and replacement.
- `mobile/src/components/RemoteDataReview.tsx` — exact editable outgoing-text review.
- `mobile/src/services/reportRepository.ts` — keyset page and trend-summary contracts.
- `mobile/src/services/sqliteReportRepository.ts` — ordered migrations, SQL paging, and bounded aggregates.
- `mobile/app/(tabs)/history.tsx` — incremental `FlatList` loading.
- `mobile/app/(tabs)/responses.tsx` — paginated response chooser.
- `mobile/app/trends.tsx` — local-only pattern summary.
- `server/ai-proxy/src/entitlements.ts` — RevenueCat verification and five-minute cached plan snapshot.
- `server/ai-proxy/src/admission.ts` — plan quota, global concurrency, and daily budget reservations.
- `server/ai-proxy/src/index.ts` — request composition and content-free metrics.
- `server/ai-proxy/wrangler.jsonc` — Durable Object bindings and migration.
- `server/ai-proxy/scripts/load-gate.mjs` — deterministic provider-stub load gate.

### Task 1: Add the app-owned RevenueCat billing boundary

**Files:**
- Modify: `mobile/package.json`
- Modify: `mobile/package-lock.json`
- Create: `mobile/src/billing/contracts.ts`
- Create: `mobile/src/billing/revenueCatService.ts`
- Create: `mobile/src/billing/BillingProvider.tsx`
- Create: `mobile/__tests__/billingService.test.ts`
- Create: `mobile/__tests__/billingProvider.test.tsx`
- Modify: `mobile/app/_layout.tsx`

**Interfaces:**
- Produces: `BillingService.load()`, `purchase(productId)`, `restore()`, `subscribe(listener)`, and `getAppUserId()`.
- Produces: `useBilling()` with `availability`, `entitlementActive`, `products`, `busy`, `message`, `appUserId`, `purchase`, `restore`, and `reload`.
- Consumes: RevenueCat public Apple SDK key from `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`.

- [ ] **Step 1: Install the native SDK and write the failing service tests**

Run:

```bash
cd mobile
npm install react-native-purchases@10.7.0
```

Create tests that inject a complete fake module and assert observable behavior:

```ts
it('maps only configured products and reads convo_pro entitlement', async () => {
  const service = new RevenueCatBillingService({
    apiKey: 'appl_public', entitlementId: 'convo_pro',
    productIds: ['com.avinashamanchi.convoautopsy.pro.monthly', 'com.avinashamanchi.convoautopsy.pro.annual'],
    executionEnvironment: 'standalone', moduleLoader: async () => fakeRevenueCat,
  });
  await expect(service.load()).resolves.toMatchObject({
    availability: 'ready', entitlementActive: true,
    products: [{ id: 'com.avinashamanchi.convoautopsy.pro.monthly', localizedPrice: '$7.99' }],
  });
  await expect(service.getAppUserId()).resolves.toBe('$RCAnonymousID:test-user');
});

it('treats Expo Go as preview without loading the native module', async () => {
  const loader = jest.fn();
  const service = new RevenueCatBillingService({ apiKey: 'appl_public', entitlementId: 'convo_pro', productIds: [], executionEnvironment: 'storeClient', moduleLoader: loader });
  await expect(service.load()).resolves.toMatchObject({ availability: 'preview' });
  expect(loader).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the billing tests and verify RED**

Run:

```bash
npx --yes node@22.22.0 ./node_modules/jest/bin/jest.js __tests__/billingService.test.ts __tests__/billingProvider.test.tsx --runInBand
```

Expected: FAIL because the billing modules and provider do not exist.

- [ ] **Step 3: Implement the minimal billing contracts and adapter**

Define these exact app-owned shapes in `contracts.ts`:

```ts
export type BillingAvailability = 'ready' | 'preview' | 'unavailable';
export type BillingProduct = Readonly<{ id: string; title: string; localizedPrice: string }>;
export type BillingSnapshot = Readonly<{ availability: BillingAvailability; entitlementActive: boolean; products: readonly BillingProduct[] }>;
export const CONVO_PRO_ENTITLEMENT = 'convo_pro';
export const CONVO_PRO_PRODUCT_IDS = Object.freeze([
  'com.avinashamanchi.convoautopsy.pro.monthly',
  'com.avinashamanchi.convoautopsy.pro.annual',
]);
```

Implement the adapter so `configure` is called once, offerings with no configured packages are `unavailable`, cancellation maps to `PurchaseCancelledError`, and `subscribe` returns the RevenueCat listener remover. Do not import RevenueCat outside this adapter.

- [ ] **Step 4: Implement provider lifecycle and foreground refresh**

`BillingProvider` must load on mount, subscribe to customer updates, call `getCustomerInfo()` whenever `AppState` becomes `active`, serialize purchase/restore operations, and preserve the previous valid entitlement during a transient refresh error. Wrap it outside `AnalysisSessionProvider` in `_layout.tsx`.

- [ ] **Step 5: Run focused and full mobile verification**

Run:

```bash
npx --yes node@22.22.0 ./node_modules/jest/bin/jest.js __tests__/billingService.test.ts __tests__/billingProvider.test.tsx --runInBand
npx --yes node@22.22.0 ./node_modules/jest/bin/jest.js --runInBand
npx --yes node@22.22.0 ./node_modules/typescript/bin/tsc --noEmit
```

Expected: all commands exit 0 with no new warnings.

- [ ] **Step 6: Commit Task 1**

```bash
git add mobile/package.json mobile/package-lock.json mobile/src/billing mobile/__tests__/billingService.test.ts mobile/__tests__/billingProvider.test.tsx mobile/app/_layout.tsx
git commit -m "feat: add Convo Pro billing boundary"
```

### Task 2: Build an App Store-compliant upgrade and feature-gate flow

**Files:**
- Create: `mobile/app/upgrade.tsx`
- Create: `mobile/app/terms.tsx`
- Create: `mobile/src/legal/links.ts`
- Create: `mobile/__tests__/upgradeFlow.test.tsx`
- Modify: `mobile/app/(tabs)/settings.tsx`
- Modify: `mobile/app/(tabs)/_layout.tsx`
- Modify: `mobile/app/result.tsx`
- Modify: `mobile/app/report/[id].tsx`

**Interfaces:**
- Consumes: `useBilling()` from Task 1.
- Produces: an upgrade route with purchase, restore, Continue Free, Privacy, Terms, loading, unavailable, cancellation, and success states.
- Produces: `canSaveReport(currentCount, entitlementActive)` with free cap 10.

- [ ] **Step 1: Write failing user-flow tests**

Use real screen components with an injected billing provider. Cover:

```ts
it('keeps Continue Free and Restore Purchases available when products fail to load', async () => {
  render(<UpgradeScreen />);
  expect(screen.getByRole('button', { name: 'Continue Free' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Restore Purchases' })).toBeTruthy();
  expect(screen.getByText('Purchases are temporarily unavailable.')).toBeTruthy();
});

it('blocks the eleventh free save without deleting existing reports', async () => {
  expect(canSaveReport(10, false)).toEqual({ allowed: false, reason: 'FREE_HISTORY_LIMIT' });
  expect(canSaveReport(10, true)).toEqual({ allowed: true });
});
```

- [ ] **Step 2: Verify RED**

```bash
cd mobile
npx --yes node@22.22.0 ./node_modules/jest/bin/jest.js __tests__/upgradeFlow.test.tsx --runInBand
```

Expected: FAIL because `upgrade.tsx`, legal links, and the feature gate do not exist.

- [ ] **Step 3: Implement the paywall and bounded local-history gate**

The paywall renders each RevenueCat product's localized price and never the reference USD price. Use this gate contract:

```ts
export type SaveGate = Readonly<{ allowed: true } | { allowed: false; reason: 'FREE_HISTORY_LIMIT' }>;
export const canSaveReport = (count: number, pro: boolean): SaveGate =>
  pro || count < 10 ? { allowed: true } : { allowed: false, reason: 'FREE_HISTORY_LIMIT' };
```

Add Settings entry points for “Convo Pro,” “Restore Purchases,” Terms, and Privacy. The report save path opens `/upgrade?source=history-limit` when blocked and leaves all reports unchanged.

- [ ] **Step 4: Verify focused flow, navigation, accessibility, and typecheck**

```bash
npx --yes node@22.22.0 ./node_modules/jest/bin/jest.js __tests__/upgradeFlow.test.tsx __tests__/navigation.test.tsx __tests__/accessibility.test.tsx --runInBand
npx --yes node@22.22.0 ./node_modules/typescript/bin/tsc --noEmit
```

- [ ] **Step 5: Commit Task 2**

```bash
git add mobile/app/upgrade.tsx mobile/app/terms.tsx mobile/src/legal mobile/__tests__/upgradeFlow.test.tsx 'mobile/app/(tabs)/settings.tsx' 'mobile/app/(tabs)/_layout.tsx' mobile/app/result.tsx 'mobile/app/report/[id].tsx'
git commit -m "feat: add Convo Pro upgrade flow"
```

### Task 3: Verify RevenueCat entitlement and enforce plan quota on the Worker

**Files:**
- Create: `server/ai-proxy/src/entitlements.ts`
- Create: `server/ai-proxy/test/entitlements.test.ts`
- Modify: `server/ai-proxy/src/contract.ts`
- Modify: `server/ai-proxy/src/index.ts`
- Modify: `server/ai-proxy/src/errors.ts`
- Modify: `mobile/src/services/aiClient.ts`
- Modify: `mobile/__tests__/aiClient.test.ts`
- Modify: `server/ai-proxy/wrangler.jsonc`

**Interfaces:**
- Produces: `EntitlementPlan = 'free' | 'pro'` and `resolvePlan(appUserId, env, now)`.
- Consumes: `REVENUECAT_SECRET_API_KEY`, `ENTITLEMENT_CACHE`, and HMAC-digested customer keys.
- Changes request contract: optional `revenueCatAppUserId`, maximum 100 Unicode characters, with no client plan flag.

- [ ] **Step 1: Write failing entitlement tests**

Cover active `convo_pro`, expired entitlement, absent identifier, five-minute cache, RevenueCat timeout, malformed JSON, secret absence, and no identifier in logs. The active fixture must include the complete RevenueCat subscriber structure used by the adapter.

```ts
it('returns pro only for a currently active convo_pro entitlement', async () => {
  const plan = await resolvePlan('$RCAnonymousID:abc', fakeEnv({ expires_date: '2026-09-01T00:00:00Z' }), Date.parse('2026-08-07T00:00:00Z'));
  expect(plan).toBe('pro');
});

it('fails closed to free when an expired cache cannot be refreshed', async () => {
  const plan = await resolvePlan('$RCAnonymousID:abc', failingEnv, Date.parse('2026-08-07T00:06:00Z'));
  expect(plan).toBe('free');
});
```

- [ ] **Step 2: Verify RED in Worker and mobile tests**

```bash
cd server/ai-proxy
npx --yes node@22.22.0 ./node_modules/vitest/vitest.mjs run test/entitlements.test.ts
cd ../../mobile
npx --yes node@22.22.0 ./node_modules/jest/bin/jest.js __tests__/aiClient.test.ts --runInBand
```

- [ ] **Step 3: Implement bounded RevenueCat verification**

`resolvePlan` must:

```ts
export type EntitlementPlan = 'free' | 'pro';
export type EntitlementSnapshot = Readonly<{ plan: EntitlementPlan; checkedAt: number; expiresAt: number | null }>;
```

Use a 5,000 ms fetch deadline, 64 KiB response limit, exact HTTPS RevenueCat host, `Authorization: Bearer <server secret>`, and a five-minute cache TTL. Cache keys are HMAC-SHA256 digests; cached values contain only plan and timestamps. Do not persist raw customer JSON.

- [ ] **Step 4: Thread the anonymous RevenueCat ID through the client contract**

`createAiClient` receives `getRevenueCatAppUserId(): Promise<string | null>` and includes `revenueCatAppUserId` only when non-null. Preserve local analysis when billing is unavailable. Update CORS only if a new header is used; the preferred contract keeps it inside the bounded JSON body.

- [ ] **Step 5: Verify contracts, content-free logging, and full Worker suite**

```bash
cd server/ai-proxy
npx --yes node@22.22.0 ./node_modules/vitest/vitest.mjs run
npx --yes node@22.22.0 ./node_modules/typescript/bin/tsc --noEmit
cd ../../mobile
npx --yes node@22.22.0 ./node_modules/jest/bin/jest.js __tests__/aiClient.test.ts --runInBand
```

- [ ] **Step 6: Commit Task 3**

```bash
git add server/ai-proxy/src server/ai-proxy/test/entitlements.test.ts server/ai-proxy/wrangler.jsonc mobile/src/services/aiClient.ts mobile/__tests__/aiClient.test.ts
git commit -m "feat: verify Convo Pro server entitlements"
```

### Task 4: Add atomic plan quota, concurrency, and daily AI budget admission

**Files:**
- Create: `server/ai-proxy/src/admission.ts`
- Create: `server/ai-proxy/test/admission.test.ts`
- Modify: `server/ai-proxy/src/index.ts`
- Modify: `server/ai-proxy/src/errors.ts`
- Modify: `server/ai-proxy/wrangler.jsonc`
- Modify: `server/ai-proxy/test/worker.test.ts`

**Interfaces:**
- Produces: `reserveAdmission(request): Promise<AdmissionLease>` and `releaseAdmission(leaseId)`.
- Consumes: `plan`, HMAC customer/installation digest, route, UTC timestamp, `MAX_GLOBAL_IN_FLIGHT`, and `MAX_DAILY_PROVIDER_UNITS`.
- Produces public codes `PLAN_LIMIT_REACHED`, `SERVICE_BUSY`, and `DAILY_BUDGET_REACHED` with integer retry values.

- [ ] **Step 1: Write concurrent RED tests**

The tests must prove atomic outcomes, not implementation calls:

```ts
it('admits exactly 100 of 160 concurrent reservations and releases every lease', async () => {
  const results = await Promise.all(Array.from({ length: 160 }, (_, index) => reserve({ id: `r-${index}`, plan: 'pro', route: '/v1/analyses' })));
  expect(results.filter((item) => item.allowed)).toHaveLength(100);
  await Promise.all(results.flatMap((item) => item.allowed ? [release(item.leaseId)] : []));
  expect(await currentInFlight()).toBe(0);
});

it('preserves Pro capacity after 95 percent while rejecting free work', async () => {
  await setUsedProviderUnits(950);
  await expect(reserve({ id: 'free', plan: 'free', route: '/v1/responses' })).resolves.toMatchObject({ allowed: false, code: 'DAILY_BUDGET_REACHED' });
  await expect(reserve({ id: 'pro', plan: 'pro', route: '/v1/responses' })).resolves.toMatchObject({ allowed: true });
});
```

Also test Free 3/6 route counts with a rolling 30-day reset, Pro 75/150 route counts with a UTC calendar-month reset, lease alarm expiry, duplicate release, zero/invalid configuration, and provider exceptions releasing the lease.

- [ ] **Step 2: Verify RED**

```bash
cd server/ai-proxy
npx --yes node@22.22.0 ./node_modules/vitest/vitest.mjs run test/admission.test.ts test/worker.test.ts
```

- [ ] **Step 3: Implement the Durable Object reservation state machine**

Use SQLite tables with these keys and no raw identifiers:

```sql
CREATE TABLE IF NOT EXISTS daily_budget(day TEXT PRIMARY KEY, provider_units INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS inflight(lease_id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS plan_usage(subject_digest TEXT NOT NULL, period TEXT NOT NULL, route TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(subject_digest, period, route));
```

All admission checks and increments execute in one `transactionSync`. Analysis costs 3 units; response costs 1. A rejected reservation increments nothing. Alarm cleanup deletes expired leases and recomputes the next alarm.

- [ ] **Step 4: Compose admission after schema/rate checks and before provider work**

The route sequence is: bounded read → schema/consent → HMAC abuse keys → abuse limits → entitlement resolution → atomic admission → provider → `finally` release. Every provider path, including invalid response and cancellation, releases the lease.

- [ ] **Step 5: Run concurrency stress, full suite, typecheck, and dry build**

```bash
npx --yes node@22.22.0 ./node_modules/vitest/vitest.mjs run
npx --yes node@22.22.0 ./node_modules/typescript/bin/tsc --noEmit
npx --yes node@22.22.0 ./node_modules/wrangler/bin/wrangler.js deploy --dry-run --outdir dist
```

- [ ] **Step 6: Commit Task 4**

```bash
git add server/ai-proxy/src/admission.ts server/ai-proxy/src/index.ts server/ai-proxy/src/errors.ts server/ai-proxy/test/admission.test.ts server/ai-proxy/test/worker.test.ts server/ai-proxy/wrangler.jsonc
git commit -m "feat: bound ConvoAutopsy AI capacity and spend"
```

### Task 5: Add editable redaction review before remote transmission

**Files:**
- Create: `mobile/src/domain/redaction.ts`
- Create: `mobile/__tests__/redaction.test.ts`
- Create: `mobile/src/components/RemoteDataReview.tsx`
- Create: `mobile/__tests__/remoteDataReview.test.tsx`
- Modify: `mobile/app/preview.tsx`
- Modify: `mobile/src/state/AnalysisSession.tsx`
- Modify: `mobile/src/services/consentStore.ts`
- Modify: `mobile/__tests__/remoteAnalysisFlow.test.tsx`

**Interfaces:**
- Produces: `detectRedactions(text): RedactionCandidate[]` and `applyRedactions(text, selectedIds): string`.
- Produces candidate kinds `email`, `phone`, `url`, `handle`, and `long-number`.
- Produces a reviewed array of anonymous messages passed to `aiClient`; the raw editor draft is never substituted silently.

- [ ] **Step 1: Write literal-fixture redaction tests first**

```ts
it('replaces selected candidates while preserving unselected text and offsets', () => {
  const source = 'Email sam@example.com or call +1 415 555 0101.';
  const candidates = detectRedactions(source);
  expect(candidates.map(({ kind, value }) => ({ kind, value }))).toEqual([
    { kind: 'email', value: 'sam@example.com' },
    { kind: 'phone', value: '+1 415 555 0101' },
  ]);
  expect(applyRedactions(source, [candidates[0].id])).toBe('Email [EMAIL] or call +1 415 555 0101.');
});

it('never claims that no candidate means anonymous', () => {
  render(<RemoteDataReview messages={messagesWithoutDetectedCandidates} />);
  expect(screen.getByText('Automatic detection can miss identifying details. Review the exact text below.')).toBeTruthy();
});
```

Include Unicode text, overlapping URL/email candidates, false-positive-short numbers, repeated values, and edits after automatic replacement.

- [ ] **Step 2: Verify RED**

```bash
cd mobile
npx --yes node@22.22.0 ./node_modules/jest/bin/jest.js __tests__/redaction.test.ts __tests__/remoteDataReview.test.tsx __tests__/remoteAnalysisFlow.test.tsx --runInBand
```

- [ ] **Step 3: Implement deterministic non-overlapping detection**

Each candidate is `{ id, kind, start, end, value, replacement }`. Sort by start then longest match, discard overlaps, and apply selected replacements from highest offset to lowest. Maximum input remains the existing 100,000-character editor boundary; detection must be linear or bounded-regex work.

- [ ] **Step 4: Insert the exact outgoing-data review into the AI path**

The preview route offers local analysis immediately. Selecting AI opens `RemoteDataReview`; the user can toggle candidates, edit every message, cancel, or confirm. Only confirm updates `reviewedRemoteMessages` and invokes remote analysis. Increment the consent version and update the consent sheet to name RevenueCat entitlement verification metadata separately from conversation content.

- [ ] **Step 5: Verify cancellation, stale-result, and no-transmission behavior**

```bash
npx --yes node@22.22.0 ./node_modules/jest/bin/jest.js __tests__/redaction.test.ts __tests__/remoteDataReview.test.tsx __tests__/remoteAnalysisFlow.test.tsx __tests__/analysisSession.test.tsx --runInBand
npx --yes node@22.22.0 ./node_modules/typescript/bin/tsc --noEmit
```

- [ ] **Step 6: Commit Task 5**

```bash
git add mobile/src/domain/redaction.ts mobile/src/components/RemoteDataReview.tsx mobile/app/preview.tsx mobile/src/state/AnalysisSession.tsx mobile/src/services/consentStore.ts mobile/__tests__/redaction.test.ts mobile/__tests__/remoteDataReview.test.tsx mobile/__tests__/remoteAnalysisFlow.test.tsx
git commit -m "feat: review and redact remote conversation text"
```

### Task 6: Add ordered migrations, paginated history, and local trends

**Files:**
- Modify: `mobile/src/services/reportRepository.ts`
- Modify: `mobile/src/services/sqliteReportRepository.ts`
- Modify: `mobile/src/services/expoSqlitePort.ts`
- Modify: `mobile/src/services/reportRepositoryCoordinator.ts`
- Modify: `mobile/app/(tabs)/history.tsx`
- Modify: `mobile/app/(tabs)/responses.tsx`
- Create: `mobile/app/trends.tsx`
- Create: `mobile/src/domain/trends.ts`
- Modify: `mobile/__tests__/reportRepository.test.ts`
- Create: `mobile/__tests__/historyPagination.test.tsx`
- Create: `mobile/__tests__/trends.test.ts`

**Interfaces:**
- Replaces unbounded `list(query?)` with `listPage({ query?, cursor?, limit? }): Promise<ReportPage>`.
- Produces `ReportPage = { items: SavedReport[]; nextCursor: ReportCursor | null }`.
- Produces `getTrendSummary(fromInclusive, toExclusive): Promise<TrendSummary>` using result fields only.

- [ ] **Step 1: Write paging, migration, and trend RED tests**

```ts
it('uses stable updatedAt and id keyset pagination without duplicates', async () => {
  const first = await repository.listPage({ limit: 2 });
  const second = await repository.listPage({ limit: 2, cursor: first.nextCursor! });
  expect(first.items.map((item) => item.id)).toEqual(['c', 'b']);
  expect(second.items.map((item) => item.id)).toEqual(['a']);
});

it('summarizes saved classifications without reading source_text', async () => {
  const summary = await repository.getTrendSummary('2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');
  expect(summary).toEqual({ reportCount: 2, averageIntensity: 35, conflictModes: { Collaborating: 2 }, patterns: { Neutral: 3 } });
  expect(db.statements.join('\n')).not.toContain('source_text');
});
```

Add real Expo SQLite integration coverage when the existing test harness supports the native adapter; the fake port remains a contract test, not migration proof.

- [ ] **Step 2: Verify RED**

```bash
cd mobile
npx --yes node@22.22.0 ./node_modules/jest/bin/jest.js __tests__/reportRepository.test.ts __tests__/historyPagination.test.tsx __tests__/trends.test.ts --runInBand
```

- [ ] **Step 3: Implement migration 2 and explicit version handling**

Read `PRAGMA user_version`. Reject versions above 2. Apply each missing migration inside one transaction and set `user_version` only after its statements succeed. Migration 2 adds:

```sql
CREATE INDEX IF NOT EXISTS reports_updated_id_idx ON reports(updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS reports_title_nocase_idx ON reports(title COLLATE NOCASE);
```

Use `LIMIT limit + 1` and `(updated_at < ?) OR (updated_at = ? AND id < ?)` for subsequent pages. Escape `\`, `%`, and `_` and use `LIKE ? ESCAPE '\' COLLATE NOCASE` for bounded title search.

- [ ] **Step 4: Convert History and Responses to incremental FlatLists**

Both screens load 50 rows, append on `onEndReached`, cancel stale generations, prevent duplicate page loads, reset on query/revision, and expose retry without discarding already visible rows. The response chooser must no longer map all reports in a `ScrollView`.

- [ ] **Step 5: Implement free local-only trend aggregation**

`trends.ts` counts pattern labels, conflict modes, report count, and rounded average intensity. `/trends` explains limitations and is available to Free and Pro users. It never imports `aiClient` or reads `sourceText`.

- [ ] **Step 6: Verify 10,000-row behavior and the full mobile suite**

Add a deterministic 10,000-row repository fixture and assert each page returns at most 50 rows and no full-list query is issued.

```bash
npx --yes node@22.22.0 ./node_modules/jest/bin/jest.js __tests__/reportRepository.test.ts __tests__/historyPagination.test.tsx __tests__/trends.test.ts --runInBand
npx --yes node@22.22.0 ./node_modules/jest/bin/jest.js --runInBand
npx --yes node@22.22.0 ./node_modules/typescript/bin/tsc --noEmit
```

- [ ] **Step 7: Commit Task 6**

```bash
git add mobile/src/services mobile/src/domain/trends.ts 'mobile/app/(tabs)/history.tsx' 'mobile/app/(tabs)/responses.tsx' mobile/app/trends.tsx mobile/__tests__/reportRepository.test.ts mobile/__tests__/historyPagination.test.tsx mobile/__tests__/trends.test.ts
git commit -m "feat: scale local history and add private trends"
```

### Task 7: Add content-free operational metrics and repeatable load gates

**Files:**
- Modify: `server/ai-proxy/src/index.ts`
- Create: `server/ai-proxy/src/metrics.ts`
- Create: `server/ai-proxy/test/metrics.test.ts`
- Create: `server/ai-proxy/scripts/load-gate.mjs`
- Modify: `server/ai-proxy/package.json`
- Create: `docs/operations/convoautopsy-ai-runbook.md`

**Interfaces:**
- Produces allowlisted `SafeMetric` records only.
- Produces `npm run test:load` against a provider stub; a real-provider soak requires provider authorization and synthetic content.

- [ ] **Step 1: Write a failing leak and bucket test**

```ts
it('cannot serialize content or raw identifiers into operational metrics', () => {
  const metric = createSafeMetric({ route: '/v1/analyses', plan: 'pro', status: 200, latencyMs: 1400, bodyBytes: 4096, providerUnits: 3, inFlight: 22, entitlementCache: 'hit', outcome: 'allowed' });
  expect(metric).toEqual({ route: '/v1/analyses', plan: 'pro', statusClass: '2xx', latencyBucket: '<5s', bodySizeBucket: '<16KiB', providerUnitBucket: '3', inFlightBucket: '<50', entitlementCache: 'hit', outcome: 'allowed' });
  expect(JSON.stringify(metric)).not.toContain('message');
});
```

- [ ] **Step 2: Verify RED**

```bash
cd server/ai-proxy
npx --yes node@22.22.0 ./node_modules/vitest/vitest.mjs run test/metrics.test.ts
```

- [ ] **Step 3: Implement closed metric types and route instrumentation**

No function accepts arbitrary metadata or `Error`. Buckets are exhaustive unions. The logger receives the metric object and request ID separately; neither object contains content, raw IP, installation ID, or RevenueCat ID.

- [ ] **Step 4: Implement deterministic provider-stub load gate**

The script runs two phases against a configurable local URL: 5 RPS for a configurable duration and 20 RPS burst, defaulting in CI to 60 seconds and 30 seconds. It reports p50/p95/p99, non-injected failure rate, status counts, and leaked reservation count from a test-only authenticated diagnostics fixture. It exits non-zero if p95 exceeds 12 seconds, p99 exceeds 20 seconds, errors exceed 1%, or reservations remain.

- [ ] **Step 5: Write the operational runbook with exact threshold responses**

Document 80% alert, 95% free throttling, 100% circuit open, RevenueCat outage free fallback, provider outage local-mode copy, Worker rollback, secret rotation, and content-leak incident response. Human prose needs no source-grep test.

- [ ] **Step 6: Verify unit, stress, typecheck, and dry build**

```bash
npx --yes node@22.22.0 ./node_modules/vitest/vitest.mjs run
npx --yes node@22.22.0 ./node_modules/typescript/bin/tsc --noEmit
npx --yes node@22.22.0 ./node_modules/wrangler/bin/wrangler.js deploy --dry-run --outdir dist
```

- [ ] **Step 7: Commit Task 7**

```bash
git add server/ai-proxy/src server/ai-proxy/test/metrics.test.ts server/ai-proxy/scripts/load-gate.mjs server/ai-proxy/package.json docs/operations/convoautopsy-ai-runbook.md
git commit -m "test: add ConvoAutopsy capacity and cost gates"
```

### Task 8: Close native, legal, and external payment release gates

**Files:**
- Modify: `mobile/app.config.ts`
- Modify: `mobile/eas.json`
- Modify: `mobile/.env.example`
- Modify: `docs/app-store/convoautopsy-ios-release-checklist.md`
- Create: `docs/app-store/convoautopsy-monetization-setup.md`
- Modify: `docs/app-store/convoautopsy-ios-metadata.md`
- Modify: `public/privacy.html`
- Modify: `public/terms.html`
- Modify: `public/support.html`
- Modify: `.github/workflows/ios-ci.yml`

**Interfaces:**
- Consumes external Apple, RevenueCat, Cloudflare, and EAS credentials without storing secrets in Git.
- Produces a truthful checklist that labels code-complete, locally verified, external-configuration blocked, and device/TestFlight verified states separately.

- [ ] **Step 1: Write failing release-configuration tests**

Extend `mobile/__tests__/releaseConfig.test.ts` to assert unique bundle ID, privacy/terms/support HTTPS URLs, `usesAppleSignIn: false`, production AI proxy URL presence, RevenueCat public key variable name, no secret key values, production EAS store distribution, and no Expo Go purchase claim.

- [ ] **Step 2: Verify RED**

```bash
cd mobile
npx --yes node@22.22.0 ./node_modules/jest/bin/jest.js __tests__/releaseConfig.test.ts --runInBand
```

- [ ] **Step 3: Implement truthful configuration and legal disclosures**

Disclose local report storage and backups, reviewed Groq processing, pseudonymous abuse identifiers, RevenueCat purchase identifiers/history, no advertising/tracking, plan allowances, restoration, cancellation management, and account-free deletion behavior. Keep API, StoreKit, RevenueCat secret, Cloudflare, and Apple private keys out of client-prefixed variables.

- [ ] **Step 4: Add CI gates**

CI runs mobile full tests/typecheck/lint/Doctor/export, Worker tests/typecheck/lint/dry build, secret scan, npm production audits, and the deterministic short provider-stub stress test. Native StoreKit and OCR remain development-build/TestFlight gates rather than being marked green from Expo Go.

- [ ] **Step 5: Execute all locally available release checks**

```bash
cd mobile
npx --yes node@22.22.0 ./node_modules/jest/bin/jest.js --runInBand
npx --yes node@22.22.0 ./node_modules/typescript/bin/tsc --noEmit
npx --yes node@22.22.0 ./node_modules/expo/bin/cli export --platform ios
cd ../server/ai-proxy
npx --yes node@22.22.0 ./node_modules/vitest/vitest.mjs run
npx --yes node@22.22.0 ./node_modules/typescript/bin/tsc --noEmit
npx --yes node@22.22.0 ./node_modules/wrangler/bin/wrangler.js deploy --dry-run --outdir dist
```

- [ ] **Step 6: Complete external account gates without fabricating evidence**

In App Store Connect, create both products and subscription group; in RevenueCat, attach both products to `convo_pro`, configure the current offering and transfer restore behavior, and add the public Apple SDK key to EAS. Add the server secret only to Cloudflare. Configure production Durable Objects and budget values. Build the exact signed binary and verify purchase, cancellation, restore, reinstall, renewal, expiration, refund, offline cache, redaction, provider outage, OCR, and legal links in TestFlight. Mark only observed results in the checklist.

- [ ] **Step 7: Commit Task 8**

```bash
git add mobile/app.config.ts mobile/eas.json mobile/.env.example mobile/__tests__/releaseConfig.test.ts docs/app-store public .github/workflows/ios-ci.yml
git commit -m "docs: close ConvoAutopsy paid release gates"
```

## Plan Self-Review

- **Spec coverage:** Tasks 1–2 cover StoreKit/RevenueCat and local gates; Tasks 3–4 cover server verification, quotas, concurrency, and budget; Task 5 covers reviewed redaction; Task 6 covers migrations, paging, and local trends; Task 7 covers metrics/load/runbooks; Task 8 covers native, legal, and external release evidence.
- **Placeholder scan:** No placeholder markers or unspecified implementation steps remain. External account operations have exact systems and verification scenarios.
- **Type consistency:** `convo_pro`, both product IDs, Free rolling-30-day and Pro UTC-calendar-month route allowances, `EntitlementPlan`, `BillingSnapshot`, `ReportPage`, and public admission codes are consistent across tasks.
- **Safety boundary:** Local analysis remains available under purchase, entitlement, rate, provider, budget, and network failures. Neither client flags nor webhooks independently authorize paid provider work.
