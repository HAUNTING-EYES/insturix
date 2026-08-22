# ThinkForge Production Operations Runbook

Date: 2026-08-17  
Owner: ThinkForge service team  
Applies to: `infrastructure-improvs-+Editron` and later descendants containing the convergence commits

## Purpose

This runbook is the operational gate for ThinkForge document authority, Brand Vault authority,
learning jobs, Clickatron/Editron handoffs, and writer promotion. Code completion is not release
evidence. A release is promotable only when the applicable receipts below exist and every fail-closed
gate is green.

## Non-Negotiable Rules

1. Never run a migration mutation without an exact database confirmation, named operator, reviewed
   dry-run report, and unique run ID.
2. Never resolve quarantined legacy records by guessing brand, organisation, document kind, or owner.
3. Never run the writer promotion command without an explicit spend approval and reviewed provider
   request envelope.
4. Never enable an E2E fixture in production. The code rejects this, and deployment configuration
   must reject it too.
5. Never treat a successful UI render as proof of authority. Inspect the persisted generation receipt,
   authoring snapshot, trace hashes, and handoff contract.
6. Never claim the 95% writer gate passed without a valid promotion receipt tied to a clean commit and
   the full blind corpus.

## Release Preflight

Run from the repository root on the exact candidate commit:

```powershell
git status --short --branch
node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit --pretty false
npx eslint . --quiet
npx vitest run tests/thinkforge tests/calos/trends-provider.test.ts tests/clickatron
git diff --check
```

Required conditions:

- The tracked working tree used for promotion evidence is clean.
- No unreviewed package or lockfile change is included.
- `MONGODB_URI`, database names, Clerk keys, and provider keys come from the approved environment
  manager. Do not paste secrets into this document or commit them.
- Diagnostics show no critical terminal job failures and no receipt-integrity alerts.

## Operational Diagnostics

The admin-only endpoint is:

```text
GET /api/admin/thinkforge/diagnostics
GET /api/admin/thinkforge/diagnostics?sessionId=<session-id>&scriptId=<script-id>
```

Both document identifiers are required together. The endpoint fails closed when admin authorization or
MongoDB diagnostics are unavailable.

Review these sections before promotion:

- `jobs.observer.terminalFailures`
- `jobs.refinery.terminalFailures`
- `jobs.postMortem.terminalFailures`
- migration status and quarantine counts
- document trace/receipt integrity alerts
- the exact generation receipt for the candidate session, script, and committed version

Critical alert policy:

| Alert | Severity | Release action |
| --- | --- | --- |
| Observer, refinery, or post-mortem terminal failure | Critical | Stop promotion; inspect retry history and dead-letter reason |
| Missing, invalid, or hash-mismatched generation receipt | Critical | Stop promotion; do not regenerate over the evidence |
| Document version/trace mismatch | Critical | Stop promotion; preserve the record for investigation |
| Migration quarantine | Review required | Do not auto-activate; resolve from authoritative evidence or retain quarantine |
| Optional trend source unavailable | Warning | Confirm graceful degradation and provider health; private authoring may continue |

## Migration Procedure

The three auditable migrations are:

```text
scripts/migrate-thinkforge-document-contracts.ts
scripts/migrate-thinkforge-databank-authority.ts
scripts/migrate-thinkforge-authoring-requests.ts
```

Execution events are append-only and hash chained in:

```text
thinkforge_migration_execution_events
```

### 1. Dry Run

Dry runs read the target database and write an execution report. Use an isolated operator session and
capture the generated run ID.

```powershell
npx tsx scripts/migrate-thinkforge-document-contracts.ts --run-id=<8-128-char-run-id>
npx tsx scripts/migrate-thinkforge-databank-authority.ts --run-id=<8-128-char-run-id>
npx tsx scripts/migrate-thinkforge-authoring-requests.ts --run-id=<8-128-char-run-id>
```

For each report:

1. Confirm the recorded database name and git identity.
2. Review scanned, active, quarantined, and backup counts.
3. Review every quarantine reason.
4. Confirm the execution-event hash chain validates.
5. Archive the report before approving mutation.

### 2. Apply

Use a new run ID for each migration. `<database>` must exactly match the runtime database name.

```powershell
npx tsx scripts/migrate-thinkforge-document-contracts.ts --apply --confirm-db=<database> --operator=<operator-id> --run-id=<run-id>
npx tsx scripts/migrate-thinkforge-databank-authority.ts --apply --confirm-db=<database> --operator=<operator-id> --run-id=<run-id>
npx tsx scripts/migrate-thinkforge-authoring-requests.ts --apply --confirm-db=<database> --operator=<operator-id> --run-id=<run-id>
```

An apply is successful only when the script verifies active, quarantined, and backed-up counts inside
the transaction and records a terminal verified event. Source drift or CAS mismatch is a hard stop.

### 3. Rollback

Rollback uses the in-record migration backups. Do not delete backup fields until the release has passed
its retention window.

```powershell
npx tsx scripts/migrate-thinkforge-document-contracts.ts --rollback --confirm-db=<database> --operator=<operator-id> --run-id=<new-rollback-run-id>
npx tsx scripts/migrate-thinkforge-databank-authority.ts --rollback --confirm-db=<database> --operator=<operator-id> --run-id=<new-rollback-run-id>
npx tsx scripts/migrate-thinkforge-authoring-requests.ts --rollback --confirm-db=<database> --operator=<operator-id> --run-id=<new-rollback-run-id>
```

Rollback must also finish with verified counts and a valid execution-event hash chain. A partial or
failed rollback is an incident, not permission to hand-edit production records.

## No-Spend Browser Gate

The browser gate uses:

- a disposable Clerk admin and restricted member
- personal and organisation brands with opposite voice constraints
- run-scoped application and Brand Vault MongoDB databases
- the request-aware `auto` writer fixture
- a guarded completed-media Clickatron fixture
- no Gemini, DeepSeek, Perplexity, Fal, QStash, R2, or Vector request

Required environment names:

```text
THINKFORGE_E2E_MODE=1
THINKFORGE_E2E_BASE_URL=http://127.0.0.1:<port>
THINKFORGE_E2E_RUN_ID=<1-12 alphanumeric chars>
THINKFORGE_E2E_DATABASE_URI=<disposable-test-database-uri>
THINKFORGE_E2E_REDIS_REST_URL=<test-redis-rest-url>
THINKFORGE_E2E_REDIS_REST_TOKEN=<test-redis-rest-token>
THINKFORGE_E2E_USER_EMAIL=<disposable-admin-email>
THINKFORGE_E2E_BRAND_ID=<disposable-personal-brand-id>
THINKFORGE_E2E_WRITER_FIXTURE=auto
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<test-instance-key>
CLERK_SECRET_KEY=<test-instance-key>
```

The GitHub `ThinkForge Browser Gate` derives a unique run ID, plus-tagged admin identity, and brand ID.
Configure these repository secrets before making the check required:

```text
THINKFORGE_E2E_DATABASE_URI
THINKFORGE_E2E_REDIS_REST_URL
THINKFORGE_E2E_REDIS_REST_TOKEN
THINKFORGE_E2E_BASE_EMAIL
THINKFORGE_E2E_CLERK_PUBLISHABLE_KEY
THINKFORGE_E2E_CLERK_SECRET_KEY
```

The Clerk secrets must belong to a test instance, and the Mongo credential must be restricted to a
disposable QA cluster. Missing or non-test credentials fail the job; they never turn it into a skipped
green check.

Run:

```powershell
npx playwright test tests/e2e/thinkforge-browser.spec.ts --project=thinkforge-chromium
```

The gate must prove:

- personal and organisation brand bindings do not cross
- restricted-member organisation-brand access fails before writer persistence
- post, carousel, and seven-minute script contracts route correctly
- create and edit operations persist immutable generation evidence
- a single post creates one completed Clickatron variation
- a five-slide carousel creates five completed Clickatron variations
- a Sidecar V3 semantic script persists its treatment binding, resolves a `no-physical-capture` Shoot Kit projection when its treatment has no capture requirements, and compiles through Editron with no legacy parser fallback
- retained V2 documents still pass their deterministic reader/export compatibility coverage; the browser gate must not downgrade a V3 script to prove compatibility
- a cancelled request sends the exact generation identity, aborts, leaves the saved version unchanged,
  and permits a clean retry
- session reopen, retry, and visible hydration-error behavior remain correct

The fixture marker is test evidence only. Any fixture configuration in a production environment is a
release blocker.

## Writer Quality Promotion

The blind corpus contains 15 cases. Known regression cases cannot count toward the blind minimum.
Promotion requires ten distinct runs per blind case, an independent non-production judge, no duplicate
runs or outputs, no generation/judge errors, no fabrication/internal-leak hard fail, and every configured
95% threshold in the promotion gate.

First run the zero-network assembly check:

```powershell
npx tsx scripts/prompt-optimization/eval-thinkforge-writers.ts --dry-run --suite=heldout
```

Expected result:

```text
15 prompt(s) assembled. Routing: 15/15 correct.
```

The full worst-case envelope is:

```text
provider requests: 1,350
writer requests: 300
judge requests: 450
context-cache requests: 600
```

Do not run the following template until the owner approves the estimated spend and substitutes a
reviewed USD cap. Default low caps intentionally block it.

```powershell
npx tsx scripts/prompt-optimization/eval-thinkforge-writers.ts --promotion --suite=heldout --multi-run --judge=deepseek --confirm-paid-run --max-provider-calls=1350 --max-writer-calls=300 --max-judge-calls=450 --max-context-cache-calls=600 --max-output-tokens=10000000 --max-estimated-usd=<approved-cap> --json-out=.artifacts/thinkforge/writer-promotion.json
```

A valid promotion receipt must include:

- clean source commit and branch
- corpus hash and exact case IDs
- provider/model identity and request envelope
- all 150 case/run pairs
- deterministic, editorial, and independent-judge metrics
- receipt hash
- a `PASS` verdict from the gate

An 88% run, a five-case run, a regression-only run, a missing-judge run, or an unsigned JSON file is
not promotion evidence.

## Deployed Gemini Smoke

After deterministic gates pass, run the smallest explicitly approved real-provider smoke against the
separately configured disposable canary. Use one synthetic brand and one synthetic document; never
use raw customer Brand Vault data. The workflow is
`.github/workflows/thinkforge-deployed-gemini-canary.yml`; it is manual-only and refuses a normal
preview or production deployment.

### Canary Provisioning

Before dispatching the workflow, create a Vercel deployment of the exact candidate commit with an
isolated environment. The deployment must contain the following configuration; do not reuse generic
project or team environment variables:

```text
THINKFORGE_DEPLOYED_CANARY_MODE=1
THINKFORGE_DEPLOYED_CANARY_RUN_ID=<1-12 alphanumeric run id>
THINKFORGE_DEPLOYED_CANARY_REDIS_SCOPE=<same run id>
THINKFORGE_DEPLOYED_CANARY_ATTESTATION_SECRET=<unique secret>

MONGODB_URI=<disposable QA Mongo URI>
BRAND_VAULT_MONGODB_URI=<same disposable QA Mongo URI>
MONGODB_DB_NAME=thinkforge_e2e_<run id>
THINKFORGE_MONGODB_DB_NAME=thinkforge_e2e_<run id>
EDITRON_MONGODB_DB_NAME=thinkforge_e2e_<run id>
BRAND_VAULT_MONGODB_DB_NAME=thinkforge_e2e_brandvault_<run id>

UPSTASH_REDIS_REST_URL=<dedicated disposable Redis>
UPSTASH_REDIS_REST_TOKEN=<dedicated disposable Redis token>
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<pk_test_...>
CLERK_SECRET_KEY=<sk_test_...>
GEMINI_API_KEY=<approved paid Gemini key>
```

The deployment must have no `GOOGLE_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, OpenRouter, DeepSeek,
OpenAI, Anthropic, Perplexity, Fal, Replicate, R2, Blob, GCS, Vector, or QStash credentials. It must
also have no `THINKFORGE_E2E_MODE`, writer fixture, or Clickatron media fixture. Configure the Clerk
test instance to allow the exact Vercel canary host. The attestation endpoint returns `404` outside
this mode and `503` whenever any of these conditions are not true.

Configure the corresponding GitHub Environment secrets:

```text
THINKFORGE_CANARY_BASE_URL
THINKFORGE_CANARY_ALLOWED_HOST
THINKFORGE_CANARY_DATABASE_URI
THINKFORGE_CANARY_REDIS_REST_URL
THINKFORGE_CANARY_REDIS_REST_TOKEN
THINKFORGE_CANARY_BASE_EMAIL
THINKFORGE_CANARY_CLERK_PUBLISHABLE_KEY
THINKFORGE_CANARY_CLERK_SECRET_KEY
THINKFORGE_CANARY_ATTESTATION_SECRET
```

Use the same run ID, Clerk test instance, test datastore, Redis scope, and attestation secret in
Vercel and GitHub. The workflow verifies the deployment’s commit before it sends a single request.

### Dispatch And Receipt

From the GitHub Actions UI, dispatch `ThinkForge Deployed Gemini Canary` on the exact deployed commit
with the matching `canary_run_id`, named operator, full `expected_commit`, and an explicit
`approved_max_usd` no greater than `$0.50`. The protected `thinkforge-deployed-canary` environment
should require the release owner’s approval.

The one journey signs into a disposable Clerk user, creates a synthetic 45-second narrated
motion-graphics script, validates the saved V3 sidecar through the primary AV Script view, validates
the Editron handoff without legacy parsing, then verifies the persisted receipt/trace, profile
fingerprint, Gemini-only latency and cost events, and critical operational alerts. It stores a
sanitized receipt at:

```text
.artifacts/thinkforge-deployed-canary/<run-id>/receipt.json
```

If the workflow is cancelled or fails before global teardown, manually delete the run-scoped Mongo
databases, Redis namespace, Clerk test users/organisation, and Vercel canary deployment before retry.

Record:

- deployment ID and commit
- model and provider route
- session/script/version
- generation receipt hash
- authoring snapshot/profile revision checksum
- latency and cost event
- final writer and handoff contract validation

This smoke proves deployed configuration, not editorial quality. It cannot replace the 15-case
promotion receipt.

## Incident Rollback Order

1. Disable promotion or the affected route through the approved deployment control.
2. Preserve the failing document, generation receipt, job records, and migration events.
3. Stop retrying terminal learning jobs until the cause is understood.
4. Roll back the application deployment when the defect is code/configuration.
5. Use the migration rollback commands only when the migrated data contract is the cause.
6. Re-run diagnostics and deterministic tests before restoring traffic.
7. Create a new receipt after repair; never alter the failed historical receipt.

## Release Sign-Off Record

Record the following in the release ticket:

```text
commit:
deployment:
operator:
diagnostics timestamp:
migration run IDs:
quarantine disposition:
Playwright report path:
writer promotion receipt path/hash:
deployed Gemini smoke receipt:
known warnings:
rollback owner:
```

If a field is not applicable, state why. A blank required field means the release is not proven.
