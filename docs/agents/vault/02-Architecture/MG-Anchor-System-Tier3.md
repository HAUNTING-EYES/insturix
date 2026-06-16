# MG Structural-Move Anchor System (Tier 3 foundation)

**Date:** 2026-05-29
**Status:** Phase 1 complete + render-verified
**Tags:** #architecture #motion-graphics #decided

## Context
Lifting the MG composition layer from Tier 2 (8 fixed skeletons w/ signal-driven styling)
to Tier 3 (structure emerges from a signal-selected vocabulary of structural moves).
See CEO plan: content-inferred MG architecture.

## LATENT BUG FOUND (high-value)
`makeContainer` (backdrop) and `makeAccentLine` in composition-planner.ts were CALLED
(budget>=2 / budget>=3) but rendered INVISIBLE. Root cause: `buildShapeStyle`
(primitive-renderers.ts) sets NO width/height/position. The content container is a
flex column (`resolveLayout`), so a sizeless backdrop collapses to ~0 height and a
sizeless line to ~0 width. The decoration layer was non-functional, not just template-y.

## The Anchor System (the fix + the Tier 3 foundation)
Structural moves attach RELATIVE to the content block via deterministic CSS (NO DOM
measurement — Remotion renders frame-by-frame and must stay deterministic).

`ElementAnchor` on RecipeElement + ResolvedElement (recipe-types.ts):
- `flow` — normal flex child; array order positions it (kicker, divider, underline)
- `block-fill` — position:absolute, inset around content block (backdrop, corner frame)
- `block-edge` — pinned to one side (side-bar=left, accent-line=bottom)

### Stacking model (the subtle part — render-verified)
- block-fill backdrop (layer background) gets `z-index:-1`
- `resolveLayout` base got `isolation:isolate` → forces a stacking context so the
  negative z-index stays CONTAINED behind the composition's text, without touching
  every text element. Verified: backdrop sits behind readable text.
- block-edge moves don't spatially overlap text, so they need no z-index.

### Files touched (Phase 1)
- recipe-types.ts: ElementAnchor interface + anchor field on RecipeElement & ResolvedElement
- property-resolver.ts: anchor passthrough in resolveElements
- primitive-renderers.ts: buildShapeStyle applies absolute positioning for block modes
- composition-renderer.tsx: resolveLayout base += isolation:isolate
- composition-planner.ts: makeContainer → block-fill inset -12; makeAccentLine → block-edge bottom 3

### Verification
- tsc clean, eslint clean, 168/168 tests
- Render-verified via standalone HTML harness replicating the exact CSS: backdrop
  behind text, full-width accent line at bottom of card, no bleed. Stacking confirmed.

## Next (Phase 2+)
- 10 move factories in structural-moves.ts (accent-line, underline, kicker, backdrop-card,
  side-bar, divider, badge, bracket, corner-marks, annotation-callout)
- 10 `mg.structure.*` overlay definitions (signal→score) in overlay-definitions.json
- Vocabulary runner in planner: budget-gate + score-gate + conflict resolution
- Prove on data viz first (worst offender), then roll across the 7 text composers
- Rhetorical encoding (transcript verb "doubled"/"dropped" → annotation) needs a
  signal-registry lookback to capture the verb (currently sliced off at first number)

## Phase 2 COMPLETE + render-verified (2026-05-29)
6 moves built (accent-line, side-bar, backdrop-card, divider, underline, kicker) in
structural-moves.ts. 6 mg.structure.* overlays added (signal→score). Vocabulary runner
in composition-planner (runStructuralMoves): budget-gate + score-gate (0.3) + conflict
resolution (accent-line vs underline) + content-gating (divider needs secondary, kicker
needs text) + flow-insertion at correct positions.
- Added 4th anchor mode `flow-span` (flex child + stretch cross-axis) for divider/underline.
- Replaced the inline makeContainer/makeAccentLine (now dead, removed) with the runner.
- 172 tests pass. Render-verified: text registers (news card vs editorial) + data-viz+moves.

## Phase 4 COURSE-CORRECTION (important lesson)
Phase 4 rewrote composeDataSeries to emit charts as div-based shape primitives (rect bars,
circle ring, path sparkline). The 2d render-check found this UN-RENDERABLE:
- rect bars: buildShapeStyle never applies width/height → invisible
- circle ring: ShapeElement renders a <div>, can't do SVG stroke-dasharray progress
- path sparkline: div, not SVG → nothing renders
ROOT CAUSE: over-applied Rule 11. `data-viz` IS one of the 11 primitive types, rendered
by DataVizElement as proper SVG. Decomposing charts to divs was both un-renderable AND
unnecessary. REVERTED composeDataSeries to emit a data-viz primitive: chart TYPE still
data-inferred (ring/bar/sparkline from values, NOT preset), colors brand-bound, vocabulary
moves wrap it. LESSON: data-viz is a legit primitive; charts are inherently SVG; don't
decompose them to divs. Rule 11 forbids bespoke NAMED components (LowerThird.tsx), not the
general data-viz primitive. The Phase 4 signal-executor work (multi-value + editorial gate) stayed.

## Deferred: group sub-composition primitive
4 moves (badge, brackets, corner-marks, annotation-callout) need a "group" capability —
a primitive positioned relative to ANOTHER primitive inside the move (number on a pill,
L-mark at a corner, label with connector). The flat anchor model can't express this.
Decision: prove selection with the 6 first (done), then build the group primitive + 4 moves.

## Signal-driven complexity budget (2026-05-29) — fixed the position wart
computeComplexityBudget (content-shape-analyzer) was POSITION-based: position_in_video
< 0.2 → budget 1 (bare text), regardless of how important the moment was. A stat at 0:10
got starved. REWROTE to importance-driven:
- Hard suppressors unchanged: montage_mode > 0.5 → 0; active_overlay_count >= 3 → 0.
- Base = 2 + round(importance*3), importance = max(cinematic_moment, visceral_impact,
  emotional_arousal*0.8, formality*0.7). `max` (not avg) so one strong peak justifies
  richness AND it's robust when composites like cinematic_moment aren't computed (formality
  almost always is). ⚠️ weights + mapping INVENTED (bandit-calibratable bounds).
- Pacing penalty: pacing_velocity > 0.7 → -1 (fast = less reading time). Visual significance
  > 0.7 → -2 (busy frame, don't compete). Clamp 1..5.
- Removed the duplicate cinematicBoost in composeElements (double-counted). Budget is now
  single-source (computeComplexityBudget owns it).
- Verified signals reach the planner via signal-executor SIGNAL_MAP (cinematic_moment,
  visceral_impact, emotional_arousal, formality, pacing_velocity, visual_significance,
  montage_mode, active_overlay_count all present). DEFAULT_SIGNALS baseline → budget 3.
- Tests updated to importance model (172 vitest + 22 verify-script checks green).

## Group primitive + 4 moves COMPLETE + render-verified (2026-05-29)
Added 'group' primitive (sub-composition): a group holds child primitives positioned
relative to it (flex / anchor / explicit coords), and the WHOLE group animates as one unit
(children get neutral anim — no recursive choreography). Foundation:
- recipe-types: 'group' PrimitiveType + children?: RecipeElement[]/ResolvedElement[]
- property-resolver: resolveElements recurses into children
- composition-renderer: GroupElement + renderGroupChild (group box positioned/animated;
  children via buildShapeStyle/buildTextStyle with neutral anim + explicit box positioning)
4 moves (structural-moves.ts), all renderable via rects/text/circle (no SVG/per-side-borders):
- moveBadge(value): pill (block-fill) + centered number, top-left corner chip
- moveBrackets(): [ ] framing via 3 rects/side
- moveCornerMarks(): 4 L-marks (2 rects each) at block corners
- moveAnnotationCallout(text): connector line + label, top-right (the rhetorical beat)
Runner wiring: badge (budget>=3 + content.badge), brackets (>=4) XOR corner-marks (>=5,
mutually exclusive framing), annotation (>=4 + content.annotation). 4 mg.structure.* overlays.
176 tests pass. Render-verified: badge+corner-marks card, brackets+annotation card.
LESSON: brackets/corner-marks via filled rects (not SVG/per-side-borders) keeps them
renderable through the existing div-based ShapeElement.

## AUDIT + CALIBRATION FIX (2026-05-29) — caught a shipped miscalibration
Self-audit (user-prompted) ran the REAL scorer (not injected test scores) across content
scenarios. Found the committed vocabulary (95a4046f) over-decorated:
- additive scorer floors scores ~0.4 → the 0.3 gate fired on casual content (brackets +
  side-bar + accent on a casual vlog — wrong)
- no global cap → formal content fired 4-6 structural moves (clutter)
ROOT CAUSE: independent per-move gating + too-low gate + no cap. Unit tests masked it
because they INJECT mgScores directly, bypassing the scorer.
FIX: rewrote runStructuralMoves to RANK-AND-CAP — score all candidates, resolve conflict
groups (h-rule: accent/underline; frame: brackets/corner-marks), take TOP-K where
K = budget>=5?3:budget>=4?2:1. Gate raised 0.3→0.45 (above additive baseline).
E2E re-verified (real scorer → planComposition): casual=clean, formal=divider+accent,
energetic=underline, busy-scene=accent+backdrop. Director-grade. 177 tests pass.
LESSON (Rule 29): adversarially test selection heuristics across content types with the
REAL scorer BEFORE shipping — injected-score unit tests don't catch miscalibration.
LESSON: backdrop correctly fires on high visual_dependency (busy scenes); it wasn't broken,
my earlier low-visual_dependency scenarios just didn't trigger it (Rule 12 — verify before "fixing").

## Process-rule debts noted (not rewriting git history)
- Step 0 rule: dead-code cleanup (kindMap, makeContainer/accentLine) was inlined into feature
  commits, not committed separately first. Going forward: separate cleanup commits on >300 LOC.
- Project has 196 pre-existing tsc errors in lib/thinkforge/agents (smart-quote breakage),
  unrelated to MG work. My files are clean. "tsc clean" claims were file-scoped.
- Multi-value extraction + chart editorial gate: SWEPT (Rule 29) on 2026-05-29 with 10 realistic
  phrases. chartWorthy triple-gate (ratio>=1.5 AND weight>0.6 AND formality>0.3) = 0 false
  positives (years/casual prices/counts/tiny-diffs all correctly NOT charted; 4 genuine business
  comparisons charted). Found + fixed 1 detection imprecision: number-sequence lookahead used
  `between.some(connector)` → over-consolidated sentences ("6 and left at 8"); changed to
  `between.every(connector)` so only connector-only gaps form a sequence.
- Quote detection: NOT implemented (Phase 5, deferred when the Tier 3 vocabulary was prioritized).
  The quotation SHAPE + composeQuotation exist, but no signal detects quotes to feed them yet.

## Polish items done (2026-05-30) — all verified
- Avatar/logo image consumers: composeIdentity renders content.avatar (circular headshot),
  composeBrand renders content.logo. ImageElement applies width/height/radius (cover) or
  contain. Consumer-ready, DORMANT (no producer wires avatar/logo yet — Graphiti).
- Energy caps: composeEmphasis uppercases the keyword when enthusiasm/emotional_arousal > 0.7
  (reliable personality signals, NOT flaky Wav2Vec speech-energy).
- Gradient text: composable textGradient binding on text; buildTextStyle clips fill to glyphs
  (background-clip:text). composeBrand sets it ONLY for brand + contrast + high energy, derived
  from brand primary→accent tokens. Never text-split. Render-verified.
- 184 tests pass. Commits: 51372761 (avatar/logo), b6ad3079 (energy), 4fbac832 (gradient).

## DEFERRED (genuinely big / blocked — NOT small)
- Brand tokens from color_temperature: REDUNDANT — temperature already wired (warmth signal →
  resolveMotionTokens temperature → textSecondary). Real brand colors need the Graphiti producer.
- Quote detection: needs (a) signal-registry quote detection, (b) a NEW CRG mapping node+edges
  (entity.quote → technique:graphic.quote_card — currently the technique exists but NOTHING
  triggers it), (c) signal-executor payload. AND near-zero real yield (STT strips quote marks)
  + reliable boundaries need prosody. Defer until transcripts preserve punctuation OR prosody lands.
- Multi-step sequences: big (RecipeStep type, recursive/sequential choreography in
  choreography-computer). Its own focused project.

## Remaining roadmap (deferred items above)
1. Brand tokens (color_temperature → palette) + energy caps
3. Quote detection (signal-registry → quotation shape)
4. Multi-step sequences (signal-driven hold/exit)
5. Avatar/logo consumer wiring (Graphiti-ready)
6. Gradient text (composable property)

---

## REAL-DATA VERIFICATION (2026-05-30) — closes the handover's #1 gap

**Method:** the handover's #1 job was "end-to-end real render — not verified." Persisted recipes
predate the Tier-3 vocabulary (computed ≤05-28; vocab shipped 05-29/30), so they can't show current
behaviour. Instead pulled REAL motion-graphic overlays (stored `content` + `contentSignals` snapshot)
from **7 real projects (108 MGs)** in `editron_prev`, recomputed mgScores via the **real scorer**
(`scoreAllOverlays`, exact mirror of edl-executor.ts:1110-1129), ran the **current** `planComposition`,
then drove the **real** `resolveElements` + `buildShapeStyle/buildTextStyle` for a render-correctness
check. Scripts (untracked helpers): `scripts/{mg-probe,verify-mg-real,mg-signal-coverage,render-mg-real}.ts`.
Eyeball artifact: `.calibration-temp/mg-render-real.html`.

**VERIFIED GOOD (Level 2–3):**
- Composition layer runs end-to-end on real data: **108/108 valid recipes, 0 crashes.**
- Shape duck-typing varies per moment on real content: 6 kinds seen (emphasis 73, numeric 18, identity 6,
  structured 5, free-text 3, quotation 3).
- **Rank-and-cap calibration is sound on REAL signal vectors** (not modeled): move-count dist `{0:9, 1:51, 2:48}`,
  **zero over-decoration** (never >3, cap holds), **zero wrong-register** (no editorial moves on casual),
  all-zero-signal project → 0 moves (clean). Matches the handover's modeled sweep. Only 3 moves ever emit on
  real data (backdrop 58, underline 56, accent-line 33); the other 7 are content-gated dormant (kicker/badge/
  divider/annotation need keys no producer emits — like avatar/logo) or out-ranked (side_bar/brackets/corner_marks).
- Render-correctness: real `resolveElements` + style builders → backdrop/text/lines all paint with real
  dimensions+colors. The past "invisible element" class stays fixed.

**BUG FOUND + FIXED — backdrop opacity token namespace (P1, silent):**
`structural-moves.ts:62` bound `token:surface.surfaceOpacity` and `structural-gate.ts:107` read
`tokens.surface.surfaceOpacity` — but `surfaceOpacity` lives under **`color`** (MotionTokens.color.surfaceOpacity:99,
theme minimal-tech:46=0.87, working consumer StatCounter.tsx:133). Undefined → `applyOpacity` emitted invalid
`rgba(11,11,10,)` → **the backdrop_card (most-fired move, 54% of real MGs) silently never painted**; the gate's
WCAG legibility deduction (`<0.3`) silently never fired. The prior session's HTML harness missed it because it
didn't run `resolveBinding` — exactly the §11 lesson. **Fixed** both to `color.surfaceOpacity`; re-verified:
backdrop now emits valid `rgba(11,11,10,0.81)`, no resolver warnings. tsc clean (196 baseline, all thinkforge),
eslint clean, **112 MG tests pass** (40 planner + 60 primitive-renderers + 12 choreography). Grounded in
`constraint:accessibility.text_contrast_failure` (CRG:10530 — backdrop IS the "semi-transparent box" autoCorrection).

**BUGS FOUND — DEFERRED (need a creative decision, NOT a quick patch):**
- **Fraction/suffixed stat values → EMPTY graphic (P1 visible).** `hasNumericValue` charset `/^[\d,.$%+\-]+$/`
  (content-shape-analyzer.ts:107) rejects `/`, `M/K/B`, `x`. Real data: 3 stat-counters with `value="1/3"`
  degrade to `free-text` → `content:text` is empty → blank card (backdrop+underline, no number). Same root cause
  as the "100M" failure in test-integration-mg.ts. Fix options: (a) widen `hasNumericValue` to recognize
  fractions/ratios/suffixes AND give composeNumeric a static (non-count-up) render path for non-incrementable
  values; (b) at minimum, fall back to rendering the raw value as text instead of empty. Needs CRG consult
  (count-up doesn't apply to "1/3") → deferred, not slapped.
- **secondary/label text has no `minSize` → fontSize `undefined` (P2).** composeNumeric `label`, composeIdentity
  `title`, composeStructured `body`, composeQuotation `author` push text with no `minSize` → `buildTextStyle`
  leaves fontSize undefined → renders at CSS default (~16px) on a 1080p canvas = near-illegible. Fix: bind a
  CRG-floored secondary size (LOWER_THIRD_TITLE_MIN_FONT 36 etc.) like the primaries already do.

**THE BIG FINDING — signal granularity is the bottleneck, not the composition layer:**
Even the richest real projects populate only **13 of ~35 mapped signals**; of 15 per-moment signals, **only
`visceral_impact` is ever present — `cinematic_moment` (the primary budget driver) is ABSENT on ALL real data**,
as are motion_intensity/face_emotion/visual_significance/etc. So within a video the signals are near-constant →
structural register + budget are **constant per-video** (correct *consistency*, but no per-moment escalation).
Across projects only ~4 distinct signal clusters → ~4 distinct looks. **The "unbounded combinations" moat is
real in code but not exercised by real signal variation.** The composition engine is correct; the gap is upstream
signal population. CAVEAT: these projects were processed 05-25/28, before the recent per-moment signal wiring
(SIGNAL_MAP "D1" additions in signal-executor.ts:585-608), so whether the CURRENT pipeline populates
cinematic_moment et al. per-moment is **unverified — needs a fresh ingest run on a new video** (the true
remaining Level-4 gap; can't be done locally — needs the ingestion stack).

**SHIP-STATE NOW:** composition layer end-to-end **VERIFIED on real data (Level 2–3)** + 1 silent P1 bug fixed.
Still open: (1) fresh-ingest run to confirm per-moment signals now reach the planner (Level-4, needs infra);
(2) the 2 deferred bugs above; (3) Remotion **Lambda** pixel render (deploy-time; local recipe→CSS render-checked
instead — no standalone browser in env). The fix is in the working tree, **uncommitted** (awaiting user go).
