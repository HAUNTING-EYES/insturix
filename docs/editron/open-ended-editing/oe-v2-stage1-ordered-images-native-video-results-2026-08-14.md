# Editron OE V2 Stage 1 ordered-images and native-video results - 2026-08-14

Status: `DONE_WITH_CONCERNS`

This report supersedes only the cross-model conclusion from the earlier
contact-sheet run. The earlier report remains the audit record for that
different input representation and for the Qwen 3.8 Max diagnostic. This run
does not authorize project mutation, graph planning, model promotion, routing,
or a production capability claim.

## Frozen run identity

- Branch: `infrastructure-improvs-+Editron`
- Explicit image-sequence arm commit:
  `ce377f81cfc10e6a64feb3b31212240251db9d90`
- Separate temporal smoke arms commit:
  `d43980a43f384f4495450f0e3f05e36915d7a6a3`
- Timestamp-to-image serialization commit:
  `ac9118b14b6ab0d31040801706f823f715a56ac6`
- Plan hash:
  `dd3255bea90beb719bd2c3c2dd5b60f28218fc6bea54f4c0bcfe0d7b36f3d18a`
- Receipt hash:
  `29dcb6fea55ec975de038bbae1d44c0fbd15ab5a2a6dbd6a7ce4f85a07ea50bb`
- Actual provider cost: `$0.147755775`
- Maximum authorized provider spend: `$2.10`
- Gitignored receipt:
  `.calibration-temp/open-ended-planner-v2/provider-smoke/stage1-temporal-reference-20260814-043819.json`

The receipt contains request/response hashes, provider identities, usage,
costs, diagnostics and parsed artifacts. It does not store credentials,
authorization headers, base64 media, raw media or raw provider responses.

## Fair input conditions

Four cross-model rows received the same six marker-free PNGs as separate,
ordered attachments at `0`, `1.2`, `2.4`, `3.6`, `4.8` and `6.0` seconds. Each
image was immediately preceded by its sample ID, sequence index, reference tick
and timestamp. The packet bound every sample to its artifact hash, one bundle
hash and the exact `30/1` reference timebase.

Gemini Flash-Lite and Gemini Flash also received the same reference as one
native `181`-frame `30/1` MP4. Those are within-model temporal-evidence
conditions. They are not extra cross-model parity rows because Luna and Terra
did not receive native video.

The visible white instrumentation marker from the older Qwen diagnostic is not
present. DeepSeek-V4-Flash-0731 remains excluded: the provider route cannot
honestly request that claimed snapshot. Qwen was not rerun because its Token
Plan credential was deliberately not persisted after the earlier diagnostic.

## Transport and cost result

All six artifacts were schema-accepted on the first attempt.

| Row | Input tokens | Visible output | Reasoning | Latency | Cost |
| --- | ---: | ---: | ---: | ---: | ---: |
| Luna, ordered images | 4,552 | 3,085 | 275 | 23.15 s | $0.02584925 |
| Terra, ordered images | 4,552 | 3,085 | 422 | 28.08 s | $0.066828125 |
| Flash-Lite, ordered images | 10,598 | 794 | 1,449 | 6.96 s | $0.0087869 |
| Flash-Lite, native video | 3,260 | 434 | 1,672 | 6.38 s | $0.006243 |
| Flash, ordered images | 10,598 | 778 | 2,446 | 20.74 s | $0.0200385 |
| Flash, native video | 3,260 | 1,715 | 2,969 | 43.82 s | $0.02001 |

This proves the corrected provider dispatch, ordered sample binding, native
video transport, exact Google token counting, OpenAI conservative preflight,
usage/cost capture, schema parsing and receipt persistence. It does not prove
correct reference reconstruction.

## Evaluator separation

The user request already tells the model to create a six-second stacked-panel
feeling, keep the title centered/readable, vary crops, and continue the last
center image into a following full-screen shot. Repeating those facts is not
evidence that a model understood the reference.

The held-out reference observations are:

1. exactly five settled panels;
2. black gutters separating them;
3. a yellow two-line title form, beyond the prompt's centered/readable fact;
4. opposed motion: center panels rise while side panels descend;
5. an established hold, proven by identical `3.6s` and `4.8s` image hashes;
6. the green center panel becoming the final full-frame image;
7. the broader sparse-build, dense-hold, release editorial progression;
8. honest uncertainty about audio, exact easing and unsampled timing.

The evaluator uses `DETECTED`, `PARTIAL`, `OMITTED`, `CONTRADICTED` and
`UNRESOLVED`. No evaluator answer was present in a provider packet.

## Ordered-image editorial result

| Held-out observation | Luna | Terra | Flash-Lite | Flash |
| --- | --- | --- | --- | --- |
| Exact five-panel count | omitted; weakened to at least three | omitted; said multi-panel | omitted | omitted |
| Black gutters | partial; black negative space, not panel separators | detected | omitted | omitted |
| Yellow two-line title form | detected, with honest wording uncertainty | detected | omitted | omitted |
| Opposed panel directions | unresolved | unresolved | omitted | omitted |
| Stable `3.6s`-`4.8s` hold | detected | detected | omitted | omitted |
| Green center takeover | omitted | omitted | omitted | omitted |
| Sparse-build / dense-hold / release | detected | detected | omitted | partial; build and release only |
| Missing audio/easing detail treated as uncertain | detected | detected | omitted | omitted |

No ordered-image model reconstructed the complete held-out target. Terra was
the strongest artifact in this run, followed by Luna, but neither passed Stage
1. Flash-Lite and Flash returned schema-valid but materially under-specified
reference blueprints.

Luna and Terra were appropriately cautious about deriving continuous motion
or easing from six sparse stills. That calibration is positive, but it does not
replace the missing opposed-direction observation that is visible across the
sampled states.

## Native-video editorial result

Flash-Lite's native-video artifact contained only a generic stacked-panel
layout and crop statement. Flash added centered-title and final-expansion
claims. Those facts substantially overlap the explicit user request. Neither
native-video artifact identified the exact panel count, black gutters, yellow
two-line form, opposed motion, stable hold or green takeover.

Native video therefore did not rescue target reconstruction for these two
Gemini routes. This is a model/prompt/result observation for this fixture, not
a claim that native video is generally inferior to ordered stills.

## Contract defect found by the run

`ReferenceBlueprintV2.targetClaims` is closed and structured, but the Stage-1
`temporalStructure` and `uncertainties` item contracts are currently only
`{ type: "object" }`. Consequently:

- Luna emitted structured tick phases;
- Terra emitted a different free-form scope/role shape;
- Gemini Flash native video emitted `temporalStructure: [{}]`;
- all three passed schema validation.

Schema acceptance is therefore too weak to mean a usable reference blueprint.
Stage 1 needs one closed temporal-phase schema and one closed uncertainty
schema before its artifacts can feed Stage 2 without normalization ambiguity.
The evaluator must still remain separate; tightening structure must not leak
the hidden visual answer.

## Disposition and next bounded work

- Provider/transport smoke: `PASS`.
- Schema conformance under the current contract: `6/6 PASS`.
- Reference reconstruction: `NO PASS`.
- Model promotion: none.
- Production mutation/routing authorization: none.

Next:

1. close the Stage-1 temporal and uncertainty schemas and reject empty objects;
2. freeze the held-out evaluator rubric as a separate non-provider artifact;
3. run Stage 2 routing/intent planning from an evaluator-approved canonical
   blueprint so routing can be tested independently of Stage-1 perception;
4. later run the complete Stage-1-to-Stage-2 chain as the end-to-end condition;
5. rerun Qwen 3.8 Max against this exact marker-free bundle only when its
   credential is provided through an approved environment variable.

## Verification

- Corrected live calls: `6/6` completed.
- Schema-valid artifacts: `6/6`, all first attempt.
- OE V2 focused suite: `59/59`.
- `pnpm exec tsc --noEmit`: passed.
- `pnpm exec eslint . --quiet`: passed.
- Reference reconstruction: incomplete; no promotion.
