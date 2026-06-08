---
name: Complete System Audit — 2026-05-14
description: Full audit of ThinkForge + Pipeline + Editron. 254 files, ~98K LOC. Dead code, parked experiments, transition conflicts, ThinkForge data loss (SceneSlots ignored), reuse opportunities. Updated with deep Path D investigation, budget root cause, V-JEPA/Wav2Vec status, production-level assessments.
type: project
originSessionId: 6b91e66b-5e93-497e-9695-0376279de350
---
# Complete System Audit — 2026-05-14

**Audited by:** 3 parallel agents + manual verification
**Scope:** Every .ts file in lib/editron/, lib/pipeline/, lib/thinkforge/, all API routes, all workers

## System Overview

| System | Files | LOC | API Routes | Purpose |
|--------|-------|-----|------------|---------|
| ThinkForge (lib) | 93 | 17,700 | 33 | AI scriptwriting (ideation → outline → full script) |
| Pipeline (bridge) | 30 | 11,257 | 26 | ThinkForge→Editron conversion + asset generation |
| Editron (backend) | 98 | 66,600 | 63 | AI video editor (analysis → decisions → execution → render) |
| **Total** | **221 lib + 122 routes** | **~98,757** | **122** | |

Plus 8 QStash workers handling async heavy processing.

---

## ThinkForge (93 files, ~17,700 LOC)

### Core Architecture
- **21 agents** (agent framework: BaseAgent + StructuredAgent + model-factory)
- **9 services** (db.ts at 3,045 LOC is the core — 60+ exported functions)
- **6 schemas** (ThinkForgeBlock is the primary format, CIR is alternate, canonical.ts is legacy)
- **Subsystems:** versioning (git-like), context assembly, intent classification, mappers, validation, extensions, hooks, export

### Key Agent Capabilities
| Agent | Lines | What it does | Reusable for Editron? |
|-------|-------|-------------|----------------------|
| `script-draft-agent.ts` | 210 | Multi-stage script gen: Contract → Outline → Author → Assembly | Produces ThinkForgeBlock[] that becomes Editron input |
| `script-author-agent.ts` | 395 | 10 document-type-aware role profiles, video_script emits SceneSlots | SceneSlots typed for Editron consumption |
| `architect-agent.ts` | 98 | Script → shot lists (camera, timing, B-roll, music) | NOT currently wired into pipeline. Could enhance storyboard |
| `stylist-agent.ts` | 101 | AI slop detection, pattern interrupts, authenticity 0-100 | Could validate transcript-editor output quality |
| `research-agent.ts` | 236 | Google Search grounding with verified sources | Could power B-roll suggestions for Mode 2 |
| `ingestor-agent.ts` | 95 | Atomic Facts extraction for DataBank | Could process Mode 2 transcripts into searchable knowledge |
| `url-brief-agent.ts` | 283 | Extracts structured briefs from URLs | Reference material ingestion |

### Handoff Point
Single endpoint: `POST /api/services/thinkforge/script/export-for-editron`
- Input: ThinkForgeBlock[] or plainText or CIR
- Processing: `parseScriptWithLLM()` (Gemini Flash) → SceneDescriptor[]
- Fallback: `convertThinkForgeBlocksToScenes()` (regex-based)
- Output: SceneDescriptor[] consumed by Editron storyboard pipeline

---

## Pipeline Bridge (30 files, 11,257 LOC)

### Complete Data Flow (10 steps)
```
1. Script Export (ThinkForge → SceneDescriptor[])
2. Reference Image Gen (per-subject, IP-adapter)
3. Storyboard Image Gen (per-scene, QStash workers)
4. Voiceover Gen (TTS: Kokoro primary, Deepgram fallback)
5. Video Gen (per-scene, QStash workers + 5-Track + quality scoring)
6. Finalize (THE BRIDGE — 1,083 lines — creates Editron project)
7. BGM Gen (CassetteAI, async via QStash)
8. SFX Gen (mirelo/Freesound, async via QStash)
9. Director Agent (13-step deterministic executor)
10. Render (Cloud Run or Remotion Lambda)
```

### Key Files
| File | Lines | Role |
|------|-------|------|
| `llm-scene-parser.ts` | 1,766 | Script→scenes (Gemini Flash), video prompt refinement |
| `storyboard-service.ts` | 984 | Image gen (12 models via fal.ai) |
| `video-generation-service.ts` | 719 | Video gen (Kling, Seedance, Veo, etc.) |
| `scene-to-editron.ts` | 343 | Scene→overlay conversion, ROW layout constants |
| `edit-direction-applier.ts` | 234 | CSS filters, pacing, camera keyframes from script |
| `finalize/route.ts` | 1,083 | THE BRIDGE — 6 asset routing paths, profile detection, worker dispatch |

### Bottleneck: Finalize (1,083 lines)
Handles too much: asset routing (6 paths), edit direction application, gap closing, profile detection, and async worker dispatch. Candidate for splitting.

---

## Editron Backend (98 files, ~66,600 LOC)

### Top 10 Largest Files
| File | Lines | Purpose |
|------|-------|---------|
| `agent/tools.ts` | 5,506 | 35+ AI chat tool definitions — needs splitting by category |
| `agent/director-agent.ts` | 2,058 | 13-step deterministic executor |
| `services/five-track-analysis.ts` | 1,597 | 5-Track video analysis — needs decomposition |
| `services/quality-review-service.ts` | 1,256 | Deterministic 0-100 quality scoring |
| `services/unified-edit-intelligence.ts` | 1,253 | LLM creative intent planning |
| `services/edl-executor.ts` | 1,218 | Applies EDL decisions to overlays |
| `agent/agent-graph.ts` | 1,066 | LangGraph agent for AI chat |
| `services/graph-service.ts` | 994 | Neo4j knowledge graph CRUD |
| `services/signal-registry.ts` | 846 | Signal timeline builder (Mode 2 Path D) |
| `services/reactive-edit-engine.ts` | 788 | EDL generation from 5-Track (Mode 1) |

### Service Categories
**Analysis (5 services, ~3,700 LOC):** five-track-analysis, reactive-edit-engine, cinematic-moment-detector, video-understanding-service, content-type-detector

**Intelligence (8 services, ~4,700 LOC):** signal-registry, signal-executor, genre-parameter-computer, genre-parameter-bandit, moment-weight-service, constraint-enforcer, humanize-pass, unified-edit-intelligence

**Execution (5 services, ~3,200 LOC):** edl-executor, silence-removal-executor, intent-translator, auto-post-processing, decision-budget

**Transcript/Audio (4 services, ~2,400 LOC):** transcript-editor, editorial-intent-detector, raw-footage-processor, content-type-detector

**Media/Assets (8 services, ~3,100 LOC):** asset-resolver, r2-service, gcs-service, upload-service, mp4-duration-service, asset-search-service, media/* barrel

**Project/State (4 services, ~1,400 LOC):** project-service, checkpoint-service, chat-service, render-job-service

**Creative Data (6 services, ~2,400 LOC):** continuity-service, transition-sfx-placer, quality-gate, style-transfer-service, motion-graphics-service, lottie-service

**Graph/Knowledge (3 services, ~1,800 LOC):** graph-service, graph-query, gemini-context-cache

**Infrastructure (3 services, ~600 LOC):** pipeline-warnings, render-queue-service, rate-limiter

---

## Dead Code — Verified

### Actually Dead (safe to delete)
| File | Lines | Status | Evidence |
|------|-------|--------|----------|
| `constants/audio-standards.ts` | 115 | Values migrated to editron-config.ts | Zero importers |
| `pipeline/storyboard-queue-service.ts` | 353 | @deprecated header, Redis superseded by QStash | Explicit deprecation |
| `pipeline/video-queue-service.ts` | 352 | Superseded by QStash direct-dispatch | Still has 2 consumers (cron + status route) — needs cleanup |
| 4 stub API routes | 50 | Return 404 "coming soon" | Never called from frontend |
| ThinkForge deprecated functions | ~145 | Marked @deprecated in 3 agents | Function-level, not file-level |
| ThinkForge `schemas/canonical.ts` | 203 | Legacy format, functionally replaced by ThinkForgeBlock | Still imported by 2 files as bridge |
| ThinkForge `utils/text.ts` | 3 | Empty utility file | 3 lines |
| **Total actually dead** | **~1,221** | | |

### Deliberately Parked Experiments (NOT dead — future tech)
| File | Lines | Why parked | When | Revert commit |
|------|-------|-----------|------|---------------|
| `repetition-intent-discriminator.ts` | 312 | Tested, can't fix upstream cut-quality problems | May 10 | `e9a24a75` |
| `holistic-editor.ts` | 121 | Over-cut (4.8 min vs 7.5 min target) | May 10 | `e9a24a75` |
| `argument-structure-protector.ts` | 93 | Added latency, no quality improvement | May 10 | `e9a24a75` |
| `gemma-editorial-service.ts` | 119 | Gemma base models failed (kept ALL segments), fine-tuning failed 8x | May 10 | Never wired |
| **Total parked** | **645** | All from May 10 cut-quality experimentation session | | |

### Actual Wiring Gap (1 file)
| File | Lines | What's missing |
|------|-------|---------------|
| `project-graph-writer.ts` | 243 | Service + worker exist, call site never added. Should be called after render completion or project save. |

---

## Architecture Observations

### No Circular Imports
Clean dependency graph. Dynamic imports (`await import()`) used throughout to avoid circular references.

### Type Drift Risk
`signal-registry.ts` redeclares `AssetAnalysis` and `RawFootageAnalysis` instead of importing from `five-track-analysis.ts` and `raw-footage-processor.ts`. Parallel type definitions that can diverge.

### Duplicate Functionality
1. **Two beat-detection services:** `services/beat-detection-service.ts` (229 LOC, heuristic) vs `services/media/beat-detection-service.ts` (570 LOC, spectral flux). Root-level is legacy.
2. **Two transition data files:** `transition-system.ts` (keyframe overlap) vs `transition-templates.ts` (HTML overlay). Different purposes but confusing naming.

### Files That Need Splitting
1. `agent/tools.ts` (5,506 lines) — 35+ tools in one file
2. `five-track-analysis.ts` (1,597 lines) — types + DB + 5+ Gemini calls + classification
3. `finalize/route.ts` (1,083 lines) — 6 asset routing paths + edit directions + worker dispatch

---

## Transition Map — Complete Resource Inventory

### 3 Parallel Type Systems (CONFLICT)
| File | Types defined | Used by |
|------|--------------|---------|
| `data/transition-templates.ts` | 20 (`TransitionType` union) | EDL executor (durations + dissolve keyframes only) |
| `data/transition-system.ts` | 22 (TRANSITIONS record) | UI browser panel, add_transition tool |
| `types.ts` TransitionStyle | 12 | Remotion renderer |

### Duration Conflicts
| Transition | transition-templates.ts | transition-system.ts |
|-----------|------------------------|---------------------|
| `dissolve` | 36 frames | 15 frames |
| `dip-to-black` | 12 frames | 18 frames |
| `blur-transition` | 15 frames | 18 frames |

### Ghost Types (defined somewhere, don't exist in data files)
- `morph`, `pixelate`, `color-flash` — in Director valid list, no definition anywhere
- `wipe-up`, `wipe-down`, `slide-push` — in types.ts + SFX placer, no definition in data files
- `zoom-out` — only in transition-system.ts, not in templates or types
- `l-cut`, `j-cut`, `audio-crossfade` — only in transition-system.ts, normalizer maps to hard-cut

### Dead Code in Transitions
- `buildTransitionOverlay()` in transition-templates.ts — dead, EDL creates transitions directly
- `TRANSITION_FACTORIES` in transition-templates.ts — dead, HTML templates unused
- `wipe-left` aliased to `whip-pan` in normalizeTransitionType() — BUG

### Who Creates Transitions (in execution order)
1. **EDL Executor** (Director step 3) — from reactive edit engine decisions
2. **Dedup** (Director step 3.4) — removes duplicates, keeps highest priority
3. **Beat Sync** (Director step 3.5) — snaps frames to beats
4. **SFX Placer** (Director step 3.6) — adds whoosh/impact sounds
5. **add_transition** (Director step 6) — fills remaining gaps via priority chain
6. **Edit Direction Applier** — DISABLED (caused double transitions)

### SFX Mapping (from transition-sfx-placer.ts)
- Whoosh (0.30): dissolve, wipe-*, iris-wipe, blur-transition, slide-*
- Whoosh (0.40): whip-pan
- Impact (0.40): glitch
- Impact (0.55): zoom-punch, flash
- Silence: dip-to-black, dip-to-white, soft-cut, film-burn

---

## ThinkForge → Editron Reuse Opportunities

### HIGH IMPACT — Data Being Thrown Away

**1. SceneSlots structured data is COMPLETELY IGNORED**
When ThinkForge blocks arrive at export-for-editron, `block.scene` fields are thrown away. `richTextToPlain()` flattens everything to text, then the LLM re-derives the same data:
- `scene.visualDescription` — already separated from narration, re-derived by LLM
- `scene.subjects[]` — name + category, NEVER consumed, re-invented by LLM
- `scene.duration` + `durationExplicit` — already calculated, re-calculated
- `scene.mood` — already classified, re-inferred
- `scene.onScreenText[]` — already extracted, re-extracted
- `scene.sfxDescription` / `scene.musicDescription` — already split, re-split

**Fix:** When blocks have `kind === 'scene'` with populated scene slots, pass structured fields directly as LLM hints or bypass LLM for those blocks. Saves tokens, improves accuracy.

**2. Architect Agent shot lists NOT wired to pipeline**
`agents/architect-agent.ts` produces shot lists (camera, framing, motion, duration, B-roll, music) — used only in ThinkForge sidecar UI. Maps ~1:1 to what LLM scene parser outputs. If user already approved a shot list, it should be honored instead of re-derived.

**3. NarrativeContract.medium tells pipeline if TTS is needed — IGNORED**
`agents/script-contract-agent.ts` produces `medium: 'voiceover' | 'visual_manual' | 'slide_narration'`. If `visual_manual`, TTS should be skipped entirely. Currently every script gets TTS.

### MEDIUM IMPACT — Parsed But Not Consumed

**4. narrativeArc** — extracted by LLM parser, reaches unified-edit-intelligence, but NOT consumed by edit-direction-applier or transition selection. Should influence per-act transition patterns and pacing.

**5. graphicsDensity** — extracted (heavy/moderate/minimal) but Director's motion graphics step ignores it, uses own heuristics.

**6. musicMood** — extracted but BGM service never reads it. Uses overallMusicPrompt or per-scene descriptions instead.

**7. EditorialSlots.editorialType** — ThinkForge editor already classifies editorial blocks, but regex parser re-classifies from text patterns.

### LOWER IMPACT — Agent Capabilities Not Connected

**8. Stylist Agent** toneAnalysis → could feed profile detection
**9. Script Coherence Agent** transition suggestions → could map to editDirections
**10. Research Agent** findings → could inform art style + music mood

---

## Session Fixes (2026-05-14)

### P0: Duration Cascade (FIXED)
- `upload/route.ts:174,194` — QStash workers now get `verifiedDuration` not browser duration
- `from-asset/route.ts:88-107` — MP4 parser recovery + hard 400 fail (removed `|| 30` silent fallback)
- `video-analysis/route.ts:52,174,238,270` — `effectiveDurationSec` propagates corrected duration to genre params + bandit

### P1: Continuity Scoring (FIXED)
- `director-agent.ts:719-760` — Per-segment keyframe mapping. Each segment gets its OWN 5-Track colors and energy instead of the whole video's merged data. Nearest-neighbor fallback for short segments. Energy-to-mood derivation replaces hardcoded 'neutral'.

### P1: Transitions/SFX/Keyframes (ROOT CAUSE IDENTIFIED, FIX IMPLEMENTED)
- Root cause: continuity scoring was blind for Mode 2 because all segments got identical data
- Fix: data-driven per-boundary decisions via per-segment keyframe mapping (same fix as above)
- NOT a blanket gate — works for vlogs, compilations, multi-scene uploads, and single-camera equally
