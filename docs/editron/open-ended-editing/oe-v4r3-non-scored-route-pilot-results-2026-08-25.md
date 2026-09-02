# V4R3 one-row-per-healthy-route non-scored pilot

**Status:** closed and independently audited

**Execution:** 2026-08-24T18:20:51Z

**Authority:** `CONFIRM V4R3 ONE NON-SCORED PILOT PER HEALTHY ROUTE MAX $3.000000 NO RETRY`

**Interpretation ceiling:** valid route/transport/safety evidence only; no model
quality score, reliability estimate, production routing or scored-cohort
authority

## Outcome

The live route-health gate found Luna and Terra healthy. Gemini 3.7 Flash's
metadata request returned HTTP 400, so that route was unavailable and received
zero inference calls. The operator then made exactly one provider call on each
healthy route. Both responses ended as `CAPABILITY_GAP`, selected no operation
and caused no project read, project mutation or media write.

| Route | Health | Inference calls | Terminal | Selected operations | Accounted cost |
| --- | --- | ---: | --- | ---: | ---: |
| `OPENAI_LUNA` / `gpt-5.6-luna` | confirmed | 1 | `CAPABILITY_GAP` | 0 | USD 0.014151650 |
| `OPENAI_TERRA` / `gpt-5.6-terra` | confirmed | 1 | `CAPABILITY_GAP` | 0 | USD 0.151538000 |
| `GOOGLE_FLASH` / `gemini-3.7-flash` | HTTP 400, unavailable provider response | 0 | provider-infrastructure non-evaluation | 0 | USD 0 |

Total receipt-accounted cost is USD **0.165689650**. This is provider-reported
usage multiplied by the frozen route price, not a provider invoice. The
micro-USD receipt ceiling is USD 0.165690. Both totals are below the approved
USD 3.000000 hard cap.

The control asked for a selective black-and-white treatment that preserves a
moving runner, including hair and arms, in colour. Luna and Terra independently
reported that the eligible catalog has whole-overlay filtering but no eligible
temporally tracked subject matte/rotoscoping operation. This is the expected
kind of honest stop for the control, but the row is intentionally non-scored:
it cannot rank the routes or prove editing quality.

## Usage and immutable bindings

| Route | Input | Cache write | Output | Reasoning | Request SHA-256 | Response SHA-256 |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Luna | 53,948 | 53,945 | 554 | 391 | `2df445a3a1fd17832703e1bdb7c200d59ae9fac60c8e86a883225980bf57c989` | `13f76517b9e20362054229fc375af2d5fcb52381ef6384d0c0ed2f7444265ece` |
| Terra | 59,483 | 59,480 | 236 | 71 | `66f40b7be90e60c3a546a9f7de73e623867be05701daeafb7187546f9bbcc14c` | `a5d88432d99130f703a42aa9c1a5c3481d294ab39b0a2242c74a76c3bd053667` |

- Execution Git HEAD: `3b4c682ac3bce2be978982de7afe864c4f1c0dcd`
- Manifest: `0e1e6d91558337705641ade611ddf94a22e152dde0a13bbe3213d4e48196e278`
- Readiness: `ba70d5b4a84a7161633158fcebd65ccfa416da8602133ad33cc799218d54690f`
- Route health: `61f9286a1fccee271011ae8b5dec7dc2386d5a6244987b90c91f45080a9abbcb`
- Authorization: `59340a3c9b4ffd5da8657859d7ac8217a5d78587d3937f4dfdcef49f352a93d5`
- Pilot run: `625f25dbe4c98827572ae8fc38d26b987bd860f3bfdadfa781af28cc39f8f461`
- Operator receipt: `18ff8bc39972e6a7f858a17a57feceb5eef3343bb9c5d31a6d6ffda9ece1fc76`

Local hash-bound inputs and raw provider receipts are under:

```text
.calibration-temp/editron-v4r3-pilot/v4r3-pilot-20260824182051/
```

## Independent post-run audit

Commits `a0fdefd82` and `e061e2d16` add the zero-network auditor and correct its
authorization-hash key. Its mocked valid/tampered integration test passes 1/1.
The actual audit recomputed all top-level and nested receipt hashes, verified
the exact two intent/completion pairs, request/response/model/usage/cost and
episode/transcript bindings, exact source-bound runner roots, secret absence,
and zero state effects.

- Auditor Git HEAD: `e061e2d164a2d5a48783e8539d01268d3d175758`
- Audited artifact set: `602aa71f064d0c4f6c733bb8424056ddfd93c65e7d9e3d61b41897e9e8f2b1c8`
- Audit receipt: `31809762a146e6bfd92028137b01dfcb84ab3fe2987c04883c607f7e21aaed80`
- Assessment: `PASS_VALID_NON_SCORED_PILOT_EVIDENCE_NO_MODEL_RANKING`

## Disposition and next gate

This exact pilot is complete and must not be retried under its no-retry
authority. Gemini remains a provider-infrastructure non-evaluation, not a model
failure. Repairing or rechecking that route is separate work and does not
retroactively add a third pilot call.

No scored/full-cohort inference is authorized. Stage 2.5 continues with new
dependency/invalidation shapes, forced native/generated/hybrid alternatives,
conflict/rebase/lock, compaction/resume, realistic long-form constraints and
blind editor quality/correction-time evidence before any `GO`, `MODIFY` or
`NO-GO` decision.
