# Editron OE V2 Stage-1 reference smoke results

Date: 2026-08-14  
Status: `DONE_WITH_CONCERNS`  
Authority: research evidence only; no ProjectService mutation, runtime registration,
capability certification, or product model selection.

## Outcome

The corrected Stage-1 provider smoke completed all six planned rows. Every row
returned a schema-valid `ReferenceBlueprintV2` on its first attempt.

That result proves the audited transport, provider-native schema path, token and
cost accounting, media hashing, timeout enforcement, immutable receipt and
secret-redaction path. It does **not** prove that all six outputs reconstructed
the reference correctly, and it does not test graph construction.

### Frozen run evidence

- plan hash:
  `fdd865d818cc027c12eb0896ea34339f0493aacd6a1d4a8d4ab9fb4456c8dd97`
- receipt hash:
  `200bf038183b86c986f003abee2d0b2d6fccb8c94853c035d2976c3c013476b5`
- actual provider cost: `$0.1177359`
- hard six-row authorization ceiling: `$1.50`
- receipt:
  `.calibration-temp/open-ended-planner-v2/provider-smoke/development-smoke-receipt-v2-budget-corrected.json`
- receipt is gitignored and contains no API key, authorization header, data URL,
  raw media, or raw provider response.

| Row | Native provider identity | Result | Attempts | Cost | Latency |
| --- | --- | --- | ---: | ---: | ---: |
| Luna, reference image | `gpt-5.6-luna` | accepted | 1 | $0.0172433 | 22.602s |
| Terra, reference image | `gpt-5.6-terra` | accepted | 1 | $0.05939825 | 34.933s |
| Gemini Flash-Lite, reference image | `gemini-3.5-flash-lite` | accepted | 1 | $0.0059877 | 6.427s |
| Gemini Flash-Lite, full media | `gemini-3.5-flash-lite` | accepted | 1 | $0.0058814 | 6.296s |
| Gemini Flash, reference image | `gemini-3.6-flash` | accepted | 1 | $0.0119805 | 14.559s |
| Gemini Flash, full media | `gemini-3.6-flash` | accepted | 1 | $0.01724475 | 21.545s |

## Why the first run rejected three rows

The first run used an undersized Stage-1 envelope:

- Luna completed in 23.677s but produced 2,132 visible tokens against a 1,200
  visible-token cap.
- Terra was aborted at the exact 30-second harness deadline.
- Gemini Flash used 1,871 reasoning tokens against a 1,800-token cap and hit
  the combined provider output limit.

Those were harness-limit failures, not editorial failures. Stage 1 now permits
3,500 visible tokens, 4,500 reasoning tokens, 90 seconds and $0.25 per row.
All token, time, cost, schema and one-repair limits remain fail closed.

The correction is committed in `47d8a4d11`; boundary-relative transport tests
are committed in `5143e5b2e`. Forty focused tests, TypeScript and repository
ESLint passed before the corrected paid run.

## DEV-02 answer-leak closure

The old `EV-DEV02-R1` evidence value explicitly stated five panels, centered
title, black gutters and opposed column slides. The provider-visible
reference-image packet now replaces that value with only a hash-bound
`REFERENCE_MEDIA_BINDING { observationRequired: true }`. It does not attach the
two source videos in the reference-only comparison arm.

The user request still says “energetic stacked-panel feeling”, centered readable
title, varied crops and final-centre continuity. Those are legitimate user
requirements, not hidden evaluator answers. The image itself visibly contains
five coloured panels, black gutters and two centered yellow title bands.

The leak fix and regression test are committed in `bf85bc32b`.

## Artifact quality audit

The static-reference comparison rows are the fair editorial comparison. The two
Gemini full-media rows exist only to verify native media transport and must not be
pooled with the reference-image rows.

| Model | Five-panel count | Gutters | Center title treatment | Exit continuity | Motion honesty | Uncertainty honesty | Stage-1 reading |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Luna | omitted exact count | observed | observed/request-bound | captured | correctly said a still cannot establish exact motion | explicit title, motion and audio uncertainty | detailed but incomplete |
| Terra | exact five | observed | observed/request-bound with measured geometry | captured | correctly said a still cannot establish animation | explicit timing, typography, adaptation, audio and continuity uncertainty | strongest still-image reconstruction |
| Flash-Lite | omitted | not explicit | captured | omitted | made no unsupported temporal claim | none | under-specified |
| Flash | omitted | observed as black borders | captured | captured | made no unsupported temporal claim | none | useful but incomplete |

The full-media Gemini rows both claimed opposed column motion. The supplied
reference is a single PNG, and the extra videos are candidate source clips, not
an animated reference. Therefore those temporal claims are unsupported. They are
not counted as successful reference-motion reconstruction.

No model winner is selected from this smoke. Terra produced the most complete
still-image blueprint; Luna was strongest at identifying missing evidence;
Gemini was faster and cheaper but materially more compressed. Those observations
must survive more tasks and rendered/editor evaluation before they affect routing.

## Benchmark defect and required correction

DEV-02 currently cannot test the central question “can a model reconstruct a
moving reference?” because its reference asset is a 360x640 still PNG. A still
can support layout, colour, gutters, relative geometry and title-band claims. It
cannot support entrance timing, opposed sliding motion, easing, motion phase or
the continuity of a moving panel into live full-screen footage.

Before Stage 2 is treated as a model benchmark, create a rights-owned six-second
animated reference fixture with:

1. exact rational reference timebase and frame count;
2. a separately hash-bound moving reference video;
3. separately hash-bound candidate source clips;
4. evaluator-only frame/range truth for panel geometry, title safe area, opposed
   motion, crops and exit continuity;
5. no provider-visible prose containing those evaluator answers;
6. the same reference bytes for every model capable of the arm;
7. an explicit `NOT_APPLICABLE` result for models that cannot receive the arm;
8. an offline scorer that distinguishes detected, omitted, contradicted,
   unsupported and explicitly unresolved claims.

The scorer must not require a temporal fact from a still-only arm. Conversely,
claiming temporal reference evidence that was not supplied is a hallucination,
not bonus credit.

## Qwen 3.8 Max status

Alibaba currently documents the identifier `qwen3.8-max-preview` for Token Plan
Harness use. The supplied credential begins with `sk-sp-`, identifying it as a
Token/Coding Plan credential. Alibaba's official terms prohibit using that key
in automated scripts, custom application backends and non-interactive batch
calls. It was therefore not put into this runner or persisted anywhere.

Official sources:

- <https://www.alibabacloud.com/help/en/model-studio/token-plan-harness-tool>
- <https://www.alibabacloud.com/help/en/model-studio/coding-plan>
- <https://www.alibabacloud.com/help/en/model-studio/more-tools>

The Qwen comparison remains required. It can run when either:

- Alibaba exposes `qwen3.8-max-preview` through a permitted pay-as-you-go Model
  Studio route and a standard `sk-...` application key is provided; or
- Alibaba supplies another written automation-authorized route for that model.

Do not silently substitute `qwen3.7-plus` or another Qwen model and label it
“Qwen 3.8 Max”. Qwen 3.7 Plus is a valid separately named multimodal candidate,
not the requested identity.

## Data required for production-quality editing research

Learned observations alone are insufficient. A production evidence set needs
paired editorial and technical truth:

- raw camera/audio/image assets and immutable source identity;
- brief, script, brand rules, references and rights/consent;
- source selections, timelines, operation graphs and change history;
- transcripts, music structure, dialogue, onsets and mix stems;
- shot scale, camera motion, focus, exposure, continuity, screen direction and
  eye trace;
- object identity, pose, depth, occlusion, masks, tracks and crop room;
- rational timebase, PTS/timecode, colour/log/HDR and delivery metadata;
- rendered alternatives, editor/client preference, corrections and approvals;
- final masters plus visual, audible and delivery proof.

Adobe Stock is licensed asset inventory, not paired raw-to-approved-edit ground
truth. Its licences also restrict redistribution of stand-alone files and impose
content-specific conditions. Adobe Research's EditVerse reports a 232K-sample
research pipeline, but that publication is not an offered Adobe production-edit
dataset for Editron to ingest.

Sources:

- <https://stock.adobe.com/api/license-terms>
- <https://research.adobe.com/publication/editverse-unifying-image-and-video-editing-and-generation-with-in-context-learning/>

The production corpus must therefore be built from commissioned rights-cleared
projects, separately consented client projects, licensed assets used within their
terms, procedural golden fixtures and correctly licensed public research sets.
Every record requires a provenance and permitted-use ledger. Finished videos
without their raw media, timeline decisions and approvals are reference examples,
not edit-decision ground truth.

## Exact programme status

| Stage | Status after this run |
| --- | --- |
| 1. Target reconstruction | transport/schema smoke passed; editorial benchmark incomplete until moving-reference fixture and scorer exist |
| 2. Editorial operation selection and native/generated/hybrid routing | not run |
| 3. Evidence, rights, safety and revision binding | not run |
| 4. Exact typed compilation | not run |
| 5. Safe stop disposition | not run |
| 6. Isolated proxy execution, render proof and bounded repair | not run |
| 7. Blind editor review | not run |

Next implementation slice: freeze the animated DEV-02 reference and evaluator-only
Stage-1 truth, add the offline claim scorer, then rerun Stage 1 across the same
models. Stage 2 begins only after that result is reviewed.
