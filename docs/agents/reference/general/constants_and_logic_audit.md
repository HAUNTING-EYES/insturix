---
name: Constants & Logic Audit — Tracking File
description: Every hardcoded value and logic decision across Editron. Track source, verify status, flag what needs brainstorming. Goal = one source of truth.
type: project
originSessionId: 92c054be-754b-4e43-898b-9ece05419afc
---
# Constants & Logic Audit

**Purpose:** Track every hardcoded value and design decision. Each entry has: value, where it lives, claimed source, verified status, and whether the logic needs brainstorming.

**Target:** All constants should eventually live in ONE source of truth — likely `lib/editron/config/editron-config.ts` (605 LOC, already centralizes 100+ pipeline values).

---

## Constants Added/Modified This Session (2026-05-15)

### Signal Executor Budget Limits (`signal-executor.ts`)

| Constant | Value | Where | Claimed Source | Verified? | Notes |
|----------|-------|-------|---------------|-----------|-------|
| `MIN_ZOOM_GAP_FRAMES` | 90 (3s) | signal-executor.ts:74 | Pre-existing | ⚠️ UNVERIFIED | Was there before this session. 3s between zooms — reasonable but no industry source cited |
| `MIN_GRAPHIC_GAP_FRAMES` | 90 (3s) | signal-executor.ts:75 | Pre-existing | ⚠️ UNVERIFIED | Same as zoom gap — why the same value? |
| `MIN_CUT_GAP_FRAMES` | 15 (0.5s) | signal-executor.ts:76 | Pre-existing | ⚠️ UNVERIFIED | 0.5s minimum between cuts — matches professional editing (cuts faster than this are subliminal) |
| `MIN_SHAKE_GAP_FRAMES` | 60 (2s) | signal-executor.ts:77 | NEW this session | ⚠️ INVENTED | Set to 2s — seemed reasonable. No industry standard cited. |
| `MIN_SFX_GAP_FRAMES` | 15 (0.5s) | signal-executor.ts:78 | NEW this session | ⚠️ INVENTED | Set to 0.5s — same as cut gap. SFX can overlap more than zooms. |
| `MAX_TRANSITIONS_PER_TYPE` | 4 | signal-executor.ts:79 | Pre-existing | ⚠️ UNVERIFIED | Max 4 of same transition type per video — prevents repetitive feel. Reasonable but arbitrary. |
| `BUDGET_OVERRIDE_WEIGHT` | 0.9 | signal-executor.ts:80 | Pre-existing | ⚠️ UNVERIFIED | Weight > 0.9 can override one budget limit. Why 0.9 specifically? |
| `MAX_DECISIONS_PER_WINDOW` | 3 | signal-executor.ts:81 | Pre-existing | ⚠️ UNVERIFIED | Max 3 decisions per 0.5s window. Prevents flooding. |
| `SIGNAL_ACTIVATION_THRESHOLD` | 0.25 | signal-executor.ts:82 | Pre-existing | ⚠️ UNVERIFIED | Signals below 0.25 don't trigger mappings. Why 0.25? |
| `SHAKE_PER_30S` | 4 | signal-executor.ts:83 | decision-budget.ts cites "KB CS-020" | ⚠️ KB UNVERIFIED | Moved from decision-budget.ts. KB value — needs Phase 3 audit. |
| `SFX_PER_30S` | 15 | signal-executor.ts:84 | decision-budget.ts cites "KB A-100" | ⚠️ KB UNVERIFIED | Same. 15 SFX per 30s seems high — brainstorm if this is right. |
| `CAPTION_EMPHASIS_PER_30S` | 10 | signal-executor.ts:85 | decision-budget.ts cites "KB C-012" | ⚠️ KB UNVERIFIED | Same. 10 caption emphases per 30s = one every 3s. |

### EDL Executor Boundary Check (`edl-executor.ts`)

| Constant | Value | Where | Claimed Source | Verified? | Notes |
|----------|-------|-------|---------------|-----------|-------|
| Color similarity suppress threshold | 0.7 | edl-executor.ts:shouldSuppressAtBoundary | NEW this session | ⚠️ INVENTED | Jaccard >0.7 = 70% color overlap = same scene. Judgment call. |
| Color similarity allow threshold | 0.4 | edl-executor.ts:shouldSuppressAtBoundary | NEW this session | ⚠️ INVENTED | Jaccard <0.4 = 60%+ different colors = scene change. Judgment call. |
| Boundary frame tolerance | 15 frames | edl-executor.ts:shouldSuppressAtBoundary | NEW this session | ⚠️ INVENTED | How close to boundary to consider "at this boundary." 0.5s tolerance. |
| Nearest-neighbor fallback | midpoint | edl-executor.ts:shouldSuppressAtBoundary | Reused from continuity fix | ✅ REASONABLE | Same pattern as director-agent continuity fix — pick closest keyframe to segment midpoint. |

### Continuity Fix (`director-agent.ts`)

| Constant | Value | Where | Claimed Source | Verified? | Notes |
|----------|-------|-------|---------------|-----------|-------|
| Energy→mood: energetic | >0.75 | director-agent.ts:761 | NEW this session | ⚠️ INVENTED | Reverse map from MOOD_ENERGY table in continuity-service.ts. |
| Energy→mood: dramatic | >0.6 | director-agent.ts:762 | NEW this session | ⚠️ INVENTED | Same. |
| Energy→mood: neutral | >0.45 | director-agent.ts:763 | NEW this session | ⚠️ INVENTED | Same. |
| Energy→mood: mysterious | >0.25 | director-agent.ts:764 | NEW this session | ⚠️ INVENTED | Same. |
| Energy→mood: calm | else | director-agent.ts:765 | NEW this session | ⚠️ INVENTED | Same. |

### Duration Cascade Fix

| Constant | Value | Where | Claimed Source | Verified? | Notes |
|----------|-------|-------|---------------|-----------|-------|
| Duration mismatch threshold | 5 seconds | video-analysis/route.ts:148 | Pre-existing | ⚠️ UNVERIFIED | Step 1.55 correction fires when difference > 5s. Why 5s? |
| Fallback duration | REMOVED (was 30s) | from-asset/route.ts:88 | Pre-existing, REMOVED this session | ✅ FIXED | Old `|| 30` silent fallback removed. Now fails loud with 400. |

### Model Standardization (Phase 1D, 2026-05-15)

| Constant | Old Value | New Value | Where | Notes |
|----------|-----------|-----------|-------|-------|
| Analysis model | `gemini-3.1-flash-lite-preview` | `gemini-3.1-flash` | gemini-model-factory.ts, editron-config.ts, analysis-service.ts | User directive. Env var override preserved. |
| Chat model | `gemini-2.5-flash` | `gemini-3.1-flash` | gemini-model-factory.ts, tools.ts, agent-graph.ts, llm-service-google.ts | User directive. |
| General/heavy model | `gemini-3.1-pro-preview` | `gemini-3.1-pro` | gemini-model-factory.ts, editron-config.ts | User directive. |
| Context cache model | `models/gemini-2.5-flash` | `models/gemini-3.1-flash` | gemini-context-cache.ts | ⚠️ Caching support on 3.1-flash unverified. Graceful fallback exists. |
| Fallback model | `gemini-2.5-flash` | `gemini-3.1-flash` | gemini-model-factory.ts, editron-config.ts | All validateModel fallbacks updated. |
| Token tracker default | `gemini-2.5-flash` | `gemini-3.1-flash` | token-tracker.ts | Cosmetic — affects billing logs only. |
| **Files updated** | | | **8 total** (3 factory + 5 hardcoded) | ThinkForge + Alyzitron + pipeline deferred. |
| **Remaining old refs** | | | ~15 files | ThinkForge agents (10), Alyzitron (3), pipeline (1), creditCosts (1). All deferred. |
| **⚠️ REVERTED** | gemini-3.1-flash / gemini-3.1-pro | Back to originals | ALL 8 files | **Model IDs don't exist on Google API.** 404 in production. `-preview` suffix required for 3.1 models. NEVER change model IDs without testing against the actual API first. |

---

## Pre-Existing Constants That Need Verification (found during audit)

### Genre Parameter Computer (`genre-parameter-computer.ts`)

| Constant | Value | Where | Source | Status |
|----------|-------|-------|--------|--------|
| sfx_density formula | `transitions*0.3 + energy*0.4` | genre-parameter-computer.ts | INVENTED | 🔴 NEEDS BRAINSTORM — where do 0.3/0.4 come from? |
| zoom_budget formula | `ceil(duration/20) + emphasis_density` | genre-parameter-computer.ts | INVENTED | 🔴 NEEDS BRAINSTORM — 1 zoom per 20s, is that right? |
| color_temperature warm | 4000K | genre-parameter-computer.ts | INVENTED | ⚠️ Standard warm is 2700-3000K. 4000K is neutral-warm. |
| color_temperature cool | 7000K | genre-parameter-computer.ts | INVENTED | ⚠️ Standard cool is 5000-6500K. 7000K is very blue. |
| formality: filler >0.05 → -0.3 | 0.05 threshold, -0.3 adjustment | genre-parameter-computer.ts | INVENTED | 🔴 NEEDS BRAINSTORM |
| BGM add conditions | coverage>0.7 AND !music AND formality<0.6 AND duration>30 | genre-parameter-computer.ts | INVENTED | 🔴 NEEDS BRAINSTORM — all 4 must be true? Very restrictive. |
| BGM level | -24 dB | genre-parameter-computer.ts | Cites "creative doc" | ⚠️ KB UNVERIFIED |

### Moment Weight Service (`moment-weight-service.ts`)

| Constant | Value | Where | Source | Status |
|----------|-------|-------|--------|--------|
| Hook zone weight | 0.8 | moment-weight-service.ts | INVENTED | 🔴 NEEDS BRAINSTORM — why 0.8? |
| Closing zone weight | 0.75 | moment-weight-service.ts | INVENTED | 🔴 NEEDS BRAINSTORM |
| Mid-boost weight | 0.55 | moment-weight-service.ts | INVENTED | 🔴 NEEDS BRAINSTORM |
| Default weight | 0.5 | moment-weight-service.ts | INVENTED | ⚠️ Neutral default, reasonable |
| Blend ratio | 50% Gemini / 30% V-JEPA / 20% Wav2Vec | moment-weight-service.ts | INVENTED | 🔴 NEEDS BRAINSTORM — why this ratio? |

### Humanize Pass (`humanize-pass.ts`)

| Constant | Value | Where | Source | Status |
|----------|-------|-------|--------|--------|
| Max cut jitter | ±3 frames (100ms) | humanize-pass.ts | Cites "creative doc" | ⚠️ KB UNVERIFIED — "professional editors have micro-variations ±2-3 frames" |
| Duration jitter | ±15% | humanize-pass.ts | INVENTED | ⚠️ |
| Zoom scale jitter | ±3% | humanize-pass.ts | INVENTED | ⚠️ |
| Transition duration jitter | ±10% | humanize-pass.ts | INVENTED | ⚠️ |
| Consecutive beat threshold | 4 | humanize-pass.ts | INVENTED | ⚠️ |
| Monotony variance threshold | 10% | humanize-pass.ts | INVENTED | ⚠️ |

### Constraint Enforcer (`constraint-enforcer.ts`)

| Constant | Value | Where | Source | Status |
|----------|-------|-------|--------|--------|
| Word boundary buffer | 30ms (enforcer), 50ms (humanize) | constraint-enforcer.ts, humanize-pass.ts | INVENTED | ⚠️ Different values in different files! Should be ONE constant. |
| Max fade-to-black per video | 3 | constraint-enforcer.ts | INVENTED | ⚠️ |
| Transition repetition threshold | 3+ identical in sequence | constraint-enforcer.ts | INVENTED | ⚠️ |
| Graphic too brief | <1.5s, extend to 2.0s | constraint-enforcer.ts | INVENTED | ⚠️ |
| AI footage max hold | 5s, reduce to 4s | constraint-enforcer.ts | INVENTED | ⚠️ |
| Flash rate limit | 3 per second | constraint-enforcer.ts | WCAG 2.1 guideline 2.3.1 | ✅ VERIFIED — this is real accessibility law |
| SFX pairing tolerance | ±5 frames | constraint-enforcer.ts | INVENTED | ⚠️ |
| Speech gap search range | 2000ms | constraint-enforcer.ts | INVENTED | ⚠️ |

### Decision Budget (to be decomposed — `decision-budget.ts`)

| Constant | Value | Rule ID | Status |
|----------|-------|---------|--------|
| PUNCH_ZOOM_PER_30S | 3 | Z-011 | ⚠️ KB UNVERIFIED |
| SHAKE_PER_30S | 4 | CS-020 | ⚠️ KB UNVERIFIED |
| IMPACT_SHAKE_PER_30S | 2 | CS-020 | ⚠️ KB UNVERIFIED |
| KEYWORD_GRAPHIC_PER_30S | 7 | G-002 | ⚠️ KB UNVERIFIED |
| KEYWORD_MIN_GAP_FRAMES | 90 | G-002 | ⚠️ KB UNVERIFIED |
| MAX_SIMULTANEOUS_GRAPHICS | 2 | G-101 | ⚠️ KB UNVERIFIED |
| GRAPHIC_BREATHING_FRAMES | 45 | G-102 | ⚠️ KB UNVERIFIED |
| CAPTION_EMPHASIS_PER_30S | 10 | C-012 | ⚠️ KB UNVERIFIED |
| SFX_PER_30S | 15 | A-100 | ⚠️ KB UNVERIFIED |
| PROMINENT_SFX_PER_30S | 5 | A-100 | ⚠️ KB UNVERIFIED |
| FILTER_PRESETS_PER_60S | 2 | F-011 | ⚠️ KB UNVERIFIED |
| AI_SLOWMO_MIN | 0.5x | S-002 | ⚠️ KB UNVERIFIED |

---

## Logics That Need Brainstorming

### 1. Color Similarity Thresholds (Phase 1B)
**Current:** Jaccard >0.7 suppress, <0.4 allow, 0.4-0.7 allow (benefit of doubt)
**Question:** Are these the right thresholds? Should the "uncertain" band (0.4-0.7) suppress or allow? Should it depend on content type?
**Needs:** Test with real videos — kitchen→outdoor (expect low similarity), same-angle talking head (expect high similarity), slow scene transition (expect mid-range).

### 2. Energy-to-Mood Mapping (Continuity Fix)
**Current:** 5 buckets: >0.75=energetic, >0.6=dramatic, >0.45=neutral, >0.25=mysterious, else=calm
**Question:** These are reverse-mapped from MOOD_ENERGY table in continuity-service.ts. But the MOOD_ENERGY values themselves are invented. Is "dramatic = 0.7 energy" right?
**Needs:** Validate MOOD_ENERGY table against actual content. What energy level does a dramatic scene actually produce from 5-Track?

### 3. Complement Rate Limiting
**Current:** SFX and caption complements check budget before generation (Phase 1A)
**Question:** Should complements be generated independently of their parent decision's budget? Or should a zoom's SFX complement count against the zoom budget?
**Needs:** Design review — are complements first-class decisions or subordinate to their parent?

### 4. Decision Budget Decomposition
**Current:** DecisionBudget still exists for Mode 1 EDL path. Signal executor has its own budget for Mode 2.
**Question:** Should Mode 1's reactive edit engine also get self-regulation? Or is the DecisionBudget fine for Mode 1 since it's less critical?
**Needs:** Assessment of Mode 1 decision quality.

### 5. Transition Type at Boundaries
**Current:** isSingleSource per-boundary check only decides suppress/allow. It doesn't decide WHICH transition type.
**Question:** When we allow a transition at a visual scene change, what type should it be? Currently the signal executor decides. But it may not have picked the right type (dissolve vs dip-to-black vs soft-cut).
**Needs:** Design review — should the per-boundary check also recommend a transition type based on color difference magnitude?

---

## Source of Truth Status

| Category | Current Location | Target Location | Migration Status |
|----------|-----------------|-----------------|------------------|
| Pipeline timing constants | `editron-config.ts` | `editron-config.ts` | ✅ Already centralized (100+ values) |
| Budget rate limits | `decision-budget.ts` + `signal-executor.ts` (duplicated) | `editron-config.ts` or genre params | 🔴 SPLIT across 2 files |
| Transition durations | `transition-templates.ts` + `transition-system.ts` (conflicting) | ONE file | 🔴 CONFLICTING values |
| Audio standards | `constants/audio-standards.ts` (DEAD) + `editron-config.ts` | `editron-config.ts` | ⚠️ audio-standards.ts is dead, values migrated |
| Word boundary buffer | 30ms in enforcer, 50ms in humanize | ONE constant | 🔴 DIFFERENT values for same concept |
| Mood energy mapping | `continuity-service.ts` MOOD_ENERGY table | ONE shared constant | ⚠️ Only used by continuity service currently |
| Color similarity thresholds | `edl-executor.ts` shouldSuppressAtBoundary | `editron-config.ts` | 🔴 NEW, not yet centralized |
| Energy→mood buckets | `director-agent.ts` continuity input | Should reference MOOD_ENERGY table directly | 🔴 NEW, hardcoded in director |
