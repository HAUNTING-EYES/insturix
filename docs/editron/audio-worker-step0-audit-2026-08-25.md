# Legacy pipeline-audio worker Step-0 audit — 2026-08-25

## Boundary and status

This is the mandatory cleanup audit before a structural change to
`app/api/internal/workers/pipeline/audio/route.ts`. The route is over the
AGENTS.md structural-refactor threshold. This audit does not migrate an audio
writer, introduce a new ProjectService command, alter a project, or authorize
model inference.

The only confirmed dead local contract in the worker is its declared and
destructured `storyboardId`: the two current dispatch producers include it, but
the worker never reads it. The cleanup removes the local type/member and
destructure only. Existing queued payloads and producers remain compatible
because request JSON accepts unknown fields.

No log was removed: the remaining logs either mark a worker lifecycle boundary,
report a security/configuration failure, or report a degraded user-visible
audio outcome. No import was found unused.

## Current execution map

| Concern | Current code-grounded truth |
| --- | --- |
| Producers | `app/api/services/pipeline/storyboard/[id]/finalize/route.ts` dispatches BGM and SFX independently after project creation. `lib/editron/agent/director-agent.ts` dispatches BGM for the Director path. |
| Decision/form owners | BGM eligibility and coverage are owned by `bgm-conditioning-contract` and `music-coverage-runtime`; BGM generation by `bgm-service`; beat measurement by `music-beat-grid`; cut movement by the pure `alignCutsToBeatsWithEvidence` form owner; SFX candidate generation by `sfx-service`. |
| Current mutation owner | None for canonical project state. The worker writes Mongo `projects` directly. |
| Direct state writes | Pipeline warnings; BGM coverage facts; BGM/SFX `sound` overlays; a later full `overlays` replacement after beat alignment; `updatedAt`. Generated asset records are separately upserted in `MEDIA_ASSETS`. |
| Existing downstream consumers | Project overlays are read by the editor/renderer family and audio quality/chat services. `_workerAdded` is specifically preserved by `ProjectService.saveProject`; it is not a writer-issued receipt or concurrency guarantee. |
| Proof truth | The worker returns a transport response and warnings. It emits no canonical ProjectService revision, receipt, undo/replay binding, scoped effect, render proof, or audible-mix proof. |

## Concrete production race

The BGM and SFX jobs are intentionally enqueued separately and can run in
parallel. The BGM flow:

1. pushes its BGM overlays directly;
2. reads the whole project overlay array to run beat alignment; then
3. writes that entire in-memory array back with `$set`.

If SFX appends an overlay after BGM's read and before BGM's whole-array write,
the BGM write drops that SFX overlay. `_workerAdded` protects against one class
of browser-save loss; it does not close this worker-to-worker race.

The route's non-development missing-signing-key branch rejects instead of
falling through to a raw handler. The newer dispatcher correction in
`6382641ce` separately prevents callers from claiming a production enqueue
when publisher/signing configuration is absent. Neither fact makes the writer
safe.

## Required migration shape (not implemented here)

The next structural phase must be specific to pipeline-audio delivery. It must
not wrap this route in a generic metadata writer or reuse the research planner.
It needs a ProjectService-owned command that receives already-produced audio
delivery material, validates a fresh expected revision and delivery identity,
attaches only the declared overlays/facts through CAS, and returns a
writer-issued revision/receipt.

- BGM/SFX deliveries need independent idempotency identities so both can land.
- A BGM beat-alignment request must re-read current canonical state and
  recompute from that state after a conflict; it must never write a stale full
  overlay snapshot.
- The command must return a scoped effect and an honest proof disposition.
- Asset registration and best-effort warning persistence must be classified
  separately; they must not be silently promoted into timeline authority.
- The existing `addOverlayIfAbsent`, `commitMgRenderDelivery`, and
  `replaceOverlayFamilyAtomic` methods are useful patterns, but none can be
  adopted blindly: the first is single-overlay only, the second is MG-specific,
  and the third replaces a whole overlay family.

## Non-claims and next proof

This cleanup does not fix BGM/SFX concurrency, migrate beat alignment, repair
the split beat-analysis callers, certify the audio mix, or complete the Stage
1 writer audit. The next implementation phase must begin with a separately
reviewed owner contract and adversarial tests for fresh delivery, duplicate
delivery, BGM/SFX interleaving, stale revision, asset/warning failure, and
zero-write blocked dispositions.
