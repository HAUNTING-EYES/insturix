# INSTURIX Provider Cost Telemetry Final Plan

Date: 2026-07-01
Branch/worktree verified: `infrastructure-improvs-+Editron` at `D:\google downloads\Front-End-main\editron-worktree`
Status: PLAN + PHASE 1 FOUNDATION IMPLEMENTED - no Razorpay live changes; provider-cost foundation files are now added under `lib/financials` and `tests/financials`.

## Executive Summary

We already have a customer credit system. Before Phase 1, we did not have a finance-grade provider cost ledger. Phase 1 now adds the ledger foundation, but most product callsites still need to emit events before we have end-to-end margin visibility.

In plain terms:

- The code can answer: "How many credits did we charge this user for this action?"
- Phase 1 now gives us a `provider_cost_events` helper and seeded estimator so callsites have one place to record COGS.
- The product still cannot reliably answer: "How many dollars did Insturix spend on Fal, Gemini, Deepgram, Apify, Modal, R2, GCS, QStash, X API, etc. for this exact action?" until high-spend, background, LLM, storage, and social callsites are connected.
- Some provider receipts exist, such as Deepgram request IDs and `videoProvider`, but most are still debugging fields until wired into the margin ledger.
- Storage quota is started, but it is only visibly enforced on the direct Editron upload path. Multipart and older presigned registration paths still need connection.

The next non-Razorpay work should be provider-cost telemetry:

```
User action
  -> credit check / credit deduction
  -> provider call / infra usage
  -> provider_cost_events insert
  -> daily margin report by service, user/org, provider, model, action
```

This lets us see when a $0.002 action becomes a $2,000 scale problem.

## Investigation Scope

This plan was built from the infra branch code, not the old financial doc as the source of truth.

Code evidence checked:

- Credit pricing and plan allocations:
  - `lib/config/creditCosts.ts:36` sets `CREDITS_PER_USD = 30`.
  - `lib/config/creditCosts.ts:274` has `pipeline.video_generation`.
  - `lib/config/creditCosts.ts:366` has `pipeline.storyboard_image_generation`.
  - `lib/config/creditCosts.ts:427`, `:442`, `:458` define the $100, $500, $1000 agency plans.
- Credit ledger:
  - `lib/services/creditsService.ts:125` starts `deductCredits`.
  - `lib/services/creditsService.ts:180` builds a user credit transaction.
  - That transaction stores `service`, `action`, `model`, `taskId`, balance, and generic metadata, but not estimated/actual vendor USD.
- Existing provider receipts:
  - `lib/alyzitron/models/Transcription.ts:6` stores `transcriptionServiceId` for Deepgram request debugging.
  - `lib/pipeline/video-queue-service.ts:294` stores `videoProvider`.
  - `app/api/internal/workers/pipeline/video/route.ts:192` stores `videoProvider`.
  - Searches for `costEvent`, `providerCost`, `actualCost`, `COGS`, and related names found no real app/lib provider-cost ledger.
- Storage quota:
  - `lib/services/storage-quota-service.ts:20` uses `storage_usage`.
  - `lib/services/storage-quota-service.ts:84` checks quota.
  - `lib/services/storage-quota-service.ts:108` records storage usage.
  - `app/api/services/editron/media/upload/direct/route.ts:43-90` checks and records storage quota.
  - `app/api/services/editron/media/upload/multipart/init/route.ts:35` still only enforces a hard 3GB cap.
  - `app/api/services/editron/media/upload/route.ts:195-328` queues paid background asset analysis after upload, but does not record provider COGS.
- Paid provider surfaces:
  - Fal video: `lib/pipeline/video-generation-service.ts:357`, `:395`, and return provider `fal-ai`.
  - Clickatron Fal image worker: `app/api/internal/workers/clickatron/variation/route.ts:557`.
  - Alyzitron Deepgram and Whisper: `lib/alyzitron/transcription/transcriptionService.ts:81`, `:114`, `:149`.
  - Pipeline TTS/BGM/SFX: `lib/pipeline/tts-service.ts`, `lib/pipeline/bgm-service.ts`, `lib/pipeline/sfx-service.ts`.
  - CalOS trends: `lib/calos/trends/apify.ts`, `lib/calos/trends/perplexity.ts`, `lib/calos/trends/gemini.ts`.
  - Brand Vault Apify/social/Gemini OCR: `lib/shared/brand-vault-connected-social-ingestion.ts`, `lib/shared/brand-vault-social-ocr.ts`.
  - UploaderX and CalOS social publishing: X, YouTube, LinkedIn, Instagram, Facebook routes and publishers.
  - Infra dependencies in `package.json`: AWS SDK, Clerk, Deepgram, Fal, Google Cloud Storage/PubSub/Vertex, Vercel packages, Neo4j, Razorpay.

## Root Cause

The product has two different money ledgers, but only one is implemented:

1. Customer ledger: implemented.
   - Credits charged to the user.
   - Works through `CreditsService` and `creditCosts.ts`.
   - Good for quota and user billing.

2. Provider COGS ledger: missing.
   - Actual/estimated dollars Insturix spends after the user action.
   - Needed for margins, provider anomalies, retry waste, free background work, and plan tuning.
   - Today this is scattered across logs, request IDs, DB fields, and provider-specific code.

Because the provider ledger is missing, a route can be "credit protected" and still be financially blind.

Example:

```
User uploads media
  -> upload route charges editron.asset_analysis credits
  -> QStash runs asset-analysis worker
  -> worker may call Gemini / 5-track / embeddings / Modal-adjacent analysis
  -> no provider_cost_event captures what we spent
```

That is the real problem.

## What Already Exists

| Area | Current state | Reuse or replace? |
|------|---------------|-------------------|
| Customer credits | Implemented in `creditCosts.ts` and `CreditsService` | Reuse |
| $1 = 30 credits | Implemented in `creditCosts.ts:36` | Reuse |
| Agency plans | $100, $500, $1000 plans exist in code | Reuse |
| Razorpay idempotency | Existing code reuses provider plan IDs and webhook grant keys | Leave to Claude/Razorpay handoff |
| Storage quota service | Exists in `lib/services/storage-quota-service.ts` | Reuse, connect everywhere |
| Direct upload quota | Connected in `/media/upload/direct` | Keep |
| Multipart upload quota | Not visibly connected; only hard 3GB cap | Add connection |
| User credit history | Stores charged credits and metadata | Keep as customer ledger |
| Provider privacy audit | ThinkForge tracks provider/model/privacy route | Reuse as metadata source, not cost ledger |
| Brand events/admin usage | Counts behavior events | Keep, but not enough for cost |
| Provider receipts | Deepgram request ID, video provider fields | Reuse as event fields |

## What Is Missing

Phase 1 foundation now implemented:

- Central `provider_cost_events` collection/helper.
- Seed estimated cost mappings by provider/model/action where repo-backed pricing exists.
- Sanitized metadata and fail-open event recording.

Still missing after Phase 1:

- A way to link provider events back to customer credit transactions at each real product callsite.
- Callsite events for failed provider calls, retries, queue retries, and background jobs.
- Margin aggregation: charged credits -> revenue USD -> estimated provider cost USD -> gross margin.

P2 missing:

- Full storage quota connection across multipart and presigned registration paths.
- Infra COGS event types for storage bytes, egress/proxy bytes, QStash messages, Vercel function duration, Modal GPU seconds, Neo4j usage, AWS Lambda/SES.
- Invoice reconciliation fields for actual vendor billing later.

## Target Event Shape

Add one central event type. Do not overload `creditHistory`.

```ts
type ProviderCostEvent = {
  eventId: string;
  createdAt: Date;
  status: 'started' | 'success' | 'failed' | 'skipped' | 'refunded';

  userId?: string;
  orgId?: string;
  projectId?: string;
  taskId?: string;
  assetId?: string;
  creditTransactionId?: string;

  service: string;
  action: string;
  route?: string;

  provider: string;
  model?: string;
  operation: string;

  chargedCredits?: number;
  revenueUsdEstimate?: number;
  estimatedCostUsd?: number;
  actualCostUsd?: number;
  pricingVersion: string;
  costBasis: 'estimated_table' | 'provider_usage' | 'invoice_reconciled' | 'pricing_to_be_seen';

  vendorRequestId?: string;
  providerJobId?: string;

  units: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    mediaSeconds?: number;
    mediaMinutes?: number;
    imageCount?: number;
    audioCharacters?: number;
    bytesIn?: number;
    bytesOut?: number;
    storageBytes?: number;
    queueMessages?: number;
    retryCount?: number;
    functionMs?: number;
    gpuSeconds?: number;
  };

  metadata?: Record<string, unknown>; // sanitized only
};
```

Hard rules:

- Never store prompts, transcripts, customer content, media URLs with signatures, OAuth tokens, provider secrets, or full scraped social payloads in this ledger.
- Store IDs, counts, durations, provider names, model names, request IDs, hashes, and sanitized status.
- Telemetry must fail open. A cost-event write failure must not fail the customer job.
- Events must be idempotent where possible using `creditTransactionId`, provider request ID, batch/job ID, or route-specific idempotency keys.

## Connection Matrix

| Product area | Current customer charge | Provider/infra spend | Gap | Plan |
|--------------|-------------------------|----------------------|-----|------|
| ThinkForge chat/script/refinery/sidecar/url brief | `thinkforge.chat_message` and `document_creation` | Gemini/OpenRouter/DeepSeek-style routes depending config | No token/provider USD event | Hook provider factory/BaseAgent result usage into cost events |
| Clickatron generation/variation/sketch/fill | `clickatron.variation` | Fal image models, R2 store/read, thumbnail Sharp CPU | No Fal/R2 COGS event | Record event in worker after `fal.subscribe`, R2 upload, thumbnail upload |
| Editron chat | `editron.ai_chat` | LLM calls and tool-driven downstream actions | No LLM usage cost event | Record LLM usage per streamed completion/tool run |
| Editron media upload | `editron.asset_analysis` before background analysis | R2/GCS storage, QStash, Gemini, embeddings, 5-track | Credit-protected, but COGS blind | Add cost events in upload registration and worker |
| Editron auto-edit from asset | `editron.auto_edit_analysis` | video-analysis worker, tribe-analysis, Gemini, Deepgram, Modal GPU-adjacent analysis | No COGS event | Record per stage: transcription, visual analysis, embeddings, Modal/GPU calls |
| Pipeline AI video | `pipeline.video_generation` per second by model | Fal/Kie/other video provider, R2/GCS persistence | Provider stored, not costed | Pass credit transaction into batch/job, record worker success/failure event |
| Pipeline storyboard images/reference images | `pipeline.storyboard_image_generation`, reference actions | Fal/Luma image providers, R2/GCS | No provider event | Record at image/reference generation workers/services |
| Pipeline voiceover | `pipeline.voiceover_generation` | Fal Kokoro or Deepgram Speak | No provider event | Record chars, provider, voice, request/job ID |
| Pipeline BGM/SFX | `pipeline.bgm_generation`, `pipeline.sfx_generation` | Fal/CassetteAI/Mirelo/Freesound/provider downloads | No provider event | Record media seconds and source/provider outcome |
| Musitron | `musitron.music_generation` | Fal music endpoints | No provider event | Record Fal event per task |
| Alyzitron transcription | `alyzitron.transcription` | Deepgram nova, Fal Whisper fallback, GCS | Deepgram request ID exists, no USD | Convert request ID/duration into provider cost event |
| Alyzitron chat/analysis | `alyzitron.chat_message`, `video_analysis` | Gemini files, GCS, LLM analysis | No provider event | Record Gemini/GCS/analysis events |
| Brand Vault scans | `brand_vault.brand_scan` | website fetch, browser fallback, Apify social fallback, Gemini OCR/vision | No provider event | Record scan-stage events, including "pricing_to_be_seen" where unknown |
| CalOS content calendar | `calos.ai_plan`, `generate_deliverable` | Gemini, Perplexity, Apify, QStash, downstream ThinkForge/Clickatron | No provider event | Record planner and trends provider events |
| UploaderX posting | `uploaderx.platform_publish` | X paid API, YouTube/LinkedIn/Meta API calls, R2/GCS reads | No platform cost event | Record per platform publish attempt and response status |
| Storage | direct upload checks quota | R2/GCS storage and egress/proxy | Direct only; multipart/presigned need quota | Connect quota at init/register/complete and record storage COGS events |
| Infra fixed/variable | none in action ledger | Vercel, Clerk, Neo4j, Modal, Cloudflare, GCP, AWS, Upstash/QStash | No allocation model | Add daily infra allocation events/reporting later |

## Phased Implementation Plan

AGENTS phase rule: each implementation phase must touch no more than 5 files before verification and approval.

### Phase 0 - This Plan

Status: done by this document.

No code changes.

### Phase 1 - Provider Cost Event Foundation

Goal: add the ledger without connecting many callsites yet.

Touch at most 5 files:

1. `lib/financials/provider-cost-events.ts`
   - `recordProviderCostEvent(event)`
   - `recordProviderCostAttempt(...)`
   - `sanitizeProviderCostMetadata(...)`
   - fail-open write behavior
   - direct Mongo collection `provider_cost_events`
2. `lib/financials/provider-cost-estimates.ts`
   - pricing table keyed by provider/model/operation
   - supports `pricing_to_be_seen`
   - versioned with `pricingVersion`
3. `tests/financials/provider-cost-events.test.ts`
   - unit tests for sanitize, fail-open, event normalization, idempotency key shape
4. `tests/financials/provider-cost-estimates.test.ts`
   - unit tests for Fal seconds, image count, token counts, unknown pricing
5. Optional docs update only if under 5 files; otherwise defer to Phase 1b.

Verification:

- `npx vitest run tests/financials/provider-cost-events.test.ts tests/financials/provider-cost-estimates.test.ts`
- `npx eslint . --quiet`
- `npx tsc --noEmit`

Known caveat: previous infra verification had an unrelated TypeScript baseline failure in `tests/clickatron/endpoint-verification.ts` for duplicate `BASE_URL`. Do not claim global typecheck green until that baseline is fixed or excluded.

Implementation status on 2026-07-01: Phase 1 foundation is implemented.

- Added `lib/financials/provider-cost-estimates.ts`.
- Added `lib/financials/provider-cost-events.ts`.
- Added focused tests in `tests/financials/provider-cost-estimates.test.ts` and `tests/financials/provider-cost-events.test.ts`.
- Verification passed: focused Vitest financial suite and `npx eslint . --quiet`.
- `npx tsc --noEmit` is clear for the new financial files; repo-wide typecheck still fails on the unrelated existing `tests/clickatron/endpoint-verification.ts:11` duplicate `BASE_URL` baseline.

### Phase 2 - High-Spend Media COGS

Goal: connect the spend that can destroy margin fastest.

Sequential lane A - Pipeline video:

- Modify video generation credit route to preserve credit transaction ID.
- Store `creditTransactionId`, charged credits, model, requested duration, actual duration on video batch/jobs.
- Record cost event in the video worker after provider success and on provider failure.
- Include Fal/Kie provider job IDs where available.

Sequential lane B - Clickatron image:

- Record cost event around `fal.subscribe`.
- Include model ID, image count, source service/session IDs, variation ID.
- Add R2 storage/thumbnail storage events or storage byte metadata.

Sequential lane C - Pipeline audio/media:

- Voiceover: Fal Kokoro / Deepgram Speak.
- BGM/SFX: Fal/CassetteAI/Mirelo.
- Musitron: Fal music task.

Verification:

- Existing billing tests plus focused worker tests.
- Mock provider responses; no live Fal/Deepgram calls.

### Phase 3 - Hidden Background Spend and Storage Quota Completion

Goal: close the "user uploaded media and backend spent money even if no edit started" hole.

Storage:

- Connect `checkStorageQuota` to:
  - `app/api/services/editron/media/upload/route.ts`
  - `app/api/services/editron/media/upload/multipart/init/route.ts`
  - `app/api/services/editron/media/upload/multipart/complete/route.ts`
  - upload URL/presign routes if they can allocate storage before registration
- Record storage bytes at final object creation.
- Decrement or reconcile on delete/abort/stale cleanup.

Background analysis:

- In `app/api/internal/workers/asset-analysis/route.ts`, record provider cost events for:
  - video 5-track analysis
  - image Gemini vision
  - embeddings
  - audio metadata if provider-free or local
- In video-analysis/tribe-analysis workers, record:
  - Deepgram/transcription
  - Gemini/vision
  - Modal/GPU calls when present
  - QStash message costs as infra events or metadata.

Verification:

- Upload route tests for quota allowed/exceeded.
- Worker unit tests that provider failures still update analysis status and record failed events.
- A regression test for "analysis credit deducted but QStash dispatch fails -> refund still happens."

### Phase 4 - LLM, Search, Brand, Social

Goal: cover medium/low per-action spend that becomes material at scale.

ThinkForge:

- Hook at the model factory/BaseAgent layer so each LLM call records provider/model/token usage where the SDK exposes it.
- Reuse `ProviderPrivacyAuditRecord` fields for provider/model/route metadata.

CalOS:

- Record Gemini planner calls.
- Record Perplexity/Apify trend provider calls.
- Mark unknown provider pricing as `pricing_to_be_seen`.

Brand Vault:

- Record Apify fallback calls.
- Record Gemini OCR/vision calls.
- Record browser fallback/runtime usage if possible.

UploaderX:

- Record publish attempt events by platform.
- X should be treated as paid API per post/request.
- Other social APIs can be `estimatedCostUsd: 0` unless their current plan invoices show variable charges.

Alyzitron:

- Convert Deepgram request ID and media duration into a cost event.
- Record Fal Whisper fallback.
- Record Gemini/GCS file analysis events.

### Phase 5 - Admin Margin Report

Goal: make the ledger actionable.

Add a backend-only report first. UI can come later.

Report dimensions:

- day/week/month
- org/user
- service/action
- provider/model
- charged credits
- revenue estimate: `chargedCredits / 30`
- estimated provider cost USD
- gross margin USD
- margin percent
- failed provider spend
- retry spend
- pricing gaps count

Queries:

- top 20 margin leaks
- providers with unknown pricing
- users/orgs with negative gross margin
- background jobs with spend but no user-visible success

### Phase 6 - Invoice Reconciliation

Goal: make estimates match vendor bills.

Add:

- `actualCostUsd`
- `invoiceMonth`
- `vendorInvoiceId`
- reconciliation script/import CSV/manual adjustment
- variance report: estimate vs actual

This should not block Phase 1-5.

## Error and Rescue Map

| Codepath | What can go wrong | Rescue action | User impact |
|----------|-------------------|---------------|-------------|
| `recordProviderCostEvent` | DB unavailable | log warning, fail open | user action continues |
| cost estimator | unknown provider/model | write event with `pricing_to_be_seen` | no user impact, report flags gap |
| provider success event | provider returns no request ID | use task/job/event ID | no user impact |
| provider failure event | exception before response body | record failed event with sanitized error class/status | user sees existing route error |
| async worker | duplicate QStash delivery | idempotency key prevents duplicate spend event | no duplicate COGS |
| upload quota check | storage counter unavailable | fail closed for quota check or route-specific decision | user may get retryable error |
| storage usage record | counter write fails after upload | fail soft and flag reconciliation gap | upload continues, admin report flags drift |
| report aggregation | malformed/old events | skip invalid rows and log | admin sees partial report warning |

Critical rule: do not make provider telemetry a new production failure point.

## Security and Privacy Review

Threats:

- Leaking prompts, transcripts, signed URLs, social payloads, or OAuth tokens into finance docs.
- Cross-user/org data exposure in admin reports.
- Letting users infer other users' provider spend.
- Treating scraped/social text as trusted metadata.

Mitigations:

- Cost event metadata must be sanitized by default.
- Admin margin endpoints must require admin auth.
- Store IDs/counts/hashes, not content.
- Never log bearer tokens, signed URLs, request bodies, prompts, transcripts, or provider raw payloads.
- Reuse existing provider privacy audit fields only as classification metadata.

## Performance Review

Provider-cost writes are one extra DB write per paid call. That is acceptable only if:

- Writes are non-blocking or fail-open.
- Indexes support common queries:
  - `{ createdAt: -1 }`
  - `{ service: 1, action: 1, createdAt: -1 }`
  - `{ provider: 1, model: 1, createdAt: -1 }`
  - `{ userId: 1, createdAt: -1 }`
  - `{ orgId: 1, createdAt: -1 }`
  - unique optional idempotency key where present.
- Heavy reporting uses aggregation by time window, not per-request dashboard computation.
- Raw events can be retained for a fixed window and rolled into daily summaries later.

## Test Review

Minimum tests before shipping Phase 1:

- Event sanitize strips secrets, prompts, URLs with signatures, tokens, and raw provider payloads.
- Unknown provider/model produces `pricing_to_be_seen`.
- Event write failure does not throw to caller.
- Duplicate idempotency key is ignored/upserted without double counting.
- Revenue estimate uses `chargedCredits / 30`.

Minimum tests before shipping connected phases:

- Pipeline video success records provider, model, duration seconds, charged credits, revenue, estimated COGS.
- Pipeline video provider failure records failed event without marking success.
- Clickatron Fal generation records image count and model.
- Asset upload analysis dispatch records the credit transaction and worker provider event.
- Multipart upload over quota is rejected before object allocation.
- Storage abort/delete decrements or flags storage usage reconciliation.
- UploaderX X publish records paid platform event after credit gate.

## CEO Review

Recommended mode: SELECTIVE EXPANSION.

Do not expand scope into a full finance dashboard immediately. Do add the provider-cost ledger now, because pricing without COGS telemetry is blind.

Business reason:

- The $100/$500/$1000 plans can be viable only if we can see gross margin per action.
- AI video/image/audio should keep a separate quota, but normal LLM, analysis, storage, posting, and infra still need unit economics.
- A 1-credit mistake seems tiny, but at 100k agencies it can become a serious invoice leak.

12-month dream state:

- Every agency has a margin profile.
- Every product action shows revenue, provider cost, retry waste, and margin.
- Finance can tune credits without guessing.
- Product can spot unprofitable features before invoices land.
- Unknown pricing is a visible red badge, not a buried Slack panic.

Dream state delta after this plan:

- Phase 1 gives the ledger.
- Phase 2-4 gives coverage.
- Phase 5 gives operating visibility.
- Phase 6 gives finance accuracy.

## Eng Review

Main engineering risk:

The tempting shortcut is to put all cost logic inside `CreditsService.deductCredits`. That would be wrong for async jobs. Credits are often deducted before the provider call actually succeeds, and workers may retry, fail, or use a different provider/model than expected.

Correct owner split:

- `CreditsService`: customer credit ledger.
- Provider wrappers/workers: actual provider COGS events.
- Financial report: joins credit revenue and provider cost by `taskId`, `assetId`, `creditTransactionId`, or job ID.

Architecture:

```
Route / user action
  -> validate + credit check
  -> deduct credits
  -> enqueue or call provider
  -> provider wrapper/worker records provider_cost_event
  -> admin report aggregates revenue and COGS
```

State machine:

```
started
  -> success
  -> failed
  -> skipped
  -> refunded
```

Invalid transitions:

- `success -> failed` should create a new correction/refund event, not mutate history silently.
- duplicate `success` for same idempotency key must not double count.

## NOT In Scope

- Live Razorpay plan creation or dashboard editing. Claude handles Razorpay.
- Changing the $100/$500/$1000 pricing in this plan.
- Refreshing all vendor prices from the web in this plan.
- Building a full finance UI in Phase 1.
- Exact invoice reconciliation in Phase 1.
- Rewriting every provider wrapper in one large diff.
- Moving storage quota ownership away from the current `storage-quota-service`.

## Razorpay Boundary

Razorpay should stay in the Claude handoff lane.

Provider-cost telemetry should not call Razorpay and does not require live Razorpay changes. It only needs to know:

- charged credits
- plan/credit allocation
- revenue estimate from credits
- optional subscription/top-up metadata already present in credit transactions

If Phase 1 needs any Razorpay-specific field, add it to the Razorpay handoff doc, not live code.

## Worktree Parallelization

| Lane | Modules | Depends on | Parallel? |
|------|---------|------------|-----------|
| A - foundation ledger | `lib/financials`, `tests/financials` | none | first |
| B - high-spend media | `app/api/services/pipeline`, `app/api/internal/workers/pipeline`, `app/api/internal/workers/clickatron`, `lib/pipeline` | A | can split after A |
| C - storage quota completion | `app/api/services/editron/media/upload`, `lib/services/storage-quota-service` | A optional | can run with B if files do not overlap |
| D - hidden analysis workers | `app/api/internal/workers`, `lib/editron/services` | A | can run with B/C carefully |
| E - LLM/search/social | `lib/thinkforge`, `lib/calos`, `lib/shared`, `app/api/services/uploaderx` | A | can run after A in separate worktree |
| F - reporting | `app/api/admin`, `lib/financials` | A plus enough event coverage | later |

Suggested order:

1. A alone.
2. B + C in parallel only if separate agents/worktrees are used.
3. D + E in parallel after A.
4. F after at least one high-spend lane is emitting events.

## Implementation Tasks

- [x] T1 (P1) - Financials - Add provider cost event foundation.
  - Files: `lib/financials/provider-cost-events.ts`, `lib/financials/provider-cost-estimates.ts`, `tests/financials/*`.
  - Verify: focused financial tests, eslint, typecheck caveat noted.

- [x] T2 (P1) - Pipeline video - Link credit transaction to video batch/job and record provider event.
  - Files: video generation route, video worker, video queue/batch model or direct DB write, tests.
  - Verify: mocked Fal/Kie success/failure tests.

- [x] T3 (P1) - Clickatron - Record Fal image generation COGS and R2 storage bytes.
  - Files: Clickatron worker, R2 helper if needed, tests.
  - Verify: mocked Fal success/failure and R2 upload event test.

- [x] T4 (P1) - Editron uploads - Connect storage quota to multipart and presigned registration paths.
  - Files: multipart init/complete, upload registration, media delete, focused financial wiring test.
  - Implemented in `483b6978 feat: enforce editron storage quota paths`.
  - Verify: 57 focused tests passed, `npx eslint . --quiet` passed, `git diff --check` passed; repo-wide `npx tsc --noEmit` still fails only on unrelated baseline script/test errors.

- [x] T5 (P1) - Hidden analysis - Record provider events inside asset/video/tribe analysis workers.
  - Implemented in `d9d5ac62 feat: record editron asset analysis provider costs`, `9a4805c5 feat: record editron tribe analysis provider costs`, and `a67c120c feat: record editron video analysis provider costs`.
  - Asset-analysis now receives `orgId`, credit transaction ID, and charged credits from upload registration, then records provider cost events for video 5-track analysis, image Gemini vision, local audio metadata, Gemini embeddings, and graph-sync QStash dispatch.
  - Video-analysis now receives auto-edit credit transaction ID/charged credits from `from-asset`, records provider cost events for raw-footage processing, pre-cut V-JEPA Modal, Gemini video understanding, graph-sync QStash, TRIBE QStash, and direct Director QStash. Revenue is attached once on the raw-footage stage to avoid double-counting.
  - Tribe-analysis now records provider cost events for V-JEPA Modal, Wav2Vec Modal, Essentia/music Modal, and Director QStash dispatch, and carries the auto-edit credit transaction ID for traceability. Modal and mixed transcription pipeline pricing intentionally stay `pricing_to_be_seen` until invoice-backed rates are added.
  - Verified with focused financials/storage tests, `npx eslint . --quiet`, and `git diff --check`. Full `npx tsc --noEmit` is still blocked by unrelated baseline script/test errors outside the touched files.
  - Files: workers and focused tests.
  - Verify: worker success/failure events and no user-facing failure from telemetry write failure.

- [ ] T6 (P2) - LLM/Search/Social - Record ThinkForge, CalOS, Brand Vault, Alyzitron, UploaderX events.
  - Files: provider factories/wrappers/routes by service.
  - Verify: mocked token usage/provider event tests.
  - Partial 2026-07-03: UploaderX and CalOS X social provider events are wired for `x-api` cost visibility. Normal UploaderX X publish records media upload and final publish events; chunked UploaderX X publish records start/transfer/finalize/poll/publish phase events; CalOS X scheduled publishing records final publish success/failure. UploaderX final publish events attach the credit transaction ID and the current 3-credit X publish charge only after credit deduction returns a transaction ID. X API pricing remains `pricing_to_be_seen` until invoice-backed rates are added.
  - Partial 2026-07-04: UploaderX YouTube provider events are wired for `youtube-data-api` cost visibility. Normal UploaderX YouTube publish records `videos.insert` media-upload success/failure events; existing-video publish updates record `videos.update` publish success/failure events; thumbnail uploads record separate `thumbnails.set` events without attaching fake revenue. Final YouTube publish revenue attaches the credit transaction ID and the current 1-credit YouTube publish charge only after credit deduction returns a transaction ID. YouTube Data API pricing remains `pricing_to_be_seen` until invoice-backed rates are added.
  - Partial 2026-07-04: UploaderX Facebook direct-route provider events are wired for `meta-graph-api` cost visibility. Existing-video updates record publish update success/failure; small direct uploads record simple-upload success/failure; fallback resumable video/Reel uploads record start/transfer/finish success/failure. Final Facebook publish revenue attaches the credit transaction ID and the current 1-credit Facebook publish charge only after credit deduction returns a transaction ID. Instagram and LinkedIn are still separate T6 follow-up slices. Meta Graph API pricing remains `pricing_to_be_seen` until invoice-backed rates are added.
  - Partial 2026-07-05: UploaderX Facebook chunk-route provider events are wired for `meta-graph-api` cost visibility. Chunked Page videos and Reels now record start, transfer, and finish success/failure events from `app/api/services/uploaderx/facebook/chunk/route.ts`; transfer events include request count and input bytes, while provider identifiers stay sanitized. Final chunk publish revenue attaches the credit transaction ID and the current 1-credit Facebook publish charge only after credit deduction returns a transaction ID. Successful provider finish is still recorded without fake revenue if later DB/event/credit work fails. Meta Graph API chunk-route pricing remains `pricing_to_be_seen` until invoice-backed rates are added.
  - Partial 2026-07-03: Alyzitron transcription provider events are wired for Deepgram Nova-2 and Fal Whisper fallback. The reusable transcription wrapper records Deepgram/Fal success/failure attempts with media seconds and provider IDs when available. The explicit transcribe route records the final charged credits after duration true-up/refund logic; chat-session background transcription records spend without attaching fake revenue. Deepgram and Fal Whisper pricing remain `pricing_to_be_seen` until invoice-backed rates are added.
  - Partial 2026-07-04: Alyzitron chat Gemini provider events are wired for chat completion and rolling summarization. Chat completion records success only after final token true-up and attaches the initial/additional credit transaction IDs plus final charged credits. Failed chat completion records only after the Gemini stream has started, so pre-provider validation/session failures do not create fake spend. Summarization records Gemini token estimates separately and deliberately does not attach charged credits because it is hidden background provider spend. Gemini chat pricing remains `pricing_to_be_seen` until invoice-backed rates are added.
  - Partial 2026-07-04: Alyzitron Gemini video-analysis provider events are wired from the processor. The enqueue route now stores the original video-analysis credit transaction ID and charged credits on the task; the processor records Gemini analysis success only after the task is marked completed, records failed provider/parse/downstream attempts without fake revenue, and refunds with the original transaction ID when available. Gemini video-analysis pricing remains `pricing_to_be_seen` until invoice-backed rates are added.
  - Partial 2026-07-04: Alyzitron Gemini File API upload/poll provider events are wired for R2 and extracted external media paths. Upload telemetry records Gemini File API success/failure, request count including polls, input bytes, processing duration, final state, and provider file name when available. These events intentionally do not attach charged credits because analysis revenue is already attached once to the completed Gemini analysis event. Gemini File API pricing remains `pricing_to_be_seen` until invoice-backed rates are added.

- [x] T7 (P2) - Admin report - Add backend margin aggregation.
  - Files: financial report service and admin route/tests.
  - Verify: aggregation fixture for revenue, COGS, unknown pricing, negative margin.
  - Implemented in `lib/financials/provider-cost-margin-report.ts`, `app/api/admin/financials/provider-cost-margin/route.ts`, and `tests/financials/provider-cost-margin-report.test.ts`.
  - Backend admin route now returns grouped provider margin report data by service, provider, org, user, or day. It includes charged credits, estimated revenue, provider cost, gross margin, missing-pricing counts, failed spend, retry counts, unknown-pricing rows, and negative-margin rows.
  - Verified: focused Vitest margin report test passed, `npx eslint . --quiet` passed, `git diff --check` passed, and gitleaks working-tree scan passed. Full `npx tsc --noEmit --pretty false` remains blocked by unrelated baseline errors, including existing Clickatron/Zod resolution errors, SaaS intake type drift, and legacy script duplicate globals; the new T7 files were not in the emitted error list.

## Verification Notes

Docs-only creation does not require `tsc` or `eslint`.

For implementation phases, do not mark complete until:

- focused tests pass
- `npx eslint . --quiet` passes
- `npx tsc --noEmit` is either green or the known unrelated baseline error is documented with exact file/line

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope and strategy | 1 | CLEAR_WITH_PLAN | Selective expansion recommended: build COGS telemetry, do not expand into full finance dashboard first |
| Codex Review | `/codex review` | Independent second opinion | 0 | SKIPPED | Not run; user requested direct investigation and plan |
| Eng Review | `/plan-eng-review` | Architecture and tests | 1 | CLEAR_WITH_GAPS | Customer credits exist; provider COGS ledger missing; phased plan required |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | NOT_APPLICABLE | Backend/financial telemetry plan only |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | NOT_APPLICABLE | Not requested |

- UNRESOLVED: exact current vendor prices and invoice reconciliation are intentionally deferred; missing prices must be marked `pricing_to_be_seen`.
- VERDICT: CEO + ENG plan review complete enough to implement Phase 1 provider-cost telemetry. Razorpay remains out of scope for Claude handoff.
