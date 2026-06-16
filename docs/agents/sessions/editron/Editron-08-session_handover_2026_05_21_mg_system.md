---
name: session-handover-2026-05-21-mg-system
description: "MEGA SESSION. Composition engine + caption unification + density v3 + quality review. 5 open questions answered with DB verification. Full MG domain research. Path B (intent-driven) architecture. CRITICAL: agent kept reducing MG to 7 types — READ ANTI-PATTERNS. 18 files, zero type errors."
metadata:
  type: project
  date: 2026-05-21
  originSessionId: fef55082-bb91-4dc4-a174-e4de2374c5f3
---

# Session Handover — 2026-05-21 (Motion Graphics System)

## TL;DR

Built the composition engine foundation (Path B: intent-driven, not presets). Caption unification shipped with spring physics. Density v3 equation built. Quality review now content-type-aware. BUT the agent kept reducing motion graphics to 7 named types (stat-counter, lower-third, etc.) despite being told 4+ times it's a full domain. The GraphicPurpose enum and 7 purpose-specific planner functions are the WRONG abstraction. Next session must redesign the planner to compose from content understanding, not type lookup.

---

## ⛔ ANTI-PATTERNS (Read BEFORE writing any code)

1. **DO NOT think in graphic types.** There is no enum of "what motion graphics can be." The system composes from content structure + visual language. If you write `GraphicPurpose = 'stat-counter' | 'lower-third' | ...` you are building a template library.

2. **DO NOT hardcode choreography.** "Frame 0-8: accent line draws" is a CSS template with frame numbers. Choreography is COMPUTED from tokens (stagger × enterOrder × easing). The choreography-computer.ts does this correctly — don't bypass it.

3. **DO NOT reduce MG to components.** A file named `LowerThird.tsx` or `KeywordHighlight.tsx` is a component, not a system. The composition engine renders from primitives — no named component files.

4. **DO NOT default to profile-based logic.** Signals first, always. See feedback_no_profile_default.md.

5. **DO NOT use vague LLM prompt text.** "Quality over quantity" was killed. Use narrow enumerated rules per Rule 35. See commit 54e8123d.

6. **MG must sync to video content.** What's being said right now → what visual treatment fits. Emotional peaks → emphasis. Data mentioned → visualization. Names spoken → introduction. The FORM is composed, not preset.

**User's exact words:**
- "Motion graphics is a FULL DOMAIN. Not just lower-thirds and stat counters."
- "Stop reducing motion graphics to individual components. Think SYSTEM not COMPONENT."
- "Our system should actually understand content from signals and dials and make customized motion graphics acc to video, brand, user, the whole hierarchy we made in thinkforge."
- "MG should be in line with the video — what's being said and stuff, that's basic."
- "How many presets will we make think man cmon" (rejecting JSON recipes as just another preset format)

---

## RESEARCH FINDINGS (this session produced significant research)

### 1. Five Open Questions Answered

**Silence removal** — 100% transcript-based. `raw-footage-processor.ts` detects silences from gaps between words (>300ms). No visual signal input. 5-track analysis (motion, shot boundaries, energy) exists but is NOT consulted. For speechless content (SaaS ads, montages), silence removal returns empty plan. FIX SHIPPED: speechCoverage + needsVisualDrivenEditing flag added.

**9 genre dials** — NOT enough. The 9 dials (pacing_tolerance, energy_baseline, transition_density, graphic_density, silence_tolerance, zoom_budget, sfx_density, color_temperature, formality) are output-focused budgets. 15+ signals are informationally isolated from dial computation (V-JEPA: significance, face_emotion, eye_contact; Wav2Vec: emotion_intensity, stress, pitch_variability; composites: narrative_pressure, cinematic_moment). Recommendation: 12 dials consuming 25+ signals. Missing dimensions: emotional_arc, music_sync_depth, visual_complexity_ceiling.

**Thompson Sampling** — VERIFIED WORKING via MongoDB query.
- Collection: `bandit_states` in `editron_prev`
- 1 user, 70 projects, 36 arms (9 dials × 4 contexts)
- Most active: `interview:medium:long:youtube` — 39 observations, precision=20.5
- Learning sensible adjustments: fewer graphics (-0.038), more zooms (+0.069), more SFX (+0.049) for long interviews
- Color temperature always stable at 0.000 (correct — not learnable from quality scores)
- Production DB: 0 docs (preview only)
- Content type diversity gap: only "interview" contexts trained

**Caption downgrade** — Mode 2 forces fancy→standard at director-agent.ts:994-1004. REASON: fancy captions create non-editable html-scene overlays. FIX SHIPPED: unified ALL captions through add_captions (editable). Signal-driven style + display mode selection added.

**Quality review** — 51 checks, all content-type-agnostic. Linear deduction (critical -15, warning -5, info -1). Content type IS available but unused (only 2 of 51 checks reference genreParameters). FIX SHIPPED: CONTENT_TYPE_SEVERITY_ADJUSTMENTS table for 10 content types.

### 2. Motion Graphics Domain Research

**15 categories of MG** (not 7 types): Broadcast Design, Title Sequences, Kinetic Typography, Explainer Videos, Data Visualization, Logo Animation, UI/UX Animation, Product Visualization, Particle Systems, Live Event Visuals, Music Videos, Social Media, Advertising, HUD/FUI, Documentary Graphics.

**Studios think in 3 levels:**
1. Visual Language (color, type, shape, material, rhythm) — defined BEFORE any animation
2. Motion Principles (enter/exit, stagger, easing vocabulary, spatial choreography)
3. Deliverables (lower-thirds, charts, etc.) — INSTANTIATIONS, not the system

**14 actual primitives:** shapes, text, images/video, masks/mattes, paths/curves, color, opacity/blending, transforms, effects/filters, particles, 3D space, audio (as driver), data (external), time (keyframes/easing).

**8 professional differentiators:** choreography (stagger 50-100ms), rhythm (sync to beat, micro-pauses), easing (studio signature, per-property), spatial awareness (elements travel FROM somewhere), typography craft, color/light, sound design integration, restraint.

### 3. Editable Fancy Captions Research

**Industry universal pattern:** Every leading tool (CapCut, Descript, VEED, Kapwing) treats animation as a PROPERTY of the caption, not a separate rendering mode. One caption object with: text data (editable) + timing (draggable) + animation style (switchable).

**Instagram block layout:** `text-align: center` + `maxWidth: 80%` + `display: inline-block` on each word span. The "block" is natural CSS text wrapping at large font sizes. `@remotion/layout-utils` `fillTextBox()` for programmatic control.

**Spring parameters (from research):**
- TikTok native: `{ damping: 10, mass: 0.5 }` — snappy, slight overshoot
- Hormozi punch: `{ damping: 8, mass: 0.3 }` — fast pop, minimal bounce
- MrBeast energy: `{ damping: 5, mass: 0.5 }` — very bouncy
- Subtle professional: `{ damping: 15, mass: 0.8 }` — smooth

**Key repos discovered:**
- `@remotion/captions` — official word-level timing data model + createTikTokStyleCaptions()
- `remotion-subtitles` (ahgsql) — 17 animated caption templates as React components
- `el-frontend/video-wizard` — 9 Remotion caption styles including Hormozi/MrBeast
- `@remotion/layout-utils` — fillTextBox() for programmatic block layout
- `@remotion/rounded-text-box` — SVG pill backgrounds per line

### 4. Intent-Driven Composition Research

**json-render (Vercel, March 2026):** Catalog (Zod schemas) + componentRegistry + JSON timeline spec + Renderer. "The catalog is your constraint layer: the model can only output what you've defined."

**MoGIC (2025):** Two-head architecture — Intention Prediction (discrete: what) + Motion Generation (continuous: how). Maps to our Intelligence Layer + Composition Engine.

**Narrative Motion Blocks (ACM DIS 2025, Best Paper):** Natural language → parametric sliders. Animator describes action, system generates controls. Bridge between semantic and parametric.

**Cavalry:** Node graph + procedural engine. Duplicator + Falloffs + Effectors. Rules replace manual keyframing. Animations are SYSTEMS, not timeline sequences.

**Cassowary (constraint solver):** Used by Apple AutoLayout, Android ConstraintLayout. Kiwi.js is TypeScript implementation. Good for relational element positioning ("label anchored 20px left of number"). Overkill for v0 — flex rules sufficient initially.

### 5. Verified System State

**5-track analysis:** ALIVE. File exists, 15 files reference it, actively used by Mode 1 (Director) and Mode 2 (background workers). NOT killed.

**Thompson Sampling:** ALIVE with real data (see above).

**GSAP parseEase():** CONFIRMED Lambda-safe. Returns pure function `(progress: number) => number`. Tested in Node. Deterministic, no DOM.

---

## ARCHITECTURE DECISIONS (what was chosen, what was rejected, WHY)

### Path A → Path B (the major pivot)

**Path A (rejected):** JSON recipe files declaring fixed element structures. Recipe = "lower-third is always line + rect + text + text." User killed this: "recipes are just presets with a different name."

**Path B (approved, partially built):** Composition planner as rule engine. Intent + visual language → composed structure. No presets. The planner DECIDES what primitives to create based on content + signals.

**BUT:** The implemented planner (composition-planner.ts) has 7 hardcoded purpose functions — which IS Path A thinking with TypeScript instead of JSON. Next session must fix this.

### Cascade Conflict Resolution (approved)

Hierarchy sets the RANGE. Signals pick the VALUE within the range.
```
TokenConstraint { allowed?, min?, max?, locked?, default? }
Resolution: walk hierarchy top-down, merge. Signals compute within envelope.
Locked values = no override possible.
```

### syncTo Fallback Chain (approved)

```
audio-beats → word-timings → even-stagger
Degrade gracefully + log. Audio beat detection (Essentia.js) is separate system.
```

### Caption Unification (approved, shipped)

ALL captions route through add_captions (editable, word-timed, on timeline). add_fancy_captions converted at Director level. Spring physics for instagram/hormozi modes.

---

## CODE STATE (what exists, what's wired, what compiles)

### New Engine Files (all in editron-worktree/lib/editron/motion-graphics/engine/)

| File | LOC | What | Status |
|------|-----|------|--------|
| composition-renderer.tsx | 195 | Renders any plan with ErrorBoundary | ✅ Compiles |
| primitive-renderers.ts | 170 | Animation states + style builders (shape/text/image) | ✅ Compiles, spatial config from tokens |
| choreography-computer.ts | 157 | Computed timing from tokens, syncTo chain | ✅ Compiles |
| property-resolver.ts | 103 | Resolves token:x.y and content:z bindings | ✅ Compiles |
| gsap-easing.ts | 53 | GSAP parseEase + Remotion bezier fallback | ✅ Compiles |
| recipe-types.ts | 130 | Types for engine + GraphicIntent + PlannerSignals | ✅ Compiles |
| composition-planner.ts | ~280 | 7 purpose planners — ⚠️ WRONG ABSTRACTION | ✅ Compiles but needs redesign |

### New Services

| File | LOC | What | Status |
|------|-----|------|--------|
| graphic-density-resolver.ts | 170 | v3 density equation + entry scoring | ✅ Compiles, v2 behavior preserved |

### Modified Files

| File | What changed |
|------|-------------|
| motion-theme-resolver.ts | Added `hierarchyOverrides?: DeepPartial<MotionTokens>` param + deepMerge |
| edl-executor.ts | Attaches contentSignals to MOTION_GRAPHIC overlays |
| director-agent.ts | Caption unification (fancy→add_captions for all modes) + signal-driven caption mode selection (5 conditions) |
| tools.ts | Zod schema accepts 'instagram' and 'hormozi' display modes |
| raw-footage-processor.ts | speechCoverage computation + needsVisualDrivenEditing flag |
| quality-review-service.ts | contentType param + CONTENT_TYPE_SEVERITY_ADJUSTMENTS (10 types) |
| types.ts (editor v7) | MotionGraphicOverlay.contentSignals + CaptionDisplayMode 'instagram'/'hormozi' + spring config in CaptionDisplayConfig |
| caption-layer-content.tsx | Remotion spring() for active word in instagram/hormozi modes |
| motion-graphic-layer-content.tsx | Routes through composition planner, passes contentSignals |
| CLAUDE.md | Rule 11: Motion Graphics is a Full Domain |

**Type-check:** ✅ Zero errors across all files.

---

## OPEN ISSUES (prioritized)

### P0 — Architecture (must fix before building more)

1. **GraphicPurpose enum must die.** Replace with open-ended content structure understanding. The planner should accept ANY visualization intent and compose from primitives + visual language.

2. **Composition planner has 7 preset functions.** `planStatistic()`, `planIntroduction()`, etc. are presets in disguise. Redesign to compose from content data shape + visual language, not purpose label.

3. **MG not synced to video content.** System doesn't understand what's being said at each moment. MG should follow the emotional arc, sync to data points being mentioned, match topic transitions.

### P1 — Signal Wiring

4. **V-JEPA signals not in resolver.** face_emotion, eye_contact, significance, action_type — all available but not consumed by motion-theme-resolver.ts. 

5. **Wav2Vec signals not in resolver.** emotion_intensity, stress, pitch_variability — available but not consumed.

6. **Composite signals orphaned.** narrative_pressure, cinematic_moment, emotional_alignment — computed by signal registry but no dial or token consumes them.

### P1 — Brand

7. **Brand understanding missing.** hierarchyOverrides parameter exists but no brand extraction pipeline feeds it. Need: URL → color palette, typography, materials → token overrides.

8. **ThinkForge hierarchy not connected to MG.** The BRAND→CAMPAIGN→FORMAT→PROJECT→ACT→SCENE cascade from ThinkForge writing pipeline should feed the visual language resolver. The cascade mechanism exists (hierarchyOverrides) but no data flows through.

### P2 — Completeness

9. **edl-executor routing.** Only stat-counter goes through MOTION_GRAPHIC. 5 types still html-scene. Need per-type feature flags.

10. **Primitive renderers limited.** No: mask, repeat/array elements, word-by-word text animation, grow-up, gradients. Extend as needed.

11. **Input validation.** No signal clamping (NaN, out-of-range) or brand color validation in resolver.

12. **StatCounter frame-for-frame verification.** Never tested that composition engine matches StatCounter.tsx output.

13. **Visual language resolution logging.** Input/output logging for token resolution not implemented.

### P2 — Quality

14. **Genre dials upgrade.** 9 → 12 (add emotional_arc, music_sync_depth, visual_complexity_ceiling). Feed 25+ signals instead of 8.

15. **Density v3 calibration.** Coefficients are v0 (new terms = 0). Need reference creator videos to calibrate.

---

## TECHNIQUES & PATTERNS DISCOVERED

### GSAP in Remotion/Lambda
- `gsap.parseEase('back.out(1.7)')` returns pure function `(t: number) => number`
- Deterministic, no DOM, no useEffect — same computation model as interpolate()
- GSAP v3.13.0 already in package.json (used by dashboard UI)
- 17 bezier fallbacks defined in gsap-easing.ts for when GSAP unavailable
- ALL GSAP plugins free since 2025 (CustomEase, SplitText, MorphSVG)

### Spatial Animation from Tokens
- Slide distance = base × paddingScale (20px vertical ← StatCounter:84, 30px horizontal ← 20×1.5 AE convention)
- Scale start = overshoot ? 0.85 : 0.92 (← StatCounter:90)
- Never hardcode animation distances — derive from visual language tokens

### Caption Spring Physics
- Import `spring` from 'remotion' — frame-based, deterministic
- `spring({ frame: framesSinceWordStart, fps, config: { damping, mass } })`
- Compute wordStartFrame from word.startMs: `Math.round((word.startMs / 1000) * fps)`

### Content-Type Quality Scoring
- Post-process severity adjustments on the issues list (not per-check functions)
- Weight table keyed by (contentType, issueType) → severity multiplier
- ≤ 0.3 → warning downgrade to info. ≤ 0.5 → critical downgrade to warning.

### Signal Pass-Through Pattern
- Attach raw ContentSignals to overlay at creation time (edl-executor)
- Consumer reads signals directly — no reverse-engineering from tokens
- extractFormality() was the WRONG pattern (lossy approximation). Direct pass-through is correct.

---

## REVIEWS CONDUCTED

### CEO Review (HOLD SCOPE mode)
- Path B is Tier 4 (nobody does intent-driven MG composition from signals)
- Moat = tuned signal-to-visual mapping. Architecture copiable, mappings not.
- Risk: Uncanny Valley — almost-right composition worse than presets. Mitigation: fewer high-confidence rules, calibrate against creator videos.
- 10-star: Star 8 = Brand Learning (upload videos, reverse-engineer visual language). Star 10 = Cross-Video Continuity.

### Eng Review
- json-render catalog+registry pattern for runtime architecture
- Cassowary constraints for relational layout (future, flex sufficient for v0)
- Scene graph spec: keep our types, don't adopt json-render format
- Testing the planner: pure function, deterministic, unit-testable
- GSAP bundle: already in bundle, parseEase adds 0 bytes

### Director Review
- Choreography IS everything — stagger timing between elements is "handcrafted vs generated"
- Every entrance needs matched exit (exception: QuoteBlock simultaneous-fade)
- Accent line must LEAD the entrance (draws first, establishes edge, then bg slides in)
- back.out(1.7) is the signature premium pop-in easing

### Video Editor Review
- StatCounter: 7/10. Missing: number overshoot settling, exit should mirror entrance.
- LowerThird defaults: accent 8 frames → bg at frame 4 → name at frame 7 → title at frame 10
- KeywordHighlight: 110%→100% overshoot IS the whole effect. back.out(1.7).
- QuoteBlock: exits simultaneously (no stagger), different from all other types
- Motion blur: accept limitation for v1 (Remotion doesn't have native motion blur)

---

## COMMITS

No commits were made this session. All changes are uncommitted in the editron-worktree. The editron-worktree is on branch `infrastructure-improvs-+Editron`.

To see all changes: `cd editron-worktree && git diff --stat`

---

## CROSS-REFERENCES

- [[session_handover_2026_05_20_editorial_intent]] — Previous session: editorial intent gate shipped, density v3 designed
- [[session_handover_2026_05_20_motion_graphics]] — Previous session: VIE foundation, template routing, StatCounter
- [[project_signal_driven_density_v3]] — v3 design doc (now partially implemented)
- [[feedback_no_profile_default]] — RULE: signals over profiles
- [[feedback_motion_graphics_scope]] — RULE: MG is a full domain
- [[motion_graphics_investigation_2026_05_19]] — VIE investigation (12 dimensions, 10 archetypes, 3 Laws)
- [[mg_ceo_eng_design_reviews_2026_05_19]] — CEO + Eng + Design reviews
- [[vision_execution_craft_gap]] — Intelligence 8/10, execution craft 4/10
- [[prompt_engineering_methodology]] — Rule 35 prompt methodology (used for caption/density prompt work)
