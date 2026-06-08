---
name: session-handover-2026-05-28-profile-removal
description: "Mega session handover — MG Tier B2+C shipped, Grok STT fixed, TRIBE worker split, profile removal planned. 12 commits. Critical next step: D-016 profile system removal."
metadata: 
  node_type: memory
  type: project
  originSessionId: 1b88f945-a308-4718-b911-d107aa5cdc9f
---

# Session Handover — 2026-05-28

## What This Session Built (12 commits)

| SHA | What | Impact |
|-----|------|--------|
| `58b69181` | Tier B2+C: GSAP timeline (scramble/DrawSVG/morph), particles, masks, calibration URLs | +858 lines |
| `508a7f8e` | 96 MG vitest tests (planner + renderers + choreography) | +1,044 lines |
| `1bc9fa1d` | Signal naming mismatch fix (9 bare-key aliases) + pipeline warnings (5 services) | +38 lines |
| `afd77bbb` | Wire pipelineWarnings to generateCreativeBrief caller | +1 line |
| `16a7fa4b`+`32a28723` | Grok STT R2 presigned URL attempt (didn't work) | +12/-9 |
| `26575af8` | Grok STT file upload per official xAI docs | +19/-10 |
| `7e0f4d18` | TRIBE worker split (800s timeout fix) | +553/-183 |
| `97e3a9d4` | Replace 4 silent catch {} with logged warnings | +4/-4 |
| `f9859991`+`4dc72dfd` | Gap-based speechCoverage in raw-footage-processor | +22/-7 |
| `5e77a192` | briefCaptionStyle ReferenceError fix (pre-existing bug) | +4/-2 |
| `7f3712c6` | Gap-based speechCoverage in content-type-detector (SECOND computation) | +21/-8 |
| `28750413` | Mask threshold raised (0.2→0.5, budget 3→5) | +20/-20 |

## What Broke and Why

1. **Grok STT 400 error** — xAI deprecated the `url` parameter. Fix: send file as binary upload per their docs. Root cause took 3 attempts (presigned URL → wrong import path → file upload).

2. **speechCoverage cascade** — Grok file upload returns "tight" timestamps (~200ms/word) vs old "inclusive" (~500ms). Two separate computations disagreed (raw-footage-processor vs content-type-detector). Fix: gap-based blocks in both files.

3. **800s Vercel timeout** — TRIBE Phase 2 (V-JEPA + Wav2Vec) took ~500s, combined with transcription/VU exceeded 800s. Fix: split into separate QStash worker.

4. **briefCaptionStyle ReferenceError** — Pre-existing bug (commit 8724f6f8). Variable declared in one function, referenced in another. Fix: pass as parameter.

## CRITICAL NEXT STEP: D-016 Profile System Removal

### Why

The profile system overrides signal-driven decisions. Proof from proj_FLiymdtCzv2V:
- Utility AI scored `vivid` filter at 0.975 confidence
- Profile C-03 (documentary) overwrote it with `muted-doc`
- The log literally says: "overwrote 61 pre-set filters — profile is source of truth"
- The signal system was RIGHT. The profile made it WRONG.

Also: `composeEmphasis()` hardcodes `entranceOverride: 'pop'` on every keyword highlight, blocking overlay scoring from applying different entrances.

### Implementation Plan (3 phases, read D-016 vault doc for full details)

**Phase 1: Decouple (2-3 files, immediate)**
1. `transcript-editor.ts` — remove `contentType` from Gemini prompt context. Cuts should be universal.
2. `composition-planner.ts` — remove hardcoded `entranceOverride: 'pop'` from composeEmphasis. Let overlay scoring pick the entrance.
3. Remove mask producer entirely (masks on keyword highlights make no sense)

**Phase 2: Replace profile values (director-agent.ts, ~20 references)**
1. Replace `effectiveProfile.filterPresetId` with Utility AI overlay scoring winner
2. Replace `effectiveProfile.captionStyle` with Utility AI winner or user preference
3. Replace `effectiveProfile.graphicsDensity` with genre-parameter-computer output
4. Replace `effectiveProfile.cutsPerMinRange` with genre-parameter-computer output
5. Replace `effectiveProfile.actions` with standard sequence [filter, MG, captions, quality_review]
6. STOP the profile batch_update_overlays from overwriting Utility AI decisions

**Phase 3: Remove infrastructure (3 files)**
1. Stop selecting profiles in video-analysis worker
2. Simplify content-type-detector (keep content type, remove profile mapping)
3. Delete/archive edit-profiles.ts + edit-profile-types.ts

### Files That Reference Profiles (9 total)
- `lib/editron/agent/director-agent.ts` — main consumer (~20 references)
- `app/api/services/pipeline/storyboard/[id]/finalize/route.ts` — passes profileId
- `lib/editron/config/editron-config.ts` — profile config values
- `lib/editron/data/edit-profile-types.ts` — EditProfile type
- `lib/editron/data/edit-profiles.ts` — 54 profile definitions
- `lib/editron/services/decision-budget.ts` — uses profile for budget
- `lib/editron/services/profile-detection-service.ts` — content type → profile mapping
- `lib/editron/services/transition-sfx-placer.ts` — uses profile for SFX
- `lib/editron/data/cinema-prompt-config.ts` — mood/style from profile

### Test Plan
- Run same Hank Green video before/after
- Compare: filter should be `vivid` not `muted-doc`
- Keyword highlights should have varied entrances (not all `pop`)
- Duration should be ~553s (interview profile baseline)
- Run 5-content-type batch test

## Other Issues Found This Session

- **97 silent catch blocks** across 19 files — only 15 now have pipelineWarnings. 210 remaining.
- **Aesthetic gate Tier 2** — dead code, needs renderStill infrastructure (Phase D)
- **Masks on keyword highlights** — threshold raised but real fix is removing mask producer for emphasis MGs
- **Creative brief decisions falling in removed gaps** — brief uses original timeline frames, not cut-timeline. 8 out of 31 decisions were out of range.

## Calibration Pipeline
- Running in background when session started
- 7 original + some new videos processed
- 35+ bandit outcomes in MongoDB
- 11 YouTube URLs fixed (were hallucinated)

## Branch State
- Branch: `infrastructure-improvs-+Editron`
- Latest commit: `28750413` (mask threshold)
- All pushed, 168/168 tests pass
- Worktree: `D:\google downloads\Front-End-main\editron-worktree\`
