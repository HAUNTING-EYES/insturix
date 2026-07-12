# Editron Production Contracts (Binding, 2026-07-12)

Status: binding implementation contract for the remaining Editron planner and motion-graphics work.

This document refines, but does not replace, the P0-P16 execution plan. Where an older plan describes fixed counts, density caps as creative guidance, MG type menus, or codegen placement after composition, this contract wins.

## 1. Current Truth

- Commit `88a44c26` adds deterministic family-frequency selection pressure after candidate licensing. It is a useful primitive, not the finished production opportunity optimizer.
- Its percentile response is invented and calibration-pending. It must not become a hidden fixed-count policy.
- The existing unified planner remains the decision owner. This work deepens its selection stage; it must not create a second planner.
- Existing family resolvers/composers remain the owners of physical form. The planner licenses and selects opportunities; it does not duplicate render form.
- Creative Brief contributes semantic and narrative facts. It does not directly force overlay types or forms.

## 2. Production Opportunity Optimizer

### 2.1 Inputs

The optimizer consumes only timeline-projected truth:

- canonical edited timeline and source provenance;
- Creative Brief semantic facts;
- normalized signal candidates and atomic evidence;
- cut-boundary, speech, rhythm, visual, motion, and screen context;
- Brand Vault composition, motion, narrative, and taste preferences;
- user editorial preferences;
- cross-overlay timeline memory.

### 2.2 Decision Pipeline

1. Producers emit facts and candidates, never final render forms.
2. Family-specific absolute validity gates reject candidates that cannot perform an honest editorial job.
3. Nearby detections referring to the same editorial moment collapse into one opportunity with an evidence ledger.
4. A cross-family conflict graph connects opportunities that compete for the same attention, collide spatially, repeat recent behavior, or create incompatible motion/timing.
5. Distribution logic protects chapters, narrative phases, rhythm, and recent overlay history so all selected edits do not bunch into one strong section.
6. One deterministic optimizer selects the combination with the highest total editorial value while satisfying validity, timing, collision, repetition, distribution, and user-intent constraints.
7. The selected opportunity is passed to its existing family resolver, which owns physical form and renderer-compatible output.
8. Final choreography reconciles the selected families on one timeline, then rendered evidence judges the actual result.

Frequency changes selection pressure among valid opportunities. It never creates an opportunity, changes evidence confidence, guarantees a count, or bypasses family validity.

### 2.3 Family Semantics

- Motion graphics, zoom, transitions, and SFX: occurrence density among genuine opportunities.
- Captions: emphasis density only. Transcript coverage and speech synchronization remain complete when captions are enabled.
- Music: no frequency control. Music uses enablement, fit, continuity, and user preference.
- Pacing/cuts: willingness to act on genuine semantic, visual, audio, or rhythm boundaries. It never means adding cuts because a profile expects more.

### 2.4 Absolute Validity

- Zoom requires a motivated moment, a usable visual anchor, compatible source motion, and sufficient recent-memory distance.
- Transition requires a real cut boundary and an editorial boundary job supported by continuity/change evidence.
- MG requires visually explainable semantic structure and sufficient moment worthiness.
- SFX requires an exact synchronization target and a provider candidate that passes semantic, duration, and quality checks. Otherwise it skips.
- Caption emphasis requires grounded spoken words, readable exposure, and safe screen occupancy.

### 2.5 Audit Contract

Every opportunity persists:

- family and editorial job;
- canonical frame/range and source provenance;
- contributing facts, signals, atoms, and evidence strength;
- validity result and failure reason;
- deduplication cluster and representative choice;
- conflicts and conflict reason;
- raw editorial value, frequency pressure, distribution effect, and rank;
- selected, rejected, evidence-only, or shadowed outcome;
- final rejection reason and owning resolver;
- calibration provenance for every threshold or curve.

Missing required evidence fails closed for that candidate and remains visible in the audit. It must not silently become a fallback edit.

### 2.6 Acceptance Tests

- Five detections around one phrase yield one opportunity, not five edits.
- Increasing frequency can monotonically increase selection among valid opportunities, but cannot promote an invalid one.
- Strong opportunities are distributed across chapters/narrative phases when equivalent value exists.
- Caption, MG, zoom, transition, and SFX conflicts resolve deterministically and explainably.
- Caption frequency affects emphasis only; music remains unaffected; pacing does not invent cut opportunities.
- Repeated runs with the same inputs produce the same selected set and audit.
- Mongo truth is sufficient to reconstruct why each candidate won or lost.
- A real rendered fixture proves the selected combination does not collide, repeat mechanically, or concentrate irrationally.

## 3. MG Codegen Context And Placement

### 3.1 Two-Level Worthiness

1. The unified planner decides whether a moment is licensed to request an MG and how much selection pressure the user permits.
2. MG codegen receives the licensed context and may still decline when it cannot construct a faithful visual explanation.

`off` is a hard veto. `auto` and `prefer`, plus frequency, affect opportunity selection. They do not decide the graphic form. There is no user-facing or internal creative taxonomy such as `stats_only`, `full`, or a menu of graphic types.

### 3.2 Generator Context

MG codegen receives:

- semantic facts, relations, wires, evidence, and visual-explanation contract;
- per-moment audio, visual, speech, emotion, rhythm, and narrative signals;
- Brand Vault composition, color, typography, narrative, motion, safe-zone, and figure-ground preferences;
- screen context, avoid regions, preferred regions, subject/text geometry, and output aspect ratio;
- cross-overlay timeline context and intended landing beat;
- raw user `expressiveness` in `[0, 1]`;
- bounded free-text editorial notes.

Expressiveness is context, not a geometric mean with a signal and not a direct animation multiplier. Notes are Layer-2 context, never executable instructions that bypass faithfulness or safety. Structure-relevant context must participate in the prompt/input contract and cache hash.

The meaning of expressiveness is invented-needs-calibration until render-in-loop evaluation and holdout testing establish it. No placeholder weight may be presented as learned truth.

### 3.3 Placement Ownership

MG sequences are full-frame transparent, content-placed compositions.

- Before generation, atomic placement computes safe, avoid, and preferred regions from screen context and passes them into codegen.
- Codegen lays out the internal scene inside those constraints.
- The overlay timeline owns timing, collisions, and sequence lifecycle.
- The generic placement engine must not reposition or scale a completed full-frame MG sequence as if it were a sub-frame card.
- Renderer adapters may expose compatibility labels, but those labels are not creative authority.

### 3.4 Live Integration Requirements

- Add a live caller for the existing MG generator/scan/compile/render/ingest lane.
- Replace the current narrow numeric-only E0 boundary with type-free semantic facts and licensed visual relations.
- Persist generator input, decline reason, generated artifact identity, safety result, and rendered evidence.
- Remove remaining live authority from legacy `motionGraphics: none|stats_only|full`, `autoMotionGraphics`, manual `graphicType`, template/composer fallback selection, and renderer-key-as-decision behavior.
- Preserve existing renderer/composer logic only as compatibility or deterministic rendering infrastructure where it does not choose creative form.

### 3.5 Acceptance Tests

- The same fact can produce different faithful compositions under materially different moment, brand, screen, or expressiveness context.
- Different facts cannot be forced into the same form when the visual wire would be dishonest.
- Codegen can decline and produces no fallback text card.
- No geometric-mean MG intensity blend exists.
- No MG type enum is introduced in the new preference or codegen contract.
- Safe/avoid/preferred geometry reaches generation before layout, and the completed full-frame sequence is not repositioned afterward.
- Notes and expressiveness alter generator context and cache identity without bypassing validity.
- Real rendered fixtures demonstrate readable sizing, deliberate placement, animation landing, brand fit, and cross-overlay coordination.

## 4. Binding Execution Order

1. Bind these contracts into the active plan documents.
2. Complete P2/P13 with the opportunity model, conflict graph, distribution policy, constrained optimizer, and full audit.
3. Complete P9-P11 by wiring the MG codegen lane under the context and placement contract above.
4. Harden P0/P12 rendered truth and gate behavior against actual pixels and audio.
5. Prove VLM and multi-asset behavior on visual-only, speech-led, mixed-media, music-led, and Hinglish fixtures.
6. Run P15 calibration only after authority, rendering, and audit gates pass.
7. Complete P16 per-brand preference learning only from accepted rendered outcomes and explicit feedback.

## 5. Explicit Scope Decisions

- One user request produces one edited video. Multi-deliverable generation is deferred.
- External SFX providers remain primary; R2 is a cache, not a hand-curated local asset database.
- B2 named-moment routing remains optional unless a real product flow requires it.
- Tier-B illustrative MG scenes remain out of scope until the production codegen and rendered gate are proven.

## 6. Global Done Proof

The work is not done because metadata exists or focused tests pass. A fresh real upload must show:

- one truthful planner authority;
- candidate and opportunity audits with complete reasons;
- deterministic, family-valid selection without fixed-count behavior;
- full-frame MG codegen using semantic, moment, brand, screen, rhythm, preference, and notes context;
- rendered artifact evidence for every selected family;
- no silent quality pass for visibly failed output;
- calibration and learning writes only from accepted evidence.
