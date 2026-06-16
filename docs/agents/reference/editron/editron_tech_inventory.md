---
name: Editron + Pipeline Tech Inventory
description: What advanced tech exists, what's powerful, what's available for reuse. READ THIS before building anything new — avoid reinventing.
type: project
originSessionId: fa54756f-5944-4efd-825d-c6d862dbeca7
---
# Editron + Pipeline Tech Inventory

**Why this exists:** We have a LOT of advanced tech built across Editron and the pipeline. Some superseded, some underused, some genuinely too good. Before building anything new, check if we already have the piece.

---

## Intelligence Stack (Mode 2 / Path D)

### Signal-Driven Editing — THE crown jewel
| Service | Lines | What it does | Status |
|---------|-------|-------------|--------|
| `signal-registry.ts` | 846 | Builds dual-timing (grid + event) signal timelines from 5-Track + raw footage | ACTIVE, production |
| `signal-executor.ts` | 738 | Evaluates 95 graph mappings against detected signals → EDL decisions | ACTIVE, production |
| `constraint-enforcer.ts` | 608 | 8-pass ordered constraint enforcement from creative knowledge graph (50 constraints) | ACTIVE, production |
| `humanize-pass.ts` | 273 | Injects organic timing imperfection (anti-metronomic) | ACTIVE, production |
| `genre-parameter-computer.ts` | 395 | 9 editing dials computed from signals, NOT profiles | ACTIVE, production |
| `genre-parameter-bandit.ts` | 536 | Thompson Sampling — learns per-user editing preferences from project outcomes | ACTIVE, production |
| `moment-weight-service.ts` | 328 | Per-frame importance scoring: 50% Gemini + 30% V-JEPA + 20% Wav2Vec + bandit | ACTIVE, production |

**Total: 3,724 LOC of signal-driven intelligence.** This is the system that makes Mode 2 editing content-driven, not rule-driven.

### Creative Knowledge Graph
- `creative-knowledge-graph.json`: 671 nodes, 799 edges (25,311 lines)
- 49 signals → 95 mappings → 115 techniques → 50 constraints → 71 theory nodes → 218 constants → 73 intent nodes
- Queried at runtime by `graph-query.ts` (598 lines, in-memory index)
- Source doc: `creative_production_knowledge_v3` (5,838 lines)

### 5-Track Analysis
`five-track-analysis.ts` (1,597 lines):
- Track 1: Speech semantic (word timestamps, sentiment, topics)
- Track 2: Visual content (Gemini Vision keyframes, composition, colors)
- Track 3: Music structure (beat grid, BPM, sections, energy)
- Track 4: Motion/rhythm (optical flow, camera movement)
- Track 5: Subject tracking (bboxes, face detection, persistence)

Dual-flow: AI-generated videos use storyboard metadata (cheap). Real footage uses Gemini Files API (expensive but accurate).

### GPU Analysis (Modal)
| Service | Lines | What it does | Status |
|---------|-------|-------------|--------|
| `vjepa-service.ts` | 260 | V-JEPA 2 video understanding (action, motion, face) | ACTIVE (when Modal available) |
| `wav2vec-service.ts` | 233 | Wav2Vec2 speech emotion/emphasis analysis | ACTIVE (when Modal available) |

---

## Editing Execution Stack

### EDL + Execution
| Service | Lines | What it does | Status |
|---------|-------|-------------|--------|
| `edl-executor.ts` | 1,218 | Applies EDL decisions: zooms, cuts, filters, transitions, shake, speed | ACTIVE |
| `reactive-edit-engine.ts` | 788 | Generates EDL from 5-Track (Mode 1 reactive path) | ACTIVE |
| `intent-translator.ts` | 522 | Maps creative intent enums → frame-accurate EDL decisions | ACTIVE |
| `decision-budget.ts` | 385 | Budget system: limits edit decisions per duration | ACTIVE |
| `silence-removal-executor.ts` | 422 | Splits timeline overlays based on removal plan | ACTIVE |
| `auto-post-processing.ts` | 524 | Drift zoom, screen zone validation, freeze frames, duration variety | ACTIVE |

### Quality Systems
| Service | Lines | What it does | Status |
|---------|-------|-------------|--------|
| `quality-review-service.ts` | 1,256 | Deterministic 0-100 quality scoring | ACTIVE |
| `quality-gate.ts` | 358 | Before/after snapshot comparison — prevents edit degradation | ACTIVE |
| `continuity-service.ts` | 249 | Per-boundary continuity scoring → transition recommendations | ACTIVE (just fixed with per-segment keyframes) |

### Transcript / Cut Quality
| Service | Lines | What it does | Status |
|---------|-------|-------------|--------|
| `transcript-editor.ts` | 441 | Single Gemini call KEEP/CUT editing. F1=1.000 proven | ACTIVE, STABLE |
| `raw-footage-processor.ts` | 669 | Full Mode 2 pipeline: transcript, silence, best-take, intent, cuts | ACTIVE |
| `editorial-intent-detector.ts` | 371 | CONTENT/META_DISCARD/META_KEEP classifier (Gemini) | ACTIVE |
| `content-type-detector.ts` | 325 | Rule-based content classification from transcript features | ACTIVE |

---

## Pipeline Bridge Tech (ThinkForge → Editron)

### What's powerful here
| Service | Lines | What it does | Status |
|---------|-------|-------------|--------|
| `llm-scene-parser.ts` | 1,766 | Script→scenes with massive Zod schema (~160 fields), post-processing | ACTIVE |
| `storyboard-prompt-builder.ts` | 283 | 8-slot cinema prompt engineering from creative doc | ACTIVE |
| `consistency-scoring-service.ts` | 491 | Gemini Vision pairwise consistency across storyboard | ACTIVE |
| `edit-direction-applier.ts` | 234 | CSS filters, pacing multipliers, camera keyframes from script | ACTIVE |
| `cinema-prompt-config.ts` | 249 | 6 cameras, 11 lenses, 6 focal lengths, 5 apertures | ACTIVE |

### Data being lost at handoff (FIX OPPORTUNITY)
- **SceneSlots** (`block.scene.*`) — visualDescription, subjects[], mood, onScreenText[], sfxDescription, musicDescription all thrown away at export-for-editron, re-parsed by LLM
- **Architect Agent shot lists** — camera, framing, motion, B-roll suggestions. Never fed to pipeline
- **NarrativeContract.medium** — voiceover vs visual_manual vs slide_narration. Never consumed
- **narrativeArc** — extracted but not consumed by edit-direction-applier or transitions
- **graphicsDensity** — extracted but Director ignores it
- **musicMood** — extracted but BGM service doesn't read it

---

## Parked Experiments (available for future, NOT dead)

| Service | Lines | What it tried | Why parked | When |
|---------|-------|--------------|-----------|------|
| `repetition-intent-discriminator.ts` | 312 | RETAKE vs INTENTIONAL vs NARRATIVE_PIVOT classification | Can't fix upstream cut-quality problems | May 10, revert `e9a24a75` |
| `holistic-editor.ts` | 121 | ONE Gemini call for full transcript KEEP/CUT | Over-cut (4.8 min vs 7.5 min) | May 10, revert `e9a24a75` |
| `argument-structure-protector.ts` | 93 | Identify essential "backbone" segments that must never be cut | Added latency, no quality improvement | May 10, revert `e9a24a75` |
| `gemma-editorial-service.ts` | 119 | Fine-tuned Gemma 4 for deterministic KEEP/CUT | Base models failed (kept ALL segments), fine-tuning failed 8x | May 10, never wired |

---

## Transition System (needs reconciliation)

**3 parallel type systems:** transition-templates.ts (20 types), transition-system.ts (22 types), types.ts TransitionStyle (12 types). Duration conflicts between files. Ghost types that don't exist. `wipe-left` incorrectly aliased to `whip-pan`.

**6 trigger systems:** EDL executor, continuity scoring, Director add_transition, script editDirections, profile defaults, UI browser panel.

Full map in `system_audit_2026_05_14.md` → Transition Map section.

---

## Key Numbers
- **54 edit profiles** across 7 categories (Cinematic, Social, Corporate, Documentary, Tutorial, Music, Gaming)
- **671 knowledge graph nodes**, 799 edges
- **95 signal→decision mappings** (Path D)
- **50 constraints** enforced per project
- **35+ AI chat tools** (tools.ts, 5,506 lines)
- **12 image models** supported (fal.ai)
- **6 video models** active (Kling, Seedance, Veo, etc.)
- **30 motion graphic templates** (HTML/CSS)
- **F1=1.000** on transcript editor across 10 seeds
