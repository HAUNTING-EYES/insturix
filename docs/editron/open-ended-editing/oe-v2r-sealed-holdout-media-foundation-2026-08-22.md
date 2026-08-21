# Editron V2R sealed-holdout media foundation — 2026-08-22

## Verdict

`HOLD-01` through `HOLD-08` now have deterministic, rights-bound synthetic
media suitable for a zero-inference benchmark preflight. This is
`INPUT_EVIDENCE_READY`, not provider execution, model success, rendered edit
quality or production certification. The subsequent local cohort preflight is
now `PASS_READY_FOR_CREDENTIAL_PREFLIGHT`, and the generic public-case episode
shell and owner connector are `RESEARCH_CONNECTOR_READY`. Owner-only evidence
resolution and isolated operation-log execution are wired; real native media
execution, generated compilation/rendering, lowering, proof and evaluation
remain unwired. Provider dispatch remains disabled.

## Bound identity

- Implementation commit: `79f5caf839f89d786f8c563f11732f1a65c339d8`
- Contract: `EDITRON_OE_HOLDOUT_MEDIA_MANIFEST_V2R`, version `2.2.0-r1`
- Scope: exactly eight sealed holdout tasks and twelve artifacts
- Manifest SHA-256:
  `435a7b35f9e4f7d8071609100c38031a17058a3bc96950ed9e603dd78b0535ed`
- FFmpeg binary SHA-256:
  `c8abc49e7be62dde8e12972af373959e0076a7b8dc8040eb45978e0608f8781e`
- Frozen identity:
  `tests/fixtures/editron/open-ended-planner-v2/holdout-media-identity-v2r.json`
- Current authoritative local materialization:
  `.calibration-temp/open-ended-planner-v2/holdout-media-v2r-r2-20260822`

The earlier local directory
`.calibration-temp/open-ended-planner-v2/holdout-media-v2r-20260822` is
superseded. It is retained rather than destructively removed and must not be
selected by the benchmark.

## What the fixture proves

- The materializer binds the immutable V1/V2 task recipes and refuses a task
  set other than eight sealed holdouts.
- Every asset is declared `INTERNAL_OWNED_FIXTURE`; network access and provider
  or project authority are denied.
- Artifact identity is independent of the local output path and binds exact
  bytes, recipe, generator sources and codec toolchain.
- `HOLD-04` carries embedded synthetic tone audio with an authored quiet
  interval. It can exercise temporal audio preservation mechanics. It is not
  intelligible dialogue and cannot prove speech intelligibility or caption
  quality.
- Unsupported asset IDs, unsafe repository-root output, an existing output
  directory, source drift and byte/hash drift fail closed.

## Leakage-free cohort preflight

Commit `f3ce50970` adds a separate V2R cohort rather than changing the frozen
DEV staged-packet implementation. The cohort binds:

- eight sealed tasks and sixteen opaque `C1`/`C2` cases;
- the same complete forty-operation V2R/CAP-2A planning context in every case;
- thirty-three research-callable operations and seven visible but honestly
  `NOT_COMPILABLE` operations;
- model-visible task/media/policy/evidence-availability facts;
- exact owner-only evidence and evaluator-only policy in separately hashed
  partitions.

The public packet contains no semantic condition name, `evaluatorOnly`,
behaviour brief, success predicate, allowed disposition or active predicate.
The local preflight made zero network calls, inference calls, project reads or
project mutations and kept `dispatchAuthorized=false`.

- Cohort contract SHA-256:
  `1b830040ea2b1b6ea3fb6c880fed4864e6da0b879e9e0a8960572e26fa309150`
- Preflight contract SHA-256:
  `5d20adbd709a91b3989cbd87394a0a122e97317cc422c0e731af964dfc22da15`
- Cohort manifest SHA-256:
  `abdcafe133cbff5f4e9b8325e665636d6d553a6fd966b0170e37bbd97cc5cdbb`
- Shared model context SHA-256:
  `f501f0e3bb7c4bee3bc4e3dd1c418adc9cd5ff933439baf81386009c3a205338`
- Local preflight receipt SHA-256:
  `69821f932e6baf6c5312d764ebdb836c232f842e7e3b018fcac621fea46b8773`

## Generic public-case episode shell

Commit `2a0176cc9f84f6b253a49757e1145f3dcf6c00be` connects each frozen public
case to the existing provider-native sequential tool loop without modifying the
historical DEV harness. It establishes these boundaries:

- every case receives the same complete forty-operation planning context;
- thirty-three operations are provider-callable while the seven unavailable
  records remain visible and cannot be fabricated as calls;
- a task-shaped operation subset is rejected rather than used as a hidden hint;
- direct arguments and typed opaque-result references use the existing handoff
  protocol;
- `POLICY_BLOCKED` is distinct from `FAIL`, `CAPABILITY_GAP`, `UNVERIFIABLE`
  and `CONFLICT` for supplied rights, privacy, egress or security denial;
- evaluator-only facts, semantic condition names and expected answers remain
  absent from provider requests;
- the shell has no ProjectService authority and records no real-project state
  effects.

Commits `7e80a05b4` and `2835458fb` close two protocol defects and connect the
default owner session:

- `CLARIFICATION_REQUIRED` remains distinct from failure and capability gap;
- opaque handoff projections are derived from the complete operator schemas,
  including every callable writer's `receipt.projectRevision` as a possible
  downstream `expectedProjectRevision` origin;
- owner-only evidence is returned only after a compatible declared read call;
  condition names, evaluator facts and expected answers remain hidden;
- the in-memory research clone rejects project/revision drift and issues a
  deterministic writer revision for each admitted mutation;
- receipts explicitly record `RESEARCH_CLONE_OPERATION_LOG_ONLY` and
  `renderedProof: NOT_RUN`.

The connector validates provider protocol and causal revision flow, but it
does not execute the real native media owners, compile generated code, render,
mutate ProjectService or judge the result. `RESEARCH_CONNECTOR_READY` therefore
does not mean executable holdout certification or provider readiness.

## What remains before provider calls

1. Freeze schema-driven selected-operation trace lowering and hidden evaluation
   before inference. Lowering may
   bind exact arguments, coordinates, revisions and result references; it may
   add or remove zero model-selected creative operations.
2. Connect claim-appropriate real native/generated proof adapters. The current
   operation-log clone is insufficient for visual, audible or semantic PASS.
3. Capture the exact Luna, Terra and Gemini requests, verify provider-native
   model identity and modalities, count/bound input tokens, and issue a
   production-credential zero-inference receipt.
4. Only after that receipt may the explicitly authorized cohort dispatch. CAP-2A
   V3 remains an immutable bound census artifact, not newly reissued merely
   because research harness files were added.

## Verification at issuance

- Holdout materializer: 4/4 tests passed.
- Combined development and holdout materializers: 11/11 tests passed.
- Sealed cohort/preflight tests: 3/3 passed; combined focused checks: 7/7.
- Generic causal/owner connector checks: 16/16 passed.
- `npx tsc --noEmit`: passed.
- Repository ESLint: passed.

These checks establish reproducible benchmark inputs only. No provider saw a
sealed task, no model row ran, and no Editron project was read or mutated.
