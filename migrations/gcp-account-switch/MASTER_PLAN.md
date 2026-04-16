# GCP Migration — Master Plan

**Everything you need, in one document.**

---

## 📍 Current State (What's Actually True)

### Storage breakdown — as of today (main branch)

| Service | Where files are stored | How |
|---------|----------------------|-----|
| **Editron** (user uploads) | **Cloudflare R2** | Via `lib/editron/services/r2-service.ts` + unified `upload-service` |
| **Editron** (rendered videos) | AWS S3 | Remotion Lambda output |
| **Pipeline** (storyboards, videos, TTS, BGM, SFX) | **Cloudflare R2** | Via `upload-service` |
| **Clickatron** (thumbnails, AI images) | **Google Cloud Storage** | `lib/clickatron-gcs.ts` |
| **Alyzitron** (video analysis uploads) | **Google Cloud Storage** | `app/api/services/alyzitron/utils/gcs.ts` — needs `gs://` for Vertex AI |
| **Musitron** (generated music) | **Google Cloud Storage** | `app/api/services/musitron/processor/route.ts` |
| **Socialize** (banners) | **Google Cloud Storage** | `lib/socialize-gcs.ts` |

**Translation:** R2 migration is ~60% done. Editron + Pipeline are on R2. Clickatron + Alyzitron + Musitron + Socialize still on GCS.

### What still requires GCP (hard dependencies)

1. **Gemini API** — the entire AI brain (20+ files)
2. **Vertex AI** — Alyzitron uses it for video analysis (1 file, needs `gs://` URIs)
3. **YouTube Data API** — Alyzitron validates YouTube URLs (2 files)
4. **GCS** — 4 services still use it (see table above)

### What does NOT require GCP (already independent)

- Auth (Clerk), Database (MongoDB Atlas), Payments (Razorpay)
- Rendering (AWS Lambda), Email (AWS SES)
- Queues (Upstash QStash), Cache (Upstash Redis)
- AI inference (fal.ai), Speech (Deepgram), Stock (Pexels)
- Firebase (config exists but SDK never imported — dead)
- Pub/Sub (topics configured but SDK never imported — dead)

---

## 🛣️ Two Plans

You have two migrations to do, in order:

- **PLAN A (NOW):** Switch from business GCP account `insturix-457914` → individual account `insturix-493414`
- **PLAN B (LATER):** After stability, move remaining 4 services off GCS → R2. Keep only Gemini + Vertex + YouTube API keys on GCP.

---

# PLAN A — Switch GCP Account

**Target:** Replicate current GCP infrastructure on new individual account `insturix-493414`.
**Total time:** 1-2 days of active work + 1 week monitoring.
**Risk level:** LOW (rollback is just flipping Vercel env vars back).

## A.1 — The Path (6 Steps)

```
┌──────────────────────────────────────────────────────────────┐
│  STEP 1: Create GCP infrastructure on new account             │
│    → Run phase-1-gcloud-setup.sh                              │
│    → Creates buckets, service account, enables APIs           │
│    → ~10 minutes                                              │
├──────────────────────────────────────────────────────────────┤
│  STEP 2: Generate API keys                                    │
│    → Download service account JSON, base64-encode it          │
│    → Create Gemini API key in AI Studio                       │
│    → Create YouTube Data API key in Console                   │
│    → ~10 minutes                                              │
├──────────────────────────────────────────────────────────────┤
│  STEP 3: Migrate data between buckets                         │
│    → Run phase-3-data-migration.sh                            │
│    → Copies all files from old buckets to new buckets         │
│    → ~30 min - several hours depending on data size           │
├──────────────────────────────────────────────────────────────┤
│  STEP 4: Update Vercel environment variables                  │
│    → Update ~11 critical env vars in Production + Preview     │
│    → See vercel-env-checklist.md                              │
│    → ~15 minutes                                              │
├──────────────────────────────────────────────────────────────┤
│  STEP 5: Apply code changes                                   │
│    → 6 files with hardcoded project IDs                       │
│    → See code-changes.md                                      │
│    → ~10 minutes                                              │
├──────────────────────────────────────────────────────────────┤
│  STEP 6: Deploy + verify + MongoDB URL rewrite                │
│    → Deploy to preview, test thoroughly                       │
│    → Run phase-6-mongodb-url-rewrite.mjs if needed            │
│    → Deploy to production                                     │
│    → ~1 day of monitoring                                     │
└──────────────────────────────────────────────────────────────┘

    Then wait 2 weeks. If stable: decommission old account.
```

## A.2 — What Gets Changed

### Infrastructure (on new GCP account)
- 4 new GCS buckets: `insturix-v2`, `insturix-prev-gcs-v2`, `alyzitron-uploads-v2`, `musitron-v2`
- 1 service account: `insturix-frontend@insturix-493414.iam.gserviceaccount.com`
- 3 IAM roles granted to service account
- 8 APIs enabled
- CORS configured on all buckets

### Env vars (in Vercel dashboard, both Production + Preview)

**Change these ~11 vars:**
- `GOOGLE_CLOUD_CREDENTIALS` → new base64 service account key
- `GOOGLE_CLOUD_PROJECT` → `insturix-493414`
- `GOOGLE_CLOUD_PROJECT_ID` → `insturix-493414`
- `GCS_BUCKET_NAME` → `insturix-v2` (or `insturix-prev-gcs-v2` for preview)
- `ALYZITRON_GCS_BUCKET_NAME` → `alyzitron-uploads-v2`
- `MUSITRON_GCS_BUCKET_NAME` → `musitron-v2`
- `GCS_BUCKET_NAME_MUSITRON` → `musitron-v2`
- `GEMINI_API_KEY` → new key from AI Studio
- `GOOGLE_API_KEY` → same as GEMINI_API_KEY
- `GOOGLE_GENERATIVE_AI_API_KEY` → same as GEMINI_API_KEY
- `YOUTUBE_API_KEY` → new key from Console

**Can delete (dead config, not used in code):**
- All `NEXT_PUBLIC_FIREBASE_*` vars (Firebase SDK never imported)
- All `*_PUBSUB_TOPIC` vars (Pub/Sub SDK never imported)
- `REMOTION_CLOUDRUN_URL` (you use AWS Lambda, not Cloud Run)

**Do NOT touch:**
- MongoDB, Clerk, AWS, Upstash, Razorpay, fal.ai, Deepgram, Pexels vars

### Source code (6 files, ~12 lines total)

1. `lib/socialize-gcs.ts` line 26 — update fallback project ID
2. `test-gcs.js` line 10 — update fallback project ID
3. `scripts/migrate-gcs-to-r2.mjs` line 62 — update fallback bucket name
4. `deploy-renderer-production.sh` line 5 — update project ID (unused since you're on Lambda, optional)
5. `deploy-custom-renderer.sh` line 5 — update project ID (unused, optional)
6. `setup-artifact-registry-prod.sh` line 4 — update project ID (unused, optional)

### Data migration

Old buckets (on old account) → New buckets (on new account):
- `insturix` → `insturix-v2` (Clickatron, Socialize main files)
- `insturix-prev-gcs` → `insturix-prev-gcs-v2` (preview files)
- `alyzitron-uploads` → `alyzitron-uploads-v2` (Alyzitron video uploads)
- `musitron` → `musitron-v2` (generated music)

### MongoDB

Some documents have hardcoded old GCS URLs stored. Phase-6 script rewrites them to new bucket URLs. Creates backups before writing.

## A.3 — What I Need From You Before Running

- [x] New project ID: `insturix-493414` ✅ (you gave me)
- [x] Project number: `687396053572` ✅ (you gave me)
- [x] gcloud CLI installed ✅ (you said yes)
- [ ] gcloud CLI authenticated to new account (`gcloud auth login`, then `gcloud config set project insturix-493414`)
- [ ] Billing linked to new project in GCP Console
- [ ] You execute Phase 1 script

## A.4 — Rollback Plan

At any point before Phase 8 (decommission old account):

| Problem | Fix |
|---------|-----|
| Phase 1 fails | Retry. Script is idempotent (skips existing resources). |
| Data migration fails | Re-run — `gcloud storage cp` skips identical files. |
| Deploy breaks | Revert Vercel env vars to old values → redeploy. |
| MongoDB rewrite broke something | Script creates backup collections — restore from them. |
| Production on fire | Flip Vercel env vars back to old GCP account. Old buckets still exist for 2 weeks. |

---

# PLAN B — Full GCP Exit (Later)

**Target:** Move remaining services (Clickatron, Musitron, Socialize) to R2. Alyzitron special-cased. GCP reduced to just API keys.
**Total time:** 5-7 days of development + 1 week testing.
**Timing:** Do this AFTER Plan A is stable for 2+ weeks.

## B.1 — The Path

```
┌──────────────────────────────────────────────────────────────┐
│  STEP 1: Migrate Clickatron to R2                             │
│    → Replace lib/clickatron-gcs.ts with R2-backed version     │
│    → Copy existing files: GCS → R2                            │
│    → Test Clickatron image gen + edit flows                   │
│    → ~1 day                                                   │
├──────────────────────────────────────────────────────────────┤
│  STEP 2: Migrate Musitron to R2                               │
│    → Replace GCS calls in musitron/processor/route.ts         │
│    → Copy existing music files: GCS → R2                      │
│    → Test music generation + playback                         │
│    → ~1 day                                                   │
├──────────────────────────────────────────────────────────────┤
│  STEP 3: Migrate Socialize to R2                              │
│    → Replace lib/socialize-gcs.ts                             │
│    → Copy existing banners: GCS → R2                          │
│    → Test banner upload                                       │
│    → ~0.5 day                                                 │
├──────────────────────────────────────────────────────────────┤
│  STEP 4: Update frontend URL pattern checks                   │
│    → ~10 files check for 'storage.googleapis.com'             │
│    → Update to check R2 URL pattern                           │
│    → ~0.5 day                                                 │
├──────────────────────────────────────────────────────────────┤
│  STEP 5: Fix Alyzitron special case                           │
│    → Vertex AI requires gs:// URIs, won't read R2             │
│    → Option 1 (RECOMMENDED): Switch Alyzitron to Gemini       │
│      Files API (same pattern as five-track-analysis.ts)       │
│    → Option 2: Keep tiny GCS bucket just for Alyzitron        │
│      (upload → analyze → delete, no long-term storage)        │
│    → ~1 day                                                   │
├──────────────────────────────────────────────────────────────┤
│  STEP 6: Decommission GCS buckets                             │
│    → Verify all services working on R2                        │
│    → Delete GCS buckets (saves storage cost)                  │
│    → Revoke GCS service account permissions                   │
│    → ~0.5 day                                                 │
└──────────────────────────────────────────────────────────────┘
```

## B.2 — What Stays on GCP After Plan B

The absolute minimum — just three API keys:
- `GEMINI_API_KEY` (for Gemini AI via `generativelanguage.googleapis.com`)
- `GOOGLE_CLOUD_CREDENTIALS` (ONLY for Vertex AI — if you keep it for Alyzitron)
- `YOUTUBE_API_KEY` (for YouTube Data API)

No GCS buckets. No Pub/Sub. No Firebase. No Cloud Run. Just API keys.

## B.3 — Expected Savings (Plan B)

Based on [Vantage's GCS vs R2 comparison](https://www.vantage.sh/blog/gcs-vs-r2-cost):

| Traffic | GCS cost/month | R2 cost/month | Savings |
|---------|---------------|---------------|---------|
| 1 TB egress | ~$363 | ~$168 | ~$195 |
| 5 TB egress | ~$1,020 | ~$168 | ~$850 |
| 10 TB egress | ~$1,200 + storage | ~$168 | ~$1,000+ |

**R2 has zero egress fees.** GCS charges $0.12/GB after the first few GB. Since you're a video platform (high egress), this is meaningful money.

## B.4 — Blockers / Challenges for Plan B

1. **Vertex AI `gs://` requirement** — solved by switching Alyzitron to Gemini Files API
2. **Existing MongoDB URLs point at GCS** — same phase-6 script pattern, rewrite to R2 URLs
3. **Frontend URL pattern matching** — update ~10 files that hard-code `storage.googleapis.com` checks
4. **CORS quirk on R2** — per Cloudflare docs, `AllowedHeaders` can't be `*`, must list specific headers (you already have this working for Editron)
5. **Signed URL domain change** — R2 signed URLs come from `<ACCOUNT_ID>.r2.cloudflarestorage.com`, not custom domain

---

# Cloud Run — What Is It?

**Cloud Run** is GCP's serverless container platform. You push a Docker image, it runs it on demand, scales to zero when idle.

## In Your Codebase

- `deploy-renderer-production.sh` deploys a **Remotion renderer** to Cloud Run
- `REMOTION_CLOUDRUN_URL` env var points at it
- The Docker image lives in Artifact Registry (a GCP service)

## Is It Used?

**No — you're on AWS Lambda for rendering.** From `app/api/services/editron/cloudrun/render/route.ts`:
```typescript
// AWS Lambda configuration from environment
const functionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME;
```

Despite the file being named `cloudrun/render/route.ts`, the actual code uses **Remotion Lambda** (AWS). The Cloud Run setup was an alternative path that's not active.

## Action Required

**None.** You can:
- Ignore the 3 Cloud Run deploy scripts (they're unused)
- Delete `REMOTION_CLOUDRUN_URL` env var (unused)
- Optionally delete the deploy scripts entirely

Cloud Run is **not** a blocker for your migration.

---

# Alyzitron Status — Is It Still Using GCS `gs://` URIs?

**Yes.** I checked `main` branch: `app/api/services/alyzitron/analyze/route.ts` still has:

```typescript
function getGcsUrl(gcsPath: string): string {
  const bucketName = process.env.GCS_BUCKET_NAME;
  return `gs://${bucketName}/${gcsPath}`;
}
```

And it imports `GCSManager` from `../utils/gcs`. **Alyzitron was NOT migrated to R2.**

## Why Alyzitron Is Special

Vertex AI's `fileUri` field expects `gs://bucket/path`. It cannot read from:
- Public HTTP URLs from R2
- S3 URLs
- Any non-GCS source

To migrate Alyzitron off GCS, you have to stop using Vertex AI and switch to **Gemini Files API** — upload video to Gemini's own file storage, get a `files/xxx` URI, pass that. This is already how `lib/editron/services/five-track-analysis.ts` handles video analysis.

## Impact for Plan A (GCP account switch)

**Zero impact.** Alyzitron keeps using GCS, just pointed at new bucket `alyzitron-uploads-v2` on new account. Vertex AI on new account reads `gs://alyzitron-uploads-v2/...` same as before.

## Impact for Plan B (full GCP exit)

**Medium impact.** You need to rewrite `app/api/services/alyzitron/analyze/route.ts` to use Gemini Files API instead of Vertex AI. Same quality analysis, different file upload path.

---

# Timeline Recommendation

```
WEEK 1 (THIS WEEK):  Plan A — GCP account switch
  Mon-Tue:  Phase 1-2 (setup, keys)
  Wed:      Phase 3 (data migration)
  Thu:      Phase 4-5 (env vars + code changes, deploy to preview)
  Fri:      Phase 6 + testing
  Weekend:  Deploy to production Friday evening or Monday morning

WEEK 2-3:  MONITOR
  Watch production. Fix any issues.
  Keep old GCP account active as backup.

WEEK 4:    Decommission old account (Phase 8)
  Delete old buckets, revoke old keys, close old billing.

WEEK 5-6:  Plan B (optional, whenever ready)
  Migrate Clickatron/Musitron/Socialize to R2.
  Switch Alyzitron to Gemini Files API.
  Delete remaining GCS buckets.
```

---

# Files In This Migration Folder

| File | Purpose | When to use |
|------|---------|-------------|
| `MASTER_PLAN.md` | **This file.** Start here. | Read first |
| `README.md` | Original runbook overview | Reference |
| `phase-1-gcloud-setup.sh` | Creates new GCP infra | Step 1 of Plan A |
| `phase-3-data-migration.sh` | Copies data between accounts | Step 3 of Plan A |
| `phase-6-mongodb-url-rewrite.mjs` | Rewrites stored URLs | Step 6 of Plan A |
| `vercel-env-checklist.md` | Env var updates | Step 4 of Plan A |
| `code-changes.md` | Source code changes | Step 5 of Plan A |
| `verification-checklist.md` | Post-deploy tests | After Step 6 of Plan A |
| `troubleshooting.md` | Common errors + fixes | When things break |

---

# TL;DR — What You Do Right Now

```bash
# 1. Authenticate gcloud to new account
gcloud auth login
gcloud config set project insturix-493414

# 2. Link billing to new project (via Console)
# https://console.cloud.google.com/billing?project=insturix-493414

# 3. Run Phase 1 setup
cd "D:/google downloads/Front-End-main/Front-End-main"
bash migrations/gcp-account-switch/phase-1-gcloud-setup.sh

# 4. Generate service account key (command printed at end of Phase 1)
gcloud iam service-accounts keys create insturix-prod-sa-key.json \
  --iam-account=insturix-frontend@insturix-493414.iam.gserviceaccount.com

# 5. Get Gemini API key: https://aistudio.google.com/apikey
# 6. Get YouTube API key: https://console.cloud.google.com/apis/credentials?project=insturix-493414
# 7. Tell me the keys — I'll handle the rest
```

**Then report back with:**
- Confirmation Phase 1 succeeded
- Base64-encoded service account key
- New Gemini API key
- New YouTube API key

I'll then do the code changes + guide the Vercel updates + trigger data migration.
