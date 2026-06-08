---
name: NEVER trigger production deployments
description: CRITICAL RULE. Never push empty commits, run vercel --prod, or do anything that could promote a feature branch to production. Only main branch deploys to production.
type: feedback
originSessionId: 6342a39e-a0a7-4607-a725-4f31258ab8d2
---
NEVER trigger production deployments from feature branches.

**Why:** On 2026-04-27, an empty commit pushed to `infrastructure-improvs-+Editron` via `haunting` remote triggered a Production deploy on Vercel. This overwrote the stable `main` production deployment with an untested feature branch. User was extremely upset — rightfully so.

**How to apply:**
1. NEVER run `npx vercel --prod` or `npx vercel promote` — these affect production
2. NEVER push empty commits to trigger redeploys — use the Vercel dashboard instead
3. NEVER assume a branch is "just preview" — verify Vercel's production branch config first
4. If env vars need a redeploy to take effect, tell the user to redeploy from the dashboard
5. Feature branches deploy as PREVIEW only — production is ALWAYS from `main`
6. If you need to verify a deploy, check the Vercel dashboard — don't try to force it via CLI

**The failure chain:**
1. Leaked API key in graphiti-test.py → Google revoked key
2. Updated env vars on Vercel
3. Pushed empty commit to trigger redeploy
4. Vercel deployed it as Production instead of Preview
5. Production site now running untested feature branch code

**Rule:** When env vars change, say "redeploy from Vercel dashboard" and STOP. Do not try to trigger deploys programmatically.
