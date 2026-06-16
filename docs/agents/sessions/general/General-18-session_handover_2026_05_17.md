---
name: Session Handover 2026-05-17 (Pipeline Infrastructure + Mode 2 Quality Investigation)
description: Two-stage QStash pipeline fixes, recovery cron gap, geminiFileUri chain, Mode 2 output quality investigation (proj_zZ + proj_1n)
type: project
originSessionId: be5bc4d2-8589-4489-964e-3a6ee8979452
---
# Session Handover -- 2026-05-17

## TL;DR

Pipeline infrastructure is now solid: two-stage QStash split works, recovery cron catches stuck auto-edits, geminiFileUri resolves reliably. The real problem exposed this session is **Director output quality on Mode 2** -- projects "complete" successfully but produce garbage video (zero transitions, zero audio mixing, edits only in CSS filters/keyframes, quality review scores 8/10 on bare video). Infrastructure was necessary scaffolding; the creative output engine is the actual bottleneck.

---

## Commits This Session

| Commit | What | Why |
|--------|------|-----|
| `7ff4a804` | Two-stage QStash pipeline split (video-analysis + director workers) | 20-min video analysis + directing exceeded 800s Vercel limit. proj_YH4AyxeGMWvY placed 31 transitions then died -- captions, zooms, quality review never ran. Split guarantees both stages complete with headroom. |
| `11daeafd` | Director worker: fix totalMs variable name + bandit outcome recording | `totalMs` was used before assignment. Bandit recording skipped on >5 critical issues (system failure, not content quality). |
| `91dc8cf0` | 3 bug fixes: geminiFileUri chain, recovery cron gap, early-return fix | See "Bugs Fixed" section below. |

### Parallel Commits (same branch, other work)

12 additional commits on `infrastructure-improvs-+Editron` from earlier in the day, including:
- Bleed-through fixes for Mode 2 transitions
- Repetition intent discriminator (3 phases)
- Grok STT diarization support
- Prosodic analysis support
- Various lint and type fixes

---

## Infrastructure Changes

### 1. Two-Stage QStash Pipeline

```
User triggers auto-edit
  -> POST /api/internal/workers/video-analysis (Stage 1, 300s max)
      Transcription -> Cuts -> VU -> V-JEPA + Wav2Vec -> store to MongoDB
      -> QStash publishes to Stage 2
  -> POST /api/internal/workers/director (Stage 2, 300s max)
      Profile detection -> Creative Brief -> Director execution -> Quality review
      -> Mark complete
```

**Why split**: A single function for both stages died at 800s on long videos. Stage 1 is I/O-heavy (file uploads, model inference). Stage 2 is LLM-heavy (Gemini calls). Each now has 300s headroom independently.

**Key files**:
- `app/api/internal/workers/video-analysis/route.ts` -- Stage 1
- `app/api/internal/workers/director/route.ts` -- Stage 2

### 2. Recovery Cron Fix

**Before**: `app/api/cron/recover-stuck-projects/route.ts` only checked the `status` field (scripting, generating, editing, etc). The `autoEditStatus` field (queued, analyzing, directing, etc) was invisible to recovery. A Vercel timeout during Stage 2 left projects permanently stuck -- the error handler never runs when the function is killed.

**After**: Cron now checks BOTH fields:
- `status` stuck >30 minutes -> transition to `failed`
- `autoEditStatus` stuck >10 minutes -> set to `failed` with error message

**Active auto-edit states recovered**: `queued`, `analyzing`, `computing_params`, `analyzing_deep`, `analysis_complete`, `directing_queued`, `directing`

### 3. geminiFileUri Resolution Chain

**Before**: Director looked for geminiFileUri in 2 places:
1. `projectDoc._vuGeminiFileUri` (set by VU service)
2. `projectDoc.syntheticStoryboard.geminiFileUri` (nested in storyboard)

**Problem**: If VU ran but storyboard wasn't fully populated, or if the field name changed between services, the URI was lost. Creative Brief then ran without video context -- producing generic, content-blind editing decisions.

**After**: 3-level fallback chain + denormalization:
1. `projectDoc._vuGeminiFileUri` (VU service direct)
2. `projectDoc.geminiFileUri` (NEW: root-level denormalized copy, set during Stage 1 MongoDB store)
3. `projectDoc.syntheticStoryboard.geminiFileUri` (nested fallback)

**Files changed**:
- `lib/editron/agent/director-agent.ts:375-377` -- added root-level to fallback
- `app/api/internal/workers/video-analysis/route.ts:438` -- denormalize to root during Stage 1

---

## Investigation: proj_zZ-iR6OZcbBY

**Symptom**: Project stuck in `autoEditStatus: 'directing'` forever after Vercel timeout.

**Root cause chain**:
1. Stage 2 (Director) started executing
2. Hit Vercel's 300s timeout mid-execution
3. Vercel kills the function -- `catch` block never runs
4. `autoEditStatus` remains `directing` permanently
5. Recovery cron only checked `status` field -- never saw this project
6. Project stuck forever with no recovery path

**Fix**: Recovery cron now checks `autoEditStatus` with 10-minute threshold.

**Manual reset needed** (this specific project is still stuck):
```javascript
db.projects.updateOne(
  { projectId: 'proj_zZ-iR6OZcbBY' },
  { $set: {
    autoEditStatus: 'failed',
    autoEditError: 'Manual reset: stuck in directing after Vercel timeout (2026-05-17)'
  }}
)
```

---

## Investigation: proj_1nzETeCiCUmF

**Symptom**: `autoEditStatus: 'complete'`, quality review scored 8/10 with 0 critical issues. But the output video is garbage -- bare cuts, no transitions, no audio mixing, no meaningful editing.

**Deep inspection findings**:

| Metric | Value | Assessment |
|--------|-------|------------|
| Segments | 197 | Normal for ~10min video |
| Total words (transcript) | 2,878 | Good coverage |
| Scenes in syntheticStoryboard | 0 | BAD -- storyboard empty |
| V-JEPA results | Missing | BAD -- no motion understanding |
| Content type | `interview` (storyboard) vs `vlog` (VU) | Conflict |
| Transitions applied | 0 (all `type: "none"`) | BAD |
| Audio mixing | None visible | BAD |
| Quality review score | 8/10, 0 critical | WRONG -- miscalibrated |
| Quality review issues | 64 total (warnings + info) | Ignored by score |

**Where edits actually live** (important architectural note):
- Edits are NOT in `overlay.transition.type` or `overlay.zoom.type` (these are "none")
- Edits ARE in `overlay.styles.filter` (CSS color grading, e.g. `brightness(1.05) contrast(1.03)`)
- Edits ARE in `overlay.keyframeTracks` (scale animations for zoom effects)
- This means the "zero edits" assessment was initially wrong -- some basic color/zoom edits exist, but NO transitions and NO audio

**Root causes** (5 interconnected):

1. **0 scenes in syntheticStoryboard**: VU produced segments but storyboard generation failed or was skipped. Creative Brief has no scene structure to work with.

2. **V-JEPA missing**: No motion understanding data. Director can't make motion-aware decisions (when to cut on action, where motion peaks are).

3. **Content type conflict**: VU classified as `vlog`, storyboard says `interview`. Different content types have fundamentally different editing approaches. Conflict means neither approach is applied correctly.

4. **EDL constraint enforcer kills decisions**: Previously documented (session_handover_2026_05_16.md) -- constraint enforcer rejects 87/92 editing decisions. The few that survive are basic color corrections.

5. **Quality review miscalibrated**: Scores 8/10 with 0 critical on a video that has zero transitions and zero audio mixing. The review checks for technical errors (frame drift, invalid values) but not creative quality (does this look professionally edited?).

---

## Open Bugs (Priority Order)

### P0: Director Output Quality on Mode 2
- **What**: Projects complete but output is unwatchable. Zero transitions, zero audio, minimal editing.
- **Root cause**: EDL constraint enforcer kills nearly all decisions. Creative Brief without scene data produces generic instructions. V-JEPA missing removes motion intelligence.
- **Impact**: Mode 2 is functionally broken despite "completing successfully"
- **Fix direction**: Need to investigate WHY constraint enforcer rejects decisions. Are constraints too strict? Are decisions malformed? Is the issue in Creative Brief output or in constraint definitions?

### P1: Quality Review Miscalibration
- **What**: Scores 8/10 with 0 critical on bare video
- **Impact**: No signal that output is bad. Dashboard shows green when it should show red.
- **Fix direction**: Add creative quality checks (transition count vs expected, audio mixing presence, edit density vs profile target)

### P2: V-JEPA Unreliable
- **What**: V-JEPA results missing on proj_1nzETeCiCUmF despite pipeline "completing"
- **Impact**: No motion understanding -> Director can't make motion-aware editing decisions
- **Fix direction**: Check V-JEPA worker logs, verify it's being called, add fallback when missing

### P3: Content Type Conflict (interview vs vlog)
- **What**: VU and storyboard disagree on content type
- **Impact**: Wrong editing profile applied, wrong pacing, wrong transition style
- **Fix direction**: Single authoritative content type source, or conflict resolution logic

### P4: 0 Scenes in syntheticStoryboard
- **What**: Storyboard has segments but 0 scenes
- **Impact**: Creative Brief has no scene structure, produces generic instructions
- **Fix direction**: Investigate storyboard generation in Stage 1 -- is scene extraction failing silently?

### P5: proj_zZ-iR6OZcbBY Still Stuck
- **What**: Still in `autoEditStatus: 'directing'` -- needs manual MongoDB reset
- **Impact**: User can't retry
- **Fix**: Manual reset command above. Future occurrences will be caught by updated cron.

---

## Phase Plan Status

Reference: `memory/mode2_phased_plan_2026_05_14.md`

| Phase | Status | Notes |
|-------|--------|-------|
| 1A: Core restructuring | DONE | Cuts-first architecture |
| 1B: Segment-level analysis | DONE | Per-segment results |
| 1C: Profile removal | DONE | Content-driven, not profile-driven |
| 1D: Quality gates | NOT STARTED | Blocked by quality review miscalibration |
| 2: Pipeline infrastructure | DONE | QStash split, recovery cron, geminiFileUri |
| 3: Creative Brief (Path E) | PARTIAL | Brief generates but output quality is garbage |
| 4: Gemma 4 fine-tuning | NOT STARTED | Training data collection not begun |
| 5A-5B: Architecture restructuring | DONE | Shipped 2026-05-16 |
| NEW: Director quality | NOT STARTED | Needed -- investigate constraint enforcer, Creative Brief output, V-JEPA integration |

---

## Deployment State

- **Preview (Vercel)**: Has all changes from this session. `USE_CREATIVE_BRIEF=true` confirmed set (Production + Preview).
- **Production**: Needs merge to `main` from `infrastructure-improvs-+Editron` branch. Not yet pushed to origin/main.
- **Environment**: `QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY` set on Vercel. QStash endpoints configured.
- **MongoDB**: Preview uses `editron_prev` (104 projects). Production uses `editron_prod` (21 projects). Do NOT use `insturix_preview` or `insturix_prod` (legacy).

---

## Key Files Changed This Session

| File | Lines | Change |
|------|-------|--------|
| `app/api/cron/recover-stuck-projects/route.ts` | 123 | Added autoEditStatus recovery (10-min threshold, CAS-protected) |
| `app/api/internal/workers/video-analysis/route.ts` | ~600 | Stage 1 worker (previous session) + geminiFileUri denormalization |
| `app/api/internal/workers/director/route.ts` | 209 | Stage 2 worker (previous session) + totalMs fix + bandit recording |
| `lib/editron/agent/director-agent.ts` | ~800 | geminiFileUri 3-level fallback chain |
| `lib/editron/services/creative-brief.ts` | ~300 | Takes geminiFileUri as param (unchanged, investigated) |
| `lib/editron/services/video-understanding-service.ts` | ~400 | Stores geminiFileUri (unchanged, investigated) |
| `lib/shared/project-status.ts` | ~150 | transitionProjectStatus manages `status` only, not `autoEditStatus` (unchanged, investigated) |

---

## Architecture Notes for Next Session

### autoEditStatus vs status
Two completely separate MongoDB fields on the project document:
- `status`: Project lifecycle (scripting -> storyboarding -> generating -> editing -> reviewing -> rendering -> complete/failed). Managed by `transitionProjectStatus()` with state machine validation.
- `autoEditStatus`: Auto-edit pipeline (queued -> analyzing -> computing_params -> analyzing_deep -> analysis_complete -> directing_queued -> directing -> complete/failed). Managed by direct `$set` operations in worker routes. No state machine.

### Overlay Edit Schema
Edits are stored in overlay objects, but NOT where you'd first look:
- `overlay.transition.type` = "none" does NOT mean no transition was applied
- `overlay.styles.filter` = CSS filter string for color grading (e.g., `brightness(1.05) contrast(1.03)`)
- `overlay.keyframeTracks` = array of scale/position animations (zoom effects)
- Check BOTH before concluding "zero edits"

### USE_CREATIVE_BRIEF
- `true` (current): Path E -- one Creative Brief Gemini call per project, then Director executes plan
- `false`: Path D -- per-asset 5-Track analysis, N Gemini calls (old path)
- Set on Vercel for both Production and Preview environments

---

## Rules Reinforced This Session

1. **Check the right DB name**: `editron_prev` for preview, `editron_prod` for production. NOT `insturix_*`.
2. **Logs before theory** (Rule 27): When investigating a project, check MongoDB state FIRST, then form hypotheses.
3. **Quality review is lying**: 8/10 with 0 critical on bare video. Don't trust the score -- inspect the actual overlay data.
4. **autoEditStatus is invisible to most tooling**: `transitionProjectStatus` doesn't touch it. Dashboard may not show it. Recovery cron didn't check it (now fixed). Always query both fields.
5. **Overlay edits live in styles.filter and keyframeTracks**: Not in transition.type or zoom.type. Check the right fields.

---

## Recommended Next Steps (Priority Order)

1. **Reset proj_zZ-iR6OZcbBY** -- manual MongoDB command above. 2 minutes.

2. **Investigate EDL constraint enforcer** -- Why does it kill 87/92 decisions? Are constraints too strict for Mode 2 content? Are Creative Brief decisions malformed? Is the issue in Creative Brief output or in constraint definitions?
   - Start at: `lib/editron/agent/director-agent.ts` (constraint enforcer section)
   - Cross-reference: `memory/investigation_mode1_mode2_2026_05_16.md` (EDL kill chain analysis)

3. **Fix quality review calibration** -- Add creative quality checks: transition density, audio mixing presence, edit density vs profile expectations. A project with 0 transitions should NEVER score 8/10.

4. **Investigate V-JEPA failures** -- Why is it missing on completed projects? Silent failure in Stage 1? Check worker logs for V-JEPA errors.

5. **Phase 1D: Quality gates** -- Can't build meaningful gates until quality review is calibrated (step 3).

6. **Merge to main** -- Infrastructure fixes are solid and tested. Should be merged to production.
