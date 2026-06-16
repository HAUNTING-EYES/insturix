# D-006: Parallel Priority — P0 Bugs AND Visual Intelligence

## Status: #decided (2026-05-24 CEO review session)

## Decision
Fix P0 bugs AND build visual intelligence simultaneously. They touch different parts of the pipeline.

## P0 Bugs (parser/storyboard/transition layer)
- A3.1: Parser montage decomposition (llm-scene-parser.ts)
- A3.2: Sub-shots share ONE reference image (storyboard-service.ts)
- A3.5.1+2: Dual transition system (director-agent.ts + edl-executor.ts) — NOTE: may already be fixed
- A3.5.4: Filter schizophrenia (edl-executor.ts)

## Visual Intelligence (signal/intelligence layer)
- L0 signals (signal-registry.ts)
- Routing logic (director-agent.ts — different section)
- Creative brief variants (creative-brief.ts)

## Risk
- director-agent.ts is HOT (47 touches in 30 days). Both workstreams touch it.
- Merge conflicts possible but manageable (different functions/sections).

Tags: #decided #priority
