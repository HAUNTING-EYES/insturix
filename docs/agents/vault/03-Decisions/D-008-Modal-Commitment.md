# D-008: Modal.com Python Sidecar

## Status: #open

## Question
Should we add Modal.com as a Python sidecar for:
1. PySceneDetect (production-grade scene detection)
2. Qwen3-VL 8B self-hosted inference (zero rate limits)
3. Future Python ML tools (librosa, etc.)

## Arguments For
- PySceneDetect is gold standard for scene detection. JS alternatives (frame histogram diff) are approximate.
- Qwen3-VL self-hosted eliminates Gemini 429 rate limit problem entirely
- Serverless — no idle cost, auto-scaling, no infra management
- Used by Anthropic, Ramp, Suno (production-proven)
- Cold start ~2-3s, warm ~100ms
- Already use serverless patterns (Vercel + Lambda)

## Arguments Against
- New vendor dependency
- Another system to monitor, debug, pay for
- Team needs to learn Modal SDK
- Could start with JS alternatives (sharp histogram diff) and add Modal later if needed

## Recommendation (from editron 26)
Defer to Phase 2. Start with JS-only L0 (sharp histogram diff). If quality insufficient, add Modal for PySceneDetect. Modal becomes essential when Qwen3-VL evaluation begins.

## Related
- [[D-010-Qwen3-VL-Eval-Plan]]
- [[JS-TS-Video-Libraries]]

Tags: #open #infrastructure
