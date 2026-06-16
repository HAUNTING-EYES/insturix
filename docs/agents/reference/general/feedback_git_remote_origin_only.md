---
name: feedback-git-remote-origin-only
description: ALWAYS push to origin (Insturix/Front-End) only — never the haunting remote
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 024cf1ed-a7cf-4684-b03c-46c8321337c8
---

**ALWAYS commit + push to `origin` only** = `https://github.com/Insturix/Front-End.git`. **NEVER push to the `haunting` remote** (`github.com/HAUNTING-EYES/insturix`), even though it's configured. Don't ask which remote — it's always origin.

`infrastructure-improvs-+Editron` is the **Vercel PREVIEW branch** — pushing it triggers a preview deploy (expected, fine). Production is `main` only, via the Vercel dashboard (never `vercel --prod`/promote — see [[feedback_never_deploy_production]]).

**Why:** user stated 2026-05-31 "all commits always to insturix front end only" + confirmed infra-improvs branch = the preview branch. The `haunting` remote is a parallel/legacy repo that must not receive pushes.

**How to apply:** stage real source by explicit path (never `git add -A`/`git add scripts/` — scripts hold a Mongo URI), commit with the Co-Authored-By trailer, `git push origin`. Done. See [[codebase_verified_corrections]], [[session_phase0_1_fonts]].
