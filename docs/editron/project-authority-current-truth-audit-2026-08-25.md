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

## Direct project-writer inventory

The following live paths still mutate `projects` outside a fully
ProjectService-issued command/receipt boundary:

| Path | Current write role | Current gap |
| --- | --- | --- |
| `app/api/internal/workers/director/route.ts` | Claims `analysis_complete`/`directing_queued` into `directing`, completes the auto-edit status, and records non-assist failure. Director stage progress now enters only through `ProjectService.recordDirectorProgressV1`. | Claim, completion and runtime failure still do not share one typed ProjectService lifecycle. |
| `lib/editron/agent/director-agent.ts` | Carries lease-bound progress receipts and ProjectService action receipts into the final editor save; it still writes intelligence summaries, decision logs, status/audit facts and quality-review data directly. | The progress/final-save revision race is closed, but the intervening legacy facts remain direct Mongo writes without revision advancement or receipts. |
| `app/api/internal/workers/video-analysis/route.ts` and `tribe-analysis/route.ts` | Advance analysis/directing status and persist analysis facts; development fallbacks can run the Director inline. | Many state transitions/evidence writes remain raw and must be migrated by lifecycle, not bulk-wrapped. |
| `app/api/internal/workers/pipeline/audio/route.ts` | Pushes BGM/SFX overlays, beat-aligned overlay state and audio-plan facts. | Direct overlay mutation can bypass writer-issued revision/receipt semantics. |
| `app/api/internal/workers/pipeline/video/route.ts` | Replaces generated-video overlay source/asset fields, adds quality warnings and clears pending Director flags. | Direct project mutation is not coupled to ProjectService revision/receipt semantics. |
| `ProjectService.updateProject` callers | Generic duration and subject-reframe audit writes. | The method still writes without a CAS predicate, revision increment or returned writer receipt. |

This table is a migration ledger, not an assertion that all listed paths have
the same risk or can safely share a generic replacement.

## Why the Director lifecycle is next

The Director route is the highest-risk bounded next owner migration because it
currently splits one lifecycle across two authorities:

```text
route raw claim/status/completion/failure
        +
Director agent lease -> ProjectService progress/action receipts -> final editor save -> Phase-0 proof
```

The raw route claim does not carry a ProjectService revision or receipt. The
raw completion write only checks `autoEditStatus: 'directing'`, so it does not
bind the status transition to the final writer/proof revision. The non-assist
failure update is also a direct terminal project update.

The Director agent already has the useful canonical pieces: a token-bound
lease, a final editor-state CAS, and a Phase-0 proof CAS. The migration must
extend those existing owners; it must not add a parallel Director journal,
checkpoint store, timeline, or generic project-metadata authority.

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

## Next bounded implementation slice

The required Step-0 audit is complete. The next lifecycle implementation must
remain scoped to the Director route and ProjectService, with explicit methods
not a generic worker-status port, for:

1. claiming a run from the allowed analysis states;
2. recognizing an ownership loss without resurrection;
3. completing only against the final writer/proof state; and
4. failing only an active owned run.

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
is lossless. That requires a separate owner-level audit before the Director
can be called fully migrated.

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
