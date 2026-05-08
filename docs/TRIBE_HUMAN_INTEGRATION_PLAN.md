# TRIBE v2 + HUMAN Stack Integration Plan

## The End State

The system watches a video and UNDERSTANDS it — not through an LLM guessing from keyframes, but through a trained video model that comprehends actions, motion semantics, temporal relationships, and audio-visual binding. Combined with the HUMAN stack's learned decision-making, editing becomes: understand → decide → execute, all without LLM in the decision loop.

## Current State vs Target State

| Layer | Current | Target |
|-------|---------|--------|
| **Video Understanding** | Gemini Vision (LLM, guesses from keyframes) | V-JEPA 2 (trained on 1M+ hours, understands actions) |
| **Audio Understanding** | Deepgram transcription + spectral analysis | Wav2Vec 2.0 (semantic audio, not just words) + Grok (speaker diarization) |
| **Edit Decisions** | LLM creative intent + hardcoded profiles | Thompson Sampling (learned per-user) + EML (discovered laws) |
| **Quality Gate** | 21 deterministic checks (post-hoc) | QualityGate (before/after per-operation) + NegativeModelBuilder (regression) |
| **Anti-patterns** | Quality review score | Anti-pattern detector (rule-based, comprehensive) |
| **Pacing** | Hardcoded cuts/min per content type | FAN layers (learned rhythmic patterns) + JEPA (predicted outcomes) |
| **Learning** | Graphiti stores data, never uses it | Understanding Engine (experience → model → transfer) |

## Phase 1: HUMAN Stack — No GPU Required (weeks)

These components run on Vercel serverless. No infrastructure changes.

### 1A. QualityGate — Before/After Metrics
**What:** Wrap every edit operation (silence removal, zoom, graphic, transition, caption) with quality measurement. BEFORE: snapshot metrics. AFTER: compare. If delta is negative, flag.

**Metrics per operation:**
- Pacing score (cuts/min vs target range)
- Audio balance (LUFS deviation from target)
- Visual variety (unique shot types / total shots)
- Caption sync accuracy (word timing drift)
- Transition appropriateness (does it match emotional intent?)

**Implementation:**
- New service: `lib/editron/services/quality-gate.ts`
- Wraps `executeEDL()` and each Director action
- Stores before/after in project doc for learning
- ~200 lines. No external dependencies.

### 1B. Anti-Pattern Detector — Expanded Rules ✅ BUILT
**What:** Extend the 21 quality checks to 50+ with detection + auto-correction.

**New patterns to detect:**
- Jump cuts too close (<0.5s between cuts on same angle)
- Audio pops at cut points (amplitude spike at frame boundary)
- Transition repetition (3+ identical transitions in sequence)
- Pacing monotony (all shots within 10% of same duration)
- Color temperature clash at dissolve (>1500K delta)
- Caption overlapping video text (OCR check on keyframe)
- Graphic too small to read (<72px at 1080p)
- SFX timing off by >3 frames from visual event
- Music energy contradicts visual energy (upbeat music on somber content)
- Empty frame gaps (>2 frames of black between clips)

**Implementation:**
- Extend `lib/editron/services/quality-review-service.ts`
- Each pattern: detection function + severity + auto-fix suggestion
- ~300 lines of new checks.

### 1C. Thompson Sampling — Signal-Driven Learning ✅ BUILT + WIRED
**What:** Learn per-user adjustments to 9 genre parameter dials. Adapted from profile-based to signal-based for Mode 2.

**How it works (adapted from original plan):**
- Each of the 9 genre dials is an "arm" (NOT profiles — signal-driven)
- Gaussian Thompson Sampling: N(mu, 1/precision) per (dial, context) pair
- Reward = 0.7 * quality_normalized + 0.2 * rendered + 0.1 * published
- Context = content type, speech coverage bucket, duration bucket, platform
- Falls back to zero adjustment (pure signal computation) when <5 projects

**Status (2026-05-08):**
- ✅ Service built: `lib/editron/services/genre-parameter-bandit.ts` (14KB, Gaussian Thompson Sampling)
- ✅ Moment weight bridge: `moment-weight-service.ts` → `applyBanditAdjustments()`
- ✅ **WIRED into Director**: Path D Step D.2 applies bandit adjustments to weight map
- ✅ Bandit state persistence to MongoDB — `loadBanditState()`/`saveBanditState()` with upsert
- ✅ Reward feedback loop — `recordProjectOutcome()` closes learning loop via quality score

## Phase 2: V-JEPA 2 Features — GPU Required (months)

### 2A. Deploy V-JEPA 2 ✅ BUILT + DEPLOYED + WIRED
**What:** V-JEPA 2 encoder on Modal serverless GPU (A10G). Input: video URL + segment timestamps. Output: per-segment visual significance, motion intensity, action type, motion type.

**Status (2026-05-08):**
- ✅ Modal endpoint deployed: `modal/vjepa_visual.py` (facebook/vjepa2-vitl-fpc64-256, 307M params)
- ✅ TypeScript service: `lib/editron/services/vjepa-service.ts` (229 lines, full type safety)
- ✅ Adaptive z-score significance (self-calibrating per video, no fixed constants)
- ✅ Resolution-normalized motion (480px reference width, resolution-independent)
- ✅ **WIRED into pipeline**: `video-analysis/route.ts` Step 3.5 calls V-JEPA in parallel with Wav2Vec
- ✅ **WIRED into Director**: Path D Step D.2 reads stored V-JEPA data → `integrateVjepaScores()` (30% weight)
- ✅ MOTION_NORM_DIVISOR: adaptive z-score normalization (35.0 retained as fallback for < 3 segments)

**What V-JEPA 2 gives us that Gemini doesn't:**
- **Action understanding** — "person picks up object" not "person near object"
- **Temporal prediction** — what happens NEXT (action anticipation, 39.7 recall@5 on Epic-Kitchens)
- **Motion semantics** — not just "camera moves" but "camera follows subject's gaze"
- **Self-supervised** — trained on video, not text. Understands physical world.

### 2B. Wav2Vec 2.0 Vocal Emotion ✅ BUILT + DEPLOYED + WIRED
**What:** Extract vocal prosodic features beyond transcription.

**Status (2026-05-08):**
- ✅ Modal endpoint deployed: `modal/wav2vec_vocal.py` (ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition, T4 GPU)
- ✅ TypeScript service: `lib/editron/services/wav2vec-service.ts` (208 lines, full type safety)
- ✅ 6 features: emotion intensity, emotional valence, energy, pitch variability, stress detection, filler confidence
- ✅ **WIRED into pipeline**: `video-analysis/route.ts` Step 3.5 calls Wav2Vec in parallel with V-JEPA
- ✅ **WIRED into Director**: Path D Step D.2 reads stored Wav2Vec data → `integrateWav2vecScores()` (20% weight)

**What it gives us:**
- Emphasis detection (stress, pitch peaks, volume surges) → zoom punch targets
- Emotion detection (happy/sad/angry/neutral) → color grade + music mood
- Speaker change detection → interview scene boundaries
- Non-speech audio classification (applause, laughter, music) → SFX decisions

### 2C. Grok Speaker Diarization ✅ BUILT + WIRED
**What:** Distinguish who is speaking when. Multiple speakers → interview detection, turn-taking editing.

**Status (2026-05-08):**
- ✅ Grok STT API already integrated: `lib/editron/services/media/transcription-service.ts` (xAI /v1/stt)
- ✅ Speaker labels captured per word: `TranscriptionWord.speaker?: number` (0-indexed)
- ✅ `TranscriptionData.speakerCount` populated when multi-speaker detected
- ✅ **WIRED into signal-registry**: `speech.speaker_change` event signals emitted at speaker transitions
- ✅ **Global signals**: `content.speaker_count`, `content.is_multi_speaker`, `enrichment.diarization`
- ✅ Fulfills `signal:speech.speaker_change` (previously NEEDS_INFRA in creative knowledge graph)
- Enables: speaker-specific captions, interview B-roll insertion, speaker transition detection

## Phase 3: HUMAN Stack Advanced — Needs Data (months)

### 3A. NegativeModelBuilder
**What:** Before applying an edit, predict if it will degrade quality. Uses historical edit→outcome data from Graphiti.

**Requires:** 50+ projects with quality scores + user actions logged.

### 3B. FAN Layers (Periodic Neural Basis)
**What:** Capture rhythmic editing patterns beyond simple BPM. Learns complex periodic structures from successful edits.

**Requires:** Beat-synced projects with engagement data.

### 3C. DreamCoder (Pattern Compression)
**What:** Successful edit sequences → reusable primitives. Profiles become dynamic, growing from usage.

**Requires:** 100+ projects to identify recurring patterns.

### 3D. JEPA World Model
**What:** Predict "if I apply this edit, the output feels X" WITHOUT executing. Edit planning before execution.

**Requires:** Training data from many edit→outcome pairs.

### 3E. EML (Symbolic Regression)
**What:** Discover mathematical editing laws. "Engagement = f(cut_frequency, motion_intensity, silence_ratio, caption_density)."

**Requires:** Engagement metrics from published videos.

## Migration Path: Profiles → Per-Moment Decisions

### Stage 1 ✅ COMPLETE: Signal-Driven Editing
- Fix condition gating ✅
- Mode 2 signal-driven (no profiles — Path D with creative knowledge graph)
- Content type detection from transcript analysis
- 95 graph mappings + constraint enforcement

### Stage 2 ✅ PARTIALLY COMPLETE: GPU Understanding + Bandit Learning
- Thompson Sampling (signal-based) learns per-user dial adjustments ✅ BUILT
- V-JEPA 2 visual significance deployed on Modal A10G ✅ BUILT + WIRED
- Wav2Vec 2.0 vocal emotion deployed on Modal T4 ✅ BUILT + WIRED
- Phase 2 moment weights: 50% gemini + 30% vjepa + 20% wav2vec + thompson ✅ WIRED
- QualityGate measures before/after per action ✅ BUILT + WIRED
  - Service: `lib/editron/services/quality-gate.ts` (359 lines, 10 metrics, 6 degradation types)
  - Wired into Director: lines 762-819, wraps every action with takeSnapshot before/after
  - Session summary logged + stored in DirectorResult.qualityGate
  - ⚠️ Per-action snapshots not yet persisted to MongoDB (needed for NegativeModelBuilder learning)
- Anti-pattern detector expanded rules ✅ BUILT (52 checks, 57 issue types, 8/10 TRIBE patterns)
- Bandit state persistence to MongoDB ✅ BUILT (loadBanditState/saveBanditState)
- Reward feedback loop (project outcomes → bandit updates) ✅ BUILT (recordProjectOutcome)

### Stage 3 (Next): Understanding Replaces Guessing
- V-JEPA features enrich signal timeline ✅ WIRED (visual.significance, action_type, motion_type, face_emotion, eye_contact)
- Grok adds speaker diarization ✅ WIRED (speech.speaker_change events + global speaker_count)
- Signal registry enrichment with V-JEPA/Wav2Vec data (replace NEEDS_INFRA signals) ✅ COMPLETE
  - 5 NEEDS_INFRA graph signals now populated: visual.motion_type, visual.action_type, visual.face_emotion, visual.eye_contact, speech.emotional_valence
  - V-JEPA REPLACES heuristic visual.motion_intensity with learned motion
  - Wav2Vec REPLACES heuristic speech.energy with semantic energy
  - 6 NEW signal keys added: speech.emotion_intensity, speech.pitch_variability, speech.stress_detected, speech.filler_confidence, visual.significance, composite.emotional_alignment
  - Enhanced composites: narrative_pressure uses Wav2Vec emotion, cinematic_moment uses V-JEPA significance + Wav2Vec stress

### Stage 4 (HUMAN Phase 3): Profiles Dissolve
- Per-moment decisions from learned models
- Creative doc v3 as knowledge base (vocabulary of techniques)
- No more preset recipes — system composes edits per-moment from understood content + user intent + brand context
- LLM only for genuinely novel creative situations

## Cost Estimates

| Component | Infra | Per-Video Cost | Timeline | Status |
|-----------|-------|---------------|----------|--------|
| QualityGate | None (serverless) | $0 | 1 week | ✅ Built + wired |
| Anti-pattern detector | None | $0 | 1 week | ✅ Built (52 checks) |
| Thompson Sampling | None (uses MongoDB) | $0 | 1 week | ✅ Built + persistence + reward |
| V-JEPA 2 on Modal | A10G GPU inference | ~$0.10-0.30/video | 2-3 weeks | ✅ Deployed + wired + motion adaptive |
| Wav2Vec 2.0 on Modal | T4 GPU inference | ~$0.02/video | 1 week | ✅ Deployed + wired |
| Grok | Grok API | ~TBD/video | 3 days | ✅ Built + wired (diarization) |
| NegativeModelBuilder | None | $0 | 1 week (after data) | ❌ Needs data |
| FAN/DreamCoder/JEPA/EML | Training compute | $50-200 training | Months (after data) | ❌ Needs data |
