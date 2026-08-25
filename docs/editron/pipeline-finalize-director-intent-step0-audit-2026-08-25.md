# Pipeline-finalize Director-intent Step-0 audit — 2026-08-25

## Purpose and narrow boundary

This is the mandatory Step-0 audit before migrating the pipeline-finalize
producer of the pending Director signal. It is grounded in the active
`infrastructure-improvs-+Editron` source after the pipeline-video overlay,
quality-warning and Director-dispatch migrations. It does not change a queue,
create a second project/timeline/checkpoint/proof authority, send model work,
or promote Stage 2.5.

The proposed implementation scope is exactly this legacy write in
`app/api/services/pipeline/storyboard/[id]/finalize/route.ts`:

```text
pendingDirectorProfileId = "G-01"
pendingDirectorUserId = authenticated user
```

and the response field that currently reports `directorQueued: true` even when
that write failed. It does not migrate any other raw finalize writer in this
slice.

## Files and call paths inspected

- `app/api/services/pipeline/storyboard/[id]/finalize/route.ts` (1,537 lines;
  inspected in sequential source ranges, including imports, project creation,
  raw project writes, BGM branch, Director signal and response)
- `lib/editron/services/project-service.ts` (existing `saveProjectWithReceipt`,
  `preparePipelineDirectorDispatchV1`, `claimDirectorRunV1` and mutation error
  contracts)
- `app/api/internal/workers/pipeline/video/route.ts` (the later signed-worker
  consumer that prepares the Director dispatch)
- `app/api/internal/workers/director/route.ts` and the existing
  `project-pipeline-director-dispatch-v1` tests (signed claim consumer and
  existing handoff invariants)
- `lib/shared/project-status.ts` (separate legacy status transition owner)
- all source/test references to `pendingDirectorProfileId`,
  `pendingDirectorUserId`, `directorQueued` and
  `preparePipelineDirectorDispatchV1`.

The Step-0 dead-code pass found no removable unused import, export, prop or
debug-only log in the narrow signal block. `Client`, `getDatabase` and
`projectService` are still used elsewhere in the route. No cleanup-only commit
is justified before this bounded change.

## Current write trace

```text
authenticated finalize request
  -> find/reuse or create ProjectService project
  -> save initial editor state through ProjectService
  -> several legacy finalize metadata/audio/status writes (out of scope)
  -> raw projects.$set pendingDirectorProfileId/pendingDirectorUserId
       (failure caught as warning)
  -> response reports directorQueued: true regardless
  -> later signed pipeline-video worker loads current project revision
  -> ProjectService.preparePipelineDirectorDispatchV1
  -> signed Director worker claims matching dispatch token
```

The raw signal write has no `{ projectId, userId }` predicate, expected writer
revision, idempotency/replay material, writer receipt or conflict disposition.
It can overwrite a signal from another lifecycle state. Its caught error is
visible only in the response warnings, while `directorQueued` remains true.
That is a false-success API claim: finalization has not queued a signed Director
worker; it has at most stored an intent for a later pipeline-video completion.

## Deliberately excluded writes

The same large route contains different writers and they must not be conflated:

| Location | Current effect | Why excluded now |
| --- | --- | --- |
| Reused-project metadata | Raw name/stage/brand/source-session update | Generic metadata revision migration needs its own classification. |
| Storyboard link/music policy/edit-direction result | Raw project metadata update | It combines storyboard linkage, derived audio policy and UI warning facts. |
| Synchronous BGM branch | Raw sound overlay push plus music-plan facts | This is the later audio-attachment family; it needs audio rights, range and rendered-mix proof. |
| `transitionProjectStatus` | Separate status/history update | Existing status state machine is a distinct legacy owner. |

Media asset registration, storyboard linkage, credit settlement, QStash work,
and Brand events remain their existing owners. This slice must not pretend that
their writes are atomic with the ProjectService signal receipt.

## Required ownership contract

The sole mutation owner must be a narrow ProjectService command, tentatively
named `recordPipelineDirectorIntentV1`:

```text
finalize route (authenticated caller)
  -> ProjectService snapshot / exact expected revision
  -> ProjectService Director-intent CAS command
  -> pending Director signal in canonical project state
  -> writer receipt to caller
  -> later pipeline-video dispatch preparation and signed claim
```

The command must:

1. accept only an exact ProjectService-issued expected revision and bounded
   profile ID;
2. query and write with both project and authenticated user identity;
3. write only when there is no active Director run or prepared pipeline
   dispatch, and when the project is not Assist mode;
4. treat an identical pending `(profileId, userId)` at the same lifecycle state
   as idempotent; reject a different/invalid pending signal rather than
   overwriting it;
5. advance `projectRevision`, emit one `ProjectMutationReceiptV1`, and preserve
   a clear changed-path/proof disposition;
6. fail closed on stale/CAS-lost input—no broad additive rebase is safe because
   re-running a consumed intent could start a second Director lifecycle; and
7. leave actual QStash publication and the later batch-bound dispatch token to
   `preparePipelineDirectorDispatchV1`, its existing owner.

The finalizer must load a fresh mutation snapshot immediately before this call.
It may return `directorQueued: true` only for `RECORDED` or an idempotent
`ALREADY_RECORDED` result, and must make clear that this means
`PENDING_PIPELINE_VIDEO_COMPLETION`, not that a worker was already delivered.
On a stale/conflict/failure result it must return `directorQueued: false` and a
visible warning while preserving the already-created project.

## Required tests and non-claims

The next implementation must add adversarial tests for:

- normal user-scoped CAS write and writer receipt;
- identical replay without a second write;
- mismatched existing intent, active run, prepared dispatch, Assist project,
  stale expected revision and lost CAS all making no write;
- a finalizer source/route test proving no raw `pendingDirector*` update and
  truthful `directorQueued` disposition;
- preservation of the later signed worker's existing
  `preparePipelineDirectorDispatchV1` and claim behavior.

This migration will not create a transactional outbox, retry driver, full
finalize atomic transaction, render proof, generic range lock/rebase system,
or completed Director run. It does not validate the inherited `G-01` creative
profile beyond treating it as the existing bounded request value.
