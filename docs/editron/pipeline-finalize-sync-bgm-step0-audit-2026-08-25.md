# Pipeline Finalize synchronous-BGM owner migration — Step-0 audit

Date: 2026-08-25  
Status: `IMPLEMENTED_AND_VERIFIED`

## Former defect, now resolved

The former synchronous beat-sync branch raw-pushed BGM overlays after the
initial project save. It also wrote `musicCoveragePlan`, its intelligence
projection, and `updatedAt` without a user predicate, ProjectService revision,
delivery identity, replay receipt, safe rebase decision, or rendered-mix proof.

The BGM is generated from a real coverage plan and may carry beat evidence.
That material is valid input to the existing audio owner. The bounded migration
now lands it through that owner rather than a raw project append.

## Existing authority verified

`ProjectService.commitPipelineAudioDeliveryV1` already owns BGM attachment:

- exact writer-issued revision and canonical visual-timeline binding;
- stable delivery-id replay handling;
- audio-only safe rebase and visual-timeline block;
- normalized/atomic BGM overlays and music-coverage persistence;
- project revision/receipt advancement; and
- `UNVERIFIABLE / NO_RENDERED_AUDIO_OR_MIX_PROOF` until a real audio/mix proof
  exists.

The asynchronous audio worker uses that command after taking a snapshot and
binding `projectPipelineAudioTimelineBindingHashV1`. The synchronous finalizer
has the same BGM material and now supplies both inputs to the owner. A second
BGM command remains prohibited.

## Step-0 cleanup audit

No unrelated cleanup is justified before this migration:

| Item checked | Result |
| --- | --- |
| synchronous BGM generation and conditioned-audio validation | Live: it supplies the generated asset and rights material. |
| beat-grid analysis and BGM coverage overlay construction | Live: it supplies delivery evidence and the existing finalizer behavior. |
| media-asset registration | Live, specialized media-asset ownership; out of scope for timeline mutation. |
| `commitPipelineAudioDeliveryV1` and its audio-worker caller | Live canonical owner; reuse, do not modify or duplicate. |
| asynchronous BGM/SFX dispatch | Live independent path; out of scope except for an explicit degraded outcome after a blocked synchronous attachment. |
| finalizer project metadata/lifecycle writes | Separate residual writer family; do not bulk-migrate through this audio slice. |

The finalizer route is over 300 lines. Its retained setup, generation and
fallback code is live, so a broad cleanup/refactor would obscure this safety
migration.

## Implemented narrow migration shape

The implementation touched only the synchronous beat-sync BGM producer and
its focused tests.

1. After the finalizer's own current metadata writes and immediately before
   starting synchronous BGM generation, take one
   `ProjectService.loadProjectForMutation(userId, projectId)` snapshot and
   derive `projectPipelineAudioTimelineBindingHashV1` from that snapshot.
2. After generation, coverage overlay construction and media-asset registration,
   derive one deterministic `audio-delivery_…` identity from the project,
   storyboard, generated audio asset, planning binding and coverage material.
   It must be valid under the existing audio-delivery pattern and must not be a
   second registry or job store.
3. Call the existing `commitPipelineAudioDeliveryV1` with that snapshot
   revision, binding hash, delivery ID, `BGM`/`ATTACHED`, the prepared BGM
   overlays, the coverage plan, the measured beat frames, and no invented
   warning material.
4. Remove the raw project `$push`/`$set` BGM write. Only an `APPLIED` or
   byte-identical replay result may update the finalizer's local `overlays`
   variable and set `bgmSyncCompleted`.
5. If the existing owner blocks because the visual timeline changed, emit the
   current explicit degraded warning and use the existing asynchronous path;
   do not raw-attach the already-generated BGM.

## Required verification — satisfied

1. The synchronous path passes an expected revision and a binding hash made
   from the same pre-generation snapshot to the existing audio owner.
2. It sends only a valid deterministic `audio-delivery_…` identity and one
   `BGM`/`ATTACHED` command with coverage/beat material.
3. No finalizer raw project update can push a BGM overlay or set music coverage
   after the new owner call.
4. A replay does not add a second overlay; a visual-timeline change results in
   the existing explicit degraded/async outcome, not a local overlay write.
5. Existing audio-owner tests still prove audio-only safe rebase, visual-change
   block, receipt and proof semantics. The finalizer wiring and core audio-owner
   suites pass 36/36; repository `pnpm exec tsc --noEmit` and
   `pnpm exec eslint . --quiet` pass.

## Non-claims

This does not migrate finalizer name/status/brief metadata, asset registration,
credit settlement, asynchronous dispatch, SFX, BGM taste/mixing, rendered mix
proof, rational timebases, source identity, or the broader canonical media
spine.
