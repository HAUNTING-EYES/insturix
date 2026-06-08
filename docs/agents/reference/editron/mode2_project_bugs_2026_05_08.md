---
name: Mode 2 Real Project Bugs — proj_wx3LkywSEMra
description: 6 bugs discovered from analyzing first real Mode 2 vlog project (20min Vlogbrothers-style). Root causes identified with file:line evidence.
type: project
last_updated: 2026-05-08
originSessionId: 8169aa5e-3ba3-4807-9fea-d5cb2afaac37
---
# Mode 2 Project Bugs — proj_wx3LkywSEMra

**Video:** "vidssave.com A Completely Unedited Video in the Style of Vlogbrothers" — 720P, ~19.6min original → 12min after edits.
**DB:** editron_prev, projectId: proj_wx3LkywSEMra
**Date analyzed:** 2026-05-08

## Bug 1: ALL 36 transitions are dip-to-black — FIXED

**Evidence:** `{ "dip-to-black": 36 }` — zero variety across 12 minutes.
**Root cause:** Signal executor didn't propagate `transitionType` from technique ID to params. EDL executor defaulted to `soft-cut` (invisible) → profile step filled every boundary with dip-to-black.
**Fix:** Commit d06e9ed7 — GRAPH_TO_EDL_TRANSITION mapping in signal-executor.ts. **Not yet deployed to production (preview branch only).**

## Bug 2: Over-segmentation — 248 segments for 20-minute vlog

**Evidence:** Segments as short as 1 word / 0.5 seconds. Segment 0: 1.7-2.2s (1 word). Segment 2: 4.8-5.3s (2 words).
**Root cause:** `segmentTranscript()` in raw-footage-processor.ts segments at every pause boundary (sentence-level), not topic boundaries. The `segmentPauseThresholdMs` config is too low for long-form talking-head content.
**Expected:** A 20-minute vlog monologue should produce ~15-25 topic-based segments, not 248 sentence fragments.
**Fix needed:** `raw-footage-processor.ts` → `segmentTranscript()` — increase pause threshold for long-form content OR use Gemini to detect topic shifts instead of pause-based splitting.

## Bug 3: Over-cutting — 37 clips / 36 transitions on 12 minutes

**Evidence:** 1 transition every 20 seconds. Vlog content should have ~5-10 natural topic-change cuts.
**Root cause:** Silence removal creates many small clips (every removed section = new clip boundary). Then `add_transition` profile action places a transition at EVERY clip boundary without considering content type or pacing rules.
**Fix needed:**
- `director-agent.ts` → `add_transition` action should respect genre parameters (transition_density from genre-parameter-computer)
- Pacing constraint: min clip duration before placing transitions (e.g., skip boundaries where clips are <5s for talking-head)
- Content type awareness: talking-head/vlog = fewer transitions than montage/action

## Bug 4: Content type detection returns `undefined`

**Evidence:** `contentTypeDetection.primaryType: undefined`
**Root cause:** `content-type-detector.ts` — the detection function likely failed silently or returned incomplete data.
**Impact:** Without content type, genre-parameter-computer can't set appropriate pacing/transition-density defaults. Everything falls to generic defaults.
**Fix needed:** Verify `content-type-detector.ts` handles the segment data correctly. Add fallback: if undefined, default to "talking-head" for Mode 2 (most common user footage type).

## Bug 5: Overlapping silence removal entries

**Evidence:** Items 8-15 in the removal plan overlap in the 85-117s range. meta-discard + inferior-take produce duplicate ranges for the same content.
**Example:**
```
8: remove 85.5s-109.6s (inferior-take)
9: remove 93.1s-98.6s (meta-discard)
10: remove 98.6s-104.2s (meta-discard)
11: remove 104.2s-109.6s (meta-discard)
```
Items 9-11 are subsets of item 8. The executor handles this (reverse-order processing), but it's wasteful and can cause double-counting in duration estimates.
**Root cause:** Step 7.5 in raw-footage-processor merges editorial intent removals into the plan without deduplicating against existing entries (inferior-take, silence).
**Fix needed:** `raw-footage-processor.ts` Step 7.5 — before pushing editorial removals, check for overlap with existing plan entries. Skip or merge overlapping ranges.

## Bug 6: No BGM or SFX (0 sounds)

**Evidence:** 0 sound overlays on a 12-minute video.
**Root cause (BGM):** Mode 2 auto-edit doesn't trigger BGM generation (no CassetteAI call in the Mode 2 pipeline — that's a Mode 1 finalize feature).
**Root cause (SFX):** Transition SFX placer runs, but with all transitions being dip-to-black, the rule table may not have SFX mappings for that style. Or the placer found 0 eligible transitions.
**Fix needed:**
- BGM: Add optional BGM generation step in Mode 2 pipeline (user can opt in via AutoEditDialog)
- SFX: Verify transition-sfx-placer handles dip-to-black (should map to subtle fade sound)

## Summary — What This Project Proves

This is exactly what HUMAN Phase 1 QualityGate would catch:
1. **Pacing score catastrophic** — 37 cuts on 12min talking-head = ~3 cuts/min (should be ~0.5-1 for vlog)
2. **Transition repetition violation** — 36 identical dip-to-black
3. **No audio = massive quality deduction** — 0 BGM, 0 SFX on 12 minutes
4. **Content type unknown = system flying blind** — no genre parameters calibrated

**Why:** The edits should serve the actual content. A 12-minute monologue should be pared down for silences and dead air, but NOT be chopped into 37 pieces with dip-to-black between each one.
