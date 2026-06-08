---
tags: [research, motion-graphics, generative, open-approach, guardrails, decided-direction]
date: 2026-06-02
source: deep-research wf wmg3o52b6 (SEARCH ok; VERIFY broke — see caveat)
---

# MG — Shortcomings of the OPEN approach (B) — research 2026-06-02

For [[MG-Generative-Build-Plan-2026-06-02]] §13. Question: real failure modes of OPEN structure-extraction → OPEN motion-graphic generation, and whether the guardrails (eval / confidence-gate / VLM-judge) actually hold.

**CAVEAT (honesty):** the SEARCH phase worked — 28 sources, 46 claims, **10 PRIMARY papers**. The adversarial VERIFY phase **broke again** (every verifier subagent failed to emit StructuredOutput → all 25 claims logged "0-0 abstain" then mislabeled "killed / inconclusive"). So claims are **primary-sourced but NOT double-verified by the harness.** Direction is convergent across many papers → trust the direction; verify a specific number before leaning on it. Did not re-run (verifier fails the same way each time).

## The 3 real shortcomings of B
1. **No auto-detector for "valid-but-wrong / meaningless" output — the core unsolved problem, and WHY everyone ships a menu.** Calliope (arXiv:2010.09975, PRIMARY, 5 claims) deliberately uses a CLOSED 10-fact menu (Difference/Proportion/Trend/Categorization/Distribution/Rank/Association/Extreme/Outlier/+aggregation, from DataShot). Authors: unconstrained representation → redundancy/overlap/ambiguity; their generation "cannot guarantee meaningful output" (scores statistical importance, not meaning) = admitted key limitation. No automatic metric for meaningfulness → cannot self-certify.
2. **VLM-as-JUDGE is unreliable in its naive (holistic-score) form.** Convergent: un-nudged VLM rates misleading charts HIGH unless told to look for errors (2602.05662); can RANK but not SCORE — ~32-34% exact agreement, MAE ~1.0, 24-30% off by ≥2 (2604.25235); compression + leniency bias → passes bad output, penalizes good (2604.25235, 2503.05977); even GPT-4o 33-60% agreement, needs a human reference; unstable under irrelevant perturbations (2604.18164). **FIX:** JUDGE = explicit STRUCTURED CHECKS (a fixed checklist) + VLM only as flag/assist + HUMAN as the real gate.
3. **CONFIDENCE-GATE on RAW LLM confidence is unreliable.** Verbalized confidence ≈ random for gating (AUROC ~0.52-0.605, 2306.13063); systematically overconfident/miscalibrated (TACL abstention survey; 2504.12098 GPT-3.5 95%-req → 6.16% hit; 2510.26995 nominal 99% interval covers truth ~65%); abstention brittle/prompt-sensitive, doesn't generalize. **FIX:** calibration layer — post-hoc conformal prediction restores nominal coverage + cuts interval score 54% (2510.26995) — OR eval-measured per-structure thresholds. NOT raw model confidence.

## Implication for the plan (sharpens B, does NOT kill it)
B (open) stays the target; the guardrails must be the HARDENED versions:
- **JUDGE = symbolic LAWS as a structured checklist** (legibility / value-correctness / motion-congruence) + VLM as flag-only + HUMAN as the real gate. (Aligns with "keep laws symbolic.")
- **CONFIDENCE GATE = calibrated** (conformal / eval-measured per-structure thresholds), not raw LLM confidence.
- **EVAL with human ground-truth is MANDATORY** (no auto-metric for meaningfulness).
This matches the staged plan's instincts (laws symbolic, eval-first, human gate) — it kills only the NAIVE guardrail shortcuts (VLM-as-scorer, raw-confidence gate). #decided

Primary sources: arXiv 2010.09975 (Calliope), 2602.05662 (chart integrity / VLM), 2604.25235 (VLM rank-vs-score), 2604.18164 (26-MLLM judge survey), 2503.05977 (video-LLM judge), 2306.13063 (confidence elicitation), TACL abstention survey, 2504.12098 (numeric confidence), 2510.26995 (intervals + conformal), openreview JJPAy8mvrQ.
