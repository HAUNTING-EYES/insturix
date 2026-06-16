---
tags:
  - architecture
  - pipeline
aliases:
  - Pipeline Map
  - System Architecture
  - Editron Architecture
last_updated: 2026-04-13
sources:
  - system_architecture_map.md
  - editron_architecture_truth.md
---

# Editron Pipeline Map — Complete Architecture Reference

> Consolidated from system_architecture_map.md and editron_architecture_truth.md. How the full pipeline works end-to-end: user inputs through parsing, storyboard, director, EDL, and rendering.

See also: [[Insturix-Vision]] for the north star that drives all architectural decisions.

---

## Pipeline Stages (7)

```
SCRIPT -> PARSE -> STORYBOARD -> VIDEO GEN -> AUDIO -> FINALIZE -> DIRECTOR -> RENDER
```

### Detailed Pipeline Flow (Script to Video)

```
ThinkForge Script
       |
1. LLM Scene Parser (Gemini 2.5 Flash)
   -> scenes[] with: narration, visualDescription, editDirections,
     subShots, sceneType, assetRecommendation, mood
       |
2. Storyboard Service (fal.ai image gen)
   -> reference images per scene
       |
3. Video Generation (fal.ai: Kling/Wan/LTX/Veo/Luma/MiniMax)
   -> AI video clips per scene (async via QStash)
       |
4. TTS (Kokoro primary, Deepgram fallback)
   -> voiceover audio per scene
       |
5. Finalize (scene-to-editron + edit-direction-applier)
   -> Editron project with all overlays
   -> Duration priority: script > voiceover > video > 5s default
   -> Sub-shots use targetDurationSeconds (min 1.5s, max 3s)
   -> Smart clip selection via selectBestSegment()
   -> Dispatches BGM + SFX workers via QStash
       |
6. Director Agent (13-step deterministic executor)
   -> 5-Track analysis per video asset (Gemini Vision)
   -> Unified Intelligence Engine (single Gemini call, full context)
   -> EDL decisions applied (zooms, transitions, graphics, speed, shake)
   -> Zoom validation against motion peaks
   -> Auto post-processing (drift-zoom, freeze-frame, screen zones)
   -> Profile-based actions: filter, transitions, captions, ducking, quality review
   -> Auto-injects captions if user selected a style but profile lacks caption action
       |
7. Remotion Lambda Render -> Final MP4
```

---

## 3-Layer Creative Intent Architecture

```
5-Track Analysis -> Asset Briefing (compressed) -> LLM creative intent -> Intent Translator -> EDL -> Executor
                 -> Raw data (preserved)        -----------------------> (frame resolution) ---/
```

- **Layer 1 (LLM):** Creative decisions — WHAT + WHY, no frame numbers. ~30 constrained intent enums, decisiveMoment in natural language, reasoning.
- **Layer 2 (Code):** Frame resolution — maps creative intent to exact frames using 5-Track data. Waterfall strategy: VO word -> subject -> motion peak -> energy -> temporal -> fallback.
- **Layer 3 (Existing):** EDL executor applies decisions. Snap functions exported for translator. Unchanged.
- **Fallback:** If creative intent fails -> reactive edit engine (legacy).

**Bloomberg Terminal Principle for Assets:** LLM gets compressed briefing (~200 tokens per clip via asset-briefing.ts), code gets raw 5-Track data.

---

## Dependency Chain

```
5-Track Analysis -> EDL Generation -> EDL Execution -> Post-Processing -> Director Actions -> Render
```

---

## User Input Impact Matrix

| Input | Parser | Storyboard | Video Gen | Audio | Director | Render |
|-------|--------|-----------|-----------|-------|----------|--------|
| Script text | PRIMARY | via scenes | via scenes | via moods | via storyboard | via project |
| Aspect ratio | -- | image dims | aspect param | -- | canvas | dimensions |
| Art style | quality tokens | prompt | cinema hardware | mood | -- | -- |
| Video model | -- | -- | endpoint+params+nativeAudio | -- | -- | -- |
| VO toggle | -- | -- | disables native audio | TTS gen/skip | caption decision | include/omit |
| Caption toggle | -- | -- | -- | -- | add_captions | render |
| Profile | -- | -- | -- | -- | ALL 13 steps | edit style |

---

## hasNativeAudio Flow

**Set from model config, not actual detection.**

- Seedance 1.5/2.0: nativeAudio.default=true
- Kling 2.1/2.6, Veo 3.1: false/undefined
- NO ffprobe, NO audio stream check, NO fal.ai response metadata inspected

**Known gaps:**
- If generate_audio=true but model fails -> hasNativeAudio still true -> SFX skipped -> silent scene
- If hasVoiceover -> generate_audio=false sent to fal.ai BUT modelHasNativeAudio() still returns true

**Fix applied (v2):** hasNativeAudio now reflects actual audio request, not model config default.

---

## Profile System

**54 profiles with significant parameter variation:**

| Parameter | Range | Example Extremes |
|-----------|-------|-------------------|
| Pacing | 3-50 cuts/min | D-08 Luxury (3) to B-13 Gaming (50) = 16x range |
| Music volume | 10%-95% | B-13 (10%) to C-01 (95%) = 9.5x range |
| Graphics density | 0-1/30s to 5-8/30s | D-01 to B-13 = 5-8x range |
| Transitions | varies | dip-to-black, glitch, zoom-punch, dissolve, hard-cut |
| Captions | varies | none, subtitle, word-by-word, kinetic/fancy |

Profile detection uses **top match** (not hardcoded G-01). Auto-detection is content-aware.

---

## ROW Layout (Canonical — scene-to-editron.ts)

| Row | Purpose | Z-Index (100-row*10) |
|-----|---------|---------------------|
| 0 | SFX | 100 (top) |
| 1 | BGM | 90 |
| 2 | VIDEO | 80 |
| 3 | VOICEOVER | 70 |
| 4 | CAPTIONS | 60 |
| 5 | TRANSITIONS | 50 |
| 6 | MOTION_GRAPHICS | 40 |

### Exceptions (intentional divergence)

- **Captions** placed at row 0 (not 4) by add_captions tool for z-index visibility above video
- **Transitions** placed at row 1 (not 5) by transition-templates.ts for z-index above video
- **Graphics** (keyword-highlight, logo-reveal) placed at row 1 by edl-executor for z-index

---

## Transition System (Two Paths — needs unification)

### Path A: Clip-Overlap (Production — correct)

- Used by: edit-direction-applier.ts, add_transition tool
- Extends outgoing clip + starts incoming clip early -> overlap
- Keyframe tracks on both clips control the blend
- No separate overlay object
- Visually correct: true cross-fade/wipe between clips

### Path B: HTML Overlay (EDL/Director — misaligned)

- Used by: buildTransitionOverlay() in transition-templates.ts, EDL executor
- Creates separate overlay on row 1 with CSS animations
- Placement: `decision.frame - floor(duration/2)` — centered on EDL frame
- Problem: EDL frame != actual clip boundary -> transition visual doesn't align with cut

**Fix needed:** EDL executor's applyTransition should anchor to actual clip boundaries, not EDL decision frames.

---

## Caption Chain (fully traced)

1. User picks style in ExportToEditronDialog -> "" means "Auto from profile"
2. "" is falsy -> `brief.overrides.captionStyle` = undefined
3. `applyBriefOverrides`: undefined ?? profile.captionStyle -> uses profile default
4. Auto-inject: only adds captions if resolvedCaptionStyle !== 'none'
5. If injected -> add_captions tool -> finds voiceover (row 3, time overlap) -> gets transcription
6. Transcription: getNarrationTextForAsset() -> storyboard DB lookup by audioAssetId
7. Synthetic timings: uses stored audioDurationMs (accurate) or words*400ms (estimate)
8. Caption overlay created with word-level timing at row 0

**Key:** If user leaves "Auto" on a profile with captionStyle:'none', NO captions. User must explicitly pick a style.

---

## Nimit's Rules (Non-Negotiable)

| Rule | Description |
|------|-------------|
| Rule 0 | **Universal Content Compatibility** — must work for product ads, brand ads, UGC, tutorials, any business content |
| Rule 1 | **Post-Phase Verification** — verify nothing is broken/unwired/placeholder after every phase |
| Rule 2 | **No Fallbacks as Solutions** — fix root cause, fallbacks mask problems |
| Rule 3 | **Adversarial Testing** — find every way it can fail before declaring done |
| Rule 4 | **Never Delete Env Vars** — NEVER run `vercel env rm` without explicit user permission |
| Rule 5 | **"Preview" = Vercel Preview** — not local dev server |
| Rule 6 | **Deep Dive Before Fixing** — understand the entire system before touching code |
| Rule 7 | **Ken Burns = Last Resort** — animated stills are absolute last resort |
| Rule 8 | **Script Duration is King** — if the script says 4s, show 4s |
| Rule 9 | **Understand Assets** — system should understand each asset and overall video/script/intent |
| Rule 10 | **No Assumptions** — check actual data, code, user choices |
| Rule 11 | **Code Quality Standards (Priyank Standard)** — one concern per commit, comment old vs new, proper types |

---

## What's Broken / Needs Fixing

| Issue | Severity | Root Cause |
|-------|----------|-----------|
| Captions: user must select style | HIGH | Profile B-07 etc have captionStyle:'none' — if user picks "Auto" on these profiles, no captions |
| Transition misalignment | HIGH | EDL places transitions at decision.frame but actual clip boundaries differ |
| fal.ai BGM/SFX failures | HIGH | API credits/rate limits (external dependency) |
| Content-aware SFX | HIGH | SFX based on script text, not actual video content — NOT BUILT |
| Post-assembly review loop | HIGH | Pipeline is one-shot, no feedback loop — NOT BUILT |
| Beat-synced assembly | MEDIUM | BGM generates AFTER finalize, so cuts can't sync to beats |
| Sub-shot src="" | MEDIUM | Some sub-shot video overlays have empty src string |

---

## Dead Code / Cleanup

| Item | Location | Status |
|------|----------|--------|
| visualInspectFrame tool | tools.ts line 5390 | DEAD — disabled/decoy, never registered |
| useCachedAsset hook | hooks/use-cached-asset.ts | DEAD — exported, never imported |
| stock-video-service.ts | lib/pipeline/ | POTENTIALLY DEAD — superseded by pixabay-service inline logic |
| auto-edit-service.ts | lib/editron/services/ | DEAD — never imported |
| content-graphic-map.ts | Referenced in old docs | DOES NOT EXIST — Phase B4 claim was false |

---

## Key Files Quick Reference

| What | File |
|------|------|
| ROW constants (CANONICAL) | `lib/pipeline/scene-to-editron.ts` |
| Scene parser | `lib/pipeline/llm-scene-parser.ts` |
| Finalize (timeline assembly) | `app/api/services/pipeline/storyboard/[id]/finalize/route.ts` |
| Director Agent | `lib/editron/agent/director-agent.ts` |
| AI Chat Tools (36) | `lib/editron/agent/tools.ts` |
| Unified Intelligence | `lib/editron/services/unified-edit-intelligence.ts` |
| EDL Executor | `lib/editron/services/edl-executor.ts` |
| 5-Track Analysis | `lib/editron/services/five-track-analysis.ts` |
| Decision Budget | `lib/editron/services/decision-budget.ts` |
| Auto Post-Processing | `lib/editron/services/auto-post-processing.ts` |
| Quality Review | `lib/editron/services/quality-review-service.ts` |
| Edit Direction Applier | `lib/pipeline/edit-direction-applier.ts` |
| Transition System | `lib/editron/data/transition-system.ts` |
| Transition Templates | `lib/editron/data/transition-templates.ts` |
| Edit Profiles (54) | `lib/editron/data/edit-profiles.ts` |
| Caption Service | `lib/editron/services/media/caption-service.ts` |
| Transcription Service | `lib/editron/services/media/transcription-service.ts` |
| Export Dialog | `components/dashboard/ThinkForge/ExportToEditronDialog.tsx` |
| Video Worker | `app/api/internal/workers/pipeline/video/route.ts` |
| Audio Worker | `app/api/internal/workers/pipeline/audio/route.ts` |
| Director KB | `DIRECTOR_KNOWLEDGE_BASE.md` (repo root) |
| Asset Briefing | `lib/editron/services/asset-briefing.ts` |
| Intent Translator | `lib/editron/services/intent-translator.ts` |
| Cinema Prompt Config | `lib/editron/data/cinema-prompt-config.ts` |

---

## Phase Status

| Phase | Status | What it covers |
|-------|--------|---------------|
| Phase 0-4: Pipeline + Intelligence | WORKING | Script->video, 5-Track, profiles, transitions |
| Phase A: Stability | DONE | UI fixes, keyframe editor, L-cut handles |
| Phase B: Intelligence Backbone | DONE | 5-Track, Unified Intel, EDL, post-processing |
| Phase C: Asset-Centric | PARTIAL | Smart clip selection DONE. Stock pipeline DEPRECATED. Semantic search NOT done |
| Phase D Infra | CODE COMPLETE | R2 CDN, Redis queue, Lambda render, health checks |
| Phase D Pro | NOT STARTED | Color grading, audio FX, tracking, masking |
| Phase E Scale | NOT STARTED | 3hr video, multi-platform, batch, collaboration |

See also: [[Editron-Stable-V2-Snapshot]] for the verified-working state as of 2026-04-14.
See also: [[CTO-3-Year-Plan]] for long-term product trajectory.
