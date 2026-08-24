# Project-authority current-truth audit — 2026-08-25

## Purpose and boundary

This is a read-only current-truth audit of the active
`infrastructure-improvs-+Editron` branch. It records the next production-risk
writer boundary after the Director-delivery-failure migration. It does not
migrate a writer, create a new authority, authorize model inference, or make a
Stage 2.5 promotion.

## HREF-01 closure verified

The sole project-owner review is already formally closed by the qualified
receipt
`f699348094d84079765115556b9b9746ef6a51eccdc79ff7fddecf49ee992d88`:

- all nine rubric requirements are `PASS`;
- no hard failure was observed;
- the correction estimate is zero minutes; and
- independent agreement remains
  `UNVERIFIABLE_SINGLE_REVIEWER`.

The receipt binds the full 64.75-second reference, the `[20s,23s)` dense
60/1 motion window, and the companion audio. The finalizer test passes 12/12.
This is qualified Stage 2.5 research evidence only. It does not certify a
model, product mutation, reference-understanding policy, or production route.

## Worker-ingress result

The audited direct raw-fallback cases are already closed by the current
shared `withInternalQStashWorkerAuth` wrapper. A missing rotation key produces
a configuration failure rather than invoking the raw handler for the eight
previously audited workers.

The remaining worker routes use two older implementation shapes:

1. A module-time `verifySignatureAppRouter` selection with an explicit
   missing-key response in non-test production.
2. A development-only direct handler with a non-development secure handler
   when signing keys are unavailable.

The source audit found no additional route whose production missing-key branch
falls through to its raw handler. These older shapes are still a consistency
and deployment-observability concern: some return 500 instead of the shared
503 contract and capture environment configuration at module load. They are
not, from the code inspected here, a newly established production fail-open.

### Bounded audio-dispatch correction

`lib/editron/services/audio-worker-dispatch.ts` is a separate ingress boundary
from the worker route. It previously reported `dispatched: true` after an
unsigned fire-and-forget `fetch` whenever QStash was unavailable, including
outside development. Its two callers use that result to record audio work as
queued and, in the storyboard path, decide whether to refund a precharged
audio credit.

The dispatcher now requires a non-empty QStash publisher token and the same
current/next signing-key pair required by the worker before it reports a
production dispatch. Missing configuration returns the explicit
`{ dispatched: false, method: 'none' }` result without calling either QStash
or `fetch`. The local direct-fetch path remains development-only. Focused
adversarial tests cover missing publisher token, incomplete signing keys,
valid signed QStash dispatch and local development dispatch.

This closes one false-success ingress claim. It does **not** make the legacy
audio worker a ProjectService owner, serialize BGM and SFX, or establish audio
render/proof correctness.

## Direct project-writer inventory

The following live paths still mutate `projects` outside a fully
ProjectService-issued command/receipt boundary:

| Path | Current write role | Current gap |
| --- | --- | --- |
| `app/api/internal/workers/director/route.ts` | The automatic QStash route now claims, completes and fails only through `ProjectService`'s durable-run commands. It binds completion to the executor's last writer receipt and skips bookkeeping after ownership loss. | Assist handoff remains a legacy direct write by design; recovery/rescue and non-QStash Director callers are separate migrations. |
| `lib/editron/agent/director-agent.ts` | Carries lease-bound progress receipts and ProjectService action receipts into the final editor save; it still writes intelligence summaries, decision logs, status/audit facts and quality-review data directly. | The progress/final-save revision race is closed, but the intervening legacy facts remain direct Mongo writes without revision advancement or receipts. |
| `app/api/internal/workers/video-analysis/route.ts` and `tribe-analysis/route.ts` | Advance analysis/directing status and persist analysis facts; development fallbacks can run the Director inline. | Many state transitions/evidence writes remain raw and must be migrated by lifecycle, not bulk-wrapped. |
| `app/api/internal/workers/pipeline/audio/route.ts` | Pushes BGM/SFX overlays, beat-aligned overlay state and audio-plan facts. | Direct overlay mutation bypasses writer-issued revision/receipt semantics. BGM can later read and replace the complete overlay array for beat alignment after SFX independently appends, so an intervening SFX append can be lost. |
| `app/api/internal/workers/pipeline/video/route.ts` | Replaces generated-video overlay source/asset fields, adds quality warnings and clears pending Director flags. | Direct project mutation is not coupled to ProjectService revision/receipt semantics. |
| `ProjectService.updateProject` callers | Generic duration and subject-reframe audit writes. | The method still writes without a CAS predicate, revision increment or returned writer receipt. |

This table is a migration ledger, not an assertion that all listed paths have
the same risk or can safely share a generic replacement.

## Completed automatic Director lifecycle migration

Commit `bbc74cd8e` closes the highest-risk bounded automatic lifecycle seam.
The old split was:

```text
route raw claim/status/completion/failure
        +
Director agent lease -> ProjectService progress/action receipts -> final editor save -> Phase-0 proof
```

It is now:

```text
ProjectService claim(run token + receipt)
        -> Director lease/progress/action/final writer receipts
        -> ProjectService complete(exact run token + terminal receipt)
           | fail(exact active run token)
```

The executor returns the real latest receipt, including a final durable-progress
receipt when one follows Phase-0. The QStash caller defers the executor's legacy
raw `status` transition, preventing its `updatedAt` write from invalidating that
receipt before lifecycle completion. No parallel Director journal, checkpoint
store, timeline, or generic project-metadata authority was added.

## Completed progress/revision repair

Commit `8823a676a` makes Director progress a specific lease-bound
`ProjectService` command. It validates an exact expected revision, active lease
token, `autoEditStatus: 'directing'`, bounded `0..99` progress and a bounded
stage description. A lost compare-and-swap, rescued project, wrong lease or
stale revision returns no receipt and fails closed.

`executeDirectorPlan` awaits each opt-in progress command, validates the
contiguous receipt chain emitted by its own ProjectService action tools, and
uses the resulting current revision for its final editor save. The QStash
Director route only logs progress. Other Director callers are observer-only,
so they do not accidentally persist a stage on a non-`directing` project.

This is intentionally not a generic worker-status port and creates no second
project, timeline, journal, checkpoint or proof owner.

## Lifecycle Step-0 and completed bounded implementation

The required lifecycle Step-0 audit is recorded in
[director-lifecycle-step0-audit-2026-08-25.md](./director-lifecycle-step0-audit-2026-08-25.md).
Commit `a0cb07556` separately removes the one dead Director progress type
export found during that audit. Commit `f233ec379` implements the explicit
ProjectService claim/completion/failure owner methods and adversarial owner
tests. Commit `bbc74cd8e` wires the QStash route and executor result boundary
to those methods. Focused owner/route/decision-wiring verification passes
44/44 with repository typecheck and quiet ESLint.

The durable run identity is distinct from the short-lived Director writer
lease. The final ProjectService save intentionally clears the lease token;
completion instead needs the exact final writer/proof receipt plus a durable
run token. A lost run must return a no-write ownership-loss disposition, never
fall back to a raw terminal update.

Assist refund/settlement, upload-batch aggregation, inline-development
Director execution, raw analysis facts, generic range locks/rebase, and the
remaining worker families are deliberately outside that first migration. Each
needs its own owner and atomicity design.

## Known remaining reconciliation limit

The Director's existing final overlay merge recognizes newly added overlays
and transition keyframe tracks from the fresh project read. It is not yet a
general field-level three-way reconciliation for every legacy action/tool
mutation. The new receipt chain prevents a stale final CAS from pretending to
be current; it does not certify that every legacy in-memory/direct-write merge
is lossless. That requires a separate owner-level audit before the broader
Director execution path can be called fully reconciled.

## Non-claims

- `cut_section` now reports a full pre-cut ripple range and a distinct
  post-cut preview range, but range locks, safe rebase and generalized
  invalidation are still absent.
- The current numeric FPS timeline is not a rational/mixed-rate/VFR/timecode
  media spine.
- No direct writer listed above is certified merely because its behavior was
  located in source.
- No Stage 2.5 paid run, historical cohort rerun, or production model-driven
  mutation is authorized by this audit.
