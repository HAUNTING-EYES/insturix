# Editron OE V2 generated-composition model benchmark results

Date: 2026-08-14
Branch: `infrastructure-improvs-+Editron`
Authority: `RESEARCH_ONLY_NO_PROJECT_MUTATION`

## Result in one sentence

Terra and Gemini Flash produced DEV-02 programs that passed the current
objective rendered hard gates and the frame-complete FFmpeg flash-risk screen;
Luna did not pass after the one permitted repair; Qwen 3.8 Max was not part of
this automated condition. No model is promoted because approved PSE QC and
blind creative quality review remain unverified.

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

## Playable survivor replay

Terra and Gemini were replayed from their frozen source artifacts after the
source run. This replay made **zero provider calls** and had **zero project
state effects**. Each candidate ran in the same deny-all Vercel snapshot and
produced a complete, independently probed playable proxy.

| Item                       | Value                                                              |
| -------------------------- | ------------------------------------------------------------------ |
| Replay receipt hash        | `9632f57328ddff75f126f27e0bd8a1efda4e2a2dfb318f83025390bfe4e84320` |
| Worker implementation hash | `7242b1d14363b73676e540a15be8f16a2efa5735d08db3c58f6edc469d218ed7` |
| Runner implementation hash | `941cbdeb66603d99439f3f98207e849b3940367c8826293731dcfabdfb22e2b3` |
| Original public pack       | `e9cf52ce1f1f18eb21dfe0cea1c721bbdfeefed0d45817e5d5332746c576670d` (superseded) |
| Replacement public pack    | `a26cb4799268c2000c74536943d2ae6f4e3e7e7d730f7b4fcb08d2a8fb0a8d67` |
| Replacement receipt        | `907643e326a0d683368452f502eda13c836ea5d2e3a2fc9e573a00e1d36434e3` |
| Provider calls             | `0`                                                                |
| Project state effects      | `[]`                                                               |
| Human review status        | `AWAITING_REAL_HUMAN_REVIEW`                                       |

The receipt and packs are retained under the replay root. Reviewers must use
`blind-review-v2/reviewer/` only and must not access its sibling
`operator-only/` directory or the source benchmark artifacts:

```text
.calibration-temp/open-ended-planner-v2/generated-composition-model-benchmark/playable-replay-7242b1d14363b736/
```

The original public manifest exposed byte-identical source-video SHA values,
which a repository-aware reviewer could correlate with the model rows below.
It is retained for audit but is not a valid blind pack. The replacement uses
freshly randomized aliases and hash-distinct, byte-preserving MP4 review copies;
the source-to-review binding exists only in the operator key. Both replacement
copies independently decoded all 180 frames over six seconds.

| Route              | Sandbox wall time | Rendered hard gates | Remaining technical gap | Playable SHA-256                                                  |
| ------------------ | ----------------: | ------------------- | ----------------------- | ---------------------------------------------------------------- |
| `gpt-5.6-terra`     |         `77.003s` | PASS (7/7)          | approved PSE QC         | `df42fabbeb619472912cccf5d4f4d93c59dc7ee9665df04a50b07d510f490457` |
| `gemini-3.6-flash` |         `84.450s` | PASS (7/7)          | approved PSE QC         | `c28f812835e8d42c03986bb83495110290f4c1d1c8ee4519830221131fb0be80` |

Both proxies independently passed exact MP4/H.264/YUV420P, limited-range
BT.709, silent-audio, 1080x1920 raster, 30/1 constant frame rate, 180 unique
packet timestamps, six-second duration and whole-file SHA-256 checks. Their
rendered checks passed frame integrity, settled five-panel geometry and
gutters, title form, opposed motion, build/hold/release structure, full-canvas
takeover and following-shot boundary continuity.

The later frame-complete screen observed all 180 frames for each proxy with
FFmpeg 8.1's `photosensitivity` heuristic at threshold `1.0`. Terra peaked at
`0.312370`; Gemini peaked at `0.451628`; neither had a threshold-exceedance
frame. The aggregate receipt hash is
`d4476282db1f3a9f44a64195329bbb3cfcbc85666a570d8dafeb3d875338a192`;
Terra's child receipt is `342b9b39e04a37441db50ee533ec6b3f751f13f9038c803a3b6de9c338d4319d`
and Gemini's is `0495b7b98749f00e2d15ad96f62ff5eef8c7eb96b92a8f479f3e88da6f3f2f8d`.
This is a hash-bound preliminary screen, not WCAG/ITU/broadcast certification;
approved PSE QC remains `UNVERIFIABLE`, so technical status is not yet `PASS`.

### Host-budget correction

The source-run programs contained 60-second CPU and 90-second wall ceilings.
Code inspection proved those values came from the host fixture after each model
returned source; the models did not choose them. Real playable rendering took
longer. The replay therefore applied an explicit, hash-bound host-policy
amendment to 120-second CPU and 180-second wall ceilings—the verifier's already
declared maximums. The amendment owner proves that only these two paths changed:

```text
resourceBudget.maxCpuMs
resourceBudget.maxWallTimeMs
```

Every row retains both source and execution program hashes plus its amendment
hash. Any source, geometry, timing, API, evidence, source-range, generator or
other semantic drift fails closed. Terra's amendment hash is
`3ee4a3391e116e205a9fcb21c99f290442ef8cc0c6e65110e01ed883b96b4004`;
Gemini's is
`694a7438ed898ba043ce2dd8387cef2295bbb07b31313d66013575b4e8640104`.

The infrastructure failures encountered before this successful replay are
retained separately and are not scored as model failures: missing explicit
sandbox identity, missing `ffprobe`, unreported/unspecified colour metadata,
an unavailable standalone FFmpeg package, the under-calibrated host budget,
and a Windows local-evidence path that exceeded Sharp/libvips path handling.

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

The later playable replay also passed all seven implemented rendered hard gates.
Its proof hash is
`f17e66736017e95c3883c44614f96bf689768b08976e793b32f780baf23d109b`;
its sandbox host-receipt hash is
`f5da0832ce625fa21cba417405955ee8d36f821d6628324f8eb851a73a32852a`.

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

The later playable replay also passed all seven implemented rendered hard gates.
Its proof hash is
`30e672dac9e30d329c1011394f0d19f7456efb62d86e54df2f9ca18b00bda336`;
its sandbox host-receipt hash is
`3c0dfdbe1a69af020645eddeafe759eac4f5ec1f89077013dd66b16f1968f8d8`.

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

Six stills, a fully packet-scanned playable proxy, and the 180/180-frame
heuristic screen now prove the current layout, motion-direction, phase, title,
takeover, boundary, codec, colour, duration, playback-integrity, and preliminary
flash-risk checks. FFmpeg's heuristic does not issue an approved PSE certificate
and does not promote the result to regulatory safety. Therefore
`technicalDisposition` remains `UNVERIFIABLE`.

No blind editor has reviewed a playable proxy. Therefore
`creativeDisposition` remains `UNVERIFIABLE`.

One synthetic task cannot establish general generation reliability, reference
fidelity, maintainability, or cost across real edit forms. A visually correct
synthetic panel test is not evidence of professional taste.

## Promotion decision and next three gates

- Terra and Gemini Flash advance as challengers to approved PSE QC and blind
  editor review.
- Luna remains in the wider model cohort, but does not advance as a DEV-02
  generated-source winner from this run.
- Qwen remains a promising diagnostic challenger, not a fair current winner.
- No model-driven project mutation is authorised.

The next three gates are:

1. **Approved PSE QC:** the frame-complete FFmpeg heuristic screen is complete
   and hash-bound. Run the same proxies through an approved commercial/broadcast
   PSE workflow without rerunning providers; retain its report and tool identity.
2. **Model-blind editor review:** randomize candidate identity, retain the actual
   playable proxies, and collect human ratings/corrections without simulating a
   reviewer.
3. **Held-out generalization and routing:** run unfamiliar tasks that force
   native, generated, and hybrid baselines; measure target fidelity, defects,
   correction time, editability, round-trip preservation, latency, and cost.

Only after those gates can Editron choose a model for generated-composition
source work. Model roles should remain task-specific: the best target observer
or planner need not be the best code generator or visual judge.
