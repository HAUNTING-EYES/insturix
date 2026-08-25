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

## ProjectService owner materialization (current branch; not wired)

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

Focused contract tests cover stable binding, fresh SFX delivery, exact replay,
changed material, audio-only rebase, visual-change refusal, and BGM CAS retry
preserving concurrent SFX. The owner and adjacent revision/save suites pass
55/55, with repository typecheck and focused quiet ESLint passing.

This is **owner materialization only**. The active worker route still writes
`projects` directly, so there is no active writer migration claim yet.

## Non-claims and next proof

This work does not wire the legacy route, repair the split beat-analysis
callers, certify the audio mix, migrate media-asset registration, or complete
the Stage 1 writer audit. The next bounded phase must replace raw project
writes in the worker with this owner and prove the active signed ingress,
warning outcomes, duplicate QStash delivery, asset/warning failure separation,
and zero-write blocked dispositions.
