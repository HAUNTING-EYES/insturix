# Insturix Northstar System Map

Date: 2026-06-11
Status: CONFIRMED_WITH_CORRECTIONS

This document restructures the current Insturix map into a verified integration target. The screenshot is directionally right: the product should behave like one creative production system, not isolated services. The correction is that several "red" areas are no longer empty, but they are still not canonical service-wide control flow.

## Current Map, Corrected

| Layer | Confirmed Current State | Correction To Screenshot |
| --- | --- | --- |
| Service spine | ThinkForge, Pipeline, Editron, Alyzitron, Clickatron, and UploaderX all have real API surfaces. There are bilateral handoffs, especially ThinkForge -> Editron and ThinkForge -> Clickatron. | Do not call the spine orchestrated yet. It is shared downstream plumbing plus several bridges, not one owned workflow. |
| ThinkForge | Live planning, script, post, storyboard, content-planning, Brand DNA/DataBank, and export routes exist. ThinkForge already has a Clickatron creative sidecar for non-video post/carousel work. | The northstar should make ThinkForge the source of the content plan, not merely a text generator. |
| Pipeline | Storyboard generation/finalize, reference images, video generation, voiceover, upload, and status routes exist. | Pre-production shoot plans exist conceptually, but frame-by-frame camera/light/stickman diagrams are not yet the canonical production artifact. |
| Editron | Project, media upload, auto-edit, director, render, quality review, cloud render progress, and brand routes exist. Editron consumes brand context and creative signals in important paths. | Editron is the strongest integrated service, but multi-asset intake from platform storage and unified context snapshots need hardening. |
| Alyzitron | Upload/analyze/processor/report paths exist. Processor can write analysis/quality score back to an Editron project and emit a brand event. | Alyzitron is live, but optional gate semantics are not standardized across every output path. |
| Clickatron | Session, variation, generative fill, upload/sketch, commit, R2 signing, prompt enhancement, and ThinkForge context routes exist. | ThinkForge -> Clickatron backend handoff is partial wired. Full carousel/editor/output-to-publish flow is not finished. |
| UploaderX | Platform routes exist for YouTube, Instagram, Facebook, LinkedIn, and Twitter/X, plus storage signing and publish event tests. | It is closer to a publisher than before, but not yet the final consumer of every rendered/video/static artifact through one asset contract. |
| Side services | Musitron and Socialize have real surfaces; Kundli is small/stub-like. | Keep them sidecar services until the core creative chain has one data spine. |
| Signals and atoms | Creative signals, writing signals, Editron atomic forms, signal registry, and signal executor are live. | Not isolated, but not service-wide either. They are strongest in Editron/ThinkForge and should become shared context, not copied logic. |
| Brand and Brand Vault | UnifiedBrand is consumed by Editron/Clickatron paths. Brand Vault signal profiles, refinery jobs, uploads, Mongo persistence, review/accept/reject, and tests exist. | Brand Vault is not "wired to nothing." Correct label: built + persisted, canonical downstream consumption incomplete. |
| Brand learning | `brand_events` exists and the worker handles important events such as rendered, published, analysis, thumbnail, director, and music outcomes. | Not dead. Correct label: selective/incomplete learning. Several emitted event types still need handlers and canaries. |
| Knowledge graph | Mongo is documented as source of truth. Neo4j + Graphiti services, graph sync worker, Graphiti episode worker, graph service, and QStash dispatch paths exist. | Not zero in code. Correct label: infra exists, live coverage and staging reliability unverified. |

## Root Cause

The product has shared plumbing but no canonical production unit.

Today, `project_links`, `brand_events`, route metadata, and source context carry useful identity between services. But the producer path, decision owner, source of truth, and final consumer are still different per bridge. That is why the system can look connected on a diagram while still behaving like service-to-service handoffs in code.

Target fix: introduce one content production model that every service can read/write without each service inventing its own context shape.

## Northstar Product Flow

### Video Chain

1. User starts in ThinkForge with a brand, goal, references, uploaded content, preferences, and optional calendar/campaign context.
2. ThinkForge creates the script, storyboard, shooting calendar, and production plan.
3. For user-shot content, each storyboard shot includes:
   - what to say or show
   - camera framing and movement
   - subject position
   - light/window position
   - room/prop notes
   - phone/camera settings when useful
   - a simple stickman layout diagram for subject, camera, lights, and background
4. User either shoots from that plan or skips shooting guidance and brings their own videos/images.
5. Editron ingests multiple videos/images from upload or platform storage and edits a final video using the same brand, preference, content, and campaign context.
6. Render produces the final asset and emits a durable `video_rendered` outcome.
7. Alyzitron can run analysis. If skipped, store `review.skippedByUser = true`; do not pretend it passed.
8. UploaderX publishes the chosen final asset and emits `video_published`.
9. Brand learning records what happened, what passed/failed, what was fixed, and what the user published anyway.

### Post And Carousel Chain

1. User starts in ThinkForge with a post/thread/blog/ad/carousel brief.
2. ThinkForge writes the visible content and a hidden Clickatron creative contract for non-video outputs.
3. Clickatron receives the contract, source context, brand context, text layers, image prompt, aspect ratio, platform, and carousel slide plan.
4. Clickatron generates a single visual or carousel while keeping readable copy in editable text layers instead of rasterizing long text into the image.
5. Alyzitron can optionally check the static output/carousel.
6. UploaderX publishes or schedules the final asset.

## Canonical Contracts To Add

### ContentProductionUnit

One durable object representing the work item across all services.

Required fields:

- `contentUnitId`
- `userId`
- `orgId`
- `brandId`
- `campaignId`
- `contentCardId`
- `calendarItemId`
- `universalId`
- `sourceSessionId`
- `sourceScriptId`
- `projectIds`
- `storyboardIds`
- `assetIds`
- `videoIds`
- `thumbnailIds`
- `publishIds`
- `status`
- `createdByService`
- `updatedByService`

This is the spine object. `project_links` already points in this direction, but the target is a first-class unit rather than a link-only helper.

### CreativeContext

One snapshot of why the system made a creative decision.

Required fields:

- `brandSnapshot`
- `brandSignalProfileSnapshot`
- `userPreferencesSnapshot`
- `uploadedContentSummary`
- `campaignContext`
- `calendarContext`
- `platformConstraints`
- `contentSignalProfile`
- `creativeSignalProfile`
- `sourceContentHash`
- `rightsAndOwnership`
- `reviewState`
- `learningEligibility`

This is how every service stays in the same brand/user/content context without re-fetching different partial records and drifting.

### ServiceHandoff

One auditable object for every movement between services.

Required fields:

- `handoffId`
- `contentUnitId`
- `sourceService`
- `destinationService`
- `artifactKind`
- `artifactIds`
- `sourceBlockIds`
- `contentHash`
- `contextSnapshotId`
- `userIntent`
- `validationStatus`
- `validationIssues`
- `consumedBy`
- `createdAt`

For ThinkForge -> Clickatron, this preserves the current useful fields: `kind`, `platform`, `aspectRatio`, `userVisualIntent`, `imagePrompt`, `slides`, `brandConstraints`, `sourceBlockIds`, `contentHash`, `contentCardId`, and `campaignId`. Add `contextSnapshotId`, `artifactKind`, `validationIssues`, and ownership/provenance fields so it can scale beyond one bridge.

## User-Owned Content Rules

If the user brings their own videos/images/posts, the system must not force the work through a generation-first assumption.

Rules:

- Mark `sourceKind = user_asset`.
- Store rights/ownership declaration or source note.
- Preserve original asset IDs and storage provider IDs.
- Use ThinkForge context to explain, sequence, caption, storyboard around, or publish the content, not to overwrite its provenance.
- Editron should treat user assets as first-class input, equal to generated assets.
- UploaderX should publish the chosen final artifact, regardless of whether it was generated, edited, or user-supplied.
- Learning should record the outcome, but only learn from assets/events marked eligible.

## Creative Safety Invariants

- Do not put long readable text inside image/video prompts. Use editable text layers and reserve clean layout space.
- Do not invent brand constraints, logo rules, legal claims, colors, or typography if they are not grounded in accepted brand/context evidence.
- Every output should carry `contentHash`, source IDs, and context snapshot ID.
- If a service cannot resolve context, fail loud or mark degraded. Do not silently produce "generic brand" output and call it integrated.
- If Alyzitron is skipped, store the skip decision.
- If Graphiti/QStash is unavailable, preserve the source Mongo event and retry/mark unprocessed.
- Never call the architecture merged/unified unless producer, decision owner, source of truth, and final consumer are verified in code.

## Phased Plan

### Phase 0: Documentation And Inventory

Goal: make the target explicit and stop using stale map labels.

Deliverables:

- This system map.
- Current route/service inventory.
- Current event coverage matrix.
- Current Brand Vault consumption matrix.

### Phase 1: Canonical Contracts

Touch max 5 files.

Deliver:

- `ContentProductionUnit` type/schema.
- `CreativeContext` type/schema.
- `ServiceHandoff` type/schema.
- Validator tests for missing IDs, stale hashes, skipped review, and user-owned assets.

### Phase 2: Data Spine Hardening

Deliver:

- Upgrade `project_links` toward content-unit semantics.
- Backfill missing project/storyboard/video/thumbnail/content-card IDs.
- Admin/report route for unprocessed `brand_events`.
- Tests for missing links and duplicate/late events.

### Phase 3: Brand Vault As Canonical Brand Evidence

Deliver:

- Adapter that resolves accepted Brand Vault signal profile first, then UnifiedBrand compatibility data.
- ThinkForge, Editron, Clickatron read the same brand evidence snapshot.
- Tests proving downstream prompts/edits use accepted Brand Vault evidence and do not expose internal IDs.

### Phase 4: ThinkForge Production Storyboards

Deliver:

- Storyboard block schema for shot directions.
- Diagram schema for stickman subject/camera/light/window/background layout.
- Calendar-aware shoot plan.
- User-owned-content mode that skips shooting instructions when the user only needs edit/publish.

### Phase 5: Editron Multi-Asset Intake

Deliver:

- One intake path for uploaded videos/images and platform storage assets.
- Multi-asset project context preserved through director/render.
- Edit decisions reference source asset IDs.
- Rendered output writes back to the content unit.

### Phase 6: Optional Alyzitron Gate

Deliver:

- Standard review state: `not_requested`, `running`, `passed`, `failed`, `skipped_by_user`.
- Issue list that can drive an Editron/Clickatron fix loop.
- Publish allowed with explicit user override, not accidental bypass.

### Phase 7: UploaderX Final Consumer Contract

Deliver:

- UploaderX accepts video/static/carousel artifacts from the content unit.
- Platform-specific publish metadata comes from the same CreativeContext.
- Publish IDs and URLs write back to the content unit.
- Platform sandbox canary covers YouTube, Instagram, Facebook, LinkedIn, and Twitter/X where available.

### Phase 8: Learning And Graph Telemetry

Deliver:

- Handlers for all emitted brand event types or explicit ignored status.
- QStash retry/drift dashboard.
- Graphiti episode coverage dashboard.
- Staging canary for real Mongo, QStash, Graphiti, storage, render, and platform sandbox accounts.

## Entry And Exit Points To Audit

Inputs:

- ThinkForge prompts, scripts, posts, storyboards, calendar cards, brand context, uploads.
- Pipeline storyboard/ref-image/video generation inputs.
- Editron uploads, project storage, director prompts, render settings.
- Alyzitron upload/analyze inputs.
- Clickatron prompt, image/sketch upload, variation metadata.
- UploaderX media, captions, platform account tokens, schedules.
- Brand Vault website/upload/refinery/review inputs.

Outputs:

- ThinkForge visible content plus hidden `exportMeta.clickatron`.
- Pipeline storyboard/finalized project records.
- Editron edited project, render asset, quality review, graph events.
- Alyzitron analysis report and project quality score.
- Clickatron generated image/carousel and thumbnail commit event.
- UploaderX publish IDs, URLs, and `video_published` events.
- Brand events, Graphiti episodes, Neo4j graph records, and admin telemetry.

## Immediate Next Engineering Move

Start with Phase 1. Do not begin by wiring more endpoints. First create the canonical contracts and tests. Once the contracts exist, each service integration becomes a deterministic adapter into `ContentProductionUnit`, `CreativeContext`, and `ServiceHandoff` instead of another custom bridge.
