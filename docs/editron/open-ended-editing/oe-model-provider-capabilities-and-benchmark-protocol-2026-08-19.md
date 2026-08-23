# Editron model-provider capabilities and fair benchmark protocol

**Status:** governing protocol plus the V27 provider-native result index
**Last verified:** 2026-08-20, against official provider documentation, live
provider metadata/tool-call probes, current repository code and immutable V2R
receipts
**Current scope:** GPT-5.6 Luna, GPT-5.6 Terra and Gemini 3.7 Flash. Qwen3.8-Max
is retained below only to interpret historical receipts; it is retired from all
future benchmark cohorts by operator decision on 2026-08-20.
**Authority:** this document governs how these routes are described and tested;
it does not select a production winner or authorise production mutation

## Decision

The previous V2R cohorts did **not** test the primary vibe-editing interaction
we intend to build. They asked models to produce large, staged JSON artifacts
while explicitly forbidding tool calls. That remains a useful structured-plan
and schema-obedience test, but it is not a native tool-calling benchmark.

All four current candidates support native function/tool calling. A live,
provider-native first-step smoke on 2026-08-19 confirmed that each can choose an
Editron resolver from real tool declarations. The next benchmark must therefore
test an iterative editing episode using provider-native tool calls, actual tool
results, bounded replanning, isolated execution and rendered proof. Structured
artifact construction remains a separate scored arm.

No model is the production winner yet. The next cohort is Luna, Terra and
Gemini 3.7 only. Luna and Terra remain separate
cost/quality candidates rather than being treated as the same OpenAI route.
No new Qwen call, trial, repair, score or production-routing candidate is
authorised. Historical Qwen code and receipts remain audit evidence only.

## Why Qwen could write passing code but later receive benchmark failures

These were different tasks and different operating environments.

| Qwen as a coding agent | Qwen in V2R V17-V19 |
| --- | --- |
| Could inspect repository files and surrounding code. | Received a frozen research packet, not repository access. |
| Could edit code, run tests, read failures and repair repeatedly. | Usually received one response plus at most one schema repair. |
| Success meant deterministic code/tests passed after an iterative loop. | Success required three separately shaped JSON artifacts, exact evidence policy, lowering, proxy execution and proof. |
| Used tools as part of the job. | The provider prompt explicitly said not to call tools. |
| Could learn exact types from compiler/test diagnostics. | Had to serialize the research schema from prompt context. |
| Could use the whole coding-agent control loop. | Was tested mainly as a one-shot/staged artifact generator. |

Passing code in the coding-agent loop is real positive evidence for Qwen's
long-horizon implementation and repair ability. It does not automatically prove
that Qwen can plan Editron edits from media evidence. Conversely, a strict JSON
artifact failure does not prove that Qwen cannot choose or call editing tools.
Both abilities must be measured under the interface in which we plan to use
them.

## Historical Qwen report from immutable receipts

**Retired route:** this section is preserved to explain V17-V19 and must not be
used to place Qwen in a future cohort.

The following table is derived from the six Qwen rows in each stored cohort,
not from chat recollection. `Expected` means the final disposition matched the
preregistered condition; it does not mean every intermediate choice was ideal.

| Cohort | Expected final dispositions | What positively passed | What failed |
| --- | ---: | --- | --- |
| V17 | 3/6 | DEV-03 baseline executed and passed real visual/audio proxy proof; DEV-03 withheld evidence stopped as `UNVERIFIABLE`; DEV-04 returned the expected capability gap. | DEV-01 baseline and withheld cases stopped at Stage 5; DEV-02 failed Stage-1 enum schema and became `UNVERIFIABLE`. |
| V18 | 3/6 | DEV-01 withheld evidence stopped as `UNVERIFIABLE`; DEV-03 withheld evidence stopped as `UNVERIFIABLE`; DEV-04 returned the expected capability gap. | DEV-01 baseline and DEV-03 baseline stopped at Stage 5; DEV-02 again failed Stage-1 enum schema. |
| V19 | 1/6 final dispositions | DEV-04 again returned the expected capability gap. DEV-03 baseline passed Stage 1-5 and reached real proxy execution. | DEV-01 baseline failed Stage-2 schema; DEV-02 failed Stage-1 schema; the two withheld-evidence cases violated semantic evidence policy; DEV-03 failed rendered visual proof. |

Runtime for Qwen's six cases was 31.80 minutes in V17, 27.38 minutes in V18
and 30.89 minutes in V19. The cohort recorded its Qwen cost route as
`PARTIAL_UNPRICED_ROUTE`; the stored `0` cost is therefore **not** evidence that
the calls were free.

### What Qwen actually demonstrated

1. **One genuine executable success.** In V17 DEV-03, Qwen selected
   `read_project_file`, `get_timeline_view`, `find_audio_moment`,
   `sync_cuts_to_beats` and `apply_camera_shake`. All Stage-1/2/3 artifacts were
   schema-valid. Generic lowering preserved five selected operations as five
   compiled operations. The isolated executor rendered the video/audio and the
   independent proof passed.
2. **A second near-execution.** In V19 DEV-03, the same five-operation family
   passed semantic policy and Stage 5, then failed a real render predicate:
   `VISUAL_SHAKE_OR_NEUTRAL_RETURN_INVALID`. The selected shake intensity was
   `0.15`; the active proof sample could not measure a visible displacement.
   V17 used `0.30` and passed. This is a legitimate rendered-quality failure,
   not a JSON formatting failure.
3. **Consistent honest gap behavior on DEV-04.** Qwen returned the expected
   preregistered capability gap in V17, V18 and V19.
4. **Real use of the operation catalog.** In V17 DEV-01, Qwen emitted actual
   Editron operator IDs across transcript, cut, visual/keyframe and audio
   families. The final Stage-5 result failed, but the claim that Qwen merely
   responded with vague prose is false.
5. **Material inconsistency.** The same route alternated between correct
   evidence stops, premature capability gaps, schema errors and an unsafe
   attempt to continue when evidence was withheld. One successful render does
   not establish repeatability.

### Qwen failures classified fairly

| Failure class | Concrete receipt evidence | Interpretation |
| --- | --- | --- |
| Strict artifact-schema mismatch | V17/V18 DEV-02 used unsupported `relation` enum values; V19 DEV-02 used an unsupported tolerance kind; V19 DEV-01 Stage 2 used `from/to/kind` where the contract required `fromNodeId/toNodeId/edgeType`, plus other wrong field names. | Schema-contract obedience failure under the JSON-artifact interface. It is not evidence that native tool choice failed. |
| Evidence-policy failure | V19 withheld DEV-01 and DEV-03 continued with partial/unverifiable bindings and failed `SEMANTIC_OPERATOR_POLICY_FAILED`. | Genuine safety/reasoning failure: the route did not stop cleanly when required evidence was absent. |
| Rendered-quality failure | V19 DEV-03 passed planning and lowering, but the selected 0.15 camera shake was not observably different at the proof sample. | Genuine execution-quality failure for that plan and proof raster. |
| Harness/interface pressure | V17 DEV-03 Stage 2 used 53,366 input tokens for a staged JSON plan; Qwen's OpenAI-compatible structured-output surface provides JSON-object mode rather than OpenAI-style strict JSON Schema enforcement. | The benchmark made exact serialization a large part of the score. This must remain a separate arm, not be mislabeled as tool-calling competence. |

**Historical Qwen verdict:** promising and unstable under the tested interface. It has the strongest stored
evidence in this cohort of one complete model-selected DEV-03 proxy pass, plus
consistent capability-gap behavior, but it did not show repeatable safety and
schema correctness. The route is now retired; do not promote or retest it.

## What the current repository harness actually does

Current code is explicit:

- `lib/editron/research/open-ended-planner/provider-codecs-v2.ts:113` labels the
  request `RESEARCH_ONLY_NO_TOOLS_NO_NETWORK_NO_PROJECT_MUTATION`.
- `provider-codecs-v2.ts:118` instructs the model: `Do not browse, call tools,
  mutate state, or claim rendered success.`
- OpenAI receives one Responses request with a non-strict `json_schema` output
  format at `provider-codecs-v2.ts:147`.
- Gemini receives `responseJsonSchema` at `provider-codecs-v2.ts:156`.
- V17-V19 sent Qwen `response_format: { type: 'json_object' }` and no `tools`
  array through `qwen-direct-provider-v2.ts`.
- The future builders in `development-cohort-routes-v2.ts` now return Luna,
  Terra and `gemini-3.7-flash` only. The V4 route-roster builder remains solely
  to verify already-issued V17-V19 manifests and receipts.

Therefore the V17-V19 results are properly named:

> **staged structured-plan artifact + evidence-policy + isolated execution
> results**

They are not properly named:

> **native tool-calling results**

This distinction does not discard the receipts. Schema adherence, evidence
discipline, executable lowering and rendered proof remain important. It stops
one interface from being mistaken for the complete product interaction.

## Provider capability matrix

The table records capabilities needed to interpret both the future cohort and
historical Qwen evidence. The Qwen column is not a current candidate. Prices
are public standard API prices verified on 2026-08-19 and are volatile.

| Property | GPT-5.6 Luna | GPT-5.6 Terra | Gemini 3.7 Flash | Qwen3.8-Max |
| --- | --- | --- | --- | --- |
| Intended comparison role | Low-cost high-volume planner baseline | Higher-quality balanced planner/reference route | Multimodal observer + agentic planner candidate | Multimodal planning/coding/tool route |
| Requested model ID | `gpt-5.6-luna` | `gpt-5.6-terra` | `gemini-3.7-flash` | `qwen3.8-max` |
| Frozen snapshot available from current page/route | No dated snapshot exposed; record returned identity/fingerprint | No dated snapshot exposed; record returned identity/fingerprint | Live metadata returned `3.7-flash-08-2026`; record it per call | Rolling named route; record returned identity/request ID and response hash |
| Input modalities | Text, image | Text, image | Text, image, audio, video | Text, image, video |
| Direct audio/video input | No / no | No / no | Yes / yes | No audio; video supported by model page |
| Context / max output | 1,050,000 / 128,000 | 1,050,000 / 128,000 | 1,048,576 / 65,536 from live metadata | 1,000,000 / 131,072 |
| Native function calling | Yes | Yes | Yes | Yes |
| Sequential and parallel tools | Yes | Yes | Yes | Yes; provider settings differ by thinking mode |
| Structured output | Native strict function schemas and structured outputs | Same | JSON Schema structured output; tool + structured-output combinations documented | JSON-object mode on OpenAI-compatible API; exact schema must be described and validated client-side |
| Reasoning control | `none/low/medium/high/xhigh/max` | Same | Thinking level/budget according to Gemini API surface | `enable_thinking` and thinking budget |
| Context caching | Cached input; explicit cache-write accounting matters | Same | Implicit/explicit context caching | Implicit plus explicit prefix caching |
| Standard input/output price per 1M | $0.20 / $1.20 | $2.00 / $12.00 | $0.75 / $3.75 through 2026-12-31 | Singapore: $2.00 / $6.00 |
| Cached input | $0.02/M; cache writes 1.25x uncached | $0.20/M; cache writes 1.25x uncached | $0.075/M through 2026-12-31 plus storage | Singapore implicit $0.25/M; explicit create $2.50/M; read $0.17/M |

### GPT-5.6 Luna and Terra

Official model pages confirm both support Responses, Chat Completions,
function calling and structured outputs. Both accept images as input, but not
direct audio or video. Editron must send ordered images or cited derived
audio/video evidence unless a separate observer route is used.

The official function-calling guidance materially affects our test:

- use `strict: true` where the provider supports it;
- set `additionalProperties: false` and make fields required under strict mode;
- test `tool_choice` rather than assuming default `auto` behavior;
- separately test parallel and sequential dependencies;
- initially expose a focused eligible set; OpenAI gives a soft recommendation
  of fewer than 20 functions and recommends tool search for large surfaces;
- tool definitions consume input/context tokens.

The complete `CAP-2` directory still has to make absent and supported
capabilities visible. The provider-facing experiment must compare a complete
packet with the planned two-level `directory + exact eligible records` design;
we must not hide tools merely to improve scores.

OpenAI also documents Programmatic Tool Calling. It may help deterministic,
bounded read/filter/join/rank/deduplicate stages. It must not be assumed for
creative choices, writes or approval-sensitive operations. The benchmark will
compare direct function calling first, then a separate programmatic arm where
the workload actually fits it.

### Gemini 3.7 Flash

Gemini 3.7 is real and available on the configured API account. A live
`models/gemini-3.7-flash` query on 2026-08-19 returned:

```text
version: 3.7-flash-08-2026
inputTokenLimit: 1,048,576
outputTokenLimit: 65,536
methods: generateContent, countTokens, createCachedContent,
         batchGenerateContent
```

Official current documentation uses `gemini-3.7-flash` for function calling,
sequential function results, streaming tool calls and MCP. Gemini supports
parallel/compositional calls and tool modes including automatic, forced/any,
none and validated modes, depending on the API surface.

Gemini 3.7 must be tested because it uniquely gives this initial cohort a
provider-native audio/video observation path. That does **not** make it a
frame-accurate proof system. Google's video guide says default video sampling
is 1 FPS and warns that fast action can lose detail. Gemini can propose
semantic/reference observations; exact cuts, masks, motion and acceptance proof
still require hash-bound dense windows and deterministic/rendered evidence.

Use Google's `countTokens` for every multimodal benchmark request. Record
returned model version, media resolution/sampling settings, input ordering,
thinking configuration, safety outcome and complete usage.

Gemini was absent from V17-V19 because the connected cohort builder excluded
the Google route—not because Gemini 3.7 lacked tool calling or was unavailable.
That is a harness omission to correct in the next issued cohort.

### Qwen3.8-Max

Alibaba's official model page identifies `qwen3.8-max` as a 1M-context
text/image/video-input model with function calling, structured output and
context caching. The Singapore route used by Editron returned the exact
requested model name in stored receipts.

Important provider-specific behavior:

- standard function calling supports tool arrays, serial result loops,
  `tool_choice` and parallel calls;
- the live Qwen3.8 route rejected `tool_choice: "required"` while thinking was
  enabled; thinking + `auto` succeeded;
- the public OpenAI-compatible structured-output contract guarantees
  `response_format: { type: "json_object" }`, not OpenAI-native strict
  `json_schema` enforcement;
- implicit caching matches stable prefixes, so stable policy/tool context must
  come before dynamic project facts if caching is tested.

The adapter must respect these provider semantics rather than marking an
unsupported option combination as model failure.

## Live native tool-calling smoke

On 2026-08-19, all four routes received the same semantic task and four
function declarations:

```text
User objective:
  Remove only the silent pause after the phrase "here it is".
  Do not cut until the exact speech-safe range is resolved.

Available functions:
  resolve_transcript_edit
  cut_section
  create_generated_composition
  apply_color_grade

Expected first action:
  resolve_transcript_edit
```

| Route | Native first call | Result | Observed latency | Important transport fact |
| --- | --- | --- | ---: | --- |
| Luna | `resolve_transcript_edit` | PASS | 1.989 s | Responses native function call |
| Terra | `resolve_transcript_edit` | PASS | 2.459 s | Responses native function call |
| Gemini 3.7 Flash | `resolve_transcript_edit` | PASS | 6.101 s | Documented `low` thinking setting; an unsupported `minimal` probe was corrected before scoring |
| Qwen3.8-Max | `resolve_transcript_edit` | PASS | 4.037 s | Thinking + `required` was rejected by provider; thinking + `auto` produced the correct call |

This smoke proves only that every route can receive equivalent tool declarations
and select the correct first resolver among distractors. It does **not** prove:

- a complete dependent multi-tool episode;
- target reconstruction from real video/reference evidence;
- correct range/coordinate arguments after tool results;
- safe behavior under missing evidence;
- native/generated/hybrid routing;
- render quality, repair ability or production mutation safety.

Those are the next benchmark's scored stages.

## V27 provider-native result - 2026-08-20

The corrected V27 manifest is
`1f807926d6c6a1fa061611e771d211dd36a1dc025173b7e9c0791ce80341ebe2`.
Luna and Terra each matched 17 of 18 expected outcomes across three repetitions
of all six cases. Both passed DEV-01, DEV-02, both missing-evidence controls and
DEV-04 in every repetition. Each missed one DEV-03 baseline repetition. No row
produced a false product success, a harness error or a real-project state
effect.

Gemini 3.7 remains provider-infrastructure-unverifiable: both the prior six-row
attempt and the current bounded V27 probe returned HTTP 429 on every retry
before any model output. It has not received an editing score.

The exact matrix, receipt hashes, failure traces and qualified research verdict
are recorded in
[the V27 results](oe-v2r-provider-native-v27-results-2026-08-20.md). The
architectural hypothesis advances as `MODIFY_AND_PROCEED_RESEARCH`; no model is
production-approved.

## Governing fair benchmark protocol

### Arm A: structured-plan artifact compliance

Retain the current staged JSON test, but name and score it honestly:

- target-claim schema correctness;
- executable operator selection and dependencies;
- evidence binding;
- declared capability gap;
- lowering compatibility.

Do not interpret a failure in this arm as a native tool-calling failure.

### Arm B: provider-native direct tool calling

This is the primary vibe-editing/orchestration arm.

1. Give the model the active objective, bounded revision/state, cited evidence,
   preservation rules, authority/budget and complete records for currently
   eligible operations.
2. Expose real operation schemas as provider-native functions. Use strict
   function schemas where supported; use the strongest officially supported
   equivalent elsewhere and validate all arguments locally.
3. Let the model select the next exact operation. Do not ask it to serialize
   internal runtime ports or ProjectService receipt plumbing.
4. Execute read/analysis/proposal operations only in the research sandbox and
   return their exact typed result to the same provider conversation.
5. Require the model to choose subsequent operations from the new state. The
   model remains responsible for every creative and evidence-producing
   operation.
6. A generic binder may fill revision tokens, exact typed references and
   coordinate transforms already declared by selected operator schemas. It may
   add zero catalog operations and drop zero model-selected operations.
7. Run the isolated native/generated/hybrid proxy, inspect actual rendered
   evidence and permit only the preregistered bounded repair budget.
8. Finish with `PASS`, `FAIL`, `UNVERIFIABLE`, `CAPABILITY_GAP`, `CONFLICT` or a
   typed provider/transport failure. Never convert one class into another.

### Arm C: programmatic/tool-search variants

Only after Arm B establishes a direct baseline:

- test OpenAI programmatic tool calling for predictable bounded search,
  filtering and aggregation;
- test provider-equivalent dynamic tool discovery where available;
- compare against the full exact packet so retrieval never silently hides a
  valid operation;
- keep creative operation choice and all mutation/approval boundaries in the
  auditable direct plan.

### Arm D: multimodal reference reconstruction

Run separate, declared input arms:

- provider-native video/audio where supported;
- ordered, individually timestamped images plus audio/evidence;
- text/structured evidence only.

Do not compare these as if the model saw identical information. Gemini receives
its supported native media forms. Luna/Terra receive images and
the same hash-bound derived observations. A specialist-observer + planner
combination is scored as its own route with both costs and failure surfaces.

### Arm E: complete editing episode

Each route must eventually demonstrate:

```text
reconstruct target
  -> create/expand Sequence-Range plan node
  -> retrieve and inspect missing evidence
  -> choose exact eligible operations
  -> execute isolated proposal
  -> inspect state/render/audio result
  -> repair, replan, ask, or stop honestly
  -> handle stale revision/user change
  -> resume from compacted canonical state
  -> finish with proof or a typed non-success disposition
```

The four current development tasks remain useful only after their inputs,
operator records, proof predicates and expected dispositions are reissued under
this protocol:

- DEV-01: dependent native transcript cut, post-cut visual push-in and BGM
  ducking;
- DEV-02: generated filmstrip island and hybrid full-reel reasoning;
- DEV-03: measured audio/video-dependent beat cuts plus a visible bounded
  camera treatment;
- DEV-04: honest inability/capability-gap behavior.

## Fairness invariants

Every issued comparison must satisfy all of these:

1. Record exact requested and returned model identity, region, endpoint,
   service tier, provider request ID/fingerprint where available, prompt/tool
   hashes and response-envelope hash.
2. Use only settings the provider officially supports. Unsupported transport
   combinations are adapter defects or capability facts, not editing failures.
3. Give all providers semantically equivalent tools and evidence. Transport
   syntax may differ; hidden semantic hints may not.
4. Freeze evaluator policy, tool descriptions, task inputs and expected stop
   behavior before the paid calls.
5. Do not reveal expected topology, gold operation order or hidden predicates
   in repair guidance.
6. Separate transport errors, 429s, timeouts, refusal, parse/schema failure,
   evidence-policy failure, planning failure, primitive/runtime failure,
   rendered-proof failure and human rejection.
7. Give each allowed attempt its own declared token/time reservation. A repair
   may not inherit only an accidental few seconds left from the first attempt.
8. Use provider token counters for preflight, especially Gemini multimodal
   `countTokens`; reconcile returned usage and provider charge after every call.
9. Preserve raw output and exact tool calls. Canonical hand-authored artifacts
   may be mechanics baselines only, never substituted as model success.
10. Run repeated trials. One attractive render and one malformed JSON response
    are both anecdotes, not a route ranking.
11. Score hard safety first: forbidden operation, preservation violation and
    false success must remain zero accepted events.
12. Rank surviving routes by accepted rendered quality, user correction time,
    repeatability, latency and total cost per accepted verified edit—not by
    provider marketing or schema-valid rate alone.

## Candidate disposition before the rerun

| Candidate | Keep? | Current evidence-based role |
| --- | --- | --- |
| Luna | Yes | 17/18 V27 outcomes. Strong low-cost research orchestrator candidate; one DEV-03 rendered-form/repair miss prevents production approval. |
| Terra | Yes | 17/18 V27 outcomes. Strong research orchestrator candidate; one DEV-03 causal evidence-order miss prevents production approval. |
| Gemini 3.7 Flash | Yes; blocked on inference access | Required multimodal comparison arm. Metadata/token preflight passes, but repeated HTTP 429s produced no V27 model output. |
| Qwen3.8-Max | **No — retired** | Historical evidence only. No future calls, repairs, scores or production-routing consideration. |

Do not add more models until one of these three fails a required capability or
a new candidate has a specific hypothesis: materially better editing quality,
latency, privacy, modality coverage or cost. Three is enough to test the
architecture without confusing provider breadth with experimental rigor.

## Required next implementation phase

The provider-native adapter and first corrected OpenAI cohort now exist. The
next phase is a bounded reliability and holdout phase:

1. move raw DEV-03 shake intensity/duration choice behind the existing visual
   form owner while preserving the model's semantic operation choice;
2. reissue the changed tool/manifest identity and repeat DEV-03 for Luna/Terra;
3. run Gemini only after a bounded inference probe returns model output;
4. add raw-reference, operation-order and stale-revision held-outs plus blind
   editor quality/correction-time review;
5. design ProjectService-owned proposal integration only after those gates.

This phase remains research-only and cannot import ProjectService mutation,
become a second timeline authority or claim production model approval.

## Official provider sources

### OpenAI

- [GPT-5.6 Luna model page](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- [GPT-5.6 Terra model page](https://developers.openai.com/api/docs/models/gpt-5.6-terra)
- [Function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [Programmatic Tool Calling](https://developers.openai.com/api/docs/guides/tools-programmatic-tool-calling)
- [Latest model guidance](https://developers.openai.com/api/docs/guides/latest-model)

### Google

- [Gemini function calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini token counting](https://ai.google.dev/gemini-api/docs/tokens)
- [Gemini context caching](https://ai.google.dev/gemini-api/docs/caching)
- [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini video understanding](https://ai.google.dev/gemini-api/docs/video-understanding)

### Alibaba Cloud / Qwen — historical receipts only

- [Qwen3.8-Max model information](https://www.alibabacloud.com/help/en/model-studio/qwen3-8-max)
- [Qwen function calling](https://www.alibabacloud.com/help/en/model-studio/qwen-function-calling)
- [Qwen structured output](https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output)
- [Qwen deep thinking](https://www.alibabacloud.com/help/en/model-studio/deep-thinking)
- [Qwen context cache](https://www.alibabacloud.com/help/en/model-studio/context-cache)

## Local evidence and reproducibility

Primary stored receipts:

```text
.calibration-temp/open-ended-planner-v2/v2r-cohorts/
  v2r-v17-20260819143647/
  v2r-v18-20260819153842/
  v2r-v19-20260819162944/
```

Relevant current code:

```text
lib/editron/research/open-ended-planner/provider-codecs-v2.ts
lib/editron/research/open-ended-planner/qwen-direct-provider-v2.ts
lib/editron/research/open-ended-planner/development-cohort-routes-v2.ts
lib/editron/research/open-ended-planner/smoke-preflight-v2.ts
docs/EDITRON_FINAL_EXECUTION_PLAN_2026-08-10.md
docs/editron/open-ended-editing/oe-v2-1f-connected-model-episode-results-2026-08-19.md
docs/editron/open-ended-editing/oe-v2r-provider-native-v27-results-2026-08-20.md
```

No API key, raw private media or secret value belongs in this document or any
benchmark receipt intended for Git.
