# ConvoAutopsy iOS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a native Expo/React Native ConvoAutopsy iPhone app, plus a privacy-preserving AI proxy, while keeping the existing website functional.

**Architecture:** A new `mobile/` Expo SDK 54 application owns native navigation, local analysis, SQLite history, imports, on-device OCR, exports, consent, and AI calls. A TypeScript Cloudflare Worker in `server/ai-proxy/` owns provider secrets, validation, rate limiting, and provider calls; the web app will also use this proxy.

**Tech Stack:** Node 22 LTS, Expo SDK 54, React Native 0.81, Expo Router 6, TypeScript strict mode, Jest/jest-expo, React Native Testing Library, Zod, expo-sqlite, expo-secure-store, Cloudflare Workers, Wrangler, Vitest, Groq provider API.

## Global Constraints

- Target iOS first; do not configure or submit an Android release in this plan.
- Preserve the existing website and committed Capacitor project until Expo feature parity is verified.
- Use React Native components; do not load the website in a WebView.
- Use Expo SDK 54 for the initial Expo Go loop because the current iPhone Expo Go client supports SDK 54.
- Pin Node 22 LTS in every JavaScript package and in CI; do not use the machine's global Node 26 for project commands.
- The mobile app supports iOS 15.1 or newer, the Expo SDK 54 platform floor.
- No account, login, advertising, analytics, tracking, social sharing automation, subscription, or cloud conversation sync.
- No provider API secret may appear in a `VITE_` or `EXPO_PUBLIC_` value, application bundle, repository file, test fixture, or normal log.
- Limit raw input to 100,000 UTF-8 characters, 100 parsed messages, and 1,000 characters per message.
- Label results as estimates and possible interpretations; never describe them as clinical findings, diagnosis, therapy, truth, or validated psychological assessment.
- Remote analysis requires versioned, just-in-time consent before any conversation text leaves the device.
- Remote failures must stay visibly distinct from successful local analysis; never silently substitute one mode for the other.
- Saved data is local-only and must support deletion per report and deletion of all app data.
- Production screenshot text extraction runs on-device through Apple Vision; screenshots are never uploaded for OCR.
- Every task ends with focused tests, relevant aggregate checks, and a commit.

---

## File and Responsibility Map

### Canonical contract

- Create: `contracts/analysis.v1.schema.json` — JSON Schema shared by fixtures and review tooling.
- Create: `contracts/fixtures/analysis.valid.json` — valid response fixture.
- Create: `contracts/fixtures/analysis.invalid.json` — rejected response fixture.

### Mobile application

- Create: `mobile/app/_layout.tsx` — providers and root stack.
- Create: `mobile/app/(tabs)/_layout.tsx` — bottom-tab navigation.
- Create: `mobile/app/(tabs)/index.tsx` — Analyze screen.
- Create: `mobile/app/(tabs)/history.tsx` — saved report search/list.
- Create: `mobile/app/(tabs)/responses.tsx` — saved-report response entry point.
- Create: `mobile/app/(tabs)/settings.tsx` — privacy, consent, data deletion, limitations.
- Create: `mobile/app/preview.tsx` — parsed-message confirmation.
- Create: `mobile/app/result.tsx` — current unsaved result.
- Create: `mobile/app/report/[id].tsx` — persisted report detail.
- Create: `mobile/app/response/[reportId].tsx` — response-crafter step flow.
- Create: `mobile/app/privacy.tsx` — in-app privacy policy.
- Create: `mobile/src/domain/analysis.ts` — domain types and Zod result schema.
- Create: `mobile/src/domain/parser.ts` — input normalization, anonymization, rejected-line reporting.
- Create: `mobile/src/domain/localAnalyzer.ts` — deterministic local classifier and score.
- Create: `mobile/src/domain/responseCrafter.ts` — deterministic response templates.
- Create: `mobile/src/state/AnalysisSession.tsx` — draft/preview/result state and cancellation.
- Create: `mobile/src/services/reportRepository.ts` — persistence interface.
- Create: `mobile/src/services/sqliteReportRepository.ts` — schema migrations and SQLite adapter.
- Create: `mobile/src/services/preferenceStore.ts` — versioned non-secret local preferences.
- Create: `mobile/src/services/sqlitePreferenceStore.ts` — SQLite preference adapter.
- Create: `mobile/src/services/aiClient.ts` — typed remote client and stable error mapping.
- Create: `mobile/src/services/consentStore.ts` — consent and SecureStore installation token.
- Create: `mobile/src/services/importConversation.ts` — document/image selection and input limits.
- Create: `mobile/src/services/ocr.ts` — optional native OCR boundary.
- Create: `mobile/src/services/exportReport.ts` — view capture and iOS share sheet.
- Create: `mobile/src/components/*` — focused native form, preview, result, history, consent, and report-card UI.
- Create: `mobile/src/theme/tokens.ts` — typed visual constants.
- Create: `mobile/modules/convo-ocr/*` — local Expo module backed by Apple Vision.
- Create: `mobile/__tests__/*` — unit, service, screen, route, persistence, and accessibility tests.

### AI proxy

- Create: `server/ai-proxy/src/index.ts` — Worker request router and response envelope.
- Create: `server/ai-proxy/src/contract.ts` — request/response schemas and bounded parsing.
- Create: `server/ai-proxy/src/provider.ts` — `AiProvider` interface and Groq adapter.
- Create: `server/ai-proxy/src/rateLimit.ts` — HMAC-derived KV rate-limit keys and counters.
- Create: `server/ai-proxy/src/errors.ts` — stable public error codes.
- Create: `server/ai-proxy/test/*` — Worker, contract, rate-limit, logging, and provider tests.

### Existing web and release support

- Modify: `src/utils/analyzeConversation.js` — use proxy instead of a browser key.
- Modify: `src/utils/craftResponse.js` — use proxy instead of a browser key.
- Modify: `.github/workflows/deploy.yml` — remove the Groq secret from the web build.
- Create: `.github/workflows/ios-ci.yml` — mobile, Worker, and web checks.
- Create: `public/privacy.html` — public privacy policy.
- Create: `docs/app-store/convoautopsy-ios-metadata.md` — listing copy and privacy/review answers.
- Create: `docs/app-store/convoautopsy-ios-release-checklist.md` — credentialed and device release gates.

---

### Task 1: Expo Foundation and Reproducible Toolchain

**Files:**
- Create: `.node-version`
- Create: `mobile/**` from the Expo SDK 54 default template
- Modify: `mobile/package.json`
- Modify: `mobile/tsconfig.json`
- Modify: `mobile/app.json` into `mobile/app.config.ts`
- Modify: `.gitignore`
- Create: `mobile/__tests__/foundation.test.tsx`

**Interfaces:**
- Consumes: none.
- Produces: an Expo SDK 54 package with `npm run test`, `npm run typecheck`, `npm run lint`, and `npm run export:ios`.

- [ ] **Step 1: Pin and activate Node 22**

Use Homebrew's versioned Node package and verify the active runtime:

```bash
brew list node@22 >/dev/null 2>&1 || brew install node@22
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
node --version
```

Create `.node-version` with exactly:

```text
22
```

Expected: `node --version` begins with `v22.`. Use `apply_patch` to create `.node-version` with the content shown above.

- [ ] **Step 2: Scaffold the SDK 54 application**

Run:

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
npx create-expo-app@latest mobile --template default@sdk-54 --yes --no-agents-md
cd mobile
npx expo install expo-sqlite expo-secure-store expo-document-picker expo-image-picker expo-file-system expo-sharing expo-haptics expo-clipboard react-native-view-shot
npm install zod
npx expo install --dev jest-expo jest @testing-library/react-native @types/jest react-test-renderer
```

Expected: `npx expo-doctor` reports no dependency mismatch.

- [ ] **Step 3: Add scripts and strict TypeScript configuration**

Set these scripts in `mobile/package.json`:

```json
{
  "scripts": {
    "start": "expo start",
    "test": "jest --runInBand",
    "test:watch": "jest --watch",
    "typecheck": "tsc --noEmit",
    "lint": "expo lint",
    "export:ios": "expo export --platform ios"
  },
  "engines": {
    "node": "22.x"
  },
  "jest": {
    "preset": "jest-expo"
  }
}
```

Set `compilerOptions.strict` and `compilerOptions.resolveJsonModule` to `true`, then add `"types": ["jest"]` in `mobile/tsconfig.json`. React Native Testing Library's Jest matchers load through the installed package; do not add the removed `extend-expect` subpath.

- [ ] **Step 4: Write the failing foundation test**

Create `mobile/__tests__/foundation.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';
import HomeScreen from '../app/(tabs)/index';

it('renders the native analyze entry point', () => {
  render(<HomeScreen />);
  expect(screen.getByRole('header', { name: 'Analyze a conversation' })).toBeOnTheScreen();
  expect(screen.getByText('Your text stays on this device unless you choose AI-assisted analysis.')).toBeOnTheScreen();
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run:

```bash
cd mobile
npm test -- foundation.test.tsx
```

Expected: FAIL because the generated example does not expose the required heading and privacy copy.

- [ ] **Step 6: Replace the example with the smallest native shell**

Replace the generated tab index with:

```tsx
import { StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>Analyze a conversation</Text>
      <Text style={styles.body}>
        Your text stays on this device unless you choose AI-assisted analysis.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070708', padding: 24, justifyContent: 'center' },
  title: { color: '#f0eff4', fontSize: 32, fontWeight: '700', marginBottom: 12 },
  body: { color: '#b8b6c1', fontSize: 16, lineHeight: 24 },
});
```

Remove the generated example screens, components, and assets that are not referenced. Do not remove Expo Router.

- [ ] **Step 7: Configure the app identity**

Create `mobile/app.config.ts`:

```ts
import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'ConvoAutopsy',
  slug: 'convoautopsy',
  scheme: 'convoautopsy',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  ios: {
    bundleIdentifier: 'io.convoautopsy.app',
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSPhotoLibraryUsageDescription: 'Choose a conversation screenshot for private on-device text extraction.'
    }
  },
  plugins: ['expo-router', 'expo-sqlite', 'expo-secure-store', 'expo-document-picker', 'expo-image-picker'],
  experiments: { typedRoutes: true }
};

export default config;
```

- [ ] **Step 8: Verify the foundation**

Run:

```bash
cd mobile
npm test -- foundation.test.tsx
npm run typecheck
npm run lint
npx expo-doctor
npm run export:ios
```

Expected: every command exits 0 and `dist/` contains an iOS bundle.

- [ ] **Step 9: Commit**

```bash
git add .node-version .gitignore mobile
git commit -m "feat: scaffold native ConvoAutopsy app"
```

---

### Task 2: Versioned Domain Contract, Parser, and Local Analyzer

**Files:**
- Create: `contracts/analysis.v1.schema.json`
- Create: `contracts/fixtures/analysis.valid.json`
- Create: `contracts/fixtures/analysis.invalid.json`
- Create: `mobile/src/domain/analysis.ts`
- Create: `mobile/src/domain/parser.ts`
- Create: `mobile/src/domain/localAnalyzer.ts`
- Create: `mobile/__tests__/parser.test.ts`
- Create: `mobile/__tests__/localAnalyzer.test.ts`
- Create: `mobile/__tests__/analysisSchema.test.ts`

**Interfaces:**
- Consumes: Zod from Task 1.
- Produces:
  - `parseConversation(raw: string): ParseResult`
  - `analyzeLocally(messages: ParsedMessage[]): AnalysisResult`
  - `AnalysisResultSchema` and `AnalysisResult`
  - `MAX_INPUT_CHARS`, `MAX_MESSAGES`, and `MAX_MESSAGE_CHARS`.

- [ ] **Step 1: Define failing parser behavior**

Create `mobile/__tests__/parser.test.ts`:

```ts
import { parseConversation } from '../src/domain/parser';

it('anonymizes every speaker and reports rejected lines', () => {
  const parsed = parseConversation('Alex: Hello\ninvalid line\nJordan - Hi\nSam: Welcome');
  expect(parsed.messages).toEqual([
    { id: 'line-1', sender: 'Person A', text: 'Hello', sourceLine: 1 },
    { id: 'line-3', sender: 'Person B', text: 'Hi', sourceLine: 3 },
    { id: 'line-4', sender: 'Person C', text: 'Welcome', sourceLine: 4 }
  ]);
  expect(parsed.rejected).toEqual([
    { sourceLine: 2, text: 'invalid line', reason: 'Use Name: Message format.' }
  ]);
});

it('rejects input beyond the explicit limits', () => {
  expect(() => parseConversation('x'.repeat(100_001))).toThrow('INPUT_TOO_LARGE');
  expect(() => parseConversation('Name: ' + 'x'.repeat(1_001))).toThrow('MESSAGE_TOO_LARGE');
});
```

- [ ] **Step 2: Run the parser tests to verify failure**

Run `cd mobile && npm test -- parser.test.ts`.

Expected: FAIL because `parseConversation` does not exist.

- [ ] **Step 3: Implement domain types and parsing**

Create `mobile/src/domain/analysis.ts` with these public fields:

```ts
import { z } from 'zod';

export const PatternLabelSchema = z.enum([
  'Criticism', 'Contempt', 'Defensiveness', 'Stonewalling', 'Neutral'
]);
export const EgoStateSchema = z.enum(['Parent', 'Adult', 'Child']);
export const ConflictModeSchema = z.enum([
  'Competing', 'Avoiding', 'Compromising', 'Collaborating',
  'Accommodating', 'Competing vs Avoiding'
]);
export const AnalysisMessageSchema = z.object({
  sender: z.string().regex(/^Person [A-Z]+$/),
  text: z.string().min(1).max(1000),
  pattern: PatternLabelSchema,
  egoState: EgoStateSchema,
  possibleInterpretation: z.string().min(1).max(300)
}).strict();
export const AnalysisResultSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.enum(['local', 'ai']),
  intensityScore: z.number().int().min(0).max(100),
  conflictMode: ConflictModeSchema,
  messages: z.array(AnalysisMessageSchema).min(1).max(100)
}).strict();

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type AnalysisMessage = z.infer<typeof AnalysisMessageSchema>;
export type PatternLabel = z.infer<typeof PatternLabelSchema>;
export type EgoState = z.infer<typeof EgoStateSchema>;
export const ResponseDraftSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(1000),
  hint: z.string().min(1).max(200)
}).strict();
export type ResponseDraft = z.infer<typeof ResponseDraftSchema>;

export type ParsedMessage = {
  id: string;
  sender: string;
  text: string;
  sourceLine: number;
};
export type RejectedLine = {
  sourceLine: number;
  text: string;
  reason: string;
};
export type ParseResult = {
  messages: ParsedMessage[];
  rejected: RejectedLine[];
};
```

Create `parser.ts` with constants `MAX_INPUT_CHARS = 100_000`, `MAX_MESSAGES = 100`, `MAX_MESSAGE_CHARS = 1_000`. Match `/^([^:\-\n]{1,40})[:\-]\s*(.+)$/`, map distinct names in encounter order to `Person A` through `Person Z`, and reject nonmatching nonblank lines. Throw stable errors named in the tests when limits are exceeded.

- [ ] **Step 4: Verify parser tests pass**

Run `cd mobile && npm test -- parser.test.ts`.

Expected: PASS.

- [ ] **Step 5: Write failing local-analysis tests**

Create `mobile/__tests__/localAnalyzer.test.ts`:

```ts
import { analyzeLocally } from '../src/domain/localAnalyzer';
import { parseConversation } from '../src/domain/parser';

it('returns a labeled local estimate without claiming hidden intent', () => {
  const messages = parseConversation(
    "Alex: Why do you always do this?\nJordan: Whatever. I'm done."
  ).messages;
  const result = analyzeLocally(messages);
  expect(result.schemaVersion).toBe(1);
  expect(result.mode).toBe('local');
  expect(result.intensityScore).toBeGreaterThan(0);
  expect(result.messages[0].pattern).toBe('Criticism');
  expect(result.messages[0].possibleInterpretation).toBe(
    'This wording may reflect feeling unheard and expressing it through blame.'
  );
});

it('is deterministic for identical parsed input', () => {
  const messages = parseConversation('A: Can we talk?\nB: I understand.').messages;
  expect(analyzeLocally(messages)).toEqual(analyzeLocally(messages));
});
```

- [ ] **Step 6: Run the local-analysis tests to verify failure**

Run `cd mobile && npm test -- localAnalyzer.test.ts`.

Expected: FAIL because `analyzeLocally` does not exist.

- [ ] **Step 7: Port and correct the deterministic analyzer**

Create `mobile/src/domain/localAnalyzer.ts`. Port the current regex sets and weights, but return the new names `pattern`, `egoState`, and `possibleInterpretation`. Use conditional language for every interpretation. Validate the final object through:

```ts
return AnalysisResultSchema.parse({
  schemaVersion: 1,
  mode: 'local',
  intensityScore,
  conflictMode,
  messages: analyzedMessages
});
```

Do not include `rawName` or any original speaker name.

- [ ] **Step 8: Add canonical fixtures and schema-alignment tests**

Create the JSON Schema with `additionalProperties: false` at every object, the exact enums from `analysis.ts`, and the limits in Global Constraints. Create one valid fixture and one fixture with `intensityScore: 101`.

Create `mobile/__tests__/analysisSchema.test.ts`:

```ts
import valid from '../../contracts/fixtures/analysis.valid.json';
import invalid from '../../contracts/fixtures/analysis.invalid.json';
import { AnalysisResultSchema } from '../src/domain/analysis';

it('accepts the canonical valid fixture', () => {
  expect(AnalysisResultSchema.safeParse(valid).success).toBe(true);
});

it('rejects the canonical out-of-range fixture', () => {
  expect(AnalysisResultSchema.safeParse(invalid).success).toBe(false);
});
```

- [ ] **Step 9: Run domain verification and commit**

```bash
cd mobile
npm test -- parser.test.ts localAnalyzer.test.ts analysisSchema.test.ts
npm run typecheck
cd ..
git add contracts mobile/src/domain mobile/__tests__
git commit -m "feat: add versioned local analysis domain"
```

---

### Task 3: Native Theme, Navigation, and Session Boundary

**Files:**
- Create: `mobile/src/theme/tokens.ts`
- Create: `mobile/src/components/Screen.tsx`
- Create: `mobile/src/components/PrimaryButton.tsx`
- Create: `mobile/src/components/EmptyState.tsx`
- Create: `mobile/src/state/AnalysisSession.tsx`
- Modify: `mobile/app/_layout.tsx`
- Modify: `mobile/app/(tabs)/_layout.tsx`
- Create/Modify: the initial Analyze, History, Responses, and Settings tab routes
- Create: `mobile/__tests__/navigation.test.tsx`
- Create: `mobile/__tests__/analysisSession.test.tsx`

**Interfaces:**
- Consumes: `ParseResult` and `AnalysisResult` from Task 2.
- Produces: `useAnalysisSession()` with `draft`, `parsed`, `activeResult`, `setDraft`, `preparePreview`, `runLocal`, `setRemoteResult`, `reset`, and `cancel`.

- [ ] **Step 1: Write failing session and navigation tests**

Create `mobile/__tests__/analysisSession.test.tsx` with a harness that calls `setDraft`, `preparePreview`, and `runLocal` and expects `activeResult.mode` to equal `local`.

Create `mobile/__tests__/navigation.test.tsx`:

```tsx
import { renderRouter, screen } from 'expo-router/testing-library';

it('exposes the four native tabs', () => {
  renderRouter('./fixtures/routes', { initialUrl: '/' });
  expect(screen.getByText('Analyze')).toBeOnTheScreen();
  expect(screen.getByText('History')).toBeOnTheScreen();
  expect(screen.getByText('Responses')).toBeOnTheScreen();
  expect(screen.getByText('Settings')).toBeOnTheScreen();
});
```

Provide focused route fixtures outside `app/` as required by Expo Router testing.

- [ ] **Step 2: Verify both tests fail**

Run `cd mobile && npm test -- analysisSession.test.tsx navigation.test.tsx`.

Expected: FAIL because the provider and final tab layout do not exist.

- [ ] **Step 3: Implement the session provider**

The public state must use this shape:

```ts
type AnalysisSessionValue = {
  draft: string;
  parsed: ParseResult | null;
  activeResult: AnalysisResult | null;
  status: 'idle' | 'preview' | 'analyzing-local' | 'analyzing-ai' | 'result';
  requestId: number;
  setDraft(value: string): void;
  preparePreview(): ParseResult;
  runLocal(): AnalysisResult;
  setRemoteResult(result: AnalysisResult, requestId: number): void;
  startRemote(): { requestId: number; signal: AbortSignal };
  cancel(): void;
  reset(): void;
};
```

Use an `AbortController` ref. Increment `requestId` for each remote attempt and ignore a result whose request ID is no longer current.

- [ ] **Step 4: Implement native tokens and primitives**

Create semantic tokens for background, surface, primary text, secondary text, accent, warning, error, success, spacing, radius, and minimum touch target. `PrimaryButton` must set `accessibilityRole="button"`, expose disabled state, and have a minimum height of 48 points.

- [ ] **Step 5: Implement root Stack and four Tabs**

`mobile/app/_layout.tsx` wraps the Stack in `AnalysisSessionProvider` and `SafeAreaProvider`. The tab layout uses Expo Router `Tabs` and text/icon labels for Analyze, History, Responses, and Settings. Do not use color as the only selected-state signal.

- [ ] **Step 6: Verify and commit**

```bash
cd mobile
npm test -- analysisSession.test.tsx navigation.test.tsx
npm run typecheck
npm run lint
cd ..
git add mobile/app mobile/src/components mobile/src/state mobile/src/theme mobile/__tests__
git commit -m "feat: add native navigation and analysis session"
```

---

### Task 4: Analyze, Parse Preview, and Local Result Flow

**Files:**
- Modify: `mobile/app/(tabs)/index.tsx`
- Create: `mobile/app/preview.tsx`
- Create: `mobile/app/result.tsx`
- Create: `mobile/src/components/ConversationEditor.tsx`
- Create: `mobile/src/components/ParsedMessageList.tsx`
- Create: `mobile/src/components/AnalysisModePicker.tsx`
- Create: `mobile/src/components/ResultSummary.tsx`
- Create: `mobile/__tests__/analyzeFlow.test.tsx`
- Create: `mobile/__tests__/resultCopy.test.tsx`

**Interfaces:**
- Consumes: `useAnalysisSession()`, `parseConversation`, and `analyzeLocally`.
- Produces: a complete paste → preview → local analysis → result path.

- [ ] **Step 1: Write the failing screen-flow test**

Create `mobile/__tests__/analyzeFlow.test.tsx`:

```tsx
it('previews parsed messages before running local analysis', async () => {
  render(<AnalyzeFlowHarness />);
  fireEvent.changeText(screen.getByLabelText('Conversation text'), 'Alex: Hello\nJordan: Hi');
  fireEvent.press(screen.getByRole('button', { name: 'Review conversation' }));
  expect(await screen.findByText('Person A')).toBeOnTheScreen();
  expect(screen.getByText('Person B')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Run on-device analysis' }));
  expect(await screen.findByText('On-device estimate')).toBeOnTheScreen();
});
```

The harness must use the real provider and route components, not reimplement their logic.

- [ ] **Step 2: Verify the flow test fails**

Run `cd mobile && npm test -- analyzeFlow.test.tsx`.

Expected: FAIL because editor, preview, and result components do not exist.

- [ ] **Step 3: Implement the Analyze screen and editor**

`ConversationEditor` accepts:

```ts
type ConversationEditorProps = {
  value: string;
  disabled: boolean;
  error: string | null;
  onChange(value: string): void;
  onReview(): void;
  onImportFile(): void;
  onImportScreenshot(): void;
};
```

Use a multiline `TextInput` with `accessibilityLabel="Conversation text"`, live character count, `Name: Message` example, and a visible error region with `accessibilityRole="alert"`. Disable Review only for blank text or while analyzing.

- [ ] **Step 4: Implement parse preview and explicit rejected-line handling**

`preview.tsx` calls `preparePreview()` once per draft change. It shows accepted messages, rejected lines, and an Edit action. If no messages are accepted, keep the draft and return to the editor with `Couldn't find any messages. Use Name: Message on each line.`.

The screen exposes two buttons:

```tsx
<PrimaryButton label="Run on-device analysis" onPress={runLocalAndOpenResult} />
<PrimaryButton label="Use AI-assisted analysis" onPress={startConsentFlow} />
```

The AI button only opens the consent flow added in Task 10; until then, it displays `AI-assisted analysis will be connected after the secure service is configured.` and does not send data.

- [ ] **Step 5: Implement result semantics and copy guard test**

Create `mobile/__tests__/resultCopy.test.tsx`:

```tsx
it('uses estimate and possible-interpretation language', () => {
  render(<ResultSummary result={validLocalResult} />);
  expect(screen.getByText('On-device estimate')).toBeOnTheScreen();
  expect(screen.getByText('Possible interpretation')).toBeOnTheScreen();
  expect(screen.queryByText(/clinical|diagnosis|hidden meaning|what they really mean/i)).toBeNull();
});
```

`ResultSummary` displays intensity score, conflict-style estimate, pattern plus text for each message, analysis mode, and the educational limitation. No animation may prevent VoiceOver from reading the final value.

- [ ] **Step 6: Verify and commit**

```bash
cd mobile
npm test -- analyzeFlow.test.tsx resultCopy.test.tsx
npm run typecheck
npm run lint
cd ..
git add mobile/app mobile/src/components mobile/__tests__
git commit -m "feat: add local conversation analysis flow"
```

---

### Task 5: SQLite History, Search, and Deletion

**Files:**
- Create: `mobile/src/services/reportRepository.ts`
- Create: `mobile/src/services/sqliteReportRepository.ts`
- Create: `mobile/src/services/preferenceStore.ts`
- Create: `mobile/src/services/sqlitePreferenceStore.ts`
- Create: `mobile/src/services/reportRepositoryContext.tsx`
- Modify: `mobile/app/_layout.tsx`
- Modify: `mobile/app/result.tsx`
- Modify: `mobile/app/(tabs)/history.tsx`
- Create: `mobile/app/report/[id].tsx`
- Create: `mobile/src/components/ReportListItem.tsx`
- Create: `mobile/src/components/ConfirmDeleteSheet.tsx`
- Create: `mobile/__tests__/reportRepository.test.ts`
- Create: `mobile/__tests__/historyScreen.test.tsx`

**Interfaces:**
- Consumes: `AnalysisResultSchema`.
- Produces:

```ts
export type SavedReport = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  sourceText: string | null;
  result: AnalysisResult;
  responseDrafts: ResponseDraft[];
};

export interface ReportRepository {
  initialize(): Promise<void>;
  list(query?: string): Promise<SavedReport[]>;
  get(id: string): Promise<SavedReport | null>;
  save(report: SavedReport): Promise<void>;
  delete(id: string): Promise<void>;
  deleteAll(): Promise<void>;
}

export interface PreferenceStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  deleteAll(): Promise<void>;
}
```

- [ ] **Step 1: Write failing repository tests**

Test migration version 1, JSON schema validation on read, newest-first ordering, case-insensitive title search, deletion of one report, deletion of all reports, preference set/get/delete, and preference deletion-all. Use a fake `SqlitePort` so Jest does not pretend to test native SQLite.

```ts
it('does not return a row with an invalid result payload', async () => {
  const db = fakeDbWithRows([{ ...validRow, result_json: '{"intensityScore":101}' }]);
  const repository = createSqliteReportRepository(db);
  await expect(repository.list()).rejects.toThrow('CORRUPT_REPORT');
});
```

- [ ] **Step 2: Verify repository tests fail**

Run `cd mobile && npm test -- reportRepository.test.ts`.

Expected: FAIL because the repository does not exist.

- [ ] **Step 3: Implement schema migration and repository**

Use one table:

```sql
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source_text TEXT,
  result_json TEXT NOT NULL,
  response_drafts_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS reports_updated_at_idx ON reports(updated_at DESC);
CREATE TABLE IF NOT EXISTS preferences (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
PRAGMA user_version = 1;
```

Run migration statements inside a transaction. Parse `result_json` with `AnalysisResultSchema` and treat invalid records as `CORRUPT_REPORT` instead of rendering them.

- [ ] **Step 4: Write failing history UI tests**

Test empty state, search, save success, save failure message, delete confirmation, and report navigation. The delete action must require an explicit confirmation with the report title.

- [ ] **Step 5: Implement provider and history screens**

Initialize the repository before rendering tabs. Show a retryable storage error if initialization fails. On result Save, ask whether to retain the original text; default to saving only anonymized parsed messages and the result. Set `sourceText` to `null` unless the user opts in.

- [ ] **Step 6: Verify and commit**

```bash
cd mobile
npm test -- reportRepository.test.ts historyScreen.test.tsx
npm run typecheck
npm run lint
cd ..
git add mobile
git commit -m "feat: add private local report history"
```

---

### Task 6: Native Response Crafter

**Files:**
- Create: `mobile/src/domain/responseCrafter.ts`
- Modify: `mobile/app/(tabs)/responses.tsx`
- Create: `mobile/app/response/[reportId].tsx`
- Create: `mobile/src/components/ResponseDraftCard.tsx`
- Modify: `mobile/src/services/reportRepository.ts`
- Modify: `mobile/src/services/sqliteReportRepository.ts`
- Create: `mobile/__tests__/responseCrafter.test.ts`
- Create: `mobile/__tests__/responseFlow.test.tsx`

**Interfaces:**
- Consumes: saved report messages, `ResponseDraft` from Task 2, and the report repository.
- Produces:

```ts
export type ResponseGoal = 'resolve' | 'boundary' | 'feelings' | 'understand' | 'apologize' | 'request';
export type ResponseTone = 'empathetic' | 'assertive' | 'deescalating' | 'direct' | 'diplomatic';
export function craftLocalResponses(input: {
  sender: string;
  goal: ResponseGoal;
  tone: ResponseTone;
}): ResponseDraft[];
```

- [ ] **Step 1: Write failing deterministic-template tests**

Assert three drafts for every goal/tone combination, stable IDs, non-empty hints, and no automatic-send function in the public module.

- [ ] **Step 2: Verify failure**

Run `cd mobile && npm test -- responseCrafter.test.ts`.

- [ ] **Step 3: Port templates with safer labels**

Port the existing template matrix. Label every output `Draft—review before sending`. Replace claims such as `Assumes positive intent` with `Invites clarification`. Preserve bracketed user-edit markers such as `[specific behavior]`.

- [ ] **Step 4: Write failing response-flow tests**

Test selecting report, sender, goal, and tone; generating exactly three drafts; copying one with Expo Clipboard; sharing only after a user press; resetting the wizard; and persisting drafts to the selected report.

- [ ] **Step 5: Implement the native wizard**

Use one question per screen section and a visible four-step progress label. Disable Generate until sender, goal, and tone exist. Copy and share are manual actions only.

- [ ] **Step 6: Verify and commit**

```bash
cd mobile
npm test -- responseCrafter.test.ts responseFlow.test.tsx
npm run typecheck
npm run lint
cd ..
git add mobile
git commit -m "feat: add native response drafting"
```

---

### Task 7: Document Import, Screenshot Selection, and On-Device OCR

**Files:**
- Create: `mobile/src/services/importConversation.ts`
- Create: `mobile/src/services/ocr.ts`
- Create: `mobile/modules/convo-ocr/expo-module.config.json`
- Create: `mobile/modules/convo-ocr/index.ts`
- Create: `mobile/modules/convo-ocr/ios/ConvoOcrModule.swift`
- Create: `mobile/modules/convo-ocr/ios/ConvoOcr.podspec`
- Modify: `mobile/package.json`
- Modify: `mobile/app/(tabs)/index.tsx`
- Create: `mobile/__tests__/importConversation.test.ts`
- Create: `mobile/__tests__/ocr.test.ts`

**Interfaces:**
- Consumes: Analyze screen `setDraft`.
- Produces:
  - `pickConversationFile(): Promise<ImportResult>`
  - `pickConversationScreenshot(): Promise<ImageImportResult>`
  - `isOcrAvailable(): boolean`
  - `recognizeConversationText(uri: string): Promise<string>`.

- [ ] **Step 1: Write failing import tests**

Mock Expo DocumentPicker, ImagePicker, and FileSystem. Assert `.txt`, `.log`, and `.csv` acceptance; unsupported type, empty file, unreadable file, more than 1 MiB, and more than 100,000 characters return distinct codes. Assert cancellation is not shown as an error.

- [ ] **Step 2: Verify import tests fail**

Run `cd mobile && npm test -- importConversation.test.ts`.

- [ ] **Step 3: Implement bounded document and image selection**

Return this union:

```ts
type ImportResult =
  | { ok: true; text: string; source: 'document' }
  | { ok: false; code: 'CANCELLED' | 'UNSUPPORTED_TYPE' | 'EMPTY_FILE' | 'FILE_TOO_LARGE' | 'UNREADABLE_FILE' };
```

Do not log file names, file contents, or file URIs. Pass successful text into the same editable Analyze input used for pasted text.

- [ ] **Step 4: Write failing optional-native-module tests**

Mock `requireOptionalNativeModule` as absent and expect `isOcrAvailable()` to return false without crashing Expo Go. Mock a present module and expect recognized text to be returned. Mock native rejection and expect `OCR_FAILED`.

- [ ] **Step 5: Implement the TypeScript OCR boundary**

```ts
import { requireOptionalNativeModule } from 'expo-modules-core';

type NativeOcr = { recognizeText(uri: string): Promise<string> };
const nativeOcr = requireOptionalNativeModule<NativeOcr>('ConvoOcr');

export const isOcrAvailable = () => nativeOcr !== null;

export async function recognizeConversationText(uri: string): Promise<string> {
  if (!nativeOcr) throw new Error('OCR_UNAVAILABLE');
  const text = await nativeOcr.recognizeText(uri);
  if (!text.trim()) throw new Error('OCR_EMPTY');
  return text;
}
```

- [ ] **Step 6: Implement the Apple Vision module**

The Swift module must load a local file URL, correct orientation, create `VNRecognizeTextRequest` with `recognitionLevel = .accurate` and `usesLanguageCorrection = true`, join observations top-to-bottom, and reject with stable codes `OCR_IMAGE_UNREADABLE` or `OCR_RECOGNITION_FAILED`. Its core registration is:

```swift
import ExpoModulesCore
import ImageIO
import UIKit
import Vision

internal final class OcrImageUnreadableException: Exception {
  override var reason: String { "The selected image could not be read." }
}
internal final class OcrRecognitionFailedException: Exception {
  override var reason: String { "Text recognition failed." }
}

public final class ConvoOcrModule: Module {
  private func visionOrientation(_ value: UIImage.Orientation) -> CGImagePropertyOrientation {
    switch value {
    case .up: return .up
    case .down: return .down
    case .left: return .left
    case .right: return .right
    case .upMirrored: return .upMirrored
    case .downMirrored: return .downMirrored
    case .leftMirrored: return .leftMirrored
    case .rightMirrored: return .rightMirrored
    @unknown default: return .up
    }
  }

  public func definition() -> ModuleDefinition {
    Name("ConvoOcr")
    AsyncFunction("recognizeText") { (uri: String) async throws -> String in
      guard let url = URL(string: uri), let image = UIImage(contentsOfFile: url.path),
            let cgImage = image.cgImage else {
        throw OcrImageUnreadableException()
      }
      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true
      do {
        try VNImageRequestHandler(
          cgImage: cgImage,
          orientation: visionOrientation(image.imageOrientation)
        ).perform([request])
      } catch {
        throw OcrRecognitionFailedException()
      }
      return (request.results ?? [])
        .compactMap { $0.topCandidates(1).first?.string }
        .joined(separator: "\n")
    }
  }
}
```

Expose the two exception classes as the stable JavaScript codes `OCR_IMAGE_UNREADABLE` and `OCR_RECOGNITION_FAILED` in `expo-module.config.json`/the TypeScript adapter. The module must not make a network request.

Register `convo-ocr` as a local file dependency so Expo autolinking includes it in custom development and release builds. Expo Go continues through the optional boundary because its prebuilt binary does not contain the module.

- [ ] **Step 7: Integrate screenshot confirmation**

If OCR is unavailable in Expo Go, show: `Screenshot selected. On-device text extraction is available in the ConvoAutopsy development build. You can paste the text now.` Keep the screenshot URI only in memory and discard it when leaving the flow. In a development build, put OCR output into the editable text field before parsing.

- [ ] **Step 8: Verify and commit**

```bash
cd mobile
npm test -- importConversation.test.ts ocr.test.ts
npm run typecheck
npm run lint
npx expo-doctor
cd ..
git add mobile
git commit -m "feat: add private conversation imports and OCR"
```

The Swift module remains uncompiled until the credentialed development-build gate; its compile and device test are mandatory in Task 13.

---

### Task 8: Report Image Export and Native Sharing

**Files:**
- Create: `mobile/src/components/ShareableReportCard.tsx`
- Create: `mobile/src/services/exportReport.ts`
- Modify: `mobile/app/result.tsx`
- Modify: `mobile/app/report/[id].tsx`
- Modify: `mobile/src/components/ResponseDraftCard.tsx`
- Create: `mobile/__tests__/exportReport.test.ts`
- Create: `mobile/__tests__/shareActions.test.tsx`

**Interfaces:**
- Consumes: `AnalysisResult` and `ResponseDraft`.
- Produces: `captureAndShareReport(ref, sharingPort): Promise<ExportOutcome>` and manual draft sharing.

- [ ] **Step 1: Write failing export-service tests**

Mock `captureRef` and Expo Sharing. Assert sheet-open success, capture failure, sharing unavailable, and share failure are distinct outcomes. Assert no report content appears in thrown/logged error strings. Expo Sharing does not report whether the user completed or cancelled a share, so the UI must say `Share sheet opened`, not `Shared successfully`.

- [ ] **Step 2: Verify failure**

Run `cd mobile && npm test -- exportReport.test.ts`.

- [ ] **Step 3: Implement the export boundary**

```ts
export type ExportOutcome =
  | { ok: true }
  | { ok: false; code: 'CAPTURE_FAILED' | 'SHARING_UNAVAILABLE' | 'SHARE_FAILED' };
```

Capture a 1080×1920-equivalent portrait card with `react-native-view-shot` and open the iOS share sheet with `expo-sharing`. Use a cache file, then delete it in `finally`. Do not auto-save to Photos or request Photos write permission.

- [ ] **Step 4: Build the shareable card**

Show brand, date, intensity estimate, conflict-style estimate, at most six redacted/anonymized messages, pattern labels, and the educational limitation. Set `collapsable={false}` on the captured root. Never include original names or unsaved original source text.

- [ ] **Step 5: Verify and commit**

```bash
cd mobile
npm test -- exportReport.test.ts shareActions.test.tsx
npm run typecheck
npm run lint
cd ..
git add mobile
git commit -m "feat: add private report exports and sharing"
```

---

### Task 9: Bounded Cloudflare AI Proxy

**Files:**
- Create: `server/ai-proxy/package.json`
- Create: `server/ai-proxy/tsconfig.json`
- Create: `server/ai-proxy/wrangler.jsonc`
- Create: `server/ai-proxy/src/contract.ts`
- Create: `server/ai-proxy/src/errors.ts`
- Create: `server/ai-proxy/src/provider.ts`
- Create: `server/ai-proxy/src/rateLimit.ts`
- Create: `server/ai-proxy/src/index.ts`
- Create: `server/ai-proxy/test/worker.test.ts`
- Create: `server/ai-proxy/test/contract.test.ts`
- Create: `server/ai-proxy/test/rateLimit.test.ts`
- Create: `server/ai-proxy/test/logging.test.ts`

**Interfaces:**
- Consumes: canonical contract fixtures.
- Produces:
  - `POST /v1/analyses`
  - `POST /v1/responses`
  - `AiProvider.analyze(messages)` and `AiProvider.craftResponse(input)`.

- [ ] **Step 1: Create the Worker package**

Use Node 22, Wrangler, Vitest, `@cloudflare/vitest-pool-workers`, and Zod. Define an `Env` interface with KV binding `RATE_LIMITS` and secrets `GROQ_API_KEY` and `RATE_LIMIT_HMAC_SECRET`; inject the KV binding through the Vitest Worker pool for local tests. Keep the live `kv_namespaces` entry absent from `wrangler.jsonc` until Task 13 creates the real namespace and writes its returned ID. Do not put secret values in `wrangler.jsonc`.

- [ ] **Step 2: Write failing contract tests**

Cover non-POST methods, wrong paths, missing/invalid JSON, more than 128 KiB body, invalid installation token, consent version mismatch, more than 100 messages, message longer than 1,000 characters, provider timeout, malformed provider output, and valid response.

Use the request shape:

```ts
type AnalyzeRequest = {
  schemaVersion: 1;
  consentVersion: '2026-08-02';
  installationToken: string;
  messages: { sender: string; text: string }[];
};

type CraftResponseRequest = {
  schemaVersion: 1;
  consentVersion: '2026-08-02';
  installationToken: string;
  sender: string;
  goal: 'resolve' | 'boundary' | 'feelings' | 'understand' | 'apologize' | 'request';
  tone: 'empathetic' | 'assertive' | 'deescalating' | 'direct' | 'diplomatic';
  analysis: AnalysisResult;
};
```

- [ ] **Step 3: Verify Worker tests fail**

Run:

```bash
cd server/ai-proxy
npm test
```

Expected: FAIL because Worker modules do not exist.

- [ ] **Step 4: Implement schemas and public errors**

Public error codes are exactly:

```ts
export type PublicErrorCode =
  | 'INVALID_REQUEST'
  | 'CONSENT_REQUIRED'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_INVALID_RESPONSE'
  | 'INTERNAL_ERROR';
```

Return `{ error: { code, requestId, retryAfterSeconds? } }`. Never return provider bodies, stack traces, environment values, or internal exception messages.

- [ ] **Step 5: Implement HMAC-derived rate limits**

Derive the KV key from installation token plus `CF-Connecting-IP` using HMAC-SHA-256 and `RATE_LIMIT_HMAC_SECRET`. Store only the digest and an integer counter with a 60-second TTL. Allow 10 analysis requests and 20 response requests per 60 seconds. Return `429` with `Retry-After`.

- [ ] **Step 6: Implement the provider adapter**

Use `llama-3.3-70b-versatile` for text analysis and response drafts. Bound provider timeout to 20 seconds and output tokens to 2,000 for analysis or 700 for responses. Parse provider content as JSON data, validate it, replace `hidden_meaning` with `possibleInterpretation` at the boundary if the model emits the old name, stamp `schemaVersion: 1` and `mode: 'ai'`, and reject all extra fields.

- [ ] **Step 7: Implement privacy-safe routing and CORS**

Allow the production web origin `https://avinashamanchi.github.io`, local development origins, and native requests without a browser Origin header. Add `Vary: Origin`. Never reflect an unapproved origin. Normal logs may contain only request ID, route, status, latency bucket, and public error code.

- [ ] **Step 8: Prove content does not reach logs**

In `logging.test.ts`, use unique markers in conversation text and provider output, exercise success and failure, inspect mocked logger calls, and assert neither marker appears in serialized calls.

- [ ] **Step 9: Verify and commit**

```bash
cd server/ai-proxy
npm test
npm run typecheck
npm run lint
cd ../..
git add server/ai-proxy contracts
git commit -m "feat: add bounded AI proxy"
```

Do not deploy or configure real secrets in this task.

---

### Task 10: Mobile AI Consent, Remote Analysis, and Visible Fallback

**Files:**
- Create: `mobile/src/services/consentStore.ts`
- Create: `mobile/src/services/aiClient.ts`
- Create: `mobile/src/components/AiConsentSheet.tsx`
- Modify: `mobile/app/preview.tsx`
- Modify: `mobile/app/result.tsx`
- Modify: `mobile/src/state/AnalysisSession.tsx`
- Create: `mobile/__tests__/consentStore.test.ts`
- Create: `mobile/__tests__/aiClient.test.ts`
- Create: `mobile/__tests__/remoteAnalysisFlow.test.tsx`

**Interfaces:**
- Consumes: Worker API from Task 9 and session request IDs from Task 3.
- Produces:
  - `getConsent(): Promise<ConsentRecord | null>`
  - `grantConsent(): Promise<ConsentRecord>`
  - `revokeConsent(): Promise<void>`
  - `getInstallationToken(): Promise<string>`
  - `analyzeRemotely(messages, signal): Promise<AnalysisResult>`.

- [ ] **Step 1: Write failing consent tests**

Assert no consent by default, versioned grant, revocation, token stability, SecureStore failure, and regeneration after `deleteAllAppData`. Consent record:

```ts
type ConsentRecord = {
  version: '2026-08-02';
  grantedAt: string;
  provider: 'Groq';
};
```

- [ ] **Step 2: Implement consent and token storage**

Store consent in SQLite preferences and the random UUID installation token in SecureStore. If SecureStore is unavailable, disable remote analysis with `Secure device storage is unavailable. On-device analysis still works.`.

- [ ] **Step 3: Write failing AI client tests**

Mock fetch. Cover success, offline rejection, abort, 20-second timeout, `400`, `413`, `429` plus retry, `503`, invalid JSON, valid JSON with invalid schema, and server/body request-ID mismatch. Assert original names never appear in the outgoing message array.

- [ ] **Step 4: Implement the typed client**

Read `EXPO_PUBLIC_AI_PROXY_URL` as a public endpoint URL only. Reject missing or non-HTTPS production URLs. Send parsed anonymous messages, consent version, and installation token. Map public server codes into this union:

```ts
type AiClientErrorCode =
  | 'OFFLINE'
  | 'CANCELLED'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'NOT_CONFIGURED';
```

Do not catch these errors inside the client and turn them into local results.

- [ ] **Step 5: Write failing remote-flow tests**

Assert first use shows the disclosure before fetch, decline makes no request, accept runs fetch once, duplicate presses run once, Cancel aborts, success is labeled `AI-assisted estimate`, failure keeps the draft and shows an explicit `Run on-device analysis instead` button, and pressing that button produces a local-labeled result.

- [ ] **Step 6: Implement the consent sheet and flow**

The disclosure states: names are replaced with Person labels; message text is sent to Groq through ConvoAutopsy's server; text is not intentionally stored by ConvoAutopsy; automated output can be wrong; on-device analysis is available without sharing. Require an explicit `Agree and continue` press.

- [ ] **Step 7: Verify and commit**

```bash
cd mobile
npm test -- consentStore.test.ts aiClient.test.ts remoteAnalysisFlow.test.tsx
npm run typecheck
npm run lint
cd ..
git add mobile
git commit -m "feat: add consented AI-assisted analysis"
```

---

### Task 11: Route the Existing Website Through the Proxy

**Files:**
- Modify: `src/utils/analyzeConversation.js`
- Modify: `src/utils/craftResponse.js`
- Modify: `src/pages/Dashboard.jsx`
- Modify: `src/components/ResponseCrafter.jsx`
- Create: `src/components/AiConsentModal.jsx`
- Modify: `package.json`
- Modify: `.github/workflows/deploy.yml`
- Modify: `README.md`
- Create: `src/utils/analyzeConversation.test.js`
- Create: `src/utils/craftResponse.test.js`

**Interfaces:**
- Consumes: Worker endpoints from Task 9.
- Produces: web remote analysis without a browser-bundled provider key; existing local fallback remains explicit.

- [ ] **Step 1: Add web tests and prove the current direct-provider path**

Install Vitest as a root dev dependency and add `"test": "vitest run"`. Write tests that set `VITE_AI_PROXY_URL`, mock fetch, call both utilities with `{ allowRemote: true }`, and expect requests to `/v1/analyses` and `/v1/responses` without an authentication header. Add a bundle-source test that rejects direct browser-provider routing and client API-key variables. Add a consent test proving `{ allowRemote: false }` performs no fetch.

- [ ] **Step 2: Run the tests to verify failure**

Run `npm test` from the repository root.

Expected: FAIL because both modules still call Groq directly and read the client key.

- [ ] **Step 3: Implement proxy calls with explicit result source**

Use the public proxy URL only. `analyzeConversation(text, options)` returns `{ result, source, fallbackReason }`; `craftResponse(params, options)` returns `{ drafts, source, fallbackReason }`. `source` is exactly `ai` or `local`, and `fallbackReason` is `null`, `NOT_CONFIGURED`, or `REMOTE_UNAVAILABLE`. Adapt Worker fields to existing web component fields at one boundary:

```js
function toLegacyResult(result) {
  return {
    overall_tension_score: result.intensityScore,
    conflict_mode: result.conflictMode,
    messages: result.messages.map(message => ({
      sender: message.sender,
      text: message.text,
      gottman_flag: message.pattern,
      ego_state: message.egoState,
      hidden_meaning: message.possibleInterpretation
    })),
    analysis_mode: result.mode
  };
}
```

When remote analysis fails, return `{ result: localAnalyze(text), source: 'local', fallbackReason: 'REMOTE_UNAVAILABLE' }`. Update `Dashboard.jsx` to display `AI service unavailable—showing the on-device estimate.` and store `analysis_mode` with the report. Update `ResponseCrafter.jsx` to consume `{ drafts, source, fallbackReason }` and display the same source distinction. Do not silently return local output as if AI succeeded.

Create `AiConsentModal.jsx` with the same core disclosure as the mobile consent sheet. Persist only consent version `2026-08-02`, grant time, and a random installation UUID in localStorage; create the UUID with `crypto.randomUUID()` and never combine it with username data. Dashboard must show the modal before the first remote request; decline calls the local path. Response Crafter may call the remote endpoint only when this consent is current, otherwise it uses local templates and labels them `On-device drafts`.

- [ ] **Step 4: Remove client secret build configuration**

Delete the retired browser API-key variable from `deploy.yml` and README instructions. Document `VITE_AI_PROXY_URL` as a public endpoint. Do not store the proxy URL as a secret.

- [ ] **Step 5: Verify the web build contains no provider secret path**

```bash
npm test
npm run lint
npm run build
Run a source/build scan for retired browser keys, direct-provider routes, and authentication headers.
```

Expected: every command exits 0; `rg` finds nothing in the searched paths.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/utils src/pages/Dashboard.jsx src/components .github/workflows/deploy.yml README.md
git commit -m "fix: keep AI provider secrets server-side"
```

---

### Task 12: Settings, Privacy, Accessibility, and Release Configuration

**Files:**
- Modify: `mobile/app/(tabs)/settings.tsx`
- Create: `mobile/app/privacy.tsx`
- Create: `mobile/src/services/deleteAllAppData.ts`
- Create: `public/privacy.html`
- Create: `docs/app-store/convoautopsy-ios-metadata.md`
- Create: `docs/app-store/convoautopsy-ios-release-checklist.md`
- Create: `mobile/eas.json`
- Modify: `mobile/app.config.ts`
- Copy: `ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-1024.png` to `mobile/assets/images/icon.png`
- Create: `mobile/__tests__/settings.test.tsx`
- Create: `mobile/__tests__/accessibility.test.tsx`
- Create: `mobile/__tests__/deleteAllAppData.test.ts`

**Interfaces:**
- Consumes: repository `deleteAll`, consent revocation, SecureStore token deletion, and app metadata.
- Produces: review-facing privacy behavior and a credential-free release configuration.

- [ ] **Step 1: Write failing deletion and Settings tests**

Assert `deleteAllAppData` deletes reports, preferences, consent, installation token, cached export files, and in-memory analysis state. If one operation fails, return the failed subsystem list and do not display success. Test a destructive confirmation requiring the phrase `DELETE`.

- [ ] **Step 2: Implement coordinated deletion**

```ts
type DeleteAllOutcome =
  | { ok: true }
  | { ok: false; failed: ('reports' | 'preferences' | 'secureStore' | 'cache' | 'session')[] };
```

Run all cleanup operations, collect failures, reset memory only after persistent cleanup attempts finish, and give the user a retry path.

- [ ] **Step 3: Add in-app and public privacy content**

Both versions must state:

- saved reports are local unless explicitly shared;
- AI-assisted analysis sends anonymized speaker labels plus message text to Groq through the ConvoAutopsy proxy after consent;
- on-device analysis needs no network transmission;
- the app does not sell data, track users, serve ads, access contacts, or automatically send messages;
- rate limiting uses a pseudonymous installation token and network signal for security;
- retention and deletion behavior;
- output limitations and the support URL `https://github.com/avinashamanchi/convoautopsy/issues`.

Use `https://avinashamanchi.github.io/convoautopsy/privacy.html` as the privacy URL.

- [ ] **Step 4: Write and pass accessibility tests**

Test labels and roles for editor, tabs, score, pattern cards, consent actions, delete actions, import actions, and share actions. Test that critical content remains present when font scaling is mocked at 200 percent. Test Reduce Motion disables nonessential transitions.

- [ ] **Step 5: Configure build profiles**

Create `mobile/eas.json`:

```json
{
  "cli": { "version": ">= 16.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": false }
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "autoIncrement": true
    }
  }
}
```

Set icon, splash, bundle ID, build number `1`, privacy URL, and iOS purpose strings in `app.config.ts`. Do not add Apple ID, App Store Connect API private key, team ID, provisioning profile, or Expo token to the repository.

- [ ] **Step 6: Prepare exact App Store documentation**

Write these exact initial listing fields, revising only if App Store Connect rejects a length or category:

- Name: `ConvoAutopsy`
- Subtitle: `See conversation patterns`
- Primary category: `Lifestyle`
- Keywords: `communication,conflict,self reflection,conversation,relationships,clarity,response`
- Support URL: `https://github.com/avinashamanchi/convoautopsy/issues`
- Privacy URL: `https://avinashamanchi.github.io/convoautopsy/privacy.html`
- Description opening: `Reflect on difficult conversations with on-device pattern estimates, optional AI-assisted feedback, private local history, and response drafts you control.`
- App Privacy: disclose User Content for App Functionality and a pseudonymous Device ID for App Functionality/Fraud Prevention; mark both as not used for tracking and do not claim data is linked to identity.
- Age rating: propose 13+ because users may enter mature relationship language, then accept the rating produced by Apple's completed questionnaire.
- Review note: identify the on-device mode that works without an account, explain the first-use AI disclosure, state that the app never sends messages automatically, and give the exact Analyze → Review → Run on-device analysis path.

The checklist must separate code-complete gates from credentialed gates: Apple membership, Expo login, EAS project init, registered device, development build, TestFlight, screenshots, App Store record, upload, review, and publication verification.

- [ ] **Step 7: Verify and commit**

```bash
cd mobile
npm test -- settings.test.tsx accessibility.test.tsx deleteAllAppData.test.ts
npm run typecheck
npm run lint
npx expo-doctor
npm run export:ios
cd ..
npm run build
git diff --check
git add mobile public/privacy.html docs/app-store
git commit -m "feat: prepare ConvoAutopsy for iOS review"
```

---

### Task 13: CI, Full Verification, Expo Go, and Credentialed Release Gate

**Files:**
- Create: `.github/workflows/ios-ci.yml`
- Create: `mobile/e2e/analyze-flow.yaml`
- Modify: `docs/app-store/convoautopsy-ios-release-checklist.md` with observed results only
- Modify: `README.md` with current mobile commands

**Interfaces:**
- Consumes: all prior tasks.
- Produces: reproducible clean-checkout checks, an Expo Go QR test, and an explicit stop point for Apple credentials.

- [ ] **Step 1: Add CI before claiming completion**

The workflow uses Node 22 and three jobs:

```yaml
jobs:
  mobile:
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: mobile/package-lock.json }
      - run: npm ci
        working-directory: mobile
      - run: npm test
        working-directory: mobile
      - run: npm run typecheck
        working-directory: mobile
      - run: npm run lint
        working-directory: mobile
      - run: npm run export:ios
        working-directory: mobile
  worker:
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: server/ai-proxy/package-lock.json }
      - run: npm ci
        working-directory: server/ai-proxy
      - run: npm test
        working-directory: server/ai-proxy
      - run: npm run typecheck
        working-directory: server/ai-proxy
  web:
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm test
      - run: npm run lint
      - run: npm run build
```

- [ ] **Step 2: Add a Maestro release flow**

Give the production controls the test IDs used here, then create:

```yaml
appId: io.convoautopsy.app
---
- launchApp:
    clearState: true
- tapOn:
    id: analyze-input
- inputText: "Alex: Hello\\nJordan: Hi"
- tapOn:
    id: review-conversation
- assertVisible: "Person A"
- assertVisible: "Person B"
- tapOn:
    id: run-local-analysis
- assertVisible: "On-device estimate"
- tapOn:
    id: save-report
- tapOn:
    id: save-without-source
- tapOn:
    id: tab-history
- tapOn:
    id: report-row-0
- assertVisible: "On-device estimate"
- tapOn:
    id: tab-responses
- tapOn:
    id: response-report-row-0
- tapOn:
    id: sender-person-a
- tapOn:
    id: goal-resolve
- tapOn:
    id: tone-deescalating
- tapOn:
    id: generate-responses
- assertVisible: "Draft—review before sending"
- tapOn:
    id: share-response-0
```

The final step verifies the user action opens the system share sheet; it does not claim the share completed. Do not locate controls by screen coordinates.

- [ ] **Step 3: Run the clean aggregate verification**

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
npm ci
npm test
npm run lint
npm run build
cd mobile
npm ci
npm test
npm run typecheck
npm run lint
npx expo-doctor
npm run export:ios
cd ../server/ai-proxy
npm ci
npm test
npm run typecheck
npm run lint
cd ../..
git diff --check
git status --short
```

Expected: all checks exit 0; only intentional plan-tracking changes are present.

- [ ] **Step 4: Run the Expo Go physical-iPhone checkpoint**

Run:

```bash
cd mobile
npx expo start --lan --clear
```

Have the user scan the QR code with Expo Go. Verify and record observed results for navigation, text input, parsing, local analysis, history, response drafts, screenshot selection, offline behavior, Dynamic Type, and VoiceOver. Do not mark OCR as passed in Expo Go.

- [ ] **Step 5: Commit the verified implementation**

```bash
git add .github/workflows/ios-ci.yml mobile/e2e README.md docs/app-store/convoautopsy-ios-release-checklist.md
git commit -m "test: verify ConvoAutopsy iOS release candidate"
```

- [ ] **Step 6: Cross the Cloudflare/Groq credential boundary only with the user**

Do not request or accept the user's Cloudflare password, Groq key, browser session, or raw access token. The user signs in and enters secrets through each provider's own prompt.

Run interactively:

```bash
cd server/ai-proxy
npx wrangler login
npx wrangler kv namespace create RATE_LIMITS
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put RATE_LIMIT_HMAC_SECRET
npx wrangler deploy
```

Put the KV namespace ID printed by Wrangler into the `RATE_LIMITS` binding in `wrangler.jsonc`, rerun Worker tests, and deploy again. Record the HTTPS Worker URL. Configure that public URL as `EXPO_PUBLIC_AI_PROXY_URL` in the Expo development/preview/production environments and as the GitHub repository variable `VITE_AI_PROXY_URL`. Rebuild the web app and run one consented mobile analysis plus one web analysis. Confirm Worker logs contain request metadata but no conversation marker text.

- [ ] **Step 7: Stop at the Apple/Expo credential boundary**

Do not request or accept the user's Apple password, two-factor code, government ID, payment details, private key, or raw session token. The user completes Apple Developer enrollment and Expo login personally.

After enrollment, run interactively on the user's machine:

```bash
cd mobile
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest device:create
npx eas-cli@latest build --platform ios --profile development
```

Install the development build from the EAS QR code and verify the Apple Vision OCR module on a physical iPhone. A compile failure, permission mismatch, or OCR failure is release-blocking.

- [ ] **Step 8: Build and upload only after the development-build matrix passes**

```bash
cd mobile
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --latest
```

Complete TestFlight, App Privacy, age rating, screenshots, support URL, privacy URL, and review notes in App Store Connect. Submission is not publication. Verify approval status and the public App Store listing before declaring the app published.

---

## Plan Completion Definition

Implementation is complete only when Tasks 1–13 have committed deliverables, all automated checks pass from a clean checkout, Expo Go physical-device observations are recorded, and the remaining credentialed gates are explicitly reported rather than implied complete. App Store publication remains blocked until the user enrolls in the Apple Developer Program and Apple approves the submitted build.
