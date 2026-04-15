# Post-Migration Verification Checklist

Run these tests after deploying the migration. Each must pass before considering migration complete.

---

## Phase A: Infrastructure Sanity (Before Deploy)

- [ ] New GCP project `insturix-493414` shows all 4 buckets in Console
- [ ] Service account `insturix-frontend@insturix-493414.iam.gserviceaccount.com` has 3 roles:
  - [ ] Storage Admin
  - [ ] Service Account Token Creator
  - [ ] Vertex AI User
- [ ] CORS applied to all 4 buckets (check in Console → Bucket → Permissions → CORS)
- [ ] Gemini API key works: `curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=YOUR_KEY" -H "Content-Type: application/json" -d '{"contents":[{"parts":[{"text":"hi"}]}]}'` returns 200
- [ ] YouTube API key works: `curl "https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=dQw4w9WgXcQ&key=YOUR_KEY"` returns 200

## Phase B: Vercel Env Vars

- [ ] Production env vars updated (22 vars)
- [ ] Preview env vars updated (22 vars)
- [ ] `GOOGLE_CLOUD_CREDENTIALS` base64 is one continuous line (no newlines)
- [ ] Old Firebase vars removed or left as-is (dead config)
- [ ] Old Pub/Sub vars removed or left as-is (dead config)

## Phase C: Deploy

- [ ] Preview deploy succeeds (check Vercel build logs)
- [ ] No build errors related to GCP SDKs
- [ ] No runtime errors in Vercel function logs on first page load

## Phase D: Functional Tests (Run on Preview URL First)

### Clickatron (image generation + GCS)
- [ ] Create new Clickatron session
- [ ] Generate an image variation
- [ ] Image uploads successfully
- [ ] Image thumbnail displays
- [ ] Download signed URL works
- [ ] Verify in GCP Console that file exists in `insturix-prev-gcs-v2`

### Editron (video editing + GCS)
- [ ] Upload a media file to Editron
- [ ] Signed URL resolves (can view the file)
- [ ] AI agent responds (tests Gemini)
- [ ] Asset URL refreshes when expired
- [ ] 5-Track analysis runs (tests Gemini Files API for video)
- [ ] Verify file in `insturix-prev-gcs-v2`

### Alyzitron (video analysis + Vertex AI + GCS + YouTube)
- [ ] Upload a video file
- [ ] Analysis completes (tests Vertex AI)
- [ ] OR paste a YouTube URL — validates and analyzes (tests YouTube API)
- [ ] Report loads with signed URL for video
- [ ] Verify file in `alyzitron-uploads-v2`

### Musitron (music generation + GCS)
- [ ] Generate a music track
- [ ] Audio uploads to GCS
- [ ] Playback works from signed URL
- [ ] Verify file in `musitron-v2`

### Socialize (banner upload + GCS)
- [ ] Upload a banner image
- [ ] Banner displays in dashboard
- [ ] Signed URL refresh works after 24h
- [ ] Verify file in `insturix-prev-gcs-v2` (or wherever socialize-gcs points)

### ThinkForge (Gemini + grounding)
- [ ] Start a new research session
- [ ] Research agent returns results with sources (tests grounding)
- [ ] Script generation works (tests model-factory.ts)

### Pipeline (Script → Video end-to-end)
- [ ] Run full pipeline: script → scenes → reference images → storyboard → videos
- [ ] All AI steps complete
- [ ] All assets store in new buckets

## Phase E: Existing Data Verification

- [ ] Open an old Editron project (created before migration)
- [ ] Media assets load (asset-resolver refreshes signed URLs with new bucket)
- [ ] If they DON'T load → run `phase-6-mongodb-url-rewrite.mjs --apply`
- [ ] Open an old Clickatron session → images load
- [ ] Open an old Alyzitron report → video plays

## Phase F: Error Monitoring (48 hours after deploy)

- [ ] Check Vercel function logs for any GCP-related 4xx/5xx errors
- [ ] Check for any `403 Forbidden` errors (usually = missing IAM permission)
- [ ] Check for any `404 Not Found` on GCS URLs (usually = bucket name mismatch)
- [ ] Check for any Gemini rate limit errors (individual account quotas are lower)
- [ ] No `Permission denied` errors in logs

## Phase G: Production Cutover

- [ ] Preview thoroughly tested (48+ hours)
- [ ] Merge migration branch to main
- [ ] Watch production deploy
- [ ] Repeat Phase D tests on production URL
- [ ] Monitor for 24 hours

## Phase H: Decommission Old Account (2 weeks later)

**Only after full production stability confirmed:**

- [ ] Export any billing/audit logs from old GCP account for records
- [ ] Delete old buckets: `insturix`, `insturix-prev-gcs`, `alyzitron-uploads`, `musitron`
- [ ] Delete old service accounts
- [ ] Revoke old API keys (Gemini, YouTube, Firebase)
- [ ] Close old GCP billing account
- [ ] Delete Vercel env var rollback values (kept as backup during transition)
- [ ] Delete MongoDB backup collections created by phase-6 script
