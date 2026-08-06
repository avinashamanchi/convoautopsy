# ConvoAutopsy iOS screenshot matrix

Official Apple screenshot specifications rechecked 2026-08-06. App Store Connect accepts one to ten screenshots per device size in PNG/JPEG without alpha.

`supportsTablet` is false, so the current release needs an iPhone set and does not claim iPad support.

| Required set | Accepted portrait pixels | Status | Synthetic scenes |
|---|---:|---|---|
| iPhone 6.9-inch | 1260×2736, 1290×2796, or 1320×2868 | Not captured | Analyze input; anonymized review; on-device result; private history; response drafts/privacy |

If the 6.9-inch set is not supplied, Apple currently requires a 6.5-inch set at 1284×2778 or 1242×2688. ConvoAutopsy will supply 6.9-inch images rather than rely on scaling.

## Capture rules

- Capture from the signed production-equivalent build with synthetic `Person A`/`Person B` content only.
- Use one accepted pixel size consistently within the localized set and ensure the files have no alpha channel.
- Do not show real conversations, names, notifications, email addresses, credentials, Expo Go chrome, development menus, or unverified remote-AI results.
- Label local output as an `On-device estimate`; do not imply diagnosis, intent detection, factual conclusions, guaranteed relationship outcomes, or automatic message delivery.
- Show AI consent before any optional remote-processing scene.
- Do not claim a share completed merely because the iOS share sheet opened.
- Validate normal text, 200% Dynamic Type, VoiceOver, and Reduce Motion in the signed build before capturing the normal-size listing images.

Final screenshots remain blocked until captured and visually reviewed from the exact TestFlight candidate.
