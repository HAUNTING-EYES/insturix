# ADR: Canonical editorial spine and durable workflow

- **Date:** 2026-08-10
- **Status:** accepted as target architecture; no runtime wiring authorised
- **Scope:** Editron on `infrastructure-improvs-+Editron` at
  `b3015b2116794956ceb4764f3da1bd6e9f67c712`
- **Supersedes:** no existing runtime; it constrains future migration work
- **Related:** IF1 freeze tag `editron-interface-freeze-1`, final execution
  plan, and the Slice 1 producer-to-proof ledger

## Decision in one sentence

Editron will use one ProjectService-owned, versioned project/sequence
projection and one durable job record per long-running command; QStash may
deliver work, but it cannot be the job, project, command, revision, proof or
completion authority.

## Context proven by the current code

The codebase has useful foundations, but not one editorial spine:

- `lib/editron/services/project-service.ts:265-325` saves a full editor state
  and merges worker-added overlays; it does not require a canonical expected
  revision for every editor write.
- `ProjectService.replaceOverlayFamilyAtomic` at `:697-733` has a narrow
  `updatedAt` compare-and-swap. `addOverlay`, `updateOverlay`, whole-state
  save and metadata updates still have differing conflict/receipt behaviour.
- The IF1 tag freezes opaque project revisions, project-scoped timeline
  identity, normalized command hashing, receipt observability, proof status and
  retry/undo vocabulary. Its ProjectService issuer boundary remains
  intentionally non-wired.
- Current workers use QStash as transport. The video-analysis worker directly
  publishes downstream workers
  (`app/api/internal/workers/video-analysis/route.ts:974-1012`), while the
  TRIBE worker defends duplicate delivery with a project-local stale lock
  (`app/api/internal/workers/tribe-analysis/route.ts:66-89`).
- MG render jobs have a stronger but family-specific durable record with an
  idempotency key and lease
  (`lib/editron/motion-graphics/codegen/mg-render-job-service.ts:39-56,133-220`).
  Similar structures are not yet a shared product workflow contract.

Keeping these as separate final authorities would recreate the failures mapped
in the overlay ledger: differing UI/chat/auto-edit writes, false completion,
and incompatible saved project state.

## Decision 1: authoritative state and projection

The authoritative persisted facts are:

1. immutable source/master identities and approved external references;
2. the ProjectService-issued **project revision**; and
3. the project-scoped, normalized **sequence/timeline projection** derived from
   that revision.

Analysis, transcripts, OCR, object detections, model summaries, visual taste
scores and external search results remain versioned, fallible observations.
They may support a proposal but cannot silently rewrite project truth.

The target project projection has these logical records. This is a design
contract, not a new schema implementation in this ADR.

| Record | Owns | Must not own |
|---|---|---|
| `Project` | project identity, access scope, schema version, current opaque revision and sequence references | raw decoded IF1 revision outside ProjectService |
| `Sequence` | project-scoped sequence identity, timebase, source/reel references and ordered tracks | a second project document or write-side numeric revision |
| `Track` | semantic role and ordered compositing/audio lane | visual stacking inferred from a UI row number |
| `TimelineItem` | typed source/timeline frame range, media/asset reference and form-owned parameters | resolver-independent duplicate form data |
| `ProjectMutationReceipt` | command identity, revision before/after/current-on-conflict, changed paths, undo/checkpoint and proof obligation/result | a second journal/checkpoint/proof store |

`row` remains a legacy editor-layout detail until migrated. It must not define
the semantic compositing order of generated MG, captions, video or transitions.
The MG row/z defect from Slice 1 is therefore an instance of this design gap,
not a reason to add more per-type row exceptions.

## Decision 2: the one command and proof lifecycle

UI, chat, automatic planning and authorised manual operations all submit the
same typed canonical command to ProjectService through adapters. The planner
proposes intent and evidence; the family resolver owns final legal form; neither
directly writes the project document.

```text
proposal -> resolver/preflight -> ProjectService CAS write -> receipt
                                      |
                                      +-> APPLIED_PENDING_PROOF
                                                   |
                                      +------------+-------------+
                                      |                          |
                                  VERIFIED               UNVERIFIABLE / FAILED
```

The visible lifecycle does **not** change IF1 proof semantics:

| State | Meaning | Retry/undo rule |
|---|---|---|
| `REJECTED` | preflight, rights, access, target or revision check failed; no write occurred | re-read/re-resolve/re-authorise as declared |
| `APPLIED_PENDING_PROOF` | canonical CAS write succeeded and required asynchronous proof is outstanding | reuse the same operation and idempotency key; never apply the mutation again |
| `VERIFIED` | applied receipt has the required IF1 proof result `PASS` | success may be shown to the user |
| `UNVERIFIABLE` | applied receipt has missing/inconclusive proof result `UNVERIFIABLE` | visible review state, never success; retry only the declared proof/job work |
| `FAILED` | a preflight, mutation or proof failed | compensate only through a declared safe inverse; otherwise preserve state and return structured unsafe-undo/non-retryable disposition |
| `CANCELLED` | a durable job was cancelled before a declared terminal effect | record the cancellation and what, if anything, was already applied |

`PASS`, `FAIL` and `UNVERIFIABLE` remain the only proof statuses. “Not
required” remains a proof-policy/receipt disposition, never a fabricated proof
status. A tool return, worker enqueue, toast, local preview or degraded render
is not `VERIFIED`.

## Decision 3: revision, conflict, retry and human precedence

Every canonical command carries the IF1 project reference and, where relevant,
the project-scoped timeline projection/timebase reference. ProjectService is
the only component allowed to decode, compare-and-swap and issue the next
native project revision.

| Situation | Required result |
|---|---|
| Expected project revision is stale | no mutation; receipt identifies `currentProjectRevision`; retry only after reload |
| Timeline projection is stale but project remains valid | re-resolve the target against the new projection; do not reuse old frame coordinates blindly |
| Same actor/project/operation arrives again | return or continue the original receipt/job; do not create a second write or billable job |
| A transient failure is proven zero-mutation | retry only with the same command and idempotency key |
| A failed effect has no declared safe inverse | retain the receipt and return the IF1 unsafe-undo/never-retry disposition |
| An authorised user directly changes a form | user command takes precedence over planner ranking and is auditable; safety, rights and access rules still win |

Manual authoring is therefore a canonical escape hatch, not an alternate
automatic mutation system. Client approval has the same precedence as an
authorised explicit user decision, with actor, timestamp and reason recorded.

## Decision 4: durable job record and QStash role

Every long-running operation has exactly one durable job record owned by the
canonical workflow layer. Its minimum fields are:

```text
jobId, version, tenant/org, projectId, parent command/receipt,
idempotencyKey, input and dependency bindings, state, attempt/lease,
retry cursor, cancellation request, budget reservation, dispatch handle,
emitted events, terminal result/error and proof linkage
```

QStash is allowed to carry a message to a worker. It is not allowed to be the
only record of the job or its outcome. A worker must claim the durable job
before work, renew or release its lease as required, observe cancellation at
safe checkpoints, and write the terminal receipt/event through the canonical
owner. A repeated delivery without a valid claim must be a harmless no-op.

Cancellation is honest: `cancelRequested` means the owner received a request;
`CANCELLED` appears only after the worker reaches a safe checkpoint and the
owner records its actual terminal effect. Browser polling cancellation is not
remote cancellation.

### Current QStash decision

**Retain QStash temporarily as an adapter/transport; do not expand it as a
workflow authority.** It already provides signed worker delivery in parts of
the product and existing code has local duplicate protection. It does not yet
demonstrate a shared operation record, common cancellation semantics,
project-revision binding, receipt linkage, or uniform observability across
families.

| Requirement | Current evidence | ADR disposition |
|---|---|---|
| Signed dispatch | `verifySignatureAppRouter` exists on QStash workers | retain |
| Duplicate delivery defence | route-local locks and MG-specific leases exist | adapt into shared durable claim semantics |
| Idempotency | MG and some chat jobs have keys | generalise through one job record; do not copy another per-family store |
| Retry/resume | mixed route retry headers and job-specific sweepers | make durable record authoritative, then evaluate transport fit |
| Cancellation | no uniform durable cancellation owner | add to contract before claiming cancellation |
| Command/revision/proof binding | absent across the general QStash chain | required before a worker can produce a completed edit |

No new queue is created by this ADR. If QStash later fails the measured
transport requirements, replacement is a separately approved infrastructure
decision; the durable job record remains unchanged.

## Decision 5: saved-project migration

Every project projection gains a versioned schema/migration envelope before a
writer is retired. The migration rules are:

1. readers accept the old supported version through an adapter;
2. migration is explicit, idempotent and recorded with source/target versions,
   actor, timestamp and reversible input/reference where feasible;
3. a write uses ProjectService CAS against the expected current revision;
4. a failed migration does not partially replace the user's playable project;
5. a renderer keeps temporary compatibility only for supported older forms;
6. removal requires import search, golden saved-project fixtures and a declared
   sunset version/date.

This prevents “move it to legacy” from corrupting an existing project merely
because a newer resolver exists.

## Non-decisions and explicit prohibitions

This ADR does not:

- implement the IF1 adapter or alter the frozen IF1 contract;
- choose Gemini or any other model provider;
- create an ExecutionGraph, private Mongo writer, MutationGate/journal,
  checkpoint store, second registry, second project/timeline or second queue;
- migrate captions, transitions, MG, SFX or media placement; or
- change `degraded_allowed` to strict without a visible receipt/review design.

## Implementation sequence and acceptance evidence

Implementation is intentionally separate from this ADR:

1. write contract tests for the state machine, stale/re-resolve paths,
   idempotency, safe/unsafe undo and proof disposition;
2. introduce a schema reader/version envelope and project/sequence projection
   behind ProjectService, with old-project fixtures;
3. introduce the shared durable job record and adapt one existing worker
   transport without creating a second queue;
4. wire IF1 ProjectService issuance only after the above owner tests prove the
   intended command/receipt behaviour;
5. migrate one overlay family through the contract, compare rendered proof and
   saved-project reload, then repeat.

Acceptance for the first implementation phase requires all of the following:

- same intent from UI and chat yields the same canonical command material and
  one receipt shape;
- stale revision causes zero mutation and exposes the current revision;
- duplicate delivery produces one job/one write/one budget reservation;
- an asynchronous proof failure is visible as `UNVERIFIABLE` or `FAILED`, not
  success;
- user override, safe undo and unsafe undo each leave an auditable receipt;
- an old saved project still renders through its supported adapter; and
- tests prove no new direct project writer was added.

## Consequences

This sequence makes early work slower than adding another overlay helper, but
it is the necessary path to a trustworthy AI editor. Once in place, a model can
plan creative actions across short clips or long projects without being a
mutation authority, and each future capability can advance independently
without reintroducing incompatible project state or false completion.
