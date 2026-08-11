# ConvoAutopsy development notes

Use Node 22 at the repository root.

```bash
npm ci
npm test
npm run lint
npm run build
```

The website has an optional public `VITE_AI_PROXY_URL`. It is an endpoint configuration, never a provider credential. Browser AI requests require the current consent record, anonymize participants, and use the ConvoAutopsy proxy; provider credentials remain server-side. Local analysis and response templates remain available without network use.

Run mobile and Worker checks from their own directories. The Capacitor wrapper remains built with `npm run build:app` followed by `npx cap sync`.
