# ConvoAutopsy iOS metadata

Initial fields (revise only if App Store Connect rejects a length or category):

- Name: `ConvoAutopsy`
- Subtitle: `See conversation patterns`
- Primary category: `Lifestyle`
- Keywords: `communication,conflict,self reflection,conversation,relationships,clarity,response`
- Support URL: `https://github.com/avinashamanchi/convoautopsy/issues`
- Privacy URL: `https://avinashamanchi.github.io/convoautopsy/privacy.html`

Description opening: `Reflect on difficult conversations with on-device pattern estimates, optional AI-assisted feedback, private local history, and response drafts you control.`

Suggested full description: Reflect on difficult conversations with on-device pattern estimates, optional AI-assisted feedback, private local history, and response drafts you control. Review imported or pasted text before analysis, choose local analysis when you want no network transmission, and explicitly consent before optional AI-assisted analysis. Results are educational estimates, not factual conclusions about people or relationships. ConvoAutopsy never sends messages automatically.

## App Privacy answers

- Declare User Content for App Functionality.
- Declare a pseudonymous Device ID for App Functionality and Fraud Prevention (the local installation token used by proxy rate limiting).
- Mark both declarations as not used for tracking.
- Do not claim data is linked to the user’s identity.
- Rate limiting HMAC-derives a per-route pseudonymous digest from the local token and network signal; its Durable Object retains only an integer count/window for 60 seconds and cannot be claimed deleted from Cloudflare or Groq by local deletion.

## Age rating

Propose 13+ because users may enter mature relationship language. Accept the rating produced by Apple’s completed questionnaire.

## Review note

ConvoAutopsy has an on-device mode that works without an account. On first use of optional AI-assisted analysis, the app discloses that anonymized speaker labels and message text are sent to Groq through the ConvoAutopsy proxy only after consent; users can choose local analysis instead. The app never sends messages automatically. To test the local path, use **Analyze → Review → Run on-device analysis**.

## Truthful release status

This metadata is code-prepared only. The proxy is undeployed, the Swift OCR module has not been compiled in an iOS development build, and Expo Go has a documented OCR fallback. TestFlight, screenshots, App Store Connect record creation, upload, review, acceptance, publication, and public privacy-page verification are not complete. Historical proxy-token revocation/purge is a release blocker until a deployed proxy’s retention and deletion behavior is implemented and verified.
