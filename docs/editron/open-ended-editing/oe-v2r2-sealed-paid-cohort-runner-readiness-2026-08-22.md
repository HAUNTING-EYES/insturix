# Editron V2R2 sealed paid-cohort runner readiness — 2026-08-22

## Status

`READY_TO_ISSUE_PAID_AUTHORIZATION`, not `RAW_EXECUTED`, valid model evidence,
production certification or ProjectService execution.

Commit `5fbf025f5` adds the bounded 96-row runner and the sole dispatch-to-proof
adapter. The runner uses the frozen sixteen opaque cases, three routes and two
handoff modes. It neither adds nor repairs creative operations and has zero
real-project read or mutation authority.

## Corrected request identity

The first zero-network rehearsal found that credential preflight V1 captured
the historical non-budgeted episode context while paid execution correctly
uses the V2R-3 budgeted context. Every initial hash would therefore have
failed before transport. No provider call occurred during that discovery.

The correction is fail-closed:

- credential preflight is now
  `EDITRON_OE_SEALED_HOLDOUT_CREDENTIAL_PREFLIGHT_V2R_2`;
- capture passes through the exact budgeted serializer used by paid dispatch;
- the zero-token capture-only bound permits serialization but is not presented
  as real token evidence;
- the existing OpenAI estimator and official Google `countTokens` call still
  establish the actual initial-request bound afterward;
- the paid runner recomputes the initial request and requires exact hash
  equality before transport invocation.

The prior current-identity V1 receipt
`4f27e3fcc3f990185432eb8ad5c686058f6280898e9d2765770cb281e7d7964e`
and capture set
`bef05c653ee048f3ab9ca109e61eb3f22a75e0a103605eb56fe020612055ec11`
are `INVALID_FOR_PAID_DISPATCH`. They remain historical diagnostic evidence.

## Current zero-inference credential receipt

Artifact root:
`.calibration-temp/open-ended-planner-v2/sealed-holdout-credential-preflight-20260822015731`

- cohort manifest:
  `5a7ceece49f33378b8f13876e5e386e0ced41f642468d42671a67bcd35bdedaa`
- local preflight receipt:
  `0e2db9be7b77b1932ada24401048e714f0745ec5d2cc6916455d86ce27e83c7d`
- credential-preflight V2 receipt:
  `428cdc9aea676c5dae8ac2887cc2e78507b3ef8dcff12d5a059fb5007cbad622`
- request-capture set:
  `62d2626084bfbacd34840ac391001e58c86dac6ce5074a95b1494807f5dc8356`
- runner source SHA-256 at `5fbf025f5`:
  `69a0193686b59ea212b96a4437c7462618ff42f2d13dc746d16d023e780ee4c8`

The reissue made three model-metadata GETs and 32 Google `countTokens`
context-egress calls. It made zero inference calls, project reads, project
mutations or state effects. The temporary pulled Production env file was
deleted immediately after issuance; no key appears in an artifact or commit.

## Runner invariants

- exactly 96 ordered row plans are derived from the credential captures;
- each row binds case, public-case hash, route, handoff arm, presentation order
  and the exact initial request hash;
- authorization expiry is checked before every new row;
- route/accounting approval is rebuilt per row from the frozen pricing fact;
- transient provider retries are disabled for the benchmark runner;
- raw request/response exchanges and accounting receipts are retained;
- the hidden evaluator never repairs the model trace;
- proof runs only after `PASS` or `READY_FOR_PROOF` and delegates to the frozen
  no-edit or H01–H05 proof owner;
- an attempt marker without a completed row is indeterminate and is never
  automatically replayed;
- completed rows resume only after receipt, trace and evaluation revalidation;
- the complete cohort receipt is rebuilt from all 96 validated rows, so a
  self-rehashed forged aggregate still fails;
- secrets and real-project state effects fail closed.

## Verification

- exact 96-row fake-provider rehearsal: pass;
- provider invocations: 96 on first run, zero on resume;
- Google count-token calls in rehearsal: 32;
- forged row receipt: rejected;
- self-rehashed forged cohort aggregate: rejected;
- focused authorization/runtime/proof battery: 31/31;
- credential and full-runner integration: 5/5;
- `pnpm exec tsc --noEmit`: pass;
- `pnpm exec eslint . --quiet`: pass.

## Next executable action

Commit the two operator CLIs and this ledger update, issue one expiring paid
authorization bound to the V2 receipt, capture set, manifest, implementation
commit, runner source and `$75` hard cohort ceiling, then execute/resume the
96 rows. The resulting cohort remains `RAW_EXECUTED_PENDING_FROZEN_INTERPRETATION`
until every row and proof artifact is independently reconciled.
