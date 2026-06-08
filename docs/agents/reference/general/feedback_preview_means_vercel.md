---
name: feedback_preview_means_vercel
description: "Preview" always means the Vercel preview deployment, never a local dev server
type: feedback
---

When the user says "preview" they mean the Vercel preview deployment (from the `infrastructure-improvs-+Editron` branch), NOT a local dev server.

**Why:** The project is tested on Vercel, not locally. Credits, MongoDB, GCS, fal.ai — all the real services run there.

**How to apply:** Don't suggest running `npm run dev` or `preview_start` for testing. Changes need to be committed and pushed to the branch, then verified on the Vercel deployment.
