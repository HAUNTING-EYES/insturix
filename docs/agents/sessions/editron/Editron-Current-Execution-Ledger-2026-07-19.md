# Editron Current Execution Ledger

**Date:** 2026-07-19
**Branch:** `infrastructure-improvs-+Editron`
**Purpose:** Current source of truth for the chat-to-edit sub-plan and the remaining broader Editron program.

This ledger reconciles the July 18 battle report, the later implementation commits, and the July 5 P0-P16 plan. Older checkpoint text must not be read as current status without checking this file and code.

## 1. Corrected Checkpoint

The sentence below is historical, not current:

> Nothing was committed or pushed yet. Next approval gate is Phase 3B: enforce cardinality, replay, batch safety, and effect contracts across all 60 chat tools, then the deep-analysis resolver split.

Both pieces were implemented after that checkpoint.

### Phase 3B: complete in code

- `6c004877 fix(editron): enforce chat execution contracts`
- `7bf3f019 fix(editron): enforce per-tool execution cardinality`
- Current callable registry: **63 tools**.
- `CHAT_TOOL_EXECUTION_CONTRACTS` and `CHAT_TOOL_REGISTRY` contain the same 63 names.
- Every registered tool has cardinality, replay behavior, batch safety, target keys, turn ownership/evidence rules, and an effect contract.
- Runtime policy blocks or replays duplicate, conflicting, and ungrounded calls according to those contracts.

### Deep-analysis resolver split: complete in code

- `b3099a0a feat(editron): add durable chat analysis contracts`
- `453c3a7c feat(editron): run chat analysis in durable worker`
- `54ecc6f2 feat(editron): define durable chat analysis tools`
- `9f84e330 feat(editron): expose durable chat analysis protocol`
- `resolve_clip_analysis` deterministically resolves revision-bound targets.
- `queue_resolved_clip_analysis` accepts only the resolved job IDs and forms the explicit batch boundary.
- The durable worker owns provider execution; `get_clip_analysis_result` reads terminal evidence.

### Later chat hardening already landed

- Single request owner: `1214b321`.
- Dead chat-agent path removed: `2f080d22`.
- Render lifecycle made monotonic: `20212bca`.
- Failed deliveries settle and persist issues: `a7b7d36c`, `9a71131c`.
- Render-proof modalities narrowed to actual effects: `062ec078`.
- Seeded battle fixtures required: `44e10fc7`.
- Project-scoped chat sessions, transactional rollback, grounded references, attachment ownership, and postcondition checks predate this ledger and remain active.

## 2. Verification Recorded On 2026-07-19

- Registry count: 63 execution contracts and 63 metadata entries; no name drift.
- Focused Phase 3B and deep-analysis verification: **39/39 tests passed**.
- Full `tests/editron/chat-*.test.ts` verification: **289/289 tests passed across 30 files**.
- Current battle harness: **74 scenarios**. The July 18 report describes an older 73-scenario deployment and therefore remains historical evidence, not proof of current live behavior.

These tests prove code contracts and deterministic behavior. They do not replace live provider, Mongo, browser, and rendered pixel/audio proof.

## 3. Chat-To-Edit Work Still Open

### C1. Rerun the full live battle matrix

Run all 74 scenarios against a deployment containing the commits above. Every scenario gets a valid disposable fixture and must record:

- selected owner and tool sequence;
- evidence receipt and target revision;
- Mongo before/after state;
- editor reload state after a hard refresh;
- render job lifecycle;
- actual rendered visual/audio evidence where the mutation requires it;
- terminal pass, fail, or inconclusive reason.

### C2. Run adversarial production cases

- Provider timeout, invalid response, quota exhaustion, and retry behavior.
- Two browser tabs acting on one project revision.
- Two users proving project/session/attachment isolation.
- Duplicate SSE delivery and repeated model tool calls.
- Billing, refund, rate-limit, and direct-route authorization behavior.
- Responsive editor behavior and attachment upload/consumption.

### C3. Prove attachment roles end to end

Exercise source video/image/audio, script, style reference, music reference, brand evidence, context documents, and public URLs. A successful upload is insufficient: the intended owner must consume the attachment and the final edit must show attributable evidence.

### C4. Prove durable deep analysis live

Verify QStash dispatch, worker delivery, provider completion, revision invalidation, batch behavior, and `get_clip_analysis_result` on real projects. Code-level resolver coverage is complete; live operational proof is not.

### C5. Fill genuine command-owner gaps

Do not fake these through generic overlay tools. Add first-class, evidence-grounded owners only where the live matrix proves absence, including project-wide color grading, translation/dubbing, reframing/social cutdowns, and broader repurposing workflows.

### C6. Close current build and observability debt

- Resolve the Next route export/type issue for `chat-reference-style` instead of treating generated `.next` errors as product success.
- Keep generated MG/player artifacts out of repository-wide lint inputs or clean them before full lint.
- Update the July 18 report with a new live-run result rather than overwriting its historical evidence.

## 4. Broader Editron Work Still Open

This is the remainder from the current P0-P16/master-plan view. It is separate from the completed Phase 3B chat contracts.

1. **P2/P13 opportunity optimizer:** one global conflict graph, timeline distribution policy, constrained selection, cross-family memory, and persisted selection/rejection audit.
2. **MG P5 production lane:** finish and live-prove the AI-generated MG design/code/render worker, keep codegen gated until the isolated worker and rendered quality proof pass, then retire remaining legacy MG authority.
3. **P0/P12 rendered-truth hardening:** calibrated pixel/audio judges, version parity, concrete issue persistence, bounded repair, and no false pass.
4. **Multi-upload product completeness:** production intake for target duration/aspect/language, references, script slot, per-asset roles/priority/do-not-use, and pre-analysis feasibility feedback.
5. **User music as a first-class asset:** analysis, beat grid/downbeats, storyline/cut influence, and preservation of the user's chosen track.
6. **Overlay-family finishing:** rendered proof and production polish for captions, zoom, transitions, and SFX without replacing their existing owners.
7. **P4 visual intelligence hardening:** VLM/V-JEPA coverage, degraded-mode governance, diverse visual-only/speech-led/mixed/music-led/Hinglish fixtures, and calibrated visual cutting.
8. **Operational render proofs:** real greater-than-15-minute chapter-seam render, multi-asset render fixtures, provider failure paths, and deployment parity.
9. **P15 calibration:** only after decision authority and rendered truth are trustworthy; diverse data plus holdout evaluation.
10. **P16 per-brand learning:** only from verified-quality runs, with explicit provenance and rollback.

## 5. Immediate Order

1. Run the current 74-scenario live chat matrix and preserve its evidence.
2. Fix only failures proven by that current run; do not redo Phase 3B or the resolver split.
3. Continue the broader program from rendered truth and the P2/P13 optimizer, respecting active MG-lane ownership.
4. Calibrate last.

## 6. Do Not Redo Or Misreport

- Do not call the old 73-scenario result proof of the current code.
- Do not say Phase 3B is pending; it is implemented and deterministically tested.
- Do not say deep analysis is still synchronous; the durable resolver/queue/worker/result split exists.
- Do not call chat-to-edit production-ready until the current 74-scenario live matrix passes its required Mongo, UI reload, and rendered-evidence gates.
- Do not collapse the chat sub-plan and the broader P0-P16 backlog into one vague status sentence.

## 7. Authoritative References

- `docs/service-wise-docs/editron/Editron-Chat-to-Edit-Full-Battle-Test-2026-07-18.md`
- `docs/agents/sessions/editron/Editron-Vibe-Editing-Command-Ontology-and-Battle-Matrix-2026-07-18.md`
- `docs/agents/sessions/editron/Editron-Production-Contracts-2026-07-12.md`
- `D:\Insturix-Brain\07-Roadmap\Editron-Codex-Final-Execution-Plan-2026-07-05.md`
- `D:\Insturix-Brain\07-Roadmap\Editron-FINAL-Task-Distribution-2026-07-09.md`

## 8. July 28 Priority Lock

The chat-to-edit matrix remains the active workstream. The isolated
uploaded-image placement checkpoint is complete; resume the wider current-code
matrix. Do not divert into Omni, large-media infrastructure, calibration, or
broad overlay tuning while that matrix is active.

### Immediate matrix checkpoint

- Uploaded-footage replacement passed resolver, Mongo mutation, reload, and
  rendered-evidence checks on the current path.
- Uploaded-image placement now passes the complete deployed workflow on commit
  `c6d8a597`: timeline read, exact asset resolution, mutation, Mongo state,
  reload parity, and fresh rendered evidence.
- Two independent wire-contract defects were repaired before that proof:
  Gemini's structured `NUMBER` output expanded `2` into a runaway decimal until
  `MAX_TOKENS`, and the asset resolver emitted legacy `fadeIn`/`fadeOut` tokens
  that `add_overlay` correctly rejected.
- The resulting production contract keeps source identity, spatial anchor, and
  timeline window as separate fields;
  the server converts seconds to frames using the project FPS and clamps the
  result to the current timeline.
- `asset-placement` may not be reported without a matching executable
  `asset/place-asset` localized workflow.
- Concrete animation form remains owned by `add_overlay`; the resolver supplies
  asset, geometry, timing, fit, and opacity but cannot emit a second animation
  vocabulary.
- The isolated proof is complete. The next active matrix step is the wider
  current-code scenario run; do not rerun this placement case unless that path
  changes.

## 9. Deferred Media Contract V2

This contract is documented now but is not the active implementation phase.

### Storage and ingest

- Keep immutable originals separate from derived media.
- Give every derivative an explicit role: `original`, `edit-proxy`,
  `analysis-proxy`, `audio`, `waveform`, `storyboard`, or `thumbnail`.
- Replace the application-level 3 GiB ceiling with product quota policy backed
  by atomic reservation, not a storage-platform assumption.
- Use dynamically sized multipart uploads capped below 10,000 parts (target
  9,500), persist each uploaded part number, ETag, checksum, and session state,
  and make completion idempotent.
- A refresh or process crash must resume by reconciling persisted state with
  object-storage parts. The browser may need the user to reselect the same local
  file; its fingerprint must match before missing parts continue.
- After upload, a durable server-side ingest worker creates seek-optimized
  proxies and analysis derivatives. The browser must not transcode or hold a
  hundreds-of-gigabytes original in memory.
- Google Drive Picker/API is an additional import source, not a bypass. Import a
  user-selected Drive file into the same owned storage, rights, quota, ingest,
  proxy, and lifecycle pipeline.

### Preview and conform

- Preview resolves only a stable, range-capable edit proxy.
- Final render resolves the immutable original explicitly.
- Do not mutate one canonical asset URL from proxy to original. Resolution must
  be role-based: `preview -> edit-proxy`, `analysis -> analysis-proxy`,
  `render -> original`.
- Keep `pauseWhenBuffering`; pre-mount nearby decoder instances, prewarm the next
  source range, record stall telemetry, and use bounded recovery.
- The current hidden-media warmup is Phase A only. If range transport and
  decoder pre-mounting remain insufficient, evaluate a bounded
  MediaBunny/WebCodecs scrub-frame cache rather than adopting it by assumption.

### Absolute proofs

- Interrupt a 300 GiB upload at 37%, refresh, and upload only missing parts.
- Keep the part count at or below 9,500.
- Concurrent uploads cannot over-reserve organization quota.
- Preview never requests the original object.
- Final render resolves the original object.
- Same-organization reuse avoids duplicate bytes; cross-organization access is
  denied.
- Pinned or in-use assets and derivatives cannot be evicted.

## 10. Deferred Omni Motion-Backdrop Contract

Omni motion imagery is implemented as a client capability but is not part of
the proven live MG output path. Do not enable it by treating an MP4 like an
ordinary still image.

Before activation:

1. Accept the static MG structure through the existing grounding and aesthetic
   judge.
2. Request Omni motion only for a licensed motion-backdrop job.
3. Validate stream, duration, dimensions, frame variation, and audio policy.
4. Persist an explicit motion-backdrop derivative and pass it to the isolated
   MG render worker.
5. Normalize duration and define alpha-versus-opaque composition semantics.
6. Cache the intermediate backdrop for idempotent retries and persist the final
   compact `MG_SEQUENCE` output.
7. Record provider and render receipts, then prove a real deployed render before
   enabling the path.
