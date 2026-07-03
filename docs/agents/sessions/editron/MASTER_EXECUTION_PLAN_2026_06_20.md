# Editron Master Production Plan (Consolidated, 2026-06-20)

Purpose: one durable, production-level plan that combines the Northstar plan, MG plan,
pipeline audit, and confirmed defect registry into a single source of truth.

This document is the **authoritative** operating plan for the next implementation cycle.
No one-off patches. No â€œPath E vs Path D mergeâ€ claims unless the control flow is
proven in code for producer â†’ authority â†’ final consumer.

## START HERE -- 2026-06-27 Codex Handoff (current remaining work)

**Full execute-cold instructions:** [`Editron-Codex-Handoff-2026-06-27.md`](./Editron-Codex-Handoff-2026-06-27.md)
-- every task has a verified root cause (file:line, read 2026-06-27), a concrete fix, acceptance criteria, and
verification steps. Read its Section 0 (git + verification constraints) FIRST.

Shipped 2026-06-27 (done -- context in the handoff Section 1): gemini flash-lite-preview pull -> 2.5-flash
(`a566b433`/`a65ca257`, 3.1-pro KEPT), caption per-word emphasis ordering (`48cba338`), BGM false-warning gate
(`a4cb2cf9`), black-video speed-segment lead-in (`be91771c`), caption registry + measured read-speed + renderer
atoms (`906a2727`/`705cda69`/`c60b2836`/`803d4c28`), auto-BGM dispatch + shared audio-worker dispatcher
(`45925eb3`, L2 only -- needs L3 verify).

Current status of those handoff tasks (code-verified 2026-06-30):
1. **P1 Quality score saturation -- DONE IN CODE.** `quality-review-service.ts` now uses per-type caps and
   advisory/blocking separation; focused quality/bandit tests pass. Do not redo unless a fresh real project proves
   the new score still misrepresents visible output.
2. **P1 Embedding 404 -- DONE IN CODE.** Live code no longer calls `text-embedding-004`; the shared Gemini embedding
   helper uses `gemini-embedding-001` with `outputDimensionality=768`, and the Python Graphiti path uses the same
   768-dimensional contract. Remaining work is only data backfill/ops if old assets still have null vectors.
3. **P1/P7 Auto-BGM source-music contract -- DONE IN CODE, L3 VERIFY STILL NEEDED.** Source music detection
   no longer treats speech-derived BPM as music by itself and now consumes project-level Essentia `musicAnalysis`
   when per-asset `musicStructure` is absent; regressions cover speech-only false positives and project-level music
   analysis. A fresh run with `FAL_AI_API_KEY` + `QSTASH_TOKEN` must still prove a real BGM overlay lands when the
   recommendation says yes.
4. **P2 Transition produce-then-suppress -- DONE IN CODE.** `signal-executor.ts` pre-gates signal transitions against
   clip boundaries/pairs and annotates `transitionProducerGate`; focused signal/unified-bundle tests pass.
5. **P2 Chapter-concat for >15-min renders -- BUILT AND PLAN-MARKED LIVE, OPS VERIFY ONLY.** The Modal concat path,
   env names, and smoke docs exist. Remaining proof is a real >15-minute render stitched through the deployed worker.
6. **P3 TRIBE perf -- PARTIAL/DONE FOR CLIENT SAMPLING.** `vjepa-service.ts` sends adaptive `max_frames_per_segment`
   to Modal (64/48/32/24 by segment count) and tests verify long-video requests send 24. Remaining perf work is live
   telemetry/deploy tuning, not rebuilding the V-JEPA client wrapper.
7. **MEMORY.md compaction -- OUT OF REPO.** Claude memory housekeeping only; do not spend Editron code time on it.

## START HERE -- 2026-06-29 Code-Verified Phase Status

This section supersedes stale phase-status language below, especially the 2026-06-25 line that called Phase 0
"zero live callers" and Phase 13 / Phase 16 "not built". Verification was done from live code on
`infrastructure-improvs-+Editron` before editing this plan. Do not re-label a phase as done unless the producer,
authority, source-of-truth timeline, and final consumer are all verified again.

### Corrected status map

| Phase | Status | Code-verified finding | Remaining production work |
| --- | --- | --- | --- |
| P0 Rendered truth fixture | **PARTIAL, live metadata + async Lambda stills + scored reports wired** | Live Director calls `persistFinalPhase0LiveTruth` after final overlay save, persists `qualityReview`, `intelligence.phase0LiveTruth`, and planned artifact evidence, then dispatches `/api/internal/workers/phase0-rendered-evidence` to render sampled full/baseline stills through Remotion Lambda. The worker now builds rendered aesthetic reports, persists `intelligence.phase0RenderedStillEvidence`, `intelligence.phase0RenderedAestheticReport`, `intelligence.renderedQualityEvidence`, and a rendered quality gate; partial/completed still evidence without rendered-aesthetic quality evidence remains claimable for retry. | Code-level scoring is wired; remaining work is live env proof on real projects, broader gate-policy hardening, and enough real rendered evidence before P0 becomes the hard calibration source. |
| P1 Decision authority | **DONE for the live unified-candidate path, with compatibility caveat** | `director-agent.ts` pushes Creative Brief and signal candidates into `planUnifiedDecisionBundleFromCandidates`; `unified-decision-bundle.ts` ranks both producer candidates and stamps selected decisions with `owner: unified-planner`, `creativeBriefRole: semantic-context`, `signalRole: candidate-source`. | Keep legacy/single-producer helper paths honest in telemetry. Do not claim all historical helpers are removed. |
| P2 Candidate normalizer | **PARTIAL** | `signal-executor.ts` now emits `momentImportance`, `candidateConfidence`, `executionConfidence`, `evidenceStrength`, and `signalNormalization`; `unified-decision-bundle.ts` normalizes family/job/timing/evidence/risk. | Upstream still starts from `momentWeight` and blends it into confidence; formulas are invented and need calibration. |
| P3 Caption planner | **PARTIAL** | Canonical final-timeline caption track exists, creates one caption overlay with multiple readable caption groups, and caption moment planning reads speech/readability/screen-pressure atoms. | Still one track container rather than a true moment-scoped caption planner/renderer ownership model. |
| P4 Visual perception / VLM cut intelligence | **PARTIAL, V-JEPA cut intelligence built + wired; perception facts reach unified context, atoms, and shared screen context** | `video-analysis/route.ts` runs Step 1.58 before silence removal, calls V-JEPA, refines `rawFootageAnalysis.silenceRemovalPlan` through `visual-cut-intelligence.ts`, then `executeSilenceRemoval` consumes the refined plan. Focused tests prove visual dead-air removal and visual-boundary splits become real timeline video-overlay changes. `signal-registry.ts` now projects `visualCutIntelligence.perception` into global visual perception signals, `UnifiedMomentContext` carries those facts into planner context, and `moment-bundle.ts` preserves them as primitive atoms. Trusted perception also feeds shared screen context as fallback evidence for negative space, busyness, salience, and motion when direct per-frame primitives are absent, and the selected negative-space region is exported into the existing `negative_space_*` signal-map keys that placement/readability consumers already read; direct primitives remain authoritative. | Finish the production layer: full VLM semantic perception, calibrated thresholds, real-project rendered proof, visual-heavy/visual-only fixture coverage, and family-specific rendered placement proof of the same perception facts. |
| P5 Zoom / visual-motion planner | **DONE as planner infrastructure** | Zoom planner reads subject bbox, face/eye contact, shot scale, motion vectors, speech/beat/emotion, and overlay memory; it attaches `zoomMotionPlan` and anti-repeat inputs. | Rendered proof and calibration still belong to P12/P15. |
| P6 Transition planner | **DONE as planner infrastructure** | Producer pre-gates transition decisions at clip boundaries/pairs; transition boundary planner reads topic, pause, beat, motion, visual change, shot/subject jumps, semantic contrast, audio tail, and repetition pressure. | Rendered timing/choreography proof still belongs to P13/P12. |
| P7 SFX / BGM | **PARTIAL** | Atomic SFX form, sync anchors, provider candidate gate, R2/cache behavior, and strict timing validation exist; provider path is still Freesound-first and asset quality is provider-dependent. Auto-BGM dispatch exists, but `proj_UtqhQCsK3ZkR` showed BGM can be falsely suppressed when speech rhythm is interpreted as existing music. | Full SFX system remains: multi-provider/provider abstraction, better rejection telemetry, richer non-transition roles, and calibration of skip/place decisions. BGM source-music detection must stop using BPM alone and must persist why BGM was added/skipped. |
| P8 MG semantic + fact enrichment | **DONE** | Creative Brief prompt asks for semantic atoms/facts; brief wrapper emits semantic candidates; semantic MG candidate ledger/gates feed EDL/MG content normalization. | Downstream MG form generation remains P9/P11/Rule-11. |
| P9 MG expression authority | **PARTIAL** | MG expression authority, semantic obligations, draw support, choreography helpers, and brand/MG dials exist. The "no draw-on exists" claim is stale. | Visible expression is not fully signal-owned yet: enter order, beat sync, shimmer/draw usage, and form breadth still need rendered proof and calibration. |
| P10 Stage-aware composition | **PARTIAL** | Full-frame/split/device/overlay stage modes exist and negotiate caption/screen context. | Many thresholds are explicitly invented; no hard rendered gate validates stage choices live. |
| P11 MG family hardening | **PARTIAL** | Numeric, identity, quote, process, comparison, data-series/structured/emphasis/brand paths exist. Social-proof is not yet a first-class composer, and license strictness is uneven. | Finish missing families and even out license rules with rendered evidence. |
| P12 Gate teeth | **PARTIAL** | Structural MG gate is now enforcing by default with `MG_STRUCTURAL_GATE=observe` as escape hatch; metadata quality evidence persists. Phase0 rendered still scoring can mark projects `needs_review` when sampled full/baseline stills fail. | Do not promote this to a hard universal pass/fail yet: live render coverage, issue taxonomy, family-specific thresholds, and calibration are still incomplete. |
| P13 Cross-overlay choreography | **PARTIAL, scheduler infrastructure wired + Phase 0 suppression evidence summarized** | `overlay-timeline-memory.ts` feeds shared pressure atoms and `cross-overlay-choreography.ts` runs in the live unified-candidate path before final EDL stamping. It suppresses same-lane stacks, unlinked audio on crowded moments, and unlicensed text-motion clashes; kept decisions carry sync-group metadata; Phase 0 manifest/taxonomy now surfaces scheduler suppression counts, reasons, families, sync groups, and samples from `unifiedDecisionBundle.evidence.crossOverlayChoreography`. | Remaining work is rendered proof on real projects, calibration of scheduler windows/thresholds, and broader pixel/audio-level event scoring in Phase 0/12 evidence. |
| P14 Learning quarantine | **DONE** | Learning gate and genre bandit block failed/missing rendered evidence; inline workers and brand-learning route use the shared learning gate. | Keep Phase 0 rendered evidence reliable before enabling broader learning writes. |
| P15 Calibration | **PARTIAL scaffold only** | Threshold/bandit/write-gate scaffolds exist and many fields are marked `invented-needs-calibration`. | Make rendered evidence source-of-truth, add human-labeled holdout, then tune curves/weights. |
| P16 Per-brand taste priors | **PARTIAL, not an island anymore** | BrandSignalProfile now includes narrative/motion/composition signals and `brand-vault-to-motion.ts` maps them into MG motion inputs; tests cover the socket. | Real edit-feedback loop into per-brand taste priors is not proven complete. |
| Rule-11 generative MG form | **NOT STARTED as true generative form** | MGs are no longer text-only, but form is still bounded by detected shapes and composer families (`numeric`, `identity`, `quote`, `process`, `comparison`, etc.). | Replace shape/composer menu authority with primitive/fact/wire-driven generative assembly after rendered truth exists. |

### Immediate next work order

1. **Do not rebuild P1.** It is done for the live candidate path; only telemetry/fallback cleanup is allowed.
2. **Prove and harden P0 rendered truth scoring on real projects**: code-level full/baseline scoring is wired, so the next work is live env proof, false-positive control, and gate-policy hardening.
3. **Harden P4 visual perception / VLM cut intelligence** beyond the built V-JEPA cut-refinement slice: add semantic VLM perception, real fixture proof, calibration, and overlay consumption.
4. **Prove and harden P13 shared choreography scheduler** on real rendered projects: scheduler code is wired, but thresholds/windows and visual outcomes still need Phase 0/12 evidence.
5. **Continue P7/P9/P10/P11/Rule-11 only with rendered evidence**, not by adding new hidden menus.
6. **Run P15 calibration only after P0/P12 rendered gates are trustworthy.**

### 2026-07-03 real-run defects to carry forward

Source run: `proj_evz_c18y-cd5` / `front-end-log-export-2026-07-03T06-55-08.csv`.
These are plan amendments, not a new roadmap.

1. **P7 Auto-BGM music-analysis contract mismatch - FIXED IN CODE, L3 VERIFY STILL NEEDED.** TRIBE/Essentia produced project-level
   `musicAnalysis` (`musicPresence`, BPM, beats, sections), but Auto-BGM reason still reported
   `sourceMusicConfidence=0.00; no music-structure analysis` in the 2026-07-03 run. Current code now passes
   `projectDoc.musicAnalysis` from both Path E and Path D into `computeGenreParameters`, and
   `genre-parameter-computer.test.ts` proves project-level Essentia analysis is consumed when asset-level
   `musicStructure` is absent. Remaining work is live proof that the async BGM worker actually creates the overlay.
2. **P0 rendered-evidence signal propagation mismatch - FIXED IN CODE 2026-07-03.** Persisted MG overlays contain
   `cinematic_moment` / `narrative_pressure`, but the Phase0 rendered-evidence path logged them
   missing while scoring samples. Root contract: render/judge code must evaluate the same MG
   signal payload that Director persisted. `overlay-atomic-receipts.ts` now treats top-level
   `contentSignals` as receipt evidence and invalidates stale receipts when those signals change.
3. **Worker reliability side defect: asset-analysis timeout loop.** `asset-analysis` timed out
   repeatedly on the long upload. It did not block the main edit, but it wastes Vercel time and
   weakens side metadata. Treat as a separate worker-budget/deduplication slice, not an MG/EDL
   root-cause detour.

---

## 0) 2026-06-21 Binding Update From Codex Plan Brief

Source brief: `Editron-Codex-Plan-Brief-2026-06-20.md`.
Required references read and incorporated:

- `Editron-PathE-PathD-Unification-Audit-2026-06-20.md`
- `Editron-Confirmed-Defect-Registry-2026-06-20.md`
- `Editron-Pipeline-Step-Audit-2026-06-20.md`
- `Editron-Architecture-Verdict-and-Plan-2026-06-20.md`

This update supersedes any stale lower section that implies Path E and Path D are fully merged.
Current HEAD has two partial fixes:

- Creative Brief semantic MG primaries are now ledger-gated before entering the primary EDL.
- Signal MG candidates are now licensed through the semantic MG ledger instead of a shallow field-exists check.

These fixes are useful but they are not full Path E/D unification. Full unification still requires:

`Path E facts + Path D signals + canonical timeline + V-JEPA/screen context + brand`
-> `one normalized candidate pool`
-> `one symmetric truth/evidence licensing gate`
-> `family planners`
-> `one planner-owned EDL`
-> `executeEDL`

### 0.1 Critical Current Truth

Spot-verified against current code:

- Director still emits two producer candidates: Creative Brief at `director-agent.ts:920-926`
  and signal-driven at `director-agent.ts:1339-1345`.
- The bundle planner still processes ordered producer candidates via
  `planUnifiedDecisionBundleFromCandidates` at `unified-decision-bundle.ts:532-540`.
- Creative Brief still sorts first via `producerRank` at `unified-decision-bundle.ts:3842-3850`.
- Merge still starts from an existing primary bundle and then licenses incoming signal decisions
  at `unified-decision-bundle.ts:543-620`.
- Authority still becomes `unified-planner` only when executable signal supplements exist,
  not because a single planner authored all candidates from scratch
  (`unified-decision-bundle.ts:730-758`).
- Semantic MG ledger still has a zero-candidate escape hatch at
  `semantic-mg-candidates.ts:132-142`.
- MG source spans are still synthesized from content fallbacks in
  `semantic-mg-candidates.ts:376-412` and `mg-content-atoms.ts:130-178`.
- Budget still guides MG count at the source: `graphic.max = ceil(graphic_density * durationMin)`
  in `creative-brief.ts:905-945`.
- MG form breadth is still narrow: numeric wires require percent-like evidence for sweep/length
  in `encoding-wires.ts:154-246`, while `detectShapes` remains content-shape based in
  `content-shape-analyzer.ts:248`.
- Rendered quality still is not the hard truth loop: `runQualityReview` starts at
  `quality-review-service.ts:1313`, render controls warn at `render-controls.tsx:81-121`,
  structural gate warnings are still non-blocking in `edl-executor.ts:3235+`, and
  `aesthetic-gate.ts` remains dormant.

### 0.2 Final Execution Order

The next implementation order is binding:

1. **Path E/D Authority Recovery First**
   - Replace "brief primary + signal supplement" with one normalized candidate pool.
   - Brief emits semantic/factual candidates only.
   - Signals emit evidence/timing/screen candidates.
   - Both pass through the same content-truth and family licensing.
   - `unified-planner` must mean sole author, not a relabel after merge.

2. **Content-Truth Grounding**
   - Denylist placeholder scrub stays as a cheap prefilter only.
   - Rendered MG text must resolve to transcript words, verified brief facts, verified visual OCR,
     or another explicit evidence source.
   - Close the zero-candidate ledger escape.
   - Stop accepting synthesized source spans as proof.
   - Novel placeholders not present in `KG_EXAMPLE_PLACEHOLDERS` must still be rejected.

3. **Rendered Judge / Eyes**
   - Revive the rendered judge path as feedback, not the primary quality mechanism.
   - It must inspect rendered pixels/audio timing and persist artifacts, overlay ids,
     frame ranges, issue classes, and scores.
   - Do not use the dormant aesthetic gate as reward until its no-key auto-pass and failure
     behavior are fixed.

4. **MG Form Engine**
   - Generation-first: the form engine must produce good graphics directly.
   - Widen faithful candidate sets for numbers, comparisons, identity, quote/proof,
     refutation, process/list, series, and social proof.
   - License form by fact, not narrow parse.
   - Signals choose among faithful forms and choreograph motion; facts define what is honest.

5. **Budget Becomes Guardrail**
   - MG count comes from warranted moments, not `graphic_density * duration`.
   - Budget only vetoes runaway density, repeated clutter, or unreadable stacking.
   - Decision-budget spacing remains a safety guard, not the source of creative count.

6. **Signal Normalization Cleanup**
   - Keep `momentImportance`, `candidateConfidence`, `executionConfidence`,
     `evidenceStrength`, and `risk` separate.
   - Replace first-wins dedupe with per-family best-wins.
   - Hoist family atoms before culling.
   - Every invented threshold must be CRG-linked or marked `INVENTED-needs-calibration`.

7. **Visual Perception Layer**
   - Add per-shot VLM perception after V-JEPA/transcript/audio and before planning.
   - It outputs structured facts only: subjects, action, OCR, composition, negative space,
     visible explanation, visual dead air, visual state changes, and protected silent moments.
   - Native deterministic planners still decide cuts and overlays.

8. **Family Planner Hardening**
   - Do not rebuild transition/zoom/SFX/caption planners from scratch.
   - Harden beat-frame sync, timing windows, provider quality, caption readability,
     repetition memory, and cross-overlay choreography.
   - Compatibility labels stay at renderer edge only.

9. **Gate Teeth**
   - Implement CRG-specified checks: overlap, unreadable graphics, caption drift,
     SFX drift, transition repetition, pacing monotony, shot-scale monotony.
   - Gates are guardrails and auto-correct where possible; generation remains the main quality path.

10. **Calibration Last**
    - Freeze/guard live learning until rendered evidence is trustworthy.
    - Calibrate only after authority, content truth, rendered judge, and form breadth are sane.
    - Use diverse creators, holdout split, and family-by-family before/after reporting.

### 0.3 Path E/D Acceptance Tests

Before claiming full Path E/D unification, all of these must pass:

- A Creative Brief semantic graphic with ungrounded text is evidence-only, not primary executable.
- A signal candidate with stronger verified evidence can win without being a supplement to a brief primary.
- A brief candidate and signal candidate are ranked by evidence/grounding/family readiness, not source.
- A novel placeholder string not in the denylist is rejected by grounding.
- `semantic-mg-candidates` returns block reasons for zero recognized candidate facts when output text exists.
- `planComposition` cannot be called with an unlicensed MG candidate.
- Mongo/logs report `unified-planner` only when one planner actually owns final decisions.
- `executeEDL` receives planner-owned decisions only for the unified path.

### 0.4 Non-Negotiable Do-Not-Do Rules

- Do not append future placeholder strings to `KG_EXAMPLE_PLACEHOLDERS` as the fix.
- Do not make a template/menu/preset selector and call it primitives.
- Do not let Gemini/VLM choose final overlays. They provide facts/perception only.
- Do not tune thresholds against one project, one creator, or one screenshot.
- Do not call shared downstream plumbing "merged."

### 0.5 2026-06-23 Authority Loophole To Close

Commit `278c81e7` fixed the live ranked planner path so Creative Brief overlay-family
labels must pass the same atom/family license as signal candidates before execution.
That is a real authority fix, but it is **not the full Phase 1 completion**.

Remaining verified gap:

- If `planUnifiedDecisionBundleFromCandidates(...)` receives only a Creative Brief producer
  and no `signal-driven` producer, it falls back through `createUnifiedDecisionBundle(...)`.
  That path still calls `licensePrimaryProducerDecisions(...)`, which currently invokes
  `resolvePrimaryCreativeDecisionLicense(...)` without `requireFamilyAtoms`.
- Impact: when Path D/signals are absent or fail, Creative Brief transition/zoom/SFX/caption
  family labels can still execute without the strict atom license.
- Required next acceptance test: Creative Brief-only upload-to-edit family labels are
  evidence-only unless they carry the same boundary/moment/audio/caption atoms required by
  the ranked planner.
- Required fix shape: strict family licensing must apply to Creative Brief-only upload-to-edit
  bundles too, with any legacy compatibility kept explicit and isolated.

---

## 1) Northstar Contract (non-negotiable)

The system target is:

`content atoms + relations + rhythm + screen context + brand taste + learned references`
â†’ `form + timing + placement + combo`

No label -> preset -> hope.

For upload-to-edit, this also means:

`transcript + audio + visual perception + raw-to-cut provenance`
-> `cut plan + canonical edited timeline + overlay decisions`

Cutting must not be transcript-only. Visual perception is part of the edit brain: dead air with a visible failed setup can be removed, visually important silent moments can be protected, and screen-state/product/chart changes can create or protect cuts even when transcript/audio is weak.

- Legacy compatibility labels/keys may exist only at API/render adapter edges.
- The creative source of truth is facts/relations/curves/tastes + deterministic scoring.
- Rendered output quality must be judged from rendered evidence (pixels/audio timing),
  not metadata labels.

### Hard Rules (must be in every phase)

1. Do not claim Path E + Path D are merged unless one producer, one decision owner, one final consumer is proven in code.
2. Per-overlay family decisions must have atomic decision input and family-specific form logic.
3. Do not calibrate before rendered evidence and hard blockers prove the structure.
4. If quality fails visibly, it must either be fixed or blocked (no silent pass).
5. No hidden LLM/menus as final creative chooser. LLM is allowed for factual interpretation only.

---

## 2) What is currently true (as of 2026-06-20)

This status uses live audit documents and code-backed evidence:

- `Editron-Architecture-Verdict-and-Plan-2026-06-20.md`
- `Editron-Pipeline-Step-Audit-2026-06-20.md`
- `Editron-Confirmed-Defect-Registry-2026-06-20.md`
- `MG-Final-Build-Plan-2026-06-18.md`
- `MG-Session-Port-Handoff-2026-06-18.md`
- `Editron-Northstar-Final-Plan-2026-06-14.md`
- `editron_atomic_overlay_final_plan_2026_06_07.md`

### Current truth vs status

| Area | What is true | Status |
|---|---|---|
| Pipeline plumbing | Path E + Path D to shared `unified-decision-bundle`, budgeting, EDL, persisted overlays | **Partially proved** |
| Authority | Creative-brief primary in many paths; Path D advisory/supplement unless normalized and licensed | **Not fully unified** |
| Raw signals | Rich signals exist and are attached | **Partially used (too narrowly in several families)** |
| MG form origin | Content-shape controls base composer; signals fine-tune within current candidate set | **Partially true (this is why outputs feel repetitive)** |
| Rendered truth gate | Some artifact capture exists, but no full hard blocker for bad visuals | **P0 blocker** |
| Visual cut intelligence | V-JEPA primitives now refine the cut plan before silence removal; full semantic VLM perception and rendered proof are still missing | **Partial / needs hardening** |
| Calibration | Live bandit writes are now quarantined behind rendered/pass or explicit publish evidence (`4b48c8c3`); full rendered truth-loop calibration is still blocked | **Partially fixed / not production-ready** |

### Confirmed P0/P1/P2 findings (short)

- **P0:** No rendered-pixel hard truth loop; bad 0/100 edits can still pass flow.
- **P1:** MG candidate breadth is shallow (shape-bound), signal candidates are often suppressed at merge/cut floors, and gate checks are often observe-only.
- **P1:** Auto-BGM can be falsely suppressed on speech-only talking-head uploads because speech-derived BPM/musicPresence is treated as source music.
- **P1:** Invented constants without calibration are active in multiple places; cannot be tuned safely yet.
- **P2:** Signal normalizer contract is incomplete (family atom + signal anchor fields not consistently projected into executable layer).
- **P2:** `graphic_density Ã— duration` cap and 4.5s spacing budget are separate levers; can disagree unless aligned.
- **P2:** Cut planning still needs visual perception as a first-class source, not transcript/silence only.

---

## 3) Unified plan map: northstar + MG + family overlay plans

This combines all plan versions and keeps one execution order.

### Phase 0 â€” Phase 0 rendered truth fixture (foundation)
**Scope:** freeze real-project, multi-overlay evidence before changing form logic.

- Inputs: real project id, raw-to-cut map, overlays, unified bundle, decision/authority metadata, V-JEPA segment coverage.
- Outputs: stable manifest with rendered sample paths + rendered failure classes.

**Must do now:** this is the first production-grade pass.

### Phase 1 â€” Decision authority normalization
Make one executable owner over the canonical edited timeline.

- Primary owner: one planner that ranks all candidates.
- Path E and Path D no longer treated as separate creative principals.
- Decision authority metadata must report true owner and reason.

### Phase 2 â€” Family-agnostic candidate normalizer
Convert raw signal payloads into normalized family candidates:

- family
- job
- timing anchor
- evidence strength / risk
- signal source completeness (word/cut/transition boundary/evidence)
- timing confidence / completion confidence

No threshold filtering by conflating â€œimportanceâ€ with â€œconfidenceâ€ pre-normalization.

### Phase 3 â€” Caption planner
From whole-track to moment-scoped groups:

- active caption group windows
- line breaks and phrase boundaries
- word emphasis windows
- readability/read-speed safety
- caption-zone coordination with other overlays

### Phase 4 - Visual perception and visual cut intelligence
Add a VLM/perception layer after V-JEPA + transcript/audio analysis and before the Director/planner. This is perception, not decision authority.

Current implementation note (code-verified 2026-07-03): the first P4 slice exists. video-analysis/route.ts runs a pre-cut V-JEPA pass, calls refineCutPlanWithVisualIntelligence, replaces the raw silenceRemovalPlan, persists intelligence.visualCutIntelligence, and then the existing silence-removal executor applies that refined plan. This covers V-JEPA-based visual protection, visual dead-air removal, visual-boundary split actions, and a persisted visualCutIntelligence.perception summary for downstream planners (primary visual mode, subject/text/motion ratios, negative-space preference, placement trust, explainability, and missing evidence). Later 2026-07-03 slices project that perception summary through SignalTimeline global signals, prove UnifiedMomentContext carries those keys into planner context, preserve them as primitive AtomicMomentBundle atoms, let trusted perception provide shared screen-context fallback evidence when direct per-frame primitives are missing, and export the selected negative-space region into the existing `negative_space_*` signal-map keys. Direct primitives remain authoritative, and degraded perception trust does not invent placement. It does not complete the full semantic VLM layer, calibration, real rendered proof, or family-specific rendered placement proof of those perception facts.

Inputs:
- V-JEPA dense primitives and coverage/degraded-mode policy
- selected shot windows, not every frame
- transcript, audio energy, music/beat context

Forced structured output:
- subjects and subject presence/absence
- location/shot type: talking-head, b-roll, screen-share, product demo, chart, etc.
- actions/events and visible state changes
- OCR/on-screen text and whether the video already explains the fact visually
- composition, negative space, screen clutter, salience
- visual dead air, failed setup, repeated frames, focus/exposure issues
- visually important silent moments that should be protected

Cut-planning use:
- shorten or remove visually weak footage even when transcript/audio is acceptable
- preserve visually meaningful silent or low-speech footage
- split long clips on visual state changes, product/screen changes, subject absence/re-entry, or continuity breaks
- protect raw-to-cut provenance so overlays, V-JEPA, and later decisions can map back to source footage

Overlay use:
- placement and density decisions
- MG visual explainability
- zoom focal anchors
- transition direction/continuity
- caption pressure and avoid regions

Hard rule: the VLM does not choose edits or overlays. It emits structured perception facts. Native deterministic planners decide cuts and overlays.

### Phase 5 - Zoom + visual-motion planner
Decision job: boundary/moment-specific zoom intent.

- Inputs: subject bbox, motion vector, shot scale, recent zoom memory.
- Output: entrance/hold timing, direction, cadence, restraint.
- Avoid over-repeating in recent memory window.

### Phase 6 - Transition planner (boundary-driven)
Decision job: transitions are chosen from boundary and context jobs.

Boundary atoms:
- topic shift
- visual motion pre/post
- beat/energy delta
- speech pause / continuity
- emotional jump

Output:
- visibility target (invisible / impact / reset)
- frame continuity shape
- duration, curve, direction
- timing anchors for SFX/zoom alignment

### Phase 7 - SFX planner
Decision job: where SFX helps vs hurts.

- Role/timing policy and rejection telemetry:
  - impact, whoosh, riser, tick, spill, transition tail, etc.
- Provider quality score, cache score, and no-asset fallback reason.
- If no qualified match, do **nothing**.

### Phase 8 - MG semantic + fact enrichment
MGs remain fact-driven and fidelity-first.

- Keep `content -> structure -> relations -> candidate set`.
- Expand semantic facts conservatively (bounded comparison, valence, negation/proof chains, lists, contrast, process).
- Candidate set comes from lawful facts, not templates.

### Phase 9 - MG expression authority (expand beyond 3 dials)
Current authority only adjusts typography/scale/avoidance.

Expand to include:
- stage mode selection
- family permission gating
- valence/tonal direction
- per-word emphasis policy
- choreography/memory interaction
- read-time + density cost
- flatness veto
- collision/cross-overlay arbitration

Animation-layer constraint from the 2026-06-21 brief:
- **Do not rebuild** the MG motion/choreography/easing engine. It already exists in
  `choreography-computer.ts`, `primitive-renderers.ts`, `composition-renderer.tsx`,
  `gsap-easing.ts`, and `motion-theme-resolver.ts`.
- The animation issue is starvation, not a missing engine: form-breadth and element richness
  must improve first so the existing engine has more than one card/text atom to animate.
- Sequence after P1-P6 and MG form-breadth:
  1. make `enterOrder` signal-driven instead of role-static,
  2. add the two small primitive wins: `@remotion/paths` draw-on strokes and gradient shimmer,
  3. wire beat-sync end-to-end,
  4. calibrate only after rendered proof.

**Empirical confirmation + refinement (2026-06-26, proj_GNctpvqAdXCC — 6 MGs read from the DB; full detail in memory `editron-mg-monotony-personality-globals`).** The "starvation" hypothesis is confirmed AND sharper than "not enough atoms to animate":
- Each MG overlay's `contentSignals` carries a **BYTE-IDENTICAL `personality.*` block across all 6 MGs** (enthusiasm 0.917916470588235, warmth 0.1747058823529417, pacing 0.748691088609226, formality 0.7, humor 0.385991568627451…) — a video-global bag stamped on every moment.
- That frozen block **dominates** the resolved tokens: `entrancePattern=fade` on ALL 6, `sizeScale=1.093884787087912` and `surfaceOpacity=0.7963308722527472` identical to 15 decimals ×6, temperature/alignment/easings identical. Only `staggerMs` (49–76), `entranceDurationMs` (447 vs ~319, from the single binary `speech_energy` 0↔0.77), and `overshoot` move.
- **KEY REFINEMENT:** per-moment signals DO vary per MG (speech_energy, pitch_variability, music_section, narrative_pressure 0→0.6, motion_intensity) — they are just **wired to marginal tokens** (stagger ms, overshoot) while the *visible* tokens (entrancePattern, sizeScale, temperature, density) are bound to the frozen personality. So Phase 9 step #1 ("`enterOrder` signal-driven") is necessary but **not sufficient** — the bigger lever is **rebinding the dominant tokens** (entrancePattern / sizeScale / temperature / density) to the per-moment + narrative signals that already vary, in `motion-theme-resolver.ts:resolveAnimation` (today `energy`/`formalityNorm` come from the frozen launch signals).
- **Bonus bug to fix alongside:** `formality` has 3 different values across subsystems — `genreParameters=0.2`, `genreParametersSignalComputed=0.4`, MG `contentSignals=0.7` (provenance conflict).
- Brand narrative is not consumed here at all (no brand fired this run; `editron_tech_inventory.md:95-97` flags `narrativeArc`/`graphicsDensity` "extracted but not consumed").

**★ FIX PROGRESS (2026-06-26).** The animation half already landed (`resolveAnimation`'s `momentKinetics` drives entrancePattern/overshoot/stagger/duration — VERIFIED varying on the 6 real signal sets; proj_GNctpvqAdXCC predates it). **sizeScale REBOUND `4acb71f2`** (`resolveMomentEmphasis`, graph-grounded by `cinematic_moment_emphasis`; VERIFIED sizeScale now spans 1.07-1.17 across the 6 MGs, was 1.0939×6). `density`/`holdDuration` already per-moment; `temperature`/`surfaceOpacity` left brand-stable by design. STILL OPEN: entrancePattern 5/6-fade (`formalityNorm>0.7→fade`, rooted in the formality-provenance conflict §15.3); `enterOrder` role-static (property-resolver.ts:114); beat-sync built-but-unwired.

- Scope is **Tier A only**: data/type motion, stats, comparisons, quotes, kinetic typography,
  lower-thirds, wires, and primitives. Tier B illustrative concept scenes need a separate
  asset-driven pipeline and are out of this plan.

### Phase 10 - Stage-aware composition
Full-frame/split/device/interstitial modes must survive beyond metadata:

- caption-aware coordination must negotiate, not auto-fallback to corner card.
- side-safe/caption-safe is a mode, not default override.

### Phase 11 - Family-specific hardening (atoms and forms)
Add remaining families only with licensed facts:

- MG: number hero, comparison, quote/proof, refutation, process, social proof, speaker identity where evidence exists.
- Image/media/avatar/logo/shape/sticker/HTML scene/speed/fade/camera-shake families:
  position/anchor/region/duration/entry-exit/constraints/timing/mode.

### Phase 12 - Gate teeth
Move key issue checks from observe to enforce for production:

- overlay overlap / blank / unreadable / collision / drift / excessive repetition / timing miss.
- rendered evidence required for â€œgood enoughâ€.
- failure taxonomy must keep overlay IDs + frame ranges + artifact links.

### Phase 13 - Cross-overlay choreography
One timeline memory for all families:

- MG, caption, zoom, transition, SFX, and motion density.
- Avoid repeated pattern fatigue.
- Avoid unsafe stacking.
- Phase 0 must expose scheduler suppressions/sync groups from `crossOverlayChoreography` so bad renders explain whether the conflict was text-lane, motion-lane, audio-link, or overfull-moment pressure.

### Phase 14 - Bandit / learning quarantine and failure routing
Keep learning off weak quality paths:

- failed rendered project quality must not write normal policy updates.
- diagnostic lane may record failures separately for offline fixes.

### Phase 15 - Calibration (strictly after phase 0-14)

- human-labeled rendered corpus (holdout included)
- tuned only after gate and planners are production-usable
- store tuned parameters in a central registry

### Phase 16+ - Rollout + per-brand learning
- user edits and preferences become long-term brand/taste priors
- override signals, not new presets.

---

## 4) What this supersedes / replaced

All earlier docs are still valid references but this file is the integration target:

- Northstar (6/14): high-level direction + anti-MVP constraints.
- Atomic overlay plan (6/7): atomic overlay architecture and phase sequence.
- MG final build (6/18): fact/scene/atom priorities for MG.
- Pipeline audits (6/20): exact control-flow and bottleneck evidence.
- Defect registry (6/20): confirmed blockers and false-positive closeouts.
- MG handoff/Calibration-readiness docs: why we pause tuning and build structure first.

If any prior doc says â€œfully doneâ€, it should be treated as *historical status* and reconciled here.

---

## 5) Current defect surface (authoritative list by priority)

### P0 (ship safety)
1. Bad quality can still pass (rendered truth not hard blocker).

### P1 (quality/consistency)
2. MG form is shape-fact-only + narrow candidate breadth.
3. Signal candidates drop via thresholds and first-wins dedupe before form can be considered.
4. Merge still under-advances Path D candidates.
5. Live reward/learning weak-score writes are gated at `recordProjectOutcome`; remaining risk is calibration quality because rendered evidence is not yet the hard truth loop.
6. Creative Brief-only upload-to-edit bundles can still bypass strict family atom licensing when no signal producer is present.
7. Auto-BGM source-music detection is too weak: `musicBpm > 0` can classify speech rhythm as existing BGM, blocking BGM dispatch and suppressing `missing_bgm`.

### P2/P3 (stability and polish)
6. Full-frame contract can downgrade into corner treatment via caption coordination.
7. Render curves can synthesize BPM-derived beats when `bpm` reaches the overlay, but beat data
   and `syncData` are not yet threaded reliably into MG render/choreography, and audio-reactive
   modulation is hold-phase only.
9. Visual cut intelligence is now part of pre-cut planning through V-JEPA refinement, but it is not yet the full semantic VLM perception layer and still needs calibration, real-project proof, and downstream overlay use.

---

## 6) Concrete completion criteria by phase

For each phase, this is what â€œdoneâ€ means (strictly):

- **Phase 0**: every real project sample writes manifest + render clips/stills + failure classes + non-empty evidence links.
- **Phase 1**: no real run reports `decisionAuthority` as legacy source when normalized signal candidates exist and are valid.
- **Phase 2**: no pathway uses hardcoded floor as proxy for meaning; rejected candidates retain machine-readable reasons.
- **Phase 3**: captions are grouped per moment with readability guardrails and zone-aware collision checks.
- **Phase 4**: visual perception facts can influence cut keep/remove/shorten/split decisions and overlay placement without becoming decision authority.
- **Phase 5**: zooms differ meaningfully across emotionally similar moments based on scene-memory; no memory collisions.
- **Phase 6**: transitions carry boundary job type and not just canned names; repeated forms avoided by reason.
- **Phase 7**: SFX mostly optional and never random; every placement has score + reason + provider status.
- **Phase 8**: MG can emit multiple valid visual families where facts justify it.
- **Phase 9**: `mg-expression-authority` influences stage/family/choreography, not only 3 dials;
  `enterOrder` changes by moment signals; `@remotion/paths` draw-on and gradient shimmer render;
  beat-sync proves an MG accent can land on a downbeat without rebuilding the motion engine.
- **Phase 10**: full-frame intent does not auto-collapse to top-right due to caption flag alone.
- **Phase 11**: new families have tests, feature guards, and failure reason logs.
- **Phase 12**: critical visual failures block or downgrade output path; gates are enforce mode, not observe.
- **Phase 13**: cross-overlay contradictions are reduced by timeline memory.
- **Phase 14**: no critical-quality project normalizes as learning success.
- **Phase 15**: calibrated runs improve held-out quality; no overfit single-creator drift.
---

## 7) Required test plan (production level, not MVP)

### Must-pass before any production claim

1. `npx vitest` focused suites for:
   - unified decision authority (`director-unified-decision-bundle` tests)
   - transition / zoom / caption / SFX planner behavior and boundary conditions
   - MG semantic/contract and expression authority
   - rendered gate and artifact classifier
   - learning block tests for failed renders
2. `npx eslint . --quiet`
3. `npx tsc --noEmit --pretty false`

### New/adjusted hard acceptance checks

- Repro fixture for selected projects (ex: previously failing / sparse output cases) reruns
  and records:
  - overlay counts by family
  - authority owner
  - timing anchors
  - rendered quality classes
- Any phase marked â€œdoneâ€ must show before/after manifest improvements on at least one real upload-to-edit project.

---

## 8) File map (execution-owned)

- Director + timeline:
  - `lib/editron/agent/director-agent.ts`
  - `lib/editron/services/edited-timeline-context.ts`
- Visual perception and cut intelligence:
  - `lib/editron/services/vjepa-coverage-audit.ts`
  - `lib/editron/services/visual-evidence-scorer.ts`
  - `lib/editron/services/visual-cut-intelligence.ts`
  - `app/api/internal/workers/video-analysis/route.ts` Step 1.58 pre-cut V-JEPA refinement
  - planned semantic VLM/per-shot perception service
  - transcript/audio/visual cut planning integration before Director/edited timeline flow
- Bundle + authority:
  - `lib/editron/services/unified-decision-bundle.ts`
  - `lib/editron/services/signal-executor.ts`
- EDL and overlay placement:
  - `lib/editron/services/edl-executor.ts`
  - `lib/editron/services/decision-timeline.ts`
  - `lib/editron/services/decision-budget.ts`
- Caption/zoom/transition/SFX:
  - `lib/editron/services/caption-form.ts`
  - `lib/editron/services/zoom-form.ts`
  - `lib/editron/services/transition-form.ts`
  - `lib/editron/services/sfx-form.ts`
  - `lib/editron/services/signal-registry.ts`
- MG:
  - `lib/editron/services/mg-expression-authority.ts`
  - `lib/editron/motion-graphics/engine/content-shape-analyzer.ts`
  - `lib/editron/motion-graphics/engine/encoding-wires.ts`
  - `lib/editron/motion-graphics/engine/semantic-mg-candidates.ts`
  - `lib/editron/motion-graphics/engine/composition-planner.ts`
  - `components/editron/editor/version-7.0.0/components/overlays/motion-graphic/motion-graphic-layer-content.tsx`
- Gate/aesthetic evidence + scripts:
  - `lib/editron/services/structural-gate.ts`
  - `lib/editron/services/quality-review-service.ts`
  - `lib/editron/services/vjepa-coverage-audit.ts`
  - `scripts/render-editron-aesthetic.ts`
  - `scripts/render-mg-stills.ts`
  - `scripts/render-mg-motion.ts`
  - `tests/editron/*`

---

## 9) Working rules for the next coding run

1. First run: truth, then authority, then family form logic.
2. No claims in code comments or PRs that Path E + Path D are fully merged until the final producer ownership is proven.
3. No new presets, no menu labels, no renderer-key-as-authority rewrites.
4. Keep all threshold values sourced in a registry and flagged if invented.
5. Every structural change must include a failure reason and rendered evidence.
6. For MG animation work, do not add a new choreography/spring/easing engine. Wire richer forms,
   signal-driven ordering, `@remotion/paths`, and beat-sync into the existing engine.

---

## 10) Why this is the final plan

Because the highest-impact issue is not â€œlack of signals,â€
it is **lack of production-grade authority + rendered evidence**.

- Signals exist.
- The composition stack is mostly present.
- MG can render richer scenes.
- But output repeats because decision gating is too strict, authority is partially fragmented,
  and quality pass/fail is not hard or visual-first.

This plan resolves that in order:

1) visible truth, 2) one owner, 3) richer family-aware form, 4) hard gate, 5) calibrated tuning on holdout.

That is how we avoid building â€œfancier cardsâ€ and move to premium AutoAE-style craftsmanship.

---

## 11) Reference-Driven & Generative Workstream — 2026-06-24

Full strategy: `Editron-Reference-Driven-Generative-Strategy-2026-06-24.md`. This EXTENDS existing phases
(4 perception, 7 SFX, 8 semantic, 9 expression, 13 choreography) — it does not replace them.

### 11.0 MG-state correction (record accuracy)
"MGs are word-boxes" is STALE (June-3). Phases 8-9 landed real work (June 17-22: semantic candidate ledger
grounds MG text in facts; `mg-expression-authority.ts` maps signals/semantics -> tier/layout/typography/motion;
quote-proof + refutation + concept scene atoms varied by semantic facts). Output is materially richer. STILL
open: the deepest generative form -- `detectShapes` (`content-shape-analyzer.ts:248`) still selects shape-KIND
by structure, not free primitive composition (Rule 11). So reference-copy (below) aims a much better engine
than "word-boxes," but the Rule-11 frontier (dissolve the shape menu) remains the long game.

### 11.1 The reframe -- reference replaces profile
Profiles are dead. Ask the user FORMAT + EXPECTATION + REFERENCE. Reference -> visual-language TOKENS (a VLM,
extending Phase 4 perception pointed at the reference) -> drives the form/expression engine (Phases 8-9). NOT
reference -> template (Rule 11 trap). This also REMOVES the Tier-B frontier (autonomous concept->metaphor):
the human supplies creative direction; we copy/adapt + render. New build = the reference-video -> token
extractor. WIRE it into generation (see 11.5).

### 11.2 "Delivery" clarified -- the EDIT's output feel (NOT on-camera performance)
The video's delivery = pacing, cut rhythm, music sync, transition/MG timing, overall polished feel. This is
OUR craft: Phases 4 (cut intelligence), 5 (zoom/motion), 6 (transitions), 13 (cross-overlay choreography) +
beat-frame sync (Phase 11). Handleable + improvable, and the REFERENCE sets the target rhythm/pacing tokens.
The ONLY un-automatable moat is the on-camera PERFORMANCE (real footage = the user; generated = avatar,
limited). So with footage + a reference we CAN deliver a well-paced cut.

### 11.3 SFX -- full system (extends Phase 7; founder: "not lazy")
Root cause today (audit): single Freesound provider + selection by FILENAME string-match + most SFX killed
before search (only transitions request them). The full system:
- **a) Taxonomy (event -> SFX).** EVERY overlay family AND every cut-type emits an SFX request:
  cut-types (hard/match/jump/J/L/whip/zoom-cut -> whoosh/swoosh/impact/glitch/riser); overlay-appears
  (caption tick/pop/type, MG build whoosh-in/shimmer/mechanical, stat-count tick-up/ding/cash-register,
  zoom-punch impact/bass-thud, highlight ding/sparkle, lower-third whoosh+click, logo/outro stinger/swell);
  emotional beats (tension riser, comedic boing/record-scratch, dramatic boom, success chime, error buzz);
  ambient/foley (room tone, keyboard, paper).
- **b) Per-clip metadata schema** (selection by sound, not filename): `{eventTypes[], energy, durationMs,
  brightness, layerRole: riser|impact|oneshot|loop, trendTag, brandFit}`.
- **c) Library "in bunches"** -- many per event-type (a few hundred clips), curated royalty-free + a TRENDY
  set. `public/sfx/<category>/` + `manifest.json` to the schema. Refreshable.
- **d) Trend-refresh** -- pipeline to pull + tag currently-trending SFX (the "vine boom"-class) reusing the
  trends infra with a sound source; SFX trends move fast, keep it current.
- **e) Selection engine** -- given a moment (eventType + energy + brand/reference tokens), best multi-factor
  match. Replaces the title-match wall in `sfx-form.ts`.
- **f) Sync + build** -- anchor to the exact event frame; 2-part builds (riser leads INTO the cut -> impact
  lands ON it). Extend `transition-sfx-placer` to ALL event types.
- **g) Layer + duck + density** -- duck music under SFX, layer riser+impact, cap density (no spam).
- **h) Brand/reference palette** -- the reference/brand sets SFX style (punchy-meme vs subtle-premium) via tokens.

### 11.4 Generated shoot
Avatar (image+audio->talking head) + gen-video image->video (BUILT: `video-generation-service.ts`, fal
Kling/Runway/Kie) + **video+text->video** (Luma Ray3 Modify / Runway Gen-4.5 / motion-transfer -- add adapters
to `VIDEO_MODEL_REGISTRY`). Explicit per-model credit-cost + quality selection surfaced to the user. Honest:
look-not-virality; concept stays human; generated = good-not-perfect, costs per clip.
**B-roll & clip sourcing** (editors' "b-rolls = clips"): provider module like `lib/calos/trends/` returning a
`license` status per clip — `cleared` (Pexels/Pixabay/stock, DEFAULT, safe for client delivery) / `attribution`
/ `copyrighted` (YouTube/found, OPT-IN). UI flags non-cleared with the yellow-bell (informed consent, NOT a
license — Content ID + client liability still apply). "Someone saying X" reusable = avatar-gen, not clip-reuse.
Full design in the strategy doc.

### 11.5 Brand-vault wiring (verified gap)
Editron FEEDS the vault (`editron-brand-learning-events`), DRAWS the thin UnifiedBrand (colors/fonts -> MG
tokens, `edl-executor.ts:529`), but does NOT draw the rich `BrandSignalProfile` (`getLatestAcceptedProfile`
= 0 Editron callers -> island). When reference-tokens land, wire them into generation -- do not repeat the
build-but-never-wire mistake. Vault classifies reference uploads but does not extract edit-style from a
reference VIDEO (that extractor is new, 11.1).

### 11.6 Codex role
Codex EXECUTES bounded phases FROM this plan via tight, reference-heavy briefs (cf. the P1-P6 brief).
It does NOT own the plan -- without a tight spec it over-builds and wanders. Founder + Claude shape; codex implements one verified phase at a time.

---

## 12) 2026-06-24 Session Status & Deltas

All work below is on branch `infrastructure-improvs-+Editron` (86+ commits ahead of `origin/main`). **Prod = main;
preview deploys from the branch → testable on PREVIEW with no merge.** Merge→main is for production only.

### 12.1 Render thread — SHIPPED this session (commits)
- `713a0b78` composition-id centralized (`REMOTION_COMPOSITION_ID`).
- `ebe02a55` chapter-split threshold 3min→15min (single-render handles long videos again).
- `10afdf98` multi-chapter **fail-loud** guard (no more silent truncation).
- `b0e70ef1` + `455ddf5b` chapter **concat**: Modal ffmpeg worker built + wired (chapter-renderer→QStash→worker→Modal).
- `77f7f905` render-button immediate feedback.
- `81bb39b3` **the "delayRender not cleared after 598000ms" fix** — prod render calls never set `isRendering:true`,
  so the composition used `<Video>` (Html5Video, browser) which hangs on a large/slow-proxied clip instead of
  OffthreadVideo (ffmpeg). Now set in both render inputProps (`cloudrun/render` + `chapter-renderer`).

### 12.2 Deploy / config state (verified)
- **Modal concat worker LIVE** (`jainnimit728--editron-chapter-concat-concat.modal.run`) + secret + smoke-tested (401/400/502).
- **Vercel env** `REMOTION_LAMBDA_FUNCTION_NAME` → `…mem3008mb-disk4096mb-900sec` + `EDITRON_CHAPTER_CONCAT_*` set on
  **Production** AND **Preview (`infrastructure-improvs-+Editron`)**. Development scope still old (local uses `.env.local`).
  CLI gotcha: preview env add needs `vercel env add NAME preview <branch> --value <v> --yes` (the all-branches `--yes`
  path returns `git_branch_required`).
- **⚠️ Serve-bundle (the Remotion render "site", separate from Vercel):** deployed sites = `editron-prod` (2026-04-06),
  `editron` (Jan), `editron-dev` (Jan). `editron-prod` (Apr 6) **postdates** the OffthreadVideo (`95b57872`, Mar 24) +
  `isRendering` plumbing (`6cdb400a`, Mar 21) → it HAS the render fix. BUT it is **months stale for composition changes
  since April** (MG Phases 8-9, etc.). **TODO: confirm which site each scope's `REMOTION_LAMBDA_SERVE_URL` points to; the
  render only reflects composition code that's in the deployed site — redeploy via `remotion lambda sites create` to ship
  post-April composition work.**
  **RESOLVED (`49ee7886`, 2026-06-24):** root cause = `remotion.config.ts` had **no `@/` webpack alias**, so a
  `@/lib/...` composition import broke EVERY `lambda sites create` since ~April (silently) → frozen bundle. Alias added
  → `editron-dev` **redeployed fresh** from current code + preview `REMOTION_LAMBDA_SERVE_URL` (branch-scoped) repointed
  to it → **preview now renders the latest composition.** `editron-prod` (production) untouched/stable; on merge run
  `npm run deploy:remotion:prod` (now works) to refresh prod.

### 12.3 MG-state correction
NOT "word-boxes" anymore — Phases 8-9 landed (semantic candidate ledger + `mg-expression-authority.ts` + atoms varied by
semantic facts, commits Jun17-22). Only the deepest Rule-11 generative form (`detectShapes` shape-menu) remains.

### 12.4 What's left (3 buckets)
1. **Render closeout:** the delayRender fix is in; remaining = (a) ensure the SERVE_URL points to a current site / redeploy
   it, (b) prove concat on a real >15-min render.
2. **Master plan Phases 0-16 — mostly REMAINING** (codex executes): the rendered-truth gate (Phase 0/12, the plan's own
   #1 P0), authority/Path E-D unification (Phase 1), visual perception (Phase 4), SFX system (Phase 7 = §11.3), calibration (15).
3. **Workstream 11 builds (all unbuilt):** reference→token extractor, route trends into Editron, deep SFX, Tier B Stage 3+4,
   gen-shoot (avatar + video+text→video), b-roll providers + copyright flag, brand-vault rich wiring.

## 13) Points of Entry + AI Video Gen Studio (VISION — 2026-06-25, NEEDS REVIEW BEFORE BUILD)

Founder brain-dump, captured verbatim-in-intent. **NOT YET REVIEWED / NOT PLANNED.** Flagged for `/office-hours`
(is-this-worth-building, find the wedge) **and** `/plan-ceo-review` (10-star, scope) in a DEDICATED session,
**after** the current internals (Phases 0-15) are sorted. Do NOT start building before that review.

### 13.1 Entry points (today Editron is ThinkForge→Editron ONLY)
Editron has **no "upload a script" path** today. Need first-class entry modes, each with its own normalization:
- **ThinkForge → Editron** (existing handoff).
- **Upload a SCRIPT** → factor/normalize it the way ThinkForge would build a script, or straight to Editron's
  expected script contract. (The **script contract** is the keystone — define exactly what shape Editron expects.)
- **Upload-to-edit** (video + script).
- **AI-video-gen-only.**
- **Hybrid** (gen + uploaded).
- **Avatar-based.**
Plan these points of entry THOROUGHLY once the internals are sorted.

### 13.2 AI video gen — its own page/functionality
- A dedicated **AI-video-gen surface** (new page, gen-on-its-own).
- **Preset prompts** (e.g. Higgsfield format) — sourced from open-source Higgsfield and/or prompt-database
  sites that supply specific prompts + how/where to use them.
- Goal: **"all Higgsfield functionalities"** — product shoots, etc.

### 13.3 Dynamic stencil (Editron AND Clickatron)
- Let the user set a **stencil** of how the video/image should look — a hand-drawn, pencil-style sketch of the
  desired composition/shot — as a dynamic alternative/complement to text prompts. Applies to video (Editron) and image (Clickatron).

### 13.4 Status
VISION ONLY. Sequence: sort internals → `/office-hours` + `/plan-ceo-review` on a fleshed-out version → then plan the build.

## 14) 2026-06-25 Session — fixes shipped + open items

### 14.1 Shipped (branch `infrastructure-improvs-+Editron`, preview)
- Director timeout `maxDuration 300→800` (`6ec10708`).
- No-graphics regression: brief timestamps remapped to the cut timeline (`4fbfaf5b`).
- Caption flicker: hold the last word through inter-word gaps (`8b9e7d1d`).
- Full-frame MG scrim `0.86→0.3` (`8b9e7d1d`) — largely superseded by the stage-mode fix below.
- **Blank video — TWO layers, both fixed:** (a) **proxy seek** — the client compressor now forces **1s keyframes**
  (`9f35513d`; was libx264 default ~250-frame GOP = ~10.4s @ 23.98fps → seek-to-black; CONFIRMED 1s on a fresh upload);
  (b) **full-frame-graphic-scene MG chrome blacked out the footage** — identity/section MGs now `overlay-on-footage`
  (`d808fccc`). BOTH apply to NEW uploads/director runs → **re-run a project to verify** (stageMode/proxy are baked).

### 14.2 Open (NOT fixed)
- **Zoom/transition OVERLAP + lag** (a transition fires inside an MG span; 57-frame snap drift) = **Phase 13
  cross-overlay choreography, UNBUILT** (per-family silos, no shared timeline memory).
- **brandId** → Editron resolves the **legacy** brand (`BRAND_VAULT_SOURCE_EDITRON` off); scan-accept brands live
  only in the rich vault → near-zero brand effect = the **brand-vault-island** gap (rich vault has no generation reader).
- `resolveDirectorCompletionHealth` non-route export (tsc noise) — chipped (task `task_4993b493`).

### 14.3 Phase status — see `Phase-Status-Audit-2026-06-25.md` (code-level, corrects §12.4's stale "mostly REMAINING")
DONE+wired: **1** (genuine unified ranking, not a relabel), **5, 6, 8, 14**. PARTIAL: **2, 3, 7, 9, 10, 11, 15**.
Built-but-DORMANT: **0** (rendered-truth, zero live callers), **12** (visual gates toothless). NOT BUILT: **4** (visual
perception), **13** (cross-overlay choreography), **Rule-11 generative form**. The missing half = evidence/perception/form.

## 15) 2026-06-26 Run Audit — non-MG findings (proj_GNctpvqAdXCC, /investigate)

Code-level investigation of one real auto-edit's log (2010 rows) for everything BEYOND the MG monotony (that is the §9 note + memory `editron-mg-monotony-personality-globals`). The run SUCCEEDED (status 200, video edited) but surfaced the below. Full detail in memory `editron-run-audit-nonmg-2026-06-26`. Analysis only — nothing fixed. 3 parallel subagents + own verification of the P1 file:line.

### 15.1 P1 — real, fix-worthy
1. **AI-artifact logic treats REAL footage as AI-gen.** `getAiArtifactRiskAt` (`signal-registry.ts:842`) zeroes artifact risk ONLY when `analysisQuality === 'high'`; real uploads whose Gemini analysis came back medium/low/fallback get fake "AI degradation" risk ramped after 70% of each clip → fires `mapping:visual.ai_artifact_prevention` → forces hard-cuts → kills would-be transitions. Conflates low analysis confidence with AI-generation. **Ties to §13 points-of-entry** (the system must KNOW real-upload vs AI-gen, not infer it from quality). Fix: gate on an explicit source / `isAiGenerated` flag.
2. **Dead Gemini embedding model.** `text-embedding-004` is 404 (Google retired it), hardcoded in 5 sites (`asset-search-service.ts:204`, `graph-service.ts:874`, `app/api/internal/workers/asset-analysis/route.ts:175`, `app/api/services/editron/media/search/route.ts:87`, `app/api/internal/workers/graphiti-episode/route.py:62`). Fail-soft but = 100% silent failure of semantic media search AND Neo4j graph enrichment (asset-analysis:207 gates the graph-sync dispatch on `if (embedding)`). Fix: → `gemini-embedding-001` (verify name, keep 768-dim for index compat), centralize the constant.
3. **THREE quality gates all toothless** (reinforces Phase 12). Structural MG gate observe-only (`structural-gate.ts:22-25` "OBSERVE MODE... pass is LOGGED, never acted on"; overlay pushed unconditionally → a 29/100 graphic shipped); aesthetic gate (the no-key auto-pass just fixed in Phase 0); constraint enforcer count-only (`constraint-enforcer.ts:97` — 1484 uncorrectable violations never drop the decision). The system MEASURES bad output and ships it anyway. **★ SHIPPED 2026-06-26 (`936e506f`): the STRUCTURAL gate now ENFORCES** — drops score<60 graphics at `edl-executor.ts:3584`; evidence = a Rule-29 observe-sweep over 302 real current MGs (1/302 would-suppress, that 1 a genuine fail = FP≈0); `MG_STRUCTURAL_GATE=observe` reverts. Aesthetic gate (Phase 0 Step B, briefed/needs Lambda) + constraint enforcer (count-only) still toothless.
4. **Path-D over-production.** Director 3581 mappings → 1425 decisions (8080 suppressed) → 2326 violations (1484 uncorrectable). Path E (37 decisions → 22 violations) is healthy by comparison. The signal path over-generates → floods the constraints + monotony. Fix: throttle Path-D generation upstream, not just deduct score downstream.

### 15.2 P2 — cleanup / infra / log-integrity
5. **Recurring Mongo timeout** — 8× `[Instrumentation] Brand events indexes failed: MongoServerSelectionError ... timed out after 5000ms` (+1 socket timeout 132s). Separate infra/connectivity ticket.
6. **Transition skip log LIES** (`edl-executor.ts:776`) — echoes the decision's upstream `reason` (the gen-video "AI models maintain quality 3-4s" string from `mapping.details.why`) instead of the real skip cause. Most of the "101 returned null" are hard-cuts correctly producing no tile (`edl-executor.ts:2365`), NOT killed transitions.
7. **Stale drift log + the real misalignment** (`edl-executor.ts:2375` says "no boundary within 45 frames"; real window is 120, `:120-122`). Underlying Director↔EDL frame-reference misalignment (median 36-frame drift, up to 110) = **the root of the §14.2 overlap/lag symptom** (relates to Phase 13).
8. **Clerk favicon log-noise** — `/dashboard/editron/project/favicon.ico` hits the `[projectId]` dynamic route, matcher excludes `.ico`, `auth()` throws → caught in `getUserData`. Not user-facing.

### 15.3 P3 — minor / by-design
formality provenance conflict (`genreParameters=0.2` / `genreParametersSignalComputed=0.4` / MG `contentSignals=0.7`); CreativeBrief "3 semantic-context decisions missing semanticAtoms"; KEYWORD FILTER suppressed 3 keyword MGs (intentional — captions carry emphasis).

### 15.4 Cross-cutting themes
(A) **real-vs-AI-gen confusion** (#1) → architectural, §13. (B) **gates observe, never enforce** (#3) → Phase 0/12. (C) **log integrity** (#6, #7) — logs mislead and cost debug time. (D) **over-production** (#4) → Path-D + the MG flood.

## 16) Signal-Provenance Audit (2026-06-26) — same concept, different values across subsystems

Triggered by the formality conflict (§15.3). Dedicated investigation (subagent + verification on the 6 real signal sets).

### 16.1 FORMALITY — ✅ FIXED + VERIFIED (`fb05499a`)
Root = a **SCALE bug**, not a value bug. Every producer emits formality on **0..1** (`computeFormality` clamp(f,0,1) @`genre-parameter-computer.ts:358`; `estimateFormality` buckets @`signal-registry.ts:1110`), but the MG resolver did `(s.formality+1)/2` assuming -1..+1 (the type contract @`motion-theme-resolver.ts:25` wrongly said so) → a real 0.7 became formalityNorm 0.85 → tripped `formalityNorm>0.7→fade` on ~all content. Fixed: 5 sites → `clamp(s.formality,0,1)` + contract. VERIFIED: entrancePattern flips **fade×5 → slide-up×5**. The three stored values explained: `genreParameters.formality=0.2` (post-bandit, `video-analysis/route.ts:317`), `genreParametersSignalComputed.formality=0.4` (pre-bandit snapshot, `:281`), `contentSignals.formality=0.7` (Director Path E re-computes from scratch, `director-agent.ts:722,875,899`). One underlying ~0.4, three transforms.

### 16.2 ARCHITECTURAL ROOT — `signalCtx` vs `personality.*` duplication (NOT fixed; needs a real run to verify)
Personality signals are derived TWICE: `signalCtx` (bare keys, `director-agent.ts:895-924`) and `personality.*` (namespaced, `signal-registry.ts:664-727`), near-identical formulas but DIFFERENT inputs. The resolver's fallback key-order prefers bare keys; the Path-D bridge (`director-agent.ts:1284-1291`) overwrites bare WITH `personality.*`. So **Path D and Path E feed the resolver different numbers for the same concept.** Confirmed:
- **pacing_velocity:** director 0.53 (V-JEPA segment motion) vs registry 0.75 (grid-frame motion) → energy/duration/stagger differ between paths.
- **emotional_arousal:** same formula, different segment source.
- **humor:** director HARDCODES `0.1` (`director-agent.ts:921`); registry computes a real blend (`:722-727`) → Path E MGs never get playful emphasis/`pop`.
- **warmth:** different face-coverage predicate (`eyeContact > 0.3` numeric @:891 vs `=== true` boolean @:683).
**FIX (single highest-leverage):** collapse to ONE source — delete the `signalCtx` block, have Director consume `personality.*` globals. CAVEAT: formality isn't in `personality.*` (no writer) → thread it separately. Director-signal-flow refactor; verify against a real run's decision log. Every formula in BOTH is self-labeled ⚠️ INVENTED — unifying removes the *conflict*, not the calibration debt.

### 16.3 Secondary (deferred)
Director Path E RE-RUNS `computeGenreParameters` from scratch (`director-agent.ts:722`) instead of reading the persisted `genreParameters`, so the genre-param bandit the user's runs learned (0.2) never reaches the MG (it sees the re-computed ~0.4). Director should read persisted genre params.

## 17) Fail-Loud Instrumentation (2026-06-26) — TEMPORARY, remove when stable

The 2026-06-26 session's code (10 commits) was audited for SILENT/SOFT failures (subagent over the commit diffs). Each high-value spot got a minimal `[FAILLOUD]` diagnostic log + a `// FAILLOUD-TEMP` comment (no behavior change) so a test run's logs surface any hidden failure. **★ TO-DO (do this when the editron pipeline is verified stable): `grep -rn "FAILLOUD" lib/ components/ app/` and delete every such log line + its `// FAILLOUD-TEMP` comment.** This is diagnostic scaffolding, NOT permanent.

### 17.1 Instances instrumented
1. **Brief-timestamp remap silent gap-drop** (`edited-timeline-context.ts`) — decisions whose original-time timestamp lands in a removed-silence gap are dropped (`return []`) BEFORE the executor's out-of-range tally → invisible; could delete most of a brief silently. Now logs the dropped count.
2. **Remap no-op on bad fps** (`edited-timeline-context.ts`) — `fps<=0` returned decisions untouched AND missed NaN (`NaN<=0` is false → NaN frames → drops everything). Now guards `!(fps>0)` + logs.
3. **Remap negative-timestamp passthrough** (`edited-timeline-context.ts`) — corrupt negative timestamps passed unmapped. Now logs.
4. **Caller no-clip path** (`director-agent.ts:~826`) — editedTimelineContext present but sourceClips empty → remap skipped silently → out-of-range drop downstream. Now logs (else branch).
5. **momentEmphasis missing-signal →0** (`motion-theme-resolver.ts resolveMomentEmphasis`) — absent cinematic/narrative/motion signals silently collapse sizeScale to baseline = re-freezes the monotony `4acb71f2` fixed. Now logs the missing signal.
6. **formality clamp NaN/out-of-range** (`motion-theme-resolver.ts:288`) — `clamp(NaN)=NaN` propagates silently into 5 token families; a legacy -1..+1 producer would be floored to 0. Highest fanout. Now logs a non-0..1 formality.
7. **Aesthetic-gate error/empty/schema** (`aesthetic-gate.ts`) — already loud about the FACT; enriched with the CAUSE (err.name + JSON-parse hint; finishReason/blockReason on empty; missing-`reasoning` schema-drift warn).

### 17.2 Documented soft-spots NOT instrumented (verify by QA/render, not logs)
- **Caption hold-last-word** (`caption-layer-content.tsx`) — if word timings are systematically wrong the hold masks it; but it's per-frame render code so a log would flood. Verify via visual QA.
- **Scrim opacity 0.3** (`composition-renderer.tsx:151`) + **full-frame→overlay** (`visual-explanation-contract.ts`) — magic-number / routing visual assumptions with no runtime trace; verify by render.
- **Structural-gate aggregate** — the per-MG `SUPPRESSED` log is already loud; a run-level drop count is just `grep -c` of that tag.
- **maxDuration 800 / proxy keyframes** — config/arg constants, no swallow path of their own.
