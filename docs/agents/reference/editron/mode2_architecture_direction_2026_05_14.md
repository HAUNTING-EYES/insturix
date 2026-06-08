---
name: Mode 2 Architecture Direction — 2026-05-14
description: The new architectural direction for Mode 2. Cuts first, then analyze, then decide. One analysis result shared everywhere.
type: project
originSessionId: 92c054be-754b-4e43-898b-9ece05419afc
---
# Mode 2 Architecture Direction — 2026-05-14

## The Current Flow (scattered, timestamp-mapping nightmares)
```
Upload → VU analysis (full video) + Transcription (parallel)
  → Audio cuts (transcript editor)
  → 5-Track analysis (full video, reuses VU's geminiFileUri)
  → Path D: signal registry → signal executor → humanize → constrain → EDL
  → Profile actions run ON TOP (filter, transitions, captions, ducking)
  → Render
```
Problems:
- Analysis runs on FULL uncut video, but viewer sees cut segments
- Timestamp mapping between pre-cut and post-cut is fragile
- 5-Track keyframes from the full video need to be mapped to segments (the per-segment keyframe fix from this session)
- VU output is barely consumed (13 of 16 fields unread)
- Profile actions overwrite Path D signal-driven decisions
- V-JEPA and Wav2Vec are deployed but may not be firing consistently

## The Target Flow (linear, one data source)
```
Upload → Transcription (Grok STT, word-level)
  → Audio cuts (transcript editor — keeps/removes by word index)
  → Visual scene change detection (TBD — needs design)
  → NOW we have the actual segments
  → Run unified analysis on EACH segment:
      - Gemini 3.1 Flash/Pro: visual description, colors, energy, environment, production quality
      - V-JEPA: motion significance, action type, subject vs camera motion
      - Wav2Vec: vocal emotion, stress, prosody
  → ONE analysis result per segment, shared everywhere
  → Signal registry reads from analysis results (no timestamp mapping needed)
  → Signal executor → humanize → constrain → decisions
  → Apply decisions (transitions, zooms, captions, audio ducking, filter)
  → Render
```

## Key Architectural Principles

1. **Cuts FIRST, analyze SECOND.** Don't analyze content you're going to cut. Analyze what the viewer will actually see.

2. **One analysis result per segment.** Not 5-Track in one MongoDB field, VU in another, V-JEPA in a third, Wav2Vec in a fourth. One unified object per segment.

3. **Data flows one direction.** Cut → analyze → decide → apply. No backward references, no timestamp mapping between coordinate systems.

4. **No profiles for Mode 2.** Genre parameters (9 dials) drive everything. Profile is fallback ONLY if Path D fails entirely.

5. **No budget bandaid.** Signal executor self-regulates ALL decision types. Constraint enforcer catches quality issues. EDL executor is a pure applicator.

6. **Transitions are tiles, not keyframes on clips.** DaVinci model — the tile IS the visual effect, editable, self-contained.

## What Exists That We Keep
- Signal registry (846 LOC) — production-grade ✅
- Constraint enforcer (608 LOC) — production-grade ✅
- Humanize pass (273 LOC) — production-grade ✅
- Thompson Sampling bandit (536 LOC) — production-grade ✅
- Transcript editor (441 LOC) — F1=1.000 ✅
- Content type detector (325 LOC) — rule-based, no LLM ✅
- Creative knowledge graph (671 nodes, 799 edges) — needs audit but structure is sound

## What Needs Rework
- Signal executor — add self-regulation for ALL decision types, fix ordering, remove substitution
- EDL executor — remove isSingleSource blanket kill, wire calculateTransition for all types
- Director agent — add pathDHandled guard before profile actions
- Genre parameter computer — validate formulas, trace coefficient sources
- Decision budget — decompose and delete (move logic to executor + enforcer)
- 5-Track / VU — merge or restructure for post-cut analysis
- Transition rendering — tile-based architecture (DaVinci model)
- Knowledge graph — audit 218 constants

## What Needs to Be Built
- Visual scene change detection for Mode 2 (currently audio-only cuts)
- Unified per-segment analysis service
- Genre-parameter-driven action list (replace profile action list)

## Model Standardization
- `gemini-3.1-flash` — quick/cheap (analysis, classification, captions)
- `gemini-3.1-pro` — heavy/quality (transcript editing, creative intent, scene parsing)
- No old models. 24 files need updating (3 factory files fix 60%).

## Open Questions
1. Visual scene change detection — V-JEPA (learns from video) or Gemini Vision (describes frames)? Or both?
2. Should analysis run per-segment (expensive for 40+ segments) or on the post-cut reassembled video?
3. How do we handle the chicken-and-egg: need visual analysis to know WHERE to cut visually, but want to cut BEFORE analyzing?
4. VU's creative-doc-cached model provides editorial judgment. Does 5-Track need that context too?
