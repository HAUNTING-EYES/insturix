# Editron overlay producer-to-proof ledger - Slice 1, Phase 1

## Scope and status

This is the Phase 1 implementation artifact for Immediate Slice 1 in
`EDITRON_FINAL_EXECUTION_PLAN_2026-08-10.md`.  It is a read-only,
code-grounded authority ledger for `infrastructure-improvs-+Editron` at
`b3015b2116794956ceb4764f3da1bd6e9f67c712`.

It records current paths; it does not bless them as canonical.  `Shared
renderer` means only shared downstream plumbing, not a shared decision or
mutation owner.  No removal, relocation to `legacy`, runtime wiring or policy
change is authorised by this document.

The required target for every automatic editing family remains:

```text
producer -> bounded resolver -> canonical command -> ProjectService
         -> persisted projection -> renderer -> versioned proof -> receipt/undo
```

## Confirmed P0 findings

1. `MG_SEQUENCE` is placed on `ROW.MOTION_GRAPHICS` (row 6) by
   `lib/editron/motion-graphics/codegen/sequence-artifacts.ts:125-166`, while
   `components/editron/editor/version-7.0.0/components/core/layer.tsx:36-43`
   derives non-caption/non-transition z-index as `100 - row * 10`.  It can
   therefore render at z=40 behind normal source video at row 2/z=80.
2. `lib/editron/motion-graphics/codegen/mg-delivery.ts:16-22` defaults the
   delivery policy to `degraded_allowed`.  The cloud-render route calculates
   preflight but allows the job to proceed with `trackingStatus: 'degraded'`
   (`app/api/services/editron/cloudrun/render/route.ts:123-132,283-292`).
   This is an honest warning, but it is not an IF1-style visible non-success
   receipt.

## Active-family ledger

| Family and active producer | Current mutation/persistence path | Renderer and proof consumer | Authority verdict and safe migration boundary |
|---|---|---|---|
| **AI code-generated MG** - EDL graphic decisions and durable MG render jobs (`lib/editron/services/edl-executor.ts:4283-4887`; `lib/editron/motion-graphics/codegen/mg-render-job-runner.ts:463-487`) | `buildMgSequenceOverlay` emits `MG_SEQUENCE`; worker attaches it to project overlays and creates a sequence asset (`sequence-artifacts.ts:125-166`).  The codegen outcomes also live under `intelligence.mgCodegenRun`. | `asset-resolver.ts:350-352` hydrates a sequence; `LayerContent` renders the `MG_SEQUENCE` branch (`layer-content.tsx:189-195`); cloud render invokes MG preflight. | **Primary intended auto-MG path, but not yet canonical.** Keep it; adapt it to the future command/proof owner.  Its row/z-order and degraded outcome are P0. |
| **Native composition MG** - chat `addMotionGraphic` and `autoMotionGraphics` (`lib/editron/agent/tools.ts:3992-4138,4867-5065`) | Direct tool path composes an overlay and writes a `MOTION_GRAPHIC` form on the graphics row.  It is independently callable beside codegen. | `LayerContent` has a separate `MOTION_GRAPHIC` branch (`layer-content.tsx:182-187`).  No equivalent MG delivery ledger proves it as a codegen outcome. | **Duplicate automatic form authority.** Do not delete yet; it must become a compatibility/manual adapter or be removed only after saved-project and proof parity. |
| **Generic text / text-based titles** - editor text panel and chat tools | Direct visual overlay mutation and whole-state editor autosave can create `TEXT`, independently of either MG lane. | `LayerContent` `TEXT` branch; no evidence that a title request is always resolved through an MG owner. | **Duplicate for title/lower-third intent.** Preserve as manual authoring only until the future capability contract routes automatic title intents to the AI-MG owner. |
| **HTML scenes/stickers and generated scenes** - `generateHtmlScene`, templates and related chat/editor sources (`tools.ts:6482-6484`) | Independently persisted `HTML_SCENE`, `HTML_STICKER` or `GENERATED_SCENE` forms. | Independent `LayerContent` branches at `layer-content.tsx:156-177`. | **Overlapping visual-output authority.** Retain saved-project rendering; do not allow it to become another automatic MG final-form owner. |
| **Lottie, stickers, shapes and templates** - editor panels (`lottie-panel.tsx:56-60`; `stickers-panel.tsx:35-38`) | Direct local overlay placement, generally on the same graphics row. | `LayerContent` uses their respective visual branches. | **Manual asset authoring, not a safe auto-edit owner.** Keep as manual capability candidates; map every direct import before pruning executable template code. |
| **Captions** - Director/canonical track, chat adapter, V1/V2 manual UI and legacy templates | Director and chat reach canonical caption-track helpers, while manual UI creates local caption overlays then autosaves.  Chat's omitted style defaults to TikTok (`tools.ts:2596-2649`); the UI has independent defaults. | Preview/export share `CaptionLayerContent` through `LayerContent`; current proof checks readability/presence but not brand fit. | **Partial convergence only.** No new style catalogue until a single brand-aware `CaptionFormResolver` and canonical command are defined. |
| **Transitions** - EDL/unified planner, manual timeline/browser, direct chat/Director fallback | Unified path emits EDL transition tiles; manual/direct `add_transition` mutates clips and a tile separately (`tools.ts:4143-4299`). | One transition renderer, but distinct timing and persistence forms; quality proof does not prove source-pair/handle/render equivalence. | **Two active writers.** Future `TransitionFormResolver` must own timing, geometry, source handles and audio anchor.  Do not expand catalog first. |
| **SFX/music/dialogue** - EDL/catalog/kinetic context, dedicated BGM, generic `SOUND` editor overlays | Different paths select/place sound and duck dialogue independently.  S2 is calibration tooling only, not a production selection owner. | Shared audio rendering is downstream; audible proof and a rights-aware mix-session form are incomplete. | **Multiple audio authorities.** Keep the S2 tooling and current catalog as inputs; consolidate only behind an audio resolver/mix-session contract. |
| **B-roll/images/reframe/camera motion/effects** - manual placement, chat asset tools, auto-edit/EDL, keyframe/post-processing paths | `VIDEO`/`IMAGE` placement and direct keyframe mutations remain separately reachable. | Shared media renderer does not prove shared source identity, rights, crop, motion or undo semantics. | **Multiple placement/form authorities.** Future `MediaPlacementResolver` and `CameraMotionResolver` own final automatic forms; manual UI must call the same command. |

## Producer-to-proof evidence gaps

| Gap | Code-grounded condition | Required later action |
|---|---|---|
| Generated MG compositing | Row has been used as both timeline grouping and visual compositing order. | Introduce an explicit visual stacking/form rule behind the canonical sequence graph; do not add more row exceptions. |
| Generated MG delivery | Existing preflight correctly lists missing graphics but the default is degraded continuation. | Stage 1 must bind this to a command receipt whose `UNVERIFIABLE` state is visible and cannot be sold as success. |
| Caption brand fit | Brand data can reach planning/EDL yet is not a required final form input. | Slice 3 defines a rights-cleared evaluation set and one resolver before any mass style expansion. |
| Transition semantic output | Manual and EDL timing/pair/handle semantics differ despite shared rendering. | Establish a canonical form and render proof before adding transition families. |
| Audio rights and audible proof | SFX, music and direct sound have no single selection/mix authority. | Build the licensed catalog and audio resolver after human calibration, not an LLM-only selector. |
| Saved-project compatibility | Existing documents can contain every rendered overlay form listed above. | Every migration needs an explicit reader/adapter or reversible record before its producer is removed. |

## Phase 2 test seams - proposal only

Phase 2 is not started by this ledger.  It must be separately reviewed and
must stay within five files.

1. **MG compositing fixture:** extend or add a focused `Layer` test that renders
   a normal video overlay (row 2) and a code-generated `MG_SEQUENCE` (row 6)
   in the same composition.  The acceptance assertion must be semantic - an
   intended visible MG stacks above its decorated source - rather than locking
   the current row arithmetic.  The likely code/test seam is
   `components/.../core/layer.tsx` plus a new focused test beside the existing
   MG sequence tests.
2. **MG delivery disposition fixture:** retain the existing pure preflight
   coverage in `tests/editron/mg-delivery-preflight.test.ts`, then add a route-
   level fixture proving that a missing required MG is returned as a visible
   non-success/needs-review disposition once Stage 1 supplies that receipt
   contract.  Do **not** merely change the default environment policy to
   `strict`; that would be a product-policy change without the required
   command/receipt UX.

## Stop conditions

- Do not move any MG, template, caption, transition, audio or media directory
  to `legacy` from filename similarity alone.
- Do not make native composition MG or HTML scene code another AI-MG authority.
- Do not create a second project, command, revision, proof, queue or timeline
  owner while repairing the defects above.
- Do not treat a warning, a local preview, a successful tool return, or a
  shared renderer as rendered proof of the requested result.
