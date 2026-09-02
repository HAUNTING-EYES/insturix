# Video Analysis duration-correction command — Step-0 audit

Date: 2026-08-25  
Status: `STEP_0_COMPLETE_NO_DEAD_CODE_REMOVAL_JUSTIFIED`

## Exact target and current defect

`app/api/internal/workers/video-analysis/route.ts:531-558` currently converts
the selected duration to `Math.round(actualDurationSec * 30)` and performs a
raw, project-ID-only Mongo update that changes both root
`durationInFrames` and **every** video overlay duration. The selected
duration comes from `resolveVideoDurationSec`: validated MP4 container duration
first, transcript end second, reported duration last.

The raw mutation is unsafe for a multi-video project, a stale worker and any
non-30 numeric project FPS. It has no user predicate, expected revision,
source/target binding, idempotency receipt, timeline effect or truthful proof
status.

## Step-0 cleanup audit

No dead-code cleanup is justified before the structural migration:

| Item checked | Result |
| --- | --- |
| `effectiveDurationSec` | Live: feeds video-understanding input and provider-cost/genre computation later in the same worker. |
| `resolveVideoDurationSec` / `extractMP4Duration` | Live and both are needed to preserve the container-over-transcript selection rule. |
| `actualDurationMs` and raw-footage duration fields | Live: they correct in-memory analysis before silence-removal and later analysis. |
| `ProjectService.updateProject` | Not suitable for this migration, but not dead: live callers remain in `agent/tools.ts`, `chat-visual-tools.ts` and `auto-edit-service.ts`. |
| ProjectService range receipts / atomic-overlay receipt helpers | Live owners used by cut, overlay update and pipeline-video delivery; reuse is safer than a new receipt vocabulary. |

`project-service.ts` and the worker are both larger than 300 lines. This audit
limits the next change to one named command and one producer call; a broad
file cleanup would be unrelated and would obscure the safety review.

## Frozen narrow command shape

The next implementation may add only a named
`ProjectService.commitVideoAnalysisDurationCorrectionV1` family. It is not a
generic metadata or duration updater.

### Producer flow

1. Video Analysis obtains duration evidence as it does today.
2. Immediately before a project mutation, it loads one authenticated
   `ProjectService.loadProjectForMutation(userId, projectId)` snapshot.
3. It selects **exactly one** eligible initial video overlay:
   - `type === 'video'`;
   - exact analyzed `assetId`;
   - starts at project frame `0`;
   - source start is absent or `0`; and
   - root project duration exactly equals that overlay's previous end.
4. If there is zero or more than one eligible target, or the target no longer
   meets those preconditions, it records no project mutation. The raw
   `update every video` behavior must not be recreated.
5. It carries the snapshot revision, target overlay identity, expected asset,
   expected timing, measured milliseconds and duration-source class
   (`container` or `transcript`) to ProjectService.
6. ProjectService exact-CASes the user/project/revision and exact target
   material. It writes the target duration, root duration, atomic overlay
   receipt and bounded named correction receipt in one mutation; a later
   worker never broadly rebases this change.

### Required no-write outcomes

- stale revision or changed target/source → structured conflict, no fallback;
- noninitial, ambiguous or already user-edited target → `NOT_ELIGIBLE`, no
  mutation;
- exact delivery replay → `ALREADY_APPLIED`, returning the original receipt;
- matching current duration before a first write → `ALREADY_CURRENT`, no
  fabricated receipt.

### Receipt requirements

The receipt must bind:

- requested, before and after ProjectService revisions;
- analyzed asset ID, numeric project FPS, measured duration in milliseconds and
  duration-source class;
- exact target overlay ID and before/after frame ranges;
- whether root duration changed under the initial-source precondition;
- a `CORRECT_VIDEO_ANALYSIS_DURATION` timeline-range receipt with an exact
  local range and `UNMATERIALIZED_NO_DURABLE_ARTIFACT_CHAIN` invalidation;
- a stable correction-material identity for QStash replay; and
- `UNVERIFIABLE / NO_RENDERED_VIDEO_PROOF`, since this update does not itself
  render the corrected timeline.

The current product is numeric-FPS only. The command must use the project’s
current numeric `fps`; it does **not** claim rational timebases, source PTS,
VFR, timecode, reels or immutable source-version identity. Current `assetId`
is the best available source binding and its limitation must remain explicit.

## Verification matrix for the next phase

1. A 25-fps project converts 12,000 measured milliseconds to 300 project
   frames, never 360.
2. Only the exact initial matching overlay changes; unrelated video overlays
   and user-authored overlays do not.
3. A replay returns the original receipt and makes no second write.
4. A stale revision, changed asset, moved/trimmed target, multiple eligible
   targets and a root-duration mismatch make no write.
5. The CAS filter includes project ID, user ID, expected revision and exact
   target material; the update increments `projectRevision` and carries both
   atomic overlay and timeline receipts.
6. The worker uses a fresh ProjectService snapshot and has no raw
   `projects.updateOne` duration fallback.

## Non-claims

This does not migrate native-audio evidence, analysis-status lifecycle,
silence-removal, media asset registration, canonical source identity,
rational/VFR timebase, range collaboration, render proof or any other raw
writer family.
