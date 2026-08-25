# ProjectService Step-0 Audit — 2026-08-25

## Purpose

This audit precedes the bounded migration of a legacy project writer into
`ProjectService`. It is not evidence that all project writers have migrated.

## Checked

| Check | Result |
| --- | --- |
| `pnpm exec eslint lib/editron/services/project-service.ts --quiet` | Passed; no unused-import or unused-local cleanup was reported. |
| Export/reference scan | Several V1 types appear only in this source tree, but they are deliberate public ProjectService return/command contracts. Removing their exports would shrink a boundary without proof that no consumer relies on it. |
| Diagnostic scan | The only console calls are an unauthorized-access warning and a failed project-link-cleanup error. Both describe live operational outcomes; neither is debug logging. |
| Structural cleanup | No code cleanup was justified by the audit. No speculative deletion was made. |

## Reissue: current branch truth

The originally named Director-delivery-failure migration is complete on this
branch. It is no longer the next writer boundary.

A fresh complete source scan of `project-service.ts` and all internal worker
route exports found:

- no additional unused import, unused local, unused public contract or debug
  log that can be removed safely;
- no production missing-signing-key branch that invokes a raw internal-worker
  handler; the four chat worker routes permit their raw handlers only under
  `NODE_ENV === "test"` and otherwise return `503`; and
- older module-time QStash wrappers still use inconsistent `500`/`503`
  configuration responses. They are a deployment-observability consistency
  concern, not evidence of a newly found production fail-open path.

## Next bounded migration

The next safe ProjectService slice is the remaining direct single-overlay
writer family: add, idempotent add and delete. It will make each successful
write append a truthful range-effect receipt in the same revision-bound CAS.
It will not claim generic range locking, generic safe rebase, durable artifact
invalidation or a migration of whole-family/manual-state writers.

## Non-claims

This does not migrate pipeline-audio, auto-edit, storyboard, MG, or other
legacy writers. It does not add range locks, safe rebase, rational timebases,
or durable media/evidence invalidation.
