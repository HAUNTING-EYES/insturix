# Session 2026-05-25: Phase 6.1 Rule Remediation

## What happened
Continued from prior session where Phase 6.1 (non-speech coordinate resolution) was implemented but an honest rules audit found 8 violations. This session completed the remediation.

## Remediation completed
1. **Anti-metronomic constraint** — Added CRG `constraint:temporal.metronomic_beat_sync` to `buildMusicPrompt()` anti_patterns section. "NEVER lock 6+ consecutive decisions to exact beat positions." Source: CRG lines 9321-9339, deduction -5.
2. **INVENTED signal markings** — 7 entries in `decision-registry.ts` marked with `⚠️ INVENTED` comments:
   - `beat_accent` ×1 — derived from CRG `signal:audio.music_beat` (downbeat accents)
   - `visual_peak` ×2 — derived from V-JEPA visualSignificance peaks (not yet in CRG)
   - `motion_peak` ×4 — derived from CRG `signal:visual.motion_intensity` (local max > 0.6)
3. **MUSIC_PRESENCE_THRESHOLD** — Already fixed in prior session from 0.5 to 0.6 per CRG. Test input corrected from 0.6 to 0.65 (strict `>` operator).
4. **R29 Adversarial testing** — 21 scenarios tested across music prompt (8), visual prompt (8), and routing (5). Maximum damage score: 4/10 (well below 8 threshold). No production blockers.
5. **Obsidian vault** — Bugs index updated, session note created.

## Test results
- 52/52 non-speech coordinate tests PASS
- 32/32 utility engine tests PASS

## Files modified this session
- `lib/editron/services/creative-brief.ts` — anti-metronomic constraint in music prompt
- `lib/editron/data/decision-registry.ts` — 7 INVENTED signal comments
- `scripts/test-nonspeech-coordinates.ts` — test input threshold fix
- `D:\Insturix-Brain\05-Bugs-and-Issues\Index.md` — status update

## Still pending from prior audit
- E1/R25N Graph Evidence — fixed (CRG grep done, threshold corrected)
- E3 Dependency grep — fixed (callers verified)
- Pre-edit hook — violated in prior session, cannot retroactively fix, but all edits THIS session answered the hook
- R35 Eval Harness — prompts behind double feature flags, planned for Phase 6.3

## Phase 6.2 completed (same session)
- Wired `routeContentType()` into `director-agent.ts` Path E (lines 416-425)
- Computes `speechCoverage` from `rfa.speechCoverage`, `visualChangeRate` from V-JEPA average motionIntensity
- `musicPresence = 0` (conservative — no music detector until Essentia.js wired)
- Passes `contentMode` to `generateCreativeBrief()` as 5th parameter
- **Effect**: Mode 2 uploaded footage with low speech now gets visual/hybrid-mode editing
- **No regression**: Mode 1 AI video routes to 'speech' (high speechCoverage from TTS)
- 1 file modified: `director-agent.ts` (2 edits: import + routing block)
- Type-check: 0 errors in editron files (196 pre-existing in thinkforge)
- Tests: 59/59 + 32/32 pass

## Phase 6.3 completed (same session)
- Eval harness: 89 local assertions + 20 live Gemini assertions = 109/109 pass
- Music prompt: Gemini produced 18 decisions, all timestamp-coordinated, 14 distinct confidences, 99% coverage
- Visual prompt: 17 decisions, all timestamp-coordinated, 17 distinct confidences, 99% coverage
- Exported `validateAndGate` for eval access

## Phase 6 Review (same session)
- Independent code review (opus agent) found 2 bugs:
  1. Distribution check in validateAndGate used targetWordIdx for quartile calc — NaN for non-speech. FIXED.
  2. Visual routing unreachable without V-JEPA (visualChangeRate defaulted to 0). FIXED: segment density proxy.
- 3 design notes acknowledged (musicPresence=0, hybrid uses speech prompt, overshoot asymmetry)

## Phase 7.1 completed (same session)
- Decision tracker service: `lib/editron/services/decision-tracker.ts` (~200 LOC)
- Three functions: snapshotDecisions, diffOutcomes, aggregateOutcomes
- Classifies each system decision as kept/modified/removed by comparing against user-edited overlays
- 45/45 tests pass (includes R29 adversarial: deleted+replaced overlay, far-away overlay)
- Two INVENTED thresholds marked: FRAME_MATCH_TOLERANCE=3 (100ms), proximity range=150 frames (5s)

## Production Test (Hank Green vlog, proj_APY5gxzbxZ68)
First end-to-end pipeline test. Findings:
- **speechCoverage=NaN** — undefined word timestamps. FIXED: Number.isFinite guard.
- **Essentia false positive** — speech rhythm misdetected as 129 BPM music (musicPresence=0.90). FIXED: penalty formula `max(0, 1-speechCoverage)` when speech > 0.5.
- **Caption style profile-driven** — utility AI scoring was inside Path D, skipped when Path E ran. FIXED: extracted to Step 1.9, runs for all paths.
- **MG signals empty** — contentSignals={} → generic animations. FIXED: inject signal context before EDL execution.
- **MG layout monotony** — all keyword-highlights top-left. FIXED: cycling through 4 corners.
- **MG recipes/content/captions** — NOT broken (false alarm from wrong MongoDB queries).
- Essentia Modal deployed + music mode fully wired end-to-end.

## Commits this session (total)
- 6 Phase 6 commits (6.1-6.3 + review fixes + live eval)
- 8 Phase 7 commits (7.1-7.4 + remediations)
- 3 Essentia + music mode commits
- 4 production bug fix commits
- Total: ~21 commits pushed to origin

## Production Testing (proj_APY5gxzbxZ68, proj_bLDNby42tyeK, proj_2YQA-AadcYxs)
- **NaN speechCoverage** — w.start/w.end undefined. FIXED: Number.isFinite + endMs/startMs fallback.
- **Essentia false positive** — 130 WPM speech → 129 BPM. FIXED: penalty when speech > 0.5.
- **Director crash** — briefSignalContext scope error. FIXED: hoisted to function scope.
- **MG monotonous** — signal namespace mismatch (formality vs speech_coverage). FIXED: bridge mappings.
- **Captions always subtitle** — hardcoded formality=0.5. FIXED: reads real signals.
- **Speech coverage 0.47 vs 99.6%** — span vs sum-of-durations. FIXED: aligned to sum.
- **Layout cycling** — all top-left. FIXED: round-robin 4 corners.

## Additional Production Fixes (proj_6dAeIQ9tJXZE)
- **MG container missing** — formality > 0.4 used strict >, boundary value got no card. FIXED: >= 
- **Caption style disconnect** — Utility AI picked word-by-word but add_captions used profile style. FIXED: briefCaptionStyle priority in style chain.
- **Keyword quality** — LLM picked "download", "Leave". No CRG selection criteria in prompt. FIXED: A/B/C criteria from CRG mapping:graphic.keyword_highlight.
- **Wav2Vec aborting** — Modal cold restart mid-batch, 45s timeout insufficient. FIXED: gap detection + partial results.
- **Stat counter 0.0** — toFixed(1) truncated 0.02. FIXED: preserve target decimal precision.
- **Neo4j** — user resumed Aura instance.

## What's next
- Retest with all fixes deployed
- Director monolith refactoring (R33: 5+ edits same file)
- Keyword quality eval (does Gemini follow A/B/C criteria?)

## Git state
- Branch: `infrastructure-improvs-+Editron`
- Phase 6.1 committed: `99206a31`
- Phase 6.2 uncommitted (director-agent.ts only)

Tags: #session #phase6 #remediation #adversarial-testing #wiring
