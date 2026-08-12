# Editron CAP-0 capability census v1

Status: **current-truth freeze, not a runtime registry and not certification**
Observed worktree: `D:/google downloads/Front-End-main/editron-worktree`
Branch/HEAD: `infrastructure-improvs-+Editron` / `ff4219109b631fddf71f2bb0ce1afa86d2bec83b`
Evidence basis: HEAD plus the user's pre-existing dirty-working-tree changes on 2026-08-13.

The machine packet is
[`editron-capability-census-v1.json`](./editron-capability-census-v1.json).
The surface comparison is
[`editron-ui-chat-parity-matrix-v1.md`](./editron-ui-chat-parity-matrix-v1.md).

## What this freeze means

CAP-0 answers one question: **what operations does the present code actually
expose, who currently owns their state, and what consumes their output?** It
does not turn this document into another registry. It does not make a manual
slider available to chat. It does not certify a tool because a descriptor,
button, test helper or renderer branch exists.

Every machine row records the current entry surfaces, decision/writer truth,
actual state fields, final consumer, proof, undo/replay, duplicate owners,
parity and support status. Related controls are grouped only where they share
the same current owner and consumer; the row still enumerates every observed
control field.

## Reproducible source counts

These counts deliberately overlap:

| Source surface | Count | How it was obtained |
|---|---:|---|
| Central chat descriptors | 66 | Keys in `CHAT_TOOL_REGISTRY` at `lib/editron/agent/chat-tool-registry.ts:340-408` |
| Compatibility tool bundle | 59 | 39 direct entries in `createTools()` plus transcript 3, visual 10, audio 3 and asset 4 factory entries at `lib/editron/agent/tools.ts:6489-6542` |
| Live chat tools before request-owner filtering | 58 | 59 compatibility entries - 6 semantic shadow authorities - 2 legacy analyzers + 2 editorial-intent + 3 deep-analysis + 2 dubbing entries |
| Direct no-model UI tool bridge | 2 | `add_transition` and `batch_edit_captions` in `app/api/services/editron/chat/tool-call/route.ts:18` |
| `OverlayType` enum values | 22 | `components/editron/editor/version-7.0.0/types.ts:8-30` |
| Overlay enum values dispatched by the renderer | 13 | `case OverlayType.*` labels in `components/editron/editor/version-7.0.0/components/core/layer-content.tsx:107-196` |
| EDL decision types | 13 | `lib/editron/services/reactive-edit-engine.ts:40-43` |
| EDL declared types with no applying mutation | 3 | `cut` returns `null`, `pacing` calls a no-op and `pan` has no case in `lib/editron/services/edl-executor.ts:2695-2903` |

No number in this table is “Editron has N working tools.” The registries and
surfaces overlap, and several entries are filtered, duplicated, advisory,
non-rendering, no-op or missing a certified proof path.

## Current control-flow truth

```text
Manual V1/V2 controls
  -> local Overlay[] / local project state
  -> later whole-state save or autosave
  -> ProjectService CAS receipt
  -> renderer

Chat request
  -> central descriptor metadata
  -> compatibility bundle + added workflow tools
  -> semantic-shadow and request-owner filtering
  -> tool/family workflow
  -> ProjectService or legacy family writer
  -> optional reload/render/proof projection

Director / EDL
  -> 13 declared decision types
  -> family resolver/executor for applying types
  -> in-memory overlays / outer persistence path
  -> renderer
```

This is **partial convergence**. ProjectService now owns important revision,
receipt, checkpoint, proof-projection and overlay-writer paths. Manual controls
still primarily edit a browser-local overlay array and persist later through a
whole-state save. Chat and Director contain additional direct/family workflows.
Sharing a renderer or ProjectService downstream does not make the preceding
decision and mutation paths one canonical operation.

## Highest-risk findings

1. **Manual and chat parity is mostly semantic divergence.** The same human
   concept—add, update, delete, split, trim, move, keyframe, transition,
   caption, SFX, speed or volume—can write through different owners, with
   different fields, proof and undo semantics.
2. **V1 and V2 duplicate surface registries and many media paths.** The V2 tool
   panel explicitly mirrors V1, while timeline asset drops, Pexels placement
   and SFX ingest/add logic are independently implemented.
3. **Speed has incompatible field authorities.** Manual video settings use root
   `speed` and `speedCurve`; shorthand writes `styles.playbackRate`; other paths
   use keyframe speed tracks. The video renderer does not consume all of these
   as equivalent inputs.
4. **Shorthand fade is not renderer-grounded.** It writes `styles.fadeIn` or
   `styles.fadeOut`, while live visual paths consume animation objects or
   opacity keyframes. A success toast is not evidence that the fade rendered.
5. **Shorthand AI fallback drops the request.** The parser creates `aiPrompt`,
   but `contextual-action-bar.tsx:250-254` only opens AI Chat and does not pass
   the prompt onward.
6. **Trim/source semantics differ.** Timeline resize adjusts source offsets and
   caption timing; shorthand trim only changes timeline duration/from. A single
   trim contract does not yet exist.
7. **Three EDL concepts are not executable edits.** `cut` is informational,
   `pacing` is explicitly a no-op, and `pan` is declared without an applying
   switch case. Their presence in the type union is not capability evidence.
8. **The overlay enum mixes panels with saved/rendered layers.** Nine enum
   values are panels or workflow surfaces, not renderer cases. Lottie placement
   currently persists a GIF as `IMAGE`, not as a `LOTTIE` layer.
9. **The V2 sound browser is preview-only.** It is not a second sound-placement
   capability. V1/music/asset-drop/chat/EDL paths own real audio mutations.
10. **The Assets “Extract” surface is declared without an effect.** It is
    classified as `MISSING`, not partial.
11. **Manual transition and caption batch controls call a two-tool direct
    compatibility bridge.** Live chat filters `add_transition` as a shadow
    authority, so using the same function name does not establish UI/chat
    parity.
12. **Browser undo is not receipt undo/replay.** `useHistory` replaces local
    overlay-array snapshots. AI checkpoint restore is a separate CAS-protected
    restore and explicitly has no redo/replay chain.
13. **Render cancellation is only locally evidenced.** The UI stops polling by
    setting local cancellation state; CAP-0 found no matching server-job cancel
    authority in that flow.
14. **Proof remains fragmented.** A writer receipt, EDL trace, atomic overlay
    metadata, render completion and chat render-verification projection are
    different facts. None alone proves the final edit is visually/audibly and
    semantically correct.

## What is genuinely useful today

The census does not say “nothing works.” It verifies useful foundations:

- ProjectService has revision-aware save/autosave, writer receipts, overlay
  writers, checkpoint restore, Director lease/proof-fact operations, chat proof
  projection, MG delivery and audio-rights commits.
- The renderer has real branches for video, text, shape, image, caption,
  sticker, HTML, generated scene, sound, transition, motion graphic and MG
  sequence layers.
- Manual editing exposes a substantial set of real controls: timeline
  placement and trims; transform and keyframes; text, video, image, audio and
  caption properties; assets, stock, SFX, music and transitions; review and
  rendering.
- Chat has read/evidence tools and multiple mutation workflows, with explicit
  request-owner filtering that prevents several legacy shadow authorities from
  being simultaneously exposed.
- EDL has real applying paths for transitions, zoom, speed changes, fades,
  graphics, audio ducking, caption emphasis, SFX and camera shake.

All remain `live-uncertified` or `partial` at capability level because CAP-0 did
not find one common contract that proves save/reload/render/undo/replay parity
for an end user operation.

## Freeze verdict

**CAP-0 current truth is frozen. Certified capability count: 0.**

That count is intentionally strict: certification is a later production claim,
not a judgment that every useful code path is fake. CAP-1 may now compare these
verified rows with current official Adobe product documentation. V2-0 may adapt
a reviewed 30–50-operation subset for research only. Neither next step may
silently convert a missing, shadow or semantically divergent row into a
production planner tool.

Runtime repairs remain separate bounded slices. The first parity repair should
choose one representative operation and route UI and chat through the same
ProjectService-issued command/receipt/proof contract instead of adding another
registry or writer.
