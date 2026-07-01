# Security — Manual Key Rotation Checklist (2026-07-01)

Real credentials were found committed to this repo. They have been **removed from the current
files** (env-var'd), but a code change does **NOT** invalidate a leaked key, and the secrets
**remain in git history** (~7 commits). Each must be rotated in its provider console.

## Rotate now — assume compromised (present in git history)

- [ ] **MongoDB Atlas** — the `admin` database user on `main-cluster.glgebdc.mongodb.net`.
      Rotate its password (Atlas → Database Access → Edit user). **Highest priority — this is DB
      admin access.** Then update `MONGODB_URI` in Vercel (all envs) and local `.env.local`.
- [ ] **Google Gemini / AI Studio API keys** — `AIzaSyBDF4…`, `AIzaSyAcc1pa4…`, `AIzaSyA5vFtuZC…`,
      `AIzaSyACAR0WU…`. Delete/regenerate in Google AI Studio (or GCP → APIs & Services →
      Credentials). Update `GEMINI_API_KEY` / `GOOGLE_API_KEY` in Vercel + `.env.local`.
      (`AIzaSyCcmEc6S0…` is already marked REVOKED in the old docs — verify it's dead.)

## Spot-checked, appear clean (no literals in tracked code — rotate only if otherwise suspected)

- R2 / Cloudflare (`R2_*`), Clerk (`CLERK_*`), Upstash (`UPSTASH_*`, `QSTASH_*`), Deepgram
  (`DEEPGRAM_API_KEY`), Remotion Lambda AWS (`REMOTION_LAMBDA_*`), Modal (`MODAL_*`), GCS
  (`GOOGLE_CLOUD_CREDENTIALS`) — all referenced via env vars only in tracked code.

## Git history purge — destructive, do NOT run ad hoc

The above secrets still exist in ~7 historical commits. **After rotation**, strip them with
`git filter-repo` (or BFG), then a **coordinated force-push** — every clone/worktree must
re-clone afterward. This rewrites shared history, so plan it with the team; do not run it on
`infrastructure-improvs-+Editron` unprompted.

## Prevention (done in this pass)

- Hardcoded Mongo URI + Gemini key in `scripts/` replaced with env-var reads
  (`get-transcript.ts`, `dspy-eval/eval_comprehensive.py`).
- Neutralized a dummy `BEGIN PRIVATE KEY` marker in a read-only probe (`probe-semantic-mg-rerun.ts`).
- CI secret scanning: **gitleaks** (`.github/workflows/gitleaks.yml`, working-tree scan) plus the
  existing regex job in `ci.yml`. Allowlist for known placeholders/dummies: `.gitleaks.toml`.
