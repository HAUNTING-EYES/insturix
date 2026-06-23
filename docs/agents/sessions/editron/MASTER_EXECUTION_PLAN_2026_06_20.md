# Editron Master Production Plan (Consolidated, 2026-06-20)

Purpose: one durable, production-level plan that combines the Northstar plan, MG plan,
pipeline audit, and confirmed defect registry into a single source of truth.

This document is the **authoritative** operating plan for the next implementation cycle.
No one-off patches. No â€œPath E vs Path D mergeâ€ claims unless the control flow is
proven in code for producer â†’ authority â†’ final consumer.

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
| Visual cut intelligence | V-JEPA primitives exist, but visual perception is not yet a first-class cut-planning input | **Required next layer** |
| Calibration | Live bandit writes are now quarantined behind rendered/pass or explicit publish evidence (`4b48c8c3`); full rendered truth-loop calibration is still blocked | **Partially fixed / not production-ready** |

### Confirmed P0/P1/P2 findings (short)

- **P0:** No rendered-pixel hard truth loop; bad 0/100 edits can still pass flow.
- **P1:** MG candidate breadth is shallow (shape-bound), signal candidates are often suppressed at merge/cut floors, and gate checks are often observe-only.
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

### P2/P3 (stability and polish)
6. Full-frame contract can downgrade into corner treatment via caption coordination.
7. Render curves can synthesize BPM-derived beats when `bpm` reaches the overlay, but beat data
   and `syncData` are not yet threaded reliably into MG render/choreography, and audio-reactive
   modulation is hold-phase only.
9. Visual perception is not yet part of cut planning; transcript/silence can still dominate keep/remove/shorten decisions.

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
  - planned VLM/per-shot perception service
  - transcript/audio/visual cut planning integration point in Director/edited timeline flow
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
