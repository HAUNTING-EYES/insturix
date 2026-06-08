---
name: Mode 2 Phased Execution Plan — 2026-05-15 (REVISED)
description: REVISED after model ID disaster + architecture realization. Phase 5 promoted to Phase 1. Stop patching old flow, start restructuring.
type: project
last_updated: 2026-05-15
originSessionId: 92c054be-754b-4e43-898b-9ece05419afc
---
# Mode 2 Phased Execution Plan — REVISED 2026-05-15

## ⚠️ REVISION NOTE
Original plan had 6 phases: patch old flow (1-2), audit KB (3), wire data (4), restructure (5), transition UI (6).

**Session 2026-05-15 proved patching creates new failures.** Phase 1C (skip profile transitions) caused zero transitions when 5-Track hit 429. Phase 1D (model IDs) broke production entirely. The old parallel flow (VU + transcription + 5-Track all competing for Gemini quota) is fundamentally fragile.

**NEW PRIORITY: Implement the target architecture first.** Everything else follows from a clean linear flow.

---

## COMPLETED (shipped 2026-05-15, 4 commits)

| What | Status | Notes |
|------|--------|-------|
| P0 Duration cascade fix | ✅ SHIPPED | 3 files. verifiedDuration, MP4 recovery, effectiveDurationSec |
| P1 Continuity per-segment keyframes | ✅ SHIPPED | 1 file. Per-segment color/energy from 5-Track |
| Signal executor self-regulation | ✅ SHIPPED | shake/sfx/caption budgets. ⚠️ Thresholds UNVERIFIED |
| EDL frame-first sort + no substitution | ✅ SHIPPED | Temporal order, reject=skip |
| Per-boundary visual similarity | ✅ SHIPPED | Replaces blanket isSingleSource. ⚠️ Thresholds INVENTED |
| Skip profile add_transition for Path D | ✅ SHIPPED | ⚠️ Causes zero transitions on 429. Fix via architecture |
| DaVinci transition rendering | ✅ SHIPPED | All 22 types render. ⚠️ Visual params INVENTED |
| Transition type consolidation | ✅ SHIPPED | 22 canonical types, ghost types removed, alias bug fixed |
| Model upgrade to 3.1 family | ✅ SHIPPED | Chat→flash-lite-preview, general→pro-preview. VERIFIED via API |

---

## THE PLAN (revised order)

### Phase 1 (NEW): Architecture Restructuring
**WHY FIRST:** Eliminates the 429 rate limit conflict, the Phase 1C zero-transition problem, and timestamp mapping fragility. All in one structural change.

**1A. Restructure video-analysis worker: cuts FIRST, then analyze**
- Current: VU + transcription + 5-Track run in parallel/sequence on full video
- Target: Transcription → transcript editor cuts → THEN analyze each segment
- No more parallel Gemini calls competing for quota
- Files: `video-analysis/route.ts`

**1B. Unified per-segment analysis**
- One `analyzeSegment()` function per segment (not per full video)
- Orchestrates: Gemini vision + V-JEPA + Wav2Vec
- Returns ONE result object stored once, shared everywhere
- No more 5-Track full-video analysis with timestamp mapping
- Files: new service or refactored `five-track-analysis.ts`

**1C. Remove Path D / profile action conflict**
- In the target flow, there's no "profile action loop" for Mode 2
- Genre parameters drive what happens (computed from per-segment analysis)
- Signal executor → humanize → constrain → EDL → apply
- No profile fallback, no double processing
- Files: `director-agent.ts`

**1D. Visual scene change detection**
- After audio cuts, detect visual scene boundaries for transition placement
- Options: Gemini Vision color comparison, V-JEPA embedding divergence
- This enables correct transition placement without isSingleSource hacks
- Files: new service or integrated into analysis

### Phase 2: Knowledge Graph + Constants Audit
**WHY SECOND:** Once the architecture is clean, validate the data driving decisions.

- 2A: Audit 218 constants against industry standards
- 2B: Validate genre parameter formulas (trace every coefficient)
- 2C: Audit 95 signal executor mappings
- 2D: Validate thresholds added this session (shake/sfx/caption budgets, color similarity)
- Full tracking: `memory/constants_and_logic_audit.md`

### Phase 3: Verify GPU Analysis + Wire VU Data
- 3A: Verify V-JEPA/Wav2Vec fire on Vercel (check logs, fix timeout if needed)
- 3B: Wire VU outputs (environment, productionQuality, hasBRoll) into analysis
- 3C: Test with multiple video types (talking head, vlog, interview, product demo)

### Phase 4: Transition Tile Editability
- 4A: Drag edges to adjust duration
- 4B: Click to change type
- 4C: Adjust parameters per transition
- 4D: Consolidate to one rendering system (kill transition-templates.ts)

### Phase 5: Transcript Editor Reliability
- 5A: Investigate Gemini seed non-determinism (37.2% vs 57.5% on same video)
- 5B: Multi-seed evaluation as quality gate
- 5C: Consider alternative approaches if Gemini can't be made deterministic

---

## ANALYSIS STACK DESIGN (for Phase 1B)

Gemini = what's in the frame (language description)
V-JEPA = what's happening over time (learned video features)
Wav2Vec = how it's being said (learned audio features)

Don't merge at MODEL level. Merge at SERVICE level:
- One `analyzeSegment(segmentId)` orchestrates all three
- One `SegmentAnalysis` result per segment
- Signal registry reads directly from `SegmentAnalysis` (no timestamp mapping)

---

## VERIFIED MODEL IDS (use ONLY these)

| Model | Valid ID | Tested |
|-------|---------|--------|
| 3.1 Flash (quick) | `gemini-3.1-flash-lite-preview` | ✅ API test 2026-05-15 |
| 3.1 Pro (heavy) | `gemini-3.1-pro-preview` | ✅ API test 2026-05-15 |
| 2.5 Flash (cache) | `gemini-2.5-flash` | ✅ Production verified |

**DO NOT USE:** `gemini-3.1-flash`, `gemini-3.1-pro`, `gemini-3.1-flash-preview` — ALL return 404.
