---
name: commit-history-audit-may-10-2026
description: "All commits on infrastructure-improvs-+Editron from this session. Bleed-through fixes, repetition intent discriminator, Grok STT diarization, prosodic support."
metadata: 
  node_type: memory
  type: project
  last_updated: 2026-05-10
  originSessionId: daa8ecc4-35ca-458f-992d-d02b987fa635
---

# Commit History Audit — May 10, 2026

Previous audit: `commit_history_audit_2026_05_01.md` (covers May 1-2)
Note: Commits from May 3-9 sessions are documented in their respective session handover files but not in a dedicated audit file.

## Session: May 10, 2026 (7 commits)

### Bleed-Through Fixes
- `2e34d8f3` fix: bleed-through + editorial intent context enrichment
  - 2 files (silence-removal-executor.ts, editorial-intent-detector.ts), 56 insertions, 26 deletions
  - Fix 1: Case 6 (overlay starts inside cut) now sets both sourceStartFrame AND videoStartTime when trimming start. Root cause: Remotion reads videoStartTime (confirmed at video-layer-content.tsx:200,218,232) but case 6 never updated it.
  - Fix 2: Removed overlay merge path — all overlaps now snap (trim prev shorter). Merge extended source range into removed content.
  - Also included context enrichment (later reverted in 0b297b5f).

### Context Enrichment (Added then Reverted)
- `0b297b5f` revert: remove context enrichment — poisoned classifier on meta-heavy openings
  - 1 file (editorial-intent-detector.ts), 3 insertions, 39 deletions
  - Context enrichment sent opening 300 words to Gemini as topic signal. For this Hank Green video, opening is ALL meta-commentary about editing → Gemini inferred topic as "video editing" → cut the actual thesis ("The internet brings out the worst in people") as off-topic.
  - Data: proj_ZyF9IKnLsk5U (no context) kept thesis. proj_A88Vek5jSDCF (with context) cut thesis.

### Immediate Cut Quality Fixes
- `f3a54213` fix: intra-segment retake splitting + editorial intent protection + false-start punctuation
  - 1 file (raw-footage-processor.ts), 126 insertions, 3 deletions
  - Step 4.75: Intra-segment repetition splitting — scans segments > 15 words for repeated phrase clusters (sliding window Jaccard > 0.5), splits at boundaries for best-take comparison.
  - Editorial intent protection: Gemini CONTENT classifications (confidence >= 0.85) prevent best-take detector from cutting those segments via protectedIndices Set.
  - False-start punctuation check: segments ending with . ! ? are complete thoughts, not false starts. Prevents cutting rhetorical building ("Climate change is real." as setup).

### Repetition Intent Discriminator (Phase 1)
- `025c19ab` feat: repetition intent discriminator — retake vs intentional detection
  - 2 files (new repetition-intent-discriminator.ts + raw-footage-processor.ts), 271 insertions, 11 deletions
  - New service: classifyRepetitionIntent() — completeness × variation × timing decision matrix
  - Adversarially tested: 82% raw → 96.4% after 6 heuristic fixes → 52/54 profiles safe
  - 6 heuristic fixes: dead zone default, escalating retake override, restraint profile override, semantic polarity check, exclamatory exemption, content-type moved before best-take
  - Wired into detectBestTakes(): groups classified as INTENTIONAL are disbanded, all segments kept

### Rule Compliance Audit
- `fad9f8dc` chore: remove dead getKeywords() + add discriminator logging
  - 1 file (raw-footage-processor.ts), 1 insertion, 33 deletions
  - Rule 1: removed dead getKeywords() function (28 LOC with 50-entry stop word list, from removed strategy 4)
  - Rule 16/18N: added console.log for discriminator INTENTIONAL/NARRATIVE_PIVOT decisions

### Grok STT + Speaker Diarization (Phase 2)
- `f0bac987` feat: Grok STT diarization + speaker-aware discriminator (Phase 2)
  - 2 files (transcription-service.ts, repetition-intent-discriminator.ts), 43 insertions, 2 deletions
  - Grok STT: added diarize=true param, prefer GCS signed URL over CDN proxy (fixes 400 "Could not detect audio format" error)
  - Discriminator: new hasDifferentSpeakers() check — if group contains segments from different speakers → INTENTIONAL (not a retake). Fixes C-09 Podcast profile (53/54 safe).

### Prosodic Signal Support (Phase 3)
- `10d604b7` feat: prosodic signal support in discriminator (Phase 3)
  - 1 file (repetition-intent-discriminator.ts), 32 insertions
  - Optional ProsodicFeatures[] parameter (energy, emotionIntensity, pitchVariability)
  - IDENTICAL + emotionDiff > 0.3 → RETAKE (acting takes, different emotional delivery). Targets A-08 profile.
  - AMBIGUOUS + energy monotonically increasing (+0.05/step) → INTENTIONAL (building emphasis)
  - Backward compatible: without Wav2Vec data, discriminator works as before (53/54)
  - NOTE: Wav2Vec data flow not yet wired from worker to discriminator. Prosodic features are accepted but not yet supplied at runtime.

## New Files Created
- `lib/editron/services/repetition-intent-discriminator.ts` — 260 LOC, the core intent classifier

## New Rules Added
- Rule 29 (Adversarial Option Testing) — added to CLAUDE.md. Trigger: 2+ options for solving a problem → MUST break each before choosing. Created after compound regex approach produced 106 false positives across 10 content types.

## Architecture Documentation
- `memory/mode2_editorial_architecture.md` — complete architecture doc with research findings, decision history, implementation phases, threshold sources, adversarial test records

## Key Decisions
1. Context enrichment KILLED — poisoned classifier when opening is meta-heavy
2. Compound regex rules KILLED — 106 false positives across 10 content types (Rule 29)
3. 5-layer architecture REDESIGNED — original had 96 FPs, 3/54 safe; replaced with discriminator
4. Nobody has solved intentional vs accidental repetition detection (verified exhaustive search 2026-05-10)
5. Completeness × variation × timing is the production discriminator (96.4% after fixes)

---

## Session: May 30, 2026 (8 commits) — MG Tier 3 real-data verification + bug fixes

- `ceb6ae8f` fix(editron): TRIBE idempotency guard — duplicate QStash delivery bails (tribe route, +25)
  - Upstash-Timeout reduced retry +2min→+6min but worker runs ~8min → 2nd worker still spawned → Modal contention → Wav2Vec abort. Atomic claim (updateOne, matchedCount===0 → bail 200), stale >15min reclaimable. One TRIBE run/project → V-JEPA+Wav2Vec complete.
- `8017a70a` fix(editron): MG monotony — per-frame signal injection into Path-E decisions (director-agent, +28/-1)
  - **THE monotony fix.** director-agent:607 assigned ONE flat video-level signalCtx to EVERY decision → identical MG treatment (confirmed 3 runs: visual_change_rate constant 0.497, complexity 3/5 on all). Now signalsAtFrame(d.frame) looks up the V-JEPA/Wav2Vec segment covering each decision frame and overrides per-moment signals (motionIntensity/visualSignificance→visceral_impact etc). Path D already per-frame; only Path E flat. Needs a run to confirm signals vary.
  - PROGRESS this run (proj_-BouQMiMnZf3): graphicsDensity/backdrop/unit fixes all live — 25 MGs, vjepa=true, backdrops paint, SFX fire. Residual was the flat-signal averaging (8017a70a) + the duplicate worker (ceb6ae8f).

- `14f9a0a1` fix(editron): QStash Upstash-Timeout needs a unit — '800'->'800s', '300'->'300s' (HTTP 400)
  - 2 files (video-analysis + media/upload routes), +6/-2. Pushed. **Corrects b83832c1** which shipped bare '800'.
  - QStash parses Upstash-Timeout as a Go duration requiring a unit; bare '800' → HTTP 400 "missing unit in duration" → broke the TRIBE dispatch entirely (user's auto-edit failed). Also fixed the pre-existing bare '300' in media/upload (asset-analysis dispatch, same latent bug).
  - LESSON (Rule 29N, 2nd miss this session): verified the magnitude (<=900s plan max) but NOT the format. Red flag missed: adjacent 'Upstash-Delay':'2s' used a unit while the timeout was bare — inconsistency should have triggered a format check. Codified in Rules-and-Constraints.

- `b83832c1` fix(editron): TRIBE worker double-fire — QStash Upstash-Timeout to match 8min runtime
  - 1 file (video-analysis/route.ts), +7. Pushed. **Root cause of the MONOTONY** (found via real run proj_l5q1RKJNgiYF logs).
  - tribe-analysis worker runs ~8min (V-JEPA/Wav2Vec GPU sync) but its QStash dispatch set no Upstash-Timeout → QStash's ~2min default fired → retried the still-running worker → 2 concurrent tribe workers (1 messageId, 2 starts +2min) → Modal GPU contention → V-JEPA/Wav2Vec abort → per-moment signals empty (vjepa=false) → every MG gets identical flat signals → monotonous keywords + duplicate Director/EDL. Fix: Upstash-Timeout=800 (≤ QStash free max 900s, verified via docs). Needs fresh run to confirm.
  - DEFERRED Phase 2 (belt-and-suspenders, not yet shipped): idempotency guard in tribe worker + partial-results (keep-half) in vjepa/wav2vec services. Hold until the timeout fix is confirmed insufficient.

- `5021666b` fix(editron): MG 0-graphics — thread graphicsDensity through the EDL graphic path
  - 1 file (edl-executor.ts), +5/-3. Pushed. **P0 found via real Mode-2 run logs (proj_XbI_NCq181A2, Rule 27).**
  - `graphicsDensity` is a param of executeEDL but applyDecision (:412) + applyGraphic (:1010, uses it :1092) never received it → ReferenceError on EVERY graphic → 0 motion-graphic overlays created (keywordGraphics 0/14, captionEmphasis 0/44). Regression from cfcad619. Fix threads it through both fn sigs + 3 call sites (:352/:440/:471). tsc clean (196), 112 MG tests pass. Graphics now reach planComposition (so the backdrop/fraction/label fixes finally execute) — needs a fresh run to confirm end-to-end.
  - LESSON: unit tests + harness call planComposition directly, bypassing executeEDL→applyDecision→applyGraphic. Only a real run hit it. Validates the handover's "#1 = real end-to-end" priority.

> GAP: commits 2026-05-11 → 05-29 (incl. the 8-commit MG Tier 3 arc `83a1debc`→`25371c4d`) are documented in
> their session handover files, NOT in this audit doc. This doc jumps May 10 → May 30. Roll over / backfill owed.

- `93ea08cb` chore(editron): remove dead code in composition-planner (unused import + params)
  - 1 file, +2/-3. Pushed. Removed unused MGKeyframeTrack import; `_`-prefixed two trailing unused `language` params
    (composeDataSeries, makeTextElement). composition-planner now eslint-clean (3→0). No behavior change. User-approved.

- `4eb80496` fix(editron): MG numeric stat rendering — fractions/suffixed values + legible labels
  - SIDE EFFECT: also fixed the long-standing test-integration-mg.ts "100M" failure → now 11/11 (100M is now numeric).
  - 2 files (content-shape-analyzer.ts, composition-planner.ts), +39/-5. Pushed to origin.
  - Bug 1: fraction/suffixed stat values ("1/3","100M","10x") failed hasNumericValue → empty free-text → BLANK graphic. Now numeric + STATIC render (count-up's parseFloat would mangle "1/3"→"1"); plain numbers still count-up. CRG technique:graphic.stat_counter (count-up|pop|fade; "count (10x)" valid format).
  - Bug 2: stat label + quote author had no minSize → fontSize undefined (~16px). CRG-floored (LOWER_THIRD_TITLE_MIN_FONT), same pattern as composeIdentity title.
  - Verified: 3 real "1/3 of people" stats (proj_FLiy/sKX/CGeI) now numeric not blank; 17/17 adversarial cases; 112 MG tests; tsc clean; 0 new eslint warnings. User-approved ("fix known bugs").
  - NOTE: 3 pre-existing eslint warnings remain in composition-planner (unused MGKeyframeTrack import + `language` params in composeDataSeries/makeTextElement) — unrelated dead code, flagged for separate cleanup.

- `5d2e1223` fix(editron): MG backdrop opacity — surfaceOpacity is under color, not surface
  - 2 files (structural-moves.ts, structural-gate.ts), +9/-4. Pushed to origin/infrastructure-improvs-+Editron.
  - Root cause: `moveBackdropCard` bound `token:surface.surfaceOpacity` and the gate read `tokens.surface.surfaceOpacity`;
    surfaceOpacity lives under `color` (MotionTokens.color). Undefined → applyOpacity emitted invalid `rgba(r,g,b,)`
    → backdrop_card (most-fired structural move, ~54% of real MGs) silently never painted; gate WCAG legibility check no-op'd.
  - Found via real-resolver render check on 108 real MGs (editron_prev). Verified: valid rgba(...,0.81), 112 MG tests, tsc clean (196 baseline), eslint clean.
  - Detail: vault `MG-Anchor-System-Tier3.md` "REAL-DATA VERIFICATION (2026-05-30)" + `session_handover_2026_05_30_mg_realdata_verification.md`. Found during a VERIFY sprint — see Rules-and-Constraints "Don't Edit Code During a Verification Sprint".
