# Session Handover — 2026-05-26 Mega Build + Production Testing

## READ THIS FIRST
This session ran ~12 hours across 2 days. 34 commits, +8604 lines, 30 new files, 13 modified. Phase 6 (non-speech content) + Phase 7 (threshold calibration) + Essentia deployment + 12 production bug fixes from 4 live test runs.

## Branch & Git State
- **Branch**: `infrastructure-improvs-+Editron` (deploy branch)
- **Worktree**: `D:\google downloads\Front-End-main\editron-worktree\`
- **Status**: Clean, all pushed to origin. 0 unpushed commits.
- **Latest commit**: `1d9081bb` — wav2vec gap detection test

## What Was Built

### Phase 6: Non-Speech Content Editing (COMPLETE)
The creative brief system was word-index-only. Now handles music, visual, and hybrid content.

**6.1 — Architecture** (`99206a31`)
- `ContentMode` type: `'speech' | 'music' | 'visual' | 'hybrid'`
- `routeContentType()` function with CRG-grounded thresholds
  - speech > 0.6 → speech mode
  - music > 0.6 + speech < 0.3 + beats ≥ 20 BPM → music mode
  - visual > 0.3 + speech < 0.3 → visual mode
  - else → hybrid
- `buildMusicPrompt()` — beat-driven editing with timestamp/beat coordinates
- `buildVisualPrompt()` — scene-driven editing with timestamp coordinates
- `<rhythm_adaptation>` block for ambient/slow music
- `<data_adaptation>` block for missing V-JEPA data
- `<pacing_adaptation>` block for low-motion content
- 15 new decision registry entries (9 music-driven, 6 visual-driven)
- Multi-coordinate `BriefDecision`: targetTimestampMs > targetBeatIdx > targetWordIdx priority
- Anti-metronomic constraint from CRG constraint:temporal.metronomic_beat_sync
- 59/59 coordinate tests + 109/109 eval assertions (including live Gemini)

**6.2 — Director Wiring** (`dfcd3e95`)
- Director Path E computes ContentMode from measured signals
- speechCoverage from rawFootageAnalysis
- visualChangeRate from V-JEPA motionIntensity average
- Segment density proxy when V-JEPA absent + speech low
- Passes contentMode to generateCreativeBrief()

**6.3 — Eval Harness** (`70d77090`, `ff67fb11`)
- 89 local assertions (mock Gemini responses through validateAndGate + executeBrief)
- 20 live Gemini assertions (music=18 decisions 99% coverage, visual=17 decisions 99% coverage)
- Exported validateAndGate for eval access

### Phase 7: Threshold Calibration (COMPLETE)
Three-layer calibration: ground → track → adapt.

**7.1 — Decision Tracker** (`91e2b827`)
- `decision-tracker.ts` — snapshotDecisions, diffOutcomes, aggregateOutcomes
- Classifies each system decision as kept/modified/removed by user
- Type-aware overlay matching (skips video/sound source overlays)
- 45/45 tests including R29 adversarial cases

**7.2 — Threshold Registry** (`a27754b0`, `821ddbd9`)
- `threshold-registry.ts` — 73 entries cataloging all INVENTED thresholds
- Sources: 7 CRG, 13 AE, 9 domain, 1 WCAG, 13 INVENTED + 30 design constants
- Bayesian priors (mu, sigma) for each — tight for CRG, wide for INVENTED
- 502/502 data integrity tests

**7.3 — Threshold Bandit** (`669999b7`, `b04a4c96`)
- `threshold-bandit.ts` — Thompson sampling on 35 adaptive thresholds
- Priors from registry, decision-level feedback (kept=1, modified=0.5, removed=0)
- REASON_TO_THRESHOLDS mapping (CRG-documented signal→threshold chain)
- Director samples adjusted thresholds before routing, snapshots after execution
- 130/130 tests

**7.4 — Outcome Capture** (`4924a709`)
- Decision log persisted to MongoDB (intelligence.decisionLog)
- Render route diffs overlays vs snapshot (async, non-blocking)
- Outcomes feed threshold bandit → saves to MongoDB
- Type-filtered: video/sound overlays excluded from matching

### Essentia.js Music Detection (DEPLOYED)
- `music-analysis-service.ts` — Modal endpoint client (same pattern as wav2vec)
- `modal/music_analysis_essentia.py` — Deployed to Modal
  - Endpoint: `https://jainnimit728--music-analysis-essentia-essentiaanalyzer-analyze.modal.run`
  - CPU-only (no GPU). Runs RhythmExtractor2013, BeatTrackerMultiFeature, KeyExtractor
  - Returns: bpm, beats[], sections[], musicPresence, key, energyCurve
- Video analysis worker runs Essentia in parallel with V-JEPA + Wav2Vec
- Director reads musicPresence + beats, populates VideoContext.musicFeatures
- Essentia penalty: musicPresence *= max(0, 1 - speechCoverage) when speech > 0.5
  - ⚠️ INVENTED formula. Prevents speech rhythm false positives (130 WPM → 129 BPM)

## Production Bugs Found & Fixed (4 test runs)

### proj_APY5gxzbxZ68 (Test 1)
1. **speechCoverage = NaN** — w.start/w.end undefined in STT output → NaN propagation. `NaN ?? 0` returns NaN (JS gotcha). FIXED: `Number.isFinite()` guard + `w.endMs ?? w.end ?? 0` fallback.
2. **Essentia false positive** — musicPresence=0.90 on talking head (speech rhythm = 129 BPM). FIXED: penalty when speech > 0.5.
3. **MG empty (FALSE ALARM)** — my MongoDB query checked wrong property path (`metadata.recipe` instead of `recipe`). MG content was actually populated.
4. **Captions 0 segments (FALSE ALARM)** — checked `metadata.words` instead of `captions`. Captions had 12 segments each.

### proj_bLDNby42tyeK (Test 2)
5. **Director CRASH** — `briefSignalContext is not defined`. Variable declared inside intelligence block (6-space indent) but referenced outside (4-space indent). ReferenceError discarded all decisions. FIXED: hoisted to function scope.
6. **speechCoverage = 0.00** — raw-footage-processor used `w.start/w.end` but STT stores as `w.startMs/w.endMs`. With `?? 0` fallback: `0 - 0 = 0` for every word. FIXED: `w.endMs ?? w.end ?? 0`.

### proj_2YQA-AadcYxs (Test 3)
7. **MG monotonous** — composition planner expects `formality/enthusiasm/warmth`, received `speech_coverage/visual_change_rate`. Signal namespace mismatch. FIXED: bridge mappings inject personality signals.
8. **Captions always subtitle** — Utility AI selected word-by-word (0.874) but hardcoded `formality=0.5` in scoring. Also: `briefCaptionStyle` never reached `add_captions` handler. FIXED: real signals + priority chain.
9. **Speech coverage 0.47 vs 99.6%** — ContentType detector used span (first→last word), raw-footage-processor used sum-of-durations. FIXED: aligned to sum-of-durations.
10. **Utility AI scoring skipped for Path E** — overlay scoring was inside Path D block. When Path E handled intelligence, scoring never ran. FIXED: extracted to Step 1.9, runs unconditionally.

### proj_6dAeIQ9tJXZE (Test 4)
11. **MG container missing** — `formality > 0.4` used strict `>`. Formality=0.4 got no background card. FIXED: `>=`.
12. **Caption style disconnect** — `add_captions` read from `params.style` (profile), never `briefCaptionStyle`. FIXED: `briefCaptionStyle || params.style || profile.captionStyle`.
13. **Keyword quality poor** — "download", "Leave" highlighted. No CRG selection criteria in prompt. FIXED: A/B/C criteria from CRG mapping:graphic.keyword_highlight.
14. **Wav2Vec aborting** — Modal cold restart mid-batch, 45s timeout insufficient. FIXED: gap detection + partial results.
15. **Stat counter "0.0"** — `toFixed(1)` truncated 0.02. FIXED: preserve target decimal precision.

## Key Architecture Decisions

1. **Content routing is signal-driven** — NOT profile-driven. speechCoverage/musicPresence/visualChangeRate determine mode.
2. **Essentia penalty in Director, not Modal** — keeps Modal as pure audio analyzer. Domain context (speech presence) applied where data converges.
3. **Threshold bandit separate from genre bandit** — different feedback signals (decision-level vs project-level).
4. **Phase 1C safety rule** — non-speech path is ADDITIVE only. Never gates speech functionality.
5. **briefCaptionStyle priority chain** — utility AI → brief output → profile → 'subtitle'.
6. **Signal bridge mappings** — personality signals (formality, enthusiasm, warmth) derived from genre params + speechCoverage because signal-registry doesn't compute them directly.

## Critical Env Vars (Vercel)
```
USE_CREATIVE_BRIEF=true        # Enables Path E (creative brief architecture)
USE_UTILITY_ENGINE=true         # Enables utility AI overlay scoring
MODAL_MUSIC_ANALYSIS_ENDPOINT=https://jainnimit728--music-analysis-essentia-essentiaanalyzer-analyze.modal.run
MODAL_TOKEN_ID=...              # Already set (shared with Wav2Vec)
MODAL_TOKEN_SECRET=...          # Already set
```
`useCompositionEngine` is `true` by default in editronConfig.ts — no env var needed.

## New Files Created (30)
```
lib/editron/engine/
  utility-types.ts              — Overlay, Consideration, ResponseCurve types
  response-curves.ts            — 4 curve types (linear, polynomial, logistic, normal)
  utility-scorer.ts             — Score overlays by signal considerations
  decision-inspector.ts         — Debug inspector for utility decisions
  overlay-definitions.json      — 59 CRG-bootstrapped overlay definitions
  overlay-definitions-loader.ts — Loader with validation

lib/editron/data/
  threshold-registry.ts         — 73 threshold entries with Bayesian priors

lib/editron/services/
  decision-tracker.ts           — Snapshot + diff + aggregate decision outcomes
  threshold-bandit.ts           — Thompson sampling on adaptive thresholds
  music-analysis-service.ts     — Modal Essentia client

modal/
  music_analysis_essentia.py    — Essentia Modal deployment (CPU-only)

scripts/ (16 test files)
  test-utility-engine.ts        — 32 assertions (curves, scoring, compensation)
  test-nonspeech-coordinates.ts — 59 assertions (routing, resolution, registry)
  eval-nonspeech-prompts.ts     — 109 assertions (mock + live Gemini)
  test-decision-tracker.ts      — 45 assertions (snapshot, diff, aggregate)
  test-threshold-registry.ts    — 502 assertions (data integrity, prior widths)
  test-threshold-bandit.ts      — 130 assertions (sampling, update, serialization)
  test-production-fixes.ts      — 25 assertions (NaN, penalty, routing, adversarial)
  test-signal-bridge.ts         — 17 assertions (speech methods, personality derivation)
  test-wav2vec-timeout.ts       — 11 assertions (gap detection, partial results)
  + 7 other test/dashboard files
```

## Test Coverage
| Suite | Assertions | What it covers |
|---|---|---|
| test-utility-engine | 32 | Response curves, scoring, compensation |
| test-nonspeech-coordinates | 59 | Content routing, coordinate resolution, registry |
| eval-nonspeech-prompts | 109 | Mock + live Gemini validation |
| test-decision-tracker | 45 | Snapshot, diff, aggregate, adversarial |
| test-threshold-registry | 502 | Data integrity, prior widths, sources |
| test-threshold-bandit | 130 | Sampling, update, CRG drift, serialization |
| test-production-fixes | 25 | NaN, Essentia penalty, routing, adversarial |
| test-signal-bridge | 17 | Speech coverage methods, signal derivation |
| test-wav2vec-timeout | 11 | Gap detection, partial results |
| **Total** | **930** | |

## INVENTED Values (require calibration)
- `speechCoverage > 0.5` penalty threshold (director-agent.ts)
- `musicPresence *= max(0, 1 - speechCoverage)` penalty formula (director-agent.ts)
- `enthusiasm = speechCoverage > 0.5 ? min(1, speechCoverage * 1.2) : 0.5` (director-agent.ts)
- `warmth = 0.3 + (speechCoverage > 0 ? 0.4 : 0)` (director-agent.ts)
- `MIN_BEAT_DENSITY_BPM = 20` (creative-brief.ts)
- `SPARSE_RHYTHM_THRESHOLD = 60` BPM (creative-brief.ts)
- `GAP_COLD_RESTART_MS = 30000` (wav2vec-service.ts)
- `FRAME_MATCH_TOLERANCE = 3` frames (decision-tracker.ts)
- `emphasisLayoutCounter` cycling (content-shape-analyzer.ts) — module-level state, resets on deploy
- Full list: 102 INVENTED markers across 22 files, 73 cataloged in threshold-registry.ts

## What's Left (Verified from codebase + vault)

### Bugs Index (Open)
1. Signal naming mismatch — overlay defs use bare IDs, signal registry uses namespaced
2. Logo reveal over-generation — LLM produces 5 when max 2
3. Aesthetic gate Tier 2 unwired — runAestheticGate exists, nobody calls it
4. editronConfig.ts — 100+ values still not wired to services
5. Pipeline warnings not surfaced to user
6. alignCutsToBeats() never called (scene-to-editron.ts:311)
7. V-JEPA ghost infrastructure — typed but never populated

### Architecture Gaps
8. Phase 2 (Kill profiles) PARTIAL — creative brief replaces intelligence, but action loop still profile-driven for some tools
9. 7 missing personality signals — enthusiasm/warmth/emotional_arousal/pacing_velocity/humor/visceral_impact/visual_dependency never registered in signal-registry. Only derived approximations exist.
10. Director monolith — 2600 lines, R33 debt (10+ edits this session)

### Open Decisions
11. D-008: Modal commitment
12. D-009: Dramatic pause vs dead air merge logic
13. D-010: Qwen3-VL evaluation plan
14. D-011: Threshold calibration approach
15. D-012: Build order
16. D-013: VES weight calibration

### Technical Debt
17. 795 TODO/FIXME/PLACEHOLDER across 67 files
18. 102 INVENTED markers across 22 files (73 cataloged, 29 not)
19. Wav2Vec fragility on long videos (partially fixed with gap detection)
20. Keyword quality eval needed (verify Gemini follows A/B/C criteria)

## Key Learnings (Save These)

1. **`NaN ?? 0` returns NaN** — JavaScript's nullish coalescing doesn't catch NaN. Use `Number.isFinite()`.
2. **STT field names vary** — Deepgram uses `start/end` (seconds), Grok uses `startMs/endMs` (milliseconds). Always check both: `w.endMs ?? w.end ?? 0`.
3. **Block scoping kills** — `let` inside a `{ }` block is invisible outside. The Director's intelligence block is 6-space indented; Step 1.9 is 4-space. Variables must be hoisted.
4. **Essentia detects speech as music** — 130 WPM speech creates 129 BPM periodic patterns. Always penalize musicPresence by speechCoverage.
5. **Prompt guidance needs NEGATIVE examples** — "conceptual terms" is too vague. Explicit "NEVER highlight: download, leave, click" works better.
6. **Signal namespace mismatch** — MG planner expects `formality`, signal registry stores `content.formality`. Bridge mappings exist in Path D but must be replicated for Path E.
7. **Modal containers restart mid-batch** — Only batch 0 should get cold timeout. Track inter-batch gap time; re-use cold timeout if >30s gap.
8. **Strict > vs >= at boundaries** — `formality > 0.4` excludes exactly 0.4. Most content lands near threshold boundaries. Use `>=` for inclusive thresholds.
9. **MongoDB queries: check property paths** — `metadata.recipe` vs `recipe`, `metadata.words` vs `captions`. Wrong paths produce false "empty" reports.
10. **Utility AI scoring must run for ALL paths** — Was inside Path D only. When Path E handles intelligence, Path D is skipped, and utility scoring never ran.

## Infrastructure State
- **Neo4j**: User resumed Aura instance (was DNS-dead from auto-pause)
- **Modal Essentia**: Deployed and live
- **Modal Wav2Vec**: Partially fixed (gap detection), still fragile
- **Modal V-JEPA**: Working
- **Gemini Context Cache**: Working (HIT on subsequent calls)
- **Thompson Sampling Bandit**: Wired, needs production data (active after 10+ outcomes)

## Rule Compliance Notes
- **R33 (3+ edits same file)**: director-agent.ts was edited 10+ times this session. It's a monolith. Needs refactoring into smaller modules (routing, intelligence, actions, signals).
- **Rule 35 (Prompt Engineering)**: Music and visual prompts eval'd with live Gemini (109/109). Keyword prompt updated with CRG criteria but not re-eval'd.
- **INVENTED values**: All marked with ⚠️ comments. Threshold registry catalogs 73. Bandit priors set (tight for CRG, wide for INVENTED).

Tags: #handover #mega-session #phase6 #phase7 #essentia #production-testing
