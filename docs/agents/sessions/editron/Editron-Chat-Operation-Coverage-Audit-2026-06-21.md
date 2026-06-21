# Editron Chat Operation Coverage Audit

Date: 2026-06-21
Branch: `infrastructure-improvs-+Editron`
Commit before audit: `3d43fc7cc53aa16177c946609248d0733fb15d83`

## Scope

Phase 1 read-only operation audit after the chat context, user asset, transcript, visual, audio, and checkpoint restore slices landed.

This audit compares:

- actual callable chat tools from `lib/editron/agent/tools.ts`
- spread-in chat tools from `chat-transcript-tools.ts`, `chat-visual-tools.ts`, `chat-audio-tools.ts`, and `chat-asset-tools.ts`
- metadata in `chat-tool-registry.ts`
- editor/render state in `components/editron/editor/version-7.0.0/types.ts`
- EDL/director operation owners in `edl-executor.ts`, `director-agent.ts`, and related tests/docs
- current Phase 0 baseline expectations in `chat-edit-phase0-baseline.ts`

## Executive Result

Chat is no longer missing the major retrieval layer. The live callable surface now includes:

- `find_transcript_moment`
- `find_visual_moment`
- `find_audio_moment`
- `list_user_assets`
- `search_user_assets`
- `inspect_user_asset`
- `restore_ai_edit_checkpoint`
- `apply_audio_ducking`

The original audit found stale docs and Phase 0 baseline entries. This Phase 2B refresh now marks transcript, asset, visual, audio, and undo retrieval as partial-now, and marks audio ducking as supported-now.

The real remaining operation gap is no longer retrieval or BGM ducking. It is first-class semantic operation exposure, especially:

1. `apply_camera_shake` - EDL can do it, chat cannot ask for it directly.
2. semantic `apply_speed_ramp` - possible through `set_keyframes`, but weak and local-frame-heavy.
3. semantic `apply_fade` - possible through opacity keyframes, but weak and local-frame-heavy.
4. `apply_filter` - registry metadata exists, but no callable chat tool; must respect profile/color-grade ownership.
5. explicit layer reorder / move-retime - partially possible through `update_overlay`, but no dedicated semantic tool or guard.

## Verified Callable Surface

### Core Project And Timeline

Callable now:

- `read_project_file`
- `get_timeline_view`

Status: usable now.

Notes:

- `read_project_file` can expose full/sliced/project JSON.
- `get_timeline_view` can summarize timeline ranges and tracks.

### Overlay CRUD And Timeline Structure

Callable now:

- `add_overlay`
- `update_overlay`
- `batch_update_overlays`
- `split_overlay`
- `trim_overlay`
- `delete_overlay`
- `sync_style`
- `close_gaps`
- `cut_section`

Status: usable now.

Coverage:

- `add_overlay` supports text, image, video, sound, shape, and sticker.
- `update_overlay` supports timing, text, position, dimensions, rotation, row, and style merges.
- `batch_update_overlays` handles bulk timing/layout/style changes.
- `cut_section` handles compound cut/delete/close-gap behavior across overlays.

Important caveat:

- explicit layer reorder is only `row` mutation through `update_overlay`; there is no semantic "move behind / bring forward / reorder layer" tool with guardrails.

### Generated Scene / Sticker / Motion Graphics

Callable now:

- `generate_html_scene`
- `generate_html_sticker`
- `add_motion_graphic`
- `auto_motion_graphics`

Status: usable now, but MG quality is tracked separately in the MG plan.

Notes:

- This audit is not re-opening MG rendering quality.
- The chat surface can request MGs, but MG form quality remains governed by the MG architecture plan.

### Retrieval

Callable now:

- `list_user_assets`
- `search_user_assets`
- `inspect_user_asset`
- `find_transcript_moment`
- `find_visual_moment`
- `find_audio_moment`

Status: usable now with proof tests, but still needs real-project taste/coverage proof.

Evidence:

- `createTools()` spreads in `createChatTranscriptTools`, `createChatVisualTools`, `createChatAudioTools`, and `createChatAssetTools`.
- Side modules declare the names listed above.
- `chat-edit-context.ts` now tells the agent these resolvers are available.
- `chat-edit-context.test.ts` checks module tool names and prompt availability for these resolvers.

Baseline refresh result:

- `cut-transcript-phrase`
- `asset-logo-by-description`
- `visual-reference-logo-appears`
- `sound-reference-beat-drop`
- `undo-ai-edit`

These are now tracked as "partial-now / needs real-project proof" instead of pure expected failures.

### Captions

Callable now:

- `add_captions`
- `add_fancy_captions`
- `refresh_captions`
- `refresh_fancy_captions`
- `batch_edit_captions`

Status: usable now.

Notes:

- Caption timing still benefits from transcript/context resolvers.
- Batch caption edits are chat-callable and mutating.

### Audio / SFX / Music

Callable now:

- `analyze_clip_audio`
- `find_audio_moment`
- `add_sfx`
- `replace_sfx`
- `regenerate_bgm`
- `sync_cuts_to_beats`
- `apply_audio_ducking`

Missing:

- none for the shipped BGM ducking operation

Status: supported for BGM ducking; broader semantic audio cleanup still needs real-project coverage proof.

Why `apply_audio_ducking` is now closed:

- Chat tool support exists: `chat-audio-tools.ts` exposes `apply_audio_ducking`.
- Registry support exists: `chat-tool-registry.ts` marks it mutating and audio-scoped.
- Renderer support exists: sound/video render paths consume `duckingConfig`.
- Director support exists: `director-agent.ts` has `audio_ducking` action handling.
- EDL support exists: `edl-executor.ts` handles `audio-duck` and applies `styles.duckingConfig`.
- Quality support exists: `quality-review-service.ts` and `quality-gate.ts` flag BGM that is not ducking under speech.
- CRG support exists: `mapping:audio.audio_ducking_under_speech`, `intent:authority.audio_ducking`, `constraint:audio.music_speech_competition`, and audio duck constants all exist.
- Focused tests prove BGM-only mutation, SFX/voice skipping, and clear no-BGM failure.

Next implementation should move to the still-missing semantic motion wrappers without inventing a parallel audio mixer.

### Video Motion / Keyframes / Speed / Fade / Shake

Callable now:

- `set_keyframes`

Status:

- zoom/fade/speed are wired but weak.
- camera shake is missing as a chat operation.

Evidence:

- `set_keyframes` supports `x`, `y`, `scale`, `opacity`, `rotation`, and `speed`.
- For video speed, `set_keyframes` also sets `speedCurve`.
- The editor render layer consumes `keyframeTracks` and video `speedCurve`.
- EDL has private handlers for `applySpeedChange`, `applyFade`, and `applyCameraShake`.

Why weak:

- The user says "slow this bit down" or "fade this out"; chat has to infer overlay id, local frame coordinates, duration, and curve values manually.
- That is possible, but not a polished semantic operation.

Next semantic motion wrappers:

- `apply_camera_shake`
- `apply_speed_ramp`
- `apply_fade`

These should be thin semantic wrappers over existing overlay/keyframe state, not new motion engines.

### Filters / Color

Registry metadata exists:

- `apply_filter`
- `applyFilter`

Callable from `createTools()`:

- no actual `apply_filter` tool was found in the returned tool list.

Status: not cleanly exposed.

Important owner boundary:

- `edl-executor.ts` explicitly disables `filter-change` in `applyDecision()`.
- Comment says profile filter / director profile grade is the single source of truth to avoid "filter schizophrenia."
- A private `_applyFilterChange` exists, but dispatch does not call it.

Do not expose filter by simply reviving EDL `filter-change`.

The correct future slice should decide one of:

- manual selected-overlay filter tool that directly updates `styles.filter`, clearly scoped as manual override
- project/profile-level color override tool that routes through the existing profile/filter owner
- keep filter manual-only for now

### Stock / Matching Footage / Style

Callable now:

- `search_stock_footage`
- `use_matching_footage`
- `extract_style`
- `apply_style`
- `auto_edit_from_script`
- `regenerate_scene`
- `analyze_clip_video`
- `analyze_video_content`

Status: usable now, with generative/external-service risk.

Notes:

- These are broad, high-risk operations and already marked generative/high-risk where appropriate.

## Registry Accuracy Findings

`chat-tool-registry.ts` is not the same thing as the callable tool surface.

Findings:

- Some registry entries are callable and returned by `createTools()`.
- Some entries are spread-in side-module tools and are now tested in `chat-edit-context.test.ts`.
- Some entries look like compatibility/shadow metadata and are not returned by `createTools()`, including `apply_filter`, `applyFilter`, `add_text_overlay`, `add_image_overlay`, `add_video_overlay`, `add_audio_overlay`, `list_project_files`, `apply_project_patch`, `generate_image`, and camelCase variants.
- `visual_inspect_frame` exists as a tool definition/registry entry but is commented out in the `createTools()` return list as disabled.

Risk:

- A registry entry can make the UI/test layer look ready even when the agent cannot call the tool.

Recommended fix:

- Add an explicit callable-tool snapshot helper/test that includes `createTools()` return names plus spread module names, and separately labels "registry-only compatibility aliases."

## Phase 0 Baseline Staleness

`chat-edit-phase0-baseline.ts` has now been refreshed after the retrieval, undo, and audio-ducking slices.

Moved from stale expected-failure to partial-now:

- `cut-transcript-phrase`: `find_transcript_moment` now exists, but real-project cut precision and ambiguity handling still need proof.
- `asset-logo-by-description`: `search_user_assets` now exists, but real-project asset-choice quality still needs proof.
- `visual-reference-logo-appears`: `find_visual_moment` now exists, but object/OCR coverage still needs proof.
- `sound-reference-beat-drop`: `find_audio_moment` now exists, but musical-event recall still needs proof.
- `undo-ai-edit`: `restore_ai_edit_checkpoint` now exists, but transaction UX proof is still needed.

Moved from expected-failure to supported-now:

- `operation-audio-ducking`: `apply_audio_ducking` now exists and has focused BGM-only tests.

Still valid expected failures:

- `operation-camera-shake`: no semantic chat tool exists yet.
- `operation-filter-owner`: registry metadata exists, but no callable chat tool should be exposed until the color/profile owner decision is made.

Added operation-gap probes:

- `operation-camera-shake`
- `operation-speed-ramp`
- `operation-fade`
- `operation-filter-owner`
- `operation-layer-reorder`

## Next Implementation Slice

### Phase 3A - `apply_camera_shake`

Why first now:

- It is one of the only remaining Phase 0 expected failures with a named required tool.
- EDL already has camera-shake behavior, so chat should expose a semantic wrapper instead of asking the LLM to hand-author keyframes.
- The wrapper can reuse `find_audio_moment` for beat/impact targets and timeline context for visual overlay targeting.

Proposed <=5 files:

1. `lib/editron/agent/chat-motion-tools.ts` or the existing motion-capable chat module - add `apply_camera_shake`.
2. `lib/editron/agent/tools.ts` - expose the tool if a new module is needed.
3. `lib/editron/agent/chat-tool-registry.ts` - add/confirm metadata for `apply_camera_shake`.
4. `lib/editron/services/chat-edit-phase0-baseline.ts` - move camera shake once implementation lands.
5. Focused chat-operation test - prove target resolution, bounded intensity, and no-op behavior.

Tool behavior:

- Resolve a target frame from explicit time, selected range, or `find_audio_moment`/visual context.
- Resolve the intended visual overlay from selection or timeline inventory.
- Apply bounded shake using the existing motion/EDL representation, not a parallel animation engine.
- Return changed overlay ids, resolved target evidence, and skipped/no-op reasons.

Do not:

- Generate new visuals.
- Mutate unrelated overlays.
- Encode final visual style in a planner shadow field.
- Bypass profile motion/intensity budgets.

Suggested tests:

- applies shake to one intended visual overlay at a resolved beat/frame
- refuses or asks for clarification when no target overlay/frame can be resolved
- keeps intensity within the configured budget
- leaves audio/SFX overlays unchanged

## Remaining Roadmap After Audio Ducking

1. Callable-surface snapshot hardening for registry-vs-live-tool drift.
2. `apply_camera_shake`.
3. semantic `apply_speed_ramp`.
4. semantic `apply_fade`.
5. filter/color owner decision and tool if approved.
6. explicit layer reorder/move-retime tool.
7. chat UX receipts/candidate picker/highlight.
8. real-project proof runs for retrieval + operations.

## Verification Performed In This Audit

Read/grep evidence from:

- `lib/editron/agent/tools.ts`
- `lib/editron/agent/chat-tool-registry.ts`
- `lib/editron/agent/chat-transcript-tools.ts`
- `lib/editron/agent/chat-visual-tools.ts`
- `lib/editron/agent/chat-audio-tools.ts`
- `lib/editron/agent/chat-asset-tools.ts`
- `lib/editron/services/chat-edit-phase0-baseline.ts`
- `tests/editron/chat-tool-registry.test.ts`
- `tests/editron/chat-edit-phase0-baseline.test.ts`
- `tests/editron/chat-edit-context.test.ts`
- `components/editron/editor/version-7.0.0/types.ts`
- `components/editron/editor/version-7.0.0/components/overlays/video/video-layer-content.tsx`
- `components/editron/editor/version-7.0.0/components/overlays/captions/sound-layer-content.tsx`
- `lib/editron/services/edl-executor.ts`
- `lib/editron/agent/director-agent.ts`
- `lib/editron/services/quality-review-service.ts`
- `lib/editron/services/quality-gate.ts`
- `lib/editron/data/creative-knowledge-graph.json`

No chat/runtime behavior was changed in this audit refresh phase.
