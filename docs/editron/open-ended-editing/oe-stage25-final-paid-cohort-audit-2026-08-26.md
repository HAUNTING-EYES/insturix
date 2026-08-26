# Stage 2.5 final paid cohort audit — 2026-08-26

## Outcome

The authorized 24-row cohort completed once with no automatic transport retry.
It cost `$1.022770625`, below the authorized `$5.8056704` ceiling. The raw run
is preserved unchanged, but its `8 FAIL_MODEL_OR_TASK` headline is not a fair
model-failure count.

The audited classification is:

| Class | Rows | Meaning |
| --- | ---: | --- |
| Valid structural pass | 7 | Contract-valid research plan; not rendered or product proof |
| Valid owner-supported safe stop | 9 | Correctly refused because the task-bound route owner/fixture is absent |
| Genuine model/task failure | 2 | Required preservation evidence was not established before mutation |
| Confounded | 5 | Public precedence fields were ambiguous and interpreted backwards |
| Provider/resource non-evaluation | 1 | Internal thinking-token policy stopped acceptance before scoring |

No model ranking, product-execution claim, rendered-quality claim, or paid rerun
is authorized from this result.

## Immutable run binding

| Item | Value |
| --- | --- |
| Execution | `stage25-final-paid-4438d1a41-v1` |
| Source commit | `4438d1a41d7555f760f894da815721ac3515c267` |
| Authorization | `f9f20c74c19f6ef306bcf884028cdc36428313b1f5b2d7b99250fb6e6044f5b2` |
| Cohort receipt | `d773ba2ec608fa74f2dce017a46eef895fff5e97d86099f36ec502624185c331` |
| Calls | `32` dispatches / `32` observed responses |
| Spend | `1,022,770,625` nano-USD |
| Project reads / mutations | `0 / 0` |

The machine-readable reconciliation is
`lib/editron/research/open-ended-planner/stage25-final-generalisation-paid-audit-v1.ts`.

## Confirmed harness defects

### Ambiguous precedence contract

The frozen policy stored dependency edges as `{ before, after }`. Canonical JSON
sorted those keys into `after` then `before`, and the prompt never said which
field is the predecessor. Luna reversed all four dependency tasks and Terra
reversed DEP-03. Their own summaries name the inverted constraints. Those five
rows are confounded, not model failures.

The replacement contract must use unambiguous field names such as
`predecessorOperatorId` and `successorOperatorId`, publish their semantics, and
reissue the cohort identity before another paid call.

### Gemini resource/accounting classification

Gemini DEP-03 returned `1,908` response tokens and `7,312` thinking tokens on
its correction. Google reports and bills these separately. The original guard
combined both under the benchmark's `8,192` generated-token policy, then the
scorecard incorrectly treated the resulting resource terminal as an evaluated
model failure.

The persisted correction submission independently passes the structural
evaluator, receipt
`4f1b4e7bccbea47ffb7aa30a0c7cb8e5907378506695895af194726655a49701`.
That is counterfactual evidence only; it receives no credit in the authorized
cohort. Before another run, response-token and billable-thinking budgets must be
separate and the preflight must reserve the provider's documented generated
token ceiling.

## Genuine failures

- `HOLD-DEP-01:GOOGLE_FLASH` omitted `EV-D01-PRESERVE` from every pre-writer
  evidence path.
- `HOLD-DEP-04:OPENAI_TERRA` placed `EV-D04-AUDIO` only on mutation nodes, so
  it was not established before the destructive cuts.

## Route result ceiling

RHC-01 produced three structurally legal route choices: Luna and Terra selected
generated composition; Gemini selected native. The evaluator deliberately
allowed all three because all were marked research-preview available. This does
not decide which route produces the best video.

RHC-02 through RHC-04 all stopped because every route is still marked
`OWNER_OR_FIXTURE_GAP`. These are valid safety results, not editing successes.
The next route gate still needs bounded native, generated, and hybrid candidates,
rendered comparisons, and blind editor review.

## Required correction before any new paid cohort

1. Reissue unambiguous precedence semantics and cohort identity.
2. Classify provider/resource terminals as non-evaluations even when a response
   and syntactic evaluation artifact exist.
3. Separate visible response-token limits from provider thinking-token and
   billable generated-token bounds.
4. Recalculate the source-bound worst-case spend from the model metadata output
   limit, then obtain a new explicit authorization.
5. Run all sentinels and the full zero-inference preflight before requesting any
   new paid calls.

