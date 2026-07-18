# Editron Chat-to-Edit Full Battle Test

**Date:** 2026-07-18

**Branch:** `infrastructure-improvs-+Editron`

**Deployment tested:** `https://front-jzxsj5xjf-nimit-jains-projects-bd2b522e.vercel.app`

**User-facing alias:** `https://front-end-git-infrastructu-d46f86-nimit-jains-projects-bd2b522e.vercel.app`

**Deployment ID:** `dpl_4j1PBzcSQdpnoKgzX1xqKUwGRkWY`

**Deployed commit:** `f8d768d` on `infrastructure-improvs-+Editron`

**Harness commit:** `88271f86 test(editron): await canonical chat render evidence`

**Method:** static control-flow audit, 230 deterministic tests, 73 live Gemini-driven disposable-project journeys, Mongo before/after comparison, editor reload DTO comparison, asynchronous rendered-evidence polling, rendered-pixel inspection, and a headless hard-refresh probe.

## Executive Verdict

Editron chat-to-edit is **not production-ready**.

The battle matrix ran all 73 defined user journeys against the deployed branch. Only 8 passed every required gate, and all 8 were read-only inspection/search workflows. No mutating scenario passed the complete chain of owner selection, evidence-before-mutation, Mongo truth, UI reload truth, and rendered proof.

This is not evidence that every edit tool is broken. Several mutations did persist, three produced passing rendered evidence, and transaction rollback prevented partial edits in many failure cases. The release blocker is orchestration authority: prompt instructions describe a disciplined workflow, but the runtime does not enforce that workflow. Gemini can skip project grounding, choose a legacy family owner, emit malformed tool arguments, repeat speculative calls, or turn a correct first mutation into a rolled-back batch by adding a redundant failing tool.

The central production fix is a code-owned turn protocol, not another prompt pass:

```text
resolve request and target
  -> acquire required project/moment evidence
  -> license one family owner
  -> validate one canonical tool input
  -> execute the minimal mutation set
  -> verify persisted postconditions
  -> dispatch modality-correct render proof
  -> report success only after evidence settles
```

## Preflight Truth

| Item | Verified result |
|---|---|
| Repository | `D:\google downloads\Front-End-main\editron-worktree` |
| Branch | `infrastructure-improvs-+Editron` |
| Deployment status | Ready |
| Deployment created | 2026-07-18 16:08 IST |
| Deployment source | `f8d768d`, confirmed in Vercel build logs |
| Live account | Short-lived Clerk test session; credentials are not recorded here |
| Fixture isolation | Every matrix journey used a disposable `proj_chatbattle_*` project |
| Matrix cleanup | Matrix projects were deleted after each journey |
| Unrelated worktree state | Existing unrelated changes were not staged or modified by this pass |

The Vercel build succeeded while logging `Skipping validation of types`. Local full TypeScript remains baseline-red from generated Next route checks, a `sequence` attachment-type mismatch, and an unrelated temporary render script. Focused chat tests and scoped lint are green.

## Verified Control Flow

```text
AI chat panel
  -> POST /api/services/editron/chat/stream
  -> createEditronAgent / callModel
  -> Gemini selects tools
  -> sequentialToolNode
  -> normalizeAgentToolArgs
  -> decideChatToolExecution
  -> tool implementation
  -> enforceChatToolPostcondition
  -> completeChatAiEditTransaction
  -> Mongo checkpoint / commit / rollback
  -> editor project reload
  -> dispatchPhase0RenderedEvidenceJob through QStash
  -> Remotion Lambda still renders
  -> persisted chat render quality status
```

Load-bearing owners:

- Prompt and model/tool loop: `lib/editron/agent/agent-graph.ts`
- Tool metadata and render modalities: `lib/editron/agent/chat-tool-registry.ts`
- Per-turn replay/limit policy: `lib/editron/agent/chat-tool-execution-policy.ts`
- Editorial-intent public schema: `lib/editron/agent/chat-editorial-intent-tools.ts`
- Transaction and render request: `lib/editron/agent/chat-ai-edit-transaction-runtime.ts`
- Stream commit and render dispatch: `app/api/services/editron/chat/stream/route.ts`
- Rendered-evidence worker: `lib/editron/services/phase0-rendered-evidence-worker.ts`

## Aggregate Results

| Metric | Result |
|---|---:|
| Live scenarios | 73 |
| Full passes | 8 |
| Full failures | 65 |
| Unique tool names selected by Gemini | 47 |
| Projects whose Mongo digest changed | 23 |
| Render evidence missing at observation deadline | 60 |
| Render evidence settled `fail` | 10 |
| Render evidence settled `pass` | 3 |
| Mutating scenarios passing every gate | 0 |

Failed checks:

| Check | Failures |
|---|---:|
| Fresh rendered evidence | 56 |
| Required owner/evidence path | 55 |
| Evidence before mutation | 53 |
| Expected Mongo mutation truth | 35 |
| Live agent run completed normally | 25 |
| Every selected tool completed | 19 |
| Canonical tool-result envelope | 8 |
| No forbidden legacy authority | 3 |

The 60 `missing` render statuses include read-only scenarios that did not require render proof. Fifty-six scenarios failed the fresh-render check. Most mutation waits were 30 seconds to keep the matrix bounded after two representative mutations remained unresolved after the full three-minute wait.

## What Passed

Eight read-only workflows passed all applicable gates:

- `content-analysis`
- `inspect-rendered-frame`
- `inspect-uploaded-asset`
- `list-uploaded-assets`
- `search-stock-footage`
- `search-uploaded-assets`
- `transcript-moment-search`
- `transcript-overview`

Other important partial successes:

- The deterministic chat suite passed: 26 files, 230 tests.
- Mongo rollback prevented partial state after failed mutating batches.
- Editor reload DTO parity passed after stripping ephemeral signed URL fields.
- Three mutations produced passing rendered evidence: `batch-caption-edit`, `delete-selected-overlay`, and `manual-keyframe-zoom`.
- Ten additional mutations produced real render artifacts and were correctly marked failed instead of silently passing.
- A headless hard refresh loaded the real editor and disposable project timeline. Full Clerk-hydrated browser automation remains open.

## Release-Blocking Findings

### P1-1: Evidence-before-mutation is prompt text, not runtime law

**Expected:** every mutation starts from canonical project or moment evidence required by its owner.

**Observed:** 55 owner-path failures and 53 evidence-before-mutation failures. Forty-two scenarios omitted both `read_project_file` and `get_timeline_view`.

**Code evidence:**

- `agent-graph.ts:347` tells Gemini to act first.
- `agent-graph.ts:381` tells Gemini to always read project state first.
- `sequentialToolNode` at `agent-graph.ts:1139-1298` executes selected calls but has no turn-state prerequisite that blocks mutation until required evidence exists.

**Root cause:** contradictory prompt guidance is being asked to enforce a safety invariant that only code can enforce.

**Required production fix:** introduce a typed turn state machine. Every mutating tool declares required evidence classes and accepted owner. Evidence receipts must bind project ID, target, and current project revision so stale evidence cannot license a later mutation.

**Regression test:** issue a mutation as the first model call and prove the runtime blocks it, acquires the required read, then permits exactly one target-bound retry.

### P1-2: Editorial-intent schema drift combines with a retry deadlock

**Expected:** vague family and script-led requests reach `apply_editorial_intent` with a canonical fact-only contract.

**Observed:** Gemini emitted incompatible values including string scope, string constraints, named strength/uncertainty, string or array families, sentinel `none`, and an invented script where the user supplied none.

`chat-editorial-intent-tools.ts:49-85` rejects those shapes. The first schema failure is still recorded as a completed execution. `chat-tool-execution-policy.ts:76-99` counts it toward `maxExecutionsPerTurn: 1`, so a corrected retry is blocked as `CHAT_TOOL_TURN_LIMIT`.

**Root cause:** the model-facing schema is too nested and semantically overloaded, while the replay ledger cannot distinguish validation failure from successful ownership execution.

**Required production fix:** freeze a smaller public wire contract using model-stable primitives. Normalize only unambiguous aliases, never invented semantics. Record outcome class in the ledger; one deterministic schema-correction retry may follow validation failure, while a successful owner execution remains single-shot.

**Regression test:** replay every malformed live shape. Unambiguous aliases normalize, semantic-invalid values fail with field-specific feedback, one corrected retry executes, and no fabricated script is accepted.

### P1-3: The agent can invalidate a correct edit by appending redundant tools

**Expected:** `cut_section` atomically cuts, shifts, closes the gap, and updates duration.

**Observed:** transcript cuts called `cut_section` successfully and then called `close_gaps`. With no gap left, the second tool failed and the transaction rolled the correct cut back.

The prompt says `cut_section` handles split, delete, shift, and duration at `agent-graph.ts:445` and forbids manual `split -> delete -> close_gaps` at `:459-463`. The implementation does so at `tools.ts:4310-4416`. No execution contract marks `close_gaps` redundant after success.

**Required production fix:** each tool declares produced effects and redundant follow-ups. The runtime shadows an already-satisfied call instead of executing it and rolling back a valid atomic edit.

**Regression test:** transcript-resolved cut followed by model-selected `close_gaps` commits once and preserves the shortened duration after reload.

### P1-4: Deep analysis combines target resolution with provider execution

**Expected:** resolve one target and coordinate space, then run one bounded analysis call.

**Observed:** journeys emitted three parallel `analyze_clip_video` or `analyze_clip_audio` calls. Failures included invalid `source`, non-finite end frames, and calls that never returned. Nineteen scenarios had incomplete tool calls.

`tools.ts:3315-3350` and `:3551-3590` expose natural-language target selection and manual source/asset/frame coordinates in one schema, allowing incompatible modes.

**Required production fix:** a deterministic read-only resolver returns one canonical source window. The provider tool accepts only that resolved window. Parallel calls require explicit batch semantics.

**Regression test:** ambiguous target, selected clip, timeline range, and asset range each produce one coordinate contract and at most one provider invocation.

### P1-5: Family-owner routing remains prompt-led

**Observed:**

- vague SFX routed through `find_audio_moment -> apply_camera_shake`
- fancy captions called `add_captions` six times instead of `add_fancy_captions`
- vague and explicit BGM used direct `regenerate_bgm`
- clean captions used direct `add_captions`
- the prompt advertises stale `extract_style -> apply_style` at `agent-graph.ts:446-455` beside the durable `apply_reference_style` owner

**Root cause:** legacy and exact tools remain visible beside semantic owners, and prose is expected to choose valid authority.

**Required production fix:** a deterministic request classifier licenses one owner class before exposing tools. Shadow tools must be absent from incompatible model contexts, not merely discouraged.

### P1-6: Post-edit rendered evidence does not settle reliably

Only 13 journeys had settled render evidence; 56 failed the fresh-evidence requirement. Representative mutations remained missing after three minutes.

The stream route dispatches at `app/api/services/editron/chat/stream/route.ts:470-495`. The worker requires fresh Remotion config plus QStash at `phase0-rendered-evidence-worker.ts:231-263`.

**Root cause status:** unproven. The disposable reports do not retain QStash delivery lifecycle, so dispatch configuration, delivery, worker execution, and persistence cannot yet be separated.

**Required production fix:** persist a job ledger with `requested`, `dispatched`, `delivered`, `rendering`, and terminal states, attempts, QStash message ID, worker request ID, reason, and timestamps. The harness must capture it before cleanup.

### P1-7: Real pixels expose readability and composition failures

For `clean-captions`, frame 42 recorded:

- caption center at 0.87 against safe range 0.10-0.80
- 115.2px title-safe overflow
- 0.83s display where 1.60s was required
- contrast 1.49 against a required floor of 3.0

Pixel inspection confirmed placement over the subjects and bright backdrop. `edit-html-scene` rendered nearly black text on a near-black background. These are real output failures, not metadata guesses.

Ten scenarios settled as rendered failures. Three exposed no issue detail even though status was `fail`, which is also an observability defect.

**Required production fix:** persist every failing modality and score. Route concrete issues back to the owning resolver for a bounded repair attempt; never silently pass or endlessly regenerate.

## Serious Hardening Findings

### P2-1: Tool exceptions break the promised envelope

The prompt promises `{ status, data, error, nextAction }` at `agent-graph.ts:388-390`, but the catch path at `:1266-1268` returns plain `Error: ...`. Eight journeys failed the envelope check.

**Fix:** one envelope factory for success, advisory, validation error, execution error, timeout, and postcondition failure.

### P2-2: Duplicate-call policy covers only four tools

Only `apply_editorial_intent`, `apply_reference_style`, `extract_style`, and `apply_style` declare execution policy in `chat-tool-registry.ts`. Live examples included 17 `use_matching_footage` calls, six `add_captions` calls, and three calls each for several mutating/audio tools.

**Fix:** every tool declares cardinality, replay, batch safety, owner conflicts, and effect contract.

### P2-3: Render modality defaults are too broad

`chat-tool-registry.ts:112-122` declares visual+audio proof for generic add/update/delete and semantic intent. `chat-ai-edit-transaction-runtime.ts:327-432` unions declared and inferred modalities. Text-only edits can fail because unchanged audio did not differ.

**Fix:** derive modalities from actual affected overlay types and changed fields. Declared modality is a fallback only when targets are absent.

### P2-4: Several cases have invalid fixture preconditions

`prepareChatBattleFixture` does not seed:

- an AI checkpoint for the two undo scenarios
- a prior operation/idempotency record for retry
- an attached durable reference for style transfer
- a deterministic provider failure for the BGM-failure scenario
- a concrete three-operation plan for rollback-partial-failure

Those failures are harness gaps, not proven product defects.

### P2-5: Full authenticated browser automation remains incomplete

The server-authenticated hard-refresh probe loaded the real editor and timeline. A global bearer header polluted cross-origin requests with CORS failures; a same-origin-only bearer did not hydrate Clerk's browser session. The screenshot proves editor loading and reload, while console/network promotion evidence requires a real Clerk browser storage state.

API-level reload parity is useful but is not a substitute for a real user-session browser matrix.

## Render Evidence Summary

| Scenario | Render | Artifacts | Issues |
|---|---:|---:|---:|
| `batch-caption-edit` | pass | 6 | 0 |
| `delete-selected-overlay` | pass | 6 | 0 |
| `manual-keyframe-zoom` | pass | 6 | 0 |
| `clean-captions` | fail | 6 | 4 |
| `edit-html-scene` | fail | 6 | 12 |
| `fragmented-sse` | fail | 8 | 9 |
| `place-uploaded-asset` | fail | 8 | 3 |
| `project-chat-isolation` | fail | 8 | 6 |
| `reorder-overlay-layer` | fail | 6 | 6 |
| `selected-clip-filter` | fail | 8 | 0 |
| `spatial-cursor-reference` | fail | 8 | 6 |
| `split-selected-overlay` | fail | 16 | 0 |
| `vague-sfx-beat` | fail | 8 | 0 |

## Production Fix Sequence

1. Enforce evidence prerequisites, target revision binding, and one licensed owner in code.
2. Simplify editorial-intent and deep-analysis inputs; distinguish validation attempts from successful executions.
3. Declare cardinality, redundancy, replay, and batch behavior for every tool.
4. Remove legacy/shadow tools from incompatible model contexts and reconcile stale style-transfer instructions.
5. Normalize all tool results and persist execution, queue, and render ledgers.
6. Infer actual changed render modalities, settle every job, and persist all pixel/audio failure reasons.
7. Seed checkpoints, prior operations, references, provider failures, concurrency, two-user auth, and billing fixtures.
8. Rerun all 73 journeys plus provider faults, two tabs, two users, responsive browser QA, and multi-run held-out prompts.

Do not calibrate prompts around these failures before runtime contracts are fixed. Most failures are deterministic authority and execution-policy problems.

## Promotion Gates

1. Every mutation proves evidence-before-mutation and one licensed owner.
2. Every selected tool returns a canonical envelope and reaches a terminal state.
3. One request creates one logical replay-safe transaction.
4. Provider failure cannot leave partial edits or block a corrected retry.
5. Every committed mutation settles rendered evidence or a bounded visible failure.
6. Render proof checks only modalities that changed.
7. Real Clerk-authenticated reload/navigation passes without stale project or chat state.
8. Undo, retry, reference, provider-failure, and rollback tests have valid preconditions.
9. Two-user authorization and credit/refund matrices pass.
10. The held-out matrix meets the agreed multi-run threshold with real pixels/audio.

## Full Scenario Ledger

`State changed` means the canonical Mongo digest differed after the journey. A scenario can change state and still fail because owner, evidence, reload, or render gates failed.

| Scenario | Verdict | Render | State changed |
|---|---|---|---:|
| analyze-selected-audio | fail | missing | false |
| analyze-selected-video | fail | missing | false |
| audio-anchored-camera-shake | fail | missing | false |
| audio-moment-search | fail | missing | false |
| batch-caption-edit | fail | pass | true |
| batch-overlay-update | fail | missing | false |
| beat-sync-cuts | fail | missing | false |
| bgm-explicit | fail | missing | false |
| bgm-provider-failure | fail | missing | false |
| bgm-vague | fail | missing | false |
| clean-captions | fail | fail | true |
| close-timeline-gaps | fail | missing | false |
| content-analysis | pass | missing | false |
| create-html-scene | fail | missing | true |
| delete-selected-overlay | fail | pass | true |
| dialogue-ducking | fail | missing | true |
| edit-html-scene | fail | fail | true |
| explicit-asset | fail | missing | true |
| explicit-cut | fail | missing | true |
| explicit-text | fail | missing | true |
| fancy-caption-track | fail | missing | true |
| fragmented-sse | fail | fail | true |
| inspect-rendered-frame | pass | missing | false |
| inspect-uploaded-asset | pass | missing | false |
| list-uploaded-assets | pass | missing | false |
| manual-impact-sfx | fail | missing | false |
| manual-keyframe-zoom | fail | pass | true |
| mixed-multi-step | fail | missing | true |
| motivated-zoom | fail | missing | false |
| move-retime-overlay | fail | missing | false |
| multiasset-script-chat | fail | missing | false |
| multiasset-script-intake | fail | missing | false |
| place-uploaded-asset | fail | fail | true |
| plain-caption-track | fail | missing | false |
| post-edit-render-proof | fail | missing | true |
| project-chat-isolation | fail | fail | true |
| reference-style-transfer | fail | missing | false |
| refresh-fancy-captions | fail | missing | false |
| refresh-plain-captions | fail | missing | false |
| regenerate-existing-scene | fail | missing | false |
| reorder-overlay-layer | fail | fail | true |
| replace-selected-sfx | fail | missing | false |
| replace-with-uploaded-footage | fail | missing | false |
| retry-idempotency | fail | missing | false |
| rollback-partial-failure | fail | missing | false |
| roman-hinglish-phrase | fail | missing | false |
| search-stock-footage | pass | missing | false |
| search-uploaded-assets | pass | missing | false |
| selected-clip-filter | fail | fail | true |
| selected-overlay-edit | fail | missing | true |
| selected-overlay-fade | fail | missing | false |
| semantic-transcript-topic | fail | missing | false |
| spatial-cursor-reference | fail | fail | true |
| speech-anchored-sticker | fail | missing | true |
| split-selected-overlay | fail | fail | true |
| spoken-phrase-devanagari | fail | missing | false |
| spoken-phrase-english | fail | missing | false |
| sync-overlay-style | fail | missing | false |
| transcript-moment-search | pass | missing | false |
| transcript-overview | pass | missing | false |
| trim-selected-overlay | fail | missing | false |
| undo-full-state | fail | missing | false |
| undo-overlay-edit | fail | missing | false |
| untimed-transcript-cache | fail | missing | false |
| vague-enhance | fail | missing | false |
| vague-motion-graphics | fail | missing | false |
| vague-sfx-beat | fail | fail | true |
| vague-transitions | fail | missing | false |
| visible-range-reference | fail | missing | false |
| visual-moment-search | fail | missing | false |
| visual-object-exact | fail | missing | false |
| visual-object-paraphrase | fail | missing | false |
| visual-speed-ramp | fail | missing | false |

## Evidence Artifacts

Local, uncommitted evidence is under:

- `.calibration-temp/chat-edit-battle/live-matrix-f8d768d7-wave*`
- `.calibration-temp/chat-edit-battle/artifact-review`
- `.calibration-temp/chat-edit-battle/browser-proof-explicit-text-alias`

This report changes no product code. Battle-harness changes were committed separately. Existing unrelated changes were not staged or included.
