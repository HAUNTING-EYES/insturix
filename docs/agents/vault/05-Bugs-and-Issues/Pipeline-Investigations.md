---
tags:
  - bugs
  - investigations
created: 2026-05-24
source: memory/pipeline_investigations.md
---

# Pipeline Investigations

Central repository for investigation findings. Each entry includes symptom, root cause with file:line evidence, impact analysis, and proposed fixes.

**Complements:**
- [[Rules-and-Constraints]] -- Toyota reliability audit (silent failures, timeouts, retry gaps)
- This file -- detailed root-cause analysis for individual bugs/gaps/conflicts

**How to use:**
1. Before investigating a reported bug: search this file for existing analysis
2. After investigating: append a new entry using the template below
3. Short summary also goes in editron_master_remaining.md

---

## Entry Template

```
## [YYYY-MM-DD] -- Short descriptive title

**Category:** bug | design-gap | architectural-conflict | silent-failure | perf-issue | vulnerability
**Severity:** P0 (blocks usage) | P1 (affects quality) | P2 (polish)
**Status:** open | investigating | fixed-partial | fixed | wontfix
**Triggered by:** What surfaced this (user test, audit, code review, etc.)
**Related commits:** (if any partial/previous fixes)

### Symptom
What the user or developer observes. Include numbers, log lines, project IDs.

### Root cause
Traced chain with file:line evidence. No assumptions -- everything verifiable.

### Impact
Who/what is affected. Which content types break.

### Proposed fix options
Minimum 2 options with tradeoffs. Pick recommended. Note deferred options.

### Decision / Action
What was chosen (and why) OR what was deferred.
```

---

## Findings

### [2026-04-19] AssetBriefing crashes on partial cached audio/musicStructure shape

**Category:** bug (silent failure leading to degraded LLM context and worse EDL decisions)
**Severity:** P0
**Status:** MITIGATED (defensive array checks in asset-briefing.ts)

**Symptom:** Every Director run on AI-generated clips produced fallback briefings. 11 clips all emitted `[AssetBriefing] Failed to compress video_XXX: Cannot read properties of undefined (reading 'length')`. LLM operated blind, producing fewer/less-specific decisions.

**Root cause:** `asset-briefing.ts:247` -- `.length` accessed on `audio.beats` / `audio.silences` / `audio.energyCurve` / `musicStructure.drops`. TypeScript types declare these as non-nullable arrays, but runtime some cached AssetAnalysis objects have `audio` present (non-null) with `audio.beats === undefined`. Guard `if (audio)` only protects against null, not partial objects.

**Fix:** Defensive array checks (`Array.isArray()` pattern) producing partial briefings instead of all-unknown fallbacks. Root cause upstream (5-Track cache shape producing stub `audio: {}` objects) deferred as separate investigation.

---

### [2026-04-19] add_transition tool's applyToAll fallback silently overwrites EDL-placed transitions

**Category:** bug (silent params-ignore leading to destructive side-effect)
**Severity:** P0
**Status:** FIXED (director-agent.ts single-line param change)

**Symptom:** Videos with profiles whose EDL doesn't saturate ALL clip-pair boundaries ended up with monotone transitions. EDL's creative-intent transitions (film-burn, dip-to-white, flash) got silently obliterated and replaced with profile default.

**Root cause:** Director at `director-agent.ts:991` passed `{ clipAId, clipBId }` to target one specific pair, but those fields are NOT in the Zod schema (`addTransitionSchema`). Zod strips unknown fields silently. With no `applyToAll` and no `afterOverlayId`, the tool fell into the applyToAll loop, iterating every pair and deleting existing transitions.

**Fix:** Changed Director to pass `afterOverlayId: clipA.id` which routes to the single-pair path.

---

### [2026-04-16] Pacing multiplier compounds with script-set scene durations

**Category:** design-gap
**Severity:** P1
**Status:** FIXED (commit 57f72532 -- `durationWasExplicit` flag)

**Symptom:** Scripts specifying scene durations AND pacing keywords delivered ~15% less scene duration than scripted. Nike log showed -119 frames (-3.97s) from edit-direction-applier.

**Root cause:** `edit-direction-applier.ts:85-138` -- `pacingMultiplierMap['fast'] = 0.85`. When script says "Scene 2: 20 seconds, fast-paced montage", parser extracts both `durationSeconds = 20` (already accounting for fast feel) AND `pacing = 'fast'`. Applier then multiplies 20s x 0.85 = 17s, double-counting.

**Fix:** `durationWasExplicit` flag propagated from parser through to edit-direction-applier. Pacing multiplier skipped when flag set. Adds VO-bound floor so pacing never compresses below narration duration.

---

### [2026-04-16] AI video model quantized duration grids conflict with continuous narrative timing

**Category:** architectural-conflict
**Severity:** P1
**Status:** open (no quick fix is non-shitty)

**Symptom:** Same 30s script produces different output durations depending on which video model user picked, because each model has a different achievable duration grid.

**Root cause:** Architectural mismatch between script layer (continuous timing), creative intent layer (free-form float durations), and model execution layer (quantized duration sets). Each model snaps differently: Kling {5, 10}, Veo {4, 6, 8}, Seedance {4-15 integer}.

**Fix options considered:**
- A) Parser-level scale-up -- flimsy, ignores model grid
- B) Model-aware constraint solver -- lossy, drops content silently
- C) Filler content -- doesn't exist yet (needs Phase C or G)
- D) Model auto-selection -- violates user control
- E) Profile-level conflict resolution policy -- best long-term, needs 54-profile annotation
- F) Accept drift, document -- current state

**Decision:** Ship nothing. Re-evaluate when beat-sync goes live or Phase C/G unlocks filler strategies.

---

### [2026-04-17] Beat-sync design doc (Option C: profile-gated synchronous BGM)

**Category:** design-gap + design-doc
**Severity:** P1
**Status:** IMPLEMENTED (commits 31df7b3a, 6875d02a, 8efc06df, 040548e5)

Beat detection service (heuristic grid, BPM inference), parser post-processor for beatSyncActive flag, finalize sync BGM dispatch, Director step 3.5 wires alignCutsToBeats. Audio-analysis upgrade path documented in beat-detection-service.ts header.

---

### [2026-04-17] Profile detection scoring normalization penalized rich-keyword profiles

**Category:** bug (scoring math)
**Severity:** P1
**Status:** FIXED

**Symptom:** Nike athletic brand ad auto-detected as "E-Commerce / Product Launch" instead of "Athletic" despite strong athletic signals.

**Root cause:** `profile-detection-service.ts:131` -- `score / maxPossible` formula. Sparse profiles (4 keywords) had smaller denominators, making high percentages easier. Rich profiles (16 keywords) needed many matches to compete.

**Fix:** Global normalization target (`scoreNormalizationTarget = 2.5`) replacing per-profile normalization. Nike now scores B-05 Athletic at 0.80 (auto-select) vs B-02 Product Launch at 0.24.

---

### [2026-04-17] LLM parser cold-start timeouts force regex fallback with destructive data shape

**Category:** silent-failure (cascading to data-integrity violation)
**Severity:** P0
**Status:** FULLY RESOLVED

**Resolution timeline:**
1. `fce2ccdd` -- Quality gate rejects byte-identical narration/visualDescription
2. `3ffd1a70` -- LLM abort timeout bumped 120s to 180s
3. `8f76b94f` -- `geminiRetry` wrapper with exponential backoff
4. `f41b4e52` -- Root-cause fix in `script-to-scenes.ts`: editorial headers route to `rawProductionNotes` instead of narration; killed the `visualDescription: narration.substring(0, 2000)` copy-back

---

### [2026-04-17] Storyboard page crash: "Cannot access 'ec' before initialization"

**Category:** bug (JS bundle / runtime TDZ error)
**Severity:** P0
**Status:** INVESTIGATED -- suspected stale Vercel build cache

**Symptom:** `ReferenceError: Cannot access 'ec' before initialization` at `page.js:1:11407`. Browser shows "Something went wrong" page.

**Root cause (suspected):** JavaScript Temporal Dead Zone (TDZ) violation from either circular import, tree-shaking inlining, or stale build cache. Sprint commits traced and confirmed NOT touching the runtime import chain for StoryboardWorkspace.

---

### [2026-04-18] Dual transition system regression (A3.5.1/A3.5.2 returned)

**Category:** regression
**Severity:** P0
**Status:** FIXED (commits 8362b5dc + clip-pair dedup)

Three root causes confirmed:
1. Ghost transitions -- in-memory dedup markers persisted to MongoDB (fix: filter before save)
2. Dual transitions on same pair -- EDL executor and Director used different reference frames for dedup (fix: primary match on clipAId+clipBId identity)
3. Too many EDL transitions -- mitigated by post-composition safety net ensuring at most one transition per pair

---

### [2026-04-18] Nano Banana 2 reference images hardcoded to text-only

**Category:** bug (known TODO, never completed)
**Severity:** P1
**Status:** IDENTIFIED, fix requires new `inline-image-urls` capability type

**Root cause:** `image-model-configs.ts:139-159` -- All three NB models have `referenceCapability: 'text-only'` as workaround for a 404 on a sub-path. They all SUPPORT `image_urls` via standard endpoint. Scene images don't visually match reference images because the model never sees them.

---

### [2026-04-17] Hardcoded 10s video duration cap in generate-videos route

**Category:** bug
**Severity:** P1
**Status:** IDENTIFIED, fix deferred

**Root cause:** `generate-videos/route.ts:311` -- `Math.min(descriptor.durationSeconds, 10)`. Hardcoded 10s maximum predates Seedance 1.5 (12s max) and Seedance 2.0 (15s max).

**Fix:** Replace hardcoded cap with model-aware cap from `getActualVideoDuration()` in `video-model-configs.ts:358`.

---

### [2026-04-23] Unified Intelligence crash: undefined.length on LLM output

**Category:** bug
**Severity:** P0
**Status:** FIXED (c069d129)

**Symptom:** ALL smart editing disabled. Fallback to reactive engine producing 0 executed decisions.

**Root cause:** `unified-edit-intelligence.ts:623-642` -- Vercel AI SDK `generateObject()` returns undefined for nested arrays/objects when Gemini omits optional fields. Three unguarded access points.

**Fix:** Null coalescing (`|| []`, `?.`, `?? default`) on all LLM output field accesses.

---

### [2026-04-23] Transition keyframes clobbered by saveProject overwrite

**Category:** bug
**Severity:** P0
**Status:** FIXED (ce337a10)

**Symptom:** Transition tiles visible on timeline but no visual effect during playback.

**Root cause:** `add_transition` tool writes opacity keyframe tracks directly to MongoDB via `updateOverlay()`. Director Step 4 calls `saveProject()` which writes the entire in-memory overlays array (without keyframes) back to DB, overwriting them.

**Fix:** Added keyframe merge loop copying keyframeTracks from fresh DB read into in-memory overlays before save.

---

### [2026-04-23] Audio ducking skipped due to async BGM timing

**Category:** bug
**Severity:** P1
**Status:** FIXED (ce337a10)

**Root cause:** Profile actions run at Step 3. `checkCondition('hasBGM')` checks in-memory overlays. BGM dispatched via QStash arrives ~12s later. Director starts Step 3 before BGM arrives.

**Fix:** Added Step 4.5 after async merge: if BGM now present, run audio ducking.

---

### [2026-04-23] Video quality score is not trustworthy

**Category:** design-gap
**Severity:** P1
**Status:** open -- needs rework

**Root cause:** Score measures 3 proxy metrics (subject count 40%, energy variance 35%, brightness variance 25%), none of which measure actual video quality. Score of 84/100 on project with poor quality (melted hands, face morphing).

**Fix options:**
1. Gemini Vision quality check -- send 3-5 keyframes with rubric (~$0.003/video, most accurate)
2. Deterministic heuristic improvement -- face detection confidence, motion smoothness, prompt similarity
3. Hybrid -- deterministic fast-check first, Gemini Vision only on borderline scores (50-70)

---

### [2026-04-17] Duration fix: pre-calculated generation + slop-aware trim

**Category:** design-decision + implementation
**Severity:** P1
**Status:** IMPLEMENTED (commits d5c79f8a + 87e7b6a4)

Algorithm: pre-calculate ideal per-shot duration, generate at model grid, post-generate trim worst frames (slop-detected ranges, low-motion, no-subject frames). Model choice is sacred (never overridden).

---

## External Repo Research Summary (2026-04-17)

| Repo | Action |
|------|--------|
| video-db/Director | Resources folder (UI pattern reference for agent streaming) |
| HKUDS/VideoAgent | Resources folder + ImageBind for future SFX/visual validation |
| mainza-ai/milimovideo | Pattern adopted (trim_in/trim_out for duration control) |
| aregrid/frame | Resources folder (UX reference, opaque docs) |
| GetStream/vision-agents | Resources folder + processor-chain architectural direction for 5-Track extensibility |

---

## Cross-References

- [[Rules-and-Constraints]] -- Toyota audit findings, audit lessons
- [[APIs-Models-Keys-Costs]] -- Model endpoints and costs referenced in investigations
- [[Prompt-Engineering-Methodology]] -- Prompt methodology for LLM-related fixes
