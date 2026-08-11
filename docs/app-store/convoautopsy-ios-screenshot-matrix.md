# ConvoAutopsy iOS screenshot matrix

Official Apple screenshot specifications rechecked 2026-08-09. App Store Connect accepts one to ten screenshots per device size in PNG/JPEG without alpha.

`supportsTablet` is false, so the current release needs an iPhone set and does not claim iPad support.

| Required set | Accepted portrait pixels | Status | Synthetic scenes |
|---|---:|---|---|
| iPhone 6.9-inch | 1260×2736, 1290×2796, or 1320×2868 | Not captured | Analyze input; reviewed preview; on-device result; private history; response drafts/privacy |

If the 6.9-inch set is not supplied, Apple currently requires a 6.5-inch set at 1284×2778 or 1242×2688. ConvoAutopsy will supply 6.9-inch images rather than rely on scaling.

## Capture rules

- Capture from the signed production-equivalent build with synthetic `Person A`/`Person B` content only.
- Use one accepted pixel size consistently within the localized set and ensure the files have no alpha channel.
- Export losslessly at the accepted native pixel size. Review every overlay at 100% and at App Store thumbnail size for sharp type, sufficient contrast, safe margins, and no clipping.
- Do not show real conversations, names, notifications, email addresses, credentials, Expo Go chrome, development menus, or unverified remote-AI results.
- Label local output as an `On-device estimate`; do not imply diagnosis, intent detection, factual conclusions, guaranteed relationship outcomes, or automatic message delivery.
- Show AI consent before any optional remote-processing scene.
- Do not claim a share completed merely because the iOS share sheet opened.
- Validate normal text, 200% Dynamic Type, VoiceOver, and Reduce Motion in the signed build before capturing the normal-size listing images.

Final screenshots remain blocked until captured and visually reviewed from the exact TestFlight candidate.

## Scene copy draft

1. `See the pattern, not a verdict` — synthetic input and clear educational boundary.
2. `Review before analysis` — reviewed Person A/Person B conversation preview.
3. `Choose on-device privacy` — local-analysis choice with no-network language.
4. `Keep only what helps` — private local history with synthetic reports.
5. `Draft a calmer response` — response ideas labeled for review, never automatic delivery.

Keep each overlay to one short benefit in plain customer language. The first three frames must explain the product at App Store thumbnail size without requiring the long description.

No listing image exists yet. Every screenshot remains blocked on the exact signed TestFlight candidate, synthetic fixture reset, accessibility checks, capture, pixel/alpha validation, and human visual review.
