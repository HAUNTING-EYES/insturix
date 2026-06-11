# Brand Vault, Learning, And Graphiti Service Wiring Audit

Date: 2026-06-11
Status: INVESTIGATED_CODE_TO_CODE

## Executive Verdict

Brand Vault is real as a producer/review/persistence system, but accepted Brand Vault signal profiles are not yet the canonical brand source consumed by downstream services.

Most downstream services currently consume `UnifiedBrand`, `brandId`, `project_links`, `sourceContext`, or `brand_events`. That is useful plumbing, but it is not the same as consuming the accepted `BrandSignalProfile` records from Brand Vault.

Brand learning is real but selective. The `brand_events` bus is central and idempotent, and the brand-learning worker has six real handlers. Seven declared event types still fall through as acknowledged/no-op scaffolding.

Graphiti/Neo4j is strongest in Editron. Editron writes graph records, writes Graphiti episodes, reads Graphiti facts for transition choice, and uses Neo4j graph-filtered asset search. Other services mostly carry IDs or emit events that may feed Editron/Graphiti later.

## Meaning Of "Wired"

This audit separates four very different things:

- Producer: service creates Brand Vault, brand event, or Graphiti data.
- Carrier: service passes `brandId`, `sourceContext`, `project_links`, or metadata onward.
- Consumer: service reads the data and changes behavior.
- Beneficiary: the user's output actually changes because of the connection.

Only the last two count as "actually benefits from connection."

## Brand Vault Code Reality

Brand Vault production and review are wired:

- `app/api/brand-vault/refinery/jobs/route.ts:4-6` imports the Brand Vault job APIs and default store.
- `app/api/brand-vault/refinery/jobs/route.ts:27-29` creates website-derived Brand Vault refinery jobs through `getDefaultBrandVaultRefineryStore()`.
- `app/api/brand-vault/refinery/jobs/route.ts:41` loads jobs through the same store.
- `app/api/brand-vault/signal-profiles/[id]/route.ts:4-6` imports profile read/review APIs.
- `app/api/brand-vault/signal-profiles/[id]/route.ts:20-22` reads a signal profile by record ID.
- `app/api/brand-vault/signal-profiles/[id]/route.ts:45-47` accepts/rejects a draft profile.
- `app/api/brand-vault/uploads/extract/route.ts:3` imports upload evidence extraction.
- `app/api/brand-vault/uploads/extract/route.ts:35-42` parses an uploaded file into Brand Vault source evidence.

Brand Vault persistence is wired:

- `lib/shared/brand-vault-mongo-store.ts:19-22` stores profiles, events, and jobs in `brand_signal_profile_records`, `brand_signal_profile_events`, and `brand_refinery_jobs`.
- `lib/shared/brand-vault-mongo-store.ts:103-123` accepts a draft and supersedes older accepted records.
- `lib/shared/brand-vault-mongo-store.ts:127-138` rejects a draft.
- `lib/shared/brand-vault-mongo-store.ts:141-147` can return the latest accepted profile for `{ brandId, userId }`.
- `lib/shared/brand-vault-mongo-store.ts:243-246` uses `BRAND_VAULT_MONGODB_URI`/`MONGODB_URI`, db name envs, and `BRAND_VAULT_PERSISTENCE=memory`.
- `lib/shared/brand-vault-refinery-api.ts:199-204` chooses Mongo when env is configured, otherwise in-memory.

The Brand Vault data model is real:

- `lib/shared/brand-signal-profile.ts:63-114` defines identity, palette, typography, visual, motion, voice, and evidence signals.
- `lib/shared/brand-signal-profile.ts:125` derives a `BrandSignalProfile`.
- `lib/shared/brand-signal-lifecycle.ts:70` validates profiles.
- `lib/shared/brand-signal-lifecycle.ts:104` creates drafts.
- `lib/shared/brand-signal-lifecycle.ts:123` accepts drafts.
- `lib/shared/brand-signal-lifecycle.ts:153` rejects drafts.
- `lib/shared/brand-signal-lifecycle.ts:194` collects individual brand signals.
- `lib/shared/brand-signal-profile-repository.ts:83-84` exposes latest accepted profile lookup in the in-memory repo.

Downstream accepted-profile consumption is not wired:

- `getLatestAcceptedProfile()` is only found in Brand Vault store/API/repository and tests.
- No production hit was found in `app/api/services/*`, `lib/clickatron`, `lib/editron`, or `lib/thinkforge` that reads the latest accepted Brand Vault profile as the downstream brand source.
- Therefore, accepted `BrandSignalProfile` is available but not yet the service-wide source of truth.

## Current Brand Consumption By Service

### ThinkForge

Current wiring:

- ThinkForge sessions carry `brandId` into project links: `app/api/services/thinkforge/session/route.ts:67-76`.
- ThinkForge source/context lookup filters global DataBank entries by `brandId`: `lib/thinkforge/context/fetchContextSources.ts:162-168`, `199`, `236-242`, `266-284`, `376-393`.
- ThinkForge script authoring can receive a `brandBlock`: `lib/thinkforge/agents/script-author-agent.ts:447-476`, `544-555`, `628-639`.
- ThinkForge -> Clickatron handoff carries `brandId` from project meta or project link: `lib/thinkforge/clickatron-context.ts:135-150`.
- Export UI forwards `context.brandId` to Clickatron session creation: `components/dashboard/ThinkForge/export/hooks/useExportPipeline.ts:712`.

Actual benefit:

- ThinkForge can generate/write with brand-scoped context when the context layer provides it.
- ThinkForge -> Clickatron can pass brand/source context forward.
- ThinkForge does not yet consume accepted Brand Vault profiles directly.
- ThinkForge does not directly read Graphiti in the audited code. It indirectly benefits when the brand-learning worker runs the ThinkForge post-mortem after `video_rendered`: `app/api/internal/workers/brand-learning/route.ts:236-249`.

### Pipeline

Current wiring:

- Storyboard generation accepts and stores `brandId`: `app/api/services/pipeline/storyboard/generate/route.ts:105`, `128`, `286`.
- Scene parsing can inject `UnifiedBrand` into its LLM prompt: `lib/pipeline/llm-scene-parser.ts:212-224`.
- Finalize accepts `brandId`, creates/updates an Editron project with it, and persists it: `app/api/services/pipeline/storyboard/[id]/finalize/route.ts:40`, `699`, `706`.
- Finalize dispatches graph-sync for project/scenes: `app/api/services/pipeline/storyboard/[id]/finalize/route.ts:756-806`.
- Finalize emits `project_created`: `app/api/services/pipeline/storyboard/[id]/finalize/route.ts:1092-1110`.

Actual benefit:

- Pipeline benefits from `UnifiedBrand` during scene parsing and preserves `brandId` for Editron.
- Pipeline creates graph data for later use, but it does not read Graphiti/Neo4j itself in the audited path.
- `project_created` is emitted but is not handled by brand-learning yet, so it is currently recorded/acknowledged rather than learned from.
- Pipeline does not consume accepted Brand Vault profiles.

### Editron

Current wiring:

- Director injects `UnifiedBrand` into creative intent: `lib/editron/agent/director-agent.ts:1143-1157`.
- EDL resolves `UnifiedBrand` into motion graphic brand inputs: `lib/editron/services/edl-executor.ts:290-314`.
- Motion graphics map `UnifiedBrand` into brand inputs: `lib/editron/motion-graphics/engine/brand-composition-rules.ts:379-390`.
- Rich brand input may be labeled `source: 'brand-vault'`: `lib/editron/motion-graphics/engine/brand-composition-rules.ts:200`, `451-460`.
- That label is not proof of accepted `BrandSignalProfile` consumption; the runtime adapter still maps from `UnifiedBrand`.

Learning and Graphiti:

- Director emits `director_completed`: `lib/editron/agent/director-agent.ts:1823-1844`.
- Director writes a Graphiti project outcome episode: `lib/editron/agent/director-agent.ts:1930-1944`.
- Director reads Graphiti facts to choose a transition when no explicit transition is provided: `lib/editron/agent/director-agent.ts:2258-2279`.
- Render completion emits `video_rendered`: `app/api/services/editron/cloudrun/progress/route.ts:53-93`.
- Quality review emits `quality_reviewed`: `app/api/services/editron/quality-review/route.ts:12`, `35-46`.
- Brand create/update/delete routes dispatch Graphiti brand episodes and emit `brand_updated`: `app/api/services/editron/brands/route.ts:90-117`, `app/api/services/editron/brands/[brandId]/route.ts:67-93`, `120-139`.
- Project save dispatches graph-sync and Graphiti user override episodes: `app/api/services/editron/projects/[projectId]/save/route.ts:151-181`, `204-210`, `251-272`.
- Media upload dispatches graph-sync for asset nodes: `app/api/services/editron/media/upload/route.ts:183-201`.
- Media search uses Neo4j as primary path: `app/api/services/editron/media/search/route.ts:49`.
- Asset search service first tries Neo4j graph-filtered vector search and falls back to Mongo: `lib/editron/services/asset-search-service.ts:10-11`, `31-70`.

Actual benefit:

- Editron genuinely benefits from brand context in creative intent and motion graphics.
- Editron genuinely benefits from Graphiti when transition facts exist.
- Editron genuinely benefits from Neo4j graph search when asset nodes/embeddings exist.
- Editron does not yet consume accepted Brand Vault signal profiles as canonical input.

### Alyzitron

Current wiring:

- Alyzitron writes analysis/quality results back to an Editron project when `editronProjectId` exists: `app/api/services/alyzitron/processor/route.ts:217-218`.
- Alyzitron emits `analysis_complete`: `app/api/services/alyzitron/processor/route.ts:225-236`.

Actual benefit:

- Editron can benefit from Alyzitron output through project writeback.
- Brand learning does not currently handle `analysis_complete`, so Alyzitron's brand event is recorded but not learned from by the worker.
- No Brand Vault accepted-profile consumption found.
- No Graphiti read/write found.

### Clickatron

Current wiring:

- Clickatron session accepts and stores `brandId`: `app/api/services/clickatron/session/route.ts:44`, `60`, `94`.
- Variation worker resolves brand context and enriches the generation prompt: `app/api/internal/workers/clickatron/variation/route.ts:235-251`.
- Clickatron brand prompt resolver uses `getUnifiedBrand` and `buildBrandContextBlock`: `lib/clickatron/brand-prompt-context.ts:90-105`.
- Clickatron source context includes ThinkForge creative spec, text layers, slides, and project metadata: `lib/clickatron/brand-prompt-context.ts:111-158`.
- Prompt rules tell generation to use source/brand context and not render internal IDs: `lib/clickatron/brand-prompt-context.ts:170-181`.
- Thumbnail commit emits `thumbnail_created`: `app/api/services/clickatron/session/[id]/commit/route.ts:160-170`.
- Brand-learning turns `thumbnail_created` into a Graphiti episode: `app/api/internal/workers/brand-learning/route.ts:362-431`.

Actual benefit:

- Clickatron genuinely benefits from `UnifiedBrand` and ThinkForge source context in prompt generation.
- Clickatron writes a positive creative signal to Graphiti after thumbnail commit.
- Clickatron does not read Graphiti facts yet.
- Clickatron does not consume accepted Brand Vault profiles yet.
- The ThinkForge -> Clickatron handoff is real backend plumbing, but carousel editing/rendering is not first-class yet.

### UploaderX

Current wiring:

- UploaderX publish helper resolves project/brand metadata and emits `video_published`: `lib/uploaderx/video-publish-events.ts:141-158`.
- The brand-learning worker handles `video_published` and feeds the bandit with `userRendered=true, userPublished=true`: `app/api/internal/workers/brand-learning/route.ts:326-356`.

Actual benefit:

- UploaderX does not change publishing behavior from Brand Vault/Graphiti.
- The platform benefits upstream learning by marking what the user actually published.
- No Brand Vault accepted-profile consumption found.
- No direct Graphiti read/write found.

### Musitron

Current wiring:

- `music_selected` exists in the brand event type list: `lib/shared/brand-events.ts:32`.
- The brand event service union includes `musitron`: `lib/shared/brand-events.ts:18`.
- Searches found no production emitter for `music_selected`; only tests/type declarations reference it.

Actual benefit:

- No confirmed Brand Vault, brand-learning, or Graphiti benefit yet.

### Socialize

Current wiring:

- Targeted searches in Socialize service/component paths found no Brand Vault, brand event, or Graphiti/Neo4j usage.

Actual benefit:

- No confirmed Brand Vault, brand-learning, or Graphiti benefit yet.

### Kundli

Current wiring:

- Targeted searches found no Brand Vault, brand event, or Graphiti/Neo4j usage.

Actual benefit:

- No confirmed Brand Vault, brand-learning, or Graphiti benefit yet.

## Brand Learning Code Reality

The event bus is real:

- `lib/shared/brand-events.ts:13-36` defines seven services and thirteen event types.
- `lib/shared/brand-events.ts:68-94` stores events in Mongo `brand_events` and dispatches QStash.
- `lib/shared/brand-events.ts:105-178` supports unconsumed queries, marking consumed, claiming, and releasing leases.
- `lib/shared/brand-events.ts:248-269` dispatches to `/api/internal/workers/brand-learning`.
- `lib/shared/brand-events.ts:274-282` indexes user/project/event/type/consumer and TTLs events after 90 days.

The worker has real handlers:

- `app/api/internal/workers/brand-learning/route.ts:80-104` handles `director_completed`, `video_rendered`, `quality_reviewed`, `brand_updated`, `video_published`, and `thumbnail_created`.
- `app/api/internal/workers/brand-learning/route.ts:168-194` feeds bandit from `director_completed`.
- `app/api/internal/workers/brand-learning/route.ts:197-253` feeds bandit and runs ThinkForge post-mortem from `video_rendered`.
- `app/api/internal/workers/brand-learning/route.ts:258-293` feeds bandit from `quality_reviewed`.
- `app/api/internal/workers/brand-learning/route.ts:302-316` invalidates brand registry cache from `brand_updated`.
- `app/api/internal/workers/brand-learning/route.ts:326-356` feeds bandit from `video_published`.
- `app/api/internal/workers/brand-learning/route.ts:362-431` writes Clickatron thumbnail commits to Graphiti.

Coverage is intentionally incomplete:

- `tests/brand-intelligence/brand-events.test.ts:37-44` says six event types have real handlers.
- `tests/brand-intelligence/brand-events.test.ts:51-56` says thirteen event types exist.
- `tests/brand-intelligence/brand-events.test.ts:122-129` asserts seven event types are unhandled, including `script_generated`, `status_changed`, and `project_created`.
- `script_generated` is only found in tests/type declarations, not as a production event emitter.
- `music_selected` is only found in tests/type declarations, not as a production event emitter.
- `analysis_complete` is emitted by Alyzitron but not handled by the worker.

## Graphiti And Neo4j Code Reality

The graph layer is real:

- `lib/editron/services/graph-service.ts:2-12` declares the service as Neo4j + Graphiti.
- `lib/editron/db/neo4j.ts:19-27` requires Neo4j env vars.
- `lib/editron/db/neo4j.ts:128-133` exposes availability checks.
- `app/api/internal/workers/graph-sync/route.ts:1-10` documents QStash sync from Mongo to Neo4j.
- `app/api/internal/workers/graph-sync/route.ts:20-29` defines graph actions.
- `app/api/internal/workers/graph-sync/route.ts:89-120` syncs project and scenes.
- `app/api/internal/workers/graph-sync/route.ts:121-176` syncs asset usage/removal/kept edges.

Direct graph operations exist:

- `lib/editron/services/graph-service.ts:353` creates project nodes.
- `lib/editron/services/graph-service.ts:497` writes scene batches.
- `lib/editron/services/graph-service.ts:772` searches assets with graph context.
- `lib/editron/services/graph-service.ts:972-986` updates Mongo `graphSyncStatus`.

Graphiti write/read exists:

- `lib/editron/services/graph-service.ts:892-923` dispatches Graphiti episodes via QStash.
- `lib/editron/services/graph-service.ts:936-964` searches Graphiti fact nodes.
- `app/api/internal/workers/graphiti-episode/route.py:1-8` defines the Graphiti episode worker.
- `app/api/internal/workers/graphiti-episode/route.py:41-59` initializes Graphiti with Gemini and Neo4j.
- `app/api/internal/workers/graphiti-episode/route.py:68-77` ingests episodes.

Actual benefit:

- Editron benefits directly through transition selection and graph asset search.
- Clickatron benefits indirectly by writing thumbnail decisions to Graphiti, but it does not read Graphiti yet.
- Pipeline creates project/scene graph records, but it does not read them.
- UploaderX contributes publish outcomes to bandit learning, not Graphiti directly.
- ThinkForge benefits indirectly through post-mortem triggered by video render events, not direct Graphiti reads.

## ThinkForge To Clickatron Current State

This bridge is the most relevant next work.

Current backend handoff:

- ThinkForge requests the hidden Clickatron sidecar only for non-video creative intent: `lib/thinkforge/utils/clickatron-creative-sidecar.ts:20-31`.
- The sidecar rules require `single_post_visual` or `carousel`, source block IDs, editable text layers, image prompt, platform, brand constraints, and validation state: `lib/thinkforge/utils/clickatron-creative-sidecar.ts:39-59`.
- The backend extracts and validates the hidden JSON: `lib/thinkforge/utils/clickatron-creative-sidecar.ts:82-105`.
- The backend finalizes real source block IDs and stale/validation state: `lib/thinkforge/utils/clickatron-creative-sidecar.ts:127-164`.
- ThinkForge builds a Clickatron session draft from `renderPlan.imagePrompt` and carousel slides: `lib/thinkforge/clickatron-context.ts:93-123`.
- ThinkForge returns source context, brandId, universalId, projectId, metadata, and session draft: `lib/thinkforge/clickatron-context.ts:126-183`.
- Clickatron prompt enrichment consumes that metadata and brand context: `lib/clickatron/brand-prompt-context.ts:111-181`.

Current missing product pieces:

- The UI needs a polished "Send to Clickatron" action for posts/carousels.
- The UI needs to surface validation states: ready, needs user input, stale.
- Clickatron needs to treat `renderPlan.slides` as a real carousel data model, not just prompt text.
- Carousel output needs first-class render/export/commit, then optional Alyzitron review and UploaderX publish.
- Brand Vault accepted profiles should be resolved before `UnifiedBrand` once the canonical adapter exists.

## Service Benefit Matrix

| Service | Brand Vault accepted profile | UnifiedBrand / brand context | Brand learning | Graphiti/Neo4j | Actual benefit today |
| --- | --- | --- | --- | --- | --- |
| Brand Vault | Produces/stores/reviews | No downstream consumer role | Internal profile events only | None | Creates accepted profiles, but downstream does not consume them yet |
| ThinkForge | Not consumed | Uses brand-scoped context and passes brandId | Indirect post-mortem on render | No direct read/write found | Better writing/context, plus Think -> Click source context |
| Pipeline | Not consumed | Scene parser injects UnifiedBrand; carries brandId | Emits `project_created`, unhandled | Writes project/scene graph records | Preserves brand/graph data for Editron, little direct learning benefit |
| Editron | Not canonical | Strong consumer in director, scene intent, EDL/MG | Emits handled events and receives bandit learning | Strong write/read consumer | Strongest actual beneficiary |
| Alyzitron | Not consumed | No meaningful brand consumer found | Emits `analysis_complete`, unhandled | No direct use found | Writes analysis back to Editron, not learning yet |
| Clickatron | Not consumed | Prompt enrichment uses UnifiedBrand and ThinkForge context | Emits handled `thumbnail_created` | Writes thumbnail episode indirectly | Better prompt generation; learning write, no Graphiti read |
| UploaderX | Not consumed | Reads project brand metadata for event payload only | Emits handled `video_published` | No direct use found | Improves upstream bandit learning after publish |
| Musitron | Not consumed | No confirmed use | Type exists, no `music_selected` producer found | No direct use found | No confirmed benefit |
| Socialize | Not consumed | No confirmed use | No confirmed use | No direct use found | No confirmed benefit |
| Kundli | Not consumed | No confirmed use | No confirmed use | No direct use found | No confirmed benefit |

## Root Cause

The real root cause is split brand authority.

Brand Vault created a better structured brand object, but the runtime services still call the older `UnifiedBrand` registry or pass raw `brandId`/metadata. Because there is no canonical `resolveCreativeBrandContext()` adapter, every service made its own choice:

- ThinkForge uses contextual briefs/DataBank/source metadata.
- Pipeline and Editron use `UnifiedBrand`.
- Clickatron uses `UnifiedBrand` plus ThinkForge source context.
- UploaderX emits publish outcomes.
- Brand Vault stores accepted profiles, but downstream services do not ask for them.

So the system has useful plumbing, but not yet one brand brain.

## What This Means For ThinkForge -> Clickatron Next

Do the UI/carousel work in this order:

1. Polish the ThinkForge "Send to Clickatron" UI around the existing backend context route.
2. Show validation state from `exportMeta.clickatron.validation`.
3. If `needs_user_input`, ask for only the missing visual choices: visual mode, platform, aspect ratio, carousel vs single, text density.
4. Send the existing `sessionDraft` to Clickatron.
5. In Clickatron, parse `metadata.clickatron.creativeSpec.renderPlan.slides` into a real carousel state.
6. Render each slide as its own editable canvas/artifact.
7. Commit/export the carousel as one output group, not N unrelated images.
8. After that, wire optional Alyzitron review and UploaderX publish.

Do not block this UI/carousel work on Brand Vault canonicalization. Use the existing `UnifiedBrand` prompt enrichment for now, but design the call site so `resolveCreativeBrandContext()` can replace it later.
