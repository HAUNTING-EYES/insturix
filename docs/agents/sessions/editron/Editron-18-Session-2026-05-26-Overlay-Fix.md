# Session 2026-05-26: Overlay System Signal Bridge Fix

## What Was Done

### Phase 1: overlay-definitions.json cleanup
- 59 → 48 overlays (11 fallback noise removed)
- 10 namespace mismatches fixed (bare IDs → namespaced)
- 5 event signal names corrected (case + namespace)
- 9 missing signals replaced with available alternatives (CRG-verified: 4 SUPPORTED, 2 REASONABLE, 2 initially UNSUPPORTED → corrected)
- 6 fallback overlays redesigned with proper multi-signal considerations
- 28 → 0 empty outputParams
- Signal coverage: 46% → ~95%

### Phase 2: Event projection + Director cleanup
- `projectEventsOntoGrid()` added to signal-registry.ts (~35 lines)
- Projects 7 event signal types onto nearest grid-point snapshots
- Director: projection called before shadow scoring
- Stale `content.speech_coverage` bridge removed (was overwriting averaged grid value with global)

## CRG Verification Results
| Replacement | CRG Verdict |
|---|---|
| peak_score → composite.cinematic_moment | SUPPORTED |
| has_narration → speech.coverage | SUPPORTED |
| action_type → visual.motion_intensity (speed ramp) | SUPPORTED |
| scene_type → visual.face_present inverted (vignette) | SUPPORTED |
| energy_baseline → speech.energy_ema | REASONABLE |
| narrative_phase → speech.energy_surprise inverted (fade) | REASONABLE |
| narrative_phase → composite.narrative_pressure (zoom) | UNSUPPORTED → FIXED to speech.energy_surprise |
| action_type → visual.engagement (callout) | UNSUPPORTED → FIXED to visual.motion_intensity |

## Tests: 56/56 pass across 5 suites

## INVENTED Values Added
- Claim strength encodings: assertive=0.8, hedged=0.3 (in projectEventsOntoGrid)
- 6 redesigned overlay curve params: xShift values (-0.2, -0.1, 0.1, -0.15) all INVENTED

## Rule Violations Caught & Fixed
8 rule violations identified mid-session. Key lesson: follow ALL rules on first edit, not retroactively. See memory/feedback_all_rules_first_edit.md.

Tags: #session #overlay-system #signal-bridge #phase1 #phase2
