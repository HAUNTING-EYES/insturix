# Stage 1.5 Range and Concurrency: Current Truth V1

**Status:** `CURRENT_TRUTH_GUARD_ONLY`
**Scope:** current product behavior only; this document does not add a new writer, lock, receipt, or migration.

## What exists today

| Concern | Current producer / owner | Observed behavior | What it is not |
| --- | --- | --- | --- |
| Frame-range coordinate transform | `lib/editron/services/timeline-range-cut.ts` | The pure `EDITRON_TIMELINE_RANGE_CUT_COORDINATE_TRANSFORM_V1` transform uses `HALF_OPEN_REMOVE_AND_SHIFT_LEFT_V1`. | A durable project-range authority, operation receipt, or conflict policy. |
| Manual and autosave persistence | `ProjectService.persistEditorState` in `lib/editron/services/project-service.ts` | A whole editor state (including merged overlays) is committed with the project revision compare-and-swap predicate. | A range-scoped command with declared reads, writes, object references, or invalidations. |
| Conflict recovery | `components/editron/editor/version-7.0.0/hooks/use-autosave.ts` | A `409` reloads the client state through `loadStateRef.current()`. | Safe rebase, three-way merge, selective refresh, or a user conflict choice. |
| Locking | `directorLock` in `ProjectService.persistEditorState` | An active Director lease can reject an autosave for the whole project. | A range lock, overlap detector, or disjoint-work scheduler. |
| AI / manual coexistence | `ai-chat-panel.tsx` and `react-video-editor.tsx` | Sending an AI turn sets `isAIProcessing`; the editor presents a full interaction overlay and pauses autosave. | Background AI work while manual editing remains independently available. |

## Explicit non-claims

The presence of frame-range math must not be described as range-level collaboration.
Current product code has no durable range-scope receipt, range lock, overlap conflict decision, safe rebase for a disjoint change, range-level undo/proof, or dirty-range invalidation authority. A project revision conflict is a whole-project conflict from the browser's point of view.

The existing coordinate transform remains the correct owner of its pure cut-coordinate calculation. It must not be bypassed or recast as a persistence layer merely to make these gaps appear closed.

## Required implementation gate

After the active Stage 2.5 / CAP2 evidence boundary is reissued, a real migration may introduce one ProjectService-owned command that binds:

- a base project revision;
- declared read and write ranges with an unambiguous coordinate domain;
- affected object references and invalidation scope;
- a durable receipt; and
- deterministic dispositions for stale, overlapping, disjoint, and user-locked work.

Only then may the UI replace global AI blocking with range-aware concurrent editing, and only after its displayed state is bound to the receipt revision actually committed by that command.
