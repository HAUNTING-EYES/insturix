# Editron OE Benchmark V2-1B — No-Provider Staged Harness

Date: 2026-08-13
Branch: `infrastructure-improvs-+Editron`
Status: provider-visible development packets frozen; no model dispatched

## Result

V2-1B turns the V2-0 seven-stage design into a deterministic, leak-checked development trial plan without calling a provider.

The frozen topology is:

- 4 visible development tasks;
- 2 evidence conditions per task;
- 2 separately scored modality arms;
- 16 shared stage-one target-reconstruction packets;
- 6 routing experiments per stage-one result;
- 96 stage-two branch plans.

Each target reconstruction happens once before routing. Forced native/generated/hybrid instructions cannot alter what the model initially says it sees in the request, reference, video, or audio.

The frozen plan hash is:

```text
2c48272a7c137b012ec23060d521516a383513c4cf3455f8623400b1b6146d01
```

No model response, executable graph, proxy render, editor score, GO/MODIFY/NO-GO verdict, or production capability claim was produced.

## Existing-owner reconciliation

V1 already contains:

- `materializePlannerPacketV1` for the old one-shot packet;
- `runPlannerTrialV1` for provider-neutral V1 dispatch/recording;
- `createPlannerProviderAdapterV1` for concrete provider HTTP calls.

V2-1B does not patch or duplicate those owners. It adds a distinct V2 staged packet builder because the V1 packet combines operation selection and exact graph serialization and cannot represent shared stage-one reconstruction followed by controlled routing branches.

The V2 builder imports no provider adapter, calls no `fetch`, and has no ProjectService, renderer, registry, checkpoint, journal, CRG, or timeline dependency.

## Leak prevention

The source task fixture is never serialized wholesale. Provider-visible objects are constructed from an explicit allowlist:

- original user request;
- project ID and revision;
- frame rate, canvas, duration, and asset identity/type/rights facts;
- condition-visible structured evidence;
- permitted media descriptors for the multimodal arm;
- stage-specific instructions, budget, and output schema;
- truthful public operator fields for stages 2–4.

The builder recursively rejects these evaluator or answer-bearing keys:

- `evaluatorOnly`;
- `baselineDisposition`;
- `acceptableExecutionForms`;
- `requiredOperationFamilies`;
- `missingCapabilities`;
- `requiredBehaviour`;
- `allowedDispositions`;
- `activePredicateIds`;
- evaluator predicates and V1 behavior briefs.

This closes a concrete trap in the frozen task source: condition records contain evaluator-facing allowed dispositions, but provider packets receive only condition ID plus available, omitted, and replacement evidence IDs.

## Modality isolation

Both arms receive the same request, project facts, and structured evidence.

`MULTIMODAL` additionally has a transport envelope containing exact artifact path, MIME type, byte size, and SHA-256. The model-visible JSON receives descriptors and hashes, not local paths.

`TEXT_EVIDENCE_ONLY` has:

- no attachments;
- no artifact paths;
- no `.calibration-temp` path;
- no image, video, or audio bytes.

Results from these arms remain separate. Provider inability to accept one media type must later become `NOT_APPLICABLE`, not a failed or silently downgraded multimodal trial.

## Evidence correctness

Condition-withheld evidence is absent from the evidence payload while its ID remains declared under `omittedEvidenceIds`. This lets the model know what is unavailable without leaking its value.

All V1 placeholder bindings such as `sha256:oe2-generated` are replaced in provider packets by the actual V2-1A artifact SHA-256 and preserved project revision suffix.

No holdout task ID, request, media, evaluator data, or plan row is present in the development packet set.

## Stage mechanics

Stage 1 is fully materialized and hash-frozen.

Stages 2–5 are implemented as sequential packet builders but are not pre-fabricated with fake outputs:

- stage 2 requires a same-task `ReferenceBlueprintV2`;
- stage 3 requires a same-task `EditorialIntentGraphV2`;
- stage 4 requires a same-task `EvidenceBoundIntentGraphV2`;
- stage 5 requires a same-task `CompiledOperationGraphV2`.

Skipping a stage or supplying the wrong task/artifact type fails loudly. Stage 4 receives the exact public field schemas required for closed compilation. Stage 5 receives no operator catalog because it judges compiler diagnostics and safe disposition rather than replanning.

Stages 6 and 7 remain blocked in V2-1B because no proxy executor or render exists in this slice.

## Routing experiments

Every stage-one packet branches equally into:

1. `FREE_CHOICE`;
2. `FORCED_NATIVE`;
3. `FORCED_GENERATED_COMPOSITION`;
4. `FORCED_HYBRID`;
5. `THRESHOLD_ABLATION`;
6. `SIGNAL_ABLATION`.

Forced arms narrow the stage-two output schema to the assigned form plus `CAPABILITY_GAP`. They never force the model to lie that an infeasible form succeeded.

The threshold ablation removes any step-count routing heuristic. The signal ablation removes model-confidence or unsupported taste-score routing signals. These arms test the routing theory; they do not encode a conclusion that a step threshold is correct.

## Budget and telemetry

The five provider stages allocate the complete V2-0 trial ceiling exactly:

| Budget | Stage sum |
| --- | ---: |
| Input tokens | 30,000 |
| Visible output tokens | 7,000 |
| Reasoning tokens | 12,000 |
| Wall-clock time | 180,000 ms |
| Provider cost | USD 0.50 |

The no-provider record contains all 18 required telemetry fields with explicit zero/not-attempted values, including provider/model, request ID, modality/routing arm, token classes, finish reason, truncation, latency, cost, parse status, diagnostics, and artifact hash.

## Artifacts

- `lib/editron/research/open-ended-planner/staged-packet-v2.ts`
- `scripts/build-open-ended-planner-v2-no-provider-plan.ts`
- `tests/fixtures/editron/open-ended-planner-v2/development-no-provider-plan-v2.json`
- `tests/editron/open-ended-planner-v2-staged-packet.test.ts`
- this closeout document

The plan can be reproduced with:

```powershell
pnpm exec tsx scripts/build-open-ended-planner-v2-no-provider-plan.ts
```

## Verification

- V2 fixture, media, and staged-packet tests: 21/21 passed.
- Two plan builds: byte-identical.
- Gitignored plan and tracked plan: byte-identical.
- Five bound source hashes: matched current files.
- Stage-one hashes: 16 unique.
- Branch IDs: 96 unique; exactly 16 rows per routing arm.
- Text-only attachments: zero.
- Recursive evaluator-key adversarial probe: rejected.
- Sequential stage and same-task artifact adversarial probes: rejected.
- `pnpm exec tsc --noEmit`: passed with an 8 GB Node heap.
- `pnpm exec eslint . --quiet`: passed with an 8 GB Node heap.

## Next bounded slice

V2-1C should implement and test the V2 provider transport/recording boundary before spending on live trials:

1. serialize the exact stage-one JSON Schema and transport attachments per provider;
2. capture native provider finish reason and all available reasoning/cached-token fields without converting missing telemetry to fake zeros;
3. enforce per-stage timeout, token, and USD limits before and after dispatch;
4. mark unsupported modality combinations `NOT_APPLICABLE`;
5. test success, refusal, timeout, truncation, malformed output, usage drift, and one bounded repair against fake HTTP responses;
6. perform no production project mutation and open no holdout.

Only after V2-1C passes should a smoke run spend money on the four development tasks.
