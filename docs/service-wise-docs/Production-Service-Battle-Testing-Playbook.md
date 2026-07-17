# Production Service Battle-Testing Playbook

**Purpose:** Reproduce the investigation and battle-testing method used for ThinkForge across any Insturix service.

**Worked example:** `docs/service-wise-docs/thinkforge/ThinkForge-Full-Battle-Test-2026-07-16.md`

This is not a happy-path smoke-test checklist. It is a release investigation method designed to expose contract drift, stale state, authorization gaps, provider failures, broken recovery, billing races, and UI flows that appear successful while the underlying artifact is wrong.

## Core Standard

A feature passes only when all of the following agree:

1. The user's explicit intent.
2. The canonical persisted contract.
3. The producer's output.
4. Every API boundary and queue payload.
5. The final consumer's interpretation.
6. The visible UI state after reload and recovery.
7. Ownership, billing, and retry records.

A `200`, a green UI, a valid JSON object, or a passing unit test is not sufficient on its own.

## 1. Establish Test Truth

Before testing:

- Confirm the real repository, worktree, branch, and commit.
- Confirm the deployed URL resolves to that commit.
- Record the deployment ID and timestamp.
- Record the account, tenant, brand, and test project without storing credentials.
- Read the current service docs, handoffs, contracts, and known-bug list.
- Capture unrelated dirty work so it is not accidentally bundled into a fix.
- Identify baseline-red checks before attributing failures to new work.

Recommended preflight evidence:

```text
Repository root:
Worktree:
Branch:
Local commit:
Deployment URL:
Deployment ID:
Deployed commit:
Test account/tenant:
Selected brand/project:
Known baseline failures:
```

Do not continue if the tested deployment cannot be tied to the expected commit.

## 2. Map The Complete Control Flow

For every workflow, write a producer-to-consumer map before clicking through it:

```text
User action
  -> UI state owner
  -> request builder
  -> API route and validation
  -> authorization/ownership guard
  -> domain resolver or planner
  -> provider/worker/queue
  -> persistence
  -> polling/recovery
  -> editor or downstream service
  -> billing/refund ledger
```

For each hop, record:

| Question | Evidence required |
|---|---|
| Who is the producer? | Function/file and output type |
| What is the source of truth? | Persisted contract, record, or accepted profile |
| Who may override it? | Explicit user choice or named resolver |
| What crosses the boundary? | Actual request/queue payload |
| Who is the final consumer? | Worker/editor/service and parsed fields |
| What happens on retry? | Idempotency and replay behavior |
| What happens on failure? | Terminal state, refund, and user-visible recovery |

Shared helpers or shared metadata are not proof that two flows are unified. Verify actual control flow.

## 3. Build A Workflow Matrix

Test the service by workflow family, not by isolated screens.

Every core workflow should include:

- First use with no prior state.
- Normal successful use.
- Explicit user override.
- Ambiguous natural-language request.
- Empty, minimal, and very long input.
- Reload before generation.
- Reload during generation.
- Reload after generation.
- Navigate away and return.
- Reopen the current item and a different item.
- Cancel and retry.
- Double-click or duplicate submission.
- Two tabs operating on the same item.
- Provider timeout, 429, 5xx, and malformed response.
- Database or queue interruption.
- Unauthorized access using a second user.
- Mobile, tablet, and desktop viewport.

For AI authoring services, add:

- Different document families: post, carousel, script, caption, thread, newsletter.
- Brand with strong voice rules and a brand with sparse data.
- Forbidden terms and exact recurring phrases.
- Factual claims with and without source references.
- Non-English brief.
- Unusual tone.
- Regeneration diversity.
- Prompt-injection strings in every untrusted context source.

## 4. Test In Layers

### Layer A: Static Control-Flow Audit

Read the producer, route, resolver, persistence, consumer, and tests. Search separately for:

- Direct calls and references.
- Type-level references.
- String literals and event names.
- Dynamic imports.
- Re-exports.
- Mocks and fixtures.
- Defaults duplicated across UI and backend.

Look especially for:

- Multiple owners of the same field.
- UI defaults accidentally becoming user intent.
- Inference overriding explicit contracts.
- IDs used as a substitute for ownership or readiness.
- Fallbacks that silently change document family or platform.
- Validation that rejects output the prompt commonly generates.
- Browser state treated as billing or authorization authority.

### Layer B: Deterministic Automated Tests

Run focused tests around the exact contract first:

- Pure resolver/planner tests.
- Schema and normalization tests.
- Route behavior tests.
- Producer-to-consumer contract tests.
- Persistence and recovery tests.
- Two-user authorization tests.
- Idempotency and refund tests.

Then run the wider service suite, TypeScript, and lint. Separate focused failures from unrelated repository baseline failures.

Source-string assertions are useful regression alarms, but they do not prove runtime behavior.

### Layer C: Live Provider Checks

Use opt-in live checks for provider-specific behavior that mocks cannot prove:

- Structured-schema acceptance.
- Real response shape.
- Latency and timeout behavior.
- Safety/refusal behavior.
- Multi-run stability.
- Cost estimate.

Never log API keys or private Brand Vault content. Use synthetic or sanitized cases unless the provider route is approved for private data.

### Layer D: Authenticated Browser QA

Use the actual branch deployment and a real authenticated session. For every action, capture:

- Screenshot before the action.
- Screenshot after the action.
- Browser console warnings/errors.
- Network request and response status.
- Request payload fields relevant to the contract.
- Visible terminal state.
- Reloaded/recovered state.

Do not stop when the UI says success. Open the produced artifact and inspect it.

### Layer E: Backend Triangulation

For the same run, connect the browser observation to backend evidence:

```text
Browser action/request ID
  <-> API log
  <-> persisted session/artifact
  <-> queue or worker job
  <-> downstream asset
  <-> credit/refund event
```

If the browser is wrong but persistence is right, investigate hydration/rendering. If persistence is wrong, trace upstream contract loss. If both are right but the final asset is wrong, investigate the downstream consumer or provider adapter.

## 5. Adversarial State Testing

State bugs usually live between valid states, so test transitions deliberately:

| Transition | Required assertion |
|---|---|
| Empty -> generating | One request and one charge |
| Generating -> completed | One terminal artifact is selected and visible |
| Generating -> failed | Error is visible and compensation is scheduled |
| Generating -> reload | Polling resumes from server state |
| Completed -> reload | Same artifact and editor content return |
| Item A -> Item B | No stale content from A appears in B |
| Item B -> Item A | A rehydrates even if its ID is already cached |
| Completed -> regenerate | Old result is replaced or clearly versioned |
| Timeout -> late success | UI reconciles with server terminal truth |
| Duplicate submit | Idempotency produces one job and one charge |

Never use a cached ID as proof that the associated data is loaded. Readiness must include the artifact identity and hydration state.

## 6. Contract Mutation Tests

Many cross-service bugs occur when valid source material must be reshaped for a requested output.

For any `N source units -> M output units` flow, test:

- `N = M`: one-to-one mapping.
- `N < M`: expansion without invented facts or repeated filler.
- `N > M`: compression without losing must-keep claims.
- `N = 0`: explicit missing-input state.
- User changes `M` after the initial plan.
- Platform maximum is lower than requested `M`.
- One source unit contains several semantic claims.
- Several source units repeat the same claim.

The output should carry provenance for every factual claim and an audit note for merged, split, omitted, or user-added material.

## 7. AI Quality Battle Tests

Use three different test sets:

1. **Development seeds:** known failures used while improving prompts.
2. **Held-out cases:** cases the prompt was never tuned against.
3. **Adversarial cases:** conflicting instructions, missing evidence, prompt injection, and extreme lengths.

Score at least:

- Correct document family.
- Brand voice and hard-constraint adherence.
- Factual grounding and source coverage.
- Creative specificity and usefulness.
- Structural completeness.
- JSON/schema validity.
- Downstream export readiness.
- Diversity across regenerations.
- Latency and estimated cost.

Use deterministic checks for objective contracts and an independent judge for editorial quality. Do not let the prompt and evaluator share a hand-maintained keyword blocklist as their only quality definition.

The 95% promotion threshold should apply to multi-run held-out performance, not only to development seeds.

## 8. Security, Privacy, And Billing Matrix

For every session-scoped route:

- Unauthenticated caller is rejected.
- User A can access User A's resource.
- User B cannot access User A's resource even with the exact ID.
- Child resources cannot bypass parent ownership.
- Caller-supplied project IDs and storage paths are verified server-side.

For every paid workflow:

- A durable idempotency key identifies the operation.
- Credit reservation/deduction is persisted before execution.
- One logical operation creates at most one charge.
- Every terminal failure has one compensation/refund outcome.
- Browser timeout does not decide final billing state.
- Late provider success reconciles safely.

For private intelligence:

- Record which provider receives which data class.
- Strip unnecessary Brand Vault internals and personal data.
- Block unsafe routing by policy, not developer convention.
- Keep logs free of secrets and raw private prompt context.

## 9. Evidence And Reporting

Every finding should contain:

```text
Severity:
Workflow:
Expected behavior:
Observed behavior:
Reproduction steps:
Frontend evidence:
Backend evidence:
Persisted evidence:
Producer:
Source of truth:
Decision owner:
Final consumer:
Root cause:
Required production fix:
Regression test:
Verification status:
```

Classify findings as:

- **P0:** security/data-loss/system-wide release blocker.
- **P1:** core workflow fails or produces the wrong artifact.
- **P2:** serious quality, recovery, observability, or usability defect.
- **P3:** polish or low-impact inconsistency.

Name root cause only when code and runtime evidence agree. Otherwise label it a hypothesis and state what evidence is missing.

## 10. Fix Verification

A production fix is complete only after:

1. The faulty owner or contract is corrected, not merely hidden by UI validation.
2. A focused regression test reproduces the old failure and passes with the fix.
3. The affected service suite passes.
4. TypeScript and lint are run and baseline failures are reported honestly.
5. The exact deployment commit is verified.
6. The live workflow is rerun through the final consumer.
7. Reload, retry, duplicate-submit, and failure recovery are retested.
8. Screenshots, logs, payload evidence, and persisted state are attached to the report.

Do not call a system merged, unified, production-ready, or complete when separate fallback authorities still exist.

## 11. Minimum Promotion Gates

A service should not be promoted until:

- Core workflows pass end to end on the deployed commit.
- Authorization passes a two-user negative matrix.
- Recovery passes idle, generating, completed, failed, and cancelled states.
- Duplicate submission produces one logical operation.
- Billing has one terminal charge/refund result.
- Provider fault cases reach visible terminal states within bounded time.
- Cross-service contracts preserve explicit user intent.
- Held-out AI quality meets the agreed multi-run threshold.
- Desktop, tablet, and mobile workflows remain usable.
- There are no unexplained console, network, worker, or persistence mismatches.

## Copy-Paste Task For Another Service Session

```text
Battle-test <SERVICE> as a production release candidate.

Do not start by patching symptoms. First identify the real worktree, branch, deployed commit, service docs, and known baseline failures. Map every core workflow from user action -> UI state -> request -> authorization -> resolver/planner -> provider/worker -> persistence -> polling/recovery -> final consumer -> billing/refund.

Test happy paths plus reload, navigation away/back, current-item reopen, cross-item isolation, regeneration, duplicate submission, timeout, 429/5xx, malformed response, two-tab concurrency, two-user authorization, and mobile/tablet/desktop behavior. For AI paths, test document-family routing, Brand Vault adherence, forbidden terms, factual provenance, non-English/long/unusual briefs, prompt injection, held-out quality, and multi-run stability.

Triangulate every live browser result against network payloads, backend logs, persisted records, worker jobs, downstream artifacts, and credit/refund events. A 200 or green UI is not a pass unless the correct final artifact exists and survives reload.

Produce a report ordered by severity. For each finding include expected/observed behavior, reproduction, frontend/backend/persistence evidence, producer, source of truth, decision owner, final consumer, root cause or clearly labeled hypothesis, production fix, regression test, and verification status. Do not change code until the root cause is demonstrated and I approve implementation.
```
