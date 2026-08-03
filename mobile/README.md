# ConvoAutopsy iOS app

This directory contains the Expo SDK 54 / React Native iOS app. Use Node.js 22 and the committed lockfile.

## Local setup

```bash
npm ci
npm start
```

Expo Go supports the main local workflow: text import, parsing, on-device estimates, history, response drafts, and sharing. Screenshot OCR requires the native `convo-ocr` module, so Expo Go uses the documented manual-paste fallback instead.

Use an iOS development build when validating native OCR or other compiled-module behavior. A development build and a physical iPhone are also required for release-quality checks of camera/photo permissions, share sheets, VoiceOver, Dynamic Type, and offline behavior.

## Required checks

Run all checks with Node.js 22:

```bash
npm test
npm run typecheck
npm run lint
npm run export:ios
npx expo-doctor
```

`npm run export:ios` proves that Expo can produce the static iOS JavaScript bundle. It does not compile the native Xcode project, install on a device, create a TestFlight build, or publish to the App Store.

The AI proxy must be deployed separately, and `EXPO_PUBLIC_AI_PROXY_URL` may contain only its public HTTPS endpoint. Provider keys and rate-limit secrets belong in the Worker secret store and must never be placed in an `EXPO_PUBLIC_` variable.
