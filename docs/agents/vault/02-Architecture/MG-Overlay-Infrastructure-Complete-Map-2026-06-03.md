---
tags: [architecture, motion-graphics, overlays, signals, scoring, complete-map, source-of-truth, investigate]
date: 2026-06-03
status: COMPREHENSIVE — every signal, every one of the 91 overlays, every file in the scoring→placement→render chain
verified-by: 5 parallel code-readers + author direct spot-checks on every load-bearing claim (see §10 provenance)
supersedes-partial: Editron-Signals-Source-of-Truth.md (corrects signal count 49→48 + SIGNAL_MAP line); prior handovers' "Path D is live" + "selectWinners broken" claims (both STALE — see §9)
code-root: D:\google downloads\Front-End-main\editron-worktree\lib\editron
---

# Motion-Graphics Overlay Infrastructure — Complete Top-Down Map

> Built per founder request (`/investigate`, utmost scrutiny): every signal (what it does, how derived, weight) at the top, then every overlay (how it's calculated, how it's placed, status: working/dead/stale/island), every file top to bottom. All file:line against `editron-worktree/lib/editron`. CONFIRMED = author read the exact lines this session. CODE-READER = a parallel agent read it and it's cross-consistent. UNCERTAIN = stated explicitly.

---

## §0. The spine in one breath (data flow, top → bottom)

```
raw analyses (rawFootageAnalysis · V-JEPA · Wav2Vec · Essentia/music)
   │   signal-registry.ts  (buildSignalTimeline → grid every 15f + events + globals)
   ▼
SIGNALS  (33 per-moment grid + 9 event + 21 global; 8 personality globals dominate)
   │   signal-executor.ts SIGNAL_MAP (dotted → 34 flat keys) → decision.params.signals
   ▼
SCORING  (utility-scorer.ts: each overlay's considerations → response-curves.ts → [0,1] →
          additive mean | multiplicative compensated-product → totalScore →
          resolveOutputValues: value = min + score·(max−min))
   ▼
DECISION  (a producer emits {type, params}.  ACTIVE producer = Path E "Creative Brief" LLM →
           brief-executor; signal-executor/utility-scorer = Path D FALLBACK)
   │   budgets · minGap · category constraints · 5-Track validator
   ▼
executeEDL (edl-executor.ts) — single sink — per-type dispatch
   │   graphic → applyGraphic → mgScores (43 dials) → planComposition
   ▼
FORM  (content-shape-analyzer.ts: analyzeContentShape → detectShapes() picks kind from
       CONTENT KEYS, signal-BLIND; _kind ignored) → composition-planner.ts switch(primary.kind)
       → composeX template → Recipe → Remotion render
```

**The two decision points that determine what the viewer SEES:**
1. **FORM** = `switch(primary.kind)` (`composition-planner.ts:238`), chosen by content-key duck-typing, **signal-blind**. ~9 fixed template composers.
2. **STYLE** = the 43 `mg-property` dials, which read the **8 near-constant personality globals** + a few per-moment signals, and only style *inside* the chosen template.

Everything else (zoom, transitions, cuts, filters, captions, camera) is scored the same way but placed by `executeEDL`.

---

## §1. SIGNALS — the input layer (the source of truth)

### §1.1 How a signal comes to exist (pipeline)
- **Built** in `signal-registry.ts` → `buildSignalTimeline`. Per-moment signals recomputed on a **15-frame grid (~500ms)**; **event** signals fire at word/segment timestamps; **global** signals are one value per video.
- **Sources:** Wav2Vec (vocal energy/emotion/prosody), V-JEPA (motion/visual-significance/action/face), Essentia/music (BPM/beats/sections), `rawFootageAnalysis` (transcript/silence/fillers/words), and heuristics. Each signal lists its source + file:line below.
- **Exposed** to the MG layer via `SIGNAL_MAP` (`signal-executor.ts:566-609`), which renames ~dotted keys to **34 flat keys** placed on `decision.params.signals`. [CONFIRMED line range is :566-609, not the :395-425 the old source-of-truth doc claims.]

### §1.2 Every EMITTED signal
Range `0–1` unless noted. Timing: **PM** = per-moment grid, **EV** = event, **G** = global. (CODE-READER table, file:line in `signal-registry.ts` unless noted; cross-checked against SIGNAL_MAP + overlay considerations.)

| signalId (dotted → flat) | What it measures (plain) | Derived from (source · file:line) | Range | Timing · used by |
|---|---|---|---|---|
| speech.energy → speech_energy | Vocal delivery intensity | Wav2Vec energy `:263`; fallback 5-Track RMS `:248` | 0–1 | PM · zoom punch/push, **keyword_highlight (the flood)**, personality |
| speech.energy_delta → energy_delta | Rising/falling energy (2s) | `:249` smoothed `:374` | ~−1..1 | PM · zoom push & **pull-back trigger**, narrative_pressure |
| speech.energy_ema | EMA(0.3) of energy | `:430` | 0–1 | PM · dissolve, dead_air cut, decompress zoom |
| speech.energy_surprise | energy − EMA (novelty) | `:431` | ~−1..1 | PM · punch zoom, fade_to_black, decompress |
| speech.speaking_rate_wpm → speaking_rate_wpm | Words/min (10s) | words `:250,:745` | 0–~300 | PM · multi-signal push zoom |
| speech.silence_duration_ms → silence_duration_ms | Active silence length | silenceGaps `:251,:756` | 0–∞ ms | PM · dead_air / dramatic-hold cuts |
| speech.silence_normalized | silence/3000 clamped | `:252` | 0–1 | PM · zoom_reset, cuts (NOT in SIGNAL_MAP — see dead-read) |
| speech.coverage → speech_coverage | Speech fraction of window | `:253,:764` | 0–1 | PM · l-cut, caption profiles, lower_third |
| speech.emotion_intensity → emotion_intensity | Vocal arousal/stress | Wav2Vec `:265` | 0–1 | PM(W2V only) · narrative_pressure |
| speech.emotional_valence | Tone pos/neg/neutral | Wav2Vec `:266` | enum | PM · emotional_alignment, warmth |
| speech.pitch_variability → pitch_variability | Prosodic variation | Wav2Vec `:267` | 0–1 | PM · humor global |
| speech.stress_detected → stress_detected | Word-level vocal stress | Wav2Vec `:268` | bool | PM · cinematic_moment, narrative_pressure |
| speech.filler_confidence | P(filler in segment) | Wav2Vec `:269` | 0–1 | PM · **emitted, no reader** |
| visual.motion_intensity → motion_intensity | Motion magnitude | V-JEPA `:289`; fallback `:274` | 0–1 | PM · drift zoom, callout, montage, pacing |
| visual.motion_intensity_sustained | Min motion over 2s | `:379` | 0–1 | PM · **emitted, no reader** |
| visual.significance → visual_significance | Visually distinct? (embedding divergence) | V-JEPA `:291` | 0–1 | PM(V-JEPA only) · cinematic_moment, entrance_scale dial |
| visual.action_type | 9-class action | V-JEPA `:293` | enum(9) | PM · reclassifies scene_type |
| visual.motion_type | Subject vs camera motion | V-JEPA `:295` | enum(4) | PM · **emitted, no reader** |
| visual.face_emotion → face_emotion | Facial emotion (8-class) | V-JEPA `:298` | enum/null | PM · emotional_alignment |
| visual.eye_contact | Gaze at camera | V-JEPA `:302` | bool/null | PM · VES (0.3w), l-cut |
| visual.shot_scale → shot_scale | CU/MS/WS framing | 5-Track `:275,:781` | enum | PM |
| visual.face_present → face_present | Person on screen | 5-Track `:276,:789` | bool | PM · lower_third, vignette, VES, visual_dependency |
| visual.ai_artifact_risk | AI-footage artifact likelihood | heuristic `:277` | 0–1 | PM · **emitted, no reader** |
| visual.scene_type → scene_type | talking-head/action/general | heuristic `:278`, V-JEPA-enriched `:305` | enum | PM |
| visual.complexity → visual_complexity | Frame busyness | heuristic `:279,:814` ⚠️INVENTED | 0–1 | PM |
| visual.text_on_screen → text_on_screen | Burned-in text/logo | 5-Track `:280,:835` | 0/1 | PM |
| visual.scene_change | Color-histogram cut | keyframe diff `:337` | 0–1 | PM · scene_transition |
| visual.brightness_stability | Brightness vs prev keyframe | `:340` | 0–1 | PM · VES (0.1w) |
| visual.engagement (+_ema,_surprise) | Composite engagement (VES) | computeVES `:345,:1125` — eye .3/sig .25/motion .2/face .15/bright .1 ⚠️INVENTED | 0–1 | PM · dead_air/dramatic cuts, cinematic filter |
| audio.music_energy → music_energy | Music loudness | Essentia `:316` | 0–1 | PM · audio punch zoom, montage |
| audio.music_beat | On a beat (±50ms) | Essentia `:315` | 0/1 | PM · beat_sync_cut, audio/sound punch zoom |
| audio.music_tatum → music_tatum | On 16th-note (±25ms) | BPM math `:317` | 0/1 | PM |
| audio.music_section → music_section | verse/chorus/drop | Essentia `:318` | enum | PM |
| audio.bpm → bpm | Tempo | Essentia `:319` | 0–~200 | PM |
| structural.position_in_video → position_in_video | Normalized timeline pos | frame/total `:329` | 0–1 | PM · cta zoom, fade_to_black, cta caption |
| structural.time_since_last_cut → time_since_last_cut | Seconds since clip start | `:330` | 0–∞ s | PM · drift zoom |
| structural.active_overlays_count → active_overlay_count | Concurrent overlays | `:331` | int | PM · anti-pattern gate |
| structural.cumulative_edit_density | Edits/min so far | `:332` | float | PM · **emitted, no reader** |
| composite.narrative_pressure → narrative_pressure | Building dramatic pressure | `:384` — energy .25/delta .25/silence .15/pos .15/emotion .1/stress .1 | 0–1 | PM |
| composite.montage_mode → montage_mode | Fast-cut montage active | `:387` — clips<2s + speech<.3 + music>.3 | bool | PM · flash/whip_pan, MG suppression |
| composite.cinematic_moment → cinematic_moment | Multi-track peak convergence | `:391` — 6 sources; 5pk→1.0/4→.9/3→.7/2→.5 | 0–1 | PM · push zoom, camera_shake, mask, corner_marks dial |
| composite.emotional_alignment → emotional_alignment | Face vs voice agree | `:400` | 0/.5/1 | PM (both present only) |
| temporal.energy_trajectory | neutral/rising/peaked/falling | `:444` | enum(5) | PM · **emitted, no reader** |
| **EV** speech.emphasis_word | Word held >1.1× avg | `:461` | bool+ctx | caption emphasis |
| **EV** speech.filler_detected | Filler word | fillerWords `:569` | bool | l-cut transition |
| **EV** speech.speaker_change | Diarization switch | `:587` | bool | **emitted, no reader** |
| **EV** entity.number | Number/stat (+"from X to Y" lookahead) | `:472`; parsed `:351-384` | bool+ctx | stat_graphic |
| **EV** entity.cta | Call-to-action phrase | `:504` | bool | cta zoom, cta caption |
| **EV** entity.name | Proper name (2-word cap) | `:515`; dedup `:385-393` | bool+ctx | lower_third |
| **EV** entity.topic_boundary | Segment start | `:535` | bool | zoom_reset |
| **EV** entity.rhetorical_question | Segment ends "?" | `:544` | bool | humor input |
| **EV** entity.claim_strength | assertive(0.8)/hedged(0.3) | `:555`; encoded `:1215` | str→num | stat_graphic gating, claim zoom |
| **G** content.formality → formality | Style formality (filler-rate buckets) | `:1064` — >5%→.2/>2%→.4/>1%→.6/else .8 | 0.2–0.8 | **~13 dial refs — dominates MG look** |
| **G** content.speech_coverage / content_type / speaker_count / is_multi_speaker | Video-level content facts | `:610-625` | mixed | globals |
| **G** audio.music_present / music_bpm; video.duration_s | Video-level audio/length | `:613-615` | mixed | globals |
| **G** enrichment.visual_source / speech_source / vjepa_segments / wav2vec_segments / diarization | Which GPU models contributed | `:628-632` | str/int | diagnostic |

### §1.3 The 8 PERSONALITY globals — the dials' real fuel
All in `signal-registry.ts`, **all flagged ⚠️"ALL formulas INVENTED" (`:637`)**, bare-key aliases set `:702-709`. These are **near-constant per video** and the 43 MG dials read them — the mechanical root of MG monotony.

| Signal → flat | Formula | Line |
|---|---|---|
| content.formality → formality | filler-rate buckets (above) | :1064 |
| personality.enthusiasm → enthusiasm | `min(1, w2v.energy×1.2 + (emotion>.5?.15:0))` | :657 |
| personality.warmth → warmth | `0.6·valence + 0.4·faceCoverage` | :662 |
| personality.emotional_arousal → emotional_arousal | `w2v.emotionIntensity`; fallback 0.4 | :667 |
| personality.pacing_velocity → pacing_velocity | `min(1, speechCov×.5 + visualMotion×.5)` | :673 |
| personality.visceral_impact → visceral_impact | `min(1, w2v.energy×.6 + emotion×.4)` | :676 |
| personality.visual_dependency → visual_dependency | `min(1,(1−faceCov)×.6+(1−speechCov)×.4)` | :681 |
| personality.humor → humor | `pitchVar×.4+(1−formality)×.25+min(rhetQ×.05,.15)+posEnergy×.2` | :692 |

> Real-data proof (proj_OzG2qgoYudFa, 13 MGs, `probe-proj-rerun.ts`): formality/humor/pacing_velocity/warmth/visual_dependency/speech_coverage were **CONSTANT** across all 13 moments; only visceral_impact/visual_change_rate/visual_significance/enthusiasm/emotional_arousal varied. So most dials see a flat vector → same look every moment.

### §1.4 Counts (verified)
- **Canonical designed signals = 48** (`data/creative-graph-parts/part-1-signals.json`, 48 `"id":"signal:"` entries: speech 10 · entity 6 · visual 13 · audio 6 · structural 7 · composite 6). The doc's "49" double-counts speech.formality vs content.formality. [CODE-READER, grep count]
- **Flat keys to MG planner = 34** (`SIGNAL_MAP`, `signal-executor.ts:566-609`). [matches old doc]
- **Per-moment base ≈33 · event 9 · global 21** (8 personality + 13 content/enrichment).
- **Response-curve types = 6:** linear, polynomial, logistic, logit, normal, sine (`response-curves.ts:8-31`). [CONFIRMED]

### §1.5 Dead signal plumbing
- **Designed-but-NEVER-emitted (13):** pitch_contour, shot_composition, color_temperature, screen_direction, music_key, ambient_type, time_since_last_zoom, time_since_last_graphic, scene_index, narrative_phase, reaction_moment, eye_trace_position, movement_phrase_phase. In the creative graph; zero code path (grep of signal-registry + overlay-defs = 0). [CODE-READER]
- **Emitted-but-NEVER-read:** filler_confidence, motion_type, ai_artifact_risk, cumulative_edit_density, energy_trajectory, speaker_change, motion_intensity_sustained, several EMA/surprise derivatives. Computed every grid point, no consumer.

### §1.6 Corrections to `Editron-Signals-Source-of-Truth.md`
- "49 designed signals" → **48**. · "SIGNAL_MAP at :395-425" → **:566-609**. Otherwise the 34-flat-key claim holds.

---

## §2. THE SCORING ENGINE (signal → number → output value)

### §2.1 `response-curves.ts` — the 6 curves [CONFIRMED]
- `evaluateCurve(type, params, input)` (`:42`) → `clamp01(fn(input))` (`:53`). **The clamp is on the OUTPUT, not the input** (`:52-53`). A negative signal (e.g. `energy_delta = −0.4`) **does** reach the curve; only the result is bounded to [0,1]. (Refutes the stale Utility-AI-Phase1 claim that negatives are clamped to 0.)
- `logistic` (`:16`) centers at `x = 0.5 + xShift`; `normal`/`sine` similarly assume input∈[0,1]. Out-of-range input silently saturates. Only `logit` clamps its own input (`:21`).
- Soft failure: NaN/unknown-curve → returns **0.5** + console.warn (`:43-50`) — a misconfigured curve contributes a mid score rather than failing loud (Rule R18N smell).

### §2.2 `utility-scorer.ts` — score + select [CONFIRMED on the math]
- **`scoreOverlay` (`:30`)**: per consideration, `raw = signals[c.signalId]` (`:38`); missing/NaN → **skipped** (`:39`, not zeroed); `curveOut = evaluateCurve(...)`; `if invert → 1 − curveOut` (`:42`).
  - **Additive (`:74-81`)**: `totalScore = weight · mean(curveOutputs)`.
  - **Multiplicative (`:66-73`)**: `totalScore = weight · Π compensated_i`, `compensated_i = c_i·(1+(1−c_i)·compFactor)`, `compFactor = 1 − 1/n`. With 1 consideration, compFactor=0 → `totalScore = curveOutput`.
  - Default method = `'multiplicative'` (`:33`). **The scorer is ID-agnostic** — the additive/multiplicative choice is a parameter, decided by the caller (§2.3).
- **`resolveOutputValues` (`:13-28`)**: fixed → `fixedValue ?? 0` (`:20`, missing fixedValue silently → 0); proportional → **`value = min + totalScore·(max − min)`** (`:24`), **no output clamp**. With additive + a `weight>1` the output can exceed `max`.
  - **⚠️ THE INVERSION (the zoom pull-back bug):** for a descending range (`min 0.95, max 1.0`) a HIGH score → `value ≈ 1.0` (no effect); a LOW score → `0.95` (max effect). Score and effect are **anti-correlated**. See §6.
- **`scoreAllOverlays` (`:93`)**: keeps `totalScore ≥ def.minScore` (`:101`); sorts **rank desc, then score desc** (`:105`) — rank dominates.
- **`selectWinners` (`:112`)**: applies `CATEGORY_CONSTRAINTS` (`utility-types.ts:36-46`): per-category `maxPerGridPoint`/`minGapFrames`/`global`. Global cats (filter, caption, **mg-property**) → keep single max across timeline (so `mg-property maxPerGridPoint:99` is **dead config**). Non-global → 1 per grid point after gap gate.
- **`scoreGridPoint` (`:150`)** = `scoreAllOverlays`→`selectWinners`. **DEAD** (zero callers).

### §2.3 The additive/multiplicative split lives in `edl-executor.ts:1153-1163` [CONFIRMED — author read it]
`SELECTION_IDS` = the 8 `entrance_*` + 4 `hold_*` dials → scored **`'multiplicative'`** (`:1163`); all other `mg-property` dials → **`'additive'`** (`:1162`). `entrance_speed` is NOT in the set → additive. **This split is in the executor, not the scorer.** ⚠️ When verifying any dial, check which side it's on first.

### §2.4 `threshold-bandit.ts` — adapts ROUTING, not overlays [CODE-READER]
- Thompson sampling over `THRESHOLD_REGISTRY` (content-mode **routing** thresholds). **Nothing in utility-scorer reads it** — overlay `weight`/`minScore`/curve params are static JSON, never tuned by the bandit.
- `OUTCOME_REWARD = {kept:1, modified:0.5, removed:0}` (`:59`); update collapses to sign×0.1 → `modified` is a **directional no-op**; activation floor 10 outcomes.
- **RNG unseeded** (`Math.random()` Box-Muller `:100-101`) → non-deterministic. Violates the project's own Rule 35.
- Wiring: Path E consumes `routingThresholds` (live); **Path D samples then discards** (`director-agent.ts:860-862`, dead compute).

---

## §3. THE 91 OVERLAYS — by category (calc + placement + status)

**Universal facts:** every overlay `weight:1`. Almost all `rank:50` (profile.* and a few use 40/60). Legacy overlays `minScore:0.3`; all 43 mg-property `minScore:0.01`. Counts **author-verified** by grep (`"category":` tally = 91; `"id":` count = 91). Signals shown as `signalId·curve·invert(T/F)`.

### §3.1 zoom — 12 · placed by `applyZoom` (`edl-executor.ts:759-895`)
| line | id | minGap | signals | scaleTo out | dir |
|---|---|---|---|---|---|
| 3 | speech.zoom_push (building energy) | 90 | energy_delta·logistic·F | 1.0→1.1 | in |
| 33 | speech.zoom_punch (energy peak) | 600 | energy·logistic·F; energy_surprise·logistic·F | 1.1→1.3 | in |
| 75 | **speech.zoom_pull_back (winding down)** | 90 | energy_delta·logistic·**T** | **0.95→1.0** | **out (INVERTED)** |
| 279 | entity.zoom_in (CTA) | 90 | cta·linear·F; position·logistic·F | 1.05→1.15 | in |
| 362 | entity.zoom_reset (topic shift) | 90 | topic_boundary·linear·F; silence_norm·linear·F | fixed 1.0 | neutral |
| 403 | entity.zoom_push (strong claim) | 90 | claim_strength·linear·F; energy·linear·F | 1.0→1.1 | in |
| 445 | visual.zoom_drift (low motion) | 90 | motion·logistic·T; time_since_cut·linear·F; energy·logistic·F | 1.0→1.05 | in |
| 499 | audio.zoom_punch (music drop) | 600 | music_energy·logistic·F; music_beat·linear·F | 1.1→1.3 | in |
| 575 | composite.zoom_push (cinematic) | 90 | cinematic_moment·linear·F | 1.0→1.1 | in |
| 605 | multi-signal.zoom_push (key point) | 90 | energy·linear·F; wpm·linear·F; energy_surprise·logistic·F | 1.0→1.12 | in |
| 905 | sound-design.zoom_punch (transition) | 600 | music_beat·linear·F; energy_surprise·logistic·F | 1.1→1.3 | in |
| 1309 | **cross-domain.zoom_pull_back (post-peak)** | 90 | energy_surprise·logistic·**T**; energy_ema·logistic·F | **0.95→1.0** | **out (INVERTED)** |

**Vocabulary = 9 in / 2 weak-out (max −5%) / 1 reset.** Direction inferred at `:855`: `scaleTo<scaleFrom(1.0)?pull-back:push/slow-push`. Default `scaleTo=1.1` (`:840`). 5-Track validator downgrades off-peak zooms to slow-push≤1.05 (`:826`). **Status: WORKING but monotone-by-construction + 2 INVERTED pull-backs.** See §6.

### §3.2 transition — 14 · placed by `applyTransition`
| line | id | signals | out |
|---|---|---|---|
| 134 | speech.l_cut (filler removal) | filler_detected·linear·F | l-cut / 4f |
| 541 | composite.flash (montage) | montage_mode·linear·F | flash / 3f |
| 659 | transition.dissolve | energy_ema·logistic·T; motion·logistic·F; montage_mode·linear·F | dissolve / 10→25f |
| 718 | transition.fade_to_black | energy_surprise·logistic·T; position·logistic·F | fade-to-black / 15→30f |
| 765 | transition.whip_pan | montage_mode·linear·F; energy_delta·logistic·F; formality·logistic·T | whip-pan / 8f |
| 823 | transition.flash | cinematic_moment·logistic·F; formality·logistic·T | flash / 3f |
| 988 | voiceover.l_cut (visual freedom) | coverage·logistic·F; face_present·linear·T | l-cut / 8→20f |
| 1035 | voiceover.l_cut (on-camera) | face_present·linear·F; energy·logistic·F; eye_contact·linear·F | l-cut / 6f |
| 1175 | transition.jump_cut | formality·logistic·T | jump-cut / 2f |
| 1416 | visual.scene_transition (minScore 0.4) | scene_change·logistic·F | dissolve / 8→20f |
| 1820 | profile.transition_hard_cut (rank 40) | energy_surprise·logistic·F | hard-cut / 2f |
| 1854 | profile.transition_dissolve (rank 40) | warmth·logistic·F; energy_surprise·logistic·T | dissolve / 10→25f |
| 1901 | profile.transition_whip_pan (rank40, ms0.4) | enthusiasm·logistic·F; formality·logistic·T | whip-pan / 8f |
| 1947 | profile.transition_dip_to_black (rank 40) | formality·logistic·F; scene_change·logistic·F | dip-to-black / 15→30f |
**Status: WORKING** (executeEDL `case 'transition'`).

### §3.3 graphic — 6 · placed by `applyGraphic` → planComposition
| line | id | signals | graphicType |
|---|---|---|---|
| 168 | entity.stat_graphic (quantitative claim) | number·linear·F; claim_strength·linear·F | stat_graphic |
| 209 | entity.stat_graphic (hedged restraint) | claim_strength·linear·F; number·linear·F | stat_graphic |
| 250 | entity.lower_third (name/brand) | name·linear·F | lower_third |
| 947 | caption.lower_third (position adj) | face_present·linear·F; coverage·logistic·F | lower_third |
| 1209 | graphic.callout | motion·logistic·F (⚠️INVENTED xShift −0.15) | callout |
| 1238 | **graphic.keyword_highlight** | **speech.energy·logistic·F (ONLY — no salience gate)** | keyword_highlight |
**Status: WORKING but keyword_highlight is the FLOOD** (fires on energy alone; 8/13 unwarranted on real data). The graphicType string is then **ignored by the form layer** (`_kind` dead) — every text payload becomes `emphasis`. See §4.3.

### §3.4 caption — 5 · global category; profile-level placement
| line | id | signals | out |
|---|---|---|---|
| 105 | speech.caption_emphasis (emphasis word) | emphasis_word·linear·F | captionEmphasis true |
| 321 | entity.caption_emphasis (CTA early) | cta·linear·F; position·logistic·T | captionEmphasis true |
| 1697 | profile.caption_subtitle | coverage·logistic·F; formality·logistic·F | subtitle |
| 1738 | profile.caption_word_by_word | coverage·logistic·F; enthusiasm·logistic·F; formality·logistic·T | word-by-word |
| 1791 | profile.caption_none (rank 40) | coverage·logistic·T | none |
**Status: STALE as EDL decisions** — caption style is applied at the profile level (`director-agent.ts:983`), and `caption`/`caption-emphasis` route through `applyGraphic` as keyword-highlight (`edl-executor.ts:490-504`). Not a direct EDL type.

### §3.5 filter — 6 · **STALE (handler DISABLED)**
| line | id | signals | out |
|---|---|---|---|
| 1093 | film_grain | formality·logistic·F | film-grain 0.1→0.3 |
| 1128 | vignette | formality·logistic·F; face_present·linear·T | vignette 0.1→0.25 |
| 1545 | profile.filter_clean_corporate | formality·logistic·F; warmth·logistic·T | clean-corporate |
| 1586 | profile.filter_vivid | enthusiasm·logistic·F; formality·logistic·T | vivid |
| 1627 | profile.filter_warm_neutral | warmth·logistic·F | warm-neutral |
| 1656 | profile.filter_cinematic | engagement·logistic·F; formality·normal·F | cinematic |
**Status: STALE** — `case 'filter-change'` returns null (DISABLED, `edl-executor.ts:482-488`, "profile is single source of truth"). Filter scoring routes to a profile override (`director-agent.ts:979`).

### §3.6 cut — 3 · **no-op handler**
| line | id | minScore | signals | out |
|---|---|---|---|---|
| 1351 | visual.cut_dead_air | 0.5 | engagement·T; silence·F; energy·T; energy_ema·T | dead_air |
| 1451 | visual.beat_sync_cut (rank 40) | 0.5 | music_beat·F; coverage·T | beat_sync |
| 1492 | visual.hold_dramatic_pause (rank 60) | 0.5 | engagement·F; energy_ema·F; silence·normal·F | dramatic_pause |
**Status: STALE/informational** — `case 'cut'` returns null (`edl-executor.ts:477-480`); cuts are not applied as overlays here.

### §3.7 camera — 2 · placed (speed/shake)
| line | id | signals | out |
|---|---|---|---|
| 869 | speed.speed_ramp | motion·logistic·F | speedMultiplier 0.5→2; ramp 15→30f |
| 1267 | camera-shake.camera_shake_impact | cinematic_moment·logistic·F; formality·logistic·T | intensity 0.02→0.08 |
**Status: WORKING** (`case 'camera-shake'`→applyCameraShake `:544`; speed via ramp).

### §3.8 mg-property — 43 dials · the STYLE layer (WORKING)
All rank 50, weight 1, minScore 0.01, one proportional outputParam each. Read bare personality/per-moment signal names. Reach the planner via `mgScores` (`edl-executor.ts:1146-1190`) → consumed by `mgVal`/`mgWinner` inside the chosen composer.

| line | id | signals | output · range |
|---|---|---|---|
| 1995 | mg.typography.font_size | visceral_impact·logistic·F; enthusiasm·linear·F | fontSize 36→160 |
| 2022 | mg.typography.font_weight | enthusiasm·logistic·F; formality·logistic·T | fontWeight 300→800 |
| 2049 | mg.typography.letter_tracking | formality·linear·F; pacing·linear·T | -0.01→0.06 |
| 2076 | mg.typography.line_height | pacing·linear·T; warmth·linear·F | 1.0→1.5 |
| 2103 | mg.typography.text_transform_tendency | enthusiasm·logistic·F; visceral·linear·F; formality·logistic·T | 0→1 |
| 2138 | mg.arrangement.horizontal | enthusiasm·logistic·F; pacing·linear·F | 0→1 |
| 2166 | mg.arrangement.vertical | formality·logistic·F; warmth·linear·F | 0→1 |
| 2194 | mg.emphasis.scale_contrast | enthusiasm·logistic·F; formality·logistic·T | 1.4→2.2 |
| 2222 | mg.layout.center_avoidance | visual_dependency·linear·T; speech_coverage·logistic·F | 0→1 |
| 2250 | mg.styling.container_opacity | formality·linear·F; warmth·linear·F | 0.3→0.92 |
| 2277 | mg.styling.corner_radius | formality·logistic·T; warmth·linear·F; enthusiasm·linear·F | 2→16 |
| 2311 | mg.styling.surface_complexity | formality·logistic·T; enthusiasm·linear·F | 0→1 |
| 2339 | mg.color.saturation_boost | enthusiasm·polynomial·F; visual_dependency·linear·F | 0→0.25 |
| 2366 | mg.color.accent_usage | visceral·linear·F; enthusiasm·linear·F; formality·logistic·T | 0→1 |
| 2401 | mg.animation.entrance_fade | visceral·logistic·T; formality·logistic·F | 0→1 (MULT) |
| 2428 | mg.animation.entrance_pop | visceral·logistic·F; formality·logistic·T | 0→1 (MULT) |
| 2455 | mg.animation.entrance_slide | visual_change_rate·logistic·F; visceral·logistic·T | 0→1 (MULT) |
| 2482 | mg.animation.entrance_blur | visual_change_rate·logistic·T; warmth·logistic·F | 0→1 (MULT) |
| 2509 | mg.animation.entrance_scale | visceral·logistic·F; visual_significance·linear·F | 0→1 (MULT) |
| 2536 | mg.animation.entrance_rotate | formality·logistic·F; visceral·linear·F | 0→1 (MULT) |
| 2563 | mg.animation.entrance_skew | visual_change_rate·logistic·F; formality·logistic·T | 0→1 (MULT) |
| 2590 | mg.animation.entrance_zoom_blur | visceral·polynomial·F; visual_change_rate·linear·F | 0→1 (MULT) |
| 2618 | mg.animation.hold_glow | visceral·logistic·F; enthusiasm·linear·F | 0→1 (MULT) |
| 2646 | mg.animation.hold_pulse | enthusiasm·logistic·F; pacing·linear·F | 0→1 (MULT) |
| 2673 | mg.animation.hold_breathe | warmth·logistic·F; pacing·logistic·T; emotional_arousal·linear·T | 0→1 (MULT) |
| 2707 | mg.animation.hold_float | enthusiasm·linear·F; warmth·linear·F; humor·linear·F | 0→1 (MULT) |
| 2742 | mg.animation.entrance_speed | visceral·polynomial·T; pacing·linear·T | 0.15→0.6 (additive — NOT in SELECTION_IDS) |
| 2769 | mg.particle.confetti | enthusiasm·logistic·F; humor·linear·F; formality·logistic·T | 0→1 |
| 2803 | mg.particle.bokeh | warmth·logistic·F; emotional_arousal·linear·F | 0→1 |
| 2830 | mg.particle.dust | visceral·logistic·F; formality·linear·F | 0→1 |
| 2857 | mg.particle.sparks | visceral·logistic·F; enthusiasm·linear·F; formality·logistic·T | 0→1 |
| 2891 | mg.mask.circle_reveal | visceral·logistic·F; cinematic_moment·linear·F | 0→1 |
| 2918 | mg.mask.wipe_reveal | pacing·linear·F; formality·linear·F | 0→1 |
| 2945 | mg.structure.accent_line | formality·logistic·F; enthusiasm·linear·T | 0→1 |
| 2972 | mg.structure.side_bar | formality·logistic·F; emotional_arousal·linear·T | 0→1 |
| 2998 | mg.structure.backdrop_card | visual_dependency·logistic·F; formality·linear·F | 0→1 |
| 3026 | mg.structure.divider | formality·logistic·F | 0→1 |
| 3046 | mg.structure.underline | enthusiasm·logistic·F; emotional_arousal·linear·F | 0→1 |
| 3073 | mg.structure.kicker | formality·logistic·F | 0→1 |
| 3093 | mg.structure.badge | formality·logistic·F | 0→1 |
| 3113 | mg.structure.brackets | formality·logistic·F; emotional_arousal·linear·T | 0→1 |
| 3140 | mg.structure.corner_marks | cinematic_moment·logistic·F; formality·linear·F | 0→1 |
| 3167 | mg.structure.annotation | visceral·logistic·F; emotional_arousal·linear·F | 0→1 |
**Status: WORKING** (dials reach the planner and style the recipe), but they read the near-constant personality vector → low per-moment variation. particle (budget≥4) / mask (budget≥5) **rarely fire** (budget-starved). 18 of 43 reference `formality` → formality dominance.

---

## §4. PLACEMENT / EXECUTION — how a scored overlay becomes pixels

### §4.1 The 5 producer paths + which is ACTIVE [Path E author-verified]
All converge on `executeEDL`. (`agent/director-agent.ts`)
| Path | Trigger | Producer | Status |
|---|---|---|---|
| A | Mode-1 storyboard `:150` | Unified Intelligence / reactive | for Mode 1 |
| B | syntheticStoryboard `:193` | Unified Intelligence | Mode-2 vision fallback |
| C | rawFootageAnalysis segments `:166` | feeds D/E | Mode-2 norm |
| D | Mode 2 + KG `:755` | **signal-executor** + optional utility-scorer | **FALLBACK only** |
| **E** | **`USE_CREATIVE_BRIEF==='true'` + segments `:355`** | **Creative Brief LLM → brief-executor** | **ACTIVE** |
- **CONFIRMED:** `USE_CREATIVE_BRIEF="true"` in `.env.local:116`, `.env.local.vercel:117`, `.env.local.prod:135`; gate `director-agent.ts:355`; on success sets `pathDHandled=true` so Path D is skipped (`:757`).
- **Consequence:** the signal-executor/utility-scorer machinery (Path D) and `selectWinners` do **not** run in the live config. Per-frame signals in the active path are injected by `signalsAtFrame` (`director-agent.ts:635`, applied `:665-669`). [handover's :613 was stale]

### §4.2 `executeEDL` dispatch (`edl-executor.ts:211`, `applyDecision:444`)
- Brand stamped once (`:269-273`); confidence filter (`:251`); frame sort (`:281`); density budget (`:240`).
- `transition`→applyTransition; `zoom`→applyZoom; `speed-change`; `fade`; `graphic`→applyGraphic (`:471`); `audio-duck`; `cut`→**null** (`:477`); `filter-change`→**null/DISABLED** (`:482`); `caption-emphasis`→applyGraphic keyword-highlight (`:490`); `sfx`/`sfx-trigger`; `camera-shake` (`:544`).

### §4.3 The MG FORM path [CONFIRMED — the Rule-11 lever]
`applyGraphic` (`:1042`, gated `useCompositionEngine` default **true** `editron-config.ts:499`):
1. `rawSignals = params.signals||{}`; `tokens = resolveMotionTokens(rawSignals, params.brand||{})` (`:1136`).
2. brand stripped from content map so brand-shape detector doesn't misfire (`:1142`).
3. mgScores built (`:1146-1163`, additive props / multiplicative selection).
4. `planComposition(content, tokens, rawSignals, mgScores)` (`:1186`).
5. **`analyzeContentShape(content, _kind, s)`** (`composition-planner.ts:88` → `content-shape-analyzer.ts:14`): `detectShapes(content)` picks `kind` from **content keys only** — value→numeric, name→identity, quote→quotation, values→data-series, logo/brand→brand, title+body→structured, from+to→comparison, **else text→emphasis** (`:105`), else free-text. **`_kind` (the producer's graphicType) is IGNORED** (`:16`). Signals set only layout/budget/hold, never the form.
6. **`switch(primary.kind)`** (`composition-planner.ts:238`) → composeNumeric/Identity/Quotation/**Emphasis**/Brand/Structured/DataSeries/Comparison/free-text. A bare keyword `{text:"trolls"}` → emphasis → composeEmphasis = **word-in-a-box**.
7. Recipe → motion-graphic overlay (`:1202`) → Remotion.

### §4.4 Gates
- **structural-gate** `checkCompositionStructure` (`edl-executor.ts:1194`): **STALE / observe-only** — `pass` is logged, never enforced (header `structural-gate.ts:22-25`).
- **aesthetic-gate** `runAestheticGate` (`aesthetic-gate.ts:61`): **DEAD** — zero importers. Trap: returns `{pass:true, score:100}` when no API key (`:68-72`).

### §4.5 Brand → render
`decision.params.brand` is always written for graphics (`:269-273`), but resolves to `{}` → **DEFAULT_BRAND (gold)** unless the project has a `brandId` with a palette color legible on the dark surface (`brandInputsFromUnifiedBrand`, brand-composition-rules.ts:262). **The branded path is wired but UNVERIFIED end-to-end** (no branded test project). proj_OzG2qgoYudFa has no brand → always gold.

---

## §5. STATUS LEDGER — working / dead / stale / island

| Item | Status | Evidence |
|---|---|---|
| 43 mg-property dials → planner | **WORKING** | mgScores `edl-executor.ts:1146-1190` → mgVal/mgWinner in planner |
| zoom (12), transition (14), graphic (6), camera (2) | **WORKING** | executeEDL dispatch handlers |
| drift-zoom post-processing | **WORKING** | `director-agent.ts:1256` → auto-post-processing.ts:496 → applyDriftZoom |
| particle / mask / brand-pattern | **WORKING but budget-starved** | composition-planner budget≥4/≥5 gates; rarely emitted |
| Path E Creative Brief | **WORKING (ACTIVE)** | director-agent.ts:355, env confirmed |
| `runAestheticGate` | **DEAD** | zero importers (grep); auto-pass-100 trap |
| `scoreGridPoint` | **DEAD** | zero callers (grep) |
| `checkCompositionStructure` | **STALE (observe-only)** | pass logged not enforced (edl-executor.ts:1194) |
| filter (6) EDL path | **STALE (disabled)** | case 'filter-change' → null (edl-executor.ts:482) |
| cut (3) EDL path | **STALE (no-op)** | case 'cut' → null (edl-executor.ts:477) |
| caption (5) as EDL type | **STALE** | profile-level + routed via applyGraphic |
| Path D signal-executor + utility-scorer | **FALLBACK (inactive in live config)** | gated by !pathDHandled; Path E wins |
| `selectWinners` | **WIRED, INERT** | correct 3-arg (`:906`), but USE_UTILITY_LIVE off + graphic winners discarded (`:925`); NOT broken (corrects memory) |
| threshold-bandit → overlay scoring | **NO LINK (island vs overlays)** | tunes routing only; utility-scorer reads none of it |
| `mg-property maxPerGridPoint:99` | **DEAD CONFIG** | global short-circuits before it's read |
| 13 designed signals | **NEVER EMITTED** | grep 0 in registry + overlays |
| ~8 emitted signals | **NEVER READ** | filler_confidence, motion_type, ai_artifact_risk, etc. |
| `decision.params.mgOverlayScores` (pre-scored input) | **VESTIGIAL** | read (`:1146`) but never written → always recomputed |
| brand → render | **WORKING but conditional** | DEFAULT_BRAND unless brandId+legible palette |

---

## §6. ZOOM — Phase 3.1 findings (the completed plan step) + the approved fix

(Full detail in `05-Bugs-and-Issues/Zoom-Phase-3.1-Diagnosis-2026-06-03.md`.)

**Symptom — MEASURED on real data** (`scripts/probe-zoom-realdata.ts`, proj_OzG2qgoYudFa): 9 of 43 video overlays have a scale track; **all 9 are zoom-INs** (1.0→1.05–1.15, mean 1.089). **0 pull-backs, 0 statics, 0 punches.** `intelligence.decisionLog` empty (not persisted). Founder's "always zoom-ins" confirmed.

**Mechanism — arithmetic-certain code defects:**
1. **Pull-back output inversion** (`overlay-definitions.json:75` & `:1309`, min 0.95/max 1.0 × `utility-scorer.ts:24`): `energy_delta=−0.4` → score 0.95 → scaleTo **0.9976** (no pull-back); `+0.1` → score 0.011 → scaleTo **0.95**. Pulls back hardest when energy RISES. Backwards.
2. **Direction inference** (`edl-executor.ts:855`): pull-back only if `scaleTo<1.0`; inverted pull-backs land ≈1.0 → reclassified push.
3. **Vocabulary/magnitude asymmetry**: 9 in / 2 weak-out; in +30%, out −5%.
4. **Defaults + 5-Track validator** both bias in (`:840`, `:826`).
5. Curve INPUT not clamped (`response-curves.ts:53` clamps output) — refutes stale Phase-1 doc.

**Honest cause-ranking:** rendered tracks show ZERO near-1.0 tracks → pull-backs aren't reaching render at all → leans "pull-backs don't win/fire" (signal distribution/competition/budget) over "fire-but-invert." The inversion is a real latent defect, likely secondary until wiring lets them win.

**Verification constraint:** zoom-driving signals (energy_delta, motion_intensity, cinematic_moment) are NOT persisted; cinematic_moment absent. No MG-style recompose for zoom.

**Approved fix (Phase 3.2, hybrid verify):** fix the inversion (#1) + direction logic (#2) with deterministic single-signal tests; time-box a check for offline signal-snapshot reconstruction; fall back to one live re-run on a COPY only if needed. Rewire zoom to per-moment signals that vary (motion/significance/post-peak) so direction+magnitude track the moment and pull-backs can win and render visibly.

---

## §7. Defects found while mapping (the bug list)
1. **Zoom pull-back inversion** ×2 (overlay-definitions.json:75,:1309) — high confidence → no pull-back. [CONFIRMED]
2. **Drift-zoom complement operator-precedence bug** (`signal-executor.ts:686`): `a || b && c` adds a zoom complement even when the primary is already a zoom. [CODE-READER]
3. **threshold-bandit RNG unseeded** (`:100-101`) — non-deterministic, violates Rule 35. [CODE-READER]
4. **aesthetic-gate auto-pass-100 without API key** (`:68-72`) — poison trap if ever wired. [CODE-READER + memory]
5. **resolveOutputValues no output clamp** (`utility-scorer.ts:24`) — additive + weight>1 can exceed max. [CONFIRMED]
6. **Soft-fail curves** return 0.5 on NaN/unknown (`response-curves.ts:43-50`) — silent mid-score. [CONFIRMED]
7. **13 designed signals never emitted; ~8 emitted never read** — dead plumbing. [CODE-READER]
8. **mgOverlayScores input vestigial; mg-property maxPerGridPoint:99 dead config.** [CODE-READER]

---

## §8. Files touched in this subsystem (top-down index)
- `data/creative-graph-parts/part-1-signals.json` — 48 canonical signal specs.
- `services/signal-registry.ts` — builds the signal timeline (grid/event/global); personality formulas (INVENTED).
- `services/signal-executor.ts` — Path-D producer; `SIGNAL_MAP` (:566-609); budgets/gaps; drift complement (:686).
- `engine/overlay-definitions.json` — the 91 overlays (static).
- `engine/overlay-definitions-loader.ts` — loads them (no compute).
- `engine/response-curves.ts` — 6 curves; output clamp.
- `engine/utility-scorer.ts` — scoreOverlay (add/mult), resolveOutputValues (inversion), scoreAllOverlays, selectWinners, scoreGridPoint(dead).
- `engine/utility-types.ts` — SignalSnapshot, CATEGORY_CONSTRAINTS.
- `services/threshold-bandit.ts` + `data/threshold-registry.ts` — routing-threshold adaptation (not overlays).
- `agent/director-agent.ts` — the 5 paths; Path E active; signalsAtFrame (:635); selectWinners (:906, inert).
- `services/edl-executor.ts` — executeEDL sink; per-type dispatch; applyZoom (759-895); applyGraphic (1042) + mgScores split (1153-1163); brand stamp (269); gates.
- `motion-graphics/engine/composition-planner.ts` — planComposition + switch(primary.kind) (:238).
- `motion-graphics/engine/content-shape-analyzer.ts` — analyzeContentShape (signal-blind; _kind ignored).
- `services/brief-executor.ts` — Path E executor (active).
- `services/intent-translator.ts` — Unified-Intelligence-path content (fallback only; content-leak: only `text` survives).
- `motion-graphics/engine/structural-gate.ts` (observe-only), `aesthetic-gate.ts` (dead).
- `services/auto-post-processing.ts` — drift-zoom (working).

---

## §9. Corrections to prior memory / handovers (verify-don't-assume wins)
1. **Path D is NOT the live producer — Path E (Creative Brief) is.** USE_CREATIVE_BRIEF=true everywhere. [author-verified]
2. **`selectWinners` is NOT broken** — correct 3-arg call (`:906`); the "2-arg crash @ :857" is fixed/stale. It's inert (gated off + graphic winners discarded), not broken. [CODE-READER]
3. **Signal count 49 → 48; SIGNAL_MAP :395-425 → :566-609.** [CODE-READER]
4. **`signalsAtFrame` :613 → :635** (line drifted with commits). [CODE-READER]
5. **Curve does not clamp negative inputs** (output-only clamp). [CONFIRMED]

---

## §10. Provenance & what's UNCERTAIN
- **Author-CONFIRMED (read this session):** 91 overlay count + per-category (grep); pull-back inversion + the proportional formula; additive/multiplicative split (edl-executor:1153-1163); the form switch + `_kind` ignored; keyword_highlight on speech.energy; the 6 curves + output-only clamp; Path E active (env grep + director-agent:355); zoom rendered 9/9 in (probe); signals-not-persisted (probe).
- **CODE-READER (5 parallel agents, cross-consistent, spot-checked):** signal-registry derivation line numbers; the 5 paths; status ledger; threshold-bandit; precedence bug; designed-but-unemitted list.
- **UNCERTAIN (stated):** whether any real Mode-2 project sets `brandId` at runtime (DB state); whether USE_UTILITY_LIVE/ENGINE are set in deploy (default off in code); exact director-agent.ts line numbers may drift with commits — re-grep before editing.

## §11. Correction to §6 (2026-06-04, real-data harness)
§6's "approved fix" (fix the overlay inversion) is SUPERSEDED. The offline harness (`scripts/probe-zoom-reconstruct.ts`) proved the zoom overlays are a **gated-off Path-D fallback** that on real signals produce pull-backs/resets — NOT the rendered zoom-ins. **The live zoom-in monotony comes from Path E (Creative Brief LLM):** the prompt frames zoom as emphasis/push/drift and orphans `zoom_pull_back` (in enum `creative-brief.ts:33`, absent from guidance), and `applyZoom` ignores `decision.technique` (defaults scaleTo=1.1). Real fix = Rule-35 prompt-eval on the brief's zoom direction + a companion technique→params wiring fix. The overlay inversion (overlay-definitions.json:75,1309) + `energy_delta`-dead are real but DORMANT. Full detail: `05-Bugs-and-Issues/Zoom-Phase-3.1-Diagnosis-2026-06-03.md`.

— End of map. Next action per founder: build the Rule-35 zoom eval harness (Path-E prompt fix).
