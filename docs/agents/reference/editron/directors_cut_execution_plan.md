---
name: Director's Cut Execution Plan
description: The approved implementation plan for the new editing architecture. 6 steps, 3 parallel lanes. Save/restore this for build sessions.
type: project
last_updated: 2026-05-16
originSessionId: 5f452046-b999-4da8-a8d4-87e48c82ad19
---
# Director's Cut — Execution Plan (APPROVED 2026-05-16)

## Design Doc
`~/.gstack/projects/Insturix-Front-End/admin-infrastructure-improvs-+Editron-design-20260516-180000.md`

## Architecture Summary
- 1 Grok STT + 2 Gemini calls (one context-cached) per video
- Gemini Creative Brief (holistic decisions) + Deterministic Brief Executor (frame mapping)
- Pre-edit panel for user preferences, learning loop from renders
- No profiles, no content-type routing, no signal-executor, no decision budget
- Creative knowledge graph = Gemini's reference material (context cached), not executable code
- Constraint enforcer + humanize pass kept as safety net

## Steps

### STEP 1: Foundation (zero production risk)
- 1A: Extract `EditDecision`/`EditDecisionList` types from signal-executor.ts → `lib/editron/types/edit-decision.ts`
- 1B: Fix Wav2Vec GCS URL bug in `modal/wav2vec_vocal.py` + deploy to Modal
- 1C: Write V-JEPA Modal Python endpoint (`modal/vjepa_visual.py`) + deploy
- 1D: Fix gemini-model-factory.ts model IDs to verified-valid ones
- VERIFY: Wav2Vec + V-JEPA return real data for a test video

### STEP 2: New Pipeline Core (alongside old, not replacing)
- 2A: Build `lib/editron/services/creative-brief.ts` (~400 LOC)
- 2B: Build `lib/editron/services/brief-executor.ts` (~300 LOC)
- 2C: Build `schemas/EditronPreferences.ts` (~60 LOC) + MongoDB collection
- VERIFY: Creative Brief produces valid JSON for 3 test videos

### STEP 3: Wire into Director (feature flag)
- 3A: Add USE_CREATIVE_BRIEF feature flag check in director-agent.ts
- 3B: New path: creative-brief → brief-executor → humanize → constrain
- 3C: Old path unchanged (runs when flag off)
- VERIFY: Same video through both paths, compare

### STEP 4: Pre-Edit Panel
- 4A: Build pre-edit panel React component
- 4B: Wire preferences → Creative Brief service
- 4C: Store preferences per project in MongoDB
- VERIFY: User preferences reach Gemini context

### STEP 5: Validate + Switch
- 5A: Test 5+ real videos (different content types)
- 5B: Compare old vs new pipeline output quality
- 5C: Flip flag to USE_CREATIVE_BRIEF=true
- 5D: Monitor 1 week

### STEP 6: Cleanup
- 6A: Delete 12 signal-processing files (~5,410 LOC)
- 6B: Remove feature flag
- 6C: Update imports in constraint-enforcer + humanize-pass

## Parallelization
- Lane A: 1B + 1C (Modal deployments) — parallel with everything
- Lane B: 1A + 1D (types + model fix) — parallel with everything
- Lane C: 2A (Creative Brief) — parallel with A/B
- Then: 2B + 4 (Brief Executor + UI) — after 2A
- Then sequential: 3 → 5 → 6

## Key Decisions
- V-JEPA + Wav2Vec both in Phase 1 (not deferred)
- Transition dead code verified + deleted in Phase 2
- Strangler fig migration (feature flag, old path stays until verified)
- Gemini model IDs must be API-tested before committing (Rule 29N)

## Component Verification Status
- Context cache: WORKS (model factory needs fix)
- Frame snaps: WORKS
- Humanize: WORKS
- Transitions (System A): WORKS (dead systems B+C delete in Phase 2)
- Asset briefing: WORKS
- V-JEPA: NEEDS PYTHON ENDPOINT WRITTEN
- Wav2Vec: NEEDS DEPLOYMENT + GCS URL FIX
