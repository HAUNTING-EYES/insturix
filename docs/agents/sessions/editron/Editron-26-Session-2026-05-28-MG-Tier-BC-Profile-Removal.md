---
tags:
  - session-notes
  - mg-engine
  - profile-removal
  - grok-stt
  - tribe-worker
date: 2026-05-28
done:
  - MG Tier B2 (GSAP timeline)
  - MG Tier C (particles, masks, overlays, planner wiring)
  - 96 vitest tests
  - Signal naming fix (9 aliases)
  - Pipeline warnings (5 services)
  - Grok STT file upload fix
  - TRIBE worker split
  - speechCoverage gap-based fix (both computations)
  - briefCaptionStyle ReferenceError fix
  - Calibration URLs fixed (11/20)
  - Phase C investigation
  - Mode 2 multi-file investigation
  - Profile removal plan (D-016)
decided:
  - "@tsparticles incompatible with Remotion — use math-driven particles"
  - "Profile system is redundant — D-016 removal planned"
  - "Masks should be rare (budget >= 5, score >= 0.5)"
  - "TRIBE worker separate from video-analysis (3-stage pipeline)"
  - "Grok STT uses file upload per xAI docs, not url parameter"
next:
  - "D-016: Remove profile system (Phase 1-3)"
  - "Remove contentType from transcript editor prompt"
  - "Remove hardcoded pop entrance from composeEmphasis"
  - "Stop profile batch_update_overlays from overriding Utility AI"
wrong:
  - "Grok fix took 3 attempts (should have read xAI docs first)"
  - "Wrong import path (../../ instead of ../) — silent catch hid it"
  - "speechCoverage fixed in one file but not the other"
  - "Mask threshold too low — every MG got a mask"
  - "Rushed into bug fixes without reading rules/memory first"
---

# Session 2026-05-28 — MG Tier B2+C + Grok Crisis + Profile Removal Plan

## Executive Summary

12 commits shipped. MG renderer expanded (GSAP timeline, particles, masks). Grok STT broke mid-session (xAI deprecated `url` parameter), fixed after 3 attempts. TRIBE worker split prevents 800s timeout. speechCoverage cascade found and fixed (two separate computations disagreed). Profile system identified as the root cause of quality regression — D-016 removal planned.

**Duration target video (Hank Green, 1175s original):**
- May 25 baseline: 553s (9:13) with Grok + interview profile
- Session start (broken): 657s (10:57) with Whisper fallback
- Current: 535s (8:55) — Grok file upload works, but profile still overrides Utility AI
- Target after D-016: ~530-560s with signal-driven filter/entrance/hold

---

## 12 Commits (all on `infrastructure-improvs-+Editron`)

| # | SHA | Scope | Lines |
|---|-----|-------|-------|
| 1 | `58b69181` | Tier B2+C: GSAP timeline, particles, masks, calibration URLs, overlay defs | +858 |
| 2 | `508a7f8e` | 96 MG vitest tests (planner, renderers, choreography) | +1,044 |
| 3 | `1bc9fa1d` | Signal naming fix (9 bare-key aliases) + pipelineWarnings (5 services) | +38 |
| 4 | `afd77bbb` | Wire pipelineWarnings to generateCreativeBrief caller | +1 |
| 5 | `16a7fa4b` | Grok R2 presigned URL (didn't fix the issue) | +12 |
| 6 | `32a28723` | Import path fix (../../ → ../) | +1 |
| 7 | `26575af8` | Grok STT file upload per xAI docs (THE fix) | +19 |
| 8 | `7e0f4d18` | TRIBE worker split (video-analysis → tribe-analysis → director) | +553/-183 |
| 9 | `97e3a9d4` | 4 silent catch {} → logged warnings | +4 |
| 10 | `f9859991`+`4dc72dfd` | Gap-based speechCoverage (raw-footage-processor) | +23 |
| 11 | `5e77a192` | briefCaptionStyle ReferenceError fix | +4 |
| 12 | `7f3712c6` | Gap-based speechCoverage (content-type-detector — SECOND computation) | +21 |
| 13 | `28750413` | Mask threshold raised (0.2→0.5, budget 3→5) | +20/-20 |

---

## Bugs Found and Root Causes

### Bug 1: Grok STT 400 "Could not detect audio format"
- **Symptom:** Grok returns 400, falls to Whisper, video 2 min longer
- **Root cause:** xAI deprecated the undocumented `url` parameter in FormData. Their docs say `file` (binary upload) is the official method.
- **NOT caused by:** CDN headers, R2 metadata, presigned URLs, our code changes
- **Fix:** Download file from R2, send as binary Blob with `file` parameter
- **Lesson:** Check API docs FIRST before guessing about infrastructure. Saved in `memory/feedback_check_api_docs_first.md`

### Bug 2: speechCoverage cascade (46% → 99% → 75%)
- **Symptom:** Same video classified as "documentary" instead of "interview", 49s extra content
- **Root cause:** TWO separate speechCoverage computations existed:
  - `content-type-detector.ts:137` — per-word-duration sum (BROKEN with tight timestamps)
  - `raw-footage-processor.ts:664` — gap-based blocks (FIXED)
  - They disagreed by 46 percentage points
- **Fix:** Gap-based blocks in BOTH files. `MAX_GAP_MS = 2000` (⚠️ INVENTED)
- **Side effect:** Old 99.6% was ALSO wrong (overcounting from overlapping timestamps). True coverage ~85-95%.

### Bug 3: briefCaptionStyle ReferenceError
- **Symptom:** `add_captions` action crashes, 0 captions on project
- **Root cause:** Variable declared in `executeDirectorPlan()` (line 118) referenced in `executeAction()` (line 1998) — different function scope
- **Pre-existing:** From commit `8724f6f8`, not this session
- **Fix:** Pass as parameter to `executeAction()`

### Bug 4: 800s Vercel timeout
- **Symptom:** Video-analysis worker killed at 800s, Director never dispatched
- **Root cause:** TRIBE Phase 2 (V-JEPA ~260s + Wav2Vec ~500s) + transcription (~180s) = 715s+ in one function
- **Fix:** Split into 3-stage QStash pipeline: video-analysis → tribe-analysis → director
- **New file:** `app/api/internal/workers/tribe-analysis/route.ts` (372 lines)

### Bug 5: Profile overrides signal system
- **Symptom:** Utility AI picks `vivid` (0.975), profile overwrites with `muted-doc`. MGs all have same `pop` entrance.
- **Root cause:** Profile C-03 "documentary" has `filterPresetId: 'muted-doc'`. Director's `batch_update_overlays` action applies it to ALL video overlays, overwriting Utility AI decisions. `composeEmphasis()` hardcodes `entranceOverride: 'pop'`.
- **NOT fixed yet:** D-016 plan written, implementation next session
- **Evidence:** Log line: "applied muted-doc to 61 overlays (overwrote 61 pre-set filters — profile is source of truth)"

### Bug 6: Masks on every MG
- **Symptom:** Every keyword highlight has a mask element (colored clip-path shape behind text)
- **Root cause:** `mg.mask.circle_reveal` overlay scores > 0.2 for enthusiastic content, budget >= 3 is too low
- **Partial fix:** Threshold raised to 0.5, budget to 5. Real fix: masks shouldn't be on keyword highlights at all.

---

## Architecture Decisions Made

### @tsparticles Rejected for Remotion
- @tsparticles uses `requestAnimationFrame` — incompatible with Remotion's per-frame rendering
- Non-deterministic (delta-time physics), no seek capability, forward-only simulation
- Built math-driven particles instead: `position = f(frame, seed)`, O(1) per frame
- 4 presets: confetti, bokeh, dust, sparks. Seeded PRNG + @remotion/noise
- @tsparticles stays installed for landing page (web UI = fine)

### TRIBE Worker Split (3-stage pipeline)
```
video-analysis (Steps 1-3, ~215s) → tribe-analysis (Steps 3.5-3.7, ~500s) → director (~100s)
```
- Each stage dispatches next via QStash, each within 800s Vercel limit
- V-JEPA needs segments from transcription (sequential dependency preserved)
- Dev fallback runs all inline when no QSTASH_TOKEN

### Gap-Based speechCoverage
- Consecutive words with < 2s gap = continuous speech block
- Robust against STT timestamp style differences (tight vs inclusive)
- `MAX_GAP_MS = 2000` ⚠️ INVENTED — covers sentence pauses, excludes real silence
- Replaces per-word-duration sum which was sensitive to timestamp format

### Profile Removal (D-016) — DECIDED, NOT YET IMPLEMENTED
- Full plan: `D:\Insturix-Brain\03-Decisions\D-016-Profile-System-Removal.md`
- 9 files affected, 3 implementation phases
- Signal system (78 overlays + genre-parameter-computer) replaces all profile decisions
- Content type detection STAYS (useful for Gemini creative brief context)
- Profile infrastructure GOES (54 profiles, profile-detection-service mapping)

---

## What the Next Session Must Do (D-016 Implementation)

### Phase 1: Decouple (2-3 files)
1. **`transcript-editor.ts`** — Remove `contentType` from Gemini prompt context (line 72-77). The 4 cut rules are universal.
2. **`composition-planner.ts`** — Remove hardcoded `entranceOverride: 'pop'` from `composeEmphasis()` (line 514). Let overlay scoring pick entrance.
3. **`composition-planner.ts`** — Remove mask producer for emphasis content shape (or gate on content shape, not just budget/score).

### Phase 2: Replace profile values in Director (~20 references)
Read `director-agent.ts` and replace each `effectiveProfile.X` with:
- `effectiveProfile.filterPresetId` → Utility AI overlay scoring winner (already computed at line 885)
- `effectiveProfile.captionStyle` → Utility AI overlay scoring winner (line 889) or user preference
- `effectiveProfile.graphicsDensity` → `genreParameters.graphicsDensity` (already computed)
- `effectiveProfile.cutsPerMinRange` → `genreParameters.cutsPerMinute` (already computed)
- `effectiveProfile.pacing` → `genreParameters.pacing` (already computed)
- `effectiveProfile.actions` → standard `[filter, MG, captions, quality_review]`
- **CRITICAL:** Remove `batch_update_overlays` action that overwrites Utility AI filter decisions

### Phase 3: Remove infrastructure (3 files)
- `video-analysis/route.ts` — stop selecting profile from content-type-detector
- `profile-detection-service.ts` — simplify to content-type-only (remove profile mapping)
- `edit-profiles.ts` + `edit-profile-types.ts` — archive/delete

### Test Plan
- Same Hank Green video: filter should be `vivid`, not `muted-doc`
- Keyword highlights should have varied entrances (not all `pop`)
- Duration should be ~530-560s
- Run 5-content-type batch test: `npx tsx scripts/test-content-types.mjs`
- Run vitest: `npx vitest run` (168 assertions)
- Run overlay test: `npx tsx scripts/test-mg-overlays.ts` (30 assertions)

---

## Open Issues (Prioritized)

### P0 (blocks quality)
1. **D-016 Profile removal** — profile overrides signal system. THE fix for MG quality + filter + generic entrances.

### P1 (important)
2. **Creative brief decisions in removed gaps** — 8/31 decisions fell in silence-removed sections (frames that no longer exist). Brief uses original timeline frames, not cut-timeline.
3. **210 remaining silent catch blocks** — only 15 of 225 have pipelineWarnings wiring
4. **Aesthetic gate Tier 2 unwired** — needs renderStill infrastructure (Phase D)

### P2 (planned)
5. **Phase C: Asset-Centric** — 40% complete. C-4 semantic search surprisingly mature (65%).
6. **Mode 2 multi-file upload** — single-file works, merge layer IS the feature. 13-19 days.
7. **87 INVENTED thresholds** — calibration pipeline running, Thompson Sampling active
8. **Director monolith 2761 lines** — needs decomposition

---

## Codebase State

### MG Engine
- 20 files, 4,458+ lines
- 11/11 primitive types with renderers AND producers
- 13 entrance, 12 exit, 6 hold patterns
- 78 overlay definitions (48 editing + 30 MG)
- 168 vitest assertions
- 87 INVENTED thresholds (all marked in code)

### Pipeline Architecture (Mode 2)
```
Upload → video-analysis worker (Steps 1-3, ~215s)
  → tribe-analysis worker (V-JEPA + Wav2Vec + Essentia, ~500s)
    → director worker (13-step editing intelligence, ~100s)
      → complete
```

### Packages
- Installed: @remotion/three, @remotion/noise, @remotion/paths, @remotion/shapes, gsap 3.13.0
- Dead weight: @tsparticles/react + @tsparticles/slim (explicitly rejected for Remotion)
- `pnpm-lock.yaml` updated

### Key File Locations
- Director: `lib/editron/agent/director-agent.ts` (2761 lines)
- Profiles: `lib/editron/data/edit-profiles.ts` (54 profiles)
- MG Planner: `lib/editron/motion-graphics/engine/composition-planner.ts` (742 lines)
- MG Renderer: `lib/editron/motion-graphics/engine/composition-renderer.tsx` (751 lines)
- TRIBE Worker: `app/api/internal/workers/tribe-analysis/route.ts` (372 lines)
- Video Analysis: `app/api/internal/workers/video-analysis/route.ts` (686 lines)
- Transcription: `lib/editron/services/media/transcription-service.ts` (~400 lines)
- Content Type: `lib/editron/services/content-type-detector.ts`
- Raw Footage: `lib/editron/services/raw-footage-processor.ts` (~700 lines)
- Signal Registry: `lib/editron/services/signal-registry.ts` (~700 lines)

---

## Learnings for Next Session

### Process
- Read ALL rules before first edit (violated at session start, caught by user)
- Check API docs BEFORE guessing about infrastructure (Grok STT took 3 attempts)
- Silent `catch {}` hides import errors — always log catch blocks
- When fixing a computation, grep for ALL locations that compute the same thing (speechCoverage had two)
- INVENTED thresholds must be marked ⚠️ in code per R29N

### Architecture
- @tsparticles is architecturally wrong for Remotion (rAF vs per-frame)
- The profile system is the main source of quality regression — it overrides better signal-driven decisions
- `composeEmphasis()` hardcodes `pop` entrance, blocking overlay scoring
- Masks make no sense on keyword highlights — only on brand reveals/title cards
- V-JEPA needs segments from transcription (can't parallelize with transcription step)

### Production
- Vercel 800s timeout: split long workers into QStash chains
- R2 CDN proxy doesn't always serve correct Content-Type (Cloudflare edge cache hid this)
- xAI deprecated `url` parameter — use `file` (binary upload) per their docs
- Grok file upload returns "tight" timestamps — different from url path "inclusive" timestamps
- Gap-based speechCoverage (2s threshold) is robust across STT backends

---

## Research Findings

### Phase C Status (verified from codebase)
- C-1 (5-Track on uploads): 75% — video path wired, image/audio stubs
- C-2 (Brand vault): 40% — CRUD exists, Graphiti signal injection 0%
- C-3 (Segment analysis): 25% — API exists, no auto-segmentation
- C-4 (Semantic search): 65% — backend complete, Director warns but doesn't substitute
- C-5 (Director vault search): 15% — read-only plumbing, no auto-substitution
- C-6 (Chapter render): 50% — renderer exists, not wired to finalize

### Mode 2 Multi-File
- Single-file FULLY OPERATIONAL
- Multi-file needs: UI (multiple input), API (assetIds array), transcript merge, analysis merge
- Downstream pipeline already handles multi-clip (Director loops overlays)
- "The merge layer IS the feature" — 13-19 days estimated
- Fully independent from Phase C (shared junction: buildSignalTimeline)

### Competitive (Descript)
- Descript's Underlord is prompt-based: user tells AI what to do, one command at a time
- Editron is autonomous: upload video, get professional edit, zero prompts
- Moat: 34 signals × 78 overlays = continuous signal space vs discrete prompts
- Not a threat to the vision — different architecture entirely

---

## Vault Docs Updated This Session
- `D:\Insturix-Brain\02-Architecture\MG-Engine-State.md` — updated patterns, thresholds, GSAP section
- `D:\Insturix-Brain\03-Decisions\D-016-Profile-System-Removal.md` — NEW, full plan
- `D:\Insturix-Brain\05-Bugs-and-Issues\Index.md` — V-JEPA corrected to WIRED, logo/Gemini closed, scaling backlog added
- `memory/feedback_check_api_docs_first.md` — NEW learning
- `memory/session_handover_2026_05_28_profile_removal.md` — handover summary
