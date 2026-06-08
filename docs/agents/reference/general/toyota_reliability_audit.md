---
name: Toyota Reliability Audit — Editron Pipeline Failure Modes
description: MANDATORY reference for any pipeline reliability work. Exhaustive catalog of every known way the pipeline can silently fail, hang, or produce wrong output. Updated after every Toyota-style audit. Read before writing any code that touches external APIs, workers, async dispatch, or data validation.
type: reference
last_updated: 2026-04-08
originSessionId: 6b272c7c-4888-4c9b-8caf-d84e6c03234f
---
# Toyota Reliability Audit — Editron Pipeline

**Methodology:** Toyota Production System "stop the line" philosophy applied to code review. Find every silent failure, every timing assumption, every swallowed error, every un-validated data boundary. Treat every `catch {}` as a defect. Treat every `as any` as hidden state.

**First conducted:** 2026-04-08 (two parallel deep-dive agents: external deps + race conditions)
**Triggered by:** User request after Bundle 2 regression hit 504 on storyboard/generate

---

## RULE — Toyota Reliability Check Cadence

**When to run this audit:**
1. **Before any production launch milestone**
2. **After any architectural change that touches external APIs, workers, or data persistence**
3. **Every 15 commits** on the active branch (drift detection)
4. **When the user reports unreliability** (regression, silent failure, unexpected behavior)
5. **Before adding a new external dependency** (audit it the same day)

**How to run the audit:**
1. Launch 2+ parallel Explore agents with Toyota Production System framing:
   - Agent 1: External dependency failure modes (every API, every service, every credential path)
   - Agent 2: Async/race conditions + silent failures + data integrity violations
   - Agent 3 (optional): LLM hallucination + schema violations at every parser/consumer
2. Each agent must return file:line for every finding
3. Each finding must be tagged P0/P1/P2 by blast radius
4. Each finding must describe: what happens / is it silent / detection path
5. Merge findings into this file with dates + status (open/fixed)
6. Open items become a Tier-0 backlog before new feature work

**Why this rule exists:** Silent failures compound. Each undetected failure mode becomes a support ticket, a regression, or a "works on my machine" ghost bug. The Toyota philosophy is that defects are cheaper to fix at the source than in the field. For Editron specifically, failures are especially costly because every broken render costs the user ~$3 in fal.ai credits.

---

## Findings — 2026-04-08 audit

### Severity legend
- **P0 (CRITICAL)** — silent failures, data loss, or user-visible broken output. Must fix before public launch.
- **P1 (HIGH)** — reliability gaps that bite at scale (50+ concurrent users, long scripts, edge cases).
- **P2 (MEDIUM)** — polish, observability, tech debt that slows future debugging.

---

## SECTION A — External dependency failure modes

### A.fal.ai.1 [P0] No retry loop on fal.ai video calls
**File:** `lib/pipeline/video-generation-service.ts:38-58` (`falSubscribeWithTimeout`)
**Symptom:** fal.ai 429 or 5xx → instant failure. User loses 10+ minutes of work.
**Current state:** Open.
**Fix sketch:** Exponential backoff wrapper with max 3 retries only on transient errors (429, 500, 502, 503, 504). Don't retry 4xx client errors.

### A.fal.ai.2 [P0] Promise.race timeout doesn't cancel fal.subscribe
**File:** `lib/pipeline/storyboard-service.ts:114-128`, `lib/pipeline/video-generation-service.ts:82`
**Symptom:** `Promise.race` throws timeout, but fal.subscribe keeps running on fal's servers. Multiple stacked timeouts → fal.ai concurrency exhausted, entire queue backs up.
**Current state:** Open.
**Fix sketch:** Use AbortController properly — fal client supports `{ signal }` in newer SDK versions. Verify and wire it through.

### A.fal.ai.3 [P0] extractVideoUrl returns null silently
**File:** `lib/pipeline/video-generation-service.ts:237-248`
**Symptom:** 5 fallback URL paths. If fal response structure changes, `extractVideoUrl` returns null, caller throws cryptic "No video in response. Keys:" with no context about which model / which scene.
**Current state:** Open.
**Fix sketch:** Log the full response structure on null extract + include assetId + sceneIndex + model in error.

### A.fal.ai.4 [P0] getCleanImageUrl strips query params on fallback
**File:** `lib/pipeline/video-generation-service.ts:65-87`
**Symptom:** If re-upload to fal.storage fails, returns `imageUrl.split('?')[0]` — strips GCS signed-URL auth tokens. fal.ai receives a dead URL and generates garbage. Visual failure only, no error.
**Current state:** Open.
**Fix sketch:** On re-upload failure, throw instead of falling back. Caller (storyboard-service) can retry or fail visibly.

### A.fal.ai.5 [P0] No circuit breaker
**Symptom:** 5 failed fal calls in a row still attempt a 6th. No "stop trying, we're down" signal.
**Current state:** Open.
**Fix sketch:** Create `lib/pipeline/adapters/fal-circuit-breaker.ts` with closed/open/half-open state. 5 failures in 60s opens the circuit for 60s.

### A.fal.ai.6 [P1] Duration snap is silent
**File:** `lib/pipeline/adapters/video-model-configs.ts:88-427`
**Symptom:** User requests 10s video on MiniMax (max 5s), gets 5s without warning. Scene timeline expects 10s → misaligned clips.
**Current state:** Open.
**Fix sketch:** When snap changes the requested duration, call `pipelineWarnings.degraded('video-gen', ..., 'duration snapped from Xs to Ys (model limitation)')`.

### A.fal.ai.7 [P1] Native audio flag not propagated to sub-shots via video worker
**Symptom:** Phase A3.5.13 partially fixed in B1 by inheriting from parent scene in finalize. The PROPER fix is per-sub-shot detection in video worker, deferred.
**Current state:** Open (scene-inherit workaround in place).

### A.gemini.1 [P0] Raw JSON.parse on Gemini output (4+ files)
**Files:**
- `lib/pipeline/consistency-scoring-service.ts:127-129`
- `lib/pipeline/consistency-scoring-service.ts:~452`
- `lib/editron/services/five-track-analysis.ts` (multiple locations)
- `lib/editron/services/media/transcription-service.ts:~259`

**Symptom:** Gemini returns malformed JSON (network interrupt, token truncation) → `JSON.parse` throws SyntaxError → uncaught → 500.
**Current state:** Open.
**Fix sketch:** Wrap every JSON.parse on LLM output in try/catch + Zod schema validation + safe fallback defaults. Log the raw string on failure.

### A.gemini.2 [P0] generateObject schema applied but no runtime type enforcement
**File:** `lib/pipeline/llm-scene-parser.ts:122-127` + all other generateObject calls
**Symptom:** Zod schema is given to `generateObject()` but the Vercel AI SDK applies it post-generation. If Gemini hallucinates `durationSeconds: "five"` (string), the schema validates but downstream code doing `durationSeconds * fps` produces NaN.
**Current state:** Partially handled in Phase A3 parser post-processing (line 354+). Not comprehensive.
**Fix sketch:** Add a dedicated post-processor that coerces + clamps + defaults every field before returning.

### A.gemini.3 [P0] Vision analysis outputs never validated
**File:** `lib/editron/services/five-track-analysis.ts` (all Gemini Vision calls)
**Symptom:** Gemini returns empty keyframes array or null subjects. Code assumes fields exist. Analysis cached with empty data → Director skips intelligence step → EDL silently produces zero decisions.
**Current state:** Open.

### A.gemini.4 [P1] 90s abort timeout on parser may be too tight for 50+ scene scripts
**File:** `lib/pipeline/llm-scene-parser.ts:126` (`AbortSignal.timeout(90_000)`)
**Symptom:** Large scripts > 50 scenes → gemini-3.1-flash-lite can take 100-120s. Abort fires → falls through to regex parser which doesn't understand structured scripts → bad scenes.
**Current state:** Open. Tradeoff: tighter timeout prevents 504 on stuck calls, looser timeout covers legit large scripts.
**Fix sketch:** Make timeout proportional to script length (60s base + 1s per 500 chars, capped at 180s).

### A.gemini.5 [P1] No Gemini API key expiry detection
**Symptom:** If GEMINI_API_KEY rotates in production, all LLM calls 401. No circuit breaker, no alert. Pipeline goes dark silently.
**Current state:** Open.

### A.gemini.6 [P1] No rate-limit backoff
**Symptom:** Gemini 429 → instant throw. No retry-after honoring.
**Current state:** Open.

### A.deepgram.1 [P0] Stream read has no timeout
**File:** `lib/pipeline/tts-service.ts:174-180`
**Symptom:** `reader.read()` can hang indefinitely if credentials expire mid-stream. Route times out at 300s with no partial result.
**Current state:** Open.
**Fix sketch:** Wrap each read() in a 10s timeout. If any read times out, abort the stream and fall back to Kokoro.

### A.deepgram.2 [P0] Transcription fallback chain keeps going on each error
**File:** `lib/editron/services/media/transcription-service.ts:131-206`
**Symptom:** Whisper fails → Gemini fails → Deepgram fails → throws. Three external calls in sequence with individual timeouts = potential 300s+ total. Downstream code treats missing transcription as fatal.
**Current state:** Open.
**Fix sketch:** Add a global deadline (60s for the entire fallback chain). Return "degraded, no transcription" sentinel on total failure so caller can skip captions gracefully.

### A.freesound.1 [P0] No download content validation
**File:** `lib/pipeline/sfx-library-service.ts:169-191`
**Symptom:** Freesound sometimes returns an image instead of audio (content negotiation bug). Content-type check catches it → returns null silently → SFX layer skipped with no user-visible warning.
**Current state:** Partial fix in Bundle 1 (audio worker now logs `degraded('sfx', ...)` on null result). Root cause (Freesound returning wrong content) still open.

### A.luma.1 [P0] Polling loop silently skips failed status checks
**File:** `lib/pipeline/adapters/image-model-configs.ts:353-385`
**Symptom:** `if (!statusRes.ok) continue;` — if Luma is 5xx, poll keeps retrying silently until 60-poll timeout (2 min). No exponential backoff, no failure count.
**Current state:** Open.

### A.luma.2 [P0] Status JSON parsing unvalidated
**File:** `lib/pipeline/adapters/image-model-configs.ts:~366`
**Symptom:** `await statusRes.json()` with no try/catch. Corrupted response crashes the polling loop.
**Current state:** Open.

### A.qstash.1 [P0] No acknowledgment / dead-letter handling
**Symptom:** Job publishes to QStash → worker starts → worker crashes mid-execution → QStash retries (2 retries configured) → if all 3 attempts fail, the job is just dropped.
**Current state:** Open. Mitigation: 2 retries catches most transient failures.

### A.qstash.2 [P0] Partial enqueue failure masking
**File:** `app/api/services/pipeline/storyboard/[id]/generate-videos/route.ts:368-397`
**Symptom:** 3 of 21 scenes fail to publish to QStash → route returns `success: false, partialFailure: true` with 503. Frontend doesn't distinguish this from total failure → user retries → duplicate QStash messages for the 18 that DID work.
**Current state:** Open.
**Fix sketch:** Fail hard (500) on ANY enqueue failure. Don't start any videos unless ALL can be enqueued.

### A.redis.1 [P0] No connection pooling/reconnection on Upstash
**Symptom:** Upstash Redis connection drops → next `enqueueRender` call fails → no automatic reconnect → render queue goes dark until next deploy.
**Current state:** Open.

### A.mongo.1 [P0] No query timeouts
**File:** `lib/editron/db/mongodb.ts` + all collection operations
**Symptom:** MongoDB slow query → route waits until the 300s Vercel kill. No "bail at 5s" option.
**Current state:** Open.
**Fix sketch:** Add `.maxTimeMS(5000)` to find/update operations in hot paths.

### A.mongo.2 [P0] No write acknowledgment validation
**Symptom:** `await db.collection(...).updateOne(...)` assumes success. If network hiccup during write, update may not commit. Code continues as if it did. Data loss.
**Current state:** Open. Partial mitigation: MongoDB replica-set write concern is usually 'majority' by default.

### A.gcs.1 [P0] Signed URL expiry not checked before use
**File:** `lib/editron/services/asset-resolver.ts`
**Symptom:** Cached signed URL expires → video player gets 403 → player hangs or shows blank. No retry, no refresh.
**Current state:** Partial fix in asset-resolver (URL refresh on expiry check) but not bulletproof.

### A.r2.1 [P1] No fallback if CDN fails
**Symptom:** R2/Worker goes down → all CDN URLs fail → no fallback to GCS. Entire editor preview breaks.
**Current state:** Open.

### A.lambda.1 [P0] No render status polling timeout
**Symptom:** Remotion Lambda stuck job → progress poll hangs forever.
**Current state:** Open.

### A.clerk.1 [P1] No session validation in long-running jobs
**Symptom:** User Clerk session expires during a 10-min video gen → workers continue with expired credentials → results may be discarded on 401.
**Current state:** Open.

---

## SECTION B — Async / race conditions / silent failures

### B.race.1 [P0] storyboard/generate 504 with Bundle 2 per-sub-shot gen
**File:** `lib/pipeline/storyboard-service.ts` `generateForScene` per-sub-shot block
**Symptom:** Scene with 5 independent sub-shots = 1 parent + 5 sub Flux calls sequentially = ~180s per scene. Outer CONCURRENCY=6 can't save a scene that's internally serial. 21-scene script hits 300s Vercel timeout.
**Current state:** **ACTIVE REGRESSION** from commit `8063efc6`. Fix in progress.
**Fix sketch:** Parallelize sub-shot gen with `Promise.all` + inner concurrency cap (3). Add per-scene budget check that skips sub-shot gen if `MAX_BUDGET_MS - elapsed < 90s`. Video worker already has a fallback to parent image for missing sub-shot images, so degrading to no-sub-shot-images is graceful.

### B.race.2 [P0] QStash partial enqueue → user retries → duplicates
See A.qstash.2.

### B.race.3 [P0] Montage sub-shot independence validation missing
**File:** `app/api/services/pipeline/storyboard/[id]/generate-videos/route.ts:245-257`
**Symptom:** If descriptor says `sceneType: 'montage'` but `independentGeneration: false` on all sub-shots, code silently falls through to continuous-scene path. Credits were already counted as 1 clip. Next scene timing is off.
**Current state:** Open.

### B.race.4 [P1] Director lock bypassed by manual save
**File:** `lib/editron/services/project-service.ts:238-251`
**Symptom:** `directorLock` is only checked in autosave, not manual save. User editing + hitting Ctrl+S during Director run → manual save clobbers Director's BGM/SFX/captions.
**Current state:** Open.
**Fix sketch:** Check lock in `saveProject()` too. Reject manual save with 409 "Director is running, try again" if lock is active.

### B.race.5 [P1] Stale batch check uses 15-min window
**File:** `app/api/services/pipeline/storyboard/[id]/generate-videos/route.ts:115-124`
**Symptom:** If a batch hangs (worker crash, network timeout), status stays `'processing'` for 15 min. User can't retry during that window.
**Current state:** Open.
**Fix sketch:** Stale detection — if batch is > 5 min old AND no jobs updated in last 30s, mark batch as failed and allow retry.

### B.race.6 [P1] Finalize → BGM/SFX worker dispatch race
**Symptom:** Finalize saves project, then dispatches QStash to BGM worker. QStash delivers in ~500ms-1s. BGM worker queries MongoDB: 404 because project write hasn't replicated yet.
**Current state:** Open.
**Fix sketch:** Add a `findOne` verification check after saveProject before dispatching workers. Or add retry-on-404 logic in the workers.

### B.race.7 [P1] Video worker → Director dispatch missing
**Symptom:** Finalize stores `pendingDirectorProfileId` on project, but there's no mechanism to trigger Director after all videos complete. Relies on the video worker's internal "last job in batch" logic — if that's flaky, Director never runs.
**Current state:** Partial fix in video worker (dispatches Director when batch counters say complete). Needs a cron backstop.

### B.race.8 [P1] Overlay ID collisions between finalize + audio worker
**Files:** `finalize/route.ts:90` vs `audio/route.ts:142`
**Symptom:** finalize uses `Date.now() + random(10000)`, audio worker uses `Date.now() * 1000 + random(1000000)`. If they collide, React renders duplicate keys → overlays merge/corrupt.
**Current state:** Partially fixed in Bundle 1 for EDL-generated overlays via `deterministicOverlayId()`. Finalize and audio worker still use timestamps.
**Fix sketch:** Assign ID ranges per source. Finalize gets [0, 1M), audio BGM gets [1M, 2M), audio SFX gets [2M, 3M), EDL gets [3M, 4M).

### B.silent.1 [P0] Edit direction failure swallowed in finalize
**File:** `app/api/services/pipeline/storyboard/[id]/finalize/route.ts:688-694`
**Symptom:** `applyEditDirections()` throws → caught → warning pushed → route continues and returns `success: true`. Project has no filters, transitions, or pacing. User thinks it worked.
**Current state:** Open. Bundle 1 added pipelineWarnings but the warning is buried in response JSON — not surfaced in UI.
**Fix sketch:** Return 500 with `recoveryHint` if edit-direction application fails. Break the build rather than silently degrade.

### B.silent.2 [P1] fal.subscribe Promise.race leak
See A.fal.ai.2.

### B.silent.3 [P1] Consistency score low → no regen → silent quality degradation
**File:** `lib/pipeline/storyboard-service.ts:588-670`
**Symptom:** Consistency check runs, scene scores low, but regen hits time budget and skips. Scene is kept with low score. No user warning.
**Current state:** Open.

### B.silent.4 [P1] Bare catch in auth check
**File:** `app/api/services/pipeline/storyboard/[id]/generate-videos/route.ts:82-89`
**Symptom:** `try { const a = await auth(); userId = a.userId; } catch {}` — Clerk failure silently sets userId to null → returns 401 "Unauthorized" without logging the real reason.
**Current state:** Open.

### B.data.1 [P1] scene.imageUrl non-null assertion
**File:** `app/api/services/pipeline/storyboard/[id]/generate-videos/route.ts:~264`
**Symptom:** `imageUrl: scene.imageUrl!` — TypeScript non-null assertion bypasses runtime check. If scene was partially deleted (TTL, bug), undefined passes to worker → fal.ai rejects with cryptic error.
**Current state:** Open.

### B.data.2 [P1] Overlay mutation without rollback
**File:** `lib/editron/services/edl-executor.ts:91-150`
**Symptom:** `applyDecision` mutates overlays in place. If it throws mid-mutation, array is in inconsistent state. Next decision operates on corrupted array.
**Current state:** Open.
**Fix sketch:** Deep-copy before apply. Swap back only on success.

### B.data.3 [P1] `as any` casts hide null access
**Files:** director-agent.ts:143, finalize/route.ts:160, llm-scene-parser.ts:248, + ~20 more
**Symptom:** Random 500s when MongoDB returns null (stale query, missing doc). No clear error.
**Current state:** Open.

### B.data.4 [P1] subShots can be null not just undefined
**File:** `app/api/services/pipeline/storyboard/[id]/generate-videos/route.ts:~220`
**Symptom:** `descriptor.subShots || []` handles undefined but NOT null (JSON deserialization can produce null for optional arrays).
**Current state:** Open.
**Fix sketch:** `Array.isArray(descriptor.subShots) ? descriptor.subShots : []`

### B.data.5 [P1] Voiceover silent truncation
**File:** `finalize/route.ts:543-551`
**Symptom:** VO capped to scene duration, warning added to `warnings` array. User never sees the warning (not surfaced in UI). VO ends mid-sentence.
**Current state:** Open.
**Fix sketch:** If VO > scene by >10%, return error prompting user to extend scene duration.

---

## SECTION C — Vercel function timeout analysis

### C.timeout.1 [P0] storyboard/generate worst case with per-sub-shot gen
**Math:**
```
Per scene:
  - Parent image gen: ~30s (Flux Schnell) to 60s (IP-adapter)
  - Per-sub-shot image gen × N sub-shots: N × 30s (currently sequential)
  - DB writes: ~1s

Worst case for a 3-scene script with 3/5/5 independent sub-shots:
  Scene 0: 30s + 3×30s = 120s
  Scene 1: 30s + 5×30s = 180s
  Scene 2: 30s + 5×30s = 180s
  Total sequential: 480s ⚠️ EXCEEDS 300s LIMIT

With outer CONCURRENCY=6: scenes run in parallel, so bottleneck is slowest scene = 180s ✓ fits in 300s
BUT: consistency check adds 30-60s, so 180 + 60 = 240s ⚠️ tight
AND: scene 0 runs solo first (style anchor), then rest run with CONCURRENCY=6 → scene 0's 120s + max(180s, 180s) = 300s exactly

Conclusion: HITS 300s LIMIT on any 3+ scene script with 5 independent sub-shots per scene.
```
**Current state:** ACTIVE REGRESSION. Fix in progress.

### C.timeout.2 [P1] storyboard/voiceover marginal
**Math:** 60 scenes / batch of 4 = 15 batches. 5s/batch best case = 75s. 20s/batch with backpressure = 300s exactly.
**Current state:** Open. Safe for <40 scenes, risky for 60+.

### C.timeout.3 [P0] thinkforge/script/export-for-editron parser
**Current mitigation:** Bundle 1 hotfix (commit `d3d295d0`) — switched parser to gemini-3.1-flash-lite-preview + AbortSignal.timeout(90s) on all 4 generateObject calls.
**Current state:** Fixed for typical scripts. May still hit 90s on very large scripts.

---

## Resolved items — 2026-04-18 / 2026-04-19 audit sweep + batch fixes

Verified via parallel Explore-agent audits + live code inspection against HEAD
(post-commit `079c0ae7`). Marked FIXED below with shipping commit. Items
originally logged 2026-04-08.

**External dependencies (Section A):**
- ✅ **A.fal.ai.1** — retry loop on fal.ai via `falRetry` (commit `c3b4684b` Bundle 4).
- ✅ **A.fal.ai.2** — Promise.race cleanup (Bundle 4 `falSubscribeWithTimeout`).
- ✅ **A.fal.ai.3** — extractVideoUrl null handling + logging (Bundle 4).
- ✅ **A.fal.ai.4** — getCleanImageUrl CDN re-upload primary, strip only as last resort (Bundle 4).
- ✅ **A.fal.ai.6** — duration snap NOW visible: `console.warn` logs delta when snap > 0.5s (Batch 2 commit `2c617206`).
- ✅ **A.gemini.1** — safe JSON parse via `llm-json-safe-parse.ts` (Bundle 4).
- ✅ **A.gemini.2** — generateObject schema + post-processing (llm-scene-parser).
- ✅ **A.gemini.3** — Vision output validation via safeParseLlmJson (consistency-scoring).
- ✅ **A.gemini.4** — parser timeout bumped 90s → 180s (commit `3ffd1a70`).
- ✅ **A.gemini.6** — Gemini 429 / transient retry wrapper (Batch 4 commit `8f76b94f` — `gemini-retry.ts`).
- ✅ **A.freesound.1** — content-type + magic byte validation (post-Bundle-4).
- ✅ **A.luma.1 / A.luma.2** — polling loop state handling + JSON validation (image-model-configs).
- ✅ **A.mongo.1** — connection pooling + timeouts configured (db/mongodb.ts).

**Race / silent (Section B):**
- ✅ **B.race.1** — storyboard/generate 504 fixed via QStash workers (Bundle 4 C.timeout.1).
- ✅ **B.race.3** — montage sub-shot independence validation (generate-videos:245-250).
- ✅ **B.race.4** — Director lock enforced in autosave + manual save path (project-service).
- ✅ **B.race.8** — overlay ID collision — VERIFIED NON-ISSUE. Finalize IDs are in 1e12 range, audio worker in 1e15 range — mathematically cannot collide. Toyota entry was theoretical.
- ✅ **B.silent.1** — edit-direction failure surfaced via pipelineWarnings + project doc flag (Bundle 4).
- ✅ **B.silent.3** — consistency regen logic intact (storyboard-service).
- ✅ **B.silent.4** — bare catch in auth now logs error (Batch 1 commit `846a4459`).
- ✅ **B.data.1** — `scene.imageUrl!` non-null assertion replaced with explicit guards (Batch 1).
- ✅ **B.data.2** — overlay mutation + clipA/clipB dedup (edl-executor B1 commit `eca8daed`).
- ✅ **B.data.4** — subShots null handling via Array.isArray (Batch 1).
- ✅ **B.data.5** — voiceover duration preserved (finalize).
- ✅ **C.timeout.1** — storyboard/generate 504 → QStash workers (Bundle 4).

**Screen zones (master_remaining HIGH #6):**
- ✅ **Screen zone validation** — auto-post-processing.ts now checks BOTH captions AND voiceovers for Zone 3 reservation (Batch 5 commit `079c0ae7`).

**Director critical (master_remaining CRITICAL):**
- ✅ **BGM row hardcoded to 1** — confirmed uses `ROW.BGM` constant (director-agent:719, 1206, 1280).
- ✅ **Director lock release** — try/finally with $unset (director-agent:612-620).

**Other today's fixes NOT originally in Toyota audit** (new issues surfaced and shipped this session):
- ✅ Ghost transitions from in-memory dedup markers (commit `8362b5dc`, Rule 20N entry in pipeline_investigations.md 2026-04-18).
- ✅ `add_transition` applyToAll silent fallthrough (commit `a74ddcba` + Batch 1 schema refine — belt-and-suspenders).
- ✅ EDL diverse-transition overwrite regression (same as above — Director now passes `afterOverlayId`).
- ✅ AssetBriefing partial-cache crash (commit `ce5df796`, defensive array checks).
- ✅ Caption fallback ↔ graphic duplication (commit `dd758500`, "refined Option 1").
- ✅ Hormozi caption UI drift (commit `156e89ad`, dropdown exposes all 9 STYLE_MAP presets).
- ✅ Admin email allowlist leak (commits `758f7835` + `432203c7`, moved server-only + rotated secret).
- ✅ onScreenText enforcement gap after caption-fallback removal (Batch 5, deterministic graphic safety-net).

---

## Still open (post-2026-04-19 audit)

**External deps:**
- ❌ **A.fal.ai.5** — no cross-service circuit breaker (per-call retry only).
- ❌ **A.gemini.5** — no API key expiry detection (401/403 don't trigger reauth).
- ❌ **A.deepgram.1** — stream read has no timeout.
- ❌ **A.deepgram.2** — transcription fallback chain has no global deadline.

**Race / silent:**
- ❌ **B.race.5** — 15-min stale batch window arbitrary (`generate-videos/route.ts:94`, confirmed 2026-04-20).
- ❌ **B.race.6** — finalize → BGM/SFX dispatch race. Verified 2026-04-20 at `finalize/route.ts:740`: QStash fire-and-forget with `retries: 2`, fallback fetch has `.catch(() => {})` silent-swallow. No replication-lag awareness — worker could read stale MongoDB secondary state before the finalize write replicates. Error is logged but not surfaced.
- ❌ **B.race.7** — video → Director dispatch backstop partial. Verified 2026-04-20 at `video/route.ts:519-538`: `qstash.publishJSON({ retries: 1 })` (only one retry), fallback `fetch(...).catch(() => {})` silent-swallow, outer catch logs but no retry. If QStash primary fails AND fallback fetch fails, Director never fires — project appears hung with no user-visible warning.
- ❌ **B.data.3** — ~12+ `as any` in `lib/` alone, more across `app/`. Hot-path hiding (asset-resolver, storyboard-service, etc.).

**Output quality:**
- ❌ **HTML escape** — already complete (5 entities); Toyota entry was stale.
- ❌ **console.warn → console.error** — 40+ sites, post-launch polish.
- ⚠️ **Gemini prompt contradictions** — PARTIALLY RESOLVED 2026-04-20 via `editron-prompts.md` reference-doc patches: transition enum drift (fade-to-black→dip-to-black, killed invented audioJar, wipe direction required), shotType/cameraAngle enum drift (close→close-up, high→high-angle etc.), model name staleness (Gemini 2.0 Flash → editron-config.ts source), Prompt 3 motion redundancy (~80 words → ~30), Subject Extraction 120-word hard cap, Director tool-name leak rule, Model Reference table. Still deferred: the `unified-edit-intelligence.ts:479-603` in-code prompt audit (motion budget, zoom cap, freeze-frame rules) — user driving separately.
- ❌ **Decision density** — NOW FIXED (Batch 2); leaving here as cross-ref.

**Now-pending from pipeline_investigations.md deferred entries:**
- ✅ **P0-4 parser regex fallback rewrite** — SHIPPED 2026-04-20 (commit `f41b4e52`, logged as S-16). Root fix in `script-to-scenes.ts`: (1) editorial-header paragraphs route to `rawProductionNotes` instead of narration — TTS no longer speaks "Emotional Target: ..." / "Instrumentation: ..."; (2) `narration.substring(0, 2000)` copy-back removed from both ThinkForge-blocks + CIR converters — no more byte-identical narration/visualDescription dumps. Quality gate in `export-for-editron/route.ts` stays as defense-in-depth; pattern list now single-sourced (`EDITORIAL_HEADER_PATTERNS` exported from `script-to-scenes.ts`). Rule 2N + Rule 16N aligned. Prior mitigations (fce2ccdd quality gate, 3ffd1a70 timeout bump, 8f76b94f Gemini retry) stay in place as layered defenses.
- ✅ **Contributor #2 pacing multiplier compound** — SHIPPED 2026-04-20 (commit `57f72532`, logged as S-18). `durationWasExplicit` flag propagated from parser (regex + LLM) through to `edit-direction-applier`. Pacing multiplier skipped when flag set. Adds VO-bound floor so pacing never compresses below narration duration. `profile.pacingMultiplier` audited: defined on all 54 profiles, NEVER READ anywhere — dead field, no additional compound risk from that side (separate cleanup commit warranted).
- ❌ **Contributor #3 model-grid silent snap** — NOW PARTIALLY ADDRESSED: Batch 2 added visibility via console.warn. Full fix (pipelineWarnings integration + profile-level policy) deferred.
- ⚠️ **5-Track producer partial audio** — MISDESCRIBED on re-verification 2026-04-20. Producer at `five-track-analysis.ts:1190-1220` always saves COMPLETE shape with `status: 'complete'`. Individual sub-fields (`audio`, `musicStructure`, `motionSegments`) can be null/empty when that sub-track's analysis failed. Real bug = "consumers must defensively handle null sub-fields." `asset-briefing.ts` handles it (ce5df796). Remaining consumers TO AUDIT: `reactive-edit-engine.ts`, `cinematic-moment-detector.ts`, `edl-executor.ts`. Not a producer refactor.

- ❌ **NEW 2026-04-20: Profile enum drift — `pacing: 'variable'`** — `edit-profiles.ts:210` (and possibly other profiles) uses `pacing: 'variable'` but the `SceneEditDirections.pacing` enum is `'fast' | 'medium' | 'slow' | 'building' | 'beat-synced'`. Silent drift: when `pacingMultiplierMap['variable']` is looked up, falls through to 1.0 (no effect). Profile's pacing intent is SILENTLY DROPPED. Likely source of "profiles cause errors" user complaint. Fix: either add `'variable'` to the enum with a defined multiplier, or change the profile to use one of the valid enum values. ~15 min fix once decision made. Audit all 54 profiles for similar drift needed.

---

## Fix priority order (when tackling the backlog)

**Phase 1 — ship immediately:**
1. B.race.1 — storyboard/generate 504 (active regression, blocks user testing)
2. B.silent.1 — edit-direction failure in finalize (hides broken output)
3. A.fal.ai.1 — retry loop on fal.ai (fixes most transient user failures)

**Phase 2 — before next test batch:**
4. A.gemini.1 + A.gemini.2 — schema validation + post-processor on all Gemini JSON
5. A.fal.ai.3 + A.fal.ai.4 — extractVideoUrl logging + getCleanImageUrl throw instead of strip
6. A.qstash.2 / B.race.2 — partial enqueue hard fail
7. A.deepgram.1 — stream read timeout

**Phase 3 — before scale:**
8. A.fal.ai.5 — circuit breaker
9. A.mongo.1 — query timeouts
10. B.race.4 — manual save respects Director lock
11. B.data.3 — replace `as any` with runtime validation in hot paths
12. B.race.8 — overlay ID range partitioning

**Phase 4 — observability:**
13. Per-service latency metrics + error rate tracking
14. pipelineWarnings UI surface (dashboard widget)
15. Silent-failure baseline dashboard

---

## How to update this file

After each new audit round:
1. Add a new "Findings — YYYY-MM-DD audit" section at the top
2. Move resolved items to a "Resolved" section at the bottom (keep for history)
3. Update priority order based on user-reported pain points
4. Link to the Phase A3 decision log for any item that was fixed as part of Phase A3 work
