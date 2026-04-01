# ConvoAutopsy

**AI-powered conversation diagnostics.** Paste any argument, text thread, or chat — get a clinical breakdown of who escalated it, why it broke down, and exactly what to say next.

Live site → **[avinashamanchi.github.io/convoautopsy](https://avinashamanchi.github.io/convoautopsy/)**

---

## What it does

- **Tension Score** — 0–100 score showing how hostile the conversation was
- **Gottman's Four Horsemen** — flags every message as Criticism, Contempt, Defensiveness, Stonewalling, or Neutral
- **Thomas-Kilmann Conflict Mode** — identifies overall conflict style (Competing, Avoiding, Collaborating, etc.)
- **Transactional Analysis** — tags each message's ego state (Parent, Adult, Child) and its hidden meaning
- **Response Crafter** — 4-step wizard: pick who you are → set your goal → choose a tone → get 3 tailored responses
- **Receipt Export** — download a shareable 9:16 PNG of your analysis (Instagram/TikTok ready)
- **File Upload** — drag-and-drop .txt chat exports (WhatsApp, Discord, etc.)
- **Saved History** — every analysis saved per user account via localStorage

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite 8 |
| 3D / Animation | Three.js · React Three Fiber · GSAP ScrollTrigger |
| AI Analysis | Groq API (llama-3.3-70b-versatile) with local regex fallback |
| Frameworks | Gottman Method · Thomas-Kilmann · Transactional Analysis |
| Auth / Storage | localStorage (no backend required) |
| Receipt Export | html2canvas |
| Mobile | Expo (React Native WebView) · Capacitor iOS |
| Deployment | GitHub Pages via GitHub Actions |

---

## Running Locally

### Prerequisites
- Node.js 18+
- A Groq API key (free at [console.groq.com](https://console.groq.com)) — the app works without one via local fallback

### 1. Clone and install

```bash
git clone https://github.com/avinashamanchi/convoautopsy.git
cd convoautopsy
npm install
```

### 2. Add your API key (optional but recommended)

```bash
echo "VITE_GROQ_API_KEY=your_key_here" > .env
```

Without this the app uses a built-in local analysis engine — still fully functional.

### 3. Start the dev server

```bash
npm run dev
```

Open [http://localhost:5173/convoautopsy/](http://localhost:5173/convoautopsy/)

### 4. Build for production

```bash
npm run build        # GitHub Pages build (base: /convoautopsy/)
npm run build:app    # Mobile/Capacitor build (base: ./)
```

---

## Mobile Development (Expo — live preview on your phone)

See the app live on your phone with instant hot reload while you develop.

### Setup

```bash
cd native
npm install
```

### Run

In two terminals:

**Terminal 1 — web dev server (exposed to network):**
```bash
npm run dev -- --host 0.0.0.0
```

**Terminal 2 — Expo:**
```bash
cd native
npx expo start --lan
```

Scan the QR code with **Expo Go** (free on the App Store). Your phone must be on the same WiFi as your Mac.

> **Note:** Update the IP address in `native/App.js` if your local IP changes (`ipconfig getifaddr en0` to check).

---

## iOS App Store Submission (Capacitor)

The `ios/` directory contains a complete Xcode project.

### Requirements
- **Xcode** — download free from the Mac App Store (~12GB)
- **Apple Developer Account** — $99/year at [developer.apple.com](https://developer.apple.com/programs)

### Steps

```bash
# 1. Build and sync
npm run ios   # builds, syncs, and opens Xcode automatically

# 2. In Xcode:
#    - Select your team under Signing & Capabilities
#    - Product → Archive
#    - Distribute App → App Store Connect
```

### GitHub Actions Secret

For the deployed site to use real AI (not just the local fallback), add this secret to your GitHub repo:

**Settings → Secrets → Actions → New repository secret**
```
Name:  VITE_GROQ_API_KEY
Value: your_groq_api_key
```

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
│   │   ├── analyzeConversation.js  # Groq API + local regex fallback
│   │   ├── craftResponse.js        # Response generation (30 template sets)
│   │   └── storage.js              # localStorage auth + conversation history
│   └── index.css               # Global styles + all component styles
├── native/                     # Expo app (live phone preview)
│   └── App.js                  # WebView pointing to Vite dev server
├── ios/                        # Capacitor iOS Xcode project
├── .github/workflows/
│   └── deploy.yml              # GitHub Actions → GitHub Pages
├── capacitor.config.ts         # Capacitor / iOS configuration
└── vite.config.js              # Vite config (base path switches for mobile)
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
