# Editron durable editorial orchestration spike

Date: 2026-08-23

Status: **architecture decision plus non-wired implementation chain; zero inference; no product mutation**

Authority: refines the durable-control-plane portion of the
[final execution plan](../../EDITRON_FINAL_EXECUTION_PLAN_2026-08-10.md) and the
[agentic editorial planning contract](./oe-agentic-editorial-planning-and-benchmark-reconciliation-2026-08-17.md).
Code and executable receipts remain the implementation authority.

## Decision

Editron will own one tenant/project-scoped, Mongo-backed `PlanService` for
accepted Sequence/Range Plan revisions and their bounded episode definitions.
The existing shared durable-workflow job record remains the execution-state
owner. QStash remains a replaceable delivery transport. `ProjectService`
remains the only project/timeline mutation owner.

Upstash Workflow, Vercel Workflow/`WorkflowAgent`, JCode and OpenCode are not
selected as plan or project authorities. A later adapter may use their
step/session/approval mechanics only when it proves that its state is a
rebuildable execution projection bound to exact PlanService and ProjectService
revisions.

This is a choice of ownership boundaries. The first non-wired PlanService
contract and persistence slices now exist, but the current durable path is not
production-ready and no live workflow reaches the store.

## Current code evidence

| Concern | Verified current owner/status |
| --- | --- |
| Canonical project/timeline | `ProjectService`; incomplete IF1-wide migration remains |
| Chat history | Mongo `chatSessions`; messages/tool records, not a plan DAG |
| Long-running family jobs | Several family-specific Mongo/QStash paths |
| Shared execution lifecycle | `EDITRON_DURABLE_WORKFLOW_JOB_V1_1`: input/dependency/budget bindings, idempotency, leases, cancellation, retries, resume CAS and terminal proof references |
| Research episode definition | `e3ac9b082`: serialized manifest-bound value plus strict resolver; not a product store |
| Product editorial PlanService | Contract/validator exists at `a012e226e`; `0c94bc059` adds immutable storage; `9687dbd9f` binds accepted work; `d16caaa5b` revalidates it; `b9cf5e820` proves process portability; `c69a845ea` enforces lifecycle gates; `aff06c8d4` persists owner review wait/wake revisions. No authenticated review route or live Atlas/QStash proof exists. |
| Project proposal clone/proof | `b50f9f9fa` adapts the existing `ProjectService.loadProjectForMutation` paired snapshot/revision boundary to the durable research clone contract, executes only a supplied in-memory owner, detects revision-visible and relevant revision-invisible canonical drift, and binds the final diff receipt into the durable terminal proof references. `a9882903a` separately hash-binds the unchanged canonical base revision/state and the isolated working revision/state. `270792c1a`, `d143da69a` and `df61e818d` add compact writer/state recovery, durable enforcement and pure committed-writer replay; `9f955033e` proves the path across two OS processes with zero inference and no canonical mutation. Product/live wiring remains blocked on the later gates below. |
| Product workflow ingress/recovery | Missing authenticated shared ingress, QStash dispatch and live Atlas/QStash proof |

The existing `lib/services/planService.ts` manages commercial subscription
plans. It is not an editorial PlanService and must not be extended or renamed
for this purpose.

## Options tested against the same ownership requirements

### A. Native PlanService plus existing shared job spine — selected

Strengths:

- matches the repository's deployed Next.js, Mongo and QStash stack;
- preserves tenant/project scope beside canonical application data;
- keeps plan revisions independent of transient provider/session state;
- reuses the already tested job identity, lease, retry, cancellation, resume
  and terminal-receipt contract;
- requires no new workflow dependency before the domain contract is proven.

Completed foundation:

- `a012e226e` freezes strict canonical plan revisions, bounded DAG validation,
  terminal proof requirements and append/supersede safety checks without
  adding a route, store, scheduler or project mutation.
- `0c94bc059` adds the sole immutable Mongo persistence adapter for accepted
  plan revisions and definitions. It rejects stale/concurrent branches,
  cross-scope reads, copied definition ownership and forged plan-node/envelope
  bindings; it remains non-wired and performs no product mutation.
- `9687dbd9f` creates one idempotent durable job only from the latest accepted
  `READY` revision whose executable node material still matches the exact
  PlanService-issued definition. The job binds the plan, node, definition,
  operation set, direction, ProjectService base, policies and one aggregate
  budget without dispatching or executing it.
- `d16caaa5b` resolves only a leased `running` job, re-resolves its exact plan
  head, node, definition and source plan, and rebuilds the canonical contract
  before any effect. Fresh store instances reclaim an expired lease while
  preserving attempt history; stale leases, duplicate delivery, queued
  unleased resolution and forged recomputed payloads fail closed. This is not
  yet an actual separate-process or live-store proof.
- `b9cf5e820` serializes the real product plan, definition and leased job
  records in process A and hydrates/reclaims/revalidates them in a distinct
  Node process. It preserves attempt history, rejects the old lease and
  duplicate delivery, and rejects outer-envelope and rehashed inner-job
  tampering with zero inference and zero project effects. It remains a test
  adapter proof, not Atlas or QStash certification.
- `c69a845ea` prevents normal dispatch, lease activity and execution at or
  after the durable deadline, terminalizes expired jobs, preserves explicit
  user cancellation cleanup, enforces tenant-scoped cancellation and binds
  approval requirements to an immutable USER-accepted plan revision. It does
  not authenticate that user actor or implement a wait/wake route.
- `aff06c8d4` uses `NEEDS_REVIEW` as the durable PlanService wait and appends
  exactly one owner-scoped `READY_TO_APPLY` or `CANCELLED` successor after an
  exact-head review decision. It provides immutable domain history without a
  sleeping worker or second event store. Session-derived route authentication
  remains open.
- `b50f9f9fa` supplies the first ProjectService-shaped isolated proposal-clone
  adapter and durable receipt handoff. It accepts only the existing paired
  snapshot/revision read, exposes no ProjectService write method, re-reads the
  canonical state before and after every isolated call, rolls back failed
  clone calls, rejects scope/revision forgery and stale bases, and emits a
  hash-bound changed-path/operation receipt only while the canonical base is
  unchanged. The durable worker independently validates that nested receipt
  before completion. Twenty-five durable regression tests, repository
  typecheck and quiet ESLint pass. This is zero inference and zero canonical
  project mutation; the concrete production operator owner and live wiring
  remain absent.
- `a9882903a` fixes the revision-identity collision exposed by honest
  ProjectService wiring. Resume now consumes the isolated working revision,
  not the canonical base revision; missing or forged bindings stop before
  inference. A fresh post-crash clone still lacks prior proposal state and is
  rejected, making deterministic proposal recovery the next P0 at that
  checkpoint instead of a hidden fallback.
- `270792c1a` freezes a compact recovery state rather than persisting a second
  Project snapshot. It binds every writer turn/call/execution/revision to an
  ordered before/after proposal-state hash chain and the exact checkpoint.
- `d143da69a` makes the durable worker restore, extend and atomically persist
  that chain, pass it to the ProjectService clone owner and reject a terminal
  proposal receipt that diverges from any recovered writer.
- `df61e818d` reconstructs a fresh clone only through a separate pure
  `replayCommitted` port. It rejects missing recovery, missing replay ownership,
  changed output/state, canonical drift and unreceipted clone mutations.
- `9f955033e` proves the complete seam across two real Node processes: process B
  makes no prefix provider call, replays one committed writer, executes one
  suffix writer, reaches `local-r44`, preserves the canonical state hash and
  completes with two bound operations. Recovery cluster 36/36, repository
  typecheck and quiet ESLint pass.

Open work:

- remaining artifact resolution for scopes, locks, approvals, reference media,
  runtime budget and rendered proof;
- bind concrete certified/pure operator owners to the proposal clone without
  introducing another operation registry or project authority;
- proposal review/apply/reload through the sole ProjectService CAS remains
  separately gated and unimplemented;
- authenticated review UI/API ingress and authenticated dispatch;
- live Atlas/QStash crash, redelivery and cancellation tests.

### B. Upstash or Vercel durable workflow runtime — transport candidate only

Official documentation describes persisted step results, retry/resume and
approval waits. Those capabilities are useful, but the repository does not
declare the required workflow runtime today. Letting provider workflow state
own the editorial plan would create an external second authority and make
ProjectService/PlanService reconstruction dependent on a vendor log.

A future adapter may pass only if:

- every step binds an exact plan/node revision and ProjectService revision;
- replayed steps cannot repeat an accepted mutation;
- provider state contains no sole copy of a plan, result, approval or proof;
- tenant scope, cost, cancellation and failure receipts round-trip into the
  Editron-owned job record;
- workflow code changes cannot reinterpret already accepted steps.

### C. JCode/OpenCode adaptation — UI/protocol candidate only

Their sessions, permissions, steering, compaction and tool-loop patterns are
useful. Their file/VCS/shell authority and local-workspace assumptions do not
match a multi-tenant web NLE. The existing OpenCode research adapter proves
only provider transport with permissions denied.

No JCode/OpenCode component may own Editron plan state, media identity,
timeline state, credentials or proof. A later UI spike must beat the native web
implementation on measured approval/steering usability without importing those
authorities.

## Frozen owner split

```text
PlanService
  owns accepted plan revisions, node definitions, dependencies, locks,
  approvals, invalidation and plan/node status

DurableWorkflowJobStore
  owns one execution attempt's delivery-independent lifecycle, lease,
  resume checkpoint, retry/cancel state, budget binding and terminal refs

QStash / optional workflow adapter
  delivers or wakes a job; never owns its identity or editorial meaning

ProjectService
  owns canonical project/timeline state, CAS, writer receipt, undo/replay

Evidence / render owners
  own observations and proof artifacts referenced by plan/job receipts
```

An editorial plan revision may create zero or more durable jobs. A durable job
must bind exactly one accepted plan revision and active node definition. A job
may report progress or evidence back through PlanService, but it cannot rewrite
objectives, widen scope, unlock user work or mark itself `VERIFIED`.

## First implementation contract

The smallest product slice must provide immutable, append-only plan revisions:

- exact tenant, actor and project scope;
- `planId`, monotonic `planRevision` and previous-revision hash;
- `ProjectDirectionRevision` and base ProjectService revision bindings;
- an acyclic bounded node graph with observable objectives;
- semantic/source/timeline scope without inventing unresolved ranges;
- dependencies, reads/writes, requirements, products and invalidations;
- preservation/user locks and approval requirements;
- exact execution-definition and eligible-operation-set bindings;
- budgets, `whatHasNotBeenChecked`, preview/proof/receipt references;
- accepted-by provenance and canonical content hash.

PlanService must reject copied tenant/project scope, hash mismatch, stale
expected revision, cycles, duplicate IDs, missing dependencies, unauthorized
scope widening, released locks, invalid lifecycle transitions and a node that
claims `VERIFIED` without server-issued proof.

Commit `a012e226e` implements this first contract/validator slice. It does not
schedule work, persist a plan or mutate a project. It establishes the typed
boundary to which the Mongo store and later job/transport adapters bind.

Commit `0c94bc059` implements the next non-wired persistence slice. The store
accepts immutable initial revisions, append-only successors and execution
definitions bound to an exact accepted plan/node hash. Mongo uniqueness plus
expected-revision checks gives one winner for concurrent successor branches.
The slice adds collection indexes and authorized reads, but no API route,
workflow dispatch, live Atlas exercise, artifact resolver or ProjectService
effect.

Commit `9687dbd9f` implements the accepted-node-to-job binding. The binder
requires an exact current plan revision, a `READY` node, a definition attached
by one successor revision without changing executable node material, an exact
eligible-operation set and one explicit aggregate budget. It writes only the
existing durable lifecycle record. The input carries the expected plan-head
hash, but a later execution adapter must resolve that head and every artifact
again before effects; the plan/job writes are deliberately not presented as
one cross-collection transaction.

Commit `d16caaa5b` implements the execution-time product resolver. It accepts
only a currently leased `running` job, re-resolves the PlanService plan head,
node, definition and source plan, then rebuilds the same canonical job
contract and rejects altered identity, dependencies, scope, budget or payload
hash before effects. The recovery test uses newly constructed stores over one
shared persisted test collection and proves lease expiry/reclaim, attempt
continuity, old-lease rejection and duplicate-delivery suppression. It does
not prove a separate OS process, Atlas, QStash, provider inference or a
ProjectService effect.

Commit `b9cf5e820` completes the serialized separate-process product proof.
The preparing process creates and leases the actual product binding, writes a
hash-bound Mongo-shaped envelope and exits. A second process hydrates fresh
stores, reclaims the lease and passes the existing product resolver without
provider inference or ProjectService access. This proves process portability,
not live Atlas persistence, QStash delivery or authenticated ingress.

Commit `c69a845ea` implements the first product lifecycle gates. It makes
expiry fail closed across dispatch, claim, heartbeat and recovery; preserves a
prior user cancellation across deadline and lease expiry; and requires USER
lineage for approval-bound job creation. The remaining approval boundary is
authentication and durable wait/wake—not another plan or job authority.

Commit `aff06c8d4` completes the domain wait/wake transition: immutable plan
revisions are the review event history, and raw SYSTEM/MODEL promotion is
rejected. It does not claim that the not-yet-wired web route authenticated the
actor.

Commit `b50f9f9fa` implements the non-wired ProjectService proposal-clone
adapter and exact durable receipt handoff. ProjectService remains the snapshot
and revision issuer; a supplied existing owner edits only the in-memory clone;
the durable worker validates the resulting diff receipt. No product operator,
route, live Atlas/QStash run, canonical apply, reload or rendered acceptance is
claimed.

Commit `a9882903a` corrects the durable revision contract. Canonical base and
isolated working identities are now separate and hash-bound. This is not a
state-restoration claim: after a process loss, the adapter must reconstruct or
restore the exact isolated working proposal and prove its hash before the
provider suffix may resume.

Commits `270792c1a`, `d143da69a`, `df61e818d` and `9f955033e` now complete that
research-only state-restoration claim. They do not provide live Atlas/QStash,
authenticated ingress, a certified production operator owner, paid-provider
resume, canonical apply/reload or rendered acceptance.

## Required verification sequence

1. **Complete at `a012e226e`:** pure contract/validator tests, including
   adversarial graph, scope, lock, stale revision and proof cases.
2. **Complete at `0c94bc059`:** immutable Mongo revision/definition store with
   concurrent-writer, authorization, owner and forgery tests.
3. **Complete at `9687dbd9f`:** bind one accepted node definition into the
   existing durable job input with stale/forgery/idempotency tests.
4. **Partial at `d16caaa5b`:** fresh-instance lease reclaim, exact
   execution-time PlanService/job revalidation and duplicate-delivery
   rejection with zero provider inference.
5. **Complete at `b9cf5e820`:** serialized separate-OS-process product
   recovery with envelope/inner-forgery, old-lease and duplicate-delivery
   rejection.
6. **Domain complete at `c69a845ea` + `aff06c8d4`:** cancellation, expiry,
   tenant isolation, approval lineage and immutable PlanService review
   wait/wake/history tests. Authenticated UI/API ingress remains step 8 work.
7. **Contract/unit complete at `b50f9f9fa` + `a9882903a`:** ProjectService-issued
   clone/proposal execution and exact durable receipt handoff, including stale
   and forgery rejection, with canonical-base and isolated-working identities
   kept distinct.
8. **Research/process complete at `270792c1a` + `d143da69a` + `df61e818d` +
   `9f955033e`:** deterministically recover the exact isolated proposal state
   across process loss and reject missing, altered or unowned recovery before
   inference.
9. Authenticated non-production product wiring plus QStash/Atlas crash/restart
   and redelivery exercise, using real artifact/operator owners and no second
   authority.
10. Only after fresh zero-inference preflight and explicit spend approval:
   resumed paid model inference.

## Evidence basis

- Repository code at `9f955033e` and orchestration-decision commit `19d8c97a8`.
- Upstash Workflow official documentation: durable stored step results,
  step-level retry/resume, event waits and DLQ recovery.
- Vercel `WorkflowAgent` official documentation: provider tool loops can
  survive request loss and approvals, but this does not confer domain
  authority.
- Existing Editron JCode/OpenCode research and governing agentic-plan audit.
