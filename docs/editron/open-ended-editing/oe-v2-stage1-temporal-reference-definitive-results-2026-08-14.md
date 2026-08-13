# Editron OE V2 Stage 1 temporal-reference results - 2026-08-14

Status: `DONE_WITH_CONCERNS`

This report records the paid Stage-1 reference-reconstruction smoke after the
DEV-02 answer leak was removed. It is evaluator evidence only. It does not
authorize project mutation, model promotion, routing, graph compilation, or a
production capability claim.

## Frozen execution identity

- Branch: `infrastructure-improvs-+Editron`
- Temporal evidence commit: `5a5dbf16c`
- Final measured-envelope commit: `50b0029df`
- Definitive plan hash:
  `86f5a93eaca5733e557f560ad8017d99f621d6869323a6bb0ee7e3c45cc363a0`
- Definitive receipt hash:
  `48b51e11c27f065a3c268781e36feae3386d075a46b59cf2c9627ee96a5b6007`
- Definitive provider cost: `$0.155576375`
- Total cost of the five temporal diagnostic/final runs: `$0.663409525`
- Receipt location, intentionally gitignored:
  `.calibration-temp/open-ended-planner-v2/provider-smoke/development-smoke-receipt-v2-temporal-contact-sheet-definitive.json`
- Receipt secret scan: no authorization header, provider key, data URL, or
  supplied Qwen credential was stored.

## What changed before this run

The provider-visible packet no longer contains the hidden DEV-02 answer. It
does not tell a model that the reference has five panels, black gutters, or
opposed column slides. The reference is a rights-owned deterministic image
containing six row-major sampled moments. All six sample tiles have distinct
hashes. The benchmark labels only their order as `ROW_MAJOR`.

The Stage-1 envelope was corrected from observed failures, not guessed:

- `25,000` cumulative input tokens, enough for a first response plus the one
  permitted schema repair;
- `10,000` visible output tokens;
- `3,000` reasoning tokens;
- `90` seconds;
- `$0.35` cumulative provider cost per row;
- `$2.10` absolute six-row plan ceiling.

All limits remain fail closed. No provider-specific exception exists.

## Transport and schema result

| Row | Result | Attempts |
| --- | --- | ---: |
| GPT-5.6 Luna, reference frames | accepted | 2 |
| GPT-5.6 Terra, reference frames | accepted | 1 |
| Gemini 3.5 Flash-Lite, reference frames | accepted | 1 |
| Gemini 3.5 Flash-Lite, full media | accepted | 1 |
| Gemini 3.6 Flash, reference frames | accepted | 1 |
| Gemini 3.6 Flash, full media | accepted | 1 |

Luna's first response used one invalid enum and its single repair produced a
valid artifact. Six accepted artifacts prove provider dispatch, media hashing,
token/cost telemetry, schema enforcement, repair, and receipt storage. They do
not prove correct reference understanding.

## Held-out editorial review

The fair comparison is only the four `REFERENCE_IMAGE_EVIDENCE` rows. The two
`MULTIMODAL` Gemini rows also received candidate source videos and remain
transport-plumbing observations, not comparable reference-understanding scores.

| Required observation | Luna | Terra | Flash-Lite | Flash |
| --- | --- | --- | --- | --- |
| Five panels in the settled reference state | contradicted: reported six | omitted | omitted | omitted |
| Black/dark gutters | detected | detected | omitted | omitted |
| Centered yellow readable title treatment | detected | detected | partial: centered title only | detected |
| Opposed panel motion across sampled moments | omitted | explicitly unresolved/ambiguous | omitted | omitted |
| Final center area expands/continues full-screen | detected | detected | omitted | detected |
| Missing timing/audio/type detail reported as uncertain | detected | detected | omitted | omitted |

No fair reference row reconstructed the complete target. There is therefore no
Stage-1 model winner and no model is promoted.

## Blocking root cause: the contact sheet is ambiguous

The contact-sheet representation itself failed as temporal evidence:

- Luna interpreted the six sampled moments as a literal two-column by
  three-row, six-panel layout.
- Terra treated the sheet as one simultaneous mosaic and correctly said exact
  temporal behaviour was unavailable.
- Flash-Lite remained materially under-specified.
- Flash recovered the final expansion but not panel count, gutters, or opposed
  motion.

The model was told row-major order, but the visual format still looked like a
collage. A benchmark cannot penalize a model for missing motion while presenting
motion as an ambiguous tiled still. The contact sheet is useful human review
evidence, but it is not a fair production proxy for reference-video perception.

The next Stage-1 condition must use:

1. six separately hash-bound ordered image attachments with explicit sample
   times for every image-capable model;
2. a separate provider-native reference-video arm for models/routes that truly
   accept video;
3. identical user request and non-reference evidence across comparison rows;
4. a held-out evaluator rubric unavailable to provider prompts;
5. evaluator dispositions `DETECTED`, `OMITTED`, `CONTRADICTED`,
   `UNSUPPORTED`, and `UNRESOLVED` for each target claim;
6. no scoring of easing, sub-frame timing, audio, or exact intermediate motion
   from sparse image samples.

Only after that correction can Stage 1 compare reference reconstruction. Stage
2 graph/routing testing remains blocked on an accepted Stage-1 blueprint.

## Full-media rows

The full-media Gemini rows did identify opposed motion, and Gemini Flash also
reported five panels and full-screen continuity. These results show that the
native video/image transport path can yield richer observations. They do not
establish a fair model ranking because those rows received different evidence
from Luna, Terra, and the reference-only Gemini rows.

## Qwen 3.8 Max diagnostic addendum

The operator explicitly authorised a bounded Qwen diagnostic using the supplied
Token Plan credential. The retired preview alias was not used. Both successful
calls requested `qwen3.8-max`; the direct provider response also returned
`qwen3.8-max` as its model identity.

The credential worked only with the Token Plan Team endpoint:
`https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`.
The earlier Coding Plan endpoint returned `401 invalid_api_key`; that was an
endpoint/plan mismatch, not a model result.

The Qwen condition used six separate `129x154` PNG attachments at `0`, `1.2`,
`2.4`, `3.6`, `4.8` and `6.0` seconds. The images were extracted from the same
rights-owned DEV-02 contact sheet and supplied in order with explicit times.
They were not re-tiled. The ordered image-hash-set identity was:
`0608721496bcb46e95eedf081b3ff09c7baaae6edeaf8d56b2c54baf7c712e99`.

Two completed calls provide a repeatability check:

| Route | Elapsed | Provider usage | Result |
| --- | ---: | --- | --- |
| OpenCode custom provider | about `154s` | `49,880` total reported tokens, including `29,696` cache-read and `6,155` reasoning tokens | completed |
| Direct OpenAI-compatible request | `165.19s` | `643` prompt, `9,031` completion (`7,360` reasoning + `1,671` text), `9,674` total | completed |

The Token Plan returned credit usage rather than an honest USD price, so these
calls are not added to the dollar total above. The much larger OpenCode context
also proves that a general coding-agent shell is not a fair cost proxy for a
production reference-observer call.

### Editorial review of the direct condition

| Required observation | Qwen 3.8 Max |
| --- | --- |
| Five settled panels | detected |
| Black gutters | detected |
| Fixed centered yellow two-line title | detected |
| Opposed motion | detected: center panels rise while side panels descend |
| Settled hold | detected between the `3.6s` and `4.8s` samples |
| Final center-green takeover/continuity | detected |
| Easing, audio and unsampled transition uncertainty | explicitly reported |

This is materially more complete than any of the four tiled-contact-sheet rows.
It is not yet a cross-model win because Qwen received a corrected six-image
representation while the other four fair rows received one ambiguous tiled
image. Every compared provider must receive the same corrected evidence before
ranking.

Qwen also over-interpreted some evidence. It emitted precise geometry and colour
estimates that exceed the safe precision of the small images, and both completed
calls treated a tiny moving white square as a creative progress indicator. That
square is evaluator instrumentation inserted by the synthetic fixture. It must
be removed from provider-visible pixels; sample identity belongs in attachment
hashes and timestamps, never in the creative image.

### Qwen disposition

- Reference reconstruction: promising specialist candidate.
- Interactive placement: not supported by this result; two runs took roughly
  `2.5-2.75` minutes.
- Production promotion: not authorised.
- Mandatory next comparison: remove the visible marker, send identical ordered
  images to every image-capable model, retain a separate native-video arm, and
  score the held-out claims without exposing the answer.

## Verification

- Focused temporal-reference suite: `34/34`
- Focused budget/transport/smoke suite: `40/40`
- `pnpm exec tsc --noEmit`: passed
- `pnpm exec eslint . --quiet`: passed
- Definitive provider rows: `6/6` schema accepted
- Editorial target reconstruction: incomplete; no promotion
- Qwen diagnostics: `2/2` completed, strong reconstruction, not a fair
  cross-provider comparison and not promoted
- Temporary Qwen credential/config: deleted; retained diagnostic secret scan:
  clean
