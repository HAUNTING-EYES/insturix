# Stage 1.5 Range and Concurrency: Current Truth V1

**Status:** `PARTIAL_PRODUCT_OWNER_AND_ONE_CHAT_CALLER_WIRED`
**Scope:** current product behavior only. One ProjectService-owned ripple-cut
command and its durable receipt now exist; this is not range-level
collaboration or a completed media/evidence invalidation migration.

## What exists today

| Concern | Current producer / owner | Observed behavior | What it is not |
| --- | --- | --- | --- |
| Frame-range coordinate transform | `lib/editron/services/timeline-range-cut.ts` | The pure `EDITRON_TIMELINE_RANGE_CUT_COORDINATE_TRANSFORM_V1` transform uses `HALF_OPEN_REMOVE_AND_SHIFT_LEFT_V1`. | A persistence layer or standalone project authority. |
| Ripple-cut writer and chat caller | `ProjectService.cutTimelineRangeV1` in `lib/editron/services/project-service.ts`, called by `cut_section` in `lib/editron/agent/tools.ts` | One snapshot/CAS write applies the canonical pure cut, rejects an active Director lease, persists `overlays` and `durationInFrames`, and appends a bounded `timelineRangeChangeReceipts` entry containing complete pre-cut read/write ranges, full ripple tail, affected overlay references, split lineage and before/after writer revisions. The chat result reports the full pre-cut effect range separately from the post-cut preview range; it no longer reports a one-frame seam hint. | A generic operator effect ledger, migration of every timeline writer, range locks, safe rebase, rational/VFR timebase support, or materialized media/evidence invalidation. |
| Manual and autosave persistence | `ProjectService.persistEditorState` in `lib/editron/services/project-service.ts` | A whole editor state (including merged overlays) is committed with the project revision compare-and-swap predicate. | A range-scoped command with declared reads, writes, object references, or invalidations. |
| Conflict recovery | `components/editron/editor/version-7.0.0/hooks/use-autosave.ts` | A `409` reloads the client state through `loadStateRef.current()`. | Safe rebase, three-way merge, selective refresh, or a user conflict choice. |
| Locking | `directorLock` in `ProjectService.persistEditorState` | An active Director lease can reject an autosave for the whole project. | A range lock, overlap detector, or disjoint-work scheduler. |
| AI / manual coexistence | `ai-chat-panel.tsx` and `react-video-editor.tsx` | Sending an AI turn sets `isAIProcessing`; the editor presents a full interaction overlay and pauses autosave. | Background AI work while manual editing remains independently available. |

## Explicit non-claims

The presence of one durable cut receipt must not be described as range-level collaboration.
The new receipt explicitly records `UNMATERIALIZED_NO_DURABLE_ARTIFACT_CHAIN`;
it does not claim that captions, media evidence, previews, proof or render work
were invalidated. Current product code still has no range lock, overlap conflict
decision, safe rebase for a disjoint change, range-level undo/proof or dirty-range
invalidation authority. A project revision conflict remains a whole-project
conflict from the browser's point of view.

The existing coordinate transform remains the correct owner of its pure cut-coordinate calculation. It must not be bypassed or recast as a persistence layer merely to make these gaps appear closed.

## Required implementation gate

The first command now binds its base revision, numeric project-frame coordinate
domain, declared ranges, affected references, exact ripple transform and durable
receipt, and `cut_section` reaches it through the live chat tool factory. The
next implementation gate is ProjectService-owned range locks, receipt-chain
reconciliation, safe rebase and real invalidation owners. Only after those gates may the UI
replace global AI blocking with range-aware concurrent editing, and only when
its displayed state is bound to the receipt revision actually committed by that
command.
