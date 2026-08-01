# CalOS Content Calendar Production Roadmap

Status: canonical remaining-work ledger

Last reconciled: 2026-08-02

Production code baseline: `590bbdb8` (`origin/main`)

Audited mirror: `infrastructure-improvs-+Editron` (active CalOS paths match the
production baseline; unrelated Editron commits continue to advance this branch)

## 1. Purpose And Evidence

This document reconciles:

- The complete content-calendar task history from Codex session
  `019f0d67-2f2c-74a1-9e27-0defa21130ed`.
- The top-down calendar, campaign, generation, image, publishing, OAuth, and
  documentation audits performed during that task.
- The implementation history from the first production audit at `f6afd12c`
  through the production Facebook migration at `590bbdb8`.
- The current long-form YouTube trace across CalOS, ThinkForge, Editron,
  UploaderX, the publish queue, and the YouTube publisher.

This is the source of truth for what remains. Historical handovers under
`docs/agents/calos/` are evidence, not the current production contract.

## 1A. 2026-08-02 Code Reconciliation

This reconciliation was performed against the deployed `main` implementation.
The scoped CalOS code is byte-equivalent on the audited infrastructure mirror;
the branches have different commit hashes because the hardening stack was
cherry-picked onto `main`.

Status meanings:

- `COMPLETE`: the production control flow and the stated exit gate were both
  verified.
- `PARTIAL`: useful implementation exists, but the exit gate is not satisfied.
- `MISSING`: the required production owner or control flow does not exist.

### What "Months Ahead" Already Means

The active V3 campaign controls were designed around rolling windows: `Week`
means the next 7 days, `Month` the next 30 days, and `Quarter` the next 90 days.
This is not a regression from a selected-calendar-month contract. A separate,
directly addressable campaign workspace contains `Rest of this month` and `Next
month` helpers, but arbitrary start/end selection and planning from the visible
calendar month were never completed in the primary V3 workflow.

The current product can:

- Navigate real month, week, and day calendar views.
- Create campaigns with per-platform cadence and preferred weekdays.
- Fill rolling 7, 30, or 90-day windows with Auto-fill or AI Plan.
- Use brand context, campaign objective/theme, geographic trends, and existing
  ideas during AI planning.
- Batch-generate scripts, start still-image work, redistribute campaign cards,
  review editorial content, approve it, and enqueue supported social posts.

This is a substantial calendar and planning shell. It is not yet the durable
months-ahead production system defined in Section 3.

The current primary flow is:

```text
campaign bar
-> synchronous Auto-fill or AI Plan request
-> immediate calos_deliverables insert
-> client before/after ID diff for "review"
-> per-card script/image actions
-> approval transaction creates one publish row
-> CalOS platform publisher
```

The final required flow introduces separate durable owners for planning runs,
proposals, generation/media jobs, typed assets, publication occurrences, and
provider reconciliation. A deliverable cannot safely own all of those
lifecycles by itself.

### Remaining-Work Status

Release blockers:

| ID | Status | Verified current state |
| --- | --- | --- |
| CAL-P0-01 | MISSING | AI Plan still performs one model call and persistence inside a 60-second request; no `GenerationRun`, checkpoints, resume, cancel, or run receipt exists. |
| CAL-P0-02 | MISSING | Review still infers new cards by before/after ID diff; removal deletes an already-persisted deliverable. |
| CAL-P0-03 | PARTIAL | Image kickoff and callback exist, but the credit deduction, job dispatch, and deliverable claim are not atomic; batch generation has no durable lock or lease. |
| CAL-P0-04 | PARTIAL | Approval and queue insertion are transactional, but media preflight, truthful missing-status UI, active polling, and save flushing remain incomplete. |
| CAL-P0-05 | MISSING | Long-form labels and separate downstream tools exist, but no duration-bound CalOS-to-ThinkForge-to-Editron-to-UploaderX production path exists. |
| CAL-P0-06 | PARTIAL | Facebook encrypted writes/readers and production backfill are complete; legacy compatibility, key rotation, Instagram, LinkedIn, and X encryption remain. |

High-priority correctness:

| ID | Status | Verified current state |
| --- | --- | --- |
| CAL-P1-01 | PARTIAL | Read-before-write deduplication exists, but there is no atomic unique slot key and AI Plan still scans at most 200 cards. |
| CAL-P1-02 | PARTIAL | Rich brand/trend context exists, but planning can continue brandless, emit generic fallbacks, ignores campaign references, and has no quality evaluation gate. |
| CAL-P1-03 | MISSING | Auto-fill and manual cards do not carry a complete platform/format/duration contract; YouTube Auto-fill can fall back to text generation. |
| CAL-P1-04 | PARTIAL | Rolling 7/30/90-day planning works as originally designed. The primary V3 flow has no arbitrary range or visible-month planning owner, while future `+ New` behavior remains inconsistent. |
| CAL-P1-05 | PARTIAL | Campaign-scoped redistribution exists, but it replaces dates through independent PATCHes without preview/rollback; approval publishes only the first planned date. |
| CAL-P1-06 | PARTIAL | APIs support several fields and versions, but the UI omits campaign-name updates, has no dirty-close/save barrier, and has no revision compare-and-set. |
| CAL-P1-07 | PARTIAL | Script and image state are visible, but media prompt editing, accept/reject/regenerate, typed metadata, and production manifests are absent. |
| CAL-P1-08 | PARTIAL | Approval/status preflight is strong for several providers, but the execution worker does not rerun the shared live-health owner immediately before publishing. |
| CAL-P1-09 | PARTIAL | Ambiguous outcomes are blocked from unsafe automatic replay, but durable before/after provider receipts and provider-state reconciliation do not exist. |
| CAL-P1-10 | PARTIAL | Core text publishing exists; LinkedIn/X media, complete YouTube metadata, and an explicit TikTok editorial-only contract remain. |

Operations, testing, and documentation:

| ID | Status | Verified current state |
| --- | --- | --- |
| CAL-P2-01 | PARTIAL | Card-level status, account, error, URL, and retry exist; there is no queue operations dashboard or reconciliation/cancel surface. |
| CAL-P2-02 | MISSING | Required queue, generation, media, credential, provider, credit, and cron metrics/alerts do not exist. |
| CAL-P2-03 | MISSING | No reproducible social staging canary suite or non-secret receipt artifact exists. |
| CAL-P2-04 | PARTIAL | Publishing hardening has focused tests, but planning concurrency, image-credit atomicity, long-form, multi-date, reconciliation, and browser workflows are uncovered. |
| CAL-P2-05 | MISSING | None of the nine required production documentation paths in Section 7 exists yet. |

Current count across the 21 remaining-work items:

```text
COMPLETE  0
PARTIAL  14
MISSING   7
```

These counts describe exit-gate status, not implementation effort. Several
`PARTIAL` items contain meaningful production plumbing.

### Original Nine-Phase Audit Status

This table preserves the exit conditions from the first top-down production
audit instead of replacing them with later roadmap wording.

| Phase | Status | Remaining exit-gate work |
| --- | --- | --- |
| 0. Dead-code cleanup | COMPLETE AS NEEDED | Retired calendar-shell code was removed separately. Repeat this procedural gate before any future structural refactor of a 300+ line file. |
| 1. Brand authorization and account ownership | COMPLETE | Cross-tenant assignment and OAuth requests return `403`. LinkedIn Model A exact-destination verification remains tracked under credential preflight. |
| 2. Credential health and platform preflight | PARTIAL | Finish LinkedIn/X scope evaluation, Instagram destination verification, execution-time shared health checks, and truthful status-fetch failure handling. |
| 3. Queue leases, backoff, cancellation, and recovery | PARTIAL | Add cancellation, enforce the attempt budget while claiming/reclaiming, and execute crash/recovery tests rather than asserting query source only. |
| 4. Transactional approval and immutable snapshots | PARTIAL | Approval/enqueue is transactional. Add immutable approval/occurrence identity instead of mutating the pending snapshot on reapproval. |
| 5. Truthful publish-status and calendar states | PARTIAL | Remove the no-row `Queued` fallback, distinguish pending/claimed/publishing, poll active work, surface fetch failure, and stop displaying assignment-only `Active`. |
| 6. Campaign runs, bounded planning, geography, and evidence | MISSING CORE | Geography, Sonar evidence, and stable `gemini-3.1-flash-lite` are shipped. Add durable run ownership, bounded chunks, checkpoints, cancel/resume, and duplicate-safe restart. |
| 7. Batch review and calendar UX | PARTIAL | Batch scripts/images and day controls exist. Add a day drawer, campaign grid filtering, multi-select review, future-date creation, and proposal-safe rejection. |
| 8. Copy, image, and Editron video orchestration | PARTIAL | Add versioned typed assets, atomic idempotent image work, media review gates, and an owned CalOS-to-Editron video handoff. |
| 9. E2E tests, observability, and cron verification | PARTIAL | Add CalOS browser E2E, month-plan and concurrency scenarios, cron receipts/freshness, metrics, alerts, canaries, and an operations surface. |

Original-phase aggregate: one product phase complete, seven partial, and the
core durable campaign-run phase missing. Phase 0 is a procedural gate.

### Execution-Phase Status

| Phase | Status | Exit-gate verdict |
| --- | --- | --- |
| 1A. Facebook reader/writer boundary | COMPLETE | Encrypted readers and fail-closed callback writes are deployed. |
| 1B. Facebook legacy backfill | COMPLETE | Production migrated 6/6 secrets, verified zero plaintext/unreadable values, and passed an idempotent rerun. |
| 2. Truthful immediate UX | PARTIAL | Real queue/error/retry data is available, but false queued fallback, missing media preflight, swallowed status errors, and absent save barrier remain. |
| 3. GenerationRun foundation | MISSING | No run schema/state machine or create/status/cancel contract exists. |
| 4. Durable planner worker | MISSING | Planning remains one synchronous request with no checkpoints or atomic slots. |
| 5. Safe review/materialization | MISSING | Review operates on persisted deliverables and deletes them when pruned. |
| 6. Calendar/campaign correctness | PARTIAL | Real calendar navigation exists; arbitrary planning range, safe distribution, conflict handling, and multi-date execution do not. |
| 7. Durable image production | MISSING | Existing image plumbing does not satisfy atomic credit/job ownership or lease-backed recovery. |
| 8. Long-form planning contract | MISSING | Campaigns and slots cannot require a count of 5-10 minute videos. |
| 9. ThinkForge/Editron handoff | PARTIAL | Separate tools and generic callback plumbing exist; no typed, traceable CalOS handoff does. |
| 10. CalOS/UploaderX video publishing | PARTIAL | Separate CalOS direct and UploaderX resumable publishers exist; CalOS does not use durable UploaderX resume state. |
| 11. OAuth/platform parity | PARTIAL | Facebook is migrated and provider health is stronger; other encryption and media parity remain. |
| 12. Operations/canaries/docs | PARTIAL | Focused tests and card-level status exist; dashboard, alerts, canaries, browser suite, and docs remain. |

Audit verification:

- Full `tests/calos` run on 2026-08-02: 28 files, 201 tests passed.
- Missing coverage remains part of the roadmap: no CalOS browser E2E,
  selected-month/month-plan workflow, durable 90-day run, image-credit race,
  long-form handoff, or production cron receipt scenario exists.
- Repository ESLint passed during the audit.
- The infrastructure checkout has unrelated pre-existing TypeScript diagnostics
  in generated route checks and Editron/script files; none reference the
  audited CalOS paths. The production `main` TypeScript check passed at
  `590bbdb8`.

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
- Stable GA `gemini-3.1-flash-lite` is used for plan building. The retired
  `gemini-3.1-flash-lite-preview` identifier is not used.
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
- Brand Vault decrypts connected Facebook credentials at the Graph boundary and
  disables post reads when stored ciphertext is unreadable.
- The Facebook OAuth callback encrypts the long-lived user token and every Page
  token before Mongo persistence, and fails closed when encryption is
  unavailable.
- A bounded, dry-run-by-default migration audits and encrypts legacy user/Page
  tokens with per-secret compare-and-set updates. The production procedure and
  rollback constraints are documented in
  `docs/calos/FACEBOOK_TOKEN_MIGRATION_RUNBOOK.md`.
- The production backfill ran on 2026-08-01: six secrets across three users were
  migrated, a final read-only audit found six decryptable envelopes and zero
  plaintext or unreadable secrets, and an apply rerun performed zero writes.
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
3f538d8a fix(facebook): encrypt oauth callback tokens
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

Facebook backfill implementation completed:

- `scripts/migrate-facebook-oauth-tokens.ts` provides bounded dry-run/apply
  pages, resumable cursors, non-secret counters, idempotent envelope detection,
  and per-secret compare-and-set writes.
- `docs/calos/FACEBOOK_TOKEN_MIGRATION_RUNBOOK.md` documents production
  execution, failure recovery, rollback boundaries, and the current key
  rotation limitation.

Facebook production backfill completed on 2026-08-01:

- Production dry-run identified three user tokens and three Page tokens.
- The apply migrated all six secrets with no unsafe Page records or
  compare-and-set misses.
- Final audit and idempotence rerun confirmed zero plaintext and zero additional
  writes.

Facebook work remaining:

- Remove legacy-read compatibility only after the documented migration window
  has elapsed and every deployed environment reports zero plaintext records.
- Add a dual-key/key-ID envelope before rotating
  `CALOS_TOKEN_ENCRYPTION_KEY`; the current `oauth:v1:` prefix identifies an
  envelope format, not a key.

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

Primary Facebook migration owners:

- `schemas/user.ts`
- `lib/calos/publish/token-crypto.ts`
- `scripts/migrate-facebook-oauth-tokens.ts`
- `docs/calos/FACEBOOK_TOKEN_MIGRATION_RUNBOOK.md`

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

### Phase 1A: Facebook Reader/Writer Boundary (Complete)

- Brand Vault encrypted reads.
- OAuth callback encrypted writes.
- Legacy/corrupt token tests.

Exit gate:

- All Facebook readers accept encrypted tokens.
- New callbacks write only encrypted credentials.
- Focused tests and subsystem tests pass.
- The slice has no TypeScript or ESLint errors.

Completed in `3f538d8a`.

### Phase 1B: Backfill Legacy Facebook Credentials (Complete)

Implementation and production execution completed on 2026-08-01. Production
migrated six of six identified secrets, final decryptability audit reported zero
plaintext/unreadable values, and the idempotence rerun performed zero writes.

- Add dry-run counts for plaintext user and Page tokens.
- Encrypt legacy records idempotently in bounded batches.
- Document rollback and the required dual-key key-rotation sequence.
- Verify zero plaintext records before removing migration compatibility.

Exit gate:

- Existing Facebook credentials are encrypted without requiring users to
  reconnect.
- Re-running the migration changes no already-encrypted records.
- Operators can audit counts, stop safely, and roll back the deployment.

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
