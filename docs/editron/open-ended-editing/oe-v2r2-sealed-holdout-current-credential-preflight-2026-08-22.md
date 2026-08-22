# Editron V2R2 sealed-holdout current credential preflight — 2026-08-22

## Verdict

`PASS_ZERO_INFERENCE_CURRENT_IDENTITY`.

The credentialed preflight binds the current CAP-2A V4 census and the unspent
V2R2/V2R3 sealed cohort. It proves provider model access, exact initial request
construction and bounded input counting. It made no inference call, read or
mutated no Editron project, persisted no credential and does not authorize paid
dispatch.

## Bound identity

- Runner repair commit: `cc7c471de`
- CAP-2A V4 manifest SHA-256:
  `a24b394b2b69609bbeff4fed2c843cdf5915299f77e9f22720ce69ac721aaf24`
- Sealed cohort manifest SHA-256:
  `5a7ceece49f33378b8f13876e5e386e0ced41f642468d42671a67bcd35bdedaa`
- Local preflight receipt SHA-256:
  `0e2db9be7b77b1932ada24401048e714f0745ec5d2cc6916455d86ce27e83c7d`
- Credential-preflight receipt SHA-256:
  `4f27e3fcc3f990185432eb8ad5c686058f6280898e9d2765770cb281e7d7964e`
- Request-capture-set SHA-256:
  `bef05c653ee048f3ab9ca109e61eb3f22a75e0a103605eb56fe020612055ec11`

The runner and focused test now select the authoritative
`holdout-media-v2r-r4-20260822` materialization. The former `r2` default was
not byte-equivalent and correctly failed with
`HOLDOUT_PREFLIGHT_MEDIA_MANIFEST_DRIFT`; it was repaired before this run.

## Authorized network and request result

- Models: `gpt-5.6-luna`, `gpt-5.6-terra`, `gemini-3.7-flash`
- Cases: 16 opaque cases
- Handoff arms: direct arguments and opaque result references
- Captures: 96/96
- Distinct request hashes: 96/96
- Model-metadata GETs: 3
- Google `countTokens` calls: 32
- Provider-context egress calls: 32
- Inference calls: 0
- Project reads: 0
- Project mutations: 0
- Dispatch authorized: false
- Google credential source: paid Production
  `GOOGLE_GENERATIVE_AI_API_KEY`

The paid Google variable was injected into the child process through Vercel's
Production environment. No temporary secret file was created. Local OpenAI
credentials remained in the ignored local environment. Neither credential
value appears in the receipt or report.

## Input envelope

| Model | Rows | Minimum bounded input | Maximum bounded input |
| --- | ---: | ---: | ---: |
| Luna | 32 | 67,364 | 75,011 |
| Terra | 32 | 67,364 | 75,011 |
| Gemini 3.7 Flash | 32 | 73,028 | 81,467 |

All initial requests remain below the frozen 85,000-token research ceiling.
This is an initial-request bound only. The separate runtime owner must continue
to enforce per-turn, cumulative output and spend limits during a paid episode.

## Reproducible artifacts

Local artifact root:

`.calibration-temp/open-ended-planner-v2/sealed-holdout-credential-preflight-20260822005517`

| File | Bytes | File SHA-256 |
| --- | ---: | --- |
| `credential-preflight.json` | 95,193 | `beeca15951ad0303c1e181b9436b7e22bd7fd371440ad60cf7a4b86c3cab9cf8` |
| `local-preflight.json` | 7,510 | `2b0b93bfd15dbfa813bb4bf42da478f647af4a9e7705012871530e1a9cde959f` |
| `request-captures.json` | 29,027,195 | `132d39b9f379e948c2ca9870a4580132a0206b5a0cff6f054ec9da268550f927` |

## Interpretation and next gate

The receipt's historical schema says
`PASS_INITIAL_REQUESTS_BOUNDED_PROOF_AND_RUNTIME_GUARDS_PENDING`. That phrase
describes the scope of this initial-request preflight; it does not erase the
separate 34/34 scripted accounting/episode/evaluator/proof gate. Neither gate
is model performance evidence.

The next legal step is a separately versioned paid-dispatch authorization
bound to this exact manifest, all selected cases/routes/arms, token and spend
ceilings, expiry and the complete zero-inference gate. Only then may the unseen
provider cohort run. Raw provider execution, valid evaluated evidence and
production certification must remain separate statuses.
