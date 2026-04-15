# Verified Audit — Old GCP Account

**Date:** 2026-04-16
**Account:** admin@insturance.org
**Verified via:** gcloud CLI (direct queries, no truncation) + screenshots

---

## All 12 Projects (8 Insturix-related + 4 unrelated)

### ⭐ insturix-457914 (MAIN PROD, project #117721890474)

**7 buckets (1 missed earlier: `socialize`)**
| Bucket | Size | Status |
|--------|------|--------|
| `insturix` | 1.02 GB | LIVE (env: GCS_BUCKET_NAME) |
| `alyzitron-uploads` | 650 MB | LIVE (env: ALYZITRON_GCS_BUCKET_NAME) |
| `musitron` | 264 MB | LIVE (env: MUSITRON_GCS_BUCKET_NAME) |
| `clickatron` | 39 MB | Possibly legacy — code uses GCS_BUCKET_NAME |
| **`socialize`** | **44 MB** | **LEGACY — not in env, old banners/profile images** |
| `insturix-457914_cloudbuild` | varies | Auto (Cloud Build artifacts) |
| `run-sources-insturix-457914-us-central1` | 137 KB | Auto (Cloud Run source archives) |

**9 service accounts (4 missed earlier)**
| Service Account | Purpose | Status |
|----------------|---------|--------|
| `insturix-frontend` | Vercel app | **LIVE** |
| `gcs-dev-access` | Dev access | Unclear |
| `monolith-acc` | Old monolith | DEAD |
| default compute | Auto | Unused |
| `alyzitron-backend` | Cloud Run worker | DEAD (0 traffic) |
| **`firebase-adminsdk`** | **Firebase (active enabled)** | Auto-created, SDK not imported |
| **`musitron-backend`** | **Cloud Run worker** | DEAD (0 traffic) |
| **`thinkforge-backend`** | **Cloud Run worker** | DEAD (0 traffic) |
| **`clickatron-backend`** | **Cloud Run worker** | DEAD (0 traffic) |

**3 API keys**
| Key | Restriction | Status |
|-----|-------------|--------|
| API key 1 | ⚠️ NONE (unrestricted) | UNSAFE — purpose unknown |
| Generative Language API Key | Gemini only | LIVE (used as GEMINI_API_KEY) |
| Browser key (Firebase auto) | 25 Firebase APIs | Auto, unused |

**5 Cloud Run services (1 missed earlier: `thinkforge-backend`)**
| Service | Status |
|---------|--------|
| alyzitron-backend | DEAD |
| clickatron | DEAD |
| musitron | DEAD |
| remotion-renderer | DEAD (AWS Lambda is used instead) |
| thinkforge-backend | DEAD |

**55+ APIs enabled** — including Firebase, Pub/Sub, Firestore, Secret Manager, Datastore, Identity Toolkit, Vertex AI, Gemini, YouTube, Cloud Run, Cloud Build, Artifact Registry, AppEngine

**OAuth clients (via Console):**
- `Insturix_Main` (prefix `117721890474-k6gi...`) — NOT used by Clerk, last used 15 Mar 2026, purpose unknown

---

### insturix-preview (#450420026824)

**1 bucket:** `insturix-prev-gcs` (6.14 GB — biggest!)
**3 SAs:** `insturix-preview-frontend` (LIVE), `firebase-adminsdk` (auto), `worker-monolith` (DEAD)
**1 API key:** Browser key (Firebase auto)
**0 Cloud Run services** (API disabled)
**OAuth clients:** None

---

### insturix-dev (#600664963870)

**5 buckets:**
- `editron-testing` (9 MB)
- `insturix-dev-gcs` (3.33 GB)
- `insturix-dev_cloudbuild` (auto)
- `remotioncloudrun-wc4dujlw21` (auto for Cloud Run)
- `test-meta-bucket`

**7 SAs** (all DEAD — for dead Cloud Run workers or old services)
**1 API key:** Browser key (Firebase auto)
**3 Cloud Run services:** Remotion renderer variants (all DEAD)

---

### ⭐ clerk-oauth-project (#785444891498)

**No buckets, no SAs, no API keys, no Cloud Run**
**OAuth client:** THE ONE CLERK USES — Client ID prefix `785444891498-5maafejqmig2u66kuujb979cp8u0punb`
- Redirect URI: `https://clerk.insturix.com/v1/oauth_callback`
- JS origins: none
- Scopes: openid, userinfo.email, userinfo.profile

**This is the project we MUST replicate for Google sign-in to keep working.**

---

### alyzitron-456218

**1 bucket:** `alyzitron-video-uploads` (0 bytes — EMPTY)
**2 SAs:** default compute, `production`
**2 API keys:** API key 1 (unrestricted ⚠️), `Alyzitron Video Analysis` (Gemini)
**Status:** DEAD — bucket empty, Cloud Run never ran

---

### editron-457314

**1 bucket:** `podcast-shorts` (48 MB)
**2 SAs:** default compute, `editron-backend`
**0 API keys**
**Status:** ABANDONED — bucket has old data, service account JSON is gitignored but code doesn't reference

---

### gen-lang-client-0046572061

**EMPTY** — auto-created shell project. No buckets, no keys, no SAs. Just has Gemini API enabled.

---

### gen-lang-client-0350112716

**1 API key:** `promptEnhancement` (Gemini-restricted)
**Status:** Used by Clickatron's enhance-prompt feature (even though primary GEMINI_API_KEY is in main project, this specific named key might be in env somewhere — need to verify)

---

## Summary: What the Migration MUST Replicate

### ESSENTIAL (production breaks without these)

1. **Main prod project (`insturix-493414`)** — ✅ created
   - `insturix-frontend` service account — ✅ created
   - IAM: Storage Admin, Token Creator, Vertex AI User — ✅ granted
   - Buckets: `insturix-v2`, `alyzitron-uploads-v2`, `musitron-v2`, `clickatron-v2` — ✅ created
   - CORS on all buckets — ✅ applied
   - Gemini API key — ✅ created
   - YouTube API key — ✅ created
   - **⚠️ MISSING: `socialize-v2` bucket** (44 MB legacy banners — might be referenced in MongoDB)

2. **Preview project (`insturix-preview-v2`)** — ✅ created
   - `insturix-preview-frontend` SA — ✅ created
   - IAM — ✅ granted
   - Bucket `insturix-prev-gcs-v2` — ✅ created
   - CORS — ✅ applied

3. **Clerk OAuth project (`clerk-oauth-v2`)** — ✅ created (empty, needs OAuth client)
   - OAuth consent screen — ❌ pending (manual)
   - OAuth Client ID — ❌ pending (manual, with redirect URI `https://clerk.insturix.com/v1/oauth_callback`)

### NON-ESSENTIAL (optional safety nets)

4. **Dev project (`insturix-dev-v2`)** — ✅ created, billing pending quota
5. **Alyzitron project (`alyzitron-v2`)** — ✅ created, no billing (not needed — bucket was empty)
6. **Editron project (`editron-v2`)** — ✅ created, no billing (not needed — code doesn't reference)

### QUESTIONS REMAINING

1. **What does `Insturix_Main` OAuth client do?** (in insturix-457914, last used 15 Mar 2026)
2. **Does any code/MongoDB reference the legacy `socialize` bucket?** (44 MB of old banners)
3. **Does the `promptEnhancement` key live in a different project vs GEMINI_API_KEY?** Does it matter for migration?
4. **Is the unrestricted "API key 1" in main project in use?** (It's a security risk — no restrictions)

---

## Gap Analysis — What We Built on New Account vs What Old Has

| Thing | Old account | New account | Gap? |
|-------|------------|-------------|------|
| Main prod project | insturix-457914 | insturix-493414 | ✅ |
| Main prod service account | insturix-frontend | insturix-frontend | ✅ |
| Main buckets | insturix, alyzitron-uploads, musitron, clickatron | insturix-v2, alyzitron-uploads-v2, musitron-v2, clickatron-v2 | ✅ |
| **`socialize` bucket** | **44 MB exists** | **NOT created** | **⚠️ GAP** |
| Gemini API key | Generative Language API Key | Insturix Gemini API Key | ✅ |
| YouTube API key | (was in prod SA credentials? or?) | Insturix YouTube Data API Key | ✅ |
| Preview project | insturix-preview | insturix-preview-v2 | ✅ |
| Preview bucket | insturix-prev-gcs | insturix-prev-gcs-v2 | ✅ |
| Clerk OAuth project | clerk-oauth-project | clerk-oauth-v2 | ✅ (empty — needs OAuth client) |
| Clerk OAuth client | exists (785444891498-...) | NOT created | ❌ (manual step) |
| Dev project | insturix-dev | insturix-dev-v2 | ✅ (billing pending) |
| Alyzitron project | alyzitron-456218 | alyzitron-v2 | ✅ (empty anyway) |
| Editron project | editron-457314 | editron-v2 | ✅ (empty anyway) |

---

## Recommendations

1. **CREATE `socialize-v2` bucket** — safety net for 44 MB of legacy data
2. **BEFORE CUTOVER: Check MongoDB** — are any URLs stored pointing to `gs://socialize/...`? If yes, we need to migrate that data + rewrite URLs
3. **Skip replicating dead service accounts** — 7 dead SAs on old main project, not needed on new
4. **Delete old unrestricted API key** — `API key 1` has no restrictions, security risk
5. **After OAuth migration: Rotate Clerk Client Secret** — it was visible in screenshot
