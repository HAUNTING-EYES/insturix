---
name: feedback-use-graphify
description: "Always query graphify knowledge graph before architecture/creative decisions, not just CRG."
metadata: 
  node_type: memory
  type: feedback
  last_updated: 2026-05-23
  originSessionId: 8d5a9549-af61-40b6-98d0-9695ded9cf85
---

Always query graphify knowledge graph (graphify-out/) in addition to CRG before creative/architecture decisions.

**Why:** User built graphify specifically for this purpose. It has 1673 nodes mapping the full codebase architecture. Skipping it means missing cross-module dependencies and community structure that CRG alone doesn't capture.

**How to apply:**
- Read `graphify-out/GRAPH_REPORT.md` for god nodes and community structure before architecture changes
- Use `graphify query "<question>"` CLI for cross-module questions
- Use `graphify path "<A>" "<B>"` for dependency paths
- After modifying code, run `graphify update .` to keep graph current
- Related: [[feedback-rules-upfront]], [[ceo-elon-review-signal-architecture-for-motion-graphics]]
