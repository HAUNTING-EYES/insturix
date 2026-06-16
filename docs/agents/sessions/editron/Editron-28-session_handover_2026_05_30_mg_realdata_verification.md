# Sprint Handover — MG Tier 3 REAL-DATA Verification (2026-05-30, session 2)
**Branch:** `infrastructure-improvs-+Editron` · **Worktree:** `D:\google downloads\Front-End-main\editron-worktree\`
**Picks up from:** [session_handover_2026_05_30_mg_tier3.md](session_handover_2026_05_30_mg_tier3.md) (whose #1 owed item was "end-to-end real render UNVERIFIED").
**Full detail:** `D:\Insturix-Brain\02-Architecture\MG-Anchor-System-Tier3.md` → "REAL-DATA VERIFICATION (2026-05-30)".

## What this session did
Closed the composition half of the handover's #1 gap. Could NOT run full Path-D ingest (needs the
ingestion stack + external APIs; Rule 24N forbids prod deploys), and there's no standalone browser for a
Remotion-Lambda pixel render. So verified the part that the Tier-3 work actually changed — the composition
layer — with REAL data:

- Pulled REAL motion-graphic overlays (stored `content` + `contentSignals`) from **7 real projects = 108 MGs**
  in `editron_prev`, recomputed mgScores via the **real scorer** (exact mirror of edl-executor.ts:1110-1129),
  ran the **current** `planComposition`, then drove the **real** `resolveElements` + style builders.
- Why re-run instead of reading stored recipes: every persisted recipe predates the Tier-3 vocabulary
  (projects updated ≤05-28; vocab shipped 05-29/30), so stored recipes can't show current behaviour.

## Verified GOOD (Level 2–3)
- 108/108 real MGs → valid recipes, 0 crashes.
- Shape duck-typing varies per moment: 6 kinds on real content.
- **Rank-and-cap calibration sound on REAL signals:** move-count `{0:9,1:51,2:48}`, ZERO over-decoration
  (cap holds, never >3), ZERO wrong-register, all-zero-signal project → 0 moves (clean). Confirms the prior
  modeled sweep against real signal noise.
- Render-correctness (real resolveElements + buildStyle): backdrop/text/lines paint with real dims+colors.

## Bug FOUND + FIXED this session (P1, silent) — IN WORKING TREE, UNCOMMITTED
**Backdrop opacity token namespace.** `structural-moves.ts:62` (`token:surface.surfaceOpacity`) and
`structural-gate.ts:107` (`tokens.surface.surfaceOpacity`) — but `surfaceOpacity` lives under **`color`**
(MotionTokens type:99, theme minimal-tech:46, working StatCounter.tsx:133). Undefined → invalid `rgba(r,g,b,)`
→ **backdrop_card (most-fired move, 54% of real MGs) silently never painted**; gate legibility check silently
no-op'd. Fixed both → `color.surfaceOpacity` (+ removed a dead `RecipeElement` import in structural-gate).
Re-verified: valid `rgba(...,0.81)`, no warnings, **112 MG tests pass**, tsc 196-baseline (all thinkforge),
eslint clean. The prior HTML harness missed it (didn't run resolveBinding) — the §11 lesson, again.
**Decision needed from user: commit this fix?** (3 files: structural-moves.ts, structural-gate.ts + import cleanup).

## Bugs FOUND — NOW FIXED (2026-05-30, commit `4eb80496`, user-approved, pushed)
- **[FIXED] Fraction/suffixed stat values → BLANK graphic (P1 visible).** `hasNumericValue` charset rejected
  `/`,`M/K/B`,`x`. 3 real MGs with `value="1/3"` degraded to free-text → blank card. FIX: broadened
  `hasNumericValue` (numericValueForm: countable | fraction | ratio | magnitude) + `isCountUpValue` export;
  composeNumeric now count-ups only plain magnitudes, else renders STATIC literal (count-up's parseFloat mangles
  "1/3"→"1"). CRG technique:graphic.stat_counter sanctions count-up|pop|fade + "count (10x)". Verified: the 3 real
  "1/3" stats now `numeric` not blank; 17/17 adversarial cases; plain numbers still count-up (no regression).
- **[FIXED] secondary/label text unsized → ~16px (P2).** composeNumeric label + composeQuotation author had no
  minSize → buildTextStyle left fontSize undefined. FIX: CRG-floored minSize (LOWER_THIRD_TITLE_MIN_FONT) matching
  composeIdentity title. Verified: label "human beings" now ~80px. (Note: renderer floors all MG text at 64px, so
  captions read large-ish — tightening that proportion needs revisiting the global 64px floor, separate item.)
- **STILL OPEN (pre-existing, NOT mine):** 3 eslint warnings in composition-planner (unused `MGKeyframeTrack`
  import + `language` params in composeDataSeries/makeTextElement) — unrelated dead code, flagged for separate cleanup.

## THE BIG FINDING — bottleneck is upstream signal granularity, not the engine
Richest real projects populate only **13/35 mapped signals**; of 15 per-moment signals only `visceral_impact`
is present — **`cinematic_moment` (primary budget driver) is ABSENT on ALL real data.** So signals are
near-constant within a video → structural register + budget are constant per-video; across projects ~4 clusters
→ ~4 looks. The "unbounded combinations" moat is real in code but **not exercised by real signal variation.**
CAVEAT: these projects predate the recent per-moment SIGNAL_MAP wiring (signal-executor.ts:585-608), so whether
the CURRENT pipeline populates them per-moment is UNVERIFIED.

## NEXT SESSION — prioritized
1. **Fresh ingest run** on a NEW video through the current pipeline → confirm cinematic_moment & the other
   per-moment signals actually reach the MG planner (the true remaining Level-4 gap). Then re-run
   `scripts/verify-mg-real.ts` on that project. THIS is what proves the moat works per-moment.
2. Decide + fix the 2 deferred bugs (fraction→blank is user-visible P1).
3. Remotion **Lambda** pixel render of a real recipe (deploy-time; local render-check already done).
4. (Eng-review gap) build the MG eval harness — `verify-mg-real.ts` is the seed.

## Scripts created (untracked helpers, like check-project-mg.ts)
`scripts/mg-probe.ts` (project/overlay inventory), `scripts/verify-mg-real.ts` (real-data calibration harness +
dumps recipes), `scripts/mg-signal-coverage.ts` (signal-key coverage + degraded numerics), `scripts/render-mg-real.ts`
(real-resolver render-correctness + HTML stills → `.calibration-temp/mg-render-real.html`).

## Rules followed / notes
Evidence Blocks produced for both code edits. NO planner thresholds added (fix was a token-path typo, not a gate).
Did NOT `git add -A` (.env.local.* secrets). tsc scoped to touched files (196 pre-existing thinkforge errors noted).
"184 tests" from prior handover = assertions; actual MG test-case count is **112** across 3 files.
