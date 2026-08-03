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
- **Saved History** — analyses are stored locally and can be deleted by the user

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite 8 |
| 3D / Animation | Three.js · React Three Fiber · GSAP ScrollTrigger |
| AI Analysis | Optional consented ConvoAutopsy AI proxy (when deployed); on-device estimates remain available |
| Frameworks | Educational heuristic inspirations: Gottman · Thomas-Kilmann · Transactional Analysis |
| Auth / Storage | localStorage; optional AI proxy for consented assistance |
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
npm install
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
npx expo-doctor
npm run export:ios
```

For a bounded Expo Go smoke test on the same network, run `npx expo start --lan --clear`, scan the generated QR code with Expo Go, and stop the server when finished. Expo Go does not compile the local Swift Vision OCR module; its screenshot import fallback is expected there. Physical-device navigation, input, history, accessibility, offline, and share observations remain a user-run release checkpoint.

The repeatable Maestro flow is [`mobile/e2e/analyze-flow.yaml`](mobile/e2e/analyze-flow.yaml). It uses production-control semantic IDs and, after the user presses Share, asserts the stock iOS **Copy** control. That exact assertion requires an English-locale iOS share sheet and proves only that the system sheet opened; it never treats an external share as completed.

---

## iOS Release Path (Expo/EAS)

The iOS release path is the Expo app in `mobile/`, not the legacy Capacitor project. App Store uploads currently require Xcode 26 or later using the iOS 26 SDK or later. Apple Developer membership, Expo login, EAS initialization, development-build OCR verification, production build, TestFlight, App Store Connect record, review, and publication are not complete.

After the user has personally completed the Apple and Expo credential steps, the user-owned release process uses EAS from `mobile/` to create a development build, verify native OCR on a physical iPhone, and only then create a production build and submit it. Do not treat an Expo Go export or a submission as App Store publication.

### GitHub Pages proxy configuration

For the deployed site to use AI assistance, set a repository **variable** (not a secret):

**Settings → Secrets and variables → Actions → Variables → New repository variable**
```
Name:  VITE_AI_PROXY_URL
Value: https://your-proxy.example
```

The browser never receives provider credentials. Before AI use, the site asks for consent and explains that anonymized message text is sent through the ConvoAutopsy server to Groq; on-device analysis remains available without sharing.

---

## Project Structure

```
convoautopsy/
├── src/
│   ├── pages/
│   │   ├── LandingPage.jsx     # Marketing site with 3D phone + all sections
│   │   ├── LandingPage.css     # Landing page styles
│   │   ├── Dashboard.jsx       # Main app (input, history, analysis)
│   │   └── AuthPage.jsx        # Login / signup
│   ├── components/
│   │   ├── PhoneScene.jsx      # 3D Apple iPhone (React Three Fiber)
│   │   ├── ChatBubbles.jsx     # Floating chat bubbles in 3D scene
│   │   ├── AnalysisResult.jsx  # Analysis display + receipt export
│   │   ├── ResponseCrafter.jsx # 4-step response wizard
│   │   └── Onboarding.jsx      # First-run walkthrough modal
│   ├── utils/
│   │   ├── analyzeConversation.js  # Proxy client + local regex fallback
│   │   ├── craftResponse.js        # Proxy client + local response templates
│   │   └── storage.js              # localStorage auth + conversation history
│   └── index.css               # Global styles + all component styles
├── mobile/                     # Expo / React Native iOS app
│   ├── app/                    # Expo Router screens
│   ├── src/                    # Local analysis, persistence, consent, exports
│   ├── modules/convo-ocr/      # Native Apple Vision module (development build required)
│   └── e2e/                    # Maestro release flow
├── server/ai-proxy/            # Cloudflare Worker and Durable Object limiter
├── .github/workflows/
│   ├── deploy.yml              # GitHub Actions → GitHub Pages
│   └── ios-ci.yml              # Node 22 web, mobile, and Worker gates
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

Names are automatically anonymized to Person A / Person B before any AI processing.

---

## Built by

**Avi Amanchi** · [github.com/avinashamanchi](https://github.com/avinashamanchi)

© 2026 ConvoAutopsy
