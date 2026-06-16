---
name: session-handover-2026-05-27-mg-renderer-calibration
description: "MEGA SESSION: 19 commits, MG Phase 1 complete, renderer expansion, calibration pipeline, 13 bugs fixed. Full context for next session."
metadata:
  node_type: memory
  type: project
  originSessionId: mega-2026-05-27
---

# Session Handover — 2026-05-27 MG Phase 1 + Renderer + Calibration

## READ THIS FIRST — What the Next Session Needs to Know

This was a 7-hour mega session. 19 commits. The MG overlay system is DONE (all 5 CEO expansions shipped). The renderer has new visual moves. The calibration pipeline is built and partially running. 13 bugs fixed including a P0 that silently killed ALL long-video Wav2Vec data.

**Start the next session by running:** `npx tsx scripts/test-utility-engine.ts && npx tsx scripts/test-mg-overlays.ts && npx tsx scripts/test-integration-mg.ts && npx tsx scripts/test-adversarial-mg.ts` — confirm 270 assertions pass before touching anything.

---

## Branch & Git State

- **Branch**: `infrastructure-improvs-+Editron` (deploy branch)
- **Worktree**: `D:\google downloads\Front-End-main\editron-worktree\`
- **Latest commit**: `bf803ac7` — GSAP premium easing plugins
- **Status**: Clean, all pushed. 0 unpushed commits.
- **Previous handover**: `session_handover_2026_05_27_overlay_system.md` (the session BEFORE this one)

---

## The 19 Commits (in order)

| # | SHA | What | Impact |
|---|-----|------|--------|
| 1 | `6a5b5d53` | MG Phase 1 — 20 signal-driven overlay definitions + planner refactor + EDL wiring | MAJOR — every MG visual property now signal-driven |
| 2 | `6b295c86` | Pipeline warnings in API, transcription timeouts, humor signal | 3 bug fixes |
| 3 | `51fd871f` | Transition map complete (23 entries), logo per-type cap | 2 bug fixes |
| 4 | `b845f0fe` | Calibration: gemini-2.5-flash model, dotenv, yt-dlp binary | Infra fix |
| 5 | `5e3f96ba` | YouTube calibration pipeline (4 scripts + config) | NEW FEATURE |
| 6 | `7603ed27` | Kinetic typography — per-char/word text animation | MAJOR — Iman-style text |
| 7 | `900f089d` | Wav2Vec batch timeout 120s cold / 90s warm | Bug fix |
| 8 | `81bc5e05` | **P0**: Wav2Vec batchStartMs crash — ALL long-video data was lost | CRITICAL FIX |
| 9 | `c903481d` | Calibration: Grok STT via production service | Infra fix |
| 10 | `5f384776` | Calibration: Grok STT direct call (bypass MongoDB) | Infra fix |
| 11 | `b2b3bf6e` | Bandit Map deserialization + transcription fallback | Bug fix — bandits never persisted |
| 12 | `4078d296` | Calibration: void updateThresholdBandit fix | Bug fix |
| 13 | `9c209d74` | Calibration: Grok binary file upload (GCS header workaround) | Infra fix |
| 14 | `fffedeec` | 20 reference videos for calibration | Config |
| 15 | `97fcde07` | Model factory Phase 1 — 4 hardcoded refs → constant | Bug fix |
| 16 | `329ab3ef` | Model factory Phase 2 — remaining 3 refs | Bug fix |
| 17 | `ce65a50c` | E1 spatial intelligence — overlay-driven layout position | Feature |
| 18 | `605a76e4` | Beat-synced MG entrances — snap to musical beats | Feature |
| 19 | `4cd0e1ba` | Renderer Tier A — rotate-in, skew-in, zoom-blur, glow hold | MAJOR — new visual moves |
| 20 | `7339286c` | Wire new entrance/hold overlays into signal selection | Feature |
| 21 | `bf803ac7` | GSAP premium easing plugins (bounce, wiggle, custom ease) | Feature |

---

## Architecture: How the MG System Works Now

```
Content Signals (71 signals from 5-Track + Wav2Vec + V-JEPA + Essentia + Transcript)
    ↓
Signal Registry: buildSignalTimeline()
    → 48 grid signals, 9 event types, 14 global, 7 personality
    ↓
Overlay Scoring (72 definitions, 8 categories)
    → Property overlays (additive): fontSize, fontWeight, tracking, lineHeight, opacity, cornerRadius, etc.
    → Selection overlays (multiplicative): entrance type (8 competing), hold type (4 competing)
    ↓
Composition Planner: planComposition(intent, tokens, signals, mgScores)
    → Reads overlay scores via mgVal() helper (fallback to hardcoded defaults when no scores)
    → Maps entrance winner to EntrancePattern via ENTRANCE_WINNER_MAP (8 entries)
    → Maps hold winner to HoldPattern via resolveHoldPattern() (with 0.15 score threshold)
    → Assigns textSplit (chars/words) for kinetic typography on high-energy entrances
    → Overrides layout position via centerAvoidance overlay
    → CRG font floors enforced via Math.max (6 graphic types)
    ↓
Recipe (JSON): elements[] + layout + exitStyle
    ↓
Choreography Computer: computeChoreography()
    → Per-element timing (enter/hold/exit frames)
    → Beat sync: snaps enterStartFrame to nearest musical beat (within scaledStagger/2 tolerance)
    → Disney #2 anticipation: 20% of entrance stolen for pre-movement
    ↓
Composition Renderer (Remotion React component)
    → computeAnimationState(): 4-layer pipeline (speed ramp → phase → keyframes → audio-reactive)
    → 12 entrance patterns (fade, slide×4, scale-up, pop, blur-in, draw, rotate-in, skew-in, zoom-blur)
    → 8 exit patterns (mirrors)
    → 5 hold patterns (static, pulse, breathe, gentle-float, glow)
    → 21 animatable properties
    → SplitTextElement: per-char/word stagger with full animation pipeline per unit
    → Kinetic type for pop/slide/scale/skew/zoom-blur entrances with enthusiasm > 0.7
    ↓
Video frames captured by Remotion
```

---

## Key Files Modified This Session

| File | Lines | What changed |
|------|-------|-------------|
| `lib/editron/engine/overlay-definitions.json` | 2700+ | 48→72 overlays (24 MG-property added) |
| `lib/editron/engine/utility-types.ts` | 95 | Added 'mg-property' to OverlayCategory |
| `lib/editron/engine/utility-scorer.ts` | 162 | Added mg-property to selectWinners |
| `lib/editron/motion-graphics/engine/composition-planner.ts` | 700+ | MgOverlayScores type, mgVal/mgWinner helpers, overlay-driven values replacing 12 hardcoded constants + 3 threshold gates, entrance winner map, text split, spatial position, hold threshold |
| `lib/editron/motion-graphics/engine/composition-renderer.tsx` | 500+ | SplitTextElement for kinetic per-char/word animation |
| `lib/editron/motion-graphics/engine/recipe-types.ts` | 215 | TextSplitMode, textSplit field, 3 new entrance/exit patterns, glow hold |
| `lib/editron/motion-graphics/engine/primitive-renderers.ts` | 590+ | rotate-in, skew-in, zoom-blur entrances + exits, glow hold, activated rotation/skewX/textShadowBlur/filterBrightness |
| `lib/editron/motion-graphics/engine/choreography-computer.ts` | 220+ | Beat-sync frame snapping, dispatch fix for audio-beats |
| `lib/editron/motion-graphics/engine/gsap-easing.ts` | 75 | Registered CustomBounce, CustomWiggle, CustomEase plugins |
| `lib/editron/services/edl-executor.ts` | 1200+ | MG overlay scoring injection, SELECTION_IDS for new overlays |
| `lib/editron/services/signal-registry.ts` | 675+ | Humor signal derivation from real data |
| `lib/editron/services/signal-executor.ts` | 800+ | Transition map expanded 13→23 entries |
| `lib/editron/services/wav2vec-service.ts` | 200+ | batchStartMs fix, timeout increase |
| `lib/editron/services/threshold-bandit.ts` | 375 | Map deserialization fix |
| `lib/editron/services/media/transcription-service.ts` | 400+ | 4 timeout additions (Grok, Whisper, Gemini DL, Gemini generate) |
| `lib/editron/services/media/analysis-service.ts` | 600+ | Model factory constant |
| `lib/editron/agent/director-agent.ts` | 2765+ | Pipeline warnings attachment |
| `lib/editron/agent/tools.ts` | 5000+ | Logo per-type cap, model factory constant, getGenAI() singleton |
| `lib/editron/agent/agent-graph.ts` | 700+ | Model factory constant |
| `lib/editron/data/edit-profile-types.ts` | 176 | pipelineWarnings field on DirectorResult |
| `lib/editron/utils/gemini-model-factory.ts` | 155 | ANALYSIS_MODEL_NAME + CHAT_MODEL_NAME exports |
| `lib/editron/utils/token-tracker.ts` | 65 | Model factory constant |
| `components/.../llm-service-google.ts` | 200+ | Env var override for model name |
| `scripts/calibrate/calibrate.ts` | 600+ | Full calibration pipeline |
| `scripts/calibrate/reference-videos.json` | 95 | 20 reference videos |
| `scripts/test-mg-overlays.ts` | 130 | 30 MG overlay assertions |
| `scripts/test-integration-mg.ts` | 115 | 11 integration assertions |
| `scripts/test-adversarial-mg.ts` | 130 | 16 adversarial assertions |

---

## Decisions Made This Session

| Decision | Why | Alternative Rejected |
|----------|-----|---------------------|
| Additive scoring for MG property overlays | Properties always produce values (font size can't be "suppressed") | Multiplicative (one low signal kills the total) |
| Multiplicative for entrance/hold selection | Anti-patterns should suppress (pop on formal content = wrong) | Additive (all entrance types get moderate scores) |
| EDL executor injection (1 point) over Director (2 points) | Avoids R33 monolith debt, works for both Path D and Path E | Director dual injection |
| React char splitting over GSAP SplitText | Stays in Remotion frame model, uses existing computeAnimationState | GSAP SplitText (different animation model) |
| Lottie REJECTED | Templates defeat signal-driven system | Lottie asset library |
| Renderer vocabulary expansion via CSS/GSAP | Extends existing engine, doesn't swap renderer | New renderer |
| Beat snap tolerance = scaledStagger/2 | Preserves element ordering, prevents clustering | No tolerance (elements cluster on same beat) |
| Hold winner score threshold 0.15 | Prevents barely-scoring holds on calm content | No threshold (corporate gets glow) |
| Grok STT direct binary upload for calibration | GCS signed URLs lack Content-Type headers xAI needs | URL-based (400 error from xAI) |
| Model factory constants over function calls | LangChain needs string, not model instance | Force all through getAnalysisModel() |

---

## Bugs Debunked (NOT bugs — remove from all future lists)

| Claimed Bug | Reality | Evidence |
|-------------|---------|----------|
| Camera shake on energy_peak not impact | Correct design — overlay uses cinematic_moment | overlay-definitions.json line 1267 |
| editronConfig.ts dead letter (0 imports) | 12+ files import and use it | grep found 12 importers |
| Lower-third 30-frame gap too tight | Correct dedup — 90 frames is the real gap, 30 only in heavy mode | edl-executor.ts line 1077, editron-config.ts:350 |
| alignCutsToBeats only Path D | Called in Director for ALL paths | director-agent.ts:1468-1469 |
| V-JEPA ghost infrastructure | Fully wired in signal-registry.ts | Lines 5-291, findVjepaSegmentAt() |

---

## Calibration Pipeline

### How It Works
```
YouTube URL → yt-dlp download → GCS upload → parallel Modal analysis:
  ├─ Wav2Vec (215 segments, vocal emotion/energy/pitch)
  ├─ V-JEPA (215 segments, visual significance)
  └─ Essentia (BPM, beats, sections, music presence)
→ 5-Track (Gemini 2.5 Flash, shot detection)
→ Grok STT (transcription, binary file upload)
→ Signal computation (buildSignalTimeline, 71 signals)
→ Overlay scoring (72 definitions)
→ Compare our decisions vs professional editor's actual cuts
→ Feed Thompson Sampling bandits (threshold + genre)
→ Write to MongoDB
```

### Status
- **7/20 videos complete**, 35 bandit outcomes in MongoDB
- Iman Gadzhi: enthusiasm=0.786, warmth=0.226, pacing=0.500, visceral=0.447, visual_dep=0.600
- **13 videos failed** — bad YouTube IDs from training data. Need correct URLs for: Mark Rober, Dude Perfect, MKBHD, LTT, Corridor Crew, Ali Abdaal, ColdFusion, Peter McKinnon, Vox, Yes Theory, Ryan Trahan, Apple, Sam Kolder

### Env Vars for Calibration
- `XAI_API_KEY` — set in .env.local (sensitive on Vercel, not pullable). Used for Grok STT.
- `FAL_AI_API_KEY` — EMPTY everywhere. Whisper transcription unavailable. Not blocking (Grok works).
- `GEMINI_API_KEY` / `GOOGLE_API_KEY` — set. Used for 5-Track.
- `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET` — set. Used for Wav2Vec, V-JEPA, Essentia.
- `GCS_BUCKET_NAME` — set. Used for video storage.
- `MONGODB_URI` — set. Used for bandit state persistence.

### Run Calibration
```bash
cd "D:\google downloads\Front-End-main\editron-worktree"
npx tsx scripts/calibrate/calibrate.ts                    # all videos
npx tsx scripts/calibrate/calibrate.ts --dry-run          # score but don't update bandits
npx tsx scripts/calibrate/calibrate.ts --url <youtube-url> --label <name>  # single video
```

---

## Renderer State

### Visual Vocabulary (107+ moves)
- **12 entrance patterns**: fade, slide-up/down/left/right, scale-up, pop, blur-in, draw, rotate-in, skew-in, zoom-blur
- **8 exit patterns**: mirrors of entrances (except draw-reverse)
- **5 hold patterns**: static, pulse, breathe, gentle-float, glow
- **21 animatable properties**: opacity, translateXY, scaleXY, rotation, skewX, clipProgress, blur/brightness/contrast/saturate, letterSpacing, fontSize, textShadowBlur, strokeDashoffset + 5 resolvedProps
- **4 Disney principles**: Squash & Stretch (#1), Anticipation (#2), Follow Through (#5), Arc (#7)
- **5 audio-reactive channels**: beat_level (7-tier), onset, energy, emotion_intensity, music_beat
- **17+ GSAP easing curves**: power1-4, back, circ, expo, elastic + CustomBounce, CustomWiggle, CustomEase
- **Kinetic typography**: per-char or per-word split with staggered entrance
- **Beat sync**: element entrances snap to musical beats

### What's Missing (Tier B2 + C — next session)
- **GSAP timeline hook for Remotion**: paused timeline + seek to frame/fps. Enables ScrambleTextPlugin (text decode), DrawSVGPlugin (SVG stroke draw), MorphSVGPlugin (shape morphing). Architecture: create timeline on mount, seek per frame.
- **@tsparticles**: 37 packages installed, ZERO imports. Particle confetti, sparks, dust, bokeh. `particle` primitive type exists in recipe-types.ts but has no renderer case.
- **@remotion/three**: Three.js + R3F already installed (landing page only). Need @remotion/three bridge for 3D MG overlays.
- **@remotion/noise, @remotion/paths, @remotion/shapes**: Perlin noise, SVG path ops, parametric shapes. Not installed.
- **CSS capabilities unused**: clip-path polygon()/circle() for reveals, mask-image for gradient reveals, animated gradient angles, box-shadow glow on shapes (text glow works via textShadowBlur).

### How Entrance Selection Works
```
Overlay scoring: 8 entrance overlays compete via multiplicative scoring
  → entrance_fade: formality + warmth → fade for formal/warm
  → entrance_pop: enthusiasm + visceral - formality → pop for casual energetic
  → entrance_slide: pacing + speech.coverage → slide for fast speech content
  → entrance_blur: warmth + emotional_arousal - pacing → blur for atmospheric
  → entrance_scale: visceral + emotional_arousal → scale for dramatic
  → entrance_rotate: formality + visceral → rotate for formal reveals
  → entrance_skew: pacing - formality → skew for fast casual (broadcast)
  → entrance_zoom_blur: visceral² + enthusiasm → zoom-blur for EXTREME impact only
    (polynomial exponent=2 → quadratic response, only fires on extreme signals)

Winner → ENTRANCE_WINNER_MAP → EntrancePattern value → set on foreground text elements
  → Also determines kinetic text split: pop/slide/scale/skew/zoom-blur → per-char/word
  → Also determines text split granularity: enthusiasm > 0.7 → chars, else → words
```

---

## Test Coverage

| Suite | Assertions | What it covers |
|-------|-----------|----------------|
| test-utility-engine | 32 | Curves, scoring, compensation |
| test-production-fixes | 25 | NaN, penalty, routing, adversarial |
| test-signal-bridge | 17 | Speech methods, personality derivation |
| test-utility-integration | 9 | Integration + performance |
| test-threshold-bandit | 130 | Sampling, update, CRG drift, serialization |
| test-mg-overlays | 30 | 5 content profiles × overlay scoring + differentiation |
| test-integration-mg | 11 | planComposition with/without scores, cross-profile |
| test-adversarial-mg | 16 | Empty signals, NaN, all-zero, all-one, partial scores, CRG floors |
| **Total** | **270** | **All pass** |

---

## What's Left — Complete Prioritized List

### P0 (production risk)
- None remaining. All P0 bugs fixed this session.

### P1 (next session priorities)
1. **Renderer Tier B2**: GSAP timeline hook for Remotion → ScrambleText, DrawSVG, MorphSVG
2. **Renderer Tier C**: @remotion/three + @tsparticles wiring
3. **Fix 13 calibration video URLs** — bad IDs from training data
4. **Plan multi-file upload** (Mode 2 evolution) — `/office-hours` or `/plan-ceo-review`
5. **Plan avatars** (Mode 4) — script → AI avatar video

### P2 (tech debt)
6. 282 `as any` casts across 36 files (multi-session type audit)
7. Director monolith 2761 lines (decomposition into Path D/E handlers)
8. Quality review needs rendered frames (Remotion pipeline hook)
9. Aesthetic gate (runAestheticGate) unwired — needs rendered frame

### P3 (future phases)
10. Phase C — Asset-Centric + Brand Vault (Graphiti, 6-10 weeks)
11. Phase D — DaVinci Pro (color grading, audio FX, masking, 8-12 weeks)
12. Phase E — Scale (3hr+ video, multi-platform, batch, 8-12 weeks)
13. Phase F — Screencast (recording, auto-zoom, 4-6 weeks)
14. Phase G — SaaS MG Engine (vector/SVG, component library, 8-12 weeks)
15. Graphiti brand integration (D-015 decided, implementation pending, 2-3 weeks)
16. Product bridges (Clickatron, UploaderX, Alyzzitron, 4-6 weeks)

---

## Learnings for Future Sessions

### Architecture
- **Additive vs multiplicative scoring**: Properties use additive (always produce values). Selections use multiplicative (anti-patterns suppress). This split is critical — mixing them up causes calm content to get energetic animations.
- **Hold winner needs score threshold**: Without a minimum score gate (0.15), barely-scoring hold overlays override static on calm content. Every selection-type overlay winner should be gated.
- **One injection point beats two**: Scoring MG overlays in the EDL executor (where planComposition is called) is cleaner than injecting into the Director (which has two paths). The Director is a 2761-line monolith — avoid adding to it.
- **The renderer has MORE capability than you think**: 21 animatable properties were declared in AnimationState but only 7 were exercised. Always check what's already wired before adding new infra.
- **GSAP plugins are installed but unused**: 15 premium plugins, 37 @tsparticles packages. Check node_modules before assuming capabilities are missing.

### Bugs to Watch For
- **`new Map(plainObject)` throws**: MongoDB stores Maps as plain objects. Always use `Object.entries()` when deserializing. This affects threshold-bandit and any future service that stores Maps in MongoDB.
- **Wav2Vec re-downloads audio every batch**: The Modal endpoint is stateless. 100MB video × 11 batches = 11 × 100MB downloads. Timeout must account for this (90s warm, not 45s).
- **`gemini-3.1-flash-lite-preview` is a preview model**: Will be deprecated. All 9 references now go through factory constants. But the constants still point to the preview model — when Google deprecates it, change `CHAT_MODEL_NAME` in one place.
- **GCS signed URLs lack Content-Type headers for xAI**: Grok STT can't detect audio format from URL response headers. Calibration script sends binary file upload instead. Production doesn't have this issue (Cloudflare Worker serves proper headers).

### CRG Constraints That Matter for MG
- `constraint:overlay.graphic_animation_inconsistency` — one animation style per video (entrance winner is global)
- `constraint:overlay.graphic_in_caption_zone` — bottom 15-25% unsafe (renderer's captionZoneAware handles this)
- `constraint:overlay.simultaneous_overlay_limit` — max 2 non-caption overlays for >1s
- `constraint:overlay.title_safe_area` — 90% of frame (all 8 positions are within this)
- `constant:animation.exit_speed_rule` — exit = entrance × 0.8 (choreography-computer handles this)
- `technique:animation.scale_pop` — overshoot 102-105% (pop entrance uses this range)
- `technique:animation.bounce` — anti-pattern: formality > 0.5 (entrance_pop has formality inverted)

### Signal Profiles (from calibration)
- **Iman Gadzhi** (energetic vlog): enthusiasm=0.786, warmth=0.226, arousal=0.133, pacing=0.500, visceral=0.447, visual_dep=0.600, humor=0.159
- **Wav2Vec valence insight**: Iman reads as 173 positive / 26 neutral / 12 negative in one run, but 105 negative / 93 neutral / 13 positive in another — valence is NOISY across runs. Don't over-rely on single-run valence for personality signals.

---

## INVENTED Thresholds Added This Session

All marked with `⚠️ INVENTED` in code. Thompson Sampling will calibrate.

| Threshold | Value | File | What it controls |
|-----------|-------|------|-----------------|
| Text split enthusiasm gate | 0.7 | composition-planner.ts | chars vs words for kinetic typography |
| Text stagger ratio | 0.6 | composition-renderer.tsx | 60% of entrance for stagger spread |
| Hold winner score threshold | 0.15 | composition-planner.ts | Minimum score to override static hold |
| Center avoidance threshold | 0.6 | composition-planner.ts | When to shift from center to corner |
| Rotate-in angle | 15deg | primitive-renderers.ts | Rotation entrance magnitude |
| Skew-in angle | 10deg | primitive-renderers.ts | Skew entrance magnitude |
| Zoom-blur scale | 2.0 | primitive-renderers.ts | Starting scale for zoom-blur |
| Zoom-blur filterBlur | 30px | primitive-renderers.ts | Starting blur for zoom-blur |
| Glow textShadowBlur | 8px | primitive-renderers.ts | Glow hold shadow magnitude |
| Glow filterBrightness | 1.1 | primitive-renderers.ts | Glow hold brightness boost |
| Beat snap tolerance | scaledStagger/2 | choreography-computer.ts | Max frames to snap for beat alignment |
| Humor pitch weight | 0.4 | signal-registry.ts | Pitch variability contribution to humor |
| Humor formality weight | 0.25 | signal-registry.ts | Low formality contribution to humor |
| Humor rhetorical weight | 0.05/question | signal-registry.ts | Per-question humor boost |

Tags: #handover #mega-session #mg-phase1 #renderer #calibration #19-commits #definitive
