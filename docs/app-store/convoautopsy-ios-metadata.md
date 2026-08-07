# ConvoAutopsy iOS metadata

Initial fields, reviewed 2026-08-07 (revise only if App Store Connect rejects a length or category):

- Name: `ConvoAutopsy`
- Subtitle: `See conversation patterns`
- Primary category: `Lifestyle`
- Keywords: `communication,conflict,reflection,relationships,clarity,response,dialogue,tone`
- Support URL: `https://avinashamanchi.github.io/convoautopsy/support.html`
- Privacy URL: `https://avinashamanchi.github.io/convoautopsy/privacy.html`
- Terms of Use URL: `https://avinashamanchi.github.io/convoautopsy/terms.html`

Description opening: `Reflect on difficult conversations with on-device pattern estimates, optional AI-assisted feedback, private local history, and response drafts you control.`

Suggested full description: Reflect on difficult conversations with on-device pattern estimates, optional AI-assisted feedback, private local history, free on-device Private Trends, and response drafts you control. Review imported or pasted text before analysis, choose local analysis when you want no network transmission, and explicitly consent before optional AI-assisted analysis. Results are educational estimates, not factual conclusions about people or relationships. ConvoAutopsy never sends messages automatically.

In-app purchase summary: Free includes unlimited on-device analyses and response drafts, on-device Private Trends, up to 10 saved reports, 3 remote AI analyses, and 6 remote AI-assisted drafts per rolling 30 days. Convo Pro removes the report cap and includes 75 remote AI analyses and 150 remote AI-assisted drafts per UTC calendar month. Private Trends is not paywalled. Remote allowances are fair-use limits, are not credits, and do not roll over. Monthly and annual prices are rendered from StoreKit through RevenueCat and are not hard-coded in listing copy.

## App Privacy answers

- Proposed declarations, to be rechecked against Apple’s current questionnaire and the exact release binary: User Content for App Functionality; Purchase History for App Functionality; a pseudonymous Device ID for App Functionality and Fraud Prevention; and content-free Product Interaction/Diagnostics used for App Functionality and reliability.
- Mark these declarations as not used for tracking. Do not claim data is linked to a named identity: there is no ConvoAutopsy account, but installation and RevenueCat app-user identifiers are pseudonymous rather than anonymous.
- Reviewed text is transmitted through Cloudflare to Groq only after confirmation and consent. RevenueCat processes a pseudonymous app-user ID and purchase/entitlement history. HMAC-derived rate/quota keys, bounded usage rows, daily budget state, two-minute recovery leases, and content-free metrics support fair-use and operations.
- Confirm Apple and RevenueCat SDK privacy manifests and current App Store Connect definitions before submitting; this draft is not a completed questionnaire.

## Age rating

Propose 13+ because users may enter mature relationship language. Accept the rating produced by Apple’s completed questionnaire.

## Review note

ConvoAutopsy has an on-device mode that works without an account or purchase. Before optional AI-assisted analysis or one AI-assisted draft, the app shows the exact reviewed text and discloses that it is sent through Cloudflare to Groq only after confirmation and consent; users can choose local analysis and local drafts instead. The app never sends messages automatically. To test the local path, use **Analyze → Review → Run on-device analysis**. Purchases and restore require a signed development, TestFlight, or App Store build; Expo Go is preview-only for billing.

## Truthful release status

This metadata is code-prepared only. The proxy and legal-page changes are not deployed, the Swift OCR module has not been compiled in an iOS development build, and Expo Go has a documented OCR fallback. On 2026-08-07 the public Privacy, Terms, and Support URLs returned HTTP 404. Apple/RevenueCat/Cloudflare/EAS configuration, signed purchase and restore tests, TestFlight, screenshots, App Store Connect forms, upload, review, acceptance, publication, and post-publication URL checks are not complete. Historical proxy-token revocation/purge remains a release blocker until a deployed proxy’s retention and deletion behavior is verified.
