# Task 11 Report: Website Proxy Routing

## Files

- Added `src/components/AiConsentModal.jsx`, `eslint.config.js`, `vitest.config.js`, and utility tests.
- Updated the web analysis and response utilities, Dashboard, Response Crafter, styles, root package metadata/lockfile, Pages workflow, and README.

## Web contract, consent, and fallback

- Analysis POSTs the Task 9 `schemaVersion`, current consent version, stable random installation token, and bounded anonymized messages to `/v1/analyses`.
- Response drafting POSTs the Task 9 response contract to `/v1/responses`, including a single boundary adapter from legacy web fields to `AnalysisResult` fields. Task 9 returns one draft, which the website exposes as a one-item remote draft list; on-device templates remain three drafts.
- Utilities validate success envelopes and request-id consistency before accepting results. Errors and invalid envelopes are never surfaced from provider bodies.
- Consent is just-in-time, contains the required disclosure, stores only consent version/grant time plus a stable `crypto.randomUUID()` installation token, and is not tied to username/account data. Decline does not fetch.
- Local results are always marked `source: local` with `NOT_CONFIGURED` or `REMOTE_UNAVAILABLE`; Dashboard and Response Crafter visibly identify on-device output and remote-unavailable fallback.

## Baseline root gate repairs

- Added root Vitest configuration and `npm test` for website tests only, so nested native/Worker test runners remain independently owned.
- Regenerated the stale root lockfile under Node 22; root `npm ci` now succeeds.
- Added an ESLint 9 flat configuration; root `npm run lint` exits cleanly.
- GitHub Pages still builds/deploys, now uses `npm ci` and public `VITE_AI_PROXY_URL` repository configuration. No proxy endpoint was deployed or configured by this task.

## RED / GREEN

- RED: website utility tests initially failed against direct browser-provider code (wrong endpoint, no source/fallback wrapper, source scan failures). The participant-label boundary test also failed with `Person [` for participant 27.
- GREEN: root Vitest now passes 7 tests, including anonymized/proxy request shape, no authorization header, decline-no-fetch, direct-provider source checks, and `Person AA` label validity.

## Commands and results

- `PATH=/opt/homebrew/opt/node@22/bin:$PATH npm ci` — passed.
- `PATH=/opt/homebrew/opt/node@22/bin:$PATH npm test` — 2 files / 7 tests passed.
- `PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run lint` — passed.
- `PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run build` — passed; Vite reports the pre-existing large-chunk advisory.
- Provider-route/key/header source scan over the website build, source, workflow, and README — passed.
- `git diff --check` — passed before staging; staged diff check is recorded with the commit verification.
- `server/ai-proxy`: `npm test` — 5 files / 24 tests passed; `npm run lint` passed. Worker runtime emitted compatibility-date fallback warnings.
- `mobile`: `npm test -- aiClient.test.ts consentStore.test.ts` — 2 suites / 24 tests passed.

## Endpoint nondeployment, assumptions, and concerns

- No `VITE_AI_PROXY_URL` value or proxy deployment was supplied; remote web AI remains intentionally unavailable until a public endpoint is configured as a GitHub repository variable or local environment value. On-device behavior is the safe default.
- The root dependency audit reports 7 existing vulnerabilities (1 low, 5 high, 1 critical); this task did not apply broad dependency upgrades.
- The proxy integration assumes the current Task 9 response contract continues to return one `response` object. A future multi-draft server contract would require an explicit compatibility update.

## Commit

- `fix: keep AI provider secrets server-side`

## Fix Round 1

- Added HTTPS-only proxy enforcement, with HTTP allowed solely for `localhost`, `127.0.0.1`, and loopback IPv6 development endpoints.
- Local analysis/fallback results now carry `analysis_mode: 'local'`; response payload adaptation preserves that provenance.
- Response requests normalize legacy participant senders and redact participant names from messages and possible interpretations before serialization.
- Both web utilities now support caller cancellation and a bounded request deadline that covers non-compliant/hung fetches; caller aborts are propagated rather than converted to a fallback.
- Dashboard and Response Crafter cancel superseded/unmounted work and use generation checks to ignore stale completion. Consent handlers reject duplicate invocation.
- Replaced disabled root lint rules with recommended/error rules for the actively linted web utilities/components and root JS configs; native/Worker packages retain their own lint commands.
- Moved Capacitor CLI/iOS build tooling to dev dependencies. `npm audit fix --package-lock-only` and both full/production audits report zero vulnerabilities.
- Updated `CLAUDE.md` for Node 22, root tests, and the public proxy URL only.

### Fix Round 1 RED/GREEN and checks

- RED: public cleartext proxy, missing local analysis mode, unredacted response interpretation/sender, and hung request tests failed against the prior implementation.
- GREEN: root Vitest passes 11 tests after the fixes.
- Node 22 root lint, build, and audit (`npm audit`, `npm audit --omit=dev`) pass. Build retains Vite's non-failing large-chunk advisory.
