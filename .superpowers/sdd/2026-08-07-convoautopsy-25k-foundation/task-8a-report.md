# Task 8 Phase A implementation report

## Starting point

- Base HEAD: `c72022e816afbaf2c6ceb42d576816c0869c1164`
- Scope: the enumerated Phase A paths, the minimal response-specific consent component/test requested during implementation, and this report only.
- Preserved outside scope: all existing App Store/config/legal/settings changes, `server/ai-proxy/src/rateLimit.ts`, and the untracked readiness plan.

## TDD evidence

RED and GREEN verification evidence will be appended as the phase proceeds.

### RED

Command:

```bash
cd mobile
npx --yes node@22.22.0 ./node_modules/jest/bin/jest.js __tests__/aiClient.test.ts __tests__/responseFlow.test.tsx __tests__/remoteDataReview.test.tsx --runInBand
```

Observed before implementation: 31 failed, 32 passed. The dedicated response client was absent; the screen lacked the explicit reviewed-AI action and on-device/AI labels; consent/review/error/stale-completion assertions failed for those missing behaviors. Existing `RemoteDataReview` coverage remained green (7/7), supporting reuse without modification.

A second focused RED test proved the first bounded-reader draft still used `response.text()` without observing stream chunks: the oversize fixture recorded zero reads and zero cancels. The final reader now counts UTF-8 bytes while streaming, cancels as soon as 32 KiB is exceeded, validates JSON content type, and uses a byte-counted fallback only when a React Native response exposes no reader.

## Implementation

- Added a dedicated `/v1/responses` client with current-consent, installation-token, optional RevenueCat identity hint, strict minimized request DTO, one end-to-end deadline/cancellation boundary, bounded response parsing, strict envelopes, request-ID consistency, and content-free public error codes.
- Kept three deterministic on-device drafts as the ordinary path. The separate AI action opens exact editable text review with selected redactions before checking consent or dispatching.
- Reconstructed the reviewed anonymous analysis DTO without report/storage fields, appended one uniquely labeled AI draft to the latest persisted report, and preserved every existing draft.
- Guarded double confirmation, unmount, report switch, Delete All, late completion, and stale persistence paths.
- Added response-specific wording to the existing versioned consent component while leaving its analysis wording unchanged.

## GREEN verification

All commands used Node `22.22.0` where an explicit runtime was required.

- Focused Phase A tests: 67/67 passed, including chunked oversize, stalled-body deadline, and stalled-body caller-cancellation cases.
- Full mobile suite: 305/305 passed across 37 suites.
- TypeScript: `tsc --noEmit` passed.
- Scoped zero-warning ESLint across every Phase A source/test file passed.
- Authoritative repository lint: `npm run lint` passed.
- `git diff --check` passed.

No physical-device, signed build, TestFlight, external service configuration, App Store review, or publication claim is made by this phase.

## Review-fix loop

### RED

The scoped mobile review-fix run produced 7 expected failures and 64 passes. The failures proved that the response client still accepted missing request-ID headers and a no-reader `text()` fallback, did not cancel invalid/error readers, the repository lacked an atomic append operation, a paid result was discarded after append failure, and an unresolved local-save retry did not block remote review.

The focused Worker run produced 1 expected failure and 19 passes: both success/error `x-request-id` headers and the browser-exposed header were absent.

### GREEN

- The focused mobile review-fix suites passed 72/72. They cover the required bounded-reader behavior, cancellation on invalid and failed streams, mandatory matching request IDs, serialized atomic appends, persistence-only paid-result retry, a local-save dispatch barrier, unique IDs for separate paid results, and exact ID reuse during retry.
- The focused Worker suite passed 20/20. Success and public-error envelopes now carry a matching `x-request-id`, and allowed browser origins expose it.
- The full mobile suite passed 313/313 across 37 suites. Mobile TypeScript and zero-warning lint passed.
- Worker TypeScript, zero-warning lint, the production dry build, and the load-fixture dry build passed.
- The short local load gate passed with 165/165 non-injected requests successful, the intentionally injected 101st-capacity request returning `503/SERVICE_BUSY`, a capacity peak of 100, and zero leaked reservations.
- The first full Worker run passed 123/126. Its three failures were confined to the untouched admission fixture: the fixture's hard-coded `2026-08-07T12:00:00Z` lease time had crossed the real wall clock, so Miniflare immediately treated the fixture alarms as overdue. This rollover failure is repaired and re-run in a separate test-only commit so it cannot be confused with the response-result implementation.
- After moving only the admission test timestamps and matching fixture labels to deterministic year 2099 values, the focused admission suite passed 29/29 and the fresh full Worker suite passed 126/126 across 10 suites.

The response client no longer uses an unbounded `response.text()` fallback. Its production default loads Expo's streaming fetch transport, requires a reader, enforces the byte limit while streaming, and cancels every invalid, oversize, reader-error, timeout, and caller-abort path. Injected transports remain supported for deterministic tests.
