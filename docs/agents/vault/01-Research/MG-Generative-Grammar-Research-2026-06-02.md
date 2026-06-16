---
tags: [research, motion-graphics, generative, grammar, decided-direction]
status: open
created: 2026-06-02
source: deep-research workflow (robust redo, 13 agents, 6 clusters, ~1M tokens) — wf_460df56b-0c3
confidence_legend: "[SOLID]=verbatim-confirmed primary source | [UNVERIFIED]=plausible, source not confirmed | [WEAK]=overstated/mis-sourced | OUR-HYPOTHESIS=our synthesis, not a cited result"
---

# MG Generative Grammar — Research Foundation (2026-06-02)

Research for the north star: **signals must BUILD any motion graphic from primitives, not SELECT from a menu of types** (a menu is finite; creativity is infinite → need a finite GRAMMAR, finite rules → infinite outputs, where the "type" emerges and is never chosen). First deep-research run's verifier collapsed under rate-limiting (false "all refuted"); this is the clean robust redo.

## VERDICT
- **Proven for static charts, NOT done for motion.** The grammar-of-graphics dissolves the chart-type menu (Vega-Lite/Draco/Wilkinson): type is an emergent label, never chosen `[SOLID]`. But **no system has auto-generated the right composite MOTION graphic from spoken content end-to-end.** Every data-video system 2019→2023 (DataShot/Calliope/AutoClips/Data Player) inserts a ~10-item fact-type menu at the visual-form layer `[SOLID]`.
- **The founder's LAW-vs-TASTE = Draco's HARD-vs-SOFT** (hard = valid search space; soft = ranked preferences with weights LEARNED from human data, not invented) `[SOLID]` (mapping itself is sound reasoning, not paper-stated).
- **There is NO formal "is this graphic good" metric** (auto-viz survey, arXiv:2302.00569, verbatim) → cannot self-certify; **a human/visual gate is mandatory forever** `[SOLID]`.
- **It is the right bet (the moat) AND an unsolved research problem.** Our edge: per-moment video signals (visceral_impact/emphasis/energy) ARE the "what matters" ranking signal generic auto-viz lacks.

## BACKBONE TO BORROW
**Draco** (UW; ASP/Clingo; hard+soft constraints; RankSVM-learned weights; outputs Vega-Lite) as the architecture; **Vega-Lite** (`unit := (data, transforms, mark, encodings)` + composition algebra `layer/hconcat/vconcat/facet/repeat` + `parse→build→merge→assemble` rule defaulter) as the compositional substrate `[SOLID]`. Objective: `argmin Σ(weightᵢ × soft-violationᵢ) subject to hard constraints`. CAVEAT: Draco only does **single static charts** — time/motion/choreography is OUTSIDE its validated envelope `[SOLID]`. Maps onto our EXISTING code: utility-scorer (response curves)=soft; structural-gate=hard (half-built).

## THE GRAMMAR OF MOTION GRAPHICS (decomposition)
- **Primitives:** marks {point,line,area} + ~7 retinal variables (position/size/value/texture/hue/orientation/shape, Bertin/Munzner) + motion operators (KTE: "small set of composable components → unbounded expressions") `[SOLID]`.
- **Encoding channels:** Vega-Lite `(channel, field, data-type{nominal/ordinal/quantitative/temporal}, value, functions, scale, guide)` `[SOLID]`.
- **Relations (read from content, OPEN not a menu):** OpenIE (open n-ary relations, "no predefined relations") `[SOLID]`; RST (nuclearity = salience/emphasis) `[SOLID]` (relation set open/count `[WEAK]`/`[UNVERIFIED]`); FrameNet `Change_position_on_a_scale`(ITEM/ATTRIBUTE/INITIAL_VALUE/FINAL_VALUE/DIFFERENCE) `[SOLID]` — most directly implementable. Graphene proves OpenIE+RST compose in a shipped system `[SOLID]`.
- **Composition operators:** layer/concat/facet/repeat + Hierarchy of Defaults (specify only what differs; defaulter fills rest) + Mackinlay composition algebra `[SOLID]`. (2-D spatial only; motion composition is OUR extension.)
- **Meaning→form joint:** image schemas (MORE-IS-UP, CHANGE-IS-MOTION, SOURCE-PATH-GOAL, CONTAINER) `[SOLID]`. Worked example "12% before, 47% after" → MORE-IS-UP + SCALE + SOURCE-PATH-GOAL `[SOLID]` as reasoning. WEAKEST-evidenced joint; schema→VISUAL hop (DISL) is abstract-only `[UNVERIFIED]` — and it's the hop our value depends on.
- **HARD laws (the fence, symbolic, prune before ranking):** Expressiveness (encode all-and-only the facts); type-channel agreement (quantity ≠ hue/shape); validity; **MOTION-CONGRUENCE** (wrong kinematics → wrong MEANING, automatic/irresistible — Scholl & Tremoulet — THE most actionable finding, must be HARD); Lie-Factor≈1 `[SOLID]`.
- **SOFT ranking (ranks, doesn't gate):** Cleveland-McGill effectiveness (position>length>angle>area>color); salience-importance match; **learned preference weights (RankSVM)** — strongest actionable rec; Gestalt (common-fate → synchronized=set / staggered=sequence) `[SOLID]`. + OUR per-moment signals as the "what matters" ranker.

## BRUTAL TRUTH (why it's hard / why menus persist)
- **AutoClips (closest analog) measured: 20.5% misrecognition** (1 in 5 read as wrong fact), **66.9% coverage ceiling**, systematic confusion between types sharing a chart skin `[SOLID]`.
- **No absolute goodness metric exists** `[SOLID]`; satisfying all constraints is "not sufficient to guarantee insightfulness" `[SOLID]` — grammar is necessary, NOT sufficient.
- **Menus persist because:** visual-form layer is expensive so everyone routes around it (Data Player: real generative animation "requires significant development costs" → shipped a proof-of-concept menu); a menu is certifiable (human-approved entries) but a generator can produce valid-but-wrong output nothing can auto-catch; Draco's frontier stops at single static charts.
- **Motion raises the bar above static:** the 20.5% is for static clips; wrong motion adds automatic mis-reading channels no system has measured.

## IMPLICATIONS FOR OUR BUILD
1. Build as a **constrained grammar (Draco-shaped)**, not unbounded generation and not a menu.
2. Keep laws **symbolic**; make **motion-congruence a HARD law**.
3. **Learn soft weights from pairwise human preference; never invent them** (maps to the existing threshold-bandit). Every easing/duration number is INVENTED until sourced.
4. **Mandatory render/visual gate** (no auto goodness metric) — aligns with Rule 35 eval discipline.
5. **De-risk the meaning→visual-form joint FIRST** (least evidence, most novel value) on ONE structure end-to-end on real data, before the full build.
6. Expect a misrecognition floor; plan human-in-loop, not lights-out.

## SOURCE LEDGER (key)
Vega-Lite (idl.cs.washington.edu/files/2017-VegaLite-InfoVis.pdf, vega.github.io/vega-lite/docs/composition.html); Draco (github.com/uwdata/draco, idl.uw.edu/papers/draco); auto-viz survey (arXiv:2302.00569 — no goodness metric); AutoClips (sdq.github.io/autoclips — 20.5%/66.9%); Calliope (arXiv:2010.09975); Data Player (arXiv:2308.04703); Cleveland & McGill 1984; Munzner VAD; Bertin; Gestalt; RST (SFU); OpenIE survey (arXiv:2208.08690); FrameNet Change_position_on_a_scale; image schemas (arXiv:2503.24110 — "primitives → small theory Γ"); KTE (Lee/Forlizzi/Hudson, UIST 2002); Scholl & Tremoulet 2000 (PubMed 10904254); "Composing motion grammar of kinetic typography" (IEEE 874368).

**Corrections (uncertainty not laundered):** "data LAST" is the founder's Rule 35, not a graphics-paper claim. LAW-vs-TASTE=hard/soft and the 3-layer motion algebra are OUR design reasoning, not paper-endorsed. The full meaning→render chain is OUR hypothesis, research-grounded, NOT a validated pipeline.

Full raw report: workflow output `wvju5v1cw.output`. Supersedes the failed run `wvczplcqe` (verifier collapsed — ignore its "all refuted").
