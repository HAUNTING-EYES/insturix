# Mode 2 Architecture
#architecture #mode2

> Mode 2 = user uploads raw footage, AI edits it. Signal-driven, NOT profile-driven. Zero profile dependency. Content-driven ONLY.

---

## Philosophy

An editor responds to what is happening in the video, not to a clock. The speaker's energy, entities, and topic shifts drive editing. No structural rules (pacing timers, position zones) -- those are Mode 1 assembly concepts.

Moved away from the 54-profile system deliberately (commits c67b839f + 74709152, May 2026).

---

## 7 Signal-Driven Services (Path D)

| # | Service | File | Role |
|---|---------|------|------|
| 1 | **Signal Registry** | `signal-registry.ts` | Dual-timing signal collection: grid every 15 frames + event at word timestamps. Speech, visual, audio, structural, composite signals. |
| 2 | **Signal Executor** | `signal-executor.ts` | Evaluates 95 mappings from [[Creative-Knowledge-Graph]]. Skips `structural`, `title-card`, `music-editing` categories for Mode 2. |
| 3 | **Genre Parameter Computer** | `genre-parameter-computer.ts` | Computes 9 parameters from signals: pacing_tolerance, energy_baseline, transition_density, graphic_density, silence_tolerance, zoom_budget, sfx_density, color_temperature, formality. NO profiles. |
| 4 | **Moment Weight Service** | `moment-weight-service.ts` | TRIBE-compatible multi-source weighting. Currently flat/Gemini. Future: thompson, vjepa, wav2vec, eml. |
| 5 | **Humanize Pass** | `humanize-pass.ts` | Post-signal-execution organic variation (+/-3 frame jitter, +/-15% duration). Seeded by projectId (deterministic). |
| 6 | **Constraint Enforcer** | `constraint-enforcer.ts` | 8-pass validation of 50 constraints from creative knowledge graph Part 4. Includes transition_repetition and fade_to_black_overuse. |
| 7 | **Content Type Detector** | `content-type-detector.ts` | Rule-based content classification from transcript signals. Maps to content types, NOT profiles. |

---

## Path D Flow in Director Agent

```
D.1: Compute genre parameters from signals
D.2: Build moment weight map (flat if no Gemini)
D.3: Build signal timeline (grid + event)
D.4: Execute signal-driven edit (95 mappings)
D.5: Humanize pass (organic imperfection)
D.6: Constraint enforcement (50 constraints, 8 passes)
  -> Execute EDL
```

---

## Where Profiles Still Appear (post-Path D)

- Video analysis worker (line 295-323): detects profile for Director Agent
- Director Agent (lines 417-419): falls through to Unified Intelligence (profile-based) ONLY if Path D throws
- After Path D EDL executes: profile-based actions still run (filters, transitions, captions, motion graphics, audio ducking, SFX, quality review)
- Mode 2-specific: fancy_captions replaced with standard add_captions for editability (line 713)
- Profile step `add_transition` checks for existing EDL transitions and skips boundaries that already have them

---

## Editorial Intent Detection

File: `editorial-intent-detector.ts`

- Gemini Flash classifies segments as CONTENT / META_DISCARD / META_KEEP
- Wired into `raw-footage-processor.ts` Step 4.5 (after segmentation, before best-take detection)
- META_DISCARD segments added to silence removal plan as `reason: 'meta-discard'`
- Retroactive flagging: "that last shot was bad" marks PREVIOUS segment for removal
- Anti-overfire: confidence threshold 0.7, default is CONTENT, charged silence protection

---

## Repetition Intent Discriminator

### The Problem
When a speaker repeats something, the system must decide: RETAKE (cut) or INTENTIONAL (keep). No product, paper, patent, or open-source project solves this generally. Verified via exhaustive search (2026-05-10).

### The Solution: Completeness + Variation

Two signals:
1. **Completeness** -- does the segment end with sentence-final punctuation (. ! ?)
2. **Variation Type** -- IDENTICAL (Jaccard > 0.95), ESCALATING (each rep adds words), or REPHRASING (Jaccard 0.3-0.8)

**Decision Matrix:**

| Completeness | Variation | Decision |
|---|---|---|
| All COMPLETE + IDENTICAL | INTENTIONAL (keep all) |
| All COMPLETE + ESCALATING | INTENTIONAL (keep all) |
| Mixed (some INCOMPLETE) + REPHRASING | RETAKE (keep best) |
| All COMPLETE + REPHRASING | AMBIGUOUS (use tiebreakers) |
| All INCOMPLETE | RETAKE (keep last/longest) |

**AMBIGUOUS Tiebreakers:**
- < 10s apart --> RETAKE (rapid-fire attempts)
- > 30s apart --> KEEP both (different argument points)
- Word count varies > 50% --> KEEP both (elaboration)
- 10-30s gap (dead zone) --> KEEP both (preservation > aggression)

**Adversarial test results:** 82% raw --> 96.4% after 6 heuristic fixes --> 52/54 profiles safe.

### Implementation Phases

| Phase | What | Coverage | Effort |
|---|---|---|---|
| Phase 1 | Text-only discriminator | 52/54 profiles | 3-4 days |
| Phase 2 | Grok STT + speaker diarization | 53/54 profiles | 2-3 days |
| Phase 3 | Prosodic analysis (Modal GPU) | 54/54 profiles | 1-2 weeks |

File: `lib/editron/services/repetition-intent-discriminator.ts`

---

## LLM Protection Architecture

### Core Insight
LLM for PROTECTION (what must stay), rules for CUTTING (what should go).

```
Step 1: FULL transcript -> ONE Gemini call (~3500 tokens)
  -> "Identify the 10-15 ESSENTIAL segments: thesis, key arguments,
     punchlines, conclusion. These are PROTECTED."
  -> Returns: protectedSegmentIndices[]

Step 2: Deterministic rules handle cutting:
  -> Silence removal (VAD)
  -> Filler removal (keyword)
  -> Disfluency/stutter detection (intra-segment splitter)
  -> Retake detection (best-take + discriminator)
  -> Meta detection (editorial intent -- REDUCED scope)

Step 3: Protection override:
  -> protectedSegmentIndices are NEVER cut by any rule
  -> Even if editorial intent says META_DISCARD -- protection wins
```

**Why this works:** LLM makes ~15 decisions (protection), not 248 (classification). Fewer decisions = less non-determinism. If LLM misses a protection, slightly shorter video (not broken argument). If LLM over-protects, extra content stays (viewer does not notice).

---

## Gemma 4 Roadmap (Deterministic Classifier)

### Why Replace Gemini Flash

Gemini Flash API cannot produce deterministic editorial decisions. Same prompt, same transcript, temperature 0.1 --> +/-10 segment variance per run. Root cause: Google controls batching, hardware routing, and model versions. Zero control over inference determinism.

### Model Selection (Updated 2026-05-11)

**Current choice:** Qwen 2.5 3B Instruct on Modal
- Apache 2.0, ungated, 8.7M downloads
- #1 classification family (Distil Labs benchmarks across 4 tasks)
- 128K context, 3B params, fits A10G ($1.10/hr)
- ~$0.04 per video (Grok STT $0.03 + Qwen $0.01)

**Future:** MiniCPM-o 4.5 (skip STT entirely)
- 9B multimodal: video + audio + text in one model
- Processes raw video frames + speech directly
- Would see visual cues that transcripts miss
- ~$0.15/video (A100 needed)

**Why NOT Gemma 4 directly:**
- Gemma 4 E4B: Unsloth doesn't support it yet, version conflicts on Modal
- Gemma 4 26B-A4B: OOMs on A10G (24GB), needs A100 ($3.30/hr)
- Gemma 3 4B: Gated model, needs HuggingFace auth agreement

### Cost Comparison

| Approach | Per video | Monthly (1K) | GPU |
|---|---|---|---|
| Grok STT + Qwen 2.5 3B | $0.04 | $40 | A10G |
| MiniCPM-o 4.5 | $0.15 | $150 | A100 |
| Gemini Flash API (current) | $0.35-1.40 | $350-1400 | None |

### Training Data Strategy

**Tier 1: Foundation (available now, free) -- 380K+ labeled examples**

| Dataset | Size | What it provides |
|---------|------|------------------|
| LARD | 96K examples | Paired fluent/disfluent text with disfluency span labels |
| DisfluencySpeech | 5K utterances (10hrs) | 4 progressive cleanup tiers |
| SEP-28k | 28K clips | Podcast disfluency labels |
| Switchboard NXT | 205K utterances | Word-level reparandum/repair/edit-term labels |
| Disfl-QA | 12K pairs | Paired clean/disfluent questions |
| AMI Disfluency | 35K events | Meeting speech with timestamped disfluency labels |
| SwDA Dialogue Acts | 205K utterances | Utterance-level tags: abandoned, self-talk, backchannel |

**Tier 2: Synthetic Generation** -- LLM disfluency injection from ThinkForge scripts

**Tier 3: Domain Adaptation** -- bootstrapped from production user corrections

### Deployment Architecture

```
User uploads raw footage
  -> Transcription (Grok STT -- word-level + diarization)
  -> Segmentation (code -- deterministic)
  -> Silence + filler detection (code -- deterministic)
  -> FINE-TUNED CLASSIFIER (Modal, vLLM)
     Temperature 0, FP32, batch_invariant=1
     DETERMINISTIC -- same input = same output
  -> Silence removal execution (code -- deterministic)
  -> Director Agent Path D (signal-driven editing)
  -> Render
```

### Component-by-Component Replacement Plan

| Priority | Component | Model | Replaces | Effort |
|---|---|---|---|---|
| P1 | Editorial Intent Classification | 26B A4B fine-tuned | `editorial-intent-detector.ts` | 2-3 weeks |
| P2 | Quality Review | 26B A4B fine-tuned | Quality review Gemini call | 3-4 weeks |
| P3 | Script Parsing | 26B A4B fine-tuned | `llm-scene-parser.ts` | 4-6 weeks |
| P4 | AI Chat (simple tool calls) | 26B A4B fine-tuned | Simple calls in `llm-service-google.ts` | 4-6 weeks |
| P5 | Profile Auto-Detection | E4B lightweight | `profile-detection-service.ts` | 1-2 weeks |

**KEEP on Gemini Flash:**
- Unified Intelligence (creative quality = product quality, reasoning gap too large)
- 5-Track Vision Tier 1 (subject tracking, motion analysis, vision quality gap too large)

### Competitive Moat

5 technologies nobody else has:
1. [[Creative-Knowledge-Graph]] (671 nodes of editing theory)
2. Signal-Driven Editing (95 mappings, 50 constraints, deterministic)
3. Repetition Intent Discriminator (completeness x variation x timing)
4. [[TRIBE]] (Thompson Sampling on editing preferences)
5. Deterministic editorial classification (every competitor uses non-deterministic LLM APIs)

---

## Known Issues (as of 2026-05-10)

- Motion graphics broken globally: `findBestTemplate()` returns null (query text does not match MongoDB template tags)
- Gemini meta classification is non-deterministic (+/-10 segments per run)
- Cannot use audio/prosodic signals for intent detection yet (Phase 3)
- Grok STT 400 error from R2 presigned URLs not serving correct content-type headers

---

## Related

- [[ThinkForge-State]] -- script authoring feeds Mode 2 via export
- [[Product-Integration-Plan]] -- Mode 2 sits in the Editron production pipeline
- [[Creative-Knowledge-Graph]] -- 671 nodes, 799 edges driving signal executor
