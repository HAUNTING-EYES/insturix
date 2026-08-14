# Editron OE V2 Stage-2 routing — definitive results

Date: 2026-08-14
Branch: `infrastructure-improvs-+Editron`
Authority: research only; no media execution and no project mutation

## Outcome

The isolated Stage-2 test now provides positive, repeatable evidence for the
central planning premise on one bounded held-out case:

- GPT-5.6 Luna constructed the correct full-request `HYBRID` architecture twice.
- GPT-5.6 Terra constructed the correct full-request `HYBRID` architecture twice.
- Both models covered every hard user claim in their selected candidate and
  graph, identified the generated island separately from the native continuity
  handoff, and truthfully reported that the selected generated owner is not
  implemented.
- Their terminal result is therefore `CAPABILITY_BLOCKED`, not `PASS` and not
  `FAIL`. This is the strongest honest result possible while
  `generated_composition_program` remains `RESEARCH_ONLY_NOT_IMPLEMENTED`.
- Gemini 3.5 Flash-Lite produced schema-valid artifacts twice but did not
  preserve capability truth. It called the unimplemented generated owner
  `ELIGIBLE`; the retry also assigned one required generated-island claim to the
  native surround. Its result is `FAIL`.
- Gemini 3.6 Flash returned HTTP 429 in both definitive attempts. Its result is
  `UNVERIFIABLE`, not a model failure.

This does **not** prove production editing. It proves that two tested models can
select and structure the correct high-level operation graph for this one case
when given an evaluator-approved target blueprint and a truthful capability
catalog.

## The tested case

The user asks Editron to build a six-second vertical section from two supplied
clips with:

1. a stacked multi-panel construction;
2. a centered readable title;
3. at least two distinct crop forms; and
4. the final center image/crop continuing into the following full-screen shot.

The expected architecture is:

- generated island: relational multi-panel layout, title, internal crop forms,
  and coordinated motion;
- native surround: source/timeline resolution and the full-screen continuity
  handoff;
- full request: `HYBRID`.

The test starts from the separately frozen canonical `ReferenceBlueprintV2`.
It therefore isolates Stage 2 (routing and editorial operation selection) from
Stage 1 (reference perception). It does not provide hidden evaluator predicates
to the model.

## Why earlier Stage-2 rows are diagnostic, not definitive

The benchmark was corrected only when a concrete defect was demonstrated:

1. The first scorer expected `GENERATED_COMPOSITION` for the full request. That
   was wrong: the bounded filmstrip is generated, while the requested section
   containing native source selection and continuity is hybrid.
2. A binary score conflated route classification, hard-claim coverage, graph
   coverage, current capability readiness, and capability honesty. These are
   now independent dimensions.
3. The provider-visible contract did not define whether `COVERED` meant
   structural operation coverage or concrete project/evidence binding. It now
   states that Stage 2 proves structural coverage, while Stage 3 binds project
   revision, asset identity, ranges, rights, privacy, and proof.
4. The original visible/reasoning limits rejected observed complete artifacts.
   Stage 2 now permits 4,000 visible and 5,000 reasoning tokens, with a strict
   `$0.30` per-route and `$1.20` four-route ceiling.
5. Google may omit `thoughtsTokenCount` when its independently reported total
   exactly equals prompt plus candidate tokens. The codec now derives zero only
   under that exact equality; unexplained totals remain unverifiable. This
   follows Google's documented usage identity that total tokens include prompt,
   response-candidate, and thought tokens:
   <https://ai.google.dev/gemini-api/docs/generate-content/tokens>.

No model is credited or penalized from a known-invalid scorer condition.

## Frozen definitive identities

- Canonical blueprint hash:
  `3a3f6c84164ef78fad89e67d443e7bcef728d1da4963ef3b6d3f57dc54d01c6f`
- Final plan hash:
  `eb0cc0b3fd40b3c458c0807eab9cbfd958267240af98cde209b6cb7b9cf3f36d`
- Definitive receipt hash:
  `c61260005b0bdb6833e856d47ea514ac81eaecde5b772b4095fb93c78a54a160`
- Repeatability/retry receipt hash:
  `13001d32e83d9f4c48f3c15d9af143d29c61a3a516f7857be4694b930e8bf050`

Receipts:

- `.calibration-temp/open-ended-planner-v2/provider-smoke/stage2-routing-definitive-20260814.json`
- `.calibration-temp/open-ended-planner-v2/provider-smoke/stage2-routing-definitive-retry-20260814.json`

## Definitive row results

| Route | Native model identity | Transport | Route | Candidate coverage | Graph coverage | Readiness | Honesty | Final |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Luna | `gpt-5.6-luna` | accepted | PASS | PASS | PASS | BLOCKED | PASS | `CAPABILITY_BLOCKED` |
| Terra | `gpt-5.6-terra` | accepted | PASS | PASS | PASS | BLOCKED | PASS | `CAPABILITY_BLOCKED` |
| Flash-Lite | `gemini-3.5-flash-lite` | accepted | PASS | PASS | PASS | BLOCKED | FAIL | `FAIL` |
| Flash | unavailable (HTTP 429) | rate limit | UNVERIFIABLE | UNVERIFIABLE | UNVERIFIABLE | UNVERIFIABLE | UNVERIFIABLE | `UNVERIFIABLE` |

Definitive usage:

| Route | Input | Visible | Reasoning | Total | Cost (USD) | Latency |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Luna | 9,853 | 3,693 | 614 | 14,160 | 0.0381575 | 23.648 s |
| Terra | 9,853 | 3,212 | 516 | 13,581 | 0.08670875 | 27.893 s |
| Flash-Lite | 9,056 | 1,174 | 832 | 11,062 | 0.0077318 | 6.768 s |
| Flash | — | — | — | — | 0 | 0.775 s to 429 |

## Repeatability result

The retry used the same final plan hash:

| Route | Result | Key repeatability observation |
| --- | --- | --- |
| Luna | `CAPABILITY_BLOCKED` | Route, both coverage dimensions, and honesty passed again. |
| Terra | `CAPABILITY_BLOCKED` | Route, both coverage dimensions, and honesty passed again. |
| Flash-Lite | `FAIL` | Capability honesty failed again; route classification also failed on this run. |
| Flash | `UNVERIFIABLE` | HTTP 429 again; no artifact was scored. |

Retry usage was:

- Luna: 9,853 input, 3,387 visible, 1,146 reasoning, 14,386 total,
  `$0.028186`, 29.356 s.
- Terra: 9,853 input, 2,996 visible, 935 reasoning, 13,784 total,
  `$0.061435`, 31.518 s.
- Flash-Lite: 9,056 input, 660 visible, 1,598 reasoning, 11,314 total,
  `$0.0083618`, 7.316 s.
- Flash: HTTP 429 after 0.722 s; no billable accepted artifact recorded.

The two definitive receipts cost `$0.23058085` combined. All Stage-2
diagnostic, correction, definitive, and retry receipts created during this
sequence cost `$0.82444765` combined.

## Qwen 3.8 Max status

Qwen passed the **earlier diagnostic Stage-1 reference-content rubric**:

- two completed calls requested and returned native identity `qwen3.8-max`;
- it detected the five panels, black gutters, centered yellow title, opposed
  motion, settled hold, and center takeover;
- it explicitly reported uncertainty for easing, audio, and unsampled timing.

That remains a real diagnostic pass. It is **not** a fair current Stage-1
cross-model promotion and is **not** a Stage-2 routing pass. That older condition
used a different six-image bundle containing visible evaluator instrumentation.
The final marker-free Stage-2 harness also has no environment-backed Qwen codec
route. The honest status is:

`QWEN DIAGNOSTIC PASS — FAIR CROSS-MODEL AND STAGE-2 PROMOTION UNVERIFIED`.

## What Luna and Terra actually proved

Both models independently produced a graph with:

1. source/project or asset-resolution work;
2. a bounded `generated_composition_program` node for the relational panel
   island;
3. a native continuity-handoff node for the following full-screen shot;
4. explicit dependencies between those nodes;
5. complete structural coverage of every hard user claim;
6. an ineligible selected hybrid candidate because the generated owner is not
   implemented; and
7. explicit unresolved project/evidence and capability requirements.

This is positive evidence for **operation selection and graph construction**.
It does not prove exact runtime arguments, safe compilation, actual code
generation, rendering, visual quality, repair, or editor acceptance.

## What remains unproven

- Stage 3: project/revision, asset/range, rights/privacy/egress, preservation,
  and proof binding.
- Stage 4: exact typed compilation and dependency/invalidation verification.
- Stage 5: deterministic proceed/clarify/gap/conflict disposition.
- Stage 6: isolated proxy execution, generated-code sandbox, render proof, and
  bounded repair.
- Stage 7: blind editor review of real rendered results.
- Generalization beyond this single synthetic filmstrip/hybrid case.
- Long-form scheduling, range conflicts, mixed-rate media, audio-dependent
  planning, and the wider Adobe-class capability surface.

No production model-driven mutation is authorised from this result.

## Verification and commits

- Final focused V2 suite: 69/69 tests passed.
- `pnpm exec tsc --noEmit`: passed.
- `pnpm exec eslint . --quiet`: passed.
- `74957c5fe`: separate routing dimensions from capability readiness.
- `847bf36f1`: clarify Stage-2 structural coverage versus Stage-3 binding.
- `52fb3bba0`: reconcile omitted Google thought telemetry only when totals prove zero.
- `5385c8314`: admit the measured Stage-2 reasoning requirement.

## Next bounded slice

Proceed to Stage 3 without production mutation:

1. freeze an evaluator-approved canonical Stage-2 hybrid graph so Stage-3
   evidence binding can be tested independently of Stage-2 model variance;
2. build one rights-owned synthetic evidence pack containing a project revision,
   rational timebase, two immutable asset identities, exact source ranges and
   handles, the native following-shot identity, boundary crop state,
   rights/privacy/egress decisions, and proof obligations;
3. run the Stage-3 evidence-and-safety binder against Luna and Terra first,
   while preserving each model's Stage-2 chain as a separate end-to-end arm;
4. require the resulting artifact to remain blocked on the unimplemented
   generated executor rather than claiming production readiness.

Only after Stage 3 and exact compilation are sound should the isolated
GeneratedCompositionProgram executor unlock Stage 6 render testing.
