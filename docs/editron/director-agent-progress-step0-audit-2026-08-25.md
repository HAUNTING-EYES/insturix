# Director-agent progress Step-0 audit — 2026-08-25

## Boundary

This audit is the required prerequisite for a bounded structural change to
`lib/editron/agent/director-agent.ts`. The file is 4,254 lines and the future
change will touch only Director progress/revision handoff. It does not approve
a general Director refactor or a migration of all Director facts.

## Verified current control flow

```text
Director worker route
  -> raw asynchronous progress update to projects.updatedAt
  -> executeDirectorPlan
       -> acquireDirectorMutationLease (snapshot + revision)
       -> work/progress callbacks
       -> saveProjectWithReceipt(expected lease revision, lease token)
       -> recordPhase0ProofFacts
```

The route's progress callback currently uses a fire-and-forget raw Mongo
update guarded only by `autoEditStatus: 'directing'`. It writes
`autoEditStagePercent`, `autoEditStageDesc`, and `updatedAt`.

`ProjectService.acquireDirectorMutationLease` returns a revision whose
`compatibilityUpdatedAt` is the project `updatedAt`. The later
`saveProjectWithReceipt` compares that full revision. Therefore a completed
progress write can make the same Director's final save stale. The agent cannot
distinguish this owned progress mutation from an unrelated legacy writer.

## Step-0 cleanup result

| Check | Result |
| --- | --- |
| `pnpm exec eslint lib/editron/agent/director-agent.ts --quiet` | Passed. No unused import/local cleanup was reported. |
| Export scan | One public export, `executeDirectorPlan`, with live Director-worker, inline, chat-job and auto-edit callers. No export can be removed safely. |
| Direct project-write scan | Eight direct `projects.updateOne` sites remain, plus reads; they are separately listed in the project-authority audit and are not silently folded into this progress change. |
| Console scan | 223 existing operational stage/error traces exist. This focused revision-safety slice will not bulk-delete or reinterpret them. A logging-policy cleanup would be its own behavior/observability change. |
| Dead-code deletion | None justified by the focused lint/export/source audit. |

## Approved narrow repair shape

The implementation phase may modify only the following production boundary:

1. Add a specific ProjectService Director-progress command that requires the
   active lease token, the exact expected revision, bounded progress data and
   `autoEditStatus: 'directing'`.
2. Have `executeDirectorPlan` await that command and replace its locally held
   expected revision with the receipt revision before its final save.
3. Reduce the route callback to progress observation/logging only; it must no
   longer write the project document.
4. Test fresh progress, stale progress, forged lease, ownership loss, and a
   final save after one or more successful progress receipts.

The command is not a generic worker-status or metadata port. It owns exactly
the Director-run progress fields and returns the existing
`ProjectMutationReceiptV1`. It does not create a second timeline, journal,
checkpoint, renderer, or proof store.

## Implementation outcome

Commit `8823a676a` implements the approved repair exactly at the listed
boundary:

1. `ProjectService.recordDirectorProgressV1` validates bounded progress,
   expected revision, active lease and `directing` state in one CAS write and
   returns `ProjectMutationReceiptV1`.
2. `executeDirectorPlan` awaits every opt-in progress update, validates every
   contiguous receipt captured from its own ProjectService action calls, and
   carries the latest writer-issued revision into its final save.
3. The QStash Director route no longer has a raw asynchronous progress write;
   it only observes/logs. Its `persistProjectProgress` option is explicit, so
   other existing Director callers remain observer-only.
4. The regression suite covers fresh receipt issuance, stale/lost ownership,
   malformed input, foreign/non-contiguous receipt rejection, the route
   migration guard and final-save revision handoff. Focused ProjectService and
   Director verification passed 129/129; repository typecheck and quiet ESLint
   also passed.

The repair is revision safety, not a claim that every legacy action-state merge
is now lossless. The current fresh-project merge still has limited known
coverage for newly-added overlays and transition keyframes; broader
field-level reconciliation remains a separate owner audit.

## Deliberate exclusions

- Route claim, assist handoff, terminal completion and non-assist failure are
  separate Director-lifecycle migrations.
- The eight existing direct Director-agent intelligence/quality writes remain
  legacy and must be migrated through typed facts or final-save material, not
  through this progress command.
- Video/tribe, pipeline audio/video, generic `updateProject`, range locks,
  rebase, rational timebases, media identity and Stage 2.5 paid work are out
  of scope.

## Non-claim

This audit does not say the current Director runtime is safe. It establishes
the smallest first repair for one concrete revision race and preserves a
separate migration ledger for the remaining writer paths.
