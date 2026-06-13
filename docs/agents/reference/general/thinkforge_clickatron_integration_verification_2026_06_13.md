# ThinkForge To Clickatron Integration Verification

Date: 2026-06-13
Branch verified: `codex/infra-creative-chain`
Remote target: `origin/infrastructure-improvs-+Editron`
Status: CODE_VERIFIED_WITH_CONDITIONAL_LIVE_BRAND_CONTEXT
Scope: ThinkForge post/carousel handoff into Clickatron generation prompt and model payload.

## Executive Verdict

The ThinkForge to Clickatron integration is real shared downstream plumbing, not just a UI label.

The verified path is:

```text
ThinkForge session/project metadata
  -> ThinkForge Clickatron context route
  -> ThinkToClickContext
  -> ThinkToClickHandoffState
  -> Clickatron session FormData
  -> Clickatron task + variation + job metadata
  -> Clickatron worker prompt enrichment
  -> model-specific payload prompt
```

`brandId` is carried from ThinkForge into Clickatron, and Clickatron can inject Brand Vault-style brand context into the generation prompt.

The important condition is that the worker must resolve a real `UnifiedBrand` for `{ userId, brandId }`. If `brandId` is missing, or `getUnifiedBrand()` returns null, the prompt still gets ThinkForge source context, but it does not get a `<brand_context>` block.

Do not describe this as full Brand Vault convergence yet. The runtime consumer here is `UnifiedBrand`, formatted by `buildBrandContextBlock()`. Accepted Brand Vault `BrandSignalProfile` records are not the canonical source for this Clickatron prompt path yet.

## Terms

`brandId` is the carrier ID. It links the generated Clickatron output back to a brand.

`UnifiedBrand` is the runtime read bridge used by Clickatron prompt generation. It merges an Editron brand document with ThinkForge BrandDNA on demand.

`Brand Vault` is the broader brand intake/review/persistence system. It can produce accepted `BrandSignalProfile` records, but this Clickatron generation path does not read those accepted profiles directly yet.

`sourceContext` is provenance metadata. It explains where the Clickatron request came from: source service, ThinkForge session/script, universal project link, brand, and project.

`clickatron_source_context` is the safe prompt block generated from ThinkForge creative metadata. It keeps creative intent, platform, layout, image prompt, and text-layer summaries while suppressing raw internal IDs.

`brand_context` is the brand prompt block generated from `UnifiedBrand`.

## Code Path

### 1. ThinkForge resolves the source session and project metadata

Entry point:

- `app/api/services/thinkforge/clickatron-context/route.ts`

Verified behavior:

- Reads the ThinkForge session through `db.getSession(sessionId, userId, orgId)`.
- Uses `session.projectMeta || {}` as the project metadata source.
- Creates a `projectLink` when missing and copies `projectMeta.brandId` into that link.
- Calls `buildThinkToClickContext()` with `projectMeta`, `projectLink`, script blocks, visual choices, title, aspect ratio, and scene count.

Relevant anchors:

- `app/api/services/thinkforge/clickatron-context/route.ts:42`
- `app/api/services/thinkforge/clickatron-context/route.ts:46-53`
- `app/api/services/thinkforge/clickatron-context/route.ts:68-78`

### 2. ThinkForge chooses the `brandId`

Core helper:

- `lib/thinkforge/clickatron-context.ts`

Verified behavior:

- `PROJECT_META_KEYS` includes `brandId`.
- `buildThinkToClickContext()` prefers `projectMeta.brandId`.
- If project metadata does not contain a brand, it falls back to `projectLink.brandId`.
- The chosen `brandId` is included in the returned context and in `metadata.sourceContext`.
- The same metadata also includes safe `thinkforge.projectMeta` and the Clickatron creative spec/session draft when available.

Relevant anchors:

- `lib/thinkforge/clickatron-context.ts:19-29`
- `lib/thinkforge/clickatron-context.ts:383-385`
- `lib/thinkforge/clickatron-context.ts:401-406`
- `lib/thinkforge/clickatron-context.ts:417-437`

Test evidence:

- `tests/clickatron/think-to-click-context.test.ts:70-111` proves `projectMeta.brandId` beats a stale `projectLink.brandId`, survives in `context.brandId`, and is present in `metadata.sourceContext.brandId`.

### 3. ThinkForge builds the Clickatron session payload

Core helper:

- `lib/thinkforge/clickatron-session-payload.ts`

Verified behavior:

- Uses the validated handoff payload preview.
- Appends `brandId`, `projectId`, `universalId`, `sourceService`, `sourceSessionId`, and `sourceScriptId` into `FormData`.
- Serializes the handoff metadata as JSON under `metadata`.

Relevant anchors:

- `lib/thinkforge/clickatron-session-payload.ts:45-60`

Test evidence:

- `tests/clickatron/think-to-click-session-payload.test.ts:71-99` proves the final `FormData` contains `brandId`, source IDs, universal ID, project ID, and Clickatron handoff metadata.

### 4. Clickatron stores the brand and source context

Entry point:

- `app/api/services/clickatron/session/route.ts`

Verified behavior:

- Parses `brandId`, `projectId`, `universalId`, source fields, and metadata from multipart form data.
- Builds `sourceContext`, including `brandId`.
- Merges source context into `creationMetadata`.
- Persists `brandId` on the `ClickatronTask`.
- Stores `creationMetadata` on the task, first variation, and initial job payload.

Relevant anchors:

- `app/api/services/clickatron/session/route.ts:44-50`
- `app/api/services/clickatron/session/route.ts:54-67`
- `app/api/services/clickatron/session/route.ts:90-100`
- `app/api/services/clickatron/session/route.ts:123-128`
- `app/api/services/clickatron/session/route.ts:157-168`

### 5. The worker resolves brand context before generation

Entry point:

- `app/api/internal/workers/clickatron/variation/route.ts`

Verified behavior:

- Combines metadata from task, job, and variation.
- Resolves a prompt brand ID from `task.brandId` first, then `metadata.sourceContext.brandId`.
- Calls `resolveClickatronBrandContextBlock(job.userId, promptBrandId)`.
- Calls `buildClickatronGenerationPrompt()` with the original job prompt, source metadata, and resolved brand context block.
- If enrichment changes the prompt, assigns the enriched string back to `job.prompt`.
- Logs whether source context and brand context were actually applied.

Relevant anchors:

- `app/api/internal/workers/clickatron/variation/route.ts:235-245`
- `app/api/internal/workers/clickatron/variation/route.ts:248-253`

Operational log to watch:

```text
[Worker] Clickatron prompt context applied: {
  hasBrandContext: true,
  hasSourceContext: true
}
```

If that log says `hasBrandContext: false`, the integration carried source context but did not inject brand context for that generation.

### 6. The prompt builder injects source and brand context

Core helper:

- `lib/clickatron/brand-prompt-context.ts`

Verified behavior:

- `resolveClickatronPromptBrandId()` returns direct task `brandId` first.
- If the task brand is empty, it falls back to `metadata.sourceContext.brandId`.
- `resolveClickatronBrandContextBlock()` imports `getUnifiedBrand()` and `buildBrandContextBlock()` when deps are not injected.
- `buildClickatronGenerationPrompt()` builds a source context block, appends the brand context block when present, wraps the original request in `<clickatron_thumbnail_request>`, and adds generation rules.
- The rules tell the model to use source and brand context for concept, composition, color, tone, audience fit, and overlay-safe negative space.
- The rules also tell the model not to rasterize readable text, letters, numbers, headings, CTA text, watermarks, signatures, logo text, or internal metadata.

Relevant anchors:

- `lib/clickatron/brand-prompt-context.ts:156-164`
- `lib/clickatron/brand-prompt-context.ts:167-183`
- `lib/clickatron/brand-prompt-context.ts:187-238`
- `lib/clickatron/brand-prompt-context.ts:241-263`

Test evidence:

- `tests/clickatron/brand-prompt-context.test.ts:87-126` proves the generated prompt contains `<clickatron_source_context>`, the original thumbnail request, generation rules, and a brand block, while suppressing raw internal IDs.
- `tests/clickatron/brand-prompt-context.test.ts:204-225` proves task `brandId` wins over source-context `brandId`, and the Brand Vault-style resolver receives the expected `{ userId, brandId }`.
- `tests/clickatron/brand-prompt-context.test.ts:228-261` proves resolved brand context survives into the final model payload prompt.

### 7. `UnifiedBrand` is the live brand source for this prompt

Core files:

- `lib/shared/brand-registry.ts`
- `lib/shared/brand-context-block.ts`

Verified behavior:

- `getUnifiedBrand(userId, brandId)` fetches the Editron brand document for `{ userId, brandId }`.
- It also fetches ThinkForge BrandDNA for the user.
- It returns null if there is no Editron brand document.
- `buildBrandContextBlock()` formats the unified brand as `<brand_context>`.
- The block can include brand name, voice, audience/niche, kill list, hook styles, structural habits, colors, visual style, typography, and industry.

Relevant anchors:

- `lib/shared/brand-registry.ts:90-104`
- `lib/shared/brand-registry.ts:171-179`
- `lib/shared/brand-registry.ts:207-231`
- `lib/shared/brand-context-block.ts:32-69`

Important consequence:

If the user has ThinkForge BrandDNA but no matching Editron `brands` document for the same `brandId`, `getUnifiedBrand()` returns null and the Clickatron generation prompt gets no `<brand_context>`.

### 8. The enriched prompt reaches the model payload

Core files:

- `app/api/internal/workers/clickatron/variation/route.ts`
- `lib/config/clickatron-models.ts`

Verified behavior:

- The worker replaces `job.prompt` with the enriched prompt before payload construction.
- `generateModelPayload()` passes `job.prompt` into the model-specific payload builders.
- The default text-only model path for a new Clickatron variation is `fal-ai/imagen4/preview`, and its payload uses `prompt: job.prompt`.

Relevant anchors:

- `app/api/internal/workers/clickatron/variation/route.ts:248-253`
- `app/api/internal/workers/clickatron/variation/route.ts:515`
- `lib/config/clickatron-models.ts:593`
- `lib/config/clickatron-models.ts:991-1084`

Test evidence:

- `tests/clickatron/brand-prompt-context.test.ts:228-261` constructs a resolved brand block, enriches the Clickatron prompt, sends it through `generateModelPayload("fal-ai/imagen4/preview", ...)`, and asserts the final payload prompt contains `<brand_context>`, brand name, brand voice, and `<clickatron_thumbnail_request>`.

## Prompt Shape

When both source context and brand context resolve, the model-facing prompt has this shape:

```text
<clickatron_source_context>
Handoff: think-to-click
Source service: thinkforge
Thumbnail title: ...
Aspect ratio: ...
Creative kind: ...
Asset intent: ...
Platform: ...
Creative objective: ...
Core message concepts: ...
Hook concepts: ...
Image prompt: ...
Layout intent: ...
Text policy: editable_text_layers
Text layers: headline layer planned (... exact copy withheld from raster prompt)
Text-layer copy handling: exact copy is metadata only; do not rasterize it in the generated image.
Carousel slides: ...
brandBrief: ...
</clickatron_source_context>

<brand_context>
Brand: ...
Voice: ...
Audience/Niche: ...
NEVER use these words/phrases: ...
Preferred hook styles: ...
Structural habits: ...
Brand colors: ...
Visual style: ...
Typography: ...
Industry: ...
</brand_context>

<clickatron_thumbnail_request>
Original Clickatron visual request
</clickatron_thumbnail_request>

<clickatron_generation_rules>
Use source and brand context for concept, composition, color, tone, audience fit, and overlay-safe negative space.
Generate the raster image as a text-free visual/background, not a finished poster with baked-in copy.
...
</clickatron_generation_rules>
```

Note: exact source IDs and raw `brandId` values are control-plane data. They are used to resolve context, but they are not intentionally rendered as normal model-facing prompt text.

## What This Changes For The Generated Output

If `hasBrandContext: true`, the model receives explicit brand context before the image request. That can affect:

- concept selection
- composition
- color palette
- tone
- audience fit
- visual style
- typography guidance for later editable overlays
- negative-space planning for Clickatron text layers

If `hasSourceContext: true`, the model receives ThinkForge creative intent. That can affect:

- single post vs carousel intent
- platform and aspect ratio
- core message concepts
- hook concepts
- image prompt
- layout intent
- text-density and visual-mode expectations
- slide-by-slide carousel background prompts

This does not guarantee perfect output quality. It guarantees the prompt construction path gives the model the data when the runtime conditions are satisfied.

## Verified Conditions

| Claim | Status | Evidence |
| --- | --- | --- |
| ThinkForge can carry `brandId` into the handoff context | Verified | `lib/thinkforge/clickatron-context.ts`, `tests/clickatron/think-to-click-context.test.ts` |
| ThinkForge sends `brandId` to Clickatron session creation | Verified | `lib/thinkforge/clickatron-session-payload.ts`, `tests/clickatron/think-to-click-session-payload.test.ts` |
| Clickatron persists `brandId` and source context on task/job metadata | Verified | `app/api/services/clickatron/session/route.ts` |
| Worker resolves prompt brand ID from task or source context | Verified | `lib/clickatron/brand-prompt-context.ts`, worker route |
| Worker can resolve a brand block through `UnifiedBrand` | Verified in code and injected-dep tests | `resolveClickatronBrandContextBlock()` test |
| Generated prompt includes source and brand context when provided | Verified | `buildClickatronGenerationPrompt()` test |
| Final model payload prompt includes the resolved brand block | Verified | new payload assertion in `tests/clickatron/brand-prompt-context.test.ts` |
| Live production/staging brand context was present for a given user run | Not guaranteed by static code | check worker log for `hasBrandContext: true` |
| Accepted Brand Vault profiles are the canonical prompt source | Not verified, currently false for this path | runtime source is `UnifiedBrand`, not `getLatestAcceptedProfile()` |
| Clickatron reads Graphiti facts before image generation | Not verified | no Graphiti readback in this Clickatron prompt path |

## Failure Modes

### Missing `projectMeta.brandId`

ThinkForge can still use `projectLink.brandId`. If both are missing, Clickatron can still generate from source context, but no brand context can be resolved.

### Stale project link brand

`projectMeta.brandId` wins over `projectLink.brandId`, which prevents a stale project link from overriding the current ThinkForge session brand.

### No matching Editron brand document

`getUnifiedBrand()` returns null when `fetchEditronBrand(userId, brandId)` does not find a brand. This means ThinkForge BrandDNA alone is not enough for this Clickatron prompt path.

### Empty formatted brand block

If `buildBrandContextBlock()` receives null, it returns an empty string. The worker logs `hasBrandContext: false`.

### Prompt length truncation

`buildClickatronGenerationPrompt()` caps the enriched prompt at `MAX_PROMPT_LENGTH` (6000 chars). Long context is truncated at the end, so the most important blocks are placed first.

### Long post copy becoming bad image text

The integration intentionally does not pass long exact post copy as raster text. Text layers are summarized for layout and safe zones. Exact copy should remain editable in Clickatron later.

## Creative Knowledge Check

This path matches the current creative constraints:

- AI image/video prompts should be specific, not generic.
- Do not ask the image model to render legible text for post/carousel copy.
- Use negative space and composition planning so editable overlays can be added later.
- Brand colors and style should guide composition and tone, but logos must come from uploaded assets, not hallucinated image generation.
- Brand voice and visual identity should enter prompts as structured context, not vague adjectives.

Queried references:

- `lib/editron/data/creative-knowledge-graph.json`
- `docs/creative-content-knowledge.md`
- `docs/agents/reference/general/creative_production_knowledge.md`

## Live Verification Checklist

Use this when testing staging or production:

1. Create or select a brand that has an Editron brand document with `brandId`.
2. Ensure the ThinkForge session `projectMeta.brandId` matches that brand.
3. Generate a non-video ThinkForge post or carousel.
4. Open "Send to Clickatron" and confirm the debug payload includes `brandId`.
5. Send to Clickatron and let the first variation enqueue.
6. Inspect worker logs for:

```text
[Worker] Clickatron prompt context applied: { hasBrandContext: true, hasSourceContext: true }
```

7. Inspect the final payload log for a prompt containing:

```text
<clickatron_source_context>
<brand_context>
<clickatron_thumbnail_request>
<clickatron_generation_rules>
```

8. If `hasSourceContext: true` but `hasBrandContext: false`, debug `brandId` and `getUnifiedBrand(userId, brandId)` first.

## Integration Boundary Map

| Layer | Producer | Decision owner | Source of truth | Consumer |
| --- | --- | --- | --- | --- |
| ThinkForge session brand | ThinkForge session API/UI | ThinkForge project/session state | `session.projectMeta.brandId` | ThinkForge Clickatron context route |
| Project link brand fallback | shared project link helper | project-links bridge | `project_links.brandId` | `buildThinkToClickContext()` |
| Handoff creative spec | ThinkForge sidecar or visible-content derivation | ThinkForge authoring/export layer | `exportMeta.clickatron` or derived visible blocks | handoff state + session payload |
| Clickatron session metadata | ThinkForge export payload | Clickatron session route | multipart `FormData` and JSON metadata | Clickatron task/variation/job |
| Prompt brand ID | Clickatron worker | Clickatron worker | `task.brandId` first, then `metadata.sourceContext.brandId` | brand context resolver |
| Prompt brand context | shared brand registry | `UnifiedBrand` runtime bridge | Editron `brands` doc + ThinkForge BrandDNA | Clickatron prompt builder |
| Final model prompt | Clickatron worker/model payload builder | Clickatron generation worker | enriched `job.prompt` | Fal model payload |

## Current Gaps

These are not handwaving gaps; they are specific missing or partial connections.

1. Accepted Brand Vault `BrandSignalProfile` records are not yet consumed by this Clickatron prompt path.
2. `UnifiedBrand` requires an Editron brand document; ThinkForge-only BrandDNA does not produce a Clickatron brand block by itself.
3. Clickatron generation does not read Graphiti facts before image creation.
4. Worker logs prove live presence, but there is no staging canary that asserts `hasBrandContext: true` for a seeded brand.
5. Raster image generation is now instructed to avoid text, but Clickatron still needs first-class editable text/carousel rendering for the final user-visible output quality.
6. The integration carries source block IDs for provenance, but production UI/admin needs better prompt-context inspection without exposing raw IDs to normal users.

## Recommended Next Production Work

1. Add a staging canary with a seeded brand and ThinkForge post that fails if worker logs or payload lack `<brand_context>`.
2. Add a redacted admin/debug prompt preview for Clickatron jobs showing whether source and brand context were applied.
3. Create a canonical `resolveCreativeBrandContext()` adapter that can choose between accepted Brand Vault profile, `UnifiedBrand`, and safe fallbacks with explicit provenance.
4. Wire accepted Brand Vault `BrandSignalProfile` records into the runtime brand resolver after product review decides precedence rules.
5. Add Clickatron output-layer tests that verify exact post/carousel copy becomes editable text layers, not baked image text.
6. Add OCR or image-quality checks in Alyzitron/Clickatron review to flag unreadable generated text or accidental text artifacts.

## Verification Run

Focused verification run:

```bash
npx vitest run tests\clickatron\brand-prompt-context.test.ts tests\clickatron\think-to-click-context.test.ts tests\clickatron\think-to-click-session-payload.test.ts
```

Expected result after this doc update:

```text
3 test files passed
18 tests passed
```
