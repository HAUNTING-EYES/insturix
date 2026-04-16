# Vercel Environment Variable Update Checklist

**Go to:** Vercel Dashboard → Your Project → Settings → Environment Variables

Update each variable **in both Production AND Preview environments**.

---

## CRITICAL — GCP Account-Specific (22 vars per environment)

### Production Environment

| Variable | Old Value | New Value |
|----------|-----------|-----------|
| `GOOGLE_CLOUD_PROJECT` | `insturix-457914` | `insturix-493414` |
| `GOOGLE_CLOUD_PROJECT_ID` | `insturix-457914` | `insturix-493414` |
| `GOOGLE_CLOUD_CREDENTIALS` | (old base64 JSON) | **NEW base64 of `insturix-prod-sa-key.json`** |
| `GCS_BUCKET_NAME` | `insturix` | `insturix-v2` |
| `ALYZITRON_GCS_BUCKET_NAME` | `alyzitron-uploads` | `alyzitron-uploads-v2` |
| `MUSITRON_GCS_BUCKET_NAME` | `musitron` | `musitron-v2` |
| `GCS_BUCKET_NAME_MUSITRON` | `musitron` | `musitron-v2` |
| `GEMINI_API_KEY` | `AIzaSyCcmEc6S0UEyG6wQ1Ou00OFwcRlmjSzJi8` | **New key from aistudio.google.com** |
| `GOOGLE_API_KEY` | (same as GEMINI_API_KEY) | **New key (can be same as GEMINI_API_KEY)** |
| `GOOGLE_GENERATIVE_AI_API_KEY` | (same as GEMINI_API_KEY) | **New key (can be same)** |
| `YOUTUBE_API_KEY` | `AIzaSyCcmEc6S0UEyG6wQ1Ou00OFwcRlmjSzJi8` | **New key from console.cloud.google.com** |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `AIzaSyCDHCQEA_tuHfAqoh7bVHb86rj3f_MTpRI` | **DEAD — can delete OR set to empty** |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:117721890474:web:ef418381bd66b143b09ad3` | **DEAD — can delete** |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `insturix-457914.firebaseapp.com` | **DEAD — can delete** |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | `G-XL6P8VYF6S` | **DEAD — can delete** |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `117721890474` | **DEAD — can delete** |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `insturix-457914` | **DEAD — can delete** |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `insturix-457914.firebasestorage.app` | **DEAD — can delete** |
| `REMOTION_CLOUDRUN_URL` | `https://remotion-renderer-117721890474.us-central1.run.app` | **DEAD if using AWS Lambda — can delete** |
| `ALYZITRON_PUBSUB_TOPIC` | `alyzitron-analysis-requests` | **DEAD — can delete (not used in code)** |
| `CLICKATRON_PUBSUB_TOPIC` | `clickatron-thumbnailgen-tasks` | **DEAD — can delete** |
| `EDITRON_PUBSUB_TOPIC` | `editron-tasks` | **DEAD — can delete** |
| `MUSITRON_PUBSUB_TOPIC` | `musitron-tasks` | **DEAD — can delete** |
| `SHIELD_PUBSUB_TOPIC` | `shield-tasks` | **DEAD — can delete** |
| `SOCIALIZE_PUBSUB_TOPIC` | `socialize-tasks` | **DEAD — can delete** |
| `THINKFORGE_PUBSUB_TOPIC` | `thinkforge-tasks` | **DEAD — can delete** |

### Preview Environment

Same list, but:

| Variable | Old Value | New Value |
|----------|-----------|-----------|
| `GOOGLE_CLOUD_PROJECT` | `insturix-preview` | `insturix-493414` (same as prod — you have one new project) |
| `GOOGLE_CLOUD_CREDENTIALS` | (old preview base64) | **SAME as production new value** (same service account) |
| `GCS_BUCKET_NAME` | `insturix-prev-gcs` | `insturix-prev-gcs-v2` |
| All other GCS_*/ Gemini / YouTube vars | (preview values) | **Same new values as production** |

**NOTE:** Since you're consolidating to one new project, preview and production share the same project ID and service account. Only the `GCS_BUCKET_NAME` differs (preview = `insturix-prev-gcs-v2`, prod = `insturix-v2`).

---

## DO NOT CHANGE (confirmed unrelated to GCP)

- `MONGODB_URI` — MongoDB Atlas, not GCP
- `MONGODB_DB_NAME` — collection name
- All `*_MONGO_COLLECTION` vars
- `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SECRET`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SES_*`
- `REMOTION_AWS_*`, `REMOTION_LAMBDA_*` (Remotion uses AWS Lambda, not Cloud Run)
- `QSTASH_*`, `REDIS_URL`, `KV_*`, `UPSTASH_*`
- `RAZORPAY_*`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`
- `FAL_AI_API_KEY`, `KIE_AI_API_KEY`, `DEEPGRAM_API_KEY`
- `NEXT_PUBLIC_PEXELS_API_KEY`
- `CDN_WORKER_URL`
- All `ADMIN_*`, `CRON_SECRET`, `SERVICES_WEBHOOK_SECRET`
- All `*_DEBUG` flags
- All `VERCEL_*` (auto-managed by Vercel)

---

## How to generate GOOGLE_CLOUD_CREDENTIALS (base64)

After downloading `insturix-prod-sa-key.json` from Phase 1:

**Windows Git Bash:**
```bash
base64 -w 0 insturix-prod-sa-key.json
```

**Windows PowerShell:**
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("insturix-prod-sa-key.json"))
```

Copy the entire output (one long line, no newlines) and paste into Vercel as the value of `GOOGLE_CLOUD_CREDENTIALS`.

---

## Cutover Strategy (IMPORTANT — read before updating)

**Scenario A: Update env vars THEN deploy code (RECOMMENDED)**
1. Update all 11 active vars in Vercel (Production + Preview)
2. Merge code changes to main → Vercel auto-deploys
3. New deployment reads new env vars → works with new GCP account

**Scenario B: Deploy code THEN update env vars (BAD)**
- Code changes reference new project ID but env vars still point at old → broken deploy
- AVOID

**Between step 1 and step 2** (env vars updated but code not yet deployed):
- Current production is still running with OLD code that reads NEW env vars
- OLD code with NEW env vars works because source code uses `process.env.GCS_BUCKET_NAME` (not hardcoded)
- The 5 hardcoded code changes are for edge cases (fallback defaults, deploy scripts) — won't break production
- **Safe to update env vars first without immediate code deploy**
