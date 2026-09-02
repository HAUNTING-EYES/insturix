# ThinkForge to Editron Visual Execution Gap Handoff

Date: 2026-08-30
Status: implementation and release-gate handoff, not completion evidence

## Purpose

ThinkForge should decide what the audience must see, hear, feel, and understand. Editron should decide the exact executable form: assets, layout, typography, timing, animation, transitions, sound design, keyframes, and timeline mutations.

The current repository only partially completes that chain. V3 semantic intent reaches storyboard prompt generation, but the direct script import still creates generic timeline placeholders without consuming the semantic intent. Existing tests prove contracts and deterministic mechanics; they do not prove that Gemini chooses an excellent treatment or that Editron renders the intended result faithfully.

This document freezes the missing contract, ownership boundary, knowledge policy, and release evidence required to close that gap.

## Current Runtime Truth

### Models

The relevant ThinkForge paths currently default to the stable Gemini 3.6 Flash model:

| Decision | Model | Thinking level (primary / recovery) | Code owner |
| --- | --- | --- | --- |
| Video treatment | `gemini-3.6-flash` | `medium` / `low` | `lib/thinkforge/video-treatment/treatment-planner.ts` |
| Script writer | `gemini-3.6-flash` | `medium` / `low` | `lib/thinkforge/agents/script-writer-agent.ts` |
| Physical capture design | `gemini-3.6-flash` | `medium` / `low` | `lib/thinkforge/production/physical-capture-design-planner.ts` |
| Technical capture resolution | `gemini-3.6-flash` | `medium` / `low` | `lib/thinkforge/production/technical-capture-plan-resolver.ts` |

The shared provider adapter removes deprecated sampling controls for Gemini 3 and sends `thinkingLevel` rather than a numeric provider thinking budget. Cost receipts use Google's introductory Gemini 3.6 rate of $0.75 per million input tokens and $3.75 per million output tokens through 2026-12-31. That rate is currently the same as Gemini 3.7; the 3.6 choice is an older full-Flash production model, not a claimed per-token discount over 3.7.

The model name is not itself quality evidence. Schema validity, source-backed context, deterministic constraints, real-provider evaluation, render proof, and qualified human review are all still required.

### Speech neutrality

An explicit `audibleSpeech: unspecified` was previously converted into `standard_voiceover` before treatment generation. That created a real voice-over bias. The immediate ThinkForge repair preserves this state as an open treatment decision instead of requiring speech.

That repair removes the forced default. It does not by itself prove that the chosen silent, sparse, narrated, dialogue-led, or mixed treatment is editorially correct. The durable contract must record the treatment's resolved audiovisual choice and validate it against the user's required and forbidden constraints.

### Partial Editron consumption

The current control flow is only partially converged:

1. `lib/pipeline/storyboard-prompt-builder.ts` reads `SceneDescriptor.editorialIntent` and supplies semantic audience, visual, audio, continuity, brand, and accessibility context to storyboard prompts.
2. `app/api/services/editron/projects/import-from-script/route.ts` calls `scenesToOverlays(...)` for direct import.
3. `lib/pipeline/scene-to-editron.ts` does not read `editorialIntent`; it creates generic gradient, narration, and caption placeholders and leaves later families to other Editron paths.
4. Therefore storyboard generation can see V3 semantics while direct timeline import and later final-form resolution do not yet prove systematic event-by-event execution.

This is partial semantic plumbing, not a unified production pipeline.

## Non-Negotiable Ownership

### ThinkForge owns

- Audience outcome and viewer promise.
- Narrative or argument progression.
- Meaningful moments and their semantic relationships.
- What should be communicated visually and audibly.
- Whether speech, a visible person, synchronous dialogue, or newly filmed material is required, forbidden, or left to treatment judgment.
- Brand, reference, factual, accessibility, compliance, and production constraints.
- Semantic visual events, audio relationships, continuity intent, and unresolved questions.
- Exact provenance for every source, reference, and accepted Brand Vault revision used.

### Editron owns

- Concrete assets and generation providers.
- Exact layouts, typography, palette application, logo placement, and composition.
- Keyframes, easing, animation form, transition implementation, and motion timing.
- Timeline segmentation, layer order, track placement, and overlap.
- Exact music, SFX, audio processing, loudness implementation, and mix automation.
- Executable camera geometry only when supported by confirmed physical evidence.
- Project mutations, previews, renders, and persisted proof receipts.

### Shoot Kit owns

- A capture-only projection of confirmed physical requirements.
- Beginner-readable calibration where device, room, lens, light, audio, or blocking facts are unknown.
- Framing, focus, stability, continuity, safety, sound, and lighting checks that can be observed by the user.
- No invented measurements, equipment, people, or presenter.

### Forbidden shadow authority

- ThinkForge must not author keyframes, concrete layouts, lens selections, exact SFX tokens, or final render forms.
- Editron must not re-author the story, silently replace semantic intent, or infer a different brand revision.
- Shoot Kit must not invent a production approach or apply physical camera instructions to non-capture moments.
- Runtime routing must not depend on fixed labels such as talking head, product ad, documentary, or B-roll video. Evaluation may use such labels only as sealed coverage strata.

## Required Contracts

### 1. Resolved audiovisual decision

VideoTreatment needs an explicit, model-produced and server-validated result for each independent dimension:

- audible speech: absent, sparse, present, or mixed;
- speech source: voice-over, synchronous dialogue, diegetic speech, or a justified combination;
- visible people: absent, present, or unresolved;
- physical capture: absent, required, or unresolved;
- graphics, generated imagery, supplied footage, screen material, and source material: semantic requirements, not final assets;
- decision rationale and the evidence IDs that influenced it.

The server validates this result against required and forbidden user constraints. `unspecified` means the treatment must decide from the approved brief, references, Brand Vault, source evidence, delivery needs, and production constraints. It never means standard voice-over.

### 2. Semantic event identity

Every meaningful treatment moment needs a stable `eventId`. Script beats may realize one or more events, but may not silently drop or duplicate them. Every downstream plan node must retain:

- treatment ID and version;
- event ID;
- script, act, scene, beat, and chapter identity where applicable;
- audience job;
- visual thesis;
- audio relationship;
- continuity intent;
- brand and reference evidence IDs;
- required, forbidden, preferred, and unresolved constraints.

The term beat means a meaningful unit of audience experience, not a fixed duration, shot, asset type, or editing preset. One beat may contain a presenter plus a cutaway, graphics over live footage, product action with sound but no speech, or another composition selected by the treatment.

### 3. Immutable Brand Visual Evidence Snapshot V1

ThinkForge and Editron need one revision-bound, server-created visual evidence snapshot. It must contain:

- `brandId`, accepted profile record ID, revision, checksum, and snapshot hash;
- exact approved logo asset IDs and URLs plus allowed usage roles;
- palette swatches, semantic roles, and unsafe-on-light or unsafe-on-dark flags;
- font families, roles, available files, weights, trust, and fallback status;
- approved product, UI, social, and uploaded visual assets;
- visual, narrative, motion, and composition signals;
- logo, accessibility, compliance, and forbidden-use policies;
- confidence, trust, authority, provenance, licensing or availability status, and evidence IDs for every item;
- named gaps, unresolved choices, and permitted degradation behavior.

The snapshot is evidence, not final form. It must not contain keyframes, concrete layout, easing, animation duration, transitions, lens choice, SFX token, asset query, or timeline segmentation.

The import route must verify the server-bound session brand, snapshot hash, profile revision, and manifest identity. It must not trust a client-supplied `brandId`, silently use the latest profile, or allow the render to drift from the treatment's accepted revision.

## Production Knowledge Policy

### What can be reused

The broad subject coverage in the V3 creative-production material is useful at a semantic level:

- narrative and argument structure;
- audience attention and information hierarchy;
- visual-verbal relationships;
- moment weight, rhythm, continuity, and motivated change;
- shot, camera, lens, lighting, blocking, and movement concepts;
- dialogue, voice, music, ambience, SFX, intelligibility, and loudness concepts;
- graphics, typography, color, compositing, transitions, accessibility, and delivery considerations;
- brand and reference influence without copying protected expression.

### What cannot be injected as authority

The raw V3 document and current graph also contain content-label tables, default dials, hard timing heuristics, technique budgets, historical platform assumptions, and unsupported absolutes. The current Editron rights ledger classifies the graph as an optional internal fixture, never authority or gold truth, and blocks historical editing notes from model retrieval until provenance review.

Therefore:

- Do not place the raw V3 document into Gemini context as a binding production manual.
- Do not convert its content labels into runtime routing or presets.
- Do not treat graph mappings as proof of professional quality.
- Do not make knowledge entries grant capabilities that Editron does not implement.

### Required knowledge entry

Every production rule admitted to model context must be a versioned, source-backed entry containing:

- stable ID and semantic version;
- observable user or audience goal;
- applicability conditions and exclusions;
- semantic guidance separated from executable final form;
- examples and counterexamples from owned fixtures;
- failure modes, preservation risks, and safety limits;
- source IDs, URLs, exact checked dates, versions, and rights disposition;
- explicit non-authority statement and applicable system owner;
- reviewer and promotion status.

Relevant entries should be retrieved for the current treatment. Sending an entire handbook on every request increases noise and does not make the judgment professional.

### Source spine

Use primary, versioned sources for professional and safety-sensitive rules. The current source spine should include, at minimum:

- Blackmagic Design DaVinci Resolve official training for editing, color, Fairlight audio, and Fusion/VFX workflows;
- ARRI Academy lighting and camera education for light behavior, photometry, control, exposure, and safe real-world practice;
- EBU R 128 and ITU-R BS.1770 for delivery-specific loudness and true-peak concepts;
- Netflix camera capture guidance only where its delivery context applies;
- CSATF safety bulletins plus applicable local law, location policy, and qualified on-set authority;
- W3C WebVTT and accessibility standards for timed text and readable delivery.

These sources inform knowledge. They do not certify a generated plan or replace a qualified cinematographer, gaffer, sound professional, safety lead, or editor where the work requires one.

## Editron Implementation Requirements

### A. Compile semantic intent without re-authoring it

Build one Editron compiler input from the persisted production manifest, V3 sidecar, semantic event identities, Brand Visual Evidence Snapshot, approved assets, and actual project capabilities.

Every generated `SequenceRangePlan` or equivalent plan node must point back to the event IDs it executes. Unsupported intent returns a visible compatibility result or safe stop; it must not disappear or become a generic gradient placeholder without disclosure.

### B. Resolve final form through existing owners

Existing family resolvers remain the only owners of exact form. The semantic compiler may rank, license, reject, or route possibilities, but it must not duplicate concrete layout, keyframes, transition form, SFX selection, typography, or animation logic.

### C. Preserve brand authority

Exact approved logos must remain exact assets. Palette, typography, motion, composition, accessibility, and asset choices must be derived from the immutable evidence snapshot and recorded in the execution receipt. Missing evidence must trigger an explicit question, safe degradation, or safe stop according to policy.

### D. Prove the result

Persist an auditable chain:

`treatment event -> script beat -> Editron plan node -> final-form resolver decision -> project mutation -> preview/render receipt`

The receipt must include commit, model/provider IDs, schema and prompt hashes, brand snapshot hash, source/reference IDs, operator versions, project base/result versions, costs, latency, warnings, degradations, and preservation checks.

## Benchmark And Promotion Gate

Contract tests and stubbed browser tests remain necessary but are insufficient. Use a bounded sealed benchmark of 24 cases with three independent runs each, for 72 complete journeys. Coverage tags may describe the benchmark but must not enter runtime requests as video-type routing.

### Required evidence

- All 72 journeys receive blind editorial review.
- Twenty-four predeclared anchors receive a second independent review and an actual render.
- Capture-required anchors receive camera/lighting plus sound/safety specialist review.
- Model judges may assist triage but cannot replace human promotion gates.

### Hard gates

- 72/72 valid schemas, provenance, brand binding, and mandatory-constraint preservation.
- Zero unsupported facts, invented brand assets, unauthorized logos, or cross-brand leakage.
- At least 69/72 human semantic passes, with every case passing at least two of three runs.
- Every mandatory treatment event appears exactly once in the V3 realization unless an explicit many-to-one or one-to-many mapping is receipted.
- At least 69/72 score 4/5 or better for progression, specificity, visual-audio relationship, and continuity.
- 24/24 anchor renders are playable, reloadable from the persisted project, hash-receipted, and free of out-of-range mutation or false-success state.
- Zero ThinkForge final-form leakage and zero unjustified Editron replacement of semantic intent.
- Every critical camera, lighting, sound, rights, privacy, accessibility, and safety failure blocks promotion.
- Weighted agreement of at least 0.70 on dual-reviewed anchors.

The current ThinkForge writer 95 percent gate does not cover these visual-production dimensions and cannot substitute for this benchmark.

## Phased Delivery And Done Lines

### Phase 1: Authority contracts

Build the resolved audiovisual decision, semantic event identity, and Brand Visual Evidence Snapshot contracts. Validate session, brand, revision, hash, and required/forbidden constraints server-side.

Done only when a silent concept remains silent when treatment chooses silence, a required speech concept contains canonical speech, a Brand A snapshot cannot enter Brand B, and no client brand ID can override the session authority.

### Phase 2: Semantic compiler

Make direct import and storyboard paths consume the same persisted semantic events. Emit visible unsupported-intent results rather than generic silent substitution.

Done only when the mixed presenter-plus-cutaway, no-capture graphic piece, product-action-without-speech, and reference-led fixtures preserve all semantic layers and event identities through import.

### Phase 3: Final-form resolution and brand execution

Route each semantic requirement to the existing Editron family owner. Bind exact approved assets and every final choice to the immutable brand snapshot.

Done only when every final-form field has one owner, exact logos remain exact, unsafe contrast choices are rejected, missing assets degrade visibly, and no treatment field shadows an Editron resolver.

### Phase 4: Render and operational proof

Persist plan, mutation, preview, render, cancellation, retry, rebase, cost, and preservation receipts.

Done only when all 24 anchors render from the persisted canonical project, survive reload, and expose an event-to-pixel and event-to-audio audit chain.

### Phase 5: Quality promotion

Run the sealed 72-journey benchmark and qualified review described above.

Done only when every hard gate passes on the exact commit and provider configuration being promoted. A mock, hand-authored fixture, isolated technical render, or single reviewer cannot close this phase.

## Explicit Non-Goals

- No fixed runtime taxonomy of video types.
- No ThinkForge keyframe, layout, transition, or sound-token engine.
- No raw knowledge-document dump into every Gemini request.
- No claim that a standards-informed plan is professionally certified.
- No silent fallback to voice-over, generic placeholders, latest-brand state, or unsupported final form.
- No release claim based only on deterministic tests or mocked model output.

## Final Completion Definition

This gap is closed only when ThinkForge makes a source-backed, brand-bound semantic treatment without speech or capture bias; Editron executes each treatment event through one authoritative final-form path; Shoot Kit projects only genuine confirmed capture work; and sealed real-provider, rendered, and human-reviewed evidence proves the result on the exact release commit.
