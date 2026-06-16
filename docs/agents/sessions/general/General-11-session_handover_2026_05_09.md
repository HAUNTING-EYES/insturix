---
name: session_handover_2026_05_09
description: TRIBE v2 integration complete + Mode 2 cut quality iteration + build fixes. Bleed-through is the open blocker.
type: project
originSessionId: ce9a3230-131f-4b39-8ced-5055d5d6b666
---
# Session Handover — 2026-05-09

## What Was Done (24 commits, 2-day session)

### TRIBE v2 Phase 1+2 — COMPLETE
- V-JEPA 2 visual encoder (Modal A10G) with adaptive z-score motion normalization
- Wav2Vec 2.0 vocal emotion (Modal T4) — 6 prosodic features
- Thompson Sampling bandit — per-user learning on 9 genre dials, MongoDB persistence, reward feedback loop (now active: obs=9, medium confidence)
- Signal registry enrichment — all 6 NEEDS_INFRA graph signals fulfilled
- QualityGate wired into Director — before/after snapshots per action
- Grok STT speaker diarization — speaker labels, change detection
- MOTION_NORM_DIVISOR → adaptive z-score (35.0 retained as fallback)
- Anti-pattern detector: 52 checks already built (doc updated)
- Director type errors fixed (ProjectBrief.intent + EDL stats shape)

### Mode 2 Cut Quality — Heavily Iterated
- **Editorial intent prompt**: video-format meta, intro/preamble detection, three-way distinction (topic vs video vs production), orphan detection rule
- **Best-take detection**: Jaccard + prefix overlap + false start + single-word repeat (4 strategies, strategy 4 keyword overlap REMOVED — caused regression)
- **DUPLICATE_TAKE**: Added then REMOVED — overcutting core content (36 segments killed, ~31 were valid)
- **Orphan/fragment detection**: post-pass catches lead-ins to removed content + abandoned micro-starts (≤3 words, incomplete)
- **Merge consecutive removals**: 192 individual cuts → 39 contiguous ranges. Reduces frame-rounding bleed-through.
- **Gap closing**: post-pass shifts overlays to eliminate black frames between segments
- **sceneIndex**: assigned on Mode 2 overlays after silence removal for transition/continuity matching

### Transitions
- Single-source EDL suppression (edl-executor.ts) — blocks Path D transition/sfx-trigger decisions for same-camera content
- Profile-based `hasMultipleScenes` check REVERTED — single-source != single-scene (combined files with multiple scenes exist)
- Continuity service: expanded from 5 to 20 transition types with signal-driven selection (energy, color, visual similarity)
- Per-boundary continuity-informed transitions via sceneIndex matching

### Performance
- GPU pre-warmup (fire-and-forget from from-asset route)
- V-JEPA/Wav2Vec timeout reduced (120s → 45s)
- Gemini file URI reuse for Mode 2 Path C (saves ~32s)

### Build/Deploy
- **ROOT CAUSE**: Vercel was using stale yarn.lock → wrong @smithy/core versions. Fixed by deleting yarn.lock + package-lock.json, keeping only pnpm-lock.yaml
- yarn.lock + package-lock.json added to .gitignore
- Missing files committed: quality-gate.ts, vjepa-service.ts, wav2vec-service.ts
- isPipelineGenerated check: removed sceneIndex (only uses generationUnitId now)
- Main branch merged into our branch (100 commits synced)

### Rules Added
- **Rule 27 (Logs Before Theory)**: When user provides logs, READ THEM FIRST before querying DB or reading code
- **Editframe**: Noted as future integration candidate (rendering engine, HTML/CSS → video)

## OPEN BLOCKERS (Priority Order)

### 1. Overlay Bleed-Through (CRITICAL)
**What**: 10/36 overlays play source video past their intended segment boundary, leaking removed content to the viewer.
**Root cause**: Silence removal creates overlays with `videoStartTime + durationInFrames` ranges that span across removed segments. The merge fix reduced but didn't eliminate — consecutive removals merge correctly but non-consecutive ones (removed segment between two kept segments) still bleed.
**Fix needed**: Validation pass after ALL cuts — check each overlay's source range against the removal plan. If the range includes removed content, split the overlay at the removal boundary. This is a CHECK, not the primary fix (merge is primary).
**Files**: `lib/editron/services/silence-removal-executor.ts`

### 2. Captions — 0 Word Segments (HIGH)
**What**: 29 caption overlays created but each has 0 word segments. Transcription is seeded correctly (2635 words) but word time-range filtering returns empty for every overlay.
**Root cause**: `videoStartTime` is in FRAMES. `caption-service.ts:290-293` converts to ms: `(videoStartTimeFrames / fps) * 1000`. The filtering at line 307-309 checks `w.startMs >= videoStartMs && w.startMs < videoEndMs`. If the videoStartTime offset is wrong (e.g., 158 frames = 5.27s but words start at 1.68s), no words fall in range.
**Fix needed**: Trace the exact videoStartTime values on Mode 2 overlays and verify they match the transcription word timestamps.
**Files**: `lib/editron/services/media/caption-service.ts`, `lib/editron/services/silence-removal-executor.ts` (sets videoStartTime)

### 3. Zooms — All Killed (MEDIUM)
**What**: 0 zooms executed per run. Every zoom candidate killed by "hook zone" check (EDL executor line 666) or motion peak validation.
**Root cause**: Mode 2 segments are short (5-20s). The hook zone check rejects zooms near clip start. For short segments, EVERY position is near the start.
**Fix needed**: Hook zone check needs Mode 2 awareness — either shorter hook zone for short segments, or skip for segments < 10s.
**Files**: `lib/editron/services/edl-executor.ts:666`

### 4. Motion Graphics Crash (LOW)
**What**: `TypeError: Cannot read properties of null (reading 'template')` in motion-graphics-service.ts.
**Root cause**: No template match for "minimal text label", LottieFiles search returns nothing, CSS overlay fallback crashes on null.
**Files**: `lib/editron/services/motion-graphics-service.ts`

### 5. Grok STT 400 Error (LOW)
**What**: "Could not detect audio format from file header" — falls back to Whisper (works but slower).
**Root cause**: R2 presigned URL may not serve correct content-type headers for xAI's format detection.
**Files**: `lib/editron/services/media/transcription-service.ts`

### 6. V-JEPA/Wav2Vec Timeout (LOW)
**What**: Both abort every run. Modal cold start > 45s timeout.
**Root cause**: Pre-warmup fires at upload time but Modal containers take 60-90s to cold start. 45s timeout isn't enough if warmup doesn't complete before the worker reaches Step 3.5.

## Editorial Intent — Stable Prompt State

The editorial intent detector prompt (editorial-intent-detector.ts) has been through 5 iterations. Current stable state:
- META_DISCARD categories: self-corrections, retake requests, BTS chatter, verbal mistakes, counting in, process commentary, creative self-assessment, production decisions, video format/structure commentary, intro/preamble
- CRITICAL ANTI-OVERFIRE RULES: 7 rules including three-way distinction (topic vs video vs production) and orphan detection
- DUPLICATE_TAKE: REMOVED from prompt (code paths remain as dead code)
- Temperature: 0.1 (near-deterministic)
- Batch size: 60 segments per Gemini call

**Known limitation**: Gemini classification is NON-DETERMINISTIC across runs. Same prompt, same segments → different classifications. Segments 1-4 in the Hank Green video sometimes get classified as CONTENT, sometimes as META_DISCARD. No fix for this — it's inherent to LLM classification at temperature 0.1.

## Best-Take Detection — Stable Strategy Stack

`raw-footage-processor.ts` `detectBestTakes()`:
1. **Jaccard similarity** (≥0.6 threshold) — exact repeated sentences
2. **Prefix overlap** (≥4 words) — same opening, different ending
3. **False start** (≤5 words, all words match longer version's prefix) — abandoned short attempts
4. ~~**Keyword overlap**~~ — REMOVED (caused regression, matched different argument points)
5. **Single-word repeat** (exact match within 5 positions) — "Zero."/"Zero."

Post-classification cleanup:
- **Orphan lead-in detection**: short (≤8 words) incomplete segments whose next segment was removed
- **Abandoned micro-start detection**: ≤3 words, incomplete/trailing off, regardless of next segment

## Key Files Changed This Session

| File | Changes |
|------|---------|
| `lib/editron/agent/director-agent.ts` | Path D enrichment, quality review persist, type fixes, Gemini URI reuse, transcription cache seed, transition handling |
| `lib/editron/services/signal-registry.ts` | V-JEPA/Wav2Vec enrichment, speaker change detection, enhanced composites |
| `lib/editron/services/editorial-intent-detector.ts` | 5 prompt iterations, DUPLICATE_TAKE add/remove, orphan detection |
| `lib/editron/services/raw-footage-processor.ts` | 4 best-take strategies, keyword overlap add/remove, getKeywords helper |
| `lib/editron/services/silence-removal-executor.ts` | sceneIndex assignment, gap closing, consecutive removal merging |
| `lib/editron/services/edl-executor.ts` | Single-source transition suppression |
| `lib/editron/services/continuity-service.ts` | 20-type transition vocabulary, signal-driven selection |
| `lib/editron/services/vjepa-service.ts` | Warmup function, timeout 120→45s |
| `lib/editron/services/wav2vec-service.ts` | Warmup function, timeout 60→45s |
| `lib/editron/services/quality-gate.ts` | Committed (was missing) |
| `lib/editron/services/genre-parameter-bandit.ts` | MongoDB persistence, reward feedback loop |
| `lib/editron/services/moment-weight-service.ts` | V-JEPA/Wav2Vec integration functions |
| `lib/editron/agent/tools.ts` | isPipelineGenerated fix (sceneIndex removed from check) |
| `lib/editron/data/edit-profile-types.ts` | Added intent field to ProjectBrief |
| `app/api/services/editron/auto-edit/from-asset/route.ts` | GPU pre-warmup |
| `app/api/internal/workers/video-analysis/route.ts` | Bandit wiring, V-JEPA/Wav2Vec steps |
| `modal/vjepa_visual.py` | Adaptive z-score motion normalization |
| `modal/wav2vec_vocal.py` | Committed |
| `docs/TRIBE_HUMAN_INTEGRATION_PLAN.md` | All statuses updated |
| `next.config.ts` | serverExternalPackages added then removed (was yarn workaround) |
| `package.json` | AWS SDK pins added then removed, pnpm overrides, .gitignore |

## Lessons Learned (add to AGENT_RULES)

1. **Rule 27**: Logs before theory. User provides logs → READ THEM before DB queries or code speculation.
2. **Never commit files created in prior sessions without checking git status first**. quality-gate.ts, vjepa-service.ts, wav2vec-service.ts were all created but never committed — crashed production.
3. **Lexical matching for semantic problems fails**. Keyword overlap and DUPLICATE_TAKE both tried to catch paraphrased retakes — both overcutted because they matched topically related but distinct content. Mechanical matching (exact/prefix) is safe. Semantic matching at scale is unreliable.
4. **Vercel uses whatever lockfile it finds**. Stale yarn.lock caused 4 failed builds. Delete non-authoritative lockfiles. Pin packageManager field.
5. **Single-source ≠ single-scene**. A combined video file can have multiple distinct scenes. Don't use assetId count as proxy for camera angle.
