---
name: session-handover-2026-05-20-editorial-intent
description: "MEGA SESSION: Editorial Intent Gate shipped (2 commits). Signal-driven density v3 designed. GSAP Lambda-safe proven. Mode 2 full pipeline audited (16 working, 9 missing). 3 CEO reviews, 2 Eng reviews. 10 open threads. 2 new rules. READ THIS FIRST for next session."
metadata: 
  node_type: memory
  type: project
  date: 2026-05-20
  originSessionId: b0f0681b-c901-4f84-966f-f720f49025bb
---

# Session Handover — 2026-05-20

## TL;DR — Read This in 30 Seconds

The system placed 11 identical keyword-highlights on a contemplative talk-to-camera video. Root cause: LLM prompt said "include ALL onScreenText," safety net bypassed budget, content density never reached the graphic pipeline. We shipped guardrails (budget overrides, safety net cap, bypass removal) + narrow prompt rules. Designed but didn't build the signal-driven density equation (needs calibration data). Proved GSAP parseEase() is Lambda-safe. Did a full Mode 2 pipeline audit — 16 services working, 9 items missing. User established two critical rules: (1) NEVER use profile-based logic, always signals, (2) motion graphics is a full domain, not just lower-thirds.

---

## COMMITS SHIPPED (on `infrastructure-improvs-+Editron`)

### Commit `86180dfd` — Editorial Intent Gate Foundation

| File | Change | Lines |
|------|--------|-------|
| `lib/editron/services/edl-executor.ts` | Added `graphicsDensity?` param. Density→budget overrides (minimal: 3/30s, moderate: 5/30s, heavy: 9/30s). Removed safety net budget bypass (`isScriptOnScreenText` deleted). Audit trail: `[EDL-Exec] EDITORIAL:` log for every graphic decision with type, text, verdict, budget state, density. | +22, -8 |
| `lib/editron/agent/director-agent.ts` | Passes `effectiveProfile.graphicsDensity` to ALL 4 downstream call sites: executeEDL (lines 468, 641, 795) + translateCreativeIntentToEDL (line 738). | +4 |
| `lib/editron/services/unified-edit-intelligence.ts` | Schema `graphicIntents.max(3)` → `max(8)`. Removed "include ALL onScreenText" from schema description. Added `<graphic_density_rules>` block. Changed onScreenText header from "create one graphic per entry" to "candidates." Changed output_format instruction. Changed legacy path instruction from "produce exactly N" to "include only matching entries." | +12, -10 |
| `lib/editron/services/intent-translator.ts` | Added `graphicsDensity?` param + `safetyNetEmitted` counter. Safety net now density-aware: minimal=1, moderate=3, heavy=999 max fallbacks per video. When cap reached, logs which entries were skipped. | +20, -18 |
| `components/editron/editor/version-7.0.0/types.ts` | Extended `CaptionWord` with `emphasis?: { type: 'keyword'\|'statistic'\|'cta'\|'entity'; source: string; }` | +4 |
| `components/.../captions/caption-layer-content.tsx` | Reads `word.emphasis`. Emphasized words get: bold 700 (inactive), full opacity 1.0 (not 0.85), scale 1.05, accent-color underline. When word IS active (temporal highlight), normal highlight animation takes over. | +8, -4 |

### Commit `54e8123d` — Fix Rule 35 Prompt Violations

| File | Change | Lines |
|------|--------|-------|
| `lib/editron/services/unified-edit-intelligence.ts` | Replaced ALL 7 instances of vague language with narrow enumerated rules. See "Prompt Rules" section below. | +21, -9 |

---

## WHAT THE PROMPT RULES NOW SAY (Rule 35 compliant)

**Minimal density:**
```
At most 1 graphic per 5 scenes. ONLY if:
(a) first appearance of named person → lower-third
(b) brand/logo at opening or closing → logo-reveal
Default: no graphics. onScreenText: skip unless matching (a) or (b).
```

**Moderate density:**
```
At most 1 graphic per 2 scenes. ONLY if:
(a) named person → lower-third
(b) specific number (percentage, dollar, count) → stat-counter
(c) brand/logo → logo-reveal
(d) direct quote → quote-card
Default: no graphics. onScreenText: include only if matching a condition.
```

**Heavy density:**
```
Up to 2 per scene. Place for: all names, stats, key terms, CTAs, brand.
onScreenText: include all relevant.
```

**Zero vague language remaining.** Grep-verified: no "quality over quantity," "editorial merit," "editorial purpose," "editorially justified," "absolutely essential."

---

## THE ROOT CAUSE ANALYSIS (why 11 keyword-highlights appeared)

```
ThinkForge script has 11 onScreenText entries
  ↓
Unified Intelligence prompt says "include ALL onScreenText as separate graphics"
  ↓
GraphicIntentSchema caps at max(3) per scene
  ↓
LLM can only output 3 → misses 8 entries
  ↓
Safety net catches ALL 8 missed entries → creates keyword-highlights at 33% into each scene
  ↓
Safety net tagged 'onScreenText-safety-net' → BYPASSES budget entirely
  ↓
ALL 8 safety net + 3 LLM = 11 keyword-highlights appear on screen
```

**Fixes applied:**
1. Prompt changed: "include ALL" → "only matching entries per density rules"
2. Schema cap: max(3) → max(8) so LLM can handle more entries itself
3. Safety net bypass: REMOVED. All decisions go through budget.
4. Safety net cap: minimal=1, moderate=3, heavy=unlimited per video
5. Budget overrides: density drives KEYWORD_GRAPHIC_PER_30S (minimal=3, moderate=5, heavy=9)

**Expected result:** ~5-7 overlays for moderate 10-min video (down from 11). Not tested on live deployment yet — user testing in progress.

---

## ARCHITECTURE DECISIONS (what was tried, what was rejected, WHY)

### V1: Editorial Intent Gate (REJECTED by user)
7-step gate, ContentArchetype enum, EditorialPurpose classification, type restrictions per content type (only lower-thirds for talk-to-camera), confidence floor.
**Why rejected:** Over-engineered. Type restrictions kill creative flexibility. "A director doesn't say 'only lower-thirds allowed' — they say 'this video needs 3 graphics.'" Archetype system was profile-based thinking in disguise.

### V2: Prompt Guiderails + Budget Guardrails (SHIPPED with fixes)
Density-aware prompt rules + budget overrides + safety net cap. LLM self-regulates based on density context. Budget catches outliers.
**Why shipped:** Simpler. Uses existing infrastructure (DecisionBudget.profileOverrides was built but never used). No new modules.
**What was wrong:** Initial prompt text used vague language ("quality over quantity"). Fixed in second commit.

### V3: Signal-Driven Density (DESIGNED, not built)
Equation computes graphic budget from content signals (entityRate, formality, speechCoverage, motionIntensity, hasFace). Per-entry confidence scoring ranks onScreenText entries. Code selects top N, LLM only executes.
**Why not built:** Coefficients are invented — needs calibration against real creator videos. Plan: launch matching v2 behavior, calibrate over time.
**User's calibration idea:** Scan top creators' existing videos as ground truth. User feedback/corrections on the platform improve coefficients over time.
**Full design:** `memory/project_signal_driven_density_v3.md`

### Key Principle: GUARDRAILS not GUIDERAILS
The user made this distinction clear: guardrails catch when something goes WRONG (safety net). They don't actively GUIDE decisions. The LLM prompt + density context is the guiderail. Budget + safety net cap are guardrails. Don't build systems that override the intelligence — build systems that make the intelligence smarter.

---

## RULES DISCOVERED THIS SESSION

### Rule: No Profile-Based Logic (feedback_no_profile_default.md)
NEVER default to profile-based approaches for system logic. Profiles are user-facing labels, not system architecture. When designing any system behavior, ask: "Can this be computed from signals?" If yes, use signals. The agent kept falling back to "map profileId to behavior" — the user pushed back every time.

### Rule: Motion Graphics is a Full Domain (feedback_motion_graphics_scope.md)
Stop reducing motion graphics to "lower-thirds and stat counters." The VIE/GSAP architecture should be a SYSTEM for generating ANY motion graphic from parameters — title sequences, infographics, data viz, kinetic typography, animated logos, transitions, comparisons, timelines, CTAs, testimonial cards. Think SYSTEM not COMPONENT.

---

## GSAP FINDINGS (Lambda-safe, not integrated)

**Discovery:** `gsap.parseEase()` returns a pure function `(progress: number) => number`. Tested in Node:
```
const { gsap } = require('gsap');
const elastic = gsap.parseEase('elastic.out(1,0.5)');
elastic(0.5) → 0.9688
// Deterministic. No DOM. No useEffect. Same model as interpolate().
```

**What this means:**
- GSAP easing can replace the manual `resolveEasing()` approximations in StatCounter
- Every GSAP easing preset (elastic, back, bounce, steps, rough, slow) becomes available
- Lambda-safe because it's computed during render, same as `interpolate()`
- No timeline/DOM pattern needed — just pure math functions

**What this unlocks (not built yet):**
- Exact easing curves (not bezier approximations)
- Token-driven animation: each content type gets different easing from signals
- Foundation for the motion graphics SYSTEM (procedural generation from parameters)
- SplitText character animation (future)

**GSAP is installed:** v3.13.0 in package.json. Currently only used in dashboard UI (DotGrid, scroll animations). Not in any Remotion/Editron rendering code.

---

## MODE 2 PIPELINE — COMPLETE MAP

### Upload → Analysis (5 stages)

```
Upload (from-asset/route.ts)
  → Validate asset, get URLs, create project, pre-warm GPU
  → QStash dispatch to video-analysis worker

Worker (video-analysis/route.ts)
  Step 1:   processRawFootage()
            - Transcribe: Grok STT > Whisper > Deepgram (word-level)
            - Silence detect (gaps > 300ms)
            - Filler detect (um, uh, like, you know...)
            - Content type classify (rule-based, 11 types, no LLM)
            - Transcript Editor: Gemini 3.1 Pro word-level keep-ranges
              OR fallback: segment + editorial intent + best-take
            - Build silence removal plan
  Step 1.6: Execute silence removal (modify timeline)
  Step 2:   Gemini Vision visual understanding
  Step 3:   Genre parameters (9 dials from signals)
  Step 3.1: Thompson Sampling bandit (if ≥5 projects)
  Step 3.5: V-JEPA + Wav2Vec (parallel Modal GPU, non-fatal)
  Step 3.6: Moment weight map (50% Gemini + 30% V-JEPA + 20% Wav2Vec)
  Step 3.7: Unified segment analysis (merge 5 sources)
  Step 4:   Store all → status: analysis_complete
  Step 5:   Dispatch Director via QStash
```

### Decision → Execution (Director)

```
Director (director-agent.ts)
  │
  ├─ PATH E (if USE_CREATIVE_BRIEF=true, mutually exclusive with D):
  │    generateCreativeBrief() → executeBrief() → humanize → constrain → executeEDL
  │
  ├─ PATH D (primary, signal-driven):
  │    D.1: computeGenreParameters() — 9 dials from signals
  │    D.2: buildMomentWeightMap() — per-segment importance weights
  │    D.3: buildSignalTimeline() — grid (every 15 frames) + event (word timestamps)
  │    D.4: executeSignalDrivenEdit() — evaluate 95 graph mappings
  │    D.5: humanizeEdl() — seeded jitter, variation (4 passes)
  │    D.6: enforceConstraints() — 8-pass, 50 constraints, WCAG flash rate
  │    D.7: Convert → executeEDL() — budget enforcement, apply to overlays
  │
  ├─ UNIFIED INTELLIGENCE (fallback if D+E both fail):
  │    Creative intent → intent translator → EDL
  │
  └─ POST-EDL PROFILE ACTIONS (still run after Path D):
       Filters, captions (standard for Mode 2), audio ducking,
       motion graphics, beat-sync, transition SFX, quality review (51 checks)
       [SKIP add_transition — signal executor handles it]
```

### Service Status

| Service | Status | Notes |
|---------|--------|-------|
| signal-executor.ts | ✅ WORKING | 95 graph mappings, budget tracking |
| signal-registry.ts | ✅ WORKING | Grid + event signals, V-JEPA/Wav2Vec enrichment |
| genre-parameter-computer.ts | ✅ WORKING | 9 dials from signals |
| constraint-enforcer.ts | ✅ WORKING | 8-pass, 50 constraints |
| humanize-pass.ts | ✅ WORKING | Seeded PRNG, word-boundary protection |
| moment-weight-service.ts | ✅ WORKING | Phase 0-2 (Phase 3 EML missing) |
| content-type-detector.ts | ✅ WORKING | 11 types, rule-based |
| editorial-intent-detector.ts | ✅ WORKING | Gemini Flash, retroactive flagging |
| decision-registry.ts | ✅ WORKING | 34 types across 9 categories |
| graph-query.ts | ✅ WORKING | 671 nodes loaded, actively queried |
| genre-parameter-bandit.ts | ✅ WORKING | Thompson Sampling, MongoDB |
| vjepa-service.ts | ⚠️ CONDITIONAL | Needs Modal deployment |
| wav2vec-service.ts | ⚠️ CONDITIONAL | Needs Modal deployment |
| EML override | ❌ MISSING | Skeleton only, no caller |
| Multi-speaker editing | ❌ MISSING | Diarization signals exist, not consumed |
| Music-driven editing (Mode 2) | ❌ MISSING | Explicitly skipped |
| Signal-driven density (v3) | ❌ DESIGNED | Needs calibration |
| Motion graphics system | ❌ NEEDS DESIGN | Only StatCounter uses VIE |
| Caption emphasis wiring | ❌ DESIGNED | Type exists, nothing populates |

### Invented Numbers in Code (flagged, need validation)

| File:Line | Value | What | Source |
|-----------|-------|------|--------|
| signal-executor.ts:90 | SHAKE_PER_30S, SFX_PER_30S, etc. | Rate limits | "UNVERIFIED — from decision-budget.ts" |
| moment-weight-service.ts:119 | 0.55 flat weight | Default moment weight | "INVENTED — engineering heuristic" |
| vjepa-service.ts:97 | BATCH_SIZE=30 | V-JEPA segment batch | "INVENTED — warm container guess" |
| director-agent.ts:305 | 2.5s | Inter-clip analysis delay | "INVENTED delay value" |

---

## OPEN THREADS (prioritized, with context)

### P0 — Ship Quality

1. **Validate editorial intent gate on live deployment.** User testing in progress. Check Vercel logs for `[EDL-Exec] EDITORIAL:` audit trail. Re-run Vlogbrothers project (proj_HMKQa07M3Mnh) — target ~5-7 overlays, not 11. Also run a heavy-density project to verify no regression.

2. **Caption emphasis wiring.** `CaptionWord.emphasis` type + renderer are shipped but DORMANT — nothing populates the field. Need edl-executor redirect: when graphicsDensity is minimal and graphicType is keyword-highlight, find matching CaptionWords by text+time (within ±2s), set emphasis metadata. Eng review decided: text + time hybrid matching.

### P1 — Architecture

3. **Signal-driven density v3.** Build `resolveGraphicBudget()` + `scoreOnScreenTextEntries()`. Launch matching v2 behavior (no regression). Calibrate against top creator videos. User's idea: scan existing top creators' videos as ground truth. Full design in `memory/project_signal_driven_density_v3.md`.

4. **Silence removal needs visual signals.** Current system is transcript-only. SaaS ads, montages, music videos have no transcription → can't silence-remove. Need visual signal integration (motion intensity, scene change detection) as alternative input.

5. **Are 9 genre dials enough?** User questioned whether 9 parameters capture all editing dimensions. The 47-signal ThinkForge system has much richer coverage. Evaluate which additional signals should feed the genre parameter computer.

6. **Captions should be signal-driven for Mode 2.** Currently Mode 2 forces "standard" captions (line 997-1004 in director-agent.ts — fancy→standard downgrade). Should be influenced by content signals, brand DNA, and the 6-level ThinkForge hierarchy (BRAND→CAMPAIGN→FORMAT→PROJECT→ACT→SCENE).

7. **Filters and transitions should follow signal/brand hierarchy.** Same issue as captions — post-EDL profile actions apply generic filters/transitions instead of signal-driven ones.

8. **Quality review should be content-aware.** 51 checks apply same criteria to all content. Can't review tech content with same level as cooking content. Need content-type-aware scoring weights.

### P2 — Motion Graphics

9. **Motion graphics system design.** Needs /office-hours session. The VIE/GSAP architecture should be a SYSTEM for generating any motion graphic from signals, not individual components. Only StatCounter uses Structure × Theme currently.

10. **GSAP integration.** parseEase() proven Lambda-safe. Next: replace `resolveEasing()` in StatCounter with `gsap.parseEase()`. Then build the procedural motion graphic system.

11. **6 density categories.** Designed: none/minimal/sparse/moderate/generous/heavy. Not added to EditProfile type yet. Needs type extension + profile audit to assign new values.

### P3 — Verification

12. **Thompson Sampling — explain to user + verify working.** User asked "what is it" — needs simple explanation. Then verify DB state shows bandit learning is actually happening.

13. **Path D and E documentation.** User said the pipeline outline was functions not explanations. Need human-readable docs that explain WHAT each path does and WHY, not just the code flow.

14. **KB audit of rate limits.** SHAKE_PER_30S, SFX_PER_30S, CAPTION_EMPHASIS_PER_30S flagged as UNVERIFIED. Need to validate against creative production knowledge doc.

---

## CEO REVIEW ITERATIONS (the thinking arc)

**Round 1 — SCOPE EXPANSION mode.** Started with a 300-LOC editorial-intent-gate.ts module with 7-step logic, ContentArchetype mapping (7 archetypes from profileId), EditorialPurpose enum, type restrictions per archetype, confidence floor. 4 expansions accepted: fix LLM schema cap, field-based density, audit trail, narrative arc awareness.

**User pushback #1:** "Why hardcode only 3 types allowed? Are these gates production-level?" → Killed type restrictions. Agencies/directors choose types; system controls quantity.

**User pushback #2:** "You are again going for profile type." → Killed archetype system. Use existing `graphicsDensity` field directly, don't create new classification.

**User pushback #3:** "Directors call is shit here... we can't put a cap, if intelligence feels 15 are fine they are." → Killed hard caps. Guardrails only. Let intelligence decide.

**User pushback #4:** "Quality over quantity is a totally shit ass move... the non-determinism of gemini cmon." → Killed vague prompt text. Replaced with narrow Rule 35 enumerated conditions.

**User pushback #5:** "You are building this for just 2 graphics BRUH, motion graphics isn't that." → Killed component-by-component approach. Need a SYSTEM.

**User pushback #6:** "Don't chase profiles... signals can determine motion graphics needed... create an equation." → Designed v3 signal-driven density.

**Final architecture (v2 shipped + v3 designed):**
- v2: Narrow prompt rules + budget overrides + safety net cap = deterministic guardrails
- v3: Signal equation + per-entry confidence = signal-driven intelligence (next session)

---

## TECHNICAL FINDINGS

### Budget Math (why the guardrail is generous)
For a 10-min moderate video: `scaled(5) = Math.max(5, ceil(5 * sqrt(600000/30000))) = 23 keyword graphics allowed`. The budget allows 23 for a 10-min video. The safety net cap (moderate=3) is the real limiter, not the budget. This is acceptable because the LLM prompt rules are the primary control.

### Safety Net Behavior Post-Fix
Safety net fires for onScreenText entries the LLM misses. With max(8) schema, the LLM handles more entries itself. Safety net catches fewer misses. Those few compete for budget + safety net cap (3 for moderate). A 10-min moderate video: LLM ~4 + safety net ~3 = ~7 total.

### Caption Emphasis Renderer Behavior
| State | Without emphasis | With emphasis |
|---|---|---|
| Active (spoken now) | Normal highlight | Same (active takes over) |
| Visible (not spoken) | opacity 0.85, normal weight | opacity 1.0, bold 700, scale 1.05, underline |
| Faded (past) | opacity 0.5 | opacity 0.5 |

### The DecisionBudget.profileOverrides Parameter
Existed since the budget class was built but was NEVER used — constructor always got KB defaults. This session finally wired it: Director builds overrides from graphicsDensity and passes them. The merge is: `{ ...KB_DEFAULTS, ...shortFormOverrides, ...profileOverrides }`.

---

## FILES THAT MATTER (for next session work)

| File | What | Why |
|------|------|-----|
| `lib/editron/services/edl-executor.ts` | EDL execution, budget, graphic application | Changed this session — density overrides, bypass removed, audit trail |
| `lib/editron/agent/director-agent.ts` | Director orchestrator, all paths | Changed this session — density passed to 4 call sites |
| `lib/editron/services/unified-edit-intelligence.ts` | LLM prompt for creative decisions | Changed this session — density rules, schema cap, onScreenText instructions |
| `lib/editron/services/intent-translator.ts` | Creative intent → EDL decisions + safety net | Changed this session — density-aware safety net cap |
| `lib/editron/services/signal-executor.ts` | 95 graph mappings → editing decisions (Path D) | Core Mode 2 intelligence. Invented rate limits. |
| `lib/editron/services/signal-registry.ts` | Grid + event signal collection | Dual-timing system, V-JEPA/Wav2Vec enrichment |
| `lib/editron/services/genre-parameter-computer.ts` | 9 dials from signals | Computes graphic_density (0-8) already — v3 should use this |
| `lib/editron/services/constraint-enforcer.ts` | 8-pass constraint validation | 50 CRG constraints, auto-correction |
| `lib/editron/data/motion-theme-resolver.ts` | 8 signals → 35 visual tokens | VIE core — drives Structure component styling |
| `lib/editron/motion-graphics/structures/StatCounter.tsx` | Remotion-native animated counter | Only Structure component that exists. GSAP upgrade target. |
| `lib/editron/services/quality-review-service.ts` | 51 deterministic quality checks | Needs content-type-aware scoring |
| `lib/editron/data/decision-registry.ts` | 34 decision types across 9 categories | Source of truth for what decisions exist |
| `lib/editron/data/creative-knowledge-graph.json` | 671 nodes, 533 edges | Queried by signal executor. Constraints used by enforcer. |

---

## WHAT NOT TO DO (traps for the next agent)

1. **Don't default to profile-based logic.** Use signals. See `feedback_no_profile_default.md`.
2. **Don't use vague LLM instructions.** No "quality over quantity," "editorial merit," "essential." Use enumerated binary conditions per Rule 35.
3. **Don't reduce motion graphics to individual components.** Think SYSTEM. See `feedback_motion_graphics_scope.md`.
4. **Don't ship invented coefficients without calibration.** The v3 equation needs real data.
5. **Don't assume the budget catches everything.** For long videos, budget is generous (sqrt scaling). Safety net cap is the real limiter.
6. **Don't skip the pre-flight checklist.** This session violated Rule 35 (shipped prompt without eval harness) and got caught. Evidence blocks for every edit.
7. **Don't batch multiple CEO review questions.** User prefers one-at-a-time with clear explanations. Avoid jargon — explain like a smart 16-year-old.
8. **Don't build GSAP timelines for Remotion.** Use parseEase() as pure function only. No DOM, no useEffect.

---

## CROSS-REFERENCES

- [[session_handover_2026_05_20_motion_graphics]] — Previous session: VIE foundation, template routing, StatCounter, 5 pipeline bugs, 4 overlay bugs
- [[project_signal_driven_density_v3]] — V3 design: equation + confidence scoring + calibration
- [[feedback_no_profile_default]] — Rule: signals over profiles
- [[feedback_motion_graphics_scope]] — Rule: MG is a full domain
- [[project_mode2_signal_architecture]] — Mode 2 signal-driven architecture (7 services + Path D)
- [[motion_graphics_investigation_2026_05_19]] — VIE research: 12 dimensions, 10 archetypes, 3 Laws
- [[mg_ceo_eng_design_reviews_2026_05_19]] — CEO + Eng + Design reviews of VIE architecture
- [[vision_execution_craft_gap]] — Intelligence 8/10, execution craft 4/10
- [[gemma4_roadmap]] — Gemma 4 for deterministic cuts (future)
- [[stable_transcript_editor_v1]] — Transcript editor stable state (commit 78f39365)
- [[creative_content_doc_research]] — 47 signals, research data, architecture decisions
