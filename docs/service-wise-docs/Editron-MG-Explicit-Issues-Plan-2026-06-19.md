# Editron MG Explicit Issues Plan - 2026-06-19

This is the tracked companion to the local MG agent plan under `docs/agents/`, which is ignored by Git. Keep this file as the GitHub-visible issue ledger for MG work.

## Current Red-Test Findings

1. Relation-only facts can lose source evidence before the semantic MG ledger.
   - Example: `from/to` comparison atoms without legacy `text` were suppressed as `missing-source-span`, even though the comparison facts were present.
   - Production owner: `lib/editron/services/mg-content-atoms.ts`.
   - Rule: source span may be derived only from existing content facts, never invented labels or renderer names.

2. Strong moment signals were stripped before the MG semantic gate.
   - `edl-executor.ts` excluded `signals` from content normalization, so scalar MG candidates could not use strong impact/emotion/cinematic evidence.
   - Production owner: `lib/editron/services/edl-executor.ts`.
   - Rule: generic word/speech emphasis alone must not license a weak scalar MG. Only stronger impact/emotion/cinematic evidence can raise salience.

3. Full-frame visual contracts were being forced into corner-card layouts.
   - `mg-expression-authority.ts` treated caption-aware full-frame scenes like normal overlays and moved them to `top-right`.
   - Production owner: `lib/editron/services/mg-expression-authority.ts`.
   - Rule: full-frame/interstitial MGs stay wide/center unless the recipe explicitly asks for a side lane.

4. `composed-structured-claim` is intentional semantic-register reporting, not a preset.
   - Renderer keys and recipe ids remain compatibility/reporting plumbing.
   - Authority must stay with facts, wires, contracts, gates, and deterministic scores.

## Still Open In The MG Plan

- richer fact extraction from real edited moments,
- richer comparison, process, quote, proof, refutation, identity, and data-scene atoms,
- rendered aesthetic proof on real projects, not only metadata,
- calibration of invented layout, size, duration, threshold, and density constants,
- cross-overlay choreography with captions, zoom, transition, and SFX,
- protection against keyword emphasis becoming standalone MGs,
- repeated-form detection across an entire generated video.

## Acceptance Checks

- `tests/editron` stays green.
- Weak scalar stats stay suppressed without relation, bound, magnitude, or strong impact evidence.
- Relation-only comparison facts can create a comparison MG without legacy text fields.
- Full-frame MG visual contracts produce wide/center layouts, not corner cards.
- `graphicType`, recipe ids, and renderer keys remain compatibility/reporting fields, not creative authority.
