# Editron Chat-To-Edit Battle Audit - 2026-07-16

## Status

This document is the code-verified source of truth for Editron chat-to-edit as of 2026-07-16.

- Alyzitron work is deliberately shelved.
- The canonical worktree is `editron-worktree` on `infrastructure-improvs-+Editron`.
- This audit does not claim that chat and upload-to-edit are unified.
- Phase 2 multi-asset script grounding is implemented locally and verified, but not committed in this worktree snapshot.
- Phase 3A transcript grounding is implemented locally and verified.
- The remaining Phase 3 slices below are not complete until their absolute tests pass.

## Product Contract

An editor should be able to state an outcome in ordinary, incomplete, or vague language. Editron must:

1. Understand the editorial goal and constraints without translating them into a hidden preset menu.
2. Resolve references against the canonical edited timeline and the actual uploaded media evidence.
3. Refuse ambiguity where the requested mutation could damage the edit.
4. Route the grounded job into the existing family owner instead of duplicating form logic in chat.
5. Capture a complete pre-edit transaction before any mutation.
6. Execute idempotently, verify the postcondition, and preserve an exact undo target.
7. Explain what evidence caused selection or rejection.

The target control flow is:

`user language -> semantic editorial intent -> evidence grounding -> operation/family owner -> transaction -> mutation -> rendered/state verification`

It is not:

`user phrase -> LLM picks a tool enum/preset -> tool mutates Mongo -> success message`

## Transcript References Without User Timestamps

The user must never need to provide a timestamp for a spoken reference.

Production behavior:

1. Search verified internal word alignment for the phrase.
2. If a cached transcript contains text but lacks usable word timings, regenerate word-level alignment from the media.
3. Project source-relative word timing through clip source offsets onto the edited timeline.
4. Match exact phrases in any Unicode writing system.
5. Return frame-addressed evidence and reject ambiguous destructive edits.
6. If no trustworthy alignment can be produced, fail explicitly. Never estimate a cut from word count or transcript order.

Phase 3A fixes:

- `media/transcription-service.ts` now validates word-level timing before reusing a cache requested for frame grounding.
- An untimed cache triggers real transcription/alignment instead of being treated as sufficient.
- A provider result requested as word-level is rejected if it still lacks usable alignment.
- Precision reference requests bypass duration-distributed synthetic narration timing and require measured word-level ASR.
- GCS URL code is loaded only for media paths that actually need it.
- Media cache writes are owner-scoped by `{assetId, userId}`.
- `chat-transcript-tools.ts` now preserves Unicode letters, numbers, and combining marks.
- Caption `startMs` and `endMs` are read independently; missing endpoints are not fabricated.
- Invalid media words are excluded from frame-addressed retrieval.

Exact phrase grounding and semantic topic grounding are different jobs. Phase 3A fixes exact phrase grounding. Queries such as "remove the part where I explain why pricing matters" require the semantic evidence plane in Phase 3C, followed by the same internal alignment before mutation.

## Verified Live Control Flow

### Entry and state

- Model route: `app/api/services/editron/chat/stream/route.ts`
- Agent/prompt/tool routing: `lib/editron/agent/agent-graph.ts`
- Main tool implementations: `lib/editron/agent/tools.ts`
- Context bundle: `lib/editron/agent/chat-edit-context.ts`
- Visual, transcript, audio, and asset resolvers: `lib/editron/agent/chat-*-tools.ts`
- Client stream and reload: `components/editron/editor/version-7.0.0/components/ai-chat/ai-chat-panel.tsx`
- Checkpoint wrapper: `lib/editron/agent/chat-ai-edit-transactions.ts`

### What is genuinely fixed

- Chat sessions are scoped by user and project. Cross-project history leakage has focused regression coverage.
- The stream route has authentication, rate limiting, and credit checks.
- Several low-level deterministic resolvers exist for selected overlays, exact phrases, audio events, and explicit assets.
- The UI sends current frame and selected overlay.
- Successful mutating tools trigger a final project reload.

These are useful components. They do not prove end-to-end editorial understanding.

## Root Causes

### RC-1: The prompt is a hidden recipe router

`agent-graph.ts` hard-routes vague commands:

- "add transitions" -> one transition on every boundary;
- "enhance this video" -> filter + transitions + captions;
- "add motion graphics" -> `density: moderate`;
- motion graphics -> a fixed `graphicType` vocabulary.

This makes the language model the form authority before footage evidence or family planners participate.

### RC-2: Legacy chat tools bypass modern owners

`tools.ts` still contains direct transition and MG producers. The transition tool accepts a fixed style enum and can apply it to every clip. The chat MG tool accepts six graphic types and directly creates a legacy composition overlay. These are shadow authorities beside the signal-owned upload-to-edit planners and AI MG sequence seam.

### RC-3: Chat script editing bypasses Phase 2

The live `auto_edit_from_script` chat tool calls `auto-edit-service.ts`:

- one explicit or longest video only;
- ASCII-only tokenization;
- Jaccard/word overlap;
- no images, OCR, V-JEPA, asset analyses, or Storyline scenes;
- deletes the original source before rebuilding slices.

The Phase 2 multi-asset semantic beat planner is wired into batch intake, not chat.

### RC-4: Rich media understanding is absent from chat context

The upload analysis pipeline persists per-asset evidence in `editron_asset_analyses`. No live chat module reads that collection. The prompt gets at most 18 thin overlay summaries containing ids, timing, content, source URL, and asset id. Chat therefore reasons over timeline boxes while deeper scene facts live elsewhere.

### RC-5: "Semantic" chat retrieval is mainly lexical

Visual and transcript retrieval use token overlap and character n-grams. Before Phase 3A they also stripped non-ASCII text. They do not perform the side-aware text/image semantic retrieval required for vague visual or topic references.

### RC-6: The visual inspection round trip is broken

`visual_inspect_frame` returns `action: capture_frame`, but the common tool wrapper nests it under `data`. The UI checks `output.action`, so it never captures the requested frame. The model cannot verify actual pixels through this path.

### RC-7: Client SSE parsing can lose events

The UI decodes each network chunk independently and splits it on blank lines without a carry buffer. JSON split across network chunks can lose text, `tool_end`, or `done` events.

### RC-8: Chat transactions are checkpoints after the fact

The before state is held in memory. Persistent before/after checkpoints are created only after successful tools finish. Sequential multi-write tools can partially mutate and then fail with no durable pre-mutation rollback target.

### RC-9: Undo is incomplete

`restore_ai_edit_checkpoint` restores overlays only. It does not restore duration, dimensions, fps, project metadata, or other state changed by a tool. FreeCut's complete command snapshot is a useful conceptual comparison here, but Editron needs a server-owned Mongo transaction/checkpoint contract.

### RC-10: HTML scene edit-in-place is missing

Chat can generate an HTML scene, but `update_overlay` only edits text content on text overlays. The existing HTML edit API is not exposed as a chat operation. "Change that graphic" can create a duplicate or fail to act.

### RC-11: BGM success is under-grounded and replacement is destructive

The chat BGM tool receives a model-invented mood and generates from that prompt. It does not build the request from scene arc, brand, speech density, existing music, beat needs, or user references. It deletes existing BGM before provider success, uses fixed mix values, and records generated media as `user-upload`.

### RC-12: Client reference context is incomplete

The context contract supports selected range and visible timeline, but the UI does not send them. It sends no spatial cursor coordinate. Commands such as "this section" or "where my cursor is" cannot be grounded reliably beyond the playhead/selected overlay.

### RC-13: FPS coercion is wrong

The agent argument coercer converts values such as `3s` using a hardcoded 30 fps rather than the project fps.

### RC-14: Tool error envelopes are not universal

Most tools are wrapped, but graph-level exceptions and unknown tool calls can violate the advertised deterministic envelope. The model and UI can disagree about whether a mutation succeeded.

### RC-15: Existing tests measure registration, not the product

The current Phase 0 baseline labels 22 cases `supported-now`, while its tests largely assert static metadata, source registration, and pure helper behavior. No current suite drives:

`real user prompt -> model routing -> tool plan -> Mongo mutation -> editor reload -> rendered verification`

Green tests therefore coexist with broken user journeys.

## Battle Matrix

Legend: PASS means the real path is adequately grounded; PARTIAL means useful plumbing exists but the product contract is not met; FAIL means a confirmed broken or unsafe path. `FIXED-WIP` is implemented locally in the current uncommitted Phase 3A slice.

| Command class | Verdict | Reason / owner |
|---|---|---|
| Add explicit text at an explicit time | PASS | Direct overlay mutation has enough parameters. |
| Add an explicit asset id at an explicit time | PASS | Deterministic asset and timing are supplied. |
| Edit the selected overlay | PARTIAL | Selection works; operation coverage and transactions vary. |
| Cut an explicit valid frame/time range | PARTIAL | Core cut works; string seconds still risk hardcoded 30 fps coercion. |
| Exact English spoken phrase, no user timestamp | FIXED-WIP | Internal alignment now required and mapped to the edited timeline. |
| Exact Devanagari spoken phrase, no user timestamp | FIXED-WIP | Unicode-safe normalization and internal alignment are covered. |
| Cached transcript text with no word timing | FIXED-WIP | Cache is rejected for frame grounding and re-aligned. |
| Semantic transcript paraphrase/topic | FAIL | No embedding-backed transcript segment retrieval in chat. |
| Roman Hinglish literal phrase | PARTIAL | Exact words can work; semantic paraphrases are weak. |
| Visual object named exactly in thin stored evidence | PARTIAL | Can resolve when evidence reached the project document. |
| Visual paraphrase or visually similar scene | FAIL | No chat access to per-asset multimodal index. |
| Inspect actual rendered frame | FAIL | Tool envelope/UI handoff mismatch. |
| Multi-asset script through upload intake | FIXED-WIP | Phase 2 beat planner grounds script across analyzed scenes. |
| Multi-asset script through chat | FAIL | Chat still invokes single-video Jaccard service. |
| "Enhance this video" | FAIL | Hardcoded recipe, not an evidence-owned plan. |
| "Add transitions" | FAIL | Defaults to apply-to-all instead of boundary jobs. |
| "Add motion graphics" | FAIL | Legacy density + graphic type authority bypasses AI MG/family owner. |
| Explicit SFX at a supplied frame | PASS | Target and operation are explicit. |
| SFX on a vague visual/speech beat | PARTIAL | Some resolvers exist; shared evidence and transaction proof do not. |
| Add clean captions | PARTIAL | Caption generation exists; vague scope/style and rendered verification remain weak. |
| Create HTML scene | PARTIAL | Creation exists; generated output and mutation transaction need proof. |
| Edit existing HTML scene | FAIL | No chat edit-in-place tool. |
| Add BGM with explicit detailed prompt | PARTIAL | Provider path works; mixing/replacement/verification are unsafe. |
| "Add suitable music" | PARTIAL | Model invents mood from thin context; good results are incidental. |
| Replace BGM when provider fails | FAIL | Existing track is deleted before successful replacement. |
| Multi-step mixed edit | FAIL | No preflight conflict plan or atomic transaction. |
| Undo a simple successful overlay-only edit | PARTIAL | Overlay checkpoint works. |
| Undo timing/project metadata changes | FAIL | Checkpoint is not full-state. |
| Roll back a partial tool failure | FAIL | Durable checkpoint is created too late. |
| Retry an interrupted mutating turn | FAIL | No universal idempotency key/operation ledger. |
| Cross-project chat isolation | PASS | User+project scoping and stale-response guards are tested. |
| Long/fragmented SSE response | FAIL | No carry-buffer parser. |
| "This section" / visible range | FAIL | UI does not send selected/visible range. |
| "Put it where my cursor is" | FAIL | No spatial cursor coordinate; only playhead/selection. |
| Style transfer from reference | PARTIAL | Analysis/plan exists; reliable executable dispatch is not proven. |
| Post-edit pixel/audio verification | FAIL | Chat success is not gated by rendered evidence. |

## FreeCut Review: What To Borrow and What Not To Borrow

Repository reviewed: `walterlow/freecut` (MIT). Its local/WebGPU editor runtime is not a fit for Editron's Remotion, worker, Mongo, and cloud-render architecture. Do not transplant its infrastructure.

Reusable design/code patterns:

1. **Factual scene documents**: structured caption, shot type, subjects, action, setting, lighting, time of day, and weather; unknown fields stay null rather than being invented.
2. **Context-aware embedding documents**: scene description first, then bounded nearby speech and useful visual context; omit noisy filenames.
3. **Separate semantic spaces**: text embeddings and image embeddings stay separate. Missing modalities do not fabricate a score.
4. **Side-aware acceptance**: weak image similarity cannot win alone; weak text and image evidence may corroborate each other, while a strong side can win independently.
5. **Transparent score provenance**: persist text score, image score, lexical match, color evidence, and ranker source.
6. **Unicode-safe lexical fallback**: preserve Unicode letters and numbers, use deterministic tie-breaking, and keep fuzzy matching subordinate to exact evidence.
7. **Index integrity**: store model id and vector dimension with the index; refuse mixed or stale vector shapes.
8. **Deduplicated lazy backfill**: one in-flight indexing promise per asset, explicit missing-index state, and race checks before persistence.
9. **Complete command snapshots**: capture every timeline/project state field that a command can mutate before execution; restore synchronously/atomically from that boundary.
10. **Linked-item edit semantics**: edits to source clips carry attached captions/audio consistently instead of treating every overlay independently.

Editron adaptation:

- Persist a server-owned multimodal evidence document per scene/asset.
- Use existing cloud embeddings and V-JEPA/VLM outputs, not FreeCut's browser workers.
- Feed evidence into chat grounding and existing Editron family planners.
- Keep Remotion and current renderer ownership unchanged.

## Phase 2 Status: Multi-Asset Script Planner

Implemented locally:

- Unicode script segmentation.
- Semantic beat grouping from exact script units.
- Per-beat query embeddings over analyzed scenes.
- LLM selection constrained to offered scene references.
- Exact beat coverage, known-reference, duplicate-use, source chronology, and target-duration validation.
- One structured repair attempt.
- Explicit partial/missing coverage.
- Fail-closed behavior when an authoritative script cannot be grounded.
- Persisted bounded coverage and retrieval audit.

Absolute tests cover Hinglish/Devanagari, reversed same-source chronology, over-duration partial coverage, duplicate scene reuse, and missing semantic retrieval.

Remaining Phase 2 integration defect: chat's `auto_edit_from_script` still bypasses this planner.

## Phase 3 Execution Plan

Each slice is limited to five files and requires its absolute tests before the next behavior-changing slice.

### Phase 3A - Transcript Grounding Truth

Aim: spoken references work without user timestamps and never use invented timing.

Absolute tests:

- Untimed cached transcript is not accepted for frame grounding.
- Provider alignment is required before a destructive phrase edit.
- Devanagari exact phrase resolves to correct edited-timeline frames.
- Caption `startMs/endMs` map to distinct frame boundaries.
- Invalid timing cannot create a candidate.

Status: implemented locally; focused tests pass.

### Phase 3B - Real Battle Harness

Aim: replace static `supported-now` claims with executable product evidence.

Absolute tests:

- Drive real prompt routing through the agent with deterministic model fixtures and optional live-provider mode.
- Record selected tools, arguments, evidence reads, mutations, Mongo before/after, UI reload payload, and render artifact.
- Cover every row in this battle matrix.
- A static registry assertion cannot mark a journey passing.

### Phase 3C - Canonical Multimodal Evidence Plane

Aim: chat sees the same analyzed footage truth as Storyline and upload-to-edit.

Absolute tests:

- Read `editron_asset_analyses` by project and asset.
- Build bounded scene documents from VLM/V-JEPA, OCR, transcript, audio, motion, and source-to-cut mapping.
- Support text and image embeddings with model/dimension validation.
- Persist retrieval candidates, modality scores, missing modalities, and rejection reasons.
- Vague visual/topic queries beat unrelated lexical matches on holdout fixtures.

### Phase 3D - Semantic Intent Compiler and Owner Dispatch

Aim: vague language becomes grounded editorial jobs, not hidden preset selections.

Absolute tests:

- Intent captures goal, scope, target reference, constraints, strength, and uncertainty.
- No prompt recipe can directly force MG type, transition type, SFX token, or global caption style.
- Existing caption/zoom/transition/SFX/MG owners receive grounded jobs and evidence.
- Strong evidence can act without a Creative Brief label; weak evidence remains advisory.
- Chat script requests dispatch to Phase 2, never the legacy single-video service.

### Phase 3E - Transactional Execution and Complete Undo

Aim: every chat edit is atomic, idempotent, and exactly reversible.

Absolute tests:

- Durable full-state checkpoint exists before the first mutation.
- Multi-tool failure restores the original state.
- Duration, overlays, metadata, dimensions/fps, linked media state, and relevant asset references restore together.
- Replayed operation id cannot duplicate an edit.
- Checkpoint failure prevents mutation.

### Phase 3F - Client Transport and Pixel Inspection

Aim: the browser cannot lose tool results and the model can inspect real frames.

Absolute tests:

- SSE events split at every byte boundary parse identically.
- `visual_inspect_frame` captures and returns the requested rendered frame.
- Selected range, visible timeline, playhead, selection, and spatial cursor are transmitted explicitly.
- Stale project responses cannot update the active chat.

#### Phase 3F-B status (2026-07-17)

The rendered-frame transport is code-complete and regression-verified. A successful,
isolated `visual_inspect_frame` call now ends the server round; the browser seeks to
and captures the requested editor frame; the route validates ownership, frame bounds,
freshness, MIME, dimensions, and payload size; and Gemini receives the image as native
`inlineData`. Image bytes are not written into chat history or prompt text. Mixed
inspection and mutation calls fail without executing either action.

Focused and broader Chat-to-Edit verification passed (6 frame-contract tests and 128
broader chat tests). Authenticated preview proof completed on 2026-07-17 against
`proj_iitL6e9a5ndg` on deployment `dpl_9gcLRaGd6pJQ6ZmMVSrXkVNBDinr`.

The first live attempt exposed a real browser incompatibility: `html2canvas@1.4.1`
crashed while parsing Tailwind 4 `oklch()` colors before evidence reached Gemini.
Commit `05b59342` replaced that direct dependency with `html2canvas-pro@2.2.4`, whose
capture API supports modern CSS colors. The repeated authenticated run produced one
`visual_inspect_frame` request, one bounded frame-evidence follow-up, and an
image-grounded answer. It produced no browser errors on the corrected deployment, no
repeat capture, no mutating tool call, and no `data:image` or base64 payload in visible
chat history. Phase 3F-B is production-proven for this real-project read-only flow;
the broader scenario matrix under the global done test still stands.

#### Pinned follow-up: canonical capabilities and optional MCP adapter

Do not add an MCP server inside the Editron-to-Gemini runtime merely to describe tools.
First establish one provider-neutral, typed capability registry as the source of truth
for tool schema, read/mutate classification, prerequisites and evidence, authorization,
credits, rate limits, side effects, checkpoints, postconditions, and failure modes.
Derive Gemini function declarations, system-prompt capability summaries, UI availability,
and capability tests from that registry. A future MCP surface may adapt the same registry
for external agents; it must not become a second capability authority.

### Phase 3G - Missing Operations and Safe Replacement

Aim: close confirmed capability holes without shadow planners.

Absolute tests:

- Existing HTML scene edits in place by id.
- BGM request derives from user intent, narrative arc, brand, speech/music evidence, and references.
- Existing BGM remains until replacement generation and validation succeed.
- Mix/ducking is resolved by the audio owner and persisted with evidence.
- Project fps drives every time-to-frame coercion.

### Phase 3H - Postcondition and Render Verification

Aim: chat reports success only when the requested editorial outcome exists and renders correctly.

Absolute tests:

- Every mutating tool declares machine-checkable postconditions.
- Mongo state and rendered sample verify those postconditions.
- Pixel/audio failures persist the affected overlay, frame range, artifact, and reason.
- A visibly failed edit cannot be reported as successful.

## Global Done Test

Chat-to-edit is production-ready only when a real-project matrix covering explicit, vague, multilingual, visual-only, speech-led, mixed, music-led, multi-asset, provider-failure, retry, and undo scenarios produces:

- grounded evidence;
- the correct existing operation/family owner;
- one durable transaction;
- correct canonical-timeline mutations;
- rendered verification;
- exact audit/rejection reasons;
- no preset/menu authority hidden in the prompt;
- no fabricated timing;
- no false success.
