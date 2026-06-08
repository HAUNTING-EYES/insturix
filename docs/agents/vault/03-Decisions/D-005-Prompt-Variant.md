# D-005: Creative Brief Prompt Variants

## Status: #decided (editron 26, 2026-05-23)

## Decision
Create NEW prompt variants for non-speech content types, each with its own eval harness (Rule 35). Do NOT modify the existing speech prompt.

## Variants Needed
1. **Speech path**: Current prompt (word indices, narrative arc). UNCHANGED.
2. **Music path**: Beat indices as coordinates, section boundaries (verse/chorus/bridge), energy curve peaks
3. **Visual path**: Shot changes as coordinates, motion events, subject appearances/disappearances
4. **Hybrid**: All coordinate systems available, priority rules for conflicts

## Implementation
- ~90 LOC total change to creative-brief.ts (type definition + prompt selection logic + new prompt templates)
- Each variant needs its own eval harness: ground truth dataset + multi-seed testing (seeds 1-10)
- Pass threshold: min(F1) >= 0.85 across all seeds (per Rule 35)
- Existing speech eval harness: scripts/eval-creative-brief-graphics.mjs (baseline: 0.951 avg composite)

## The Hard Part
The Gemini prompt has 12+ references to word indices baked in. Not a find-replace — narrative arc, distribution rules, and anti-patterns all reference word positions. Each new variant is essentially a NEW prompt.

## Related
- [[Visual-Intelligence-Architecture]]
- [[D-004-Signal-Driven-Routing]]

Tags: #decided #prompts #creative-brief
