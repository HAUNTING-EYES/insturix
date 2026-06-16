# MG Master Build Plan v3 — Overlays-as-Signals (Expression + Form), no presets

Supersedes [[MG-Spine-Build-Plan]] (v2 was gate-first/spine; v3 absorbs the founder's "everything is a signal-scored output, including which MG" + the form-selection proof). Grounded in [[MG-Capability-Map]], [[MG-Form-Selection-Architecture]], [[MG-Colour-Engine]], [[MG-Material-Libraries]] + this session's runnable proofs. #open

> **STATUS 2026-06-01 (see [[Session-2026-06-01-MG-Generative-Pivot-HANDOVER]]):** shipped + pushed — `d2ad8729` font_weight dial wired; `717a499f` **comparison form** (first non-text MG, §5) + **signal-scored LAYOUT** (`mg.arrangement.horizontal/vertical`, render-proven: same "12%→47%" → horizontal/energetic, vertical/formal). This is the FIRST composition decision made emergent — the pattern (§Layer-A/B) is now proven end-to-end (signals→scored→recipe→render). **The verified blocker before more form-selection work: the live path is DEAD** — `director-agent.ts:857` `selectWinners` 2-arg call (needs 3) throws + is swallowed @:876; :872 discards scorer graphic winners. `cbc97c8a` **emphasis-as-a-dial DONE** (frozen-list #1) — `mg.emphasis.scale_contrast` outputs a modular type-scale ratio; composeComparison's frozen ×0.5/×0.3/×1.3 become one scored ratio r (from=value/r, label=value/r², connector=value/r^1.5), which GUARANTEES value>from>connector>label for any r>1 (independent ratios could invert it). Render-proven: same "12%→47%" → from/hero 46% (energetic) vs 70% (formal), dramatic vs gentle; also fixed a latent connector>from inversion at the floor. Bounds 1.4–2.2 = modular-scale steps, curve INVENTED/calibration-pending. NEXT down the frozen-list: same ×0.75 ratio family in composeNumeric/Identity/Quotation (:389/:513/:558) → colour-role scored (#2) → split arrangement (#4). Form-selection path STILL DEAD — fix §8 (selectWinners 2→3 args + de-dupe the two graphic producers) before any extraction. `6417e819` **emphasis ROLLOUT + arrangement gate DONE (pushed):** the ×0.75 ratio is gone from ALL composers (numeric/identity/quotation/structured) via a shared `emphasisRatio()` helper; arrangement now has an **AFFORDANCE GATE** — horizontal licensed only for peer-element shapes (comparison), hero+caption shapes stack vertical (a caption sits below its hero = law, not taste). This fixed the bad ENERGETIC renders (font-size 138 + horizontal had split stat/name/quote into disconnected, over-wrapped columns; now clean, comparison still horizontal). **LESSON: formal renders looked good, energetic looked BAD — caught only by reading the REAL PNGs (I'd overclaimed "render-proven"; founder pushed back).** NEXT: the **font-size dial is CONTENT-BLIND** (a 7-word quote at 138px is wrong) → make size text-length-aware (dial = ceiling that text-fit shrinks from), then colour-role (#2). Pending: composeStructured title lacks a minSize → renders ~16px (task spawned).

## 0. The problem (verified this session, code-grounded)
The render engine is ~40-60% of pro craft and largely complete (10 primitives, 7 composers, data-viz, particles, masks, GSAP, structural moves). Realized output ≈ **5%** — text-on-a-card, ~3 forms. Root cause is **upstream, not the renderer**: (a) content funnel strips graphics to `{text}` (intent-translator:186); (b) 40 signal-curve **dials exist but key ones are dormant** (font_weight bound to a lerp, not the dial); (c) the graph's **`Mapping→Technique` form-triggers are codified but unwired** (LLM enum picks instead); (d) **missing composers** for comparison/timeline/chart; (e) **no structure-extraction** feeding the triggers (entity signals flagged NEEDS_CODE).

## 1. The principle (one rule, no exceptions)
**Every visual decision — every dial AND which MG form — is a signal-scored output through the existing utility-scorer/response-curve/overlay-definition infra. Never a preset, never an LLM picking the visual.** The LLM only reads CONTENT (language → structure + entities). Four disciplines keep it from rotting back into presets:
1. **Affordance = a FACT** (a bar chart *needs* ≥2 same-metric values — definition, not taste) → a hard gate (×0 when absent).
2. **Forms/treatments can LOSE / be NOTHING** (competition + threshold, not always-fire).
3. **The LOOK is 100% dials** (size/weight/colour/motion = signal+brand, never baked into the form).
4. **Considerations are GROUNDED + CALIBRATED** (from the graph + editorial research + real-data tuning), never hand-invented.

## 2. Layer A — EXPRESSION dials (how it looks) — half-built, consolidate + extend
The `mg.*` overlay dials already score type-size/line-height/tracking/case/saturation/animation/structure via curves. Work:
- **Consolidate**: wire the dormant dials (font_weight ✅ done this session — edl-executor feeds the curve, not the lerp) and **retire the competing `motion-theme-resolver` lerps** so the curve infra is the single source.
- **Extend (the visible wins)**: add `mg.typography.*` dials + renderer support for **italic/slant, underline, highlight/marker, width, angle, optical-size** — the davinci/adobe surface, each signal-driven.
- **Font family = variable-font AXES** (the "crack"): drive `wght/wdth/slnt/opsz` from signals via `fontVariationSettings`; family stays brand-bounded (brand's font wins). **NO font-matching library.** Needs a variable-font load path (`@remotion/google-fonts` loads static per-weight — verify).
- **Colour = sat/bright/temp dials** within brand-hue + semantic walls ([[MG-Colour-Engine]]).

## 3. Layer B — FORM selection (which MG) — architecture PROVEN, needs wiring + extraction
Forms = scorable overlays: **affordance-gate (hard, ×0) × fit-curve**, scored by the existing engine, winner emerges, can lose, can be nothing. **Proven runnable** this session (`scripts/form-selection-proto.ts`): EASY 4/4, TOUGH 7/8 (same number → comparison not stat; idiom/fake-first/coincidental-numbers gated dead; suppression; subsumption; peer-defer). The graph's `Mapping→Technique` triggers (stat←quantitative_claim, lower_third←name, etc.) ARE the considerations — codified, just unwired.
- **Multiplicity** handled three ways: **temporal** (grid scores each beat → a sequence of forms), **subsumption** (a comparison renders its numbers inside it — one richer form, not a stack), **cap+defer** (clutter rule ≤2, priority order, loser staggers to next beat).
- **The T1 gap the tough test found**: stat needs `claim_strength` (not just `has_number`) — trivial/hedged numbers get NO stat (a rule the graph already has). Fix in the gate.

## 4. The EXTRACTION (the named frontier + the real risk)
Every graphic trigger rests on detecting structure: `has_number / claim_strength / cardinality / is_comparison / is_ordered / is_series / is_name_first_mention / salience / topic_boundary`. Today these are NEEDS_CODE. **The unlock = the LLM as a content-STRUCTURE reader** (language: "a 3-step process," "a comparison of 40 vs 73," "a hedged aside") feeding the signals. **It never picks the form.** This is the highest-leverage AND highest-risk piece — a wrong `is_comparison` on "night and day" fires a false comparison. → built with **Rule-35 prompt-eval + adversarial test FIRST**, not blind trust. The design gate (Phase E) is the backstop.

## 5. What to build (parametric forms — 15/20 need no assets)
Buildable now from primitives + signals: comparison, timeline/process, **gauge/dial** (extend `PercentageRing`), progress/meter, multi-ring, **glassmorphism panel** (backdrop-blur already in `buildShapeStyle:418` — near-free premium), circle-this annotation, title/end card; bar/line/sparkline + counter + kinetic-type already exist. **Asset-tier (Phase G, later)**: 5-star (one star path), device mockups, icon grids, logos, maps. **Frontier (not now)**: character/3D/illustration.

## 6. Build sequence (phased, ≤5 files each, every phase render-verified on MOTION via the GIF harness)
- **P1 — Expression consolidation + visible dials** (Layer A): wire dormant dials + kill competing lerps; add underline/highlight/italic. *Visible win, low risk.*
- **P2 — Variable-font family axes** (Layer A): the "crack" — verify load path, drive axes from signals. *Fixes "shitty font."*
- **P3 — Form-selection wiring** (Layer B, behind a flag): wire graph `Mapping→Technique` into the scorer with affordance gates + the `claim_strength` fix. The proven brain, on real (already-available caption + structural) signals first.
- **P4 — Structure extraction** (the frontier): LLM structure-reader, **Rule-35 eval harness FIRST**, feeding the form signals. Unlocks the entity-gated graphic forms.
- **P5 — New parametric composers**: **comparison first** (the cleanest "more than text" vertical: extract → score → render → verify), then timeline, gauge, glassmorphism move.
- **P6 — Calibration + Graphiti**: tune curves/thresholds on real videos; overrides become training signal.
- **Phase E design gate** stays the trust floor across all phases (observe→enforce when FP≈0).
- v0 ship = P1+P2+P3 (expression + selection on available signals) behind a flag, beating the preset on the buyer test before P4/P5 widen.

## 7. Risks + disciplines
- **Extraction false-positives = the #1 damage** (T1). Mitigate: strict affordance gates, claim_strength, Rule-35 eval, adversarial per-form, the design gate. **Never trust extraction blindly.**
- **Preset-degeneration**: hold the 4 disciplines (§1). Review every form-overlay against them.
- **Calibration debt**: curve params are first-draft; need real-data tuning (mark INVENTED, Graphiti-feed).
- **Cap/clutter**: ≤2 overlays, priority+stagger; never stack.
- **Lambda**: variable-font loading + render cost — verify (precedent: text-overlay fonts run on Lambda).

## 8. Verified vs owed (honest)
PROVEN: the dial infra exists + font_weight wired (code+tsc); form-selection = scored emergence, survives tough cases (runnable proof); the graph encodes the triggers; 15/20 forms parametric. OWED: variable-font render path (unverified); extraction (not built — the frontier); new composers (comparison/timeline/gauge — not built); live-pipeline render of any of it; calibration.

## 9. Success criteria (buyer-framed, motion)
One brand kit, 20 real moments rendered AS VIDEO: a marketer rates **≥16/20 on-brand + broadcast-quality**, IDs **zero as template-stock**; **forms VARY by content** (a comparison beat ≠ a stat beat ≠ a calm aside that shows nothing); **ZERO false-structure graphics** (no chart on coincidental numbers); two brands differ in **type + motion + colour**; calm = restrained/can-be-zero, energetic = bolder-when-present. Watched as motion, not stills.

See [[MG-Capability-Map]], [[MG-Form-Selection-Architecture]], [[D-017-MG-Dissolve-Type-Preset-Menu]], [[MG-Colour-Engine]].

---

# REVIEW VERDICT (CEO / Eng / Director / Editor — 2026-06-01) → v4 REVISIONS

**All four: REVISE.** Architecture sound (signal-scored emergence + affordance gates + no presets = the right bet, "more real than the plan claims" — the scorer/overlays/resolvers exist). But the plan ships on cracked foundations + has three missing layers. Scores: CEO ~5/10 (architecture 9, commercial 5), Eng 8/5/3/6/5, Director 6/3/4/6/3, Editor 5/4/3/2/2.

## A. VERIFIED BUGS (fix BEFORE any form-selection work)
1. **`director-agent.ts:857` — `selectWinners(results, frame)` is a 2-arg call; signature needs 3.** `recentDecisions` gets a number → `.get()` throws → swallowed by catch :876 → "skipped." **The live graphic path is DEAD and the error is hidden.** `[ME-verified]`
2. **`director-agent.ts:872` discards the scorer's graphic winners** (keeps signal-executor graphics + utility non-graphics). `[ME-verified]`
3. ⇒ **P3 is "fix the broken path + de-dupe two graphic producers (signal-executor regex vs scorer)", NOT greenfield wiring.** The graphic overlays + affordance-gate resolvers ALREADY exist (`overlay-definitions.json:168-276`, `overlay-bridge.ts:30-54`).
4. **Swallowed-error anti-pattern** (`director-agent.ts:876`, `edl-executor.ts:1156`) hid bug #1. Add fail-loud-in-dev (R18N).

## B. "PROVEN" WAS OVERSTATED (honesty fix)
- The proof proves **scoring given PERFECT extraction**. It NEVER calls `selectWinners` → **multiplicity (subsumption/defer/temporal) is console.log fiction, not code.** Subsumption has no composer. Extraction (the dangerous half) is unbuilt. §8 corrected: selection SCORING proven; multiplicity + extraction NOT.
- **T1 false-stat (0.24 on "2 cats and 3 dogs") is OPEN, not fixed** — `claim_strength` lives in prose; the proto gates stat only on `has_number`; `structural-gate.ts` has no claim-quality check.

## C. THREE MISSING LAYERS (all four circled these)
1. **WARRANT ≠ affordance** (Editor+Director+CEO). Structure-present ≠ graphic-worthy. Damage-9 cases that PASS affordance + must FAIL warrant: *"broke to a million"* (before/after on a rhetorical flourish), *"first you feel scared, second you doubt…"* (timeline on an emotional list), *"20 bucks, 3 hours, and my sanity"* (bar chart — can't chart sanity), *"twenty-ish percent"* (stat on a hedge). → a **separate hard warrant gate**: claim_strength + content-register (data-claim vs emotional/rhetorical) + **scarcity/COST** (a graphic must PAY for the attention it steals; budget + refractory + escalation-reserve). Restraint = start from ZERO and earn each slot, not "nothing scored >0.2."
2. **TIMING / PLACEMENT** (Editor 2/10, Director). ~0% of the plan, ~50% of the craft: **word-anchored entry** (the "300%" hits on the spoken word), **caption-collision map** (the #1 amateur tell — graphic vs burned caption fighting for the lower third), **exit-by-end-of-clause**, **min-gap rhythm** (cap is simultaneity not rhythm). A peer phase to selection.
3. **THE WHOLE-FILM layer** (Director 3/10 on arc + motion). Per-moment scoring is arc-blind + locally-optimal ≠ authored. Need: **arc model** (setup/build/turn/payoff scales intensity → climax biggest *because* it's the climax; withhold in act-1 to have somewhere to go), **graphic budget** (≈2-4 per 60s social), **through-line** (cap form-vocabulary per video + reuse; colour as a **trajectory** — the Pixar script the doc names but never builds; **inter-graphic morph** instead of hard-cut-to-black = the #1 "generated" tell), and **choreography-to-MEANING** (today motion = `i*scaledStagger` + static `ROLE_ENTER_ORDER` — replace with directed beats: reveal-then-punch / build-and-hold / drive-to-payload, key element's hit-frame bound to the motivating VO word, not a role table).
4. **OVERRIDE first-class** (Editor 2/10): suppress / swap / never-rule (per brand kit too), **immediate** in the cut + **then** a training signal. Editors turn off tools they can't instantly fix.

## D. SEQUENCING (CEO + Eng — demo-first, de-risk)
- **Lead with the comparison composer rendered as MOTION on a real brand, fed by MANUAL/deterministic structure tags** — the "holy shit, not text" demo. Depends on nothing broken/unverified. Move it from P5 to FIRST.
- **Extraction OFF the demo critical path** (CEO #5). Add a **coverage metric** (of N moments that SHOULD have a non-text graphic, how many did we produce?) — guards the silent "extraction too shy → still bare" failure, not just false-positives.
- **Variable fonts (P2) = RETHINK** (Eng #4): `@remotion/google-fonts` loads STATIC per-weight; current families lack wdth/slnt axes. v0 = static-instance weight/italic from the dial (the proven path). Spike variable fonts separately with a real Lambda render; don't gate v0 on it.
- **High-FLOOR before calibration** (CEO #4, the D-017 unresolved tension): zero users → no calibration data → naked-generative loses the eye-test to a competitor's polished presets for 1-2 quarters. Fix = hand-tuned **default dial-configs** the signals modulate *around* (still generative, not naked). Decouple "generative" from "naked."
- **Extraction eval harness FIRST** (Editor+Eng): a Rule-29 messy-transcript corpus (sarcasm, hedges, retakes, idioms, emotional lists, vague numbers) ground-truthed to {form | NOTHING}, FP-rate per content-type. **One damage-8 FP per type = spine wrong, not thresholds.** Build before wiring extraction.

## E. REVISED PHASE ORDER (v4)
**Track A (visible, low-risk, the v0 demo — ships in days):** A1 comparison composer (manual-tag-fed, render-verified as MOTION) → A2 expression/colour dials (weight done; add italic/underline/highlight; colour sat/bright/temp) + **default dial-config FLOOR** → A3 footage-aware legibility gate (Phase E enforce, the trust floor). *No extraction, no variable fonts.*
**Track B (the brain, de-risked, parallel/after):** B1 fix bugs A.1-A.4 + de-dupe the two graphic producers → B2 extraction eval harness (the corpus + FP/coverage metrics) → B3 **WARRANT gate** (register + claim_strength + budget/scarcity) → B4 wire selection+extraction behind a flag → B5 calibration + Graphiti.
**Track C (the craft, makes it "directed"):** C1 TIMING/PLACEMENT (word-anchor + caption-collision + exit + rhythm) → C2 choreography-to-meaning (directed beats) → C3 whole-film (arc + budget + through-line + inter-graphic morph) → C4 OVERRIDE first-class.
**Variable fonts:** separate spike, not on any critical path.

## F. MISSING METRICS / ARTIFACTS (add)
- FP-rate per form per content-type (precision) + **coverage** + a **perceptual** win-condition ("a marketer says *that looks expensive*", not just "forms vary") + **cost/latency budget** per rendered graphic. Named **design-partner** + a commercial "it's working" trigger (2 of 3 agencies say "I'd ship/pay").

**Net:** keep the architecture; fix the verified bugs first; lead with the comparison demo (manual-fed); add the three missing layers (warrant, timing, whole-film) + override as first-class; demote variable fonts; build the extraction eval before trusting extraction; fund a high default-look floor for the pre-calibration window.
