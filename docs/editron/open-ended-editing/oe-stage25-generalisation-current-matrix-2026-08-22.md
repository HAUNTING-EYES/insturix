# Stage 2.5 generalisation current matrix — updated 2026-08-24

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
| Long-form Sequence/Range planning | Commit `7319da514` freezes one 4.5-hour bounded evidence directory and compiles a bounded proposal through existing PlanService. Commits `70da565b3`, `3ea22c861`, `0f7a566fb` and `b7e0fa26c` add durable opaque-result handoff, an exact paid gate, a no-repeat-on-unknown-dispatch runner and the reproducible operator. Successor manifest `a5f988b55c1e28cfed08cff9e64cd0406990b3d5fe97e75e46e5c712109d8b66` binds commit `b7e0fa26c`, ten source files, nine Luna/Terra/Gemini 3.7 rows, one attempt per row, zero automatic retries and zero project effects. Clean credential-split preflight receipt `ba2731bfee749300c49e3619f860f763c07768b2d3164bd32dee2b3e645aefb1` and capture set `8878d5666327bc50b39c6ddf2fb4e80e360ec71d42f1d69a55244ab4225bb3f0` use the recharged local OpenAI key and Vercel Production Gemini key, make three metadata GETs plus three Google `countTokens` calls, and make zero inference calls. The request-specific first-attempt upper bound is `$0.9190839`; the frozen hard ceiling is `$1.505126400`. The relevant 17 focused tests, repository typecheck and repository lint pass. | Exact paid confirmation remains required before the nine calls. The evaluator result remains structural only: no provider proposal, editorial-quality review, real-media range accuracy, context-limit curve, latency or actual-cost receipt exists. A same-worktree Vercel preflight is provenance diagnostics only because Vercel CLI 50.34.2 lets local/process variables override remote production values; only the clean credential-split receipt is dispatch evidence. |
| HREF-01 | Full source, one requested 180-frame dense motion window and WAV exist under pack `4431c08b...`. | Sole project-owner review receipt is missing; independent agreement remains `UNVERIFIABLE` without a real second reviewer. |
| Final quality/decision | Prior technical and user ordinal evidence remains useful but bounded. | Obtain hash-bound blind quality, correction-time, latency and cost receipts, then publish frozen `GO`, `MODIFY` or `NO-GO`. |

The old twelve P2/P3 rows are closed by V3R4's bounded 18/18 handoff/order
result, and `HOLD-01` through `HOLD-08` are not unseen work. The next executable
action is exact authorization of the nine source-bound long-form rows using all
four frozen values: manifest `a5f988b5...`, preflight `ba2731bf...`, capture set
`8878d566...`, ceiling `$1.505126400`, plus confirmation
`YES_I_CONFIRM_9_LONG_FORM_PLAN_ROWS`. This matrix update itself authorizes no
inference call.

After that cohort, Stage 2.5 still requires, in order:

1. compile and structurally evaluate every terminal proposal without treating
   structural validity as editorial quality;
2. complete the sole-owner HREF-01 review and its targeted dense motion/audio
   judgment; a second independent reviewer remains honestly unavailable;
3. test genuinely new dependency/invalidation shapes and broader forced native,
   generated and hybrid alternatives;
4. exercise stale user edits, overlap conflicts, safe rebase and locked ranges
   through the product authority rather than fixtures alone;
5. test paid episode compaction/resume without losing plan or opaque-result
   identity;
6. extend long-form trials beyond coarse 4.5-hour structure to realistic media,
   bounded evidence and context-limit behavior; and
7. obtain blind quality, correction-time, latency and cost receipts before the
   frozen `GO`, `MODIFY` or `NO-GO` decision.
