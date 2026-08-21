# ThinkForge Semantic Video Treatment Plan

**Date:** 2026-08-21
**Status:** proposed; no implementation starts until Phase 0 is approved
**Scope owner:** ThinkForge
**Related systems:** Editron consumes semantic intent; Shoot Kit consumes capture requirements. Neither becomes a second authoring authority.

## The Product Problem

ThinkForge must be able to author any video a user asks for: a narrated visual explainer, brand film, documentary, product demonstration, presenter-led video, hybrid piece, or something not named in advance.

The current system makes two invalid assumptions:

1. A narrative beat is treated as a physical camera shot.
2. A short list of execution labels (`ai-video`, `stock`, `animated-still`, `graphics-only`) is treated as the creative decision.

That produces fake camera plans for abstract or graphics-led work, loses mixed presenter/cutaway/graphics scenes at handoff, and makes ThinkForge less capable than the content it is writing.

## Outcome

ThinkForge will author one versioned, semantic `VideoTreatment` alongside a script. It describes what the audience should understand and feel, how audio and visuals work together, what reference and brand evidence matters, and which real-world capture requirements exist.

It will not prescribe final motion graphics, keyframes, typography, camera geometry, assets, or timeline form. Editron remains the owner of final editorial composition. Shoot Kit only plans real capture after the user has confirmed the available setup.

## Non-Negotiable Boundaries

- No user-facing or writer-owned video-type presets.
- No mandatory camera, lens, or movement instruction for a non-capture beat.
- No fabricated room dimensions, device characteristics, cost, setup time, or readiness status.
- No raw normalized coordinates in the novice-facing UI.
- No separate ThinkForge motion-graphics renderer or duplicate Editron form resolver.
- No full creative graph dump into a prompt.
- No hidden chain-of-thought UI. The product exposes an auditable decision trace instead.
- No destructive Sidecar V2 migration. Existing documents remain readable and exportable.

## Architecture Decision

```text
User brief + selected brand + project/session context + approved facts
                     + user references + production constraints
                                      |
                                      v
                         ResolvedAuthoringContext
                                      |
                                      v
          EditorialPlan (runtime, evidence, writing doctrine)
                                      +
          VideoTreatment (semantic audiovisual intent and trace)
                                      |
                                      v
      Script Sidecar V3: acts -> narrative scenes -> beats -> visual events
                                      |
                 +--------------------+--------------------+
                 |                                         |
                 v                                         v
  Editron semantic handoff                         Capture requirements
  owns final visual form                           Shoot Kit only when needed
```

`EditorialPlan` remains the deterministic owner of runtime, evidence, narration, and writing doctrine. `VideoTreatment` is the creative audiovisual layer. They are complementary, not competing planners.

## Phase 0 Ownership and Compatibility Matrix

| Artifact or decision | Sole owner | Inputs it may read | Consumers | It must not own |
|---|---|---|---|---|
| `ResolvedAuthoringContext` | ThinkForge server | authorised user/session/brand/project facts | EditorialPlan and VideoTreatment resolver | final visual form or capture geometry |
| `CreativeReferenceSet` | ThinkForge provenance boundary | user-approved references and existing approved analysis | VideoTreatment resolver and audit trace | factual truth claims or copied design assets |
| `EditorialPlan` | ThinkForge deterministic resolver | content doctrine, signal profile, runtime, evidence policy | writers | motion-graphic form, camera setup, final timeline |
| `VideoTreatment` | ThinkForge treatment planner | context, EditorialPlan, references, selected Editron graph evidence | Script Sidecar V3, Editron compiler, capture projection | keyframes, layout, typography, lens, room geometry, or asset selection |
| Sidecar V3 visual events | ThinkForge script writer | VideoTreatment and narrative hierarchy | AV-script presentation and Editron compiler | provider render segmentation or physical setup assumptions |
| Editron editorial intent | Editron | treatment and beat-level semantic events, actual timeline/assets | Editron planners/renderers | re-authoring the story or re-guessing Brand Vault intent |
| Capture projection | Shoot Kit | confirmed capture requirements and user-confirmed production profile | novice-facing production guidance | creative treatment or invented capability facts |

### Sidecar V2 to V3 Transition Rule

- V2 stays readable, saveable, and exportable through its existing route.
- There is no automatic V2-to-V3 treatment inference and no automatic Shoot Kit regeneration from historic `shotIntent` values.
- A V3 script embeds only a treatment binding: treatment ID, treatment version, and input fingerprint. Its beat-level visual events carry semantic intent; final visual form remains downstream.
- A user explicitly regenerating or materially revising a script may create a V3 treatment after the new resolver is live. Failure to create that treatment leaves the verified V2 document unchanged.

## Core Vocabulary

**Narrative beat:** the smallest meaningful change in audience understanding, feeling, argument, or story. It is not a shot, asset, or media type.

**Visual event:** one or more concurrent visual jobs inside a beat. For example, a presenter can continue speaking while a cutaway, graphical explanation, or source image does different semantic work.

**Capture requirement:** a real-world need inferred from a treatment, such as an on-camera host, product demonstration, screen evidence, or a particular location. It is not yet camera placement.

**Video treatment:** the whole-work creative intent and the beat-level visual/audio relationship, with source, brand, reference, and user-choice provenance.

## The Contract To Build

### Whole-video treatment

The treatment must carry:

- audience outcome and viewer promise
- narrative or argument arc
- visual-verbal relationship: anchor, complement, counterpoint, or minimal where supported by the content doctrine
- visual rhythm and information hierarchy
- brand visual boundaries, including permitted and prohibited treatment
- reference synthesis with provenance and non-copy constraints
- recurring motifs and continuity requirements
- sound and voice strategy
- user constraints, capabilities, unknowns, confidence, and required confirmation

### Beat-level visual events

Each event must carry:

- the audience job it performs
- the relationship to concurrent audio
- what must become visible, clear, felt, contrasted, or remembered
- timing within the beat and continuity links
- factual source references where needed
- creative-reference evidence where relevant
- brand and accessibility constraints
- whether it creates a real capture requirement

The contract deliberately does not require a final asset class. A downstream editor may resolve the same semantic event differently based on actual assets, timeline, platform, and user choices.

### Decision trace

The system must persist a safe explanation, not private model reasoning:

- request, Brand Vault revision, signal profile, source IDs, and reference IDs used
- treatment decision and its stated rationale
- constraints applied or rejected
- confidence and unresolved assumptions
- writer, Sidecar, compiler, and user-override versions

## Delivery Plan With Hard Stop Lines

Every implementation batch is at most five production/test files, has one focused commit, and stops for review before the next phase. A phase is not complete because code exists; it is complete only when its exit evidence below exists.

### Phase 0: Freeze the contracts and fixtures

**Goal:** agree on the data model before modifying generation behavior.

**Build:**

- Versioned `VideoTreatment`, `CreativeReferenceSet`, and Sidecar V3 contract drafts.
- Ownership matrix for ThinkForge, Editron, Shoot Kit, Brand Vault, and source/reference provenance.
- Eight golden fixtures: abstract explainer; presenter plus cutaway; documentary; product demo; reference-led piece; two-brand contrast; no-device/room case; long-form chapter case.
- V2 compatibility and rollback rules.

**Done only when:**

- Every field has one owner and one consumer.
- A mixed presenter-plus-cutaway example is representable without an asset-type choice.
- A fully animated example creates zero `CaptureRequirement`s.
- The fixture set has expected JSON artifacts and signed acceptance assertions.

**Stop line:** no writer prompt, runtime route, UI, Editron, or Shoot Kit code changes. No new model call. If the contract cannot express a fixture, revise the contract before proceeding.

### Phase 1: Resolve brand and reference input

**Goal:** give ThinkForge trustworthy, structured material for visual treatment without conflating it with factual evidence.

**Build:**

- A separate `CreativeReferenceSet`, linked to but not merged into the factual Source Ledger.
- Read-only extraction/adaptation of existing user reference analysis where available: composition, pace, text behavior, visual rhythm, graphic/footage interplay, audio energy, motifs, and frame/timestamp provenance.
- A resolver that combines accepted Brand Vault visual rules, content signals, user brief, production constraints, and references.

**Done only when:**

- The resolver records which Brand Vault revision and reference IDs influenced a result.
- Reference influence is labelled as influence, not copying.
- Brand A references cannot enter Brand B treatment context.
- Missing analysis produces a named unknown, never invented visual facts.

**Stop line:** do not alter the script writer output, Editron timeline behavior, or Shoot Kit. Do not build a new web crawler or trend provider.

### Phase 2: Create the treatment planner

**Goal:** author the whole-video creative plan before writing prose, so visual treatment is coherent across the video.

**Build:**

- A treatment-planning operation for video scripts only.
- It consumes the resolved authoring context, selected Creative Content Knowledge sections, and selected Editron creative-graph evidence through a compact read-only adapter.
- It returns a versioned treatment, decision trace, and named unresolved assumptions.
- Cache by the input fingerprint; re-run only when the brief, brand revision, selected references, or explicit creative choices change.

**Done only when:**

- A test proves a reference and a Brand Vault change alter the treatment trace predictably.
- A no-capture explainer returns no capture needs.
- The planner does not choose final animation, layout, keyframe, or asset form.
- Cost, model, latency, and input fingerprint are persisted for the operation.

**Stop line:** no Sidecar V3 write path, no Shoot Kit UI, and no final Editron rendering change. Do not use the planner for posts or generic chat.

### Phase 3: Make the script writer treatment-aware

**Goal:** write an audiovisual script that preserves semantic mixed-media intent without forcing physical shots.

**Build:**

- Sidecar V3 with `visualEvents[]` and optional semantic `CaptureRequirement`s.
- Remove the rule that every beat requires `shotIntent`.
- Retain V2 readers and add a non-destructive adapter for existing scripts.
- Make the writer consume the treatment and preserve it across long-form chapter execution.
- Materialize a readable AV-script view: what is heard, what is seen, timing, and optional provenance.

**Done only when:**

- A single beat can contain spoken presenter audio plus a distinct cutaway/graphic visual event.
- A seven-minute script maintains one whole-work treatment across every chapter.
- A graphics-led script creates no synthetic camera units.
- Existing V2 scripts still open, save, and export without data loss.

**Stop line:** do not rewrite Editron's renderer, add visual presets, or generate a Shoot Kit automatically. No camera physics belongs in the writer.

### Phase 4: Preserve treatment through the Editron handoff

**Goal:** give Editron the meaning it needs without making ThinkForge decide final form.

**Build:**

- A V3 compiler that sends treatment-level constraints and per-beat semantic visual events.
- Preserve mixed events rather than flattening them into newline descriptions or dropping them when their legacy asset hints differ.
- Map the semantic contract into Editron's existing editorial-intent seam.
- Return a visible compatibility/review result when a supported semantic event cannot yet be resolved.

**Done only when:**

- A presenter-and-cutaway fixture arrives in Editron with both layers intact.
- Brand, reference, source, and timing provenance survive compilation.
- ThinkForge does not choose exact overlay layout, keyframes, or final motion-graphic implementation.
- Preview remains side-effect free until the user confirms generation.

**Stop line:** do not redesign Editron, replace its graph, or create a parallel motion-graphics engine in ThinkForge.

### Phase 5: Rebuild Shoot Kit as a capture-only projection

**Goal:** make production guidance useful to a beginner without inventing physical certainty.

**Build:**

- Shoot Kit reads only confirmed capture requirements from the treatment.
- A user-confirmed production profile covers people, device, lenses if known, rooms, crew, audio, lighting, equipment, schedule, budget, permissions, and access.
- Unknown capabilities trigger guided calibration, not fake readiness.
- The UI translates internal placement calculations into plain-language framing, eye-line, light, audio, and safety checks.
- Provide a voice-recording guide where the treatment needs audio but no physical video capture.

**Done only when:**

- An animation-only script shows no physical Shoot Kit.
- A hybrid script lists only actual capture needs and never fabricates a presenter.
- An unknown room/device cannot be shown as approved, costed, or physically ready.
- Users see no normalized coordinates, fake lens value, invented room depth, or generic household workaround unless they explicitly confirm it.

**Stop line:** no AR room scanner, equipment marketplace, rental workflow, or advanced cinematography simulator. Those are separate product decisions.

### Phase 6: Migration, evaluation, and staged release

**Goal:** prove the new path is safe before it becomes the default.

**Build:**

- Read adapters first, then opt-in V3 writes behind a feature flag.
- Deterministic unit/integration tests plus browser journeys using a stub provider.
- A small real-provider canary with an approved spend cap.
- Trace and error diagnostics for treatment generation, writer, compiler, and Shoot Kit decisions.

**Done only when:**

- All eight golden fixtures pass at contract, writer, handoff, and appropriate Shoot Kit stages.
- Browser tests prove new session, reopen, regenerate, reference update, brand switch, long-form, Editron handoff, and no-capture behavior.
- V2 rollback is tested, and a failed V3 treatment never corrupts the saved script.
- Typecheck, lint, focused tests, and deployed canary evidence are attached to the release record.

**Stop line:** no broad mobile redesign, no new trend ingestion, no Avatar Vault redesign, and no production rollout until the treatment, handoff, and capture fixtures pass.

## Required Verification

```text
Contract tests
  - Schema validation, V2 compatibility, ownership and provenance

Authoring tests
  - Brand/reference input changes treatment, no stale treatment reuse
  - Content doctrine and source restrictions remain enforced

Writer tests
  - Mixed simultaneous visual events, no forced camera intent
  - Long-form continuity, treatment caching and invalidation

Handoff tests
  - Per-beat semantic events survive to Editron
  - No final-form duplication and no silent downgrade

Shoot Kit tests
  - No-capture, hybrid capture, unknown-device/room, novice calibration

Browser tests
  - Script creation, treatment review, reopen, edit, export, failure/retry
```

## Scope-Control Protocol

The following rule governs execution:

1. We implement only the current phase's stated deliverables.
2. A new idea is recorded as a later backlog item unless it is required for the phase's acceptance criteria.
3. We do not start the next phase because the current code looks promising. We start only after its done line and evidence are met, then obtain explicit approval.
4. No new agent, provider, renderer, UI redesign, scanner, marketplace, or inference taxonomy can be added without a written contract change and a new approved phase.
5. A phase that fails its test is repaired within its boundary. It is not expanded into a redesign of adjacent systems.

## Execution Cadence

```text
Approve one phase
  -> read the exact target files again
  -> Step 0 cleanup where a target is over 300 LOC
  -> change at most five production/test files
  -> focused tests + typecheck + lint + diff check
  -> commit and push
  -> present evidence against that phase's done line
  -> stop for approval
```

## Explicitly Deferred

- AR or automatic room measurement.
- Equipment-rental, purchase, or crew-booking flows.
- New trend extraction providers and native social-platform scraping.
- A new motion-graphics renderer or ThinkForge-owned keyframe system.
- Broad mobile workspace redesign.
- Any automatic copying of a creator's protected visual identity from a reference.

## Completion Definition

This programme is complete only when ThinkForge can author a semantically rich, reference- and brand-aware audiovisual script; Editron can resolve its final visual form without re-guessing; and Shoot Kit appears only for genuine confirmed capture work.

It is not complete merely because the script validates, a hidden JSON object exists, or a camera diagram renders.
