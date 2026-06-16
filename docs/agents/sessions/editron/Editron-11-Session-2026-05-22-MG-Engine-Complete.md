---
tags:
  - session
date: 2026-05-24
---

# Session: 2026-05-22 to 2026-05-24 (MG Engine Complete)

**Branch:** `infrastructure-improvs-+Editron` (deploy branch)
**Worktree:** `D:\google downloads\Front-End-main\editron-worktree\`
**Duration:** ~12 hours | 23 commits | +3,200/-100 lines | 20+ files
**CEO Plan:** 9/9 accepted proposals complete (D1-D9). D10 (LottieGPT) deferred to Phase 2.

---

## What Was Built

### Signal System: 0 -> 34/34

The composition engine went from 8 planner signals (most of which were defaults due to a severed pipe) to 34 real signals across 5 perceptual dimensions. The root cause was found and fixed: `signal-executor.ts buildDecision()` discarded signal values after triggering mappings, so `decision.params.signals` was always undefined. A second bug in `tools.ts` passed empty objects to the theme resolver.

After fixes: both the EDL executor path and the agent tool path carry real signal data into composition planning and theme resolution.

New signals wired this session: `face_present`, `scene_type`, `visual_significance`, `active_overlay_count`, `montage_mode`, `energy_delta`, `speech_coverage`, `emotional_alignment`, `music_tatum`, `visual_complexity`, `text_on_screen`, plus 7 from the prior sub-session (`motion_intensity`, `shot_scale`, `face_emotion`, `speech_energy`, `stress_detected`, `time_since_last_cut`, `cinematic_moment`).

See [[Signal-Registry-Deep-Dive]] for the full architecture.

### Disney Animation: 0 -> 6/6 Principles

All 6 applicable Disney animation principles were implemented in the animation state machine (`primitive-renderers.ts`):

1. **Squash & Stretch** -- Independent scaleX/scaleY divergence on scale-up, pop, and beat-reactive phases
2. **Anticipation** -- Ghost opacity pre-entrance carved from first 20% of entrance duration
3. **Follow Through** -- Damped cosine oscillation after entrance (4% scale overshoot / 8 frames, 3px slide overshoot / 6 frames)
4. **Arc Motion** -- Perpendicular sine offset on all 4 slide entrance/exit patterns
5. **Slow In/Out** -- 17 GSAP easing curves + Remotion spring physics (pre-existing, verified)
6. **Staging** -- RecipeLayout positions content for clarity based on signals (pre-existing, verified)

### 6-Phase Animation System

Every element now passes through: Anticipation -> Entrance -> Settle -> Hold -> Beat-Reactive -> Exit. Hold patterns (pulse, breathe, gentle-float) are signal-driven. Beat-reactive modulation uses the D6 seven-level hierarchy with quadratic response scaling.

### AnimationState Property Expansion: 5 -> 16

Matching After Effects capability. New properties: independent scaleX/scaleY, rotation, skewX, clipProgress, filterBlur, filterBrightness, filterContrast, filterSaturate, letterSpacing, fontSize, textShadowBlur, strokeDashoffset.

### Composition Engine Hardening

- Template registry (D5) for extensible custom shapes without modifying planner
- Structural gate expanded to 7 WCAG checks (observe-only)
- Aesthetic gate (D7) built with Gemini Flash 4-dimension rubric (not yet wired to Director)
- Keyframe + speed ramp type system (D8) with signal-driven generation
- Creative brief JSON retry with 3 seeds (production fix -- ~20-40% parse failures before)

### signalCurves Root Cause Fix

Before this session, `signalCurves` was ALWAYS undefined at render time. All audio-reactive modulation was dead code. Fix: `synthesizeSignalCurves()` in `motion-graphic-layer-content.tsx` converts scalar signal snapshots to per-frame arrays. Beat data generated from BPM using D6 hierarchy formula.

### Investigation: 7 Wiring Gaps Found, 4 Fixed

| Issue | Was | Fix |
|-------|-----|-----|
| signalCurves never reached renderer | DEAD CODE | `synthesizeSignalCurves()` bridge |
| Signals all defaults at render | PARTIAL | Fixed by signalCurves bridge |
| captionZoneAware ignored | GAP | Bottom offset shifts 12% -> 22% when flag set |
| beat_level curve never existed | DEAD CODE | BPM-derived beat grid in synthesizeSignalCurves |
| No graphics in Mode 1 | CONDITIONAL | Not a gap -- different path (Path D vs Path E) |
| Keyframes never trigger on defaults | BY DESIGN | Conservative behavior correct |
| Structural gate too narrow | OK but incomplete | Expanded to 7 checks |

### Batch Testing: 5 Content Types, 313 Decisions

System proved content-aware -- adapts graphic mix per content type. Corporate = 68% stat counters. Entertainment = 21% lower-thirds. Product review = 60% stat counters. Tutorial = mixed. Talking head = keyword-heavy.

### Deep Architecture Research

Researched visual understanding + non-speech editing (the two unsolved problems). Reviewed 4 papers (EditDuet SIGGRAPH 2025, HIVE EMNLP 2025, MVAA, VQ-Insight). Compared vision models (Gemini 2.5 Flash vs Qwen3-VL 8B vs Twelve Labs Pegasus). Surveyed JS/TS library landscape (Essentia.js, Meyda, ffmpeg.wasm). Evaluated Python bridge options (Modal.com preferred).

User proposed TAG (Temporal Anchor Grid) architecture: universal 500ms time coordinate that works for speech AND non-speech content. Three layers: L0 deterministic (silence/beat/scene detection, zero ML), L1 LLM enrichment (additive, never gating), L2 existing signals (additive).

---

## All 23 Commits

| # | Commit | What |
|---|--------|------|
| 1 | `cd6322cc` | Disney #1 S&S + #2 Anticipation + #7 Arc |
| 2 | `ebb46f41` | 5-phase hold animation (pulse/breathe/gentle-float) |
| 3 | `3357d0d3` | name_mentioned signal fix + eval harness |
| 4 | `164cf0e7` | Disney #5 Follow Through |
| 5 | `68f70f49` | D5 template registry |
| 6 | `73539fc2` | D6 beat hierarchy (7 levels) |
| 7 | `d1b32cc5` | D7 aesthetic gate (Tier 2 vision) |
| 8 | `af566004` | D8 keyframe + speed ramp types |
| 9 | `32c67116` | D1 signal wiring (8 new) |
| 10 | `8111ebc6` | D8 renderer wiring (keyframe interpolation) |
| 11 | `fee51969` | D1 signal consumption (8 signals -> composition decisions) |
| 12 | `38fecf93` | Fix: tools.ts empty signal defaults |
| 13 | `fcf93f20` | D1 music_tatum (BPM subdivision) |
| 14 | `076af633` | D1 complete (visual_complexity + text_on_screen = 34/34) |
| 15 | `8e222ada` | Fix: signalCurves wiring + captionZoneAware layout |
| 16 | `86390592` | Fix: BPM-derived beat grid (beat_level was dead code) |
| 17 | `ac40cb39` | Structural gate expanded (7 checks) |
| 18 | `d10f948c` | Test: MG engine matrix (21/21) |
| 19 | `fafd6ad5` | Test: full pipeline integration (32/32) |
| 20 | `87feaff2` | Structural gate Tier 1 + keyframe generation |
| 21 | `cdb7c6a8` | Test: batch content types + full system HTML dashboards |
| 22 | `11d1e61a` | PRODUCTION: creative brief JSON retry (3 seeds) |
| 23 | `cdb7c6a8` | Test: batch content types + full system HTML dashboards |

Prior session commits (May 22, documented in commit audit):
- `c5c0b1ef` -- MG Phase C (structured schema, Tier 1 wiring, data-viz fix, 11 files +449)
- `87418599` -- Runtime guards (rejection surfacing, filler filter, hallucination guard)
- `929b3fe1` -- Signal pipe root cause fix (signal-executor.ts + motion-theme-resolver.ts)
- `1a38b7a7` -- Signal consumption wiring (7 new signals into MG)
- `fe6bbbdd` -- AnimationState expansion (5 -> 16 properties)
- `1182edd7` -- lineHeight + anchorPoint bindings

---

## Key Decisions Made

1. **Signal-driven over preset-driven composition.** Same content + different signals = different visual output. The composition function is a continuous function over signal space, not a lookup table.

2. **34 signals, not 23.** CEO+Elon review found PERCEPTUAL dimension (what the frame looks like) was completely blind. Expanded from 23 to 34 across 5 orthogonal dimensions.

3. **Structural gate is observe-only.** Logs warnings but does not block. Blocking would break the pipeline when thresholds are uncalibrated. Graduate to blocking after calibration.

4. **Aesthetic gate (Tier 2) stays unwired.** Needs rendered frame (not available at composition time). Architectural solution: run post-render in quality-review-service. Not yet implemented.

5. **signalCurves are synthesized, not piped.** Overlay stores scalar snapshots. Renderer synthesizes per-frame arrays including BPM-derived beat grids. This avoids serializing large arrays through the overlay data.

6. **Additive, never gating.** Phase 1C proved that gating on missing visual data (skip transitions when 5-Track hits Gemini 429) makes the system WORSE. Any new visual intelligence must suggest, never block.

7. **TAG architecture proposed but not built.** Universal time coordinate (500ms grid, already exists in signal-registry). Three degradation layers (L0 deterministic, L1 LLM enrichment, L2 existing signals). Needs CEO + eng review before implementation.

8. **LottieGPT deferred to Phase 2.** Our signal-driven architecture wins on production reliability (9/9 dimensions). LottieGPT wins on creative range (novel animation patterns). Best integration: LottieGPT as offline design tool generating new patterns that get curated and added to our system.

---

## What's Broken (Honest List)

### P0 Bugs (pre-existing, every video affected)
- A3.1: Parser montage decomposition wrong
- A3.2: Sub-shots share one reference image
- A3.5.1+2: Dual transition system (10 dip-to-blacks)
- A3.5.4: Filter schizophrenia (hue-rotate on nostalgia)

### Architecture Gaps (identified this session)
- No visual dead-air detection (visual data exists, nobody uses it for cuts)
- Non-speech content uneditable (creative brief + Director require word indices)
- Logo reveal over-generation (LLM ignores max-2 constraint)
- Aesthetic gate Tier 2 unwired

### Unwired Code
- editronConfig.ts (100+ hardcoded values)
- Pipeline warnings (failures invisible to user)
- alignCutsToBeats() (function exists, never called)
- Confidence tracking (only EDL executor checks)

### 61 Invented Thresholds
Every hardcoded number in the MG engine needs calibration against reference videos. Full list in [[MG-Engine-State]].

---

## What's Next

### Before Any Code: Reviews
- `/plan-ceo-review` -- Priority: build visual intelligence or fix P0 bugs first?
- `/plan-eng-review` -- Architecture: is TAG + layered degradation safe?
- Video editor perspective: merge logic (dramatic pause vs dead air)

### Option A: Fix P0 Bugs
A3.2 per-sub-shot image generation (biggest visual impact), A3.1 parser decomposition, A3.5.1+2 dual transition system.

### Option B: Build Visual Intelligence
Essentia.js integration (beat/onset in JS), RMS silence detection from existing energyCurve, frame histogram diff for scene boundaries, signal-driven routing (speech/music/visual/hybrid modes), creative brief prompt variant for t_index coordinates.

### Option C: A then B
Bugs first, then architecture. Safest but slowest to new capability.

---

## Lessons Learned

### Technical
1. signalCurves synthesis is non-obvious -- overlay stores scalars, renderer needs arrays, the bridge must be explicitly wired
2. beat_level does not exist unless you create it from BPM -- the 7-level hierarchy is DERIVED at render time
3. tools.ts and edl-executor.ts are TWO different paths to the same engine -- both must be kept in sync
4. Creative brief JSON parse failure is seed-dependent -- retrying with 3 seeds fixes ~95%
5. Structural gate runs on abstract data (tokens + recipe), not rendered pixels -- this is a feature (free and instant)

### Process
1. Eval harness score (0.95) was misleading -- it measured structural validity, not creative quality
2. Graphify graph is stale for MG engine files (graph built 2026-05-14, engine built 2026-05-21+)
3. Follow ALL rules from FIRST edit, not retroactively

---

## Related Documents
- [[MG-Engine-State]] -- current system state
- [[Signal-Registry-Deep-Dive]] -- signal architecture details
- [[Content-Editing-Knowledge]] -- professional editing principles
