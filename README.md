# ConvoAutopsy

**Private conversation reflection tools.** Paste a conversation to review on-device pattern estimates, optionally request AI-assisted feedback after consent, and draft responses you can edit before sending.

Live site → **[avinashamanchi.github.io/convoautopsy](https://avinashamanchi.github.io/convoautopsy/)**

---

## What it does

- **Tension Score** — a 0–100 on-device estimate from text patterns, not a factual conclusion about people
- **Conversation patterns** — educational labels inspired by Gottman, Thomas-Kilmann, and Transactional Analysis; they do not infer intent, diagnosis, or hidden meaning
- **Response Crafter** — choose a sender, goal, and tone to generate three editable local drafts for human review
- **Receipt Export** — download a shareable 9:16 PNG of your analysis (Instagram/TikTok ready)
- **File Upload** — drag-and-drop .txt chat exports (WhatsApp, Discord, etc.)
- **Saved History** — analyses are stored locally and can be deleted by the user; legacy multi-profile reports stay in a separate versioned recovery file instead of appearing in the current history
- **Guest-first web app** — the browser-local guest profile has no ConvoAutopsy account or backend account credentials

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite 8 |
| 3D / Animation | Three.js · React Three Fiber · GSAP ScrollTrigger |
| AI Analysis | Optional consented ConvoAutopsy AI proxy (when deployed); on-device estimates remain available |
| Frameworks | Educational heuristic inspirations: Gottman · Thomas-Kilmann · Transactional Analysis |
| Profile / Storage | Browser-local guest profile in localStorage; optional AI proxy for consented assistance |
| Receipt Export | html2canvas |
| Mobile | Expo / React Native app in `mobile/`; it does not load the website in a WebView |
| Deployment | GitHub Pages via GitHub Actions |

---

## Running Locally

### Prerequisites
- Node.js 22+
- Optional `VITE_AI_PROXY_URL` pointing at the ConvoAutopsy AI proxy — the app works without it via on-device fallback

### 1. Clone and install

```bash
git clone https://github.com/avinashamanchi/convoautopsy.git
cd convoautopsy
npm ci
```

### 2. Configure the public proxy endpoint (optional)

```bash
echo "VITE_AI_PROXY_URL=https://your-proxy.example" > .env
```

`VITE_AI_PROXY_URL` is a public endpoint configuration, not a secret. Provider credentials remain on the server. Without this the app uses its on-device analysis and response templates.

### 3. Start the dev server

```bash
npm run dev
```

Open [http://localhost:5173/convoautopsy/](http://localhost:5173/convoautopsy/)

### 4. Build for production

```bash
npm run build        # GitHub Pages build (base: /convoautopsy/)
```

---

## Mobile Development (Expo)

The current native app is in `mobile/` and requires Node 22.

```bash
cd mobile
npm ci
npm test
npm run typecheck
npm run lint
npm run expo:doctor
npm run export:ios
node ../scripts/check-mobile-audit.mjs
```

For a bounded Expo Go smoke test on the same network, run `npx expo start --lan --clear`, scan the generated QR code with Expo Go, and stop the server when finished. Expo Go does not compile the local Swift Vision OCR module; its screenshot import fallback is expected there. Physical-device navigation, input, history, accessibility, offline, and share observations remain a user-run release checkpoint.

The repeatable Maestro flow is [`mobile/e2e/analyze-flow.yaml`](mobile/e2e/analyze-flow.yaml). It uses production-control semantic IDs and, after the user presses Share, asserts the stock iOS **Copy** control. That exact assertion requires an English-locale iOS share sheet and proves only that the system sheet opened; it never treats an external share as completed.

---

## iOS Release Path (Expo/EAS)

The only supported iOS release target is `mobile/` through Expo/EAS. The legacy Capacitor target is historical and its root `ios`, `sync`, and `build:app` scripts now fail deterministically instead of producing a second candidate. App Store uploads currently require Xcode 26 or later using the iOS 26 SDK or later. Apple Developer membership, Expo login, EAS initialization, development-build OCR verification, production build, TestFlight, App Store Connect record, review, and publication are not complete.

After the user has personally completed the Apple and Expo credential steps, the user-owned release process uses EAS from `mobile/` to create a development build, verify native OCR on a physical iPhone, and only then create a production build and submit it. Do not treat an Expo Go export or a submission as App Store publication.

### GitHub Pages proxy configuration

For the deployed site to use AI assistance, set a repository **variable** (not a secret):

**Settings → Secrets and variables → Actions → Variables → New repository variable**
```
Name:  VITE_AI_PROXY_URL
Value: https://your-proxy.example
```

The browser never receives provider credentials. Before AI use, the site asks for consent and provides an exact-data review. An AI analysis request sends to ConvoAutopsy's Cloudflare service: schema version, consent version, an installation token, and each reviewed message sender and message text. The service forwards only the reviewed message sender and message text to Groq. An AI response-drafting request sends the service schema version, consent version, the installation token, the chosen response sender, goal, and tone, the analysis mode, intensity score, and conflict mode, and—for each message—the message sender, edited message text, pattern, ego state, and edited possible interpretation. The service forwards the content and drafting fields to Groq; it does not forward schema version, consent version, the installation token, or analysis mode to Groq. Technical identifier values are not displayed in the review.

Person labels are pseudonymous, not anonymous, and message text may still contain emails, phone numbers, third-party names, and context unless it is reviewed and redacted first. On-device analysis and drafts remain available without sharing. Separately, in the native app, Free verification can send a pseudonymous RevenueCat app-user ID even without a subscription; purchase and entitlement checks can send that ID and purchase information to RevenueCat for app functionality and subscription analytics.

---

## Project Structure

```
convoautopsy/
├── src/
│   ├── pages/
│   │   ├── LandingPage.jsx     # Marketing site with 3D phone + all sections
│   │   ├── LandingPage.css     # Landing page styles
│   │   └── Dashboard.jsx       # Browser-local guest workspace (input, history, analysis)
│   ├── components/
│   │   ├── PhoneScene.jsx      # 3D Apple iPhone (React Three Fiber)
│   │   ├── ChatBubbles.jsx     # Floating chat bubbles in 3D scene
│   │   ├── AnalysisResult.jsx  # Analysis display + receipt export
│   │   ├── ResponseCrafter.jsx # 4-step response wizard
│   │   └── Onboarding.jsx      # First-run walkthrough modal
│   ├── utils/
│   │   ├── analyzeConversation.js  # Proxy client + local regex fallback
│   │   ├── craftResponse.js        # Proxy client + local response templates
│   │   └── storage.js              # Guest-profile migration + local report history
│   └── index.css               # Global styles + all component styles
├── mobile/                     # Expo / React Native iOS app
│   ├── app/                    # Expo Router screens
│   ├── src/                    # Local analysis, persistence, consent, exports
│   ├── modules/convo-ocr/      # Native Apple Vision module (development build required)
│   └── e2e/                    # Maestro release flow
├── server/ai-proxy/            # Cloudflare Worker and Durable Object limiter
├── .github/workflows/
│   ├── deploy.yml              # GitHub Actions → GitHub Pages
│   ├── ios-ci.yml              # Node 22 web, mobile, and Worker gates
│   └── release-readiness.yml   # Manual local gates; never deploys or submits
└── vite.config.js              # Vite config for the web application
```

---

## Conversation Format

Paste conversations in `Name: Message` format, one per line:

```
Alex: I literally told you I'd be there by 7. Why do you always do this?
Jordan: I said 7:30. You never listen to anything I say.
Alex: That's not what I said. Stop twisting my words.
Jordan: Whatever. I'm done with this conversation.
```

Participant labels are pseudonymous Person A / Person B labels, not proof of anonymity. Parsed and saved message text may still contain emails, phone numbers, third-party names, and context unless it is reviewed and redacted before analysis. Turning off original-source retention does not remove the parsed message text stored inside a saved analysis.

The guest-first web migration never reads retired local credentials. It migrates only the previously selected legacy profile into current history and preserves every legacy report bucket, including other-profile and logged-out buckets, in a schema-validated `convoautopsy.web.legacy-recovery.v1` envelope. The dashboard shows only counts until the user explicitly exports the private recovery file; export leaves the browser recovery copy intact, and Delete All removes it with the other app-owned browser data when deletion succeeds.

---

## Built by

**Avi Amanchi** · [github.com/avinashamanchi](https://github.com/avinashamanchi)

© 2026 ConvoAutopsy
