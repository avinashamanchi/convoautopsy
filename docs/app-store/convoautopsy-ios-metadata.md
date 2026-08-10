# ConvoAutopsy iOS metadata

Initial fields, reviewed 2026-08-09 against Apple's current metadata limits (revise if App Store Connect rejects a field or category):

- Name: `ConvoAutopsy`
- Subtitle: `See conversation patterns`
- Primary category: `Lifestyle`
- Keywords: `communication,conflict,reflection,relationships,clarity,response,dialogue,tone,messages,insight` (95 UTF-8 bytes; no spaces)
- Support URL: `https://avinashamanchi.github.io/convoautopsy/support.html`
- Privacy URL: `https://avinashamanchi.github.io/convoautopsy/privacy.html`
- Terms of Use URL: `https://avinashamanchi.github.io/convoautopsy/terms.html`

App Store record draft:

- Primary language: `English (U.S.)`
- SKU: `convoautopsy-ios`
- Copyright year: `2026` (confirm the legal seller/rights-holder name in the authorized account)
- Content rights: confirm the final answer in App Store Connect against imported user-provided conversations and the Terms; do not infer it from source code
- Digital Services Act status: account-holder decision required; do not infer trader/non-trader status
- Availability: begin with the storefronts the account holder can legally support; do not select China mainland or other documentation-gated regions by default

Description opening: `Reflect on difficult conversations with on-device pattern estimates, optional AI-assisted feedback, private local history, and response drafts you control.`

Suggested full description: Reflect on difficult conversations with on-device pattern estimates, optional AI-assisted feedback, private local history, free on-device Private Trends, and response drafts you control. Review imported or pasted text before analysis, choose local analysis when you want no network transmission, and explicitly consent before optional AI-assisted analysis. Results are educational estimates, not factual conclusions about people or relationships. ConvoAutopsy never sends messages automatically.

In-app purchase summary: Free includes unlimited on-device analyses and response drafts, on-device Private Trends, up to 10 saved reports, 3 remote AI analyses, and 6 remote AI-assisted drafts per rolling 30 days. Convo Pro removes the report cap and includes 75 remote AI analyses and 150 remote AI-assisted drafts per UTC calendar month. Private Trends is not paywalled. Remote allowances are fair-use limits, are not credits, and do not roll over. Monthly and annual prices are rendered from StoreKit through RevenueCat and are not hard-coded in listing copy.

## App Privacy answers

- Proposed declarations, to be rechecked against Apple’s current questionnaire and the exact release binary: User Content for App Functionality; Purchase History for Analytics and App Functionality, not linked to the user; a separate pseudonymous Device ID for App Functionality and Fraud Prevention; and content-free Product Interaction/Diagnostics used for App Functionality and reliability.
- Mark every declaration as not used for tracking. ConvoAutopsy has no account and passes no custom account identifier to RevenueCat; RevenueCat generates the anonymous app-user ID. Do not treat that RevenueCat-generated identifier as a separately collected User ID or Device ID. The app's own random installation token remains the separate Device ID disclosure.
- Reviewed text is transmitted through Cloudflare to Groq only after confirmation and consent. RevenueCat processes its generated anonymous app-user ID and purchase/entitlement history for subscription analytics and app functionality. HMAC-derived rate/quota keys, bounded usage rows, daily budget state, two-minute recovery leases, and content-free metrics support fair-use and operations.
- Confirm Apple and RevenueCat SDK privacy manifests and current App Store Connect definitions before submitting; this draft is not a completed questionnaire.

## Age rating

Propose 13+ because users may enter mature relationship language. Accept the rating produced by Apple’s completed questionnaire.

## Review note

ConvoAutopsy has an on-device mode that works without an account or purchase. Before optional AI-assisted analysis or one AI-assisted draft, the app shows the exact reviewed text and discloses that it is sent through Cloudflare to Groq only after confirmation and consent; users can choose local analysis and local drafts instead. The app never sends messages automatically. To test the local path, use **Analyze → Review → Run on-device analysis**. Purchases and restore require a signed development, TestFlight, or App Store build; Expo Go is preview-only for billing.

## Truthful release status

This metadata is code-prepared only. The proxy and legal-page changes are not deployed, the Swift OCR module has not been compiled in an iOS development build, and Expo Go has a documented OCR fallback. On 2026-08-09 the public Privacy, Terms, and Support URLs still returned HTTP 404. Apple/RevenueCat/Cloudflare/EAS configuration, signed purchase and restore tests, TestFlight, screenshots, App Store Connect forms, upload, review, acceptance, publication, and post-publication URL checks are not complete. Historical proxy-token revocation/purge remains a release blocker until a deployed proxy’s retention and deletion behavior is verified.
