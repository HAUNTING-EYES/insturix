# Utility AI Architecture — Research for Editron Decision Engine

## Status: Researched 2026-05-24. Under CEO/Eng review.

## What Is It
Dave Mark's Infinite Axis Utility System. Production-proven in AAA games for 15+ years (The Sims, Zoo Tycoon 2, etc.). The game AI and recommendation system industries independently converged on this pattern.

## Core Concepts

### Decision/Behavior
An action the system can take. In our case: zoom_push, dissolve, warm_filter, stat_counter, etc.

### Consideration
A single axis of evaluation. Maps one signal through a response CURVE to produce a 0-1 score. NOT a threshold check. NOT a linear weight. A CURVE.

### Response Curves
Six types, each with 4 parameters (slope, exponent, x-shift, y-shift):
- **Linear**: `m * (x - b) + c`
- **Polynomial/Quadratic**: `m * pow(x - b, k) + c` (k>1 = slow start/fast finish)
- **Logistic** (S-curve): `m / (1 + exp(-10k(x - 0.5 - b))) + c`
- **Logit**: inverse of logistic
- **Normal/Bell**: `m * exp(-30k(x - b - 0.5)^2) + c` (peaks at center)
- **Sine**: oscillating response

### Scoring
Scores are MULTIPLIED (not summed). If any consideration = 0, decision scores 0 (built-in veto).

Compensation factor for N considerations: `factor = 1 - 1/N`
Modified score: `score + (1 - score) * factor * score`

### Selection
Three options: (1) highest score, (2) weighted random, (3) weighted random from top-N. Option 3 recommended for variety.

### Dual Utility (rank + weight)
Some decisions outrank others regardless of score. Zoo Tycoon 2 example: normal behaviors rank 0, dying rank 1,000,000.

### Inertia
25% bonus to last-chosen action prevents oscillation between close scores.

## How It Maps to Editron

| Utility AI Concept | Editron Equivalent |
|---|---|
| Decision/Behavior | Overlay type (zoom_push, dissolve, stat_counter) |
| Consideration | Signal → curve → score (overlay signature component) |
| Input Axis | One of 34 signals (speech_energy, enthusiasm, etc.) |
| Response Curve | How much this signal matters for this overlay |
| Decision Score | How well this overlay fits this moment |
| Selection | Which overlay to apply at this 500ms grid point |

## vs Current CRG System

| Dimension | CRG (current) | Utility AI (proposed) |
|---|---|---|
| Decision mechanism | IF signal > threshold → action | Score ALL actions, pick best |
| Expressiveness | Binary (above/below threshold) | Continuous (curves express nuanced preference) |
| Multi-signal | AND conditions (all must pass) | Multiplication (all contribute, weighted by curve) |
| Adding new action | Write a new CRG mapping | Define considerations + curves |
| Debugging | Grep which rule fired | Decision inspector shows all scores |
| Parameter count | ~190 thresholds across 95 rules | ~800 curve params across 50 overlays |
| Scalability | ~300 rules before conflicts | ~500+ overlays (no rule conflicts — scoring) |
| Continuous output | No (preset params) | Yes (score = strength of effect) |

## Debugging Solution: Decision Inspector

Log at each grid point:
```
FRAME 450: zoom_push=0.75, sfx_whoosh=0.68, dissolve=0.32, stat_counter=0.11
  zoom_push breakdown: speech_energy(0.72→quad→0.93) × enthusiasm(0.65→lin→0.84) × motion(0.15→inv→0.96)
```

Every score traceable to: input value → curve type → output score → product. More debuggable than CRG because you see ALL candidates, not just the one that fired.

## Implementation Phases

1. **Phase 1 (validate)**: Linear considerations only. Test against CRG output.
2. **Phase 2 (surpass)**: Add response curves. Beat CRG on nuance.
3. **Phase 3 (self-improve)**: Thompson sampling on curve parameters. Visual curve editor.

## What Utility AI CANNOT Do
- Narrative structure (full-video story arc) → LLM creative brief
- Semantic understanding (humor, sarcasm, irony) → LLM
- Categorical decisions with no gradient (dissolve vs hard-cut TYPE) → rank/priority system

## Production Resources
- Dave Mark, "Behavioral Mathematics for Game AI" (2009)
- Game AI Pro Chapter 9: "An Introduction to Utility Theory" — https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter09_An_Introduction_to_Utility_Theory.pdf
- Curvature wiki (Infinite Axis system): https://github.com/apoch/curvature/wiki/Utility-Theory-Crash-Course
- Unreal Engine UtilityAI Plugin: https://github.com/bohdon/UtilityAIPlugin
- Dave Mark GDC talk (2010): https://www.gdcvault.com/play/1012410/Improving-AI-Decision-Modeling-Through
- "Jointly-Learned State-Action Embedding" (arxiv 2020): https://arxiv.org/pdf/2010.04444
- "Reinforcement Learning with Parameterized Actions" (2016): https://arxiv.org/pdf/1509.01644

## Related
- [[Visual-Intelligence-Architecture]] — how visual signals feed into decisions
- [[Signal-Registry-Deep-Dive]] — the 34 signals that become consideration inputs
- [[Codebase-Graph]] — executeDirectorPlan() is the insertion point
- [[MG-Engine-State]] — MG composition already works this way (signal → recipe)
- [[D-009-Merge-Logic]] — how utility decisions merge with creative brief decisions

Tags: #research #architecture #utility-ai #decision-engine
