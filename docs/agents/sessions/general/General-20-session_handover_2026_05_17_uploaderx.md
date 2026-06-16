---
name: Session Handover — 2026-05-17 UploaderX Mega Session
description: UploaderX collection split, AWS SDK fix, R2 config, Instagram Login, YouTube connect, Google OAuth screen fix. All 5 platforms operational.
type: project
originSessionId: 32bb4cf3-d2b2-4fba-86e7-948da2391b17
---
## Status: All 5 platforms publishing successfully on production

### What Shipped to Main
1. **UploaderX collection split** — `uploaderx_videos` collection, 9 routes updated
2. **Clickatron lazy S3Client** — prevents build crash
3. **AWS SDK pinned to 3.936.0** — Vercel uses yarn not pnpm, `^` ranges dangerous
4. **R2 env var `.trim()`** — 15 Vercel env vars had `\n` suffix
5. **R2 bucket config** — public access, CORS, dedicated API token
6. **Instagram Login flow** — Creator accounts work without Facebook Page
7. **YouTube reauthorize** — `useReverification()` + `googleAccount.reauthorize()`
8. **Google OAuth client swap** — `insturix-493414` for Clerk sign-in (no scary screen)
9. **Platform disconnect buttons** — Instagram, Facebook, Twitter
10. **Nav links** — Privacy Policy + Terms in Resources dropdown

### Open Threads
- Google verification for `clerk-oauth-v2` pending (YouTube connect still shows scary screen)
- Custom YouTube OAuth routes not built (would decouple from Clerk)
- Verify all 15 `\n` env vars are cleaned on Vercel
- `youtube/upload/route.ts` is dead code (old UploaderX model import)

### Key Architecture
- **Video records:** `uploaderx_videos` collection via `UploaderXVideo` model
- **Platform tokens:** `User` model (unchanged)
- **Instagram auth:** Instagram Login (`api.instagram.com`), NOT Facebook Login
- **YouTube auth:** Clerk `reauthorize()` with `useReverification()` hook
- **Clerk Google OAuth:** `insturix-493414` project (basic scopes, verified domain)
- **YouTube OAuth:** `clerk-oauth-v2` project (sensitive scope, pending verification)
