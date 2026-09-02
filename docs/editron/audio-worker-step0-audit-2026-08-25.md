# Legacy pipeline-audio worker Step-0 audit — 2026-08-25

## Boundary and status

This began as the mandatory cleanup audit before a structural change to
`app/api/internal/workers/pipeline/audio/route.ts`. The route is over the
AGENTS.md structural-refactor threshold. The active-ingress result is recorded
below; it does not authorize model inference, a new project owner, or a
generic worker wrapper.

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
| Current mutation owner | `ProjectService.commitPipelineAudioDeliveryV1` is the only active worker path for canonical BGM/SFX project state. |
| Direct state writes | The worker has no direct `projects` collection access. It loads a ProjectService mutation snapshot and delivers `ATTACHED`, `SKIPPED`, or `FAILED` material through the owner. Generated asset records are separately upserted in `MEDIA_ASSETS`. |
| Existing downstream consumers | Project overlays are read by the editor/renderer family and audio quality/chat services. `_workerAdded` is specifically preserved by `ProjectService.saveProject`; it is not a writer-issued receipt or concurrency guarantee. |
| Proof truth | Every delivered terminal outcome returns a writer-issued revision/receipt and explicit proof disposition. An attached sound remains `UNVERIFIABLE` until rendered audio/mix proof exists. |

## Historical production race and active closure

The BGM and SFX jobs are intentionally enqueued separately and can run in
parallel. The BGM flow:

1. pushes its BGM overlays directly;
2. reads the whole project overlay array to run beat alignment; then
3. writes that entire in-memory array back with `$set`.

If SFX appended an overlay after BGM's read and before BGM's whole-array write,
the BGM write dropped that SFX overlay. `_workerAdded` protects against one
class of browser-save loss; it did not close this worker-to-worker race.

The active route no longer performs either project write. It reads one
ProjectService-issued snapshot, attaches its planning binding and retry-stable
delivery identity, then calls `commitPipelineAudioDeliveryV1`. The owner reads
the current CAS snapshot. A stale delivery can only rebase across audio-only
changes; a visual change returns a structured conflict. BGM beat alignment is
recomputed from that fresh owner snapshot, while SFX uses the owner’s append
path. Therefore the old full-array replacement cannot erase a concurrent SFX
append.

The route's non-development missing-signing-key branch rejects instead of
falling through to a raw handler. The newer dispatcher correction in
`6382641ce` separately prevents callers from claiming a production enqueue
when publisher/signing configuration is absent. Neither fact makes the writer
safe on its own; the active ProjectService migration above is what closes the
project-write race.

## ProjectService owner materialization and active ingress migration

The next structural phase was kept specific to pipeline-audio delivery: it did
not wrap the route in a generic metadata writer or reuse the research planner.
`ProjectService.commitPipelineAudioDeliveryV1` now receives already-produced
audio material, validates an expected project revision plus a planning visual-
timeline binding and delivery identity, and makes one CAS-owned project write.

- BGM/SFX deliveries have independent `audio-delivery_*` idempotency identities
  and a canonical hash of their full declared material. Reuse of the same ID
  with changed material fails rather than replaying as success.
- The planning binding includes the project timebase and non-audio overlay
  identity/timing. A stale delivery can rebase only when the intervening change
  is audio-only. Legacy timestamp drift and changed visual timeline material
  fail closed.
- A BGM delivery that loses CAS reloads current state, recomputes beat
  alignment from that fresh state, and retries once. This preserves an
  intervening SFX append instead of later replacing it with a stale array.
- Each applied, skipped, or failed delivery gets one writer-issued revision,
  bounded delivery receipt, changed-path record and explicit proof disposition.
  An attached sound is `UNVERIFIABLE` until rendered audio/mix proof exists;
  it is not called verified.
- Warnings travel through the same command. Asset registration remains a
  separately classified media-asset write, not project/timeline authority.

The worker ingress now requires a valid `audio-delivery_*` identity before it
loads a project or invokes a provider. The dispatcher creates that identity
before QStash publication, so a QStash retry keeps the same body. The route
propagates owner conflicts as `409`, records terminal `FAILED` outcomes when
it can do so safely, and records policy or coverage vetoes as `SKIPPED`
without fabricating an audio overlay or coverage plan.

Focused contract tests cover stable binding, fresh SFX delivery, exact replay,
changed material, audio-only rebase, visual-change refusal, BGM CAS retry
preserving concurrent SFX, signed worker identity, active BGM/SFX ingress,
policy skips, terminal failures, and owner conflicts. The focused boundary
suite passes 90/90; repository typecheck and quiet ESLint pass.

This is a completed **pipeline-audio canonical project-writer migration**. It
does not mean that media assets, rendering, audio analysis, or all audio
callers have become one owner.

## Non-claims and next proof

This work does not repair the split beat-analysis callers, certify the audio
mix, make media-asset registration transactional with a project receipt, or
complete the Stage 1 writer audit. A provider asset can therefore be registered
before a later ProjectService conflict; it is reusable media state, not a
timeline mutation, and it must not be presented as a completed edit. The next
bounded phase returns to the canonical media/timebase/evidence spine, while
the remaining worker-audit entries stay explicit in the master plan.
