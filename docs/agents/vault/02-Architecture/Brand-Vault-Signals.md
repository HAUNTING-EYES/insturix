---
tags: [architecture, brand, signals, motion-graphics, open, todo]
date: 2026-06-03
status: #open — recon of what the brand vault actually holds + the gap for brand-driven form
grounding: brand-registry.ts:19-42 (UnifiedBrand), verified 2026-06-03
---

# Brand Vault — what we actually have (and the gap)

## What `UnifiedBrand` contains today (brand-registry.ts:19-42)
```
UnifiedBrand {
  brandId, userId, name
  voice:  { voiceLock?, nicheMap?, killList[], hookArchetypes[], structuralHabits[] }
  visual: { industry?, colors[], visualStyle?, typography? }
  learning: { banditProjectCount, lastLearnedAt? }
}
```
- **Structured & usable:** `colors[]` (hex palette), `industry?`.
- **Free-text only (NOT machine-usable dials):** `visualStyle?` and `typography?` are unstructured strings (e.g. "modern minimal", "bold"). A generator can't read a string as a dial.
- **Voice (not visual):** voiceLock / nicheMap / killList / hookArchetypes / structuralHabits — these shape COPY/script, not MG form.
- **Per-brand learning hook exists:** `banditProjectCount` (a bandit learns per brand over projects).

## ⚠️ Correction: `formality` is NOT a brand-vault field
`formality` is a **content/personality signal** derived from the actual transcript/footage (creative-brief / personality analysis), not from the brand. It varies per video, not per brand. (Verified: no `formality` in `UnifiedBrand`.) So "formality of the brand" conflates two different things — worth keeping straight.

## The gap (why brand-driven form doesn't work yet)
For "90% → a minimalist brand shows the number, a data-forward brand shows a pie" to be a real decision, the generator needs **structured brand signals** like:
- `minimalism` / `density_tolerance` (number vs chart vs rich infographic)
- `data_viz_affinity` (does this brand use charts at all)
- `expressiveness` / `motion_energy` (calm vs punchy)
- `geometry_tendency` (sharp/angular vs round/soft — bouba/kiki)
- `decoration_tolerance` (flat vs layered)

**None of these exist.** The vault gives the form engine a colour palette + two free-text strings. That is not enough to make encoding brand-dependent.

## TODO (founder-requested 2026-06-03): EXPAND the signals in/from the brand vault
Define + populate **structured visual brand signals** the MG assembler can read as dials. Options (decide later, deliberate per Rule 17N):
1. **Extract** structured signals from the existing free-text `visualStyle`/`typography` + `colors` via an LLM pass (Rule 30: language→structure is acceptable LLM use) — cheap, no schema change.
2. **Add** explicit structured fields to `UnifiedBrand` (schema change + a brand-onboarding step to populate them).
3. **Learn** them per brand from outcomes (the `banditProjectCount` hook already implies per-brand learning).
Likely a blend: extract a first guess from free-text, refine by learning.

## Design note — how brand caters to form (the part to think through)
- **Structure is brand-invariant** (a proportion is a proportion). EYES extract it; L2 answer-key labels it.
- **Encoding is brand-chosen** (number vs pie). The assembler picks it from these (missing) structured brand signals × content × legibility laws.
- **Eval implication:** L2's form-check must accept ANY brand-appropriate encoding of the right structure (it already allows multiple kinds per family, e.g. `trend → [data-series, numeric]`). It must flag WRONG STRUCTURE, not "chart instead of number."
- Web research on "what good MGs look like" feeds the **L4 aesthetic proxy** + a **brand-affordance library** (which encodings suit which brand archetype) — do that when building L4, don't fake it now.
