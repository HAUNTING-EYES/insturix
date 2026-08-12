# Editron Open-Ended Editing Benchmark V2-0 Freeze

Date: 2026-08-13
Branch: `infrastructure-improvs-+Editron`
Status: frozen research specification; no provider or production execution

## Result

V2-0 replaces the unfair one-shot “emit the exact graph” measurement with seven independently attributable stages:

1. target reconstruction;
2. editorial operation and execution-form selection;
3. evidence, rights, privacy, revision, and preservation binding;
4. exact typed compilation;
5. safe proceed/stop disposition;
6. isolated proxy execution and rendered/audible proof;
7. blind editor review.

Stages 6 and 7 are specified but unavailable until V2-1. Therefore this freeze does **not** show that a model can edit, that `GeneratedCompositionProgram` works, or that Editron is production-ready.

## Frozen artifacts

- `tests/fixtures/editron/open-ended-planner-v2/benchmark-contract-v2.json`
- `tests/fixtures/editron/open-ended-planner-v2/operator-specs-v2.json`
- `tests/fixtures/editron/open-ended-planner-v2/tasks-v2.json`
- `tests/editron/open-ended-planner-v2-fixture-integrity.test.ts`

The contract binds five source artifacts by exact SHA-256: the V1 operator catalog, both V1 task splits, CAP-0, and CAP-1.

## Operator and capability truth

The repository already had 39 research `OperatorSpecV1` records. V2 adapts those records instead of creating another runtime registry:

- 14 research-read-only operators;
- 18 existing isolated-proxy-only operators;
- 7 existing non-compilable operators;
- 1 new `generated_composition_program` research specification.

The generated-composition record is not an implementation. It has no state effect in V2-0, no network authority, no production eligibility, and no ProjectService authority. A future V2-1 harness may compile it only in an isolated, allowlisted, deterministic sandbox and must return visual/audio proof without directly mutating a project.

The 39 agent/tool records are not the whole editor. CAP-0 also records manual UI capabilities. The V2 catalog therefore contains a separate 30-row `capabilityCoverage` map:

- every CAP-0 candidate is represented exactly once;
- covered operations point only to real V2 operator IDs;
- manual operations without a compiler adapter remain explicitly unrepresented;
- UI availability never implies chat/model parity or production certification.

This prevents both failure modes: hiding real manual functionality from the model study, and inventing a callable operator merely because a UI control exists.

## Task and media truth

The packet preserves all 12 V1 user requests byte-for-byte:

- 4 visible development tasks;
- 8 sealed holdouts;
- 20 synthetic media recipes.

V1 used placeholder bindings such as `sha256:oe2-generated`. V2 does not treat those as content hashes. Each asset now has an exact SHA-256 over its canonical recipe and an explicit `artifactSha256: null` / `NOT_MATERIALIZED_V2_0` disposition. V2-1 must materialize the bytes and freeze their real hashes before any provider receives them.

The task set covers:

- a transcript, visual push-in, and dialogue-ducking compound edit;
- difficult moving-panel/reference reconstruction;
- beat-aligned cuts with dialogue preservation;
- a missing moving-matte capability;
- unnamed match-cut-like geometric reasoning;
- deliberate repeated-footage bookending;
- transcript/caption semantic preservation;
- tracked vertical reframing with authored-logo preservation;
- rights/egress denial;
- stale-revision conflict;
- unsupported fine-contour isolation and selective grade.

## Fairness invariants

- Editorial reasoning is scored before exact API serialization.
- Multimodal and text-plus-evidence arms are never pooled.
- Free-choice, forced-native, forced-generated, forced-hybrid, threshold, and signal-ablation routing arms are declared separately.
- Every operator input/output has a closed machine schema assembled from declared fields; extra fields are forbidden.
- Every condition declares available and omitted evidence.
- An active predicate may not require evidence omitted by that condition.
- Holdout `evaluatorOnly` data is excluded from model-visible fields.
- Clarification, capability gap, policy block, conflict, failure, and unverifiable remain distinct from success.
- One repair attempt is allowed; budgets, finish reason, reasoning/visible tokens, truncation, latency, cost, parse status, diagnostics, and artifact hash are mandatory telemetry.

## What the old result means now

The earlier `0/45` executable result measured exact low-level graph serialization, editorial selection, missing evidence, and capability gaps together. It remains evidence that the V1 packet did not produce valid executable graphs. It is **not** a fair standalone verdict that the models cannot reason about editing.

V2 makes those failure causes separable. It does not pre-judge the result: V2-1 can still produce GO, MODIFY, or NO-GO.

## Verification

- Focused Vitest: 9/9 passed.
- `pnpm exec tsc --noEmit`: passed with an 8 GB Node heap.
- `pnpm exec eslint . --quiet`: passed with an 8 GB Node heap.
- Changed scope: exactly these five research fixture/test/document files.
- Production runtime imports added: zero.
- Project reads/writes, provider calls, network requests, renders, and user-data changes: zero.

## V2-1 entry conditions

V2-1 may begin only from this frozen packet and must remain an isolated research run. Its first work is:

1. deterministically materialize the 20 synthetic recipes and freeze real media hashes;
2. build model-visible packets that provably exclude `evaluatorOnly` fields;
3. implement per-stage artifact capture and exact budget telemetry;
4. smoke-test development tasks before any holdout is opened;
5. compile/verify, proxy-render, permit one bounded repair, and run blind editor review;
6. report each stage independently and compare routing arms without pooling incompatible provider modalities.

V2-1 still may not mutate a production project, install web-derived capabilities, create a second timeline authority, or claim Adobe-class replacement.
