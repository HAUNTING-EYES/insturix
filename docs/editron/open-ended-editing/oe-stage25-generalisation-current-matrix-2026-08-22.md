# Stage 2.5 generalisation current matrix — updated 2026-08-26

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
| User edits and locks | Commit `0956d6ee7` exercises the real `ProjectService` cut owner through stateful in-process persistence: a disjoint stale cut safely rebases across a writer-issued overlay receipt and survives reload, while overlap, invalid locks and final CAS loss leave state unchanged. | This covers one cut-specific owner in test persistence. Live Atlas, hosted multi-user editing, generic range effects/locks/rebase and remaining writers are not proved. |
| Compaction/resume | Provider-loop, opaque-result, fresh-owner, separate-process and durable lifecycle recovery evidence exists, including exact captured-response replay. Commit `a1a09d481` adds the source-bound no-retry operator; execution `stage25-resume-zero-spend-a1a09d481-v1` passes its exact 36/36 cohort under receipt `38a05470...`, with provider credentials scrubbed and zero dispatch/project mutation. | The receipt authorizes only a separately approved paid-resume trial. Paid resumed inference, live Atlas/QStash recovery, authenticated hosted ingress, canonical ProjectService apply/reload and audiovisual acceptance remain open. |
| Long-form Sequence/Range planning | Commit `7319da514` freezes one 4.5-hour bounded evidence directory and compiles a bounded proposal through existing PlanService. Commits `70da565b3`, `3ea22c861`, `0f7a566fb` and `b7e0fa26c` add durable opaque-result handoff, an exact paid gate, a no-repeat-on-unknown-dispatch runner and the reproducible operator. Fresh manifest `975010c997d5755efb9333241f89a4a6a5cc50e928f8d2ac6c623a724f09b357` binds commit `5a38d08318aae445395c66cb432a94835f6db198`, ten source files and nine Luna/Terra/Gemini 3.7 rows. Clean credential-split preflight receipt `f6ed13a529529433f481e39e1d4187ecb45d336dcf3103ee0c62fbc81a53d3ee` and capture set `8878d5666327bc50b39c6ddf2fb4e80e360ec71d42f1d69a55244ab4225bb3f0` bind the local OpenAI credential and Vercel Production `GOOGLE_GENERATIVE_AI_API_KEY`. Paid authorization `86a548c1535e4735f0e59c41b66f93b6ab86972b6ed6a541d7fb0dc21893d783` and receipt `ad64ab8d261dc90ca39d5a94679de036f4067b967eedc595d73e1c3fa1b342c3` record nine unique dispatches and terminal rows, one observed HTTP 200 response per row, zero retries/unknown dispatches/provider-infrastructure failures, zero project effects and `$0.341221800` receipt-accounted spend under the `$1.505126400` ceiling. Structural result: Terra P1/P3 and all Gemini Flash rows are `PASS_STRUCTURAL_ONLY`; Luna P1/P2 and Terra P2 fail `STAGE25_LONG_FORM_PLAN_RANGE_SCOPE_UNBOUND`; Luna P3 fails `STAGE25_LONG_FORM_PLAN_FALSE_READY_WITH_UNRESOLVED_EVIDENCE`. Five current focused suites pass 26/26 with repository typecheck and lint. | This is structural planning evidence only: every product outcome is `NOT_EVALUATED_ADAPTER_ONLY`, and editorial taste, range-semantic accuracy and rendered audiovisual quality remain unverified. The durable receipt emits no latency/elapsed-time field, and runtime-accounted spend is not a provider-billing invoice. Do not repeat this cohort. The next row closes only local synthetic actual-container/window mechanics; real semantic retrieval, live storage/index consumption and rendered editorial quality remain open before `GO`/`MODIFY`/`NO-GO`. |
| Long-form media/evidence mechanics | Commits `36787a55a`, `66daa05cf`, `575e75a46` and `a9c93a084` add the local actual-container trial. Accepted execution `stage25-long-form-real-media-a9c93a084-v1` and receipt `59d943354a3a286b986b5b3df2d8cb2de2bb4038d0611b52681e511a34e03336` bind a nominal 4.5-hour H.264/AAC source, 485,515/485,515 verified frames in ten existing-owner PTS batches, three distinct exact 60-frame audiovisual windows, full-context `PASS` and constrained-context `UNVERIFIABLE`. Provider/network/project-mutation counts are zero. | This proves local synthetic container, presentation-time index, exact-window extraction and honest context omission only. Real creative/client media, semantic retrieval quality, live Mongo/R2/Qdrant, discontinuities/epochs, mixed-rate ProjectService consumption and production playback/render/delivery remain open. |
| HREF-01 | Full source, one requested 180-frame dense motion window and WAV exist under pack `4431c08b...`; receipt `f6993480...` binds the sole project-owner all-nine-requirement `PASS`, no observed hard failure and a zero-minute correction estimate. | Independent agreement remains `UNVERIFIABLE_SINGLE_REVIEWER`; the receipt is research evidence only and does not authorize product execution. |
| Final quality/decision | Prior technical and user ordinal evidence remains useful but bounded. | Obtain hash-bound blind quality, correction-time, latency and cost receipts, then publish frozen `GO`, `MODIFY` or `NO-GO`. |

The old twelve P2/P3 rows are closed by V3R4's bounded 18/18 handoff/order
result, and `HOLD-01` through `HOLD-08` are not unseen work. The nine
source-bound long-form rows have completed under receipt `ad64ab8d...`; they
must not be replayed. Their structural evaluation is complete, but must not be
mistaken for editorial-quality validation.

After that completed cohort, Stage 2.5 still requires, in order:

1. test genuinely new dependency/invalidation shapes and broader forced native,
   generated and hybrid alternatives;
2. broaden the now-stateful cut-specific conflict/rebase/lock proof to other
   product writers and live-store/multi-user conditions;
3. if separately authorized, test paid episode compaction/resume without
   losing plan, opaque-result, revision or cumulative-budget identity; the
   zero-spend executable-owner gate is complete;
4. extend the accepted local synthetic container/window result to real creative
   media, semantic retrieval, live storage/index owners, mixed-rate product
   consumers and production playback/render; and
5. obtain blind quality, correction-time, latency and cost receipts before the
   frozen `GO`, `MODIFY` or `NO-GO` decision.
