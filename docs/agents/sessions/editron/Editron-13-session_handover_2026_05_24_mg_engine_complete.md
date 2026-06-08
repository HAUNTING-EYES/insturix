---
name: session-handover-2026-05-24-mg-engine-complete
description: "MEGA SESSION. 23 commits, CEO plan 9/9 complete, 34/34 signals, Disney 6/6, investigation 7 wiring gaps, batch testing, deep architecture research for visual+non-speech. NEEDS CEO/eng review before next build."
metadata:
  node_type: memory
  type: handover
  last_updated: 2026-05-24
  originSessionId: 8d5a9549-af61-40b6-98d0-9695ded9cf85
---

# Session Handover — 2026-05-24

**READ THIS ENTIRE DOCUMENT before touching code.**
**Branch:** `infrastructure-improvs-+Editron` (deploy branch)
**Worktree:** `D:\google downloads\Front-End-main\editron-worktree\`
**Session:** ~12 hours | 23 commits | +3,200/-100 lines | 20+ files

---

## ⛔ STOP — Critical Context You'll Get Wrong Without This

### 1. The MG pipeline has TWO signal paths. Don't confuse them.
```
PATH 1: ContentSignals → motion-theme-resolver.ts → MotionTokens (visual language)
         Affects: colors, typography, animation speed, layout density
         WHERE: resolveMotionTokens() called by edl-executor.ts:1098 AND tools.ts:4552

PATH 2: Signal snapshots → signal-executor.ts → decision.params.signals → PlannerSignals
         Affects: composition decisions (which elements, complexity, hold patterns, keyframes)
         WHERE: planComposition() in edl-executor.ts:1114 AND tools.ts:4553
```
Both paths now carry REAL signal data (root cause fix: commit 929b3fe1 from prior session + 38fecf93 this session fixed tools.ts empty defaults).

### 2. The theme system is DYNAMIC, not static.
`motion-theme-resolver.ts` at `lib/editron/data/motion-theme-resolver.ts` (NOT in engine/ directory) computes 35 MotionTokens from signals. There's one STATIC theme file (`themes/minimal-tech.ts`) used only as reference — production uses `resolveMotionTokens()` which produces signal-driven tokens every time.

### 3. signalCurves at render time are SYNTHESIZED, not piped.
The overlay stores scalar signal snapshots (`contentSignals: {enthusiasm: 0.7, bpm: 120, ...}`). At render time, `motion-graphic-layer-content.tsx` converts these to per-frame arrays via `synthesizeSignalCurves()`. Beat data is generated from BPM using the D6 hierarchy formula. This was a ROOT CAUSE fix this session — before commit 8e222ada, signalCurves was ALWAYS undefined at render time. All audio-reactive modulation was dead code.

### 4. The creative brief has JSON retry now.
`creative-brief.ts` retries with seeds [42, 7, 99] on JSON parse failure (commit 11d1e61a). Before this fix, ~20-40% of creative briefs failed to parse. This is a PRODUCTION fix on the deploy branch.

### 5. Phase 1C history — DON'T gate on visual data.
Session 2026-05-15 added "skip profile transitions when Path D ran." It caused ZERO transitions when 5-Track hit Gemini 429. The system was WORSE than before. **Any new visual intelligence must be ADDITIVE (suggest), never GATING (block when data missing).** This lesson applies to the visual understanding architecture planned below.

---

## 🏗️ System Architecture — How MG Works End-to-End

### The Complete Pipeline (verified by investigation agent, file:line refs)
```
1. Director Step 9 → addMotionGraphic tool (tools.ts:4502)
   OR EDL executor graphic decision (edl-executor.ts:1092)

2. Feature flag check: DEFAULT_CONFIG.features.useCompositionEngine = true
   (editron-config.ts:499)

3. Signal resolution:
   edl-executor.ts:1098 → resolveMotionTokens(rawSignals, brand)
   tools.ts:4552 → resolveMotionTokens(DEFAULT_SIGNALS, {})  ← was {} before fix

4. Composition:
   planComposition(intent, tokens, signals) → Recipe
   Recipe = { id, elements[], layout, exitStyle }

5. Structural gate (observe-only):
   checkCompositionStructure(recipe, tokens) → { pass, score, issues[] }
   7 WCAG checks. Logs warnings. Does NOT block.

6. Overlay creation:
   type: 'motion-graphic', recipe embedded, resolvedTokens, contentSignals stored

7. Remotion render path:
   layer-content.tsx:127 → MotionGraphicLayerContent
   motion-graphic-layer-content.tsx:35 → SafeCompositionRenderer
   signalCurves synthesized from contentSignals (BPM → beat grid)

8. Per-frame animation:
   computeAnimationState(frame, timing, entrance, exit, spatial, holdPattern)
   → Disney phases: anticipation → entrance (S&S + arc) → settle (follow-through)
     → hold (pulse/breathe/float) → beat-reactive (7 levels) → exit
   → applyMGKeyframes (if keyframeTracks exist)
   → applyAudioReactiveModulation (energy, emotion, beat hierarchy)
```

### Key Files Map
```
lib/editron/motion-graphics/
├── engine/
│   ├── recipe-types.ts          — ALL type definitions (HoldPattern, MGKeyframe, etc.)
│   ├── composition-planner.ts   — Signal-driven Recipe creation, keyframe generation
│   ├── composition-renderer.tsx — React/Remotion render component
│   ├── primitive-renderers.ts   — Animation state machine (Disney, beats, hold, settle)
│   ├── choreography-computer.ts — Stagger timing, anticipation phase
│   ├── property-resolver.ts     — Binding resolution (token: → value)
│   ├── content-shape-analyzer.ts— Layout, budget, exit style from content+signals
│   ├── structural-gate.ts       — Tier 1 aesthetic gate (WCAG, no API)
│   ├── aesthetic-gate.ts        — Tier 2 vision gate (Gemini Flash, standalone)
│   ├── composition-templates.ts — Extensibility registry for new shapes
│   ├── gsap-easing.ts           — Easing curve resolution (17 GSAP curves)
│   ├── brand-pattern-generator.ts
│   ├── brand-composition-rules.ts
│   ├── content-shape-analyzer.ts
│   ├── crg-constraint-validator.ts
│   └── data-viz-renderers.tsx
├── themes/
│   └── minimal-tech.ts          — Static reference theme (NOT used in production)
├── structures/
│   └── StatCounter.tsx          — Legacy stat counter (only for old overlays)
└── context/
    └── MotionThemeContext.tsx

lib/editron/data/
└── motion-theme-resolver.ts     — DYNAMIC 35-token resolver from signals (THE production path)

lib/editron/services/
├── signal-registry.ts           — 34 signals across 5 dimensions
├── signal-executor.ts           — Maps registry snapshots → decision params
├── creative-brief.ts            — Gemini creative brief with JSON retry
└── edl-executor.ts              — Applies decisions, calls planComposition

components/.../overlays/motion-graphic/
└── motion-graphic-layer-content.tsx — Remotion overlay, synthesizeSignalCurves
```

---

## 🎯 What We Built — Capabilities (Not Commits)

### Animation System (6-Phase)
```
ANTICIPATION → ENTRANCE → SETTLE → HOLD (ambient) → BEAT-REACTIVE → EXIT
```
- **Anticipation** (Disney #2): Ghost opacity pre-entrance for scale-up/pop. 20% of entrance carved.
- **Entrance** (Disney #1 S&S + #7 Arc): 9 patterns. Squash & Stretch on scale/pop (0.08-0.12 factor). Arc motion on all 4 slides (0.2 perpendicular offset).
- **Settle** (Disney #5 Follow Through): Damped cosine after entrance. Scale: 4% overshoot/8 frames. Slides: 3px/6 frames. Overlapping action via variable settle duration.
- **Hold**: 3 patterns — pulse (2% scale), breathe (15% opacity), gentle-float (3px Y). Signal-driven selection: enthusiasm+slow→pulse, warmth→breathe, moderate→gentle-float.
- **Beat-Reactive** (D6): 7-level hierarchy. beat_level 0-1 continuous. Tatum→tactus→bar→downbeat→phrase→section. Quadratic response scaling. Onset = separate brightness spike. BPM-derived beat grid generated at render time.
- **Exit**: Mirrors entrance with S&S + arc.

### Signal System (34/34)
| Dimension | Count | Signals |
|-----------|-------|---------|
| TEMPORAL | 2 | position_in_video, time_since_last_cut |
| CONTENT | 6 | name_mentioned, number_mentioned, speech_coverage, energy_delta, claim_strength*, face_present |
| EMOTIONAL | 9 | formality, enthusiasm, warmth, emotional_arousal, humor, visceral_impact, face_emotion, stress_detected, emotional_alignment |
| PERCEPTUAL | 4 | motion_intensity, shot_scale, visual_complexity, text_on_screen |
| RHYTHMIC | 5 | music_beat, music_energy, music_section, music_tatum, bpm |
| OTHER | 8 | visual_dependency, pacing_velocity, narrative_pressure, cinematic_moment, active_overlay_count, montage_mode, visual_significance, scene_type |

Signal consumption in composition:
- **Budget suppression**: montage_mode > 0.5 → budget=0. active_overlay_count >= 3 → budget=0. visual_significance > 0.7 → budget -2.
- **Scene adaptation**: scene_type='action' → cap elements at 3.
- **Hold pattern**: enthusiasm+pacing → pulse/breathe/gentle-float/static.
- **Keyframe generation**: visceral_impact > 0.7 → 15px drift. enthusiasm > 0.8 + pacing > 0.6 → scale pulse on counters.

### Composition Engine
- 8 content shapes: numeric, identity, quotation, emphasis, data-series, brand, structured, free-text
- Template registry (D5) for extensible custom shapes
- Signal-driven layout, exit style, complexity budget
- CRG-sourced minimum font sizes (48-72px)
- Formality-based container decisions
- Brand pattern generation at budget >= 4

### Quality Gates
- **Tier 1 Structural** (inline, free, 7 checks): primary contrast (WCAG 4.5:1), secondary contrast (3:1), accent visibility (2:1), font size compliance, element density, narrow layout overflow, frame brightness match.
- **Tier 2 Vision** (standalone, Gemini Flash): 4-dimension rubric (readability, contrast, hierarchy, overlap). Pass threshold 70/100. Not yet wired to Director.

### Keyframe System (D8)
- Types: MGKeyframe, MGKeyframeTrack, MGSpeedRamp on RecipeElement + ResolvedElement
- Renderer: `applyMGKeyframes` interpolates per-property per-frame. 4 easing modes.
- Speed ramp: `remapFrameBySpeed` integrates speed curve, clamped 0.1-4.0x.
- Generation: `resolveKeyframeTracks` adds motion paths from signals.
- **Currently generates**: translateY drift (visceral > 0.7), scaleX/Y pulse (enthusiasm > 0.8 + pacing > 0.6 on counters).

---

## 🔴 What's Broken — Honest List

### P0 Bugs (pre-existing, affect every video)
| Bug | What | File | Open Since |
|-----|------|------|------------|
| A3.1 | Parser montage decomposition wrong | llm-scene-parser.ts | Apr 8 |
| A3.2 | Sub-shots share ONE reference image | storyboard-service.ts | Apr 8 |
| A3.5.1+2 | Dual transition system (10 dip-to-blacks) | director-agent.ts + edl-executor.ts | Apr 8 |
| A3.5.4 | Filter schizophrenia (hue-rotate on nostalgia) | edl-executor.ts | Apr 8 |

### Architecture Gaps (identified this session)
| Gap | What | Severity | Fixable? |
|-----|------|----------|----------|
| No visual dead-air detection | System has Gemini Vision + V-JEPA data per frame. Nobody uses it for cut decisions. Hank staring at script passes through. | HIGH | Yes — needs VES (Visual Engagement Score) or TAG architecture |
| Non-speech content uneditable | Creative brief + Director require word indices. Music videos, product b-roll, timelapses = zero coordinates. System skips intelligence entirely. | CRITICAL | Yes — needs Universal Time Coordinate (TAG architecture) |
| Logo reveal over-generation | LLM produces 5 when prompt says max 2. Constraint is prose-only, not code-enforced. | MEDIUM | Easy — add maxPerVideo enforcement in validateAndGate |
| Aesthetic gate Tier 2 unwired | runAestheticGate exists but nobody calls it. Needs rendered frame (not available at composition time). | MEDIUM | Needs architectural thought — gate runs in quality-review-service post-render |

### Unwired Code (built but not connected)
| What | File | Impact |
|------|------|--------|
| editronConfig.ts (100+ values) | lib/editron/config/editron-config.ts | Foundation — all services still hardcoded |
| Pipeline warnings | lib/editron/services/pipeline-warnings.ts | Error visibility — failures invisible to user |
| alignCutsToBeats() | lib/pipeline/scene-to-editron.ts:311 | Beat-synced assembly — function exists, never called |
| Confidence tracking | five-track-analysis.ts | Only EDL executor checks — 3 consumers don't |

---

## 🔬 Investigation Findings (This Session)

We investigated 7 potential issues in the MG render pipeline. 4 were real gaps, all fixed:

| # | Issue | Was | Root Cause | Fix |
|---|-------|-----|-----------|-----|
| 1 | signalCurves never reached renderer | **DEAD CODE** | motion-graphic-layer-content.tsx read contentSignals but never passed to SafeCompositionRenderer | `synthesizeSignalCurves()` converts scalar snapshots → per-frame arrays. Commit 8e222ada |
| 2 | Signals all defaults at render | **PARTIAL** | Real signals reach PLANNING (recipe decisions). But rendering got undefined. | Fixed by #1 — synthesized curves now carry real signal values |
| 3 | captionZoneAware ignored | **GAP** | resolveLayout had no branch for captionZoneAware boolean | Bottom offset shifts 12%→22% when flag set. Commit 8e222ada |
| 4 | No graphics in Mode 1 | CONDITIONAL | Path E needs rawFootageAnalysis. Mode 1 uses Path D which CAN produce graphics via signal executor | Not a gap for Mode 1 — different path |
| 5 | beat_level curve never existed | **DEAD CODE** | No code anywhere built beat_level as a per-frame array. D6 hierarchy read zeros. | BPM-derived beat grid in synthesizeSignalCurves. Commit 86390592 |
| 6 | Keyframes never trigger on defaults | BY DESIGN | DEFAULT_SIGNALS.visceral_impact=0.3 < threshold 0.7. Only real signals trigger. | Correct conservative behavior |
| 7 | Structural gate too narrow | OK but incomplete | Only checked primary contrast + font + density + brightness | Expanded to 7 checks (added secondary contrast, accent visibility, layout overflow). Commit ac40cb39 |

---

## 🧪 Testing Infrastructure

### What Tests Exist
| Script | What | Assertions | How to Run |
|--------|------|-----------|------------|
| `scripts/test-mg-matrix.ts` | 6 signal profiles × composition engine | 21/21 | `npx tsx scripts/test-mg-matrix.ts` |
| `scripts/test-full-pipeline.ts` | 5 EDL decisions × full pipeline (mock signals → tokens → recipe → gate → curves → beats) | 32/32 | `npx tsx scripts/test-full-pipeline.ts` |
| `scripts/test-content-types.mjs` | 5 content types × Gemini creative brief (REAL LLM call) | 5/5 types | `node scripts/test-content-types.mjs` (~3-4 min) |
| `scripts/test-full-system.mjs` | Single video full pipeline + HTML timeline | Visual | `node scripts/test-full-system.mjs` (~40s) |
| `scripts/eval-creative-brief-graphics.mjs` | Multi-seed eval harness for graphic decisions | Composite 0.95+ | `node scripts/eval-creative-brief-graphics.mjs --multi-seed` (~8 min) |

### Batch Test Results (5 content types, 313 decisions)
System IS content-aware — adapts graphic mix per content type:
- **Corporate** = 68% stat counters (earnings call with numbers)
- **Entertainment** = 21% lower-thirds (concert vlog with many names)
- **Product review** = 60% stat counters (spec sheet)
- **Tutorial** = mixed stats + keywords (commands + concepts)
- **Talking head** = keyword-heavy (conceptual essay)

### Test Artifacts (HTML dashboards)
- `scripts/content-type-comparison.html` — visual comparison across 5 types
- `scripts/full-system-test-output.html` — single video timeline with decision markers

---

## 📚 Architecture Research — Visual Understanding + Non-Speech Editing

### The Two Unsolved Problems

**Problem 1: Dead air detection.** System decides cuts from WORDS only. A speaker staring at their script for 3 seconds (no speech) passes through undetected. Visual data (Gemini Vision, V-JEPA) exists but nobody uses it for cut decisions.

**Problem 2: Non-speech content.** Every decision anchored to word index. Music videos, product b-roll, timelapses = zero coordinates. Creative brief produces null. Director skips intelligence entirely.

### Research Papers
| Paper | Venue | Key Insight | Link |
|-------|-------|-------------|------|
| EditDuet | SIGGRAPH 2025 | Editor+Critic multi-agent. Evaluates structure/relevance/aesthetic/pacing WITHOUT rendering. | https://arxiv.org/abs/2509.10761 |
| HIVE | EMNLP 2025 | Decomposes editing into highlight detection + pruning. MULTIMODAL understanding. | https://arxiv.org/abs/2507.02790 |
| MVAA | arxiv 2025 | Beat-aligned video editing with arbitrary music. Two-stage approach. | https://arxiv.org/html/2506.18881v1 |
| VQ-Insight | arxiv 2025 | VLM-based quality assessment. LLM scores video quality. | https://arxiv.org/pdf/2506.18564 |

### Industry Landscape
- **Descript** = transcript-first. Fails on music-only. Same problem as us.
- **OpusClip** = speech analysis. Fails on music-only. Same problem.
- **CapCut** = visual-first. Handles music-only. Different architecture (not transcript-anchored).
- **Nobody has solved both.** This is a genuine unsolved problem in the industry.

### Vision Model Comparison
| | Gemini 2.5 Flash | Qwen3-VL 8B | Twelve Labs Pegasus 1.2 |
|-|-----------------|-------------|------------------------|
| Temporal grounding | Prompt-based | Native text-timestamp alignment (BEST architecture) | Purpose-built (BEST accuracy — 78.5% composite) |
| Self-hostable | No | ✅ Single GPU | No |
| Rate limits | Yes (429 = our real problem) | None if self-hosted | Dedicated infra |
| Cost/5-min video | ~$0.01 | ~$0 self-hosted | ~$0.31 |
| Already in stack | ✅ | No | No |
| Video length | 1 hour | Variable | 2 hours |
| Tech report | — | https://arxiv.org/abs/2511.21631 | https://www.twelvelabs.io/product/models-overview |

### JS/TS Library Landscape
| Library | What | Production? | Link |
|---------|------|-------------|------|
| Essentia.js | Beat, onset, BPM, spectral, MFCC (WASM) | ✅ MTG Barcelona, ISMIR published | https://mtg.github.io/essentia.js/ |
| Meyda.js | Spectral, energy, loudness | ✅ Lighter alternative | npm: meyda |
| ffmpeg.wasm | Full ffmpeg in WASM | 🟡 3-10x slower | https://github.com/ffmpegwasm/ffmpeg.wasm |
| sharp | Image/frame processing | ✅ Battle-tested | npm: sharp |
| Scene detection | **NOTHING in JS/TS** | ❌ Python only | — |

### Python Bridge Options (for PySceneDetect, etc.)
| Option | How | Production? |
|--------|-----|-------------|
| Modal.com | Serverless Python from TS SDK. GPU, auto-scale, no infra. | ✅ Used by Anthropic, Ramp, Suno |
| AWS Lambda Python | Separate Lambda functions | ✅ Already have Lambda for Remotion |
| Microservice | Flask/FastAPI on Railway/Render | ✅ Standard but ops overhead |

Modal docs: https://modal.com/docs/guide

### User's TAG Architecture Proposal (Brainstorm — NOT final)

**Temporal Anchor Grid:** Universal time coordinate. Every 500ms = a `t_index`. For speech: word indices primary, TAG fills gaps. For non-speech: TAG is the only coordinate.

**Three layers:**
- **L0 (Deterministic, can't fail):** Silence detection (RMS threshold on existing audio.energyCurve), beat detection (Essentia.js), scene boundaries (frame histogram diff via sharp). Always runs. Zero ML.
- **L1 (LLM enrichment, additive):** Gemini/Qwen3-VL temporal video analysis. Enriches L0. Never gates.
- **L2 (Existing signals, additive):** V-JEPA, Wav2Vec, 5-Track. Enriches when available.

**Validation notes:**
- We ALREADY have a 500ms grid (signal-registry computes every 15 frames). TAG = reframing of existing infrastructure, not a new data structure.
- L0 silence detection = RMS energy threshold on `audio.energyCurve` we already compute. ~10 lines of JS.
- L0 beat detection = Essentia.js (JS/WASM). Direct replacement for librosa.
- L0 scene detection = sharp frame histogram diff on keyframeAnalyses.dominantColors. NOT PySceneDetect (Python). If production quality needed → Modal for PySceneDetect.

**Signal-driven routing (user-proposed):**
```
speechCoverage > 0.6                    → SPEECH mode (word-index, existing system)
musicPresence > 0.5 + speech < 0.3      → MUSIC mode (beat-aligned coordinates)
visualChangeRate > 0.3 + speech < 0.3   → VISUAL mode (scene boundaries)
mixed                                    → HYBRID mode (all coordinates, merge by confidence)
```

**Open question:** The merge logic (when TAG suggests cut and transcript says keep) is the HARDEST unsolved piece. Dramatic pause vs dead air requires editorial judgment, not concatenation.

---

## 🎓 Lessons & Rules Learned This Session

### Technical Lessons
1. **signalCurves synthesis is non-obvious.** Overlay stores scalars, renderer needs arrays. The bridge (`synthesizeSignalCurves`) must be explicitly wired. Nobody will do it for you.
2. **beat_level doesn't exist unless you create it from BPM.** The signal-registry computes binary beats. The 7-level hierarchy is a DERIVED signal computed at render time from BPM + frame math.
3. **tools.ts and edl-executor.ts are TWO different paths to the same engine.** Agent tool path (AI chat) vs EDL path (creative brief). Both must be kept in sync. tools.ts had empty signals bug for the entire engine's lifetime.
4. **The creative brief JSON parse failure is seed-dependent.** Same prompt, different seed = different completion path. Retrying with 3 seeds fixes ~95% of failures.
5. **The structural gate runs on ABSTRACT data (tokens + recipe), not rendered pixels.** This is a feature — it's free and instant. Tier 2 (vision) needs rendered frames and costs money.

### Process Lessons
1. **R33 (3+ edits to same file) = stop patching.** primitive-renderers.ts got 11 edits across 3 concerns. Each was planned, not patching, but the letter was violated. In fresh sessions, batch related changes to the same file in one phase.
2. **R12N (one commit one concern) was violated twice** — combining structural gate + keyframes in one commit. Keep them separate.
3. **Graphify graph is STALE** for MG engine files (graph built 2026-05-14, engine built 2026-05-21+). Run `graphify update .` from main worktree before querying for MG architecture.
4. **Eval harness score (0.95) was misleading.** It measured structural validity (params have digits, keywords not filler) but NOT creative quality (is this the RIGHT moment for a graphic?). Be honest about what metrics actually measure.
5. **The user's feedback: "follow ALL rules from FIRST edit."** Don't do evidence blocks retroactively. Don't answer checklists after the edit. BEFORE. Every time.

### User Preferences (observed this session)
- Quality over speed. Every time.
- Don't assume. Verify against actual code.
- Don't be lazy. Read the file. Check the callers.
- Think like CEO + Elon + video editor before proposing solutions.
- Batch testing over manual testing. Scale > individual checks.
- The system should be SMARTER, not just WORKING. "Does it feel good?" matters.

---

## 📋 Video Dataset Resources

### Quick Access (free)
| Source | What | Link |
|--------|------|------|
| Pexels talking head | 6,237+ clips | https://www.pexels.com/search/videos/talking%20head/ |
| Pexels interview | 6,927+ clips | https://www.pexels.com/search/videos/interview/ |
| Pexels API | Programmatic access | https://www.pexels.com/api/ |
| TalkingHead-1KH | CC BY 3.0, YouTube | https://github.com/tcwang0509/TalkingHead-1KH |
| TalkVid | 1244 hours, 7729 speakers | https://github.com/FreedomIntelligence/TalkVid |
| AVE | ECCV 2022, AI editing benchmark | https://github.com/dawitmureja/AVE |
| Awesome Video Datasets | Master list | https://github.com/xiaobai1217/Awesome-Video-Datasets |
| Awesome Video Editing | Papers + datasets | https://github.com/wentianli/awesome-video-editing |

---

## ⚠️ ALL Invented Thresholds (Need Calibration)

Every number marked ⚠️ INVENTED in the codebase. Consolidated for calibration work:

| File | Threshold | Value | AE/CRG Range | Purpose |
|------|-----------|-------|--------------|---------|
| primitive-renderers.ts | S&S scale-up factor | 0.08 | AE 5-10% | Squash divergence amplitude |
| primitive-renderers.ts | S&S pop factor | 0.12 | AE 10-15% | Stronger pop squash |
| primitive-renderers.ts | Arc magnitude | 0.2 | AE 10-25% | Perpendicular sine offset |
| primitive-renderers.ts | Anticipation ratio | 0.2 | AE 15-25% | Entrance frames stolen |
| primitive-renderers.ts | Ghost opacity | 0.15 | AE 10-20% | Anticipation ghost |
| primitive-renderers.ts | Follow-through scale | 0.04 | CRG 3-5% | Overshoot amplitude |
| primitive-renderers.ts | Follow-through position | 3px | CRG 2-5px | Slide overshoot |
| primitive-renderers.ts | Settle frames (scale) | 8 | AE 4-12 | Follow-through duration |
| primitive-renderers.ts | Settle frames (slide) | 6 | AE 4-12 | Overlapping action |
| primitive-renderers.ts | Hold cycle | 90 frames | AE 2-4s | Ambient animation period |
| primitive-renderers.ts | Pulse amplitude | 0.02 | AE 1-3% | Hold scale oscillation |
| primitive-renderers.ts | Breathe range | 0.15 | AE 10-20% | Hold opacity variance |
| primitive-renderers.ts | Float amplitude | 3px | AE 2-5px | Hold Y drift |
| primitive-renderers.ts | Beat max scale | 0.05 | CRG 2-5% | D6 hierarchy response |
| primitive-renderers.ts | Beat max brightness | 0.06 | — | D6 brightness boost |
| primitive-renderers.ts | Beat rotation | 0.5° | — | Phrase+ dimensional interest |
| primitive-renderers.ts | Onset brightness | 0.08 | — | Transient spike |
| composition-planner.ts | Enthusiasm→pulse | >0.6 + pacing<0.5 | — | Hold pattern selection |
| composition-planner.ts | Warmth→breathe | >0.6 | — | Hold pattern selection |
| composition-planner.ts | Enthusiasm→float | >0.4 | — | Hold pattern selection |
| composition-planner.ts | Visceral→drift | >0.7 | — | Keyframe trigger |
| composition-planner.ts | Enthusiasm→pulse kf | >0.8 + pacing>0.6 | — | Counter scale pulse |
| composition-planner.ts | Drift amount | 15px | AE 10-20px | Keyframe drift distance |
| composition-planner.ts | Pulse scale | 1.05 | CRG 2-5% | Keyframe scale pulse |
| content-shape-analyzer.ts | Montage suppress | >0.5 | CRG montage def | Budget=0 |
| content-shape-analyzer.ts | Overlay count suppress | >=3 | CRG overlay max | Budget=0 |
| content-shape-analyzer.ts | Visual significance | >0.7 | — | Budget reduction |
| structural-gate.ts | Element density cap | 6 | — | Foreground clutter |
| structural-gate.ts | Bright frame threshold | 0.7 | — | Brightness mismatch |
| structural-gate.ts | Dark frame threshold | 0.3 | — | Brightness mismatch |
| structural-gate.ts | Narrow layout text cap | 3 | — | Overflow risk |
| composition-renderer.ts | Caption zone offset | 22% | — | captionZoneAware shift |

### Eval Harness Lesson
The creative brief eval scored 0.95 composite across seeds. But this measures **structural validity** (params have digits, keywords aren't filler, names exist in transcript) — NOT **creative quality** (is this the right moment? would an editor place this here?). Don't use this score to claim the system makes good creative decisions. It only proves it doesn't make obviously broken ones.

---

## 🔍 Review Questions for Next Session

### CEO Review Questions
1. **Priority:** P0 bugs affect EVERY video today. Visual understanding unlocks NEW content categories. Which first?
2. **User mix:** What % of users upload speech-dominant vs music/b-roll? If 90% talking-head, P0 bugs matter more.
3. **Cost of delay:** If visual intelligence ships in 2 weeks vs 2 months, what changes for the business?
4. **Modal commitment:** Adding a Python sidecar (Modal.com) is an operational commitment. Is the team ready for another vendor?
5. **Quality bar:** The MG engine produces graphics. Are they GOOD ENOUGH to ship, or do thresholds need calibration first?

### Engineering Review Questions
1. **Architecture safety:** TAG proposes layered degradation (L0→L1→L2). Phase 1C proved gating breaks things. Is the additive pattern ACTUALLY enforced, or could L1 failure still block L0?
2. **Merge logic:** When TAG says "cut this silence" and transcript says "keep this pause" — who wins? What's the decision tree? Can we enumerate the edge cases?
3. **Coordinate system migration:** Adding `t_index` alongside `word_index` — how many files need to understand both? What's the blast radius?
4. **Essentia.js in Lambda:** Does WASM work in Vercel serverless? Memory limits? Cold start impact?
5. **BPM beat grid accuracy:** Our `synthesizeSignalCurves` generates beat arrays from BPM. At non-standard tempos (130BPM = 461ms beats vs 500ms grid), how much drift? Does it matter for visual sync?
6. **Testing strategy:** How do we verify visual intelligence works across content types without manual watching? Can we automate "this edit feels right" somehow?

### Video Editor Review Questions
1. **Dead air vs dramatic pause:** What visual cues distinguish them? Can we enumerate rules, or does it require full video context?
2. **Music-only editing quality:** What's the minimum acceptable quality for a beat-synced montage? Just cuts on beats? Or do zoom/transition types matter too?
3. **Graphic density:** Tutorial got 28 graphics in 52 seconds. Is that too many? Professional tutorials (Fireship, NetworkChuck) ARE that dense — but do they feel overwhelming?

---

## 📌 Deferred Work

### Vercel API Automation (user chose "B now, A later")
Automated testing against real Vercel deployment. Script calls API endpoints with real video files. Tests 100% of pipeline. Needs: Clerk auth token, GCS upload wiring, MongoDB read access. ~half day setup. Deferred until MG engine stabilizes.

### CEO Plan Reference
Original locked plan: `~/.gstack/projects/Insturix-Front-End/ceo-plans/2026-05-22-mg-expansion-infinite-composition.md`
Contains: 10 proposals (D1-D10), 9 accepted, 1 deferred (D10 LottieGPT).

---

## ⏭️ Next Session — What To Do

### STEP 1: Reviews (before ANY code)
Run these reviews on the visual understanding + non-speech architecture:
- `/plan-ceo-review` — Priority: build visual intelligence or fix P0 bugs first?
- `/plan-eng-review` — Architecture: is TAG + layered degradation safe? What fails?
- Elon perspective: simplest thing that works for each problem
- Director perspective: routing logic for speech/music/visual/hybrid
- Video editor perspective: merge logic (dramatic pause vs dead air)

### STEP 2: Priority Decision
| Option | What | Impact | Risk |
|--------|------|--------|------|
| A: Fix P0 bugs | A3.1 parser, A3.2 images, A3.5.1 transitions | Every video improves today | No new capability |
| B: Build visual intelligence | TAG L0 + routing + non-speech prompt | Unlocks music/b-roll/product content | Could break working system if not additive |
| C: A then B | Bugs first, then architecture | Safest | Slower to new capability |

### STEP 3: If Building Visual Intelligence
1. Essentia.js integration (beat/onset detection in JS) — L0 foundation
2. RMS silence detection from existing energyCurve — L0 dead air
3. Frame histogram diff for scene boundaries — L0 visual change
4. Signal-driven routing (speech/music/visual/hybrid modes)
5. Creative brief prompt variant for t_index coordinates
6. Merge logic design (TAG suggestions + transcript decisions)
7. Qwen3-VL evaluation on Modal (Phase 2)

### STEP 4: If Fixing P0 Bugs
1. A3.2 per-sub-shot image generation — biggest visual impact
2. A3.1 parser decomposition — structural
3. A3.5.1+2 dual transition system — EDL source of truth

---

## 📊 All 23 Commits (Reference)

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
| 11 | `fee51969` | D1 signal consumption (8 signals → composition decisions) |
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
