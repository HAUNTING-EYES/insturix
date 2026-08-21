# OE V3R Provider-Native Handoff/Order P2-P3 Results — 2026-08-21

## Status

`INVALIDATED_FOR_SEQUENTIAL_MUTATION_REVISION_HANDOFF`

This record preserves the paid P2/P3 observation without treating a faulty
research-clone revision contract as model evidence. It does not authorize
production project mutation.

## Issued artifacts

- Preflight root: `.calibration-temp/open-ended-planner-v2/provider-native-handoff-order-v3-preflight-20260821144732`
- Preflight manifest SHA-256: `b9a4284b1c609472e91ca08ab21710b42da5be1a2f231541cec35c8f0033fcb3`
- Preflight receipt SHA-256: `6050ef53edc3d33070af8b04978e3c5c922abc23ab6d513bec51ecc76d251814`
- Paid run root: `.calibration-temp/open-ended-planner-v2/provider-native-handoff-order-v3-run-20260821144755`
- Paid experiment receipt SHA-256: `46577191dd2c03d354975ce0fbe204e66099e59623466f49ffd0376aa95f8080`
- Selected repetitions: P2 and P3 only
- Rows: 12 (three routes x two handoff arms x two permutations)
- Real-project state effects: zero

## Raw result before reconciliation

- First relevant operation choice: 12/12 correct.
- Typed overlay/frame result handoff: 12/12.
- Raw product outcome: 11 PASS, 1 UNVERIFIABLE.
- Provider, render and harness infrastructure failures: zero.

These raw counts are retained as historical observations. They are not a valid
11/12 sequential-mutation score.

## Contract defect

`sync_cuts_to_beats` changed the isolated clone but its receipt did not expose a
writer-issued post-mutation project revision. `apply_camera_shake` requires an
`expectedProjectRevision`. The isolated session nevertheless kept accepting the
pre-sync revision `R11` after beat sync.

This contradicted both:

- the Stage-4 compiled graph, which binds the shake to
  `@compile-sync.receipt.revision`; and
- IF1's frozen distinction between before, after and conflict-current project
  revisions.

Eleven rows reused stale `R11` and were accepted by the defective clone. Terra
direct-arguments P2 instead finished `UNVERIFIABLE` with
`MUTATION_REVISION_NOT_EXPOSED_FOR_REQUIRED_FOLLOW_ON_CAS`. That was the safe
production response, not an editing-intelligence failure.

## What remains valid from this cohort

- All twelve rows selected `find_audio_moment` first without being shown the
  privately held measured beat values.
- The models understood that beat measurement precedes beat alignment.
- Eleven rows continued in the intended semantic order, while Terra identified
  the missing revision handoff.
- The prior overlay-ID and final-hit-frame opaque-reference mechanism worked as
  measured, but this cohort did not test an opaque writer-revision handoff.

No claim about safe sequential mutation, complete causal execution, or model
route ranking may be derived from the 11 raw PASS rows.

## Root-cause correction phase 1

The isolated DEV-03 writer now:

1. validates the caller's current revision before each mutation;
2. issues a deterministic opaque new revision after every isolated-clone write;
3. returns that revision in the mutation receipt;
4. records before/after revisions in the execution trace;
5. binds proof repair to the latest issued revision; and
6. rejects reuse of stale `R11` as `CONFLICT` without executing the shake or
   rendering proof.

The connected-episode contract was versioned from V2R_4 to V2R_5. Focused
verification passed 24 tests with one intentional real-render test skipped,
followed by repository type-check and quiet ESLint.

## Required fair rerun

Do not rerun the old issued manifest. First issue a new benchmark version that:

- declares `sync_cuts_to_beats.receipt.projectRevision` as an accepted origin
  for `apply_camera_shake.expectedProjectRevision`;
- issues and requires an opaque result reference for that revision in the opaque
  handoff arm;
- makes the evaluator independently reject stale, missing, copied or forged
  follow-on revisions; and
- versions the visibility policy, experiment identity and evaluator policy.

Because P1 used the same frozen-revision clone, the fair replacement cohort is
all 18 route/arm/permutation rows, not only the 12 P2/P3 rows. No further paid
calls are authorized by this record.
