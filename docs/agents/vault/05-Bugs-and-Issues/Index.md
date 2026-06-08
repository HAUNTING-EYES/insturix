# Bugs & Issues Index

## P0 (affects every video)
- ~~A3.1 Parser montage~~ — **FIXED.** Dedicated Gemini montage-detection + per-sub-shot creation (llm-scene-parser.ts:1296). Verified 2026-05-24.
- ~~A3.2 Sub-shot images~~ — **FIXED.** Montage-first path generates per-sub-shot images, no IP-adapter refs (storyboard-service.ts:612). Verified 2026-05-24.
- ~~A3.5.1+2 Dual transitions~~ — **FIXED.** `dedupTransitionsByClipPair()` Step 3.4 (director-agent.ts:1091). EDL skipped if Director already placed. Verified 2026-05-24.
- ~~A3.5.4 Filter schizophrenia~~ — **FIXED.** Hue-rotate >30° rejected + mood-filter precedence guard (edl-executor.ts:1508). Verified 2026-05-24.

## Architecture Gaps
- ~~No visual dead-air detection~~ — **FIXED.** VES + EMA/surprise signals in signal-registry.ts, cut_dead_air vs hold_dramatic_pause overlays. Verified 2026-05-24.
- ~~Non-speech content uneditable~~ — **FIXED (Phase 6.1).** ContentMode routing (D-004), multi-coordinate BriefDecision (timestamp/beat/word priority), music+visual prompts, 15 new registry entries, brief-executor resolution. R29 adversarial-tested. Wiring into director-agent.ts in Phase 6.2.
- **Signal naming mismatch** — Overlay definitions use bare IDs (`formality`, `warmth`), signal registry uses namespaced (`content.formality`). Bridge mapping in director-agent.ts:657-668. Needs proper resolution in overlay-definitions.json.
- ~~Profile overrides signal system~~ — **FIXED (D-016).** batch_update_overlays no longer overwrites Utility AI filter. Standard action sequence. Profile selection removed from workers. Commit `8d296acb`. 2026-05-28.
- ~~Logo reveal over-generation~~ — **CLOSED (by design).** Path E has code cap at 2. Path D has no cap but overlay scoring + Thompson Sampling calibration will naturally learn correct frequency. System decides, not hardcoded rules. Verified 2026-05-27.
- Aesthetic gate Tier 2 unwired — runAestheticGate exported at aesthetic-gate.ts:61, ZERO importers. Completely dead code.
- ~~editronConfig.ts unwired~~ — **PARTIALLY FIXED.** 12 files now import DEFAULT_CONFIG (was listed as "no consumers"). Still has unwired values.
- Pipeline warnings partially surfaced — director-agent uses pipelineWarnings (4 call sites). NOT in API response surface or finalize. 271 console.warn/error total, 97 are silent failures, pipelineWarnings used in only 4 sites.
- ~~alignCutsToBeats() never called~~ — **FIXED.** director-agent.ts:1468-1469 calls it with beat grid. Verified 2026-05-27.
- ~~V-JEPA ghost infrastructure~~ — **FULLY WIRED.** Modal GPU endpoint (vjepa_visual.py, 471 lines), TS service (vjepa-service.ts, 284 lines), feeds Director (4 purposes), Signal Registry (5 new signals), Moment Weights (30% weight). Graceful degradation when unavailable. Verified 2026-05-27.
- ~~Gemini prompt contradictions~~ — **CLOSED (by architecture).** 6 contradictions found but becoming irrelevant as signal-driven overlay system (Path D) replaces Gemini prompt-based decisions. Creative brief path being deprecated in favor of signal+overlay scoring. Contradictions will die naturally. Verified 2026-05-27.

## Threshold Debt
- 86 invented thresholds found across MG engine files (verified 2026-05-27, was 61 on 2026-05-24)
- All marked with "INVENTED — needs calibration" comments  
- All actively used in production
- See [[D-011-Threshold-Calibration]]

## Investigations
- [[Pipeline-Investigations]] — 14 investigation entries with root cause analysis + fix options

## Dead Ends
- Phase 1C visual gating — broke basic cutting. See [[Phase-1C-Failure-Analysis]]

## Scaling Phase Backlog
- **Grok STT file upload bandwidth**: Currently downloads file to Vercel function memory (~90MB) then uploads to xAI. At 1000+ concurrent transcriptions, use xAI Files API (upload once, reference by ID) instead. See `transcription-service.ts` comment. Added 2026-05-28.
- **Vercel 800s worker timeout**: TRIBE Phase 2 (V-JEPA + Wav2Vec) for long videos (20+ min, 250+ segments) exceeds 800s Vercel function limit. Worker times out before dispatching Director → no MGs, captions, or edits. Fix: split TRIBE Phase 2 into separate QStash worker. Added 2026-05-28.

Tags: #bugs #issues
