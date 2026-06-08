---
name: Upstash/Redis key rotation needed
description: Vercel flagged Upstash env vars. Need rotation from Upstash dashboard.
type: feedback
originSessionId: 1bd6cc5e-7a44-4a04-9bc0-83d23f312acc
---
# Upstash Key Rotation (2026-04-30)

Vercel flagged UPSTASH/QSTASH/REDIS env vars. Keys are 94-220 days old.

**Vars to rotate:**
- QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY, QSTASH_URL
- UPSTASH_REDIS_REST_TOKEN, UPSTASH_REDIS_REST_URL
- REDIS_URL

**Action:** User rotates on upstash.com → updates on Vercel for all envs (Production + Preview + Development).

**What uses these:**
- QStash: video gen worker dispatch, audio worker dispatch, graph-sync worker
- Redis: render queue, rate limiting
- If keys die → pipeline stops dispatching async workers → no video gen, no BGM, no SFX
