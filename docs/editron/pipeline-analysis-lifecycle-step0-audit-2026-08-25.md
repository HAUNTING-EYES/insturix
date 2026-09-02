# Pipeline analysis lifecycle and source-binding Step-0 audit

Date: 2026-08-25  
Status: `CURRENT_SOURCE_AUDIT_COMPLETE`; commit `c2eeafb1c` closes the
single-asset production queue-admission gap. No lifecycle or analysis-fact
writer has been migrated by this document.

## Purpose and method

This is the required Step-0 before changing the residual Video Analysis/TRIBE
pipeline writers. It re-read the current production routes, their upstream
intake paths, recovery paths, and existing ProjectService/analysis-storage
boundaries:

- `app/api/services/editron/auto-edit/from-asset/route.ts`;
- `app/api/internal/workers/video-analysis/route.ts`;
- `app/api/internal/workers/tribe-analysis/route.ts`;
- `app/api/services/editron/auto-edit/from-batch/route.ts`;
- `app/api/services/editron/auto-edit/cancel/route.ts`;
- `app/api/services/editron/auto-edit/rescue/route.ts`;
- `app/api/cron/recover-stuck-projects/route.ts`;
- `lib/editron/services/project-service.ts`;
- `lib/editron/services/project-analysis-storage.ts`; and
- `lib/editron/security/internal-worker-auth.ts`.

The audit distinguishes a queue-delivery configuration fault, a pipeline-run
lifecycle, source-derived analysis facts, an Assist financial/cancellation
transition, batch-orchestration state, and a Director lifecycle. They do not
have interchangeable CAS, replay, source-binding, proof, or recovery rules.

## Current writer truth

| Family | Current producer and write | Why it is not a generic metadata update |
| --- | --- | --- |
| Single-asset intake | `from-asset` saves the initial timeline, then raw-writes `autoEditMode`, `autoEditStatus: 'queued'`, source/reference fields and preferences before dispatch. | It is the only current place that knows the user-facing intent and must ultimately issue the analysis-run identity before any worker starts. |
| Video Analysis lifecycle | The worker raw-writes `analyzing`, `transcribing`, `analyzing_visual_cuts`, `cleaning`, `computing_params`, `analysis_complete`, and in the development-only continuation, deep-analysis/Director/terminal states. | A duplicate or late worker must be checked against one specific run, source version, revision and handoff state, not merely against a status string. |
| Video Analysis facts | The worker raw-writes raw-footage, synthetic-storyboard/reference, visual-cut, V-JEPA, genre and asset-index facts. It also still raw-writes native-audio evidence independently. | These facts need immutable source/media, source-time and analyzer provenance. A lifecycle receipt alone cannot certify them. |
| TRIBE lifecycle and facts | TRIBE atomically claims `tribeLockAt`, raw-writes `analyzing_deep`, music/asset analysis, second-phase facts and `directing_queued`. | `tribeLockAt` is a short-lived workflow lease. Its facts and downstream dispatch must bind the same analysis run but must not be stored as a generic timeline lock. |
| Batch auto-edit | `from-batch` owns upload-batch leases, credits/refunds, initial timeline lay-down, aggregate analysis bridge and raw Director queue/failure metadata. | This is a separate multi-asset orchestration and billing state machine. It cannot be silently absorbed into single-asset analysis lifecycle semantics. |
| Assist cancel/rescue | `cancel` atomically terminalizes a cancellable scan and coordinates refunds; `rescue` atomically changes a failed, unrefunded project to an Assist-ready project. | Financial and user-consent transitions have their own guarded predicates. A worker lifecycle command must not override them. |
| Stuck recovery | The cron currently changes old active `autoEditStatus` values to `failed` based on `updatedAt`. | Without a durable run identity/lease, it cannot distinguish a killed run from a late result of an older run. |
| Director | Automatic QStash Director claim/progress/completion/failure already use narrow ProjectService commands. | Analysis migration must hand off to that owner; it must not recreate Director state or use the old generic metadata helpers. |

## Confirmed P0 queue-configuration gap

The shared helper already defines both `isInternalQStashDispatchConfigured()`
and `isInternalWorkerInlineFallbackAllowed()`: an inline fallback is lawful
only in explicit development, while production dispatch requires the publisher
token and both rotation signing keys.

Commit `c2eeafb1c` makes `from-asset` use the complete predicate before credit
deduction or project creation. Outside explicit development, a missing
publisher token or either signing key now returns `503`; development retains
the explicit inline path. Its handler-level regression proves no credit,
project, analysis, or Director call occurs in the production/no-token case.

`from-batch` has a different situation: its external ingress rejects a missing
publisher token, but its `dispatchDirector` helper still directly executes the
Director when that token disappears. It also does not prove the downstream
signing pair before it materializes/charges the batch. This is a distinct
batch-orchestration/financial fault, not evidence that the single-asset guard
will solve the batch lane.

Commit `5e9140c3b` closes that separate batch gap. Outside explicit
development, the route now verifies the publisher/signing configuration before
opening its database/credit path; both the batch re-dispatch and Director
publication helpers recheck the same configuration, and the direct Director
path is development-only. The handler regression proves a production/no-queue
request performs no database, credit, project, or fetch work. The combined
batch/single-asset/worker suite passes 42/42 with repository typecheck and
quiet ESLint passing.

## Root cause and design boundary

There is no existing canonical `PipelineAnalysisRun` owner. In particular:

1. No intake creates a durable analysis-run ID before queue publication.
2. Worker state changes do not require that ID, a source version, an expected
   ProjectService revision, or a replay material hash.
3. `project-analysis-storage` persists compatibility projections and merges
   analysis records by freshness/criteria. It has no qualified immutable
   master/proxy source identity, source PTS/timebase, writer receipt, or one
   source-bound analysis authority.
4. The current media library carries loose `MediaAsset` metadata. The richer
   editorial-media identity contract remains unwired and is not a product
   source owner.

Therefore a generic `ProjectService.updatePipelineStatus(...)` or
`saveAnalysisFacts(...)` command would be a second authority: it would either
accept arbitrary lifecycle transitions or pretend raw facts are certified
without the source identity needed to validate them. Neither is allowed.

## Ordered repair boundary

1. **Completed — single-asset queue admission:** commit `c2eeafb1c` requires
   `isInternalQStashDispatchConfigured()` outside explicit development before
   any credit deduction, project creation, or inline analysis. This changes
   admission only; it does not move analysis facts, edit behavior, or project
   ownership.
2. **Completed — batch queue admission:** commit `5e9140c3b` rejects missing
   publisher/signing configuration before the batch database/credit path and
   keeps direct Director execution development-only. This changes admission and
   dispatch only; it does not alter batch lifecycle/fact ownership.
3. **Canonical media/timebase spine:** issue a qualified immutable source
   receipt after the existing storage object is verified and probed; bind the
   master/proxy relationship, rational cadence/PTS, reel/timecode where
   present, and invalidation links. Unknowns remain explicit unqualified
   values. This must reuse existing media storage, not create another media
   registry.
4. **Then a named ProjectService analysis-run family:** intake issues one
   `analysisRunId` bound to the qualified source set, project revision, lane,
   analyzer-policy version and material hash. Narrow begin/advance/complete/
   fail commands validate that exact run and return ProjectService-issued
   receipts. They do not accept arbitrary fields or subsume Director,
   cancellation, credits, batch leases or media registration.
5. **Source-bound facts follow separately:** each fact family declares the
   source version/range, analysis sampling/timebase, analyzer/version,
   invalidation and proof disposition. Native-audio evidence is a separate
   exact-overlay command. Existing compatibility fields may be projected only
   after the source-bound record is written; they never become the new owner.
6. **Recovery comes after run identity:** the cron must target an expired
   run/lease with its exact ID and terminalize it through the named owner. It
   may not turn an `updatedAt` estimate into a blanket project failure.

## Non-claims

This audit does not implement a lifecycle command, migrate raw analysis facts,
alter silence removal, change Assist billing/cancel/rescue behavior, replace
the batch orchestration owner, create a new media store, or certify rational/
VFR/timecode support. It is the source-backed boundary required to select the
next safe implementation slice.
