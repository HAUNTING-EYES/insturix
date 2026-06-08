# D-014: Utility AI Decision Engine

## Status: #decided (2026-05-24)

## Decision
Replace CRG mapping engine + profiles with Utility AI (overlay signatures + response curves).

## What It Is
Each overlay (zoom_push, dissolve, warm_filter, stat_counter, etc.) has 3-5 "considerations." Each consideration maps one signal through a response curve to produce a 0-1 score. Scores multiply. Highest-scoring overlay per category wins.

## Key Design Choices
- **Response curves** (not flat weights, not thresholds). 6 curve types: linear, polynomial, logistic, logit, normal/bell, sine. Each has 4 parameters.
- **Multiplicative scoring** with compensation factor. Any consideration scoring 0 = veto. A/B test multiplication vs summing.
- **Zero-weight = excluded.** Overlays only have considerations for signals they care about.
- **Derived signals for pairing.** zoom_active becomes a signal that SFX can consider. Emergent pairing, not bundled overlays.
- **1D curves primary.** 2D surfaces for rare known signal interactions only. Never 3D+.
- **Decision inspector** for debugging. Scorecard at each grid point showing all candidates, all scores, all curve outputs.

## Calibration Strategy
1. CRG baseline: existing 95 rules bootstrap initial curve shapes
2. User feedback at scale: 100+ users, track kept vs changed decisions, adjust curves from aggregate behavior

## Build Approach (Elon-approved)
1. Phase 1: Linear considerations only. Test against CRG output.
2. Phase 2: Add response curves. Beat CRG on nuance.
3. Phase 3: Thompson sampling on curve parameters. Visual curve editor.

## What It Replaces
- 95 CRG mappings (signal→decision rules)
- 54 static profiles (filters, captions, transitions)
- Signal-driven routing for decision engine (routing stays for creative brief only)

## What It Doesn't Replace
- Creative brief (narrative-level decisions, story arc) — LLM territory
- EDL executor (applies decisions to timeline) — unchanged
- Signal registry (computes signals) — unchanged, just feeds into new engine

## Related
- [[Utility-AI-Architecture]] — full research
- [[Visual-Intelligence-Architecture]] — simplified by this decision
- [[D-001-Extend-Signal-Registry]] — signal sources unchanged

Tags: #decided #architecture #utility-ai
