# ThinkForge Current State Brief (2026-06-13)

Snapshot source: local `main` worktree at commit `661ec4310aec78c9fa9dcc5323c8573a612ae634`.

This brief documents the current code reality of ThinkForge, not the ideal product vision. It separates implemented systems, partial plumbing, and missing north-star work so future planning does not confuse labels with actual control flow.

## Executive Summary

ThinkForge is already more than a simple chat box. It has ideation, URL brief extraction, session/project metadata, a script/document editor, multi-stage draft generation, BrandDNA, DataBank memory, shadow learning, post-mortem compression, Clickatron export metadata, and a real Editron export pipeline.

It is not yet the full north-star content intelligence layer. The current implementation has useful signal plumbing, but it is not as robust as Editron's production-side intelligence. Editron has deeper graph-backed editing, scene parsing, Director Agent application, quality gates, and production execution loops. ThinkForge currently has a writing-side signal resolver, prompt blocks, writing graph lookup, compliance checks, and selected memory retrieval. That is a good foundation, but it is still partial.

Most important truth: Brand Vault, learning, calendar planning, Clickatron, Editron, and Alyzitron are not all unified end to end. Some paths are real, some are shared downstream plumbing, and some are still product gaps.

## North Star

The intended ThinkForge product is an ideation, scripting, and copywriting workspace for businesses and agencies.

The desired flow is:

1. User asks for content, such as a post, script, article, or text plus image asset.
2. ThinkForge builds hidden structured context for the session: brand, user, project, content goal, output format, signal profile, and export needs.
3. The visible output is strong publishable copy or a usable production script.
4. Static content can hand off to Clickatron for images, thumbnails, carousel visuals, and editable text layers.
5. Script content can hand off to Editron for AI video generation or human shooting.
6. Output can be analyzed by Alyzitron for quality/performance feedback.
7. Calendar planning lets businesses and agencies plan weeks or months ahead.
8. Niche-aware trend, market, and meme signals suggest brand-fit repurposing opportunities.
9. For shootable scripts, ThinkForge should provide in-context production guidance: camera position, lighting angle, framing, emotion, room constraints, and potentially a simple stickman-style visual plan.
10. Learning should compound through Brand Vault, user memory, project outcomes, and cross-service intelligence.

The current `docs/creative-content-knowledge.md` is the main writing intelligence document. It describes the target `ContentSignalProfile`, scope cascade, signal provenance, constraints versus signals, format defaults, brand DNA, and writing technique selection. However, that document is only "Part 0" today. Parts 1-8 are still pending.

## Research Snapshot

This brief was built from 50+ repo surfaces across:

- ThinkForge APIs under `app/api/services/thinkforge`.
- ThinkForge UI under `app/dashboard/thinkforge` and `components/dashboard/ThinkForge`.
- Core agents under `lib/thinkforge/agents`.
- Context, signal, and writing intelligence under `lib/thinkforge/context`, `lib/thinkforge/signals`, and `lib/thinkforge/data`.
- Brand/learning/shared integration under `lib/shared`.
- Clickatron handoff code under `lib/thinkforge/clickatron-context.ts`, `lib/thinkforge/utils/clickatron-creative-sidecar.ts`, and `lib/clickatron/brand-prompt-context.ts`.
- Existing tests under `tests/thinkforge`, `tests/clickatron`, and `tests/brand-intelligence`.

Public surface identified:

- Main user routes: `ideas`, `url-brief`, `session`, `chat`, `script`, `sidecar`.
- Memory routes: `brand-dna`, `databank`, `events/observe`, `events/shadow-log`, `events/post-mortem`.
- Handoff routes: `script/export-for-editron`, `clickatron-context`.
- Planning routes: `content-planning`, `content-planning/[id]`.
- UI modes: ideation, scripting/storyboarding, planning, library.

## Product Surface Today

ThinkForge currently exposes these major workflows.

### Ideation

Implemented through:

- `app/api/services/thinkforge/ideas/route.ts`
- `lib/thinkforge/agents/ideas-agent.ts`
- `app/api/services/thinkforge/url-brief/route.ts`
- `lib/thinkforge/agents/url-brief-agent.ts`
- `components/dashboard/ThinkForge/IdeationMode.tsx`

What works:

- Generates exactly 4 structured ideas.
- Applies basic platform locking after generation.
- Fetches BrandDNA/DataBank context before idea generation.
- Can extract URL briefs from YouTube/generic pages and use them for ideation.
- Stores selected idea/project metadata into the ThinkForge session flow.

Limitations:

- Ideation is brand-aware, but not deeply signal-driven.
- URL repurposing is manual/user-triggered, not a market monitoring engine.
- There is no automatic niche news, trend, or meme detection loop.
- Idea quality still depends heavily on the prompt and one structured LLM call.

### Scripting And Copywriting

Implemented through:

- `app/api/services/thinkforge/chat/route.ts`
- `lib/thinkforge/services/chat-service.ts`
- `lib/thinkforge/agents/script-draft-agent.ts`
- `lib/thinkforge/agents/script-contract-agent.ts`
- `lib/thinkforge/agents/script-outline-agent.ts`
- `lib/thinkforge/agents/script-author-agent.ts`
- `lib/thinkforge/agents/stylist-agent.ts`
- `components/dashboard/ThinkForge/StoryboardingMode.tsx`
- `components/dashboard/ThinkForge/ChatPanel.tsx`
- `components/dashboard/ThinkForge/ScriptEditor.tsx`

Current generation flow:

```text
POST /api/services/thinkforge/chat
  -> processChat()
    -> require existing session
    -> load script, chat history, preferences
    -> fetchContextSources()
       -> BrandDNA
       -> project DataBank facts
       -> global DataBank facts
       -> recent interaction patterns
    -> formatSystemBrief()
    -> intent handling / blueprint handling
    -> generateScriptDraft()
       -> quickAssembleContext()
       -> resolveContentSignalProfile()
       -> inject <content_signal_profile>
       -> ContractAgent
       -> OutlineAgent
       -> ScriptAuthorAgent
       -> quality scorer
       -> content profile compliance
       -> optional StylistAgent rewrite
       -> ThinkForge blocks + Tiptap JSON
    -> save document and stream SSE updates
```

What works:

- Chat is SSE-based and streams progress/script updates.
- Session is required before chat, which avoids orphan generation.
- Blueprint generation can create multiple documents.
- Draft generation now passes retrieved context into the signal resolver and author agent.
- Script generation can produce both video scripts and publishable text/post output.
- Post-generation quality scoring and profile compliance can trigger stylist repair.

Limitations:

- The architecture still uses "script" naming for many non-script outputs.
- Simple copywriting and full script generation go through a fairly heavy agent chain.
- Prompt quality is better than before, but still not production-grade.
- The prompt system is not yet fully derived from `creative-content-knowledge.md`.
- There are no golden-output evals or content quality benchmarks for ThinkForge prompts.

## Current Signal Infrastructure

Implemented through:

- `lib/thinkforge/context/fetchContextSources.ts`
- `lib/thinkforge/signals/content-signal-resolver.ts`
- `lib/thinkforge/signals/content-profile-compliance.ts`
- `lib/thinkforge/data/extract-signals.ts`
- `lib/thinkforge/data/writing-graph-query.ts`
- `lib/thinkforge/data/writing-knowledge.json`

### Retrieval Layer

`fetchContextSources()` retrieves three tiers:

- Cold: BrandDNA from MongoDB.
- Warm: DataBank facts, split into project facts and global facts.
- Hot: recent interaction events such as rejected hooks, deleted content, style corrections, regenerations, and feedback.

It returns:

- `brandDNA`
- `projectFacts`
- `globalFacts`
- deprecated combined `semanticFacts`
- `interactionPatterns`

The formatted system brief can include:

- voice lock
- audience/niche
- kill list
- hook styles
- structural habits
- voice fingerprint
- voice exemplars
- project knowledge
- global vault knowledge
- learned user preferences

### Signal Resolver

`resolveContentSignalProfile()` currently infers:

- output format: video script, social post, caption, blog article, email, ad copy, landing page, etc.
- platform: LinkedIn, TikTok, YouTube, Instagram, X, Facebook, etc.
- target length
- CTA type
- platform constraints
- audience
- goal
- angle
- tone
- proof points
- forbidden terms
- structural hints
- visual needs
- Clickatron need and asset intent
- signal provenance metadata

It combines:

- format defaults from `extractSignalsFromContext`
- prompt/project hints
- BrandDNA hints
- user explicit hints
- retrieved DataBank facts
- interaction patterns

### Prompt Injection

The resolved profile is formatted as:

```text
<content_signal_profile>
  JSON profile, intent, signals, derived signals, provenance, warnings
</content_signal_profile>
```

`ScriptAuthorAgent` adds execution rules telling the model to treat the signal profile as the source of truth for format, platform, audience, goal, tone, proof, constraints, and visual/export needs.

### Compliance Checks

`evaluateContentProfileCompliance()` detects:

- forbidden brand terms
- missing metric proof
- platform length overages
- social posts that accidentally contain script/production labels
- video scripts missing scene structure
- leaked internal metadata
- missing CTA

Critical violations can trigger a stylist rewrite.

### Honest Robustness Assessment

This is a real signal layer, but not Editron-grade yet.

Current ThinkForge signals are mostly deterministic heuristics plus extracted context. They do not yet implement the full `creative-content-knowledge.md` cascade:

- no complete 47-signal schema resolution
- no full scope hierarchy across brand, campaign, format, project, act, scene, beat
- no deterministic writing technique selection from a complete atlas
- no mature provenance UI
- no prompt/eval harness that proves output quality across ICP use cases
- no production-level feedback loop from Alyzitron/Clickatron/Editron outcomes back into generation choices

## Brand Vault And Brand Intelligence Reality

Implemented pieces:

- ThinkForge BrandDNA API: `app/api/services/thinkforge/brand-dna/route.ts`
- Voice fingerprint extraction: `app/api/services/thinkforge/brand-dna/extract-fingerprint/route.ts`
- BrandDNA storage in `lib/thinkforge/services/db.ts`
- Shared read-only brand registry: `lib/shared/brand-registry.ts`
- Shared brand prompt block: `lib/shared/brand-context-block.ts`
- Shared brand events: `lib/shared/brand-events.ts`

BrandDNA supports:

- `voiceLock`
- `nicheMap`
- `killList`
- `hookArchetypes`
- `structuralHabits`
- `recurringAssets`
- `voiceFingerprint`
- `voiceExemplars`

The shared `UnifiedBrand` view merges:

- ThinkForge BrandDNA for voice/content preferences.
- Editron brand records for visual identity.

Current truth:

- This is partial convergence, not a fully unified Brand Vault runtime.
- `BrandRegistry` is read-only and merges on demand.
- ThinkForge draft generation currently uses `fetchContextSources()` and BrandDNA, not `getUnifiedBrand()` plus `buildBrandContextBlock()`.
- Clickatron can resolve a shared brand context block from `UnifiedBrand`.
- ThinkForge post-mortem can read scoped shared brand events.
- I did not find ThinkForge emitting shared `brand_events` today.

Important edge case:

- `resolveEffectiveBrandDNA()` can drop `voiceFingerprint` and `voiceExemplars` when a project id is passed, because the merge return only includes voice lock, niche map, kill list, hooks, structure, and recurring assets.
- Normal chat passes a session/project id into context retrieval, so some learned voice detail may not reach generation in that path.

## DataBank And Learning Layer

Implemented through:

- `app/api/services/thinkforge/databank/route.ts`
- `app/api/services/thinkforge/events/observe/route.ts`
- `app/api/services/thinkforge/events/shadow-log/route.ts`
- `app/api/services/thinkforge/events/post-mortem/route.ts`
- `lib/thinkforge/agents/post-mortem-agent.ts`
- `lib/thinkforge/services/embedding-service.ts`

DataBank entry types:

- `url_brief`
- `note`
- `reference`
- `research`
- `atomic_fact`
- `brand_insight`
- `rejection_pattern`

DataBank scopes:

- `project`
- `global`

Current safety model:

- Direct request-body global writes are rejected.
- New user/observer facts are stored as project-scoped memory first.
- Only `brand_insight` and `rejection_pattern` can be explicitly promoted globally.
- Observer-extracted "global" facts are still quarantined into project memory.
- Post-mortem only promotes to brand/global memory when brand id exists and either `userPublished` is true or quality score clears the threshold.

What works:

- The system can learn from user feedback, rejected hooks, deleted content, style corrections, and observed text buffers.
- It can compress a completed session into project summary and lessons.
- It can embed DataBank entries for retrieval.

Limitations:

- Observer and post-mortem are environment-gated (`OBSERVER_ENABLED`, `POSTMORTEM_ENABLED`).
- Learning is not yet clearly connected to a visible Brand Vault review UI.
- Shared brand events are consumed in post-mortem, but ThinkForge does not appear to emit its own shared brand events.
- There is no strong outcome loop from content performance back into writing signals yet.

## Clickatron Integration

Implemented through:

- `lib/thinkforge/utils/clickatron-creative-sidecar.ts`
- `lib/thinkforge/schemas/clickatron-creative-contract.ts`
- `lib/thinkforge/clickatron-context.ts`
- `app/api/services/thinkforge/clickatron-context/route.ts`
- `lib/clickatron/brand-prompt-context.ts`

Current flow:

```text
ThinkForge generation
  -> signal resolver detects static visual need
  -> author prompt asks for hidden HTML comment JSON
  -> backend extracts and validates ClickatronCreativeSpec
  -> backend enriches with profile-derived platform, aspect ratio, proof, brand constraints
  -> metadata attaches to first ThinkForge block as exportMeta.clickatron
  -> /clickatron-context builds think-to-click context
  -> Clickatron prompt can use source context and shared brand context
```

Clickatron creative contract currently supports:

- `single_post_visual`
- `carousel`
- post graphic
- blog header
- thread visual
- ad creative
- platform
- aspect ratio
- editable text layers
- carousel slide plans
- validation status
- calendar scope fields

What is real:

- Hidden JSON sidecar exists.
- Backend validation exists.
- Profile enrichment exists.
- ThinkForge-to-Clickatron source context exists.
- Clickatron can consume ThinkForge metadata and shared brand context.

What is missing:

- Calendar fields are in the schema but not fully populated from the planning product.
- Static image export is not yet a complete user-facing calendar-scale workflow.
- There is no strong review UI for "this hidden JSON is ready / needs input / stale" across all content cards.

## Editron Integration

Implemented through:

- `app/api/services/thinkforge/script/export-for-editron/route.ts`
- `components/dashboard/ThinkForge/export/ExportToEditronDialog.tsx`
- `components/dashboard/ThinkForge/export/hooks/useExportPipeline.ts`
- `app/api/services/thinkforge/session/route.ts`
- `lib/shared/project-links.ts`

What works:

- New ThinkForge sessions can create lightweight Editron script-stage projects.
- Project links tie ThinkForge session ids to Editron project ids.
- Scripts can be exported to Editron scene descriptors.
- LLM scene parsing is primary.
- Regex parsing exists as fallback but has quality gates.
- Export UI can run reference image generation, storyboard review, video generation, voiceover, Editron import, and Director Agent execution.

Limitations:

- This is focused on scripts and AI video production.
- It does not solve post/calendar/static-content planning by itself.
- If LLM parsing fails, fallback can still be brittle, although there are good guardrails.

## Alyzitron Integration

Alyzitron itself is real in the repo as a video analysis service.

Current ThinkForge truth:

- I did not find a dedicated ThinkForge-to-Alyzitron export or analysis route.
- ThinkForge sidecar "refine_voice" can analyze voice quality inside ThinkForge, but that is not Alyzitron.
- Alyzitron writes analysis results back to Editron projects, not directly to ThinkForge content cards/scripts in the inspected path.

Gap:

- The north-star "export post/script content to Alyzitron for analysis" loop is not implemented today.

## Calendar And Content Planning

Implemented pieces:

- `components/dashboard/ThinkForge/PlanningMode.tsx`
- `components/dashboard/ThinkForge/PlanningPanel.tsx`
- `components/dashboard/ThinkForge/PlanningPlaceholder.tsx`
- `components/dashboard/ThinkForge/Calendar.tsx`
- `components/dashboard/ThinkForge/ContentCard.tsx`
- `components/dashboard/ThinkForge/ContentCardModal.tsx`
- `app/dashboard/thinkforge/hooks/useContentPlanning.ts`
- `app/api/services/thinkforge/content-planning/route.ts`
- `app/api/services/thinkforge/content-planning/[id]/route.ts`

Current active UI truth:

- The dock exposes a Planning mode.
- `PlanningMode` renders `PlanningPanel`.
- `PlanningPanel` currently renders `PlanningPlaceholder`.
- The visible product says "Planning Calendar Coming Soon."

Built but not active as the main planning product:

- Calendar component with search, filter, multi-month display, drag interactions, and modal.
- ContentCard type with status, platform, idea, session id, script preview, custom tags, and multiple planned dates.
- CRUD hook with local fallback and optimistic updates.
- Mongo-backed content card routes.

Current gaps:

- Calendar is not wired as the live planning UI.
- No campaign/month-scale planning workflow.
- No trend/news/meme suggestion engine.
- No brand/niche-aware suggestion inbox.
- No automatic Clickatron generation from planned static content.
- `content-planning/[id]/route.ts` types `params` as a Promise but reads it synchronously. That should be fixed before relying on the route.

## Prompt State

Current prompt assets:

- `IdeasAgent` has a senior creative strategist prompt and post-output platform enforcement.
- `UrlBriefAgent` has a structured content analyst prompt.
- `ScriptDraftAgent` resolves and injects the content signal profile.
- `ScriptAuthorAgent` includes writing knowledge, brand context, signal execution rules, and output format rules.
- Social post output rules now explicitly ask for final publishable copy, not production notes or outlines.
- Video script output rules require scene timing, visual, audio, text, mood, and transition labels.
- Compliance checks catch some obvious format/profile failures after generation.

Current prompt problems:

- The system is still prompt-heavy rather than eval-backed.
- It has no unified prompt registry or versioned output contract per content type.
- The author prompt still mixes "professional execution document" framing with publishable copywriting needs.
- Social copy, scripts, research docs, shot lists, and production briefs all travel through the same broad author agent.
- Prompt quality is not yet tied tightly enough to the creative content knowledge doc.
- No golden examples or ICP-specific output tests prove that agency/business outputs are good.

Bottom line: prompts should be reformed, not merely tweaked. The current signal plumbing gives reform a better foundation.

## Production Guidance And Stickman Visual Gap

Current implemented hints:

- `resolveContentSignalProfile()` can detect "production setup guidance" when prompts mention lighting, camera, room, shooting, or on-camera work.
- Video script output rules include camera/visual/audio/text/mood/transition fields.
- Sidecar storyboard actions can generate shot list style outputs.

Missing:

- No user equipment/profile model for number of cameras, lights, room setup, or filming constraints.
- No production diagram schema.
- No stickman-style image/diagram generation.
- No camera/lighting position renderer.
- No integration where the script automatically produces a shoot plan based on the user's real setup.

## Tests And Verification Coverage

Relevant tests exist for:

- signal profile resolution
- author prompt signal injection
- retrieved-context wiring into draft generation
- profile compliance
- Clickatron creative sidecar enrichment
- DataBank ingress and promotion rules
- observer ingress quarantine
- post-mortem scope and promotion
- context scope filtering
- Clickatron source context
- brand event scope and worker behavior

Recent focused verification from the current ThinkForge work:

- Focused ThinkForge signal/Clickatron tests passed in the prior phase.
- Scoped ESLint on touched ThinkForge files passed in the prior phase.
- Full `tsc --noEmit` was baseline-red with unrelated repo errors.
- Full `eslint . --quiet` timed out in the prior phase.

This document itself is Markdown-only and does not change runtime behavior.

## Main Gaps To Close

Priority gaps:

1. Prompt reform for publishable output quality.
2. Real shared Brand Vault integration in ThinkForge draft generation.
3. Preserve voice fingerprints/exemplars through effective BrandDNA resolution.
4. Emit shared `brand_events` from ThinkForge generation, feedback, and exports.
5. Wire the planning calendar as the active UI, not a placeholder.
6. Add campaign/month-scale content planning.
7. Build niche/trend/meme suggestion ingestion and repurposing.
8. Connect static planned content to Clickatron generation.
9. Add Alyzitron analysis handoff for scripts/posts.
10. Build production guidance outputs for camera, lighting, room, and shoot setup.
11. Add evals/golden outputs for ICP use cases: agency LinkedIn posts, Instagram text plus image posts, founder scripts, launch posts, newsletter drafts, and Editron-ready scripts.
12. Refresh stale ThinkForge documentation. `app/api/services/thinkforge/README.md` still describes an older "4 endpoint" architecture and no longer matches the live route surface.

## Recommended Next Phases

### Phase 1: Prompt Audit And Reform

Goal: make outputs better before expanding features.

Scope:

- Audit `ideas-agent`, `script-contract-agent`, `script-outline-agent`, `script-author-agent`, `script-draft-agent`, and `stylist-agent`.
- Define output contracts for social post, caption, ad copy, landing page copy, email, video script, and production brief.
- Add golden-output tests or prompt snapshots for the core ICP cases.
- Keep file touch count small per phase.

### Phase 2: Brand Vault Runtime Context

Goal: make ThinkForge draft generation use the same brand truth as downstream tools.

Scope:

- Resolve `UnifiedBrand` or a Brand Vault equivalent before generation.
- Inject a shared `<brand_context>` block in ThinkForge author prompts.
- Preserve BrandDNA fingerprints and exemplars.
- Decide the source of truth for BrandDNA versus UnifiedBrand versus future Brand Vault.

### Phase 3: Planning Calendar Product Wiring

Goal: make planning a real product surface.

Scope:

- Replace the placeholder with the existing calendar/card UI or a cleaner version.
- Fix content planning route bugs.
- Connect content cards to sessions/scripts and Clickatron export metadata.
- Add campaign and series fields.

### Phase 4: Trend And Meme Repurposing

Goal: create the north-star suggestion loop.

Scope:

- Define niche/brand interest model.
- Add monitored sources or manual trend inbox first.
- Store suggestions with provenance.
- Generate brand-fit repurposing briefs, not final content blindly.

### Phase 5: Cross-Service Analysis Loop

Goal: connect ThinkForge outputs to Alyzitron and learning.

Scope:

- Define what Alyzitron analyzes for text/script/post content.
- Add a ThinkForge analysis handoff route.
- Feed results into DataBank/brand events after quality gates.

### Phase 6: Production Guidance Visuals

Goal: make shootable scripts operational.

Scope:

- Add user filming setup profile.
- Add production guidance schema.
- Generate camera/lighting/position guidance per scene.
- Add simple visual diagram generation or Clickatron-style static render support.

## Plain-English Current State

ThinkForge has the skeleton and some organs of the north-star system. The chat, scripting, memory, signal profile, and Clickatron/Editron handoff pieces are real. The content planning, trend engine, Brand Vault runtime, Alyzitron analysis loop, and production setup visualization are not fully real yet.

The best next move is not to add more agents. It is to make the current generation core more reliable: better prompts, better output contracts, better brand context, and evals that prove the output is good for agencies and businesses.
