# OE-1 development benchmark results

- Status: **historical OE-1 screen complete; OE-2A verifier complete; fair contract-corrected rerun pending**
- Recorded: 2026-08-12
- Branch: `infrastructure-improvs-+Editron`
- Implementation commit: `ea9156a2b027f040841353d45577059260d11732`
- Authority: `RESEARCH_ONLY_NO_PROJECT_MUTATION`

## Outcome in plain language

The first affordable-model test produced two credible candidates for the next
stage: **Gemini 3.5 Flash-Lite** and **GPT-5.6 Luna**. Both returned a
schema-valid, envelope-bound response in all 63 development trials. Flash-Lite
was materially cheaper and had tighter measured latency; Luna produced more
non-empty proposals on the difficult reference reconstruction and noisy-input
cases.

**DeepSeek-V4-Flash-0731** showed strong task-specific promise, especially on
the audio/timing task and the missing-capability case, but only 42 of 63
responses parsed as envelope-bound graphs. It is therefore an OE-2 specialist
or comparison arm, not the lead orchestrator from this result.

**GPT-5.6 Terra** returned valid envelopes reliably but declined or clarified
far more often than the other fully run candidates. **Gemini 3.6 Flash** is
unranked because provider quota/rate limits prevented a comparable run.

This is not a production model selection. OE-1 checked transport, JSON shape,
envelope binding, rough operator coverage, cost, and latency. It did **not**
verify graph semantics, port compatibility, renderability, preservation,
editorial quality, or truthful proof.

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
outputs are not rewritten or rescored as if they had seen this new contract; a
new fair development run is required.

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

## Aggregate results

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

### OE-2A verifier addendum

The first strict pass over the historical model outputs accepted every explicit
`DEV-04` capability-gap response—18 per fully bound route—but accepted **zero
executable `DEV-01` through `DEV-03` graphs**. The raw failures included both
the contract ambiguities corrected above and genuine candidate defects such as
invented or incompatible ports, unbound evidence, wrong ranges, missing task
operations, missing preservation claims, and unsafe or unordered mutations.

This finding supersedes any interpretation that OE-1 established executable
graph validity. It does not by itself prove the models cannot construct valid
graphs, because they did not receive the clarified packet. The next authorized
research action is a development-only rerun of Luna, Flash-Lite, and the
DeepSeek specialist arm against exact packet `1.0.4`, followed by the same
independent verifier. Holdouts and proxy rendering remain locked until at least
one executable development graph passes without hidden repair.

## What happens next: OE-2

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

## Related governing documents

- [Final execution plan](../../EDITRON_FINAL_EXECUTION_PLAN_2026-08-10.md)
- [Open-ended editing research reconciliation](../../EDITRON_OPEN_ENDED_EDITING_RESEARCH_RECONCILIATION_2026-08-12.md)
- [Reference backtracking and GeneratedCompositionProgram](../../EDITRON_REFERENCE_BACKTRACKING_AND_GENERATED_COMPOSITION_PROGRAM_2026-08-11.md)
- [Knowledge source and rights ledger](knowledge-source-rights-ledger-v1.md)
