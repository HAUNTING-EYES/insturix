# Editron Full Overlay Producer-to-Proof Audit

**Date:** 2026-08-10  
**Status:** code-grounded route audit; no runtime changes  
**Worktree / branch:** `editron-worktree` / `infrastructure-improvs-+Editron`  
**Baseline audited:** `b3015b2116794956ceb4764f3da1bd6e9f67c712`

## Meaning of “full”

This audit covers every persisted render type and every active family named by
the editor's `Overlay` union and atomic-overlay vocabulary. For each family it
traces at least one live or statically reachable producer, mutation/persistence
route, renderer and proof path. When a type declaration or fixture exists but a
live producer was not established, it is marked unproven.

It is not a claim that every historical source file or deployed route is
exhaustively proven. No code may be pruned on the strength of a filename, shared
renderer, unit test, or this inventory alone.

The required end state remains:

```text
producer -> bounded final-form resolver -> canonical ProjectService command
         -> project/timeline revision + writer receipt -> renderer
         -> versioned rendered proof -> undo/replay disposition
```

## Cross-family result

The common present spine is `project.overlays` plus `LayerContent`. Manual UI
usually mutates browser overlay state and later whole-array autosaves; chat,
Director and workers use several ProjectService write methods; render admission
hydrates the project then starts a remote job. That is partial downstream
sharing, not a unified editing system.

- Whole-project save/autosave writes overlay arrays without universal revision
  CAS: `lib/editron/services/project-service.ts:265-321,413-470`.
- Single add/update/delete writes return `void`, without IF1 receipt/undo/proof
  semantics: `:645-697,754-762`.
- Family replace has an `updatedAt` check but returns a boolean rather than a
  writer-issued command receipt: `:705-733`.
- Cloud render reports success after dispatch, not after a bound final artifact
  is proven: `app/api/services/editron/cloudrun/render/route.ts:216-223,
298-316,321-381`.

## Family-by-family ledger

| Family                                      | Producers / persistence                                                                                                  | Renderer and proof reality                                                                                  | Authority verdict                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `CAPTION`                                   | Director track, chat adapter, v1/v2 manual UI, templates, legacy service. Chat uses family CAS; UI local state/autosave. | Shared caption renderer; visibility/readability evidence only, no bound brand/font/transcript/render proof. | Four-plus form authorities.                   |
| `TRANSITION`                                | Unified EDL, manual timeline/browser, chat and Director fallback. Direct path makes independent clip/tile writes.        | Shared renderer, but timing/source-handle semantics differ; no exact semantic render proof.                 | Two active mutation/form owners. P0.          |
| `MG_SEQUENCE`                               | Codegen/EDL durable worker.                                                                                              | Sequence renderer, but row 6 can be behind video and missing MG can continue degraded.                      | Intended lane, not canonical/proof-safe. P0.  |
| `MOTION_GRAPHIC`                            | Native composition/chat tools separate from codegen.                                                                     | Separate renderer branch; no equivalent delivery binding.                                                   | Duplicate automatic MG owner. P0.             |
| `TEXT` / `SHAPE`                            | Text panel local create; chat direct create. Shape UI producer unproven in this audit.                                   | Renderer exists; no command-bound proof.                                                                    | UI/server writers split.                      |
| `STICKER`                                   | Sticker panel local create; chat has distinct HTML-sticker route.                                                        | Shared renderer; no catalog/version/rights proof.                                                           | Split placement authority.                    |
| `HTML_SCENE` / `HTML_STICKER`               | Raw HTML/prompt panel plus chat scene writers.                                                                           | Shared HTML renderer; Phase 0 is only supporting evidence.                                                  | Sandbox/egress/asset contract required.       |
| `GENERATED_SCENE`                           | Schema/renderer exist; production creator not established beyond fixtures/TBD seed.                                      | Loose renderer typing.                                                                                      | Render-capable, live producer unproven.       |
| Lottie / templates                          | Lottie panel inserts remote URL `IMAGE`; template UI expands raw child overlays.                                         | Neither has an overlay renderer identity.                                                                   | UI/expansion concepts, not safe capabilities. |
| `VIDEO` / `IMAGE` / B-roll                  | Manual, chat, Director/worker and stock paths write generic overlays.                                                    | Raw styles/keyframes; missing video placeholder or missing image null.                                      | No one rights/form/proof owner. P0.           |
| reframe/zoom/speed/fade/shake/filter/colour | Reframe/zoom planners; generic tracks/CSS for others.                                                                    | Keyframe interpretation split across `Layer` and media children.                                            | Partial specialty logic, not end-to-end.      |
| SFX/music/dialogue/`SOUND`                  | Transition/MG kinetic SFX, EDL/chat, BGM assignment, generic sound.                                                      | Shared sound renderer; rights preflight better than audible/mix proof.                                      | Multiple selection and mix owners. P0.        |

## Exact P0 findings

### Visual stacking is structurally wrong

`Layer` forces caption z=95 and transition z=85, then derives all other
priority as `100 - row * 10`; it ignores declared `styles.zIndex`
(`components/editron/editor/version-7.0.0/components/core/layer.tsx:13-17,
49-54`). A source video at row 2 has z=80, while codegen `MG_SEQUENCE` on row
6 has z=40. A graphic may render behind the footage it decorates.

This affects generic visual overlays as well: `row` is both track grouping and
effective compositing priority. New row exceptions are not a safe fix.

### Browser and server visual writes conflict

Text creation uses local `Date.now()` IDs and browser `addOverlay`
(`select-text-overlay.tsx:40-70`). Stickers follow separate local state helpers
(`stickers-panel.tsx:121-155`). The HTML panel posts raw data then immediately
sets browser state (`html-scene-panel.tsx:54-86`), while its server route
independently updates the project. Chat uses ProjectService directly. Shared
Mongo state does not make those equivalent transactions.

The production risk is a whole-array manual save/autosave overwriting a
concurrent chat, Director or worker mutation. `_workerAdded` preservation is a
narrow compatibility rule, not a concurrency model.

### Caption manual ownership is unsafe

Manual v1 `CaptionsPanel` creates caption overlays without
`metadata.manual`/`metadata.userEdited`
(`components/editron/editor/version-7.0.0/components/overlays/captions/
captions-panel.tsx:139-158,204-223`). Chat treats a non-generated caption as
manual (`lib/editron/services/chat-canonical-caption-adapter.ts:70-80,237-245`)
but Director only recognises manual work using those flags
(`lib/editron/services/canonical-caption-track.ts:461-472`). Director can
therefore create a second generated caption track beside a UI-created manual
track.

### Transition “success” does not mean correct visual output

The direct transition path places a tile at `boundary - full overlap`
(`lib/editron/agent/tools.ts:4223-4228,4256-4266`), while EDL centers it at
`boundary - half duration` (`lib/editron/services/edl-executor.ts:3192-3193`).
It performs independent writes. Image seams are licensed by the boundary logic
but decoded as video in the renderer (`transition-boundary.ts:21-28`,
`transition-layer-content.tsx:46-79`). No proof binds source pair, handles,
style, boundary and rendered output together.

### Media and B-roll lack delivery-grade rights and proof

Media overlays accept raw `filter`/`transform` strings and generic keyframes
(`types.ts:34-83,144-172,885-911`). Missing video renders a placeholder and a
missing image can render nothing (`video-layer-content.tsx:136-147,182-189`,
`image-layer-content.tsx:84-98,113-134`). Render admission checks audio rights,
not equivalent visual-media rights.

`stock-video-service.ts:23-33,68-117,218-264` rehosts stock media but does not
retain provider work ID, author, licence/terms version, permitted-use decision,
or project-level provenance binding. It is ingestion, not client-delivery proof.

### Audio has strong rights preflight but no single mix/proof owner

BGM conditioning is the strongest audio mutation path and uses one family CAS
(`background-music-assignment.ts:203-445,497-510`), but it shares a chat-owned
ducking helper. Transition and MG kinetic SFX append raw overlays. Sound roles
are inferred from rows/prefixes/strings; the renderer returns `null` for missing
source (`sound-layer-content.tsx:15,77-79,102`).

`render-audio-rights-authority.ts:127-210,218-313,385-548` correctly fails
closed for asset-rights evidence. It does not prove decode, sync, waveform,
peak/LUFS, clipping, ducking response, intelligibility, stems or master output.

## Valuable working components to retain

The audit does not discard existing engineering. These are specialists that
should become evidence producers, legal-catalog helpers, form owners or renderer
consumers behind the canonical command path:

- cut-timeline caption projection, grouping, safe placement and contrast checks;
- deterministic transition and zoom form helpers;
- codegen MG jobs and sequence-asset hydration;
- source-media hydration and video speed rendering;
- BGM conditioning and beat-grid derivation;
- SFX form/ranking and render-side audio rights enforcement;
- Phase 0 rendered-aesthetic evidence as diagnostic/supporting evidence.

None should remain a parallel project mutation authority.

## Safe migration boundary

1. Preserve `Overlay[]` readers/current renderer for saved projects. Do not
   prune before state, reload, render, proof, undo/replay and manual-authorship
   fixtures pass for each migrated producer.
2. Do not introduce a second project, timeline, journal, checkpoint, registry,
   queue or proof authority. ProjectService is the future issuer after the IF1
   and Phase 2C foundations are deliberately integrated.
3. Use one final form owner per family: CaptionFormResolver,
   TransitionFormResolver, AI-MG owner, MediaPlacementResolver,
   CameraMotionResolver and Audio/Mix resolver. A planner may propose/rank,
   never duplicate final form logic.
4. Start after foundation with one bounded manual/chat adapter mapped to the
   existing overlay projection. Generic text/shape is lower risk than raw HTML,
   generated code, complex media or mastering.
5. Render dispatch, preview, quality metric or warning never counts as
   completion. Require IF1 `PASS`/`FAIL`/`UNVERIFIABLE` proof with exact
   state/reload/render and family semantic obligations.

## Branch-integration blocker

This branch contains neither Phase 2C `7e9b4dd7…` nor frozen IF1. The five-file
IF1 artifact was temporarily cherry-picked with provenance and its focused
tests passed, but `tsc` rejected it because `ProjectMutationReceiptV1` is
defined by the missing Phase 2C ProjectService runtime. It was immediately
reverted. The branch has no net tracked content change from `b3015b211`.

IF1 cannot be isolated on this branch. The correct next engineering task is to
split and reconcile the 19-file Phase 2C runtime migration into reviewed
no-more-than-five-file phases, then reintroduce IF1. Do not copy the receipt
type or create another issuer to silence the error.

## Result

The audit is sufficient to reject blanket legacy pruning, claim universal
overlay convergence, or begin broad capability expansion. It is sufficient to
plan a safe command/proof migration because every active family now has a
recorded writer/render/proof gap and a safe boundary.
