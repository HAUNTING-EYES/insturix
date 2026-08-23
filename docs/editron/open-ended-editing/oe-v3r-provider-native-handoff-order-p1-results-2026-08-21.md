# Provider-native handoff-order V3R-2 paid P1 results

Date: 2026-08-21

Status: `MODIFY_AND_PROCEED_RESEARCH`

This record covers the first paid presentation permutation (`P1`) of the
repaired V3R-2 causal-order experiment. It does not replace the immutable run
receipt and does not promote any research adapter into a production writer.

## Immutable run identity

- Experiment version: `EDITRON_PROVIDER_NATIVE_HANDOFF_ORDER_EXPERIMENT_V3R_2`
- Manifest SHA-256: `b9a4284b1c609472e91ca08ab21710b42da5be1a2f231541cec35c8f0033fcb3`
- Visibility receipt SHA-256: `78fc0fd26728b28a14d5b1a565fb3c1d812bd5b2cff708dae05ffe0332c8f711`
- Preflight receipt SHA-256: `6050ef53edc3d33070af8b04978e3c5c922abc23ab6d513bec51ecc76d251814`
- Experiment receipt SHA-256: `c55b34ea6ccea07e8d69037f2a737e7171649212d5d86a07393b79f4d14e0104`
- Routes: `gpt-5.6-luna`, `gpt-5.6-terra`, `gemini-3.7-flash`
- Arms: direct arguments and opaque result references
- Presentation permutation: `P1`
- Rows: six; one row per route/arm
- Paid-call ceiling for this six-row phase: `$7.042253`
- Project authority: `RESEARCH_ONLY_NO_PROJECT_MUTATION`

The canonical receipt is stored under the gitignored calibration root:

```text
.calibration-temp/open-ended-planner-v2/
  provider-native-handoff-order-v3-run-20260821131713/
  experiment/experiment-receipt.json
```

## What was actually tested

The model had to execute this creative causal subsequence:

```text
find_audio_moment
  -> sync_cuts_to_beats
  -> apply_camera_shake
```

It then called `finish_editron_research_episode`, which is an explicit terminal
disposition rather than an editing operation. Therefore a normal successful
episode used four provider turns: three Editron tool calls and one completion
call. Terra's opaque row made one additional, permitted `read_project_file`
call before applying shake.

There was no task-specific compiler inventing this sequence after the model
responded. The model selected and invoked the exposed research operations. The
isolated executor checked prerequisites, resolved an authorized opaque result
reference when supplied, rejected unsafe calls, and produced system-owned
render proof. It could not add an unrequested creative mutation.

## Results

| Model / arm | First relevant choice | Eventual causal execution | Result handoff | Rendered product | Real-project mutation | Provider turns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Luna / direct | PASS | PASS | PASS | PASS | 0 | 4 |
| Luna / opaque | PASS | PASS | PASS | PASS | 0 | 4 |
| Terra / direct | PASS | PASS | PASS | PASS | 0 | 4 |
| Terra / opaque | PASS | PASS | PASS | PASS | 0 | 5 |
| Gemini 3.7 / direct | PASS | PASS | PASS | PASS | 0 | 4 |
| Gemini 3.7 / opaque | PASS | PASS | PASS | PASS | 0 | 4 |
| **Total** | **6/6** | **6/6** | **6/6** | **6/6** | **0/6** | — |

No row attempted the dependent mutation prematurely. There were no provider,
render or harness infrastructure failures.

## Opaque result-reference finding

All three models used the intended mechanical bindings in the opaque arm:

```text
beatPlan   <- find_audio_moment.result
overlayId  <- sync_cuts_to_beats.result.finalHitOverlayId
targetFrame <- sync_cuts_to_beats.result.finalStrongPeakFrame
```

This proves that the V2R-2 opaque-reference mechanism can carry typed prior
results through this bounded real provider episode without retyping the beat
plan, final overlay identity or final frame. It does not yet prove superiority:
both arms passed, and the opaque arm used slightly more tokens and estimated
cost in this single permutation.

## Usage and estimated spend

The estimates below apply the manifest's frozen price snapshot to receipt
telemetry. They are not provider invoices.

| Row | Estimated USD |
| --- | ---: |
| Luna / direct | 0.004582 |
| Luna / opaque | 0.004890 |
| Terra / direct | 0.045083 |
| Terra / opaque | 0.051868 |
| Gemini 3.7 / direct | 0.048712 |
| Gemini 3.7 / opaque | 0.052064 |
| **Total** | **0.207200** |

OpenAI cache-write, cached-read, uncached-input and output categories were
priced separately. Gemini visible output and thought tokens were charged at
the frozen output rate. All credential-prefix scans were empty and every
transport receipt records `secretsPersisted: false`.

## Rendered proof

Every row produced a real H.264/AAC research proxy through the production
editor renderer boundary:

- 320x180, `30/1`, 600 decoded frames;
- measured montage boundaries at frames 119, 239 and 479;
- shake visible at frame 480 and neutral again at frame 490;
- protected audio range 250–350 preserved against the accepted baseline;
- zero browser errors;
- one proof attempt per row;
- identical MP4 SHA-256 across all six rows:
  `37a43379f675797ed04c6a0aef5f301ced62928c0bf79b02f8e6b9bffabaf396`;
- identical rendered-audio SHA-256 across all six rows:
  `2b96d7bb27ac0af63da4c7f48a2d3003ffc6fd67f940105978710ccc681a4916`.

Focused V3R-2/result-reference tests passed 10/10. Repository type-check passed
with the established 8 GB Node heap allowance, and repository ESLint passed.

## Honest interpretation

This is positive evidence for the narrow agentic-editing bet: three provider
routes independently selected the first relevant operation, carried real tool
results forward, completed the causal edit and stopped at `READY_FOR_PROOF`
instead of falsely claiming that they had inspected the render themselves.

It is not production `GO` because:

- only one of three frozen tool-presentation permutations has run;
- the episode exposes a small relevant tool set, not the complete CAP-2A or
  Adobe-class destination;
- the DEV-03 audio fixture is synthetic tonal evidence, not intelligible
  dialogue;
- this one dependency shape does not test other edit-order relationships;
- execution is an isolated clone, not a real ProjectService proposal;
- open-ended holdouts, routing, conflict/rebase, context-resume, long-form and
  final blind quality/correction-time evidence remain.

## Next bounded evidence

1. Preserve this receipt and evaluator identity unchanged.
2. Run the remaining `P2` and `P3` rows: twelve paid rows total.
3. Compare first-choice, handoff, render, latency and cost across all three
   deterministic presentation orders.
4. Then move to genuinely different unseen dependency cases rather than
   repeating only beat-sync plus shake.
