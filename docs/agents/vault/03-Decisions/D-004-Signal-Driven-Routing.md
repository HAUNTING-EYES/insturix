# D-004: Signal-Driven Content Routing

## Status: #decided (editron 26, 2026-05-23)

## Decision
Content type detection is automatic from L0 signals, computed BEFORE creative brief prompt selection:

```
speechCoverage > 0.6                    → SPEECH mode (word-index, existing system)
musicPresence > 0.5 + speech < 0.3      → MUSIC mode (beat-aligned coordinates)
visualChangeRate > 0.3 + speech < 0.3   → VISUAL mode (scene boundaries)
mixed                                    → HYBRID mode (all coordinates, merge by confidence)
```

## Why
- Uses signals already computed by signal-registry (speechCoverage, musicEnergy)
- Only needs visualChangeRate added (frame histogram diff from sharp)
- Deterministic — L0 data only, no ML
- Routing decision selects which creative brief prompt VARIANT to use
- Falls back to SPEECH mode (existing system) if routing fails

## Implementation Notes
- speechCoverage: already in signal-registry
- musicPresence: derive from music_energy signal (already computed)
- visualChangeRate: NEW — frame histogram diff between consecutive keyframes via sharp
- Routing happens in director-agent.ts BEFORE creative brief call
- Each mode selects a different prompt template

## Thresholds
- 0.6, 0.5, 0.3, 0.3 are all INVENTED — need calibration
- See [[D-011-Threshold-Calibration]]

Tags: #decided #routing #architecture
