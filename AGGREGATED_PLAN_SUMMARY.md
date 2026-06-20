# Editron Master Northstar Plan (Consolidated, 2026-06-20)

Status file: `D:\google downloads\Front-End-main\editron-worktree\AGGREGATED_PLAN_SUMMARY.md`

This is the single production-grade source of truth for Editron MG and upload-to-edit pipeline work after June 20.

This document folds in:

- `docs/agents/sessions/editron/Editron-Codex-Plan-Brief-2026-06-20.md`
- `docs/agents/sessions/editron/Editron-Confirmed-Defect-Registry-2026-06-20.md`
- `docs/agents/sessions/editron/Editron-Pipeline-Step-Audit-2026-06-20.md`
- `docs/agents/sessions/editron/Editron-Architecture-Verdict-and-Plan-2026-06-20.md`
- `docs/agents/sessions/editron/MG-Final-Build-Plan-2026-06-18.md`
- `docs/agents/sessions/editron/MG-Session-Port-Handoff-2026-06-18.md`
- `docs/agents/sessions/editron/MG-Calibration-Readiness-Findings-2026-06-18.md`
- `docs/service-wise-docs/Editron-Authority-Recovery-Plan-2026-06-18.md`
- `docs/agents/reference/editron/editron_atomic_overlay_final_plan_2026_06_07.md`
- `docs/agents/reference/editron/editron_mechanical_roadmap_2026_06_07.md`

The Codex Plan Brief contains founder decisions already made. They are encoded here as operating constraints, not reopened for debate.

## 0) Verified Load-Bearing Claims

Spot-checks performed before updating this plan:

| Claim | Verification |
|---|---|
| Path E graphic source cap is real | `lib/editron/services/creative-brief.ts:934` computes `graphic.max = ceil(graphic_density * durationMin)`. |
| Execution graphic breathing rule is real | `lib/editron/services/decision-budget.ts:209` checks graphic spacing against `lastGraphicExitFrame + GRAPHIC_BREATHING_FRAMES`; `:309` records exit frame as `frame + duration`. |
| Quality review is not rendered-pixel truth | `lib/editron/services/quality-review-service.ts:1313` starts `runQualityReview`; inspected scoring path is overlay/metadata issue based. |
| MG candidate machinery exists | `lib/editron/motion-graphics/engine/composition-planner.ts:598+` has numeric composition; `:628` enumerates candidates; `:638` selects candidate. |
| Numeric wires are currently narrow | `lib/editron/motion-graphics/engine/encoding-wires.ts:179-197` gates sweep/length candidates on `normalizedPercent`; `:245-246` shows comparable/bounded wire licensing. |
| Signal candidate collapse is real | `lib/editron/services/signal-executor.ts:597` assigns `confidence: momentWeight`; `:750` has dedupe; `lib/editron/services/unified-decision-bundle.ts:683` has signal execution floors. |
| Merge benches Path D richness | `lib/editron/services/unified-decision-bundle.ts:478-575` is the merge; `:522` near-equivalence suppression; `:533` execution license. |
| Signals can co-own but not fully own in the current merge | `lib/editron/services/unified-decision-bundle.ts:647+` authority after signal merge; `:665` uses `co-owner` or `advisor`. |
| Dead VLM gate exists | `lib/editron/motion-graphics/engine/aesthetic-gate.ts:61+` exports `runAestheticGate`; repo search found definitions/tests/scripts but no live pipeline caller. It also auto-passes without API key at `:70`. |
| Beat sync gap is real | `lib/editron/agent/director-agent.ts:719` calls `executeBrief` with `audioEnergyCurve`, but not `beats`. |
| V-JEPA governance is already tiered | `lib/editron/services/vjepa-coverage-audit.ts:410` sets `trusted` only when reasons are empty and score is >= 0.9; `:460-463` gates subject/negative-space/motion/text affordances. |
| CRG constraints exist | `lib/editron/data/creative-knowledge-graph.json` contains `overlay_spatial_overlap`, `graphic_too_small`, `pacing_monotony`, `transition_repetition`, `caption_timing_drift`, `sfx_timing_drift`, and `shot_scale_monotony`. |

Line numbers may drift, but the mechanisms above were verified in the current worktree.

## 1) Northstar Contract

Target:

```text
content atoms + relations + rhythm + screen context + brand taste + learned references
-> form + timing + placement + combo
```

Not:

```text
label -> preset -> hope
```

Hard laws:

1. LLM and Creative Brief may provide semantic facts and story context.
2. LLM and Creative Brief may not directly choose final overlay forms.
3. Native deterministic engines decide form, timing, placement, density, and safety.
4. Compatibility labels can exist only at adapter/render edges.
5. Rendered evidence is the quality truth.
6. Calibration is last, not a substitute for building the form engine.

## 2) Founder-Decided Philosophy

### Generation first

The engine must produce good MGs directly. Gates, budgets, and QA are guardrails. They catch misses; they are not how the system becomes good.

### Budget is guardrail, not guide rail

Current bug: budget partly decides how many MGs exist.

- Source cap: `graphic.max = ceil(graphic_density * durationMin)` in Creative Brief.
- Execution spacing: DecisionBudget adds roughly 4.5 seconds of graphic breathing.

Target: warrant decides count. Budget only catches runaway excess.

Meaning:

- A moment earns an MG because its facts are visually explainable and useful.
- Budget may veto spam in a short window.
- Budget must not be the author of MG count.

### Gates are guardrails

Gates must not be used as the primary quality mechanism. They should fail rarely when generation is healthy.

Target:

- generation produces better facts/forms
- deterministic gates catch collision, illegibility, dwell, drift, repetition
- gate failures create evidence and either auto-correct, degrade, or block

### Rendered judge is the eyes

The system cannot tune what it cannot see. The rendered judge is a feedback loop, not the primary form generator.

Use it to:

- score actual pixels and audio timing
- produce evidence for tuning
- compare before/after changes
- feed calibration after structure is sound

Do not use it as:

- a hidden form picker
- a freeform LLM decision maker
- the mechanism that makes boring output good

## 3) Current Truth Snapshot

### What is true

- Path E and Path D share downstream bundle/execution plumbing.
- Path E still source-caps graphics and remains a strong producer.
- Path D produces rich per-moment decisions, but merge/licensing suppresses most of them.
- MG candidate/wire machinery already exists.
- Transition, zoom, SFX, and caption planners are not empty. They are moment-driven and partially boundary/memory aware.
- V-JEPA governance is already tiered and should not be rebuilt.

### What is not true enough

- The system is not fully one-owner unified.
- Signals are not fully primary.
- MG form is not yet richly signal-selected within faithful candidate sets.
- Rendered quality is not a hard production truth loop.
- Calibration is not ready.

## 4) Core Defect Registry

| Priority | Problem | Current mechanism | Required fix direction |
|---|---|---|---|
| P0 | No rendered-pixel truth loop | Metadata quality review and dormant aesthetic gate | Build rendered judge as feedback and hard evidence path |
| P1 | MG form breadth too narrow | Non-percent numbers and many facts collapse to literal/single skeleton | Widen faithful candidate enumeration |
| P1 | Candidate licensing too narrow | Length/sweep depend on narrow percent parse | License by fact: comparable magnitude, bounded ratio, series, comparison |
| P1 | Signals collapse before execution | `confidence = momentWeight`, first-wins dedupe, invented floors | Split importance/confidence, best-wins by family, CRG-sourced floors |
| P1 | Path D richness benched | Near-duplicate suppression + license rejects most rich candidates | Preserve Path D as candidate evidence and executable source when warranted |
| P1 | Live learning can train on weak score | Bandit records quality score that is not rendered truth | Freeze/gate learning until rendered evidence exists |
| P2 | Budget acts like author | Creative Brief cap and execution spacing shape count | Warrant-driven count, budget as runaway guardrail |
| P2 | Beat sync incomplete | `executeBrief` gets energy curve but not beats | Wire beat data into timing/choreography where needed |
| P2 | Visual perception gaps | Dead face/text/complexity signals and weak footage facts | Add per-shot VLM perception layer after V-JEPA |

## 5) MG Form-From-Signals Plan

The goal is not to hide templates under new names. The goal is lawful visual encoding:

```text
fact licenses possible wires
signals select and choreograph among honest forms
renderer realizes primitives
```

### 5.1 Widen candidates

Each fact type should enumerate many faithful possibilities.

Examples:

- scalar magnitude -> literal, counter, scaled digit, bar if comparable, area if very-large comparable
- bounded proportion -> literal, length fill, sweep/ring, split-fill
- series -> sparkline, slope, ranked points, trend callout
- comparison -> paired anchors, delta connector, before/after relation, proportional difference
- quotation/proof -> quote/proof pairing, claim/evidence relation, source emphasis
- process/list -> steps, sequence rail, build-up hierarchy

These are wires and primitives, not named preset components.

### 5.2 License by fact, not narrow parse

Current issue: too many encodings only unlock when `normalizedPercent` exists.

Target:

- `length`/`area` can be licensed by comparable magnitude.
- `fill`/`sweep` can be licensed by bounded ratio.
- `sparkline` needs ordered series.
- `comparison` needs relation atoms.
- `strike` needs negation/refutation.
- `valence` needs polarity/tone evidence.

Faithfulness is the hard veto.

### 5.3 Select with rich per-moment signals

Signals do not invent dishonest forms. They choose among licensed forms.

Inputs:

- visual significance
- emotional arousal
- speech energy
- visceral impact
- motion intensity
- cinematic moment
- screen pressure
- caption pressure
- recent form memory
- brand/taste bounds

Example:

```text
fact: comparable magnitude
licensed forms: literal, counter, scaled digit, bar
moment: high speech energy + low screen pressure + high importance
selected: larger hero counter or scaled-digit composition
```

### 5.4 Choreograph from signals

The selected form then gets:

- entrance timing
- hold time
- stagger
- intensity
- motion curve
- exit/tail
- SFX eligibility
- caption/zoom/transition coordination

Hard rule: signals choose form and motion within faithful options. A number can never become a fake quote.

## 6) Decision Count and Path E/D Plan

### Current problem

Path E decides sparse high-level output and caps graphics at the source. Path D produces rich per-moment candidates, but the merge suppresses most of them.

### Target

One planner should own the final candidate ranking.

Inputs:

- Creative Brief semantic facts
- Path D signal candidates
- canonical edited timeline
- moment bundle
- V-JEPA and VLM perception
- brand/taste
- budgets as guardrails

Output:

- selected decisions
- evidence-only decisions
- rejected decisions
- shadowed decisions
- reasons and frame anchors

### Required changes

1. Split candidate confidence from moment importance.
2. Replace first-wins dedupe with per-family best-wins.
3. Hoist family atoms before culling.
4. Let strong Path D candidates become executable when warranted.
5. Report authority truthfully: co-owner vs primary vs supplemental.
6. Keep Creative Brief as semantic context, not final form author.

## 7) Visual Perception Layer

Add a frame/shot-level VLM as perception, not decision authority.

### Placement

```text
raw video
-> V-JEPA dense/cheap scan
-> transcript/audio analysis
-> VLM on selected shots
-> structured visual signals
-> Path D + Creative Brief semantic context
-> native planner
```

### Granularity

Per shot, not every frame.

Cascade:

1. V-JEPA flags salient or uncertain regions.
2. VLM reads only selected shots.
3. Structured visual facts feed the native system.

### Forced schema

The VLM must output structured perception only:

- subjects
- location type: talking-head, b-roll, screen-share, demo, product, chart, etc.
- actions/events
- OCR/on-screen text
- composition and negative space
- visual salience
- already-visible product/chart/text
- visual explainability of the moment

No freeform paragraphs as decision authority.

### Why this exists

It repairs:

- `face_present=0`
- `visual_complexity=0`
- `text_on_screen=0`
- weak screen-aware placement
- weak footage-aware contrast
- low confidence in visual explainability

Preferred model direction from the brief:

- Qwen2.5-VL video/OCR/grounding as default direction
- 7B tier for routine shots
- larger tier for flagged/important shots
- async precompute like V-JEPA

Placement matters more than the exact model choice.

## 8) Family Planner Status

Do not rebuild these from scratch:

- transitions
- zoom
- SFX
- captions

They already have moment-driven logic and some boundary/memory behavior.

Do improve:

- beat-frame sync
- richer evidence intake
- cross-overlay choreography
- skip/reject reasons
- rendered issue feedback
- exact timing windows

### Captions

Need:

- moment grouping
- readable dwell
- phrase/row breaks
- active group only
- zone negotiation with MG and faces

### Zoom

Need:

- subject-aware focal anchor
- shot-scale awareness
- recent motion memory
- beat/phrase timing sync

### Transitions

Need:

- boundary job from topic/motion/pause/beat/emotion delta
- physical form from boundary atoms
- repetition memory
- beat/frame alignment

### SFX

Need:

- provider quality and cached selection
- exact sync windows
- skip if no good asset
- role aligned to transition/MG/zoom/caption beat

## 9) Gates and Rendered Judge

### Rendered judge

Purpose:

- gives the system eyes
- produces feedback for tuning
- scores real pixels/audio timing

This should be revived/connected from the dormant `aesthetic-gate.ts` concept and/or the existing rendered-aesthetic harness.

It must not:

- auto-pass without key
- choose final forms
- hide bad generation

### Deterministic gates

Use CRG constraints where possible:

- `overlay.overlay_spatial_overlap` > 20%
- `overlay.graphic_too_small` 72px floor
- `temporal.pacing_monotony`
- `transition.transition_repetition`
- `overlay.caption_timing_drift`
- `audio.sfx_timing_drift`
- `visual.shot_scale_monotony`

Thresholds must be CRG-sourced or explicitly marked invented until calibrated.

## 10) Sequencing

This is the current execution order.

### Phase 0 - Rendered judge / eyes

Build the feedback loop first.

Acceptance:

- real rendered samples exist
- reports include overlay id, frame range, family, severity, reason, artifact path
- no auto-pass with no API key
- 0/100 critical runs cannot be recorded as healthy learning examples

### Phase 1 - Form engine breadth

Widen candidates, license by fact, select with rich signals, choreograph per moment.

Acceptance:

- non-percent number has more than one faithful candidate when facts allow it
- comparison/quote/process/identity enumerate alternatives where evidence exists
- selected form explanation says which fact licensed it and which signal chose it

### Phase 2 - Budget as guardrail + signal normalization

Move count ownership from budget to warrant.

Acceptance:

- graphic count comes from warranted moments
- budget only rejects runaway local density
- candidate confidence and moment importance are separate
- family best-wins replaces first-wins where appropriate

### Phase 3 - Visual perception layer

Add VLM as perception.

Acceptance:

- selected shots get structured schema
- facts feed both Path D and Creative Brief semantic context
- VLM cannot directly choose overlay type/form

### Phase 4 - Cross-overlay choreography

Coordinate MG/captions/zoom/transition/SFX.

Acceptance:

- shared timeline memory exists
- repeated forms are reduced
- conflicting overlays negotiate zones/timing

### Phase 5 - Learning safety

Freeze live learning until rendered truth is valid.

Acceptance:

- failed rendered quality cannot write normal learning outcome
- diagnostic lane stores failures separately

### Phase 6 - Calibration last

Only after Phase 0-5.

Acceptance:

- diverse creator corpus
- human/founder labels
- holdout split
- before/after report by family
- no tuning to one creator/project/example

## 11) What Not To Do

Do not:

- build keyword-as-MG
- add hidden preset menus
- let LLM choose final form
- rebuild transition/zoom/SFX/caption planners from scratch
- redo V-JEPA trust governance
- use budget as the count author
- use gates as the quality generator
- calibrate before rendered truth and form breadth exist
- tune to one Hank/Iman/project/`0.02` example

## 12) Current Done vs Not Done

| Claim | Real status |
|---|---|
| Path E/D fully merged | Not fully. Shared downstream plumbing exists; one-owner planning is still incomplete. |
| Signals reach system | Yes, but candidate use is narrowed by thresholds, merge, and current form licensing. |
| MG engine can support richer output | Yes, machinery exists; it is starved by facts/licensing/candidate breadth and narrow selection. |
| Transition/zoom/SFX/caption engines exist | Yes. Improve sync/evidence/choreography, do not rebuild. |
| Rendered truth loop | Incomplete. Harness exists; live feedback/gating is not enough. |
| Calibration | Not ready. Must wait. |

## 13) Immediate Next Work

1. Wire rendered judge/eyes into the real evidence path without letting it choose forms.
2. Convert MG form engine to generation-first: widen candidates and license by facts.
3. Change graphic count from budget-authored to warrant-authored.
4. Fix signal candidate normalization and merge culling.
5. Add VLM perception layer after V-JEPA and before planning.
6. Freeze or gate live learning until rendered truth is trustworthy.
7. Calibrate only after rendered artifacts and family behavior are stable.

## 14) Global Done Test

A fresh upload-to-edit run must produce:

- correct authority metadata
- normalized candidate audit
- planner-owned final decisions
- family-specific reasoning
- rendered quality artifacts
- persisted issue details
- no false pass when output is visibly bad
- no learning write from failed rendered quality
- MGs whose forms are licensed by facts and selected/choreographed by signals

Document date: 2026-06-20.
Branch expectation: `infrastructure-improvs-+Editron`.
This file is authoritative until a newer consolidated plan replaces it.
