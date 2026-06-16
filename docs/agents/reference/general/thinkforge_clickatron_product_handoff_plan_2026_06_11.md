# ThinkForge To Clickatron Product Handoff Plan

Date: 2026-06-11
Status: IMPLEMENTED_AND_VERIFIED_ON_INFRA_BRANCH
Review: CEO_REVIEWED_AND_ENG_REVIEWED
Scope owner: cross-service integration only

Related verification: `docs/agents/reference/general/thinkforge_clickatron_integration_verification_2026_06_13.md`

## Goal

Make "Send to Clickatron" a production-grade service handoff from ThinkForge to Clickatron.

This phase is not responsible for Clickatron's internal carousel editor, canvas renderer, or final publishing UX. It is responsible for the integration boundary: what ThinkForge sends, what the user sees before sending, what Clickatron receives, and what provenance survives the handoff.

## Non-Negotiables

- Do not build another prompt-only bridge.
- Do not invent a second handoff schema.
- Do not expose raw internal IDs as normal user-facing copy.
- Do not silently generate when the hidden creative spec is stale, invalid, or missing required user intent.
- Do not call this bridge "unified" unless the producer path, decision owner, data source of truth, and final consumer are verified in code.
- Do not edit Clickatron's carousel editor/rendering internals in this phase.
- Do not exceed five touched files per implementation phase.
- Re-read every file immediately before editing it.
- Verify after every phase and wait for explicit approval before the next phase.

## Current Code Anchors

Existing contract and generation path:

- `lib/thinkforge/schemas/clickatron-creative-contract.ts` defines `ClickatronCreativeSpec`.
- `lib/thinkforge/utils/clickatron-creative-sidecar.ts` asks ThinkForge agents for hidden non-video creative specs.
- `lib/thinkforge/clickatron-context.ts` extracts the spec and builds `sessionDraft`.
- `app/api/services/thinkforge/clickatron-context/route.ts` resolves the current ThinkForge session/script/project context.
- `components/dashboard/ThinkForge/export/hooks/useExportPipeline.ts` currently calls the context route and creates a Clickatron session.
- `components/dashboard/ThinkForge/export/ExportCompletePanel.tsx` currently exposes this as "Create Thumbnail".
- `app/api/services/clickatron/session/route.ts` persists `brandId`, `projectId`, `universalId`, `sourceContext`, and metadata.
- `lib/clickatron/brand-prompt-context.ts` consumes ThinkForge source context and creative spec metadata in the Clickatron prompt path.

Existing weakness:

- The frontend builds a generic thumbnail prompt first and ignores most of `context.sessionDraft`.
- The UI does not show `ready`, `needs_user_input`, `stale`, `invalid`, or `missing_sidecar` states.
- The user cannot supply missing visual intent at handoff time.
- The UI does not show readable provenance for source blocks.
- Debug/admin visibility for hidden sidecar metadata is not explicit.

## In Scope

- A handoff state model for ThinkForge -> Clickatron.
- A polished ThinkForge-side "Send to Clickatron" panel.
- Ready/stale/needs-input/invalid/missing-sidecar status.
- Minimal visual intent collection when the spec asks for user input.
- Correct use of `context.sessionDraft.prompt`, `context.sessionDraft.aspectRatio`, and `context.sessionDraft.metadata`.
- Preservation of `sourceBlockIds`, `contentHash`, `contentCardId`, `campaignId`, `universalId`, `brandId`, `projectId`, `sourceSessionId`, and `sourceScriptId`.
- Source block provenance shown as human-readable snippets in the UI.
- Collapsed debug/admin view for raw sidecar/session metadata.
- Tests for handoff state, payload construction, and no-ID-leak UI helpers.

## Out Of Scope

- Clickatron internal carousel editor.
- Clickatron canvas/rendering architecture.
- Alyzitron static/carousel review.
- UploaderX carousel publishing.
- Brand Vault as canonical brand resolver.
- Graphiti read/write expansion.
- Content calendar scale workflows.
- New orchestrator service.

Those are later service-level or broader integration phases.

## Data Flow Target

```text
ThinkForge visible post/carousel content
        |
        v
hidden exportMeta.clickatron
        |
        v
/api/services/thinkforge/clickatron-context
        |
        v
ThinkToClickContext + sessionDraft
        |
        v
ThinkForge "Send to Clickatron" panel
        |
        v
Clickatron session create API
        |
        v
Clickatron task + first variation metadata
```

## Handoff State Machine

```text
missing_sidecar
  -> user cannot send as rich handoff
  -> fallback can be explicit "Create from visible text only" later, not this phase

needs_user_input
  -> show missing questions
  -> collect only required visual choices
  -> rebuild/override handoff intent locally
  -> send when resolved

ready
  -> show summary
  -> send sessionDraft exactly

stale
  -> show why stale
  -> require user confirmation or regeneration
  -> no silent send

invalid
  -> show blocking validation issue
  -> no send
```

## User-Facing UI Requirements

The final ThinkForge panel should answer five questions:

- What am I sending: single post visual or carousel?
- Where is it going: platform and aspect ratio?
- Is it ready: ready, needs input, stale, invalid, or missing sidecar?
- What content is it based on: readable source block snippets?
- What will Clickatron start with: image prompt, slide count, text layer summary?

User controls:

- Kind: single visual or carousel.
- Platform: generic, Instagram, LinkedIn, X, Facebook, YouTube, TikTok, Pinterest.
- Aspect ratio.
- Visual mode: auto, photo, illustration, product mockup, text-forward graphic, diagram, mixed.
- Text density: none, low, medium, high.
- Optional notes.

Only show controls that are missing or useful for confirmation. The panel should not become a full creative editor.

## Debug/Admin Visibility

Normal user view:

- readable status
- readable warnings
- source snippets
- prompt/slide summary

Debug view:

- raw `exportMeta.clickatron`
- raw `sourceBlockIds`
- `contentHash`
- `contentCardId`
- `campaignId`
- `universalId`
- `sourceSessionId`
- `sourceScriptId`
- payload sent to Clickatron

Debug view must be collapsed by default and should not use raw IDs as headline UI.

## Payload Rules

Ready handoff must use:

- `context.sessionDraft.prompt`
- `context.sessionDraft.aspectRatio`
- `context.brandId`
- `context.projectId`
- `context.universalId`
- `context.sourceService`
- `context.sourceSessionId`
- `context.sourceScriptId`
- `context.metadata`

Fallback generic prompt may only be used when no creative sidecar exists and the user explicitly chooses a degraded fallback. That degraded fallback is out of scope for the first production phase.

## Phase Plan

### Phase 0: Rebase And Baseline

Files touched: 0

Deliver:

- Fetch and rebase onto `origin/infrastructure-improvs-+Editron`.
- Confirm clean status.
- Read the current bridge files before editing.

Gate:

- Branch is current.
- No unrelated local changes are mixed into the phase.

### Phase 1: Pure Handoff State Core

Files touched: max 5

Expected files:

- `lib/thinkforge/clickatron-handoff-state.ts`
- `tests/clickatron/think-to-click-handoff-state.test.ts`
- Optional small export from existing ThinkForge/Clickatron context module if needed.

Deliver:

- Pure helper that converts `ThinkToClickContext`, visible blocks, and optional local user intent into a UI-safe handoff state.
- Statuses: `ready`, `needs_user_input`, `stale`, `invalid`, `missing_sidecar`.
- Human-readable source snippet extraction.
- No raw ID leakage in normal display fields.
- Payload preview object for Clickatron session creation.

Gate:

- Focused Vitest passes.
- No UI changes yet.
- The helper has tests for all statuses.

### Phase 2: Payload Correctness In Export Hook

Files touched: max 5

Expected files:

- `components/dashboard/ThinkForge/export/hooks/useExportPipeline.ts`
- `tests/clickatron/think-to-click-handoff-state.test.ts` or focused hook helper test.
- Optional helper file from Phase 1.

Deliver:

- `handleCreateClickatronSession` resolves ThinkForge context first.
- Ready handoff sends `sessionDraft`, not generic thumbnail prompt.
- Stale/invalid/missing-sidecar states do not silently send.
- Needs-input state can merge user-confirmed visual choices into metadata/payload.
- Error messages distinguish context failure, validation failure, and Clickatron session failure.

Gate:

- Existing ThinkForge -> Clickatron tests still pass.
- New payload tests prove `sourceContext` and `creativeSpec` survive.
- No Clickatron internals touched.

### Phase 3: Polished Send Panel

Files touched: max 5

Expected files:

- `components/dashboard/ThinkForge/export/ExportCompletePanel.tsx`
- Optional new component: `components/dashboard/ThinkForge/export/ClickatronHandoffPanel.tsx`
- Optional small type/helper file from Phase 1.

Deliver:

- Replace "Create Thumbnail" with "Send to Clickatron".
- Show kind/platform/aspect ratio/status.
- Show source snippets and creative brief summary.
- Show slide count and text layer summary for carousel specs.
- Show missing visual choices as compact controls.
- Show stale/invalid blockers clearly.
- Create session without weird manual steps when ready.

Gate:

- UI compiles.
- Buttons disable correctly for blocking states.
- Text fits compact export panel on desktop and mobile widths.

### Phase 4: Debug Details

Files touched: max 5

Expected files:

- `components/dashboard/ThinkForge/export/ClickatronHandoffPanel.tsx`
- Optional test file.

Deliver:

- Collapsed handoff details section.
- Shows raw sidecar/session payload for debugging.
- Normal display still uses snippets, not raw IDs.

Gate:

- Debug section is collapsed by default.
- Tests or source inspection prove internal IDs are not used as normal display labels.

### Phase 5: Verification And Handoff Report

Files touched: max 2 docs/test files if needed.

Deliver:

- Run focused Vitest:
  - `tests/thinkforge/clickatron-creative-contract.test.ts`
  - `tests/thinkforge/clickatron-creative-sidecar.test.ts`
  - `tests/clickatron/think-to-click-context.test.ts`
  - new handoff state tests
- Run `npx eslint . --quiet`.
- Run `npx tsc --noEmit` and record baseline failures separately if unrelated.
- Browser QA if a local dev server is practical.
- Commit and push each completed phase to `infrastructure-improvs-+Editron`.

Gate:

- No touched-file TypeScript errors.
- No touched-file ESLint errors.
- Existing repo-wide baseline failures are explicitly listed and not hidden.

## Acceptance Criteria

The bridge is acceptable only when:

- A ready ThinkForge post can create a Clickatron session using the hidden creative sidecar.
- A ready ThinkForge carousel can create a Clickatron session preserving slide metadata in task/variation metadata.
- A stale spec is visibly blocked or requires explicit user action.
- A needs-input spec asks only the missing visual choices.
- An invalid spec does not create a Clickatron session.
- Normal UI shows readable source content, not raw block IDs.
- Debug/admin view exposes raw metadata when needed.
- Clickatron receives full source context and metadata.
- No Clickatron service-internal carousel editor/rendering code is changed in this phase.

## Implementation Evidence

Branch:

- Local branch: `codex/infra-creative-chain`
- Remote target: `origin/infrastructure-improvs-+Editron`
- Ahead/behind after fetch: `0 0`

Committed phases:

- `b46c48c3 docs: plan thinkforge clickatron handoff`
- `b168418c feat: wire thinkforge clickatron handoff`
- `2ae4bb20 feat: add thinkforge clickatron handoff debug panel`
- `bcceb81f fix: declare uploaderx facebook form-data dependency`

Verified producer to consumer path:

- `lib/thinkforge/clickatron-handoff-state.ts` builds a sendable handoff only when the creative sidecar and session draft are valid. It marks missing sidecar, invalid metadata, stale content hash, missing source blocks, and needs-input cases as blocked.
- `components/dashboard/ThinkForge/export/hooks/useExportPipeline.ts` resolves `/api/services/thinkforge/clickatron-context` before creating a Clickatron session, builds the Clickatron prompt from the handoff payload, appends visual choices, and sends `brandId`, `projectId`, `universalId`, `sourceService`, `sourceSessionId`, `sourceScriptId`, and JSON metadata.
- `components/dashboard/ThinkForge/export/ClickatronHandoffPanel.tsx` shows handoff status, post/carousel choice, platform, aspect ratio, vibe, image style, the image prompt, readable source snippet, blocker text, and a collapsed debug payload.
- `app/api/services/clickatron/session/route.ts` persists the source context and creation metadata on the Clickatron task, first variation, and queued generation job.
- `lib/clickatron/brand-prompt-context.ts` consumes `metadata.sourceContext` and `metadata.clickatron.creativeSpec` in Clickatron prompt context, while explicitly instructing the image model not to render source IDs or internal metadata text.

Verification run on 2026-06-12:

- `npx vitest run tests/thinkforge/clickatron-creative-contract.test.ts tests/thinkforge/clickatron-creative-sidecar.test.ts tests/clickatron/think-to-click-context.test.ts tests/clickatron/think-to-click-handoff-state.test.ts`: passed, 4 test files and 22 tests.
- `npm run test:creative-chain`: passed, 19 test files and 96 tests.
- `npx eslint . --quiet`: passed.
- `npx tsc --noEmit --pretty false`: failed on existing repo-wide baseline errors outside the ThinkForge to Clickatron touched files.
- Touched-file TypeScript filter for `lib/thinkforge/clickatron-handoff-state.ts`, `components/dashboard/ThinkForge/export/hooks/useExportPipeline.ts`, `components/dashboard/ThinkForge/export/ExportCompletePanel.tsx`, `components/dashboard/ThinkForge/export/ClickatronHandoffPanel.tsx`, `tests/clickatron/think-to-click-handoff-state.test.ts`, `app/api/services/uploaderx/facebook/route.ts`, and `form-data`: clean.

Known residuals:

- Full repo TypeScript remains baseline-red in unrelated admin, ThinkForge editor, Clickatron canvas, UploaderX UI, Editron, and script/test utility areas. This phase did not hide or fix those broader errors.
- Browser QA was not completed in this phase because the relevant panel is inside authenticated ThinkForge export state and needs a seeded session/output to inspect honestly. Static source inspection and route/test coverage were used instead.
- Clickatron's real carousel editor/rendering is still out of scope. This integration preserves carousel intent and metadata into Clickatron; it does not make Clickatron's internal carousel renderer first-class.

## Stop Conditions

Stop and ask before continuing if:

- More than five files are needed in a phase.
- Clickatron schema changes become necessary.
- The route needs to mutate ThinkForge script content.
- The fallback path would generate without a validated sidecar.
- Type-check failures appear in touched files.
- Existing user/unrelated changes appear in files we need to edit.

## Follow-Up Work After This Plan

Not part of this implementation:

- Clickatron first-class carousel editor/rendering.
- Optional Alyzitron static/carousel review.
- UploaderX post/carousel publish integration.
- Brand Vault accepted profile resolver.
- Content calendar batch handoff.
- Graphiti learning readback for Clickatron.
