# Adversarial Audit v1 — ThinkForge → Editron Pipeline
**Date:** 2026-03-24
**Status:** DOCUMENTED — fixes pending

## CRITICAL (6 issues)

### F2.2 — Credits deducted per-subject loop, partial failure = money lost
- **File:** `app/api/services/pipeline/reference-images/generate/route.ts` lines 25-29
- **Trigger:** User has fewer credits than subjects. Loop deducts one-by-one. After N succeed, returns 402. Credits spent, no images generated.
- **User sees:** "Insufficient credits" but N credits already gone
- **Fix:** Check total credits needed BEFORE deducting. Single bulk deduction or pre-check.

### F3.1 — Storyboard credits under-charged (1 instead of N×2)
- **File:** `app/api/services/pipeline/storyboard/generate/route.ts` lines 100-106
- **Trigger:** `totalCost = scenes.length * 2` calculated but `deductCredits` called once with fixed action key
- **User sees:** Under-charged (4-scene storyboard costs 1 credit instead of 8)
- **Fix:** Pass `totalCost` to deductCredits or loop deduction

### F4.1 — Video credits under-charged (1 instead of N×3)
- **File:** `app/api/services/pipeline/storyboard/[id]/generate-videos/route.ts` lines 99-104
- **Trigger:** Same pattern as F3.1
- **Fix:** Same as F3.1

### F4.3 — All QStash enqueues fail but success: true returned
- **File:** `generate-videos/route.ts` lines 351-361
- **Trigger:** QStash down, all publishJSON rejected
- **User sees:** Frontend thinks videos are generating, nothing happens
- **Fix:** If `enqueueErrors === sceneJobs.length`, return `success: false`

### F8.5/F8.6 — No QStash signature verification = public endpoints
- **Files:** `audio/route.ts` lines 197-199, `video/route.ts` lines 160-162
- **Trigger:** Production without QSTASH_CURRENT_SIGNING_KEY
- **User sees:** Nothing — attacker can inject overlays into any project
- **Fix:** REQUIRE signing keys in production. Return 500 if missing.

### F10.2 — 5-Track analysis exceeds 300s Vercel timeout
- **File:** `five-track-analysis.ts` (runs inside Director context)
- **Trigger:** Multiple videos × Gemini upload + Vision calls > 300s
- **User sees:** Director times out, project partially modified, no rollback
- **Fix:** Add time budget (120s max for analysis). Or run as separate async worker.

---

## HIGH (9 issues)

### F2.3 — IP-adapter total failure with credits already deducted
- **File:** `reference-images/generate/route.ts` lines 32-36
- **Trigger:** fal.ai IP-adapter down for all subjects
- **Fix:** Per-subject try/catch, return partial results

### F2.4 — No fallback for subject extraction when LLM unavailable
- **File:** `extract-subjects/route.ts` lines 17-19
- **Trigger:** GEMINI_API_KEY not set
- **Fix:** Regex/heuristic fallback extracting nouns from visualDescription

### F4.2 — No delivery guarantee without QStash
- **File:** `generate-videos/route.ts` lines 264-304
- **Trigger:** Dev mode or missing QSTASH_TOKEN, fire-and-forget fetch
- **Fix:** Add sweeper job: if job "queued" > 10min, mark failed

### F4.5 — Video URLs expire before finalize
- **File:** `video/route.ts` line 82-88
- **Trigger:** User waits hours/days between video gen and finalize
- **Fix:** Verify gcsPath is always populated. Video worker already uploads to GCS.

### F5.3 — Voiceover credits partial deduction
- **File:** `voiceover/route.ts` lines 48-58
- **Trigger:** Same pattern as F2.2
- **Fix:** Pre-check total credits before any deduction

### F6.2 — Empty project created when all generation fails
- **File:** `finalize/route.ts` lines 91-137
- **Trigger:** All storyboard + video generation failed
- **Fix:** Check `currentFrame > 0` before creating project

### F6.6 — Race: user save clobbers audio worker push
- **File:** `finalize/route.ts` + `project-service.ts`
- **Trigger:** User opens project before audio workers finish, saves, audio lost
- **Fix:** Audio workers check if overlay already exists before push. Or use pendingOverlays array.

### F7.5 — Index-based scene matching misaligns
- **File:** `director-agent.ts` lines 125-127
- **Trigger:** Missing video for some scenes shifts all indices
- **Fix:** Match by sceneIndex property or from-frame position, not array index

### F9.1-9.3 — Asset resolution cascade failures
- **Files:** `asset-resolver.ts` lines 188-206
- **Trigger:** GCS URL expired + gcsPath null + service account issues
- **Fix:** HEAD request to verify cachedUrl. Surface broken assets visually.

---

## MEDIUM (14+ issues)

### F1.2 — No visual descriptions = generic storyboard images
- **Fix:** Fallback to narration text as visual description

### F1.5 — durationSeconds NaN when undefined
- **Fix:** Default to 5 during scene mapping

### F3.4 — Multi-frame/collage images from model
- **Fix:** Aspect ratio validation on returned images

### F4.4 — Video model returns 422 (param mismatch)
- **Fix:** Model-specific parameter validation before enqueue

### F4.6 — videoDurationMs fallback wrong for Kling
- **Fix:** Use model-specific known durations (5s or 10s for Kling)

### F5.1 — Kokoro down, some scenes Deepgram = voice inconsistency
- **Fix:** If one scene falls back, all remaining should also use Deepgram

### F5.4 — 8 concurrent TTS requests overwhelm provider
- **Fix:** Reduce batch to 4, add 429 backoff

### F5.5 — voiceover status "ready" when most scenes failed
- **Fix:** Use "partial" status when errors > 0

### F6.1 — Missing videoDurationMs = wrong scene duration
- **Fix:** Log warning, consider ffprobe

### F6.3 — applyEditDirections crash is silent
- **Fix:** Add warning to response

### F6.4/F8.4 — Overlay ID collision (Date.now())
- **Fix:** Use nanoid() for overlay IDs

### F6.5 — Audio dispatch fire-and-forget silently fails
- **Fix:** Log error, add audio status to project document

### F6.7 — Voiceover capped to scene duration truncates narration
- **Fix:** Warn user which scenes had truncated VO

### F7.1 — saveProject edge case with concurrent user save
- **Fix:** Optimistic locking (version counter)

### F7.2 — All caption attempts fail silently
- **Fix:** Add prominent warning to result

### F7.4 — 5-Track consumes too much time budget
- **Fix:** Time budget cap at 120s

### F8.2 — CassetteAI 422 = no BGM, no error visible
- **Fix:** Store BGM/SFX status in project, UI retry button

### F9.4 — getAsset filters by userId, breaks shared projects
- **Fix:** Remove userId filter for shared project context

### F9.5 — Only GCS URLs stripped, fal.ai URLs saved to MongoDB
- **Fix:** Strip all temporary URLs

---

## LOW (10+ issues)
- F1.3: editDirections null = generic transitions (acceptable)
- F1.4: 0 scenes = 422 error (handled correctly)
- F3.3: All images fail = success:false (handled)
- F5.2: Short/punctuation-only narration passes filter
- F7.6: result.success logic is correct
- F8.1: state.overlays push is dead code (cleanup)
- F8.3: mirelo SFX fail = no SFX for that scene (non-essential)
- F10.1: Large video skipped gracefully
- F10.3: Gemini invalid JSON caught per-layer
- F10.4: Cached analysis not invalidated (unlikely with unique IDs)
- F10.5: Two different Gemini SDKs (tech debt)
- F10.6: trackSubjects gets empty keyframes (runs concurrently)

---

## CROSS-CUTTING

### X1 — No credit reservation/refund across pipeline
- **Impact:** User pays for completed steps, no refund for downstream failures
- **Fix:** Credit reservation (hold → commit on success / release on failure)

### X2 — No retry for transient API failures
- **Fix:** Exponential backoff on fal.ai, CassetteAI, mirelo, Deepgram calls

### X3 — Fire-and-forget fetch has no delivery guarantee
- **Fix:** Ensure QStash always configured in production. Add health check.

---

## FIX PRIORITY ORDER
1. F8.5/8.6 (security — public endpoints)
2. F4.3 (silent failure — success:true when nothing works)
3. F3.1 + F4.1 (revenue — under-charging)
4. F2.2 + F5.3 (credits — partial deduction)
5. F10.2 (stability — timeout crash)
6. F7.5 (correctness — scene mismatch)
7. F6.6 (race condition — audio clobber)
8. F6.2 (UX — blank project)
9. F9.1-3 (asset resolution)
10. Everything else
