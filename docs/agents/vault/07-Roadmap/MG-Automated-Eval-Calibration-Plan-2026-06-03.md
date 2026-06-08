---
tags: [roadmap, motion-graphics, eval, calibration, automated, plan, follow-as-is]
date: 2026-06-03
status: DRAFT — pending CEO + Eng review, then build
authority: founder-directed. Decisions locked below.
grounding: verified live code 2026-06-03 (file:line cited inline). Sits under [[MG-Generative-Build-Plan-2026-06-02]] §13.
supersedes: the "human is the quality judge / harden the existing bandit" framing — automation is now mandatory.
---

# MG Automated Eval + Calibration — Build Plan

## 0. Scope — what this plans (and what it doesn't)
**Plans:** the AUTOMATED quality-measurement harness for motion graphics + the AUTOMATED curve-param tuner that improves them. This is the "calibration" leg of the founder's sequence **form → curves → calibration**.
**Does NOT plan:** the EYES extractor (Stage 2, separately planned) or the generative form/assembler (Stage 3+). This plan *interfaces* with both and is *sequenced behind* them where it depends on them (§3).

## 1. Locked decisions
- **D1 — Eval & tuning are AUTOMATED.** Human review is an *option*, never the gate. (Overrides MG-Generative-Build-Plan §13.6 "human ground-truth mandatory.")
- **D2 — Layer 4 (taste) = option B:** automated distributional proxy + an *optional, periodic* human-calibration hook for the proxy weights. Not a per-render gate.
- **D3 — Founder labels the fixed test set ONCE.** Human-labeled ground truth seeds the loop; thereafter it runs without a human.

## 2. End state (one paragraph)
An automated, **seeded/deterministic, offline** loop that (a) MEASURES every generated MG as a continuous composite ∈ [0,1] of four layers — deterministic legibility, deterministic correctness-vs-meaning, VLM round-trip communication-fidelity, and an aesthetic distributional proxy — and (b) TUNES the signal→curve params that drive the **generated form** toward higher quality. Founder labels a fixed test set once; human review is an optional periodic calibrator of the layer-4 weights (D2).

## 3. Sequencing principle + dependencies
**Founder's truth: form → curves → calibration. You calibrate something that exists.** Therefore split this build:
- **The EVAL HARNESS is built EARLY** — it measures *whatever form exists* (composers today, assembler tomorrow). It is the regression floor AND the automated "does it beat baseline?" judge that Stage 3 needs. Layers 1 & 4 have **no dependency** on the EYES or the new form. Layers 2 & 3 depend on **D3 (founder labels)** + the **EYES extraction** (Stage 2) as the answer-key.
- **The TUNER is built LATE** — only once the generative form + its curves exist (Stage 3–4). Tuning today's template-dials is the one thing we skip (won't transfer when `switch(primary.kind)` dissolves).

## 4. The eval = four layers (verified against code)
| # | Layer | Catches | Automatable | Reuse / build (file:line) |
|---|---|---|---|---|
| 1 | **Legibility/structure** (deterministic) | illegible, overlap, too-small, no focal point, footage contrast | ✅ exists | Harden `structural-gate.ts` (`checkCompositionStructure:64`); revive the **DEAD** footage-contrast (`:137`, no `frameContext` in prod); add render-fit ([MG-Fit]) |
| 2 | **Correctness vs meaning** (deterministic) | "90%"→"90"/"9%"; comparison-meaning→wrong form; refuted→not red | ✅ deterministic | NEW: compare recipe content/colour vs the **EYES extraction** (the extraction *is* the answer-key) |
| 3 | **Communication fidelity** (round-trip VLM) | valid-but-wrong/ambiguous after render | ✅ (comparison, not holistic) | Reframe `aesthetic-gate.ts`: kill auto-pass-100-no-key (`:68-72`), convert holistic 0-100 (`:38-47`) → **structured readback** vs source meaning |
| 4 | **Aesthetic taste** (proxy) | striking vs boring | ⚠️ proxy only | NEW: distributional match to pro reference MGs + variety/no-repeat + motion-congruence law; weights human-calibratable (D2) |

**Key unlock:** layer 2 is the "is it meaningful/right" metric the research said didn't exist — it exists here because the EYES extraction gives per-moment ground truth. Human input collapses to D3 (one-time test set) + D2 (optional proxy-weight tweaks).

## 5. The reward + the tuner (verified constraints)
- **Reward = continuous composite** of layers 1–4. This *rules out* the existing bandit: `OUTCOME_REWARD` is a 3-value enum and `OUTCOME_REWARD[float] ?? 0.5` silently zeroes a float (`threshold-bandit.ts:59-63,186`).
- **Tuning target = the curve params** `{slope, exponent, xShift, yShift, invert, weight, min/max}` per consideration in `overlay-definitions.json` (verified shape at `:1996`), evaluated by `evaluateCurve` (`response-curves.ts:42`) and lerped in `resolveOutputValues` (`utility-scorer.ts:24`). ~176 params. Pointed at the **generated form's** curves, never template-dials.
- **Optimizer:** NOT Thompson-per-param (continuous, coupled, ~176-dim → brutal). Use **black-box optimization** (CMA-ES / Bayesian opt / coordinate descent) over a **fixed offline eval set**, **seeded** (fixes `sampleNormal`'s `Math.random` non-determinism, `threshold-bandit.ts:100-102`, a Rule-18N violation).
- **Single-lerp limitation flagged:** `resolveOutputValues:24` collapses all considerations into ONE `totalScore` per output. The generative form will likely need per-channel output mapping; noted for the form/curves stage, not this plan.

## 6. Phases (each ships + is measured; ≤5 files; verified on REAL renders)
**Buildable now (independent of EYES/form):**
- **P0 — Ground truth + harness skeleton.** I deliver the labeling format; founder fills the fixed test set (per moment: `source_meaning`, `must_show:{value, form_family, semantic_colour}`, optional `quality_ref`). Build the runner (reuse `render-mg-stills.ts` bundle-once + `renderStill`, **no Mongo**) → per-MG scorecard JSON. Snapshot today's 13 baseline MGs as the regression reference. *Verify:* scores produced on the 13; identical across two seeded runs.
- **P1 — Layer 1 (legibility).** Harden `structural-gate` into a normalized score; **revive footage-contrast** (sample real frame brightness behind the MG → pass `frameContext`); add render-fit overflow signal. INVENTED deductions stay observe-only calibration targets. *Verify:* footage-contrast now FIRES on a real bright-frame render; look at the pixels (adversarial-verify the flagged case is genuinely low-contrast).
- **P2 — Layer 4 (aesthetic proxy) + D2 hook.** Build pro reference property distributions; score distributional fit + variety + motion-congruence. Proxy weights in config, optional founder calibration (D2); defaults flagged INVENTED. *Verify:* thin keyword-box scores LOWER than a pro-like rich graphic; deterministic.

**Gated on D3 labels + EYES (Stage 2):**
- **P3 — Layers 2+3 (correctness + communication).** L2: deterministic compare of recipe content/semantic-colour vs EYES extraction. L3: render → cold VLM structured readback → compare to source meaning (Rule 35 prompt: XML, data last, seed); **measure the readback error-rate vs founder labels** so its reliability is known (calibrated, not raw). Reframe `aesthetic-gate` accordingly. *Verify:* L2 catches "90%"→"90" deterministically; L3 error-rate reported, not assumed.
- **P4 — Composite + automated baseline-judge (EVAL COMPLETE).** Continuous composite (documented weights; L4 weight human-calibratable) + hard legibility floor. This is the automated "beats baseline?" judge for Stage 3 + the regression floor. *Verify:* composite ranks baseline sensibly; thin boxes low; seeded-stable. **GATE: eval done; tuner waits for the generative form+curves.**

**Gated on the generative form + curves (Stage 3–4):**
- **P5 — Curve-param tuning surface.** Writable curve store + SEEDED sampler/perturber over the §5 params, pointed at the generated form. *Verify:* read/perturb/write; same seed → same perturbation.
- **P6 — Automated tuner.** Black-box opt over curve params vs the composite reward on the fixed set, offline. Guardrails: multi-layer composite (no single-VLM runaway), convergence logging, before/after on a held-out slice. *Verify:* improves composite on held-out; tuned params transfer.
- **P7 — Calibration on real videos (ongoing).** Run tuner across the reference set; founder's optional periodic spot-checks calibrate L4 weights (D2).

## 7. Honesty + verification discipline (non-negotiable)
- The SYSTEM generates/scores; never hand-author an answer and call it generated.
- Verify on REAL renders — look at the pixels. NOT the 112-test suite (injects scores). Adversarial-verify before "works."
- Every threshold traces to a source or is flagged ⚠️INVENTED (the structural-gate deductions, L4 weights start invented → calibration targets).
- Per code-file edit: the Evidence Block (E1–E5), Step-0 cleanup if >300 LOC, phased ≤5 files, `tsc --noEmit` (+0 over the 196 baseline) + `eslint`, re-read before/after edit.

## 8. Footguns
NEVER `git add -A` / `git add scripts/` (untracked scripts hold a live Mongo URI). Push `origin` only, never `haunting`. `render-mg-real.ts` = decoy. `aesthetic-gate` auto-passes 100 with no key (we kill that in P3). proj_OzG2qgoYudFa is in `editron_prev`.

## 9. Open risks
- L3 round-trip VLM has its own misread failure mode → P3 measures its error-rate vs labels before trusting it.
- L4 proxy rewards conformity to references → variety law + D2 human weights mitigate; honestly a proxy, not truth.
- Render-failure poisoning (blank → low score → blames the curve) → P0 captures [MG-Render]/[MG-Fit] logs so blanks aren't silent.
- The fixed test set is small (~13) → expand for content diversity (Rule 0) before trusting tuned params broadly.

## 10. What we explicitly do NOT do
Reuse the bandit for curves; use a holistic VLM score as reward; let `aesthetic-gate` auto-pass-100; average per-moment signals to one global snapshot for per-moment MGs; tune today's template-dials.

## 11. Review amendments (CEO + Eng, 2026-06-03) — BINDING
Both reviews ran HOLD SCOPE. Verdict: **REVISE → approved with these changes.** Locked decisions unchanged.

**Shape (CEO):** Approach **B** — build the **deterministic core (L1 legibility + L2 correctness) FIRST** as the v1 automated baseline-judge; L4 then L3 are fast-follows; tuner (P5-7) stays gated on the generated form existing. Extend the existing `scripts/mg-eval.ts`; do NOT fork a parallel harness.

**CEO changes:**
- C1: Reconcile/extend `mg-eval.ts` + `eval-mg-gate.ts` (no parallel fork).
- C2: Specify L3 comparison + add fail-loud L3 fallback (see E5). Kill `aesthetic-gate.ts:68-72` auto-pass-100.
- C3 (doc): L2 ground truth = founder labels on the fixed set; tuner runs on the labeled set ONLY; production L2 is best-effort/advisory.

**Eng changes (file-level):**
- **E1 (CRITICAL):** render-validity gate — throw/blank/`[MG-Fit]` overflow → `status: INVALID`, excluded from composite AND tuner reward, logged loud. Never score a broken render as 0. (Consume the `[MG-Render]`/`[MG-Fit]` logs `render-mg-stills.ts` already captures.)
- **E2:** every layer returns `{score|null, status}`; composite renormalizes over present layers, marks `DEGRADED`. No absent layer silently = 0.
- **E3 (doc = C3):** tag `groundTruthSource: human-label|extraction|none`; tuner consumes human-label only.
- **E4:** seed everything — new tuner sampler uses a seeded PRNG (not the `threshold-bandit.ts:100` `Math.random`); verify/seed the eval render path (scramble/particles `Math.random`); harness determinism test (run twice → identical).
- **E5:** L3 = VLM emits structured `{value,claim,polarity}` readback → deterministic compare to ground truth (field-match), NOT a holistic score, NOT string-equality. Fail-loud degrade if VLM errors/unparseable/below measured-accuracy bar.
- **E6:** one eval library `lib/editron/motion-graphics/engine/eval/` (layers = pure fns); `mg-eval.ts` + production observe-path both import it; `eval-mg-gate.ts` folds into L1.
- **E7 (P5-7):** tune on the render-FREE deterministic composite (L1-recipe + L2 + L4); L3 + footage-contrast only at validation checkpoints; per-dial-group seeded CMA-ES (Layer-1 lib); offline; candidate store promoted only by beat-the-baseline regression gate.
- **E8 (CRITICAL):** who-evals-the-evaluator tests ship WITH the harness — each L1 check fires/passes; L2 catches "90%"→"90"/wrong-form/wrong-colour; L3 comparator deterministic; composite null + render-INVALID handling; full-harness determinism; golden regression on the 13 baseline scores.

**Near-term must-haves (to start):** E1, E2, E4, E5, E6, E8 + C1, C3. E7 gated to P5-7.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | REVISE→approved | premise SOUND (defuses rebuild fear); 3 changes (C1-C3) + Approach B |
| Eng Review | `/plan-eng-review` | Architecture & tests | 1 | REVISE→approved | 8 changes (E1-E8); 4 silent-failure landmines closed |

- **UNRESOLVED:** none — all findings folded in.
- **VERDICT:** CEO + ENG CLEARED (REVISE applied) — ready to implement the deterministic core (P0 harness skeleton + P1 L1 + L2), tuner gated to P5-7.
