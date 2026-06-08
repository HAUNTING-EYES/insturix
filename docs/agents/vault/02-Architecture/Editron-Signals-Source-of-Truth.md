---
tags: [architecture, signals, weights, source-of-truth, motion-graphics, reference]
date: 2026-06-03
status: SOURCE OF TRUTH — synthesized from 5 parallel code reads, file:line cited. Verification pass: §9.
grounding: signal-registry.ts, signal-executor.ts, overlay-definitions.json, utility-scorer.ts, response-curves.ts, threshold-registry.ts, threshold-bandit.ts, vjepa-service.ts, wav2vec-service.ts, music-analysis-service.ts, five-track-analysis.ts, creative-graph-parts/ (verified 2026-06-03)
---

# Editron Signals & Weights — Source of Truth

## 0. The pipeline (where a signal is born → where it becomes a pixel)
```
RAW ANALYSIS (Modal GPU + Gemini)                     COMPUTE                      CONSUME
┌─ V-JEPA 2     → visual significance/motion/action/face/eye    ┐
├─ Wav2Vec 2.0  → vocal energy/emotion/pitch/stress/filler      ├─► signal-registry.ts
├─ Essentia     → bpm/beats/sections/energy curve              │   buildSignalTimeline()
└─ 5-Track(Gemini) → shots/motion/keyframes/subjects/speech-seg ┘   • normalize raw
                                                                    • compute composites (Pass 2)
                                                                    • EMA/trajectory (Pass 3)
                                                                    • personality globals
                                                                    → gridSignals (every 15 frames)
                                                                       + eventSignals + globalSignals
                                                                            │
                                                                            ▼
                                                                    signal-executor.ts
                                                                    • SIGNAL_MAP: dot → flat key
                                                                    • build decision.params.signals (34 flat keys)
                                                                            │
                                                                            ▼
                                                  ┌─────────────────────────┴───────────────────────┐
                                                  ▼                                                   ▼
                                        composition-planner.ts                              utility-scorer.ts
                                        (MG form + dials read flat keys)             scoreAllOverlays(91 overlays)
                                                                                     curve(signal) × weight → output value
```

## 1. The numbers at a glance (reconciled — see §9 for the 2× check)
| Thing | Count | Note |
|---|---|---|
| Canonical signals (creative graph, *designed*) | **49** | speech 10 · entity 6 · visual 13 · audio 6 · structural 7 · composite 6 (Part 1) |
| Signal keys actually *emitted* by code | **~66** dot-keys (+aliases) | superset of the 49 — adds EMA/trajectory/enrichment/global |
| Flat keys the **MG planner** receives | **34** | the interface (`decision.params.signals`) — §4 |
| Overlays (signal→value scorers) | **91** | mg-property 43 + transition 14 + zoom 12 + graphic ~6 + caption 5 + filter 6 + cut 3 + camera 2 (§7, counts re-verified §9) |
| Adaptive thresholds | **76** entries | 21 ⚠️INVENTED · 56 bandit-adaptive · 7 fixed (§8) |
| Response curve types | **6** | linear/polynomial/logistic/logit/normal/sine (`response-curves.ts:8-31`) |

## 2. Raw signal producers (the analysis layer)
| Raw signal | Meaning | Range | Produced by (file:line) | Becomes key |
|---|---|---|---|---|
| visual_significance | embedding divergence vs neighbours (visually distinct?) | 0-1 | vjepa-service.ts:161 | visual.significance → visual_significance |
| motion_intensity (VJ) | learned optical-flow magnitude | 0-1 | vjepa-service.ts:162 | visual.motion_intensity |
| action_type | 9-class action recognition | enum | vjepa-service.ts:39-44 | visual.action_type |
| motion_type | subject vs camera motion | enum(4) | vjepa-service.ts:46 | visual.motion_type |
| face_emotion | facial emotion (8) | enum/null | vjepa-service.ts:49 | visual.face_emotion |
| eye_contact | gaze at camera | bool/null | vjepa-service.ts:52 | visual.eye_contact |
| emotion_intensity | vocal arousal/stress | 0-1 | wav2vec-service.ts:25 | speech.emotion_intensity → emotional_arousal |
| emotional_valence | voice tone pos/neg/neutral/mixed | enum | wav2vec-service.ts:26 | speech.valence (→0.8/0.2/0.5) |
| energy (w2v) | semantic speech energy | 0-1 | wav2vec-service.ts:27 | speech.energy → enthusiasm/visceral |
| pitch_variability | prosodic variation (animated?) | 0-1 | wav2vec-service.ts:29 | speech.pitch_variability → humor(0.4) |
| stress_detected | word-level vocal stress | bool | wav2vec-service.ts:30 | speech.stress_detected |
| filler_confidence | P(filler word) | 0-1 | wav2vec-service.ts:31 | → formality (filler rate) |
| bpm / beats / sections / energy_curve / music_presence | tempo, beat grid, song structure, loudness | mixed | music-analysis-service.ts:39-43 (Essentia) | audio.music_* |
| shots / motionSegments / keyframeAnalyses / subjectTracks / speechSegments | 5-track layers (shot cuts, motion, vision keyframes, subject bboxes, speech-semantics) | mixed | five-track-analysis.ts:388/518/859/947/1062 | shots[], subjectTracks[], etc. |

## 3. Every emitted signal — meaning · range · computed-at · feeds (signal-registry.ts)
**SPEECH:** energy(:208)·energy_delta(:209)·speaking_rate_wpm(:209)·silence_duration_ms(:210)·silence_normalized(:211)·coverage(:211)·emotion_intensity(:233,w2v)·emotional_valence(:232,w2v)·pitch_variability(:234,w2v)·stress_detected(:236,w2v)·filler_confidence(:237,w2v). EVENT-based: emphasis_word(:611, dur>1.1×avg)·filler_detected(:717)·speaker_change(:732).
**VISUAL:** motion_intensity(:223/240)·motion_intensity_sustained(:322)·shot_scale(:224)·face_present(:225)·ai_artifact_risk(:226)·scene_type(:226/248)·complexity(:227)·text_on_screen(:228)·significance(:243,VJ)·action_type(:244,VJ)·motion_type(:245,VJ)·face_emotion(:246,VJ)·eye_contact(:249,VJ)·scene_change(:297)·brightness_stability(:301)·engagement(:1177, VES composite of eye_contact .3/significance .25/motion .2/face .15/brightness .1).
**AUDIO:** music_energy(:273)·music_beat(:270)·music_tatum(:548, 60000/(bpm×4)±25ms)·music_section(:274)·bpm(:277).
**STRUCTURAL:** position_in_video(:278)·time_since_last_cut(:279)·active_overlays_count(:280)·cumulative_edit_density(:281).
**COMPOSITE (Pass 2):** narrative_pressure(:330, weights energy .25/delta .25/silence-absent .15/position .15/emotion .1/stress .1)·montage_mode(:332, clip<2s + speech<.3 + music>.3)·cinematic_moment(:347, 2+ peaks/500ms from 6 sources; 5pk=1.0/4=.9/3=.7/2=.5)·emotional_alignment(:354, face vs vocal valence).
**TEMPORAL (Pass 3, EMA α=0.3):** energy_ema(:367)·energy_surprise(:383)·+visual engagement/motion EMA+surprise·energy_trajectory(:387, neutral/rising/peaked/falling/quiet).
**ENTITY (event, transcript):** number(:627, +lookahead for "from X to Y")·cta(:662)·name(:670)·topic_boundary(:683)·rhetorical_question(:691)·claim_strength(:698, assertive=0.8/hedged=0.3 via CLAIM_ENCODINGS :1200).
**GLOBAL (constant):** speech_coverage(:750)·formality(:761)·content_type(:1065)·music_present(:1066)·duration_s(:1067)·music_bpm(:1068)·speaker_count(:1070)·is_multi_speaker(:1079)·enrichment.* (visual_source/speech_source/segment counts/diarization :1081-1085).

## 4. SIGNAL_MAP → the 34 flat keys the MG planner actually reads (signal-executor.ts:395-425)
```
formality, enthusiasm, warmth, emotional_arousal, pacing_velocity, humor, visceral_impact,
visual_dependency, emotion_intensity, pitch_variability, speaking_rate_wpm, silence_duration_ms,
music_energy, music_section, position_in_video, narrative_pressure, motion_intensity, shot_scale,
face_emotion, speech_energy, time_since_last_cut, cinematic_moment, stress_detected, face_present,
scene_type, visual_significance, active_overlay_count, montage_mode, energy_delta, speech_coverage,
music_tatum, visual_complexity, text_on_screen, bpm
```
These are what every MG dial + composer reads. (NB: the 43 MG dials mostly read the 8 PERSONALITY keys below + a few visual/structural ones — see §7.)

## 5. Personality signals — the 8 globals that drive the MG dials (signal-registry.ts:1090-1140)
These are **content heuristics, NOT brand fields** (verified — see [[Brand-Vault-Signals]]).
| Signal | Formula | ⚠️ |
|---|---|---|
| formality | filler-rate buckets: >5%→0.2, >2%→0.4, >1%→0.6, <1%→0.8 | heuristic |
| enthusiasm | w2v energy×1.2 + (emotion>0.5?+0.15) ; fallback speechCov | partly INVENTED weights |
| warmth | 0.6×valence + 0.4×faceCoverage ; fallback 0.3+(speech?0.4) | INVENTED weights |
| emotional_arousal | w2v emotion_intensity (direct) ; fallback 0.4 | — |
| pacing_velocity | 0.5×speechCov + 0.5×avgVisualMotion | INVENTED blend |
| visceral_impact | 0.6×energy + 0.4×emotion ; fallback 0.3 | INVENTED weights |
| visual_dependency | 0.6×(1-faceCoverage) + 0.4×(1-speechCov) | INVENTED weights |
| humor | 0.4×pitch_var + 0.25×(1-formality) + min(rhetoricalQ×0.05,0.15) + 0.2×positiveEnergy | "ALL weights INVENTED" |

## 6. Canonical signal MEANINGS (the 49 designed signals — creative graph, Part 1)
The graph is the *designed* spec (meaning + detection + the quality-gate each informs). Full table in `creative-graph-parts/` (signal: nodes). Highlights of what each family means:
- **speech (10):** energy(delivery intensity)·energy_delta(building/winding)·speaking_rate_wpm(>180=caption risk)·pitch_contour(question/statement)·silence_duration_ms(breath/dramatic/dead-air)·emphasis_word(zoom/graphic anchor)·filler_detected(removal)·emotional_valence(text-tone mismatch)·speaker_change(interview)·formality(style).
- **entity (6):** number(stat anchor; dual-coding)·cta(high-weight, final 25%)·rhetorical_question(open loop, Zeigarnik)·topic_boundary(reset, cosine Δ>0.3)·claim_strength(assertive vs hedged → never stat a hedge)·narrative_phase(arc).
- **visual (13):** motion_intensity·motion_type·action_type·shot_scale(3+ same=monotony)·shot_composition(eye-trace)·face_present(unsafe zones)·face_emotion·eye_contact(social cognition)·color_temperature(Δ>1500K+dissolve=ugly)·visual_complexity(>0.7+fast cut=overload)·screen_direction(180° rule)·scene_type·ai_artifact_risk(>0.6 held>3s→cut).
- **audio (6):** music_energy·music_beat(4+ on-beat=metronomic)·music_section·music_key·music_bpm·ambient_type(continuity).
- **structural (7):** position_in_video(hook/CTA zones)·time_since_last_cut/zoom/graphic(spacing)·active_overlays_count(>3 overload)·cumulative_edit_density·scene_index.
- **composite (6):** narrative_pressure(charged silence — don't cut, Tarkovsky)·reaction_moment(cut to listener)·montage_mode·cinematic_moment(multi-track peak)·eye_trace_position(Murch #4)·movement_phrase_phase(Pearlman).

## 7. The overlay catalog — what reads what, and the weights (overlay-definitions.json)
**Scoring formula** (`utility-scorer.ts`): per consideration `curveOut = evaluateCurve(curveType, params{slope,exponent,xShift,yShift}, signal)`, optional `invert`. Combine: **multiplicative** (default) `totalScore = weight × Π(compensated)` or **additive** `weight × mean`. Output: `min + totalScore×(max−min)` (proportional) or `fixedValue`.

**91 overlays across 9 categories.** The 43 **mg-property** dials (the MG "look"):
- **typography (5):** font_size(visceral,enthusiasm→36-160) · font_weight(enthusiasm,¬formality→300-800) · letter_tracking · line_height · text_transform_tendency
- **arrangement (2):** horizontal(enthusiasm,pacing) · vertical(formality,warmth)
- **emphasis (1):** scale_contrast(enthusiasm,¬formality→1.4-2.2)
- **layout (1):** center_avoidance(¬visual_dependency,speech_coverage)
- **styling (3):** container_opacity(formality,warmth→0.3-0.92) · corner_radius(¬formality,warmth,enthusiasm→2-16) · surface_complexity(¬formality,enthusiasm)
- **color (2):** saturation_boost(enthusiasm,visual_dependency→0-0.25) · accent_usage(visceral,enthusiasm,¬formality)
- **animation entrance (8):** fade·pop·slide·blur·scale·rotate·skew·zoom_blur (each argmax-selected from enthusiasm/visceral/pacing/formality)
- **animation hold (4):** glow·pulse·breathe·float
- **animation entrance_speed (1):** (¬pacing,¬enthusiasm→0.15-0.6)
- **particle (4):** confetti·bokeh·dust·sparks
- **mask (2):** circle_reveal·wipe_reveal
- **structure (10):** accent_line·side_bar·backdrop_card·divider·underline·kicker·badge·brackets·corner_marks·annotation
*(⚠️ 3 dials wired but were dead: saturation_boost, surface_complexity, entrance_speed — see plan.)*

Other categories (signal→fixed decision): **transition (14)**·**zoom (12)**·**graphic (6: stat_graphic, lower_third, callout, keyword_highlight)**·**caption (5)**·**filter (6)**·**cut (3)**·**camera (2)**. Full per-overlay curve params: `overlay-definitions.json`.

**Signal dominance across dials:** `formality` (~13 refs) and `enthusiasm` (~13) dominate the MG look; `visceral_impact` (~9) triggers dramatic effects; `visual_dependency` drives layout. **The 43 MG dials barely use the rich per-moment signals (motion/significance/face) — they mostly run off the 8 personality globals.** (This is why MG output is monotonous: the dials read a near-constant personality vector, not the varying per-moment signals.)

## 8. The threshold registry (76 entries) + the bandit
`threshold-registry.ts` — every tunable number. Sources: 9 CRG, 18 After-Effects-practice, 27 domain, 1 WCAG, **21 ⚠️INVENTED**. 56 are bandit-adaptive, 7 fixed (contrast 0.7 WCAG, vjepa-batch 30, api-delay 2.5, crg-passes 3, the brand-pattern + dataviz constants). Key MG ones: mg-element-count-limit(6), mg-text-element-limit(3), contrast-threshold(0.7), cinematic-moment-threshold(0.6 INVENTED), content-shape-significance(0.7 INVENTED), enthusiasm-scale-pulse-trigger(0.8 INVENTED), time-since-cut-density-threshold(30f INVENTED).

**Bandit (`threshold-bandit.ts`):** Thompson sampling, Normal-Normal. Reward = `{kept:1, modified:0.5, removed:0}` (3-value enum — a float silently no-ops). Activation floor `MIN_DECISIONS_FOR_ACTIVATION=10`. Update: `rewardSign×0.1` dampening (INVENTED). Sampler uses **`Math.random()` (non-deterministic — Rule-18N violation)**. Per-(threshold,context) arms keyed by contentType/speechBucket/durationBucket/platform. `REASON_TO_THRESHOLDS` maps decision reasons → the thresholds they gate. Persisted in Mongo `threshold_bandit_states`.

## 9. Verification (the 2× pass) + discrepancies
**Cross-read reconciliation** (5 agents, then re-checked below):
- **49 vs 66 vs 100:** the graph designs **49** signals; the code EMITS ~**66** dot-keys (the 49 + EMA/trajectory/enrichment/global derivatives) and exposes **34** flat keys to the MG planner. Not a conflict — three different layers (design / emit / MG-interface).
- ⚠️ **Overlay per-category counts need a code re-count** — one agent's section headers disagreed with its own row counts (e.g. graphic "7" header vs 6 rows). The **43 mg-property** and **91 total** are consistent; the sub-category splits (zoom 12, transition 14, graphic 6-7) are the soft numbers. → §9 action below.
- ⚠️ **formality** confirmed a content heuristic (filler-rate), NOT brand — consistent across 3 reads.
- ⚠️ **The 43 MG dials read personality globals, not per-moment signals** — corroborated by Agent 1 (flat keys) + Agent 2 (dial considerations). This is the root of MG monotony and is the single most important finding here.

**Confidence:** signal pipeline + SIGNAL_MAP + personality formulas = HIGH (direct file:line, two independent reads). Overlay sub-counts = MEDIUM (re-count pending). Threshold sources = HIGH.

**2nd-pass deterministic re-count (regex over the actual source, this session):**
- ✅ **Overlays = 91 exactly:** mg-property **43**, transition 14, zoom 12, graphic 6, filter 6, caption 5, cut 3, camera 2. (Agent's "graphic 7" header was a typo; rows = 6.) Confirmed against `overlay-definitions.json`.
- ⚠️ **Thresholds: code shows 74 `prior:` blocks; agent claimed 76** — 2-entry gap (likely 2 fixed entries without a prior). Immaterial; exact entry count 74-76.
- 🔴 **INVENTED correction (Rule 31, fact vs inference):** the file literally flags **3** entries `INVENTED` (grep count). The agent's "**21 INVENTED**" was its own *source-attribution inference* (entries it judged unsourced by wide prior / missing source comment), NOT 21 literal code flags. Carry "3 = code-fact, ~21 = agent-judged-unsourced".
- ✅ formality = content heuristic + the 43 MG dials read personality globals (not per-moment signals) — both reconfirmed across two independent reads.
- ◻️ 34 flat keys: corroborated by two reads (this session's earlier signal-executor read + Agent 1), not regex-counted.

## 10. FULL OVERLAY REFERENCE — every overlay · every consideration (sub-signal) · output
> The complete map: each overlay → the signals it reads (considerations) → curve type + params → output. **Notation:** `signalId (curveType slope/exp/xShift/yShift [INV])`; `_` = default/1; `INV` = `invert:true`. Output `∝[a,b]` = proportional `min+totalScore×(max−min)`; `=v` = fixed.
> **To CALIBRATE: edit `lib/editron/engine/overlay-definitions.json` — this section names the exact overlay + consideration to touch. Values below are as of the 2026-06-03 read.** Defaults unless noted: rank 50, weight 1, minScore 0.3 (mg-property minScore 0.01). Scoring (multiplicative default): `totalScore = weight × Π(curveOut compensated)`, then output lerped from totalScore.

### MG-PROPERTY (43) — the MG "look" [calibration priority]
**typography (5)**
- `mg.typography.font_size` ← visceral_impact(logistic 1/1.5/-0.15/0) · enthusiasm(linear 0.8/_/0/0.1) → fontSize ∝[36,160]
- `mg.typography.font_weight` ← enthusiasm(logistic) · formality(logistic INV) → ∝[300,800]
- `mg.typography.letter_tracking` ← formality(linear 0.6/_/0/0.2) · pacing_velocity(linear 0.5/_/0/0.25 INV) → ∝[-0.01,0.06]
- `mg.typography.line_height` ← pacing_velocity(linear 0.6/_/0/0.2 INV) · warmth(linear 0.4/_/0/0.3) → ∝[1.0,1.5]
- `mg.typography.text_transform_tendency` ← enthusiasm(logistic _/1.5) · visceral_impact(linear 0.6) · formality(logistic INV) → ∝[0,1]

**arrangement (2)**
- `mg.arrangement.horizontal` ← enthusiasm(logistic) · pacing_velocity(linear 0.6/_/0/0.2) → ∝[0,1]
- `mg.arrangement.vertical` ← formality(logistic) · warmth(linear 0.5/_/0/0.25) → ∝[0,1]

**emphasis (1)** · `mg.emphasis.scale_contrast` ← enthusiasm(logistic) · formality(logistic INV) → ∝[1.4,2.2]
**layout (1)** · `mg.layout.center_avoidance` ← visual_dependency(linear INV) · speech_coverage(logistic) → ∝[0,1]

**styling (3)**
- `mg.styling.container_opacity` ← formality(linear 0.5/_/0/0.3) · warmth(linear 0.3/_/0/0.2) → ∝[0.3,0.92]
- `mg.styling.corner_radius` ← formality(logistic _/1.5 INV) · warmth(linear 0.6/_/0/0.2) · enthusiasm(linear 0.3) → ∝[2,16]
- `mg.styling.surface_complexity` ← formality(logistic INV) · enthusiasm(linear 0.5) → ∝[0,1] ⚠️was-dead

**color (2)**
- `mg.color.saturation_boost` ← enthusiasm(polynomial _/1.5) · visual_dependency(linear 0.4) → ∝[0,0.25] ⚠️was-dead
- `mg.color.accent_usage` ← visceral_impact(linear 0.7/_/0/0.1) · enthusiasm(linear 0.5) · formality(logistic INV) → ∝[0,1]

**animation.entrance (8)** (argmax-selected) — `fade` ← formality(logistic 3/2)·enthusiasm(logistic 2/1.5 INV) · `pop` ← enthusiasm(logistic 3/2)·visceral_impact(linear 0.8/_/0/0.1)·formality(logistic 2.5/2 INV) · `slide` ← pacing_velocity(logistic 2.5/1.5)·speech_coverage(linear 0.6/_/0/0.25) · `blur` ← warmth(logistic _/1.5)·emotional_arousal(linear 0.5)·pacing_velocity(linear 0.4/_/0/0.2 INV) · `scale` ← visceral_impact(poly _/1.5)·emotional_arousal(logistic _/1.5) · `rotate` ← formality(logistic _/1.5)·visceral_impact(linear 0.5/_/0/0.1) · `skew` ← pacing_velocity(logistic _/1.5)·formality(logistic INV) · `zoom_blur` ← visceral_impact(poly _/2)·enthusiasm(logistic _/1.5/0.1) — each → score ∝[0,1]
**animation.hold (4)** — `glow` ← visceral_impact(logistic _/1.5)·enthusiasm(linear 0.6/_/0/0.1) · `pulse` ← enthusiasm(logistic 2.5/2)·pacing_velocity(linear 0.8/_/0/0.15) · `breathe` ← warmth(logistic 2.5/2)·pacing_velocity(logistic INV)·emotional_arousal(linear 0.4/_/0/0.3 INV) · `float` ← enthusiasm(linear 0.8/_/0/0.2)·warmth(linear 0.6/_/0/0.2)·humor(linear) — ∝[0,1]
**animation.entrance_speed (1)** · ← pacing_velocity(poly _/1.5 INV)·enthusiasm(linear 0.5 INV) → ∝[0.15,0.6] ⚠️was-dead
**particle (4)** — `confetti` ← enthusiasm(logistic 1.2/2/0.1)·humor(linear 0.5)·formality(logistic _/1.5 INV) · `bokeh` ← warmth(logistic _/1.5)·emotional_arousal(linear 0.6) · `dust` ← visceral_impact(logistic 0.8/1.5)·formality(linear 0.5/_/0/0.1) · `sparks` ← visceral_impact(logistic 1.2/2)·enthusiasm(linear 0.7)·formality(logistic _/1.5 INV) — ∝[0,1]
**mask (2)** — `circle_reveal` ← visceral_impact(logistic _/2)·cinematic_moment(linear 0.7) · `wipe_reveal` ← pacing_velocity(linear 0.6/_/0/0.1)·formality(linear 0.5/_/0/0.1) — ∝[0,1]
**structure (10)** — `accent_line` ← formality(logistic _/1.5)·enthusiasm(linear 0.5 INV) · `side_bar` ← formality(logistic _/2/0.1)·emotional_arousal(linear 0.4 INV) · `backdrop_card` ← visual_dependency(logistic 1.2/2)·formality(linear 0.4/_/0/0.1) · `divider` ← formality(logistic _/1.5/0.1) · `underline` ← enthusiasm(logistic 1.2/2/0.1)·emotional_arousal(linear 0.6) · `kicker` ← formality(logistic _/2/0.1) · `badge` ← formality(logistic _/1.5/0.1) · `brackets` ← formality(logistic _/1.5/0.1)·emotional_arousal(linear 0.4 INV) · `corner_marks` ← cinematic_moment(logistic 1.2/2/0.1)·formality(linear 0.5) · `annotation` ← visceral_impact(logistic 1.2/2/0.1)·emotional_arousal(linear 0.6) — ∝[0,1]
> **★ Note for the MG monotony fix:** every dial above reads PERSONALITY globals (formality/enthusiasm/warmth/visceral/pacing/emotional_arousal/visual_dependency/humor) + a few (cinematic_moment, speech_coverage). They are near-CONSTANT per video → constant styling. To make MG vary per-moment, add per-moment signal considerations (motion_intensity, visual_significance, narrative_pressure, etc.) to these dials.

### TRANSITION (14) — clip bridges (output = transitionType + duration)
speech.l_cut(speech.filler_detected)=l-cut/4f · composite.flash(montage_mode)=flash/3f · transition.dissolve(speech.energy_ema INV·motion_intensity·montage_mode)=dissolve/∝[10,25]f · fade_to_black(energy_surprise INV·position_in_video)=fade-to-black/∝[15,30]f · whip_pan(montage_mode·energy_delta·formality INV)=whip-pan/8f · flash(cinematic_moment·formality INV)=flash/3f · jump_cut(formality INV)=jump-cut/2f · voiceover.l_cut[freedom](speech.coverage·face_present INV)=l-cut/∝[8,20]f · voiceover.l_cut[on-cam](face_present·speech.energy·eye_contact)=l-cut/6f · visual.scene_transition(scene_change, minScore0.4)=dissolve/∝[8,20]f · profile.hard_cut/dissolve/whip_pan/dip_to_black (rank40, formality/warmth/enthusiasm-driven)

### ZOOM (12) — framing emphasis (output = scaleTo, minGapFrames 90 or 600)
speech.push[building](energy_delta) ∝[1.0,1.1] · speech.punch[peak](energy·energy_surprise, gap600) ∝[1.1,1.3] · speech.pull_back[winding](energy_delta INV) ∝[0.95,1.0] · entity.zoom_in[cta](entity.cta·position_in_video) ∝[1.05,1.15] · entity.zoom_reset[topic](topic_boundary·silence)=1 · entity.push[claim](claim_strength·energy) ∝[1.0,1.1] · visual.drift[low-motion](motion_intensity INV·time_since_cut·energy) ∝[1.0,1.05] · audio.punch[drop](music_energy·music_beat, gap600) ∝[1.1,1.3] · composite.push[cinematic](cinematic_moment) ∝[1.0,1.1] · multi.push[key-point](energy·wpm·energy_surprise) ∝[1.0,1.12] · sound.punch[pairing](music_beat·energy_surprise, gap600) ∝[1.1,1.3] · cross.pull_back[decompress](energy_surprise INV·energy_ema) ∝[0.95,1.0]

### GRAPHIC (6) — overlay decisions (output = graphicType, gap90)
entity.stat_graphic[quant](entity.number·claim_strength)=stat_graphic · entity.stat_graphic[hedged](claim_strength·entity.number)=stat_graphic · entity.lower_third[name](entity.name)=lower_third · caption.lower_third[pos](face_present·speech.coverage)=lower_third · graphic.callout(motion_intensity INV)=callout · **graphic.keyword_highlight(speech.energy INV)=keyword_highlight** ← THE flood source: fires on energy alone, no salience/importance gate (founder: "keywords weren't important words")

### CAPTION (5) · speech.emphasis(emphasis_word)=emphasis · entity.cta_early(cta·position INV)=emphasis · profile.subtitle(coverage·formality)=subtitle · profile.word_by_word(coverage·enthusiasm·formality INV)=word-by-word · profile.none(coverage INV)=none
### FILTER (6) · film_grain(formality)∝[0.1,0.3] · vignette(formality·face_present INV)∝[0.1,0.25] · profile.clean_corporate(formality·warmth INV) · profile.vivid(enthusiasm·formality INV) · profile.warm_neutral(warmth) · profile.cinematic(engagement·formality)
### CUT (3, minScore 0.5, gap60) · dead_air(engagement INV·silence·energy INV·energy_ema INV) · beat_sync_cut(music_beat·coverage INV) · hold_dramatic_pause(engagement INV·energy_ema INV·silence)
### CAMERA (2, gap60) · speed_ramp(motion_intensity)→speedMult∝[0.5,2] · camera_shake(cinematic_moment·formality INV)→intensity∝[0.02,0.08]

## 11. Atomic overlay consumer map (2026-06-07 upload-to-edit investigation)
Status: source-of-truth amendment after the Editron upload-to-edit audit. This section does not tune runtime values. It records which systems must consume primitive atoms, which systems already consume them, and where atom work will or will not improve the live generated edit.

Northstar: atoms are the truth layer. Labels like `zoom`, `transition`, `caption`, `graphicType`, or `keyword_highlight` can remain compatibility outputs, but the better path is:

```
primitive atoms + relations + rhythm + screen context + brand taste + learned references
  -> form + timing + placement + overlay bundle
```

Not:

```
label -> preset
```

### 11.1 Live upload-to-edit path
For user uploads, the live path is:

```
project-dashboard.tsx
  -> /api/services/editron/media/upload/url
  -> /api/services/editron/media/upload
  -> /api/services/editron/auto-edit/from-asset
  -> /api/internal/workers/video-analysis
  -> /api/internal/workers/tribe-analysis when available
  -> director-agent.ts
  -> Path E creative brief when USE_CREATIVE_BRIEF=true
  -> brief-executor.ts
  -> edl-executor.ts
  -> editor/render layers
```

Important correction: when `USE_CREATIVE_BRIEF=true`, upload-to-edit is primarily Path E. Path E injects `signalsAtFrame(...)` into EDL decisions and calls `executeEDL(...)`. So atoms only improve live upload-to-edit if they reach Path E decision params, EDL resolvers, renderer forms, calibration, or editor intelligence. Tuning only Path D `utility-scorer.ts` / `overlay-definitions.json` is not enough for live Path E behavior.

### 11.2 Atom sources
Current atom sources and projection layers:

| Source | Produces | Runtime shape |
|---|---|---|
| `vjepa-service.ts` | visual primitives: motion vector, main subject bbox, text boxes/count/coverage, negative space, object/face counts | V-JEPA segment fields |
| `signal-registry.ts` | normalized signal keys such as `visual.motion_vector.x`, `visual.main_subject.x`, `visual.text_coverage`, `visual.negative_space.right` | signal snapshots every 15 frames |
| `atomic-overlay-core.ts` | overlay atoms, visual context, placement hints, atomic text form, collision/risk form | `atomicOverlayReceipt` / `atomicOverlayForm` |
| `overlay-atomic-receipts.ts` | live/editor/project receipt stamping for existing overlays | metadata attached to each overlay |
| `edl-executor.ts` | behavior-driving zoom/transition forms and receipts for generated overlays | EDL overlay metadata |

### 11.3 Consumers that must use atoms
These consumers are the places where primitive atoms should make the product better, not just more documented.

| Consumer | Why it needs atoms | Status / next action |
|---|---|---|
| Path E `signalsAtFrame(...)` in `director-agent.ts` | This is the live upload-to-edit bridge from analysis to generated decisions. | MUST carry visual primitives and moment atoms into every EDL decision. |
| Creative brief / `brief-executor.ts` | LLM may propose intent, but should not decide exact placement/form from vibes. | SHOULD expose atom summaries to intent planning, then deterministic code resolves exact frames and placement. |
| `resolveAtomicZoomForm(...)` | Zoom should be a continuous camera move from subject bbox, motion vector, eye-line, beat, energy, and negative space. | LIVE CONSUMER. Keep expanding beyond scale presets into focal anchor, x/y/z transform, curve, duration, and hold. |
| `resolveAtomicTransitionForm(...)` | Transition form should emerge from motion direction, scene change, subject/text pressure, rhythm, and cut intent. | LIVE CONSUMER. Continue replacing style selection with direction/shape/curve/mask/opacity/motion components. |
| `resolveAtomicSfxForm(...)` | SFX should emerge from rhythm, speech/word importance, motion peaks, visual pressure, restraint, and explicit audio cues before any asset lookup. | LIVE CONSUMER. Emits intent/timing/mix/asset constraints; `sfx-library-service.ts` now scores provider API candidates with this form before download/upload. |
| `applySpeedChange`, `applyFade`, `applyCameraShake`, SFX in `edl-executor.ts` | These are timing/intensity overlays and should read moment atoms, not only high-level techniques. | PARTIAL. Need richer atoms for duration, curve, intensity, safety, beat snap, and emotional role. |
| MG plan/decision in `applyGraphic(...)` | MG should be generated from structure, visual context, brand tokens, rhythm, and content atoms. | LIVE CONSUMER for MG atoms. Still needs no-preset recipe resolving as the core path. |
| Caption/text renderers | Caption forms need glyph roles, line breaks, hierarchy, emphasis, casing, font, color, timing, and motion. | LIVE CONSUMER. Keep renderer behavior driven by `atomicOverlayForm.text`, not legacy caption labels. |
| `transition-sfx-placer.ts` and future SFX intent layer | SFX should follow transition role, impact, beat, visual pressure, and restraint. | LIVE CONSUMER. It reads `atomicTransitionForm.sfxRole`, atomic SFX form, primitive SFX atoms, and the shared provider-candidate quality gate; still needs provider diversity and calibration. |
| `utility-scorer.ts` / `overlay-bridge.ts` | Useful for fallback, calibration, and future deterministic selection. | SHOULD consume placement hints and primitive atom-derived signals, but remember Path D is not the main live upload path under Path E. |
| Rendered aesthetic harness | This is where atoms become measurable quality signals: safe zone, overlap, clutter, text readability, contrast, rhythm. | LIVE CONSUMER. Needs actual render/pixel/animation sampling before scores are treated as beauty. |
| Moment bundle calibration | Calibration needs to compare whole bundles: MG + caption + zoom + transition + SFX + pacing on the same beat. | LIVE CONSUMER. Use receipts/forms as features and feed failures back to weights/curves/resolver params. |
| Editor live intelligence | Drag/style/position edits must refresh receipts immediately if receipts drive collision/safe-zone/smart placement. | LIVE CONSUMER. `use-overlays.tsx` and `project-service.ts` now stamp/update receipts; next is using them for live decisions. |
| Project summary / prompt context | Agents need to see existing overlay atoms before adding or modifying overlays. | MAY consume for better planning and audits, not as a render authority. |

### 11.4 Overlay families that still need deeper primitive atoms
Every overlay family should be representable as basic atoms. Existing receipts are necessary, but not sufficient when they only say "this overlay exists."

| Family | Primitive atoms needed |
|---|---|
| Video / image | source, crop, object-fit, frame region, subject bbox, visible motion, safe zones, negative space, existing text, scene role |
| Text / captions | glyphs, words, punctuation, hierarchy, line breaks, casing, timing, emphasis, font role, size, weight, color role, highlight, row strategy |
| Motion graphics | content atoms, relations, visual primitives, geometry atoms, color roles, typographic roles, entry/hold/reactive/exit motion phases |
| Shapes / stickers / icons | path/shape primitive, fill/stroke, scale, anchor, semantic role, density, collision pressure, motion phase |
| Zoom / frame movement | x/y/z transform, focal anchor, subject lock, velocity, easing, start/end scale, drift, hold, beat sync |
| Transitions | cut edge, direction vector, mask/opacity/motion components, curve, duration, softness, impact, audio role |
| Speed / fade / camera shake | time warp, opacity curve, motion curve, intensity, safety cap, recovery/settle phase |
| Sound / SFX | intent, token/query, loudness, attack/decay, sync frame, ducking, emotional role, source confidence, fallback policy |

### 11.5 Calibration implications
Calibration should tune runtime artifacts, not this prose file:

- Signal/curve weights live in `lib/editron/engine/overlay-definitions.json` for utility-scored overlays.
- Thresholds live in `lib/editron/data/threshold-registry.ts`.
- Resolver coefficients and laws live in the resolver modules (`zoom-form.ts`, `transition-form.ts`, `sfx-form.ts`, and MG recipe/decision modules).
- This document names what is canonical and where changes belong.

The calibration target is whole output quality:

```
reference creator moments
  vs generated moment bundles
  -> compare timing, form, placement, restraint, rhythm, legibility, and aesthetic proxy
  -> tune signals/curves/resolver params
```

Do not calibrate only "did we pick the same label?" A top-editor reference often succeeds because zoom, captions, MG, transition, SFX, and pacing hit the same emotional beat.

### 11.6 Open wiring gaps from this audit
- Path E bypasses Path D scorer winners in the main upload-to-edit flow, so any atom work that only improves `scoreAllOverlays(...)` will not automatically improve live upload-to-edit.
- Direct V-JEPA analysis already emits richer primitives into `signal-registry.ts`; any `SegmentAnalysis.visual` projection path must also preserve those primitives when it becomes the source.
- Some non-MG families are still receipt-rich but behavior-light. Video/image/shape/sticker/audio receipts need more family-specific atoms before they can drive robust placement/form.
- Rendered aesthetic scoring exists, but it is still a proxy. It must be validated on real renders and animations before we trust it as "looks good."
- SFX is no longer "first provider result wins." The system owns intent, primitive atoms, timing, loudness, ducking, fallback, and quality gates; moment grammar can emit ready SFX intent/form, provider APIs only supply candidates, and only the accepted candidate is materialized through the existing R2-first upload path. It still needs provider diversity and calibration before we can expect consistently top-tier sound design.
