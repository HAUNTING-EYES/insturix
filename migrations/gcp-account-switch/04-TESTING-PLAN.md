# 4️⃣ Testing Plan — Before Production Cutover

**Goal:** Validate new GCP account works 100% on preview BEFORE touching production env vars.

**Test environment:** Vercel preview deploy with new account env vars. Production untouched.

---

## Test Strategy Overview

```
┌────────────────────────────────────────────────────────────┐
│  Step 1: Update PREVIEW env vars only (not Production)     │
│          → Preview deploys use new account                 │
│          → Production still uses old account (safe)        │
├────────────────────────────────────────────────────────────┤
│  Step 2: Run test suite on preview URL                     │
│          → Every service tested end-to-end                 │
├────────────────────────────────────────────────────────────┤
│  Step 3: Manual smoke tests on preview                     │
│          → Real user flows (sign-in, upload, generate)     │
├────────────────────────────────────────────────────────────┤
│  Step 4: Monitor preview for 24-48 hours                   │
│          → Check Vercel logs for any GCP errors            │
├────────────────────────────────────────────────────────────┤
│  Step 5: Only after all green → production cutover         │
│          → Update production env vars + merge PR           │
└────────────────────────────────────────────────────────────┘
```

---

## Step 1: Preview Env Vars Update

**In Vercel Dashboard → Settings → Environment Variables:**

Change these ONLY in the "Preview" environment (NOT Production):

| Variable | New Preview Value |
|----------|------------------|
| `GOOGLE_CLOUD_PROJECT` | `insturix-preview-v2` |
| `GOOGLE_CLOUD_PROJECT_ID` | `insturix-preview-v2` |
| `GOOGLE_CLOUD_CREDENTIALS` | base64 of `insturix-preview-sa-key.json` (see secrets/ folder) |
| `GCS_BUCKET_NAME` | `insturix-prev-gcs-v2` |
| `ALYZITRON_GCS_BUCKET_NAME` | `alyzitron-uploads-v2` |
| `MUSITRON_GCS_BUCKET_NAME` | `musitron-v2` |
| `GCS_BUCKET_NAME_MUSITRON` | `musitron-v2` |
| `GEMINI_API_KEY` | `AIzaSyA5vFtuZCM9Lu8VE3_d5C11qZKbrLwbO34` |
| `GOOGLE_API_KEY` | `AIzaSyA5vFtuZCM9Lu8VE3_d5C11qZKbrLwbO34` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | `AIzaSyA5vFtuZCM9Lu8VE3_d5C11qZKbrLwbO34` |
| `YOUTUBE_API_KEY` | `AIzaSyCQ4wc6egSLGJmr6iVrf2DKvxUZ3KEsPg0` |

**Then trigger a new preview deploy** (push to branch or redeploy existing).

---

## Step 2: Automated Checks

```bash
# Type-check passes
npx tsc --noEmit --skipLibCheck

# ESLint clean (if configured)
npx eslint . --quiet
```

Expected: Zero new errors. Existing errors in non-migration files are not a blocker.

---

## Step 3: Smoke Tests Per Service

### 3.1 — Clerk Google Sign-In ⚠️ CRITICAL

**Why critical:** If OAuth is broken, users can't log in.

Test on preview:
1. Open preview URL in incognito
2. Click "Sign in with Google"
3. Select a test Google account
4. **Expected:** Signed in successfully

**If broken:**
- Check Clerk Dashboard: Social Connections → Google → Client ID should be new one
- Check new OAuth consent screen allows this Google account (if in Testing mode, add to Test Users)
- Revert Clerk to old credentials → immediate recovery

---

### 3.2 — GCS Read/Write (Editron)

1. Log into preview URL
2. Go to Editron → create new project
3. Upload a test media file (small image or video)
4. **Expected:**
   - File uploads without error
   - Thumbnail displays
   - Check GCP Console: file appears in `gs://insturix-prev-gcs-v2` (not old bucket)

**Debug checklist:**
- If 403 Forbidden → service account missing IAM
- If 404 Not Found → bucket name mismatch
- If CORS error → CORS config missing

---

### 3.3 — GCS Signed URLs (all services)

Test each service that uses signed URLs:

| Service | Test |
|---------|------|
| Editron | Open an existing project (with old data migrated) → media should load |
| Clickatron | Generate a thumbnail variation → image should appear |
| Musitron | Generate music → playback should work |
| Alyzitron | Upload a video → should validate and display |
| Socialize | Upload a banner → should display |

**All should work.** Check browser DevTools Network tab for any 403/404 on signed URLs.

---

### 3.4 — Gemini AI Calls (Editron, ThinkForge)

1. Editron → AI chat → ask a simple question
2. **Expected:** Chat responds. Uses new Gemini key.

3. ThinkForge → Start new research session
4. **Expected:** Research agent returns with sources.

**Debug:**
- 401/403 on `generativelanguage.googleapis.com` → new API key wrong or not propagated
- Rate limit errors → individual account has lower quota, may need to wait or request increase
- Check Vercel function logs

---

### 3.5 — Vertex AI (Alyzitron video analysis)

1. Alyzitron → upload a test video
2. **Expected:** Analysis completes with structured output

**Debug:**
- 403 → service account missing Vertex AI User role
- 404 on `gs://` URI → bucket name mismatch in env

---

### 3.6 — YouTube API (Alyzitron)

1. Alyzitron → paste a YouTube URL
2. **Expected:** Video validates (title, duration, thumbnail loads)

**Debug:**
- 400/401 → YouTube API key invalid or API not enabled
- 403 → API key restrictions don't match

---

### 3.7 — End-to-End Pipeline (Editron full flow)

**The big test.** Runs through entire pipeline:

1. ThinkForge → create a short script (1-2 scenes)
2. Export to Editron → pipeline runs
3. Wait for: storyboard generation → video generation → voiceover → BGM/SFX → finalize
4. **Expected:** Completed Editron project opens, all assets resolve

**This tests:**
- Gemini API (scene parsing)
- GCS (storyboard + video upload)
- fal.ai (external AI inference)
- QStash (async workers)
- Signed URL refresh

---

### 3.8 — Existing Data (Migrated Content)

Critical: users with old content should see it still.

1. Sign in as a test user who had content before migration
2. Open an old Editron project
3. **Expected:** All media loads correctly
   - If not: MongoDB URLs still point at old buckets
   - Fix: Run MongoDB URL rewrite script

---

## Step 4: Monitoring (24-48 hours)

Watch Vercel function logs for:
- ❌ `Permission denied` errors (IAM issue)
- ❌ `Invalid project` errors (wrong project ID)
- ❌ `bucket not found` (bucket name mismatch)
- ❌ `Quota exceeded` (API rate limits)
- ❌ `invalid_grant` (bad credentials)

Set up a filter: `Permission\|Forbidden\|invalid_grant\|bucket not found`

---

## Step 5: Production Cutover

Only after ALL above are green:

### 5.1 Pre-cutover
- [ ] Preview stable for 24+ hours
- [ ] All manual tests pass
- [ ] Zero errors in Vercel logs
- [ ] MongoDB URL rewrite run (if needed)

### 5.2 Cutover (Vercel Dashboard)
Update PRODUCTION env vars (same list as preview but with prod values):

| Variable | New Production Value |
|----------|---------------------|
| `GOOGLE_CLOUD_PROJECT` | `insturix-493414` |
| `GOOGLE_CLOUD_CREDENTIALS` | base64 of `insturix-prod-sa-key.json` |
| `GCS_BUCKET_NAME` | `insturix-v2` |
| (same as preview for API keys, bucket names) | (same) |

### 5.3 Deploy
- Merge `gcp-account-migration` branch → main
- Production auto-deploys
- **Watch Vercel logs closely for the first 15 minutes**

### 5.4 Validation
Repeat Step 3 tests on production URL (quickly — main flows only).

---

## Rollback at Any Point

| Stage | Rollback |
|-------|----------|
| Preview env vars break things | Revert Vercel preview env vars to old values → redeploy preview |
| Preview works, you're not ready | Do nothing. Production still fine. |
| Production cutover breaks things | Revert production env vars to old values → immediate recovery (1-2 min) |
| Code merged but broken | `git revert <commit>` → push → redeploy |

---

## Acceptance Criteria Before Declaring "Done"

- [ ] 24+ hours production stable on new account
- [ ] Zero new error types in Vercel logs
- [ ] All 6 services (Editron, ThinkForge, Clickatron, Alyzitron, Musitron, Socialize) working
- [ ] Google sign-in works for new users
- [ ] Old users' existing content still accessible
- [ ] New uploads go to new buckets
- [ ] Rendering pipeline completes end-to-end

---

## 2-Week Stabilization Period

Before decommissioning old account:
- [ ] Production stable for 14 days
- [ ] No new GCP-related tickets from users
- [ ] Billing reports match expected usage on new account

Only THEN:
- Delete old service account keys
- Delete old GCS buckets
- Revoke old API keys
- Close old billing account
