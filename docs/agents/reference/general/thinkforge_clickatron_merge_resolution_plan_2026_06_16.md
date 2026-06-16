# ThinkForge To Clickatron Merge Resolution Plan - 2026-06-16

## Scope Lock

This plan covers only ThinkForge to Clickatron integration conflict resolution and verification.

In scope:

- ThinkForge hidden Clickatron creative sidecar authoring.
- ThinkForge visible-content fallback for posts and carousels when the hidden sidecar is absent.
- ThinkForge export UI handoff state and session creation plumbing.
- Clickatron prompt-context enrichment that consumes ThinkForge metadata.
- Focused tests that prove the producer, transport, and consumer contract.

Out of scope:

- ThinkForge-only writing quality changes unless they break the handoff contract.
- Clickatron renderer/editor product work beyond receiving a valid session payload.
- Editron, Brand Vault, Graphiti, UploaderX, and Alyzitron integration work.
- Unrelated dirty files already present in this worktree.

## Verified Runtime Chain

This is the chain that must keep working:

1. `lib/thinkforge/agents/script-draft-agent.ts`
   - Detects the requested output shape.
   - Builds content signal profile data.
   - Optionally authors `exportMeta.clickatron` through the sidecar helpers.
   - Returns `signalTrace`.

2. `lib/thinkforge/services/chat-service.ts`
   - Persists generated ThinkForge script blocks.
   - Persists `metadata.signalTrace`.
   - Preserves project and brand metadata for later service handoff.

3. `app/api/services/thinkforge/clickatron-context/route.ts`
   - Loads the ThinkForge session, script, project link, and project metadata.
   - Reads user visual choices from the request body.
   - Passes source blocks, creative spec, project metadata, and signal trace into the context builder.

4. `lib/thinkforge/clickatron-context.ts`
   - Uses hidden sidecar when present.
   - Derives a safe visible-content visual spec when sidecar is absent.
   - Preserves `sourceBlockIds`, source ids, project metadata, brand id, and `signalTrace`.
   - Produces a Clickatron session draft and integration metadata.

5. `components/dashboard/ThinkForge/export/hooks/useExportPipeline.ts`
   - Builds a local preview handoff state.
   - Calls the server context route for canonical context.
   - Sends the final `FormData` into Clickatron session creation.

6. `app/api/services/clickatron/session/route.ts`
   - Stores the source metadata, brand id, project id, and prompt payload with the Clickatron task.

7. `app/api/internal/workers/clickatron/variation/route.ts`
   - Merges task, job, and variation metadata.
   - Resolves brand context.
   - Calls `buildClickatronGenerationPrompt`.
   - Sends the enriched generation payload to the model.

## Root Cause Summary

The merge conflict is not just text-level. The two branches changed different pieces of the same contract:

- main added `signalTrace` and expanded project metadata.
- infra added user visual choices, source blocks, visible-content fallback, and Clickatron session `FormData` helper usage.
- main added newer profile-aware sidecar helpers.
- infra had older one-argument sidecar helpers that must not survive as duplicate exports.
- Clickatron prompt context currently leaks raw project metadata like `brandId` into model text when it should stay structured metadata.

The correct merge is contract union, not winner-takes-all.

## Hard Invariants

- `clickatron-creative-sidecar.ts` must keep main's profile-aware signatures:
  - `shouldRequestClickatronCreativeSidecar(input, profile?)`
  - `appendClickatronCreativeSidecarInstruction(input, profile?)`
  - `buildClickatronCreativeSidecarProfile(input, profile?)`
  - `applyContentSignalProfileToClickatronExportMeta(exportMeta, input, profile?)`
- Infra's older one-argument sidecar implementations may donate regex or heuristic logic only.
- There must be exactly one exported implementation for each sidecar helper.
- A social post about video production must not be misclassified as a request for video production.
- Exact user copy should travel as editable Clickatron text-layer metadata, not be rasterized into image pixels by default.
- `brandId` must remain available as structured metadata for lookup, but should not appear as raw prompt text.
- No architecture may be described as fully unified unless producer, transport, decision owner, data source of truth, and final consumer are verified in code.

## Phase 0 - Plan Artifact

Files:

- `docs/agents/reference/general/thinkforge_clickatron_merge_resolution_plan_2026_06_16.md`

Work:

- Create this repo-local plan.
- Record the scope, runtime chain, root causes, phases, and verification gates.

Verification:

- Confirm the file exists in the real git worktree.
- Confirm the worktree branch before edits.

## Phase 1 - Core Contract And Runtime Handoff

Max files touched: 5.

Files:

- `lib/thinkforge/clickatron-context.ts`
- `app/api/services/thinkforge/clickatron-context/route.ts`
- `components/dashboard/ThinkForge/export/hooks/useExportPipeline.ts`
- `lib/thinkforge/utils/clickatron-creative-sidecar.ts`
- `lib/clickatron/brand-prompt-context.ts`

Work:

- Merge infra's source-block and user-visual-choice handoff with main's `signalTrace` and project metadata.
- Pass visual choices and blocks through both local preview and server context generation.
- Keep profile-aware sidecar helper signatures and deduplicate old helper variants.
- Use safer sidecar intent detection so content about video can still become a static post or carousel.
- Keep `brandId` structured, but remove raw `Brand ID` text from generation prompt context.

Verification:

- Conflict marker scan on all Phase 1 files.
- Duplicate exported sidecar helper scan.
- Focused Vitest suite:
  `npx vitest run tests/clickatron/think-to-click-context.test.ts tests/clickatron/brand-prompt-context.test.ts tests/thinkforge/clickatron-creative-sidecar.test.ts tests/clickatron/think-to-click-session-payload.test.ts tests/clickatron/think-to-click-handoff-state.test.ts --reporter=dot`
- Run TypeScript check or a touched-file TypeScript filter if the full repo is baseline-red.
- Pause after Phase 1 verification before Phase 2.

## Phase 2 - Test Union And Fixture Hardening

Max files touched: 5.

Files:

- `tests/clickatron/brand-prompt-context.test.ts`
- `tests/clickatron/think-to-click-context.test.ts`
- `tests/thinkforge/clickatron-creative-sidecar.test.ts`
- `tests/clickatron/think-to-click-session-payload.test.ts`
- `tests/clickatron/think-to-click-handoff-state.test.ts`

Work:

- Union divergent branch coverage without duplicating fixtures.
- Add explicit tests for signal trace, source blocks, metadata merge, visual choices, carousel fallback, and prompt privacy.
- Preserve current passing tests unless their expectation conflicts with the validated production contract.

Verification:

- Same focused Vitest suite.
- Tests include coverage for hidden sidecar, visible-content fallback, prompt privacy, and session payload.

## Phase 3 - UI Handoff Surface

Max files touched: 5.

Files:

- `components/dashboard/ThinkForge/export/ExportCompletePanel.tsx`
- `components/dashboard/ThinkForge/export/ClickatronHandoffPanel.tsx`
- `components/dashboard/ThinkForge/export/ClickatronHandoffDialog.tsx`
- `components/dashboard/ThinkForge/export/hooks/useExportPipeline.ts`
- One focused UI test or story fixture if already present.

Work:

- Polish "Send to Clickatron" without service-level renderer/editor work.
- Show ready, stale, invalid, missing-sidecar, and needs-user-input states.
- Let user choose single post vs carousel, platform, aspect ratio, visual mode, text density, vibe, image style, and notes.
- Keep source-block debug data visible for admin/debug without exposing raw implementation clutter.

Verification:

- Focused UI test if available.
- Browser verification of the handoff panel on a generated ThinkForge post.

## Phase 4 - Full Verification

Work:

- Run final focused test suite.
- Run TypeScript check.
- Run ESLint quiet if configured.
- Review `git diff` for unrelated changes.
- Document any baseline-red failures separately from touched-file failures.

Acceptance:

- ThinkForge post/carousel can send to Clickatron with either hidden sidecar or visible-content fallback.
- Clickatron receives source metadata, brand/project metadata, prompt, text-layer metadata, and signal trace.
- Brand context is used by Clickatron generation without raw internal IDs leaking into prompt copy.
- No duplicate sidecar helper definitions remain.
- No unresolved conflict markers remain.
