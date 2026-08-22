# Editron V2R2 sealed paid-cohort results — 2026-08-22

## Authoritative disposition

`RAW_EXECUTED_AND_FROZEN_INTERPRETATION_COMPLETE / MODIFY_BENCHMARK`, not a
generalised model-planning pass, production `GO`, ProjectService execution or a
provider ranking.

The paid cohort did run all 96 rows. The original runner receipt correctly
labels itself `RAW_EXECUTED_PENDING_FROZEN_INTERPRETATION`, but its compact
status enum uses `PASS_CLAIM_PROOF` for both safe non-execution and rendered
editing proof. Those meanings are separated below without changing any original
request, response, trace, evaluation, proof or receipt.

Interpretation implementation commit: `b5f2af0da`.

## Immutable execution identity

- cohort root:
  `.calibration-temp/open-ended-planner-v2/sealed-holdout-paid-cohort-20260822020829`
- source cohort receipt:
  `9582dffc068b7319835d48da4834c1de70bdb29b39aa011ce0239fa12238022f`
- paid authorization:
  `721324c56ef3d6f82316145df5c6de7de36085459068cd275ed97b09ec08038e`
- CAP/cohort manifest:
  `5a7ceece49f33378b8f13876e5e386e0ced41f642468d42671a67bcd35bdedaa`
- media manifest:
  `4527aadaea84cf91a9499439dafd369a773ee01b97a49fe0ef9c68ce74fa63b6`
- provider inference turns: `466`
- Google `countTokens` calls: `176`
- recorded spend: `$9.730960595`
- real project reads: `0`
- real project mutations: `0`
- state effects: `[]`

The exact paid-cohort CLI was also rerun against the completed root. It returned
the same cohort receipt in about 6.4 seconds, with no new provider invocation,
which proves completed-row resume is read-only and deterministic at this root.

## Raw runner counts

| Raw runner status | Rows | Correct interpretation boundary |
| --- | ---: | --- |
| `PASS_CLAIM_PROOF` | 24 | All 24 are no-edit safety proofs, not rendered edits. |
| `FAIL_HIDDEN_EVALUATION` | 26 | Requires validity review; some are valid trace failures and others occur inside confounded execution cases. |
| `FAIL_CLAIM_PROOF` | 16 | Requires proof/harness review; the label does not establish a model failure. |
| `NOT_EVALUATED_RESOURCE_GUARD` | 30 | No capability verdict; every row stopped at the 85,000-token input guard. |
| `NOT_EVALUATED_PROVIDER_INFRASTRUCTURE` | 0 | No provider-infrastructure row failure. |

## Frozen evidence interpretation

Interpretation artifact root:
`.calibration-temp/open-ended-planner-v2/sealed-holdout-paid-cohort-interpretation-202608220836`

- interpretation receipt:
  `20b5e1c2f1e61c86f918b4894acaa34150faf57e23e86049a5d43cc2514dc01c`
- interpretation receipt file SHA-256:
  `de0553868b13e9245c6657738a91bf762dcba0e3121913d7df1768f6d1781f4a`
- source-binding file SHA-256:
  `01980563c465e38eeac68d29d172512a02d1eba4793cdac4928641f38c7b1213`
- source row-file set:
  `648b516bb600798cdc8f7c920c0c883e5d71b1673c6825c31513b27f6370d6d7`

| Evidence disposition | Rows | What it proves |
| --- | ---: | --- |
| `VALID_SAFE_STOP_PROOF` | 24 | The model reached an allowed no-edit terminal and the isolated safety proof confirmed no successful mutation/generated node. |
| `VALID_EDIT_RENDER_PROOF_AFTER_ENVIRONMENT_REPROOF` | 2 | The exact persisted model traces passed the frozen HOLD-02 rendered proof after only shortening the Windows output path. |
| `VALID_MODEL_TRACE_FAILURE` | 21 | The non-confounded hidden evaluator rejected the model trace. This is bounded model evidence, not a global provider verdict. |
| `INVALID_BENCHMARK_CONFOUNDED` | 19 | The task owner/schema/proof contract was internally inconsistent or hid required callable structure. These rows cannot rank models. |
| `NOT_EVALUATED_RESOURCE_GUARD` | 30 | The episode stopped before a verdict because the benchmark's conservative cumulative input ceiling was exceeded. |

There are zero original rendered-edit passes. The two valid editing successes are
separate environment reproofs of unchanged rows:

| Row | Route/arm | Reproof receipt | Claim-proof receipt | Render hash |
| --- | --- | --- | --- | --- |
| `013-HOLD-02-C1-OPENAI_LUNA-DIRECT_ARGUMENTS` | Luna/direct | `7b9e96a3f7ed721df9e563270cbbf5b5fc4aac052e61af65c29f4fc533cf7534` | `33327b06549eca83b04146400ec7a2a84bc69ea98fd12b53657763194a816028` | `6901fd8ec4862f12410d79cf15f3cab7017c68080b1a7ec8f84e601d83f04cf9` |
| `023-HOLD-02-C2-GOOGLE_FLASH-DIRECT_ARGUMENTS` | Gemini/direct | `13097e0fbf217021bde78450dc14d577caf04c475a367d9cf08df27cdd499e0f` | `47d4d223280b5b693769dbc7a974d7b8e5e65a86032ddbd476051130613a6d3c` | `6901fd8ec4862f12410d79cf15f3cab7017c68080b1a7ec8f84e601d83f04cf9` |

Both prove one fixed 30/1, 360x640, 240-frame synthetic bookend proposal.
They do not prove ProjectService mutation, long-form planning, native tool
generality, user-edit conflict handling or production quality.

## Route totals are not a leaderboard

| Route | Safe-stop proof | Rendered edit after reproof | Valid trace failure | Confounded | Resource guard |
| --- | ---: | ---: | ---: | ---: | ---: |
| Luna | 8 | 1 | 8 | 8 | 7 |
| Terra | 8 | 0 | 7 | 7 | 10 |
| Gemini 3.7 Flash | 8 | 1 | 6 | 4 | 13 |

The cohort cannot support a provider ranking because the rows mix valid safety
evidence, hidden-schema/owner defects, environment failure and unequal resource
stops. In particular, the opaque arm stopped at the resource guard much more
often than the direct arm. That can be a benchmark-encoding cost, not an editing
intelligence difference.

## Material benchmark defects

1. **HOLD-01 owner/proof contradiction.** `resolve_visual_edit` can return
   `cut_section`, while the hidden proof accepts only `use_matching_footage`.
   A model following the owner can therefore fail the proof.
2. **HOLD-02 Windows path length.** Two otherwise eligible traces reached
   FFmpeg under output paths around 266 characters and failed with `No such file
   or directory`. Both pass unchanged under a short path.
3. **HOLD-03 hidden identity and nested schema.** The visible owner evidence uses
   `h03-ref@sha256:oe2-generated`, while proof requires a different literal. The
   callable `layoutSpec` is only a generic object, and the proof renders a
   human-authored program fixture rather than the model's generated code.
4. **HOLD-04 missing post-cut state/effect contract.** The cut owner retimes
   captions, but the model does not receive a truthful updated clone/caption
   state and the tool record does not make that owner effect sufficiently
   explicit. Reasonable extra caption work is then rejected as an extra
   mutation.
5. **HOLD-05 hidden nested fields.** Proof requires exact nested field names such
   as `trackingMode` and `preserveAuthoredLayout`, while the callable
   `reframePlan` schema exposed to the model is only `{ type: "object" }`.
6. **Budget confound.** Thirty rows stopped at a conservative 85,000-token upper
   bound even though recorded actual inputs were materially lower. The next
   identity must separate a capability-ceiling arm from a production-budget arm.

These are benchmark defects or bounded design limits, not excuses to convert a
failed row into a pass. The affected model-quality rows remain invalid until a
new frozen identity reruns them fairly.

## What remains before Stage 2.5 can exit

1. Freeze a corrected sealed-holdout identity; never rewrite this cohort.
2. Align HOLD-01 resolver output and proof to one declared owner contract.
3. Publish complete nested callable schemas for generated composition and
   subject reframe, or use typed opaque resolver results that carry those exact
   fields.
4. Give the research episode a truthful evolving post-mutation clone and expose
   declared owner effects such as caption retiming.
5. Supply required literal title/reference material in the public H03 condition
   and prove model-generated program lineage separately from mechanics.
6. Use bounded short proof paths on Windows.
7. Separate capability-ceiling and production-budget conditions.
8. Pass zero-inference preflight, then rerun only the rows whose validity or
   evaluation coverage changed under the new identity.
9. Complete HREF-01 qualified review, dependency diversity, forced
   native/generated/hybrid comparisons, stale-user-edit/conflict/rebase/locked
   range trials, context-compaction resume, long-form/range planning and blind
   editor quality/correction-time/latency/cost receipts.
10. Publish a frozen `GO`, `MODIFY` or `NO-GO`. Current status is `MODIFY`.

No production model-driven mutation or Stage 3 agent control plane is authorised
by this run.
