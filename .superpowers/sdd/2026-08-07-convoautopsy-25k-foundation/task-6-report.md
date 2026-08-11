# Task 6 Report: Scalable Local History and Private Trends

## Status

Complete. The implementation and this report are committed together with subject `feat: scale local history and add private trends`.

The commit contains only Task 6 implementation, tests, migrated repository mocks, and this report. The pre-existing App Store metadata, release configuration, Settings/legal UI, privacy pages, hosted legal pages, `.env.example`, release test, and Worker rate-limit changes remain unstaged. `mobile/__tests__/settings.test.tsx` required a repository-interface migration; only that two-line Task 6 mock hunk is staged, while its pre-existing Linking/Privacy/legal-test hunks remain unstaged.

## Behavior delivered

- Replaced the unbounded report list contract with keyset-paginated lightweight rows, an exact SQL count, full report retrieval by ID, and bounded local trend summaries.
- Added schema version 2 after reading `PRAGMA user_version` before any write. Versions 1 and 2 run as separate atomic transactions, version changes occur last, version 2 is idempotent, and future versions fail with `UNSUPPORTED_REPORT_SCHEMA` before DDL.
- Migration 2 adds `search_title`, backfills NFKC/Unicode-lowercased titles, and adds updated/id, title, search-title, and created-at indexes. A failed v2 migration rolls back the column, indexes, backfill, and version, then succeeds on retry.
- Added exact `(updated_at DESC, id DESC)` keyset paging with the parenthesized tie predicate, `LIMIT + 1`, cursor from the final returned item, and a 1-to-50 page-size clamp.
- List pages select only `id`, `title`, `created_at`, and `updated_at`; they never fetch source text, analysis JSON, or response JSON. Full validated reports remain available only through `get(id)`.
- Search escapes backslash, percent, and underscore before parameter binding. Unicode `CAFÉ`/`café` matching is preserved through the normalized column. Contains search intentionally starts with a wildcard, so SQLite may scan the normalized-title index; materialization remains bounded to 51 lightweight rows.
- `saveIfAllowed` now performs an exact count inside the existing serialized mutation for Free saves, never enumerates reports, and skips the count entirely for unlimited Pro saves.
- History and Responses now use independent `FlatList` pagination state, 50-row initial pages, deduplicated end-reached loads, generation invalidation, query/revision/delete-all resets, and retryable initial/page errors. Later-page failures retain visible rows and the failed cursor.
- Added a discoverable Private Trends route. Free users are sent to `/upgrade?source=trends` without reading reports; Pro summaries are computed locally for an explicit half-open rolling 30-day window.
- Trends use `created_at`, validate `from < to`, return an explicit zero state, round average intensity in SQLite, and validate every conflict-mode, pattern, intensity, array shape, and malformed JSON boundary. Aggregation runs inside one consistent SQLite transaction, never selects source text, and never imports the remote AI client.
- The Expo SQLite adapter explicitly captures transaction callback results because the native exclusive-transaction API itself resolves `void`; this keeps local trend reads correct on device.

## TDD evidence

All test and build commands used Node `22.22.0`.

### RED

1. Initial repository RED:
   - `listPage` was absent.
   - a future schema initialized instead of rejecting.
   - `getTrendSummary` was absent.
2. Missing trend-field RED:
   - missing intensity returned a one-report summary with a null average.
   - missing messages returned a summary with no patterns.
   - predicates were changed to NULL-safe checks and guarded JSON iteration.
3. Scalar-message RED:
   - a valid JSON result containing a scalar message produced SQLite `malformed JSON` instead of stable `CORRUPT_REPORT`.
   - a short-circuiting `CASE` now rejects non-object entries before extracting a pattern.
4. Screen RED:
   - History and Responses called removed `list()` and rendered load errors.
   - Trends did not exist.
5. Stable-window RED:
   - the default inline clock triggered seven trend reads after one summary render.
   - a module-level clock and memoized window reduced this to exactly one.
6. Expo adapter RED:
   - a transaction action returning `42` resolved `undefined` because Expo's native wrapper returns void.
   - explicit callback-result capture made the adapter return `42`.
7. Pro-save RED:
   - a Pro save failed when the count seam threw.
   - the coordinator now bypasses count for Pro while retaining the serialized mutation.

### GREEN

- Focused repository real-engine suite: 21/21 passed.
- Focused pagination suite: 6/6 passed.
- Focused trends suite: 5/5 passed.
- Focused existing History suite plus pagination suite: 16/16 passed before the final added cases.
- Full mobile Jest: 37 suites, 274/274 tests passed.
- Mobile TypeScript: `tsc --noEmit` passed.
- Mobile ESLint: passed with zero warnings.
- iOS Expo export: passed; 1,484 modules bundled to a 5.92 MB Hermes bundle. Expo workers printed the environment-level `NO_COLOR`/`FORCE_COLOR` warning, but emitted the bundle and metadata successfully.
- `git diff --check` passed.

## Real SQLite and scale evidence

- Tests run the production repository SQL against Node 22's built-in SQLite 3.50.4 engine, in addition to the Expo adapter contract test.
- Covered v0-to-v2, v1-to-v2, v2 idempotence, future rejection/no writes, failed-v2 rollback, and retry.
- A deterministic tie-heavy 10,000-row fixture traverses every report in at most 50-row pages with no duplicate or missing IDs.
- SQL assertions prove `LIMIT ?`, a 51-row lookahead for the maximum page, the exact tie predicate, escaped parameterized search, lightweight projection, and absence of selected private payload columns.
- Physical Expo/iOS SQLite initialization and visual/VoiceOver behavior remain a development-build/device release gate; an Expo export is not that device proof.

## Files committed

- Repository/domain: `mobile/src/services/reportRepository.ts`, `sqliteReportRepository.ts`, `expoSqlitePort.ts`, `reportRepositoryCoordinator.ts`, `useReportPagination.ts`, `mobile/src/domain/trends.ts`
- UI: `mobile/app/(tabs)/history.tsx`, `mobile/app/(tabs)/responses.tsx`, `mobile/app/trends.tsx`, `mobile/src/components/ReportListItem.tsx`
- Primary Task 6 tests: `reportRepository.test.ts`, `historyPagination.test.tsx`, `trends.test.tsx`
- Interface-migrated regressions: `historyScreen.test.tsx`, `reportRepositoryCoordinator.test.ts`, `reportRevisionScreens.test.tsx`, `responseFlow.test.tsx`, `settings.test.tsx` (Task 6 hunk only), `shareActions.test.tsx`, `upgradeFlow.test.tsx`
- Report: this file

## Self-review and remaining gate

- No unbounded `list()` escape hatch remains in mobile source or tests.
- The trend path is local-only and content never enters remote AI or operational logs.
- Leading-wildcard contains search cannot promise an index seek; page projection and result materialization are bounded, and this limitation is documented above and beside the query.
- The one remaining non-repository proof is a physical development-build/device run using Expo SQLite. Expo Go/export cannot certify the native billing or final App Store binary, so no such claim is made.

## Review fix: clear title-bearing history metadata during Delete All

### Commit

- Base: `e906bc0dfe8d4a9cf9247b56e18b6328381239b7`
- Fix commit subject: `fix: clear history metadata during deletion`
- Exact fix paths: `mobile/app/(tabs)/history.tsx`, `mobile/__tests__/historyScreen.test.tsx`, and this report

The review found that History cleared paginated rows when `deletingAll` changed, but retained `pendingDelete` and `failedDelete`. An open confirmation sheet or failed-delete banner could therefore keep a saved report title in rendered state after the privacy deletion boundary began.

### RED

- Added a real-screen regression that opens `Delete “Friday conversation”?`, starts a deferred Delete All through the repository coordinator, and requires the confirmation and title to disappear while deletion remains in progress.
- Added a second regression that first produces `Could not delete “Friday conversation”. Please try again.`, starts deferred Delete All, and requires the banner and title to disappear.
- Focused run before the fix: 2/2 failed because both title-bearing elements remained rendered after `deleteAllStarted` became true.

### GREEN

- The History render now gates both the failure banner and confirmation sheet on `!deletingAll`, so the transition that observes the deletion boundary hides title-bearing metadata immediately.
- A `deletingAll`-keyed effect increments `deleteGeneration` and clears both `pendingDelete` and `failedDelete`. Existing generation and `deletingAllRef` checks continue to prevent a late delete rejection from restoring the title.
- Focused privacy boundary run: 3/3 passed, including the pre-existing late-completion invalidation test.
- History pagination + History screen + repository coordinator: 3 suites, 25/25 passed.
- Full mobile Jest: 37 suites, 276/276 passed with no console warnings.
- Mobile TypeScript: passed.
- Mobile ESLint: passed with zero warnings.
- iOS Expo export: passed; 1,484 modules bundled to a 5.92 MB Hermes bundle. The exporter printed only the environment-level `NO_COLOR`/`FORCE_COLOR` warning.
- `git diff --check` passed before staging.
