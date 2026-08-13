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

## Qwen 3.8 Max status

`qwen3.8-max-preview` is documented by Alibaba in the Token Plan harness, but
the supplied credential is a Token/Coding Plan credential. Alibaba's
published restrictions prohibit using that credential in automated scripts,
custom backends, or non-interactive batch evaluation. It was not sent, stored,
or committed.

Add Qwen 3.8 Max only when one of these exists:

- a normal pay-as-you-go application key and endpoint that accepts
  `qwen3.8-max-preview`; or
- an explicit provider route authorizing automated benchmark use.

Do not substitute Qwen 3.7 and label it Qwen 3.8.

## Verification

- Focused temporal-reference suite: `34/34`
- Focused budget/transport/smoke suite: `40/40`
- `pnpm exec tsc --noEmit`: passed
- `pnpm exec eslint . --quiet`: passed
- Definitive provider rows: `6/6` schema accepted
- Editorial target reconstruction: incomplete; no promotion
