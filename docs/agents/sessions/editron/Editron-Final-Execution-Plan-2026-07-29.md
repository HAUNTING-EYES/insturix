# Editron Final Execution Plan

Date: 2026-07-29

Status: authoritative execution plan for the current Editron lane

Branch: `infrastructure-improvs-+Editron`

Canonical worktree: `D:\google downloads\Front-End-main\editron-worktree`

## 0. Authority And Scope

This document is the final reconciled Editron plan. It supersedes stale status claims in earlier plans, handoffs, chat summaries, and memories. It does not discard their architecture decisions.

The following documents remain architectural inputs:

- `docs/agents/sessions/editron/Editron-Codex-Plan-Brief-2026-06-20.md`
- `docs/agents/sessions/editron/Editron-Current-Execution-Ledger-2026-07-19.md`
- `D:\Insturix-Brain\07-Roadmap\Editron-Codex-Final-Execution-Plan-2026-07-05.md`
- `D:\Insturix-Brain\07-Roadmap\Editron-FINAL-PLAN-2026-07-05.md`
- `D:\Insturix-Brain\07-Roadmap\Editron-Master-Synthesis-2026-07-05.md`
- `D:\Insturix-Brain\07-Roadmap\Editron-FINAL-Task-Distribution-2026-07-09.md`

When status differs, this document wins. When this document is silent, the June 20 architecture brief still applies.

### Exact Task Archive Receipt

This plan was reconciled against the JSONL archive for this exact Codex task:

- Task ID: `019e6428-3f6e-7373-9543-93576fa934ce`
- Archive: `C:\Users\admin\.codex\sessions\2026\05\26\rollout-2026-05-26T17-30-19-019e6428-3f6e-7373-9543-93576fa934ce.jsonl`
- Snapshot size: `1,518,271,451` bytes
- Snapshot SHA-256: `78d11d16b1e91174dd4e38e9f605851db213d01fce3c07c7ff627c5bcb935967`
- Parsed records: `326,076`
- Recoverable NUL-padded records: `2`
- Unrecoverable JSON records: `0`

This receipt exists so future sessions can distinguish an archive-backed decision from a memory-based summary.

## 1. Product North Star

Editron must turn user intent and owned media into one coherent edit using one canonical timeline and one accountable decision system:

```text
owned source media
-> durable ingest and explicit derivatives
-> transcript + audio + visual + OCR + brand evidence
-> canonical edited timeline and raw-to-cut map
-> semantic facts + signal candidates + screen context
-> one opportunity optimizer and family owners
-> executeEDL
-> rendered pixel/audio evidence
-> calibrated quality judgment
-> verified learning
```

The LLM supplies narrative and semantic understanding. It does not directly choose a graphic preset, transition name, zoom recipe, SFX asset, or caption skin.

Facts license what is truthful. Signals explain whether the moment deserves an edit. Family owners resolve physical form. Budgets and gates remain guardrails, not creative producers.

## 2. Non-Negotiable Engineering Rules

1. No new branch or worktree without explicit approval.
2. Editron changes stay on `infrastructure-improvs-+Editron`.
3. Each implementation phase touches no more than five files.
4. Structural changes to a file over 300 lines require a separate Step 0 cleanup commit.
5. Do not claim systems are merged unless producer, decision owner, source of truth, and consumer are singular in live control flow.
6. Do not duplicate resolver, composer, renderer, or family-form ownership.
7. No content-type rules, keyword denylists, fixed overlay counts, hidden templates, or project-specific thresholds as root fixes.
8. A full live matrix runs only after targeted acceptance cases are green.
9. No commits while a live matrix is running.
10. Calibration and learning remain blocked until rendered evidence is trustworthy.
11. Upload parts are transport units only. They are never analysis, narrative, or editorial boundaries.
12. Source media remains immutable. Preview, analysis, and final render resolve explicit derivative roles.
13. A successful API response is not proof. Mongo state, reload parity, and rendered pixels/audio are required where applicable.

## 3. Current Truth Ledger

### 3.1 Done And Frozen

These items must not be rebuilt:

| Item | Current proof |
| --- | --- |
| Exact uploaded-asset placement contract | Commit `c6d8a597` is in current history. Live targeted report `placement-c6d8a597-20260728` passed 1/1. |
| Camera-shake resolver contract | `tests/editron/chat-localized-workflow.test.ts` proves timeline read -> `resolve_audio_edit({ action: 'camera_shake' })` -> exact `apply_camera_shake`. |
| Impact-only camera-shake safety | `lib/editron/agent/chat-audio-tools.ts` deliberately rejects non-impact audio. This is a safety contract, not a missing capability. |
| Canonical chat caption producer | Chat now routes through the canonical caption adapter instead of the former independent constructor. |
| Audio-rights server-save preservation | Commit `baaadc68` is in current history. Live preview deployment and project backfill remain separate proof tasks. |
| Preview prewarming | Commit `b40426ad` adds active/upcoming media prewarming. This is partial playback infrastructure, not final playback reliability. |
| Battle scenario catalog | Current code exports 76 scenarios. |

### 3.2 Implemented But Missing Live Proof

| Item | Missing proof |
| --- | --- |
| `baaadc68` deployment | Verify preview deployment commit and perform one persisted save/reload proof. Current Vercel team inspection is blocked by 403, so deployment must not be assumed. |
| Camera-shake workflow | Run one live impact-audio case and confirm exact mutation, reload parity, and rendered movement. |
| Durable deep analysis | Prove QStash dispatch -> worker -> persisted result -> revision invalidation on a real project. |
| Async MG codegen | Prove selection -> worker -> sequence asset -> `MG_SEQUENCE` insertion -> rendered inspection on a fresh upload. |
| Chapter rendering | Prove a real video over 15 minutes across a chapter seam for captions, BGM, and transitions. |
| Multi-asset composer | Prove visual-only, speech-led, mixed, music-led, and Hinglish fixtures end to end. |

### 3.3 Matrix Truth

The two apparently contradictory infrastructure claims came from different runs:

- `full-current-20260727-05`: 75 completed, 35 passed, 40 failed, 0 infrastructure failures.
- `full-matrix-e19d8550-20260728`: 75 completed, 25 passed, 5 warnings, 34 failed, 11 infrastructure failures.

Both records are historically true. Neither proves current HEAD.

There is no complete, uninterrupted 76-scenario report for current HEAD. The matrix is therefore open.

### 3.4 Confirmed Open Defects

The following are verified in current code:

1. Multilingual dubbing is not implemented. The job and provider normalize output to English and use `language: 'en'`.
2. Semantic-visual retry stops after two attempts and has no durable deadline/backoff state.
3. Provider-failed batches cannot be explicitly resumed as a production recovery action.
4. `signal-registry.ts` treats any non-high analysis quality as AI-footage risk.
5. `visual-evidence-scorer.ts` already supports explicit `isAiGenerated` plus localized `artifactRanges`, but that grounded contract is not the transition signal source.
6. Phase-0 removes video/audio from both the audited render and baseline in the default path, making blank-transition judgments invalid.
7. Executor traces collapse distinct handler refusals into a generic null/guard reason.
8. Quality review reads `transitionStyle`, while modern execution persists `transitionType`.
9. BGM quality review can run before asynchronous BGM reaches a terminal lifecycle state.
10. Caption grouping can still produce sub-second, extreme-WPM, and cross-cut groups on real projects.
11. Automatic caption style identity still comes from a hardcoded registry rather than accepted Brand Vault typography/palette/motion preferences.
12. Browser playback uses partial prewarming but lacks a range-capable owned preview contract, shared media lease/cache, and bounded stall recovery.
13. Multipart upload uses fixed 10 MiB parts, a 3 GiB application cap, and browser-memory completion state.
14. The global P2/P13 opportunity optimizer remains absent.
15. Rendered quality and calibration remain incomplete.

## 4. Root-Cause Register

### RC-1: Workflow Scheduling Is Split Between Server And Gemini

The server can inject timeline evidence, but Gemini still has to remember the full read -> resolver -> exact mutation workflow. This caused owner-path failures, wrong tools, invalid arguments, stale evidence, and blocked retries.

Production direction:

- The request owner chooses a workflow contract.
- The server executes deterministic prerequisite steps.
- Resolvers return typed `data.useWith` commands.
- Only the exact licensed mutator can consume that output.
- Gemini supplies intent and disambiguation, not orchestration state.

### RC-2: One Mutation Invalidates Evidence For The Next

Evidence is revision-scoped. A successful first mutation changes the revision and makes the next mutation stale.

Production direction:

- A multi-step workflow owns a transaction/workflow revision.
- Each mutation returns a new revision receipt.
- The server refreshes evidence or proves that the prior evidence remains valid for the next exact operation.
- Do not globally weaken revision checks.

### RC-3: Result Semantics Are Too Coarse

No-op, safe decline, needs user choice, retryable provider failure, terminal failure, and successful mutation are not consistently distinct.

Production direction:

```text
mutated
no-op
declined-safe
needs-choice
retryable-failure
terminal-failure
queued
```

Every outcome carries a machine-readable reason, affected project revision, and expected verification modality.

### RC-4: Analysis Quality Is Mistaken For Source Provenance

`signal-registry.ts` currently uses low/degraded analysis quality as a proxy for AI-generated footage. Real uploaded footage can therefore receive fake artifact-prevention signals.

Production direction:

- Source provenance comes from immutable asset metadata.
- AI artifact risk requires localized artifact evidence.
- Missing evidence produces `unknown/degraded`, never fabricated risk.
- Transition selection cannot use AI-artifact evidence without provenance plus localized ranges.

### RC-5: Rendered Evidence Removes The Thing Being Judged

The Phase-0 default path strips source video/audio from both sides of its comparison. Blank samples can therefore be a fixture failure rather than an output failure.

Production direction:

- "After" render: full composition.
- "Before" render: same source timeline with only the audited family removed.
- Audio comparisons retain native audio and remove only the audited audio layer.
- Every artifact records resolved source asset IDs and frame ranges.

### RC-6: Planner Selection And Executor Eligibility Disagree

A recent project selected 82 decisions while only two executed and 80 were guard-rejected. The executor records generic null returns, so the exact contract disagreement is hidden.

Production direction:

- Every handler returns a typed execution result, never bare null.
- Planner preconditions use the same validators as executor licensing.
- Selected decisions must be executable unless runtime state changes.
- Any runtime change produces a typed, auditable rejection.
- A high guard-rejection ratio marks a planner-contract failure, not a successful edit.

### RC-7: Playback URLs Are Not A Media System

Prewarming helps, but it does not solve expiring blob URLs, duplicate decoders, non-range CDN behavior, or random-access stalls.

Production direction:

- Resolve an explicit `edit-proxy` derivative.
- Serve byte-range requests with stable cache headers and content length.
- Use one asset-level URL/decoder lease shared by nearby clips.
- Prewarm the next source ranges, not merely DOM elements.
- Recover bounded stalls by seeking/resuming the same lease.
- Escalate to MediaBunny/WebCodecs scrub caches only if measured HTML media behavior remains inadequate.

### RC-8: Uploading Is Coupled To A Small Browser Session

Fixed 10 MiB parts create too many parts at large sizes. Part ETags live in browser process state. The 3 GiB cap is an application decision, not an R2 limit.

Production direction:

- Dynamic part size with at most 9,500 parts.
- Server-persisted upload session and per-part checksums/ETags.
- Idempotent completion.
- Atomic quota reservation.
- Refresh/restart uploads only missing parts.
- The browser may close after enqueueing durable ingest.

## 5. Ordered Execution Plan

Each phase below is independently reviewable, touches at most five files, and has an explicit exit gate.

### Phase 0: Release Truth And Recovery Baseline

Maps to: P0, P12, operational correctness

Aim:

Establish exactly what is deployed, recover the two known projects safely, and freeze current evidence before behavior changes.

Work:

1. Verify whether preview serves a commit containing `baaadc68`.
2. Backfill verified native-audio rights for `proj_Gn3nVJaDk5Fx`.
3. Rerun only its MG/Director stage after rights are valid.
4. Snapshot `proj_YWFj2GOO6tUl` provider failure state without resuming it yet.
5. Persist a release receipt containing deployment ID, commit SHA, project revision, overlay counts, decision audit, and quality state.

Absolute tests:

- Save/reload preserves verified audio rights.
- `proj_Gn3nVJaDk5Fx` rerun does not fail for inherited rights debt.
- No unrelated overlay is changed by the backfill.
- Deployment proof names the exact served commit.

Exit gate:

One trustworthy baseline exists for both projects. If Vercel inspection remains forbidden, deployment verification stays explicitly blocked rather than inferred.

### Phase 1: Close The Matrix Workflow Contract

Maps to: chat-to-edit Phase 3B, matrix closure

Aim:

Make command execution deterministic before spending another full matrix run.

#### Phase 1A: Multilingual Dubbing

Work:

- Replace the English-only job schema with a provider-capability contract.
- Preserve requested language using a canonical language identifier.
- Reject unsupported languages before queueing.
- Pass the target language to translation and voice synthesis.
- Persist language, voice/provider capability, and fallback/decline reason.

Absolute tests:

- Hindi remains Hindi through request, job, provider, overlay, and reload.
- Unsupported language returns `needs-choice` or `declined-safe`; it never silently becomes English.
- Phrase timing and non-dialogue background preservation remain intact.

#### Phase 1B: Camera-Shake Live Proof

Work:

- Keep the existing impact-only resolver contract.
- Run timeline read -> resolve impact audio -> exact authorized camera shake.
- Do not permit non-impact audio to mutate directly.

Absolute tests:

- Impact/downbeat evidence returns exact `apply_camera_shake` arguments.
- Non-impact audio returns a typed safe decline.
- Live Mongo mutation, reload parity, and rendered motion all agree.

#### Phase 1C: Targeted Acceptance Gate

Run only:

1. multilingual dubbing,
2. vague SFX ambiguity,
3. explicit BGM with canonical audio rights,
4. exact uploaded-asset placement,
5. localized impact camera shake.

Absolute test:

All five reach their expected terminal outcome with no infrastructure failure and correct rendered modality.

#### Phase 1D: Full 76-Scenario Matrix

Rules:

- Run once, uninterrupted.
- Commit nothing while it runs.
- Every scenario uses an isolated disposable project.
- Verify Mongo before/after, reload parity, and operation-appropriate rendered pixels/audio.
- Separate product failures from fixture failures and infrastructure failures.

Exit gate:

- 76/76 scenarios complete.
- Zero unexplained infrastructure failures.
- Every product failure has a typed root cause and reproducible fixture.
- A safe decline is counted as success when the scenario contract expects a decline.

#### Phase 1E: Adversarial And Attachment Proof

Prove:

- two tabs,
- two users,
- duplicate SSE delivery,
- direct authorization,
- rate limiting,
- billing/refund,
- source media,
- script,
- style reference,
- music reference,
- brand evidence,
- documents,
- URLs.

Exit gate:

No cross-project/cross-user leakage, duplicate mutation, lost refund, or attachment role that is accepted but ignored.

### Phase 2: Durable Provider Recovery

Maps to: P4 degraded-mode governance, operational resilience

Aim:

Make provider failures resumable without fast retry exhaustion or endless waiting.

Data contract:

```text
status
failureClass
attemptCount
firstFailedAt
deadlineAt
nextRetryAt
lastError
providerReceipt
requiredAnalysisVersion
leaseOwner
leaseExpiresAt
```

Work:

- Classify transient, quota, auth, invalid-input, unsupported-media, and deterministic coverage failures.
- Use exponential backoff with jitter until a durable deadline.
- Retry only transient failures.
- Surface quota/auth failures immediately with an operator action.
- Add an idempotent explicit resume action.
- Preserve successful stages and retry only unfinished stages.
- Resume `proj_YWFj2GOO6tUl` only after this state machine is live.

Absolute tests:

- A transient failure retries after process restart.
- Duplicate QStash delivery cannot duplicate work.
- Auth/quota errors do not burn retry loops.
- Manual resume is idempotent.
- A terminal coverage gap becomes actionable missing-footage state.

Exit gate:

`proj_YWFj2GOO6tUl` either completes or ends in a truthful, typed terminal state with no hidden fast-attempt exhaustion.

### Phase 3: Perception And Decision Truth

Maps to: P1, P2, P4, P6, P13

Aim:

Remove fabricated signals and make selected decisions explainably executable.

#### Phase 3A: Provenance And Artifact Evidence

Work:

- Add canonical asset provenance: user-upload, generated, stock, imported, unknown.
- Route actual localized artifact evidence into `VisualEvidenceContext`.
- Remove analysis-quality-based AI risk.
- Treat missing artifact evidence as unknown, not bad.
- Recompute affected transition candidates.

Absolute tests:

- Degraded real footage produces zero fabricated AI risk.
- AI provenance without artifact ranges records missing evidence, not invented risk.
- Localized confirmed artifacts affect only overlapping ranges.

#### Phase 3B: Typed Executor Outcomes

Work:

- Replace handler null returns with typed results.
- Persist validation owner, rejection code, evidence snapshot, and whether rejection was knowable at planning time.
- Share precondition validators between planner and executor.
- Add a contract-health summary by family.

Absolute tests:

- Every selected decision has exactly one terminal execution outcome.
- No `handler returned null` generic reason remains.
- A decision rejected for a planner-knowable condition fails the planner-contract test.
- High guard rejection marks the edit `needs_review`.

Exit gate:

The former 82 selected / 2 executed case is explainable decision by decision, and planner-knowable rejections are removed upstream.

### Phase 4: Rendered Truth And Quality Telemetry

Maps to: P0, P12, render-correctness

Aim:

Make quality reports describe actual pixels/audio and current lifecycle state.

#### Phase 4A: Phase-0 Source Resolution

Work:

- Render full composition as "after".
- Render source timeline minus only the audited family as "before".
- Persist source resolution receipts and artifact hashes.
- Fail evidence generation when source media cannot resolve.

Absolute tests:

- Transition samples contain the real clip before and after the boundary.
- Caption samples contain source video in both versions.
- Audio samples retain native audio.
- Blank source frames produce evidence-generation failure, not an aesthetic verdict.

#### Phase 4B: Transition And BGM Telemetry

Work:

- Introduce one canonical transition accessor that understands modern `transitionType`.
- Remove field-name drift from all quality checks.
- Model BGM lifecycle as not-requested, queued, rendering, ready, failed, declined.
- Judge "missing BGM" only when BGM is required and its lifecycle is terminal.

Absolute tests:

- Modern transitions never become repeated `unknown`.
- An asynchronously queued BGM is not reported missing.
- A terminal failed BGM is reported with its provider reason.

Exit gate:

Quality findings are reproducible from persisted artifacts and lifecycle receipts.

### Phase 5: Family Output Correctness

Maps to: P3, P5, P6, P7, P9-P13

Aim:

Improve family behavior only after authority and rendered truth are trustworthy.

#### Phase 5A: Brand-Aware Canonical Captions

Inputs:

- accepted Brand Vault typography,
- palette and contrast relationships,
- motion taste,
- composition/safe-zone preferences,
- speech rate,
- semantic phrase boundaries,
- cut boundaries,
- screen occupancy,
- moment energy,
- explicit user/reference preference.

Rules:

- Brand supplies identity.
- Moment signals control grouping, timing, and emphasis.
- Readability and protected regions are hard guardrails.
- Registry styles are explicit user/reference compatibility only, not automatic authority.

Absolute tests:

- No group crosses an incompatible cut.
- Reading speed remains within calibrated bounds.
- No unsafe face/text collision.
- Contrast is measured on rendered pixels.
- Insturix brand context does not silently select an unrelated blue-highlight registry row.

#### Phase 5B: Grounded Transitions

Boundary evidence:

- topic/content delta,
- speech continuation and pause,
- visual motion direction,
- shot scale and subject continuity,
- beat/downbeat,
- emotional shift,
- screen clutter/text/face state,
- explicit provenance and artifact evidence,
- brand kinetic preference,
- recent transition memory.

The planner chooses the boundary job first:

```text
invisible
smooth continuity
emphasize turn
hide jump
reset attention
match motion
```

The transition resolver alone owns duration, curves, direction, blur, wipe softness, anticipation, landing, and SFX eligibility.

Absolute tests:

- Talking-head continuity does not receive a zoom-flash without a grounded boundary job.
- False AI evidence cannot create a transition.
- Repeated forms are prevented by shared timeline memory.

#### Phase 5C: Zoom And SFX Rendered Proof

Work:

- Validate zoom against subject position, shot scale, camera motion, emotional/speech peak, and recent motion memory.
- Validate SFX against exact transition/MG/zoom landing, silence pocket, provider quality, and role.
- A weak or missing asset causes a typed decline.

Absolute tests:

- Zoom never crops the protected subject region.
- SFX lands within its licensed sync window.
- Dissolves can explicitly declare that no SFX is required.
- Repetition is judged from real output, not labels.

Exit gate:

Captions, transitions, zooms, and SFX pass family-specific rendered fixtures across talking-head, visual-only, mixed, music-led, and Hinglish content.

### Phase 6: Playback Reliability

Maps to: editor runtime correctness

Aim:

Make timeline playback and scrubbing stable without black/silent fallback.

Work:

1. Define a range-capable `edit-proxy` delivery contract.
2. Add an asset-level media lease/cache keyed by derivative identity.
3. Keep active and near-future source ranges warm.
4. Share one stable URL/decoder across clips from the same asset.
5. Release only when no active/nearby clip owns the lease.
6. Add stall telemetry: asset, derivative, source time, buffered ranges, decoder state, URL age, recovery result.
7. Add bounded recovery before declaring media unavailable.
8. Measure whether HTMLMedia remains inadequate; only then add MediaBunny/WebCodecs scrub-frame caching.

Absolute tests:

- Repeated cut points from one source do not recreate blob URLs.
- Pause/play and rapid scrubbing do not wedge playback.
- Expiring URLs refresh without dropping the active decoder.
- Byte-range seeking works through the owned preview path.
- Recovery never substitutes black/silent frames as success.

Exit gate:

A stress fixture with rapid seeks, repeated source clips, and URL refresh completes without a manual pause/play workaround.

### Phase 7: Durable Media Contract V2 And 300 GB Ingest

Maps to: multi-upload, conform, large-project infrastructure

Aim:

Support projects with hundreds of gigabytes while preserving full source context.

#### Phase 7A: Immutable Asset And Derivative Schema

Each logical asset owns:

```text
sourceAssetId
immutable original
edit-proxy
analysis-proxy
audio derivative
waveform
storyboard/keyframes
OCR
thumbnail
derivative version/status
original-time mapping
rights/provenance
```

Resolution is role-based:

```text
editor playback -> edit-proxy
analysis -> analysis-proxy
final render -> immutable original
```

No canonical URL swapping through `cachedUrl`, `isProxy`, or `originalR2Key`.

#### Phase 7B: Durable Multipart Upload

Work:

- Compute part size dynamically while staying below 9,500 parts.
- Persist upload ID, fingerprint, file size, part size, part ETags/checksums, and completion state server-side.
- Reserve quota atomically before upload.
- Make part publication and completion idempotent.
- Resume only missing parts after refresh/device restart where identity proof permits.

Absolute test:

Interrupt a 300 GiB upload at 37 percent, close/refresh, and resume only missing parts. The completed object checksum must match the source.

#### Phase 7C: Durable Ingest Worker

Stages:

1. ffprobe validates codecs, duration, streams, and timebase.
2. Register immutable original.
3. Generate seek-optimized edit proxy.
4. Generate model-friendly analysis proxy.
5. Extract audio and waveform.
6. Generate thumbnails, storyboard frames, and OCR.
7. Dispatch transcription and visual analysis.
8. Persist pending/running/completed/failed per stage.

Only failed or invalidated stages retry. The browser can close after durable enqueue.

#### Phase 7D: Google Drive Import

Drive is an ingest source, not an editing source of truth.

- User selects a Drive file.
- Server imports it into owned storage.
- The same validation, derivative, quota, rights, and lifecycle pipeline runs.
- Editing never depends on a long-lived Drive link.

#### Phase 7E: Context Preservation

- Transport parts never become scene boundaries.
- Analysis windows overlap and map back to original time.
- Asset-level semantic summaries and event indices span all windows.
- Storyline and VLM retrieve relevant ranges from the whole asset.
- Final render resolves original-time ranges against the immutable master.

Exit gate:

Large-file upload, analysis, editing, reload, and final render preserve one coherent source timeline without forcing the browser to hold the original in memory.

### Phase 8: Secondary Runtime Cleanup

Aim:

Remove operational noise only after primary correctness is stable.

Work:

- Diagnose Graph/Graphiti 400/404 failures by endpoint, schema, and auth receipt.
- Remove duplicate Gemini-key resolution and warnings.
- Ensure optional intelligence side channels fail soft without masking primary pipeline state.

Absolute tests:

- No duplicate Gemini-key warning per request.
- Graph failures carry endpoint/status/body classification.
- Core edit completion does not depend on an optional graph write.

### Phase 9: Global Opportunity Optimizer

Maps to: P2, P13

Aim:

Choose the best combination of valid edits across all families without fixed counts or per-family tunnel vision.

Flow:

1. Collapse nearby detections into one editorial opportunity.
2. Apply family-specific absolute validity.
3. Build a conflict graph for overlapping attention, collision, repetition, camera incompatibility, and boundary competition.
4. Maximize total editorial value under timing, safety, collision, distribution, and repetition constraints.
5. Protect narrative distribution across chapters and phases.
6. Persist every score, conflict, rank, selection, and rejection reason.

Frequency semantics:

- MG, zoom, transition, and SFX: occurrence selection pressure.
- Captions: emphasis density, never transcript coverage.
- Music: not frequency-based.
- Pacing: willingness to act on genuine cut opportunities.

Absolute tests:

- Five signals around one phrase create one opportunity.
- Frequency changes selection pressure, not candidate truth.
- Strong edits do not cluster in one 20-second region.
- No family can silently override another family owner.

### Phase 10: Calibrated Gates And Learning

Maps to: P12, P15, P16

Aim:

Calibrate only after structural and rendered truth is reliable.

Order:

1. Build diverse human-labeled rendered fixtures.
2. Separate development and holdout sets.
3. Calibrate pixel/audio judges by family.
4. Calibrate signal curves and frequency pressure.
5. Run holdout evaluation.
6. Enable learning only from verified-quality runs.
7. Add per-brand priors only after global behavior is stable.

Absolute tests:

- Calibration refuses to run when rendered evidence is missing or invalid.
- Failed-quality projects cannot write policy/brand learning.
- Reports show before/after by family and holdout performance.
- Thresholds retain explicit calibration status and provenance.

## 6. Project Recovery Runbook

### `proj_Gn3nVJaDk5Fx`

1. Verify preview contains `baaadc68`.
2. Snapshot project revision and overlays.
3. Backfill only verifiable native-audio rights.
4. Rerun MG/Director stage idempotently.
5. Verify transition, MG, caption, SFX, and BGM overlay receipts.
6. Reload editor.
7. Render targeted artifacts.

Do not regenerate the entire project if the stage can be resumed safely.

### `proj_YWFj2GOO6tUl`

1. Snapshot provider failure receipt.
2. Deploy durable retry/resume state machine.
3. Invoke explicit idempotent resume.
4. Preserve completed stages.
5. Observe until terminal completion or truthful terminal failure.

Do not manually reset counters or erase failure history.

## 7. Deferred But Preserved

These are intentionally not part of the matrix-first execution:

- Omni motion backdrops for MG output.
- Dedicated motion-backdrop asset contract and playback.
- Additional MG cost optimization after the live worker is proven.
- Avatar Vault, Alyzitron, ThinkForge, and unrelated product lanes.

They remain documented requirements, not forgotten work.

## 8. Global Done Test

Editron is not "done" because tests compile or an API returns 200.

A fresh, representative run must prove:

- durable owned media ingest,
- truthful transcript/audio/visual/OCR evidence,
- one canonical timeline,
- deterministic workflow ownership,
- explainable candidate selection,
- typed executor outcomes,
- brand-aware family behavior,
- stable playback,
- Mongo and reload parity,
- valid rendered pixel/audio artifacts,
- calibrated quality decisions,
- no false pass,
- no failed-quality learning,
- recovery from provider interruption,
- and final render from immutable originals.

The minimum fixture suite includes:

- talking head,
- visual-only,
- mixed multi-asset,
- music-led,
- Hinglish,
- user-provided BGM,
- uploaded script/reference,
- generated/AI footage with real artifact evidence,
- degraded real footage,
- a video over 15 minutes,
- and a large resumable ingest.

Only then may the system be described as production-ready across the tested envelope.

## 9. Immediate Next Action

Start Phase 0 only:

1. verify preview deployment truth,
2. backfill and rerun `proj_Gn3nVJaDk5Fx`,
3. snapshot `proj_YWFj2GOO6tUl`,
4. produce the release receipt.

Stop after Phase 0 verification and request approval before Phase 1, per repository execution rules.
