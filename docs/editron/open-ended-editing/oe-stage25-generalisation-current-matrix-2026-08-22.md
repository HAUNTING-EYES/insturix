# Stage 2.5 generalisation current matrix — 2026-08-22

## Authoritative resume point

The phrase **“seven unseen holdouts” is stale**. `HOLD-01` through `HOLD-08`
all participated in the immutable 96-row V2R cohort. The current-context V4R
qualification cohort has now also executed. This file is the short resume
authority; the detailed interpretation is in
`oe-v4r-stage25-generalisation-results-2026-08-22.md`.

The executed current-context identity is
`EDITRON_OE_SEALED_HOLDOUT_GENERALISATION_COHORT_V4R_1`:

- base V3R2 manifest: `a468c2f4...`;
- historical CAP-2A V6 manifest used by V4R: `2549623e...`;
- current CAP-2A V7 manifest: `939ec670...` at `3703c0815`;
- historical interpretation receipt: `20b5e1c2...` (96 rows);
- H03-C1 V3R4 receipt: `47a57bf2...` (18 separate rows);
- proof-eligibility fix: commit `ccbe5fc2d`;
- V4R manifest:
  `df6d9024fcbdf56f0ee171348806c936b8bc1b7da0f53d6b019f2e665c99c38d`;
- contract-source hash:
  `c71db9ffa787914ea5ba3d28e7a17941d2a7c9b3e11f8fa2a5d21c48a27968b5`;
- implementation-binding hash:
  `5732ea77d311373e73f38bb3f21a5dd3e9f794e03e45125da45f34437bf03332`;
- row set:
  `de6d5912bdaa70ddfe2ed1651ebada7fbfd6414bd2633de4f383c8ab373b148e`;
- zero-inference preflight receipt:
  `ba2174fda1c288c5269b57ff95581a0ccdd9550b86ea2920cd64ddd1b3f58f5e`;
- cohort receipt:
  `fe4a3420356675d040c62c4f77f6fa6e98321c99c29eb9e767736f248b186787`;
- authority: research only, no real-project reads, writes or state effects.

## Code-grounded evidence classification

| Task | Historical 12-row truth | Current disposition |
| --- | --- | --- |
| HOLD-01 | 5 confounded, 7 resource-guard non-evaluations | Corrected-owner requalification |
| HOLD-02 | 2 rendered reproofs, 1 valid trace failure, 9 resource guards | Current-context rendered requalification |
| HOLD-03 | 5 confounded, 2 valid trace failures, 1 valid safe stop, 4 resource guards | C1 covered separately by V3R4; C2 safety replication |
| HOLD-04 | 4 confounded, 8 resource guards | Corrected-owner requalification |
| HOLD-05 | 5 confounded, 4 valid trace failures, 1 safe stop, 2 resource guards | Corrected-owner requalification |
| HOLD-06 | 6 valid trace failures, 6 valid safe stops | Current-context safety replication, not first execution |
| HOLD-07 | 6 valid trace failures, 6 valid safe stops | Current-context safety replication, not first execution |
| HOLD-08 | 2 valid trace failures, 10 valid safe stops | Current-context safety replication, not first execution |

## Current-context execution result

All 45 frozen rows reached a terminal result with no harness crash:

| Result | Rows | Meaning |
| --- | ---: | --- |
| `PASS_CLAIM_PROOF` | 13 | Hidden evaluation and case-appropriate proof passed. |
| `FAIL_HIDDEN_EVALUATION` | 15 | The trace failed frozen hidden policy before proof. |
| `FAIL_CLAIM_PROOF` | 2 | The trace was eligible, but decoded proof rejected the selected sequence. |
| `NOT_EVALUATED_PROVIDER_INFRASTRUCTURE` | 15 | Gemini 3.7 returned HTTP 429 before usable output. |
| `NOT_EVALUATED_RESOURCE_GUARD` | 0 | No row stopped at the current resource guard. |

The receipt records 157 provider turns, 15 Google `countTokens` calls,
`$2.91745742` spend, zero project reads, zero project mutations and no state
effects. Reopening the completed root returned the same receipt without a new
row or attempt, which is bounded artifact-reuse/resume evidence.

Provider totals are descriptive, not a leaderboard:

- Luna: 7 proof passes, 7 hidden failures and 1 claim-proof failure;
- Terra: 6 proof passes, 8 hidden failures and 1 claim-proof failure;
- Gemini 3.7: 15 provider-infrastructure non-evaluations and no model verdict.

This design answers current-context qualification efficiently. One repetition
per provider/case is **not** a reliability estimate and cannot support a model
leaderboard. Luna and Terra also received different balanced handoff/order
assignments.

## Evaluator correction

The first partial run exposed a real defect: “some visual retrieval + some
native mutation” could become `READY_FOR_PROOF` where no proof owner supported
that case. On `HOLD-01:C2` this admitted a destructive `cut_section` after
noisy evidence. Commit `ccbe5fc2d` binds the current evaluator and dispatcher
to one proof-owner allowlist, rejects H01 range deletion and requires successful
`use_matching_footage` for H01:C1. Historical evaluators remain unchanged.
Partial `.calibration-temp/v4r-run-04` artifacts are defect evidence only.

## Current disposition and remaining gates

Stage 2.5 remains `MODIFY_AND_PROCEED_RESEARCH`. The current run supports
continuing the orchestration bet; it does not show reliable unattended editing,
authorise production mutation or establish a provider rank.

| Gate | Verified current truth | What still blocks closure |
| --- | --- | --- |
| Forced route alternatives | DEV-02 has one real native alternative and one real generated-island/native-continuation hybrid at the same decoded scope. | No broader held-out set, full-route generated comparison, correction-time receipt or editor-quality conclusion. |
| Dependency/invalidation diversity | Deterministic scheduler tests cover tracking fork/join, hazards, writer revision origins, stability and stale proof. V3R3 adds one provider six-operation fork/join chain. | Models have not been tested on another genuinely new dependency shape. |
| User edits and locks | Commit `fd2eabcdb` passes nine deterministic stale/disjoint/transformed/conflict/lock/evidence cases. | Active ProjectService receipts do not emit those regions/transforms/locks; no provider episode or canonical apply/reload used them. |
| Compaction/resume | Provider-loop, opaque-result, fresh-owner, separate-process and durable lifecycle recovery evidence exists, including exact captured-response replay. | No newly paid resumed inference and no canonical ProjectService apply/reload. |
| Long-form Sequence/Range planning | Commit `7319da514` freezes one 4.5-hour bounded evidence directory, proposal contract and deterministic compiler into existing PlanService; 9/9 adversarial tests pass with zero inference/effects. | No model proposal, editorial-quality review, real-media range accuracy, context-limit curve, latency or cost receipt. |
| HREF-01 | Full source, one requested 180-frame dense motion window and WAV exist under pack `4431c08b...`. | Sole project-owner review receipt is missing; independent agreement remains `UNVERIFIABLE` without a real second reviewer. |
| Final quality/decision | Prior technical and user ordinal evidence remains useful but bounded. | Obtain hash-bound blind quality, correction-time, latency and cost receipts, then publish frozen `GO`, `MODIFY` or `NO-GO`. |

The next executable slice is the immutable provider identity and **zero-
inference** request/token/spend preflight for the long-form proposal holdout.
No provider call is authorised by this matrix update.
