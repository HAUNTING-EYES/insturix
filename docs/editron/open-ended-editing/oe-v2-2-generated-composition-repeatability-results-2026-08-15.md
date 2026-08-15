# Editron OE V2-2 generated-composition repeatability results

Date: 2026-08-15
Branch: `infrastructure-improvs-+Editron`
Authority: `RESEARCH_ONLY_NO_PROJECT_MUTATION`

## Decision

The corrected DEV-02 repeated-run result is **MODIFY**, not GO and not a
general model NO-GO.

- Luna passed the rendered hard gates in 2 of 3 trials.
- Terra passed the rendered hard gates in 2 of 3 trials.
- Qwen 3.8 Max passed the rendered hard gates in 1 of 3 canonical trials.
- No route passed on every trial.
- No route is promoted to production mutation.

This proves that all three models can sometimes synthesize an executable
bounded generated composition from the frozen contract. It also proves that a
single response plus one repair is not yet reliable enough to select a
production generator.

## Scope boundary

This slice tested only DEV-02: a synthetic six-second, five-panel moving
filmstrip composition with a fixed title, opposed panel motion, stable hold,
centre-panel takeover, and boundary continuity into the following native shot.

It did not test the complete seven-stage V2-2 chain, a full event reel, native
edit planning, hybrid routing, audio/music synchronization, long-form footage,
professional taste, or real ProjectService mutation. Passing DEV-02 therefore
does not mean a model can autonomously edit arbitrary videos.

## Harness corrections applied before the cohort

Two committed corrections preceded these runs:

| Commit | Correction |
| --- | --- |
| `7ca4a78a3` | Derived the sandbox wall/CPU budget from the program, separated timeout, invalid-plan, render, quality, and infrastructure failures, and guaranteed cleanup. |
| `4f0be781c` | Added immutable trial IDs, explicit route selection, per-cohort spend, unique evidence directories, and refusal to overwrite an existing run. |

The corrected direct cohort used:

| Identity | Value |
| --- | --- |
| Plan hash | `bced1fd23b062de679432a9277058f807006b39d4b942dfdf8d410c781fae65e` |
| Frozen initial prompt hash | `458c04cb2e24448708354ec98b304009db6ba2f23fb74ad8c9a5b75e9d124969` |
| Frozen initial packet hash | `08af403ce86e371da3c5d3b9b9885be8986e1ac4d30fb30a682ae2e4cc77077c` |
| API implementation hash | `7da8e6696dcfd90c75bb833010a6ae7b5386b1c9e1d20e198cf604088a35641b` |
| Sandbox app commit | `eb896ffbd8927621a77c4bd4073dad2a1119876d` |
| Sandbox snapshot | `snap_FuRFrHL9WE4IgNXjhWjMxeWZP9mW` |
| Project state effects | `[]` |

## Direct API cohort: Luna and Terra

Each route received three independent initial calls and at most one repair per
trial. Initial calls used the same frozen prompt hash.

| Route | Final hard-gate passes | First-shot passes | Trials using repair | Median initial latency | Median total provider latency per trial | Total provider cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `gpt-5.6-luna` | 2/3 | 0/3 | 3/3 | 19.370 s | 29.880 s | `$0.11173095` |
| `gpt-5.6-terra` | 2/3 | 1/3 | 2/3 | 18.457 s | 36.374 s | `$0.24539925` |

Exact trial outcomes:

| Trial | Luna | Terra | Direct cohort cost |
| --- | --- | --- | ---: |
| `v2-2-dev02-01` | PASS after one repair | FAIL after one repair | `$0.14560225` |
| `v2-2-dev02-02` | PASS after one repair | PASS after one repair | `$0.13943985` |
| `v2-2-dev02-03` | FAIL after one repair | PASS without repair | `$0.07208810` |

Direct receipt bindings:

| Trial | Receipt hash |
| --- | --- |
| `v2-2-dev02-01` | `0010803cd254988a890e82a98300340b365a662cbc4b880a5d330255d87e12ed` |
| `v2-2-dev02-02` | `9e4a506f40925827d927fb617799ae67e2bf0a1e169c7ff4f88bcd6e7551f0df` |
| `v2-2-dev02-03` | `437137dd4c622aa4ec5b59715fe572907261ef2808241096196ed66f75b50b07` |

The three direct receipts are retained at:

```text
.calibration-temp/open-ended-planner-v2/generated-composition-model-benchmark/receipt-v2-2-dev02-01.json
.calibration-temp/open-ended-planner-v2/generated-composition-model-benchmark/receipt-v2-2-dev02-02.json
.calibration-temp/open-ended-planner-v2/generated-composition-model-benchmark/receipt-v2-2-dev02-03.json
```

## Qwen 3.8 Max canonical agent-shell cohort

The available Alibaba `sk-sp` Token Plan credential is licensed for compatible
interactive coding/agent tools rather than direct automated application
backends. Qwen was therefore exercised through a deny-all local OpenCode agent
shell. This is a valid capability diagnostic, but its credit usage is not a
direct USD-cost comparison with Luna/Terra. See Alibaba's
[Token Plan tool guidance](https://www.alibabacloud.com/help/en/model-studio/more-tools)
and [Token Plan FAQ](https://www.alibabacloud.com/help/en/model-studio/token-plan-team-faq).

Every canonical initial Qwen call stored the same 26,142-character prompt and
the same `458c04...` hash as the direct cohort. Each call had tools, network
research, and project mutation denied and received at most one repair.

| Trial | Initial result | Initial latency | Repair latency | Final result | Final failed hard gates |
| --- | --- | ---: | ---: | --- | --- |
| `01` | QUALITY_FAIL | 320.189 s | 378.488 s | PASS | none |
| `02` | RENDER_FAIL | 342.211 s | 138.970 s | FAIL | frame integrity, opposed motion, phase structure |
| `03` | QUALITY_FAIL | 236.215 s | 135.867 s | FAIL | opposed motion |

Qwen therefore produced:

- 1/3 final rendered hard-gate passes;
- 0/3 first-shot passes;
- 3/3 trials requiring the single allowed repair;
- a median 320.189-second initial latency; and
- a median 481.181-second total provider latency per trial.

The successful first trial proves Qwen did not "literally fail at editing."
The repeated result instead shows an unstable generator under this exact
contract and repair budget. The Token Plan route is also too slow for an
interactive edit loop in its present form; it remains plausible for explicit
asynchronous work.

Final Qwen receipt bindings:

| Trial | Initial receipt | Final receipt | Final proof |
| --- | --- | --- | --- |
| `01` | `b2f68be3f1cddac3dfb42da2e5bbe002a580147ca9b3152d256978064d979921` | `0fd67e081674b09a47922b881db46441877c51b34ee13d2d968aeab23798a4a5` | `3771a544f4e79660a39a5468f7fd35fbee5f466a925fe922831b8dc2636b6194` |
| `02` | `eee26156c2c6d1bb279d53cbd4468ecdf74e41d2dc82454da6d01cf49858515e` | `fbabd917a9a2d7b8225774a5ab45f6cb23579e63298f1d5e96b001363cff69e2` | `2d9f7b3b3c713d8430f80b4cdfc89c3a8a6d9b855259e14259e411d676f4c62b` |
| `03` | `b75d7e9a0ed7f2a52354a84c323e0128e3efe44bc9fa75920c7cd6c17a618e98` | `f2c0a9a634465b60fef3884ba9721c2374aa2d5d1505c913ee91382eef555972` | `202454c3d9029ef2787babd81a1c614715f593f2d4d0ea77a928a76c04fed05f` |

All three final Qwen proofs left `FLASH_SAFETY` unverified. Passing the other
hard gates is not approved PSE certification or professional creative review.

## Prompt-integrity rejections

Several attempts were retained for audit but excluded from the cohort:

1. PowerShell parsed and re-serialized the initial packet, changing the frozen
   prompt from 26,142 characters / `458c04...` to 26,247 characters /
   `825e5b...`. Its generated outputs and repairs are rejected.
2. OpenCode's message transport converted literal non-ASCII diagnostic text
   into mojibake. Those sessions were aborted and never scored.
3. For trial 3's real repair, the source JSON hash is
   `d3fa827df0968cc3310a9c055f389eef891174b193565b19b6cff9f8382bb1e3`.
   A deterministic ASCII-escaped JSON wire form has hash
   `0220cdbe543fec4a61b93218dcfa56d7f7ee0d2a3e6d0fe35583d8dee4a80338`.
   Parsing either form produces the same complete repair object, and the stored
   OpenCode user message matches the wire hash exactly.

These rejections are why the report uses "canonical trial 2/3" evidence roots
rather than silently overwriting the earlier directories.

## What the rendered failures teach us

The recurring defect was not JSON syntax. Candidates generally passed the
static program contract. Failures appeared only after execution:

- panels began almost blank or too far off-canvas;
- the centre panel did not move upward by a materially visible amount while
  side panels moved downward;
- build, hold, and release phases were not distinct enough; or
- takeover progress was emitted outside `[0,1]` and crashed rendering.

This supports the planned separation between target reconstruction, graph/code
generation, compilation, sandbox execution, rendered proof, and human review.
A valid source artifact is not a successful edit.

## Promotion and next gate

- Keep Luna, Terra, and Qwen in the challenger cohort.
- Do not select a universal "brain" from DEV-02.
- Do not wire model output to ProjectService mutation.
- Treat Qwen Token Plan as an asynchronous research route until a fair direct
  API route and acceptable latency are available.
- Continue the full seven-stage benchmark with separate scores for target
  reconstruction, native/generated/hybrid routing, evidence binding, exact
  compilation, proceed/stop decisions, proxy execution, and rendered/editor
  outcomes.
- Force native, generated, and hybrid baselines on held-out tasks, including
  filmstrip-as-generated and full-reel-as-hybrid.
- Run model-blind editor review on surviving playable proxies; do not simulate
  a human judgment.

Only evidence across those gates can decide model roles or authorize the later
research-only GeneratedCompositionProgram integration.
