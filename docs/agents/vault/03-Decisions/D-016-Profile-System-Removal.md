---
tags:
  - decided
  - architecture
  - profiles
date: 2026-05-28
implemented: 2026-05-28
commit: 8d296acb
---

# D-016: Remove Profile System from Director Pipeline

## Status: IMPLEMENTED (Phases 1-3A) — commit 8d296acb

## The Problem

The profile system is a fragile classification cascade:
```
speechCoverage → content type → profile (C-01..C-54) → editing decisions
```

A single wrong classification (46% vs 99% speechCoverage) changes the profile,
which changes the content type label, which changes the Gemini prompt context,
which changes how many words the transcript editor keeps, which adds 49 seconds
to a 9-minute video. One number, cascading through 4 layers.

The signal-driven overlay system (78 overlay definitions, 34 signals) was built
to REPLACE profile-driven decisions. It already handles: filters, captions,
transitions, zooms, MGs, pacing. Profiles are now redundant middleware that
occasionally OVERRIDES the signal system's better decisions.

## What Profiles Currently Provide (9 files)

| File | What profile provides | What signals already handle |
|------|----------------------|---------------------------|
| director-agent.ts | `effectiveProfile.actions` (action sequence) | Standard sequence covers all cases |
| director-agent.ts | `effectiveProfile.captionStyle` (fallback) | Utility AI overlay scoring picks caption style |
| director-agent.ts | `effectiveProfile.filterPresetId` (fallback) | Utility AI overlay scoring picks filter |
| director-agent.ts | `effectiveProfile.graphicsDensity` | Overlay scoring (mg.* overlays) |
| director-agent.ts | `effectiveProfile.cutsPerMinRange` | Genre-parameter-computer from signals |
| director-agent.ts | `effectiveProfile.pacing` | Genre-parameter-computer |
| finalize/route.ts | Passes profileId to Director | Can pass null/default |
| profile-detection-service.ts | Content type → profile mapping | Content type stays, profile mapping removed |
| decision-budget.ts | Uses profile for budget computation | Genre-parameter-computer handles budgets |
| transition-sfx-placer.ts | Uses profile for SFX behavior | Can use genre params directly |
| edit-profiles.ts | 54 profile definitions | Overlay definitions + genre params |
| edit-profile-types.ts | EditProfile type | Simplified or removed |
| editron-config.ts | Profile-related config values | Config values stay, profile mapping removed |
| cinema-prompt-config.ts | Mood/style from profile | Content signals drive cinema settings |

## The Architecture Change

### Before (cascading classification)
```
Words → speechCoverage → contentType → profileId (C-05) → profile.actions
                                                        → profile.captionStyle
                                                        → profile.filterPresetId
                                                        → profile.graphicsDensity
                                                        → profile.cutsPerMinRange
                                                        → profile.pacing
```

### After (direct signal-driven)
```
Words → speechCoverage → contentType (for creative brief context only)
Signals → overlay scoring → filter, captions, MG style
Signals → genre-parameter-computer → pacing, budgets, density
Standard action sequence → always: [filter, MG, captions, quality_review]
```

### What stays
- **Content type detection** — still useful as context for the Gemini creative brief ("this is an interview" helps Gemini make better creative decisions). But it STOPS selecting a profile.
- **Genre-parameter-computer** — already computes pacing, density, budgets from signals. Becomes the primary source for these values.
- **Overlay scoring** — already picks filter, caption style, entrance/hold/exit patterns. Becomes the primary source for these values.

### What goes
- **Profile selection** — content-type-detector stops mapping to profileId
- **Profile fallback values** — captionStyle, filterPresetId, pacing from profiles. Replaced by overlay scoring winners or sensible defaults.
- **Profile-driven action sequence** — replaced by standard sequence
- **`edit-profiles.ts`** — 54 profiles become dead code (keep for reference during transition, delete after validation)
- **`profile-detection-service.ts`** — simplified to content-type-detector only (no profile mapping)

### What changes in Director
1. `effectiveProfile.actions` → standard `[filter, MG, captions, quality_review]`
2. `effectiveProfile.captionStyle` → overlay scoring winner or user preference
3. `effectiveProfile.filterPresetId` → overlay scoring winner or 'none'
4. `effectiveProfile.graphicsDensity` → genre-parameter-computer output
5. `effectiveProfile.cutsPerMinRange` → genre-parameter-computer output
6. `effectiveProfile.pacing` → genre-parameter-computer output

### What changes in Transcript Editor
- Remove `contentType` from the Gemini prompt context string
- The same 4 cut rules (retakes, false starts, production meta, dead air) apply universally
- Cuts are determined by what the AUDIO contains, not what category the video is classified as

## Implementation Phases

### Phase 1: Decouple transcript editor (1 change, immediate)
- Remove contentType from transcript-editor.ts prompt context
- This eliminates the "documentary vs interview → different cuts" cascade
- Smallest possible change, biggest impact

### Phase 2: Replace profile values with signal-driven values (5-8 files)
- Director: replace `effectiveProfile.X` with overlay scoring / genre-param values
- Standard action sequence instead of profile.actions
- User preference for captionStyle passes through from UI, not profile
- Genre-parameter-computer outputs replace profile pacing/density/cuts

### Phase 3: Remove profile infrastructure (3 files)
- Stop selecting profiles in video-analysis worker
- Simplify profile-detection-service to content-type-only
- Delete edit-profiles.ts and edit-profile-types.ts (or archive)

### Phase 4: Validation
- Run same video through pipeline: verify content type doesn't affect cuts
- Run 5 content types (product ad, tutorial, vlog, brand, interview)
- Compare output against May 25 stable baseline
- Verify overlay scoring produces good filter/caption/transition choices

## CEO Perspective

**Is this the right thing to build?**
Yes. The profile system was the V1 approach (classify → apply preset). The signal
system is the V2 approach (measure → score → decide). V2 is already built and working.
Profiles are V1 remnants that occasionally override V2 decisions — making quality WORSE,
not better. The speechCoverage cascade bug is proof: a classification error in V1
infrastructure broke V2 output.

**Risk:** If overlay scoring doesn't produce good enough values for some content types,
removing profiles removes the safety net. Mitigation: genre-parameter-computer already
computes content-aware defaults (it reads contentType). Those defaults replace profiles.

**Reversibility:** 4/5. Profiles can be restored from git if needed. The change is
mostly REMOVING code, not adding it.

## Eng Perspective

**Is this technically sound?**
Yes. The overlay scoring system (78 definitions, multiplicative scoring with
anti-pattern suppression) is more expressive than 54 discrete profiles. Each profile
is a frozen point in signal space — the overlay system covers the continuous space.

**Blast radius:** 9 files. Phase 1 (transcript editor) is 1 file, 1 line. Phase 2
(Director) is the bulk — director-agent.ts touches ~20 references to effectiveProfile.
Phase 3 is cleanup.

**Test plan:** Run the 5-content-type batch test (scripts/test-content-types.mjs) before
and after. Compare graphic mix, pacing, duration across content types. The MG vitest
suite (168 tests) validates the composition engine independently.

**What could go wrong:**
1. Overlay scoring picks a bad filter for some content types → user sees ugly color
2. Genre-parameter-computer gives wrong pacing for edge cases → too many/few cuts
3. Caption style defaults to wrong type → user gets word-by-word when they wanted subtitle

All of these are fixable by tuning overlay definitions or genre-parameter defaults.
None require the profile system to fix.
