# Editron CAP-2A execution ledger v1

**Status:** CAP-2A complete; frozen current-truth research catalog, with zero production-eligible operations
**Authority:** research and planning evidence only; not a runtime registry
**Audit date:** 2026-08-18 (Asia/Calcutta)
**Worktree:** `D:/google downloads/Front-End-main/editron-worktree`
**Branch at audit:** `infrastructure-improvs-+Editron`
**HEAD at audit:** `a5dffffa5aeaf9f34feadba9533f8d8aa03ddcc9`
**Working tree:** dirty before this phase; pre-existing changes were preserved
**Phase 2 source snapshot:** `a453fec27ef72e9497fa15ba8b9419023619e0f45e50ad9b674825ac5c84d95a`

## 1. Why this ledger exists

The model cannot plan trustworthy edits from a list of convenient chat names.
It needs the complete, code-grounded set of atomic operations that Editron can
actually execute, including operations that currently exist only in the manual
editor, keyboard shortcuts, Director, workers or APIs.

This ledger prevents three recurring errors:

1. treating a broad capability family as an executable operation;
2. treating a chat descriptor or benchmark fixture as a production owner; and
3. changing benchmark or agent infrastructure before the operation, revision,
   evidence and proof contracts are known.

CAP-2A does **not** repair runtime paths. It first records their truth.

## 2. Verified current source counts

These counts overlap. They must never be added together and called the number
of Editron tools.

| Surface | Verified count | What the count means | What it does not mean |
| --- | ---: | --- | --- |
| [`CHAT_TOOL_REGISTRY`](../../../lib/editron/agent/chat-tool-registry.ts) | 66 | Central chat metadata descriptors in the current source tree | 66 certified or even executable capabilities |
| [`createTools`](../../../lib/editron/agent/tools.ts) compatibility bundle | 59 | 39 direct entries plus 3 transcript, 10 visual, 3 audio and 4 asset-family entries in the current returned tool array | Every manual operation or every safe production command |
| [`operator-specs-v2.json`](../../../tests/fixtures/editron/open-ended-planner-v2/operator-specs-v2.json) | 40 | Historical research operators used by the open-ended benchmark | A canonical production registry or all Editron functionality |
| [`editron-capability-census-v1.json`](./editron-capability-census-v1.json) | 30 | Broad CAP-0 capability families frozen against an older dirty snapshot | Atomic executable operations |

The 66 and 59 counts were re-derived from the current TypeScript syntax tree.
The 59-row bundle consists of 39 direct array entries and the four current
family returns:

- transcript: 3;
- visual: 10;
- audio: 3; and
- user assets: 4.

CAP-0 remains useful reconnaissance. Its source snapshot was branch
`infrastructure-improvs-+Editron` at `ff4219109b631fddf71f2bb0ce1afa86d2bec83b`,
not the current HEAD. Its 30 rows were 28 `partial`, one `live-uncertified` and
one `missing`; it certified zero operations. It also found only one
`SHARED_CANONICAL` family and 18 `SEMANTICALLY_DIVERGENT` families. Those facts
are evidence of the need for CAP-2A, not an execution allowlist.

## 3. Phase 1 artifact

[`cap2-atomic-operation-contract-v1.ts`](../../../lib/editron/research/capability-census/cap2-atomic-operation-contract-v1.ts)
defines the closed record that every eventual atomic operation must satisfy.

Each row binds:

- stable operator ID/version and retrieval-only aliases;
- family, kind, support status, certification and planner eligibility;
- project-class certification for short-form, agency, long-form and film-post;
- manual, chat, Director, worker, API and shortcut surfaces plus parity status;
- decision, form, mutation, persistence and proof owners;
- exact closed input/output schemas and resolver handoff;
- reads, writes, requires, produces, invalidates and declared state effects;
- coordinate domains and source/project/composition identity;
- revision, concurrency, idempotency and failure semantics;
- deterministic validators and distinct `PASS | FAIL | UNVERIFIABLE` proof;
- undo, redo/replay and reproducibility bindings;
- rights, privacy, egress, injection and network policy;
- resource limits, scorecard thresholds and evidence references; and
- final editor, renderer and delivery consumers.

The contract rejects, rather than silently normalizes:

- open or inconsistent JSON schemas;
- aliases masquerading as executable IDs;
- missing project-class dispositions;
- collapsed proof dispositions;
- false production eligibility;
- mutation without a mutation/persistence owner, writes or revision path;
- duplicate operator identities; and
- a frozen catalog whose source surfaces are still unresolved.

The Phase 1 contract is not a populated catalog. It creates the invariant gate
under which the catalog can be built without hand-waving.

## 4. CAP-2A phase status

Every phase remains bounded to five files or fewer and must re-read current
source before editing.

### CAP-2A.2 — source-surface inventory: complete

The closed source contract is
[`cap2-source-surface-contract-v1.ts`](../../../lib/editron/research/capability-census/cap2-source-surface-contract-v1.ts).
The machine-readable snapshot is
[`editron-cap2-source-surface-inventory-v1.json`](./editron-cap2-source-surface-inventory-v1.json).
It binds 11 observation classes to the raw bytes of 222 evidence files:

| Observation surface | Count | Meaning |
| --- | ---: | --- |
| Editron-linked HTTP exports | 175 | HTTP method/route entrypoints, including cross-product routes importing Editron code |
| Chat registry descriptors | 66 | Metadata descriptors, not proof of runtime inclusion |
| Chat compatibility bundle | 59 | Returned compatibility tools before request policy/filtering |
| Editor context functions | 27 | Mixed editing, playback, render, persistence and UI functions |
| Timeline shortcut declarations | 9 | Binding declarations, not atomic edit operations |
| Overlay type declarations | 22 | Timeline media and panel/state discriminators |
| Main `LayerContent` renderer cases | 13 | Main renderer switch cases only |
| `executeDirectorPlan` source surfaces | 10 | Definition plus possible caller modules |
| Public `ProjectService` methods | 36 | Public methods without a CAS/receipt/certification claim |
| Worker/job candidate modules | 17 | Broad filename-matched candidates |
| Proof/render/delivery candidate modules | 42 | Broad filename-matched candidates |

The counts overlap and must not be added together. Three concrete divergences
are now mechanically guarded:

1. Seven descriptors are present in `CHAT_TOOL_REGISTRY` but absent from the
   59-tool compatibility bundle: editorial intent, reference style, three
   clip-analysis lifecycle descriptors and two dubbing lifecycle descriptors.
2. The editor declares 22 overlay types while the main renderer switch handles
   13 cases. Panel-only state and renderer support remain distinct.
3. The 175 HTTP entrypoints include administrative and other-product routes
   that import Editron code. They are integration surfaces, not 175 editing
   capabilities.

Every observation retains `NO_AUTHORITY_CLAIM` and remains listed in
`unresolvedSourceIds`. Phase 2 has frozen discovery evidence only; it has not
merged similarly named callers or granted planner eligibility.

### CAP-2A.3 — owner and parity reconciliation

For every candidate operation, trace:

```text
caller
  -> decision/form owner
  -> mutation owner
  -> canonical stored state
  -> renderer/final consumer
  -> visible or audible proof
```

Then decide whether UI/chat/Director/API callers:

- delegate to the same owner;
- are semantically divergent;
- are wrapper-only aliases;
- duplicate authority; or
- have no trustworthy owner.

No new owner may be introduced merely to make a row complete.

#### CAP-2A.3.1 — core project/timeline/checkpoint: complete

The closed reconciliation contract is
[`cap2-owner-reconciliation-contract-v1.ts`](../../../lib/editron/research/capability-census/cap2-owner-reconciliation-contract-v1.ts).
The source-bound domain artifact is
[`editron-cap2-owner-reconciliation-core-timeline-v1.json`](./editron-cap2-owner-reconciliation-core-timeline-v1.json).
It records 20 candidates against 16 current source files without promoting the
domain into the final atomic catalog.

Verified current truth:

- `ProjectService` is the canonical Mongo persistence owner for the traced
  editor state, but manual and chat callers do not share one canonical command,
  form, revision, receipt or proof contract.
- The manual editor mutates a local React overlay array, keeps a 50-entry local
  undo/redo history and later performs a whole-state save/autosave. Chat tools
  invoke ProjectService writers directly, frequently in multi-write loops.
- Browser manual save and autosave carry the last loaded
  `ProjectRevisionV1`; a stale browser receives HTTP 409 and reloads. This is a
  real stale-browser CAS closure.
- `addOverlay`, `updateOverlay` and one-overlay `deleteOverlay` each perform a
  single ProjectService CAS, but their caller decisions are not pinned to the
  revision used to derive form, placement or target selection.
- Chat batch update, split, trim, linked-delete cascade and gap closure are
  compound multi-write operations. They can commit a prefix before a later
  write fails. `updateProject` then changes generic project fields without CAS,
  revision advancement or a mutation receipt.
- `cutTimelineRange` is a reusable pure state transform, but `cut_section`
  persists its older computed whole-project snapshot through `saveProject`
  without supplying that snapshot's revision. Its public result also omits the
  internal original-to-split-child identity map needed by downstream edits.
- Writer-issued `R_after` is now captured from ProjectService writers and used
  as the rollback CAS predicate. That closes the post-write revision-sampling
  race. The before-checkpoint state is still supplied by a prior project load
  while `createCheckpoint` can independently sample a newer revision; broad
  “rollback race closed” remains false.
- Checkpoint undo verifies an exact state fingerprint after ProjectService
  restore. Chat redo/replay remains intentionally unavailable.
- `AtomicOverlayReceipt` is descriptive overlay metadata, not a project
  transaction receipt or executable capability. The active
  `ProjectMutationReceiptV1` still contains only project ID, revision and commit
  time, not the complete frozen IF1 command/timeline/proof/undo contract.

Only five bounded rows advance as **atomic catalog candidates**, not certified
planner operations: project read, timeline view, single-overlay add, update and
delete. Compound writers, persistence wrappers, local UI controls, metadata
projections and missing redo remain excluded or wrapper-only. Phase 4 must
still populate their closed schemas, effects, proof and policy fields before
any planner eligibility decision.

#### CAP-2A.3.2 — visual/keyframe/transition/caption/render: complete

The source-bound domain artifact is
[`editron-cap2-owner-reconciliation-visual-v1.json`](./editron-cap2-owner-reconciliation-visual-v1.json).
It records 24 candidates against the exact bytes of 27 current source files.

Verified current truth:

- The declared 22 `OverlayType` values are not 22 renderable editing
  capabilities. The timeline `Overlay` union and main `LayerContent` switch
  currently have 13 renderable cases; panel/state discriminators remain
  separate.
- The module named `use-keyframes` and `KeyframeContext` is an ephemeral
  thumbnail-frame cache, not a second animation authority. Actual manual
  animation editing occurs in `KeyframeInspectorPanel` and writes raw local
  `keyframeTracks`.
- Chat `set_keyframes` delegates concrete patch construction to
  `buildKeyframeMutationPatch`, which additionally maintains `speedCurve` and
  focal `transformOrigin` state. It reaches one ProjectService overlay CAS, but
  the selected target/form is not bound to the revision independently read by
  that writer. Manual/chat execution is therefore semantically divergent.
- Camera shake, fade, filter, speed ramp, move/retime and layer reorder each
  currently plan exactly one overlay update and reach one ProjectService CAS.
  They advance only as atomic candidates; none yet has the closed revision,
  receipt and rendered-proof contract required for planner eligibility.
- Manual transition clicks and timeline drag/drop both delegate to the same
  `add_transition` chat/API tool. That is shared downstream plumbing, not safe
  convergence: one logical transition can delete an old tile, update both
  adjacent clips and add a replacement tile through separate writes.
- The live manual/chat transition writer uses the legacy `TRANSITIONS` table
  and does not persist the `AtomicTransitionForm` used by EDL and the renderer.
  It also computes a reduced `maxOverlap` for short clips without applying that
  value to the subsequent writes. The operation remains excluded as unsafe.
- The transition renderer implements real compositing for a bounded style set,
  but missing sources can render black, unknown styles fall through to a
  dissolve and editorial labels such as `match-cut` render no effect. Those
  branches cannot serve as proof that the requested editorial technique worked.
- Chat canonical caption install/refresh/restyle delegates to
  `chat-canonical-caption-adapter` and `canonical-caption-track`; install and
  restyle persist through one revision-checked overlay-family CAS. Refresh is
  only an overwrite-mode wrapper of install.
- Caption convergence is still partial. Manual caption creation and per-track
  styling mutate local overlay state, while `add_fancy_captions` creates
  generated HTML scenes outside the canonical caption representation. Caption
  presets, manual templates and atomic presentation aliases therefore still
  coexist.
- Subject-aware project reframing performs a whole-state save followed by a
  separate generic `updateProject` audit write. It remains an unsafe compound
  operation, not an atomic catalog candidate.
- Browser and render paths still differ (`Video` versus `OffthreadVideo`),
  video rendering contains fixed 30-fps behavior, and visual renderers contain
  visible placeholders/fallbacks. No broad render parity, timebase, caption
  taste or transition-quality certification follows from renderer consumption.

Twelve bounded rows advance as **atomic candidates**, not production-certified
planner operations: canonical caption install/restyle, one-overlay keyframe
set, six one-overlay visual mutations, and three visual read/resolver
operations. Local UI controls, render projections, the thumbnail cache,
caption refresh aliases, fancy captions, subject reframe and transition
workflows remain wrapper-only, unsafe or non-capabilities.

### CAP-2A.4 — atomic catalog population

**Complete.**

[`cap2-atomic-operation-catalog-v1.ts`](../../../lib/editron/research/capability-census/cap2-atomic-operation-catalog-v1.ts)
builds and schema-validates one record for each of the 37 rows admitted by the
five Phase-3 artifacts.  It refuses to load unless its operation definitions
exactly equal the reconciled `ATOMIC_CANDIDATE` set.

Every record now carries the complete Phase-1 contract: closed input/output
schemas, retrieval-only aliases, owners, surface/parity truth, reads/writes/
requirements/productions/invalidations, coordinate domains, revision and
concurrency semantics, failure dispositions, proof obligations, recovery,
reproducibility, policy, resources and final consumers.

The catalog remained deliberately `DRAFT_INCOMPLETE` during Phase 4:

- all 11 overlapping source-observation counts remain bound to the Phase-2
  snapshot and are not summed as a tool count;
- all four project classes are present on every row and remain uncertified;
- all read/analyze/resolve rows are `READ_ONLY`;
- all mutation rows are `EXCLUDED` from planner execution; and
- zero operations are `PRODUCTION_ELIGIBLE`.

This is not pessimism or a missing implementation shortcut.  It prevents the
catalog from turning current single-CAS methods into model mutation authority
before IF1, target/form revision binding, rendered proof and parity are wired.
Missing, duplicate, legacy, wrapper and unsafe rows remain explicit in their
Phase-3 artifacts and do not enter the atomic catalog.

[`cap2-atomic-operation-catalog-v1.test.ts`](../../../tests/editron/cap2-atomic-operation-catalog-v1.test.ts)
proves exact 37-row coverage, source-count preservation, code-reference
resolution, no production promotion, mutation ownership/path completeness,
distinct proof dispositions and concrete invalidation effects.

### CAP-2A.5 — count, consumer and drift gates

**Complete.**

[`cap2-current-truth-freeze-v1.ts`](../../../lib/editron/research/capability-census/cap2-current-truth-freeze-v1.ts)
binds the source snapshot, all five reconciliation artifacts and the exact
37-row catalog with canonical SHA-256 hashes. The catalog is now
`FROZEN_CURRENT_TRUTH`, while the enclosing freeze authority remains explicitly
`FROZEN_CURRENT_TRUTH_RESEARCH_ONLY`.

The freeze gates prove:

- all 11 overlapping source rows, containing 476 observed identifiers, map to
  one or more of the 121 explicitly classified candidates;
- every one of the 37 admitted atomic candidates has exactly one catalog row;
- all 18 mutators declare mutation/persistence owners, writes, a mutation path,
  revision semantics, final consumers and versioned proof obligations;
- manual/chat parity claims match code; and
- any later source drift invalidates the frozen catalog.

The freeze also preserves uncomfortable truth instead of converting gaps into
certification:

- 12 catalog rows retain `DUPLICATED_UNRESOLVED` ownership and stay excluded;
- 14 mutators have a declared proof obligation but no verified live proof owner;
- all four project classes remain uncertified;
- zero operations are `PRODUCTION_ELIGIBLE`; and
- no planner registry, runtime mutation authority or product wiring was added.

[`cap2-current-truth-freeze-v1.test.ts`](../../../tests/editron/cap2-current-truth-freeze-v1.test.ts)
re-hashes all 222 source files and rejects artifact/catalog drift, missing source
coverage and false runtime authority.

## 5. What follows CAP-2A

The governing order remains:

```text
CAP-2A atomic operation truth
  -> V2-1R planning/benchmark contract reset and bounded spikes
  -> V2-1F fair connected model episode
  -> only then a shadow production-agent design
```

V2-1R must replace the historical ambiguous
`candidateCapabilityIds[]` contract with one executed `selectedOperatorId` per
operation node and a separate alternatives list. Generic lowering must be
driven by the selected CAP-2 schema and may add no creative operation that the
model did not select.

## 6. Preview observation spike before infrastructure selection

The generalized `PreviewObservationService` remains a desired architecture,
not current code truth. Before implementing it, run one frozen episode through
all serious observation arms:

1. **Browser/client capture control:** reuse the live player's already-drawn
   pixels for a cheap interactive still. It cannot pass background or final
   acceptance by itself because the tab may close and it does not prove motion
   or audio.
2. **Current server-proof extension:** exercise the existing
   `phase0-rendered-evidence-worker`/QStash/Remotion Lambda still and audio path
   against an exact project/proposal revision.
3. **Generic proposal-bound observation adapter:** generate the smallest
   sufficient state diff, stills, ordered frame burst/short motion proxy and
   decoded audio window from the same pinned inputs. This is a research adapter,
   not a new project or renderer owner.

All arms receive the same:

- project and proposal revision;
- source identities and target time range;
- renderer version and proof specification;
- target claims and required proof dispositions;
- tab-open and tab-closed conditions; and
- failure, timeout and artifact-retention conditions.

Score them on claim coverage, reproducibility, browser/server parity, false
success, latency, compute/storage cost, dirty-range invalidation and
`PASS | FAIL | UNVERIFIABLE` correctness. Browser capture is a control arm, not
an assumed production winner.

## 7. Durable agent-orchestration spike

This is separate from the observation spike. The same frozen editing episode
must test all three serious orchestration choices:

1. extend Editron's current Mongo/QStash job spine;
2. use a web-native durable Workflow/WorkflowAgent-style layer while retaining
   Editron authorities; and
3. reuse only bounded JCode/OpenCode session, permission, compaction or task-UI
   components.

Each arm must preserve:

- ProjectService as the sole project/timeline authority;
- the canonical project/sequence plan rather than chat history as authority;
- typed operation selection from CAP-2;
- pause/resume, approval and bounded repair;
- stale-revision and overlapping-range conflict behavior;
- durable receipts and context-compaction recovery; and
- identical observation and proof requirements.

The spike compares correctness, recovery, operability, latency, cost and
implementation surface. It does not select a framework in advance and cannot
let an imported file/Git/session model become a second Editron authority.

## 8. Explicit non-claims

This phase does not claim that:

- CAP-2 is populated or frozen;
- the 40-row research packet is production-authoritative;
- a `PreviewObservationService` exists;
- the durable agent runtime is selected;
- models have passed the repaired editing benchmark;
- IF1 is wired into this active runtime branch; or
- Adobe-class capability coverage is implemented or certified.

## 9. Phase 1 through Phase 3.2 acceptance evidence

The contract's adversarial tests live in
[`cap2-atomic-operation-contract-v1.test.ts`](../../../tests/editron/cap2-atomic-operation-contract-v1.test.ts).
Phase 1 is acceptable only when its focused tests, repository typecheck,
repository ESLint and diff-integrity checks pass. Later catalog phases require
their own source-count and consumer tests; passing this contract test is not a
shortcut around the census.

Phase 2 drift and adversarial coverage lives in
[`cap2-source-surface-inventory-v1.test.ts`](../../../tests/editron/cap2-source-surface-inventory-v1.test.ts).
It re-extracts every observation from the live TypeScript syntax tree, hashes
all 222 raw evidence files, verifies chat-registry/bundle and overlay/renderer
divergence, and rejects count, ordering, source-union, reconciliation and false
authority drift.

Phase 3.1 coverage lives in
[`cap2-owner-reconciliation-core-timeline-v1.test.ts`](../../../tests/editron/cap2-owner-reconciliation-core-timeline-v1.test.ts).
It re-hashes the 16 evidence files, resolves every cited source symbol, retains
all broad Phase-2 observations as unresolved, guards the stale-snapshot and
non-CAS findings, and rejects compound/non-capability promotion, missing
mutation ownership and evidence-union drift.

Phase 3.2 coverage lives in
[`cap2-owner-reconciliation-visual-v1.test.ts`](../../../tests/editron/cap2-owner-reconciliation-visual-v1.test.ts).
It re-hashes all 27 evidence files, resolves every cited symbol, fixes the
24-row candidate and 12-row atomic-candidate allowlists, guards transition
partial writes/form fragmentation, distinguishes thumbnail caching from
animation state, and rejects false promotion, missing owners, undeclared
domains and evidence-union drift.

#### CAP-2A.3.3 — media/audio/music/SFX: complete

The source-bound domain artifact is
[`editron-cap2-owner-reconciliation-media-audio-v1.json`](./editron-cap2-owner-reconciliation-media-audio-v1.json).
It records 27 candidates against the exact bytes of 23 current source files.

Verified current truth:

- Asset list/search/inspect and source-placement resolution are real bounded
  reads. Their results are not yet bound to immutable asset versions, analysis
  versions or the project revision against which timeline usage was computed.
- `MediaAsset` and upload persistence retain duration and display dimensions,
  but not rational source rate, PTS/timebase, VFR classification, source
  timecode/reel, codec/pixel/bit-depth or colour identity. Current
  `sourceStartFrame` projection therefore cannot support production mixed-rate
  conform or source-frame proof.
- Transcript and audio moment resolvers reject ambiguity and low-confidence
  automatic edits. Their downstream frame handoffs remain unpinned to the
  transcript/evidence and project revisions that produced them.
- Transcription is a provider/cache workflow. Multiple provider strategies can
  populate `media_assets.transcription`; model, source and word-timing quality
  provenance is not a closed reproducibility receipt.
- Direct chat BGM ducking computes one coherent plan but writes every BGM
  overlay separately. A failure can leave a partially updated music family.
  The sound renderer consumes `duckingConfig` and native speech evidence, but
  playback code is not proof of audibility, dialogue intelligibility, clipping
  or delivery loudness.
- `analyzeConditionedMusicBeatGrid` correctly decodes the exact conditioned
  bytes and fails closed on invalid or insufficient beat evidence. In contrast,
  `five-track-analysis` passes an audio URL to a decoded-buffer API and can
  silently substitute 120 BPM. These paths are not converged.
- Chat beat sync is the one bounded audio-domain project mutation that reads a
  revision, validates handles and protected caption boundaries, and commits the
  complete overlay family through one ProjectService CAS. It remains only an
  atomic candidate because the public result omits the writer receipt and its
  timebase/evidence/render-proof contract is incomplete.
- Background-music assignment, uploaded-audio assignment and regenerated BGM
  have meaningful rights, idempotency, conditioning and orphan handling. Each
  still spans media preparation/storage/receipt state and a separate project
  write, so each remains a workflow wrapper rather than one atomic operator.
- `resolveAtomicSfxForm` is the single SFX form owner. It decides timing, mix,
  silence and asset constraints, while `evaluateAtomicSfxAssetCandidate`
  applies bounded quality gates. Neither is itself an executable edit.
- `searchAndDownloadSFX` is not a pure search: a provider miss can trigger
  download, acoustic inspection, upload and media-asset persistence. Chat SFX
  add/replace and transition-SFX placement combine that workflow with separate
  timeline or in-memory writes. They remain wrapper-only.
- The S2 labelling/calibration work validates evaluation tooling; it does not
  certify contextual SFX choice or the audible final mix. Professional buses,
  automation, stems, loudness targets and multichannel delivery remain missing.

Eleven bounded rows advance as **atomic candidates**, not production-certified
planner operations: four asset reads/resolvers, two audio reads/resolvers, the
conditioned-byte beat analyzer, one-CAS beat sync and three transcript
reads/resolvers. All provider/materialization workflows, multiwrite ducking,
render projections, form metadata, missing source identity and missing
professional mixing remain excluded, wrapper-only or missing.

Phase 3.3 coverage lives in
[`cap2-owner-reconciliation-media-audio-v1.test.ts`](../../../tests/editron/cap2-owner-reconciliation-media-audio-v1.test.ts).
It re-hashes all 23 evidence files, resolves every cited symbol, fixes the
27-row candidate and 11-row atomic-candidate allowlists, distinguishes the
measured byte-conditioned beat path from the broken five-track caller, and
rejects workflow promotion, missing mutation owners and evidence-union drift.

#### CAP-2A.3.4 — Director/generated/analysis/durable jobs: complete

The source-bound domain artifact is
[`editron-cap2-owner-reconciliation-director-generated-jobs-v1.json`](./editron-cap2-owner-reconciliation-director-generated-jobs-v1.json).
It records 23 candidates against the exact bytes of 36 current source files.

Verified current truth:

- `executeDirectorPlan` is the active profile-driven orchestration authority.
  It holds a ProjectService Director lease and commits its final whole editor
  state through a receipt-bearing ProjectService CAS. Its analyses, provider
  work, graph updates and child jobs make it a workflow, not one atomic editing
  operation and not the planned vibe-editing agent.
- Editorial-intent and reference-style jobs add useful durable lifecycle
  machinery: deterministic IDs, claims, leases, retries, before/after
  checkpoints, writer-receipt capture, rollback and rendered-evidence dispatch.
  They still delegate creative execution to the old Director and cannot be
  mistaken for a canonical sequence/range plan or generic typed-tool loop.
- No server-owned expandable sequence/range DAG or unified durable PlanService
  exists. Deep-analysis, MG design/render, editorial-intent and reference-style
  each own family-specific Mongo/QStash job state.
- Baseline/deep analysis produces useful layered evidence, including semantic
  visual windows, V-JEPA, wav2vec, music, moment and segment projections.
  Provider degradation is recorded. A generic target-claim/candidate-operation
  evidence policy that derives, validates, stores and invalidates the exact
  dense evidence required for precision edits remains missing.
- Chat deep analysis is revision-aware and durable, but its current video path
  samples at 1 fps and caps the selected window. That can answer bounded coarse
  questions; it cannot prove frame-accurate masks, tracking, action matching or
  tightly synchronized edits.
- Canonical project analysis reads explicitly choose between project snapshots
  and canonical per-asset analyses. The two stores are still separately
  writable and returned evidence is not bound to immutable source, analyzer and
  project revisions.
- Generated-composition state is materially further along than the earlier
  research-only lab: ProjectService has atomic `prepare` and `finalize` CAS
  methods with issued state tokens and project receipts. Finalization preserves
  PASS, FAIL and UNVERIFIABLE distinctly and promotes only PASS.
- Those state methods are not product-wired. Outside tests, no production route
  or service calls them; no editor or renderer consumes the canonical state.
  The legacy projection declares itself `DERIVED_VIEW_ONLY` and `NOT_WIRED`, and
  supports only a narrow 30/1 CFR square-pixel SDR BT.709 compatibility profile.
- The research `GeneratedCompositionProgram` verifier and sandbox remain
  valuable evidence: execution is isolated, network-denied and non-persistent.
  They do not mutate ProjectService and are not a product capability.
- Three MG systems still coexist: template-first filled HTML, AI MG codegen with
  durable design/render/sequence delivery, and the generalized generated-
  composition research/state contracts. They are not converged.
- MG design/render jobs have real durable claims, leases, retries, sandbox and
  final ProjectService delivery. End-to-end generation spans job, artifact,
  media and project stores, so the workflows are not atomic planner tools.
- Several job routes now fail closed when both QStash signing keys are absent,
  but Director and asset-analysis workers still contain raw-handler fallbacks.
  The full worker/API/security surface is reconciled in CAP-2A.3.5.

Only three bounded rows advance as **atomic candidates**, not production-
certified planner operations: canonical project-analysis read and the two
ProjectService generated-composition state transitions. Director, analysis and
MG workflows remain wrapper-only or non-capabilities; canonical agent planning,
claim-conditioned precision evidence, unified durable planning and generated-
composition product consumption remain explicitly missing.

Phase 3.4 coverage lives in
[`cap2-owner-reconciliation-director-generated-jobs-v1.test.ts`](../../../tests/editron/cap2-owner-reconciliation-director-generated-jobs-v1.test.ts).
It re-hashes all 36 evidence files, resolves every cited symbol, fixes the
23-row candidate and three-row atomic-candidate allowlists, verifies no product
caller invokes generated-composition prepare/finalize, preserves the Director/
job wrapper boundary and rejects false MG convergence or promotion.

## 9. Phase 3.5 — render, proof, delivery, API and worker ownership

Artifact:
[`editron-cap2-owner-reconciliation-render-proof-delivery-v1.json`](./editron-cap2-owner-reconciliation-render-proof-delivery-v1.json)

This domain reconciles 27 candidates against 34 hash-bound evidence files.
It records the render lifecycle as distinct stages rather than one fictional
tool: authenticated request, render admission, provider execution, chapter
assembly where needed, durable finalization, artifact probing, delivery
manifest projection and post-render effects.

Verified current truth:

- The main editor selects the Lambda path.  It reserves an Editron-owned job
  before provider dispatch, and standard webhook, standard polling and chapter
  completion all hand successful artifacts to `beginRenderFinalization`.
- The finalizer claim token prevents competing observers from publishing the
  same completion.  A public `done` response requires the finalized URL and
  persisted probe receipt.  This is real shared downstream plumbing.
- It is not complete render convergence.  A separate process-local SSR helper
  remains in source with its own H.264/BT.709 behavior and no durable job or
  finalizer receipt.  Current `RENDER_TYPE` selects Lambda, so the helper is not
  represented as the main path.
- Finalization proves format/video/audio duration within a one-millisecond
  tolerance and records basic stream facts.  It does not compare the output
  against an expected rational rate, exact raster/SAR, codec profile, pixel
  format/bit depth/chroma, color/HDR metadata, audio layout/loudness or chapter
  boundary continuity.  It is not professional master QC.
- The finalizer rejects durations above three hours.  Chapter splitting uses
  27,000/4,500/900 fixed-frame thresholds and ignores its FPS parameter while
  choosing boundaries.  Useful long-render orchestration therefore does not
  establish the planned four-to-five-hour, mixed-rate production contract.
- ProjectService has three strong receipt-bound Phase-0 state transitions:
  pre-render fact recording, rendered-snapshot claiming and rendered-evidence
  recording.  Each uses project CAS and rejects stale evidence.
- The visual/audio proof workflows around those writes are specialized.  They
  use Phase-0 and chat-specific pass/warn/fail/error/missing vocabulary, sample
  stills or bounded audio windows, and do not yet form the generalized,
  plan-node/range-bound `PreviewObservationService` required by the target
  agent architecture.
- The current delivery manifest distinguishes embedded-music mixed masters
  from clean masters plus a manual platform-native music handoff.  It does not
  implement OTIO/FCPXML/AAF/EDL interchange, conform/reconform, professional
  master variants, stems/caption packages, full QC or archive/restore.
- Two render-finalizer routes fail closed in production when either QStash key
  is absent.  Twelve inspected internal workers still choose raw handlers when
  signing keys are absent: Video Analysis, Tribe, asset analysis, asset deep
  analysis, asset transcription, brand learning, chapter concat, Clickatron
  variation, Director, Director failure, graph sync and Phase-0 rendered
  evidence.  The active branch has no shared route-wide auth owner.

Only six bounded rows advance as **atomic candidates**, not production-
certified planner operations: the three receipt-bound ProjectService Phase-0
state transitions and three current render-job reads.  Render/export, chapter,
finalization, chat proof and API routes remain wrappers or internal lifecycle
plumbing.  Professional QC, timebase/format identity, interchange, archive,
generalized preview observation and shared worker authorization remain partial
or missing.

Phase 3.5 coverage lives in
[`cap2-owner-reconciliation-render-proof-delivery-v1.test.ts`](../../../tests/editron/cap2-owner-reconciliation-render-proof-delivery-v1.test.ts).
It re-hashes all 34 evidence files, resolves every cited symbol, freezes the
27-row candidate and six-row atomic-candidate allowlists, proves the shared
finalization handoff without claiming complete convergence, fixes the exact
raw-worker fallback set, and rejects false wrapper promotion or evidence drift.
