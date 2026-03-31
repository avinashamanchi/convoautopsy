# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server
npm run build     # Production build
npm run lint      # ESLint
npm run preview   # Preview built site
```

There is no test runner configured.

The project has two sub-implementations — run commands from their respective directories:
- Root (`/`): Marketing/showcase site with 3D animations only
- Phase 1 (`convoautopsy-phase1/convoautopsy-phase1/`): Full functional app with AI analysis

## Architecture

### Two Separate Apps

The root directory and `convoautopsy-phase1/convoautopsy-phase1/` are independent Vite/React projects with their own `package.json`. The Phase 1 app is the feature-complete version; the root is a showcase/landing site.

### Data Flow

```
InputModal.jsx (user pastes conversation)
  → analyzeConversation.js
      → parseConversation() — parses "Name: message" or "Name - message" format, anonymizes to Person A/B
      → callGroq() with llama-3.3-70b-versatile OR localAnalyze() (regex fallback if no API key)
      → returns: { overall_tension_score, conflict_mode, messages[{ gottman_flag, ego_state, hidden_meaning }] }
  → DiagnosisPanel.jsx (displays report cards)
  → receiptGenerator.js (canvas-based 1080x1920px PNG export)
```

### 3D/Animation Layer

- **Three.js + React Three Fiber**: 3D phone model that shatters into 24 shards on scroll (`PhoneScene.jsx`), floating chat bubbles with Gottman tags (`ChatBubbles.jsx`)
- **GSAP ScrollTrigger**: Orchestrates all scroll-driven animations — phone shatters at 5–60% scroll, diagnosis panel at 60%+
- **Framer Motion**: Supplementary React-level animations

### AI Integration

- **Primary**: Groq API (`VITE_GROQ_API_KEY` in `.env`) — model `llama-3.3-70b-versatile`
- **Fallback**: Local regex pattern-matching in `analyzeConversation.js` — works without an API key, also accessible via `window.__GROQ_API_KEY` at runtime

### Psychological Frameworks (baked into Groq system prompt)

1. **Gottman's Four Horsemen**: Criticism, Contempt, Defensiveness, Stonewalling, Neutral
2. **Thomas-Kilmann (TKI)**: Competing, Avoiding, Accommodating, Collaborating, Compromising
3. **Transactional Analysis**: Parent, Adult, Child ego states

### Styling

Vanilla CSS with custom properties — no CSS-in-JS. Design tokens in `index.css`. Key colors: purple accent `#a78bfa`, pink `#f472b6`, near-black background `#070708`. Fonts: Instrument Serif (display) + DM Sans (body) from Google Fonts.
