---
tags:
  - architecture
  - mg-engine
  - current-state
date: 2026-05-24
---

# MG Engine State (as of 2026-05-24)

The motion graphics composition engine is signal-driven: 34 continuous signals across 5 perceptual dimensions feed a composition planner that produces Recipes rendered by Remotion. No presets -- every graphic is computed from the intersection of content payload, signal vector, and brand tokens.

---

## Signal System: 34/34 Across 5 Dimensions

All 34 signals are wired and reaching the MG composition planner. See [[Signal-Registry-Deep-Dive]] for the full architecture.

| Dimension   | Count | Signals |
|-------------|-------|---------|
| TEMPORAL    | 2     | `position_in_video`, `time_since_last_cut` |
| CONTENT     | 6     | `name_mentioned`, `number_mentioned`, `speech_coverage`, `energy_delta`, `claim_strength`, `face_present` |
| EMOTIONAL   | 9     | `formality`, `enthusiasm`, `warmth`, `emotional_arousal`, `humor`, `visceral_impact`, `face_emotion`, `stress_detected`, `emotional_alignment` |
| PERCEPTUAL  | 4     | `motion_intensity`, `shot_scale`, `visual_complexity`, `text_on_screen` |
| RHYTHMIC    | 5     | `music_beat`, `music_energy`, `music_section`, `music_tatum`, `bpm` |
| OTHER       | 8     | `visual_dependency`, `pacing_velocity`, `narrative_pressure`, `cinematic_moment`, `active_overlay_count`, `montage_mode`, `visual_significance`, `scene_type` |

Signal consumption in composition:
- **Budget suppression**: `montage_mode > 0.5` or `active_overlay_count >= 3` forces budget to 0. `visual_significance > 0.7` reduces budget by 2.
- **Scene adaptation**: `scene_type='action'` caps elements at 3.
- **Hold pattern selection**: enthusiasm + pacing drives pulse/breathe/gentle-float/static.
- **Keyframe generation**: `visceral_impact > 0.7` triggers 15px drift. `enthusiasm > 0.8 + pacing > 0.6` triggers scale pulse on counters.

---

## Disney Animation Principles: 6/6 Implemented

All 6 applicable Disney principles are wired into the animation state machine in `primitive-renderers.ts`.

| # | Principle | Implementation |
|---|-----------|---------------|
| 1 | **Squash & Stretch** | Independent scaleX/scaleY divergence during scale-up (0.08 factor), pop (0.12 factor), and beat-reactive phases. Volume approximately preserved. |
| 2 | **Anticipation** | Ghost opacity (0.15) pre-entrance carved from first 20% of entrance duration (min 2 frames). Scale shrinks slightly before expanding. |
| 5 | **Follow Through & Overlapping Action** | Damped cosine oscillation after entrance lands. Scale: 4% overshoot over 8 frames. Slides: 3px overshoot over 6 frames. Variable settle durations create natural stagger. |
| 7 | **Arc Motion** | Perpendicular sine offset (0.2 of cross-axis) on all 4 slide entrance/exit patterns. Horizontal slides arc upward, vertical arc rightward. |
| 6 | **Slow In/Out (Easing)** | 17 GSAP easing curves resolved by `gsap-easing.ts`. Remotion spring physics for bounce/elastic. |
| 3 | **Staging** | RecipeLayout positions content for clarity based on `visual_dependency` and `shot_type`. |

Principles #4 (Straight/Pose-to-Pose), #9 (Timing), #11 (Solid Drawing), #12 (Appeal) are inherently satisfied by the keyframe-based system, brand tokens, and composition rules. #8 (Secondary Action) and #10 (Exaggeration) are partial (accent lines animate with text, spring overshoot exists).

---

## 6-Phase Animation System

Every motion graphic element passes through up to 6 sequential phases:

```
ANTICIPATION -> ENTRANCE -> SETTLE -> HOLD (ambient) -> BEAT-REACTIVE -> EXIT
```

### Phase Details

| Phase | Source | Behavior |
|-------|--------|----------|
| **Anticipation** | Disney #2 | Ghost opacity (0.15) with slight shrink. 20% of entrance duration stolen. Scale-up/pop only; others get invisible delay. |
| **Entrance** | Disney #1 S&S + #7 Arc | 13 patterns: fade, slide-up/down/left/right, scale-up, pop, blur-in, draw, rotate-in, skew-in, zoom-blur, scramble. S&S diverges scaleX/scaleY. Arc adds perpendicular sine offset. Scramble uses GSAP ScrambleTextPlugin (CSS fallback: opacity fade). |
| **Settle** | Disney #5 Follow Through | Damped cosine oscillation. Scale: 4% overshoot / 8 frames. Slides: 3px / 6 frames. Overlapping action via variable settle duration. |
| **Hold** | Signal-driven selection | 6 ambient patterns: `static`, `pulse` (2% scale oscillation, 90-frame cycle), `breathe` (15% opacity variance), `gentle-float` (3px Y drift), `glow` (box-shadow oscillation), `morph` (GSAP MorphSVGPlugin shape→target→back, CSS fallback: asymmetric scale). Selection via multiplicative overlay scoring. Foreground elements only. |
| **Beat-Reactive** | D6 hierarchy | 7 metrical levels (tatum through section). Continuous `beat_level` 0-1. Quadratic response scaling. Onset = separate brightness spike. BPM-derived beat grid synthesized at render time. |
| **Exit** | Mirrors entrance | S&S + arc applied in reverse. |

---

## Composition Engine Architecture

### Pipeline (end-to-end, verified)

```
1. Director Step 9 -> addMotionGraphic tool (tools.ts:4502)
   OR EDL executor graphic decision (edl-executor.ts:1092)

2. Feature flag: DEFAULT_CONFIG.features.useCompositionEngine = true

3. Signal resolution:
   edl-executor.ts:1098 -> resolveMotionTokens(rawSignals, brand)
   tools.ts:4552 -> resolveMotionTokens(DEFAULT_SIGNALS, {})

4. Composition:
   planComposition(intent, tokens, signals) -> Recipe
   Recipe = { id, elements[], layout, exitStyle }

5. Structural gate (observe-only):
   checkCompositionStructure(recipe, tokens) -> { pass, score, issues[] }

6. Overlay creation:
   type: 'motion-graphic', recipe embedded, resolvedTokens, contentSignals

7. Remotion render:
   layer-content.tsx -> MotionGraphicLayerContent
   motion-graphic-layer-content.tsx -> SafeCompositionRenderer
   signalCurves synthesized from contentSignals

8. Per-frame animation:
   computeAnimationState(frame, timing, entrance, exit, spatial, holdPattern)
   -> Disney phases -> applyMGKeyframes -> applyAudioReactiveModulation
```

### 8 Content Shapes

| Shape | Use Case | Compose Function |
|-------|----------|-----------------|
| numeric | Stat counters, percentages | `composeNumeric` |
| identity | Speaker lower-thirds | `composeIdentity` |
| quotation | Attributed quotes | `composeQuotation` |
| emphasis | Keyword highlights | `composeEmphasis` |
| data-series | Charts (bar, sparkline, percentage ring) | `composeDataSeries` |
| brand | Logo reveals | `composeBrand` |
| structured | Callouts/annotations | `composeStructured` |
| free-text | Fallback | `composeFreeText` |

### Template Registry (D5)
External code can register custom shapes via `registerCompositionTemplate()` / `getCompositionTemplate()` without modifying the planner switch. Planner checks registry before free-text fallback.

### Signal-Driven Layout
- Exit style, complexity budget, and layout computed from signals (not presets)
- CRG-sourced minimum font sizes (48-72px)
- Formality-based container decisions (high formality = structured containers)
- Brand pattern generation at budget >= 4

---

## Quality Gates

### Tier 1: Structural Gate (inline, free, 7 checks)
File: `structural-gate.ts`
Runs after `planComposition`. Observe-only (logs warnings, does NOT block).

| Check | Standard | Threshold |
|-------|----------|-----------|
| Primary contrast | WCAG AA | 4.5:1 ratio |
| Secondary contrast | WCAG AA | 3:1 ratio |
| Accent visibility | Custom | 2:1 ratio |
| Font size compliance | CRG | 48-72px minimum |
| Element density | Custom | Max 6 foreground elements |
| Narrow layout overflow | Custom | Max 3 text elements |
| Frame brightness match | Custom | Bright > 0.7 or dark < 0.3 flagged |

### Tier 2: Aesthetic Gate (standalone, Gemini Flash)
File: `aesthetic-gate.ts`
4-dimension rubric: readability, contrast, hierarchy, overlap. Each 0-25, total 0-100. Pass threshold 70/100. Temperature 0.1, seed 42.
**Status: built but NOT wired to Director.** Needs rendered frame (not available at composition time). Architectural solution: run in quality-review-service post-render.

---

## Keyframe System (D8)

Types defined in `recipe-types.ts`:
- `MGKeyframe`: frame, value, easing (4 modes)
- `MGKeyframeTrack`: property + keyframes array
- `MGSpeedRamp`: speedCurve keyframes for time remapping (0.1-4.0x)

Renderer: `applyMGKeyframes` in `primitive-renderers.ts` interpolates per-property per-frame.
Speed ramp: `remapFrameBySpeed` integrates speed curve, clamped.
Generation: `resolveKeyframeTracks` adds motion paths from signals.

**Currently generates:**
- `translateY` drift (visceral_impact > 0.7 -> 15px upward drift)
- `scaleX/Y` pulse (enthusiasm > 0.8 + pacing > 0.6 on counters -> 1.05x pulse)

---

## Invented Thresholds (61 total, need calibration)

Every hardcoded number in the MG engine that lacks a verified source. Consolidated from codebase.

### primitive-renderers.ts (17 thresholds)
| Threshold | Value | AE/CRG Range | Purpose |
|-----------|-------|--------------|---------|
| S&S scale-up factor | 0.08 | AE 5-10% | Squash divergence amplitude |
| S&S pop factor | 0.12 | AE 10-15% | Stronger pop squash |
| Arc magnitude | 0.2 | AE 10-25% | Perpendicular sine offset |
| Anticipation ratio | 0.2 | AE 15-25% | Entrance frames stolen |
| Ghost opacity | 0.15 | AE 10-20% | Anticipation ghost |
| Follow-through scale | 0.04 | CRG 3-5% | Overshoot amplitude |
| Follow-through position | 3px | CRG 2-5px | Slide overshoot |
| Settle frames (scale) | 8 | AE 4-12 | Follow-through duration |
| Settle frames (slide) | 6 | AE 4-12 | Overlapping action |
| Hold cycle | 90 frames | AE 2-4s | Ambient animation period |
| Pulse amplitude | 0.02 | AE 1-3% | Hold scale oscillation |
| Breathe range | 0.15 | AE 10-20% | Hold opacity variance |
| Float amplitude | 3px | AE 2-5px | Hold Y drift |
| Beat max scale | 0.05 | CRG 2-5% | D6 hierarchy response |
| Beat max brightness | 0.06 | -- | D6 brightness boost |
| Beat rotation | 0.5 deg | -- | Phrase+ dimensional interest |
| Onset brightness | 0.08 | -- | Transient spike |

### composition-planner.ts (7 thresholds)
| Threshold | Value | Purpose |
|-----------|-------|---------|
| Enthusiasm -> pulse | >0.6 + pacing<0.5 | Hold pattern selection |
| Warmth -> breathe | >0.6 | Hold pattern selection |
| Enthusiasm -> float | >0.4 | Hold pattern selection |
| Visceral -> drift | >0.7 | Keyframe trigger |
| Enthusiasm -> pulse kf | >0.8 + pacing>0.6 | Counter scale pulse |
| Drift amount | 15px | Keyframe drift distance |
| Pulse scale | 1.05 | Keyframe scale pulse |

### content-shape-analyzer.ts (3 thresholds)
| Threshold | Value | Purpose |
|-----------|-------|---------|
| Montage suppress | >0.5 | Budget = 0 |
| Overlay count suppress | >=3 | Budget = 0 |
| Visual significance | >0.7 | Budget reduction |

### structural-gate.ts (4 thresholds)
| Threshold | Value | Purpose |
|-----------|-------|---------|
| Element density cap | 6 | Foreground clutter |
| Bright frame threshold | 0.7 | Brightness mismatch |
| Dark frame threshold | 0.3 | Brightness mismatch |
| Narrow layout text cap | 3 | Overflow risk |

### composition-renderer.ts (1 threshold)
| Threshold | Value | Purpose |
|-----------|-------|---------|
| Caption zone offset | 22% | captionZoneAware shift |

---

## Key Files Map

```
lib/editron/motion-graphics/
  engine/
    recipe-types.ts           -- ALL type definitions (HoldPattern, MGKeyframe, etc.)
    composition-planner.ts    -- Signal-driven Recipe creation, keyframe generation
    composition-renderer.tsx  -- React/Remotion render component
    primitive-renderers.ts    -- Animation state machine (Disney, beats, hold, settle)
    choreography-computer.ts  -- Stagger timing, anticipation phase
    property-resolver.ts      -- Binding resolution (token: -> value)
    content-shape-analyzer.ts -- Layout, budget, exit style from content+signals
    structural-gate.ts        -- Tier 1 aesthetic gate (WCAG, no API)
    aesthetic-gate.ts         -- Tier 2 vision gate (Gemini Flash, standalone)
    composition-templates.ts  -- Extensibility registry for new shapes
    gsap-easing.ts            -- Easing curve resolution (17 GSAP curves)
    gsap-timeline.ts          -- GSAP timeline bridge for Remotion (ScrambleText, DrawSVG, MorphSVG)
    brand-pattern-generator.ts
    brand-composition-rules.ts
    crg-constraint-validator.ts
    data-viz-renderers.tsx
  themes/
    minimal-tech.ts           -- Static reference theme (NOT used in production)
  structures/
    StatCounter.tsx            -- Legacy stat counter (old overlays only)
  context/
    MotionThemeContext.tsx

lib/editron/data/
  motion-theme-resolver.ts    -- DYNAMIC 35-token resolver from signals (production path)

lib/editron/services/
  signal-registry.ts          -- 34 signals across 5 dimensions
  signal-executor.ts          -- Maps registry snapshots -> decision params
  creative-brief.ts           -- Gemini creative brief with JSON retry
  edl-executor.ts             -- Applies decisions, calls planComposition

components/.../overlays/motion-graphic/
  motion-graphic-layer-content.tsx -- Remotion overlay, synthesizeSignalCurves
```

---

## Test Infrastructure

| Script | What | Assertions | Command |
|--------|------|------------|---------|
| `scripts/test-mg-matrix.ts` | 6 signal profiles x composition engine | 21/21 | `npx tsx scripts/test-mg-matrix.ts` |
| `scripts/test-full-pipeline.ts` | 5 EDL decisions x full pipeline (mock signals -> tokens -> recipe -> gate -> curves -> beats) | 32/32 | `npx tsx scripts/test-full-pipeline.ts` |
| `scripts/test-content-types.mjs` | 5 content types x Gemini creative brief (REAL LLM call) | 5/5 types | `node scripts/test-content-types.mjs` (~3-4 min) |
| `scripts/test-full-system.mjs` | Single video full pipeline + HTML timeline | Visual | `node scripts/test-full-system.mjs` (~40s) |
| `scripts/eval-creative-brief-graphics.mjs` | Multi-seed eval harness for graphic decisions | Composite 0.95+ | `node scripts/eval-creative-brief-graphics.mjs --multi-seed` (~8 min) |

### Batch Test Results (5 content types, 313 decisions)
System is content-aware -- adapts graphic mix per content type:
- **Corporate**: 68% stat counters (earnings call with numbers)
- **Entertainment**: 21% lower-thirds (concert vlog with many names)
- **Product review**: 60% stat counters (spec sheet)
- **Tutorial**: mixed stats + keywords (commands + concepts)
- **Talking head**: keyword-heavy (conceptual essay)

### Test Artifacts (HTML dashboards)
- `scripts/content-type-comparison.html` -- visual comparison across 5 types
- `scripts/full-system-test-output.html` -- single video timeline with decision markers

---

## GSAP Timeline Integration (added 2026-05-27)

File: `gsap-timeline.ts` (184 lines). Bridge between Remotion's per-frame rendering and GSAP's timeline-based animation.

**Architecture:** Creates a paused GSAP timeline on mount, seeks to `(frame - startFrame) / fps` each Remotion frame. GSAP computes correct DOM state for that time. This handles effects CSS literally cannot do: text content manipulation, SVG stroke progressive drawing, SVG path morphing.

**Hybrid design:** CSS handles transform/opacity/filter (via `computeAnimationState` → `buildStyle`). GSAP handles content effects only. They animate different properties/targets so they don't conflict. When GSAP plugins unavailable, `areTimelinePluginsAvailable()` gate routes to CSS-only components (graceful degradation, ADDITIVE per Phase 1C).

**Exports:**
- `useGSAPTimeline(frame, fps, builder, startFrame?)` — hook, seeks relative to startFrame
- `buildScrambleEntrance(tl, textEl, finalText, durationSec, chars?)` — ScrambleTextPlugin
- `buildScrambleExit(tl, textEl, durationSec, chars?)` — reverse scramble
- `buildDrawSVGEntrance(tl, pathEl, durationSec)` — stroke 0%→100%
- `buildDrawSVGExit(tl, pathEl, durationSec, offset?)` — stroke 100%→0%
- `buildMorphHold(tl, pathEl, targetPath, holdDurationSec, offset?)` — shape→target→back cycle
- `areTimelinePluginsAvailable()` — plugin availability check

**GSAP components in composition-renderer.tsx:**
- `GSAPScrambleTextElement` — text decode/scramble entrance + scramble-out exit
- `GSAPSVGPathElement` — SVG stroke draw entrance + morph hold + draw-reverse exit

**CRG gaps:** No CKG nodes exist for scramble, DrawSVG, or MorphSVG effects. These extend beyond current CRG coverage. Closest: `technique:animation.typewriter` (30-50ms/char).

### gsap-timeline.ts INVENTED thresholds (6, added to total)
| Threshold | Value | Source | Purpose |
|-----------|-------|--------|---------|
| Scramble revealDelay | 0.3 | ⚠️ INVENTED (CRG typewriter 30-50ms/char → 0.2-0.5s range) | Per-character reveal delay |
| Scramble entrance speed | 0.4 | ⚠️ INVENTED | Scramble update rate |
| Scramble exit speed | 0.6 | ⚠️ INVENTED (faster for urgency, NOT CRG exit_speed_rule) | Exit scramble update rate |
| Morph 50/50 split | 0.5 | ⚠️ INVENTED | Equal time forward/back in morph cycle |
| Default strokeWidth | 2 | CRG constant:animation.accent_line_weight 2-3px | SVG path stroke width |
| SplitText stagger ratio | 0.6 | ⚠️ INVENTED | 60% of entrance for stagger spread |

### composition-renderer.tsx — Particle + Mask INVENTED thresholds (10, added 2026-05-27)
| Threshold | Value | Source | Purpose |
|-----------|-------|--------|---------|
| Max particle cap | 100 | ⚠️ INVENTED — DOM perf ceiling | Particle count limit |
| Default particle count | 40 | ⚠️ INVENTED — moderate density | Default count |
| Default particle size | 6px | ⚠️ INVENTED — typical MG overlay particle | Base size |
| Confetti gravity | 0.012 | ⚠️ INVENTED — ~5% fall/sec at 30fps | Fall acceleration |
| Confetti drift | 12 | ⚠️ INVENTED — moderate horizontal noise | Sideways amplitude |
| Bokeh drift/speed | 6 / 0.008 | ⚠️ INVENTED — gentle float | Dreamy movement |
| Dust gravity | -0.002 | ⚠️ INVENTED — slow upward drift | Rise rate |
| Sparks gravity | -0.02 | ⚠️ INVENTED — fast upward | Spark rise |
| Particle fade-in | 5 frames | ⚠️ INVENTED — quick spawn | Appearance speed |
| Circle mask radius | 70% | ⚠️ INVENTED — covers element w/o corner clip | Reveal max |

**Updated total: 77 INVENTED thresholds** (was 61, +6 GSAP timeline, +10 particle/mask).

---

## What's Working

- Full signal pipe: 34 signals flow from registry through executor to composition planner
- Signal-driven composition: same content produces different visuals based on signal vector
- 6-phase Disney animation with hold patterns and beat-reactive modulation
- GSAP timeline integration: ScrambleText entrance/exit, DrawSVG stroke, MorphSVG hold (CSS fallback when plugins unavailable)
- 13 entrance patterns, 12 exit patterns, 6 hold patterns (up from 9/8/3)
- Kinetic typography: per-char/word stagger via SplitTextElement
- BPM-derived beat grid synthesized at render time (was dead code before this session)
- Structural quality gate (7 WCAG checks, observe-only)
- Creative brief JSON retry with 3 seeds (production fix)
- Content-type-aware graphic selection (verified across 5 types)

## What's Broken

### P0 Bugs (pre-existing, affect every video)
- **A3.1**: Parser montage decomposition wrong (`llm-scene-parser.ts`)
- **A3.2**: Sub-shots share ONE reference image (`storyboard-service.ts`)
- **A3.5.1+2**: Dual transition system producing 10 dip-to-blacks (`director-agent.ts` + `edl-executor.ts`)
- **A3.5.4**: Filter schizophrenia / hue-rotate on nostalgia (`edl-executor.ts`)

### Architecture Gaps
- **No visual dead-air detection**: Gemini Vision + V-JEPA data exists per frame but nobody uses it for cut decisions
- **Non-speech content uneditable**: Creative brief + Director require word indices; music videos, product b-roll, timelapses get zero intelligence
- **Logo reveal over-generation**: LLM produces 5 when prompt says max 2; constraint is prose-only, not code-enforced
- **Aesthetic gate Tier 2 unwired**: `runAestheticGate` exists but nobody calls it

### Unwired Code
- `editronConfig.ts` (100+ values still hardcoded across services)
- Pipeline warnings (failures invisible to user)
- `alignCutsToBeats()` (function exists, never called)
- Confidence tracking (only EDL executor checks; 3 consumers do not)

---

## Related Documents
- [[Signal-Registry-Deep-Dive]] -- full signal architecture
- [[Content-Editing-Knowledge]] -- professional editing principles driving the system
- [[Session-2026-05-22-MG-Engine-Complete]] -- the session that built most of this
