# Editron durable editorial orchestration spike

Date: 2026-08-23

Status: **architecture decision; zero inference; no product mutation**

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
| Product editorial PlanService | Contract/validator exists at `a012e226e`; `0c94bc059` adds immutable Mongo revision persistence and exact execution-definition storage. No route, job binding or live Atlas proof exists. |
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

Open work:

- artifact-owner resolution for scopes, locks, approvals and proof;
- binding a runnable node revision into a durable job input;
- event history, approval suspension and authenticated dispatch;
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

## Required verification sequence

1. **Complete at `a012e226e`:** pure contract/validator tests, including
   adversarial graph, scope, lock, stale revision and proof cases.
2. **Complete at `0c94bc059`:** immutable Mongo revision/definition store with
   concurrent-writer, authorization, owner and forgery tests.
3. Bind one accepted node definition into the existing durable job input.
4. Crash/restart and redelivery with zero provider inference.
5. Approval wait/cancel/expiry and tenant-isolation tests.
6. ProjectService clone/proposal execution and exact receipt handoff.
7. Only then: authenticated non-production QStash/Atlas exercise.
8. Only after fresh zero-inference preflight and explicit spend approval:
   resumed paid model inference.

## Evidence basis

- Repository code at `0c94bc059` and orchestration-decision commit `19d8c97a8`.
- Upstash Workflow official documentation: durable stored step results,
  step-level retry/resume, event waits and DLQ recovery.
- Vercel `WorkflowAgent` official documentation: provider tool loops can
  survive request loss and approvals, but this does not confer domain
  authority.
- Existing Editron JCode/OpenCode research and governing agentic-plan audit.
