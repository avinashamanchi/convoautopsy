# ConvoAutopsy iOS Application Design

**Date:** 2026-08-02  
**Status:** Approved by user on 2026-08-02
**Scope:** ConvoAutopsy only; the other three iOS applications receive separate specifications and implementation cycles after this one reaches its release gate.

## 1. Purpose

Build a genuine iPhone application for ConvoAutopsy using Expo and React Native while keeping the existing web application operational. The iOS app will let a user import or paste a conversation, receive structured communication-pattern feedback, save results locally, craft possible responses, and export or share a report.

The first development loop must run on the user's iPhone through Expo Go. Production validation will later move to an Expo development build and TestFlight because Expo Go is not a production or App Store review environment.

## 2. Goals

- Deliver an iOS-first, touch-native experience rather than a WebView wrapper.
- Preserve the core conversation parsing, pattern analysis, response-crafting, history, and report-sharing features.
- Keep existing web deployment behavior unchanged.
- Support a useful offline path when the AI service is unavailable or the user does not consent to transmitting text.
- Keep third-party AI credentials out of all web and mobile bundles.
- Make the data flow and product language suitable for App Store privacy and safety review.
- Add automated tests and repeatable build checks that the current repository lacks.

## 3. Non-goals

- Android implementation or Google Play submission during this cycle.
- Rebuilding the marketing website.
- Social accounts, cloud conversation synchronization, subscriptions, advertising, or analytics.
- Presenting results as therapy, diagnosis, clinical advice, truth about a participant's intentions, or a validated psychological assessment.
- Removing the existing Capacitor project before the Expo implementation reaches feature parity.

## 4. Current-State Findings

The current root project is React 19 and Vite. It contains the marketing experience and a functional dashboard. A legacy `convoautopsy-phase1` implementation and a Capacitor iOS project are also committed.

The following issues affect the mobile work:

- The README describes an Expo `native/` folder, but that folder is not present.
- The local account implementation stores usernames and plaintext passwords in `localStorage`. It is not a real account system and must not be ported.
- A retired browser API-key variable would be recoverable from a production bundle.
- Conversation copy uses phrases such as "clinical breakdown," "hidden meaning," and "what they really mean." These claims exceed what the heuristic and AI output can establish.
- There is no automated test runner.
- The current Capacitor app is primarily packaged web content and carries App Store minimum-functionality risk.

## 5. Selected Architecture

### 5.1 Repository layout

Add a self-contained `mobile/` Expo application to this repository:

```text
convoautopsy/
├── mobile/
│   ├── app/                 # Expo Router screens and route layouts
│   ├── src/
│   │   ├── components/      # Reusable native UI
│   │   ├── domain/          # Parser, local analyzer, schemas, types
│   │   ├── services/        # AI API, persistence, import, export
│   │   ├── state/           # Application state and query orchestration
│   │   └── theme/           # Colors, typography, spacing, accessibility
│   ├── assets/              # App icon, splash image, and static assets
│   ├── app.config.ts
│   ├── eas.json
│   └── package.json
├── server/
│   └── ai-proxy/            # TypeScript Cloudflare Worker and contract tests
├── src/                     # Existing web application, retained
├── ios/                     # Existing Capacitor project, retained initially
└── convoautopsy-phase1/     # Existing legacy implementation, retained
```

The mobile and worker packages will pin Node 22 LTS rather than use the Mac's currently installed Node 26 runtime. TypeScript strict mode will be enabled. The initial app will use the Expo SDK version supported by the current iPhone Expo Go client; SDK and Apple build-image compatibility will be rechecked immediately before release builds.

### 5.2 Mobile framework

- Expo and React Native with Expo Router for native screen navigation.
- React Native `StyleSheet` plus a small typed token module for the existing dark, purple, and pink design language.
- Expo SDK libraries for document selection, image selection, sharing, file access, haptics, and safe-area behavior.
- The initial dependency set will remain compatible with the current iPhone Expo Go client.
- A custom development build will add the local OCR module and exercise production native configuration after Apple Developer enrollment; the app will never depend on Expo Go for release validation.

### 5.3 Local-first product model

The mobile app will not have login or registration. A local-only app does not gain meaningful security from a username and password stored on the same device.

Conversation reports, onboarding state, consent version, and preferences will be stored in the app sandbox using `expo-sqlite` behind a versioned persistence adapter. The adapter will expose explicit migration and `deleteAllData()` operations so screens are not coupled to SQL or a specific schema version.

The randomly generated installation token used for abuse prevention will use `expo-secure-store`. The UI will state that saved conversations remain on the device unless the user explicitly shares them or sends them for AI analysis.

## 6. Product Screens and Components

### 6.1 Navigation

The primary application uses four bottom tabs:

1. **Analyze** — create a new analysis.
2. **History** — view, reopen, search, or delete saved reports.
3. **Responses** — craft de-escalating response options from a selected report.
4. **Settings** — privacy, consent, data deletion, educational limitations, and app information.

Analysis results open as a pushed detail screen so the user can navigate back without losing their input.

### 6.2 Analyze flow

- Text editor with a clear `Name: message` example.
- Paste action and `.txt` document import.
- Screenshot selection, with text extraction implemented through a small local Expo native module backed by Apple's Vision text-recognition API. Expo Go testing will cover image selection and the text-confirmation UI; OCR itself will run in the custom development build and release build.
- Parsed-message preview where the user can correct speaker boundaries before analysis.
- Choice between **On-device quick analysis** and **AI-assisted analysis**.
- A just-in-time consent sheet before the first AI-assisted request.
- Loading state with cancellation and no duplicate submissions.

### 6.3 Result screen

- Communication intensity score presented as an estimate, not an objective measurement.
- Pattern summary using Criticism, Contempt, Defensiveness, Stonewalling, or Neutral labels.
- Conflict-style estimate.
- Per-message observations.
- "Possible interpretation" instead of "hidden meaning" or claims about what a speaker truly intended.
- Educational limitation note visible from the result.
- Save, delete, export, and native share actions.

### 6.4 Response crafter

The existing identity, goal, and tone choices will be preserved in a native step flow. Generated suggestions will be labeled as drafts. The user must review and manually copy or share a response; the app will not message another person automatically.

### 6.5 Accessibility

- Dynamic Type support without truncating critical content.
- Screen-reader labels, roles, values, and logical focus order.
- Minimum 44-point touch targets.
- Color is never the only carrier of a pattern or severity.
- Reduced-motion behavior for decorative animation.
- Keyboard-safe editing and visible focus/error states.

## 7. Data Flow

### 7.1 On-device analysis

```text
User text or imported text
  -> normalize and parse speakers
  -> user confirms parsed messages
  -> deterministic local classifier
  -> validate AnalysisResult schema
  -> display result
  -> save locally only after user action
```

The local analyzer will be extracted into pure TypeScript functions with deterministic tests. It remains available offline and when remote analysis fails.

### 7.2 AI-assisted analysis

```text
User text
  -> normalize and parse on device
  -> replace speaker names with Person A, Person B, and so on
  -> show AI disclosure and obtain explicit consent
  -> HTTPS request to the ConvoAutopsy AI proxy
  -> server enforces size/rate limits and calls the AI provider
  -> server validates and minimizes the provider response
  -> mobile validates the same versioned schema
  -> display result or offer local fallback
```

The proxy will hold the AI-provider key in server-only environment configuration. It will not intentionally retain conversation text or provider responses. Operational logs must exclude request bodies and generated content. Rate limiting will use a pseudonymous installation token and network signals; raw tokens will not be written to application logs.

The user may revoke AI consent in Settings. Revocation prevents future remote requests but does not delete reports the user chose to save locally; `Delete all app data` removes both.

### 7.3 Screenshot input

The production path is on-device OCR so screenshots do not need to leave the phone. The extracted text must always be shown for correction before analysis. An image-specific recognition failure returns the user to the editable text-confirmation screen and never silently uploads the image. A development-build failure of the OCR module is a release blocker. Text paste and `.txt` import remain complete alternatives.

### 7.4 Persistence

Persisted report records contain:

- locally generated UUID;
- creation and modification timestamps;
- original input only when the user explicitly chooses to save it;
- anonymized parsed messages;
- validated analysis result and analysis mode;
- optional response-crafter drafts.

No plaintext password or AI key is persisted. Deleting a report removes its associated source text and drafts in one operation.

## 8. AI Proxy Contract and Abuse Controls

The repository will include a TypeScript Cloudflare Worker with a narrow API rather than direct provider access from the app. Wrangler will run it locally and deploy it. The AI-provider key will be configured with Worker secrets, never a checked-in or public `VITE_` variable. Cloudflare KV will hold short-lived, hashed rate-limit counters; conversation content will not be stored in KV.

- `POST /v1/analyses` accepts a schema-versioned, anonymized message array.
- Body size, message count, per-message length, timeout, and response size are bounded.
- Malformed input receives a stable 4xx error without contacting the provider.
- Provider output is parsed as data and validated; it is never evaluated or rendered as markup.
- The endpoint returns a request ID and typed error code, not internal exception details.
- Rate limits return `429` with a retry hint.
- No conversation content is placed in URLs, analytics, crash breadcrumbs, or normal logs.
- Secrets are accepted only from server environment configuration.
- The existing website will call this proxy after deployment instead of contacting the AI provider with a browser-bundled key; its deterministic local fallback remains available.

The first implementation will run locally with a mocked provider. Live provider deployment is a separate credentialed release step performed only after the user controls the hosting account and secret.

## 9. Error Handling

- **Unparseable input:** keep the original text and show concrete format corrections.
- **Partial parse:** show accepted and rejected lines before the user proceeds.
- **Offline or timeout:** retain the draft and offer on-device analysis.
- **Rate limited:** retain the draft, show the retry time, and offer on-device analysis.
- **Invalid AI response:** discard the response, record only a content-free error code, and offer local analysis.
- **Storage failure:** keep the current result in memory and state clearly that it was not saved.
- **Import failure:** distinguish unsupported type, unreadable file, empty file, and excessive size.
- **Export failure:** leave the report intact and provide a retry action.
- **Unexpected crash:** no conversation content or AI output may be attached to diagnostics.

Errors must never be represented as successful analyses or silently replace an AI result with a local result. The result screen will identify which analysis mode produced it.

## 10. Privacy, Safety, and App Review

- Replace diagnostic and clinical claims with communication-pattern and self-reflection language throughout the mobile UI and App Store metadata.
- Display an educational-use limitation: output may be incomplete or wrong and is not therapy, medical advice, or a factual determination of intent.
- Obtain explicit permission before sharing conversation text with a third-party AI provider, even after names are replaced.
- Provide an in-app privacy screen and a publicly accessible privacy-policy URL before submission.
- Provide per-report deletion and a prominent `Delete all app data` action.
- Request photo or file permissions only when the user invokes the corresponding feature, with accurate purpose strings.
- Do not require login, contacts access, tracking permission, notifications, or unrelated personal information.
- Provide App Review with a fully functional path that does not require a private reviewer account.
- Complete App Privacy and age-rating questionnaires from observed data behavior, not marketing assumptions.

## 11. Testing Strategy

### 11.1 Automated checks

- TypeScript type checking and ESLint.
- Pure unit tests for parsing, anonymization, classification, scoring, schema migration, and response templates.
- Contract tests proving mobile and server accept the same analysis schema.
- Persistence tests for create, load, migrate, delete-one, and delete-all behavior.
- Service tests for offline, timeout, cancellation, `429`, provider failure, malformed JSON, and oversized input.
- React Native Testing Library coverage for the analyze flow, consent sheet, result labeling, deletion confirmation, and accessibility labels.
- Server tests confirming request bodies do not reach normal logs.

### 11.2 Device and release checks

- Expo Go smoke test on the user's iPhone for navigation, text entry, parsing, analysis, history, screenshot selection, and core sharing UI. The OCR call itself is exercised in the development build because Expo Go cannot load the local native module.
- iOS simulator checks across small and large supported screens once full Xcode is available.
- Physical-device development-build checks for OCR, file import, sharing, permissions, background/foreground transitions, airplane mode, and low-connectivity behavior.
- VoiceOver, Dynamic Type, Reduce Motion, dark appearance, and landscape/rotation checks where supported.
- TestFlight release-candidate pass before App Store submission.

## 12. Delivery Milestones

1. **Foundation:** Expo project, theme, navigation, typed domain models, and CI checks.
2. **Local core:** parser, preview, on-device analysis, results, history, and deletion.
3. **Native utilities:** file import, screenshot selection/OCR path, export, sharing, and haptics.
4. **Secure AI:** consent flow, server proxy, validated remote analysis, limits, and fallback behavior.
5. **Response crafter:** native wizard, drafts, and manual copy/share.
6. **Review readiness:** privacy content, claim cleanup, accessibility, icons, screenshots, metadata, and release checklist.
7. **Distribution:** development build, TestFlight, App Store submission, and review-response loop after Apple Developer enrollment.

Each milestone must leave the project buildable and testable. A visual feature is not considered complete until its failure, loading, empty, and accessibility states are covered.

## 13. Acceptance Criteria

The ConvoAutopsy iOS implementation is ready for the App Store release phase when:

- It is React Native UI and does not load the public website in a WebView.
- The core flow works on a physical iPhone and a release build without a development server.
- A user can paste or import a conversation, verify parsing, run local analysis, view results, save or delete them, craft a draft response, and share an export.
- AI-assisted analysis uses the server proxy; no provider secret exists in the application bundle.
- The app clearly identifies local versus AI-assisted output and never disguises a fallback.
- The app has no plaintext password flow.
- Consent, privacy disclosure, data deletion, and educational limitations match actual behavior.
- Automated checks pass from a clean checkout.
- Permission-denied, offline, service-failure, malformed-output, and storage-failure paths have been exercised.
- App icon, launch screen, supported-device layout, privacy policy, support URL, App Privacy answers, review notes, and screenshots are prepared.
- A TestFlight release candidate completes the manual device matrix without unresolved release-blocking defects.

Approval is never a guaranteed outcome because Apple makes the final review decision. The release process will treat review feedback as actionable input and resubmit only after the cited issue is verified fixed.
