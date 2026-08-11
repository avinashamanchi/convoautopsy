# Task 7 Report: Content-Free Metrics and Repeatable Load Gates

## Outcome

Implemented the ConvoAutopsy Worker operational boundary and deterministic local capacity gate without modifying the user-owned `server/ai-proxy/src/rateLimit.ts` change or any Task 6/App Store files.

### Operational metrics

- Added a frozen, newly constructed nine-field `SafeMetric` allowlist with exhaustive route, plan, status, latency, body-size, provider-unit, in-flight, entitlement-cache, and public-outcome buckets.
- Logger boundary is `info(metric, requestId)`; request IDs are separate envelope correlation values and never metric labels.
- Logger exceptions cannot replace an otherwise valid response.
- The request pipeline carries only a typed content-free operational context. Bounded JSON reads retain byte count, entitlement resolution reports `bypass|hit|miss|error`, and accepted admission returns the post-reservation in-flight count.
- RevenueCat compatibility is preserved through `resolvePlan`, which delegates to the new structured resolver.
- Durable Object release is bounded to two seconds; lease expiry/alarm recovery remains the compensation path.

### Deterministic load gate

- Added a separate `src/loadFixture.ts` entrypoint and `wrangler.load.jsonc`; production `wrangler.jsonc` still points to `src/index.ts`.
- The fixture uses deterministic provider output, a fixture-only control Durable Object, authenticated diagnostics/control, unique installation tokens, and unique `198.18.0.0/15` synthetic identities.
- Fixture secrets and HMAC keys are generated per run, written to a temporary mode-`0600` env file, kept out of process arguments/output, and removed with all ephemeral state in `finally`.
- The self-starting runner enforces loopback by default, exact monotonic 5 RPS and 20 RPS counts, 30s/2s/25s deadlines, nearest-rank percentiles, ordinary-429 rejection, a 100-held/101st-`SERVICE_BUSY` capacity probe, `Promise.allSettled`, abort/child cleanup, and zero final reservations.
- A non-loopback soak requires both `--authorize-provider` and `--synthetic-content`, does not call fixture endpoints, and explicitly reports reservations as not measured.

### Operations

- Added an operator runbook for the 80% alert, 95% Free throttling, 100% circuit-open response, RevenueCat and provider outages, rollback, hidden-input secret rotation, and content-leak incident response.
- No CI workflow was changed; Task 8 owns CI wiring.

## TDD evidence

Each new behavior began with a focused failing test:

- `metrics.test.ts` initially failed because `src/metrics.ts` did not exist.
- The revised logger integration failed because request IDs were embedded in the prior log object and logger exceptions escaped.
- Entitlement cache-state tests failed because only `resolvePlan()` existed.
- Admission instrumentation tests failed because accepted results lacked `inFlight`, expired diagnostics were unavailable, and a stalled release had no deadline.
- Load-core and fixture tests failed before the core module, authenticated rewrite, and fixture control Durable Object existed.
- The first capacity integration exposed isolate-local hold state: peak reservations reached 100, but the held clients timed out and leaked until alarm recovery. A failing fixture-control test preceded the cross-isolate Durable Object fix.

## Fresh verification

- Full Worker Vitest: **10 files, 113 tests passed**.
- TypeScript: **passed** with `tsc --noEmit` under Node 22.22.0.
- ESLint: **passed with zero warnings** for `src`, `test`, and `scripts`.
- Production Wrangler dry build: **passed**, entrypoint remains `src/index.ts`, configured daily budget `1300000`.
- Load-fixture Wrangler dry build: **passed** with RateLimit, Admission, and fixture-only LoadControl Durable Objects.
- Exact CI load gate (5s at 5 RPS, 2s at 20 RPS, then capacity): **passed**; 165 ordinary successes, one expected 503 `SERVICE_BUSY`, peak 100, p95 1608.72ms, p99 1846.12ms, final reservations 0.
- Exact full load gate (60s at 5 RPS, 30s at 20 RPS, then capacity): **passed**; 1,000 ordinary successes, one expected 503 `SERVICE_BUSY`, no ordinary 429s, peak 100, p95 1739.93ms, p99 1749.42ms, final reservations 0.
- `git diff --check`: recorded in final controller verification.

## Not run / external evidence

- No real-provider soak was run. It requires explicit provider authorization and synthetic-content acknowledgement and is not represented as green.
- No Groq, RevenueCat, Apple, Cloudflare production deployment, TestFlight, or device operation was performed.

## Review-fix follow-up

The Task 7 review findings were fixed in the separate commit with subject `fix: harden ConvoAutopsy operational gates`:

- Fatal load-gate output now retains every completed phase sample and its status, public code, and latency distribution. A reachable fixture receives a bounded final diagnostics attempt; the fatal summary emits `activeReservations: "not-measured"` unless a reservation count was actually observed, including preserving an observed held value rather than fabricating zero.
- Body-size metrics are recorded before JSON parsing: invalid JSON reports observed bytes, declared and streamed oversize bodies report the bounded `>128KiB` bucket, and an absent body reports `0`. The byte observer carries only a number and never request content.
- The logger contract accepts `void | Promise<void>` and detaches a rejection handler without awaiting, delaying, or replacing the response.
- The fixture Worker rejects every non-loopback entry request, including valid fixture credentials. It also requires the runner-only `LOAD_FIXTURE_LOCAL_ONLY=1` marker, which is supplied only through the per-run temporary mode-`0600` env file; production configuration remains unchanged.

### Review-fix TDD evidence

- RED: the three focused test files produced **10 expected failures and 12 passes**: three missing fatal-summary cases, five fixture-boundary denials, one unhandled async-logger case, and one rejected-body byte-bucket case.
- GREEN: the focused suite passed **3 files, 22 tests**.
- Full Worker Vitest passed **10 files, 123 tests**.
- TypeScript, ESLint with zero warnings, Node syntax checks, both Wrangler dry builds, and `git diff --check` passed.
- Exact CI load gate passed: **165 ordinary successes**, one expected injected `503 SERVICE_BUSY`, peak reservations **100**, p95 **1742.36ms**, p99 **1988.02ms**, and final observed reservations **0**.
- Exact full load gate passed: **1,000 ordinary successes**, one expected injected `503 SERVICE_BUSY`, no ordinary failures or 429s, peak reservations **100**, p95 **1913.73ms**, p99 **1919.65ms**, and final observed reservations **0**.

## Diagnostic-read deadline follow-up

The remaining Task 7 review finding was fixed in the separate commit with subject `fix: bound ConvoAutopsy diagnostic reads`:

- Fixture diagnostics now use one monotonic deadline that begins before the fetch and remains active through response headers, every streamed body read, the 1 KiB byte bound, and JSON decoding.
- A deadline abort interrupts a pending fetch or body read, cancels the body reader, and rejects with `TimeoutError`, allowing the fatal aggregate summary and outer `finally` cleanup to run.
- Success and failure both clear the deadline timer and detach parent and per-operation abort listeners. A completed diagnostic is not later aborted by a stale timer or parent listener.

### Diagnostic-read TDD and verification evidence

- RED: the focused load-gate file produced **2 expected failures and 9 passes** because the wished-for end-to-end bounded diagnostics reader did not exist. The stalled body could not reach the expected timeout/cancellation path, and success could not prove timer/listener cleanup.
- GREEN: the focused file passed **11 tests**; the stalled body test included delayed response headers, then verified bounded `TimeoutError`, request abort, body cancellation, fatal summary creation, and `finally` reachability.
- Full Worker Vitest passed **10 files, 125 tests**.
- TypeScript, ESLint with zero warnings, Node syntax checks, both production and fixture Wrangler dry builds, and `git diff --check` passed.
- Exact CI load gate passed: **165 ordinary successes**, one expected injected `503 SERVICE_BUSY`, peak reservations **100**, p95 **1558.87ms**, p99 **1825.66ms**, and final observed reservations **0**.
- Exact full load gate passed: **1,000 ordinary successes**, one expected injected `503 SERVICE_BUSY`, no ordinary failures or 429s, peak reservations **100**, p95 **1908.81ms**, p99 **1916.96ms**, and final observed reservations **0**.
