---
name: session-handover-2026-05-28-d016-profile-removal
description: "D-016 Profile System Removal implemented. 8 files, +71/-158 lines. Phases 1-3A complete. Profile no longer overrides Utility AI. Phase 3B (file deletion) deferred."
metadata:
  node_type: memory
  type: project
  originSessionId: d016-2026-05-28
---

# Session Handover — 2026-05-28 D-016 Profile System Removal

## Commit
- **SHA**: `8d296acb`
- **Branch**: `infrastructure-improvs-+Editron`
- **Worktree**: `D:\google downloads\Front-End-main\editron-worktree\`
- **Tests**: 168/168 pass, 0 type errors in changed files
- **Pushed**: yes

## What Changed (8 files, +71/-158)

### Phase 1: Decouple (3 files)
| File | Change |
|------|--------|
| `transcript-editor.ts:73` | Removed `contentType` from Gemini prompt context. Cuts are universal. |
| `composition-planner.ts:514` | Removed hardcoded `entranceOverride: 'pop'` from composeEmphasis. Overlay scoring picks entrance. |
| `composition-planner.ts:320` | Added `primary.kind !== 'emphasis'` gate on mask producer. Keyword highlights no longer get masks. |
| `verify-composition-engine.ts:97` | Updated test assertion — no hardcoded entrance expected. |

### Phase 2: Replace profile values in Director (1 file)
| File | Change |
|------|--------|
| `director-agent.ts:32-39` | Added `densityFromGenreParams()` helper — converts numeric density (0-8) to EDL budget label. ⚠️ thresholds 2,5 INVENTED. |
| `director-agent.ts:1232-1265` | Standard action sequence replaces `effectiveProfile.actions`. No hardcoded `filterPresetId` — Utility AI winner flows through. Captions injected via existing logic. |
| `director-agent.ts:617` | Path E `graphicsDensity` → `densityFromGenreParams(pathEGenreParams)` with profile fallback. |
| `director-agent.ts:954` | Path D `graphicsDensity` → `densityFromGenreParams(pathDGenreParams)` with profile fallback. |

### Phase 3A: Remove profile infrastructure (4 files)
| File | Change |
|------|--------|
| `content-type-detector.ts` | Removed `profileId` from interface. Removed 55-line `CONTENT_TYPE_TO_PROFILE` mapping. Content type + silence thresholds still returned. |
| `video-analysis/route.ts` | Removed 25-line profile detection block. Uses `initialProfileId` (G-01 default). |
| `tribe-analysis/route.ts` | Same removal. |
| `director/route.ts` | Same removal. |

## What This Fixes
- **Bug 5 from previous session**: Utility AI picks `vivid` (0.975), profile overwrites with `muted-doc`. NOW: Utility AI winner flows through to batch_update_overlays.
- **Bug 6**: MG keyword highlights all had `pop` entrance. NOW: overlay scoring picks entrance (or role default `fade`).
- **Classification cascade**: One wrong speechCoverage number no longer cascades through contentType → profile → filter → captions → 49s extra duration.

## What Still Uses Profiles (Phase 3B — deferred)
Profile files NOT deleted. 12+ importers remain:
- `director-agent.ts:26` — imports `getProfileById` (G-01 fallback for Mode 1 values)
- `finalize/route.ts:1121` — imports `EDIT_PROFILES` (UI profile list)
- `useExportPipeline.ts:14` — imports `EDIT_PROFILES` (export dialog dropdown)
- `profile-detection-service.ts:18` — imports `EDIT_PROFILES` (still used by finalize + pipeline/video)
- `transition-sfx-placer.ts:40` — imports `EditProfile` type (SFX policy)
- `editron-config.ts:16` — imports `EditProfile` type
- `export/types.ts:1` — imports `DetectionResult`, `ProfileId` types
- `cinema-prompt-config.ts:124` — comment reference only

Phase 3B requires sub-agent swarming (Rule 5: >5 files).

## Mode 1 Profile Fallback (intentional)
Mode 1 (script pipeline) still reads `effectiveProfile` for:
- `cutsPerMinRange` → creative intent prompt target pacing
- `graphicsDensity` → creative intent prompt density label
- `pacing` → reactive engine fallback
- `name` → creative intent prompt profile name
- `captionStyle` → caption style fallback when Utility AI doesn't produce winner

These stay as fallback until genreParams are computed for Mode 1 (future work — compute genreParameters from 5-Track analyses at Director start).

## Vault Docs Updated
- `D:\Insturix-Brain\03-Decisions\D-016-Profile-System-Removal.md` — status → IMPLEMENTED
- `D:\Insturix-Brain\03-Decisions\Index.md` — D-016 added to Decided list
- `D:\Insturix-Brain\05-Bugs-and-Issues\Index.md` — profile override bug marked FIXED
