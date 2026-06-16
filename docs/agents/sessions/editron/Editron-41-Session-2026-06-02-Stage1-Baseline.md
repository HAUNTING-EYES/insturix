---
tags: [session, motion-graphics, stage-1, baseline, decided]
date: 2026-06-02
branch: infrastructure-improvs-+Editron
---

# Session 2026-06-02 — Stage 1 Safe-Wins + MG Baseline (the yardstick)

Part of the staged MG generative build. Authoritative plan: [[MG-Generative-Build-Plan-2026-06-02]] §13 (the staged path, after the 6-lens review). North star unchanged: signals BUILD the MG from primitives, no templates — reached safely via stages, keeping the composer fallback until the generator beats it.

## Stage 1 done (committed LOCALLY on infrastructure-improvs-+Editron, NOT pushed)
- **`5a819519` fix(mg)** — repaired the latent `selectWinners` crash in `director-agent.ts` Path-D utility block. The live call passed `frame` (a number) where a `recentDecisions` Map was expected → `.get()` threw → the `catch` swallowed it (the dead path reported as "skipped"). Fix: maintain `recentDecisions` across grid points (per-category min-gap, as the signature intends), correct 3-arg call, **fail-loud in dev** / non-fatal in prod. Behind off-by-default `useUtilityLive` → **no live-output change**. Verified: tsc +0 (196 baseline), eslint clean. #decided
- **`b58ed3b6` chore(mg)** — deleted dead preset theme `themes/minimal-tech.ts` (zero importers, verified by path AND export-name grep). Also deleted stray untracked `.g1-diff.txt`.
- **RESCUED from deletion: `aesthetic-gate.ts`** — it is a *built* Gemini-Flash vision quality gate (readability/contrast/hierarchy/overlap, 0-100, threshold 70, `seed:42`, XML rubric). Dormant (no callers) but it is exactly the JUDGE organ the reviews want → **KEPT** as the Stage-6 quality-gate seed. Lesson: "look before you delete" — the §12 delete list was mostly **WIRED** (composition-templates / MotionThemeContext / StatCounter / crg-validator are the live composer+fallback system → deferred to Stage 6, not dead).
- **GSAP decision: DELETE (use our own deterministic code).** Correction to an earlier oversimplification: GSAP's easings ARE deterministic; the real hazard is preview-vs-render-farm divergence, and the bezier fallback blandifies elastic/bounce. So: rebuild elastic/bounce/back as our own deterministic easings (Stage-5), delete the dead plugins (scramble uses Math.random). Not a Stage-1 quick-delete (touches the renderer). #decided
- **3 dead dials** (`saturation_boost`/`surface_complexity`/`entrance_speed`): deferred to Stage 4 — no consumer until the assembler exists; wiring now would be un-exercised.

## The YARDSTICK — baseline of current real output (proj_OzG2qgoYudFa, editron_prev, 13 MGs)
Rendered the REAL `MotionGraphicLayerContent` to 13 PNGs via `dump-proj-mgs` + `render-mg-stills` (`.calibration-temp/mg-stills/proj_OzG2qgoYudFa/`). 13/13 OK, **zero render errors, zero fit warnings**. Composition: **8 keyword-highlight, 4 stat-counter, 1 callout**.

Honest visual assessment (the "before" Stage 2+ must beat):
1. **THIN** — every graphic is a small box in one corner; ~75% of the frame is empty. The "5% problem" made visible.
2. **MONOTONY** — 8/13 are the identical word-in-a-box.
3. **LOW-CONTRAST captions** — muted gray secondary text on dark.
4. **CRAMPED** left padding on bottom-left stats.
5. **BUG**: the "90%" stat renders as **"90"** — the % is dropped (stored value is "90%", room to spare so not a clip). Wrong number on screen. ("1/3" fraction renders correctly — the past fix holds.) → candidate fix in the stat composer.
6. Positive: no crashes, legible, gold-on-dark readable.

## Next: Stage 2 = the EYES (extraction) — the keystone
Bimodal: **heard** (transcript → structure: comparison / proportion / trend / negation) + **seen** (visual signals + face/free-space). Eval/answer-key FIRST ([[Rule-35]]). Metric = per-structure precision + recall (confusion matrix). "Unsure → keyword fallback." See [[MG-Generative-Build-Plan-2026-06-02]] §13.2 stage 2.

Footguns held: pushed nothing; staged only explicit paths (never `git add -A` — scripts hold the Mongo URI); verified on REAL renders, not the 112-suite.
