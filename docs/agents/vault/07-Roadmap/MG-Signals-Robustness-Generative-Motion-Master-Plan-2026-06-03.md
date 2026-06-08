---
tags: [motion-graphics, signals, robustness, generative-motion, calibration, master-plan, roadmap]
date: 2026-06-03
status: APPROVED (deepthought + CEO/Eng reviewed + revised) — executing Phase 1
supersedes-context: MG-Monotony-Root-Cause-Dial-Layer-2026-06-03.md (the findings this plan acts on)
---

# MG Signals Robustness → Generative Motion → Calibration — Master Plan

## Why this plan exists
The monotony investigation (2026-06-03) surfaced four truths:
1. **The signals pipeline fails SILENTLY** — a missing/constant signal yields no error, just bad output
   noticed weeks later (the disease behind every "you keep breaking signals infra" moment).
2. **A real pre-existing bug**: `signalsAtFrame` compares CLEAN-timeline MG times against
   ORIGINAL-timeline V-JEPA segments (clean is 50.3% of original) → 6/13 MGs get no per-moment signal →
   fall back to constants. (director-agent.ts:613-625, dup :657-668; segments from :480.)
3. **Entrance/zoom are PRESETS** (pop/slide/fade …) selected by signal-scored dials — Tier-1 per Rule 11.
   The north star is motion COMPUTED from signals.
4. **You calibrate a settled form, not a moving target** — tuning preset curves a generative form will
   replace is throwaway (the handover's own lesson). → foundation first, calibration last.

## Governing principles (the eradication discipline)
- **No silent signal failures.** Missing/constant signals must be LOUD (warn + count + test).
- **Foundation before calibration.** Correct signals + settled form, THEN tune.
- **Wiring transfers, curves don't.** Invest in which-signals-drive-what (transfers to the generative
  form) and the form itself; calibrate curve VALUES last.
- **Every signal-touching change runs the smoke + contract test, and render-verifies on real pixels.**
- **Founder keeps taste sovereignty** — the tuner proposes; founder spot-checks.

## Phases (sequenced by DEPENDENCY)

### Phase 1 — Signals Safeguard  [FIRM. The "never again" foundation. Start here.]
- 1.1 **Loud fallback**: `signalsAtFrame` counts decisions that find no V-JEPA segment and WARNS above a
  threshold (e.g. >15% miss); queryable in Vercel logs. Same for the dup at :657-668. (R18N fail-loud.)
- 1.2 **Signals-contract test** (deterministic): a SYNTHETIC-first fixture (controlled signals; real dump
  secondary) asserts: per-moment signals reach the dials, VARY across distinct moments, and no dial
  scores purely on defaults. CI gate.
- 1.3 **Signal→output smoke test**: generalize `verify-entrance-rewire.ts` — before/after any signal
  change, prove output still tracks signals (entrance + zoom + size).
- Verify: tests pass; deliberately zero a signal → tests fail loud.

### Phase 2 — Timeline Bug Fix  [FIRM. Correct per-moment signals for ALL consumers.]
- 2.0 **Confirm** the original↔cut mapping (director-agent:520-523 / executeBrief) is reusable from
  `signalsAtFrame` scope; else build a clean clean↔original converter.
- 2.1 Map clean→original before the V-JEPA `find`.
- 2.2 Bounded nearest-segment fallback for true silence-gap landings.
- 2.3 Fix the duplicated lookup at :657-668.
- Verify: Phase-1 loud-warning drops to ~0; re-run smoke test → the 6/13 fallback MGs now get real
  signals → entrance varies MORE; RENDER-verify on real pixels; tsc +0.
- *This VALIDATES Phase 1 (warning fires before, silent after).*

→ **CHECKPOINT: validate 1+2 on real pixels, then re-decide 3/4/5.** (CEO: don't pre-commit the rest.)

### Phase 3 — Breadth: Zoom + Dial Enrichment  [apply the entrance lesson on now-correct signals]
- 3.1 Investigate zoom architecture (monotone like slide? which signals? — founder saw "always zoom-ins").
  *(read-only first)*
- 3.2 **Zoom fix pulled EARLY** (CEO: cheap high-visibility win): rewire zoom dials to per-moment signals
  (direction + intensity from motion/significance), same pattern as entrance.
- 3.3 Audit `Editron-Signals-Source-of-Truth` → enrich entrance + zoom considerations with the per-moment
  signals that SHOULD drive them (motion_intensity, narrative_pressure, face_present, cinematic_moment …
  whichever are populated post-Phase-2).
- 3.4 Scorer: **weighted considerations, OPT-IN (default weight 1 = today's unweighted average)** so a
  per-moment signal can dominate a richer set WITHOUT regressing non-MG categories (zoom/transition/
  caption/cut all share `scoreAllOverlays`). [Eng: sharpest blast-radius catch.]
- Verify: smoke + contract green; RENDER-verify entrance + zoom on real + synthetic.

### Phase 4 — Depth: Signal-Driven Motion  [GATED on Phase 3 results — the Rule-11 leap]
- Compute motion (translate x/y/z, scale, rotation over time) from signals → keyframe tracks, dissolving
  pop/slide/fade presets into emergent choreography. Build on `resolveKeyframeTracks`
  (composition-planner:127) + `choreography-computer`. Design → prototype ONE motion end-to-end (render-
  proven) → integrate (presets become seeds/anchors, not the menu).
- Eng caveat: confirm `primitive-renderers.ts` can execute arbitrary keyframe tracks (it partially does).
- *Only proceed if Phase 3's enriched presets aren't already "good enough" (CEO ROI gate).*

### Phase 5 — Calibration Tuner  [LAST. Calibrate the settled form.]
- 5.1 **yt-dlp corpus** (founder's overfit fix): a DEFINED set (N diverse real videos, genres spanned) →
  run pipeline → dump MGs+signals. (Scope it; don't let it balloon.)
- 5.2 Seeded CMA-ES over the curve/motion param vector; objective = composite reward (legibility laws
  FIXED, correctness vs founder labels, variety). Founder spot-checks winners. Start narrow
  (entrance + font_size) → expand.
- Verify: held-out videos; founder review; zero legibility regressions.

## Standing items (tracked, not dropped)
- **M1 — genreParams starvation** (branded videos get 8 constant personality signals, skip
  `signalsAtFrame` → starved). The reverted blend fixes it; needs a branded project to verify. Revisit in
  Phase 5 (the blend weight is a tunable). ICP-relevant — do NOT forget.
- **font_size compression (M2b)** — calibration; folded into Phase 5.
- **Personality signals are KEPT** — they set the TONE (brand baseline); per-moment signals add VARIATION.
  Never deleted. Every dial keeps a character signal (formality/warmth) alongside its per-moment driver.

## Risks + mitigations
- Phase 4 destabilizes → gated behind the safeguard + prototype-first + render-proof.
- Tuner overfits → yt-dlp corpus + held-out + founder-in-loop.
- Repeatedly touching director-agent (signals) → the Phase-1 safeguard is the mitigation.
- Shared-scorer regression (3.4) → opt-in weights, default 1.

## Progress log
- **2026-06-03 — Phase 1.2 DONE + committed (`6498ba19`).** Tracked signals-contract test
  (`tests/editron/signals-contract.test.ts`, vitest, synthetic-first, CI-gateable). INV1 (structural:
  every entrance dial reads ≥1 per-moment signal) + INV1b (teeth-check: old constant-only slide is
  detected) + INV2 (behavioral: entrance winner varies across moments). 12/12 green, tsc +0.
  - **The safeguard immediately caught a 9th constant-bound dial:** `mg.animation.entrance_speed`
    (entrance DURATION) read only pacing_velocity + enthusiasm → rewired primary to visceral_impact
    (inverted: high impact → snappier). Proof the guard works on day one.
  - **Finding for Phase 3:** `entrance_speed` shares the `mg.animation.entrance_` prefix that `mgWinner`
    argmaxes over, but it's a duration dial absent from `ENTRANCE_WINNER_MAP` — if it ever outscored the
    type dials it would silently suppress the entrance override. Scores ~0.45 here (below type winners)
    so it doesn't bite now; fix in Phase 3 (distinct prefix or filter mgWinner to the valid set).
  - Prior: entrance type rewire committed `1059883a` (the 7 type dials).
- **2026-06-03 — Phase 2 DONE + committed (`252a47ed`); Phase 1.1 folded in.** Timeline-coordinate fix:
  `signalsAtFrame` (+ the duplicated calibration-snapshot lookup) now map the CUT-timeline decision
  frame → ORIGINAL-timeline ms via the new `mapCutFrameToOriginalFrame` (brief-executor.ts, inverse of
  the existing `mapOriginalFrameToCutTimeline` — one home for the mapping) BEFORE the V-JEPA `find`, with
  a 5s nearest-segment snap for boundary/gap landings. Plus the **loud-fallback (1.1)**: warns when >15%
  of decisions still find no segment.
  - **Real-data proof (read-only probe):** exact V-JEPA coverage **7/13 → 12/13**. All 6 previously-
    starved MGs (0,5,6,7,10,12) now resolve to the correct moment. MG[9] was a *false* raw-hit (old code
    read 351.7s; true time 870.3s = a genuine original silence gap) → snap-handled. Warning: 46% (loud) →
    8% (quiet) — the intended before/after.
  - Round-trip unit test (`tests/editron/brief-executor-timeline.test.ts`) proves original→cut→original
    identity. tsc +0, eslint --quiet clean, 140/140 tests pass.
- **REMAINING Phase 1:** 1.3 promote the smoke test to a tracked check (lower priority — INV2 of the
  contract test already covers the behavioral case).
- **OWED — the plan's 1+2 CHECKPOINT:** validate on REAL PIXELS. Done at the signal level (coverage +
  contract + mapper). The pixel-level proof (live re-generate proj_OzG2qgoYudFa → render → see varied
  entrances on the now-covered MGs) needs a live pipeline run, OR an offline entrance-projection (score
  the rewired entrance dials against the CORRECTED per-moment signals). Not yet done.

- **2026-06-03 — 1+2 CHECKPOINT validated at the selection level (offline projection).** Corrected
  per-moment signals (Phase 2) through the rewired entrance dials (Phase 1): **8/13 entrances changed**,
  and the pre-fix scale-monocluster (the 6 starved MGs all defaulting to `scale`) **broke into a
  moment-driven spread** — e.g. MG[5] (vsig 0.96) → scale (dramatic reveal), MG[7] (vsig 0.22) → pop.
  Distribution before `{scale:6,skew:5,pop:2}` → after `{skew:7,pop:5,scale:1}`.
  - Caveat (honest): now skew-leaning (this video has high visual_change_rate widely) → moment-driven,
    but a calibration target for Phase 5 (balance the curves so one dial doesn't dominate). Still 3 types.
  - Verification ceiling: this is Level-2/selection (real mapper + real V-JEPA data + real scorer). Level-3
    (live pipeline) + Level-4 (rendered pixels) still owed — a full re-generate+render is the final proof.
- **Audit (user-gated before push):** mechanical gates green (tsc +0, eslint --quiet clean, 140/140).
  Honest gaps stated: verification is Level-2 not Level-3; adversarial was moderate not the full Rule-29
  sweep; Step-0 dead-code N/A (additive fix). Recommended safe to push.

- **2026-06-03 — PIXEL PROOF delivered + scoring-method catch fixed.**
  - **Scoring-method catch:** entrance dials are SELECTION dials → scored MULTIPLICATIVELY in prod
    (edl-executor.ts:1153-1163), but my verification used `additive`. INV1 (structural) was always valid;
    fixed INV2 + the verify/projection/compose scripts to multiplicative; re-verified the rewire holds
    (the additive numbers had coincidentally matched). Committed `4ccf06ad`. Safeguard now tests the real path.
  - **Pixel proof:** recomposed the 13 MGs with corrected signals through the REAL composition path
    (exact mirror of edl-executor:1134-1191: resolveMotionTokens → prop=additive/sel=multiplicative →
    planComposition) → entrances **pop ×5, skew-in ×7, scale-up ×1** (vs pre-fix all slide-up; MG[5]
    vsig 0.96 → scale-up). Rendered both via render-mg-motion (no errors) → GIFs sent to founder. The
    same 3 moments went slide-up → scale-up/pop/skew-in. **1+2 validated at all 3 levels: signal
    (7/13→12/13), recipe (varied entranceOverride), pixel (rendered GIFs).**
  - Scope honesty: the render is the composition layer fed corrected signals (what 1+2 changes), NOT a
    full live-Director run (LLM brief + DB write) — deliberately avoided to not mutate the real project.
  - **Commits this session:** `ef1a60dd` eval lib, `1059883a` entrance rewire, `6498ba19` safeguard+entrance_speed,
    `252a47ed` Phase 2 timeline, `4ccf06ad` method fix. Pushed: ef1a60dd, 1059883a, 6498ba19. **LOCAL
    (unpushed, founder gated): 252a47ed, 4ccf06ad.**

## Review trail
Deepthought + reviewed through CEO lens (time-to-visible-win, scope discipline, M1 not-forgotten,
corpus definition) and Eng lens (opt-in weights, mapping-reuse confirm, synthetic-first fixture,
render-verify, thresholded warnings). Revisions applied above.
