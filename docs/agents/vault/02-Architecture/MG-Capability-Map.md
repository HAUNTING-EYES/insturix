# MG Capability Map — what the engine CAN do vs DOES, and why (2026-05-31)

Built from a 4-agent every-file audit of the MG system, code-verified against `editron-worktree`. The founder's read is correct: we ship ~3 textual forms; the engine is capable of far more. #open

## One sentence
**The render engine is genuinely generative (10 primitives, 7 composers, 13 entrances, structural-move vocabulary, data-viz, particles, masks, GSAP scramble/draw/morph) — but it is STARVED at the source: the content funnel strips every graphic to a bare `{text}`, so 5 of 8 content shapes never get data and the engine collapses to "a word on a dark card." The bottleneck is upstream (selection + content-extraction + composer coverage), NOT the renderer.**

Engine built ≈ 40–60% of pro craft. Realized output ≈ 5%.

## The pipeline + where it starves

```mermaid
graph TD
  subgraph PRODUCE["CONTENT PRODUCERS"]
    SIG["signal-executor.ts:347<br/>sets ONLY text on every graphic<br/>value/name on 2 regex branches"]
    LLMx["LLM intent: schema HAS<br/>value,label,name,title,quote,author,kind<br/>(unified-edit-intelligence.ts:419)"]
  end
  subgraph SELECT["SELECTION (preset menu — D-017 target)"]
    ENUM["z.enum 6 types + default<br/>keyword-highlight (edl-executor:1051)"]
  end
  subgraph LEAK["⛔ THE LEAK"]
    IT["intent-translator.ts:186-188<br/>forwards ONLY {text}<br/>DROPS value/label/name/title/quote/kind"]
  end
  subgraph ENGINE["ENGINE (generative, mostly complete)"]
    CSA["content-shape-analyzer<br/>only sees {text} → emphasis fallback :91"]
    COMP["7 composers<br/>5 starved of input"]
    PRIM["10 primitives + moves + dataviz<br/>+ particles + masks + GSAP"]
  end
  subgraph OUT["OUTPUT"]
    DOES["DOES: keyword-highlight, stat, lower-third (~3)"]
    DORM["DORMANT: quote, logo-img, avatar, bar, ring, sparkline, callout, broadcast-package (8)"]
    MISS["MISSING: title-seq, comparison, timeline, progress, infographic, product-showcase, device-frame, multi-step, graphic-transition (9+)"]
  end
  LLMx --> ENUM --> IT --> CSA --> COMP --> PRIM --> DOES
  SIG --> CSA
  COMP -.starved.-> DORM
  PRIM -.no composer.-> MISS
  classDef bad fill:#7f1d1d,color:#fff; classDef ok fill:#14532d,color:#fff; classDef dorm fill:#78350f,color:#fff;
  class IT,ENUM bad; class DOES ok; class DORM dorm;
```

## Capability scoreboard — 22 pro MG forms

**DOES (3, all textual):** keyword-highlight (over-fires, ~8/13), stat-counter, lower-third (name+title).
**DORMANT (8 — engine-ready, content-starved):** quote-card (`composeQuotation:455`), logo-reveal-with-image + avatar-lower-third (`image` primitive ready, `content.logo`/`content.avatar` never wired — planner:410/565), bar-chart/percentage-ring/sparkline (`composeDataSeries:640`, `content.values[]` never populated except one over-gated regex `signal-executor.ts:364`), callout (`composeStructured` built but LLM is **told "DO NOT use callout"** `unified-edit-intelligence.ts:1218`), broadcast-package (corner-marks/brackets/kicker/badge — budget≥4-5, rarely reached).
**MISSING (9+ — no composer at all):** title-sequence, end-card/CTA, comparison/before-after, process/timeline, progress-bar, star-rating, animated-infographic, product-showcase, device/browser/phone-frame composites, multi-step reveal within one graphic, graphic→graphic transitions.

## Engine capability inventory (what's physically renderable)
- **Primitives (10):** text, shape, container, decoration (WIRED); group (WIRED via moves); image (DORMANT — no producer), data-viz (DORMANT — no values), particle (DORMANT — budget≥4), mask (DORMANT — budget≥5), pattern (DORMANT — budget≥4); gradient/video-clip (DEAD).
- **Entrances (13):** ~9 reachable; slide-right/down, scramble unreachable (no role default / no winner-map entry). **Exits (12):** ~4 reachable; rotate/skew/zoom-blur/blur/scramble-out dormant. **Holds (6):** float/pulse/breathe/glow wired; GSAP morph dormant.
- **Effects:** count-up (WIRED); text-split kinetic (WIRED, rare); **GSAP scramble/draw/morph = 100% DORMANT** (handlers complete, plugins installed, but no planner ever emits `shape:'path'`/`scramble`/`draw`); data-viz bar/ring/sparkline (DORMANT); particles 4 presets (DORMANT); masks (DORMANT); brand-pattern (DORMANT); audio-reactive beat-pulse (DORMANT — `bpm` never stamped on overlay).
- **Structural moves (10):** backdrop-card/side-bar WIRED (budget 2); accent-line/underline/divider WIRED (budget 3, need content); kicker/badge/brackets/corner-marks/annotation DORMANT (budget 4-5 or content-starved).
- **DEAD scaffolding:** `composition-templates.ts` registry (zero registrations), `buildScrambleExit`, `crg-constraint-validator` (prod-dead, test-only), `aesthetic-gate` (truly dead).

## 3 root causes (file:line — fix these, not the renderer)
1. **CONTENT LEAK (the big one):** `intent-translator.ts:186-188` emits `params:{graphicType, text, signals}` — drops the `value/label/name/title/quote/author/kind` the LLM schema already produces (`unified-edit-intelligence.ts:419-430`). → `content-shape-analyzer.ts:91-93` sees only `{text}` → `emphasis` → keyword-highlight. **The richness is generated by the LLM and thrown away before the engine.**
2. **NO EXTRACTION for non-text forms:** the LLM is a type-PICKER, not a data-EXTRACTOR. Nothing populates `values[]` (charts), `logo`/`avatar` (images), `kicker/badge/annotation` (moves). `signal-executor.ts:347` sets `text` on every graphic; value/name only on narrow regex. Path D's `overlay-bridge.ts:30-54` has 4 thin resolvers (lower-third has no title; no quote/series resolver).
3. **NO COMPOSERS for structural forms:** comparison/timeline/progress/title-seq/infographic/product-showcase have no `composeX` case (`composition-planner.ts:216`) → fall to free-text. Plus complexity-budget caps richness to ~1 structural move at typical budget 2-3.

## The unlock path (range-expansion ÷ effort)
- **TIER 1 — activate the dormant engine (DAYS, ZERO new render code): ~3 → ~9-11 forms.**
  - Fix the content leak: forward the full content object + `kind` through `intent-translator` (and thread `kind` into `analyzeContentShape`, which already accepts but ignores `_kind`).
  - Make the LLM a content-EXTRACTOR (emit `values[]`, `title+body`, `quote+author`, request logo/avatar) — this IS D-017 + content extraction.
  - Wire brand assets → `content.logo`/`content.avatar` (G-2 already loads UnifiedBrand).
  - Un-ban callout (`:1218`); relax the chart gate (`signal-executor.ts:360`).
- **TIER 2 — new composers (1-2 wk each): ~70%.** comparison (reuse `group`), timeline/process (`group`+`moveBadge`+connector `shape`), progress-bar/star-rating (`shape` repeater), title-sequence/end-card.
- **TIER 3 — asset infra (weeks, Phase G frontier): ~95%.** icon/device-frame library, multi-step sequence support (extend Recipe from one-moment → sub-recipe timeline), graphic→graphic transitions.

## Relationship to D-017 + the spine
- **D-017 (dissolve the menu) + content-extraction = Tier 1** — biggest realized-range jump, mostly no new render code. Confirmed in code: selection layer is the preset; render layer is already generative.
- D-017 does **nothing for Tier 2/3** (the scorer can only select composers that exist).
- **The spine (coherence: palette/type/motion/intensity per moment) is the prerequisite for range not being a "dirty mashup."** Sequence: **spine (coherence floor) → Tier 1 (range via content) → Tier 2/3 (new forms).** Range without the spine ships ugly; the spine without range ships beautiful-but-monotonous (← exactly what the GIFs show today).

## Proposed queryable capability-graph (node/edge spec, mirrors creative-knowledge-graph)
- Nodes: `form`(status does/dormant/missing, commercial_value), `primitive`(exists), `composer`(status), `content_shape`(starved?), `producer`(live?), `selector`, `move`, `spine_dimension`(planned), `gate`.
- Edges: `producer --populates[live|gated|absent]--> content_shape` (starvation lives here), `content_shape --detected_as--> composer`, `composer --emits--> primitive`, `composer --renders--> form`, `selector --gates--> form` (D-017 cut-point), `move --attaches_to--> composer`, `spine_dimension --constrains--> {primitive,move,composer}`, `gate --validates--> form`.
- Reveals at a glance: dormant forms = live-composer + only gated/absent populate-edges (Tier 1); missing forms = no incoming `renders` (Tier 2/3); the D-017 cut = the `selector(LLM-enum)→form` bundle.

## Files (the MG system map)
ENGINE (generative, works): `motion-graphics/engine/{composition-planner, content-shape-analyzer, composition-renderer.tsx, primitive-renderers, property-resolver, structural-moves, data-viz-renderers.tsx, choreography-computer, gsap-timeline, brand-pattern-generator}` + `data/motion-theme-resolver`.
SELECTION/CONTENT (the bottleneck): `services/{unified-edit-intelligence:419/1210, intent-translator:186/238, creative-brief:344, edl-executor:492/1051/1130, signal-executor:347, reactive-edit-engine:276, five-track-analysis:138/820}`, `engine/overlay-bridge:30`, `agent/tools:167/4486`.
GATE: `engine/structural-gate` (live, observe-only) ; `crg-constraint-validator`/`aesthetic-gate` (dead).
RENDER MOUNT: `components/.../overlays/motion-graphic/motion-graphic-layer-content.tsx`.

See [[D-017-MG-Dissolve-Type-Preset-Menu]], [[MG-Visual-Language-Spine-Redesign]], [[MG-Spine-Build-Plan]], [[phase_f_g_saas_motion]].
