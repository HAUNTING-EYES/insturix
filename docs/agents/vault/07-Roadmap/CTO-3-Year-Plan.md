---
tags:
  - roadmap
aliases:
  - CTO Roadmap
  - 3-Year Plan
last_updated: 2026-03-28
source: project_cto_roadmap.md
---

# CTO 3-Year Roadmap (2026-2028)

> Transition from fragmented AI tools into a Unified Autonomous Creator Operating System powered by a Universal Agent and Centralized Brand Memory Layer.

See also: [[Insturix-Vision]] for the north star that drives this roadmap.

---

## Vision

Transition from fragmented AI tools into a **Unified Autonomous Creator Operating System** powered by a Universal Agent and Centralized Brand Memory Layer.

---

## Core Architecture (Not Yet Built)

### Central Memory Layer (Brand DNA Vault)

Centralized vector DB per user/brand — stores brand language, colors, pacing, past scripts, performance data. Every service queries this for brand consistency.

This is the backbone of the multi-product strategy. Without it, each product (Editron, ThinkForge, Clickatron, UploaderX) operates in isolation.

### Universal Agent (The Orchestrator)

Master routing agent — users interact via natural language, agent triggers Editron/Clickatron/ThinkForge/UploaderX autonomously via function calling.

- Single entry point for all creative work
- Understands cross-product context (a script in ThinkForge becomes a video in Editron becomes a post in Clickatron)
- Routes to the right product pipeline without user needing to know the internal architecture

---

## Strategic Alignment

**Why this matters:** This is the CTO's strategic vision. All feature decisions should align with this trajectory.

**How to apply:**
- When building new features, check if they advance the roadmap
- Prioritize Year 1 items
- Don't build things that conflict with the long-term architecture (e.g., don't hardcode per-service logic that should go through the Universal Agent)

---

## Per-Product Plans

See the full roadmap document for detailed Year 1-3 breakdowns per product. Key Year 1 priorities are documented in status checks.

### Product Ecosystem

```
ThinkForge (Scripts) -> Editron (Video) -> UploaderX (Distribution)
                     -> Clickatron (Posts)
                                          <- Alyzzitron (Analytics/Feedback)
```

The Brand DNA Vault sits at the center, providing consistency across all products. The Universal Agent orchestrates the flow.

See also: [[Editron-Pipeline-Map]] for how Editron specifically fits into this ecosystem.
See also: [[Editron-Stable-V2-Snapshot]] for current Editron capabilities.
