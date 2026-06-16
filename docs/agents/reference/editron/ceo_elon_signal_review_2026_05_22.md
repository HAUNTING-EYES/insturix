---
name: ceo-elon-review-signal-architecture-for-motion-graphics
description: "First-principles review of whether 23 signals is enough. Verdict: NO. 34 signals across 5 dimensions needed. PERCEPTUAL is the blind spot."
metadata: 
  node_type: memory
  type: review
  last_updated: 2026-05-22
  originSessionId: f1d82ad4-6377-4dac-87b4-198e93d692a9
---

# CEO + Elon Review: Signal Architecture for MG Composition

**Date:** 2026-05-22
**Reviewer:** CTO mode (first-principles, no yes-man)
**Question:** Is 23 signals enough for the MG composition engine?
**Verdict:** NO. 34 signals across 5 dimension groups. PERCEPTUAL is the biggest blind spot.

## The Problem

We're targeting 23 signals reaching the MG composition engine (8 current PlannerSignals + 9 to wire from registry + 6 new). But the NUMBER isn't the issue — the COVERAGE of dimensions is.

## Current State (Verified from code)

- **signal-registry.ts:** 44 signals total (grid-based + event-based + composites + globals)
- **ContentSignals (motion-theme-resolver.ts):** 17 signals → MotionTokens
- **PlannerSignals (composition-planner.ts):** 8 continuous → composition decisions
- **Actual signals reaching MG composition:** ~11 useful (8 planner + music_energy + position + face_present)
- **27 signals exist in registry but DON'T reach MG composition**

## The 5 Dimension Framework

From research (EditDuet SIGGRAPH 2025, VEU-Bench CVPR 2025, "Towards Data-Driven Automatic Video Editing"), professional editing decisions are driven by 5 orthogonal dimensions:

### 1. TEMPORAL — Where are we in time?
| Signal | Status | Source | Effort |
|---|---|---|---|
| position_in_video (0-1) | ✅ HAVE | signal-registry.ts:309 | — |
| section_position (intro/body/climax/outro) | ❌ MISSING | Derive from position + pacing | EASY |
| pacing_trend (accelerating/decelerating) | ❌ MISSING | Derivative of pacing_velocity over 10s | EASY |
| time_since_last_graphic (frames) | ❌ NOT WIRED | signal-registry.ts:310 | WIRE ONLY |
| content_density_trend (increasing/decreasing) | ❌ MISSING | Word rate derivative | EASY |

### 2. CONTENT — What's being said/shown?
| Signal | Status | Source | Effort |
|---|---|---|---|
| name_mentioned (binary) | ✅ HAVE | creative-brief.ts:406 | — |
| number_mentioned (binary) | ✅ HAVE | creative-brief.ts:402 | — |
| sentiment (0-1, positive/negative) | ❌ MISSING | HuggingFace model | MEDIUM |
| information_density (words/sec + entity count) | ❌ MISSING | Transcript analysis | EASY |
| topic_keywords (string[]) | ❌ MISSING | NER extraction | EASY |
| claim_strength (hedged/assertive) | ❌ NOT WIRED | signal-registry.ts event-based | WIRE ONLY |

### 3. EMOTIONAL — How does it feel?
| Signal | Status | Source | Effort |
|---|---|---|---|
| formality (-1 to +1) | ✅ HAVE | PlannerSignals:25 | — |
| enthusiasm (0-1) | ✅ HAVE | PlannerSignals:26 | — |
| warmth (0-1) | ✅ HAVE | PlannerSignals:27 | — |
| emotional_arousal (0-1) | ✅ HAVE | PlannerSignals:28 | — |
| humor (0-1) | ✅ HAVE | PlannerSignals:30 | — |
| visceral_impact (0-1) | ✅ HAVE | PlannerSignals:31 | — |
| face_emotion (categorical) | ❌ NOT WIRED | V-JEPA signal-registry.ts:288 | WIRE ONLY |
| vocal_stress (0-1) | ❌ NOT WIRED | Wav2Vec signal-registry.ts:260 | WIRE ONLY |

### 4. PERCEPTUAL — What does the frame look like? ← THE BIG GAP
| Signal | Status | Source | Effort |
|---|---|---|---|
| motion_intensity (0-1) | ❌ NOT WIRED | signal-registry.ts:266 | WIRE ONLY |
| shot_type (close/medium/wide) | ❌ NOT WIRED | signal-registry.ts:267 | WIRE ONLY |
| color_temperature (warm/neutral/cool) | ❌ MISSING | Frame histogram analysis | EASY |
| dominant_color (hex) | ❌ MISSING | K-means clustering | EASY |
| visual_complexity (0-1) | ❌ MISSING | Frame entropy / edge density | MEDIUM |
| text_on_screen (boolean) | ❌ MISSING | OCR or V-JEPA text detection | MEDIUM |
| subject_safe_zone (quadrant map) | ❌ MISSING | Subject bbox from 5-Track | EASY |

**ZERO perceptual signals reach MG today.** A professional MG designer's FIRST decision is always perceptual.

### 5. RHYTHMIC — What's the beat doing?
| Signal | Status | Source | Effort |
|---|---|---|---|
| music_beat (binary, tactus) | ✅ HAVE | signal-registry.ts:305 | — |
| music_section (verse/chorus/etc) | ✅ HAVE | signal-registry.ts:306 | — |
| music_energy (0-1) | ✅ HAVE | signal-registry.ts:304 | — |
| music_downbeat (binary, bar-level) | ❌ MISSING | Derive from BPM + time signature | EASY |
| music_bar_boundary (binary) | ❌ MISSING | Derive from BPM | EASY |
| audio_onset (binary, transient) | ❌ NOT WIRED | 5-Track `audio.transients[]` exists | WIRE ONLY |
| music_tatum (binary, sub-beat) | ❌ MISSING | BPM subdivision logic | MEDIUM |
| beat_confidence (0-1) | ❌ MISSING | Already computed internally, not exposed | EASY |

## Summary Table

| Dimension | Have | Wire Only | New (Easy) | New (Medium) | Total |
|---|---|---|---|---|---|
| Temporal | 1 | 1 | 3 | 0 | **5** |
| Content | 2 | 1 | 2 | 1 | **6** |
| Emotional | 6 | 2 | 0 | 0 | **8** |
| Perceptual | 0 | 2 | 3 | 2 | **7** |
| Rhythmic | 3 | 1 | 3 | 1 | **8** |
| **TOTAL** | **12** | **7** | **11** | **4** | **34** |

## Effort Breakdown

- **Wire only (7 signals):** Data exists in signal-registry.ts. Just pipe to PlannerSignals interface. ~1 day.
- **New EASY (11 signals):** Simple computation from existing data (derivatives, histograms, BPM math). ~3-4 days.
- **New MEDIUM (4 signals):** Need model inference or complex analysis (sentiment, visual complexity, text detection, tatum). ~1-2 weeks.

**Total effort to reach 34 signals: ~2-3 weeks CC time.** Most is wire-only or easy math.

## State Space Impact

| Signal Count | State Space | Comparison |
|---|---|---|
| 8 (current PlannerSignals) | 11^8 = 2.1 billion | Current |
| 23 (original target) | 11^23 = 9.7 × 10^23 | Original plan |
| 34 (revised target) | 11^34 = 4.5 × 10^35 | **450 decillion combinations** |

## Key Insights

### Elon Mode: "What would I cut?"
Nothing. Each signal costs microseconds to compute. The state space is the moat. 34 signals × 11 values each = 10^35 combinations. No competitor can replicate this without building the same signal infrastructure. Ship all 34 and iterate on weights.

### CEO Mode: "What's the business impact?"
The PERCEPTUAL gap is the difference between "graphics that ignore the frame" and "graphics that respect the visual context." Every time a lower-third overlaps existing on-screen text, or a bright graphic appears on a bright frame with no contrast, that's a PERCEPTUAL signal failure. Users see it as "the AI doesn't understand what it's looking at."

### The "Looks Good" Quality Gate (Vision Model)
- Start with Gemini Flash (already in stack, $0.001/frame)
- Render MG as frame → vision model rates readability, hierarchy, brand consistency
- If insufficient → fine-tune Qwen2.5-VL-7B on rated examples (Modal hosting, near-free inference)
- Combine with MoVer-style predicate verification for structural + aesthetic dual gate

## Research References

- **EditDuet** (SIGGRAPH 2025, Adobe Research) — Multi-agent editor/critic evaluates structure, relevance, aesthetic coherence, pacing. Validates our signal-driven approach.
- **VEU-Bench** (CVPR 2025) — 19 fine-grained video editing tasks across recognition, reasoning, judging. Categories: shot size, cut types, transitions, intra-frame features, inter-shot attributes.
- **"Towards Data-Driven Automatic Video Editing"** (arxiv 1907.07345) — Features: visual (shot type, cinematography), audio (3 layers), semantic content.
- **Qwen2.5-VL / InternVL3** — Open-source vision models for aesthetic assessment. 72B variants best, 7-8B viable for binary pass/fail.

## Action Items

1. **Immediate:** Wire 7 existing signals to MG planner (1 day)
2. **Week 1:** Add 11 EASY signals (derivatives, histograms, BPM math)
3. **Week 2-3:** Add 4 MEDIUM signals (sentiment model, visual complexity, text detection, tatum)
4. **Week 3:** Implement "looks good" gate with Gemini Flash
5. **Ongoing:** Calibrate signal→MG weights with real video examples (Thompson sampling)
