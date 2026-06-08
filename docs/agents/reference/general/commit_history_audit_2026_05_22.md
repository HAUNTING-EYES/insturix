---
name: commit-history-audit-may-22-2026
description: "All commits on infrastructure-improvs-+Editron from this session. MG Phase C (structured schema, Tier 1 wiring) + runtime guards."
metadata: 
  node_type: memory
  type: project
  last_updated: 2026-05-22
  originSessionId: f1d82ad4-6377-4dac-87b4-198e93d692a9
---

# Commit History Audit — May 22, 2026

Previous audit: `commit_history_audit_2026_05_10.md` (covers May 10)
Note: Commits from May 11-21 sessions documented in session handover files (session_handover_2026_05_21_mg_system.md, session_handover_2026_05_22_mg_engine.md).

## Session: May 22, 2026 (2 commits)

### MG Composition Engine Phase C
- `c5c0b1ef` feat(editron): MG composition engine Phase C — structured schema, Tier 1 wiring, data-viz fix
  - 11 files, +449/-46 lines
  - **Option C structured schema**: tools.ts addMotionGraphicSchema extended with graphicType enum + content fields (name, title, value, label, quote, author, text, body). Composition engine path checks structured fields first, falls back to parseGraphicDescription regex. director-agent.ts maps legacy category→graphicType. agent-graph.ts tool description updated.
  - **Tier 1 wiring**: (1) Data-viz renderers: DataVizElement dispatches to BarChart/PercentageRing/Sparkline by role. (2) Brand patterns: planner calls generateBrandPattern at budget>=4, PatternElement renders CSS background-image. (3) Audio-reactive: applyAudioReactiveModulation wired into every PrimitiveElement. (4) Z-ordering: layer field preserved through property-resolver, sorted by DepthLayer in renderer.
  - **Data-viz chart type fix**: composeDataSeries computes chart role from data shape (1 value=percentage-ring, 5+=sparkline, else=bar-chart) instead of hardcoded 'chart'.
  - **Decision registry**: Updated params for stat-counter (value not endValue), lower-third (name not text), callout (title+body), added graphic_quote_card entry.
  - **Creative brief**: Added <graphic_rules> section with editorial guidance + priority order. Fixed name_mentioned signal (was lowering case before check). Added anti-hallucination rule.
  - **EDL executor**: Backward-compat value/endValue, broadened content guard.
  - **Brand tokens**: primaryColor indigo→warm off-white, fonts Inter→Plus Jakarta Sans.
  - ⚠️ R2 VIOLATION: 11 files in one commit (should have been 2-3 phases)
  - ⚠️ R12N VIOLATION: Mixed 4+ concerns (Option C + Tier 1 + bug fixes + brand tokens)

### Runtime Guards
- `87418599` fix(editron): 3 runtime guards — rejection surfacing, filler filter, hallucination guard
  - 1 file (edl-executor.ts), +77 lines
  - **A3.5.10 fix**: Added `RejectedDecision` interface and `rejectedDecisions[]` to ExecutionResult. Budget rejections, null-return guards, and errors all push to array with type/frame/reason/ruleId. Summary log groups by rejection type.
  - **RC-8 fix**: Filler word filter for keyword-highlights. 45 banned words (good, stuff, thing, like, etc.) + <3 char rejection. ⚠️ INVENTED list.
  - **RC-6 fix**: Name hallucination guard for lower-thirds. Rejects 15 common Gemini placeholders (John Smith, Jane Doe, Speaker, Host, etc.) + <2 char. ⚠️ INVENTED list.
  - Clean commit: one concern (runtime quality guards).

### Signal Pipe Root Cause Fix
- `929b3fe1` fix(editron): root cause — signal pipe severed between executor and composition engine
  - 2 files (signal-executor.ts +71, motion-theme-resolver.ts +8), +74/-3 lines
  - **ROOT CAUSE**: signal-executor.ts `buildDecision()` discarded signal values after triggering mappings. `decision.params.signals` was ALWAYS undefined. edl-executor read `|| {}` → planComposition used DEFAULT_SIGNALS for EVERY graphic. No real signal data ever reached MG.
  - **FIX**: `buildDecision` now receives signal snapshot, maps dot-notation registry keys → flat ContentSignals keys, attaches 23-value subset to `params.signals`. Both grid-based and event-based paths updated.
  - **ContentSignals expanded**: 7 new optional fields (motion_intensity, shot_scale, face_emotion, speech_energy, stress_detected, time_since_last_cut, cinematic_moment) — CEO plan D1.
  - Clean commit: one concern (signal pipe root cause fix).

### Signal Consumption Wiring (CEO Plan D1)
- `1a38b7a7` feat(editron): wire 7 new signals into MG composition — CEO plan D1
  - 2 files (motion-theme-resolver.ts +25, composition-planner.ts +5), +39/-5 lines
  - **resolveAnimation**: speech_energy boosts animation energy, stress_detected triggers overshoot
  - **resolveColor**: face_emotion biases warm/cool color temperature (happy→warm, sad→cool)
  - **resolveLayout**: motion_intensity reduces density on high-motion frames, time_since_last_cut reduces density after recent cuts
  - **composeElements**: cinematic_moment boosts complexity budget +1 for highlight moments
  - All thresholds ⚠️ INVENTED — need calibration
  - Clean commit: one concern (signal consumption)

### Sub-phase 1B: AnimationState Expansion (11→16 properties)
- `fe6bbbdd` feat(editron): expand AnimationState from 5 to 16 properties — matching After Effects
  - 1 file (primitive-renderers.ts), +184/-57 lines
  - **AnimationState expanded**: 11 new fields: independent scaleX/scaleY (was uniform scale), rotation, skewX, clipProgress, filterBlur, filterBrightness, filterContrast, filterSaturate, letterSpacing, fontSize, textShadowBlur, strokeDashoffset.
  - **NEUTRAL constant pattern**: Default AnimationState object used with `{ ...NEUTRAL, <overrides> }` to eliminate boilerplate.
  - **Entrance/exit refactored**: All 9 entrance + 8 exit patterns use NEUTRAL spread. blur-in/blur-out now use real CSS filter (20px ← CRG technique:animation.blur_in). New `draw`/`draw-reverse` patterns use clipProgress.
  - **buildTransformStyle**: Renders independent scaleX/Y, rotation, skewX, CSS filter chain (blur/brightness/contrast/saturate).
  - **buildShapeStyle**: Reads resolvedProps anchorX/anchorY→transformOrigin, strokeColor→borderColor, mixBlendMode, gradientPosition. Line shape uses clipProgress for draw-on.
  - **buildTextStyle**: Animatable letterSpacing (calc offset from base tracking), fontSize (scale factor × base), lineHeight (per-element), textShadowBlur.
  - **applyAudioReactiveModulation**: Updated for scaleX/scaleY (was scale). Beat brightness (filterBrightness *= 1.05 ⚠️ INVENTED). Emotion intensity boost.
  - Clean commit: one concern (property expansion)

- `1182edd7` feat(editron): add lineHeight + anchorPoint bindings to MG composition planner
  - 1 file (composition-planner.ts), +12/-4 lines
  - **lineHeight bindings**: Added to all 7 text elements across 6 compose functions. 1.1 (headings/names/counters), 1.3 (labels/subtitles), 1.4 (body/quotes), 1.2 (quote authors).
  - **anchorPoint binding**: Added anchorX: 0, anchorY: 0.5 to accent line for left-edge draw-on growth.
  - Clean commit: one concern (typography bindings)

### Sub-phase 1C: Disney Animation Principles (#1, #2, #7)
- `cd6322cc` feat(editron): Disney #1 Squash & Stretch + #2 Anticipation + #7 Arc motion for MG animation
  - 3 files (primitive-renderers.ts +91, choreography-computer.ts +16, recipe-types.ts +3), +106/-15 lines
  - **Disney #1 Squash & Stretch**: Damped sine diverges scaleX/scaleY during scale-up (0.08 ⚠️ INVENTED), pop (0.12 ⚠️ INVENTED), scale-down entrance/exit. Volume ~preserved. Beat-reactive S&S: 1.04/1.02 vs old 1.03/1.03 (same area). CRG 4678/4699.
  - **Disney #2 Anticipation**: Optional timing phase carved from first 20% of entrance (min 2 frames). ComputedChoreography gains optional anticipateStartFrame/anticipateEndFrame. Scale-up/pop show ghost (opacity 0.15) with slight shrink. Others get invisible delay. CRG 4231/4569/6076.
  - **Disney #7 Arc Motion**: Perpendicular sine offset (20% of cross-axis ⚠️ INVENTED) added to all 4 slide entrance/exit patterns. Horizontal slides arc upward, vertical arc rightward.
  - All thresholds ⚠️ INVENTED — need calibration against reference videos
  - Clean commit: one concern (Disney animation principles)

### Sub-phase 1D: 5-Phase Animation — Hold Patterns
- `ebb46f41` feat(editron): 5-phase animation — hold patterns (pulse, breathe, gentle-float) for MG composition
  - 5 files (primitive-renderers.ts +36, composition-planner.ts +24, recipe-types.ts +4, composition-renderer.tsx +1, property-resolver.ts +1), +65/-2 lines
  - **HoldPattern type**: `'static' | 'pulse' | 'breathe' | 'gentle-float'` added to recipe-types.ts. holdAnimation field on RecipeElement and ResolvedElement.
  - **applyHoldAnimation**: 90-frame cycle (3s at 30fps ⚠️ INVENTED). pulse: 2% scale oscillation. breathe: 15% opacity variance (0.85–1.0). gentle-float: ±3px Y drift. All amplitudes ⚠️ INVENTED.
  - **Signal-driven selection**: resolveHoldPattern in composition-planner.ts. enthusiasm > 0.6 + pacing_velocity < 0.5 → pulse. warmth > 0.6 → breathe. enthusiasm > 0.4 → gentle-float. All thresholds ⚠️ INVENTED.
  - **Foreground-only**: Hold animation assigned only to layer='foreground' elements. Background/midground stay static.
  - **Wiring**: property-resolver passes holdAnimation through. composition-renderer passes to computeAnimationState. computeAnimationState checks holdPattern before returning NEUTRAL in hold phase.
  - Clean commit: one concern (hold animation patterns)

### Sub-phase 1D (CEO D9): Prompt Fix + Eval
- `3357d0d3` fix(editron): name_mentioned signal filters pronouns + add creative-brief eval harness
  - 2 files (creative-brief.ts +19, eval-creative-brief-graphics.mjs +644 NEW), +663/-1 lines
  - **name_mentioned signal fix**: detectSignalsFromContext fired on ANY capitalized word (148 hits in test transcript, only ~10 actual proper nouns). Added COMMON_CAPS set filtering pronouns (I, I'm, He, She), articles (The, A), interjections (Oh, Yeah, Hey). Now only fires on genuine proper nouns.
  - **Eval harness**: 5-metric scoring (type fidelity, param fidelity, anti-pattern, distribution, density). Mirrors creative-brief.ts buildPrompt. Multi-seed support (seeds 1-10). Baseline: 0.951 avg composite across 6/10 seeds. Prompt is structurally solid — score measures structural validity not creative quality.
  - Clean commit: one concern (signal fix + eval tooling)

### Sub-phase D4 continued: Disney #5 Follow Through & Overlapping Action
- `164cf0e7` feat(editron): Disney #5 Follow Through & Overlapping Action for MG animation
  - 1 file (primitive-renderers.ts +59), +59 lines
  - **Follow Through**: Damped cosine oscillation after entrance lands. cos(2πt) × (1-t)² decay. Peak overshoot at progress=0, settles to NEUTRAL at progress=1.
  - **Pattern-specific settle**: scale-up/pop: 4% scale overshoot, 8-frame settle (CRG pop_in 3-5%). slide-*: 3px position overshoot, 6-frame settle (CRG bounce_drop 2-5px). fade/blur/draw: 0 frames (no visible overshoot).
  - **Overlapping Action**: Variable settle duration per pattern — scale settles in 8 frames, slides in 6 frames. Different inertia creates natural stagger in settling.
  - **Overshoot directions**: slide-left→positive X, slide-right→negative X, slide-up→negative Y, slide-down→positive Y. Mathematically verified against entrance motion direction.
  - CRG-sourced: 0.04 scale amplitude ← technique:animation.pop_in midpoint. 3px position ← technique:animation.bounce_drop range.
  - ⚠️ INVENTED: 8/6 settle frame counts, quadratic decay profile
  - Clean commit: one concern (Disney #5)

### D5: Generic Composition Engine — Template Registry
- `68f70f49` feat(editron): D5 composition template registry for extensible MG shapes
  - 2 files (composition-templates.ts +22 NEW, composition-planner.ts +9), +31/-2 lines
  - **Template registry**: `registerCompositionTemplate`/`getCompositionTemplate` — Map-based registry for custom content shapes. External code registers templates without modifying planner switch.
  - **Planner wiring**: switch default case checks registry before free-text fallback. Existing 7 compose functions unchanged.
  - **R17N deliberation**: 4 approaches evaluated (full table replacement, helper extraction, hybrid, registry). Registry chosen: minimal risk, maximum extensibility, zero regression to working compose functions.
  - Clean commit: one concern (extensibility)

### D6: 7 Beat Hierarchy Levels
- `73539fc2` feat(editron): D6 seven beat hierarchy levels for MG audio-reactive animation
  - 1 file (primitive-renderers.ts +57/-14), +57/-14 lines
  - **7 levels**: tatum (0.0-0.15), tactus (0.15-0.3), bar (0.3-0.5), downbeat (0.5-0.7), phrase (0.7-0.85), section (0.85-1.0). Continuous 0-1 via `beat_level` signal curve.
  - **Quadratic response**: `intensity = level²`. Tatum gets 0.25% scale, section gets 5%. Disney #1 S&S preserved (scaleX > scaleY).
  - **Onset**: Separate `onset` curve for audio transients. 8% brightness spike independent of metric position. ⚠️ INVENTED.
  - **Rotation**: Phrase+ levels add up to 0.5° rotation for dimensional interest. ⚠️ INVENTED.
  - **Backward compat**: If `beat_level` absent, reads legacy `music_beat` binary and maps to tactus level (0.25).
  - **computeBeatResponse**: Pure function → { scaleX, scaleY, brightness, rotation } from level value.
  - CRG-sourced: overshoot 102-105% → 2-5% scale range. All other amplitudes ⚠️ INVENTED.
  - Clean commit: one concern (beat hierarchy)

### D7: Aesthetic Quality Gate
- `d1b32cc5` feat(editron): D7 aesthetic quality gate — Gemini Flash vision scoring for MG frames
  - 1 file (aesthetic-gate.ts +141 NEW), +141 lines
  - **runAestheticGate**: Takes base64 frame → Gemini Flash → 4-dimension rubric (readability, contrast, hierarchy, overlap). Each 0-25, total 0-100. Pass threshold 70.
  - **Standalone service**: Called by Director, NOT inside renderer (no async in Remotion). Temperature 0.1, seed 42, JSON output.
  - **Graceful dev mode**: No API key → auto-pass with warning.
  - Clean commit: one concern (aesthetic gate)

### D8: Crazy Edits Foundation
- `af566004` feat(editron): D8 crazy edits foundation — keyframe + speed ramp types for MG
  - 1 file (recipe-types.ts +26), +26 lines
  - **MGKeyframe/MGKeyframeTrack**: frame, value, easing. MGAnimatableProperty union: translateX/Y, scaleX/Y, rotation, skewX, opacity, filterBlur, filterBrightness.
  - **MGSpeedRamp**: speedCurve keyframes for time remapping (playbackRate 0.1-4.0).
  - **RecipeElement extended**: Optional keyframeTracks + speedRamp fields.
  - Type-only — rendering wiring is future work.
  - Clean commit: one concern (keyframe types)

### D1: Signal Expansion (Phase 2)
- `32c67116` feat(editron): D1 signal expansion — wire 8 high-value signals to MG planner
  - 1 file (signal-executor.ts +9), +9 lines
  - **8 new signals piped**: face_present, scene_type, visual_significance, active_overlay_count, montage_mode, energy_delta, speech_coverage, emotional_alignment.
  - **Total reaching MG**: 31 (was 23). Remaining gap: 3 signals need new computation.
  - Piping only — consumption logic in composition-planner is future work.
  - Clean commit: one concern (signal wiring)

### Bug fix: Agent tool signal defaults
- `38fecf93` fix(editron): agent tool path passes real signal defaults to theme resolver
  - 2 files (tools.ts +2, composition-planner.ts +1), +3/-3 lines
  - tools.ts:4552 was passing `resolveMotionTokens({}, {})` → empty signals = cold/subdued theme for agent-placed graphics. Now imports and uses DEFAULT_SIGNALS. Exported DEFAULT_SIGNALS from composition-planner.ts.
  - Clean commit: one concern (signal defaults)

### D1: Music tatum signal
- `fcf93f20` feat(editron): D1 music_tatum signal — BPM subdivision for 7-level beat hierarchy
  - 2 files (signal-registry.ts +10, signal-executor.ts +2), +13 lines
  - `isMusicTatumAt`: BPM × 4 subdivision, ±25ms tolerance. Piped as `music_tatum`.
  - D1 total: 32/34 signals.
  - Clean commit: one concern (tatum signal)

### Structural gate + keyframe generation
- `87feaff2` feat(editron): Tier 1 structural aesthetic gate + signal-driven keyframe generation
  - 3 files (structural-gate.ts +130 NEW, edl-executor.ts +6, composition-planner.ts +52), +207/-1 lines
  - **Structural gate**: WCAG AA contrast ratio, CRG font size, element density, frame brightness. Wired inline in edl-executor after planComposition. Observe-only (log, don't block). Verified with 5 functional test scenarios.
  - **Keyframe generation**: `resolveKeyframeTracks` adds motion paths based on signals. visceral_impact > 0.7 → 15px upward drift. enthusiasm > 0.8 + pacing > 0.6 → 1.05x scale pulse on counters. Verified with 3 signal level tests.
  - ⚠️ R12N VIOLATION: 2 concerns in one commit (should have been separate)
  - All thresholds: WCAG standard or ⚠️ INVENTED

### D1 COMPLETE: Final 2 signals — PERCEPTUAL gap closed
- `076af633` feat(editron): D1 complete — visual_complexity + text_on_screen close PERCEPTUAL gap
  - 2 files (signal-registry.ts +30, signal-executor.ts +3), +33 lines
  - **visual_complexity**: Weighted proxy from existing keyframeAnalyses: color diversity (0.5 weight) + brightness extremity (0.25) + energy level (0.25). Zero API cost.
  - **text_on_screen**: Boolean from subject tracking `category='text'|'logo'`. Enables future overlap prevention.
  - **D1 FINAL: 34/34 signals across 5 dimensions.** PERCEPTUAL was ZERO before this session → now 4 signals (motion_intensity, shot_scale, visual_complexity, text_on_screen).
  - All thresholds ⚠️ INVENTED (color_count/8, brightness extremity formula, energy mapping)
  - Clean commit: one concern (final signals)
