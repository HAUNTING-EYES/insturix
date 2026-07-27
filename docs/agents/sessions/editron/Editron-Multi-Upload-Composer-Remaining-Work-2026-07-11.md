# Editron Multi-Upload + Composer Remaining Work - 2026-07-11

This note reconciles the July 9/10 task distribution and composer handoffs against current code.

## Product Invariant

One request creates exactly one video project. A request may contain many source videos and images, but it has one user-selected output specification and one resulting Editron project.

`app/api/services/editron/auto-edit/from-batch/route.ts` rejects plural output fields before credits, project creation, analysis bridging, or Director dispatch. The route no longer returns `projectIds` or `deliverables`, and it clears stale plural batch metadata when creating the single project.

## Current Verified Flow

- `new-project-flow.tsx` accepts multiple videos/images.
- A single video uses `AutoEditDialog`; multiple files or image-containing selections use `FootageBatchIntakeDialog`.
- The batch intake currently asks for platform, aspect ratio, output intent, optional script/outline, and music direction.
- `use-footage-auto-edit.ts` uploads every source, waits for analysis, then calls the singular `from-batch` route.
- The route passes video scenes, image scenes, embeddings, language, target duration, and per-source signal timelines into the storyline orderer.
- The resulting storyline is materialized into one project's overlays, persisted, and dispatched once to Director.
- Source asset id/range, role, and `linkFromPrev` survive on materialized clips.

## Current Analysis Truth

Batch videos now have a two-stage worker path:

1. `asset-analysis` performs media-library/base analysis and queues deep analysis.
2. `asset-deep-analysis` runs full-duration V-JEPA, music analysis, moment weighting, and segment analysis, then marks the asset complete or degraded.

The bridge preserves real V-JEPA, Wav2Vec, OCR, moment-weight, language, and word-timing fields when present. It does not fabricate missing importance or vocal evidence.

Remaining parity gap: Wav2Vec currently runs only when upstream `speechSegments` exist. Long or unknown-duration assets can skip the ingest-time 5-track pass, leaving no durable transcript/speech windows. They still receive V-JEPA and music analysis, but speech understanding remains unknown until a durable transcription stage is added.

## Remaining Work

### P0 - One-Output Product And Intake

1. Keep one output specification and one project as a permanent route invariant.
2. Add explicit target duration, language/Hinglish mode, references, per-asset roles/priority/do-not-use, and user-provided BGM/audio to intake.
3. Add pre-analysis feasibility: source duration, script coverage, aspect/resolution conflicts, language/provider risk, and requested-output feasibility.
4. Keep per-asset retry/status UX; do not add generated-deliverable selection.

### P1 - Durable Batch Orchestration

1. Replace the browser's fixed ~96-second polling window with durable server-owned orchestration. The deep worker can run for up to 300 seconds, while `from-batch` correctly returns 409 while assets are still analyzing.
2. Add a durable per-asset transcription stage before Wav2Vec for long/unknown-duration video and audio.
3. Persist transcript language, words, speech segments, retries, provider status, and degradation reasons outside the project document.
4. Trigger storyline/project creation exactly once when the batch reaches a terminal usable state.
5. Prove idempotency across duplicate QStash delivery, worker retry, and browser refresh.

### P2 - Multi-Asset Planning And VLM

1. Wire the existing moment-planning actions into the normal batch route where user intent/script requires them: retain, trim, split, reorder, repurpose as b-roll/proof, or request coverage.
2. Keep VLM/V-JEPA as timecoded evidence, not a direct verdict.
3. Add fixtures for VO-heavy, visual-only, static talking head, silent demo, image-heavy, music-driven, Hinglish, and artifact-heavy footage.
4. Persist why each source range was selected, omitted, or repurposed.

### P3 - Music And BGM

1. Accept user-provided audio/BGM as a first-class batch asset.
2. Extract beat grid, downbeats, phrase/energy changes, and silence pockets.
3. Let music affect cuts, transitions, SFX restraint, and b-roll pacing only when user intent and content structure license it.
4. Keep VO-led edits speech-led unless the user asks for music-driven cutting.

### P4 - Storyline To Render Proof

1. Run a real preview with multiple source assets and verify one project is created.
2. Verify the saved source ranges, roles, ordering, transitions, captions, audio, and final Lambda pixels/audio match the storyline.
3. Add an end-to-end Storyline -> Director -> persisted timeline -> Lambda contract fixture.
4. Keep code-complete and live-proven statuses separate.

### Master Plan Still Open

1. P0/P12/P15: rendered truth, gate teeth, and holdout calibration.
2. P2: normalize/calibrate importance versus execution confidence.
3. P3: rendered caption proof and calibration.
4. P4: visual-heavy/visual-only proof and calibrated visual thresholds.
5. P7: SFX provider depth, non-transition roles, and live BGM proof.
6. P9-P11: MG form breadth, expression/stage/family hardening with rendered evidence.
7. P13: rendered choreography timing/collision proof.
8. P16: real per-brand edit-feedback learning.
9. Operational proof: embedding backfill, chapter concat on a real long render, Neo4j/Graphiti, and deployed Remotion bundle parity.

## Next Implementation Slice

Build durable batch orchestration and transcription parity. Do not start calibration or broad MG polish before a real multi-file, one-output project completes with rich per-asset analysis and rendered proof.
