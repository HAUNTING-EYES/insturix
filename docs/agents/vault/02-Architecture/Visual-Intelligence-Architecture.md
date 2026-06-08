# Visual Intelligence Architecture

## Status: REVISED 2026-05-24. Simplified by Utility AI decision. Plan phase next.

## The Two Problems (unchanged)

### Problem 1: Visual Dead-Air Detection
System decides cuts from WORDS only. Speaker staring at script for 3 seconds passes through undetected. Visual data exists but nobody uses it for cut decisions.

Scenarios the system misses: speaker on phone between takes, camera bumped, out of focus, walking to/from position, repeated footage, equipment visible, dead stare vs dramatic pause, wrong person talking, mismatched b-roll.

### Problem 2: Non-Speech Content Editing
Every decision anchored to `targetWordIdx`. Music videos, product b-roll, timelapses = zero coordinates. Creative brief returns null. Director falls through to Path D which works but has no creative intelligence.

Affected: music videos, product shots, timelapses, dance, sports, text-only commercials, ASMR, gaming.

---

## REVISED Architecture (post Utility AI decision)

### What Changed
The Utility AI decision simplifies visual intelligence significantly:
- **VES** becomes a composite signal feeding overlay considerations (not a separate detection system)
- **Routing** disappears from the decision engine (implicit from overlay scoring). Survives ONLY for creative brief prompt selection.
- **Phase 1C safety** is built-in by architecture (missing signal = missing consideration = overlay scored on remaining considerations, no veto possible)

### Architecture Diagram

```
SIGNAL SOURCES (L0/L1/L2):
  L0: local RMS silence, Essentia.js beats, sharp scene boundaries
  L1: Gemini temporal analysis (additive)
  L2: V-JEPA, Wav2Vec, 5-Track (additive)
      ↓
SIGNAL GRID (500ms, 38+ signals):
  Existing 34 + silence_duration + beat_proximity + scene_change + VES(composite)
      ↓
UTILITY AI DECISION ENGINE (replaces CRG + profiles):
  Each overlay has considerations with response curves
  Score all overlays at each grid point
  Derived signals: zoom_active feeds into SFX scoring (pairing)
  Best-scoring overlay per category wins
  Phase 1C safe by design (missing signal ≠ veto)
      ↓
NARRATIVE LAYER (creative brief):
  Gemini provides story arc, pacing, narrative sections
  Routing HERE only: speech prompt vs music prompt vs visual prompt
      ↓
EDL EXECUTOR (unchanged):
  Applies decisions to timeline
```

### Core Principle: ADDITIVE ONLY (unchanged)
See [[Phase-1C-Failure-Analysis]]. Now enforced by architecture, not discipline.

### Signal Sources (L0/L1/L2) — unchanged

**L0 — Deterministic (can't fail, zero ML)**
- Local RMS silence detection from raw audio PCM (~30 LOC)
- Beat detection via Essentia.js (WASM, runs in Node.js)
- Scene boundaries via frame histogram diff on keyframeAnalyses.dominantColors (~40 LOC)

**L1 — LLM Enrichment (additive, never gates)**
- Gemini 2.5 Flash temporal video analysis (already in stack)
- Model-agnostic interface: `{timestamp, event_type, confidence}`
- Phase 2: Qwen3-VL 8B self-hosted on Modal

**L2 — Existing Signals (additive, when available)**
- V-JEPA (eye_contact, significance, motion) — ghost infra, needs data pipeline
- Wav2Vec (speech energy, stress)
- 5-Track (energyCurve, beats, shot_type)

### VES — REVISED
No longer a separate detection system. Now a composite signal:
```
VES = composite(eye_contact, visual_significance, motion_appropriate, face_quality, brightness_stability)
```
Fed into overlay considerations. A `cut_dead_air` overlay has VES as an inverted consideration (low VES → high cut score). Dead air detection is emergent from the utility scoring, not a separate mechanism.

### Routing — REVISED
**Decision engine:** No routing needed. Overlays naturally score differently for different content types based on their considerations. `beat_sync_cut` scores high when music_energy is high and speech_coverage is low. No mode switch needed.

**Creative brief only:** Routing survives for prompt variant selection. Speech prompt vs music prompt vs visual prompt. This is the only place routing is needed.

### How Visual Intelligence Overlays Work

New overlays for visual intelligence (scored by utility engine):
```
cut_dead_air:
  considerations:
    - VES (inverted: low engagement → high score)
    - silence_duration (logistic: sharp uptake above 2s)
    - speech_energy (inverted: no speech → higher score)

beat_sync_cut:
  considerations:
    - beat_proximity (steep logistic: very near beat → high score)
    - speech_coverage (inverted: low speech → higher score)
    - scene_boundary (linear: helpful but not required)

scene_transition:
  considerations:
    - scene_change (logistic: high visual change → high score)
    - energy_delta (linear: energy shifts favor transitions)
```

These overlays compete with ALL other overlays in the utility scoring. For speech-heavy content, speech-aware overlays (zoom_push, stat_counter) naturally outscore visual overlays. For music content, beat_sync and scene overlays naturally win. No routing logic needed.

### Merge Logic — REVISED (partially resolved)
Original open question: "when TAG says cut and transcript says keep, who wins?"

With utility AI: this becomes a scoring competition. `cut_dead_air` scores based on VES + silence. `hold_dramatic_pause` scores based on VES (high) + silence + energy_ema (recently high). If VES is HIGH during silence (speaker maintaining eye contact, leaning forward), the hold overlay wins. If VES is LOW (speaker looking away), the cut overlay wins.

The EMA/surprise signals (future work) make this even more accurate. See [[D-009-Merge-Logic]].

Remaining open: creative brief narrative decisions vs utility moment decisions. When the creative brief says "this is the climax, hold this moment" but the utility system scores a cut... the creative brief should win (narrative > moment). Rank/priority system needed for this.

## Verified Codebase Alignment (2026-05-24)

| Component | Status | Evidence |
|-----------|--------|----------|
| 500ms grid | VERIFIED | signal-registry.ts:39 GRID_INTERVAL_FRAMES = 15 |
| silenceGaps | CONTRADICTED | Transcript word gaps, NOT audio RMS. Need local computation. |
| energyCurve | CONTRADICTED | Gemini-sourced. Need local RMS for L0. |
| Path D without word indices | VERIFIED | director-agent.ts:495-497 works on segments |
| V-JEPA | CONTRADICTED | Ghost infrastructure. Needs data pipeline. |
| P0 bugs | ALL FIXED | Verified 2026-05-24 (parser, images, transitions, filters) |
| Invented thresholds | VERIFIED | 61 found, all active |

## Open Questions
- [[D-009-Merge-Logic]] — Creative brief narrative vs utility moment decisions (rank/priority)
- [[D-008-Modal-Commitment]] — Python sidecar timing
- EMA/surprise signals — temporal context for dramatic pause vs dead air distinction

## Related
- [[Utility-AI-Architecture]] — The decision engine research
- [[Phase-1C-Failure-Analysis]] — Why additive only
- [[Signal-Registry-Deep-Dive]] — The signal infrastructure
- [[MG-Engine-State]] — MG already works signal-driven

Tags: #architecture #visual-intelligence #revised
