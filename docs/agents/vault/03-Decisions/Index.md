# Decisions Index

## Decided
- [[D-001-Extend-Signal-Registry]] — Extend existing grid, don't build new TAG data structure
- [[D-002-L0-Stack]] — Local RMS silence + Essentia.js beats + frame histogram diff
- [[D-003-Model-Strategy]] — Start Gemini, model-agnostic interface, Qwen3-VL Phase 2
- [[D-004-Signal-Driven-Routing]] — speechCoverage/musicPresence/visualChangeRate routing
- [[D-005-Prompt-Variant]] — New creative brief prompt variant with eval harness (Rule 35)
- [[D-006-Priority-Parallel]] — Fix P0 bugs AND build visual intelligence simultaneously
- [[D-007-Obsidian-Knowledge-Base]] — Use Obsidian for persistent research/decisions across sessions
- [[D-008-Modal-Commitment]] — **YES.** 4 Modal endpoints deployed: Wav2Vec, V-JEPA, Essentia, Qwen 2.5 3B editorial. Verified in code 2026-05-26.
- [[D-009-Merge-Logic]] — **RESOLVED.** Opposing energy_ema conditions in overlay defs + rank priority (dramatic_pause=60 > dead_air=50). Verified 2026-05-26.
- [[D-011-Threshold-Calibration]] — **Thompson Sampling.** Built, wired to Director:423, persisted to MongoDB. 35 adaptive thresholds. Verified 2026-05-26.
- [[D-014-Utility-AI]] — Replace CRG + profiles with Utility AI (overlay signatures + response curves)
- [[D-015-Graphiti-Signal-Bridge]] — Graphiti injects brand preferences as signal overrides into existing pipeline. NOT a parallel system. Decided 2026-05-26.
- [[D-016-Profile-System-Removal]] — **IMPLEMENTED.** Profile selection removed from 3 workers. Standard action sequence replaces profile.actions. Utility AI filter no longer overwritten. Commit `8d296acb`. 2026-05-28.

## Open
- [[D-013-VES-Weights]] — 5 hardcoded INVENTED weights in signal-registry.ts:990. Not in threshold registry. Needs calibration.

## Deferred
- [[D-010-Qwen3-VL-Eval-Plan]] — Stalled. Gemini working fine. Revisit when needed.
- D-012 (Build Order) — Not a formal decision. Priority changes each session.

## Rejected
- **Gemma 4 fine-tuning** — User decided 2026-05-26. Pivot already in code: finetune script uses Qwen 2.5 3B, not Gemma.
