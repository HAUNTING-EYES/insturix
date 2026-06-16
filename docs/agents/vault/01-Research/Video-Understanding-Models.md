# Video Understanding Models — Comparison

## Decision Status
Status: #decided — Start with Gemini 2.5 Flash, model-agnostic interface, evaluate Qwen3-VL Phase 2. See [[D-003-Model-Strategy]].

## Detailed Comparison

### Gemini 2.5 Flash
- **Temporal grounding**: Prompt-based (good, not native)
- **Self-hostable**: No (API only)
- **Rate limits**: Yes — 429s are a documented problem in our codebase (five-track-analysis.ts:415-432 has explicit retry logic)
- **Cost per 5-min video**: ~$0.01
- **Already in stack**: YES — used for creative brief, 5-Track analysis, aesthetic gate
- **Video input**: Upload via Files API (geminiFileUri)
- **Output format**: JSON (prompted, not native)
- **Max video length**: 1 hour
- **Accuracy**: Good general purpose
- **Strengths**: Already integrated, cheapest, familiar API
- **Weaknesses**: Rate limits are our #1 operational problem, prompt-based temporal grounding is imprecise

### Qwen3-VL 8B (Alibaba)
- **Temporal grounding**: Native text-timestamp alignment (BEST architecture)
- **Self-hostable**: YES — single GPU
- **Rate limits**: None if self-hosted
- **Cost per 5-min video**: ~$0 if self-hosted
- **Already in stack**: No
- **Video input**: Direct video input
- **Output format**: JSON with timestamps (native, not prompted)
- **Max video length**: Variable by RAM
- **Accuracy**: Strong temporal, strong vision
- **Technical innovation**: Moved from T-RoPE (positional encoding tricks) to explicit textual timestamp alignment. Model natively outputs timestamps as part of its response rather than estimating them.
- **30B-A3B MoE variant**: 30B quality at 3B inference cost
- **Deployment**: Self-host on Modal.com (serverless GPU) or DashScope/Alibaba Cloud API
- **Tech report**: https://arxiv.org/abs/2511.21631
- **Strengths**: Zero rate limits, zero marginal cost, best temporal architecture, self-hostable
- **Weaknesses**: Need to manage inference infrastructure, new vendor (Modal or Alibaba)

### Twelve Labs Pegasus 1.2 / Marengo 3.0
- **Temporal grounding**: Purpose-built temporal tracking (BEST accuracy — 78.5% composite)
- **Self-hostable**: No (API only)
- **Rate limits**: Yes but dedicated infrastructure
- **Cost per 5-min video**: ~$0.31 ($0.033/min indexing + $0.021/min API)
- **Already in stack**: No
- **Video input**: Index + query model
- **Output format**: EDL-compatible, structured
- **Max video length**: 2 hours
- **Accuracy**: Highest reported composite score
- **Marengo 3.0**: Tracks objects, movement, emotion, events through time
- **Pricing at scale**: 1000 videos/month = ~$270/month just for video intelligence
- **Models overview**: https://www.twelvelabs.io/product/models-overview
- **Strengths**: Best accuracy, purpose-built for media, EDL-compatible output
- **Weaknesses**: Most expensive, not self-hostable, another vendor dependency

### InternVL (Open source)
- Less mature on temporal grounding specifically
- Worth monitoring but not actionable now

## Recommendation (decided in editron 26)
1. **Start with Gemini 2.5 Flash** — already in stack, good enough for L1 enrichment
2. **Design model-agnostic interface** — any provider returns `{timestamp, event_type, confidence}`
3. **Evaluate Qwen3-VL 8B on Modal as Phase 2** — self-hosted = zero rate limits, zero marginal cost, best temporal grounding architecture
4. **Twelve Labs for accuracy benchmark** — test their accuracy against ours, see if the $0.31/video is justified by quality difference

## Open Questions
- When to evaluate Qwen3-VL? See [[D-010-Qwen3-VL-Eval-Plan]]
- Modal.com commitment? See [[D-008-Modal-Commitment]]

Tags: #research #models #vision #decided
