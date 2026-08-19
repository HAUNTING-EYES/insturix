# Editron V2-1F/V2R connected model episode — current results

Date: 2026-08-19

Branch: `infrastructure-improvs-+Editron`

Status: **MODIFY. Research-only; zero project mutation; no model is approved for
production orchestration.**

This report supersedes its earlier same-day scorecard. The earlier text mixed
different experiment versions and mechanics renders and incorrectly described
Luna, Terra and Qwen as connected model passes. Historical artifacts remain
diagnostic evidence, not production ranking evidence.

## Authoritative clean cohort

- experiment: `EDITRON_OE_V2R_SELECTED_OPERATOR_EXPERIMENT_V19`
- manifest: `88fb74c4bc4d145ed2217c6c4b5a148d290dff8026d5785a2fe4e68b8680eb25`
- cohort: `v2r-v19-20260819162944`
- receipt: `.calibration-temp/open-ended-planner-v2/v2r-cohorts/v2r-v19-20260819162944/v2r-cohort-v2r-v19-20260819162944.json`
- receipt hash: `f271c9567242414c39a99e4618b34c018e9a89c1029f6854fc6bc7a80fd15b86`
- receipt validation: cohort and all 18 full-episode hashes recomputed `PASS`
- execution: `COMPLETE_WITH_FAILURES`
- Stage 7: `NOT_READY_NO_EXECUTED_PROXY`
- metered cost: `$0` because OpenAI returned HTTP 429 before billable usage;
  Qwen used an unpriced token-plan route

V19 introduced full-episode/cohort receipt V3. A terminal word alone no longer
earns credit: an expected evidence stop must carry `EVIDENCE_INSUFFICIENT` and
semantic `PASS`; an incomplete episode carrying
`CONNECTED_EPISODE_INCOMPLETE` is not an evidence-aware success.

## Results

| Route | DEV-01 baseline | DEV-01 withheld | DEV-02 | DEV-03 baseline | DEV-03 withheld | DEV-04 |
| --- | --- | --- | --- | --- | --- | --- |
| Luna | not evaluated: HTTP 429 | not evaluated: HTTP 429 | not evaluated: HTTP 429 | not evaluated: HTTP 429 | not evaluated: HTTP 429 | not evaluated: HTTP 429 |
| Terra | not evaluated: HTTP 429 | not evaluated: HTTP 429 | not evaluated: HTTP 429 | not evaluated: HTTP 429 | not evaluated: HTTP 429 | not evaluated: HTTP 429 |
| Qwen 3.8 Max | Stage 2 schema-invalid | semantic FAIL | Stage 1 schema-invalid | Stage 5 authorized; Stage 6 visual proof FAIL | semantic FAIL | **expected capability gap PASS** |

No V19 row executed a passing proxy. Therefore there is no V19 video eligible
for blind human review and no production model winner.

## What Qwen actually demonstrated

Qwen is not accurately summarized as “bad at editing.” In DEV-01 it produced a
strong Stage-1 reconstruction and a broadly sensible native operation chain,
but its two Stage-2 responses violated exact JSON fields. In DEV-03 baseline it
produced valid Stage 1–3 artifacts; semantic policy passed; generic lowering
authorized the exact native chain; and the isolated executor rendered video
and audio. Acceptance then correctly failed because the requested `0.15`
camera shake did not produce the required measurable active-frame difference.
DEV-04 correctly stopped at the preregistered missing moving-matte capability.

This separates four distinct questions:

1. can the provider be called;
2. can the model obey the artifact schema;
3. did it select a semantically correct edit plan;
4. did the real isolated owners render proof that passes.

V19 did not collapse these into one score.

## Prior V17 evidence

V17 contained a Qwen DEV-03 passing proxy, but V19 did not reproduce it. The
V17 artifact remains useful evidence that the path can execute under one model
plan; it is not robustness evidence and cannot justify promotion. Earlier
Luna/Terra/Qwen “PASS” tables are superseded.

## Concrete blockers before a fair verdict

1. Restore a rate-limit-capable OpenAI test lane and rerun Luna/Terra under an
   unchanged preregistered experiment.
2. Resolve the DEV-03 form/proof mismatch: an allowed low-intensity shake can
   be imperceptible in the 320×180 proxy. The form owner and proof policy must
   share a resolution-aware visibility contract; the evaluator must not clamp
   model output silently.
3. Improve Qwen schema transport/repair without providing task answers, then
   rerun the same semantic conditions.
4. Require repeated trials before any consistency or routing claim.
5. Run Stage 7 only for genuinely executed, proof-passing model descendants;
   the disclosed user is one reviewer, never two independent reviewers.

## Verdict

`MODIFY`: the connected, hash-bound, fail-closed research harness is materially
stronger and caught both transport and render failures. The tested models are
not yet proven reliable enough to operate Editron in production. No direct
ProjectService mutation is authorized.
