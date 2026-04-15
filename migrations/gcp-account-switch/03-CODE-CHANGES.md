# 3️⃣ Source Code Changes — Preparation

**Total:** 5 files, ~10 lines changed. Each is a defensive fallback that only fires if env vars aren't set.

**Important:** These changes are SAFE even before cutover because they only affect fallback defaults, not the primary code path (which reads from env vars that we haven't changed yet).

**Git workflow:** Create branch `gcp-account-migration` off `main`, apply changes, commit, open PR. Do NOT merge until tests pass on preview.

---

## Pre-Edit Checklist (per CLAUDE.md Rule)

For each file change, I verified:
1. ✅ What the file does (read the code)
2. ✅ What the change does (fallback value update)
3. ✅ What depends on it (grepped for callers)
4. ✅ Bigger system impact (none — fallbacks only fire if env missing)
5. ✅ No assumptions (tested the exact line numbers)

---

## File 1: `lib/socialize-gcs.ts` (line 26)

**What it does:** Initializes GCS Storage client for banner images. The fallback at line 26 is used only if both `GOOGLE_CLOUD_PROJECT_ID` and service-account-embedded project aren't set.

**Current:**
```typescript
: {
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || 'insturix-dev',
};
```

**Change to:**
```typescript
: {
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'insturix-493414',
};
```

**Why this change:**
- Adds `GOOGLE_CLOUD_PROJECT` (the env var we set for new account) as an intermediate fallback
- Updates the final hardcoded fallback from `insturix-dev` (old account only) to `insturix-493414` (new account)

**Risk:** ZERO if `GOOGLE_CLOUD_PROJECT_ID` is set in Vercel (it is). The fallback only fires if env is broken.

---

## File 2: `test-gcs.js` (line 10)

**What it does:** Standalone test script to verify GCS connectivity locally. Not used in production.

**Current:**
```javascript
const storage = new Storage({
    projectId: 'insturix-dev'
});
```

**Change to:**
```javascript
const storage = new Storage({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || 'insturix-493414'
});
```

**Risk:** ZERO — test script only, not in production bundle.

---

## File 3: `scripts/migrate-gcs-to-r2.mjs` (line 62)

**What it does:** Utility script to migrate files from GCS to Cloudflare R2 (unrelated to this migration, but has a stale fallback).

**Current:**
```javascript
const GCS_BUCKET = env.GCS_BUCKET_NAME || 'insturix';
```

**Change to:**
```javascript
const GCS_BUCKET = env.GCS_BUCKET_NAME || 'insturix-v2';
```

**Risk:** ZERO — script not in production. But keeping it useful for future.

---

## File 4: `deploy-renderer-production.sh` (line 5)

**What it does:** Deploys Remotion renderer to Cloud Run. **Not used in production (you're on AWS Lambda)** but left in repo.

**Current:**
```bash
PROJECT_ID="insturix-457914"
```

**Change to:**
```bash
PROJECT_ID="insturix-493414"
```

**Risk:** ZERO — script is dormant, only runs if explicitly invoked.

---

## File 5: `deploy-custom-renderer.sh` (line 5)

**Current:**
```bash
PROJECT_ID="insturix-dev" # Updated to dev project
```

**Change to:**
```bash
PROJECT_ID="insturix-dev-v2" # Updated to new dev project
```

**Risk:** ZERO — script is dormant.

---

## File 6: `setup-artifact-registry-prod.sh` (line 4)

**Current:**
```bash
PROJECT_ID="insturix-457914"
```

**Change to:**
```bash
PROJECT_ID="insturix-493414"
```

**Risk:** ZERO — script is dormant.

---

## Git Workflow

```bash
# Starting from main (or wherever you want the base to be)
git checkout main
git pull origin main

# Create migration branch
git checkout -b gcp-account-migration

# Apply the 6 file changes (I'll do this when you say go)

# Verify
npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "(socialize-gcs|migrate-gcs-to-r2)" || echo "No TS errors"

# Commit
git add lib/socialize-gcs.ts test-gcs.js scripts/migrate-gcs-to-r2.mjs \
        deploy-renderer-production.sh deploy-custom-renderer.sh \
        setup-artifact-registry-prod.sh

git commit -m "chore: update GCP project fallbacks for new account migration

- lib/socialize-gcs.ts: fallback chain now uses GOOGLE_CLOUD_PROJECT env
- test-gcs.js: use env var instead of hardcoded insturix-dev
- scripts/migrate-gcs-to-r2.mjs: update bucket fallback to insturix-v2
- deploy shell scripts: update project IDs to new account

These are defensive fallbacks only. Primary code paths use env vars.
Migration target: insturix-493414 (new account)
See migrations/gcp-account-switch/ for full runbook."

# Push and open PR
git push -u origin gcp-account-migration

# Open PR on GitHub, but DO NOT MERGE yet
# Wait until Vercel env vars updated + tests pass on preview
```

---

## DO NOT Merge Until

1. ✅ Phase 1 new GCP infrastructure complete (DONE)
2. ✅ OAuth Client created in `clerk-oauth-v2` (see `01-OAUTH-GUIDE.md`)
3. ✅ Data migrated from old buckets to new (see `02-DATA-MIGRATION.sh`)
4. ❌ Vercel preview env vars updated (see `04-VERCEL-ENV.md`)
5. ❌ Preview deploy succeeds with new account
6. ❌ Tests pass per `04-TESTING-PLAN.md`

Only then merge `gcp-account-migration` → `main`, which triggers production deploy.

**Even then, production deploy uses OLD Vercel env vars first. You update production env vars as a separate step (immediate swap) AFTER verifying preview.**

---

## Rollback

At any point:
- Branch not merged → just don't merge. Delete branch.
- Merged but prod env vars unchanged → production still uses old account via env vars. No impact.
- Prod env vars updated + broken → revert Vercel env vars to old values. Immediate recovery.
- Worst case → `git revert <migration-commit-sha>` and redeploy.
