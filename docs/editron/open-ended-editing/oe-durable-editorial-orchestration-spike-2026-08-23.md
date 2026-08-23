# Editron durable editorial orchestration spike

Date: 2026-08-23

Status: **architecture decision plus fresh/resumed PlanService execution adapter, versioned fresh/resumed proof identity, full Plan-to-native cut proof, Plan-lifecycle crash/redelivery/cancellation recovery, fail-closed QStash dispatch, signed worker-adapter contracts, definition-bound execution-owner composition, a production-shaped canonical-media binding/adapter contract, concrete read-side Mongo/R2/GCS/policy-grant ports, a store-neutral issuance policy/identity owner and concrete existing-client Mongo transaction adapter, plus a product-budget reservation/settlement contract, runtime-guard owner port, atomic-ledger policy coordinator, concrete same-database CreditsService/Mongo adapter, current-route OpenAI/Google product input-token counters and crash-safe terminal-settlement redrive; zero inference; no product composition root, live route, live Atlas transaction exercise or product mutation**

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

This is a choice of ownership boundaries. The PlanService contract,
persistence, lifecycle worker, fresh/resumed provider adapter and a truthful V2
fresh/resumed proof identity now exist. The provider episode core can also
persist an opt-in, hash-chained failed-attempt receipt, write a pending dispatch
intent before invocation, restore its conservative spend reservation after
process restart and reconcile it only while the original ProjectService
revision remains current. It does not automatically retry an unknown delivery.
The product Plan resume adapter emits
V2 through the sole ProjectService clone and concrete cut/focal proof owner;
the separate research worker retains V1 compatibility. Both durable attempt
phases now pass through the shared cores and the Plan worker's existing leased
resume-state CAS. A fresh episode opens the existing ProjectService proposal
clone without checkpoint-shaped history; only a real dispatch, attempt or
writer event creates its first checkpoint. The existing cut/focal proof owner
now accepts that fresh execution trace and proves the same state/render/visual
claims without mutating the canonical project. Commit `62fcc6c25` proves that
complete path from one accepted Plan node through the real cut owner and strict
V2 finalizer. Commit `5e0dd3b65` proves process loss after durable dispatch
intent, expired-lease redelivery, conservative unknown-outcome accounting and
cancellation precedence without provider re-invocation. Authenticated live
workflow and canonical ProjectService apply/reload remain absent, so the
current path is not production-ready.

Commits `0f54a0a2a` and `b6171bed2` close the transport-adapter contract only.
The dispatcher derives tenant/user scope from the authenticated actor, binds
the exact accepted Plan node, publishes only a strict `{version, jobId}` body
to a fixed HTTPS worker path and records QStash's message ID in the existing
job. A message receipt can arrive after the job is claimed or completed because
it is audit evidence, not a lifecycle transition. The worker factory applies
the existing fail-closed QStash signature wrapper before parsing, requires one
explicit execution owner before claiming and delegates to the sole durable Plan
worker. No route is exported while product canonical-media and runtime-budget
owners are absent; the research inline reference and sealed-holdout budget are
not silently promoted.

Commit `434563cd6` closes the static episode-definition composition gap. One
adapter revalidates each accepted PlanService execution definition, derives
only that definition's existing immutable bound-episode owner and delegates to
the existing provider Plan execution owner. It can therefore serve different
accepted episodes without a second registry or a manually preselected
definition owner. This is definition composition only: canonical-media lookup,
product budget reservation, route export, live stores, inference and canonical
ProjectService apply remain absent.

Commit `498e018e6` freezes the next boundary without overstating integration.
The canonical-media binding stores no bytes and supports both native-video and
ordered timestamped-image evidence. It binds exact tenant/user/project/episode,
provider route, source asset/version/content hash, materializer, rights/privacy
authorization, manifest and per-artifact hash/length identities; its adapter
rejects scope, route, policy, record and byte drift before returning evidence.
The locator, byte reader and policy authority are injected ports. No concrete
Mongo/R2/policy implementation or execution-root wiring exists yet.

Commit `de472b32b` freezes the product-budget boundary without pretending to
move money. It hash-binds exact scope, wallet, provider route and pricing,
customer-pricing identity, hard episode limits, approval expiry, a
CreditsService reservation receipt and durable-job execution evidence. Actual
usage, unknown provider outcome and proven pre-dispatch cancellation have
different fail-closed settlement modes. The reservation maps directly to the
existing durable job's budget artifact/guard identity, and an adapter resolves
the existing runtime-guard port only for the exact unexpired reservation. This
is `CONTRACT/OWNER PORT PROVEN`, not `PRODUCT WALLET LIVE`: current
CreditsService has atomic completed deduction/refund operations but no atomic
hold plus partial-settlement ledger, so the concrete wallet writer remains
absent.

Commit `6d8fdf1ea` corrects the unwired boundary before any record exists: the
customer-pricing authorization now hash-binds the existing `main` credit pool,
all product-budget artifact/guard identifiers advance to revision 2, and pool
drift fails closed. It still moves no credits.

Commit `582c927d0` adds the sole product-budget policy coordinator behind that
boundary. Its injected ledger contract requires the wallet movement and the
permanent reservation-record transition to occur in one atomic transaction.
The coordinator proves exact main-pool scope, subscription-first reservation,
top-up-first release, idempotent reserve/settle, conservative unknown-result
holding and exact still-reserved guard lookup. The in-memory ledger tests cover
insufficient funds, expiry, forged scope and conflicting replay; 15 focused and
83 adjacent tests plus repository typecheck and quiet ESLint pass. This is
`POLICY/ATOMIC PORT PROVEN`, not `PRODUCT WALLET LIVE`: no concrete Mongo
transaction or CreditsService wallet writer has moved credits.

Commit `5f7428248` implements the atomic port behind the existing CreditsService
owner. It uses the same configured Mongoose database for the user/org main-pool
movement, permanent product-budget record and org reporting row, and wraps all
three in a snapshot-read/majority-write transaction. Deterministic receipts,
unique guard lookup, exact record-hash CAS and a non-expiring reservation record
make capped embedded history non-authoritative. Injected transactional tests
prove user/org reserve and settle, duplicate replay, exact lookup, rollback on
record-insert failure and precision rejection. Commit `9931ae77a` separately
updates the stale source assertion for the existing split-refund behavior. The
combined wallet/durable suite passes 153/153 with full typecheck and quiet
ESLint. This is `CONCRETE_ADAPTER_IMPLEMENTED_NOT_LIVE_PROVEN`: no real Atlas
wallet was touched and no product root or route invokes the factory yet.

Commits `2683002e7` and `9a2a8d9ad` extract the shared runtime-accounting
mechanics and construct the product guard only from an exact CreditsService
authorization/reservation plus a route/request-bound input-token receipt.
Commit `133a15596` implements the current OpenAI Responses input-token counter.
Commit `b8f8a439d` implements the current Google stateless-Interactions-to-
multimodal-`countTokens` translator and conservative counter. The final focused
cluster passes 21/21 with repository typecheck and quiet ESLint. No provider
count or inference call occurred. This is
`CURRENT_ROUTE_TOKEN_COUNTERS_IMPLEMENTED_NOT_LIVE_PROVEN`; durable terminal
wallet settlement and product-root invocation remain absent.

Commit `ce3e988a4` derives actual, conservative-maximum or proven pre-dispatch-
cancellation settlement from one terminal durable-job snapshot plus its exact
runtime checkpoint, validates a separate customer-pricing receipt and delegates
wallet mutation only to the existing CreditsService owner. Normal successful
turns may correctly have no exceptional-attempt receipt because their usage is
already committed in the runtime guard. Focused accounting proof passes 26/26
with repository typecheck and quiet ESLint. This is
`TERMINAL_SETTLEMENT_DERIVATION_PROVEN_NOT_WORKER_INVOKED`: a crash-safe worker
hook and terminal-redelivery re-drive remain open.

Commit `98b663f2b` wires that owner into terminal completion, cancellation,
dead-letter, expiry and terminal redelivery. Product ingress requires the
settlement owner before it can claim work. A deliberately failed settlement
after job completion returns 503; the next signed delivery settles the terminal
snapshot while the execution owner remains at one call. The focused lifecycle
and provider-native Plan cluster passes 32/32 with repository typecheck and
quiet ESLint. This is
`TERMINAL_SETTLEMENT_REDRIVE_WIRED_NOT_LIVE_WALLET_PROVEN`: the real product
root, route and non-production Atlas/QStash/CreditsService exercise remain open.

Commit `d42c1af5b` adds the exact reference-media registration owner over the
existing `mediaAssets` collection. It create-or-compares source or derived-frame
rows using byte SHA-256/length, USER/ORG ownership, the selected R2/GCS object
key and versioned provenance; source rows also bind the canonical envelope.
Conflict and copied-identity cases fail closed, and focused proof passes 3/3
with repository typecheck and quiet ESLint. This is
`REFERENCE_MEDIA_REGISTRATION_OWNER_PROVEN_NOT_MATERIALIZER_WIRED`: current
upload callers remain unchanged and no live object/database path was exercised.

Commit `607212e02` implements the three read-side canonical-media ports behind
the existing `498e018e6` owner. An exact scoped binding is read from immutable
metadata; the policy owner requires a separate hash-bound, unexpired and
non-revoked authorization decision; and bytes are read only from the declared
R2/GCS object on the existing `mediaAssets` row. Commit `8bf1d766e` corrects
the first adapter before issuance: scope-specific artifact identities live in
a separate immutable metadata collection with an explicit USER/ORG media
owner, so one media object can serve multiple episodes without an unbounded
row array and org-shared media is not misclassified as actor-owned. No media
bytes move. Cached URLs and backend fallbacks are not accepted. Both native-
video and ordered-image arms plus scope, ownership, policy, storage-key,
record-hash and byte-drift failures pass 15/15 focused tests; the combined
media/budget/artifact-owner cluster passes 32/32
with repository typecheck and quiet ESLint. This is
`CONCRETE_READ_ADAPTERS_IMPLEMENTED_NOT_ISSUED_OR_LIVE_PROVEN`: no authorized
product writer yet persists those bindings, artifact-binding identities or
policy grants, and no live Mongo/R2/GCS path was exercised.

Commit `9251945e4` adds the store-neutral canonical-media issuance law and
owner without adding a writer. It binds one hashed source version to the exact
scope/route binding, independent unexpired rights/privacy grant and complete
owner-consistent artifact set; the independent policy owner must pass before
one injected atomic create-or-compare ledger is called. Both media arms,
deterministic replay and hostile expiry/scope/artifact/owner/hash/policy cases
pass 19/19 focused tests with repository typecheck and quiet ESLint. This is
`ISSUANCE_POLICY_AND_IDENTITY_OWNER_PROVEN_NO_PERSISTENCE`: the concrete Mongo
transaction and live store proof remain absent.

Commit `07c59690b` implements the issuance ledger with the existing Editron
Mongo client and existing `mediaAssets` byte authority. In one snapshot-read/
majority-write transaction it validates exact source envelope/content/owner,
derived artifact bytes/storage/owner and current authorization before
create-or-comparing immutable source-version, binding, policy and artifact
metadata. Mongo `_id` is stripped only at the canonical-validation boundary.
Native video, ordered R2/GCS images, USER/ORG ownership, replay, conflict,
rollback, non-commit and corrupt/missing media pass 29/29 focused tests with
repository typecheck and quiet ESLint. This is
`CONCRETE_TRANSACTION_ADAPTER_IMPLEMENTED_NOT_LIVE_PROVEN`: no live Atlas
transaction, migration or product-root invocation occurred.

## Current code evidence

| Concern | Verified current owner/status |
| --- | --- |
| Canonical project/timeline | `ProjectService`; incomplete IF1-wide migration remains |
| Chat history | Mongo `chatSessions`; messages/tool records, not a plan DAG |
| Long-running family jobs | Several family-specific Mongo/QStash paths |
| Shared execution lifecycle | `EDITRON_DURABLE_WORKFLOW_JOB_V1_1`: input/dependency/budget bindings, idempotency, leases, cancellation, retries, resume CAS and terminal proof references |
| Research episode definition | `e3ac9b082`: serialized manifest-bound value plus strict resolver; not a product store |
| Product editorial PlanService | Contract/validator exists at `a012e226e`; `0c94bc059` adds immutable storage; `9687dbd9f` binds accepted work; `d16caaa5b` revalidates it; `b9cf5e820` proves process portability; `c69a845ea` enforces lifecycle gates; `aff06c8d4` persists owner review wait/wake revisions; `1764a8ff8` supplies the transport-neutral leased execution lifecycle; `ee07f11cf` freezes the exact provider-native research-proxy envelope; `454fb721a` extracts one store-neutral resumed execution core plus durable outcome finalizer; `e1a8e4a3f` binds proposal recovery into the Plan envelope; `31fcb279e` shares the exact checkpoint codec; `cd1829223` connects the Plan lifecycle to that resume-only core through the existing scoped artifact owners; `2e2471adc` adds a backward-compatible V2 outcome-proof subject; `f3b6ad44d` adds its strict finalizer; and `d17ba67c1` wires the product Plan resumed path through the existing clone and cut/focal proof owner. Commits `f57d0cb1c`, `88114ec5a`, `55b06b9e8` and `5f2c3b1f9` add hash-chained provider-attempt receipts, conservative unknown-result settlement, attempt-bound runtime restart and an opt-in episode callback. Commits `7cc90f161`, `da252954b` and `9cf3cde0f` add the immutable pre-dispatch intent, pending checkpoint and actual write-ahead episode boundary with conservative recovery. Commit `8a2f4d535` requires and persists both phases through the existing Plan lifecycle CAS. Commits `bfecfb314`, `c6c416592` and `898c3ba63` add a real fresh clone/core/Plan path whose first checkpoint is caused only by real work. Commits `62fcc6c25` and `5e0dd3b65` prove the full accepted-Plan-to-real-cut receipt plus crash/redelivery/cancellation without implicit provider retry. Commit `434563cd6` derives the immutable bound-episode owner from each revalidated accepted definition instead of requiring a static per-episode owner. Canonical-media/product-budget composition, authenticated review ingress and live Atlas/QStash proof remain absent. |
| Project proposal clone/proof | `b50f9f9fa` adapts the existing `ProjectService.loadProjectForMutation` paired snapshot/revision boundary to the durable research clone contract, executes only a supplied in-memory owner, detects revision-visible and relevant revision-invisible canonical drift, and binds the final diff receipt into the durable terminal proof references. `a9882903a` separately hash-binds the unchanged canonical base revision/state and the isolated working revision/state. `270792c1a`, `d143da69a` and `df61e818d` add compact writer/state recovery, durable enforcement and pure committed-writer replay; `9f955033e` proves the path across two OS processes with zero inference and no canonical mutation. `7c9e7e6ea` binds the first real native owner, `cutTimelineRange`, to that clone and proves deterministic replay. `1af638999` removes that owner's private revision map: the clone supplies its current revision and the concrete owner uses one shared deterministic issuer. `b0f1442c0` adds the bounded focal-scale `set_keyframes` owner and a same-process cut/keyframe chain on that revision origin. `349a586c3` adds exact state/render/visual policy for that ordered chain, including a reconstructed cut-only comparison baseline and inspected pixel deltas. `be8e12871` proves serialized fresh-process cut replay plus focal-only suffix execution through the same revision origin while preserving canonical state. `ee650e18b` makes the clone independently recompute and validate every admitted writer revision from exact receipt/call/state material. Live rendering and live-store recovery remain below. |
| Reference artifact owner | `90d034578` binds either ordered timestamped images or native MP4 bytes to exact tenant/user/project/episode, source provenance and manifest identity as an immutable research value. `498e018e6` adds the production-shaped canonical-media binding and adapter: no inline bytes, exact source/policy/route/artifact identity and strict resolution for both arms. `607212e02` implements its read-side locator, byte-reader and policy-grant ports over immutable Mongo metadata plus the existing `mediaAssets`-selected R2/GCS object; `8bf1d766e` qualifies reusable artifact metadata by USER/ORG media owner outside the byte row; `9251945e4` adds the store-neutral authorization/issuance owner and atomic-ledger port; `07c59690b` supplies its concrete existing-client Mongo transaction; `d42c1af5b` supplies exact create-or-compare source/frame registration in that same byte authority. Upload-path wiring, root composition and live retrieval remain absent. |
| Runtime guard owner | `8ecc87a1c` binds the existing sealed-holdout controller, authorization, pricing, route and guard identity to exact tenant/user/project/episode scope. It is benchmark accounting, not product authority. `de472b32b` adds the separate product authorization/reservation/settlement contract and adapts an exact unexpired CreditsService-owned reservation to the existing runtime-guard owner port; `6d8fdf1ea` binds it to the main pool under revision-2 identities; `582c927d0` adds a tested policy coordinator and atomic-ledger port; `5f7428248` implements that port behind CreditsService on the same configured Mongo database. `2683002e7` extracts the shared runtime-accounting mechanics, and `9a2a8d9ad` constructs them only from an exact CreditsService authorization/reservation plus a route/request-bound input-token-count receipt. `133a15596` and `b8f8a439d` implement the current OpenAI and Google product counter owners without a live call. Durable terminal wallet settlement, non-production Atlas proof and product-root invocation remain unproven. |
| Outcome-proof completion | `f85bc0f09` requires any changed proof-eligible isolated proposal to produce a scope/policy/obligation/evidence/final-state-bound receipt before durable completion. `53baee0f3` adds the first concrete versioned policy and defaults its single-cut adapter to the existing Phase-0/Remotion producer. `349a586c3` extends that same factory to the ordered cut/focal-scale chain and refuses visual PASS without inspected per-frame deltas. `be8e12871` carries the same policy through two OS processes with deliberately skipped render evidence. `2e2471adc` preserves that V1 receipt hash and adds V2 `FRESH_EPISODE_RECEIPT` / `RESUMED_EPISODE_RECEIPT` provenance; `f3b6ad44d` finalizes it without a V1 fallback; `d17ba67c1` makes the product resumed path emit V2; `93a72e756` makes the same concrete cut/focal proof policy accept a real fresh trace without a checkpoint; and `62fcc6c25` binds that proof to the complete accepted-Plan execution receipt. Live Lambda evidence and production apply remain unproven. |
| Product workflow ingress/recovery | `0f54a0a2a` provides actor-bound, fixed-URL, message-receipt-backed QStash dispatch; `b6171bed2` provides signed strict worker ingress and refuses to claim without an explicit execution owner; `434563cd6` supplies definition-bound execution composition across accepted episodes; `498e018e6` supplies the canonical-media boundary; `607212e02` supplies its concrete read-side product ports; `9251945e4` supplies the store-neutral issuance coordinator; `07c59690b` supplies its concrete transaction adapter; `de472b32b` supplies the product-budget contract/runtime-guard boundary; `582c927d0` supplies the policy coordinator; `5f7428248` supplies the concrete CreditsService/Mongo adapter; `2683002e7` and `9a2a8d9ad` supply the shared accounting mechanics and product guard factory; `133a15596` and `b8f8a439d` supply the current product token counters. These remain non-routable adapters: terminal wallet settlement, reference materializer registration, root composition, API route export and live Atlas/QStash proof are absent. |

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
- `7c9e7e6ea` binds `cut_section` to the existing pure
  `timeline-range-cut.ts#cutTimelineRange` owner rather than a dummy session.
  It enforces project/proposal revision, range, evidence and constraint shape;
  returns coordinate-transform and split-child evidence; issues a hash-bound
  proposal-local writer revision; and deterministically replays a committed
  cut in a fresh owner before a suffix cut. Canonical state stays unchanged.
  The slice also fixes five canonical cut paths that emitted explicit
  `keyframeTracks: undefined`, which deterministic proposal state correctly
  rejected. Concrete-owner/cut regressions pass 21/21; full typecheck and quiet
  ESLint pass.
- `90d034578` adds the exact immutable reference owner consumed by the existing
  artifact coordinator. Both ordered-image and native-video arms are rebound
  through their owning validators; wrong scope/hash, altered bytes and copied
  outer identity fail closed. Reference owner/resume suites pass 18/18; full
  typecheck and quiet ESLint pass.
- `8ecc87a1c` adapts the existing sealed runtime-budget controller to the
  durable runtime-guard owner port. The immutable artifact binds exact episode
  scope, source provenance, case/manifest, route, authorization, pricing and
  guard identity; the provider-specific token counter remains an injected
  owner. Scope/kind/identity, authorization and outer-envelope forgery fail
  closed before counting. Focused accounting/recovery tests pass 13/13; full
  typecheck and quiet ESLint pass.
- `fba3ff58d` first completes the required Step-0 cleanup by removing three
  unused type-only exports from the two large durable proposal modules.
- `f85bc0f09` then adds the strict isolated-outcome-proof receipt and completion
  gate. It binds scope, episode/resume/proposal/final-state identities, policy,
  standardized obligations, evidence references and derived disposition. The
  clone supplies only a transient copy of its final state, protects the
  canonical base around inspection and cannot be mutated through the proof
  owner. Missing owner, wrong subject and mid-proof canonical drift fail
  closed. Focused worker/clone/recovery tests pass 30/30; full typecheck and
  quiet ESLint pass. The owner used in these tests is not a renderer.
- `53baee0f3` adds the first concrete operation-specific proof adapter. It
  defaults to the existing Phase-0 still producer and accepts `PASS` only for
  one exact `cut_section`, exact baseline/final proposal-state hashes and a
  complete paired baseline/final artifact set at both join-boundary frames.
  Cross-project, wrong-frame, duplicate, extra, skipped, partial and failed
  receipts remain `UNVERIFIABLE`; canonical ProjectService state stays
  unchanged. Focused proof/cut/clone/worker/Phase-0 tests pass 51/51, with full
  typecheck and quiet ESLint. The renderer seam is injected in tests, so this
  is not a live Lambda-render certification.
- `1af638999` gives isolated execution and committed replay the clone's exact
  current proposal revision, supplies one deterministic concrete-writer issuer
  and removes `cut_section`'s private `WeakMap` revision authority. The
  separate-process fixture now meets the mandatory proof gate with a receipt
  bound to the exact episode/resume/proposal/final-state hashes and disposition
  `UNVERIFIABLE`, because no renderer runs there. Clone/cut/proof/durable/
  process tests pass 31/31; repository typecheck and quiet ESLint pass. The
  clone does not yet prove that every arbitrary injected owner used the shared
  issuer, so this is concrete-owner convergence, not universal enforcement.
- `b0f1442c0` adapts the canonical `buildKeyframeMutationPatch` owner for the
  video/image focal-scale subset only. It preserves unrelated tracks, applies
  supplied local-frame scale values and focal origin, uses the same revision
  issuer and fails closed on ambiguous property, missing focal evidence,
  invalid ranges, stale revisions and replay drift. One same-process
  cut-then-keyframe chain produces ordered writer receipts without canonical
  mutation. Affected tests pass 97/97; full typecheck and quiet ESLint pass.
  Generic keyframe properties and live rendered proof remain open.
- `349a586c3` binds the exact cut-plus-focal-scale state chain to one outcome
  policy. It reconstructs the cut-only intermediate state with the existing
  pure owners, verifies operation audit hashes and the cut-issued revision
  handoff, then requests distinct cut-boundary and focal-terminal comparisons.
  Render artifacts and visual inspection are separate obligations: still URLs
  alone remain `UNVERIFIABLE`, while inspected missing deltas are `FAIL`.
  Related suites pass 96/96; repository typecheck and quiet ESLint pass. The
  tests inject the existing evidence-builder contract and spend no external
  resources; live Lambda execution remains open.
- `be8e12871` persists the cut prefix in Process A and recovers it in a fresh
  Process B. The suffix process reconstructs and replays only the committed cut,
  consumes its writer-issued revision through opaque `result_t1_1`, executes
  only the focal mutation and completes with the same proof owner. Canonical
  state remains unchanged; edit state is `PASS`; deliberately skipped render
  evidence keeps all visual obligations `UNVERIFIABLE`. The neighboring suite
  passes 42/42; repository typecheck and quiet ESLint pass. This is serialized
  test-store recovery, not live Atlas/QStash or product execution.
- `ee650e18b` makes writer-revision origin a clone-enforced invariant rather
  than an adapter convention. Missing proof, proof/state drift, copied call
  material and forged revisions are rejected before the working revision
  advances; speculative clone state is rolled back. The separate dependency-
  shape process fixture now emits issuer-conformant synthetic receipts. Related
  tests pass 44/44; repository typecheck and quiet ESLint pass.
- `1764a8ff8` adds the product durable lifecycle worker. It claims from the sole
  job store, re-resolves the accepted PlanService definition, delegates only to
  an injected owner that asserts support, exposes lease heartbeat and resume
  CAS, and settles cancellation, explicit retry, dead letter or an owner-bound
  terminal receipt. Focused lifecycle tests pass 19/19; the injected test owner
  performs zero inference and no project mutation.
- `ee07f11cf` freezes the PlanService-to-provider execution envelope. It binds
  exact scope, provider route/model identity, opaque tool set, reference hash,
  isolated-proposal policy and runtime-budget guard. A fresh start carries no
  invented resume checkpoint; an optional real checkpoint must match every
  bound identity. The envelope/durable cluster passes 28/28. This is a contract
  bridge, not runtime convergence: the research worker still requires its own
  job identity and persisted checkpoint.
- `454fb721a` extracts that worker's resumed provider loop and durable
  proposal/outcome finalization into shared, store-neutral modules. The
  existing worker remains a lifecycle adapter; exact scope, checkpoint,
  opaque-tool-set, writer-recovery and proof semantics are preserved. The
  focused recovery/product-envelope cluster passes 47/47, with repository
  typecheck and quiet ESLint clean. This does not make the research job a
  product job and does not invent a receipt for a fresh, zero-turn episode.
- `e1a8e4a3f` requires every writer-bearing Plan resume envelope to carry the
  exact ProjectService proposal-recovery state. Missing, unexpected, copied or
  non-extending recovery fails before artifact resolution.
- `31fcb279e` extracts the one checkpoint/recovery codec used by both durable
  lifecycle adapters. Job identity, lease and resume CAS remain owned by their
  existing stores rather than moving into the codec.
- `cd1829223` adds the PlanService resumed-execution owner. It preserves the
  distinct Plan job and provider episode identities, reuses the same scoped
  episode/reference/runtime/clone/transport owners, runs only against the
  isolated ProjectService clone, and emits one definition/plan/node/episode/
  proof-bound owner receipt. The durable resume cluster passes 55/55 and full
  typecheck/quiet ESLint pass. Provider 429/timeout attempts deliberately end
  `UNVERIFIABLE`: current runtime-guard resume state binds only committed tool
  turns, so automatic retry could otherwise forget a billed failed attempt.
  Typed artifact-owner failures before provider invocation remain retryable.
- `2e2471adc` versions the existing outcome-proof receipt under the same proof
  authority. V1 remains byte-for-byte stable. V2 binds either an exact fresh
  episode receipt or a distinct resumed receipt and rejects unknown, copied,
  forged or tampered execution-trace material. The focused outcome/resume
  cluster passes 49/49 with full typecheck and quiet ESLint.
- `f3b6ad44d` adds the strict V2 finalizer with no legacy fallback.
  `d17ba67c1` exposes V2 through the existing clone contract, adapts the sole
  cut/focal proof owner for honest resumed receipts and switches the product
  Plan resume adapter to V2. Fresh traces are rejected before render. The
  separate research worker keeps V1 compatibility. The migrated cluster
  passes 55/55 with full typecheck and quiet ESLint.
- `f57d0cb1c` adds an immutable, hash-chained provider-attempt receipt bound to
  episode, route, request, result, accounting and retry disposition.
  `88114ec5a` makes the sealed budget owner conservatively settle a transport
  result whose usage is unavailable. `55b06b9e8` carries those accounted
  attempts in the runtime resume state and reconstructs their spend after a
  fresh process starts. `5f2c3b1f9` connects the episode loop to that contract:
  a timeout can publish an attempt-bound checkpoint before returning, and a
  restart can continue without inventing a writer only while the original
  ProjectService revision remains unchanged. The focused restart/adversarial
  suite passes 15/15; repository typecheck and quiet ESLint pass. This remains
  opt-in plumbing. `7cc90f161` then defines the exact immutable pre-dispatch
  intent, `da252954b` binds that intent into the runtime/checkpoint resume state,
  and `9cf3cde0f` makes callback confirmation a mandatory write-ahead boundary
  before invocation. Recovery converts the unresolved intent to one conservative
  attempt before any separately authorised attempt and proves the same behavior
  after a previous accounted attempt; stale revisions and mismatched intent
  material fail before invoke.
  The focused recovery suite passes 20/20 with full typecheck and quiet ESLint.
  `8a2f4d535` then requires both phases in the shared resumed core when called
  by the Plan owner and persists them through the existing leased resume-state
  CAS. Its 429 integration proves sequence 1 contains the pending intent,
  sequence 2 contains the reconciled attempt with no pending intent, and an
  incompatible guard dead-letters before provider invocation. The focused
  Plan/core/worker suite passes 25/25 with full typecheck and quiet ESLint.
- `bfecfb314` opens a fresh ProjectService proposal clone at the exact canonical
  base without a fake checkpoint. `c6c416592` adds the store-neutral fresh core.
  `898c3ba63` connects that core to the existing Plan lifecycle and routes any
  later real checkpoint through the resumed path. `93a72e756` lets the existing
  cut/focal proof owner bind `FRESH_EPISODE_RECEIPT` through the same state,
  render and visual obligations; zero-network fresh cut proof passes while the
  canonical project remains unchanged. `62fcc6c25` and `5e0dd3b65` complete the
  Plan-to-concrete-owner and crash/cancellation gates; live infrastructure
  remains separate.

Open work:

- exercise the concrete single-cut adapter against live non-production
  Phase-0/Remotion only after explicit external-cost authorization; add
  transcript-semantic, audio-continuity and multi-operation proof policies;
- compose the `07c59690b` canonical-media transaction/read owners with the
  `5f7428248` CreditsService product-budget owner and `434563cd6` definition
  owner behind the one existing execution boundary; never let a route
  self-authorize its own egress;
- expand the now-proven `cut_section` bridge to other certified/pure operator
  owners through the same revision origin without introducing another
  operation registry or project authority; the clone must continue validating
  exact issuer-conformant receipt material for every admitted writer;
- proposal review/apply/reload through the sole ProjectService CAS remains
  separately gated and unimplemented;
- exercise the `5f7428248` default adapter against non-production Atlas to
  prove real transaction support, index creation, rollback and user/org
  persistence without touching production wallets;
- compose the concrete canonical-media and product-budget owners behind the
  one existing execution-owner boundary; do not reuse the research-only inline
  reference or sealed-holdout budget as product authority;
- export authenticated review/API dispatch and signed worker routes only after
  that owner composition exists;
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

Commit `7c9e7e6ea` adds the first concrete owner to that recovered proposal:
`cut_section` delegates to the canonical pure range-cut owner, not a fixture or
second timeline. This is limited research proof for one operation; it is not
family certification, rendered proof or a canonical apply path.

Commit `90d034578` adds the immutable reference owner for both existing media
arms. It is deliberately an inline research artifact, not a new media database;
production retrieval, rights/privacy/egress policy and interpretation remain
open.

Commit `8ecc87a1c` binds the existing sealed resource-accounting controller to
the durable runtime-guard owner. It proves exact scope and guard-identity
reconstruction without counting tokens or invoking a provider. It neither
authorizes spend nor supplies a generic product budget authority.

Commits `fba3ff58d` and `f85bc0f09` narrow the durable public surface and make
an exact outcome-proof receipt mandatory for a changed proposal that reaches
the proof gate. This closes the false-success completion seam, not rendered
quality. Commit `53baee0f3` supplies the first versioned single-cut adapter and
defaults it to the existing Phase-0 producer, but only zero-network seam tests
have run. A live exact-state render, semantic/audio proof, multiple-operation
policies and production apply remain open.

Commit `1af638999` then centralizes the current concrete proposal-revision
origin at the clone boundary and removes the cut owner's private map. It also
updates the process-recovery fixture to report rendered acceptance as
`UNVERIFIABLE` rather than bypassing the mandatory proof gate. This does not
certify a second operator or enforce issuer use for arbitrary future injected
owners.

Commit `b0f1442c0` then adds the second concrete native owner, limited to focal
scale keyframes, and proves a same-process cut/keyframe receipt chain. It does
not correct the general keyframe-property dossier or provide durable/rendered
multi-operation acceptance.

Commit `349a586c3` closes the same-process multi-operation acceptance seam. The
sole proof factory now reconstructs and hash-binds cut-only intermediate state,
checks the focal writer's revision handoff and compares the focal terminal
frame against that intermediate rather than the original project. It requires
per-frame image inspection for visual PASS. It does not prove live Lambda
rendering, fresh-process recovery of both owners or canonical project apply.

Commit `be8e12871` then closes the serialized fresh-process recovery seam for
the same two owners. Process B reconstructs and replays the committed cut,
resolves its revision through the opaque result reference and executes only the
focal suffix. Its renderer is intentionally skipped, so this does not close
live rendered acceptance, Atlas/QStash recovery or canonical project apply.

Commit `ee650e18b` then closes the convention-only issuer seam. The clone
independently derives the expected writer revision from the actual call and
state transition and rejects missing, stale, copied or forged receipt material
before advancing. This does not add a secret signer or second revision owner.

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
9. **First concrete owner complete at `7c9e7e6ea`:** execute and replay the
   canonical `cutTimelineRange` owner on the recovered clone, reject forged
   revisions/replay and keep canonical ProjectService state unchanged. Expand
   other families and rendered proof separately.
10. **Reference research owner complete at `90d034578`:** resolve exact scoped
    ordered-frame or native-video evidence and reject scope/hash/byte forgery.
    Add production canonical-media retrieval separately.
11. **Runtime guard research owner complete at `8ecc87a1c`:** resolve a fresh
    exact-identity sealed budget controller and reject scope, kind, identity,
    authorization and envelope forgery before token counting.
12. **Outcome-proof mechanics complete at `f85bc0f09`:** require and validate
    an exact scope/policy/obligation/evidence/final-state receipt for changed
    proof-eligible proposals. Connect and certify the real renderer separately.
13. **Concrete single-cut adapter complete at `53baee0f3`:** validate the exact
    cut call/state and paired boundary artifacts through the existing Phase-0
    owner. Live non-production Remotion execution, semantic/audio obligations,
    multiple operations and rational-timebase certification remain separate.
14. **Concrete revision origin complete at `1af638999`:** pass one clone-owned
    current proposal revision through execution/replay and issue the current
    cut writer revision without a private map. Add another concrete owner,
    multi-operation proof and clone-enforced issuer use separately.
15. **Second bounded native owner complete at `b0f1442c0`:** apply
    resolver-supplied focal scale curves through the same revision origin and
    prove one same-process cut/keyframe receipt chain.
16. **Exact multi-operation outcome policy complete at `349a586c3`:** bind the
    cut-only intermediate, revision handoff, final state, paired render
    artifacts and inspected pixel deltas. Add live non-production rendering
    separately.
17. **Serialized fresh-process two-owner recovery complete at `be8e12871`:**
    persist the cut prefix, restore it in a second OS process, replay only that
    prefix, consume its opaque writer revision, execute only the focal suffix
    and preserve canonical state. Live Atlas/QStash remains separate.
18. **Clone-enforced issuer derivation complete at `ee650e18b`:** independently
    validate every admitted writer receipt against exact scope, revision, call
    and before/after state material; reject missing, copied and forged origins.
19. **Product durable lifecycle complete at `1764a8ff8`:** claim, exact
    PlanService re-resolution, owner assertion, heartbeat, resume CAS,
    cancellation, retry/dead-letter and terminal receipt are transport-neutral
    and zero-inference tested.
20. **Provider execution envelope complete at `ee07f11cf`:** bind exact fresh or
    resumed provider execution material into the signed PlanService definition.
21. **Shared resumed execution core complete at `454fb721a`:** use one
    store-neutral provider loop and durable outcome finalizer without changing
    the research worker's public lifecycle or receipt semantics.
22. **PlanService resume adapter complete at `e1a8e4a3f`, `31fcb279e` and
    `cd1829223`:** bind exact proposal recovery, share the checkpoint codec and
    run the accepted Plan node through the existing resume-only provider core
    without joining the two durable job identities or mutating canonical state.
23. **Execution-trace proof schema complete at `2e2471adc`:** preserve V1 and
    add a V2 subject that truthfully binds either a fresh episode receipt or a
    distinct resumed receipt under the same proof authority.
24. **Product resumed V2 proof migration complete at `f3b6ad44d` and
    `d17ba67c1`:** use the strict V2 finalizer through the existing clone and
    cut/focal proof owner while retaining the research worker's V1 contract.
25. **Post-result failed-attempt accounting complete at `f57d0cb1c`,
    `88114ec5a`, `55b06b9e8` and `5f2c3b1f9`:** bind the exact request/result,
    reserve unknown spend, persist it in a restartable checkpoint and refuse a
    stale-revision retry.
26. **Episode-level pre-dispatch write-ahead complete at `7cc90f161`,
    `da252954b` and `9cf3cde0f`:** bind the exact intent/reservation before
    invoke, restore it after process loss and conservatively reconcile it before
    any separately authorised attempt, including after prior attempts. This is
    an owner port, not proof of
    durable product storage.
27. **Product Plan attempt-phase wiring complete at `8a2f4d535`:** require and
    persist dispatch intent before invoke and the reconciled attempt afterward
    through the existing leased Plan resume-state CAS. Automatic provider retry
    remains unauthorized.
28. **Fresh execution/proof foundations complete at `bfecfb314`, `c6c416592`,
    `898c3ba63` and `93a72e756`:** open a real fresh clone, persist only real
    work-derived checkpoints and apply the same native cut/focal V2 proof policy
    without mutating canonical project state.
29. **Full Plan/native and crash-recovery proof complete at `62fcc6c25` and
    `5e0dd3b65`:** one accepted Plan node reaches the real cut owner and strict
    V2 proof; process loss, lease redelivery and cancellation do not duplicate
    provider work or mutate canonical project state.
30. **Fail-closed transport adapters complete at `0f54a0a2a` and
    `b6171bed2`:** bind authenticated actor scope, publish only the opaque job
    identity, record late QStash receipts, verify worker signatures and refuse
    to claim without one explicit execution owner. No route is live.
31. **Definition-bound execution composition complete at `434563cd6`:**
    revalidate each accepted definition, derive only its existing immutable
    bound-episode owner and delegate through the one provider Plan execution
    owner. No static episode registry or second execution owner was added.
32. **Canonical-media binding/adapter complete at `498e018e6`:** bind native
    video or ordered timestamped images to exact scope, route, canonical source,
    materializer, policy, manifest and artifact identities without storing
    bytes.
33. **Product-budget contract/runtime-guard boundary complete at
    `de472b32b`:** bind exact wallet, route, pricing, limits, reservation,
    settlement evidence and durable-job guard identity. This moves no credits.
34. **Product-budget policy coordinator/atomic-ledger port complete at
    `582c927d0`:** exact revision-2 authorization, reservation split,
    settlement, idempotency and guard lookup are proven in memory. No Mongo or
    CreditsService wallet transaction is proven.
35. **Concrete same-database CreditsService/Mongo adapter complete at
    `5f7428248`:** permanent reservation records and user/org wallet/reporting
    movements share one transaction. Injected transaction proof passes; live
    non-production Atlas proof remains open.
36. **Concrete read-side canonical-media ports complete at `607212e02`, with
    reusable USER/ORG artifact scoping corrected at `8bf1d766e`:** exact
    binding and policy records resolve from Mongo, while artifact bytes remain
    in the existing `mediaAssets`-selected R2/GCS object. Authorized issuance
    and live-store proof remain open.
37. **Store-neutral issuance policy/identity owner complete at `9251945e4`:**
    exact source, scope, route, current independent authorization, artifact set
    and ownership must pass before one atomic create-or-compare ledger call.
    The concrete Mongo ledger and live-store proof remain open.
38. **Concrete canonical-media Mongo ledger complete at `07c59690b`:** one
    existing-client transaction validates media identity and create-or-compares
    all metadata. Transactional fakes pass; live Atlas remains open.
39. **Route-scoped artifact-owner derivation complete at `061fc5168`:** derive
    downstream owners separately for each already-validated Plan route and
    stop forged definitions before the factory runs. This is not the product
    root.
40. **Hidden durable HTTP retries removed at `7b81f6006`:** one durable
    provider attempt now owns one network request; 429/5xx retry requires a new
    separately authorized attempt rather than being hidden in transport.
41. **Shared runtime-accounting mechanics and the product guard factory complete
    at `2683002e7` and `9a2a8d9ad`:** exact
    guard/authorization identities, limits, pricing, request-bound input-token
    evidence, cumulative usage, conservative unknown-result settlement and
    interruption/resume now live in one configurable core. The sealed-holdout
    class remains only the research authorization/receipt wrapper. Unsafe
    integer cost or token accumulation fails closed; 24/24 focused tests plus
    repository typecheck and quiet ESLint pass. The product factory then
    rebinds one exact CreditsService authorization/reservation and rejects
    copied token receipts, route drift, forged reservations and token-counter
    failure before dispatch; the combined focused gate passes 36/36 with full
    typecheck and quiet ESLint. No provider was called.
42. **Current OpenAI/Google product token-count owners complete at `133a15596`
    and `b8f8a439d`:** bind the exact serialized generation request, preserve
    Google multimodal content in the official count request and fail closed on
    unsupported or forged input. Focused 21/21 plus repository typecheck and
    quiet ESLint pass. No live count or inference call occurred.
43. **Terminal settlement and redrive complete at `ce3e988a4` and
    `98b663f2b`:** committed terminal job/checkpoint evidence derives exactly
    one settlement; every terminal worker path and terminal redelivery invokes
    it. A failed post-job settlement cannot rerun the episode. Live wallet and
    transport proof remains part of step 46.
44. **Registration owner complete at `d42c1af5b`; caller wiring pending:**
    connect the source canonicalizer and frame sampler to this existing-
    `mediaAssets` owner so every uploaded source/frame has the identity required
    by issuance. The current frame sampler still uploads object bytes without
    invoking the owner.
45. Compose the canonical-media ports, CreditsService guard, route transport,
    ProjectService isolated clone, existing native operator dispatcher and
    proof owner behind the existing definition-bound execution owner. Do not
    add a second media store, wallet writer, registry, job store, PlanService or
    project authority.
46. Export authenticated routes and run the non-production QStash/Atlas
    crash/restart/redelivery exercise only after step 45 exists.
47. Only after fresh zero-inference preflight and explicit spend approval:
    resumed paid model inference.

## Evidence basis

- Repository code through `d42c1af5b` and orchestration-decision commit
  `19d8c97a8`.
- Upstash Workflow official documentation: durable stored step results,
  step-level retry/resume, event waits and DLQ recovery.
- Vercel `WorkflowAgent` official documentation: provider tool loops can
  survive request loss and approvals, but this does not confer domain
  authority.
- Existing Editron JCode/OpenCode research and governing agentic-plan audit.
