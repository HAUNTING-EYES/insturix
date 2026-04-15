# Code Changes for GCP Account Migration

**Approach:** Make code changes surgical. Keep dead fallbacks out of production paths.

**5 files to change. Total lines touched: ~12.**

---

## File 1: `lib/socialize-gcs.ts` (line 26)

**Current:**
```typescript
projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || 'insturix-dev',
```

**Change to:**
```typescript
projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'insturix-493414',
```

**Why:** Fallback hardcodes `insturix-dev` which no longer exists. Use env var chain with new project as last resort.

---

## File 2: `test-gcs.js` (line 10)

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

**Why:** Test script, non-production, but should use new project.

---

## File 3: `scripts/migrate-gcs-to-r2.mjs` (line 62)

**Current:**
```javascript
const GCS_BUCKET = env.GCS_BUCKET_NAME || 'insturix';
```

**Change to:**
```javascript
const GCS_BUCKET = env.GCS_BUCKET_NAME || 'insturix-v2';
```

**Why:** Fallback pointed at old bucket. Update to new bucket name.

---

## File 4: `deploy-renderer-production.sh` (line 5)

**Current:**
```bash
PROJECT_ID="insturix-457914"
```

**Change to:**
```bash
PROJECT_ID="insturix-493414"
```

**Note:** Only change this IF you're deploying to the Cloud Run renderer. If you're using AWS Lambda (REMOTION_LAMBDA_FUNCTION_NAME), this script is unused and can be left or deleted.

---

## File 5: `deploy-custom-renderer.sh` (line 5)

**Current:**
```bash
PROJECT_ID="insturix-dev" # Updated to dev project
```

**Change to:**
```bash
PROJECT_ID="insturix-493414"
```

**Same note as File 4** — unused if on Lambda.

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

**Same note** — unused if on Lambda.

---

## OPTIONAL: `scripts/configure-gcs-cors.js` (no change needed)

The CORS config is now applied by `phase-1-gcloud-setup.sh` directly. This script still works if you need to reapply CORS in the future (reads `GOOGLE_CLOUD_CREDENTIALS` from env — already account-agnostic).

**No change required.**

---

## Verification After Changes

Run these from project root:

```bash
# Search for any remaining references to old project
grep -r "insturix-457914" . --include="*.ts" --include="*.tsx" --include="*.js" --include="*.mjs" --include="*.sh" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=migrations

# Should return ZERO results after changes applied

grep -r "insturix-dev" . --include="*.ts" --include="*.tsx" --include="*.js" --include="*.mjs" --include="*.sh" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=migrations

# Should return ZERO results after changes applied

grep -r "insturix-preview" . --include="*.ts" --include="*.tsx" --include="*.js" --include="*.mjs" --include="*.sh" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=migrations --exclude-dir=.git

# Should return ZERO results after changes applied
```

Then:
```bash
npx tsc --noEmit
```

Should pass with no new errors.

---

## Commit Strategy

One commit for all 6 code changes:

```bash
git add lib/socialize-gcs.ts test-gcs.js scripts/migrate-gcs-to-r2.mjs \
        deploy-renderer-production.sh deploy-custom-renderer.sh \
        setup-artifact-registry-prod.sh migrations/

git commit -m "chore: migrate to new GCP account insturix-493414

- Update hardcoded project ID fallbacks (5 files)
- Add migration runbook in migrations/gcp-account-switch/
- Update new bucket name fallback in migrate-gcs-to-r2.mjs

Vercel env vars updated separately. See migrations/gcp-account-switch/
for full runbook."
```
