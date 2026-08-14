# Editron OE V2 Stage 4 exact-compilation definitive results

Date: 2026-08-14
Branch: `infrastructure-improvs-+Editron`
Authority: research only; no media execution or project mutation

## Result

Stage 4 did not pass for either GPT-5.6 Luna or GPT-5.6 Terra.

Both models returned a schema-valid `CompiledOperationGraphV2` on their first
attempt and both honestly kept the requested graph `NOT_EXECUTABLE` because
`generated_composition_program` remains `RESEARCH_ONLY_NOT_IMPLEMENTED`.
Neither artifact passed the independent semantic compiler evaluator.

This is narrower than the original OE-1 one-shot failure:

- both responses passed provider transport and the closed top-level schema;
- both preserved the exact Stage-2 and Stage-3 source hashes;
- both preserved capability-gap honesty;
- failures were confined to typed operator inputs, graph dependencies, or
  node-reference semantics;
- no schema repair was used.

The result is therefore **exact compilation FAIL**, not "the models cannot plan
an edit." Stage 2 routing and Stage 3 evidence binding remain passed. It also
is not permission to execute any part of the graph.

## What Stage 4 tested

The producer was the sole staged-packet builder in
`lib/editron/research/open-ended-planner/staged-packet-v2.ts`. It hash-bound:

- the canonical Stage-2 `EditorialIntentGraphV2`;
- the evaluator-approved Stage-3 `EvidenceBoundIntentGraphV2`;
- the Stage-3 evidence pack;
- the exact V2 operator catalog and closed input fields;
- project `oe-dev-02` at expected revision `R3`;
- proof, preservation, policy, resource, concurrency, retry, reversibility,
  coordinate, and trace-reference requirements.

Each provider produced a candidate compiled artifact. The separate
`stage4-compilation-evaluator-v2.ts` consumer checked source-chain integrity,
operator resolution, input binding, dependency graph, node contract,
policy/revision, proof/preservation, and capability honesty. No executor,
ProjectService writer, renderer, or user project was called.

## Frozen final run

| Binding | Value |
| --- | --- |
| Plan hash | `26a6d1f783108e77679a1a04652ebe2419826722aa306c6846cd28d878be8b2d` |
| Packet hash | `6ffc9a91408d1c3900f27cdc00b504e716a832e1bb94ddca62a4534aa7e90c8b` |
| Receipt hash | `c2dec95a287d5eccef6f67bbc5de78671a47e1a024b9441836cf7245efd10f9b` |
| Receipt file SHA-256 | `a3139bfe1923c579c1cf7ee5cb35a935efbd2472dc3ee9802540ef39f7d14654` |
| Receipt path | `.calibration-temp/open-ended-planner-v2/provider-smoke/stage4-exact-compilation-final-20260814.json` |
| Maximum authorized spend | `$0.96` |
| Actual provider spend | `$0.119230625` |

### Final provider telemetry

| Route | Provider-native model | Input | Visible | Reasoning | Total | Latency | Cost | Result |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Luna | `gpt-5.6-luna` | 10,070 | 3,503 | 1,704 | 15,277 | 32,275 ms | `$0.04382875` | schema pass; evaluator FAIL |
| Terra | `gpt-5.6-terra` | 10,070 | 1,403 | 1,526 | 12,999 | 27,530 ms | `$0.075401875` | schema pass; evaluator FAIL |

The persisted receipt contains no credential, authorization header, raw
provider response, or `sk-` secret prefix.

### Final dimension results

| Dimension | Luna | Terra |
| --- | --- | --- |
| source chain | PASS | PASS |
| operator resolution | PASS | PASS |
| exact input bindings | FAIL | PASS |
| dependency graph | FAIL | PASS |
| node contract | PASS | FAIL |
| policy and revision | PASS | PASS |
| proof and preservation | PASS | PASS |
| capability honesty | PASS | PASS |

### Luna's final failures

Luna compiled seven legal read/resolver nodes and correctly inspected both
owned assets. It then failed two explicit contracts:

1. Both `inspect_user_asset` nodes included `expectedProjectRevision`, which is
   not a field in that operator's closed input schema.
2. It emitted no dependency edges, even though compiled source-resolution,
   continuation, and proof nodes existed. This violated the source intent's
   required ordering from source resolution to continuation and from
   continuation to proof.

These are genuine compilation errors. The operator field list, closed-input
rule, source dependencies, and compiled-edge rule were all present in the
final provider packet.

### Terra's final failures

Terra correctly emitted the two mandatory `inspect_user_asset` nodes and
canonical output references. It then:

1. put `proof-asset-rights` and `proof-source-ranges` in each node's
   `requires`, although that field permits only fact IDs, compiled node IDs, or
   declared compiled-output references; and
2. put policy reason codes `KS-018_ONLY` and `SYNTHETIC_ONLY_NO_EGRESS` in
   `traceRefs`, although trace references permit policy IDs, not reason codes.

These are genuine node-contract errors under the final explicit policy.

## Fairness precursors

Two earlier paid runs are retained and are not counted as definitive model
scores. They found hidden or ambiguous benchmark rules. They must not be
deleted or relabelled as final failures.

### Precursor 1: output-reference semantics were undefined

| Binding | Value |
| --- | --- |
| Plan hash | `712300c5c435e943181092acff44785a621b4e3e73161da28ba9811e0ef57a4f` |
| Receipt hash | `f84b051fe50457717bff4fb40938de92014ef109f59e13ea42c8522afb4b9403` |
| Receipt file SHA-256 | `74677d2e66ff5da89a6d878ed444babfb98dbc98926294af8d202c6700fc2512` |
| Receipt path | `.calibration-temp/open-ended-planner-v2/provider-smoke/stage4-exact-compilation-20260814.json` |
| Spend | `$0.117027125` |

The policy allowed "declared output references" but did not define a syntax.
Luna reasonably produced `nodeId.outputName`, while the evaluator secretly
expected bare output names. The evaluator also rejected output references in
`requires` despite the policy explicitly allowing them. Commit `ef3e41a48`
froze `<compiledNodeId>.<operatorOutputName>`, validated its producer and DATA
edge, and explicitly required read/resolver `invalidates: []`.

Replaying the stored first-run artifacts through the corrected evaluator
removed 15 Luna diagnostics. Terra's missing inspections and invented trace
labels remained.

### Precursor 2: unresolved source-edge handling was hidden

| Binding | Value |
| --- | --- |
| Plan hash | `eb7beb6640d74a071c64cb87ec8404a4b93e00829ec97917b1e816609669090a` |
| Receipt hash | `166e365879371a800413c876e0e70638355f0d578cf1da51279f5e7f1b33a451` |
| Receipt file SHA-256 | `233ab79c7a2a9a48b197e2ddd18f45e6f2f04b876e22e07cbe243ef759be3865` |
| Receipt path | `.calibration-temp/open-ended-planner-v2/provider-smoke/stage4-exact-compilation-definitive-20260814.json` |
| Spend | `$0.107539` |

Luna passed every dimension except graph endpoints, but the policy had not
said that source-intent edges with unresolved endpoints must be omitted from
the compiled graph. Commit `a1cdf2f20` made the invariant explicit: every edge
endpoint must identify an emitted compiled node; unresolved dependencies stay
in structured diagnostics.

Total Stage-4 provider spend across both precursors and the final run was
`$0.34379675`.

## Architecture verdict

The benchmark does not support handing a large exact runtime contract directly
to a model and treating schema-valid JSON as compiled code. It does support the
separation already proposed for Editron:

1. a model reconstructs the target and proposes editorial operations;
2. deterministic code resolves operator specs, exact ports, revisions,
   coordinates, dependencies, policies, proofs, and failure dispositions;
3. a verifier rejects any graph that cannot be compiled exactly;
4. only an evaluator-approved graph can reach execution or preview.

Models may still help choose semantic operations and repair a rejected
proposal, but they are not the authority for exact port syntax, project
revision identity, or graph validity.

The requested filmstrip remains correctly routed as a hybrid full plan with a
bounded generated-composition island. Stage 4 does not make that island live.
`generated_composition_program` is still missing its compiler, sandbox,
renderer contract, and proof path.

## Implemented artifacts and commits

- Stage-4 source-chain provenance: `c5e01c788`
- Full typed Stage-4 output contract: `55a954819`
- Independent evaluator and bounded runner: `a26b460bf`
- Fair cumulative provider budget: `f65361add`
- Canonical output-port semantics: `ef3e41a48`
- Compiled-edge semantics: `a1cdf2f20`

Verification after the final contract correction:

- 33/33 focused cross-stage tests passed;
- `pnpm exec tsc --noEmit` passed;
- `pnpm exec eslint . --quiet` passed;
- exact Stage-2 and Stage-3 frozen hashes remained unchanged.

## Cohort status

- Luna: Stage 2 pass, Stage 3 pass, Stage 4 exact compilation fail.
- Terra: Stage 2 pass, Stage 3 pass, Stage 4 exact compilation fail.
- Qwen 3.8 Max: not run in Stage 4. The available `sk-sp-` Token Plan
  credential is not a standard application API credential for this harness.
- Gemini Flash: its model ID was previously proven valid; it was outside the
  operator-selected Stage-4 cohort. The earlier provider failure was quota,
  not an invalid model name.
- Gemini Flash-Lite: excluded after Stage-2 capability-honesty failure.

## Next gate

Do not dispatch Stage 5 from either failed model artifact. There is no
evaluator-approved Stage-4 artifact to consume.

The next bounded slice is a deterministic Stage-4 compiler baseline that takes
the evaluator-approved Stage-3 artifact and emits the legal read/resolver
subgraph plus structured capability-gap diagnostics. It must pass the same
independent evaluator without changing the frozen source artifacts. Stage 5
can then deterministically return `CAPABILITY_GAP`/stop because the generated
composition owner is not implemented.

Only after that control path is sound should Editron implement and certify the
`GeneratedCompositionProgram` compiler/sandbox/preview boundary and attempt
proxy execution. No project mutation, production model-driven editing, or
Adobe-class claim is authorized by these results.
