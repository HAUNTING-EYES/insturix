# OE-1 development benchmark results

- Status: **HISTORICAL DIAGNOSTIC; production interpretation superseded; V2-1 addendum recorded below**
- Recorded: 2026-08-12
- Branch: `infrastructure-improvs-+Editron`
- Implementation commit: `ea9156a2b027f040841353d45577059260d11732`
- Authority: `RESEARCH_ONLY_NO_PROJECT_MUTATION`

## Governing correction

The historical responses, hashes and verifier results below remain part of the
audit record. Their earlier authorization to proxy-execute the single accepted
graph and their use as a model-selection signal are withdrawn.

The independent review found that the packet did not test the complete product
premise: models did not inspect the original request or media, `DEV-02` omitted
the intended generated-composition execution form, declared operator handoffs
were not fully type-connectable, `C4` retained predicates requiring deliberately
withheld evidence, and task token budgets were not enforced or fully observed.

The governing replacement is the
[open-ended editing benchmark v2 production correction](oe-benchmark-v2-production-correction-2026-08-12.md).
It separates target reconstruction, execution-form/operation selection,
evidence and safety binding, exact compilation, truthful gap handling,
isolated execution/proof and blind editor review. No further model ranking,
proxy execution, holdout use or production routing is authorized until its
`V2-0` benchmark repair is frozen and its small `V2-1` mechanics smoke passes.

## Outcome in plain language

The fair packet `1.0.4` rerun produced **one verifier-approved executable
graph**: DeepSeek-V4-Flash-0731 on `DEV-01/C0/r2`. No model passed an executable
`DEV-02` reference reconstruction or `DEV-03` audio/video timing graph. Luna and
Flash-Lite also passed no `DEV-01` graph. Capability-gap handling remained much
stronger: Luna passed 15/18, Flash-Lite 18/18, and DeepSeek 16/18 on `DEV-04`.

At the time of this report, that result authorized isolated proxy execution of
the exact accepted graph only. The governing correction above has withdrawn
even that authorization until the v2 benchmark mechanics pass. The result does
**not** select a production model, authorize ProjectService mutation, open the
holdout, or establish renderability, editorial quality, or truthful proof.

## Frozen test contract

The governing fixture is
[`benchmark-contract-v1.json`](../../../tests/fixtures/editron/open-ended-planner-v1/benchmark-contract-v1.json).
The recorded OE-1 provider runs used administrative version `1.0.6` and
model-visible planner packet `1.0.3`. Their exact historical packet hash is:

```text
dcdfbd2362e4b59f06dfd5d51dd565d7c4f2ed17455c31b2ac4c600e0e62757a
```

The later independent OE-2A verifier proved that packet `1.0.3` was ambiguous
in three ways: it had no control-only dependency edge, required models to copy
catalog-owned state-effect names even in the signatures-only condition, and did
not define one normative graph failure action. The verifier also initially
treated every possible operator output assertion as mandatory, although data
edges bind declared operator ports directly.

The corrected next-run contract is administrative version `1.0.7`,
model-visible packet `1.0.4`, with pinned `DEV-01`/`C0_SIGNATURES_ONLY` hash:

```text
474b87ae725757468b0fec4a6c9bfcb1e9f3ce62fc585936fb95b2495e89aa4f
```

Its only model-visible differences are the packet version, candidate-graph
schema/semantics, and the matching state/failure tokens in the explicitly
non-executable format example: canonical port names, `$control` ordering edges,
optional expected-output assertions, `NONE`/`DECLARED_OPERATOR_EFFECTS`
acknowledgements, and `ABORT_GRAPH`. Task goals, evidence, operator eligibility,
policies, budgets, conditions, and score thresholds are unchanged. Old model
outputs were not rewritten or rescored as if they had seen this new contract;
the completed fair rerun below used new responses to packet `1.0.4`.

The development split contains four synthetic, internally owned tasks:

| Task | Required behavior |
| --- | --- |
| `DEV-01` | Remove transcript-bound dead air, add bounded product emphasis, and duck music without cutting speech. |
| `DEV-02` | Reconstruct a six-second moving-panel reference from owned clips while preserving crop, title, rights, and exit continuity. |
| `DEV-03` | Move safe montage boundaries to measured beats and add a bounded final shake without touching protected dialogue. |
| `DEV-04` | Detect that moving matte/tracking is unavailable and return a capability gap or clarification instead of inventing an operator. |

Conditions `C0` through `C4` apply to all four tasks. `C5`, the explicit
capability-gap condition, applies to `DEV-04`. Each applicable model/condition
pair ran three times, producing 63 planned trials per full model route. No
customer media, web search, hidden tool execution, retry, repair, render, or
ProjectService write was allowed.

The conditions intentionally vary what the model can see:

- `C0`: operator names and ports only.
- `C1`: full operator specifications.
- `C2`: full specifications plus reviewed, source-bound knowledge.
- `C3`: full specifications plus one unrelated example used only to show JSON
  shape.
- `C4`: task-declared noisy or missing evidence, with clean evidence withheld.
- `C5`: a task whose required capability is absent from the operator envelope.

The locked holdout pack was not used. It remains reserved for the later
go/modify/no-go decision after the OE-2 machinery and development screen are
ready.

## Historical OE-1 aggregate results

Latency percentiles use provider-successful trials. Cost is the run's recorded
model-cost estimate and excludes later render, storage, and human-review cost.

| Route | Provider success | Envelope-bound | Empty response | Malformed JSON | Estimated cost | p50 latency | p95 latency |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| GPT-5.6 Luna | 63/63 | 63/63 | 0 | 0 | $0.875644 | 20.048 s | 37.120 s |
| GPT-5.6 Terra | 63/63 | 63/63 | 0 | 0 | $1.157762 | 8.022 s | 30.979 s |
| Gemini 3.5 Flash-Lite | 63/63 | 63/63 | 0 | 0 | $0.188697 | 18.063 s | 19.533 s |
| DeepSeek-V4-Flash-0731 | 63/63 | 42/63 | 13 | 8 | $0.187106 | 72.669 s | 141.586 s |
| Gemini 3.6 Flash | 13/63 | 12/63 | 0 | 1 | $0.197727 | 54.518 s | 71.498 s |

Gemini 3.6 Flash's remaining 50 trials ended in provider rate-limit
dispositions. Its numbers are operational evidence only and must not be
compared as a completed 63-trial model run.

### Per-task proposal shape

"Non-empty" means the parsed candidate contained at least one operation node.
It is not a quality score: a zero-node graph can be correct when the system
must clarify or report a missing capability.

| Route | `DEV-01` non-empty | `DEV-02` non-empty | `DEV-03` non-empty | `DEV-04` zero-node + explicit clarification/decline |
| --- | ---: | ---: | ---: | ---: |
| GPT-5.6 Luna | 15/15 | 9/15 | 13/15 | 18/18 |
| GPT-5.6 Terra | 6/15 | 3/15 | 6/15 | 18/18 |
| Gemini 3.5 Flash-Lite | 12/15 | 9/15 | 12/15 | 18/18 |
| DeepSeek-V4-Flash-0731 | 8/15 | 1/15 | 12/15 | 18/18 |

### Diagnostic required-operator coverage

For the twelve clean `C0`-`C3` repetitions per task, this diagnostic asks only
whether all obvious required operation IDs were present:

- `DEV-01`: `cut_section`, `set_keyframes`, and `apply_audio_ducking`.
- `DEV-03`: `sync_cuts_to_beats` and `apply_camera_shake`.

| Route | `DEV-01` coverage | `DEV-03` coverage |
| --- | ---: | ---: |
| GPT-5.6 Luna | 12/12 | 10/12 |
| GPT-5.6 Terra | 2/12 | 1/12 |
| Gemini 3.5 Flash-Lite | 12/12 | 11/12 |
| DeepSeek-V4-Flash-0731 | 5/12 | 12/12 |

This is a coarse OE-1 diagnostic, not graph validity. It does not prove that
inputs, outputs, edges, evidence, timing, or preservation claims are correct.

## Provider-route and fairness record

- Luna and Terra used the OpenAI routes declared in the frozen provider
  candidate table.
- Gemini 3.5 Flash-Lite completed the fair run with 4.5-second pacing and no
  provider rate-limit disposition.
- Gemini 3.6 Flash remained quota-limited even in the paced run and is unranked.
- DeepSeek used the official `https://api.deepseek.com/v1/chat/completions`
  transport. The provider route was `deepseek-v4-flash`; the logical evaluated
  snapshot remained `DeepSeek-V4-Flash-0731`. The adapter requested JSON-object
  output, enabled thinking, and allowed up to 16,384 output tokens.
- No Ollama result is ranked. The fair 0731 artifact is from the authenticated
  official DeepSeek route, not an Ollama fallback.
- The first DeepSeek diagnostic report saw the wrong model-visible packet
  contract version. It is retained for audit but excluded from all ranking.
  The fair rerun used the same pinned packet hash as Luna.

The route implementation is in
[`provider-development-runner-v1.ts`](../../../lib/editron/research/open-ended-planner/provider-development-runner-v1.ts),
packet materialization is in
[`materialize-packet-v1.ts`](../../../lib/editron/research/open-ended-planner/materialize-packet-v1.ts),
and trial parsing is in
[`trial-harness-v1.ts`](../../../lib/editron/research/open-ended-planner/trial-harness-v1.ts).
The integrity and adapter tests are in
[`open-ended-planner-fixture-integrity.test.ts`](../../../tests/editron/open-ended-planner-fixture-integrity.test.ts).

## Evidence artifacts

The raw reports are intentionally gitignored under
`.calibration-temp/open-ended-planner/`. Their SHA-256 hashes at closeout are:

| Artifact | SHA-256 | Disposition |
| --- | --- | --- |
| `oe1-development-openai-v1.json` | `df3843570154bd8e5d2a6cde5cf9fc420c9d4d394452d08b36370085cc25ec84` | Fair Luna and Terra source report. |
| `oe1-development-gemini-lite-paced-v1.json` | `d664f764153d12405d7ea960a9c9502f186d9215da8f0bf8787d34fb344fc7d9` | Fair Flash-Lite source report. |
| `oe1-development-gemini-flash-paced-v1.json` | `af78528a315c0597cc4d67d0690fcc8f77bfa9069de3815790f83ed5436a079a` | Quota-limited Flash report; unranked. |
| `oe1-development-deepseek-v4-flash-0731-fair-v1.json` | `6a71cee3caecc3331619206a711393cbba3e79f040bd8642554397a7d0fcb1a0` | Fair DeepSeek source report. |
| `oe1-development-deepseek-v4-flash-0731-v1.json` | `9b0f32c16d8d06e526cb24ed21e5a014fa2240af98ceb58cdb30292379036df6` | Diagnostic packet-version mismatch; excluded. |
| `oe2-development-rerun-packet-1.0.4-v1.json` | `c8f314993585c1aa9233354b88527aa34be09b5f5b745baa7c94193c7d90efa9` | Immutable 189-trial fair source report. |
| `oe2-development-rerun-packet-1.0.4-v1.json.records.jsonl` | `de4ad2bca1722d34e36f9b7cab182159109c880c0584b60ba4bd2c38b32b53ec` | Append-only record stream; exactly matches the source report. |
| `oe2-development-rerun-packet-1.0.4-verification-v1.json` | `207e60dd6ebbe703436e70ebf67d2c758e1d7ef841fc48146b0d5686974ff33e` | Retained initial scoring with two evaluator defects. |
| `oe2-development-rerun-packet-1.0.4-verification-v2.json` | `7394301576f1266446f485c6e53d3492afa9fdd098795a28642d8f3bdea46f5d` | Corrected scoring, source- and V1-bound. |

Because these reports contain raw model responses and operational cost/latency
evidence, they remain local calibration artifacts. The hashes let a reviewer
detect later alteration without promoting them to production receipts.

## Decision

### OE-1 decision at original closeout

1. Advance **Gemini 3.5 Flash-Lite** and **GPT-5.6 Luna** into the OE-2
   development screen.
2. Include **DeepSeek-V4-Flash-0731** as a specialist/comparison arm only if
   the OE-2 verifier can report its failures without provider-specific repair.
3. Do not advance Terra as a lead route unless a later targeted experiment can
   explain and correct its over-conservative empty-graph behavior without
   changing the frozen tasks or hidden scoring assistance.
4. Keep Gemini 3.6 Flash unranked until a fresh, fully comparable run is
   operationally possible. Do not combine its partial report with a later run.
5. Do not run the holdout, choose a production router, or authorize model-driven
   project mutation from OE-1.

### OE-2A fair rerun and corrected verification

All 189 calls completed without retry, repair, web access, media rendering, or
project mutation. Estimated model cost was `$1.539821`.

| Route | Structured candidate | `DEV-01` | `DEV-02` | `DEV-03` | `DEV-04` |
| --- | ---: | ---: | ---: | ---: | ---: |
| GPT-5.6 Luna | 58/63; 5 envelope-rejected | 0/15 | 0/15 | 0/15 | 15/18 |
| Gemini 3.5 Flash-Lite | 63/63 | 0/15 | 0/15 | 0/15 | 18/18 |
| DeepSeek-V4-Flash-0731 | 45/63; 15 empty, 3 malformed | **1/15** | 0/15 | 0/15 | 16/18 |

The initial scoring exposed two evaluator defects: numeric ranges such as
`0..1` were silently treated as integer-only, and the `DEV-01` predicate ignored
an exact resolver-to-cut data edge. Correcting those rules removed invalid
issues from 58 records but changed exactly one disposition. Raw responses stayed
byte-identical. The accepted trial is
`oe1-deepseek-v4-flash-DEV-01-C0_SIGNATURES_ONLY-r2`, raw-response hash
`69bd0556562a5597399297ce92f0f1d9435cf550d1de40c3b0922573aeb0ee2b`, graph hash
`5bb707ca733f056433033db90da05790cd2e54caab82b9b14df60ab8fe592328`.

Remaining failures are concrete: invented/aliased ports, double-bound inputs,
unordered mutations, missing exact preservation claims, missing evidence,
wrong ranges, absent task operations, and DeepSeek structured-output failures.
At original closeout, OE-2B could proxy-execute only the accepted graph. That
permission is now withdrawn by the governing correction. Holdouts, production
routing, model-driven product mutation, and claims of broad editing competence
stay locked.

## Historical next step: OE-2 (superseded)

The three slices below record what this report authorized before the governing
correction. They must not be executed as the current plan.

OE-2 should remain three bounded research slices:

1. **OE-2A — pure graph verifier: complete.** Validates operator identity/version,
   uniqueness, graph acyclicity, ports and schemas, evidence/revision binding,
   resource budgets, rights/privacy/network rules, state effects, preservation
   declarations, and task predicates. It may reject; it may not add nodes,
   choose creative values, or rewrite topology.
2. **OE-2B — isolated proxy execution.** Schedule only a verifier-approved
   graph, generate the frozen synthetic media, and render in a network-denied,
   resource-bounded research sandbox. It must not import or write
   ProjectService and must record render failures distinctly from model or
   verifier failures.
3. **OE-2C — one repair and human evaluation.** Return only structured verifier
   or render failures to the same model for one bounded repair, then run
   deterministic visual/audio checks and blind editor review. Publish results
   by task and preservation floor, followed by the locked `GO`, `MODIFY`, or
   `NO-GO` decision.

Only after OE-2 should the product return to the promised **auto-edit
simplification checkpoint** and decide interaction, background execution,
cancellation, authority, and stale-user-edit conflict behavior. The overlay
recovery programme then resumes one certified vertical at a time; model graph
quality cannot make broken caption, transition, generated-composition, audio,
or B-roll primitives production-ready.

## V2-1 fair mechanics-smoke addendum - 2026-08-16

This addendum records the corrected seven-stage benchmark work. It does not
reinterpret the historical OE-1/OE-2A matrix above.

### Canonical mechanics result

The corrected owned/synthetic mechanics chain completed with no project
mutation:

| Task | Stage 4 | Stage 5 | Stage 6 | Meaning |
| --- | --- | --- | --- | --- |
| `DEV-01` | `PASS` | `PROCEED` | `PASS` | Native dead-air cut, post-cut product emphasis and dialogue-aware BGM ducking ran in the isolated proxy. |
| `DEV-02` | `PASS` | `PROCEED` | `PASS` | Generated island, independent byte/proof binding, native continuation and the full hybrid proxy rendered. |
| `DEV-03` | `PASS` | `PROCEED` | `PASS` | Analyzer-measured beats drove safe boundary alignment and the final bounded shake. |
| `DEV-04` | `EXPECTED_CAPABILITY_GAP` | `CAPABILITY_GAP` | `CAPABILITY_GAP` | Moving matte/rotoscoping correctly remained unavailable instead of being substituted. |

The successful mechanics receipt is:

```text
.calibration-temp/open-ended-planner-v2/cohort-runs/
  cohort-20260816003947-mechanics-only/mechanics.json
SHA-256: 0fd69eb147c0d001a43b55eed9fdc57573b5b2bc48ef13055f7902dffea70a87
```

The `DEV-02` hybrid video SHA-256 is
`aa5f6644eb8feeefe73c58e3c4d33eb9d7a5aad2fa04f404464cd051bed8e389`.
Its generated-island and hybrid Stage-6 receipt hashes are respectively
`bd33c326e8755aea230e3c5288b824a9ef4cb74adc69da2c34c717ea7dc09f4b`
and `665f52bd2a9d63c7bce5b456cb0455a2861a57d04820ebc288c43cd06f450400`.

### Four-route fair cohort

The consolidated run used GPT-5.6 Luna, GPT-5.6 Terra, Gemini 3.7 Flash and
Qwen 3.8 Max. Its immutable source receipt is:

```text
.calibration-temp/open-ended-planner-v2/cohort-runs/
  cohort-20260816005559-fair/fair-cohort-receipt.json
receiptHash: 497b61de027ffa2fc576d279d80d2ddcb1d30837d5db236ec2a3040f62d0d8a6
```

Metered provider cost was `$1.218530125`. Cost coverage is partial because the
Qwen token-plan route does not expose a comparable USD charge.

| Route | Accepted artifacts | Deterministic pass | Human review required | Expected gap | Fail | Unverifiable |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| GPT-5.6 Luna | 12/12 | 4 | 4 | 2 | 2 | 0 |
| GPT-5.6 Terra | 12/12 | 3 | 4 | 1 | 4 | 0 |
| Gemini 3.7 Flash | 6/12 | 1 | 3 | 0 | 2 | 6 |
| Qwen 3.8 Max | 4/12 | 1 | 3 | 0 | 0 | 8 |

Accepted transport is not a semantic pass. Luna missed the required `DEV-01`
post-cut ordering and falsely substituted generated composition for the
missing `DEV-04` matte capability. Terra also misordered `DEV-01`, left a
required capability binding incomplete, and made the same `DEV-04`
substitution. Gemini had genuine ordering/coverage failures plus budget and
rate-limit dispositions. Qwen had no deterministic semantic failure among its
accepted rows, but eight rows were unscorable because the fair route timed out.
This makes Qwen a latency/budget question, not evidence that it lacks editing
reasoning.

### Handoff limitation and human gate

The receipt deliberately declares
`ISOLATED_COMPETENCY_WITH_EVALUATOR_APPROVED_CANONICAL_PRIOR`. Stage 2 saw the
editor-approved Stage-1 artifact, and Stage 3 saw the editor-approved Stage-2
artifact. The Stage-4-to-6 mechanics also used canonical approved artifacts.
Therefore this run measures each stage separately; it is **not** a connected
model-output-to-render chain and its one canonical hybrid render cannot be
presented as three or four model-specific videos.

The 14 accepted Stage-1 reconstructions were placed in an identity-hidden pack:

```text
.calibration-temp/open-ended-planner-v2/cohort-runs/
  cohort-20260816005559-fair/stage1-blind-review/reviewer/manifest.json
publicPackHash: 0ec775e1838cb692741968d815316360bc215dff057cb6e438eacb316929620b
```

The project owner subsequently confirmed that only one human reviewer was
available. The protocol was therefore downgraded explicitly to a
single-owner blind ordinal-preference pilot. It does not claim inter-rater
agreement, calibrated dimension scores, statistical significance or production
model ranking. DEV-01, DEV-03 and DEV-04 were text-evidence-only model arms; no
media was omitted from their review pack. DEV-02 was the only reference-image
arm.

The completed owner preferences unblinded as follows:

| Task | Owner preference | Unavailable |
| --- | --- | --- |
| `DEV-01` | Luna > Terra > Qwen > Gemini | none |
| `DEV-02` | Terra > Luna > Gemini | Qwen: provider timeout |
| `DEV-03` | Terra > Luna > Qwen > Gemini | none |
| `DEV-04` | Luna > Terra > Qwen | Gemini: provider rate limit |

Luna and Terra each won two tasks and split their head-to-head comparison 2-2.
That is a single-reviewer preference tie, not a production ranking. The
unblinded result SHA-256 is
`f191df4ac50f6baf29bb87a4ea0b14475c59b5df9b17789f745443ea3b6fd2e8`.
The decision is `MODIFY`: advance Luna and Terra to a separately versioned
connected model-output-to-render development test, retry Qwen with an explicit
measured timeout budget, and keep Gemini as a lower-priority comparison arm.
V2-2 repeated trials, holdouts, production routing and ProjectService mutation
remain unauthorized until the connected chain is proven. Silently treating
canonical handoffs as model-specific execution remains forbidden.

### Supplemental connected Qwen DEV-02 result - 2026-08-17

Qwen 3.8 Max subsequently completed a source-bound, same-route `DEV-02`
Stage 1-to-6 chain under a separately recorded corrective protocol. This is a
supplemental development result; it does not retroactively change the original
one-shot cohort score or the single-owner blind preference table above.

The successful lineage used four provider calls:

1. one bounded Stage-1 semantic repair, which made the observed yellow-title
   treatment and opposed panel motion explicit proof-addressable target claims;
2. one initial Stage-2 routing artifact;
3. one Stage-2 repair after the benchmark disclosed the exact source-resolution,
   generated-island, native-continuation and proof-read dependency contract; and
4. one Stage-3 evidence-binding artifact, accepted without repair.

The first Stage-2 artifact resolved sources before generation but omitted the
separate native-continuation-to-proof dependency. The original model packet did
not disclose that exact evaluator topology, so an earlier opaque error-code-only
repair is retained as a superseded diagnostic and is excluded from the
successful lineage. The accepted repair received actionable contract guidance.
Future fair first-pass packets must declare such mandatory topology directly;
hidden structural predicates must not be treated as model failures.

The final deterministic dispositions were:

| Stage | Disposition | Meaning |
| --- | --- | --- |
| 1 | `HUMAN_REVIEW_REQUIRED` | Qwen reconstructed the reference claims; semantic fidelity still requires editor judgment. |
| 2 | `EXPECTED_CAPABILITY_GAP` | Qwen selected the hybrid research route and its required roles; product execution remains deliberately unavailable. |
| 3 | `EXPECTED_CAPABILITY_GAP` | Qwen bound the available evidence without claiming production mutation authority. |
| 4 | `PASS` | The deterministic compiler produced a valid generated-island plus native-continuation graph. |
| 5 | `PROCEED` | Only the bounded, non-mutating research preview was authorized. |
| 6 | `PASS` | The generated island and full hybrid proxy rendered with no Stage-6 diagnostics. |

The immutable local result is:

```text
.calibration-temp/open-ended-planner-v2/cohort-runs/
  qwen-dev02-stage1-repair-20260816220338/
  qwen-dev02-stage1-repair-result.json
receiptHash: 17bdc9ad38a3328da5e02063779ec1cf05a906284bb6495b0374326108e98393
```

The Stage-6 hybrid receipt hash is
`6f2de8360eb19e7567e413ee775e9dfcffd357e244014cccbafdb8133488280c`.
Its H.264 proxy is 1080x1920, 30/1, 345 decoded frames (11.5 seconds), with no
audio stream. The video SHA-256 is
`aa5f6644eb8feeefe73c58e3c4d33eb9d7a5aad2fa04f404464cd051bed8e389`.
Generated-island hard gates, hybrid timing, boundary continuity and native
continuation passed. Creative taste and flash safety remain `UNVERIFIABLE`, and
full-project execution remains `NOT_EXECUTABLE`.

The provider calls took approximately 308-386 seconds each on the asynchronous
quality route. That is unsuitable for interactive editing at present and must
be treated as a latency/budget finding, not hidden by the successful replay.
The final replay made zero new provider calls and reused only artifacts whose
packet, transport and prior-artifact hashes matched exactly.

Visual inspection confirms a technically coherent synthetic research proxy:
the bounded panel construction, exit and native continuation are visible and
the boundary is stable. It is not a client-ready event reel: it uses schematic
colour fields, has crude demonstration typography, contains no audio, and does
not prove production taste. Qwen reconstructed claims and planned/bound the
hybrid operation graph against an existing research renderer; it did not write
an unrestricted custom composition or mutate a real Editron project.

### Supplemental Qwen four-task connected disposition - 2026-08-17

The remaining accepted Qwen prefixes were replayed or continued against the
current source-bound compiler owners. Qwen now has a development disposition
for all four synthetic tasks:

| Task | Stage 1 | Stage 2 | Stage 3 | Stage 4 | Stage 5 | Stage 6 |
| --- | --- | --- | --- | --- | --- | --- |
| `DEV-01` | `HUMAN_REVIEW_REQUIRED` | `PASS` | `PASS` | `PASS` | `PROCEED` | `PASS` |
| `DEV-02` | `HUMAN_REVIEW_REQUIRED` | `EXPECTED_CAPABILITY_GAP` | `EXPECTED_CAPABILITY_GAP` | `PASS` | `PROCEED` | `PASS` |
| `DEV-03` | `HUMAN_REVIEW_REQUIRED` | `PASS` | `PASS` | `PASS` | `PROCEED` | `PASS` |
| `DEV-04` | `HUMAN_REVIEW_REQUIRED` | `EXPECTED_CAPABILITY_GAP` | `EXPECTED_CAPABILITY_GAP` | `EXPECTED_CAPABILITY_GAP` | `CAPABILITY_GAP` | not run |

`DEV-04` stopped on the exact missing capability
`moving-matte-or-segmentation-track`. No generated-composition, overlay or
keyframe substitute was accepted.

The immutable local receipts are:

| Task | Connected/continuation receipt | Replay/result receipt | Stage-6 receipt |
| --- | --- | --- | --- |
| `DEV-01` | `dc434a6770933194ad5eea0f23199fbade1dfef745ea29b2a89f504cdf992591` | `b5cc649789edefa5694fd9da4bee970d02d26146513997d0b3a0a68853cde7e3` | `2713c5de423f2b2994c97f9c2dc9650ea5d2bb5db953334b7b7c4fa3f6837f13` |
| `DEV-02` | recorded in the preceding section | `17bdc9ad38a3328da5e02063779ec1cf05a906284bb6495b0374326108e98393` | `6f2de8360eb19e7567e413ee775e9dfcffd357e244014cccbafdb8133488280c` |
| `DEV-03` | `e5cdc5fba0755b6cbc3dedfd7330ab17928b5af43aa2f2d66924e5137fdc59e1` | `8e5986a4c73f5c24d75b0ed75e193ad08792ba726d944cf618a0690afb026db9` | `1cd8bf1d610f058cc42b1bf1e60df26832b09ffc2a9ad616a73635538704912a` |
| `DEV-04` | source Stage-1-to-3 receipt in the connected fair cohort | `e605b6853372c3d789ee8d996fcd662c33c26d2a8ec2121ddb577c6e2f1032fb` | not applicable |

The `DEV-01` proxy is a 435-frame, 320x180, 30/1 H.264/AAC research render.
It proves the exact 45-frame dead-air removal, source-frame 205 to output-frame
160 remap, stable product focal centre through the bounded push-in, separate
dialogue/BGM handling, approximately 11.54 dB BGM reduction under speech, BGM
recovery outside speech, no clipping and no project mutation. Its video SHA-256
is `4a3122281c788136f26bd678872751fc83987beaafa9a35b0d4a0584ac37a070`.

The `DEV-03` proxy is a 600-frame, 320x180, 30/1 H.264/AAC research render.
Measured analyzer peaks at frames 119, 239, 359 and 479 drive the boundary
alignment; the final shake is active at 480 and returns to neutral by 490. The
protected audio bytes match the baseline proof, and no project mutation
occurred. Its video SHA-256 is
`0821914c96cfcaa46016be0a2442601144f281906c91cba57b9d359669bcecbb`.

The original `DEV-01` Stage-4 rejection was an adapter defect, not a model
failure: the role resolver rejected valid catalog READ/RESOLVER alternatives
such as user-asset inspection, transcription and visual resolution even though
the canonical owner was unambiguous. The correction permits unused catalog
READ/RESOLVER candidates while still rejecting unknown capabilities, generated
substitution and any undeclared mutation; an adversarial `add_overlay` test
proves the boundary. The previously recorded `DEV-03` compiler diagnostics were
also stale relative to the current verified adapter; replaying the exact signed
Stage-1-to-3 artifacts produced the passing graph and render above.

This does not establish a production model winner. `DEV-01` and `DEV-03` each
used a reused Stage-1 artifact plus two accepted live continuation rows and one
superseded bounded-repair row. Accepted Qwen calls took approximately 203-473
seconds each. The tasks are synthetic, 30-fps and development-only; there are
no repeated held-out trials, long-form projects, real client footage, production
ProjectService mutation, unrestricted generated code, or multi-reviewer taste
evidence. The result supports keeping Qwen as an asynchronous specialist
candidate, not using this route as the default interactive editor.

### Supplemental connected Luna and Terra disposition - 2026-08-17

The direct Luna and Terra continuations have now also reached an honest bounded
V2-1 disposition. This was a mechanics smoke, not the V2-2 repeated matrix:
each task received one connected attempt with the protocol's single allowed
semantic repair. A transport/schema retry remained part of that same attempt.
No row was repeated until it passed, and no failed Stage-2 or Stage-4 row was
sent to Stage 6.

| Route | Task | Stage 1 | Stage 2 | Stage 3 | Stage 4 | Stage 5 | Stage 6 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Terra | `DEV-01` | `HUMAN_REVIEW_REQUIRED` | `FAIL` | not run | not run | `FAIL` | not run |
| Terra | `DEV-02` | `HUMAN_REVIEW_REQUIRED` | `EXPECTED_CAPABILITY_GAP` | `EXPECTED_CAPABILITY_GAP` | `FAIL` | `FAIL` | not run |
| Terra | `DEV-03` | `HUMAN_REVIEW_REQUIRED` | `FAIL` | not run | not run | `FAIL` | not run |
| Terra | `DEV-04` | `HUMAN_REVIEW_REQUIRED` | `EXPECTED_CAPABILITY_GAP` | `EXPECTED_CAPABILITY_GAP` | `EXPECTED_CAPABILITY_GAP` | `CAPABILITY_GAP` | not run |
| Luna | `DEV-01` | `HUMAN_REVIEW_REQUIRED` | `UNVERIFIABLE` | not run | not run | `UNVERIFIABLE` | not run |
| Luna | `DEV-02` | `HUMAN_REVIEW_REQUIRED` | `FAIL` | not run | not run | `FAIL` | not run |
| Luna | `DEV-03` | `HUMAN_REVIEW_REQUIRED` | `FAIL` | not run | not run | `FAIL` | not run |
| Luna | `DEV-04` | `HUMAN_REVIEW_REQUIRED` | `EXPECTED_CAPABILITY_GAP` | `FAIL` | not run | `FAIL` | not run |

The final failures are specific rather than a generic claim that either model
"cannot edit":

- Terra `DEV-01` never assigned the transcript-moment resolver role required
  to bind the exact silence cut.
- Terra `DEV-02` selected the correct hybrid route and compiled every other
  required semantic proof claim, but its reconstructed target never made
  opposed panel motion independently proof-addressable.
- Terra `DEV-03` repaired the missing timeline-preservation statement but
  still omitted the project-read, timeline-read and proof-read roles required
  by the compiler owner.
- Luna `DEV-01` is not a semantic failure. Its first Stage-2 response was
  schema-invalid and the built-in retry timed out, so the row remains
  `UNVERIFIABLE` under the one-attempt V2-1 rule.
- Luna `DEV-02` repaired source-before-generation ordering but left two native
  continuation candidates, so exact compilation could not select one without
  inventing intent.
- Luna `DEV-03` removed a forbidden cut operation during repair but still
  omitted the proof-read role.
- Luna `DEV-04` chose the correct capability-gap route at Stage 2, then changed
  generated-composition and proof nodes to an invalid Stage-3 status instead
  of preserving the declared missing-capability boundary.

Two harness defects were corrected before these final dispositions were
accepted. First, the current connected Stage-2 visible-output budget was raised
from 4,000 to 8,000 tokens because the budget is cumulative across the one
schema retry; an
individually legal second response was previously rejected only because the
first invalid response had consumed the shared allowance. The other budgets,
retry count and repair count did not change. The already-issued isolated
Stage-2 and Stage-3 experiments remain pinned to their original 4,000- and
2,400-token budgets; fail-closed binders reconstruct their paid-run packet
hashes instead of inheriting current budgets. Second, task-specific compiler
role checks now run at Stage 2, so a model can use its one actionable semantic
repair before an otherwise deterministic Stage-4 rejection. The final frozen
no-provider and mechanics plan hashes are respectively
`6f7c31ae10bd78a8e626e09e75f30320fdc9b524920a3c364bb16bad7e517f8b`
and
`20be5d552ed1ad96bd65d8b08ed57cb0aaa070d2e7999f3e6f1cefd03aed89eb`.

The exact continuation receipts are local, gitignored calibration evidence:

| Route/run | Tasks or purpose | Incremental metered cost | Receipt hash |
| --- | --- | ---: | --- |
| `openai-terra-continuation-20260816231851` | `DEV-02` repaired live lineage | `$0.418682500` | `943a17aa3030a1786979899b0ed763265bf8bed74e17050146f12392c5a6fcd6` |
| `openai-terra-continuation-20260816232246` | `DEV-02` zero-call deterministic replay after proof-policy correction | `$0.000000000` | `a88a43a6721735abfa15f7d168bb9ab343a64be27aa2fa2fee14e15f772944a6` |
| `openai-terra-continuation-20260816232303` | `DEV-01`, `DEV-03`, `DEV-04` diagnostic continuation | `$0.555498750` | `2f0ae50ab0ad5107fcec01e51caecea1cb0cdd540106c090d3b4f36482d013bf` |
| `openai-terra-continuation-20260816233104` | final corrected `DEV-01` and `DEV-03` continuation | `$0.278053875` | `a165b5f7c17a5c1f454de52849dbb978e2f05358d4ebf012170096db736a71aa` |
| `openai-luna-continuation-20260816233253` | four-task diagnostic continuation | `$0.384816500` | `09febb780eb6ef1769f15434f85c1365df7fc3ca155ff7ff054770b350c8cb1e` |
| `openai-luna-continuation-20260816234253` | final corrected `DEV-01` through `DEV-03` continuation | `$0.207497750` | `b4b16eb83369292f3d78473f000c6bb8b50eb4c3da1bb93e7f476d757da7af22` |

Those six runs added `$1.844549375` of metered provider cost. Superseded
diagnostic rows remain listed because deleting their spend or lineage would
make the result look cleaner than the experiment actually was.

The bounded V2-1 decision remains **MODIFY**, not `GO`: the mechanics can
compile and render all three executable synthetic tasks, and Qwen has a
supplemental connected pass for those tasks, but no direct route has yet passed
a fair repeated connected matrix. Qwen's successful route used disclosed
corrective guidance and has multi-minute latency. Luna and Terra did not reach
Stage 6 in the corrected connected run. Therefore none is selected as the
production orchestrator, and no model-driven ProjectService mutation is
authorized. The next model-comparison milestone is a newly frozen V2-2
repeated connected development matrix followed by untouched holdouts and blind
rendered/editor scoring; it must not reuse V2-1 responses as fresh trials.

## Related governing documents

- [Final execution plan](../../EDITRON_FINAL_EXECUTION_PLAN_2026-08-10.md)
- [Open-ended editing research reconciliation](../../EDITRON_OPEN_ENDED_EDITING_RESEARCH_RECONCILIATION_2026-08-12.md)
- [Reference backtracking and GeneratedCompositionProgram](../../EDITRON_REFERENCE_BACKTRACKING_AND_GENERATED_COMPOSITION_PROGRAM_2026-08-11.md)
- [Knowledge source and rights ledger](knowledge-source-rights-ledger-v1.md)
