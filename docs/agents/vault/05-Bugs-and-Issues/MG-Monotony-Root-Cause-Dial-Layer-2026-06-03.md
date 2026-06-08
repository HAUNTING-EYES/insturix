---
tags: [motion-graphics, monotony, root-cause, dials, calibration, verification, proj_OzG2qgoYudFa]
date: 2026-06-03
status: VERIFIED on real data (13 MGs, editron_prev) — supersedes the "feed per-moment signals to dials" theory
grounding: probe-proj-rerun.ts output + .calibration-temp dump + overlay-definitions.json + director-agent.ts/intent-translator.ts code
---

# MG Monotony — the REAL root cause is the DIAL LAYER, not signal plumbing

Verification of "B step 1" (the director-agent blend) on `proj_OzG2qgoYudFa`. The verification
**falsified the premise of the fix** and located the actual cause. This is the corpse, with proof.

## What I was about to do (and why it was wrong)
Plan said: monotony = brief graphics starved of per-moment signals → blend per-moment into
`d.params.signals` for `type==='graphic'` (the `else if` at director-agent.ts:638). I implemented it,
then went to verify on `proj_OzG2qgoYudFa`. The verification showed the edit **never fires for this project**.

## PROOF the blend never fired here (data signature, not theory)
`probe-proj-rerun.ts` on the 13 persisted MGs shows per-moment signals that **only `signalsAtFrame`
produces**:
- `visceral_impact: 0.512..0.740` where **max (0.740) == max of `visual_significance` (0.740)** — the
  exact fingerprint of `director-agent.ts:623` (`visceral = max(const, visualSignificance)`).
- `visual_significance` present on 7 MGs, `visual_change_rate: 0.262..0.998` on all 13.
- The `intent-translator.ts:191` `signals:` object (the genreParams path) has **none** of those keys
  (only formality/enthusiasm/warmth/emotional_arousal/pacing/humor/visceral/visual_dependency, all video-level).

→ These graphics carried **no** pre-set `params.signals` → they took the **TRUE branch**
(`if (!d.params.signals)` → `signalsAtFrame`, director-agent.ts:636-637) → they **already** get
per-moment signals. The `else if (d.type==='graphic')` blend only runs when signals are PRE-set
(genreParams present). `proj_OzG2qgoYudFa` has no genreParams. **A live re-run would show ZERO change.**

## Two DISTINCT monotony problems (the plan conflated them)
- **M1 — starved genreParams graphics (REAL, but not here).** When `genreParams` IS present,
  `intent-translator.ts:191` attaches 8 **constant** personality signals → the graphic skips
  `signalsAtFrame` → starved → monotonous. The blend edit fixes THIS. But `proj_OzG2qgoYudFa` can't
  test it (no genreParams), so the edit was **reverted** (don't ship unverified — Rule 34). Recoverable
  from the 2026-06-03 session transcript. Revisit when a genreParams project exists.
- **M2 — the DIAL LAYER doesn't convert signal variation into output variation (the VISIBLE monotony).**
  This is what the founder saw. Signals vary; output doesn't.

## M2 root cause — proven at the dial level
Dump of the 13 MGs:
- **Entrance = `slide-up` on 100% of MGs.** `composition-planner.ts:133` picks the winner of
  `mgWinner(mgScores,'mg.animation.entrance_')`. `mg.animation.entrance_slide`
  (overlay-definitions.json:2462) is scored **only** from `pacing_velocity` + `speech_coverage` —
  **both video-level CONSTANTS** (probe: 0.627 / 0.757, flat across all 13). So slide's score is
  **identical at every moment**; it won all 13 → it wins **every** moment → entrance can **never** vary
  per-moment **by construction**. This is a WIRING defect, not a calibration subtlety: a dial that reads
  only constants cannot produce variety, and no tuner can fix that without rewiring which signals it reads.
  (entrance_pop/scale read the varying `visceral_impact`, but can't beat slide's constant saturated score.)
- **Font size pinned at ~144-151px** (the same float `144.6582015678321` repeats on 5+ MGs).
  `mg.typography.font_size` (overlay-definitions.json:1995) reads `visceral_impact` (logistic slope **1**,
  gentle) + `enthusiasm` (linear, near-saturated at 0.906-0.963). Output lerp 36→160. The gentle curve +
  near-saturated enthusiasm + additive sum **compress** the visceral range (0.51-0.74) into a ~5% band
  near the 160 ceiling → "everything is huge, no hierarchy." This one IS calibration (curve shape) → tuner territory.

## Implications for the plan (the eval/tuner direction)
1. **Validated:** monotony IS a calibration problem → the eval library + tuner we just built is the right
   spine. But the FIRST targets are now named by evidence: the entrance dials + the font_size curve.
2. **One thing the tuner alone CAN'T fix:** `entrance_slide` (and `entrance_speed`, `blur`) read only
   constant signals. The tuner tunes curve PARAMS over a fixed signal→dial wiring; it cannot make a
   constant-fed dial vary. **Rewire the entrance dials to read per-moment signals**
   (visceral_impact / visual_significance / cinematic_moment / visual_change_rate) FIRST, then let the
   tuner calibrate. Same brand-baseline + moment-modulation philosophy the founder set for the blend.
3. **L4 (variety proxy) will now catch this:** 100%-slide + pinned-font is exactly the low-variety the
   aesthetic layer is meant to penalize. Good signal that the eval direction is sound.

## PHASE 1 DONE (entrance wiring rewire) — 2026-06-03, VERIFIED offline on real data
Rewired 7 entrance dials in `overlay-definitions.json` so each reads ≥1 reliably-varying per-moment
signal (visceral_impact / visual_change_rate) + a character signal (brand baseline). `rotate` left as-is
(already read visceral). The two pure-constant dials (`slide`: pacing+speech_coverage; `skew`:
pacing+formality) were the core defect → now `slide` reads visual_change_rate + ¬visceral_impact (yields
at high impact), `skew` reads visual_change_rate.
- **Result (real 13 MGs, scored through the REAL loader+scoreAllOverlays):** entrance `{slide-up: 13}`
  (100%) → `{scale: 6, skew: 5, pop: 2}`. Varies where signals vary.
- **Adversarial sweep (synthetic moments):** calm→fade, punchy→pop, high-motion/low-impact→slide,
  formal→fade, warm/still→blur, extreme→pop. Full vocabulary reachable + sensible. (scripts/verify-entrance-rewire.ts, untracked)
- tsc +0 (196 baseline). JSON parses.
- Curves are DEFAULT shapes ← **Phase-2 tuner calibrates** (per "Both, sequenced").

### Caveats found (honest — not blockers)
1. **6/13 real MGs have IDENTICAL signals** (vi=0.51, vcr=0.50, vsig absent) → all → scale. That's
   `signalsAtFrame` falling back to CONSTANTS on frames with no V-JEPA segment coverage. **Upstream
   signal-COVERAGE gap**, separate from dials — the dial fix is necessary but not sufficient; ~half the
   graphics land on frames with no per-moment data. (Matches the long-standing "cinematic_moment absent /
   per-moment signals sparse on real data" finding.)
2. **Scoring artifact:** additive score = AVERAGE of considerations (utility-scorer.ts:80). When a sparse
   signal (visual_significance) is absent, that dial drops to 1 consideration → no dilution → slight edge.
   scale wins the 6 constant MGs partly via this. Minor; tuner/founder-labels resolve. NOT fixed now (Rule 33 — don't patch; calibrate).
3. Pixel-render of the new entrances NOT done (needs live pipeline). The winner SELECTION (the fix) is
   verified deterministically; the animation PLAYING is not yet eyeballed.

## Lesson
The data contradicted my root-cause story (I'd assumed brief graphics arrive WITH genreParams signals;
this project's arrive WITHOUT). I almost ran a live pipeline to "confirm" a no-op. `probe-proj-rerun.ts`
(read-only) + the dump + the overlay JSON gave ground truth in minutes. Rule 27 (data before theory) and
Rule 10 (grep object-literal `signals:`, not just `.signals =`) both mattered — the `\.signals\s*=`
grep missed `intent-translator.ts:191`.
