# Provider-native causal-order V2 production-key rerun

Date: 2026-08-21

Status: `MODIFY_AND_PROCEED_RESEARCH`

This record interprets the immutable V2 run without rewriting its receipt or
turning infrastructure, first-attempt, recovery and rendered-product outcomes
into one ambiguous score.

## Run identity

- Manifest SHA-256: `97665ffb57373c1da0a49f91513edbd1a0e6128b97c9e3744916420ab80c9bf3`
- Experiment receipt SHA-256: `12eea3b12ec529dafe22468fa3e67e3fdd9b0c4fee89e09b39d4e3a018489b5a`
- Routes: `gpt-5.6-luna`, `gpt-5.6-terra`, `gemini-3.7-flash`
- Arms: direct arguments and opaque result references
- Repetitions: three per route/arm, eighteen rows total
- Environment: Vercel Production variables
- Provider inference: enabled for this bounded run
- Project mutation: none; all execution used isolated research clones

The Production Gemini credential completed model metadata, token counting and
real interaction calls. The earlier immediate all-row 429 condition therefore
does not recur under the scoped Production environment.

## What the experiment asked

The episode had to align three montage boundaries to measured audio peaks and
apply a restrained shake at the final aligned hit. The five eligible Editron
operations were deliberately presented in a non-causal order:

1. `sync_cuts_to_beats`
2. `apply_camera_shake`
3. `get_timeline_view`
4. `find_audio_moment`
5. `read_project_file`

The evaluator's required creative causal subsequence was:

```text
find_audio_moment
  -> sync_cuts_to_beats
  -> apply_camera_shake
```

The isolated executor rejected dependent mutations until the required prior
tool output existed. A rejected call never mutated project state.

## Raw and decomposed results

The evaluator's strict aggregate is `0 PASS / 18 FAIL`, because every row
attempted `sync_cuts_to_beats` before a successful `find_audio_moment`. That is
the correct answer to the narrow question, "Did the first attempted dependent
mutation already have perfect causal order?"

It is not the answer to the broader question, "Could the agent safely recover
and produce the requested rendered edit?"

| Model / arm | First-attempt causal order | Eventual causal execution | Result handoff | Rendered product | No real-project mutation |
| --- | ---: | ---: | ---: | ---: | ---: |
| Luna / direct | 0/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| Luna / opaque | 0/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| Terra / direct | 0/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| Terra / opaque | 0/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| Gemini 3.7 / direct | 0/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| Gemini 3.7 / opaque | 0/3 | 2/3 | 2/3 | 2/3 | 3/3 |
| **Total** | **0/18** | **17/18** | **17/18** | **17/18** | **18/18** |

This proves that the isolated safety loop can reject premature mutations and
that the three providers can usually use the diagnostic to recover. It does
not prove that their first operation choice is reliable.

## The one terminal recovery miss

`google_flash-opaque_result_references-r2` first attempted beat synchronization
before resolving audio. It then queried `find_audio_moment` for the protected
"spoken sentence" rather than for the strongest beats, repeated the wrong
semantic search once, and honestly finished `UNVERIFIABLE`. It did not mutate
the project. This is a genuine operation-selection/recovery miss in that row,
not a provider outage or render-network failure.

## Benchmark confound discovered

The model-visible context already contained the exact measured beat fields:

- strong peak frames `[119, 239, 359, 479]`;
- final peak frame `479`;
- measured-evidence receipt hash;
- overlay identities and beat-sync constraints.

At the same time, the isolated executor required a fresh
`find_audio_moment.result` before accepting `sync_cuts_to_beats`. Therefore the
packet told the model enough to construct the mutation directly while the
hidden causal policy still demanded a resolver call. The deliberately ordered
tool list also placed the mutation first.

Consequences:

- `0/18` cannot be interpreted as evidence that none of the models understands
  editing order;
- `17/18` cannot be interpreted as production readiness because every row
  received a diagnostic correction opportunity on one synthetic task;
- first-attempt and safe-recovery rates must remain separate metrics;
- this exact condition must not be rerun for model ranking until the evidence
  visibility contradiction is removed.

## Required benchmark repair

For every dependency under test, choose one honest contract:

1. **Evidence already resolved:** expose the versioned result/reference and
   allow the dependent operation to consume it directly; do not require a
   redundant resolver call.
2. **Resolver handoff under test:** expose only evidence availability and its
   identity to the model. Keep dense owner evidence private to the resolver,
   whose output supplies the exact value or opaque reference needed downstream.

The repaired test must also:

- bind model-visible evidence separately from owner-private evidence;
- make causal prerequisites explicit in the operation record, not in a hidden
  evaluator-only rule;
- permute tool presentation order across held-out runs;
- score first-choice correctness, safe rejection, recovery, handoff, rendered
  proof, latency and cost independently;
- retain the fail-closed isolated executor and immutable receipts;
- add genuinely different ordering cases rather than repeating only beat-sync
  plus shake.

## CAP-2A relationship

CAP-2A is the versioned operation manual supplied to the planner. Its forty
current research records explain each mapped operation's identifier, owner,
inputs, outputs, support state, effects, proof and failure behavior. It neither
implements missing operations nor certifies that those implementations are
production-ready. The forty-record scope is the audited benchmark surface, not
the complete Editron or Adobe-class destination.

The V2 current-truth reissue exists because an implementation owner changed.
Instead of silently trusting or rewriting the old manual, Editron issued a new
source-bound version and preserved the historical one. The 46 focused tests
prove that this dossier is internally consistent with its audited sources; they
do not prove forty high-quality editing capabilities.

## Verdict

The narrow agent-loop bet remains promising: all three providers entered real
typed tool episodes, safe rejection prevented premature mutation, and 17/18
episodes produced passing bounded renders. The current experiment does not
authorise a production planner. The next valid step is to repair the evidence
visibility/causal contract, freeze held-out ordering tasks, and rerun without
letting either the prompt or evaluator contradict the executable policy.
