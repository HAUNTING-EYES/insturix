---
name: graph-architecture-decision-2026-05-19
description: "Architecture decision: separate editing + writing knowledge graphs with shared @insturix/signals module. CEO/Eng/External architect all reviewed. B+ approach — shared signal resolution, independent technique graphs, Brand DNA in MongoDB."
metadata:
  type: project
  last_updated: 2026-05-19
---

# Knowledge Graph Architecture Decision — 2026-05-19

## Decision: B+ (Separate Graphs + Shared Signal Module)

### The Problem
Two knowledge systems need to coexist:
- EDITING graph: 671 nodes, 883KB, boolean triggers, powers Editron video editing
- WRITING graph: NEW, 47 signals, 25 technique cards, scored activation, powers ThinkForge writing

Both share the concept of "creative signals" — 47 atomic properties of content. Both reference Brand DNA. Both need the scope cascade (BRAND → CAMPAIGN → FORMAT → PROJECT → SCENE).

### Options Evaluated
- A (Merge): One unified graph. Rejected — different schemas, different queries, deployment coupling, dead data inflation.
- B (Separate): Two independent graphs, no sharing. Rejected — vocabulary drift, no unified Brand DNA.
- C (Federated): Shared foundation layer + domain technique layers. Rejected — over-engineering for current scale.
- **B+ (Chosen): Separate graphs + shared signal module + Brand DNA in MongoDB.**

### Reviews
- CEO (Round 1): Recommended C (federated). Changed to B+ after synthesis. "The vocabulary problem was never about graph topology."
- Eng: Recommended B (separate). Accepted B+ with shared TypeScript interface. "Ship flat JSON first, evolve to graph."
- External Architect: Recommended B+ with one upgrade — promote shared types to a Signal Resolution Module (@insturix/signals). "Shared types enforce shape, not semantics. A module with validation prevents drift."

### Architecture
```
@insturix/signals (shared module — lib/shared/signals/)
  ├── CreativeSignals interface (47 signals, types, ranges)
  ├── Signal validation (range checking, enum validation)  
  ├── Brand DNA resolution (scope cascade from Part 0)
  ├── Signal defaults (FORMAT defaults, smart defaults)
  └── Signal ID namespace (consistent naming)

lib/editron/data/ (editing domain — unchanged)
  ├── creative-knowledge-graph.json (671 nodes)
  ├── graph-query.ts (boolean triggers)

lib/thinkforge/data/ (writing domain — NEW)
  ├── writing-knowledge-graph.json (built from doc via parser)
  ├── build-writing-graph.mjs (markdown → JSON parser)
  └── writing-graph-query.ts (scored activation)

MongoDB: brands collection (Brand DNA — both systems query via shared module)
```

### Build Order
1. NOW: Flat JSON writing knowledge (signal-strategy pairs from the 4,337-line doc)
2. NEXT: Extract @insturix/signals module from existing code
3. LATER: build-writing-graph.mjs auto-parser (markdown → structured graph)
4. PRODUCT #4: Promote module to Signal Resolution Service (microservice)

### Known Architectural Debt
- Cross-system traversal not possible (cannot ask "which editing techniques pair with this writing pattern?"). Revisit for recommendation engine.
- Drift risk: shared types enforce shape but not semantics. Module validation mitigates but doesn't eliminate.
- Product #4-5: Module must become service when thumbnails/distribute need signals.

### Writing Graph Node Types (from Eng review — different from editing)
- Signal (reuse from shared module)
- Strategy (replaces editing's Mapping — "when tension is high, use short sentences")
- Pattern (replaces editing's Technique — concrete text structures)
- Constraint (reuse from shared module)
- Example (NEW — writing benefits from exemplars, editing doesn't)

### Key Principles
- "The moat is the shared signal vocabulary, not the technique library" — CEO
- "Ship flat JSON first, evolve to graph" — Eng
- "Shared service, private interpretation" — External Architect
- Brand DNA validates on WRITE, not just on read
- Signal module is a LIBRARY now, SERVICE later
- Markdown doc (4,337 lines) is source of truth; graph is derived artifact
