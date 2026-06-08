# Sprint Handover — Motion Graphics Tier 3 (signal-driven, no presets)
**Date:** 2026-05-30 · **Branch:** `infrastructure-improvs-+Editron` (deploy branch) · **Worktree:** `D:\google downloads\Front-End-main\editron-worktree\`
**Model:** Claude Opus 4.8 (1M) · **Companion vault doc:** `D:\Insturix-Brain\02-Architecture\MG-Anchor-System-Tier3.md`

---

## 0. How to use this doc (30-second orientation)
You are picking up a sprint that lifted Motion Graphics from **Tier 2** (fixed skeletons / preset routing) to **Tier 3** (structure *emerges* from a signal-selected vocabulary). If you read nothing else, read **§1 (what + why)**, **§11 (the process lesson — it will save you)**, and **§12/§13 (what's verified vs what to do next)**. Then skim **§5 (as-built, with file:line)** when you touch code. The single most important fact: **the work is verified at unit + render-harness level, NOT yet in a full real-project render — that is your #1 job (§13).**

The user's design spec for THIS doc: *"think like a high-level CEO and senior dev … what would you feel would help you if you had this info at the beginning of the session so everything was smooth."* So this is written to be the thing the next Claude wishes it had at minute one.

---

## 1. Executive summary (CEO lens)

**What shipped:** 8 commits that rebuilt how MGs are composed. Removed the preset router (`kindMap`), made content duck-typed into a shape, built a 10-move structural vocabulary selected by signal scores, added a `group` sub-composition primitive, fixed an over-decoration bug with rank-and-cap selection, wired (dormant) brand avatar/logo consumers, added energy-driven caps and signal-gated gradient text, and hardened `.gitignore` against staging secrets. Tests grew **168 → 184**. Core arc: **8 commits, 14 unique files, +1,140 / −282** (git-verified).

**Why it matters (the moat):** Every competitor that does "AI motion graphics" ships a template library — N named components, M named rigs. That does not scale and it boxes the user into someone else's taste. Insturix's bet is the opposite: **bounded primitives + unbounded signal-driven combinations.** A formal news clip and a casual vlog moment get structurally different graphics from the *same* code because the *signals* differ, not because someone wrote a `NewsLowerThird.tsx`. This sprint is the architecture that makes that real. It is the operational form of the project's own Rule 11 ("Motion Graphics is a full domain — think SYSTEM not COMPONENT") and Rule 29N (universal content coverage through signals, not presets).

**Ship-state (honest):** **DONE_WITH_CONCERNS.** The architecture is sound and unit-verified; the gradient render is confirmed in headless Chromium. But it has **not** been run end-to-end on a real project (Path D → signal-executor → planner → Remotion render → eyeball the video). Do not tell anyone "MG Tier 3 is operational" until that run exists and its logs confirm it (Rule 34). Risk if shipped blind: the rank-and-cap calibration looks right in the real-scorer sweep, but real content has signal noise the sweep didn't model.

---

## 2. The mission — what "no presets" means (the thesis the user enforced all session)
The user repeated this ~8 times. Internalize it before you touch MG code, or you will build the wrong thing:
- *"there exist no preset MG types itself."*
- *"i dont want templates or presets … how many presets can we even make, its not scalable … you cant put everyone's needs in a box, its creativity, unbounded — hence the whole signals infra."*
- Quality bar: *"dont rush" + "follow all rules"* (said repeatedly). No MVPs. Verify with real data, not claims.

**Operationalized:** shape is inferred from content structure (duck-typing), not chosen from a menu. Structural treatments are *selected* by overlay scores from a vocabulary, then capped. Choreography is *computed* from tokens (stagger × order × easing), never hardcoded frame numbers. If you catch yourself writing a file named after a graphic type (`LowerThird.tsx`) or an `if formality > 0.4` in the planner, **stop** — that's Tier 1/2 thinking.

---

## 3. The Tier model (shared vocabulary)
- **Tier 1 (Canva):** named components per graphic type. A template library. ❌
- **Tier 2 (where we were):** ~8 fixed skeletons with signal-driven *styling*. Structure still fixed. ⚠️
- **Tier 3 (where we are now):** structure *emerges* from a signal-selected vocabulary of structural moves, assembled via a deterministic anchor model. "Bounded primitives, unbounded combinations." ✅

---

## 4. Commit ledger (git-verified, newest → oldest)

> Core MG Tier 3 arc = 8 commits (2026-05-29 22:59 → 05-30 00:16). Three *precursor* commits (`cfcad619`, `72b5e67c`, `0925815d`) are a **prior** MG-polish session (~22h earlier, different co-author trailer) — adjacent, not part of this arc; listed at the end for context.

| Hash | Title | Files / lines | What & why |
|---|---|---|---|
| `25371c4d` | chore: gitignore hardening — never stage `.env.local.*` | `.gitignore` +2 | `.env.local.prod`/`.vercel` were untracked but **not** ignored (`.env*.local` matches `.env.<x>.local`, not `.env.local.<suffix>`). A stray `git add .` would have staged prod secrets. Verified via `git check-ignore`. |
| `4fbac832` | feat: gradient text fill — composable, signal-gated wordmark | 3 files +40/−2 | `buildTextStyle` gains `textGradient` → clips fill to glyphs (`background-clip:text`). `composeBrand` sets it ONLY for brand + real primary≠accent + delivery energy >0.6, from the brand's OWN tokens. Never text-split. Render-verified (gold→cream glyphs vs solid). |
| `b6ad3079` | feat: energy-responsive caps on emphasis keywords | 2 files +30 | `composeEmphasis` uppercases keyword when `max(enthusiasm, emotional_arousal) > 0.7`. Uses reliable personality signals, **not** flaky Wav2Vec speech-energy (often 0). |
| `51372761` | feat: wire avatar/logo image consumers (dormant) | 3 files +61/−3 | `composeIdentity` → circular 64px avatar; `composeBrand` → logo (h40, contain). `ImageElement` branches fixed-box(cover) vs contain. **Dormant** — no producer sets `content.avatar`/`logo` yet (Graphiti). Test asserts no image when keys absent. |
| `d804c4ff` | fix: number-sequence detection — connector-only gaps | 1 file +4/−1 | `between.some(connector)` → `.every`. Adversarial sweep found "woke up at 6 and left at 8" falsely consolidated (only "and" matched). Requiring ALL between-words be connectors kills false positives, keeps "10 compared to 20". |
| `2eab984b` | fix: rank-and-cap selection (fixes over-decoration) | 2 files +83/−65 | **The calibration fix.** Rewrote `runStructuralMoves` from per-move `if` gates → rank-and-cap: score candidates → dedupe conflict groups → top-K (K=budget≥5?3:≥4?2:1). Gate raised 0.3→0.45. Found by running the REAL scorer (unit tests inject scores and masked it). |
| `95a4046f` | feat: group primitive — completes 10-move vocabulary | 7 files +304/−1 | `group` sub-composition primitive (children positioned relative + animated as one unit). Adds 4 group moves (badge, brackets, corner-marks, annotation-callout) + 4 overlays. Built from rects/text/circle (no SVG). NOTE: its `if`-gate runner was replaced next-commit by rank-and-cap. |
| `83a1debc` | feat: signal-driven composition — content-inferred shapes + vocabulary | 13 files +616/−210 | **Foundational.** Deletes `buildShapeFromKind`+`kind` shortcut (duck-typing always runs) and `kindMap` from edl-executor. Adds anchor system + `structural-moves.ts` (first 6 moves) + 6 overlays. Rewrites budget position-based→importance-driven. Builds structured payloads in signal-executor. Reverts un-renderable chart decomposition back to `data-viz` primitive. |

**Precursors (prior session, context only):** `cfcad619` (MG quality — overlay-only hold patterns, supersedes some of `72b5e67c`), `72b5e67c` (open animation throttle at moderate signals + transition snap tolerance 45→90/120), `0925815d` (repo-wide: `console.warn` added to 63 silent catch blocks, Rule 11.75N — 34 files, unrelated to MG).

**Cross-commit threads to know:** (1) `runStructuralMoves` was rewritten mid-sprint — treat `2eab984b` as the authority, not `95a4046f`. (2) `signal-registry` number-sequence shipped buggy in `83a1debc`, fixed in `d804c4ff`. (3) avatar/logo (`51372761`) is intentionally dormant — not dead code. (4) Many thresholds are flagged `⚠️ INVENTED` in-code (see §18).

---

## 5. As-built architecture (senior-dev lens, file:line)

### 5.1 End-to-end data flow
```
Signal Timeline
  → signal-executor.ts: builds STRUCTURED PAYLOAD onto decision.params (duck-typing keys)
  → edl-executor.ts: scores mg-property overlays → mgScores{score,values}; calls planComposition(content, tokens, rawSignals, mgScores)
  → content-shape-analyzer.ts: detectShapes(content) ALWAYS runs (kind is vestigial) → ContentShape[]
  → composition-planner.ts: composeElements + runStructuralMoves + keyframes + textSplit + spatial → Recipe
  → motion-graphic-layer-content.tsx: reads PRE-COMPUTED recipe (does NOT re-plan), synthesizes per-frame SignalCurves from scalar snapshot
  → composition-renderer.tsx: resolve → choreograph → z-sort → render each PrimitiveElement (Remotion / headless Chromium)
```
- **Structured payload** (`signal-executor.ts:343-393`): `text`/`text_source` universal fallback; `entity.number` → `value`(+prefix/suffix/label) or, if chart-worthy, `values`+`labels`; `entity.name` → `name` (deduped via `seenEntityNames`).
- **`chartWorthy` gate** (`signal-executor.ts:360-363`): `parsed.length>=2 && maxN/minN>=1.5 && momentWeight>0.6 && formality>0.3` — all four required.
- **`kindMap`/`buildShapeFromKind`: CONFIRMED GONE** (grep across `lib/editron` = 0 matches). Duck-typing is the sole shape path. `_kind` param exists but is never read.

### 5.2 Primitives (`recipe-types.ts:5-17`)
`shape | text | image | video-clip | mask | container | decoration | data-viz | particle | gradient | pattern | group`. The `group` primitive (`:17`) = sub-composition. `ElementAnchor` (`:76-82`): 4 modes `flow | flow-span | block-fill | block-edge`, fields `side / thickness / inset`. `children?` + `anchor?` carry through to `ResolvedElement` (`:134-135`).

### 5.3 The 10 structural moves (`structural-moves.ts`) — the vocabulary
Each is a pure factory returning `RecipeElement[]`, binds colors/fonts to tokens, roles namespaced `sm-<move>`. Selected by `mg.structure.*` overlay scores.

| # | Move | line | emits / anchor | group? | fires when (signal affinity) |
|---|---|---|---|---|---|
| 1 | accent-line | 29 | decoration line, block-edge bottom 3px | no | formal, calm |
| 2 | side-bar | 41 | rect, block-edge left 5px | no | broadcast, authoritative |
| 3 | backdrop-card | 53 | container (pill if radius>12), block-fill inset −14, glass | no | busy scene (high visual_dependency) |
| 4 | divider | 73 | line, flow-span 1px, opacity 0.3 | no | multi-part content |
| 5 | underline | 85 | line, flow-span 5px | no | emphatic, energetic |
| 6 | kicker | 97 | text, uppercase, tracking 0.15em, flow | no | news/category, formal |
| 7 | badge | 117 | **group** 46×46: circle pill (block-fill) + centered number | yes | ranked / numbered |
| 8 | brackets | 139 | **group** block-fill inset −10: 6 rects `[ ]` | yes | editorial framing |
| 9 | corner-marks | 157 | **group** block-fill inset −8: 8 rects (4 L-marks) | yes | premium / broadcast |
| 10 | annotation-callout | 180 | **group** foreground: connector line + label | yes | high-impact rhetorical beat |

### 5.4 Anchor system (`primitive-renderers.ts:461-489`) — deterministic, Remotion-safe
- `flow` → normal flex child (array order positions it).
- `flow-span` (`:463`) → `alignSelf:stretch; width:100%; height:thickness`.
- `block-fill` (`:471`) → `position:absolute; inset:${inset}px`; if `layer==='background'` → `z-index:-1`.
- `block-edge` (`:480`) → absolute, pinned to `side` with `width/height = thickness`.
- **CONFIRMED: zero DOM measurement** — no `getBoundingClientRect`/`offsetWidth`/refs/`useEffect`. Positions are static CSS resolved against the content flex box (`resolveLayout` sets `position:absolute; display:flex; isolation:isolate` at `composition-renderer.tsx:695-703`). This is *why* it's Remotion-safe: frame N paints identically regardless of prior frames.

### 5.5 Complexity budget (`content-shape-analyzer.ts:154-191`) — importance-driven
```
if montage_mode > 0.5        → return 0        (hard suppressor)
if active_overlay_count >= 3 → return 0        (hard suppressor)
importance = max(cinematic_moment, visceral_impact, emotional_arousal*0.8, formality*0.7)
budget = 2 + round(min(1, importance) * 3)      // → 2..5
if pacing_velocity > 0.7     → budget = max(2, budget-1)
if visual_significance > 0.7 → budget = max(1, budget-2)
return clamp(budget, 1, 5)
```
Single source of truth — the old position-based ramp and the duplicate cinematic boost in the planner were removed (`composition-planner.ts:206-209`).

### 5.6 Rank-and-cap selection (`composition-planner.ts:743-814`) — the anti-clutter brain
- **Gate** (`:756`): `GATE = 0.45` (additive scores floor ~0.4, so 0.3 passed everything).
- **Candidates** (`:782-793`): 10, each `{id, minBudget, available, group?, emit}`. `available` predicates: `hasAccent` (accent≠primary), `hasSecondary`, `kickerText` (content.kicker||category), `badgeVal` (content.badge||rank), `annotText` (content.annotation).
- **Conflict groups** (`:801-808`): `h-rule` (accent-line vs underline), `frame` (brackets vs corner-marks) — only top scorer per group survives.
- **Sort** (`:796`): descending by overlay score.
- **Cap** (`:812`): `K = budget>=5?3 : budget>=4?2 : 1`. **The cap, not the gate, is the primary anti-clutter control** ("a director uses 1–3 treatments, never 6").

### 5.7 Consumer composers + their exact conditional gates (`composition-planner.ts`)
Dispatched by `primary.kind` (`:217-249`). CRG min-fonts at `:40-49` (STAT 64, LOWER_THIRD 48, TITLE 36, QUOTE 42; FORMALITY_HIGH 0.7, MEDIUM 0.4).
- `composeNumeric` (`:341`) — count-up; mono vs heading font by `formality>0.7`.
- `composeIdentity` (`:390`) — **avatar gate** `:405` `if(shape.avatar)` → image 64×64 r999 (dormant).
- `composeQuotation` (`:450`) — quote + author; no conditional feature.
- `composeEmphasis` (`:491`) — pill if `informal` (`:498`); **emphaticCaps** `:523` `max(enthusiasm,emotional_arousal)>0.7` → uppercase.
- `composeBrand` (`:544`) — **logo gate** `:557` `if(shape.logo)` → image h40 (dormant); **textGradient gate** `:569` `accent≠primary && deliveryEnergy>0.6` → `linear-gradient(135deg, primary, accent)`.
- `composeStructured` (`:591`) — title + body.
- `composeDataSeries` (`:632`) — **role inferred from data shape** (`:647`): 1 value 0–100 → percentage-ring; ≥5 → sparkline; else bar-chart. One `data-viz` primitive.
- **Decorative add-ons** (budget-gated): brand pattern `budget>=4`; particles `budget>=4 && score>=0.15`; mask `budget>=5 && kind!=emphasis && score>=0.5`.

### 5.8 Gradient text (`primitive-renderers.ts:540-546`) & group primitive (`composition-renderer.tsx:184-203`)
- Gradient: sets `background`, `backgroundClip:text`, `WebkitBackgroundClip:text`, `WebkitTextFillColor:transparent`, `color:transparent`. Planner guards `!el.bind.textGradient` before splitting text (`:158`) so the fill stays continuous.
- Group: `GroupElement` gets the entrance/hold/exit anim as ONE unit; children render with `GROUP_CHILD_NEUTRAL` (static) + explicit box coords — so a 8-shape corner-mark frame flies in cohesively, not piecewise.

### 5.9 The `mg.structure.*` overlays (`overlay-definitions.json`)
10 defs, `category:"mg-property"`, scored **additively**. Drivers: **formality** → editorial/broadcast register (side-bar, divider, kicker, badge, brackets); **enthusiasm/arousal** → energetic emphasis (underline), *inverted* on composed moves (accent-line, side-bar, brackets favor calm); **cinematic_moment** → corner-marks; **visceral_impact** → annotation.

---

## 6. Key decisions + rationale (the WHY — so you don't re-litigate)
1. **Duck-typing > kindMap.** kindMap = preset routing = each new type needs a table entry = component-library mentality. Duck-typing infers shape from content keys. (Approach B "keep kindMap for known types" rejected — "keeps one foot in the template world.")
2. **Shape kinds/primitives are NOT templates.** They're inference *targets* (like a browser choosing block vs inline — content reveals it). Primitives = "periodic table, not a catalog of molecules." The 7 compose functions are a bounded vocabulary that produce different visuals per signal. Growth = a `composition-templates.ts` registry, not new component files.
3. **Vocabulary > named components (Tier 3).** Generalized the 5 implicit moves already in the engine into 10. "I don't invent a system, I generalize the one that's there."
4. **data-viz primitive > shape decomposition.** Chart *type* is a function of data shape, not a chosen preset. (Decomposition into shape primitives was tried and reverted — §10.)
5. **Rank-and-cap > gate-only.** Additive scoring floors scores; a global cap enforces director discipline.
6. **Importance-driven > position-driven budget.** Richness should track content importance, not timeline position (which starved early-video graphics for no reason).
7. **Anchor system > planner-computed positions.** Cleaner, compositional, and deterministic (no DOM measurement → Remotion-safe). Proven on a standalone HTML stacking harness *before* building 10 moves on it.
8. **Energy from personality signals, not Wav2Vec.** `enthusiasm`/`emotional_arousal` are always populated; Wav2Vec `energy_baseline` is flaky (often 0). Sidesteps the failure mode entirely.
9. **Wire brand consumers now, dormant.** ~15 LOC, activates automatically when the Graphiti producer ships. No speculative producer built.

---

## 7. The reviews we ran (both CLEARED)
- **/plan-ceo-review** — ran twice. **v1** (HOLD SCOPE, Approach B+C): diagnosed every MG collapsing to `keyword-highlight` because `graphicType` was never set; 2000+ LOC of engine = dead weight; recommended B. Outside voice caught the **CTA mapping error** (CTA = a frame zoom_push, not a graphic) → CTA dropped from payloads. **v2** (SCOPE EXPANSION, Approach A): full inventory found **20 files / ~3,800 LOC all dead** behind the duck-typing bypass; re-scoped to "remove the bypass." Spec review scored the plan **6/10**, found 10 issues, all addressed. Verdict: **CLEARED**, 9 phases, ~130 LOC added / ~55 deleted, 0 new files/services, reversibility 5/5, 1 debt (brand tokens).
- **/plan-eng-review** — ran twice, both **CLEAR (PLAN)**. Flagged: dead `graphic_type` (snake) vs `graphicType` (camel); add observability log lines; **test coverage 4/31 paths (13%), 0 E2E, 0 eval**; multi-shape composition (compose all matched shapes, primary gets main treatment) accepted +30 LOC. The keystone insight: *"Someone built all of this, then someone added a `kind` shortcut that bypassed it all. This plan removes the bypass."*

---

## 8. Adversarial testing (Rule 29 — "show me the corpse")
Three real-data sweeps. The first was forced by the user's mid-session audit demand and was the most consequential work of the sprint.
1. **Structural-move selection (the big find).** Ran the **real overlay scorer** (not injected scores) across content types: formal news fired **6 moves** (absurd), and a **casual vlog got editorial brackets+side-bar+accent** (wrong register). Root causes: additive scorer floors ~0.4 so a 0.3 gate passes everything, and no global cap. → Fixed with rank-and-cap + gate 0.45 (`2eab984b`). Re-verified: formal → 2 moves, energetic → 1, **casual → none (clean)**, busy → accent+backdrop. Backdrop correctly fires on high `visual_dependency` — was NOT under-firing (didn't "fix" what wasn't broken).
2. **chartWorthy gate, 10 adversarial phrases.** **10/10 correct, 0 false positives.** Triple-gate rejects years, casual prices/counts, tiny diffs; charts genuine business comparisons. But surfaced the number-sequence `.some` bug → fixed to `.every` (`d804c4ff`).
3. **Quote detection.** Grep confirmed it was never implemented → deferred (nothing to sweep).

---

## 9. Techniques & methods that worked (the "ways" — reuse these)
- **Verify with the REAL scorer/data, not injected unit inputs.** (See §11 — this is THE lesson.)
- **Standalone HTML stacking harness** to prove the anchor model in headless Chromium before building 10 moves on it. Fast feedback, no full pipeline.
- **Render-check the actual primitive** (gradient text → screenshot in headless Chromium) instead of trusting the type system.
- **Wiring-check before building.** Grep the actual producer/consumer chain first — caught that quote detection (no CRG mapping) and brand colors (no producer) and "brand tokens" (redundant with temperature) were not real work. Saved 3 speculative builds.
- **Adversarial content-type sweep** across vlog/ad/tutorial/doc/formal/news before committing a heuristic.
- **`group` sub-composition** to animate multi-primitive moves as one unit (neutral child anim + explicit child coords).
- **`background-clip:text`** for gradient glyph fill (already proven in 3 places in this repo).
- **`isolation:isolate` + `z-index:-1`** for backdrop containment behind flow content.
- **Parallel sub-agent swarm** (this handover itself) to recover ground truth post-compaction from 4 independent sources.

---

## 10. Bugs found + fixed / dead-ends (with root cause)
- **Over-decoration (FIXED, `2eab984b`):** per-move gates + no cap → 6 moves on formal, editorial decoration on casual. Root cause: additive scorer floor vs 0.3 gate, no global cap.
- **Number-sequence false positive (FIXED, `d804c4ff`):** `.some(connector)` matched any single connector between numbers. → `.every`.
- **Phase 4 charts un-renderable (REVERTED):** shape-primitive decomposition of bars/ring/sparkline — `buildShapeStyle` gives rects no width/height, divs can't do SVG stroke-dasharray/path. Reverted to `data-viz` primitive. (User's "isn't a bar chart a preset?" drove the deeper look — answer: type is a *function of data*, not chosen.)
- **`buildTextStyle` 5-arg call (FIXED):** called with 5 args vs 2-arg signature. Fixed.
- **Invisible container/accent-line (FIXED in `83a1debc`):** zero-size flex children. Fixed via `isolation:isolate` + `z-index:-1`.
- **LOC guesses retracted:** initial "~20 LOC icon / ~10 gradient / ~40 multi-step" estimates were made without understanding mechanics; corrected by 3 parallel investigation agents.

---

## 11. The process lesson (what I should have had at session start)
**Unit tests that inject `mgScores` directly bypass the scorer — and they hid a real over-decoration bug that was already committed.** I reported "works as intended" on those tests. The user caught it: *"i am not seeing you follow all rules … Check if everything works as intended."* The honest framing: *I was verifying the mechanism (if score → move) but never the calibration (does the scorer produce the right scores).* That's Rule 34 + Rule 29 in concrete form.

**The rule for you:** for anything signal-driven, "184 tests pass" is necessary, not sufficient. Run the **real scorer on realistic content across content types** before you call it done. Injected-score tests prove plumbing, not behavior.

Secondary lessons: (a) `tsc` clean was *file-scoped* — the project has **196 pre-existing tsc errors**, all in `lib/thinkforge/agents` (smart-quote breakage, unrelated, zero in touched files); always state scope. (b) Step-0 dead-code cleanup got inlined into feature commits instead of a separate commit first. (c) Compaction is lossy — this handover was rebuilt from git + transcript + real code, not memory, on purpose.

---

## 12. Open issues / known risks (honest ship-state)
1. **End-to-end real render UNVERIFIED (Level 3/4).** Unit + render-harness only. This is the gating risk. (#1 next, §13.)
2. **Test coverage is thin for the engine:** eng review found 13% path coverage, 0 E2E, 0 eval harness. The 184 tests are mostly planner-level with injected scores.
3. **Many thresholds are INVENTED** (§18) — they're calibration *bounds*, not validated values. The threshold bandit is meant to tune them; confirm that loop actually runs on MG params.
4. **avatar/logo/gradient real-brand path is dormant** — blocked on Graphiti producer. Don't mistake for dead code.
5. **2.6 GB `.calibration-temp/`** of test videos in the worktree (untracked); helper scripts untracked (`scripts/check-project-mg.ts`, `scripts/get-transcript.ts`, `scripts/mg-*.html`).

---

## 13. What's next — prioritized plan (CEO + eng lens)
**Immediate (do first):**
1. **End-to-end real render.** Run a real project through Path D → signal-executor → planner → Remotion. Use `scripts/check-project-mg.ts` + a real project id. Grep the run logs for the composition output; eyeball the video. Only then is Tier 3 "operational" (Rule 34).
2. **Real-scorer calibration sweep across content types** (vlog, ad, tutorial, doc, formal/news). Confirm rank-and-cap looks right on *real* signal noise, not the modeled sweep. Tune INVENTED thresholds via the bandit, not by hand.
3. **Build an eval harness** for MG selection (the eng review's gap): ground-truth content → expected moves → score. This is what makes future MG changes safe.

**Then (deferred-big, each its own project):**
4. **Quote detection** — needs (a) signal-registry detection, (b) a NEW CRG mapping node+edges (`entity.quote` → `technique:graphic.quote_card`; the technique node exists but nothing triggers it — verified), (c) signal-executor payload. AND near-zero real yield (STT strips quote marks) + reliable boundaries need prosody. Defer until transcripts preserve punctuation OR prosodic detection lands.
5. **Multi-step sequences** — the one genuinely big item: new `RecipeStep` type + recursive/sequential choreography. Steps AND holds must be signal-derived (user was explicit).

**Blocked (waiting on producer):**
6. **Real brand colors + avatar/logo activation** — blocked on the Graphiti→signal bridge producer. Consumer side is ready. `color_temperature → brand palette` is REDUNDANT (warmth already tints `textSecondary`); real accent/primary must come from Graphiti, not a temperature hack.

---

## 14. Deferred items + WHY (don't re-open these without new info)
- **Quote detection** — see §13.4. Flaky/near-zero yield today = Rule 23N says don't ship it.
- **Multi-step sequences** — see §13.5. Big, recursive, own project.
- **Brand tokens from temperature** — redundant; real colors need Graphiti.
- **Icon library** — image primitive + icon role exist but unwired; 4 icon libs installed but unbridged. Needs a real producer/bridge, not a quick wire.

---

## 15. Research & external tech (tied to MG)
- **HeyGen Hyperframes** (Apache 2.0) — HTML→video w/ GSAP + `data-*` timing, built for AI agents. Candidate dual renderer for LLM-authored MG + AI-avatar scenes (Phase G). LLMs write HTML better than React.
- **Motion (ex-Framer Motion)** — spring-physics math to extract into `keyframe-evaluator.ts` for premium easing (anticipation, follow-through, settle).
- **Essentia.js** — real beat analysis (deployed); feeds rhythmic signals for beat-synced MG timing.
- **V-JEPA 2 / TRIBE v2** (Meta, arXiv 2506.09985) — real temporal video understanding → richer signals MG consumes (GPU, Tier 2).
- **Qwen3-VL / Twelve Labs / Qwen2.5-VL** — visual-understanding candidates for scene-quality signals to enrich MG triggering (needs CEO/eng review before building).
- **Editframe** — declarative HTML/CSS→video, GPU workers; alt render backend to evaluate vs Remotion Lambda.
- **Remotion** — current renderer; determinism (frame-by-frame, no DOM measurement) is WHY the anchor model is pure CSS. Redeploy the S3 Lambda bundle when composition code changes (Rule 16).

---

## 16. Must-read docs (reading list, prioritized)
1. `memory/insturix_vision.md` — north star (agencies at scale; LLMs understand, rules decide; determinism mandatory).
2. `memory/AGENT_RULES.md` — Rule 25N (query CRG before creative changes), 29N (signals not presets), 18N/19N, 17N/23N.
3. `D:\Insturix-Brain\02-Architecture\MG-Anchor-System-Tier3.md` — current MG state of the art + latent bugs + done/deferred.
4. `memory/project_mg_overlay_architecture.md` — **the core rule:** MG properties are overlays; CRG constants are bounds; planner reads scores, doesn't decide. Do NOT add thresholds to the planner.
5. `memory/project_graphiti_signal_bridge.md` — the dormant brand/logo/avatar producer; signal-override model; 3 learning layers (bandit/Graphiti/signals).
6. `memory/project_mode2_signal_architecture.md` — Path D ("the moat"): 7 services + signal-executor, zero profiles.
7. `memory/phase_f_g_saas_motion.md` — Phase G capability target (Beehiiv-level). **Caveat:** its "build named primitives/rigs" framing predates and conflicts with the signal-driven stance — treat as capability target, not implementation plan.
8. `memory/reference_external_tech.md`, `gemma4_roadmap.md`, `system_architecture_map.md` — context; the last two are stale (predate the MG rebuild), verify against code.
9. Index layer: `memory/MEMORY.md` + `D:\Insturix-Brain\00-Index.md`. CRG = `lib/editron/data/creative-knowledge-graph.json` (671 nodes) — Rule 25N requires querying it.

**Staleness warning:** MG-Anchor + overlay/Graphiti decision docs are freshest (3–7 days). `system_architecture_map.md` (~46 days) and `phase_f_g` (~43 days) predate the signal/overlay MG rebuild — verify against current code before asserting file behavior.

---

## 17. Environment / repo state / how to run
- **Branch:** `infrastructure-improvs-+Editron` (deploy). **Worktree:** `D:\google downloads\Front-End-main\editron-worktree\`.
- **Tree at handover:** clean on committed code. Untracked: `.calibration-temp/` (2.6 GB videos — `rm -rf` to reclaim), `modal/__pycache__/`, helper scripts (`scripts/check-project-mg.ts`, `get-transcript.ts`, `mg-*.html`). Secrets `.env.local.prod`/`.vercel` now gitignored (`25371c4d`) — **never stage them; never `git add -A`.**
- **Tests:** the MG suite is `tests/editron/mg-composition-planner.test.ts` (184 tests). Run the project's test command for that file.
- **Verify (Rule 4):** `tsc --noEmit` is project-wide noisy (196 pre-existing errors in `lib/thinkforge/agents`) — scope to touched files. Run eslint on touched files.
- **Render path note:** the recipe is computed once at pipeline time (`edl-executor.ts:1135`) and rendered verbatim by `motion-graphic-layer-content.tsx` — it does NOT re-plan. Redeploy the Remotion Lambda bundle after composition code changes.

---

## 18. INVENTED-threshold registry (the tunable knobs — calibrate, don't trust)
Every value below is flagged `⚠️ INVENTED` in-code = a bound for bandit/Thompson calibration, not validated.
| Value | Where | Meaning |
|---|---|---|
| gate `0.45` | composition-planner.ts:756 | structural-move score gate |
| cap `budget>=5?3:>=4?2:1` | composition-planner.ts:812 | max moves per graphic |
| budget `2 + round(importance*3)`, weights 0.8/0.7, clamp 1–5 | content-shape-analyzer.ts:172-190 | complexity budget |
| suppressors `montage>0.5`, `overlays>=3` | content-shape-analyzer.ts:162-164 | hard budget=0 |
| penalties `pacing>0.7 −1`, `visual_significance>0.7 −2` | content-shape-analyzer.ts:184-188 | budget reductions |
| emphaticCaps `>0.7` | composition-planner.ts:523 | uppercase emphasis |
| textGradient `>0.6` | composition-planner.ts:569 | gradient wordmark |
| chartWorthy `ratio>=1.5, weight>0.6, formality>0.3` | signal-executor.ts:357-363 | data-series eligibility |
| sparkline `>=5 values`, ring `1 value 0–100` | composition-planner.ts:644-649 | chart type |
| move pixel dims (3/5/−14/−10/−8 px, 64px avatar, h40 logo, 46×46 badge) | structural-moves.ts:20-22, composition-planner.ts | broadcast-standard defaults |
| particle count `round(10 + score*60)`, gate `0.15` | composition-planner.ts:295 | particle density |

---
*Authored 2026-05-30 by Claude Opus 4.8 (1M), from git + full transcript + as-built code audit (4-agent swarm) — not from compacted memory. If a fact here disagrees with the code, the code wins — re-verify and update this doc.*
