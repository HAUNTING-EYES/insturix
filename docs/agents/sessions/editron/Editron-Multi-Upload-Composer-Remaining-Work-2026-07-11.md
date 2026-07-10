# Editron Multi-Upload + Composer Remaining Work - 2026-07-11

This note reconciles the July 9/10 task distribution and composer handoffs against the current code. It is meant to be the short operational source for what remains after the current multi-file/composer wiring pass.

## Current Verified Flow

New project upload UI:

- `components/editron/project/new-project-flow.tsx` accepts `video/*,image/*` with `multiple`.
- One selected video still goes through the single-video auto-edit path.
- Multiple files, or image-only/image+video selections, open `FootageBatchIntakeDialog`.
- The intake dialog currently asks for platform, aspect ratio, expected output, optional script/outline, and music direction.

Batch project creation:

- `hooks/editron/use-footage-auto-edit.ts` calls `uploadMediaFiles(...)`, polls the upload batch, then calls `createProjectFromMediaUploadBatch(...)`.
- `app/api/services/editron/auto-edit/from-batch/route.ts` builds one or more deliverable projects from the batch and returns:
  - `projectId` for the primary generated project.
  - `projectIds` for all generated projects.
  - `deliverables` with per-deliverable project ids and worker message ids.

Important UI gap:

- The UI currently opens only `batchProject.projectId`.
- That means additional generated edits returned in `projectIds` / `deliverables` can exist, but the user is not shown a selectable list of those generated edits.
- Production behavior should show generated deliverable cards with status, label, format, and project link, while keeping the primary project as the default open action.

Composer wiring:

- The batch route now passes source scenes, image scenes, embedded scenes, language, target duration, embedding scorer, and per-source signal timelines into the composer/orderer path.
- The bridge now preserves real V-JEPA, Wav2Vec, and moment-weight fields when upstream analysis provides them.
- The bridge no longer invents confidence as `finalWeight` when it only has a fallback proxy.
- OCR can be recovered from keyframe subject/logo labels when available.

## Why Batch Analysis Is Different Today

The batch upload worker is not the same as the full single-project analysis path.

Current batch worker:

- `app/api/internal/workers/asset-analysis/route.ts`
- Built for media-library readiness: duration, 5-track/keyframe summary, tags, semantic embedding, graph enrichment.
- Does not currently run the full project-level V-JEPA, Wav2Vec, moment-weight map, or `buildSegmentAnalysis` pipeline.

Current rich project analysis:

- `app/api/internal/workers/video-analysis/route.ts`
- `app/api/internal/workers/tribe-analysis/route.ts`
- Runs or wires V-JEPA, Wav2Vec, music analysis, moment weights, and full segment analysis before Director decisions.

So yes, batch can run the same richer analysis async. It should not run synchronously inside upload completion. The production version is:

1. Upload files and create media assets quickly.
2. Queue one deep-analysis job per video asset.
3. Store results per asset in asset analysis storage, keyed by project/batch/asset id.
4. Track status, retries, degraded mode, and credit/time costs.
5. Let the composer use rich fields when ready and honest fallbacks when not ready.

That keeps multi-upload responsive while still allowing visual/audio/moment intelligence to power sequencing, B-roll selection, and repurposing.

## How Multi-Asset Sequencing Should Work

The intended logic is not "concatenate files in upload order."

The production flow should be:

1. Intake captures user intent: output type, target duration, aspect ratio, platform, optional script/outline, references, music/BGM intent, and priority constraints.
2. Pre-analysis feasibility checks run early:
   - total usable duration vs requested duration;
   - asset types available;
   - language/script availability;
   - aspect-ratio conflicts;
   - whether requested output needs talking-head, B-roll, images, product shots, screen recordings, or music sync.
3. Each asset is analyzed separately:
   - visual segments;
   - transcript and word timings where speech exists;
   - OCR/text-on-screen;
   - audio energy/prosody/music/beat information;
   - semantic tags;
   - V-JEPA/motion/subject/spatial primitives when available.
4. The composer builds candidate scenes from every asset.
5. The planner orders scenes against user intent, script, brand, rhythm, and source evidence.
6. Director/Lambda receives a concrete timeline with source asset ids and time ranges, not just a single primary asset.

For BGM or music-driven videos, the selected music track should become a timing signal. Beat grid, downbeats, silence pockets, and energy changes should influence cut placement, transition timing, SFX restraint, and B-roll sequencing.

## Remaining Work

### Multi-Upload Product And UI

1. Show all generated deliverables from `projectIds` / `deliverables` in the UI.
2. Add a post-batch completion view with selectable generated edits.
3. Make per-deliverable status visible: queued, analyzing, director running, ready, failed, degraded.
4. Add retry per failed deliverable without rerunning the whole batch.
5. Add UI support for optional script/outline and references as first-class inputs.
6. Add UI language/Hinglish expectations and caption style preferences.
7. Add UI handling for user-provided music/BGM as an asset with timing influence.

### Batch Analysis Parity

1. Add async deep-analysis jobs for batch video assets.
2. Persist V-JEPA, Wav2Vec, moment-weight map, segment analysis, OCR, and language per asset.
3. Keep asset analysis storage outside the main project document to avoid Mongo document bloat.
4. Make the batch bridge prefer real per-asset fields over synthesized fallbacks.
5. Persist degraded-analysis reasons so a thin result is explainable.
6. Add idempotency and retry safety for per-asset deep analysis.

### Composer To Director/Lambda Handoff

1. Ensure Storyline output becomes actual Director/Lambda timeline output for multi-source projects.
2. Preserve source asset id, source time range, role, reason, link-from-previous, and intended transition/motion hints.
3. Verify Director reads Storyline `role` and `linkFromPrev` instead of discarding them.
4. Verify multiple deliverable projects dispatch Director jobs and save overlays independently.
5. Add contract tests for Storyline -> Director -> project timeline.

### Visual/VLM Cutting

1. Treat visual analysis as a second evidence source, not a simple "still frame equals bad" rule.
2. For voice-heavy videos, build the VO cut first, then run visual checks once to catch visual dead zones, broken shots, wrong B-roll, AI-slop segments, or missing visual support.
3. For visual-only or low-speech videos, visual/motion/music evidence becomes primary.
4. Cutting decisions should use evidence bundles: speech, visual change, subject action, text-on-screen, beat grid, semantic relevance, user intent, and brand/context.
5. Add acceptance fixtures for talking-head, B-roll montage, product demo, screen recording, image-heavy story, music-driven edit, and Hinglish speech.

### Music And BGM

1. Treat user-provided music as an analyzable source asset.
2. Extract beat grid, energy curve, downbeats, phrase changes, and silence pockets.
3. Let music timing influence cuts, transitions, SFX allowance, and B-roll pacing when the requested output benefits from music sync.
4. Avoid forcing music sync onto VO-led talking-head edits unless user intent asks for it.

### Known Live Bugs And Conflicts

1. MP4 duration/moov parsing still needs hardening for broken or non-faststart files.
2. Gemini Files 90s polling timeout still needs production handling.
3. Neo4j/Graph sync must be verified live now that infrastructure is back up.
4. Embedding model work must not be a blind model swap. Verify TS and Python Graphiti paths preserve 768-dimensional vectors, then handle null/backfill vectors safely.
5. Chapter concat is code-built but still needs live-deploy and real long-render smoke proof before calling it operationally complete.
6. `done in code` and `done live` must remain separate statuses.

### Remaining Master Plan Items

1. P0/P12/P15 loop: rendered truth artifacts, gate teeth, and calibration remain the quality spine.
2. Full rendered aesthetic judging is still not final hard truth.
3. Calibration remains last, after authority, render truth, and quality gates are reliable.
4. Path E/D authority is improved, but any remaining executable authority loopholes must be checked against live projects.
5. Rule-11 generative MG form remains a core creative frontier.
6. Fable audit items still open unless separately verified in code: color render writer, match-cut executor, visual system consolidation, graph-sync executor teeth, choreography shaper, and MG residuals.
7. Seam contract-test harness is still needed for Claude/Codex handoff boundaries.
8. Rename or disambiguate the overloaded `tier` meanings.

## Practical Next Step

The next Codex implementation slice should be one of:

1. UI deliverable selection after multi-batch generation.
2. Batch deep-analysis parity as async per-asset jobs.
3. Storyline -> Director/Lambda contract hardening.

Do not start calibration or broad MG polish before those seams are proven with real multi-file projects.
