# Editron OE V2 generated-composition model benchmark results

Date: 2026-08-14
Branch: `infrastructure-improvs-+Editron`
Authority: `RESEARCH_ONLY_NO_PROJECT_MUTATION`

## Result in one sentence

Terra and Gemini Flash produced DEV-02 programs that passed the current
objective rendered hard gates; Luna did not pass after the one permitted repair;
Qwen 3.8 Max was not part of this automated condition. No model is promoted to
production because temporal safety and creative quality remain unverified.

## What this condition tested

This condition tested whether a model could write a bounded
`GeneratedCompositionProgramV1` source implementation for the synthetic DEV-02
five-panel moving filmstrip island, using only the frozen generated-composition
API and supplied evidence.

It did **not** test:

- the complete event reel, which remains a hybrid native/generated edit;
- general native-edit orchestration;
- audio or music synchronization;
- broad reference reconstruction;
- professional creative taste;
- production project mutation; or
- generalization beyond DEV-02.

The candidate packet contained the target/evidence/program contract and API
surface. It did not contain the earlier human-authored solution source or its
source hash. All candidates were contract-checked, executed in the deny-all
Vercel sandbox, and assessed from rendered pixels. Each route received at most
one external repair.

## Frozen run identity

| Item                       | Value                                                              |
| -------------------------- | ------------------------------------------------------------------ |
| Harness commit             | `551b29e3e`                                                        |
| Sandbox/runtime commit     | `eb896ffbd8927621a77c4bd4073dad2a1119876d`                         |
| Vercel snapshot            | `snap_FuRFrHL9WE4IgNXjhWjMxeWZP9mW`                                |
| API implementation hash    | `7da8e6696dcfd90c75bb833010a6ae7b5386b1c9e1d20e198cf604088a35641b` |
| Worker implementation hash | `967231f718b2683328345cf53725ba2f236a745cc0f2c16b868b5adabf42a4f5` |
| Initial packet hash        | `d745ee5793efb62cc2e4f74a32d3e7a650a1b61eee35ae958d9a06b95a6b6eba` |
| Plan hash                  | `5ce9a559f33445da3eac5f1f15963d396adae62f68d15da78cd4870b194c5f33` |
| Receipt hash               | `9358395553b123dfbddb7a9086d3eadc01e69eb06ae9a03e27288dea92d1f5bd` |
| Actual provider cost       | `$0.146111625`                                                     |
| Project state effects      | `[]`                                                               |

The atomic receipt is locally retained at:

```text
.calibration-temp/open-ended-planner-v2/generated-composition-model-benchmark/receipt-2026-08-14.json
```

The hash-bound evidence directory is:

```text
.calibration-temp/open-ended-planner-v2/generated-composition-model-benchmark/evidence-5ce9a559f33445da/
```

## Objective outcomes

| Route              | Final outcome             | External repairs | Hard gates | Technical    | Creative     |
| ------------------ | ------------------------- | ---------------: | ---------- | ------------ | ------------ |
| `gpt-5.6-luna`     | `RENDERED_HARD_GATE_FAIL` |                1 | FAIL       | FAIL         | UNVERIFIABLE |
| `gpt-5.6-terra`    | `HARD_GATES_PASS`         |                0 | PASS       | UNVERIFIABLE | UNVERIFIABLE |
| `gemini-3.6-flash` | `HARD_GATES_PASS`         |                1 | PASS       | UNVERIFIABLE | UNVERIFIABLE |

`gemini-3.6-flash` is the correct request model. The provider returned the same
native model identity on both calls, so the earlier concern was not a model-name
error. It is also the identifier in the official
[Gemini model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash).

## Provider-call telemetry

| Route/call     | Input | Visible output | Reasoning |  Total |  Latency |           Cost |
| -------------- | ----: | -------------: | --------: | -----: | -------: | -------------: |
| Luna initial   | 6,904 |            879 |     1,118 |  8,901 | 18.153 s |  `$0.02061125` |
| Luna repair    | 7,813 |            977 |       441 |  9,231 | 10.338 s |  `$0.01827350` |
| Terra initial  | 6,904 |            830 |       914 |  8,648 | 17.510 s | `$0.047733125` |
| Gemini initial | 7,687 |            887 |     4,568 | 13,142 | 29.666 s |  `$0.02622150` |
| Gemini repair  | 8,603 |            842 |     6,310 | 15,755 | 39.563 s |  `$0.03327225` |

## Model-specific findings

### Luna

The initial source passed the static program contract but failed during render.
A byte-identical local worker replay reproduced the exact defect:

```text
Generated composition takeoverProgress is outside [0,1]: -4.264705882352941
```

The repair clamped that value and rendered, but the rendered hard gates still
failed:

- `FRAME_INTEGRITY`: frame 0 had a non-black ratio of about `0.01278`, below
  the required materially-rendered threshold;
- `OPPOSED_PANEL_MOTION`: centre occupancy rose only about `5.25 px`, while the
  side columns moved about `737.04 px`; and
- `PHASE_STRUCTURE`: the rendered sequence did not show the required build,
  stable hold, and release structure.

Final proof hash:
`e3c1254b05f83f9e4eb19df0ed32fc01442eb8b6464b30c018488e9081317b39`.

This is a DEV-02 generated-source failure, not evidence that Luna is unusable
for target reconstruction, planning, or other roles.

### Terra

Terra passed the static contract and all current rendered hard gates without a
repair. Its final proof hash is
`54997d966d015747a238b425d74ef615b78c0ed1659d1ad983548a142e3ef0aa`;
the sandbox host-receipt hash is
`ded1e3697154a4ba4bcca2b7af1f9465dfd0743f9e007a0dd687cda28a14e2b3`.

This is an objective DEV-02 pass only. It is not yet a creative or production
promotion.

### Gemini Flash

The initial source passed the static contract. The original sandbox attempt
failed, but the original runner did not persist the caught diagnostic. That
exact historical message cannot be recovered honestly.

A byte-identical local worker replay rendered the initial candidate and showed
that it still failed `PHASE_STRUCTURE`; its other current hard gates passed.
Therefore the first candidate was not a hidden full pass, even though the
original sandbox failure itself was transient or host-specific and is no longer
reproducible.

After one repair, Gemini passed all current rendered hard gates. Its final proof
hash is
`e84eec5a1ac3b76d68bd0d62b4828fe5296656984e48bea54f16cf4a184e6311`;
the sandbox host-receipt hash is
`4a075ebc2635adedbe872c4787de97b238e6c4036d86a44dc87930c7279a8a0f`.

### Qwen 3.8 Max

Qwen retains its earlier status:

```text
QWEN DIAGNOSTIC PASS — FAIR CROSS-MODEL AND STAGE-2/COMPILATION PROMOTION UNVERIFIED
```

It previously detected the five panels, gutters, title, opposed motion, hold,
and takeover from ordered images. That was a real diagnostic pass, but the
condition used different provider-visible evidence and was not this source-code
benchmark.

The available `sk-sp-` Token Plan credential was not used here because Alibaba's
[Token Plan terms](https://www.alibabacloud.com/help/en/model-studio/more-tools)
permit compatible interactive coding/agent tools but prohibit direct automated
scripts and application backends. A fair automated Qwen row requires a
pay-as-you-go/API credential and the exact same frozen condition; an interactive
agent-shell run would add different context and would not be a fair cost or
quality comparison.

## Evidence-retention defect and correction

The original runner persisted successful provider calls, candidates, receipts,
and rendered proofs, but it did not persist:

- the exact provider packet sent for each external repair; or
- the caught sandbox diagnostic that triggered a repair.

That is why Gemini's original sandbox error cannot be reconstructed. The
follow-up correction now:

1. persists every `provider-packet-<ordinal>.json` before the call;
2. writes the hash-bound sandbox request summary before execution;
3. persists a `GeneratedCompositionAssessmentFailureV1` for contract, sandbox,
   or rendered-hard-gate failures;
4. binds each packet into the final call ledger; and
5. records the runner implementation hash in future receipts.

The failure artifact rejects malformed identities/timestamps, empty or excessive
diagnostic sets, and oversized diagnostics. It always declares zero project
state effects.

## Why the two objective passes are still not promotions

Six stills can prove the current layout, motion-direction, phase, title,
takeover, and boundary checks. They cannot prove flash frequency across every
frame. Therefore `technicalDisposition` remains `UNVERIFIABLE`.

No blind editor has reviewed a playable proxy. Therefore
`creativeDisposition` remains `UNVERIFIABLE`.

One synthetic task cannot establish general generation reliability, reference
fidelity, maintainability, or cost across real edit forms. A visually correct
synthetic panel test is not evidence of professional taste.

## Promotion decision and next three gates

- Terra and Gemini Flash advance as challengers to dense temporal proof and
  blind editor review.
- Luna remains in the wider model cohort, but does not advance as a DEV-02
  generated-source winner from this run.
- Qwen remains a promising diagnostic challenger, not a fair current winner.
- No model-driven project mutation is authorised.

The next three gates are:

1. **Dense temporal proof:** render a playable proxy or sufficiently dense
   frame stream from each surviving candidate, then certify flash safety,
   timing continuity, playback integrity, and audio absence/presence explicitly.
2. **Model-blind editor review:** randomize candidate identity, retain the actual
   playable proxies, and collect human ratings/corrections without simulating a
   reviewer.
3. **Held-out generalization and routing:** run unfamiliar tasks that force
   native, generated, and hybrid baselines; measure target fidelity, defects,
   correction time, editability, round-trip preservation, latency, and cost.

Only after those gates can Editron choose a model for generated-composition
source work. Model roles should remain task-specific: the best target observer
or planner need not be the best code generator or visual judge.
