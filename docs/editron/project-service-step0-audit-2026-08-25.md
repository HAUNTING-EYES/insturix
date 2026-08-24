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

## Next bounded migration

`app/api/internal/workers/director/failure/route.ts` still writes project
terminal state directly through MongoDB. The next slice will add one narrow
ProjectService-owned Director delivery-failure command with revision/receipt
semantics, while leaving the separate upload-batch write explicitly outside
that command until its own owner is designed.

## Non-claims

This does not migrate pipeline-audio, auto-edit, storyboard, MG, or other
legacy writers. It does not add range locks, safe rebase, rational timebases,
or durable media/evidence invalidation.
