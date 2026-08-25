# Stage 1.5 Range and Concurrency: Current Truth V1

**Status:** `PARTIAL_CUT_SPECIFIC_REBASE_AND_LOCK_SUBSTRATE`
**Scope:** current product behavior only. ProjectService owns one ripple-cut,
its durable effect receipt, receipt-chain safe rebase across one explicitly
disjoint direct-overlay change, and short-lived locks for that cut's complete
ripple tail. This is not range-level collaboration or a completed
media/evidence invalidation migration.

## What exists today

| Concern | Current producer / owner | Observed behavior | What it is not |
| --- | --- | --- | --- |
| Frame-range coordinate transform | `lib/editron/services/timeline-range-cut.ts` | The pure `EDITRON_TIMELINE_RANGE_CUT_COORDINATE_TRANSFORM_V1` transform uses `HALF_OPEN_REMOVE_AND_SHIFT_LEFT_V1`. | A persistence layer or standalone project authority. |
| Ripple-cut writer and chat caller | `ProjectService.cutTimelineRangeV1` in `lib/editron/services/project-service.ts`, called by `cut_section` in `lib/editron/agent/tools.ts` | One snapshot/CAS write applies the canonical pure cut, rejects an active Director lease, persists `overlays` and `durationInFrames`, and appends a bounded receipt containing complete pre-cut read/write ranges, full ripple tail, affected overlay references, split lineage and before/after writer revisions. The chat result reports the full pre-cut effect range separately from the post-cut preview range; it no longer reports a one-frame seam hint. | A generic operator effect ledger, migration of every timeline writer, rational/VFR timebase support, or materialized media/evidence invalidation. |
| Direct single-overlay writers | `ProjectService.addOverlay`, `addOverlayIfAbsent`, `updateOverlay` and `deleteOverlay` | Every successful direct single-overlay CAS appends one writer-issued `ADD_OVERLAY`, `UPDATE_OVERLAY` or `DELETE_OVERLAY` receipt. Its occupied range is the exact inserted, changed, or removed half-open project-frame interval when the legacy timing is representable. Existing callers do not yet reliably provide actor provenance, so the receipt honestly records `UNKNOWN_LEGACY_CALLER`. Missing/invalid timing is stored as `UNKNOWN_LEGACY_OVERLAY_TIMING`, carries no fabricated range, and cannot authorize rebase. | A migration of full-family, bulk, audio-worker, manual-state or raw Mongo writers; a general collaboration ledger; or permission for add/delete to rebase a stale cut. |
| Cut-specific locks | `ProjectService.acquireTimelineRangeCutLockV1`, `releaseTimelineRangeCutLockV1`, and `cutTimelineRangeV1` | A half-open lock is issued only under the exact project revision, blocks an overlapping cut, and must cover the full `[cutStart, beforeDuration)` ripple tail to authorize it. A matching lock is consumed by the cut; expiry never authorizes a cut. | A general `timelineRangeLocks` facility. No writer other than `cutTimelineRangeV1` honors these locks yet. |
| Stale-cut safe rebase | `ProjectService.cutTimelineRangeV1` | A stale cut may re-run only across a contiguous history of exact, non-transforming `UPDATE_OVERLAY` receipts whose union ranges are disjoint from the full cut tail and whose overlay identity is not affected by the cut. Missing history, coordinate transforms, unknown timing, same-object edits, overlap, bad locks and final CAS loss fail without a cut write. | A general three-way merge, automatic rebase for other writers, or browser-visible selective conflict recovery. |
| Manual and autosave persistence | `ProjectService.persistEditorState` in `lib/editron/services/project-service.ts` | A whole editor state (including merged overlays) is committed with the project revision compare-and-swap predicate. | A range-scoped command with declared reads, writes, object references, or invalidations. |
| Conflict recovery | `components/editron/editor/version-7.0.0/hooks/use-autosave.ts` | A `409` reloads the client state through `loadStateRef.current()`. | Safe rebase, three-way merge, selective refresh, or a user conflict choice. |
| Locking | `directorLock` in `ProjectService.persistEditorState` | An active Director lease can reject an autosave for the whole project. | A range lock, overlap detector, or disjoint-work scheduler. |
| AI / manual coexistence | `ai-chat-panel.tsx` and `react-video-editor.tsx` | Sending an AI turn sets `isAIProcessing`; the editor presents a full interaction overlay and pauses autosave. | Background AI work while manual editing remains independently available. |

## Explicit non-claims

The presence of cut-specific receipts, one narrow safe-rebase rule and cut locks
must not be described as range-level collaboration. Each receipt explicitly
records `UNMATERIALIZED_NO_DURABLE_ARTIFACT_CHAIN`; it does not claim that
captions, media evidence, previews, proof or render work were invalidated.
Current product code has no general overlap decision, rebase for other writers,
range-level undo/proof or dirty-range invalidation authority. In particular,
the current stale-cut policy accepts only exact disjoint `UPDATE_OVERLAY`
receipts; an intervening direct add or delete is recorded truthfully but
returns `UNKNOWN_OPERATION` rather than being guessed safe. A project revision
conflict remains a whole-project conflict from the browser's point of view.

The existing coordinate transform remains the correct owner of its pure cut-coordinate calculation. It must not be bypassed or recast as a persistence layer merely to make these gaps appear closed.

## Required implementation gate

The cut command now binds its base revision, numeric project-frame coordinate
domain, declared ranges, affected references, exact ripple transform, cut lock
and durable receipt, and `cut_section` reaches it through the live chat tool
factory. The next implementation gate is extending truthful effect receipts and
operation-specific rebase/lock enforcement to the remaining ProjectService and
worker writers, then materializing real artifact invalidation owners. Only after
those gates may the UI replace global AI blocking with range-aware concurrent
editing, and only when its displayed state is bound to the receipt revision
actually committed by that command.
