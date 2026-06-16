---
tags:
  - architecture
  - signals
date: 2026-05-24
---

# Signal Registry Deep Dive

The signal system is the nervous system of the MG composition engine. 34 continuous signals across 5 perceptual dimensions drive every composition decision -- which primitives, how many, what arrangement, what animation, what timing. No presets. A continuous function over signal space.

---

## The 5-Dimension Framework

Derived from research (EditDuet SIGGRAPH 2025, VEU-Bench CVPR 2025, "Towards Data-Driven Automatic Video Editing"). Professional editing decisions are driven by 5 orthogonal dimensions. The CEO+Elon review (2026-05-22) found the original 23-signal target missed the PERCEPTUAL dimension entirely. Revised to 34 across all 5.

State space: `11^34 = 4.5 x 10^35` (450 decillion possible MG configurations). This is the moat -- no competitor can replicate without building the same signal infrastructure.

---

## All 34 Signals

### Dimension 1: TEMPORAL (2 wired)

Where are we in time?

| Signal | Range | Source | Status |
|--------|-------|--------|--------|
| `position_in_video` | 0-1 | signal-registry.ts:309 | WIRED |
| `time_since_last_cut` | frames | signal-registry.ts:310 | WIRED |

CEO review identified 3 additional temporal signals as desirable but not yet built: `section_position` (intro/body/climax/outro), `pacing_trend` (derivative of pacing_velocity), `content_density_trend` (word rate derivative).

### Dimension 2: CONTENT (6 wired)

What is being said or shown?

| Signal | Range | Source | Status |
|--------|-------|--------|--------|
| `name_mentioned` | binary | creative-brief.ts:406 | WIRED (pronoun filter added) |
| `number_mentioned` | binary | creative-brief.ts:402 | WIRED |
| `speech_coverage` | 0-1 | signal-registry.ts | WIRED |
| `energy_delta` | -1 to 1 | signal-registry.ts | WIRED |
| `claim_strength` | categorical | signal-registry.ts (event-based) | WIRED |
| `face_present` | binary | signal-registry.ts | WIRED |

### Dimension 3: EMOTIONAL (9 wired)

How does it feel? This is the most complete dimension.

| Signal | Range | Source | Status |
|--------|-------|--------|--------|
| `formality` | -1 to 1 | PlannerSignals:25 | WIRED |
| `enthusiasm` | 0-1 | PlannerSignals:26 | WIRED |
| `warmth` | 0-1 | PlannerSignals:27 | WIRED |
| `emotional_arousal` | 0-1 | PlannerSignals:28 | WIRED |
| `humor` | 0-1 | PlannerSignals:30 | WIRED |
| `visceral_impact` | 0-1 | PlannerSignals:31 | WIRED |
| `face_emotion` | categorical | V-JEPA, signal-registry.ts:288 | WIRED |
| `stress_detected` | binary | Wav2Vec, signal-registry.ts:260 | WIRED |
| `emotional_alignment` | 0-1 | signal-registry.ts | WIRED |

### Dimension 4: PERCEPTUAL (4 wired)

What does the frame look like? This was at ZERO before the May 2026 sessions -- the biggest gap identified in the CEO+Elon review. A professional MG designer's first decision is always perceptual.

| Signal | Range | Source | Status |
|--------|-------|--------|--------|
| `motion_intensity` | 0-1 | signal-registry.ts:266 | WIRED |
| `shot_scale` | categorical | signal-registry.ts:267 | WIRED |
| `visual_complexity` | 0-1 | Weighted proxy: color diversity (0.5) + brightness extremity (0.25) + energy (0.25) | WIRED |
| `text_on_screen` | binary | Subject tracking category='text'/'logo' | WIRED |

CEO review identified 3 additional perceptual signals as desirable: `color_temperature`, `dominant_color`, `subject_safe_zone`.

### Dimension 5: RHYTHMIC (5 wired)

What is the beat doing?

| Signal | Range | Source | Status |
|--------|-------|--------|--------|
| `music_beat` | binary | signal-registry.ts:305 (tactus level) | WIRED |
| `music_energy` | 0-1 | signal-registry.ts:304 | WIRED |
| `music_section` | categorical | signal-registry.ts:306 (verse/chorus/etc) | WIRED |
| `music_tatum` | binary | BPM x4 subdivision, +/-25ms tolerance | WIRED |
| `bpm` | number | signal-registry.ts | WIRED |

### OTHER (8 wired)

Composite and structural signals.

| Signal | Range | Source | Status |
|--------|-------|--------|--------|
| `visual_dependency` | 0-1 | PlannerSignals | WIRED |
| `pacing_velocity` | 0-1 | PlannerSignals | WIRED |
| `narrative_pressure` | 0-1 | PlannerSignals | WIRED |
| `cinematic_moment` | 0-1 | composite, signal-registry.ts:358 | WIRED |
| `active_overlay_count` | integer | signal-registry.ts | WIRED |
| `montage_mode` | 0-1 | composite, signal-registry.ts:354 | WIRED |
| `visual_significance` | 0-1 | signal-registry.ts | WIRED |
| `scene_type` | categorical | signal-registry.ts:270 | WIRED |

---

## The 500ms Grid

File: `signal-registry.ts`
Constant: `GRID_INTERVAL_FRAMES = 15` (500ms at 30fps)

The signal registry evaluates every signal at 500ms intervals across the video timeline. This creates a discrete grid of signal snapshots that the composition engine samples.

### Grid-Based vs Event-Based Signals

| Type | Computation | Examples |
|------|-------------|---------|
| **Grid-based** | Computed at every 500ms interval. Continuous values. | `position_in_video`, `music_energy`, `enthusiasm`, `motion_intensity` |
| **Event-based** | Fire on specific content events. Binary or categorical. | `name_mentioned`, `number_mentioned`, `claim_strength` |

Both types flow through the same pipe. Event-based signals are evaluated against the grid -- if the event falls within a grid cell, that cell gets the signal value.

---

## The Two Signal Paths

The MG pipeline has TWO signal paths. Both now carry real signal data (root cause fix: commit 929b3fe1 + 38fecf93).

### Path 1: ContentSignals -> MotionTokens (visual language)

```
ContentSignals (17 signals)
  -> motion-theme-resolver.ts
  -> resolveMotionTokens(rawSignals, brand)
  -> 35 MotionTokens
```

Affects: colors, typography, animation speed, layout density.
Called by: `edl-executor.ts:1098` AND `tools.ts:4552`.

### Path 2: Signal Snapshots -> PlannerSignals (composition decisions)

```
Signal snapshots (from signal-executor.ts)
  -> decision.params.signals
  -> planComposition(intent, tokens, signals)
  -> Recipe decisions
```

Affects: which elements, complexity budget, hold patterns, keyframe triggers.
Called by: `planComposition()` in `edl-executor.ts:1114` AND `tools.ts:4553`.

### Root Cause Fix History

Before commit 929b3fe1, `signal-executor.ts buildDecision()` discarded signal values after triggering mappings. `decision.params.signals` was ALWAYS undefined. `edl-executor` read `|| {}` and `planComposition` used DEFAULT_SIGNALS for EVERY graphic. No real signal data ever reached MG composition.

Before commit 38fecf93, `tools.ts:4552` passed `resolveMotionTokens({}, {})` -- empty signals produced cold/subdued themes for all agent-placed graphics.

### signalCurves at Render Time

The overlay stores scalar signal snapshots (`contentSignals: {enthusiasm: 0.7, bpm: 120, ...}`). At render time, `motion-graphic-layer-content.tsx` converts these to per-frame arrays via `synthesizeSignalCurves()`. Beat data is generated from BPM using the D6 hierarchy formula. This was a root cause fix (commit 8e222ada) -- before that fix, signalCurves was ALWAYS undefined at render time and all audio-reactive modulation was dead code.

---

## Signal Consumption in Composition

### Budget Suppression
- `montage_mode > 0.5` -> budget = 0 (too fast for graphics)
- `active_overlay_count >= 3` -> budget = 0 (screen already busy)
- `visual_significance > 0.7` -> budget reduced by 2 (important visual, don't occlude)

### Scene Adaptation
- `scene_type = 'action'` -> cap elements at 3

### Hold Pattern Selection
| Condition | Pattern | Behavior |
|-----------|---------|----------|
| enthusiasm > 0.6 + pacing < 0.5 | `pulse` | 2% scale oscillation |
| warmth > 0.6 | `breathe` | 15% opacity variance |
| enthusiasm > 0.4 | `gentle-float` | 3px Y drift |
| default | `static` | No ambient animation |

### Keyframe Generation
- `visceral_impact > 0.7` -> translateY drift (15px upward)
- `enthusiasm > 0.8 + pacing > 0.6` on counters -> scaleX/Y pulse (1.05x)

### Theme Resolution (MotionTokens)
- `speech_energy` boosts animation energy
- `stress_detected` triggers overshoot in entrance
- `face_emotion` biases warm/cool color temperature (happy -> warm, sad -> cool)
- `motion_intensity` reduces layout density on high-motion frames
- `time_since_last_cut` reduces density after recent cuts
- `cinematic_moment` boosts complexity budget +1

---

## CEO + Elon Review Conclusions (2026-05-22)

### Key Finding
23 signals was insufficient. The PERCEPTUAL dimension (what the frame looks like) had ZERO signals reaching MG composition. A professional MG designer's first decision is always perceptual -- is the frame bright or dark? Is there text already on screen? Is the subject centered or off to the side?

### Elon Mode Verdict
Ship all 34. Each signal costs microseconds to compute. The state space is the moat. 10^35 combinations. No competitor replicates this without building the same infrastructure.

### CEO Mode Verdict
The PERCEPTUAL gap is the difference between "graphics that ignore the frame" and "graphics that respect the visual context." Every lower-third that overlaps existing on-screen text, every bright graphic on a bright frame with no contrast -- that is a PERCEPTUAL signal failure. Users perceive it as "the AI doesn't understand what it's looking at."

### Effort Breakdown (from review)
- Wire-only (7 signals): data existed in registry, just needed piping. ~1 day. DONE.
- New EASY (11 signals): derivatives, histograms, BPM math. ~3-4 days. MOSTLY DONE.
- New MEDIUM (4 signals): sentiment model, visual complexity, text detection, tatum. ~1-2 weeks. PARTIALLY DONE.

---

## Future Signal Targets (from CEO review, not yet built)

### Beat Hierarchy Expansion (7 levels identified, 3 wired)
| Level | Name | Duration | Status | MG Application |
|-------|------|----------|--------|----------------|
| 1 | Tatum | ~100-250ms | WIRED (music_tatum) | Micro-animations: shimmer, accent pulse |
| 2 | Beat (Tactus) | ~300-600ms | WIRED (music_beat) | Core beat-sync: scale pop, opacity pulse |
| 3 | Downbeat | Every 2-8 beats | NOT BUILT | Stronger effects: bigger scale, color flash |
| 4 | Bar/Measure | ~1-4 seconds | NOT BUILT | Composition-level: enter/exit at bar boundaries |
| 5 | Phrase | ~4-32 seconds | NOT BUILT | Narrative-level: new MG type at phrase change |
| 6 | Section | ~15-60 seconds | WIRED (music_section) | Density/style shift |
| 7 | Onset | Irregular | NOT BUILT (data exists in 5-Track transients[]) | Transient-reactive: flash on drum hit |

### Missing Perceptual Signals
- `color_temperature` (warm/neutral/cool from frame histogram)
- `dominant_color` (K-means clustering)
- `subject_safe_zone` (quadrant map from subject bbox)

### Missing Content Signals
- `sentiment` (0-1, needs HuggingFace model)
- `information_density` (words/sec + entity count)
- `topic_keywords` (NER extraction)

---

## Related Documents
- [[MG-Engine-State]] -- how signals drive the full composition pipeline
- [[Content-Editing-Knowledge]] -- professional editing principles that informed signal design
- [[Session-2026-05-22-MG-Engine-Complete]] -- the session that wired 34/34 signals
