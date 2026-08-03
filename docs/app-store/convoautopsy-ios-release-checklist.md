# ConvoAutopsy iOS release checklist

## Code-complete gates

- [x] Local reports, preferences, consent, local installation token, ConvoAutopsy-owned cache artifacts, and the in-memory session have a coordinated best-effort deletion path with subsystem failures and retry.
- [x] Settings requires the exact phrase `DELETE` before enabling the destructive control, and supports consent revocation and privacy/retention navigation.
- [x] In-app and built static privacy content disclose local storage, optional Groq-through-proxy use after consent, local alternative, no tracking/ads/contacts/automatic messaging, pseudonymous token/network rate limiting, deletion, output limitations, and support URL.
- [x] Credential-free EAS configuration, icon, splash configuration, bundle ID, build number, purpose strings, and initial metadata are in the repository.
- [x] The web consent dialog has initial focus, focus trap, Escape handling, and focus restoration tests.

## Credentialed and external gates (not complete)

- [ ] Apple Developer Program membership and App Store Connect access.
- [ ] Expo login and EAS project initialization.
- [ ] Registered iOS test device.
- [ ] Development build with the native Swift OCR module compiled and tested. Expo Go fallback remains expected until this build exists.
- [ ] Deploy and verify the AI proxy. Its historical token revocation/purge and retention behavior remain a release blocker.
- [ ] Verify the public privacy URL after GitHub Pages publication.
- [ ] Create the App Store Connect record and complete App Privacy and age-rating questionnaires.
- [ ] Capture approved device screenshots.
- [ ] Create and test a TestFlight build.
- [ ] Upload a build, submit for review, and verify review outcome.
- [ ] Verify the public App Store listing after publication.

No App Store acceptance or publication is claimed by this checklist.
