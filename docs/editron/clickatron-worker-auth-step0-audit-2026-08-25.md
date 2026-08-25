# Clickatron variation worker authorization — Step-0 audit (2026-08-25)

## Scope and decision

This audit covers the active internal Clickatron variation worker at
`app/api/internal/workers/clickatron/variation/route.ts`.  It is a 1,265-line
generation worker, so it was read sequentially before any structural change.
No dead imports, unused exports, unused props, or disposable debug logging were
found in its pre-change state: its `NextRequest` and `failQueuedJob` imports
are both used by the current failed-signature branch, and its logs record
durable generation, cost, or failure boundaries.

The required next slice is therefore a narrow security correction, not a
general worker refactor.

## Closeout

Commit `dd13ff4db` removes the outer authentication-error catch and exports the
shared verified handler directly. A failed verifier response now returns before
the generation handler; an exceptional verifier failure likewise cannot invoke
the handler. The route no longer imports or calls `failQueuedJob` in its
authentication boundary, so it cannot inspect an untrusted `jobId`, mutate a
variation, or refund credits after a failed signature check.

Focused verification passed: four shared-auth tests and eleven Clickatron
terminal-state tests, followed by repository typecheck and quiet ESLint. This
closes this one Clickatron worker-auth side effect. It does not certify every
internal worker or legacy writer.

## Verified pre-fix control flow

```text
POST(req)
  -> protectedHandler(req)
       -> withInternalQStashWorkerAuth(handler, 'clickatron-variation')
            -> QStash signature verification
  -> catch verification error
       -> req.json()                         // untrusted body
       -> failQueuedJob(body.jobId, ...)
       -> markVariationFailedForJob(...)
       -> refundClaimedJob(...)
       -> 401
```

`withInternalQStashWorkerAuth` correctly returns a structured 503 without
calling its handler when signing keys are absent.  Its underlying QStash
verification can reject an invalid signature before the generation handler
runs.  The outer `POST` catch then performs the side effects above from the
unverified request body.

## Pre-fix concrete risk

An attacker able to reach the internal route with an invalid signature and a
known **queued** Clickatron job ID can make the failed-auth catch attempt to
terminalize the job and issue its refund.  `failQueuedJob` does protect a job
already claimed by a real worker, but that is not sufficient: an unverified
request must not be able to act on a queued job at all.

This is a genuine worker-auth fail-open side effect.  It is unrelated to
ProjectService and must not be solved by creating a parallel job, financial, or
project authority.

## Implemented correction and proof

The route must export the verified wrapper directly:

```ts
export const POST = withInternalQStashWorkerAuth(handler, 'clickatron-variation');
```

After a missing-key or invalid-signature rejection, it must not parse the body,
call `failQueuedJob`, mark a variation, refund credits, invoke Fal, or write
Clickatron state.  Dispatch-time failure remains owned by the authenticated
publisher path (`create-image-job` / session dispatch), where queued-only
failure semantics are appropriate.

The implementation slice must prove both of these claims:

1. The shared auth wrapper prevents its handler from running for a verifier
   rejection.
2. The Clickatron worker has no failed-auth fallback that reads an untrusted
   `jobId` or calls `failQueuedJob`/refund logic.

## Nonclaims

This audit does not certify Clickatron generation quality, provider safety,
brand evidence, content rights, financial reconciliation, or any Editron
timeline/project mutation.  It only establishes the worker-auth boundary that
must be closed before further foundation work is called safe.
