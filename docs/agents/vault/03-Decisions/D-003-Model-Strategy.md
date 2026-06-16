# D-003: Model Strategy

## Status: #decided (editron 26, 2026-05-23)

## Decision
1. Start with Gemini 2.5 Flash (already in stack)
2. Design model-agnostic interface: any provider returns `{timestamp, event_type, confidence}`
3. Evaluate Qwen3-VL 8B self-hosted on Modal as Phase 2
4. Use Twelve Labs for accuracy benchmarking only

## Why
- Gemini is already integrated, cheapest, familiar
- Model-agnostic interface means swapping is a config change, not a rewrite
- Qwen3-VL has best temporal grounding architecture (native timestamps, not prompt tricks)
- Self-hosted = zero rate limits (our #1 operational problem with Gemini)
- Twelve Labs is most accurate but most expensive ($0.31/video)

## Related
- [[Video-Understanding-Models]] — full comparison
- [[D-008-Modal-Commitment]] — infra decision for Qwen3-VL hosting
- [[D-010-Qwen3-VL-Eval-Plan]] — when and how to evaluate

Tags: #decided #models
