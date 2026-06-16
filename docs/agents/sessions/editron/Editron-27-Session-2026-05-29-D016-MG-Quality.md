---
tags:
  - session-notes
  - d016-profile-removal
  - mg-quality
  - signal-driven
  - investigation
date: 2026-05-29
commits: 9
lines_changed: "+300/-1100"
done:
  - D-016 Profile System Removal (all phases)
  - Path D frame remapping fix
  - Threshold bandit Map deserialization fix
  - 63 silent catch blocks wired
  - MG quality investigation (full 8-gate pipeline trace)
  - MG entrance/hold overlay scoring calibration
  - Signal-driven MG duration
  - Transition tolerance increase
decided:
  - "Profile system is dead — signal + Utility AI drive everything"
  - "Hold patterns: overlay scoring only, no if-statement fallbacks"
  - "gentle-float is universal minimum hold (not static)"
  - "MG duration from genre-parameter-computer graphicsDensity"
  - "Budget system needs full redesign (position-based = template thinking)"
  - "MG type variety must come from signal executor, not Gemini prompt"
next:
  - "Signal-driven MG placement (CRG graphic mappings in signal-executor)"
  - "computeComplexityBudget rewrite (content signals, not position)"
  - "MG type variety from structured content payloads"
  - "Brand token inference from video color_temperature"
  - "Bandit calibration re-run (corrupted MongoDB data)"
wrong:
  - "First MG fix was band-aid (lowered if-statement thresholds) — user caught it"
  - "Text-length duration formula was template thinking — replaced with genre-param"
  - "Saved context instead of fixing when user wanted action"
  - "Tried to run /investigate skill at context limit — should have been direct"
---

# Session 2026-05-29 — D-016 Profile Removal + MG Quality Sprint

## Executive Summary

**Marathon session: 9 commits, ~5 hours.** D-016 profile system fully removed (-922 lines). MG quality investigated end-to-end — pipeline is WIRED but throttled by conservative thresholds and signal poverty. Entrance/hold/duration now signal-driven. Major architecture gap identified: MG placement and type selection is still prompt-driven (Gemini) instead of signal-driven (CRG mappings). User caught band-aid fixes and demanded production-level work.

---

## The 9 Commits

| # | SHA | What | Lines |
|---|-----|------|-------|
| 1 | `8d296acb` | D-016 Phases 1-3A: core profile removal | +71/-158 |
| 2 | `b18f8a92` | D-016 Phase 3B: finalize + video worker + UI | +23/-147 |
| 3 | `629cfd95` | Delete profile-detection-service.ts | -617 |
| 4 | `61ec373d` | Path D frame remapping (original → cut timeline) | +31/-2 |
| 5 | `be143558` | Threshold bandit Map deserialization | +1/-1 |
| 6 | `0925815d` | 63 silent catch blocks → console.warn (34 files) | +86/-92 |
| 7 | `72b5e67c` | MG quality band-aid (entrance slopes + hold thresholds) | +33/-25 |
| 8 | `cfcad619` | MG quality proper (overlay scoring only, signal-driven duration) | +18/-23 |

**Branch:** `infrastructure-improvs-+Editron`
**Latest commit:** `cfcad619`
**Tests:** 168/168 pass, 0 type errors

---

## D-016: Profile System Removal — COMPLETE

### What Was Removed
The profile system was a fragile classification cascade:
```
speechCoverage → contentType → profileId (C-01..C-54) → editing decisions
```
A single wrong number (46% vs 99% speechCoverage) changed the profile, which changed the filter, which changed the transcript editor behavior, which added 49 seconds to a 9-minute video. One number, four layers of cascading failure.

### What Replaced It
```
Signals → overlay scoring → Utility AI → standard action sequence
Signals → genre-parameter-computer → pacing/density/budgets
```

### Files Changed
| File | What changed |
|------|-------------|
| `transcript-editor.ts` | Removed contentType from Gemini prompt. Cuts are universal. |
| `composition-planner.ts` | Removed hardcoded `entranceOverride: 'pop'`. Gated masks off emphasis shapes. |
| `director-agent.ts` | Standard action sequence (no hardcoded filterPresetId). `densityFromGenreParams()` helper. Path D frame remapping. |
| `content-type-detector.ts` | Removed profileId from interface. Removed CONTENT_TYPE_TO_PROFILE mapping (55 lines). |
| `video-analysis/route.ts` | Profile detection removed. Uses initialProfileId (G-01). |
| `tribe-analysis/route.ts` | Same. |
| `director/route.ts` | Same. |
| `finalize/route.ts` | 70-line profile detection + Graphiti boost → hardcoded G-01. |
| `pipeline/video/route.ts` | Profile detection fallback → G-01. |
| `useExportPipeline.ts` | Removed getAutoSelectedProfile + EDIT_PROFILES imports. Pre-fills G-01. |
| `profile-detection-service.ts` | DELETED (617 lines). Zero active importers. |
| `verify-composition-engine.ts` | Updated test assertion. |

### What Still Uses Profiles (can't delete yet)
- `edit-profiles.ts` — director-agent.ts imports `getProfileById` for Mode 1 fallback values
- `edit-profile-types.ts` — 5 type importers (director, editron-config, transition-sfx-placer, export/types, edit-profiles)
- Mode 1 creative intent prompt still reads `effectiveProfile.cutsPerMinRange`, `.graphicsDensity`, `.pacing`, `.name` as fallback

### Evidence D-016 Works (from Vercel logs)
- `[Director] Utility AI: filter → warm-neutral (score: 0.989)` — NOT muted-doc from profile
- `[Director] Caption injection: add_captions(word-by-word) from Utility AI` — NOT profile captionStyle
- `[DirectorWorker] Director 1/3: Apply signal-driven filter to all visual overlays` — standard actions

---

## Path D Frame Remapping Fix

### Problem
Signal executor generates decisions using 5-Track data (original video frames). After silence removal, overlays are on the cut timeline. Decisions in removed gaps (>0.5s tolerance) were silently dropped. 8/31 dropped on the Hank Green 1175s video.

### Fix
Exported `mapOriginalFrameToCutTimeline` from `brief-executor.ts` (already proven in Path E). Applied to Path D decisions before EDL execution in `director-agent.ts`. Decisions in removed gaps snap to nearest clip boundary (5s tolerance) or get skipped with warning.

---

## Threshold Bandit Fix

### Problem
`loadThresholdBanditState` used `Object.entries(doc.arms)` on a MongoDB array of `[key, value]` pairs. `Object.entries` on an array gives `[["0", entry], ["1", entry]]` — numeric indices instead of threshold names. All 170 calibration outcomes were lost.

### Fix
Aligned with genre-parameter-bandit's pattern: `new Map(doc.arms || [])`. The Map constructor correctly accepts `[key, value][]` arrays.

### Still Needed
Corrupted data in MongoDB needs clearing. Re-run calibration: `npx tsx scripts/calibrate/calibrate.ts`

---

## Silent Catch Blocks (Rule 11.75N)

63 silent `catch {}` blocks wired with `console.warn` across 34 files via 3 parallel sub-agents:
- Agent 1: Editron core (23 catches, 8 files) — director, tools, agent-graph, 5-track, graph services
- Agent 2: MG + services (16 catches, 10 files) — gsap, lottie, R2, neo4j, etc.
- Agent 3: API routes (24 catches, 16 files) — workers, media, render, finalize

~100 silent catches remain in ThinkForge, client hooks, auth — lower priority.

---

## MG Quality Investigation — THE DEEP DIVE

### Symptom
MGs look "beginner level" — plain keyword highlights with fade entrance, static hold, top-left position, 2s fixed duration. Despite having 13 entrance patterns, 6 hold patterns, beat sync, kinetic typography, Disney principles, GSAP easing, particles, masks, brand patterns all built and wired.

### Full Pipeline Trace (8 Gates)

| Gate | Status | Evidence |
|------|--------|----------|
| 1. Overlay scoring → planner | OPEN | 30 mg-property definitions scored, passed to planComposition |
| 2. Planner → recipe elements | OPEN | entranceOverride, holdAnimation, textSplit, keyframeTracks all flow |
| 3. Recipe → overlay storage | OPEN | recipe + resolvedTokens + contentSignals stored on overlay |
| 4. Overlay → Remotion renderer | OPEN | MotionGraphicLayerContent reads overlay.recipe |
| 5. Composition renderer → primitives | OPEN | computeAnimationState() runs with Disney principles |
| 6. Property resolver → animation | OPEN | Fallback chain: override → role default → token default |
| 7. Choreography → timing | OPEN | composition-renderer.tsx:39 calls computeChoreography() |
| 8. Signal data availability | **BLOCKED** | Default signals (Wav2Vec failed) miss every threshold |

### Root Cause: Signal Poverty + Conservative Thresholds

The pipeline is FULLY WIRED. Not a single broken connection. The problem is entirely in the INPUTS:

| Feature | Threshold needed | Hank Green signal | Result |
|---------|-----------------|-------------------|--------|
| Hold: pulse | enthusiasm > 0.6 | 0.5 (Wav2Vec failed) | STATIC |
| Hold: breathe | warmth > 0.6 | 0.5 (default) | STATIC |
| Kinetic text | enthusiasm > 0.7 + kinetic entrance | 0.5 + fade | NO SPLIT |
| Entrance: pop | needs slope differentiation | all slope=1 → tie → fade | FADE |
| Particles | budget >= 4 | budget=1-3 (position-based) | SUPPRESSED |

### What We Fixed

**Entrance scoring (overlay-definitions.json):**
Increased slope on primary considerations from 1→3 for fade (formality), pop (enthusiasm), slide (pacing). With slope=3, logistic curves diverge enough that one entrance clearly wins. Informal vlog → pop. Formal → fade. This is CALIBRATION of the signal system, not template thinking.

**Hold patterns (composition-planner.ts):**
REMOVED the 4-line if-statement cascade (`enthusiasm > 0.45 → pulse`, etc.). Those were template fallbacks that bypassed the overlay scoring system. Now overlay scoring is the ONLY decision path. Default = gentle-float (3px Y drift), not static (zero motion = dead text).

**Hold overlay slopes (overlay-definitions.json):**
Boosted primary consideration slopes from 1→2.5 on pulse (enthusiasm), breathe (warmth), float (enthusiasm+warmth). With slope=2.5 and signal=0.5, scores reach ~0.6, clearing the 0.15 winner threshold.

**Duration (edl-executor.ts):**
REMOVED text-length formula (`textLen * 3 + 45`). Replaced with genre-parameter-computer graphicsDensity interpolation: minimal→90 frames (3.0s), moderate→72 frames (2.4s), heavy→55 frames (1.8s). All within CRG constant:animation.keyword_highlight range (1.85-3.0s).

**Transition tolerance (edl-executor.ts):**
Increased snapToClipBoundary default from 45→90 frames, and >20-clip boost from 60→120. After 53% silence removal, clip boundaries shifted >60 frames — 2/3 transitions were dropped.

### What's Still Broken (Next Session)

**1. computeComplexityBudget is position-based (TEMPLATE THINKING)**
```
position_in_video < 0.2 → budget = 1 (bare text, no container, no accent)
position_in_video 0.2-0.6 → budget = 3
position_in_video 0.6-0.8 → budget = 4
position_in_video > 0.8 → budget = 5
```
A keyword highlight at the 5-second mark gets bare text regardless of content importance. Budget should be f(enthusiasm, visceral_impact, formality, entity_importance).

**Gates controlled by budget:**
- Container (pill bg): budget >= 2
- Accent line: budget >= 3
- Brand pattern: budget >= 4
- Particles: budget >= 4
- Masks: budget >= 5

With budget=1 for opening MGs, NONE of these fire. That's why MGs are bare floating text.

**2. MG type variety is prompt-driven (NON-DETERMINISTIC)**
All 11 MGs on the Hank Green video are keyword-highlight. No stat-counters, no lower-thirds, no callouts. The creative brief (Gemini) decides MG types — that's LLM-dependent and non-deterministic.

The CRG HAS graphic mappings:
- `mapping:graphic.keyword_highlight` — entity.name OR repeated emphasis
- `mapping:graphic.stat_counter` — entity.number mentioned
- `mapping:graphic.lower_third` — entity.name at first appearance
- `mapping:graphic.callout` — action reference in speech
- `mapping:graphic.logo_reveal` — brand name at opening/closing

These should fire in the signal-executor as deterministic decisions. The signal executor currently only produces `{type: "graphic", text: "word"}` without structured content payloads.

**3. Brand tokens are generic**
No brand vault data → system-ui font, #4F8EF7 blue accent, standard timing. Genre-parameter-computer computes `color_temperature` which could derive warm/cool accent colors from the video content. Not wired.

**4. Text capitalization**
Keyword highlights show lowercase first letters from transcript. "selection bias" should display as "Selection Bias" or "SELECTION BIAS" depending on formality.

**5. Wav2Vec fallback**
When Wav2Vec fails (as it did on Hank Green), enthusiasm/warmth/visceral default to 0.5. Genre-parameter-computer's `energy_baseline` is a computed fallback but isn't injected into the MG signal snapshot.

---

## User Feedback This Session

1. **"Follow ALL rules from the FIRST edit"** — Retroactive rule compliance wastes time. Evidence blocks before EVERY edit.
2. **"Don't rush"** — Quality over speed. Don't skip checklist.
3. **Band-aid fixes caught** — User rejected lowered if-statement thresholds as "template shit." Demanded the overlay scoring system be the actual decision path. This is Rule 29N (signals, not presets) and Rule 23N (production-grade first time).
4. **"Position should be signal driven"** — Budget from position_in_video is a preset rule, not signal-driven.
5. **"Duration too"** — Text-length formula replaced with genre-param-driven.
6. **"What about generic looking MGs"** — Generic tokens (font, color, spacing) produce generic output. Brand token inference needed.
7. **"Didn't we already build composable MGs?"** — User remembers the signal-driven architecture we designed. Wants to know if it's actually wired. Check commit history for CRG graphic mapping implementations.

---

## Log Analysis: proj_AAefyxxNilnW (Hank Green, 1175s)

### Pipeline Timeline
| Time | Stage | Result |
|------|-------|--------|
| 17:36:42 | Upload | 260MB video (upload_UhZgfvjAXJqm) |
| 17:37:11 | Grok STT | 2867 words, 1 speaker, 1175.4s |
| 17:37:12 | Content type | documentary (0.65), speechCoverage=75.7% |
| 17:41:01 | Transcript editor | 49 keep-ranges, 56.7% kept, 228990ms |
| 17:41:04 | Silence removal | 18617 frames removed, 35262→16550 |
| 17:42:00 | Visual Understanding | Gemini: vlog, indoor-casual/medium/prosumer |
| 17:42:00 | Genre params | pacing=8.0, formality=0.40, zoom_budget=15 |
| 17:42:04 | TRIBE | V-JEPA 7 batches ✅, Essentia BPM=129 ✅ |
| 17:48:55 | **Wav2Vec FAILED** | "This operation was aborted" |
| 17:49:03 | Director | Path E (Creative Brief), 32 decisions |
| 17:50:41 | Brief Executor | 25/32 survived frame mapping, 7 in gaps |
| 17:50:43 | EDL execution | 20 executed, 5 skipped (GUARD) |
| 17:50:43 | Utility AI | filter=warm-neutral (0.989), caption=word-by-word (0.982) |

### Key Numbers
- Duration: 1175s → 552s (53% removed)
- Words: 2867 total, 1627 kept (56.7%)
- MGs: 11 keyword-highlights
- Transitions: 1/3 landed (2 dropped, tolerance too tight — now fixed)
- SFX: 1 ("IMPACT ROLL" from Freesound)
- Captions: 44 overlays
- Video clips: 44 (after silence removal splitting)

---

## Architecture Insights

### What the MG System IS (verified this session)
```
Signal Timeline (71 signals, 500ms grid)
    ↓
Overlay Scoring (72 definitions: 48 editing + 24 MG, additive + multiplicative)
    ↓
Composition Planner: planComposition(intent, tokens, signals, mgScores)
    → mgWinner() picks highest-scoring entrance/hold
    → mgVal() reads property values (font size, opacity, etc.)
    → Content-shape-analyzer infers structure from content payload
    ↓
Recipe: { elements[], layout, exitStyle }
    → Elements: primitive + role + layer + bind + entranceOverride + holdAnimation + textSplit + keyframeTracks
    ↓
Property Resolver: resolveElements(recipe, tokens, content)
    → Fallback chain: el.entranceOverride → ROLE_ENTRANCE_DEFAULTS[role] → tokens.entrancePattern
    ↓
Choreography Computer: computeChoreography(elements, tokens, duration, fps, syncData)
    → Per-element timing: enter/hold/exit frames
    → Beat-sync: snap enterStartFrame to nearest musical beat
    → Disney #2 anticipation: 20% stolen for pre-movement
    ↓
Composition Renderer (Remotion React)
    → computeAnimationState(): 4-layer pipeline
    → 13 entrance patterns (fade, slide×4, scale-up, pop, blur-in, draw, rotate-in, skew-in, zoom-blur, scramble)
    → 8 exit patterns
    → 6 hold patterns (static, pulse, breathe, gentle-float, glow, morph)
    → Disney principles: squash-stretch, anticipation, follow-through, arc, easing
    → SplitTextElement for kinetic per-char/word animation
    → Beat-reactive modulation
    → GSAP: CustomBounce, CustomWiggle, CustomEase
```

### What's Missing From This Architecture
1. **Signal executor → MG decision** path only produces `{text: "word"}`. No structured payloads for stat-counter ({value, label}), lower-third ({name, title}), etc.
2. **Budget is position-based** not content-signal-based
3. **Brand tokens are defaults** without video-derived inference
4. **MG type variety** depends on Gemini prompt (non-deterministic)

### The Question for Next Session
**Can we compose MGs from primitives without preset shapes?**

The 7 shapes (emphasis, numeric, identity, quotation, brand, structured, data-series) are inference targets. The content-shape-analyzer detects them from the content payload. If the signal executor produces rich payloads with `{text, value, name, title, quote, author}`, the analyzer can infer the right shape automatically.

The shapes aren't templates — they're PATTERNS the analyzer recognizes. New patterns can be added by extending the analyzer, not by building new components. This is already the architecture Rule 11 (Motion Graphics is a Full Domain) demanded.

The gap: signal executor doesn't produce the rich payloads. Fix that, and the composition engine produces varied MG types automatically.

---

## Files to Read First Next Session

| File | Why |
|------|-----|
| `lib/editron/services/signal-executor.ts` | Check which CRG graphic mappings fire and what payloads they produce |
| `lib/editron/motion-graphics/engine/content-shape-analyzer.ts` | Understand shape inference from content payload |
| `lib/editron/motion-graphics/engine/composition-planner.ts` | Budget computation + shape routing |
| `lib/editron/engine/overlay-definitions.json` | Current entrance/hold overlay slopes (just calibrated) |
| `lib/editron/data/creative-knowledge-graph.json` | CRG graphic mappings: keyword_highlight, stat_counter, lower_third, callout, logo_reveal |
| `lib/editron/services/genre-parameter-computer.ts` | graphic_density, energy_baseline, formality computation |

---

## Worktree State

- **Primary worktree:** `D:\google downloads\Front-End-main\editron-worktree\` → `infrastructure-improvs-+Editron`
- **Latest commit:** `cfcad619`
- **Status:** Clean (all committed and pushed)
- **Tests:** 168/168 pass
- **Deployment:** Preview on Vercel (dpl_4EG3aswA1zwu2VVPKnskU9y2s515)
