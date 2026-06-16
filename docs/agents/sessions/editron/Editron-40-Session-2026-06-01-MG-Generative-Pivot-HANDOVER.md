# SESSION HANDOVER — 2026-06-01 — MG Generative Pivot (presets → everything-emergent-from-signals)

> **Canonical handover. Read this FIRST next session.** This is the arc where the MG system's north star got nailed: *every visual choice is scored from signals, nothing hand-frozen, so the engine can compose ANY motion graphic, not just the ones we pre-wrote.* Everything below is verified against code (git, grep, real renders) this session. #open

---

## 0. TL;DR — the 8 things, if you read nothing else
1. **The ONE idea: LAW vs TASTE.** A thing is a preset if it freezes a *taste* (one of several valid looks). It is NOT a preset if it encodes a *fact/law* (true for all inputs, picks no aesthetics). "Hardcoded = preset" is incoherent (text/shape/curves are all hardcoded). **The test for every line: is this a FACT to keep, or a frozen CHOICE to make scored?** This is the lens that ends the circular "is it a preset" fights. Apply it everywhere.
2. **The architecture, settled:** content gives **FACTS** (what elements, how they relate). Signals **SCORE every CHOICE** (which form, layout, placement, emphasis, connector, size, colour, motion) through the existing utility-scorer, exactly like zoom/transition already work. The engine **ASSEMBLES** from primitives. Composers stop saying "vertical, gold, arrow" and say "two roles in contrast" — the engine scores the rest.
3. **Shipped + pushed (4 commits this session):** `e46569d2` Phase 0.1 fonts, `cca42eb1` Phase E gate (observe), `d2ad8729` font_weight dial wired, `717a499f` comparison form + **signal-scored layout** (the first composition decision made emergent — same content, different signals → horizontal vs vertical, render-proven).
4. **The 5% problem (verified):** the render engine is ~40-60% of pro craft and largely complete; realized output is ~5% (text-on-a-card). Root cause is **upstream**, not the renderer: the content funnel strips graphics to `{text}`, the signal dials exist but key ones were dormant, the form-selection editorial knowledge is codified in the graph but **unwired**, composers for comparison/timeline/chart were missing, and there's **no content-structure extraction**.
5. **The live form-selection path is BROKEN (verified, must fix first):** `director-agent.ts:857` calls `selectWinners(results, frame)` with **2 args** (needs 3) → throws → swallowed by the catch at `:876` → silently "skipped". And `:872` **discards** the scorer's graphic winners anyway. So "wire form selection" is really "fix a broken, swallowed path + de-dupe two graphic producers."
6. **4-lens review (CEO/eng/director/editor) = unanimous REVISE.** Architecture sound. Three whole layers missing: **WARRANT** (is this moment worth a graphic — separate from "is it possible"), **TIMING/PLACEMENT** (word-anchor, caption-collision, exit, rhythm — ~50% of the craft, ~0% of the plan), and **THE WHOLE-FILM layer** (arc, graphic budget, through-line, choreography-bound-to-meaning, inter-graphic morph). Plus **OVERRIDE** as first-class. Full v4 in [[MG-Master-Plan-v3]].
7. **Founder decisions locked:** (a) **no presets, everything emergent** — the north star; (b) **don't font-match from a library** — fonts are signal-driven attributes/variable-axes, family is brand-bounded; (c) **calibration is the answer** to "uncalibrated looks worse than a competitor's presets" — the reference-video calibration pipeline needs no users; deferred until infra is sorted (curve params ship INVENTED for now); (d) extraction is the frontier + the real risk.
8. **The honest state:** layout/arrangement is now genuinely emergent (proven). Position, structural-moves, and most type dials were already scored. **Still frozen (the to-do):** size-ratios, colour-role assignment, connector-type, split-arrangement, font-family, and the whole form-SELECTION (designed + proven on a proto, NOT wired, and the live path is broken). Curve params all INVENTED. See §5 frozen-list.

---

## 1. THE ONE IDEA (internalize this or you'll rebuild presets) — LAW vs TASTE
The founder spent the session catching me building presets dressed as generative code. The resolution, verified by an independent adversarial review:

- **A LAW** is content-invariant + domain-true + picks *nothing* aesthetic. Examples: "a comparison needs two comparable values" (an affordance — a *fact* about content); "bigger reads as more important" (perception); "body copy < 36px is unreadable at 1080p" (perception). **Keep these, no matter how hardcoded. They are the physics.**
- **A TASTE** is a frozen choice among aesthetically-valid alternatives. Examples: "stack it vertically"; "the after is gold and big"; "use a ↓ arrow"; "label = 0.3× the value"; "this exact curve param." Each could have been different. **These are presets, even written as code. Make them SCORED.**
- **The test:** for every visual decision, ask *fact or choice?* Facts stay. Choices become scored overlays the engine picks from the video's signals.
- **Why "hardcoded = preset" is wrong:** infinite regress — `text`/`shape`/`evaluateCurve`/the lerp/the signal extractors are all hardcoded. If hardcoded means preset, the whole substrate is a preset and the word is meaningless. The line is fact-vs-taste, not hardcoded-vs-computed.
- **What genuinely-not-a-preset requires:** the *structure/layout* must be scored, not just the *look*. The look (size/colour) being signal/brand-driven is necessary but NOT sufficient — `composeComparison` had signal-driven paint on a frozen skeleton, and that's still a preset. The arrangement/placement/emphasis must *also* emerge.

This is the lens for the whole roadmap: **every frozen choice → a scored overlay.** That is the path to "handle any MG we meet."

---

## 2. Git state + commits (this session, all on `infrastructure-improvs-+Editron`, pushed to `origin`)
```
717a499f feat(editron): MG comparison form + signal-scored layout (first emergent composition)
d2ad8729 feat(editron): wire dormant MG font_weight dial — boldness from the curve, not the lerp
cca42eb1 feat(editron): MG design gate — observe-mode font-floor + focal-hierarchy checks (Phase E)
e46569d2 fix(editron): wire MG font loading in render path (Phase 0.1)
```
Branch IN SYNC with origin. **Git rules (hard):** push to `origin` (Insturix/Front-End) ONLY, NEVER `haunting`. `infrastructure-improvs-+Editron` = the Vercel **preview** branch (prod = main via dashboard). NEVER `git add -A` / `git add scripts/` — the scripts hold a Mongo URI; stage real source by explicit path. (Earlier this arc: `404a8e38` G-1, `d9fe9485` G-2, `42a01786` G-1b.)

---

## 3. How to SEE output (the verify harness — these are your eyes; ALL UNTRACKED in `scripts/`)
The 112-test suite **injects mgScores and masks render bugs** — never trust it. Verify on REAL renders.
- **`scripts/dump-proj-mgs.ts <projId>`** → pulls a real project's MG decisions → `.calibration-temp/<id>-mgs.json`.
- **`scripts/build-comparison-mg.ts`** → builds comparison MGs through the REAL `planComposition` (+ scores the arrangement overlays) → `.calibration-temp/comparison-mgs.json`. The emergent-layout proof driver.
- **`scripts/render-mg-stills.ts <set>`** → bundles + renders one PNG per MG to `.calibration-temp/mg-stills/<set>/`. **Read the PNGs inline to SEE the design.** Webpack gotcha: the `@/` alias is mapped in `webpackOverride` (`'@': path.resolve(cwd)`) + `@remotion/compositor-*` disabled. Keep it.
- **`scripts/render-mg-motion.ts <set> [limit]`** → renders animated GIFs (motion is the product; stills are blind to it).
- **`scripts/eval-mg-gate.ts`** → runs the Phase-E gate over dumped recipes (would-suppress sweep + a self-test that proves each check fires).
- **`scripts/form-selection-proto.ts`** → the form-selection proof (scored emergence, EASY 4/4 + TOUGH 7/8, runnable).
- **DECOY: `scripts/render-mg-real.ts`** — do NOT use (2-arg buildTextStyle, old broken output).
- PNGs live in `.calibration-temp/mg-stills/` and `.calibration-temp/mg-motion/`.

---

## 4. Architecture — how MG works NOW (verified)
**Pipeline:** Director (4 brains: Path E creative-brief / Path D signal-scorer / Unified 3-layer / Reactive) → all sink into `executeEDL` (`edl-executor.ts`) → for `useCompositionEngine` (the default), `resolveMotionTokens` → score `mg-property` overlays into `mgScores` (edl-executor ~1133) → `planComposition(content, tokens, signals, mgScores)` → `structural-gate` (observe-only @ :1169) → push `motion-graphic` overlay with `recipe`+`resolvedTokens`+`contentSignals` → Remotion render (`MotionGraphicLayerContent`).

**Inside `planComposition` (the engine — `composition-planner.ts`):**
1. `analyzeContentShape(content)` duck-types content → a `ContentShape` (numeric/identity/quotation/emphasis/data-series/brand/structured/**comparison**[new]/free-text). The shape = the FACT.
2. `composeElements` switch → a `composeX(...)` per shape → pushes `RecipeElement[]` with roles + `bind` (token/content refs).
3. **Scored choices applied:** `mgVal(mgScores, 'mg.typography.font_size', …)` for size; `mgWinner(mgScores, 'mg.structure.')` for structural moves; `mgWinner(mgScores, 'mg.arrangement.')` → **layout direction [new this session]**; `mgVal(…, 'mg.layout.center_avoidance')` → position (was already scored); `mgWinner(…, 'mg.animation.entrance_')` → entrance.
4. Returns a `Recipe` (elements + layout + exitStyle). The renderer resolves `token:`/`content:` bindings + lays out per `layout.position` and `layout.arrangement`.

**Key: the scorer (`lib/editron/engine/utility-scorer.ts`) is the one mechanism.** Each overlay: `considerations: [{signalId, curveType, params, invert}]` → `evaluateCurve` → score; `outputParams` → `min + score*(max-min)`. `scoreAllOverlays` filters by `minScore` + sorts; `selectWinners` picks one-per-category. **This same mechanism drives zoom/transition/filter AND the MG dials AND structural moves AND (new) arrangement.** Extending it to a new choice = adding overlays + reading the winner. No new engine.

---

## 5. What's EMERGENT vs STILL-FROZEN (the inventory = the to-do list)
**Emergent (scored from signals, the FACT/mechanism is right; params are calibration-pending):**
- Which layout direction (horizontal vs vertical) — `mg.arrangement.*` [NEW this session].
- Position (center → corner) — `mg.layout.center_avoidance` (pre-existing).
- Structural moves (accent-line vs underline vs backdrop…) — `mg.structure.*` (top-K compete, pre-existing).
- Type size / line-height / tracking / case — `mg.typography.*` dials (pre-existing).
- **Font weight** — `mg.typography.font_weight` [WIRED this session; was dormant, lerp was winning].
- Entrance/hold animation — `mg.animation.*`. Particles/masks — `mg.particle.*`/`mg.mask.*` (budget-gated).

**STILL FROZEN = still presets = the work (apply the LAW/TASTE move to each):**
1. **Size RATIOS** in composers (e.g. comparison `fromSize = valueSize*0.5`, `labelSize*0.3`) → should be a scored **emphasis dial**, not fixed ratios. *Highest-leverage next.*
2. **Colour→role assignment** (comparison hardcodes "to gets accent, from gets textSecondary") → scored/derived (which element earns emphasis is a choice).
3. **Connector TYPE** (arrow/divider/gap/none) — currently glyph follows arrangement but the *kind* is fixed.
4. **Split arrangement** — only horizontal/vertical exist; add `mg.arrangement.split` (side-by-side diptych) for true versus.
5. **Font FAMILY** — a fixed string (DEFAULT_BRAND). The non-preset path = variable-font AXES driven by signals (`fontVariationSettings`); family brand-bounded. **Blocker:** `@remotion/google-fonts` loads STATIC per-weight instances; variable axes need a different load path + axis-bearing fonts (current families lack wdth/slnt). This is a RETHINK/spike, not a quick wire (eng review #4).
6. **The dial CURVE PARAMS** — every `params` and ratio is `⚠️ INVENTED`. Not laws yet; calibration converts them. Deferred (founder: do it once infra sorted, via the reference-video pipeline).
7. **The form-SELECTION (which MG)** — designed + proven on the proto, but NOT wired, and the live path is broken (§8). This is the big one.

---

## 6. The capability gap + form-selection + the extraction frontier
**[[MG-Capability-Map]]:** 22 pro MG forms. DOES = 3 (keyword-highlight, stat, lower-third — all textual). DORMANT = 8 (engine-ready, content-starved: quote, logo-image, avatar, bar/ring/sparkline, callout [LLM told "do NOT use"], broadcast-package). MISSING = 9+ (comparison [now partly built], timeline, gauge/dial, progress, infographic, title/end-card, device-frame, multi-step, graphic-transition). 15/20 high-production forms are **parametric (buildable now, no assets)**; the iman-Gadzhi dial/counter/kinetic spine is in reach. Asset-tier (icons/star/devices) = Phase G. Character/3D/illustration = frontier.

**[[MG-Form-Selection-Architecture]] (the "which MG" answer, proven not wired):** a form is never picked — it EMERGES from a score with a **two-part consideration**: **AFFORDANCE** (a hard gate — the content has the structure the form needs; from the LLM as a *language* structure-reader) × **FIT** (signal curves — does the moment suit it). The scorer picks; can lose; can be NOTHING. **Convergence = cardinality + structure:** 1 value→stat, 1+range→gauge, 2 states→comparison, ≥3 series→bar, ≥20/time→line, ordered→timeline, salient-line→pull-quote/kinetic, boundary→title/end. **The graph already encodes the triggers** (`Mapping→Technique`: `entity.quantitative_claim→stat_counter`, `entity.name→lower_third`…) — codified, just unwired + the source entity signals are `NEEDS_CODE`.

**The universal anti-garbage rule (Rule 29 baked in):** a form is licensed ONLY if the content *genuinely* has its structure. The #1 damage = "implied relationship that isn't there" (a chart on coincidental numbers, a comparison of unrelated things). **Proven:** the proto gated false structure dead (idiom "night and day" → no comparison) — BUT only because extraction set the flags. **The selection model is sound; EXTRACTION is the frontier and the real risk.** A wrong `is_comparison` on a rhetorical flourish fires a false comparison. T1 gap: a stat still fired on "2 cats and 3 dogs" (0.24) — needs a `claim_strength`/register gate, not just `has_number`.

**Extraction = the LLM as a content-STRUCTURE reader** (cardinality/ordering/boundedness/comparison/salience + entities), feeding the form signals. It NEVER picks the form (Rule 30). Build with a Rule-35 eval harness + a messy-transcript adversarial corpus FIRST (sarcasm/hedges/retakes/idioms/emotional-lists/vague-numbers), FP-rate per content-type, one damage-8 = spine wrong.

---

## 7. The 4-lens review verdict (CEO / eng / director / editor) — all REVISE
Full record in [[MG-Master-Plan-v3]] "REVIEW VERDICT → v4 REVISIONS". Convergent:
- **CEO:** "shipping a religion, not a demo." Buyer feels range+on-brand+broadcast, not "no presets." Lead with the comparison demo (done). Take extraction + variable-fonts OFF the v0 critical path. The moat has a 2-quarter hole (uncalibrated loses the eye-test) → answer = calibration (founder agreed).
- **Eng:** found the real bugs (§8). The proof tests *scoring, not multiplicity* (subsumption/defer = console.log, not code). P3 is "fix + de-dupe," not greenfield (the graphic overlays + affordance resolvers already exist in `overlay-definitions.json:168-276` + `overlay-bridge.ts:30-54`). Variable fonts = RETHINK.
- **Director:** "form emerges from structure" is grammar, not direction — answers WHICH, never WHY. Motion is `i*stagger` + a static role table; no "pause after the punchline," no arc, no through-line. 20 local-optimal scores ≠ one authored hand. "Forms vary by content" is a *warning*, not success.
- **Editor:** "proven" is dishonest — every field misfire comes from the *detector*, which the proof hand-feeds. The cardinality spine invites subtle damage-9 FPs ("broke to a million"→before/after, "first you feel scared…"→timeline, "20 bucks, 3 hours, my sanity"→bar chart). Timing/placement + override are missing and are table stakes.

**The 3 missing layers (now first-class in v4):** (1) **WARRANT** ≠ affordance — register (data vs rhetorical/emotional) + claim_strength + scarcity/budget; restraint = start from zero, earn each slot. (2) **TIMING/PLACEMENT** — word-anchored entry, caption-collision map, exit-by-clause, min-gap rhythm. (3) **WHOLE-FILM** — arc (climax biggest *because* it's the climax), graphic budget, through-line (cap vocabulary + reuse, colour as a trajectory, morph between graphics), choreography-bound-to-meaning. Plus **OVERRIDE** (suppress/swap/never, immediate + learning).

---

## 8. OPEN BUGS (verified — fix before trusting the form path)
1. **`director-agent.ts:857` — `selectWinners(results, frame)` is a 2-arg call; signature needs 3** (`results, recentDecisions: Map, currentFrame`). `.get()` throws on a number → swallowed by catch `:876` → "skipped." **The live utility graphic-selection path is DEAD and the error is hidden.** `[ME-verified]`
2. **`director-agent.ts:872` discards the scorer's graphic winners** (keeps signal-executor graphics + utility non-graphics). So even fixing #1, graphics from the scorer are thrown away. `[ME-verified]`
3. **Swallowed-error anti-pattern** (`director-agent.ts:876`, `edl-executor.ts:1156`) hid bug #1. Add fail-loud-in-dev (R18N) or the next bug hides the same way.
4. **T1 false-stat:** stat fires on coincidental numbers ("2 cats and 3 dogs" → 0.24, above minScore). Needs a `claim_strength`/register gate; the fix lives in prose, not code yet.
5. **3 P0 bugs (spawned as background tasks this session, non-MG):** unguarded `JSON.parse` ×6 in `five-track-analysis.ts` (kills the whole analysis on a malformed Gemini response); `getCleanImageUrl` strips the GCS signed-URL token (`video-generation-service.ts:89` → fal gets a dead URL → silent garbage video); `Promise.race` doesn't cancel `fal.subscribe` + no circuit breaker (orphaned jobs at scale).
6. **Caption 48-vs-72:** the graph self-contradicts (`caption.min_font_size`=48 vs `typography.captions_min_font`=72, with an edge falsely claiming "same value"). Decision: caption=48 (BBC/FB), graphic=72/per-role. Fix in `creative-graph-parts/part-6-constants` + re-merge. NOT enforced live anyway (the enforcer is dead — next item).
7. **Dead code:** `aesthetic-gate.ts` = truly dead (safe delete). `crg-constraint-validator.ts` = production-dead BUT imported by `scripts/verify-composition-engine.ts:135,149` — **do NOT blind-delete**; its `applyCorrections` is the blueprint for the Phase-E enforce flip.

---

## 9. Doc-vs-code corrections (don't re-derive — full record [[Doc-vs-Code-Reconciliation-2026-05-31]])
- Creative graph = **671 nodes / 533 edges** (NOT "799" — MEMORY.md stale). 49 Signal nodes (+9 ContentSignal); "47/35" imprecise.
- The 40 `mg.*` dials EXIST and most are wired; `font_weight` was the dormant one (now fixed). `cinematic_moment` IS computed (the "absent on real data" was an ingest gap, not code).
- **D-016 profiles "removed" = PARTIAL** (director-agent still reads 6 profile fields; Phase 3B deferred). **D-017 menu still live** (unified-edit-intelligence.ts:420 enum + prose default) BUT `GraphicIntentSchema.kind` is already wired (extraction half partly done). `useCompositionEngine:true` is the DEFAULT; the LLM `kind` hint is IGNORED at the engine (type genuinely emerges).
- 108 INVENTED thresholds (not 77/86). Mode 3 (hybrid) doesn't exist in code. `signalsAtFrame` = Path E not Path D. keyword-highlight default = edl-executor.ts:1051 (+ a 2nd injection at :492). Brand stamp = edl-executor.ts:253-274.

---

## 10. The plan + phases + WHAT NEXT (v4, in [[MG-Master-Plan-v3]])
Three tracks (each phase ≤5 files, render-verified on MOTION):
- **Track A (visible / demo, low-risk):** comparison composer [DONE] → expression dials (weight done; add italic/underline/highlight; colour sat/bright/temp) → footage-aware legibility gate.
- **Track B (the brain, de-risked):** **fix bugs §8.1-8.3 + de-dupe the two graphic producers** [FIRST] → extraction eval harness (the corpus + FP/coverage metrics) → WARRANT gate → wire selection+extraction (flagged) → calibration.
- **Track C (the craft):** TIMING/PLACEMENT → choreography-to-meaning → whole-film (arc/budget/through-line/morph) → OVERRIDE first-class.

**Immediate next (my recommendation), in order:**
1. **Keep going down the frozen-list (§5):** emphasis-as-a-dial (kills the size-ratio preset) → colour-role scored → split arrangement. Same proven pattern, all visible, all low-risk. *This is the "everything emergent" march the founder wants.*
2. **Then fix the broken form-selection path (§8.1-8.3)** before any extraction work — the path you'd build on is dead.
3. **Then the extraction eval harness** (Rule 35) before wiring extraction — the frontier + the risk.
Calibration runs once infra is sorted (founder). Variable fonts = separate spike (don't block on it).

---

## 11. Techniques & learnings (the meta — what makes work here smooth)
- **LAW vs TASTE** is the test for "is it a preset" (§1). Use it on every line. It ends the circular fights.
- **Everything-emergent move:** to kill a preset, make the frozen CHOICE a scored overlay (`mg.X.*` with considerations) + read the winner via `mgWinner`/`mgVal`. The engine already does it for zoom/structure/position/arrangement. Adding a choice ≈ 4 files (overlay-def + planner read + renderer honor + verify), no new engine.
- **I kept building presets in disguise** (composeComparison's frozen skeleton). The founder caught it 3×. The defense: the LAW/TASTE test + an **adversarial fresh-eyes review** (a subagent with no investment in the claim destroyed my "it's generative" rationalization in one pass — do this for any "is this good/right" question).
- **Verify on REAL renders** (the harness PNGs/GIFs), never the 112-suite (injects scores, masks render bugs). Read the PNG inline to actually SEE it.
- **Calibration is the answer to "uncalibrated looks worse than presets"** — the reference-video pipeline needs no users. So you can ship the scored *mechanism* with INVENTED params now and calibrate later, and it's still not a preset (mechanism = law, params = pending). This unblocks shipping generative-but-uncalibrated.
- **The swallowed-error anti-pattern** hid a real, total bug (selectWinners arity, dead for who-knows-how-long). When a try/catch logs "skipped/non-fatal," distrust it — fail loud in dev.
- **8-agent verification sweep** corrected ~16 stale doc claims in one pass (graph edges, dormant dials, partial profiles, line drifts). When inheriting a system, swarm-verify the docs against code before trusting them.
- **Git footguns:** never `git add -A`/`scripts/` (Mongo URI); `origin` only never `haunting`; preview branch is `infrastructure-improvs-+Editron`.
- **U+00A0 nbsp** in source breaks exact-match Edits. `render-mg-real.ts` is a decoy. Remotion bundler needs the `@/` alias mapped.

---

## 12. Research done this session (don't re-search — see the 3-agent + adversary outputs in the transcript)
- **Editorial trigger research (web + the graph):** the cardinality/structure → form model (§6), grounded in eazyBI/Observable/Flourish chart-selection + BBC/Vimeo lower-thirds + kinetic-typography craft. The universal misfire = "implied structure that isn't there."
- **Parametric vs asset spectrum (the iman question):** 15/20 forms parametric (buildable now); the dial/gauge/counter/kinetic spine is in reach; 5 need an asset resolver (Phase G); 4 are frontier. Highest-value parametric next: glassmorphism (backdrop-blur already in `buildShapeStyle:418`), true dial (extend `PercentageRing`), progress meter, multi-ring, bar-chart-race, circle-this annotation. Cheapest crossover: one authored star path → the 5-star family.
- **Colour engine (prior arc, still valid):** mood via saturation/brightness/temperature (NOT hue); hue = brand (sovereign) + semantic (fixed); palette OKLCH-derived from the brand hex. [[MG-Colour-Engine]].
- The graph's `Mapping→Technique` triggers = half-built editorial knowledge (use it, don't reinvent).

---

## 13. Footguns (consolidated)
- NEVER `git add -A` / `git add scripts/` (Mongo URI). `origin` only, never `haunting`.
- The 112-test suite masks render bugs — verify on real renders.
- `render-mg-real.ts` is a decoy; use `render-mg-stills.ts`.
- The live form-selection path is BROKEN + swallows its error (§8) — don't build on it until fixed.
- `crg-constraint-validator.ts` is prod-dead but test-referenced — don't blind-delete.
- Every curve param / ratio is INVENTED (calibration-pending) — don't treat them as tuned.
- Variable-font axes need a NEW load path (the google-fonts loader is static-per-weight) — don't assume it's a quick wire.
- Don't claim "generative" when only the *look* varies and the *structure* is frozen — that's still a preset (the founder will catch it; use the LAW/TASTE test).

---

## 14. Doc index (everything written this arc; read order for next session)
**Read first:** this handover → [[MG-Master-Plan-v3]] (the plan + v4 review) → [[MG-Form-Selection-Architecture]] → [[MG-Capability-Map]].
**Reference:** [[Doc-vs-Code-Reconciliation-2026-05-31]] (don't re-derive stale facts), [[MG-Colour-Engine]], [[MG-Material-Libraries]], [[D-017-MG-Dissolve-Type-Preset-Menu]].
**Session notes:** [[Session-2026-05-31-Phase0.1-Fonts-Render-Verified]], [[Session-2026-05-31-PhaseE-Gate-Observe]].
**Memory mirrors:** `session_phase0_1_fonts.md`, `codebase_verified_corrections.md`, `feedback_git_remote_origin_only.md`, `commit_history_audit_2026_05_31.md`, and the mirror of this handover.

---

## 15. What I (next-me) should have had at session START (so it's smooth)
Reading the chat back, the third of the session I wasted building presets would've been saved by having these up front. Put them in front of the next session:
1. **The north star, one line:** "Every MG visual choice is scored from signals — no presets, nothing hand-frozen — so the engine composes ANY motion graphic. Content gives facts; signals score choices." (+ the corollaries: don't font-match from a library; calibration is the answer and is deferred; extraction is the frontier.)
2. **The LAW vs TASTE test** (§1) — this is the thing that stops you rebuilding presets. Without it you WILL dress a template as generative and the founder will (rightly) reject it.
3. **The verified-bugs list (§8)** — especially that the live form-selection path is dead+swallowed. Don't build on it.
4. **The capability map in one line:** engine ~40-60% built, output ~5%, starvation is UPSTREAM (funnel + dormant dials + unwired selection + missing composers + no extraction) — so don't "fix the renderer."
5. **The harness how-to (§3)** — how to actually SEE output, and that the 112-suite lies.
6. **The frozen-list (§5)** as the literal to-do — each item is "make this scored," same pattern.
7. **The git/footgun rules (§13)** — so the first commit doesn't leak a Mongo URI or hit the wrong remote.
8. **The founder's working style:** will catch every preset; wants the *mechanism* right over a pretty demo; "do it right (emergent) over fast (skeleton)"; values brutal honesty over polish; calibration is fine to defer; reviews from CEO/eng/director/editor lenses are wanted on big plans.

See [[MG-Master-Plan-v3]], [[MG-Form-Selection-Architecture]], [[MG-Capability-Map]], [[Doc-vs-Code-Reconciliation-2026-05-31]], [[D-017-MG-Dissolve-Type-Preset-Menu]].
