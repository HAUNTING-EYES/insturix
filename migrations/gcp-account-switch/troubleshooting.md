# Migration Troubleshooting Guide

Common issues you'll hit during the migration, with exact fixes.

---

## Phase 1 (GCP Setup) Issues

### ❌ `ERROR: (gcloud) ... Billing account ... is required`
**Cause:** New project doesn't have billing enabled.
**Fix:** GCP Console → Billing → Link a billing account → select your new project.

### ❌ `ERROR: Permission 'storage.buckets.create' denied`
**Cause:** Your user doesn't have Storage Admin on the project.
**Fix:**
```bash
gcloud projects add-iam-policy-binding insturix-493414 \
  --member="user:YOUR_EMAIL@gmail.com" \
  --role="roles/storage.admin"
```

### ❌ `The resource project was not found`
**Cause:** You're authenticated with wrong account.
**Fix:**
```bash
gcloud auth list                          # see active account
gcloud auth login                         # authenticate the right one
gcloud config set project insturix-493414
```

### ❌ `ERROR: (gcloud.services.enable) The caller does not have permission`
**Cause:** Need to be project owner or have serviceusage.services.enable permission.
**Fix:** On individual accounts, you should be owner by default. Check you're on the right account.

---

## Phase 3 (Data Migration) Issues

### ❌ `AccessDeniedException: 403` when reading old bucket
**Cause:** Authenticated with new-account credentials that have no access to old project.
**Fix:** Use a Google account that has viewer/owner on BOTH projects. OR run migration in two passes:
```bash
# Pass 1 (authenticated to old account): download to local
gcloud storage cp --recursive "gs://insturix/*" ./local-backup/insturix/ --project=insturix-457914

# Pass 2 (authenticated to new account): upload from local
gcloud storage cp --recursive "./local-backup/insturix/*" "gs://insturix-v2/" --project=insturix-493414
```

### ❌ `Bucket name not available`
**Cause:** Someone else grabbed the bucket name globally (rare for suffixed names).
**Fix:** Use different suffix: `insturix-v3`, `insturix-prod-2026`, etc.

### ⚠️ Object counts don't match after migration
**Cause:** Files added during migration, network interruption, etc.
**Fix:** Re-run the `gcloud storage cp` — it skips existing identical files, only copies missing/changed ones (it's safe to re-run).

---

## Phase 4 (Vercel Env Vars) Issues

### ❌ Deploy fails: `GOOGLE_CLOUD_CREDENTIALS environment variable is not set`
**Cause:** Env var not applied to the right environment.
**Fix:** Vercel dashboard → Settings → Environment Variables → ensure vars are applied to BOTH "Production" and "Preview" scope.

### ❌ Runtime error: `invalid_grant: Invalid JWT Signature`
**Cause:** Base64-encoded credentials are corrupted (likely has newlines).
**Fix:** Regenerate:
```bash
# Windows Git Bash:
base64 -w 0 insturix-prod-sa-key.json
# The -w 0 is CRITICAL — prevents line wrapping
```

### ❌ Runtime error: `Permission 'iam.serviceAccounts.signBlob' denied`
**Cause:** Service account missing `roles/iam.serviceAccountTokenCreator`.
**Fix:**
```bash
gcloud projects add-iam-policy-binding insturix-493414 \
  --member="serviceAccount:insturix-frontend@insturix-493414.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator"
```

---

## Phase 5 (Code Deploy) Issues

### ❌ TypeScript errors after code changes
**Fix:** Run:
```bash
npx tsc --noEmit
```
If errors mention `insturix-dev` or `insturix-457914`, search for remaining hardcoded references:
```bash
grep -rn "insturix-457914\|insturix-dev\|insturix-preview" \
  --include="*.ts" --include="*.tsx" --include="*.js" \
  --exclude-dir=node_modules --exclude-dir=.next
```

### ❌ Build fails on Vercel: Module not found '@google-cloud/storage'
**Cause:** `node_modules` mismatch or package-lock drift.
**Fix:**
```bash
rm -rf node_modules package-lock.json
npm install
```
Commit the new `package-lock.json` and redeploy.

---

## Phase 6 (MongoDB Rewrite) Issues

### ❌ `MongoServerError: Authentication failed`
**Cause:** `MONGODB_URI` env var not set or wrong password.
**Fix:**
```bash
export MONGODB_URI="mongodb+srv://admin:PASSWORD@main-cluster..."
node phase-6-mongodb-url-rewrite.mjs
```

### ❌ `Cannot find module 'mongodb'`
**Cause:** Script run outside project root.
**Fix:**
```bash
cd "D:/google downloads/Front-End-main/Front-End-main"
node migrations/gcp-account-switch/phase-6-mongodb-url-rewrite.mjs
```

### ⚠️ Dry run shows 0 changes but users report broken URLs
**Cause:** Collection names in `COLLECTIONS_TO_SCAN` don't match actual DB collection names.
**Fix:** List actual collections:
```bash
# Connect to MongoDB Atlas
mongosh "$MONGODB_URI"
use insturix_prod
show collections
```
Add missing collection names to the script's `COLLECTIONS_TO_SCAN` array.

---

## Runtime Issues (After Deploy)

### ❌ Images/videos show 404 in browser
**Check:**
1. Open Network tab → inspect the failing URL
2. If URL contains `insturix-457914` or old bucket name → Vercel env vars not updated
3. If URL contains new bucket name but 404 → file not migrated to new bucket (re-run Phase 3)
4. If URL contains new bucket name but 403 → service account missing `roles/storage.objectAdmin`

### ❌ Signed URLs return CORS errors in browser
**Cause:** CORS not applied to new bucket, or origin not in allowed list.
**Fix:** Re-run `scripts/configure-gcs-cors.js` with proper env vars set:
```bash
export GOOGLE_CLOUD_CREDENTIALS="base64..."
export GCS_BUCKET_NAME="insturix-v2"
node scripts/configure-gcs-cors.js
```

### ❌ Gemini API returns `429 Too Many Requests`
**Cause:** Individual accounts have lower quota limits by default.
**Fix:** GCP Console → APIs → Generative Language API → Quotas → request increase. Usually approved within hours.

### ❌ Old Editron projects show broken media
**Cause:** Stored GCS URLs in MongoDB point at old bucket, and asset-resolver refresh only works if file path is correct.
**Fix:** Run Phase 6 MongoDB rewrite script with `--apply`.

---

## Emergency Rollback

If anything is seriously broken in production:

1. **Vercel env vars:** Change values back to old GCP account credentials. Takes effect on next deploy.
2. **Force redeploy:** Vercel Dashboard → Deployments → redeploy last-known-good.
3. **Code:** `git revert <migration-commit-sha>` and push.

Old GCP account is still active during migration — this is why we don't decommission until Phase H (2 weeks later).

---

## Quick Debug Commands

```bash
# Check which GCP account is active
gcloud auth list

# Check current project
gcloud config get-value project

# Test bucket access
gcloud storage ls gs://insturix-v2/

# Test service account
gcloud iam service-accounts describe insturix-frontend@insturix-493414.iam.gserviceaccount.com

# Test Vertex AI endpoint
gcloud ai-platform models list --region=us-central1

# View recent Vercel logs
vercel logs --prod --follow

# Search codebase for any remaining old references
grep -rn "insturix-457914\|insturix-dev" --include="*.{ts,tsx,js,mjs,sh,json}" \
  --exclude-dir={node_modules,.next,.git,migrations} .
```
