# D-001: Extend Signal Registry (Don't Build New TAG)

## Status: #decided (editron 26, 2026-05-23)

## Decision
Extend the existing signal-registry grid as the universal time coordinate. Do NOT build a new "Temporal Signal Map" data structure.

## Context
The TAG (Temporal Anchor Grid) proposal initially called for a new data structure. But the signal-registry already computes snapshots every 15 frames (500ms at 30fps) at signal-registry.ts:39. Each grid point has a frame index.

```
TAG grid:         t0    t1    t2    t3    t4    t5
Signal grid:      f0    f15   f30   f45   f60   f75
                  ↑ same thing, different name
```

t_index = frame / GRID_INTERVAL_FRAMES. No new data structure needed.

## Alternatives Considered
1. **New Temporal Signal Map**: Separate data structure alongside signal-registry. Rejected — duplicates existing infrastructure.
2. **Extend signal-registry grid**: Add new signal types (silence, beats, scene boundaries) to existing grid. CHOSEN.
3. **Replace signal-registry**: Rebuild with TAG as primary. Rejected — too much blast radius, existing system works.

## Implications
- New L0 signals (RMS silence, Essentia.js beats, histogram scene boundaries) get added as new signal types in signal-registry.ts
- creative-brief.ts needs to accept `target_ms` alongside `targetWordIdx`
- EDL executor already works with frames, not word indices

Tags: #decided #architecture
