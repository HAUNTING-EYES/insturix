# CalOS Content Calendar Production Roadmap

Status: canonical remaining-work ledger

Last reconciled: 2026-07-30

Code baseline: `6f625acb`

Branch: `infrastructure-improvs-+Editron`

## 1. Purpose And Evidence

This document reconciles:

- The complete content-calendar task history from Codex session
  `019f0d67-2f2c-74a1-9e27-0defa21130ed`.
- The top-down calendar, campaign, generation, image, publishing, OAuth, and
  documentation audits performed during that task.
- The implementation history from the first production audit at `f6afd12c`
  through the current baseline at `6f625acb`.
- The current long-form YouTube trace across CalOS, ThinkForge, Editron,
  UploaderX, the publish queue, and the YouTube publisher.

This is the source of truth for what remains. Historical handovers under
`docs/agents/calos/` are evidence, not the current production contract.

## 2. Executive Verdict

CalOS now has a usable V3 calendar shell, campaigns, cadence-based planning,
geographic trends, generation review, batch writing and image actions, account
assignment, publish preflight, queue recovery, retries, and substantially
stronger OAuth health checks.

It is not yet production-complete for a months-ahead workflow.

The main remaining root causes are:

1. AI planning is a synchronous request instead of a durable generation run.
2. Planning, review, writing, image generation, and publishing do not share one
   durable state machine.
3. Image jobs and credit claims are not atomically idempotent.
4. `long_video` is only a label, not a duration and production contract.
5. CalOS does not carry a video from ThinkForge/Editron or an uploaded asset
   into UploaderX's resumable YouTube path.
6. Some UI states claim work is queued or safe without the matching persisted
   operational record.
7. OAuth runtime health is improved, but encryption-at-rest migration and
   execution-time identity validation are incomplete.
8. Production documentation and staging canaries trail the runtime.

## 3. Intended Production Workflow

The final user flow must be:

```text
Choose brand and campaign
-> define per-platform cadence, format mix, and production requirements
-> create a durable planning run
-> review proposed ideas without creating production cards
-> accept selected ideas
-> generate or edit scripts
-> generate, upload, or attach required media
-> review content and media together
-> schedule one or more exact publication occurrences
-> run execution-time account and asset preflight
-> publish through a durable queue
-> reconcile provider outcomes
-> show the final URL or an actionable failure
```

The system must support both:

- AI-assisted production, including ThinkForge scripts and Editron videos.
- User-supplied production, including a completed long-form video uploaded
  through UploaderX and attached to a calendar deliverable.

## 4. What Is Already Implemented

These capabilities are implemented. They may still have follow-up work listed
later in this document.

### 4.1 Calendar And Campaign UX

- V3 is the active `/dashboard/calos` implementation.
- Campaign creation has a viewport-level modal and working submission flow.
- Campaign cadence supports platforms, posts per week, and selected weekdays.
- Clicking a populated day opens an agenda; clicking a card opens the editor.
- Empty days expose explicit new-content creation.
- Clear All and Delete Day exist with confirmation.
- Closing a newly created empty draft no longer silently deletes it.
- The calendar toolbar was reduced from the earlier cluttered version.
- Auto-fill and AI Plan are separate commands.

### 4.2 Planning, Trends, References, And Generation

- Auto-fill deterministically fills cadence gaps.
- AI Plan uses campaign context, brand context, existing ideas, and trends.
- Trend discovery supports a geography selector and a local default.
- Perplexity Sonar is used for trend and web discovery.
- Gemini Flash Lite is used for plan building.
- Campaign and brand references can be uploaded and used by later writers.
- Accepted ideas can be batch-generated into scripts.
- Batch still-image generation exists.
- Cards can be redistributed across cadence dates.

### 4.3 Publishing Reliability

- Social assignment routes enforce brand authorization.
- Approved jobs snapshot their assigned publishing account.
- Publish health and confirmed retry are visible.
- Stale queue claims are recoverable.
- Publisher outcomes distinguish safe retries from ambiguous provider attempts.
- Approval and queue creation are transactional.
- Pending job snapshots are refreshed after edits and reapproval.
- Instagram token expiry, proactive refresh, identity, and assignment health are
  handled.
- LinkedIn refresh is supported for the active token models.
- Facebook Page assignments are live-validated.
- YouTube assignments bind a real channel identity and preflight that identity.

### 4.4 Facebook Encryption Migration Completed So Far

- CalOS Facebook publisher reads encrypted Page tokens.
- Facebook assignment and health readers accept encrypted tokens.
- UploaderX Facebook pages/status reads encrypted Page tokens.
- UploaderX whole-file and chunked Facebook publishers decrypt credentials
  before provider work and reject unreadable ciphertext before media or credit
  work.
- Legacy plaintext Facebook credentials remain readable during migration.

Relevant hardening commits:

```text
52d623cf fix(calos): enforce brand access on social assignments
15dbb874 fix(calos): authorize linkedin and x brand connections
f9347111 fix(calos): fail closed on stale social identities
47edaf88 fix(calos): snapshot publish accounts on approval
b66ea619 fix(calos): expose publish health and confirmed retry
dc959d67 fix(calos): harden publish queue recovery
c25afc0e fix(calos): normalize publisher outcomes
2182bc69 fix(calos): normalize linkedin and x outcomes
021c8d72 fix(calos): harden instagram publishing
d0f11a87 fix(calos): manage instagram token expiry
d4fd8bf1 fix(calos): surface instagram connection health
d48ce832 fix(calos): validate live instagram assignments
89fe6914 fix(calos): refresh instagram tokens proactively
ce031c7a fix(calos): preflight publishing credentials
c88a346a fix(calos): make approval enqueue atomic
c9e73ac9 fix(calos): refresh pending publish snapshots
c878b8e8 fix(calos): refresh brand linkedin tokens
d3ec38db fix(calos): validate facebook page tokens
4c03d99a fix(uploaderx): harden facebook oauth exchange
217eff6d fix(uploaderx): verify facebook page connections
24323320 fix(calos): bind youtube channel identity
54e6195e fix(calos): verify youtube preflight identity
0b240fe3 fix(calos): read encrypted facebook tokens
05af9ac5 fix(facebook): read encrypted assignment tokens
6f625acb fix(uploaderx): read encrypted facebook tokens
```

## 5. Remaining Work: Release Blockers

### CAL-P0-01: Durable AI Planning Runs

Problem:

- `/api/services/calos/ai-plan` still performs model generation and persistence
  inside one synchronous Vercel invocation.
- The observed 504 can recur even when the provider returns successfully.
- There is no resumable checkpoint, cancellation, exact created-ID receipt, or
  durable progress state.

Required production form:

- Add a `GenerationRun` owner with `queued`, `planning`, `awaiting_review`,
  `materializing`, `completed`, `failed`, and `cancelled` states.
- Return `202` plus `runId`.
- Plan long ranges in bounded weekly chunks.
- Persist checkpoints, errors, model metadata, exact proposal IDs, and exact
  accepted card IDs.
- Make retries resume from the last completed chunk.
- Apply a maximum planning range and per-run card limit.

Acceptance criteria:

- A 90-day plan cannot fail because one browser request reaches 60 seconds.
- Refreshing or reopening the calendar resumes the same run.
- Repeating a request cannot create duplicate slots.
- The UI displays truthful run progress and a recoverable failure.

Primary owners:

- `app/api/services/calos/ai-plan/route.ts`
- New generation-run schema and worker
- `components/dashboard/calos/v3/calos-campaign-bar.tsx`

### CAL-P0-02: Safe Preview And Review Attribution

Problem:

- AI review currently infers generated cards by comparing before/after ID lists.
- A failed initial fetch or concurrent card creation can classify an unrelated
  draft as generated by the current run.
- Removing an idea from review deletes a real persisted card.

Required production form:

- Store proposals under `GenerationRun`; do not materialize deliverables before
  acceptance.
- Review exact run-owned proposal IDs.
- Materialize only accepted proposals.
- Keep rejection as proposal state, not deliverable deletion.

Acceptance criteria:

- A review action can never delete a card outside its run.
- Concurrent planning runs remain isolated.
- Campaignless plans retain explicit ownership and attribution.

Primary owners:

- `components/dashboard/calos/v3/calos-generation-review.tsx`
- `components/dashboard/calos/v3/calos-campaign-bar.tsx`
- Generation-run API

### CAL-P0-03: Atomic Image Jobs And Credit Claims

Problem:

- Concurrent Make Image or Make All Images requests can both deduct credits and
  launch duplicate provider jobs.
- A provider success followed by a database failure can leave a paid,
  untracked job.
- Stuck image job IDs have no lease expiry or provider reconciliation.

Required production form:

- Add one idempotency key per deliverable, generation revision, and requested
  image variant.
- Claim work and reserve credits atomically before provider dispatch.
- Dispatch through an outbox or durable worker.
- Add job leases, retry policy, provider reconciliation, and credit rollback or
  adjustment rules.
- Add a batch-level lock for Make All Images.

Acceptance criteria:

- Repeated clicks create one paid provider job.
- Every provider job has a persisted local owner.
- Stale jobs recover or become actionable failures.
- Completed images can be accepted, rejected, prompt-edited, or regenerated.

Primary owners:

- `app/api/services/calos/make-image/route.ts`
- Clickatron callback and shared image-job primitive
- `components/dashboard/calos/v3/calos-calendar.tsx`
- `components/dashboard/calos/v3/calos-content-modal.tsx`

### CAL-P0-04: Truthful Approval And Publish State

Problem:

- The editor can show "Queued - auto-posts" without a corresponding queue row.
- Publish status fetch failures are swallowed.
- Missing or invalid media can be discovered months after approval.

Required production form:

- Derive user-facing state only from persisted deliverable and queue records.
- Distinguish `approved_editorial`, `preflight_blocked`, `queued`, `publishing`,
  `published`, `failed_retryable`, `failed_terminal`, and
  `needs_reconciliation`.
- Refuse queueing when required assets or metadata are missing.

Acceptance criteria:

- No queue row means the UI never claims that auto-posting is queued.
- Every blocked state explains the exact account, asset, or metadata action.
- Queue state refreshes while work is active.

Primary owners:

- `components/dashboard/calos/v3/calos-content-modal.tsx`
- `app/api/services/calos/deliverables/[id]/decision/route.ts`
- `app/api/services/calos/publish-status/route.ts`

### CAL-P0-05: First-Class Long-Form YouTube Contract

Current verdict:

- CalOS can schedule a YouTube slot and may label it `long_video`.
- It cannot reliably plan, produce, attach, or publish a 5-10 minute YouTube
  video end to end.
- UploaderX can upload long videos separately, but that path is not connected to
  the CalOS queue.

Root cause:

- `long_video` is only a planner label.
- Campaigns do not specify format mix, duration, or production requirements.
- ThinkForge duration and scene sidecars are discarded by the CalOS adapter.
- CalOS has a still-image asset contract, not a typed media contract.
- Approval queues `caption` and `imageUrl`, not a video reference and YouTube
  metadata.
- The CalOS YouTube publisher treats `imageUrl` as a video URL and does not use
  UploaderX's resumable upload state.

Required production form:

- Campaign rules such as `YouTube long video`, `1/week`, `5-10 minutes`.
- Required format and duration on every planned slot.
- Structured outline, chapters, research requirements, CTA, thumbnail brief,
  B-roll, footage, and asset requirements.
- Duration-bound ThinkForge generation with sidecar preservation.
- Typed `MediaAsset` records for image, audio, and video.
- Two supported media sources: completed upload or Editron render.
- Editron job handoff and completed-render callback.
- UploaderX resumable YouTube publishing from CalOS queue jobs.
- Explicit title, description, thumbnail, category, privacy, and publish time.

Acceptance criteria:

- A user can request four 5-10 minute YouTube videos in a month and see four
  explicit long-form slots before generation.
- Every script has a target duration and structured production sidecar.
- Every approved YouTube job has a real completed video asset.
- A long upload survives function restarts through resumable state.
- The published video uses reviewed metadata and the assigned channel.

Primary owners:

- `schemas/calos-campaign.ts`
- `lib/thinkforge/planning/content-card-contract.ts`
- `lib/calos/generate/contract.ts`
- `lib/calos/generate/generators/_script-writer.ts`
- `lib/calos/create-thinkforge-session.ts`
- `schemas/calos-deliverable.ts`
- ThinkForge to Editron export
- Editron completion callback
- CalOS decision/queue contract
- UploaderX YouTube resumable publisher

### CAL-P0-06: Finish OAuth Encryption At Rest

Facebook remaining:

- Decrypt Page tokens before Brand Vault Graph reads.
- Encrypt user and Page tokens in the Facebook OAuth callback.
- Backfill existing plaintext Facebook credentials.
- Add key-version migration, rollback, and corrupt-ciphertext tests.

Other platform remaining:

- Encrypt Instagram user credentials.
- Encrypt UploaderX LinkedIn operator credentials.
- Encrypt X access and refresh credentials.
- Inventory every reader, health checker, callback writer, refresher, reset
  route, Brand Vault consumer, test fixture, and dynamic import before each
  writer switches to encrypted output.

Acceptance criteria:

- No newly connected social account stores plaintext OAuth credentials.
- Legacy plaintext remains readable only for the documented migration window.
- A corrupt token fails closed and produces a reconnect action.
- Key rotation can be performed without a platform outage.

Primary Facebook owners:

- `lib/shared/brand-vault-connected-social-ingestion.ts`
- `app/api/services/uploaderx/facebook/callback/route.ts`
- Facebook callback and Brand Vault tests

## 6. Remaining Work: High-Priority Correctness

### CAL-P1-01: Atomic Content Slots And Deduplication

- Replace read-before-write slot deduplication with an atomic unique slot key.
- Remove the 200-card visibility ceiling from duplicate prevention.
- Give Auto-fill and AI Plan the same slot ownership contract.
- Add range and output limits.
- Decide how two campaigns may intentionally share a date and platform.

### CAL-P1-02: Planning Quality And Brand Fidelity

- Fail visibly when required brand context cannot be resolved.
- Do not silently emit generic `"linkedin post"` fallback cards.
- Feed campaign references into idea planning, not only later script writing.
- Preserve trend provenance and explain how each trend can be adapted to the
  brand instead of forcing every trend into brand language.
- Add planner quality evaluations for brand fit, novelty, campaign objective,
  platform fit, duration, and format mix.

### CAL-P1-03: Auto-Fill And Manual Card Contracts

- Auto-fill must assign a valid `contentFormat`.
- YouTube Auto-fill must not fall back to text generation.
- Manual cards must support campaign, platform, format, and duration selection.
- Format and duration must be visible in review, calendar chips, and the editor.

### CAL-P1-04: Real Calendar Periods And Future Planning

- Let users select an actual calendar month or arbitrary date range.
- Stop labeling rolling 30/90-day windows as Month and Quarter.
- Make `+ New` use the visible or selected future date.
- Clear stale selected-day state when changing period or view.
- Make location scope explicit: it affects trend discovery and AI planning, not
  deterministic Auto-fill.

### CAL-P1-05: Safe Distribution And Multi-Date Semantics

- Constrain Distribute to the selected campaign and visible planning range.
- Preserve valid existing dates unless the user explicitly replaces them.
- Add dry-run preview and rollback for partial failures.
- Decide whether multiple planned dates mean repeated publication, alternate
  candidate dates, or one primary plus reminders.
- If they mean repeated publication, create one queue occurrence per date.

### CAL-P1-06: Campaign And Editor Save Integrity

- Include campaign name in update contracts.
- Prevent modal close while campaign edits are unsaved.
- Replace unawaited blur saves with an explicit pending/saved/error state.
- Flush pending title, brief, tag, date, and format edits before Generate,
  Approve, or Close.
- Add revision conflict handling so stale tabs cannot overwrite newer content.

### CAL-P1-07: Media Review Workflow

- Show script, image/video, metadata, and production requirements together.
- Allow image prompt editing, regeneration, acceptance, and rejection.
- Show media source, generation job, dimensions, duration, MIME type, and
  readiness.
- Preserve all ThinkForge writer sidecars and Editron production manifests.

### CAL-P1-08: Execution-Time Social Preflight

- Revalidate exact account identity immediately before every scheduled publish.
- Define a Facebook Page reconnect/refresh owner.
- Verify Instagram account identity during approval, not only execution.
- Live-check LinkedIn organization permissions and revocation.
- Treat X refresh 429/5xx failures as transient, not immediate reconnect.
- Add provider request timeouts.

### CAL-P1-09: Provider Outcome Reconciliation

- Store provider operation receipts before and after network calls.
- Add a reconciliation state for timeouts and ambiguous 5xx outcomes.
- Query provider state before any manual replay that could duplicate a post.
- Surface reconciliation actions in an operational queue dashboard.

### CAL-P1-10: Publishing Feature Parity

- Add generated/uploaded media publishing for LinkedIn.
- Add generated/uploaded media publishing for X.
- Preserve YouTube title, description, thumbnail, category, privacy, and
  scheduling fields.
- Clearly mark TikTok as editorial-only until a real publisher exists.

## 7. Remaining Work: Operations, Testing, And Documentation

### CAL-P2-01: Operational Queue Dashboard

The dashboard must show:

- Run/job/card/campaign identifiers.
- Platform and exact assigned account.
- Scheduled time and current state.
- Last attempt, next attempt, and attempt count.
- Provider receipt or final URL.
- Retry, reconcile, cancel, and reconnect actions.
- Kill-switch state and cron freshness.

### CAL-P2-02: Monitoring And Alerts

Add metrics and alerts for:

- Oldest queued and publishing job age.
- Generation runs stalled by stage.
- Image/render jobs with expired leases.
- Credential expiry and reconnect counts.
- Provider 401/403/429/5xx rates.
- Ambiguous outcomes awaiting reconciliation.
- Duplicate slot or idempotency conflicts.
- Credit reservations without completed provider work.
- Cron missed-run detection.

### CAL-P2-03: Staging Canaries

Create reproducible canaries for:

- Facebook Page text/image/video where supported.
- Instagram image publishing and refreshed-token execution.
- LinkedIn member and organization posting.
- X text and media posting.
- YouTube long-video resumable upload to the exact assigned channel.
- Revoked-token, wrong-account, transient-provider, timeout, and ambiguous
  response behavior.

Every canary receipt must record commit, environment, account type, provider
resource ID, timestamps, and cleanup result without storing credentials.

### CAL-P2-04: Automated Test Coverage

- Replace source-string calendar regressions with browser interaction tests.
- Add concurrent planning and exact-run attribution tests.
- Add atomic image credit/idempotency tests.
- Add long-form planner, script-duration, sidecar, media, and upload tests.
- Add queue occurrence tests for multi-date semantics.
- Add end-to-end account drift and token refresh tests.
- Add crash/retry/reconciliation tests around provider acceptance boundaries.
- Require clean scoped TypeScript and ESLint checks for every phase.
- Restore a clean repository-wide TypeScript release gate after unrelated
  generated-route and Editron baseline errors are resolved.

### CAL-P2-05: Documentation Set

Create or replace:

1. `docs/calos/README.md`
   - User workflow, campaign cadence, Auto-fill, AI Plan, geography, review,
     writing, media, approval, and delivery.
2. `docs/calos/architecture.md`
   - Data owners, state machines, producer/decision-owner/consumer paths, and
     service boundaries.
3. `docs/calos/api-contracts.md`
   - Generation runs, proposals, deliverables, media assets, queue occurrences,
     callbacks, errors, and idempotency.
4. `docs/calos/social-publishing.md`
   - Platform capability and credential lifecycle matrix.
5. `docs/runbooks/calos-publishing.md`
   - Cron, kill switch, retries, reconciliation, rollback, alerts, and canaries.
6. `docs/config/calos-uploaderx-env.md`
   - Safe environment-variable names, ownership, scope, defaults, redirects,
     and rotation. Never include secret values.
7. `docs/adr/calos-durable-generation.md`
   - Why durable runs and accepted-proposal materialization replace synchronous
     generation and before/after diffing.
8. `docs/uploaderx/README.md`
   - Current active cockpit and real platform route/capability map.
9. `.env.example`
   - Safe placeholders generated from the authoritative environment contract.

Correct or retire:

- `Documentation/FACEBOOK_INSTAGRAM_INTEGRATION_PLAN.md`
- `docs/UPLOADERX_WALKTHROUGH.md`
- Legacy sections of `docs/UPLOADERX_FIELD_WIRING_INVENTORY.md`
- `migrations/gcp-account-switch/01-OAUTH-GUIDE.md`
- `app/api/services/Service_Production_Guide.md`

Required corrections include:

- Instagram Login does not require a Facebook Page in the current architecture.
- Social credentials live on `User`, not one legacy `UploaderX` token object.
- Never recommend plaintext secret files or pasting credentials into chat.
- Document `youtube.upload` verification and exact-channel identity.
- Remove old-machine `file:///C:/...` links.
- Document current environment names, cron ownership, token encryption, and
  publishing kill switches.

## 8. Recommended Execution Order

Repository rules require each implementation phase to touch no more than five
files and to stop for verification and approval before the next phase. Large
work items below must therefore be split into small reviewed slices.

### Phase 1: Complete Facebook Encryption

- Brand Vault encrypted reads.
- OAuth callback encrypted writes.
- Legacy/corrupt token tests.
- Migration and rollback note.

Exit gate:

- All Facebook readers accept encrypted tokens.
- New callbacks write only encrypted credentials.
- Focused tests, subsystem tests, TypeScript, and ESLint pass for the slice.

### Phase 2: Truthful Immediate UX Guardrails

- Remove false queued fallback.
- Block approval when required platform assets are missing.
- Surface publish-status fetch failures.
- Add explicit save-pending state before critical actions.

Exit gate:

- The UI never promises a queue or publish operation without its persisted
  record.

### Phase 3: Durable GenerationRun Foundation

- Schema and state machine.
- Create/status/cancel API contracts.
- Atomic request idempotency.
- Weekly chunk checkpoint contract.

Exit gate:

- A run can be created, resumed, cancelled, and inspected without creating
  deliverables.

### Phase 4: Durable Planner Worker

- Move model planning out of the browser request.
- Chunk long periods.
- Add atomic slot keys and range limits.
- Persist exact proposals and failures.

Exit gate:

- 90-day planning survives request and worker restarts without duplicates.

### Phase 5: Safe Review And Materialization

- Review run-owned proposals.
- Accept/reject without deleting unrelated cards.
- Materialize accepted proposals only.
- Remove before/after card inference.

Exit gate:

- Concurrent runs and campaignless runs cannot cross-delete or misattribute
  content.

### Phase 6: Calendar And Campaign Correctness

- Real period/date-range selection.
- Future-date new content.
- Campaign update integrity.
- Safe distribution preview.
- Defined multi-date behavior.

Exit gate:

- A user can plan an arbitrary future month and predict every date mutation
  before applying it.

### Phase 7: Durable Image Production

- Atomic credit reservation.
- Idempotent image jobs and batch lock.
- Leases and reconciliation.
- Image review/regeneration states.

Exit gate:

- Repeated actions cannot double-charge or orphan paid jobs.

### Phase 8: Long-Form Planning Contract

- Per-platform format mix and target duration.
- Slot/card/deliverable schema propagation.
- Planner constraints and evaluations.
- Format/duration controls in review and editor.

Exit gate:

- A monthly campaign can explicitly require a count of 5-10 minute YouTube
  videos, and every resulting slot preserves that requirement.

### Phase 9: ThinkForge And Editron Handoff

- Preserve writer sidecars.
- Create duration-bound production briefs.
- Start or attach Editron work.
- Receive and reconcile completed video assets.

Exit gate:

- Every long-form card can reach a completed, typed video asset with traceable
  script, production, and render lineage.

### Phase 10: CalOS To UploaderX Video Publishing

- Queue typed media and YouTube metadata.
- Use resumable upload state.
- Block incomplete renders/uploads.
- Reconcile ambiguous provider outcomes.

Exit gate:

- A completed 5-10 minute video publishes to the exact assigned channel without
  relying on a single function invocation.

### Phase 11: Remaining OAuth And Platform Parity

- Encrypt Instagram credentials.
- Encrypt LinkedIn operator credentials.
- Encrypt X credentials.
- Add execution-time identity checks.
- Add LinkedIn and X media publishing in separate reviewed slices.

Exit gate:

- New credentials are encrypted and every platform publishes only to its exact
  assigned identity.

### Phase 12: Operations, Canaries, And Documentation

- Queue dashboard and alerts.
- Platform canaries.
- Current architecture, API, environment, and runbook documents.
- Retire unsafe historical instructions.
- Browser-level workflow test suite.

Exit gate:

- An operator can diagnose and recover every supported failure without database
  guesswork, and every claimed platform capability has a reproducible staging
  receipt.

## 9. Final Definition Of Done

CalOS is production-ready only when all statements below are true:

- Campaign creation and editing persist every visible field.
- A user can plan any future date range, including a calendar month.
- Auto-fill, AI Plan, and manual creation produce the same complete slot
  contract.
- AI planning is durable, resumable, bounded, and duplicate-safe.
- Review cannot delete or modify content outside its generation run.
- Brand and campaign references influence planning as well as generation.
- Every deliverable has an explicit platform, format, production requirement,
  revision, and asset state.
- Image and video jobs are idempotent, lease-backed, and credit-safe.
- Five-to-ten-minute YouTube videos can be planned, scripted, produced or
  uploaded, reviewed, scheduled, and resumably published.
- Multi-date behavior is explicit and represented by exact queue occurrences.
- Approval cannot succeed into a false or unpublishable state.
- Every scheduled publish revalidates the exact assigned account.
- Provider ambiguity is reconciled before any replay that could duplicate a
  post.
- New OAuth credentials are encrypted at rest.
- Queue, generation, media, token, and cron health are observable.
- Every platform has a staging canary and incident runbook.
- Browser tests cover the primary month-ahead workflow.
- TypeScript, ESLint, focused tests, subsystem tests, and release canaries pass
  at the production commit.

## 10. Scope Boundary

This roadmap does not claim that CalOS, ThinkForge, Editron, and UploaderX are
already one merged pipeline.

Current reality is partial convergence:

- CalOS can call ThinkForge for script text.
- ThinkForge can separately export work toward Editron.
- Editron can separately produce video.
- UploaderX can separately upload long-form YouTube video.
- CalOS social publishing has its own queue and publisher contracts.

Production convergence requires the explicit contracts, ownership, callbacks,
state transitions, and final consumers listed in this roadmap.
