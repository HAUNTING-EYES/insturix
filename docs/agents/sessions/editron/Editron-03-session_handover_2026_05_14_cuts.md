---
name: Session Handover 2026-05-14 (Complete)
description: COMPLETE handover — transcript editor, MP4 parser, cascade safety, eval pipeline, test procedures, open threads, all rules/docs/graphs referenced. READ THIS FIRST.
type: project
last_updated: 2026-05-14
originSessionId: 690ab707-2a82-484d-bb2f-aa2bfa1af88d
---
# Session Handover — 2026-05-14 (Complete)

## HOW TO TEST (Mode 2 Cut Quality)

### Test Video
- **Video:** Hank Green "Editing Challenge" vlog, 19.6 min (1175s), 2884 words
- **Upload:** Go to Vercel preview → UploaderX → upload video → wait for pipeline (~4 min)
- **Expected:** 9.2-9.5 min output, ~42 video overlays, <10% retake rate

### Verification Steps
1. Export Vercel logs (filter by `video-analysis` worker)
2. Check logs for:
   - `[Upload] Server-verified duration: 1172-1175s` ← MP4 parser working
   - `[TranscriptEditor] 2884 words → 44-48 keep-ranges, 57-58% kept` ← Gemini working
   - `[RawFootage] Plan (transcript-editor): 45-50 actions, 600-625s removed` ← plan correct
   - `[SilenceRemoval] Executed N actions... Duration: 35261 → ~16500 frames` ← executor working
   - NO `CASCADE DETECTED` ← safety net not needed (duration correct)
3. Query MongoDB: `db.editron_prev.projects.findOne({projectId: 'proj_xxx'})`
   - `durationInFrames / 30` should be 540-570s (9-9.5 min)
   - `rawFootageAnalysis.editMethod` should be `'transcript-editor'`
   - `rawFootageAnalysis.silenceRemovalPlan` should have ONLY `transcript-edit` reason
4. Check content: first clip should start around 11-23s (after preamble), last clip around 1165-1173s

### Local Eval (no deploy needed)
```bash
cd "D:\google downloads\Front-End-main\Front-End-main"
# Single seed test
GEMINI_API_KEY=AIzaSyAcc1pa4WuVp_9OuQQ2pCD-mkyxbMBsHH4 node scripts/prompt-optimization/eval-transcript-editor.mjs --seed=1
# Multi-seed variance test
GEMINI_API_KEY=AIzaSyAcc1pa4WuVp_9OuQQ2pCD-mkyxbMBsHH4 node scripts/prompt-optimization/eval-transcript-editor.mjs --multi-seed
# Synthetic eval (5 content types, 15 cases)
GEMINI_API_KEY=AIzaSyAcc1pa4WuVp_9OuQQ2pCD-mkyxbMBsHH4 node scripts/prompt-optimization/eval-transcript-editor.mjs --synthetic
```
- Expected: F1 >= 0.986 for all seeds, Mean F1 >= 0.99 for synthetic

### Test Data Locations
- Hank Green transcript: `scripts/prompt-optimization/hank-green-test-data.json` (2885 words)
- YouTube transcripts: `scripts/prompt-optimization/yt-transcripts/` (5 files: MKBHD, Ali Abdaal, Fireship, TED, interview)
- Synthetic eval cases: `scripts/prompt-optimization/eval-dataset-full.json` (15 cases)
- Stable ground truth project: `proj_Zy1RxaRTs3_s` in MongoDB `editron_prev`

### Known Good Projects (reference)
| Project | Duration | Clips | Status |
|---------|----------|-------|--------|
| `proj_Zy1RxaRTs3_s` | 9.3 min | 42 | STABLE reference |
| `proj_SW_51M35aHEx` | 9.8 min | 45 | Good |
| `proj_EvyJheVmSd4G` | 9.2 min | 42 | Latest (with MP4 parser) |

### Known Bad Projects (cascade failures)
| Project | Duration | Cause |
|---------|----------|-------|
| `proj_hK7-GZqJdBLo` | 3.2 min | Wrong initial duration (572s), cascade |
| `proj_KB6nDSo_cqhI` | 3.6 min | Wrong initial duration (549s), cascade |
| `proj_URiWTxYSSU27` | 2.4 min | Vision classifier cascade (19 gaps → 85 deleted) |

---

## CURRENT DEPLOYED STATE

**Branch:** `infrastructure-improvs-+Editron` at `41e5fb49`
**Deploy:** Vercel preview auto-deploy from this branch

### Pipeline:
```
Upload → MP4 moov parser (server-side duration) → media_assets
                                                        ↓
from-asset → project (correct durationInFrames) → QStash worker
                                                        ↓
Grok STT (cached) → Transcript Editor (Gemini 3.1 Pro, seed=1)
                                                        ↓
Keep-ranges → Removal plan (transcript-edit ONLY)
                                                        ↓
Cascade safety net check → Silence removal executor
                                                        ↓
Director Agent (filter, transitions, captions, SFX, keyframes)
```

---

## WHAT'S LEFT (7 open threads)

### P0: Cascade Root Cause
Safety net fires as false positive — `original=16482 frames` vs `planRemoves=18649 frames`. The from-asset route creates the overlay with 549s despite `asset.duration=1172.84s`. Race condition between upload route (stores verified duration) and from-asset route (reads it). Safety net catches it and aborts, but the mismatch shouldn't happen.

**Files:** `app/api/services/editron/auto-edit/from-asset/route.ts:88`, `app/api/services/editron/media/upload/route.ts`

### P0: Vision Silence Classifier
Parked because executor cascade-deletes when vision adds removals on top of transcript-edit removals. R2 URI fix is deployed (`geminiFileUri` now stored on syntheticStoryboard).

**Three approaches:**
- A) Multimodal transcript editor (add video to Gemini call, 1-hour video limit)
- B) Fix executor for multi-source removals (architectural change)
- C) Separate trim-in-place function (user rejected as not production-grade)

**Files:** `lib/editron/services/silence-vision-classifier.ts` (deleted, in git history at `69ee2be2`)

### P1: Transitions All Dissolve
EDL fix (`dab19de3`) changed Mode 2 from hardcoded `hard-cut` to `undefined`. Continuity scoring now decides — but for single-camera talking head, ALL boundaries get dissolve. Wrong.

**Fix:** Single-source detection should suppress transitions entirely (same as old behavior but from continuity scoring, not hardcoding). Multi-camera/multi-location should get intelligent transitions.

**Files:** `lib/editron/agent/director-agent.ts:1443-1488`, `lib/editron/services/continuity-service.ts`

### P1: SFX on Mode 2
Director places whoosh sounds on transitions: `[TransitionSFX] Placed whoosh (A-001) for dissolve @ frame 469`. For single-camera talking head, no SFX should be added.

**Fix:** Gate SFX on content type + single-source detection.

### P1: Keyframes on Mode 2
Director applies zoom punches, camera shake, speed changes to raw footage segments. For Mode 2 (user's own footage), these creative effects are inappropriate — the user uploaded their footage as-is.

**Fix:** Disable or heavily restrict creative effects in Mode 2. Only apply filter (color grade) and captions.

### P2: Prompt Audit (12 remaining)
Transcript editor prompt was optimized with Rule 35 (XML, data-last, seed, eval). 12 other prompts need the same treatment:
- `editorial-intent-detector.ts` (fallback)
- `video-understanding-service.ts`
- `five-track-analysis.ts` (2 prompts)
- `llm-scene-parser.ts`
- `reference-content-extractor.ts`
- `style-transfer-service.ts`
- `consistency-scoring-service.ts`
- `motion-graphics-service.ts`
- `agent/tools.ts` (35+ tools)

### P2: Eval Pipeline
Scripts exist in git history but were lost in force rollback. Need to re-add:
- `scripts/prompt-optimization/generate-eval-data.mjs`
- `scripts/prompt-optimization/eval-dataset.json` + `eval-dataset-full.json`
- `scripts/prompt-optimization/yt-transcripts/` (5 files)
- Commit `af95a3e9` or `ae6869de` in git history has them

---

## RULES TO FOLLOW

### Rule 35: Prompt Engineering Methodology (NEW this session)
Full doc: `memory/prompt_engineering_methodology.md`
1. XML delimiters (`<role>`, `<task>`, `<rules>`, `<output_format>`, `<input_data>`)
2. Data LAST (large input at end of prompt, not middle)
3. Rules over examples (examples cause pattern anchoring)
4. Narrow rules ("ONLY CUT these 4 patterns" not "remove unnecessary")
5. Conservative default ("when unsure, KEEP")
6. Seed parameter (ALWAYS set `generationConfig.seed`)
7. Eval harness FIRST (build local test before deploying)
8. Multi-seed test (run seeds 1-10, min F1 > 0.85 = robust)

### Other Critical Rules
- **R18N:** Deterministic where possible. Seed, temperature 0.0, fail loud.
- **R0:** Universal content compatibility. Must work for vlogs, tutorials, interviews, product demos, corporate.
- **R2N:** No fallbacks as solutions. Cascade safety net is defense-in-depth, not the fix.
- **R23N:** Never MVP. The MP4 parser is the production fix, not a band-aid.
- **R10N:** No assumptions. Verify with actual data, not memory.
- **R27:** Logs before theory. Read the actual logs before forming hypotheses.

---

## DOCS TO READ

| Doc | Path | What |
|-----|------|------|
| **Memory index** | `memory/MEMORY.md` | Start here — links to everything |
| **Agent rules** | `memory/AGENT_RULES.md` | 30+ mandatory rules |
| **Insturix vision** | `memory/insturix_vision.md` | North star — Adobe/DaVinci replacement |
| **Prompt methodology** | `memory/prompt_engineering_methodology.md` | Rule 35 — proven process |
| **Stable state** | `memory/stable_transcript_editor_v1.md` | Commit 78f39365, the reference |
| **Architecture** | `memory/editron_architecture_truth.md` | System state, ROW layout |
| **Master remaining** | `memory/editron_master_remaining.md` | Open bugs, priorities |
| **Mode 2 architecture** | `memory/project_mode2_signal_architecture.md` | Signal-driven, no profiles |

---

## GRAPHS TO QUERY

| Graph | Path | When |
|-------|------|------|
| **Creative Knowledge Graph** | `lib/editron/data/creative-knowledge-graph.json` | Before any creative decision (transitions, zoom, SFX, pacing) |
| **Part files** | `lib/editron/data/creative-graph-parts/` | 7 JSON files, one per Part |
| **Merge script** | `lib/editron/data/merge-graph.mjs` | To rebuild after edits |

Query pattern: `grep -i "transition\|zoom\|sfx\|pacing" creative-knowledge-graph.json`

---

## TEST RESULTS LOG

### Transcript Editor (Hank Green, seed=1)
```
F1=1.000 | Precision=1.000 | Recall=1.000 | Kept=57.5% | 46 ranges
```

### Multi-Seed Variance (seeds 1-10)
```
All seeds: F1 >= 0.986 | 5/10 perfect (1.000) | 5/10 at 0.986
Min=0.986 | Max=1.000 | Zero bad runs
```

### Synthetic Eval (15 cases, 5 content types)
```
Mean F1=0.9934 | Min F1=0.9855 | All 15 PASS (>0.85)
Ali Abdaal: 0.989-0.993 | Fireship: 0.994-1.000 | Interview: 0.991-0.996
MKBHD: 0.993-0.997 | TED Talk: 0.986-0.995
```

### Duration Fix Verification
```
[Upload] Server-verified duration: 1172.8s for upload_7NqtQPMgHIFm
media_assets.duration: 1172.84s (correct, was 572s before fix)
```

---

## COMMITS (12 on infrastructure-improvs-+Editron)

| # | SHA | Description |
|---|-----|-------------|
| 1 | `a124a520` | feat: word-level transcript editor |
| 2 | `54ab2236` | fix: don't merge silence/filler when transcript-editor active |
| 3 | `c7eac148` | fix: narrow prompt — cut retakes only |
| 4 | `841070f9` | fix: Gemini 3 guide — XML, data-last, CoT |
| 5 | `78f39365` | fix: remove few-shot examples (**STABLE MARKER**) |
| 6 | `8c28a652` | revert: vision classifier |
| 7 | `00fbb28d` | fix: seed=42 |
| 8 | `a2b7edbb` | fix: seed=1 + eval harness |
| 9 | `b68658fc` | fix: cascade safety net |
| 10 | `dab19de3` | fix: EDL transitions use continuity |
| 11 | `70129b0b` | fix: cascade safety net bypass |
| 12 | `41e5fb49` | feat: MP4 moov atom parser |
