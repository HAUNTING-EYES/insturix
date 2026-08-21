# Editron V2R sealed-holdout media foundation — 2026-08-22

## Verdict

`HOLD-01` through `HOLD-08` now have deterministic, rights-bound synthetic
media suitable for a zero-inference benchmark preflight. This is
`INPUT_EVIDENCE_READY`, not provider execution, model success, rendered edit
quality or production certification.

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

## What remains before provider calls

1. Issue a new versioned holdout packet and cohort identity; do not modify the
   historical DEV staged-packet implementation or its frozen hashes.
2. Bind CAP-2A V3 as the exact research tool dossier and bind this holdout
   manifest as a separate input supplement. CAP-2A V3 does not automatically
   become a new current snapshot because new research fixture files exist.
3. Produce model-visible packets that exclude `evaluatorOnly`, predicates,
   allowed dispositions, expected answers and other hidden scoring material.
4. Freeze generic schema-driven lowering and evaluator policy before any paid
   inference. It may bind arguments and typed results but may not add or remove
   creative operations.
5. Run a zero-inference readiness check across all eight tasks and both
   conditions. Provider dispatch remains unauthorized until that receipt is
   valid and the operator explicitly confirms the issued cohort.

## Verification at issuance

- Holdout materializer: 4/4 tests passed.
- Combined development and holdout materializers: 11/11 tests passed.
- `npx tsc --noEmit`: passed.
- Focused ESLint: passed.

These checks establish reproducible benchmark inputs only. No provider saw a
sealed task, no model row ran, and no Editron project was read or mutated.
