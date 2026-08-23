# Editron V2R DEV-03 form-owner requalification

**Status:** `MODIFY_AND_PROCEED_RESEARCH`; not production approval
**Date:** 2026-08-20
**Authority:** research-only isolated execution; no ProjectService mutation
**Operator catalog:** `EDITRON_OPERATOR_SPECS_V2R_8`
**Cohort manifest:** `EDITRON_PROVIDER_NATIVE_COHORT_MANIFEST_V2R_8`
**Manifest SHA-256:** `ce26f036c82dbca5dd0800fcee5d7de060cde661a5fa259130de5a9dafa54091`
**No-spend preflight SHA-256:** `857ddef8b974d3283258be597455b16285e2ca7b132a68b714e7b64cdf01b7b7`
**Cohort receipt SHA-256:** `5041f67d96694f24b5edc50e47e499c814003525b4ddacc1e83a1eccefb41313`

## Why this rerun exists

V27 exposed a contract defect in DEV-03: the model chose raw camera-shake
intensity and duration even though the existing visual form owner should own
those concrete render parameters. The correction keeps the model responsible
for choosing the operation and semantic intent, while
`applyCameraShakeToProject` deterministically resolves one of:

- `subtle-impact`;
- `restrained-impact`;
- `pronounced-impact`.

Raw intensity, raw duration and destructive position-keyframe replacement are
not provider-selectable fields in this arm. Manual explicit values remain
available outside the provider-native semantic contract.

## Gemini infrastructure correction

The earlier Gemini rows did not test editing. Google rejected them before model
execution with HTTP 429 against the free-tier `GEMINI_API_KEY`.

The linked Vercel project contains three production Google credentials. The
production `GEMINI_API_KEY` is the same quota-limited value as the local key;
the production `GOOGLE_GENERATIVE_AI_API_KEY` is distinct and accepted a real
Gemini 3.7 Flash Interactions request with HTTP 200. This rerun injected that
credential into the benchmark process only. The secret was not printed,
persisted in a new repository file or copied into `.env.local`.

The current runner loads `.env.local` before `.env.local.vercel` with
`override: false` and selects `GEMINI_API_KEY` before `GOOGLE_API_KEY`. A later
harness slice should make the selected Google credential explicit rather than
depending on process-level override.

## Frozen rerun scope

Only `DEV-03:BASELINE` ran, with three independent repetitions per route:

- GPT-5.6 Luna;
- GPT-5.6 Terra;
- Gemini 3.7 Flash.

No other DEV case was dispatched. The selected nine-episode worst-case ceiling
from the frozen per-turn budgets is `$10.563379`. The runner displayed the
full 54-row manifest ceiling of `$65.140838` because its confirmation view is
not filter-aware; that is a harness usability defect, not the dispatched
scope. Receipt usage against frozen pricing estimates actual model spend at
approximately `$0.327913`:

| Route | Estimated receipt-priced spend |
| --- | ---: |
| GPT-5.6 Luna | `$0.012525` |
| GPT-5.6 Terra | `$0.135258` |
| Gemini 3.7 Flash | `$0.180129` |

## Results

| Route | PASS | UNVERIFIABLE | Provider/harness errors |
| --- | ---: | ---: | ---: |
| GPT-5.6 Luna | **2/3** | 1/3 | 0 |
| GPT-5.6 Terra | **3/3** | 0/3 | 0 |
| Gemini 3.7 Flash | **2/3** | 1/3 | 0 |
| **Combined** | **7/9** | **2/9** | **0** |

Every provider call returned HTTP 200 and the expected provider-native model
identity. Every accepted model plan selected `restrained-impact`. The existing
form owner resolved the concrete shake, and the isolated executor proved:

- state and reload-equivalent state: `PASS`;
- rendered cut boundaries: `PASS`;
- visible active shake plus neutral return: `PASS`;
- protected audio preservation and no clipping: `PASS`;
- real-project mutation: `NONE`.

The render proof used the real Editron Remotion root and produced a 600-frame,
320x180, 30/1 H.264/AAC proxy plus frame and WAV evidence. This is a bounded
research proxy, not system-wide frame-rate or delivery certification.

## Exact misses

### Luna repetition 3

Luna first attempted beat sync before obtaining the causal
`find_audio_moment` result. The typed tool failure changed no state. Luna then
resolved the correct measured beat plan, but copied its 64-character evidence
receipt hash into a different 63-character value on the retry. The operator
schema rejected the malformed binding before execution. Luna returned
`UNVERIFIABLE` instead of inventing evidence or claiming success.

This is a genuine exact-data/tool-orchestration miss. A production agent should
also be tested with opaque result references so mechanical handoff does not
require lossy retyping of long hashes; that arm must remain separate from the
direct contract-obedience score.

### Gemini repetition 3

Gemini also attempted beat sync before resolving the causal audio result. It
then called `find_audio_moment` with query `spoken sentence` over both
`dev03-beats` and `dev03-cards`, rather than resolving measured beat peaks from
the beat asset. The audio owner returned
`DEV03_STAGE6_AUDIO_OWNER_DID_NOT_RESOLVE_BOUND_PEAKS`. Gemini stopped as
`UNVERIFIABLE`; no mutation or render ran.

This is a genuine evidence-retrieval and operation-order miss, not a quota,
transport, schema or render failure.

## Evidence roots

```text
.calibration-temp/open-ended-planner-v2/
  provider-native-v27-preflight-20260820102708/
  provider-native-v27-run-20260820102832/
```

The run root retains all nine raw provider envelopes, tool calls and results,
isolated-state traces, render artifacts, proof receipts and the cohort receipt.
No secret value is present in those receipts.

## Decision and next gates

The semantic form-owner correction worked: the earlier invisible/arbitrary
raw-shake failure mode disappeared, and Terra reached 3/3. The broader bet is
supported in this bounded task because all three models produced complete,
render-proven native edits in at least two independent repetitions.

It is not a production `GO`. Two of nine episodes still failed before
execution because of model-controlled causal/data handoff. The next gates are:

1. add held-out raw-reference reconstruction and operation-order episodes;
2. compare direct argument handoff with a typed opaque-result-reference arm;
3. make provider credential selection and filtered spend confirmation explicit;
4. retain blind editor quality and correction-time review;
5. only after those gates, design the ProjectService-owned proposal, range
   conflict/rebase and IF1 receipt path.

The research executor remains isolated and must not become a second project or
timeline authority.
