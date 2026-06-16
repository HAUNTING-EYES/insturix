---
name: mg-overlay-architecture
description: MG visual properties use the SAME overlay→signal infrastructure as zooms/transitions/filters — no separate hardcoded system
metadata: 
  node_type: memory
  type: project
  originSessionId: a57fdda9-46a8-4ea2-9d98-c16600953870
---

# MG Properties as Overlay Definitions

**Status:** #decided (2026-05-26)
**Why:** Composition planner has hardcoded thresholds pretending to be signal-driven. Binary gates (formality >= 0.4) are profile values with if-statements. The overlay infrastructure already solves this for zooms, transitions, and filters — MG should use the same system.
**How to apply:** When modifying MG composition, add overlay definitions to overlay-definitions.json instead of adding thresholds to composition-planner.ts.

## The Design

MG property overlays join existing overlay-definitions.json (59 current → ~72 with MG):
- `mg.font_size` — considerations: visceral_impact, emphasis, enthusiasm → fontSize 32-200px
- `mg.position` — considerations: face_present, visual.complexity, active_overlays → zone select
- `mg.container_opacity` — considerations: visual_dependency, formality → opacity 0-0.95
- `mg.animation_intensity` — considerations: enthusiasm, visceral_impact → amplitude 0-1
- `mg.font_weight`, `mg.font_family`, `mg.line_height`, `mg.letter_tracking`, etc.

CRG constants = `minValue`/`maxValue` bounds on output params (guardrails, not values).
Actual values = response curve evaluation against signal snapshots.
Threshold bandit calibrates MG properties same as editing decisions.
Graphiti brand preferences (D-015) flow through as signal overrides → MG responds automatically.

## Key Insight (from user, 2026-05-26)

"64 shouldn't be base" — even CRG readability floors aren't BASE values. They're constraints.
The overlay system produces the value. CRG constrains it. Same as zoomScale minValue: 1.1.

"these too are actually templates" — binary thresholds (formality >= 0.4 → container) are profile logic disguised as signal logic. Real signal-driven = response curves with continuous output.

## Full design: `D:\Insturix-Brain\02-Architecture\MG-Signal-Overlay-Architecture.md`

## Related
- [[graphiti-signal-bridge]] — Brand preferences → signal overrides → MG responds
- [[project_mg_signal_expansion]] — 34 signals across 5 dimensions
- overlay-definitions.json — 59 current definitions (zoom, transition, filter, caption, cut, camera)
- composition-planner.ts — REFACTOR TARGET (remove hardcoded thresholds)

Tags: #decided #architecture #motion-graphics #signals
