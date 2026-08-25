# Pipeline-video worker Step-0 audit — 2026-08-25

## Purpose and boundary

This is the required pre-change audit for the next bounded legacy-project-writer
migration on `infrastructure-improvs-+Editron`. It records current source
behavior only. It does not move a writer, create a ProjectService command,
change a queue, alter user data, authorize model work, or promote Stage 2.5.

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

## Current write and dispatch trace

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
| Generated-video overlay replacement | P0 stale/concurrent project write | It mutates a live timeline overlay outside ProjectService CAS/receipt semantics. |
| Low-quality warning append | Separate derived-evidence ownership question | It is a project-visible fact but has no revision/receipt boundary. It must not be silently bundled with overlay replacement. |
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

This is deliberately not a durable replay ledger, a video-worker delivery
receipt, a ProjectService command, or a fix for a partial QStash publication.
The incoming video worker's raw overlay write, raw quality-warning append and
Director pending-field clear/unsigned handoff remain open P0 work.

The media-assets collection stays its existing owner. Director run lifecycle
stays its existing ProjectService owner. This command must not create a second
project store, checkpoint store, timeline, registry, dispatcher or proof
authority.

## Sequencing and non-claims

The next implementation must first establish where a stable overlay id and
expected source binding are produced at storyboard-finalization time. It must
also locate the current durable dispatch/claim record before choosing whether a
failed publication is represented on the project, batch, or existing Director
run owner. Deleting the fallback alone is not sufficient because it would leave
the cleared pending fields unrecoverable.

The completed producer ingress phase is independent because it has one public
authorization owner and one existing queue/credit owner. It is not a
replacement for the later narrow ProjectService video-delivery command.

This audit does not claim that every worker or every legacy project writer is
now accounted for. It does not certify ProjectService range locks/rebase,
rational media timebases, generated-composition execution, audio mix proof,
long-form processing, or Stage 2.5 readiness.
