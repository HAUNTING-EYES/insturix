# Pipeline-video worker Step-0 audit — 2026-08-25

## Purpose and boundary

This began as the required pre-change audit for the next bounded
legacy-project-writer migration on `infrastructure-improvs-+Editron`. The
historical trace below preserves what was found before migration; the appended
completed-migration sections record the current source truth. This document
does not authorize model work or promote Stage 2.5.

## Files read completely

- `app/api/internal/workers/pipeline/video/route.ts` (794 lines, read in four
  sequential chunks)
- `app/api/services/pipeline/storyboard/[id]/generate-videos/route.ts` (626
  lines, read in sequential chunks)
- `app/api/services/pipeline/storyboard/[id]/finalize/route.ts` (the
  Director-pending-field producer)
- `app/api/services/editron/director/execute/route.ts` (the internal-dispatch
  authentication consumer)
- `lib/editron/services/project-service.ts` (the existing narrow pipeline
  audio delivery owner)
- `lib/editron/services/pipeline-audio-project-delivery-v1.ts`
- `app/api/internal/workers/pipeline/audio/route.ts`
- `tests/editron/project-pipeline-audio-delivery-v1.test.ts`

The complete pipeline-video worker passes focused quiet ESLint. The Step-0
dead-code pass found no unused import/export or debug-only logging that can be
removed separately without changing behavior. Its operational `console` logs
remain intact because they describe provider work, delivery, quality and
failure states.

## Historical pre-migration write and dispatch trace

```text
browser or chat regeneration request
  -> generate-videos public route
      -> Clerk session, or narrow signed server-chat identity
      -> verify production QStash publisher + worker signature configuration
      -> credit charge + batch/job records
      -> QStash publish (production) or direct development-only fetch
          -> pipeline-video worker verifies QStash in production
finalize route
  -> raw projects.$set pendingDirectorProfileId/pendingDirectorUserId
  -> video worker generates a scene
      -> storyboard update
      -> mediaAssets registration
      -> raw projects.$set overlays.$ by old assetId
      -> raw projects.$push qualityWarnings when low quality
      -> batch complete
          -> raw projects.$unset pending Director fields
          -> QStash publish, or unsigned production fetch fallback
              -> Director execute route verifies QStash in production
```

The generation worker uses a pre-video storyboard snapshot to obtain
`oldAssetId`, then updates the first matching project overlay through:

```text
{ projectId, 'overlays.assetId': oldAssetId }
```

That update has no user predicate, expected ProjectService revision, durable
overlay identity, idempotency key, canonical mutation receipt, changed-path
record, range effect, or proof disposition. Retrying the same raw update after
one second does not close a concurrent user-edit race. A later user replacement
of the same overlay can be overwritten or a project with a reused asset id can
select the wrong overlay.

At batch completion, the worker clears both pending Director fields before it
knows that dispatch has been accepted. In production without `QSTASH_TOKEN`,
it calls the Director route with `_internal: true` but no `upstash-signature`.
That route deliberately returns `401` for an unsigned internal request (or
`503` when signing keys are absent). The worker does not await or inspect the
response and logs a successful dispatch. The pending fields have already been
cleared, so there is no durable retry signal. This is a false-success/lost-work
path, not an incoming unauthenticated-handler execution path.

Before `938d441b2`, the producer had two earlier failures. The public
`generate-videos` route used a Clerk result when present, but accepted a
caller-supplied `body.userId` when Clerk had no session. Its server-side chat
caller relied on that fallback because it made an HTTP request without the
browser session. The same fallback permitted an untrusted caller to select
another user's storyboard identity.

Before that commit, the producer also created batch and job records after
deducting credits. Outside development, a missing `QSTASH_TOKEN` took an
unsigned, fire-and-forget `fetch` branch. The video worker correctly rejected
it because it required QStash verification, but the producer returned a
successful queued batch. The batch could remain queued and charged without a
signed delivery.

## Root-cause classification

| Concern | Classification | Why |
| --- | --- | --- |
| Generated-video overlay replacement | **Closed by `f1a0d3078`** | The producer now snapshots exactly one overlay ID, expected asset and ProjectService revision before credits; the worker delegates delivery to `commitPipelineVideoDeliveryV1` and stores an explicit outcome. |
| Low-quality warning append | **Closed by `145cfc988`** | The worker now asks the narrow ProjectService warning owner to append one job-bound fact under user-scoped CAS, replay/material checks and a writer-issued receipt. The score classification itself remains an uncalibrated analysis concern. |
| Public `body.userId` fallback | **Closed in bounded ingress slice `938d441b2`** | Browser calls remain Clerk-scoped. A no-session caller now needs a fresh HMAC bound to this action and the exact raw body; an arbitrary external identity is rejected. |
| Video enqueue without QStash configuration | **Closed in bounded ingress slice `938d441b2`** | Outside development, the route checks the publisher token and both worker verification keys before credits, batch records or a claimed queue response. |
| Director pending-field clear plus fallback fetch | P0 false success / lost downstream work | The only durable trigger is erased before a verifiable signed handoff exists. |
| Inbound video-worker QStash authentication | Not newly proven fail-open | Production chooses `verifySignatureAppRouter` when keys exist and rejects on missing keys. This older form remains a consistency audit item. |

## Required owner shape

Do **not** route this through generic `ProjectService.updateOverlay` or
`ProjectService.updateProject`. Those paths do not carry the worker's expected
source binding, delivery idempotency, generated-asset provenance, or an
operation-specific proof disposition.

The eventual migration needs a narrow ProjectService-owned pipeline-video
delivery command with, at minimum:

1. the worker's project/user identity and writer-issued expected revision;
2. a durable overlay id and expected pre-delivery source asset identity;
3. generated asset identity, URL/duration and native-audio/rights/receipt
   provenance;
4. delivery-id idempotency and a byte-stable delivery material hash;
5. CAS conflict/no-write behavior when a user has changed the target;
6. before/after revision, changed paths, range effect and an honest rendered
   proof disposition in the issued receipt; and
7. a separate durable Director-dispatch state transition that clears or claims
   the pending signal only after a signed queue publication/claim is recorded.

Before the project-writer command is introduced, the enqueue producer required
a separate ingress correction:

1. browser requests authenticate only as their Clerk user;
2. the server-side chat caller carries a short-lived, action-and-body-bound
   signature using the existing server-only monolith secret; and
3. production checks the QStash publisher token and worker signing-key pair
   before credit deduction, job creation or a claimed queued response. Local
   development may retain its direct worker call.

### Completed bounded ingress correction

Commit `938d441b2` implements that producer correction without changing the
worker's project delivery path. The chat server signs the exact JSON request
with a fixed `pipeline-video-enqueue-v1` action identity, issue timestamp and
the existing server-only monolith secret. The public route verifies that
two-minute, action-and-body-bound proof only when Clerk has no user session;
it then accepts the signed `userId` from that same body. It does not restore a
general internal authorization mechanism or a browser identity fallback.

The production dispatch policy requires the QStash publisher token and both
verification rotation keys before `CreditsService.hasCredits`, deduction, job
creation or the queued response. Direct fetch is now development-only. Focused
chat/ingress, video-generation and financial suites passed 23/23; repository
typecheck and quiet ESLint passed.

The ingress correction itself was deliberately not a durable replay ledger, a
video-worker delivery receipt, a ProjectService command, or a fix for a
partial QStash publication. At the time this historical paragraph was written,
the incoming worker's raw overlay write, raw quality-warning append and
Director pending-field clear/unsigned handoff remained open. Later sections
record the bounded closure of each of those three paths; they do not close the
other legacy-writer or recovery gaps.

The media-assets collection stays its existing owner. Director run lifecycle
stays its existing ProjectService owner. This command must not create a second
project store, checkpoint store, timeline, registry, dispatcher or proof
authority.

### Completed owner-contract phase

Commit `3d4852e46`, corrected by `6ea12538a`, introduces the narrow
`ProjectService.commitPipelineVideoDeliveryV1` boundary and pure delivery
material helper. It accepts only a worker-issued target `{ overlayId,
expectedAssetId }`, an exact expected project revision, canonical replacement
material and a delivery identity. It writes one exact overlay replacement with
an idempotency receipt, a writer-issued after-revision, changed paths, an
exact project-frame range effect and the explicit
`UNVERIFIABLE / NO_RENDERED_VIDEO_PROOF` disposition.

The owner now permits one **target-preserving** retry, not a broad project
rebase. It records the producer's `requestedRevision`, the actual
`beforeRevision` used for the write, and `FRESH` or
`SAFE_REBASED_TARGET_UNCHANGED`. A stale delivery may apply only when the exact
overlay ID is still a video and still has the exact expected source asset; the
replacement is rebuilt from that current overlay so unrelated user changes are
preserved. A missing target, non-video target, target asset change, duplicate
delivery with different material, or second CAS loss returns a structured
no-write failure. Native-audio output requires matching generated-audio rights
and FFmpeg probe evidence. A provider that produces neither native audio nor a
generation receipt can land only with both fields absent; the command does not
invent provenance.

Focused ProjectService delivery/range tests passed 27/27, followed by
repository typecheck and quiet ESLint. At this point the contract itself was
not yet connected to the worker.

### Completed runtime migration — exact video overlay only

Commit `f1a0d3078` connects the owner without creating another project or
timeline authority. Before a credit charge, the producer resolves each existing
storyboard asset to exactly one numeric video overlay in a single
`ProjectService.loadProjectForMutation` snapshot. Missing, ambiguous or
non-numeric existing targets return `409` before charge or enqueue. Initial
generation with no prior asset and pre-finalize/legacy storyboard IDs continue
without a project-delivery target because the later finalize path owns
insertion.

The signed worker payload carries the project ID, snapshot revision, exact
overlay/asset target and deterministic delivery ID. After generation it keeps
media-assets registration in its existing owner, then calls
`commitPipelineVideoDeliveryV1`; it never reads the storyboard to rediscover a
target and contains no raw `overlays.$` replacement or retry. `APPLIED`,
`ALREADY_APPLIED`, and `CONFLICT` outcomes are persisted on the video job and
returned to the worker caller. An unexpected owner failure fails the job; a
target conflict cannot silently claim project delivery succeeded.

Focused target/wiring, delivery, cost and batch suites passed 17/17, followed
by repository typecheck and quiet ESLint. At that commit, this migration did
**not** move the low-quality warning append or Director pending-field
clear/dispatch; the later bounded migrations are recorded next.

### Completed derived-warning migration

Commit `145cfc988` moves only the low-quality project warning through
`ProjectService.recordPipelineVideoQualityWarningV1`. The existing analysis
owner still decides whether its inherited `< 40` score is low; ProjectService
does not recalibrate, reinterpret, or silently discard that score. It validates
the bounded job/batch/storyboard/asset material before any project read, derives
one stable `(projectId, jobId)` identity and material hash, and appends exactly
one V1 entry to the existing legacy-compatible `qualityWarnings` field.

The command is user-scoped and revision-CAS-protected. A replay with identical
material returns the original writer-issued receipt without a second write; a
reused job identity with different material fails. A stale worker can rebase
only this additive warning over newer unrelated project state, and its receipt
records the requested, before and after revisions plus `FRESH` or
`SAFE_REBASED_ADDITIVE_WARNING`. A lost final CAS race fails closed. The worker
no longer writes `projects.qualityWarnings` directly.

The warning's proof disposition is deliberately non-rendered:
`DERIVED_ANALYSIS_WARNING_NOT_RENDERED_ACCEPTANCE_PROOF`. Repository search
found no current product/UI consumer for `qualityWarnings`; this migration does
not invent one, establish score calibration or retention policy, prove the
rendered scene is bad, or solve audio/mix/delivery quality. Focused
ProjectService/video-delivery/Director regression coverage passed 22/22, with
repository typecheck and quiet ESLint passing.

## Sequencing and non-claims

The remaining pipeline-video safety work must address the raw finalize producer
of the pending Director signal, generic project-status writers, a transactional
publication/recovery owner, and the rest of the legacy-writer inventory. The
completed Director handoff prevents this worker from erasing its durable signal
before a signed claim; it is not an outbox or automatic recovery driver.

The completed producer ingress phase is independent because it has one public
authorization owner and one existing queue/credit owner. It is not a
replacement for the later narrow ProjectService video-delivery command.

This audit does not claim that every worker or every legacy project writer is
now accounted for. It does not certify generic ProjectService range locks/safe
rebase,
rational media timebases, generated-composition execution, audio mix proof,
long-form processing, or Stage 2.5 readiness.
