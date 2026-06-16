---
name: graphiti-signal-bridge
description: "Architecture decision — Graphiti (Neo4j) brand memory feeds INTO signal pipeline as upstream signal source, not parallel system"
metadata: 
  node_type: memory
  type: project
  originSessionId: a57fdda9-46a8-4ea2-9d98-c16600953870
---

# Graphiti → Signal Bridge Architecture

**Status:** #decided (2026-05-26). Implementation pending.
**Why:** Signals drive 100% of the visual output (62 signals → 59 overlays → EDL → final video). Brand preferences must flow THROUGH the signal pipeline, not around it.
**How to apply:** When building Graphiti integration, inject brand data as signal overrides/biases, not as a separate decision layer.

## The Architecture

```
Neo4j / Graphiti (brand memory — cross-project)
    ↓ inject as signal biases / overrides
Signal Registry (per-project, 62 signals, 500ms grid)
    ↓
Utility Scorer (59 overlay definitions, response curves)
    ↓
EDL Executor → Final Video
```

Three learning layers, ONE pipeline:
1. **Bandit** (threshold-bandit.ts) — adapts per-USER, based on kept/modified/removed decisions
2. **Graphiti** (Neo4j) — adapts per-BRAND, based on cross-project preferences
3. **Signals + Overlays** — produce the output, consuming both layers above

## How Brand Preferences Become Signals

| Brand Preference (Graphiti) | Signal Injection |
|---|---|
| "Brand X: formality = 0.85" | Override `content.formality` global signal |
| "Brand X: never camera shake" | Suppress `camera_shake_*` overlays (weight → 0) |
| "Brand X: prefers dissolve" | Boost `transition.dissolve_*` overlay ranks |
| "Brand X: warm color palette" | Inject `visual.warmth_bias` signal |
| "Brand X: fast pacing" | Inject `content.pacing_velocity_bias` signal |

## Why NOT a Parallel Decision System

The overlay + bandit system already handles decision-making. Adding Graphiti as a separate decision layer would create:
- Two systems fighting over the same decisions
- Merge conflicts between signal-driven and graph-driven choices
- Complexity with no benefit

Instead: Graphiti is an **upstream data source** that enriches the signal snapshot before scoring. The overlay system doesn't know or care where signals come from — it just scores them.

## Implementation Plan (when ready)

1. On project create: query Neo4j for brand entity + preferences
2. Convert brand preferences to `BrandSignalOverrides` (typed)
3. Inject overrides into `buildSignalTimeline()` as a new data source (alongside 5-Track, V-JEPA, Wav2Vec, Essentia)
4. Overlay definitions automatically respond to adjusted signals
5. On project complete: write outcomes back to Neo4j (which brand preferences were kept/modified)

## Neo4j Role

Neo4j is the graph database. Graphiti (by Zep) sits on top — adds temporal awareness and episodic memory.
- **Nodes**: brands, projects, techniques, users
- **Edges**: "Brand X → prefers → dissolve transitions", "User → rejected → camera shakes on Project Y"
- **Temporal**: facts change over time (brand evolved from formal to casual over 6 months)

Neo4j is the **memory layer**. Signals are the **perception layer**. Both feed the same pipeline.

## Related

- [[project_mode2_signal_architecture]] — Signal-driven editing (Mode 2)
- [[insturix_vision]] — LLMs for understanding, rules for decisions
- [[creative_doc_graph_vision]] — Original Graphiti vision doc (Phases 2-4)
- Signal registry: `lib/editron/services/signal-registry.ts` (62 signals)
- Overlay definitions: `lib/editron/engine/overlay-definitions.json` (59 overlays)
- Threshold bandit: `lib/editron/services/threshold-bandit.ts` (35 adaptive thresholds)
- Director Graphiti query: `director-agent.ts:1974-1990` (existing brand preference lookup)

Tags: #decided #architecture #graphiti #signals #neo4j
