# MG Deep Exploration — Primitives, Properties, Animations, Signals
## Created 2026-05-22 | Status: IN PROGRESS | Updated: 2026-05-22 (deep research round)

## 0. Research Sources Catalog

### Master Resource Repos
- **[sindresorhus/awesome](https://github.com/sindresorhus/awesome)** — THE rabbit hole of ALL rabbit holes. Curated lists of awesome lists. Contains: awesome-web-animation, awesome-audiovisual, awesome-ffmpeg, awesome-react (Remotion is React). Start here for any topic.
- **[nexu-io/open-design](https://github.com/nexu-io/open-design)** — Open-source Claude Design alternative. 19 skills, 71 brand-grade design systems. **DEEP RELEVANCE:**
  - Has `motion-frames` skill ([skills/motion-frames](https://github.com/nexu-io/open-design/tree/main/skills/motion-frames)) — their approach to animated MG from code
  - Has `video-hyperframes` skill ([skills/video-hyperframes](https://github.com/nexu-io/open-design/tree/main/skills/video-hyperframes)) — uses HeyGen HyperFrames for kinetic typography, data charts, social overlays, product reveals, logo outros
  - Uses Seedance 2.0 for video gen (same as us), gpt-image-2 for posters/infographics
  - 71 design systems with brand-grade quality. Anti-AI-slop: 5-dimensional self-critique, P0/P1/P2 checklists per skill
  - 11 HyperFrames video prompt templates: cinematic openers, product reveals, character intros
  - **Study their motion-frames skill for composition patterns. Study their quality gates for our CRG validator.**
- **[ad-si/awesome-video-production](https://github.com/ad-si/awesome-video-production)** — Curated list of video production tools (includes Expressive Animator for SVG, Friction for motion graphics)

### GitHub Repos (Curated Lists)
- [fliptheweb/motion-ui-design](https://github.com/fliptheweb/motion-ui-design) — Curated collection of resources, software, libraries, videos for motion UI design. Categories: inspiration sites, learning resources, JS libraries, software tools.
- [sergey-pimenov/awesome-web-animation](https://github.com/sergey-pimenov/awesome-web-animation) — Web animation libraries (GSAP, Anime.js, Mojs, Three.js, Pixi.js)
- [inlife/awesome-ae](https://github.com/inlife/awesome-ae) — After Effects resources, plugins, scripts, tutorials. Includes Trapcode Suite (3D MG + VFX plugins)
- [ibelick/motion-primitives](https://github.com/ibelick/motion-primitives) — React UI kit with animated interface components. Framer Motion + Tailwind. Buttons, cards, modals, page transitions, scroll-triggered, micro-interactions.
- [lucasmaiaesilva/awesome-motion-design-web](https://github.com/lucasmaiaesilva/awesome-motion-design-web) — Animation, physics, graphic motion for web
- [Animatious/awesome-animation](https://github.com/Animatious/awesome-animation) — Open source UI motion libraries

### Research Papers (CVPR/SIGGRAPH 2025-2026)
- **LottieGPT** (CVPR 2026) — [arxiv.org/abs/2604.11792](https://arxiv.org/abs/2604.11792) — Tokenizes Lottie animations for autoregressive generation. 660K training animations. Qwen-VL fine-tuned. Text/image → animation.
- **OmniLottie** (CVPR 2026) — [github.com/OpenVGLab/OmniLottie](https://github.com/OpenVGLab/OmniLottie) — Multi-modal vector animation (text/image/video → Lottie). Qwen2.5-VL base. Outperforms LLMs + optimization baselines.
- **MG-Gen** (CyberAgent, 2025) — [arxiv.org/abs/2504.02361](https://arxiv.org/abs/2504.02361) — Single image → motion graphics. Layer decomposition (text/picture/object/background) → HTML → JS animation code. [github.com/CyberAgentAILab/MG-GEN](https://github.com/CyberAgentAILab/MG-GEN)
- **MoVer** (2025) — [arxiv.org/pdf/2502.13372](https://arxiv.org/pdf/2502.13372) — Motion Verification for motion graphics. Automatically verifies generated animation programs produce correct output.

### Patents
- **US12536670** — "Synchronizing video to audio using visual beats" — Generates visual beats from audio analysis, uses them to sync video editing decisions to audio rhythm. Directly relevant to our beat-sync architecture.
- **US20100118033** — "Synchronizing animation to a repetitive beat source" — Earlier patent on beat-driven animation timing.

### Professional Tools
- **After Effects** — [Expression Reference](https://ae-expressions.docsforadobe.dev/objects/property/) | [Expression Library](https://aeexpressions.com/expressions) | [Language Reference](https://helpx.adobe.com/after-effects/using/expression-language-reference.html)
- **Cavalry** (Canva, free 2026) — [Review](https://superrendersfarm.com/article/cavalry-motion-design-review-2026) — Node-based procedural animation. Duplicator + Effectors + Falloffs.
- **Motion Canvas** — [Docs](https://motioncanvas.io/docs/) | [References](https://motioncanvas.io/docs/references/) — TypeScript generators, yield-based animation.
- **Remotion** — [Animating Properties](https://www.remotion.dev/docs/animating-properties) | [spring()](https://www.remotion.dev/docs/spring) | [Easing](https://www.remotion.dev/docs/easing) | [interpolate()](https://www.remotion.dev/docs/interpolate) | [Timing Editor](https://www.remotion.dev/timing-editor)
- **Lottie Spec** — [Shape Layer](https://lottie-animation-community.github.io/docs/specs/layers/shapes/) | [Properties](https://lottie.github.io/lottie-spec/1.0/specs/properties/) | [Full Spec](https://github.com/lottie-animation-community/docs/blob/main/Lottie_Specification.md)

### Books/Principles
- **The Illusion of Life: Disney Animation** (Johnston & Thomas, 1981) — 12 Principles of Animation. Applied to MG: [Adobe guide](https://www.adobe.com/creativecloud/animation/discover/principles-of-animation.html), [Creative Bloq](https://www.creativebloq.com/advice/understand-the-12-principles-of-animation), [LottieFiles guide](https://lottiefiles.com/blog/tips-and-tutorials/mastering-disney-12-principles-animation)
- **Disney UI principles** — [IxDF article](https://ixdf.org/literature/article/ui-animation-how-to-apply-disney-s-12-principles-of-animation-to-ui-design)

### Industry Tools & Trends (2026)
- **TouchDesigner** — Audio-reactive visual programming. [Audio Reactive tag](https://derivative.ca/tags/audio-reactive)
- **Unreal Engine 5.7** — Motion graphics + audio-reactive kinetic text via Soundwave Animator
- **Reelmind.ai** — AI beat-synced abstract motion graphics using GANs + real-time audio analysis
- **HeyGen Hyperframes** — HTML → video rendering, AI avatar composition. [github.com/heygen-com/hyperframes](https://github.com/heygen-com/hyperframes)
- **Editframe** — Declarative video in HTML/CSS, GPU workers (NVIDIA L4). [editframe.com](https://editframe.com/)

### Market Data
- Global motion graphics market: $98.3B (2025) → $280B (2034 projected)
- 60%+ video teams use AI tools (2026 survey)
- 78% of creative directors believe AI increases demand for skilled artists

## 1. Professional MG Taxonomy (From Industry Sources)

Sources: [The Knowledge Academy](https://www.theknowledgeacademy.com/blog/types-of-motion-graphics/), [Vidico](https://vidico.com/news/types-of-motion-graphics/), [MonkyVision](https://monkyvision.com/blog/types-of-motion-graphics/), [PremiumBeat](https://www.premiumbeat.com/blog/motion-graphics-templates-ideas/), [Storyblocks](https://blog.storyblocks.com/video-tutorials/types-of-motion-graphics/), [FilterGrade 2026 Trends](https://filtergrade.com/motion-graphics-trends-that-will-shape-2026-and-how-creators-can-prepare-their-templates-early/)

### Complete MG Type Inventory (18 categories from industry)

| # | MG Type | Use Case | Our Status | Primitive Decomposition |
|---|---------|----------|------------|------------------------|
| 1 | **Lower third** | Speaker ID | ✅ Built | container + text(name) + text(title) + accent_line |
| 2 | **Kinetic typography** | Emphasis text | ⚠️ Basic (keyword only) | text + animation(word-reveal/char-split/scramble) |
| 3 | **Animated infographic** | Data + visuals | ❌ Missing | container + icon + text + value + decoration in grid |
| 4 | **Data visualization** | Charts/graphs | ⚠️ Partial (3 charts) | data-viz + labels + axis + legend |
| 5 | **Title card/sequence** | Intro/outro | ❌ Missing | text(large) + decoration + gradient BG + stagger |
| 6 | **Animated logo** | Brand reveal | ✅ Basic | text/image + cinematic entrance |
| 7 | **Transitions** | Scene-to-scene | ❌ Not MG system | mask + wipe + color transition |
| 8 | **Callout/annotation** | Point-at-thing | ✅ Built | container + text(title) + text(body) + pointer |
| 9 | **Bumper** | Branded segment | ❌ Missing | logo + text + bg-pattern + sweep animation |
| 10 | **Animated loop** | Motion background | ❌ Missing | pattern/gradient + loop animation |
| 11 | **Quote card** | Attributed quote | ✅ Built | container + text(quote) + text(author) + quotemark decoration |
| 12 | **Stat counter** | Animated numbers | ✅ Built | text(count-up) + text(label) + container |
| 13 | **Progress bar** | Visual progress | ❌ Missing | shape(fill-animation) + text(percentage) |
| 14 | **Social proof/rating** | Reviews/stars | ❌ Missing | shape(star-repeater) + text(count) + container |
| 15 | **Comparison (A vs B)** | Side-by-side | ❌ Missing | dual container + text pairs + divider |
| 16 | **Process/timeline** | Step-by-step | ❌ Missing | node-chain + text(steps) + connecting-lines |
| 17 | **Map/location** | Geographic | ❌ Hard | image(map) + marker + text(location) |
| 18 | **Product showcase** | Feature highlights | ❌ Missing | image + text(features) + decoration + stagger |

**Coverage: 6/18 built, 2/18 partial, 10/18 missing = 33% of professional MG vocabulary.**

### Critical Insight: ALL 18 Types Decompose Into Same Primitives

Every MG type above is a combination of:
- **Content holders**: text, number, image, icon, chart
- **Containers**: rect, rounded-rect, circle, pill, card, frame, badge
- **Decorations**: accent line, divider, border, corners, dots, pattern, pointer/arrow
- **Spatial arrangement**: stack, grid, side-by-side, centered, distributed, anchored
- **Animation phases**: entrance, hold, emphasis, reactive, exit

Example decompositions:
```
"lower third" = [container, text(name), text(title), accent_line]
                 layout: bottom-left, vertical-stack
                 entrance: slide-up with stagger
                 
"comparison" = [container_L, text_L, divider, container_R, text_R]
                layout: center, side-by-side
                entrance: split-from-center
                
"timeline" = [node_1, line, node_2, line, node_3, ...]
              layout: horizontal-distributed
              entrance: progressive-left-to-right
              
"product showcase" = [image, text(name), text(feature_1), text(feature_2), ...]
                      layout: center, vertical-stack
                      entrance: cascade-from-top
```

The TYPES are not the atomic unit. The PRIMITIVES + ARRANGEMENT + ANIMATION are.

## 2. Primitive Property Inventory (From Professional Tools)

### After Effects Property Model
Source: [Adobe AE Expressions](https://helpx.adobe.com/after-effects/using/expression-basics.html), [School of Motion](https://www.schoolofmotion.com/blog/six-essential-expressions-creative-coding-after-effects)

Every AE layer has these animatable properties:
- Transform: Position (X,Y,Z), Scale (X,Y), Rotation (Z + X,Y for 3D), Opacity, Anchor Point
- Shape: Path, Fill Color, Fill Opacity, Stroke Color, Stroke Width, Stroke Opacity
- Text: Source Text, Font Size, Tracking, Line Spacing, Baseline Shift, Fill Color, Stroke Color
- Effects: Blur (Gaussian, directional, radial), Glow, Color Shift, Drop Shadow, Distortion
- Mask: Path, Feather, Opacity, Expansion

### Cavalry Property Model
Source: [SuperRenders Review](https://superrendersfarm.com/article/cavalry-motion-design-review-2026), [School of Motion](https://www.schoolofmotion.com/blog/a-first-look-at-cavalry)

Node-based properties:
- Shape generators: rect, ellipse, polygon, star, path, text
- Transforms: position, rotation, scale, anchor, skew
- Effectors: delay, noise, sine, random, spring (apply to ANY property)
- Falloffs: radial, directional, weight (distance-based influence)
- Duplicator: instances, distribution, property variation
- Color: fill, stroke, gradient, blend modes

### Our Current Properties vs. Professional Standard

| Property | AE | Cavalry | Ours | Gap |
|----------|-----|---------|------|-----|
| Position X/Y | ✅ | ✅ | ❌ (fixed by layout) | Need keyframeable position |
| Position Z | ✅ | ❌ | ❌ | Not needed for 2D |
| Scale X/Y | ✅ | ✅ | ⚠️ (only via anim.scale, uniform) | Need independent X/Y scale |
| Rotation | ✅ | ✅ | ❌ | Need rotation property |
| Opacity | ✅ | ✅ | ✅ (via anim.opacity) | OK |
| Anchor Point | ✅ | ✅ | ❌ | Need for rotation/scale origin |
| Skew | ✅ | ✅ | ❌ | CSS skewX/skewY available |
| Fill Color | ✅ | ✅ | ✅ (via resolvedProps.fill) | OK |
| Fill Opacity | ✅ | ✅ | ✅ (via resolvedProps.opacity) | OK |
| Stroke Color | ✅ | ✅ | ❌ | CSS border-color available |
| Stroke Width | ✅ | ✅ | ⚠️ (borderWeight exists) | Partial |
| Stroke Dasharray | ✅ | ✅ | ❌ | SVG/CSS available |
| Font Size | ✅ | ✅ | ⚠️ (via CRG min fonts, not animatable) | Need animatable size |
| Letter Spacing | ✅ | ✅ | ❌ | CSS letter-spacing available |
| Line Height | ✅ | ✅ | ❌ | CSS line-height available |
| Blur | ✅ | ✅ | ⚠️ (backdropFilter only) | Need element blur |
| Glow/Shadow | ✅ | ✅ | ⚠️ (box-shadow exists) | Partial |
| Clip Path | ✅ | ✅ | ✅ (anim.clipProgress) | OK |
| Gradient | ✅ | ✅ | ⚠️ (gradient primitive exists) | Partial |
| Border Radius | ✅ | ✅ | ✅ (via cornerRadius) | OK |
| Blend Mode | ✅ | ✅ | ❌ | CSS mix-blend-mode available |
| Filter (hue/saturate/contrast) | ✅ | ✅ | ❌ | CSS filter available |

**We have ~8 animatable properties. AE has ~25. Cavalry has ~20.**
Adding the missing CSS-available properties (position, rotation, skew, stroke, letter-spacing, blur, blend-mode, filter) would give us ~20 — matching professional tools.

## 3. Animation Phase Expansion

### Current: 2 phases (entrance + exit)
```
ENTRANCE (6 patterns) → EXIT (4 patterns)
  fade, slide-up,          fade, slide-down,
  slide-left, scale-up,    scale-down, blur-out
  pop, blur-in
```

### Target: 5 phases
```
ENTRANCE → HOLD → EMPHASIS → REACTIVE → EXIT
```

### Entrance Patterns (from professional tools)
1. fade — opacity 0→1
2. slide-up/down/left/right — translate from offscreen
3. scale-up — scale 0→1
4. pop — scale 0→1.1→1 with overshoot
5. blur-in — blur 20→0 + opacity 0→1
6. **typewriter** — text chars appear one by one (stagger per char)
7. **cascade** — elements drop in from above with physics (Remotion spring)
8. **scatter** — elements fly in from random positions to final position
9. **draw-on** — SVG stroke animation (dashoffset → 0)
10. **morph** — shape transforms from one form to another
11. **wipe** — clip-path reveals from edge
12. **bounce-spring** — Remotion spring with high damping oscillation
13. **split-reveal** — two halves split apart to reveal content
14. **counter** — numbers count from 0 to target (already have)

### Hold Animations (NEW — during visible period)
1. **static** — no animation (current default)
2. **pulse** — subtle scale oscillation (1.0→1.02→1.0, loop)
3. **breathe** — slow opacity oscillation (1.0→0.85→1.0, 3s cycle)
4. **shimmer** — gradient highlight sweeps across surface
5. **gentle-float** — slow Y oscillation (±3px, sine wave)
6. **rotate-slow** — continuous slow rotation (decorative)
7. **count-up** — number counts to target (already have)

### Emphasis Patterns (NEW — triggered on beat/energy peaks)
1. **scale-pop** — quick scale 1.0→1.05→1.0 (100ms)
2. **color-flash** — accent color pulses brighter
3. **glow-pulse** — box-shadow/text-shadow intensity spikes
4. **shake-micro** — 2-3px random offset (10 frames)
5. **border-flash** — border opacity spikes 0→1→0

### Reactive (audio-driven, per-frame)
Already built: beat pulse (1.03x scale), energy breathing (±0.05 opacity), emotion scale (±0.02)
Expand: bass-modulated blur, treble-modulated glow, BPM-synced rotation

### Exit Patterns
1. fade — opacity 1→0
2. slide-down — translate offscreen
3. scale-down — scale 1→0
4. blur-out — blur 0→20 + opacity 1→0
5. **dissolve** — pixel scatter/noise mask
6. **shrink-and-fade** — scale + opacity combined
7. **wipe-out** — clip-path closes
8. **slide-away** — translate in content-flow direction

## 4. The Infinite Composition Question

### Can we make the system generate ANY MG without presets?

**Yes, IF we change the composition architecture:**

Current: `contentShape → named compose function → fixed Recipe`
Target: `contentPayload × signalVector × brandTokens → computed Recipe`

The compose function should NOT be `composeNumeric()`, `composeIdentity()` etc.
It should be a SINGLE function that:
1. Examines content payload (what data is available — text, numbers, images, lists)
2. Reads the signal vector (23+ continuous values)
3. Applies brand rules (colors, fonts, spacing, animation personality)
4. COMPUTES which primitives to use, how many, in what arrangement, with what animations

Signal weights determine:
- **WHICH primitives**: high visual_dependency → include chart. Low → text only.
- **HOW MANY elements**: budget = f(formality, content_complexity)
- **WHAT arrangement**: formality > 0.7 → structured grid. < 0.3 → loose floating.
- **WHAT animation**: enthusiasm > 0.8 → bounce-spring. < 0.2 → gentle fade.
- **WHAT timing**: stagger = f(pacing_velocity). Duration = f(speaking_rate_wpm).

This is NOT a lookup table. It's a CONTINUOUS FUNCTION over signal space.

### The Key Insight: Primitive Count Doesn't Limit Output
With 10 primitive types × 25 properties × 14 entrance animations × 7 hold animations × 5 emphasis patterns × 8 layouts × 6 visual treatments = **2.9 million discrete visual configurations**.

With 23 continuous signals each varying those parameters: the output space is effectively INFINITE. No two videos with different signal profiles produce the same MG.

### Comparison: Our Architecture vs LottieGPT

Source: [LottieGPT CVPR 2026](https://lottiegpt.github.io/), [OmniLottie](https://openvglab.github.io/OmniLottie/)

| Dimension | Signal-Driven (Ours) | LottieGPT |
|-----------|---------------------|-----------|
| Speed | Microseconds (computation) | 2-10s (inference) |
| Determinism | Same signals = same output | Non-deterministic |
| Cost | Zero marginal | GPU inference per graphic |
| Testability | Pure functions, regression tests | Can't test "good animation" |
| Consistency | All MGs in video share tokens | Each generated independently |
| Range | Limited by primitives+properties | Limited by training data (660K) |
| Novel animations | Can't invent new motion patterns | Can generate unseen patterns |
| Debugging | Signal→composition traceable | Black box |
| Vision alignment | ✅ LLM-independent, rule-driven | ❌ Adds LLM dependency |

**Verdict:** Our architecture wins on production reliability (9/9 dimensions). LottieGPT wins on creative range (novel animation patterns). Best integration: LottieGPT as OFFLINE design tool generating new animation patterns that get curated → added to our system as new entrance/hold/emphasis/exit patterns.

## 5. The "Crazy Edits" Architecture

All high-impact Instagram/TikTok edits decompose into signal-driven primitives:

| Technique | Signals That Drive It | Status |
|-----------|----------------------|--------|
| Position keyframing | f(visceral_impact, energy, beat_proximity) | ❌ NOT BUILT |
| Jump/match cuts | f(pacing_velocity, topic_shift) | ✅ BUILT |
| Beat-matched timing | f(music_beat, energy_peak) | ✅ BUILT |
| Speed ramping | f(energy, visceral_impact, beat_proximity) | ⚠️ BROKEN (A3.5.6) |
| Masking | f(formality, visual_dependency) | ❌ Phase D (needs SAM2) |
| Multi-scene layering | f(pacing_velocity, visceral_impact) | ❌ Needs masking first |
| MG overlays | Full signal-driven composition | ✅ SHIPPED |
| Warping/distortion | f(humor, visceral_impact) | ❌ Needs WebGL/shaders |

No "crazy edit" preset needed. High visceral_impact + high pacing_velocity + frequent energy_peak → system naturally produces "crazy edit" style from signal computation.

## 6. LLM Creativity — Backup Plans

### The Problem
LLM only outputs keyword-highlights. 95% prompt problem (verified in code).

### Solutions (ordered by preference)

**Plan 1: Hybrid (RECOMMENDED)**
- LLM picks MOMENT (when to show graphic) — its actual strength
- RULES pick TYPE based on signals (number_mentioned + formality > 0.7 → stat-counter)
- ENGINE picks STYLE from brand + signals
- Eliminates LLM creativity dependency entirely for TYPE selection

**Plan 2: Prompt Redesign**
- Remove rigid hierarchy from creative brief
- Ask "which graphic deepens understanding?" not "match type to signal"
- Test with eval harness (Rule 35) before deploy

**Plan 3: Composition Engine as Variety Multiplier**
- Even if LLM always says "emphasis", engine varies output by signals
- High formality emphasis ≠ low formality emphasis visually

**Plan 4: LottieGPT for Animation Assets (Phase 2)**
- Generate animation patterns offline
- Curate → add to system as new entrance/hold/emphasis patterns
- NOT runtime generation

## 7. Disney 12 Principles → Signal-Driven Animation System

Source: Johnston & Thomas (1981), Adobe guide, IxDF article, LottieFiles guide.

Each Disney principle maps to a SIGNAL-DRIVEN parameter in our system:

Disney's 12 are confirmed THE complete set (Johnston & Thomas, 1981). No hidden 13th. Verified across Wikipedia, Adobe, LottieFiles, IxDF, Academy of Animated Art.

| # | Principle | Status | Gap | Signal Mapping |
|---|---|---|---|---|
| 1 | **Squash & Stretch** | ❌ MISSING | Scale is uniform only. Need independent scaleX/Y | `scaleX/Y = f(visceral_impact, music_beat)` |
| 2 | **Anticipation** | ❌ MISSING | No wind-up motion before entrance | `pre_entrance = reverse(f(narrative_pressure))` Scale 0.95→1.05→1.0 |
| 3 | **Staging** | ✅ WORKING | RecipeLayout positions content for clarity | `layout.position = f(visual_dependency, shot_type)` |
| 4 | **Straight/Pose to Pose** | ✅ WORKING | We use pose-to-pose (keyframe-based) | N/A (production choice) |
| 5 | **Follow Through** | ⚠️ PARTIAL | Stagger between elements exists but no overshoot DECAY on stop. Child elements should trail parent. | `trail_delay = f(pacing_velocity)` per child |
| 6 | **Slow In/Out (Easing)** | ✅ WORKING | Bezier curves + Remotion spring | `easing = f(formality, enthusiasm)` |
| 7 | **Arcs** | ❌ MISSING | ALL motion is linear X or Y. No curved paths. | `translatePath = bezierArc(f(warmth, enthusiasm))` |
| 8 | **Secondary Action** | ⚠️ PARTIAL | Accent line draws while text enters. But no container breathe, no decoration pulse, no icon bounce. | `secondary_intensity = f(emotional_arousal)` |
| 9 | **Timing** | ✅ WORKING | holdDuration from speaking_rate_wpm | `duration_ms = f(speaking_rate_wpm, pacing_velocity)` |
| 10 | **Exaggeration** | ⚠️ PARTIAL | Spring overshoot exists. But no scale exaggeration, no position overshoot, no emphasis flash. | `exaggeration_factor = f(enthusiasm, visceral_impact)` |
| 11 | **Solid Drawing** | ✅ WORKING | 2D equivalent: consistent border weights, shadow depth | Brand composition rules |
| 12 | **Appeal** | ✅ WORKING | Brand personality drives visual charm | Brand tokens + composition rules |

**CORRECTED: 3 fully missing (#1, #2, #7). 3 partial (#5, #8, #10). 6 working (#3, #4, #6, #9, #11, #12).**
Adding the 3 missing + completing the 3 partial would make our MG feel ALIVE instead of mechanical.

## 8. Complete Animatable Property Inventory

### What Professional Tools Expose vs. What We Have

From AE Expression Reference, Cavalry docs, Lottie Spec, Remotion API:

#### Transform Properties
| Property | AE | Cavalry | Lottie | Remotion | Ours | Signal Mapping |
|---|---|---|---|---|---|---|
| position.x | ✅ | ✅ | ✅ | ✅ interpolate | ❌ Fixed by layout | f(shot_type, visual_dependency) |
| position.y | ✅ | ✅ | ✅ | ✅ interpolate | ❌ Fixed by layout | f(shot_type, visual_dependency) |
| scale (uniform) | ✅ | ✅ | ✅ | ✅ spring | ⚠️ anim.scale only | f(visceral_impact, music_beat) |
| scaleX (independent) | ✅ | ✅ | ✅ | ✅ | ❌ | f(visceral_impact) for squash/stretch |
| scaleY (independent) | ✅ | ✅ | ✅ | ✅ | ❌ | f(visceral_impact) for squash/stretch |
| rotation | ✅ | ✅ | ✅ | ✅ interpolate | ❌ | f(humor, enthusiasm) subtle tilt |
| skewX | ✅ | ✅ | ❌ | CSS | ❌ | f(visceral_impact) italic lean |
| skewY | ✅ | ✅ | ❌ | CSS | ❌ | Rare, skip for now |
| anchorPoint | ✅ | ✅ | ✅ | transform-origin | ❌ | Needed for rotation/scale origin |
| opacity | ✅ | ✅ | ✅ | ✅ interpolate | ✅ anim.opacity | f(music_energy) breathing |

#### Shape/Visual Properties
| Property | AE | Cavalry | Lottie | Remotion | Ours | Signal Mapping |
|---|---|---|---|---|---|---|
| fill color | ✅ | ✅ | ✅ | style | ✅ resolvedProps.fill | Brand tokens |
| fill opacity | ✅ | ✅ | ✅ | style | ✅ resolvedProps.opacity | f(formality) |
| stroke color | ✅ | ✅ | ✅ | CSS border-color | ❌ | Brand accent |
| stroke width | ✅ | ✅ | ✅ | CSS border-width | ⚠️ borderWeight | f(formality) |
| stroke dasharray | ✅ | ✅ | ✅ | CSS/SVG | ❌ | Draw-on animation |
| stroke dashoffset | ✅ | ✅ | ✅ | CSS/SVG | ❌ | f(frame) for draw-on reveal |
| corner radius | ✅ | ✅ | ✅ | CSS | ✅ | Brand rules |
| box-shadow | ✅ | ✅ | ❌ | CSS | ⚠️ shadow prop | f(formality) depth |
| backdrop-filter blur | ✅ | ❌ | ❌ | CSS | ✅ | f(music_energy) |
| filter (blur) | ✅ | ✅ | ❌ | CSS | ❌ | f(emotional_arousal) focus |
| filter (brightness) | ✅ | ✅ | ❌ | CSS | ❌ | f(enthusiasm) glow |
| filter (contrast) | ✅ | ✅ | ❌ | CSS | ❌ | f(visceral_impact) punch |
| filter (saturate) | ✅ | ✅ | ❌ | CSS | ❌ | f(warmth) vibrancy |
| filter (hue-rotate) | ✅ | ✅ | ❌ | CSS | ❌ | Color shift effects |
| mix-blend-mode | ✅ | ✅ | ❌ | CSS | ❌ | Overlay, multiply, screen |
| clip-path | ✅ | ✅ | ✅ | CSS | ✅ anim.clipProgress | Wipe/reveal animations |
| gradient | ✅ | ✅ | ✅ | CSS | ⚠️ gradient primitive | Shimmer, sweep effects |

#### Typography Properties
| Property | AE | Cavalry | Lottie | Remotion | Ours | Signal Mapping |
|---|---|---|---|---|---|---|
| font-size | ✅ | ✅ | ✅ | style | ⚠️ CRG min only | f(formality) scale |
| font-weight | ✅ | ✅ | ✅ | style | ✅ | Brand rules |
| letter-spacing | ✅ | ✅ | ✅ | CSS | ❌ | f(formality) tracking |
| line-height | ✅ | ✅ | ❌ | CSS | ❌ | f(pacing_velocity) |
| word-spacing | ✅ | ❌ | ❌ | CSS | ❌ | Rare, skip |
| text-transform | ✅ | ❌ | ❌ | CSS | ✅ headingTransform | Brand rules |
| text-shadow | ✅ | ❌ | ❌ | CSS | ❌ | f(visceral_impact) glow |
| text-decoration | ✅ | ❌ | ❌ | CSS | ❌ | Underline emphasis |
| color (per-char) | ✅ | ✅ | ✅ | Custom | ❌ | Per-word color highlight |

**CORRECTED COUNT: We have 11 animatable properties. AE has ~31. Gap = 20 properties.**

Our 11 current: opacity, scale (uniform), translateX, translateY, clipProgress, fill color, fill opacity, border radius, border weight, backdrop blur, box shadow.

**20 properties to add (all CSS/SVG-available, zero new rendering infrastructure):**

| # | Property | CSS/SVG | Signal Mapping | Disney Principle |
|---|----------|---------|----------------|-----------------|
| 1 | position.x (keyframeable) | translateX / left | f(shot_type, visual_dependency) | #3 Staging |
| 2 | position.y (keyframeable) | translateY / top | f(shot_type, visual_dependency) | #3 Staging |
| 3 | scaleX (independent) | transform: scaleX | f(visceral_impact, music_beat) | #1 Squash & Stretch |
| 4 | scaleY (independent) | transform: scaleY | f(visceral_impact, music_beat) | #1 Squash & Stretch |
| 5 | rotation | transform: rotate | f(humor, enthusiasm) | #7 Arcs (partial) |
| 6 | anchor point | transform-origin | Required for rotation/scale origin | Foundation |
| 7 | skewX | transform: skewX | f(visceral_impact) | #10 Exaggeration |
| 8 | letter-spacing | CSS letter-spacing | f(formality) | #9 Timing |
| 9 | line-height | CSS line-height | f(pacing_velocity) | #9 Timing |
| 10 | font-size (animatable) | CSS font-size | f(formality, emphasis) | #10 Exaggeration |
| 11 | stroke-color | border-color / SVG stroke | Brand accent | #8 Secondary Action |
| 12 | stroke-dasharray | SVG stroke-dasharray | Draw-on animation | #8 Secondary Action |
| 13 | stroke-dashoffset | SVG stroke-dashoffset | f(frame) progress reveal | #8 Secondary Action |
| 14 | filter: blur | CSS filter: blur() | f(emotional_arousal) depth | #3 Staging |
| 15 | filter: brightness | CSS filter: brightness() | f(enthusiasm, music_beat) | #10 Exaggeration |
| 16 | filter: contrast | CSS filter: contrast() | f(visceral_impact) punch | #10 Exaggeration |
| 17 | filter: saturate | CSS filter: saturate() | f(warmth) vibrancy | #12 Appeal |
| 18 | text-shadow | CSS text-shadow | f(visceral_impact) glow | #10 Exaggeration |
| 19 | mix-blend-mode | CSS mix-blend-mode | Compositing mode | Foundation |
| 20 | gradient-position | CSS background-position | Shimmer sweep | #8 Secondary Action |

**11 current + 20 new = 31 total — matching After Effects.**

## 9. MG-Gen & MoVer — Image-to-Motion-Graphics Research

### MG-Gen (CyberAgent, CVPR 2025)
Input: single raster image. Output: animated motion graphics video.
Pipeline: image → layer decomposition (text/picture/object/background) → HTML reconstruction → JS animation code generation → video render.

**Relevance to our system:** MG-Gen proves that LAYER DECOMPOSITION + HTML + JS ANIMATION is a viable pipeline for MG generation. Our composition engine already does something similar (content → RecipeElements → Remotion render). The difference: MG-Gen uses an LLM to generate animation CODE, we use signal-driven composition RULES.

**Key insight from MG-Gen:** Their 4 layer types (text, picture, object, background) map closely to our primitive categories. Their animation code generation could be replaced by our signal-driven animation selection — more deterministic, more controllable.

### MoVer (Stanford, SIGGRAPH 2025 — Jiaju Ma + Maneesh Agrawala)
Source: [arxiv.org/abs/2502.13372](https://arxiv.org/abs/2502.13372) | [mover-dsl.github.io](https://mover-dsl.github.io/) | [ACM TOG](https://dl.acm.org/doi/10.1145/3731209)

**What it IS:** A Domain-Specific Language (DSL) based on first-order logic for VERIFYING motion graphics animations. NOT a generator — a VERIFIER.

**How the pipeline works:**
1. Text prompt → LLM generates SVG animation code
2. Same prompt → LLM generates MoVer verification program (predicates)
3. MoVer executes predicates against the rendered animation
4. Failed predicates → fed back to LLM for correction
5. Iterate up to 50 times

**Predicate examples:** "object A moves left", "object B enters before object C", "text is centered", "animation completes within 3 seconds", "elements don't overlap"

**Results:** 58.8% correct without iteration → **93.6% with up to 50 iterations.** 35pp improvement from automated verification alone.

**Limitations (from paper):** Currently requires LOW-LEVEL motion descriptions. Less effective for abstract/high-level descriptions like "make it feel energetic." Future work: high-level abstractions, 3D scene verification, CAD design.

**Implications for Editron (5 specific applications):**
1. **Post-composition spatial verification:** "Does the lower-third avoid the caption zone?" "Do elements maintain reading order?" Our CRG validator checks numeric constraints (min font, density) but not spatial relationships.
2. **Temporal verification:** "Does the stat-counter appear DURING the number mention?" "Does the lower-third show WHEN the speaker is introduced?" Currently we trust frame placement but never verify intent alignment.
3. **Self-correcting composition loop:** If verification fails → re-run planComposition with adjusted parameters (different layout, different timing). No LLM needed — just signal weight adjustments. Could iterate 3-5 times (not 50 — we're faster since no LLM in loop).
4. **Quality scoring:** MoVer predicates as quality metrics. "8/10 predicates passed" = 80% quality score per MG. Aggregate across video = video-level MG quality grade.
5. **Regression testing:** Write MoVer-style predicates as test assertions. "Given these signals + content, the composition MUST have: text element in bottom-left, accent line, container with blur." Deterministic test suite for composition engine.

**What MoVer CAN'T do:** Aesthetic judgment. Checks structural correctness, not beauty. For aesthetics: human calibration or learned perceptual model (future).

### Additional Research: Audio-Synchronized Visual Animation (ASVA)
Source: [arxiv.org/pdf/2403.05659](https://arxiv.org/pdf/2403.05659) | KeyVID [arxiv.org/pdf/2504.09656](https://arxiv.org/pdf/2504.09656)

Animates static images guided by audio. KeyVID (2025) achieves precise audio-visual sync by aligning key visual actions with corresponding audio signals. Relevance: same principle as our audio-reactive modulation but applied to VIDEO generation, not MG overlay animation.

### Patent: US20250218464 — "Automated Video Generation" (July 2025)
Systems for converting textual content into animated videos by identifying narrative elements and transforming into visual scene components. Directly describes what our script→video pipeline does.

## 10. Audio-Reactive Architecture Deep Dive

### Industry State of the Art
- **TouchDesigner**: Visual programming for audio-reactive. Signal → node graph → visual output. Real-time.
- **Unreal Engine 5.7**: Soundwave Animator drives kinetic text properties frame-by-frame from audio analysis.
- **Reelmind.ai**: GANs + real-time audio analysis → beat-synced abstract visuals.

### Patent US12536670: "Synchronizing video to audio using visual beats"
Generates "visual beats" from audio analysis (beat detection + energy peaks + onset detection). These visual beats become timing markers that drive editing decisions (cuts, transitions, effects) in sync with audio rhythm.

**Direct mapping to our system:** Our `audio.music_beat` signal IS a visual beat. The patent describes a framework where:
1. Audio analysis → beat markers (we have this: beat detection service)
2. Beat markers → editing decisions (we have this: alignCutsToBeats)
3. Beat proximity → animation intensity (we have this: audio-reactive modulation)

**What we're MISSING from the patent's approach:**
- "Visual beats" from VIDEO (not just audio) — motion peaks, scene changes, face expressions as additional beat sources
- Multi-resolution beats — the full musical hierarchy, not just binary beat/no-beat
- Beat confidence weighting — strong beats get bigger effects than weak beats

### Musical Beat Hierarchy — 7 Resolution Levels (CORRECTED)

Source: ISMIR 2020, CCRMA Stanford MIR Workshop, Joint Beat & Tatum Tracking (Seppanen & Eronen, ISMIR 2006)

The beat hierarchy is NOT 3 levels. It's **7 distinct metrical levels:**

| Level | Name | Description | Typical Duration | Our Status | MG Application |
|---|---|---|---|---|---|
| 1 | **Tatum** | Smallest pulse unit, sub-divisions of beat | ~100-250ms | ❌ Missing | Micro-animations: text shimmer, accent pulse, glow flicker |
| 2 | **Beat** (Tactus) | The pulse you tap your foot to | ~300-600ms | ✅ `audio.music_beat` | Core beat-sync: scale pop, opacity pulse |
| 3 | **Downbeat** | First beat of each bar/measure | Every 2-8 beats | ❌ Missing | Stronger effects than regular beat: bigger scale, color flash |
| 4 | **Bar/Measure** | One complete metric cycle | ~1-4 seconds | ❌ Missing | Composition-level: MG enters/exits at bar boundaries |
| 5 | **Phrase** | Musical sentence (typically 4-8 bars) | ~4-32 seconds | ❌ Missing | Narrative-level: new MG type at phrase change |
| 6 | **Section** | Verse/chorus/bridge/drop | ~15-60 seconds | ✅ `audio.music_section` | Density/style shift: chorus → richer MG, verse → subtler |
| 7 | **Onset** | Any transient/note beginning (NOT periodic) | Irregular | ❌ Missing (data exists: 5-Track `transients[]`) | Transient-reactive: flash on drum hit, accent on stab |

**We have 2 of 7 levels.** Missing 5. Three are EASY to add:
- **Downbeat** (level 3): Derive from BPM + time signature (already have BPM)
- **Bar** (level 4): Derive from BPM + time signature
- **Onset** (level 7): Already in 5-Track as `audio.transients[]`, just not in signal registry

Two are MEDIUM:
- **Tatum** (level 1): Subdivide from beat, needs tempo-aware subdivision logic
- **Phrase** (level 5): Needs phrase boundary detection (pattern-based: 4-bar or 8-bar groupings)

### Our Audio-Reactive Expansion Path
Current: 3 reactive signals (music_beat, energy, emotion_intensity)
Target: **12 reactive signals** across audio + visual + speech:

**Audio-derived (7):**
1. `music_beat` — tactus level (already have)
2. `music_downbeat` — first beat of bar (derive from BPM + time sig)
3. `music_bar_boundary` — bar/measure boundaries
4. `music_tatum` — sub-beat pulse for micro-animations
5. `music_phrase_boundary` — phrase changes (4-8 bar groupings)
6. `audio_onset` — transient detection (already in 5-Track `transients[]`)
7. `audio_energy_envelope` — continuous energy curve (already have partial)

**Visual-derived (3):**
8. `visual_motion_peak` — from 5-Track `motionPeaks[]` (data exists, not in registry)
9. `face_expression_change` — delta of V-JEPA `face_emotion` between frames
10. `scene_boundary` — hard cut detection (already have structural equivalent)

**Speech-derived (1):**
11. `speech_stress` — word-level emphasis from Wav2Vec `stressDetected`

**Composite (1):**
12. `composite_beat` — multi-source: max(audio_onset, visual_motion_peak, speech_stress, music_downbeat). The "universal beat" that catches rhythm from ANY source — works for music videos, talking heads, silent footage.

## 11. Next Steps (CORRECTED — all numbers verified)

### DONE This Session ✅
- [x] Commit Phase C code (c5c0b1ef, 11 files +449)
- [x] Fix ALL 6 P0/P1 bugs: RC-4 ✅, RC-5 ✅, RC-6 ✅, RC-8 ✅, A3.5.6 ✅, A3.5.10 ✅ (87418599, +77)
- [x] Rule 29N added (universal content via signals)
- [x] Full landscape research + this document

### Short-term: Signal Expansion
- [ ] Wire 9 EXISTING signals to MG planner (zero new computation — data already in signal-registry.ts)
- [ ] Add 6 NEW signals (color temp, safe zone, pacing trend, info density, hook strength, dominant color)
- [ ] Add 5 beat hierarchy levels (downbeat, bar, tatum, phrase, onset — 3 EASY, 2 MEDIUM)
- [ ] Target: 8→23 continuous signals reaching composition engine

### Medium-term: Property + Animation Expansion
- [ ] Add 20 animatable properties (all CSS/SVG-available). 11 current → 31. Match AE.
- [ ] Implement 3 missing Disney principles (#1 squash/stretch, #2 anticipation, #7 arcs)
- [ ] Complete 3 partial Disney principles (#5 follow-through, #8 secondary action, #10 exaggeration)
- [ ] Implement 5 animation phases (entrance, hold, emphasis, reactive, exit)
- [ ] Add new animation patterns per phase (14 entrance, 7 hold, 5 emphasis, 8 exit)
- [ ] Expand layout modes (split-screen, corner badge, banner, floating, inline)
- [ ] Expand visual treatments (glass, neon, outlined, gradient, shadowed)

### Architecture: Generic Composition Algorithm
- [ ] Replace named compose functions (composeNumeric, composeIdentity, etc.) with SINGLE signal-driven function
- [ ] `f(content_payload, signal_vector_23d, brand_tokens) → Recipe`
- [ ] Signal weights determine: WHICH primitives, HOW MANY, WHAT arrangement, WHAT animation, WHAT timing
- [ ] This is the "infinite MG" unlock — no preset types

### Research Integration
- [ ] Study nexu-io/open-design `motion-frames` skill for composition patterns
- [ ] Study open-design quality gates (5-dimensional self-critique) for our CRG validator
- [ ] Evaluate MoVer DSL for post-composition verification (spatial + temporal predicate checking)
- [ ] Evaluate MG-Gen layer decomposition approach as validation of our architecture
- [ ] Prototype LottieGPT as offline animation asset generator (Phase 2)

### Phase D: Crazy Edits Foundation
- [ ] Build position keyframe engine (XYZ transform curves on overlays, signal-driven)
- [ ] Fix speed ramping (make signal-driven: velocity = f(energy, beat_proximity))
- [ ] Research SAM2 for subject masking (THE unlock for multi-scene layering)
- [ ] Arc motion paths (Disney #7 — curved bezier paths, not linear X/Y)

### Aesthetic Verification via Vision Model (MoVer + "Looks Good" Gate)
- [ ] Start with Gemini Flash for aesthetic scoring (zero new infra — already in stack)
- [ ] Render MG as single frame → vision model rates readability, hierarchy, brand consistency, professional quality
- [ ] If Gemini Flash insufficient → fine-tune Qwen2.5-VL-7B on rated MG examples (Modal hosting)
- [ ] Alternative: InternVL3-8B (comparable, different architecture)
- [ ] Combine with MoVer-style predicate verification for STRUCTURAL correctness
- [ ] Result: dual quality gate — structural (predicates) + aesthetic (vision model)

### CEO + Elon Review Result: Signal Target = 34, Not 23
Reviewed 2026-05-22. Key finding: 23 signals misses the PERCEPTUAL dimension entirely.
5 dimension groups: Temporal (5), Content (6), Emotional (8), Perceptual (7), Rhythmic (8) = **34 signals.**
Biggest gap: PERCEPTUAL (0 signals reaching MG today). Second: CONTENT depth. Third: RHYTHMIC resolution.
See session_handover_2026_05_22_mg_expansion.md for full review transcript.

### Actionable Libraries from Awesome Sub-Lists (7 of 150+ reviewed)
1. **[Mojs](https://mojs.github.io/)** — Motion graphics toolbelt. Study API for animation phase system design.
2. **[tsParticles](https://particles.js.org/)** — Particle animation (confetti, sparkle, dust). Reference for particle primitive.
3. **[Blotter](https://blotter.js.org/)** — Unconventional text effects (distortion, liquid). Reference for kinetic typography.
4. **[Progressbar.js](https://kimmobrunfeldt.github.io/progressbar.js/)** — Animated progress bars. Reference for progress bar primitive.
5. **[meyda](https://meyda.js.org/)** — Audio feature extraction (RMS, spectral centroid, MFCC). Evaluate for signal expansion.
6. **[Aubio](https://aubio.org/)** — Robust beat/onset/pitch detection (C library, JS bindings). Evaluate for 7 beat hierarchy levels.
7. **[Theatre.js](https://www.theatrejs.com/)** — Visual animation curve editor. For designing our 34 animation patterns.

### Exploration Still Needed
- [ ] Deep dive into nexu-io/open-design motion-frames + video-hyperframes skills (read actual code)
- [ ] Deep dive into sindresorhus/awesome rabbit hole for MG-relevant sub-lists
- [ ] CEO + Elon review on signal architecture (is 23 enough? what's missing?)
- [ ] Evaluate HyperFrames (HeyGen) as alternative MG renderer alongside Remotion
- [ ] More patent research on automated video editing + animation sync
