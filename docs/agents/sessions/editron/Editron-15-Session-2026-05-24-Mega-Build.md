# Session 2026-05-24: Mega Build — Utility AI Engine + Visual Intelligence

## READ THIS FIRST. Every word matters.

**Duration:** ~8+ hours
**Branch:** `infrastructure-improvs-+Editron` (deploy)
**Worktree:** `D:\google downloads\Front-End-main\editron-worktree\`
**Obsidian Vault:** `D:\Insturix-Brain\` (40+ docs — created THIS session)

---

## ⛔ STOP — What You'll Get Wrong Without This

### 1. The utility engine is in SHADOW MODE.
All 59 overlay definitions score signals and log results, but DON'T affect video output. The shadow scoring runs at `director-agent.ts:593` (Step D.4b). It produces log lines like `[Director] Utility AI shadow: scored 59 overlays × 240 grid points`. These logs show what the utility engine WOULD decide, not what it DID decide. CRG + profiles still drive actual output.

### 2. Profile override is FEATURE-FLAGGED (OFF by default).
`director-agent.ts:66` checks `process.env.USE_UTILITY_ENGINE === 'true'`. When OFF (default), profiles still control filters, captions, transitions. When ON, utility scoring overrides profile values for filter and caption selection.

### 3. The profile override uses ESTIMATED signals, not real signal data.
The override at line 66 runs BEFORE the signal timeline is built (line 548+). It estimates formality from pacing string, everything else at 0.5. This is a PLACEHOLDER. The proper fix: move the override to AFTER signal timeline build and score against real averaged signal values. See TODO section.

### 4. Phase 1C constraint is BUILT INTO the architecture.
Missing signals = missing considerations = overlay scored on remaining considerations. No veto possible. This is by design. If V-JEPA doesn't run, VES uses 3/5 components instead of 5/5. Never gates.

### 5. All P0 bugs are FIXED.
Verified against code this session: A3.1 (parser montage), A3.2 (sub-shot images), A3.5.1+2 (dual transitions), A3.5.4 (filter schizophrenia). All have dedup/guard code in place. Don't re-investigate.

---

## 🏗️ What Was Built

### Utility AI Decision Engine (Phase 0)
A scoring engine based on Dave Mark's Infinite Axis Utility System (15 years production-proven in games). Each overlay has considerations with response curves. Scores multiply. Best-scoring overlay per category wins.

**Files:**
```
lib/editron/engine/
├── utility-types.ts              — Types: OverlayDefinition, Consideration, CurveParams, ScoringResult, etc.
├── response-curves.ts            — 6 curve types: linear, polynomial, logistic, logit, normal, sine
├── utility-scorer.ts             — scoreOverlay, scoreAllOverlays, selectWinners, scoreGridPoint
├── decision-inspector.ts         — Debuggable scorecards (every score traceable to curve + input)
├── overlay-definitions.json      — 59 definitions (44 CRG + 4 visual + 11 profile replacement)
└── overlay-definitions-loader.ts — Bundler-safe loader for Vercel
```

**Key concepts:**
- **Consideration:** Maps one signal through a response curve to 0-1 score. NOT a threshold check.
- **Response curve:** Shape determines how signal affects score. Logistic (S-curve), polynomial (slow start/fast finish), normal (bell), etc. 4 params: slope, exponent, xShift, yShift.
- **Multiplicative scoring:** All consideration scores multiply. ANY score of 0 = veto. Compensation factor adjusts for different consideration counts.
- **Categories:** zoom, transition, sfx, graphic, filter (global), caption (global), cut, camera. Each category scored independently.
- **Rank:** Higher rank wins ties. hold_dramatic_pause (60) > cut_dead_air (50). Creative brief (future: 100) > utility moments (50).
- **Derived signals:** zoom_active feeds into SFX considerations for emergent pairing.

### CRG Bootstrap (Phase 1)
Converted 44 of 95 CRG mappings to overlay definitions. The 51 skipped are behavioral rules (hold, adjust_pacing, flag_for_review) that don't produce overlays. Converter: `scripts/convert-crg-to-overlays.ts`.

Shadow scoring wired at `director-agent.ts:593-627` (Step D.4b). Runs alongside CRG executor, logs results, never affects output.

### Profile Replacement (Phase 2)
11 new overlay definitions replace profile-driven decisions:
- **4 filter overlays:** clean-corporate (formality↑), vivid (enthusiasm↑), warm-neutral (warmth↑), cinematic (engagement↑ + moderate formality)
- **3 caption overlays:** subtitle (formal + speech), word-by-word (casual + energetic + speech), none (no speech)
- **4 transition overlays:** hard-cut (energy shift), dissolve (warm + smooth), whip-pan (energetic + casual), dip-to-black (formal + scene change)

Feature flag `USE_UTILITY_ENGINE=true` enables profile override in director-agent.ts:66.

### Response Curves (Phase 3)
Fixed 3 quality issues from Phase 1 linear curves:
1. **evaluateCurve no longer clamps input to [0,1]** — negative signals (speech_energy_delta) now reach curves
2. **Logistic curves replace linear** in converter — S-curves with sharp threshold transitions instead of linear ramps
3. **Noise word filtering** in converter — eliminated parsing artifacts (dropping, was, max, etc.)

### Visual Intelligence Signals (Phase 4)
4 new signals added to signal-registry.ts (Pass 1):
- `visual.scene_change` — Jaccard distance between consecutive keyframe dominantColors (0 = identical, 1 = completely different)
- `visual.brightness_stability` — brightness delta between consecutive keyframes (1 = stable, 0 = big jump)
- `visual.engagement` (VES) — weighted composite of eye_contact (0.3), visual_significance (0.25), motion_intensity (0.2), face_present (0.15), brightness_stability (0.1). Currently 3/5 components always available (motion, face, brightness). V-JEPA adds remaining 2.
- `speech.silence_normalized` — silence_duration_ms / 3000, clamped to [0,1]

3 new visual overlay definitions:
- `visual.cut_dead_air` — fires on low VES + silence + no speech + low EMA
- `visual.scene_transition` — fires on high scene_change
- `visual.beat_sync_cut` — fires on music_beat + low speech_coverage

### EMA + Surprise Signals (Phase 5)
New Pass 3 in signal-registry.ts (after Pass 2 temporal smoothing):
- **EMA** (exponential moving average, alpha=0.3, ~3s window) for: speech.energy, visual.engagement, visual.motion_intensity
- **Surprise** (raw - EMA) for each: positive = rising unexpectedly, negative = dropping
- **Energy trajectory:** rising / peaked / falling / quiet (from EMA slope)
- New signal names: `speech.energy_ema`, `speech.energy_surprise`, `visual.engagement_ema`, etc.

**The dramatic pause vs dead air distinction:**
- Dead air: low VES + low EMA (energy was ALSO low recently) → `cut_dead_air` scores 0.998
- Dramatic pause: low speech but high VES + high EMA (energy WAS high recently) → `hold_dramatic_pause` scores 0.860, cut doesn't even reach minScore
- This PARTIALLY solves D-009 merge logic. Creative brief vs utility ranking (Phase 6) still needed.

---

## 🧪 Test Infrastructure

| Script | What | Assertions | Command |
|--------|------|-----------|---------|
| `test-utility-engine.ts` | Unit: curves, scoring, compensation, A/B, inspector, veto | 32/32 | `npx tsx scripts/test-utility-engine.ts` |
| `test-utility-integration.ts` | Integration: 5 content profiles + edge cases + performance | 9/9 | `npx tsx scripts/test-utility-integration.ts` |
| `test-visual-overlays.ts` | Visual: dead air, music beat, scene change, active speaker | 4/4 | `npx tsx scripts/test-visual-overlays.ts` |
| `test-dramatic-vs-deadair.ts` | Critical: dramatic pause vs dead air distinction | 4/4 | `npx tsx scripts/test-dramatic-vs-deadair.ts` |
| `test-profile-replacement.ts` | Profiles: filter + caption selection across content types | 7/7 | `npx tsx scripts/test-profile-replacement.ts` |
| `convert-crg-to-overlays.ts` | Build: CRG→overlay converter | 44 converted | `npx tsx scripts/convert-crg-to-overlays.ts` |

**Run all:** `npx tsx scripts/test-utility-engine.ts && npx tsx scripts/test-utility-integration.ts && npx tsx scripts/test-visual-overlays.ts && npx tsx scripts/test-dramatic-vs-deadair.ts && npx tsx scripts/test-profile-replacement.ts`

**Performance:** 5.5-7.7ms for 10,560 evaluations (59 overlays × 240 grid points). Well under 50ms budget.

---

## 🔬 Research Findings (from this session)

### Dave Mark's Utility AI / Infinite Axis System
- Production-proven in AAA games for 15+ years (The Sims, Zoo Tycoon 2)
- Core: decisions have considerations, each maps a signal through a response curve to 0-1 score
- 6 curve types: linear, polynomial, logistic, logit, normal, sine
- Multiplicative scoring with compensation factor
- Debuggable via decision inspectors (scorecards at every grid point)
- Full research: [[Utility-AI-Architecture]]

### Key Architecture Insight: Overlay Signatures
User's original idea: "numerize the overlays" — give each overlay a numeric description of what kind of moment it fits. This maps exactly to Dave Mark's considerations + curves. The overlay signature IS the set of considerations. The scoring IS the matching.

### Decision Architecture Evolution
```
BEFORE: 95 CRG rules (threshold checks) + 54 profiles (static presets) + LLM (creative brief)
AFTER:  59 overlay definitions (response curves) + LLM (creative brief) + profiles (feature-flagged fallback)
```

---

## 🔴 What's Broken / Incomplete

### Must Fix Before Production
1. **Profile override uses estimated signals** (director-agent.ts:66-92). Runs before signal timeline exists. Uses pacing-derived formality + 0.5 defaults. TODO: move to after signal timeline build, score against averaged real signals.
2. **Phase 2.4 not truly wired** — feature flag exists but override uses fake signals. Need real signal integration.

### Architecture Gaps Still Open
1. **D-009 merge logic** — PARTIALLY solved. Dramatic pause vs dead air ✅. Creative brief vs utility ranking ❌ (needs Phase 6 rank system).
2. **Phase 4.1 local RMS silence** — DEFERRED. signal-registry doesn't have raw audio access. Needs preprocessing architecture. Current silence detection uses transcript word gaps (Gemini-dependent, not L0-safe).
3. **Phase 4.2 Essentia.js beats** — DEFERRED. Needs WASM-in-Vercel spike test. Fallback: existing 5-Track BPM from Gemini.
4. **61 + ~30 INVENTED thresholds** in production. All CRG thresholds + all new curve params are ⚠️ INVENTED. Phase 7 calibration needed.

### Phases Remaining
| Phase | What | Estimated | Risk |
|-------|------|-----------|------|
| 6 | Creative brief integration (non-speech prompts + routing + rank system) | CC ~3-4 hours | HIGH — prompt engineering |
| 7 | Calibration (Thompson sampling on curve params) | CC ~3 hours | LOW — additive |

---

## 📋 All Decisions Made This Session

| # | Decision | Status | Doc |
|---|----------|--------|-----|
| D-014 | Utility AI decision engine (overlay signatures + response curves) | #decided | [[D-014-Utility-AI-Decision-Engine]] |
| D-001 | Extend signal registry (don't build new TAG data structure) | #decided | [[D-001-Extend-Signal-Registry]] |
| D-002 | L0 stack (local RMS + Essentia.js + sharp histogram diff) | #decided | [[D-002-L0-Stack]] |
| D-003 | Model strategy (Gemini start, Qwen3-VL Phase 2) | #decided | [[D-003-Model-Strategy]] |
| D-004 | Signal-driven routing (before creative brief) | #decided | [[D-004-Signal-Driven-Routing]] |
| D-005 | Prompt variants with eval harness (Rule 35) | #decided | [[D-005-Prompt-Variant]] |
| D-006 | Priority parallel (P0 bugs + visual intelligence) | #decided | [[D-006-Priority-Parallel]] |
| D-007 | Obsidian knowledge base | #decided | — |
| D-009 | Merge logic | #partial | [[D-009-Merge-Logic]] |

**Open decisions:** D-008 (Modal), D-010 (Qwen3-VL eval), D-011 (threshold calibration), D-012 (build order), D-013 (VES weights).

---

## 📚 Obsidian Vault (D:\Insturix-Brain)

**ALWAYS read `00-Index.md` first.** Then the relevant section index. The vault has 40+ docs covering:
- `01-Research/` — Papers (EditDuet, HIVE, MVAA), models (Gemini/Qwen3-VL/Twelve Labs), libraries (Essentia.js, Modal), datasets, prompt methodology, content editing knowledge
- `02-Architecture/` — Vision, pipeline map, MG engine, signal registry, visual intelligence, Phase 1C failure, Mode 2, ThinkForge, codebase graph, rules
- `03-Decisions/` — 9 decided, 5 open
- `04-Session-Notes/` — This doc + prior sessions
- `05-Bugs-and-Issues/` — P0s (all fixed), architecture gaps, 61 thresholds, Phase 1 quality issues, pipeline investigations
- `06-Resources/` — APIs, models, keys, costs, infra IDs
- `07-Roadmap/` — Implementation plan, CTO plan, product integration, codebase knowledge TODO

**CLAUDE.md rule:** Every session reads vault FIRST, writes to vault AFTER every commit/discovery/learning. See CLAUDE.md Obsidian section.

---

## 🎓 Lessons Learned This Session

### Process Lessons
1. **Context loss is the #1 time waster.** This session spent ~45 minutes rehashing topics from editron 26 because the prior session's context wasn't properly persisted. The Obsidian vault was created to fix this permanently.
2. **Don't propose what was already decided.** Read decisions index BEFORE suggesting anything. If it's in `03-Decisions/`, link to it, don't re-argue it.
3. **"Follow all rules" means ALL rules.** Not a summary table. Every rule checked individually. Self-audit catches bugs (sfxCount, phantom signal, process.cwd).
4. **Shadow mode before production.** Wire new systems alongside existing ones. Log only. Compare. Flip when validated.

### Technical Lessons
1. **evaluateCurve must NOT clamp input to [0,1].** Negative signals (speech_energy_delta = -0.2) need to reach curves. Clamp OUTPUT only.
2. **Linear curves produce bad decisions for threshold-based rules.** CRG triggers are binary (above/below threshold). Linear curves make everything proportional. Logistic curves (S-curves) properly express "don't care until 0.5, then care a LOT."
3. **EMA + surprise = temporal context without complexity.** The dramatic pause vs dead air distinction doesn't need ML or multi-agent architecture. EMA (exponential moving average) creates expectation. Surprise (raw - EMA) detects deviation. Simple signal processing, production-proven.
4. **Utility AI compensation factor is essential.** Without it, overlays with more considerations always score lower (0.9^5 = 0.59 vs 0.9^2 = 0.81). The factor: `modification = (1 - score) * (1 - 1/N) * score` levels the playing field.
5. **Global overlays (filter, caption) need averaged signals.** They're scored once per video, not per grid point. The current placeholder uses estimated signals. Proper implementation: average signal values across the entire timeline.
6. **process.cwd() breaks in Vercel serverless.** Use bundler-resolved imports (@/ path alias) not filesystem reads. Fixed with overlay-definitions-loader.ts.

### Architecture Insights
1. **The CRG mapping engine and utility AI serve different purposes.** CRG: 1-dimensional threshold triggers from domain knowledge. Utility AI: multi-dimensional continuous scoring. CRG bootstraps utility AI initial curve shapes.
2. **Profiles are a proxy for content type. Signals ARE the content type.** A 34-dimensional signal vector describes the content better than a label like "TikTok" or "Corporate." Kill the proxy, use the real thing.
3. **The rank system replaces explicit merge logic.** Instead of "when A says cut and B says hold, who wins?" → give B higher rank. The scoring system handles priority naturally.
4. **1D curves are sufficient. 2D surfaces only for known signal interactions. Never 3D+.** 3D+ = can't visualize, can't hand-tune, requires ML to calibrate. Violates "rules for logic" vision.

### User Preferences (observed this session)
- **Quality over speed, always.** "I don't want speed. I want quality. Don't rush."
- **Follow ALL rules from FIRST edit.** Don't do retroactively.
- **Don't rehash decided topics.** Check vault first.
- **Don't be a yes man.** Challenge ideas honestly.
- **Explore from first principles** before jumping to solutions.
- **"Keep it simple"** — the signal system works beautifully. New architecture should be equally elegant.
- **Profiles are hated.** Replace with signal-driven decisions.
- **Obsidian for persistence.** Every learning, discovery, decision goes to vault.

---

## ⏭️ What To Do Next Session

### FIRST: Read Context
1. `D:\Insturix-Brain\00-Index.md` → section indexes
2. This handover doc
3. `07-Roadmap/Plan-Utility-AI-and-Visual-Intelligence.md` → full plan with gaps addressed

### THEN: Choose Priority

**Option A: Fix the profile override wiring (2-3 hours)**
Move the utility scoring override from line 66 (before signals) to after signal timeline (line 627+). Score global overlays against averaged real signal values. This makes `USE_UTILITY_ENGINE=true` actually signal-driven instead of estimated.

**Option B: Phase 6 — Creative brief integration (3-4 hours)**
New prompts for non-speech content. Routing logic. Rank/priority system (creative brief=100, utility=50). Eval harnesses per Rule 35. HIGHEST RISK phase.

**Option C: Essentia.js spike test (30 min)**
Quick test: does Essentia.js WASM work in Vercel serverless? If yes, unlocks real beat detection (Phase 4.2). If no, fallback to existing 5-Track BPM.

**Option D: Deploy and observe (1-2 hours)**
Commit everything. Push to deploy branch. Flip `USE_UTILITY_ENGINE=true` on preview. Run a real video. See shadow logs. Compare utility decisions to CRG decisions on real content.

### DO NOT:
- Re-propose TAG architecture (it's decided — D-001)
- Re-propose alternative decision engines (it's decided — D-014)
- Re-investigate P0 bugs (all fixed, verified)
- Re-research papers (all in vault at 01-Research/)
- Ask "did you follow all rules?" without checking yourself first

---

## 📊 Commit Summary

No commits made this session (no git repo in working directory — changes are in editron-worktree). All files are written but uncommitted. Next session should:

```bash
cd "D:\google downloads\Front-End-main\editron-worktree"
git add lib/editron/engine/ scripts/test-utility-*.ts scripts/test-visual-overlays.ts scripts/test-dramatic-vs-deadair.ts scripts/test-profile-replacement.ts scripts/convert-crg-to-overlays.ts docs/UTILITY-AI-PLAN.md
git status  # verify only intended files
# Commit in phases per R12N (one concern per commit)
```

Suggested commits:
1. `feat(editron): utility AI scoring engine — types, curves, scorer, inspector`
2. `feat(editron): CRG-to-overlay converter + 44 bootstrapped definitions`
3. `feat(editron): visual intelligence signals — scene change, VES, brightness stability, silence normalized`
4. `feat(editron): EMA + surprise temporal context — dramatic pause vs dead air distinction`
5. `feat(editron): profile replacement overlays — signal-driven filter, caption, transition selection`
6. `feat(editron): utility AI shadow mode + feature-flagged profile override in director-agent`
7. `test(editron): utility AI test suite — 56 assertions across 5 test files`

Tags: #session #handover #mega-build #2026-05-24
