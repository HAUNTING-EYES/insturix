# V4R Stage 2.5 current-context generalisation results — 2026-08-22

## Frozen disposition

`MODIFY_AND_PROCEED_RESEARCH`

The corrected 45-row V4R cohort completed, but the evidence is not sufficient
for production model-driven mutation or a Stage 2.5 `GO`.

## Bound identity

| Item | Value |
| --- | --- |
| Current proof-eligibility fix | `ccbe5fc2d` |
| Cohort contract | `EDITRON_OE_SEALED_HOLDOUT_GENERALISATION_COHORT_V4R_1` |
| Manifest | `df6d9024fcbdf56f0ee171348806c936b8bc1b7da0f53d6b019f2e665c99c38d` |
| Contract source | `c71db9ffa787914ea5ba3d28e7a17941d2a7c9b3e11f8fa2a5d21c48a27968b5` |
| Implementation bindings | `5732ea77d311373e73f38bb3f21a5dd3e9f794e03e45125da45f34437bf03332` |
| Row set | `de6d5912bdaa70ddfe2ed1651ebada7fbfd6414bd2633de4f383c8ab373b148e` |
| Route set | `a9248c24b68842cbe1793a515c219597304fb5494b672fd6b6774e0f98d32072` |
| Preflight root | `.calibration-temp/v4r-pf-05` |
| Preflight receipt | `ba2174fda1c288c5269b57ff95581a0ccdd9550b86ea2920cd64ddd1b3f58f5e` |
| Request-capture set | `53554d64f336bd2ecea591460f19a222dfda335892fbcf025a6ad2240317c421` |
| Cohort root | `.calibration-temp/v4r-run-05` |
| Cohort receipt | `fe4a3420356675d040c62c4f77f6fa6e98321c99c29eb9e767736f248b186787` |

The zero-inference preflight made three metadata GETs, fifteen Google
`countTokens` POSTs and fifteen provider-context egress calls. It made zero
inference calls, persisted no secret, and read or mutated no project.

## Raw execution accounting

The cohort completed all 45 frozen rows. The receipt records:

- 157 provider turns;
- 15 Google `countTokens` calls;
- `$2.91745742` spend;
- zero project reads;
- zero project mutations;
- zero state effects;
- 13 `PASS_CLAIM_PROOF`;
- 15 `FAIL_HIDDEN_EVALUATION`;
- 2 `FAIL_CLAIM_PROOF`;
- 15 `NOT_EVALUATED_PROVIDER_INFRASTRUCTURE`;
- zero `NOT_EVALUATED_RESOURCE_GUARD`.

The completed root is resumable in the narrow artifact-reuse sense. A second
invocation returned the same cohort receipt in about five seconds and created
no duplicate row or attempt. This is not yet a mid-episode context-resume test.

## Provider/case matrix

| Case | Luna | Terra | Gemini 3.7 |
| --- | --- | --- | --- |
| H01:C1 | proof pass | proof pass | infrastructure non-evaluation |
| H01:C2 | hidden fail | proof pass | infrastructure non-evaluation |
| H02:C1 | hidden fail | claim-proof fail | infrastructure non-evaluation |
| H02:C2 | claim-proof fail | hidden fail | infrastructure non-evaluation |
| H03:C2 | hidden fail | hidden fail | infrastructure non-evaluation |
| H04:C1 | proof pass | hidden fail | infrastructure non-evaluation |
| H04:C2 | hidden fail | hidden fail | infrastructure non-evaluation |
| H05:C1 | proof pass | hidden fail | infrastructure non-evaluation |
| H05:C2 | hidden fail | hidden fail | infrastructure non-evaluation |
| H06:C1 | hidden fail | hidden fail | infrastructure non-evaluation |
| H06:C2 | proof pass | proof pass | infrastructure non-evaluation |
| H07:C1 | hidden fail | hidden fail | infrastructure non-evaluation |
| H07:C2 | proof pass | proof pass | infrastructure non-evaluation |
| H08:C1 | proof pass | proof pass | infrastructure non-evaluation |
| H08:C2 | proof pass | proof pass | infrastructure non-evaluation |

Luna totals 7 proof passes, 7 hidden failures and 1 claim-proof failure. Terra
totals 6 proof passes, 8 hidden failures and 1 claim-proof failure. Gemini's
fifteen calls returned HTTP 429 before usable output, so V4R establishes no
Gemini model result.

## What the two claim-proof failures mean

Both HOLD-02 traces carried an executable causal revision chain to the proof
boundary. Both then selected the wrong sequence for the frozen task:

- Terra C1 constructed target ranges `[0,75)`, `[75,645)`, `[645,720)`;
- Luna C2 recovered from earlier stale/malformed references but constructed
  `[0,75)`, `[75,285)`, `[285,360)`.

The bound proof requires a 240-frame door-open/process/door-close result at
target ranges `[0,75)`, `[75,165)`, `[165,240)`, with approved disjoint source
ranges. The decoder rejected the longer alternatives. These are genuine model
failures for the exact fixture—not path-length, compiler or evaluator failures.

## Invalid and historical artifacts

The prior complete `clean-03` cohort remains historical only. It was bound to
an older manifest and suffered the Windows proof-path and artificial 85k-token
guard issues already recorded in the evidence-debt register.

The partial `.calibration-temp/v4r-run-04` attempt is **invalid for scoring**.
It exposed that the current evaluator could return `READY_FOR_PROOF` for
H01:C2 after an unsupported `cut_section`, even though no current proof owner
could execute that case. Commit `ccbe5fc2d` fixed the current evaluator and
reissued all affected identity bindings before `run-05`. No `run-04` row is
counted above.

## Interpretation

The model-orchestration bet remains alive, but is not yet won. The run proves
that Luna and Terra can sometimes select exact operations, carry opaque or
direct writer-issued revisions, stop safely and pass real bounded proof. It
also shows frequent trace/policy failure and two visually decoded wrong edits.
One sample per case cannot establish reliability, and Gemini is unmeasured.

No model writes ProjectService in this cohort. The owner session is an isolated
research clone, and proof adapters are task-bounded. Therefore this report does
not certify native product execution, generated-composition insertion,
long-form operation, agency quality or Adobe-class coverage.

## Required next evidence

1. Forced native/generated/hybrid alternatives on held-out targets.
2. Additional dependency and invalidation graph shapes.
3. Stale, overlapping, safe-rebase and locked-range episodes.
4. Mid-episode context compaction and exact resume.
5. Long-form sequence/range planning under bounded evidence.
6. HREF-01 dense motion/audio plus the sole human review receipt.
7. Blind-editor quality, correction-time, latency and cost receipts.
8. A frozen `GO`, `MODIFY` or `NO-GO` decision.

