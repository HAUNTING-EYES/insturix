---
name: project-signal-driven-density-v3
description: "V3 architecture for signal-driven graphic density. Replaces profile-based density with equation computed from content signals. Needs calibration against reference videos. Design approved in CEO review, implementation deferred to next session."
metadata: 
  node_type: memory
  type: project
  date: 2026-05-20
  originSessionId: b0f0681b-c901-4f84-966f-f720f49025bb
---

# Signal-Driven Graphic Density (v3 Design — NOT YET IMPLEMENTED)

**Why:** Profile-based density ("moderate" = 5 graphics) is static and disconnected from content. Signal-driven density reads the content and computes the right number.

**How to apply:** Build this in the next session. v2 deterministic fixes (bypass removal, budget overrides, safety net cap, narrow prompt rules) are shipped. v3 is the next architectural step.

## Architecture

```
Content Signals (speech rate, entities, formality, motion, face)
  → resolveGraphicBudget() → "this video gets N graphics"
  → scoreOnScreenTextEntries() → ranked list by confidence
  → Take top N entries → pass to LLM as specific list
  → LLM picks type + trigger moment (creative judgment)
  → EDL executor applies (execution)
  → Budget guardrail catches overflow
```

## The Equation (needs calibration)

```
budget_per_10min =
  entityRate × 0.5
  + (1 - formality) × 2.0
  + (topicBoundaryCount / durationMin) × 0.3
  - speechCoverage × 1.0
  + motionIntensityAvg × 0.5
  - (hasFacePresent ? 1.5 : 0)
  + speechEnergyAvg × 0.5
```

Coefficients are v0 GUESSES. Must calibrate against real videos.

## Calibration Plan

1. Scan top creators' existing videos as calibration data (user's idea)
2. Use creative production knowledge doc examples as ground truth
3. Launch with coefficients tuned to match v2 behavior (no regression)
4. User corrections on the platform feed back to improve coefficients over time
5. Test against 10-20 diverse reference videos, aim for 95%+ alignment

## Per-Entry Confidence Scoring

Pattern-matching + timing/context:
- Contains number: +0.4 (regex)
- Contains proper noun: +0.3 (capitalization)
- Contains CTA: +0.3 (regex)
- In opening scene: +0.25
- In closing scene: +0.25
- Near topic boundary: +0.15
- In high-energy scene: +0.1

## Gaps To Address

1. Only 8 of 47 signals available at planning time (need to extract more from ThinkForge system)
2. Unified Intelligence path doesn't compute genre parameters (needs fix)
3. Text-pattern scoring can't distinguish "73% of users" (thesis) from "born in 1973" (trivia)
4. No timing/context beyond scene position (narrative importance needs LLM or deeper analysis)

## Related

- [[feedback-no-profile-default]] — NEVER default to profile-based logic
- [[project_mode2_signal_architecture]] — Mode 2 is signal-driven
- [[insturix_vision]] — reduce LLM dependency, rule-driven over probabilistic
