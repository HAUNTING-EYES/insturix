# MG Form-Selection Architecture — how the engine decides WHICH motion graphic (signals, not presets)

Grounded in (a) the creative knowledge graph's existing Mapping→Technique triggers, (b) web research on real editorial/data-viz practice, (c) verified engine capabilities. The answer to "how do we crack WHICH MG, from signals, no presets." #open

## The answer in one line
**A form is never picked — it EMERGES from a score.** The content's STRUCTURE licenses which forms are *possible*; signals decide which *fits the moment*; the scorer picks the winner; the gate validates. The "when to use what" editorial knowledge is **already codified in the creative graph** (Mapping→Technique, grounded in the production-knowledge doc) — it just isn't *wired into selection* or *fed by extraction* yet. Same pattern as the dormant dials.

## The CONVERGENCE (the founder's "find the convergence of signals") — it's real, and it's CARDINALITY + STRUCTURE
When you tabulate every form's editorial trigger (graph + web), they collapse onto a tiny shared spine — **how many comparable values, in what structure**:

| Content structure | → Form |
|---|---|
| 1 value, no range | big-number / stat callout |
| 1 value **with a target/range** | gauge / dial / meter |
| **2 comparable states of one subject** | before/after / versus |
| **≥3 values, same series** | bar / column chart |
| **≥~20 values / time-continuous** | line chart |
| **≥3 distinct related facts** | infographic stat-grid |
| **ordered set ≥3** | timeline / process |
| a **salient single line** | pull-quote / kinetic type |
| a **section/structural boundary** | title / chapter / end card |
| a first-mention **name/brand** | lower-third |
| a quotable **assertion** | quote card |

Source-backed thresholds (eazyBI 5/7/15 categories, Observable continuity rule, Flourish "single value in a range" = gauge). So we don't write 22 rules — we detect **cardinality / continuity / boundedness / ordering / salience / structural-boundary** and the form falls out.

## The convergent CORE signals (≈8 inputs select all forms)
From the graph's Mapping→Technique catalog:
- **entity.number** (+ claim_strength) → stat_counter — `NEEDS_CODE`
- **entity.name** (first-mention) → lower_third, keyword_highlight — `NEEDS_CODE`
- **entity.cta** (+ position) → caption_emphasis / late-CTA — `NEEDS_CODE`
- **claim_strength** (assertive/hedged) → stat gate + quote_card — `NEEDS_CODE` (hedged number ⇒ **NEVER** a stat — editorial-integrity rule, graph L3107)
- **speech.emphasis_word** (prosodic spike) → caption_emphasis — `NEEDS_CODE`
- **entity.topic_boundary** (cosine delta) → chapter card — `NEEDS_CODE`
- **formality / WPM / energy** → ALL 5 caption modes — ✅ **AVAILABLE**
- **position_in_video / scene_index / active_overlays_count** → logo, CTA routing, clutter suppression — ✅ **AVAILABLE**
- NEW structure signals to add (web-derived): **dataPointCount, isOrderedSequence, hasBoundedRange, isComparisonOfSameSubject, lineSalience** — the cardinality/structure spine above.

## THE UNIVERSAL ANTI-GARBAGE RULE (this is the no-preset AND no-shit guard)
Every form's highest-damage misfire is the same: **asserting a structure the content doesn't actually have** — a chart on coincidental numbers, a comparison of non-comparable subjects, a gauge on an unbounded metric, a "process" on unordered items, a quote-card on a throwaway line. **A form is LICENSED only if the content genuinely has its structure** (real cardinality/order/boundedness/salience) — never by surface keywords. This is the Rule-29 gate baked into selection: strict affordance, then fit. (It's also why this isn't a preset: a preset always fires; this fires only when licensed, scored.)

## The real BLOCKER (verified — it's NOT the engine or the selection logic)
Every graphic trigger rests on `NEEDS_CODE` entity/structure signals. The engine can render the forms; the graph knows when to use them; **what's missing is the EXTRACTION that detects the structure.** → The unlock is **the LLM as a content-STRUCTURE extractor** (language → cardinality/ordering/boundedness/comparison/salience/entities), feeding the convergent-core signals. It does NOT pick the form (Rule 30). Captions are already fully groundable (formality/WPM/energy available) — graphics are dark only because the entity/structure signals aren't extracted.

## The architecture (end to end)
```
LLM structure-extractor (language)  →  convergent-core structure+entity signals
        →  graph Mapping→Technique as SCORABLE considerations (affordance gate × signal-fit curve)
        →  scoreAllOverlays → selectWinners (the `graphic` category)  →  FORM EMERGES
        →  design gate validates (Phase E)  →  render (parametric engine)
```
No preset. No LLM-picks-form. The graph's editorial rules become the considerations; the scorer is the existing one.

## What we can build NOW vs later (the iman-Gadzhi answer — honest)
**PARAMETRIC (15/20 premium forms — buildable now, no assets):** counter, **radial gauge/dial**, progress/meter, bar chart, line/sparkline, kinetic typography, lower-third, mask reveals, draw-on lines, pull-quote, stat card, title sequence, multi-ring donut, **circle-this annotation**, **glassmorphism panel** (backdrop-blur already in `buildShapeStyle:418`). The iman dial/counter/kinetic spine is **fully in reach.**
**ASSET-COMPOSITED (Phase G — needs an icon/asset resolver):** 5-star/social-proof (one star path!), device mockups, icon-grid infographics, logo walls, maps.
**FRONTIER:** character animation, 3D, fluid/illustration scenes.
Highest-value parametric builds (premium-feel ÷ effort): **glassmorphism move, true dial (ticks+needle), progress meter, multi-ring, bar-chart-race, circle-this**. Cheapest crossover: one authored **star path** → whole 5-star family.

## Build sequence
1. **Structure extraction** — LLM emits cardinality/ordering/boundedness/comparison/salience + entities (number/name/cta/claim) → the core signals. (This is Tier-1 content unlock, done right.)
2. **Wire graph Mapping→Technique into the scorer** as affordance×fit considerations (forms emerge, licensed by real structure, guarded against false-structure).
3. **Add missing forms** (comparison, timeline, chart-by-cardinality, gauge, infographic) as techniques+mappings, web-grounded thresholds.
4. **Build high-value parametric premium forms** (glass, dial, progress, multi-ring, annotation) — extend the engine, no assets.
5. **Phase G** — asset resolver (icons/star/devices) for the asset-composited tier.

## Honest hard parts
- Extraction reliability (false-positive structure = damage) — adversarial test per form (Rule 29).
- Calibration — the trigger strengths/thresholds need real-video tuning (Graphiti feedback).
- `callout` needs Phase-2 vision (x,y target); `quote_card`/`karaoke` have no graph mapping (add).

## Sources
Editorial/data-viz: eazyBI chart-types, Observable bars-vs-lines, Flourish gauge/bar-race, ThoughtSpot, Highcharts, Storyblocks/Vimeo lower-thirds, We Design Motion / Linearity kinetic typography, HubSpot/Wistia end-cards, Tyler Vigen spurious-correlations. Parametric/asset: ContentBeta SaaS MG, Iman-Gadzhi edit breakdowns (YouTube), AE gauge/percentage techniques, glassmorphism 2025. Full list in the research agents' output (this session).

See [[MG-Capability-Map]], [[D-017-MG-Dissolve-Type-Preset-Menu]], [[MG-Spine-Build-Plan]], [[MG-Visual-Language-Spine-Redesign]].
