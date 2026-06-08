---
name: Gemma 4 Roadmap — Fine-Tuned Models for Editron
description: Complete plan for replacing Gemini Flash API calls with fine-tuned Gemma 4 models on Modal. Training data sources, deployment architecture, per-component analysis, priority order. The production fix for Mode 2 cut quality.
type: project
last_updated: 2026-05-10
---
# Gemma 4 Roadmap — Fine-Tuned Models for Editron

## Why Gemma 4

The Mode 2 cut quality problem (12 hours of iteration on 2026-05-10) proved that Gemini Flash API cannot produce deterministic editorial decisions. Same prompt, same transcript, temperature 0.1 → ±10 segment variance per run. The thesis gets cut on some runs, kept on others.

Root cause: Gemini Flash is a general-purpose API where Google controls batching, hardware routing, and model versions. We have zero control over inference determinism.

**Gemma 4 on Modal with vLLM gives us full control:**
- Temperature 0 (greedy decoding)
- FP32 precision (eliminates floating-point non-associativity)
- `VLLM_BATCH_INVARIANT=1` (eliminates batch-order effects)
- Fixed seed per request
- Our weights, our GPU, our versioning
- **Same input = same output. Every time.**

## Model Selection

| Variant | Params | Context | Multimodal | Use case |
|---------|--------|---------|------------|----------|
| **Gemma 4 26B A4B** (MoE) | 26B total, 3.8B active | 256K | Text + Image + Video | Primary — editorial intent, quality review, script parsing |
| **Gemma 4 E4B** (edge) | ~4B active | 128K | Text + Image + Audio | Fallback / lightweight — profile detection, prompt screening |

26B A4B is the sweet spot: runs at the compute cost of a 4B model (MoE activates only 3.8B per token) but has 26B total knowledge. Fits on a single A10G (24GB) with Q4 quantization.

All models are **Apache 2.0** — no restrictions on fine-tuning, deployment, or commercial use.

## Training Data Strategy

### Tier 1: Foundation (available NOW, free)

| Dataset | Size | What it provides | Source |
|---------|------|------------------|--------|
| LARD | 96K examples | Paired fluent/disfluent text with exact disfluency span labels (repetitions, replacements, restarts) | Zenodo |
| DisfluencySpeech | 5K utterances (10hrs) | 4 progressive cleanup tiers — delta between tiers = KEEP/CUT labels | HuggingFace (Apache 2.0) |
| SEP-28k | 28K clips | Podcast disfluency labels: blocks, prolongations, repetitions, interjections | GitHub/Kaggle (Apple) |
| Switchboard NXT | 205K utterances | Word-level reparandum/repair/edit-term labels — gold standard | LDC or free re-annotated GitHub version |
| Disfl-QA | 12K pairs | Paired clean/disfluent questions with tagged disfluency types | HuggingFace (CC BY 4.0) |
| AMI Disfluency | 35K events | Meeting speech with timestamped disfluency type labels | HuggingFace (CC BY 4.0) |
| SwDA Dialogue Acts | 205K utterances | Utterance-level tags: "abandoned", "self-talk", "backchannel" = CUT categories | HuggingFace (free) |

**Total: ~380K+ labeled examples.** More than enough for fine-tuning.

### Tier 2: Synthetic Generation (unlimited, from our own data)

Method: LLM disfluency injection (validated by 2024 paper — achieved SOTA on Switchboard with synthetic data alone).

1. Take clean scripts from ThinkForge (thousands available)
2. Use Claude/Gemini to inject realistic disfluencies:
   - Stutters: "I-- I think the main p-- point is..."
   - Retakes: "The key issue is-- actually wait. The key issue is..."
   - Meta: "Is this recording? OK. So anyway..."
   - Fillers: "So, um, like, the thing is..."
   - False starts: "What I wanted to-- So basically-- The core idea is..."
3. Label injected portions as CUT, original as KEEP
4. Filter with uncertainty-aware validation

### Tier 3: Domain Adaptation (bootstrapped from production)

1. Deploy initial fine-tuned model
2. Run on real user uploads
3. User validates/corrects the KEEP/CUT decisions
4. Feed corrections back as training data
5. Re-fine-tune periodically
6. Model improves over time → TRIBE-like learning loop

### What DOESN'T Exist (Our Moat)

No public dataset labels transcript segments as KEEP/CUT for video editing. The framing is novel. Everyone labels disfluency TYPES. Nobody labels editorial DECISIONS. We'd be creating the first editorial decision dataset — potential open-source contribution and competitive moat.

## Deployment Architecture

```
User uploads raw footage
       ↓
Transcription (Grok STT — word-level + diarization)
       ↓
Segmentation (code — deterministic)
       ↓
Silence + filler detection (code — deterministic)
       ↓
GEMMA 4 EDITORIAL CLASSIFIER (Modal, vLLM)
  → Full transcript, all segments
  → Per-segment: KEEP or CUT
  → Temperature 0, FP32, batch_invariant=1
  → DETERMINISTIC — same input = same output
       ↓
Silence removal execution (code — deterministic)
       ↓
Director Agent Path D (signal-driven editing)
       ↓
Render
```

### Modal Deployment

```python
# modal/gemma_editor.py
app = modal.App("gemma-editorial")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("vllm>=0.8", "torch>=2.4", "huggingface_hub")
)

@app.cls(gpu=modal.gpu.A10G(), image=image, timeout=300)
class GemmaEditor:
    model_id = "google/gemma-4-26b-a4b-it"  # or fine-tuned version
    
    @modal.enter()
    def load(self):
        from vllm import LLM
        self.llm = LLM(
            model=self.model_id,
            quantization="awq",  # or gptq
            dtype="float32",     # determinism
            enforce_eager=True,  # determinism
        )
    
    @modal.method()
    def classify(self, segments: list[dict]) -> dict:
        # Full transcript → KEEP/CUT per segment
        ...
```

### Cost Estimate

| Item | Cost |
|------|------|
| Modal A10G (scale-to-zero) | $0.000306/second = ~$1.10/hr when active |
| Per video (~60s inference) | ~$0.02 |
| 1000 videos/month | ~$20/month |
| vs Gemini Flash API (1000 videos) | ~$350-1400/month |
| **Savings** | **17-70x cheaper** |

## Component-by-Component Gemma 4 Plan

### Priority 1: Editorial Intent Classification (THE CUT FIX)
- **Status:** Highest priority. The reason for this entire roadmap.
- **Model:** Gemma 4 26B A4B, fine-tuned on LARD + DisfluencySpeech + SEP-28k + synthetic data
- **Training:** QLoRA via Unsloth, rank 16, 4-bit quantization, train on single A10G in <1 hour
- **Output:** Per-segment KEEP/CUT decision (binary classification)
- **Determinism:** Temperature 0, FP32, VLLM_BATCH_INVARIANT=1, fixed seed
- **Effort:** 2-3 weeks (data prep + fine-tune + deploy + test)
- **Replaces:** `editorial-intent-detector.ts` (Gemini Flash, non-deterministic, ±10 segments)

### Priority 2: Quality Review
- **Model:** Gemma 4 26B A4B, fine-tuned on historical quality scores
- **Output:** 0-100 score + structured reasoning
- **Training data:** Every video scored by current pipeline = training pair
- **Effort:** 3-4 weeks
- **Replaces:** Quality review Gemini call

### Priority 3: Script Parsing
- **Model:** Gemma 4 26B A4B, fine-tuned on (script, storyboard_json) pairs
- **Output:** Structured storyboard JSON
- **Training data:** Historical pipeline outputs (script → storyboard)
- **Effort:** 4-6 weeks
- **Replaces:** `llm-scene-parser.ts` (Gemini Flash)

### Priority 4: AI Chat (simple tool calls)
- **Model:** Gemma 4 26B A4B, fine-tuned on tool definitions + example conversations
- **Output:** Tool calls with parameters
- **Hybrid:** Gemma for simple commands, Gemini fallback for complex multi-step reasoning
- **Effort:** 4-6 weeks
- **Replaces:** Simple tool calls in `llm-service-google.ts`

### Priority 5: Profile Auto-Detection
- **Model:** Gemma 4 E4B (lightweight, classification only)
- **Output:** Profile ID from 54 options
- **Training data:** Historical (script_features, selected_profile) pairs
- **Effort:** 1-2 weeks
- **Replaces:** Part of `profile-detection-service.ts`

### KEEP on Gemini Flash (not worth replacing)
- **Unified Intelligence:** Creative quality = product quality. Gemma's reasoning gap (7+ points on benchmarks) directly affects output.
- **5-Track Vision (Tier 1):** Subject tracking, motion analysis, decisive moment detection. Vision quality gap too large.

### NEW Capabilities (Gemma enables things we can't do today)
- **Prompt quality pre-screening:** Score video gen prompts before burning credits ($0.60/Kling clip)
- **Real-time upload preview:** On-device analysis: "12 min footage, ~3 min silence, tutorial style"
- **Pipeline error triage:** Auto-classify failure types from logs
- **AI slop detection from frames:** Learn visual slop patterns instead of heuristic rules
- **Caption style classification:** Auto-select caption style from content type

## Fine-Tuning Approach

### Tools
- **Unsloth:** 1.6x faster fine-tuning, 60% less VRAM
- **QLoRA:** 4-bit quantization, rank 16, dropout 0.05, applied to all linear layers
- **vLLM:** Inference engine with batch invariance mode for determinism

### Data Format (classification)
```jsonl
{"messages": [
  {"role": "user", "content": "Classify this transcript segment as KEEP or CUT:\n\n[Context: previous segment was about internet trolls]\n\"I th- I think, I believe, I'm, I'm thinking anonymity doesn't bring out the worst in people.\""},
  {"role": "assistant", "content": "KEEP"}
]}
```

### Data Format (holistic edit — future)
```jsonl
{"messages": [
  {"role": "user", "content": "You are a professional editor. Here are all 202 transcript segments. For each, say KEEP or CUT:\n\n[0] (2s) \"Hello!\"\n[1] (5s) \"I think my mic is on...\"\n..."},
  {"role": "assistant", "content": "{\"keep\": [4, 7, 12, ...], \"cut\": [0, 1, 2, 3, 5, 6, ...]}"}
]}
```

### Training Hardware
- Single A10G on Modal (~$1.10/hr)
- QLoRA fine-tuning takes <1 hour for 50K examples
- Total fine-tuning cost: ~$2-5

## Model Selection Update (2026-05-11)

### Current: Qwen 2.5 3B Instruct (deployed on Modal)
- Apache 2.0, ungated, 8.7M downloads
- #1 classification family (Distil Labs benchmarks across 4 tasks)
- Trained specifically for structured JSON output
- 128K context, 3B params, fits A10G ($1.10/hr)
- ~$0.04 per video (Grok STT $0.03 + Qwen $0.01)

### Why NOT Gemma 4
- Gemma 4 E4B: Unsloth doesn't support it yet, torchvision/xformers version conflicts on Modal
- Gemma 4 26B-A4B: OOMs on A10G (24GB), needs A100 ($3.30/hr)
- Gemma 3 4B: Gated model, needs HuggingFace auth agreement
- Base Gemma (no fine-tuning): kept ALL 248 segments, didn't understand the task

### Future: MiniCPM-o 4.5 (skip STT entirely)
- 9B multimodal: video + audio + text in one model
- Can process raw video frames + speech directly — no need for Grok STT
- Apache 2.0, from Tsinghua/OpenBMB
- Whisper-medium-300M built in for speech, SigLip2 for vision
- MiniCPM-V 4.5: 96x video token compression (6 frames = 64 tokens)
- Would see visual cues (speaker looking away, gestures, clapping) that transcripts miss
- Cost: ~$0.15/video (A100 needed) vs $0.04 with Grok+Qwen
- Worth revisiting when quality ceiling of text-only approach is reached

### Cost Comparison
| Approach | Per video | Monthly (1K videos) | GPU | Quality ceiling |
|---|---|---|---|---|
| Grok STT + Qwen 2.5 3B | $0.04 | $40 | A10G | Text-only understanding |
| MiniCPM-o 4.5 (direct video) | $0.15 | $150 | A100 | Sees video + audio + text |
| Gemini Flash API (current) | $0.35-1.40 | $350-1400 | None (API) | Non-deterministic |

## Relationship to Existing Tech (Built 2026-05-10)

The following tech was built this session and is ON DISK (not wired in). When Gemma 4 is deployed, these serve different roles:

| Tech | File | New role with Gemma |
|------|------|--------------------|
| Holistic Editor | `holistic-editor.ts` | **Replaced** by Gemma 4 classifier. The ONE-call-full-context concept was right; Gemma does it deterministically. |
| Repetition Intent Discriminator | `repetition-intent-discriminator.ts` | **Supplementary.** Runs AFTER Gemma classifier as a deterministic safety net for intentional repetition protection. |
| Argument Structure Protector | `argument-structure-protector.ts` | **Merged into Gemma.** The fine-tuned model learns what's essential from training data, no separate call needed. |
| Bleed-through Fix 1+2 | `silence-removal-executor.ts` | **Stays.** Correct math fix, independent of classifier. |
| Grok STT diarize=true | `transcription-service.ts` | **Stays.** Speaker labels feed into Gemma as input features. |

## Research Foundations

### Disfluency Detection
- ACNN (EMNLP 2018): F1 86% on Switchboard — the text-only baseline
- BiLSTM-CRF + ELMo: F1 91% — best linear model
- Google Android Live Captions: 3.1M param distilled model — proves small models work
- LLM as disfluency generator (2024): SOTA on Switchboard using synthetic data

### Nobody Has Solved Intent Discrimination
Verified 2026-05-10: exhaustive search across Reddit, Google Scholar, arXiv, GitHub, patents, 8+ products. No product/paper distinguishes intentional repetition from accidental retakes. Our discriminator + Gemma classifier = first in market.

### Competitive Moat
4 technologies nobody else has (verified via market analysis):
1. Creative Knowledge Graph (671 nodes of editing theory)
2. Signal-Driven Editing (95 mappings, 50 constraints, deterministic)
3. Repetition Intent Discriminator (completeness × variation × timing)
4. TRIBE (Thompson Sampling on editing preferences)

Gemma 4 adds a 5th: **Deterministic editorial classification** — every competitor uses non-deterministic LLM APIs.

## Timeline

| Week | Milestone |
|------|-----------|
| 1 | Download LARD + DisfluencySpeech + SEP-28k. Generate 50K synthetic examples from ThinkForge scripts. Format for QLoRA. |
| 2 | Fine-tune Gemma 4 26B A4B on combined dataset. Deploy on Modal. Test with Hank Green video. |
| 3 | Compare against stable pipeline. Tune thresholds. A/B test with real users. |
| 4 | Ship as primary editorial classifier. Monitor. Collect correction data for Tier 3 adaptation. |
| 5-6 | Fine-tune for quality review (Priority 2). |
| 7-10 | Fine-tune for script parsing (Priority 3). |
| 11+ | AI chat tool calling (Priority 4). |
