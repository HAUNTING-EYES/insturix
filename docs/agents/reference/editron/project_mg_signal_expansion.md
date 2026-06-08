# MG Signal Expansion Plan — 2026-05-22

## Problem Statement
44 signals exist in signal-registry.ts. Only 8 reach the composition engine (PlannerSignals).
27 signals are wasted for MG purposes. This limits the visual variety of motion graphics.

## Current Signal Flow
```
signal-registry.ts (44 signals)
    ↓
ContentSignals (17 signals) → motion-theme-resolver.ts → MotionTokens
    ↓
PlannerSignals (8 signals) → composition-planner.ts → Recipe
```

## Signals Already in Registry, NOT Wired to MG (9 signals, ZERO new computation)
1. visual.motion_intensity (line 266) — High motion → simpler MG
2. visual.shot_scale (line 267) — Close-up → smaller MG. Wide → larger.
3. visual.scene_type (line 270) — Talking-head → lower-third placement
4. visual.face_emotion (line 288, V-JEPA) — Emotion → MG color temperature
5. speech.energy (line 241) — High energy → bolder animation
6. structural.time_since_last_cut (line 310) — Long hold → MG opportunity
7. composite.cinematic_moment (line 358) — Cinematic → rich composition
8. composite.montage_mode (line 354) — Montage → skip MG (too fast)
9. audio.music_beat (line 305) — Already in audio-reactive, add to planner

## New Signals Needed (6 signals, new computation)
1. visual.text_on_screen — OCR or V-JEPA text detection. MEDIUM effort.
2. visual.safe_zone_occupied — Subject bbox + overlay positions. EASY.
3. pacing.trend — Derivative of pacing_velocity over 10s window. EASY.
4. content.information_density — Words per second + entity count. EASY.
5. engagement.hook_strength — Composite: first 3s energy + novelty. MEDIUM.
6. visual.dominant_color — K-means or Gemini metadata. EASY (data in 5-Track).

## Target: 8 → 34 signals reaching MG composition (REVISED after CEO+Elon review)
Original target was 23. CEO+Elon review (2026-05-22) found 23 MISSES the entire PERCEPTUAL dimension.
Revised: 5 dimension groups × complete coverage = 34 signals.
State space: 11^34 ≈ 4.5 × 10^35. That's 450 decillion possible MG configurations.

### The 5 Dimension Groups (from CEO+Elon review)
1. **TEMPORAL (5):** position_in_video, section_position, pacing_trend, time_since_last_graphic, content_density_trend
2. **CONTENT (6):** name_mentioned, number_mentioned, sentiment, information_density, topic_keywords, claim_strength
3. **EMOTIONAL (8):** formality, enthusiasm, warmth, emotional_arousal, humor, visceral_impact, face_emotion, vocal_stress
4. **PERCEPTUAL (7):** motion_intensity, shot_type, color_temperature, dominant_color, visual_complexity, text_on_screen, subject_safe_zone ← THE BIG GAP (0 reach MG today)
5. **RHYTHMIC (8):** music_beat, music_section, music_energy, music_downbeat, music_bar_boundary, audio_onset, music_tatum, beat_confidence

## Architecture Insight: Signal-Driven Composition Selection
Instead of `if shape === 'numeric' → stat counter`, use signal weights to determine
which primitives best express the content. The composition function becomes:
f(content_payload, signal_vector_23d, brand_tokens) → Recipe

Signal weights shift composition toward different primitives:
- formality > 0.7 + number_mentioned → big centered counter
- visual_dependency > 0.6 + number_mentioned → chart visualization
- enthusiasm > 0.8 + number_mentioned → counter with overshoot animation
- informal + number → floating number badge

Same content (a number), different signals, completely different visual output.
NOT a preset. A continuous function over signal space.

## Missing Professional Signal Categories
1. Color/Visual mood (color_temperature, palette, brightness, contrast)
2. Spatial awareness (safe zones, existing text, subject position)
3. Content density (information rate, visual complexity)
4. Pacing derivatives (acceleration, rhythm regularity)
5. Engagement indicators (hook strength, attention risk)
6. Multi-modal alignment (speech-visual coherence)
