---
name: Mode 1 Enhancement Opportunities (TODO — not current priority)
description: Tech from Mode 2's signal stack that could improve Mode 1. Documented for later, NOT current work.
type: project
originSessionId: fa54756f-5944-4efd-825d-c6d862dbeca7
---
# Mode 1 Enhancement Opportunities — For Later

**Status:** DOCUMENTED, NOT ACTIVE. Mode 2 is current priority.
**Why documented:** These are real improvements but Mode 2 quality comes first.

## 1. Constraint Enforcer on Mode 1 LLM Output
Mode 1's Unified Intelligence LLM output goes directly to Intent Translator with ZERO constraint checking. The 50-constraint enforcer (8-pass) only runs in Path D. Adding it after Intent Translator would catch LLM hallucinations (flash rate violations, transition during speech, pacing monotony, etc.).
**Effort:** One import + one function call. Low.
**Impact:** Catches bad LLM decisions before EDL execution.

## 2. Genre Parameters → LLM Prompt
Instead of the LLM guessing pacing/transition density, compute genre parameters from 5-Track data first (the computer already works on AssetAnalysis[]), inject as constraints: "pacing_tolerance is 5, zoom_budget is 8."
**Effort:** Medium — need to wire genre-parameter-computer into Unified Intelligence prompt builder.
**Impact:** LLM makes more grounded creative decisions.

## 3. Humanize Pass on Mode 1 EDL
Mode 1 cuts are metronomic. The humanize pass (273 lines) works on any EditDecision[]. One function call after Intent Translator.
**Effort:** Trivial.
**Impact:** More organic-feeling edits.

## 4. Thompson Sampling for Mode 1
Bandit tracks per-user preferences across projects. Could adjust Mode 1's profile actions. But integration point differs (profile params vs genre dials).
**Effort:** Medium — needs design work.
**Impact:** Mode 1 learns per-user preferences.

## 5. SceneSlots Passthrough at Pipeline Handoff
export-for-editron throws away structured SceneSlots data. Passing `block.scene.subjects[]`, `block.scene.mood`, `block.scene.onScreenText[]` through saves tokens and improves accuracy.
**Effort:** Medium — modify export route to pass structured fields as LLM hints.
**Impact:** Better scene extraction, fewer tokens.

## 6. Architect Agent → Pipeline
If user already ran Architect in ThinkForge (shot lists, B-roll, music direction), should override LLM scene parser guesses.
**Effort:** Medium.
**Impact:** Honors user-approved creative decisions.
