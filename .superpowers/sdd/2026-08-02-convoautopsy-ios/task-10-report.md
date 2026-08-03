# Task 10 — Mobile AI Consent, Remote Analysis, and Visible Fallback

## Files

- Added `mobile/src/services/consentStore.ts`: versioned Groq consent in the existing SQLite `PreferenceStore`, SecureStore-backed installation UUID, and `clearRemoteAnalysisData()` for the future delete-all-app-data flow.
- Added `mobile/src/services/aiClient.ts`: HTTPS public-proxy client with anonymized-label validation, consent/token payload, 20-second composed abort, strict public envelopes, request-ID consistency when the server provides the header, strict `mode: 'ai'` result validation, and public error mapping only.
- Added `mobile/src/components/AiConsentSheet.tsx` and connected it in `mobile/app/preview.tsx`.
- Added `mobile/__tests__/consentStore.test.ts`, `mobile/__tests__/aiClient.test.ts`, and `mobile/__tests__/remoteAnalysisFlow.test.tsx`.
- Updated `mobile/__tests__/analyzeFlow.test.tsx` from the obsolete inert-AI assertion to the required disclosure assertion.

## Consent, privacy, and state machine

`preview -> consent sheet -> agreement -> analyzing AI -> AI result` is the only remote path. The first sheet says that labels replace names, message text goes to Groq through ConvoAutopsy’s server, ConvoAutopsy does not intentionally store it, automated output can be wrong, and local analysis avoids sharing. Cancel/decline makes no request. Current consent is version `2026-08-02`; revocation and `clearRemoteAnalysisData()` are public store operations for Settings/delete-all wiring.

Every remote start gets an `AbortController` request ID from `AnalysisSession`. Cancel aborts and invalidates the ID; a late completion cannot change the UI. Failed remote requests return to preview with a manual `Run on-device analysis instead` action. No local result is produced automatically. Result labels remain visibly `AI-assisted estimate` or `On-device estimate`.

SecureStore failures surface exactly: `Secure device storage is unavailable. On-device analysis still works.` Local analysis remains available.

## RED / GREEN

- RED: consent tests initially failed because `consentStore` did not exist.
- GREEN: consent storage/token/reset tests pass.
- RED: AI client tests initially failed because `aiClient` did not exist.
- GREEN: success, label anonymization, offline, cancellation, timeout, 400/413/429 retry, 503, invalid JSON/schema, request-ID mismatch, and endpoint tests pass.
- RED: remote-flow tests initially failed because the old UI only showed an inert notice.
- GREEN: disclosure, decline, duplicate agreement, cancellation/stale response, successful AI label, and manual local fallback tests pass.

## Commands and results (Node 22.23.2)

- `npm test -- consentStore.test.ts aiClient.test.ts remoteAnalysisFlow.test.tsx` — 3 suites, 23 tests passed.
- `npm test` — 21 suites, 145 tests passed.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run export:ios` — passed; static iOS bundle exported to ignored `mobile/dist`.
- `npx expo-doctor` — 18/18 checks passed.
- `git diff --check` — passed.
- Repository secret-pattern scan for `gsk_...`/`sk-...` — no matches.

## Endpoint deployment status

No proxy endpoint was configured or deployed by this task. The mobile client reads only `EXPO_PUBLIC_AI_PROXY_URL` as a public endpoint and requires HTTPS by default; it contains no provider secret. A deployed HTTPS Task 9 proxy still needs to be supplied through that public configuration before a real AI request can succeed.

## Assumptions and concerns

- The Task 9 proxy remains responsible for provider authentication and does not log message bodies.
- The client accepts `x-request-id` when supplied and rejects a mismatch with the public body ID; the current proxy response may omit that optional header.
- SecureStore must be present on the physical iOS runtime. Its failure intentionally blocks only the remote path.
- No real network request, proxy deployment, or device-level SecureStore validation was performed because no production endpoint was supplied.
