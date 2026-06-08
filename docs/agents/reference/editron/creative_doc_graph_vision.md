---
name: Creative Production Knowledge as Living Graph
description: The creative doc (v2, 37 pages) should live as a Graphiti knowledge graph, not a static document. It grows per-project through the feedback loop architecture described in doc §11.5.
type: project
last_updated: 2026-04-24
originSessionId: 4d413f79-e253-433c-aec2-c835ed7c9b20
---
# Creative Production Knowledge — Graph Architecture Vision

**User's vision (2026-04-24):** The creative production knowledge document should not be a static PDF/markdown file. It should live as a knowledge graph (Graphiti or Graphify) that:

1. **Starts as the doc** — all 12 sections ingested as graph nodes with relationships (technique → emotional effect, shot type → sound pairing, transition → failure mode)
2. **Grows per-project** — every project that runs through the pipeline feeds outcomes back into the graph via §11.5 feedback loop: `DETECT → DIAGNOSE → RECORD → STORE → QUERY`
3. **Becomes per-brand** — brand DNA (colors, voice, pacing preferences) lives alongside creative knowledge. "For [this brand], [this technique] worked/failed"
4. **Becomes per-user** — User Preference DNA tracks which overrides the user makes, feeding personalization

**The graph structure:**
- Nodes: techniques (dissolve, crash zoom, PAS structure, warm grading...), content types, emotional effects, cultural contexts, failure modes, brand profiles
- Edges: "works for", "pairs with", "conflicts with", "fails when", "preferred by [user/brand]"
- Temporal: edges have time context — "preferred since 2026-04", "deprecated after [project X failed]"

**Implementation path:**
- Phase 1 (now): Creative doc v2 exists as PDF/text. Graphify has already extracted some nodes from it during the full-mode run.
- Phase 2 (post-merge): Ingest creative doc v2 into Graphiti as the seed graph. Each [TECHNICAL SPEC] becomes a deterministic node. Each technique menu entry becomes a queryable node.
- Phase 3 (with users): Feedback loop wires into the graph. Each project outcome adds edges: "dissolve between warm scenes → worked (proj_X)" or "crash zoom on testimonial → too aggressive (proj_Y)"
- Phase 4 (personalization): Per-user preference DNA as temporal edges on the same graph

**Why Graphiti not Graphify for this:**
- Graphiti has temporal edges (facts change over time) — perfect for "this technique worked until we learned it doesn't for X"
- Graphiti is designed for agent memory — the Unified Intelligence Engine can query it
- Graphify is for codebase structure — it already serves that role
- Both can coexist: Graphify for code navigation, Graphiti for creative knowledge + brand DNA
