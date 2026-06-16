# D-015: Graphiti Data Flows Through Signal Pipeline

**Status:** #decided
**Date:** 2026-05-26
**Context:** Signals (62 IDs) drive 100% of visual output. Brand preferences from Neo4j/Graphiti must integrate, not bypass.

## Decision

Graphiti (Neo4j) is an **upstream signal source**, not a parallel decision system. Brand preferences are injected as signal overrides before the utility scorer runs.

## Architecture

```
Neo4j / Graphiti → signal biases → Signal Registry → Overlay Scorer → EDL → Video
```

Three learning layers, one pipeline:
- Bandit: per-user threshold adaptation
- Graphiti: per-brand preference memory  
- Signals + Overlays: per-moment decision making

## Examples

- Brand formality 0.85 → override `content.formality` global signal
- Brand never camera shake → suppress `camera_shake_*` overlay weights
- Brand prefers dissolve → boost `transition.dissolve_*` ranks

## Why Not Parallel

Two decision systems fighting over the same output = merge conflicts + complexity for no benefit. The overlay system already handles all decisions — Graphiti just enriches the input.

## Related

- D-004: Content routing via signals
- D-014: Utility AI replaces CRG + profiles
- `lib/editron/services/signal-registry.ts`
- `lib/editron/engine/overlay-definitions.json`
