# Director lifecycle Step-0 audit — 2026-08-25

## Boundary

This is the required cleanup and design prerequisite for the next bounded
structural change to the large Director and ProjectService paths. It covers
only the automatic QStash Director lifecycle:

```text
claim -> execute under a short writer lease -> terminal receipt -> complete | fail
```

It does not approve a generic project-status port, a second job/timeline
authority, or a migration of Assist settlement, Video/Tribe, raw analysis
facts, generic range collaboration, or the remaining worker families.

## Verified current fault

The QStash route currently raw-claims a project by status, then calls the
Director agent. The agent has a separate, short-lived ProjectService lease and
writer-issued action/final-save/proof receipts. The route later performs a raw
completion write guarded only by `{ projectId, autoEditStatus: 'directing' }`.
Its error handler can also raw-write `failed` for any non-Assist project with
only the project ID.

That leaves two concrete safety gaps:

1. Completion is not bound to the final writer/proof revision.
2. A delayed old worker has no durable run identity, so its failure path cannot
   prove that it still owns the active automatic run before terminalizing it.

The Director's lease cannot be repurposed as the run identity: the canonical
`saveProjectWithReceipt(... directorLeaseId)` deliberately clears
`directorLockToken` on the final editor save before route completion.

## Step-0 cleanup result

| Check | Result |
| --- | --- |
| Focused ESLint on ProjectService, Director agent and Director route | Passed. No unused import/local cleanup reported. |
| Director-agent export scan | `DirectorProgressReporterV1` had no direct/type/string/dynamic/barrel/test consumer. Commit `a0cb07556` removed only its unused export. `executeDirectorPlan` remains live across the QStash worker, Video/Tribe workers, direct route, inline fallback and chat jobs. |
| Direct project-write scan | Director agent still has eight direct project-update sites plus reads. They remain listed as legacy facts and are not folded into this lifecycle migration. |
| Console scan | 223 existing operational/error traces. This slice does not bulk-delete or reinterpret them; logging-policy work would be separate behavior/observability work. |
| ProjectService boundary scan | The existing lease, progress, delivery-failure, final-save and Phase-0 methods are live and must be extended rather than shadowed. No safe unrelated deletion was found in this lifecycle boundary. |

## Approved narrow lifecycle design

The next implementation may add only explicit ProjectService lifecycle
commands and wire the QStash route to them:

1. **Claim.** Atomically claim only a non-Assist project owned by the payload
   user from `analysis_complete` or `directing_queued`. The command creates a
   durable, unguessable `directorRunToken`, advances the ProjectService
   revision, returns the claimed project and a writer receipt.
2. **Terminal receipt.** The Director agent records its final editor-save
   receipt as its terminal receipt, replacing it with the Phase-0 proof receipt
   only if that additional write succeeds. A non-fatal proof failure therefore
   still leaves the real final-save receipt, not a guessed revision.
3. **Completion.** ProjectService accepts a bounded completion command only
   when the project/user/run token/status and exact terminal receipt revision
   still match. It writes the existing completion fields, clears the run token,
   advances the revision and returns a receipt. A rescued, cancelled, changed
   or newer run returns an explicit no-write ownership-loss disposition.
4. **Failure.** ProjectService records failure only when the exact active run
   token still owns a `directing` project. An old worker after a rescue/retry
   receives no receipt and cannot overwrite the newer state.

The run token is lifecycle identity; the Director lease remains only a
short-lived writer coordination token. Neither is a second ProjectService,
checkpoint, journal, proof store or timeline authority.

## Owner implementation outcome

Commit `f233ec379` implements the ProjectService half of this design:

1. `claimDirectorRunV1` atomically claims only user-owned, non-Assist projects
   from the allowed analysis states, creates `directorRunToken`, increments the
   revision and returns a writer receipt.
2. `completeDirectorRunV1` requires the exact active run token plus an exact
   final writer receipt/revision; it cannot resurrect a project after a rescue
   or newer write.
3. `failDirectorRunV1` reads the current owner-scoped project and CAS-fails
   only that matching active run; a delayed worker receives `OWNERSHIP_LOST`.
4. The focused lifecycle, progress, delivery-failure and existing worker suites
   pass 26/26; repository typecheck and quiet ESLint pass.

## Live automatic-worker wiring outcome

Commit `bbc74cd8e` completes the bounded automatic QStash Director lifecycle
migration:

1. The route calls `claimDirectorRunV1` rather than raw-claiming `directing`.
2. `executeDirectorPlan` returns its exact last writer receipt: the final save,
   Phase-0 receipt when persisted, or the later durable progress receipt.
3. The route completes only through `completeDirectorRunV1` with that receipt
   and the exact durable run token. Ownership loss returns no write and skips
   learning bookkeeping.
4. The route calls `failDirectorRunV1` for an automatic run failure; it no
   longer falls back to a raw `failed` write.
5. For only this route, the executor defers legacy raw `status` transitions so
   they cannot alter `updatedAt` after the final receipt and make completion
   falsely stale. Other direct/manual callers retain their existing behavior.

Focused lifecycle, progress, delivery-failure, route, decision-bundle and
reference-wiring suites pass 44/44, followed by repository typecheck and quiet
ESLint. This completes the automatic lifecycle only; the exclusions below
remain current.

## Required proof

The implementation must prove at least:

- claim rejects wrong user, Assist projects, inactive states and concurrent
  claims without a receipt;
- completion accepts only the exact run token and terminal receipt revision;
- a stale/rescued/newer run cannot complete or fail another run;
- malformed lifecycle input performs no project read/write;
- the route no longer raw-claims, raw-completes or raw-fails automatic runs;
- existing Assist cancellation/refund behavior remains outside this migration;
- focused lifecycle, existing Director-worker, ProjectService, repository
  typecheck and quiet ESLint checks pass.

## Deliberate exclusions and non-claims

- Stuck-recovery and Assist-rescue routes still change legacy status directly.
  Their status change causes this lifecycle's old run to lose ownership; they
  are not thereby migrated or certified.
- The final Director fresh-project merge remains limited to newly-added
  overlays and transition keyframes. Receipt chaining does not prove a full
  field-level reconciliation for every legacy direct fact write.
- The optional Phase-0 proof remains non-fatal by current product behavior.
  This migration binds completion to whichever writer-issued terminal receipt
  actually exists; it does not claim rendered proof is mandatory for complete.
- No Stage 2.5 paid dispatch, production model mutation, timeline/media work,
  or broad worker migration is authorized by this audit.
