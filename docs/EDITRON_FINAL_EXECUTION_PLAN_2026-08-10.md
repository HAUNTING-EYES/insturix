# Editron final execution plan - AI-native editing with Adobe-class capability

## Decision

Editron's destination is a native, web-based professional editing and post
system.  It is not an Adobe API wrapper.  An AI planning layer can understand a
brief, footage, references and a user's request, then choose among certified
Editron capabilities.  It never becomes a second project/timeline/mutation
authority and it never substitutes vague model confidence for a rendered
result.

The product must serve short-form creators and agencies *and* grow into
long-form, production-house and film-post workflows.  Long form is a scale and
reliability target, not a separate preset product.  The user sees one project
experience; internally the runtime handles a 20-second social clip and a
ten-hour documentary differently only where their evidence, processing and
delivery demands differ.

This document supersedes the implementation ordering in the earlier
reconciliation document.  It retains IF1 and all valuable Phase 2C work; it
does not approve a new parallel runtime.

## The desired experience, in plain words

1. A user opens a project and drops in footage, audio, a script, brand files,
   examples, a brief, product images, and optional licensed-stock preferences.
2. Editron preserves each source asset's identity, rights and technical
   metadata, makes playable proxies, and analyses evidence such as speech,
   shots, speakers, text on screen, faces/subjects, movement, music, dialogue
   and silence.
3. The user says what they want in ordinary language: for example, "make a
   confident 45-second launch cut for this brand, use these references, remove
   the bad takes, add subtitles and restrained motion graphics."
4. Before planning, Editron constructs a project-scoped `PlannerEnvelope` from
   the current revision, rights, privacy, brand, media, cost and capability
   facts. The AI sees the compact cited evidence and only the operators that are
   eligible for this request; it does not receive a wish list of unavailable or
   forbidden tools.
5. The AI creates an editorial plan containing proposed moments, goals,
   evidence, alternatives, risk and expected visible changes. An independent
   graph verifier then rejects schema, type, range, state-effect, policy and
   dependency errors. It never teaches the model how to make the edit or repairs
   its creative decomposition.
6. ProjectService applies the approved, canonical commands atomically and gives
   receipts with revision/undo/replay facts.  The renderer produces preview and
   final media.  Validators inspect the actual rendered frames and audio.
7. The user can accept, reject or steer individual decisions, compare variants,
   comment at a timecode, undo safely, and export delivery packages.

The AI should feel fast and creative.  The execution substrate is strict so a
good-looking demo cannot silently save the wrong project or claim a missing
graphic was delivered.

### Mandatory resolved intake - not presets

Before a first cut, Editron must resolve one versioned `EditorialProjectBrief`
for the project.  These facts are mandatory to resolve, but a user is not
forced to supply an artificial preset or an asset that does not exist.  Each
field records whether it was user-supplied, selected from project data,
explicitly absent or still needs clarification:

- **deliverable intent:** what is being made and for whom - for example a reel,
  advertisement, podcast episode, explainer, documentary, film, trailer or an
  open-text description.  This is an open semantic field plus concrete output
  requirements, not a finite style/profile dropdown;
- **source manifest:** every footage, image, audio, document and licensed-stock
  request, including its intended role, rights and immutable source identity;
- **script authority:** the exact supplied script/outline, permission to derive
  structure from transcripts, or an explicit `NONE` when the work is
  unscripted.  A derived transcript must never be presented as the user's
  script;
- **brand authority:** the selected Brand Vault snapshot, project-only brand
  direction, an explicitly unbranded project, or a clarification requirement;
- **reference set:** uploaded videos, stills, audio, lawful external links and
  written examples, each with usage scope - inspiration, structural match,
  visual match, audible match, or a user-marked exact requirement;
- **delivery constraints:** audience, duration/range, aspect and resolution,
  language, accessibility/caption needs, platform and required outputs.

The current hidden `reel | auto-edit` derivation is not sufficient authority
for this contract.  Editron may suggest a deliverable interpretation, but the
user can see and correct it before a first cut whose story grammar or length
depends on that interpretation.  Script, brand and reference are therefore
mandatory *decisions*, not mandatory uploaded files.

## How a model makes a specific editing decision

### 2026-08-12 graph-synthesis correction

The architecture below is proven for bounded, already-implemented families; it
is **not** proof that an LLM can invent a correct multi-operation graph for an
unseen edit. A deterministic compiler can type-check and reject a proposed
graph, but it does not discover the decomposition. A finite technique/template
library can accelerate known edits, but it cannot be the competence boundary
for open-ended editing.

For genuinely open-ended work, the graph proposer is an explicitly unproved
model role. Before production Stage 3, Editron must run the frozen planner
battle test defined in
[`EDITRON_OPEN_ENDED_EDITING_RESEARCH_RECONCILIATION_2026-08-12.md`](./EDITRON_OPEN_ENDED_EDITING_RESEARCH_RECONCILIATION_2026-08-12.md): gold observable
target, focused typed operator set, distractors, template-free condition,
bounded compile/render repair and locked go/modify/no-go thresholds. Known
programs are optional memories and certified fast paths, not the limit of what
the model may propose. Until that test passes, open-ended graph synthesis is an
R&D hypothesis rather than a production capability claim.

The model is a planner/ranker, not a magic effects engine.  Its decision is
connected to evidence and constrained tools:

```text
Project revision + policy + Capability Registry
  -> PlannerEnvelope: eligible operators + bound facts + hard constraints
User goal + CreativeDirection + cited evidence + PlannerEnvelope
  -> model-proposed typed intent/graph with alternatives
  -> GraphVerifier: independently accept or reject; never invent topology
  -> Resolver: chooses only legal concrete form for each accepted family node
  -> ProjectService command with expected revisions
  -> render + deterministic validator + proof/receipt
```

For a requested fast cinematic transition, the planner does **not** write
keyframes.  It proposes a `TransitionIntent` such as:

```json
{
  "boundary": "timeline:00:01:12:10",
  "goal": "energise a motivated change from a speaker to product close-up",
  "evidence": ["shot-98 motion:right", "shot-99 product-reveal", "beat-31"],
  "candidates": ["motivated-whip", "hard-match-cut", "short-dip"],
  "constraints": ["no flashy effect", "brand:confident-minimal"]
}
```

`TransitionFormResolver` then performs the final bounded choice using the
versioned `TransitionCatalog`: availability for the media types, legal handles,
cut/beat spacing, motion/direction evidence, no-dialogue-masking policy,
sequence density, brand restrictions and known failure conditions.  It returns
a catalog ID, duration within legal bounds, direction/easing/geometry parameters
that catalog entry permits, required handles and audio policy.  The renderer,
not the planner, owns the exact implementation.  A validator checks duration,
range, alpha/video/audio compatibility and rendered continuity before the
receipt says it passed.

The same separation applies across the entire audited Editron/Adobe-class
capability surface, not only overlays: source/record editing, trims, tracks,
multicam, keyframes, masks/mattes, tracking, retiming, captions, titles,
transitions, compositing, generated compositions, colour, dialogue, music,
SFX, interchange, conform, render and delivery.  A model can select, sequence,
rank, explain and ask for a missing capability.  It cannot use an Adobe feature
name as an executable tool, pretend a missing Editron primitive exists, write
an unbounded style object, mutate a database directly or manufacture proof.

## Reference-to-execution contract: from a visible result to real operations

A reference is not converted directly into an effect name.  Editron first
describes the observable result, independently of how it may have been made.
For a still reference this includes canvas/aspect ratio, visible regions,
layering, panel geometry, crops, subject placement, typography, colour,
contrast and occlusion.  A video reference additionally supplies shot rhythm,
panel entrances/exits, motion curves, transition boundaries and audible
events.  A still image cannot reveal timing, easing or sound; those facts must
remain unresolved, use explicit alternatives, or be supplied by the user.

The resulting versioned `ReferenceBlueprint` contains cited measurements and
confidence, not raw model prose.  For the vertical classroom collage example,
it would describe a black 9:16 canvas, several repeated rectangular source
windows with explicit normalised bounds and crop focus, black gutters, a
central stacked uppercase yellow title, distressed glyph treatment and title
safe-zone/contrast requirements.  The title is a graphics layer, but the whole
result is a **reference-driven composite sequence**: media selection, trims,
duplicate timeline instances, crops/reframes, layout, optional panel motion,
colour harmonisation and typography.  It must not be collapsed into the
generic MG selector.

The source footage is analysed separately.  `SourceMatch` records map each
reference role to one or more exact source ranges using people/objects, action,
composition, dialogue, motion and crop viability.  Duplicating a shot in a
collage creates multiple timeline references to the immutable source; it does
not copy or transcode the master media.  A missing shot, font, licence or crop
margin is reported as a constraint failure or visible approximation, never
silently invented.

The planner then creates an `ExecutionDAG`, not a free-form list of Adobe tool
names. Before the model is called, Editron removes operators whose owner,
certification, media support, policy, rights, budget or current-revision
preconditions cannot hold. Every remaining capability operator declares:

- required inputs and project/evidence preconditions;
- typed outputs that later operators may consume;
- declared timeline/media state effects and ordering constraints;
- supported media/range/region forms and known incompatibilities;
- cost, latency, privacy, reversibility and proof obligations.

The LLM proposes goals and dependency edges. A deterministic `GraphVerifier`
rejects missing inputs, cycles, unsupported effects, unsafe revision targets
and undeclared state changes. A separate mechanical `ExecutionScheduler`
topologically orders a graph only after it passes. Neither component inserts a
conceptual operator, chooses an edit, or changes the model's decomposition.
Each family resolver remains the sole owner of its concrete form. The planner
may say that a background-only grade needs a mask, but it may not invent mask
geometry, grade parameters or transform keyframes.

For example, suppose the target says: keep the person natural, make only the
background teal, and move the person from left to centre over 24 frames.  A
whole-frame colour operator declares that it would also alter the person, so
it cannot satisfy the target.  The supported graph is:

```text
source range -> subject tracking/mask resolver -> versioned mask asset
source + inverse mask -> colour resolver -> background-only grade
source + subject mask -> transform resolver -> 24-frame position curve
graded background + animated subject -> composite renderer -> visual proof
```

The mask must exist before masked grading and compositing; the transform and
background grade may be prepared in parallel after their inputs exist; the
renderer consumes both.  Those data dependencies, not an LLM's storytelling,
determine the legal sequence.  If several graphs can produce the target, rank
certified native, reversible and cheaper graphs ahead of generated code, then
compare actual preview renders against the blueprint's geometry, motion,
colour, legibility and continuity constraints.

For the collage example the graph is similarly explicit: map source ranges;
create the compound sequence; add and trim clip instances; resolve each
panel's rectangle and crop; add gutters/background; resolve the title using a
licensed font and legal distress treatment; add panel keyframes only when a
video reference proves motion; render; compare against the blueprint; then
apply the approved canonical commands through ProjectService. If a custom
spatial/temporal composite is better represented as code, use a first-class
`GeneratedCompositionProgramV1`: an isolated, immutable, source-bound nested
composition with exposed parameters and the same render/proof gates. It may
combine footage layout, typography, masks, graphics and motion, but it is not
permission for the model to mutate the project, shadow a family resolver or
execute arbitrary code. Most difficult reference edits will be hybrid: native
timeline/audio operations around one or more generated compositions.

This explains how a coding agent can reproduce such a reference today: it can
inspect the reference and source media, write a one-off composition, render it,
look at the output and revise the code.  Productising that behaviour requires
the structured blueprint, source mapping, certified operators, dependency
compiler, canonical mutation and proof chain above so the result remains
editable, repeatable, safe and usable by many customers rather than only in a
single coding session.

The forensic reconstruction, source-matching algorithm, generated-program
contract, sandbox boundary, match-cut acquisition path and model evaluation
programme are specified in
[`EDITRON_REFERENCE_BACKTRACKING_AND_GENERATED_COMPOSITION_PROGRAM_2026-08-11.md`](./EDITRON_REFERENCE_BACKTRACKING_AND_GENERATED_COMPOSITION_PROGRAM_2026-08-11.md).

## CreativeDirection is not a preset

`CreativeDirection` is a versioned project fact that captures what "good" means
for this job:

- the user's brief and direct instructions;
- the brand kit: logo, fonts, colours, forbidden styles and safe areas;
- named reference examples, with permission/usage scope;
- audience, format, platform and accessibility requirements;
- editorial intent: pace, emotional arc, humour/seriousness and density;
- client approvals, rejected examples and deliberate overrides.

It is versioned to make a later decision explainable and reproducible: "this
caption was chosen under the brand snapshot and approved-reference set that
existed then."  It is not a menu of presets and it never prevents a user from
making a new creative request.

## Editorial knowledge system: what teaches the planner

There is no single authoritative document that contains all editorial craft,
all post-production disciplines and the exact controls of every professional
application. The closest lawful, structured spine found in the source review
is Blackmagic Design's free official [DaVinci Resolve training
curriculum](https://www.blackmagicdesign.com/products/davinciresolve/training/).
Its Resolve 20 books, videos and lesson media cover editing, multicam, colour,
Fairlight audio, Fusion/VFX and delivery through project-based exercises. It is
substantial enough to organise the first curriculum, but it is Resolve-specific
and cannot by itself define Editron or professional post.

The owned **Editron Post-Production Knowledge Base** therefore uses a
source-of-sources model:

| Domain | Authoritative starting sources | What Editron extracts |
|---|---|---|
| Editorial and finishing spine | [Blackmagic official training](https://www.blackmagicdesign.com/products/davinciresolve/training/) | Project workflow, trims, multicam, colour, audio, Fusion/VFX and delivery concepts. |
| Premiere/After Effects/Audition workflows | [Adobe Premiere Pro reference](https://helpx.adobe.com/pdf/premiere_pro_reference.pdf) and current official product help | Alternative tool semantics, dynamic-link-style composition and professional Adobe workflow terminology. |
| Timeline and media organisation | [Final Cut Pro user guide](https://support.apple.com/guide/final-cut-pro/welcome/mac) and [Avid Media Composer learning resources](https://learn-cdn.avid.com/Affiliates/Learning_Resources_for_Media_Composer.pdf) | Source/record, magnetic and track-based alternatives; bins, ingest, trim and long-form practice. |
| Compositing and VFX | [Foundry's Compositing with Nuke](https://learn.foundry.com/nuke/current/content/comp_environment/nuke/nuke_intro.html) | Node/dataflow semantics, channels, mattes, roto, merge, reformat and render concepts. |
| Media execution | [FFmpeg documentation](https://ffmpeg.org/documentation.html) and [filter documentation](https://ffmpeg.org/ffmpeg-filters.html) | Actual codec, mux, filtergraph, frame/audio and command capabilities with version constraints. |
| Interchange | [OpenTimelineIO feature matrix](https://opentimelineio.readthedocs.io/en/v0.14/tutorials/feature-matrix.html) | Explicit per-format preservation and loss; no fictional universal round trip. |

We do not copy these manuals into the product and call that intelligence. For
each source, legal review records the licence, allowed storage/use, attribution,
version and retrieval date. Without a licence for persistent full-text use,
Editron stores the link plus an original, reviewable synthesis—not a mirrored
manual or scraped course. User-found videos are unnecessary for the first
pass. After the official-source coverage map exposes real gaps, we may
commission an original, rights-cleared Editron course with professional
editors, colourists, sound editors and VFX artists specifically for those gaps.

Each knowledge entry has one operator-neutral shape:

```text
KnowledgeEntryV1
  concept and intended visible/audible result
  when it helps and when it damages the edit
  evidence required to decide
  affected media/timeline state
  legal operation relationships, not a mandatory template
  preservation rules and common failure signatures
  validation/proof methods
  equivalent software examples and terminology
  current Editron support mapping: certified/experimental/missing
  citations, source version, author/reviewer and rights record
```

The entry for a match cut, for example, can explain that outgoing and incoming
moments need a perceivable continuity relation and list geometric, action,
semantic or audio evidence. It must not force one fixed graph. A model may use
the principle to propose a new combination of certified operators; the graph
still has to pass the same project and render checks.

The live `creative-knowledge-graph.json` is not this finished guide. Code audit
found 115 technique records, 95 mappings and 50 constraints, including many
signal-to-technique aliases. Preserve it as optional, versioned program memory
and benchmark material. Audit every record's source and current runtime truth;
remove claims that are unsupported, and never let an alias match or historical
mapping become production proof, a form owner or the limit of open-ended
planning.

At planning time retrieval is small and task-specific. The model gets the
relevant principles and citations for the observable goal, not the entire
course and not ten hours of raw media. The benchmark includes an ablation with
and without these entries. If the model succeeds only when a near-identical
recipe is retrieved, the measured result is recipe retrieval—not open-ended
editing intelligence.

## Pre-planning constraints and the verifier boundary

The compiler is a check, not a guide rail. Constraints are made concrete before
the model plans, and independently enforced again after it responds:

```text
canonical R_base + tenant/project policy + rights + media facts
  + capability/owner/certification registry + budget
      -> ConstraintMaterializer
      -> PlannerEnvelope
           eligible operator specs only
           exact source/range/track/region facts
           bound privacy/egress and brand constraints
           preservation predicates and proof requirements
           time/token/render budget and permitted preview scope
      -> model proposes candidate graph
      -> GraphVerifier accepts or rejects the graph exactly as proposed
      -> ExecutionScheduler orders an accepted DAG mechanically
      -> resolvers bind owned form -> isolated preview -> validators
      -> ProjectService revalidates current revision before apply
```

`ConstraintMaterializer` does not select an edit. It intersects facts already
owned elsewhere and produces an immutable, hashed envelope. It removes an
operator when the operator is unsupported for the media, uncertified for the
requested use, forbidden by policy, incompatible with rights/egress, missing a
required source fact, or outside the reserved budget. The model cannot call an
operator absent from the envelope because the tool broker also rejects it by
envelope ID; prompt wording is not the security boundary.

`GraphVerifier` performs no creative repair and never inserts a mask,
conversion, transition or missing operation. It validates schema, ports, types,
ranges, ownership, state effects, preservation, policy, cost and proof
coverage. A graph with a conceptual gap returns a typed planner failure. Only
`ExecutionScheduler` may perform deterministic ordering of an already-valid
DAG. At apply time, ProjectService checks the current revision and declared
read/write set again because an envelope valid at `R_base` may be stale after a
manual edit. This last check is concurrency safety, not editorial guidance.

## Core architecture contracts

Every certified Editron capability needs the following declaration.  This is
the complete contract, not merely an Adobe tool list:

| Contract | Meaning |
|---|---|
| Atomic command | one named, versioned operation the system can safely apply |
| Owner | sole final-form and state-effect owner |
| Input/output schema | typed request, result, constraints and errors |
| Support status | certified, preview, experimental, unsupported or retired |
| Planner eligibility | when the AI may propose it, with cost/risk limits |
| Resolver handoff | which concrete form resolver owns the final shape |
| Declared state effects | changed project paths, media effects and revision scope |
| Deterministic validator | preflight and rendered/output checks |
| Mutation path | canonical ProjectService command and expected revisions |
| Proof obligation | versioned state/reload/render/visual/audio/semantic/delivery checks |
| Undo/replay | receipt binding, safe inverse or structured non-retryable disposition |
| Reproducibility binding | media, model, catalog, resolver, brand and renderer versions |
| Privacy/egress/injection policy | what may leave the project, prompt-isolation and tool-boundary rules |
| Failure disposition | fail closed, needs review, partial preview or retry policy |
| Scorecard threshold | quality, latency, cost and failure limits for certification |
| Certification envelope | which delivery/use conditions it has actually passed; never a user-facing preset |

IF1 is already a frozen canonical contract artifact.  It remains a contract
until its issued ProjectService boundary is wired; no one is permitted to
create a competing command, revision, checkpoint, journal, timeline, media or
proof owner in the meantime.

## Capability census correction: the manual editor is part of the tool surface

The current chat registry is not the inventory of what Editron can do. The
inventory begins with every user-visible manual operation, then traces the
chat, Director, worker and API callers that can request the same result. A
button, component, enum member, prompt tool or `OperatorSpec` counts only as a
surface declaration until its actual state write, persistence, renderer and
visible/audible proof are verified.

The 2026-08-12 code reconnaissance found several overlapping, non-additive
inventories: 66 central chat-registry entries, 59 compatibility `createTools()`
entries, at most 58 raw live-chat tools before request licensing, 36 chat
request capability classes, 39 research-only `OperatorSpec`s, two operations
on the direct chat tool-call route, 22 `OverlayType` values and only 13 actual
renderer branches. Request-specific filtering exposes fewer tools to a model.
None of those counts is the product capability count.

Manual editing is also not one coherent command surface today:

- the V2 tool panel explicitly mirrors the V1 panel registry instead of using
  one owner;
- split, duplicate, delete, transforms, opacity, keyframes, speed curves and
  many styles write browser-local overlay state through `use-overlays.tsx`,
  after which save/autosave persists the complete overlay array;
- chat atomic operations write through separate service paths, while the
  manual transition browser calls the direct `add_transition` route that live
  chat deliberately filters as a shadow authority;
- V1 and V2 SFX browsers duplicate search/preview/add logic and, after
  controlled ingest, both add a local `SOUND` overlay rather than invoking one
  canonical edit command;
- the contextual action bar's unknown-command fallback stores an `aiPrompt`
  that no consumer reads, so it does not actually hand the request to AI;
- manual shorthand speed writes `styles.playbackRate`, while renderers consume
  other root speed/playback fields; shorthand fade writes style fields not
  consumed by the verified layer renderers; shorthand trim and drag trim use
  different source-in semantics; and
- autosave is deliberately paused while AI is processing because AI and the
  manual editor do not yet share one revision-safe mutation path. A 409 reload
  is not the planned fine-grained disjoint-edit conflict model.

These are code-grounded parity defects, not reasons to discard the manual
editor. They establish the rule for the target architecture:

> Every supported manual operation must be requestable by chat through the
> same versioned canonical command, owner, resolver, mutation path and proof.
> Chat parity does not mean screen-click automation or a second AI
> implementation. Broken or non-rendering manual paths are repaired or retired
> before they become planner-eligible.

The census must cover, at minimum, project/timeline operations; media ingest,
search and placement; video, image, text and audio properties; cuts, trims,
tracks, markers and keyframes; caption content and the full manual caption-style
surface; transitions; SFX and music; Lottie/HTML/generated compositions;
render, export and delivery; plus every Director, background-worker and API
mutation that has no button. Each candidate row records the complete contract
above plus these observed facts:

| Census evidence | Required record |
|---|---|
| Entry surfaces | exact V1/V2 UI controls, keyboard/shorthand paths, chat tools, Director/workers and API routes |
| Handler and owner | UI handler, service/decision owner, final-form resolver and duplicate/shadow owners |
| Actual state | exact fields read/written, source-range semantics, revision basis and persistence route |
| Consumer | renderer/exporter that consumes those fields, or explicit `DECLARED_NO_RENDER` evidence |
| Parity | `SHARED_CANONICAL`, `UI_ONLY`, `CHAT_ONLY`, `SEMANTICALLY_DIVERGENT`, `SHADOW_LEGACY` or `MISSING` |
| Truth | certified, live-uncertified, partial, research-only, missing or retired, with test/render evidence |

The resulting machine-readable capability packet is the only operation sheet
the open-ended planner benchmark may consume. It contains all real manual and
non-manual operations that survive the audit, not merely the operations that
happen to be registered in chat. An official Adobe comparison happens only
after this current-product census is frozen, and must distinguish Adobe tools,
features and workflows from Editron product duties such as B-roll selection,
dialogue treatment or delivery orchestration.

## Command, proof and human-authority semantics

One command has one writer-issued receipt and may have a later proof outcome.
The mutation and proof are deliberately separate so an asynchronous render job
cannot repeat a project edit on retry.  A command is never called *completed*
merely because the document write succeeded:

```text
preflight -> APPLIED_PENDING_PROOF -> VERIFIED
                  |        |              |
                  |        +-> UNVERIFIABLE (not success; needs review)
                  +----------> FAILED (safe compensation only when declared)
```

Retries reuse the original operation ID and cannot apply the mutation twice.
Expensive external render/model work receives an idempotency key, tenant budget
reservation and cancellation record before dispatch.  A failed or unavailable
proof is a visible `UNVERIFIABLE` or `FAILED` receipt, never a success toast.
Only a declared, safe inverse may compensate a failed operation; otherwise the
receipt carries the IF1 unsafe-undo/non-retryable disposition.

Human direction has explicit precedence: hard safety, rights and access rules
cannot be overridden; an authorised user's direct edit or explicit client
approval overrides planner ranking; the approved project/brand direction then
constrains the resolver; planner suggestions are last.  Every override is a
canonical command with an audit reason, not a side path.

## Model architecture and ten-hour scalability

Yes, a model-centred system can scale to ten hours of material.  No, it cannot
do so by including ten hours of original footage in every model prompt.

As of this plan, Gemini's official video guidance says models with a one-million
token context can process approximately **one hour at default media resolution**
or **three hours at low resolution** in one request.  That is useful long
context, but it is not a ten-hour editing architecture.  See [Gemini video
understanding](https://ai.google.dev/gemini-api/docs/generate-content/video-understanding)
and [long context guidance](https://ai.google.dev/gemini-api/docs/long-context).

For perspective, ten hours at one sampled frame per second is 36,000 frames.
The scalable design is hierarchical and evidence-first:

```text
Immutable masters + checksums/timecode
  -> resumable proxy/transcode and adaptive segment analysis
  -> evidence fabric: shots, transcript, speakers, OCR, sound, motion, rights
  -> section/story summaries that cite exact evidence ranges
  -> project-level editorial plan
  -> selected high-fidelity source windows only when a decision needs them
  -> local commands, render shards, proof and resumable delivery
```

### Current implementation truth - 2026-08-13 long-form/reference audit

The target flow above does not describe today's production runtime.  The code
audit found useful pieces, but no complete long-form evidence fabric:

- the ordinary registration route enforces a 3 GB object limit while the R2
  multipart transport permits objects up to 5 TB.  Storage transport capacity
  is therefore not usable long-form product support;
- the browser proxy path handles only a bounded device/file range, performs a
  client-side transcode, and later swaps the asset record from proxy to
  original.  It does not preserve separately addressable immutable master and
  versioned derivative identities for relink;
- transcription and several semantic/audio providers receive the whole source
  in one worker/provider call.  One transcription path downloads the whole
  asset into function memory.  There is no durable shard/checkpoint/merge
  ledger for a 1.5-3-hour source;
- the deep-analysis worker has a 300-second function ceiling.  Its holistic
  visual call emits at most 12 semantic visual windows, V-JEPA coverage is
  bounded to 360 windows, Wav2Vec receives all speech windows in one request,
  and the result is written as one per-asset analysis document.  At three
  hours, those limits trade away temporal precision rather than create a
  resumable long-form index;
- batch auto-edit currently turns analysis documents into scenes, embeds the
  scenes, retrieves candidates for exact script beats, asks a vision model to
  confirm selected source windows, materialises a native rough timeline, and
  then invokes Director.  The older single-video script editor instead uses
  transcript segmentation and token-overlap/Jaccard scoring.  These are
  separate paths, not one certified first-cut owner;
- current reference-style execution reduces one uploaded video to coarse
  `EditDNA` buckets such as pacing, transition family, colour temperature,
  text weight and graphics density, then supplies them as soft Director
  preferences.  It does not create the required time-bounded
  `ReferenceBlueprint`, does not support one common video/still/audio/link
  reference contract across intake and Director, and does not explain the
  exact placement of a transition, grade, title, mask or generated composition.

The production replacement is a server-side, durable media/evidence pipeline:

```text
multipart ingest
  -> immutable master + checksum + reel/timecode/codec/rights manifest
  -> separately identified proxy, thumbnails, waveform and seekable chunks
  -> idempotent shot/adaptive-time shards with retry/checkpoint/merge receipts
  -> range-addressed transcript, speaker, OCR, subject/action, motion, colour,
     quality, music/dialogue and rights observations
  -> chapter/section summaries whose statements cite child source ranges
  -> project-scoped scalar/time index + vector index
  -> retrieval returns cited `EvidenceBundle`s and only the small proxy/source
     windows an approved observer or planner needs
```

The LLM never browses an object bucket or repeatedly consumes the whole movie.
It normally receives the brief, reference blueprint, capability packet and a
compact cited evidence bundle.  When a decision needs pixels or sound, an
evidence service resolves the cited `assetId + source range + version` into a
short-lived, project-authorised proxy window.  Render workers later resolve
the same stable range against the approved master.  This is how the same
architecture serves a 20-second clip, several two-hour camera files or a
ten-hour programme without turning long form into a user-facing profile.

### Canonical layered media/evidence architecture - recovered source contract

The source documents use the word **graph** for three different structures.
They must remain distinct in implementation and documentation:

| Structure | What it represents | Canonical authority |
|---|---|---|
| Media/evidence hierarchy and optional relationship graph | What immutable media contains and how exact ranges, observations, sections, takes, actions and timeline occurrences relate | R2 objects plus canonical Mongo evidence records; Qdrant is derived search only |
| Processing job DAG | Upload, derive, scan, index, retrieve, analyse, plan, preview, render and proof work split into resumable idempotent units | Durable workflow/job records and leases |
| Candidate edit/transaction graph | The ordered native, family-resolver and generated-composition operations proposed for one edit or bounded sequence | Planner proposal -> verifier/scheduler -> ProjectService apply; never storage or model memory |

The target media/evidence system is deliberately layered:

```text
Layer 0 - R2 professional media foundation
  immutable originals; versioned proxies; seekable video/audio chunks;
  waveforms; thumbnails/sprites; generated artifacts; previews; renders

Layer 1 - Mongo canonical semantic memory
  asset/semantic manifests; range coverage; timed evidence; provenance;
  track chunks; briefs/decisions; source-to-timeline maps; index outbox

Layer 2 - Qdrant derived retrieval plane
  project-filtered section and moment points with named text/visual/audio
  vectors plus sparse lexical fields; always rebuildable from Layer 1

Layer 3 - optional relationship edges
  SAME_TAKE_GROUP, CONTINUES_ACTION, VISUALLY_PROVES, SYNCHRONIZED_WITH,
  DUPLICATE_OF, CONTRADICTS and PRECEDES/FOLLOWS relationships

Layer 4 - authorised retrieval and evidence hydration
  server resolves tenant/project/rights/version filters; searches sections;
  searches moments inside selected sections; rehydrates canonical Mongo
  evidence; refines exact boundaries; returns cited EvidenceBundles

Layer 5 - bounded model view
  brief + ReferenceBlueprint + eligible capability packet + relevant cited
  evidence + short authorised proxy windows when pixels/sound are required

Layer 6 - canonical editing and proof
  candidate edit graph -> verify/schedule/preview -> ProjectService CAS ->
  render from approved masters -> independent state/visual/audio proof
```

Qdrant is the librarian, not the library.  Editron does **not** store a whole
video "in vector form."  The original and derivatives remain ordinary media
objects in R2.  Mongo stores exact, versioned, time-ranged evidence and
provenance.  Qdrant stores compact vectors for searchable section summaries,
shots, utterances, selected frames/crops and audio events.  Every search hit is
re-read from Mongo and resolved to an exact source range before planning or
preview.  A vector similarity is a candidate, never permission to cut.

Long assets use hierarchical retrieval.  A query first searches roughly
30-60-second section nodes across the authorised project, expands for coverage
and adjacency, then searches detailed moment nodes only inside the selected
sections.  Exact lexical/OCR/numeric search, visual vectors, audio vectors and
structured events remain separate channels; their ranked lists are fused and
nearby hits are clustered into source intervals.  The final few candidate
windows receive dense pixel/audio inspection and boundary refinement.  This
preserves exact footage access without asking a model to remember or re-watch
hours of media per decision.

### Agentic tool-calling and durable long-form editing

The vibe-coding analogy is useful, with one safety correction.  A model may
work iteratively instead of serialising a perfect graph in one response.  Its
research/production planning loop may call only bounded read/planning tools:

```text
read current brief/revision
  -> search authorised evidence
  -> inspect exact proxy windows
  -> query eligible capabilities and contracts
  -> propose or revise a local operation/subgraph
  -> compile and preview in isolation
  -> inspect failed predicates/render evidence
  -> repair the failed local node once or return needs-review/capability-gap
```

Tool-calling is therefore the **construction process**.  The versioned,
typed edit graph is the **resulting program and audit artifact**.  Editron must
not commit each speculative model tool call directly to the user's project.
The agent accumulates an immutable working plan against a pinned base revision;
only verifier-approved commands are offered to ProjectService.  This preserves
the useful explore/inspect/revise loop used by coding agents without replacing
the single project/revision/receipt authority.

A final programme up to four or five hours is not represented as one enormous
prompt or one in-memory graph.  It is a persistent hierarchy:

```text
Project/show plan
  -> reel/chapter plans
     -> sequence/scene plans
        -> bounded local edit graphs referencing stable source ranges
           -> preview/proof artifacts and apply receipts
```

The root plan stores story order, global constraints, motifs, rights, delivery
targets and dependencies.  Child plans store exact local operations.  Workers
construct independent/disjoint children concurrently under tenant budgets;
cross-sequence dependencies such as music structure, continuity, repeated
footage, loudness, colour and captions are checked at parent boundaries.  Each
unit is resumable and idempotent.  If the user edits while background planning
continues, unchanged/disjoint units can be revalidated against the current
revision; overlapping units become `NEEDS_REBASE_OR_REVIEW` and cannot write.

The stable capability sheet, tool schemas, approved knowledge and fixed policy
may use provider context caching.  Cache identity must bind capability-packet
hash, schema version, policy version, prompt version, provider and returned
model identity.  Dynamic facts are never placed in a reusable global cache:
project revision, asset/range eligibility, rights, current evidence, cost
reservation and proof state are rebuilt for each plan step.  A cache hit saves
tokens and latency; it is not an authority, evidence source or correctness
proof.

Source masters, their immutable identities, and approved ProjectService
revisions are authoritative.  The evidence fabric is a versioned *derived
observation* layer: each transcript/OCR/shot/audio/motion fact carries source
range, extractor/model version, confidence, creation time and invalidation
links for proxy replacement, relink or correction.  Summaries are indexes with
citations, never replacements for timecode/ranges or source media.  A planner
can first decide at show/reel level, then chapter, sequence, scene, boundary
and frame range.  It retrieves a small relevant window when it needs visual or
audible detail.  Stable project instructions and reference material may use
[context caching](https://ai.google.dev/gemini-api/docs/caching), but caching is
an optimisation - not state authority, correctness proof or a solution to
retrieval.

Gemini may be one model provider, but the architecture requires a model router
and benchmark suite rather than a Gemini lock-in. Today the code is not yet
provider-neutral: Editron analysis and chat commonly default to
`gemini-2.5-flash`, its higher-reasoning paths use
`gemini-3.1-pro-preview`, MG uses those same Gemini families, and several model
choices are spread across factories/configuration and direct call sites. That
is current implementation truth, not the target router.

### Affordable model benchmark before architecture commitment

No provider is selected in advance. The initial planner candidates and public
standard API list prices verified on **2026-08-12** are:

| Candidate | Intended test role | Published standard price per 1M input/output tokens | Important boundary |
|---|---|---:|---|
| GPT-5.6 Luna | low-cost graph planner | $0.20 / $1.20 | Test structured planning/tool use; do not assume it is the best visual judge. Cache writes are $0.25/M and reads $0.02/M at this price snapshot. |
| GPT-5.6 Terra | stronger affordable planner | $2 / $12 | Compare quality gained per accepted edit, not headline benchmark score. Cache writes are $2.50/M and reads $0.20/M at this price snapshot. |
| DeepSeek-V4-Flash-0731 | very-low-cost text/tool planner | $0.14 cache-miss input, $0.0028 cache-hit input / $0.28 output | Test the July 31 post-trained release specifically. DeepSeek's hosted API identifier remains `deepseek-v4-flash` and now routes to 0731; self-hosted/open-weight trials must pin `deepseek-ai/DeepSeek-V4-Flash-0731`. Official API confirms JSON/tool calls; keep it on structured evidence unless the tested route proves approved multimodal handling. Privacy/egress approval is mandatory. |
| Gemini 3.5 Flash-Lite | low-cost multimodal observer and planner candidate | $0.30 / $2.50 | Officially accepts text, image, video, audio and PDF; useful for cheap evidence tasks, but must still prove graph quality. |
| Gemini 3.6 Flash | higher-capability multimodal candidate | $1.50 / $7.50 | Compare only where the cheaper candidates fail; do not send ten hours per request. |
| Qwen3.8-Max-Preview | preview reasoning/vision planner candidate | Token Plan credits; no comparable public pay-as-you-go token rate verified | Exact official ID is `qwen3.8-max-preview`. It is preview and Token-Plan-only, so first run a route/identity, structured-output, function-call, usage, image-input and privacy probe. Treat it as image-plus-structured-evidence, not video/audio capable, until the tested API proves otherwise. Report effective subscription credits and marginal cost per accepted edit separately from token-priced routes. |

Sources: [OpenAI GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna),
[OpenAI GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra), [DeepSeek model and pricing
documentation](https://api-docs.deepseek.com/quick_start/pricing/), [Gemini
model guide](https://ai.google.dev/gemini-api/docs/latest-model) and [Gemini
pricing](https://ai.google.dev/gemini-api/docs/pricing), and the official
[Qwen Token Plan model list](https://www.alibabacloud.com/help/en/model-studio/token-plan-team-overview).
OpenAI prices in this table were refreshed on **2026-08-13**. Prices and model
aliases are volatile; every run records the exact provider model/snapshot,
region, service tier and retrieved price sheet. GPT-5.6 Sol and other expensive
frontier models may run on a small blinded subset as a quality ceiling, not as
the assumed production route.

`qwen3.8-max-preview` is likewise not the normal-user chat default.  Its first
valid placements are: a blinded quality-ceiling arm; difficult reference/graph
construction after cheaper routes fail; and bounded offline repair where its
incremental accepted-edit value exceeds its effective Token Plan cost.  It may
enter normal routing only after the provider probe, Editron benchmark,
privacy/egress approval and measured cost per accepted verified edit pass.

The DeepSeek snapshot identity is separately bound to the [official July 31
change log](https://api-docs.deepseek.com/updates/) and the
[`DeepSeek-V4-Flash-0731` model card](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-0731),
so a future update behind the hosted alias cannot silently change a benchmark
run.

The benchmark prevents API differences from becoming hidden assistance:

1. `ProviderTrialAdapter` sends the same hashed `BehaviourBrief`,
   `PlannerEnvelope`, relevant knowledge entries and output schema. Provider
   adapters translate transport only; hidden retries, prompt rewriting,
   provider search and tool execution are disabled unless the condition
   explicitly tests them.
2. Ineligible/forbidden operators are removed before every call. The research
   envelope still includes several **eligible but irrelevant** operators so a
   model has to choose rather than simply echo the only available path.
3. Round 1 runs all affordable candidates on four development tasks, three
   independent trials each. Tasks span a native multi-operation edit, a
   reference composite, an audio/visual dependency and an honest
   clarify/decline case. Only routes clearing the locked safety floor enter
   Round 2.
4. Round 2 runs the best three routes on eight unseen tasks, five trials per
   task. Names and operator ordering are randomised without changing semantics;
   at least half contain no technique name or similar saved program.
5. Round 3 gives only the best legal candidates to the isolated proxy renderer.
   At most one predicate-specific planner repair is allowed. A second failure
   becomes `NEEDS_REVIEW`/`DECLINED`, not an open-ended loop.
6. Visual and audio observation are scored separately from graph planning. A
   cheap multimodal specialist may produce cited evidence for a text/tool
   planner; this composition is benchmarked as its own route with both costs
   and both failure surfaces included.

Every trial stores raw request/response, envelope and knowledge hashes, graph,
verifier result, preview/proof result, timing, tokens, provider charge and
failure category. The locked scorecard includes:

- schema-valid and first-pass graph-valid rates;
- hallucinated, absent and forbidden operator attempts;
- target-predicate coverage and preservation violations;
- correct clarification/decline when evidence or capability is missing;
- render defects, false accepts and false-success rate;
- blind editor preference against a strong manually authored/certified-family
  baseline;
- p50/p95 latency, tokens, provider charge, render charge, repair count and
  human-review minutes; and
- stability across trials, task families and pinned model revisions.

The non-negotiable safety floor is zero accepted forbidden operations, zero
accepted hard-predicate/preservation violations and zero false-success events.
For the first planner-only screen, a route must additionally reach at least
99% schema-valid output, 80% first-pass valid graphs, 95% after the single
repair opportunity and a maximum **$0.25 model cost per accepted planner
graph**. These are experiment thresholds, not future customer pricing. Before
production rollout, Finance must bind a stricter per-edit budget to the actual
plan price, gross-margin target, render/storage/egress cost and expected human
review.

The economic ranking is:

```text
cost_per_accepted_verified_edit =
  (observer calls + planner calls + retries + renders + storage/egress
   + priced human-review time)
  / edits that pass hard proof and blind acceptance
```

A cheap call that needs repeated repair or manual rescue can lose to a more
expensive first-pass model. The production router is a measured task-route
matrix—not one universal “brain”: cheap default, evidence-based escalation,
and a visible decline when no route clears its envelope. Keep the same
CreativeDirection and evaluator rules across candidates so a provider change
does not silently change product taste.

## Caption quality programme - solving taste legally

There is no trustworthy open dataset that supplies professional caption *taste*
out of the box.  Subtitle corpora generally teach OCR, translation or
audio/video/text semantics, not which rendered typography is right for a brand
and moment.  The [Remotion TikTok template](https://www.remotion.dev/templates/tiktok)
is a useful implementation reference, while subtitle-image OCR and audiovisual
caption research are useful analysis inputs; neither is a licensed taste oracle.

Build an owned, rights-cleared **Caption Evaluation Set** instead:

1. **Source lawfully.** Use client material only with explicit evaluation
   consent, internally commissioned pieces, material produced by Editron, and
   licensed fonts/assets.  Do not scrape creator videos or train on examples
   without rights.
2. **Store evidence, not labels alone.** Every record binds source moment,
   transcript/word timings, visibility/background metrics, CreativeDirection
   snapshot, available fonts, aspect ratio, language, accessibility needs and
   licence provenance.
3. **Generate bounded alternatives.** `CaptionFormResolver` makes only legal
   candidates.  Editors/customers compare two or more actual renders in
   context, then choose, reject or correct them.
4. **Record outcome.** Keep pairwise preference, final approved form, client
   revision, reason tags (legibility, brand fit, pacing, emphasis, collision,
   accessibility) and render/version bindings.
5. **Evaluate before training.** Use the set first to measure/rank candidates
   and prevent regressions.  Start with hundreds of high-quality, diverse,
   consented examples rather than chasing millions.  Fine-tuning is optional
   later and only if measured ranking failure remains.

Caption variety comes from a tested `CaptionStyleGrammar`, not from a fixed
user-facing preset list and not from arbitrary model-generated CSS.  Original
or licensed design work supplies compatible atoms and bounded parameter ranges:
licensed typefaces and weights; casing and line-break rules; anchors and safe
zones; fills, strokes, shadows and backgrounds; per-word/phrase emphasis;
entrance, hold and exit motion; speaker treatment; and accessibility limits.
Designers may author new families, and an approved one-off client treatment may
be promoted only after its rights, fixtures and failure envelope are recorded.

At runtime, the resolver receives the word timings, reading rate, language,
faces and existing text regions, background contrast/motion, aspect ratio and
CreativeDirection.  It filters out incompatible atoms, constructs only valid
combinations, resolves line breaks and placement, renders the best candidates,
and rejects collisions, illegibility, unsafe flashing and timing overflow with
deterministic checks.  A taste ranker may order the remaining real renders; it
cannot make an invalid candidate legal.  Editor/client comparisons improve
that ranking.  This creates broad style range through compatible composition
while retaining one form owner and a reproducible reason for every choice.

The product result is one resolver with an evidence-based default and a clear
user override, not a pile of hard-coded defaults.  Today `subtitle`, `hormozi`,
`tiktok`, generic `font-sans`, manual karaoke and template defaults conflict;
these must converge through the resolver.

## Transition expansion programme

We need more types, but only through an internal, versioned
`TransitionCatalog`, never a random bag of visual effects.  Candidate research
and engineering sources are:

- [Remotion transitions](https://www.remotion.dev/docs/transitions/) for
  controlled primitives and integration patterns.  Verify its licence terms
  before product use.
- [GL Transitions](https://github.com/gl-transitions/gl-transitions) for shader
  candidates.  The repository has an MIT default, but every shader must have a
  per-file licence/header check and ledger.
- [AutoTransition](https://github.com/Yaojie-Shen/AutoTransition) and its
  [paper](https://arxiv.org/abs/2207.13479) for recommendation research, not a
  production authority.
- [Editly](https://github.com/mifi/editly) as a declarative FFmpeg/transition
  implementation reference, not code to import wholesale.
- [Match Cutting](https://cove.thecvf.com/datasets/870) for research evaluation
  of semantic match cuts; respect its research-use terms.

For each internal catalog entry, record: family, licensed implementation,
source/attribution, licence decision, supported video/image/alpha/audio
inputs, direction/range controls, required source handles, audio policy,
brand/epilepsy restrictions, deterministic fixtures, visual/audio proof rules,
and deprecation/migration policy.

Start with one well-tested representative per family:

- editorial: hard cut, match cut, flash/sound bridge;
- temporal: fade, dissolve, dip to colour;
- spatial: push, wipe, iris;
- motivated: whip/zoom/match-on-action;
- stylistic: film burn, ripple, glitch/pixelate, page/cube;
- compositional: matte/reveal and UI-card transitions.

Port or implement each candidate under Editron's contract, render golden
fixtures over video/image/alpha/audio inputs, test handles and undo/replay,
then expand.  Do not import a repository wholesale.

## Full execution sequence

### Stage 0 - establish current truth and protect users (now)

- Keep IF1 frozen; finish its integration only through ProjectService.
- Complete `CAP-0`, the code-grounded capability census. Enumerate every V1/V2
  manual control, shortcut, chat/Director/worker/API caller and renderer, then
  trace each candidate from request to owner, state, persistence and proof.
  Publish a machine-readable operation packet, a human-readable ledger and a
  UI/chat parity matrix. Counts are overlapping until duplicate and shadow
  paths are reconciled; UI presence alone is never support evidence.
- Only after `CAP-0` freezes, complete `CAP-1`: compare the verified Editron
  rows against current official Adobe Premiere Pro, After Effects, Audition,
  Media Encoder and Frame.io documentation. Separate atomic editing features,
  composite workflows and product duties; classify every gap as certified,
  live-uncertified, partial, research-only or missing.
- Create the source/import/consumer ledger for every overlay path in the
  overlay census; reproduce the MG z-order and degraded-delivery failures in
  fixtures.
- Run two bounded, non-binding feasibility spikes before committing to a
  long-form or generated-code runtime: (a) isolated MG execution with no
  network, dependency allowlists, artifact scanning, tenant isolation and
  CPU/memory/wall-time limits; and (b) a sharded media test that measures
  proxy, analysis, playback and render cost on representative long footage.
- Write the durable-workflow ADR.  Existing QStash may be retained only if it
  meets the declared job identity, idempotency, cancellation, resume,
  visibility and retry requirements.  Do not introduce a hidden second queue
  or another ownership runtime.
- Establish the first certification lane: a narrow, real agency workflow with
  defined footage, customer, intervention, approval, latency and cost
  baselines.  This is an internal proof sequence, not a preset or a limit on
  what a customer can create.
- Fix no runtime behaviour yet except urgent false-success defects under a
  bounded, reviewed slice.
- Maintain the S2 SFX human-listening pilot as a calibration experiment, not a
  production selector and not a cap on catalog size.

**Exit:** every manual and non-manual capability candidate, active producer,
mutation route, renderer and proof path is known; UI/chat parity and the Adobe
gap are evidence-backed; no pruning or benchmark decision depends on a filename
or registry guess; the two feasibility spikes have measured input, failure,
latency and cost results.

### Stage 1 - make the editing core genuinely safe

- Wire the IF1-issued ProjectService boundary as the single canonical command,
  revision, receipt, undo and replay path.
- Migrate or explicitly block the remaining legacy writers listed by the IF1
  manifest: Director lock metadata, chat render-proof metadata and MG child
  paths.
- Close writer-issued revision/rollback races, fail closed on unavailable
  workers, and distinguish PASS, FAIL and UNVERIFIABLE proof.
- Enforce the command lifecycle defined above: a canonical idempotent command
  may be `APPLIED_PENDING_PROOF`, `VERIFIED`, `UNVERIFIABLE` or `FAILED`;
  never call the first three success interchangeably.  Persist the original
  operation ID, budget reservation and receipt.  Compensate only through a
  declared safe inverse; unsafe undo remains explicitly non-retryable.
- Expose that lifecycle in the minimal review surface before any live vertical
  can claim a completed edit.  A user must be able to see pending proof,
  verified, needs-review and failed states, then safely undo where supported.

**Exit:** UI and chat make the same canonical request and receive the same
state/render/proof semantics.  No direct writer can report a false success.

### Stage 1.5 - canonical editorial spine

- Define the durable project and sequence graph before a resolver is allowed
  to make complex overlay assumptions: source/reel/timecode identity, explicit
  timeline ranges, tracks, semantic layering, schema versions and a reversible
  saved-project migration policy.
- Define project-scoped compare-and-swap and multi-writer conflict semantics.
  Build no full NLE interface here; establish only the canonical target every
  overlay, command and proof must use.
- Define non-blocking interaction semantics.  A chat request or long-running
  analysis/render job is based on an immutable `R_base` revision and must never
  lock playback, seeking, selection, inspection or a user's next timeline
  command.  The player continues to use the last committed canonical revision;
  a proposed change is a separately labelled preview/composition, not a second
  persisted timeline.
- At apply time, ProjectService compares the plan's declared read/write ranges
  and `R_base` with the current revision.  Disjoint, still-valid operations may
  be safely rebased through their declared command semantics; a same-object,
  same-range, deleted-source, invalidated-evidence or dependent-plan conflict
  must fail closed as `Needs review` and offer replan, side-by-side preview or
  explicit user resolution.  It must never silently last-write-win over a
  manual edit.  A background render and proof remain bound to the revision they
  actually rendered; a later revision cannot inherit their result.

**Exit:** every future vertical has a stable project-scoped target, timeline
identity and conflict rule.  The user can continue editing while AI work is
pending, and no overlay may mutate an unofficial intermediate timeline state.

### Stage 2 - media identity, evidence and workflow records

- Define immutable master, proxy, derived asset and external-stock identities;
  attach checksum, timecode/reel/source range, rights and provenance.
- Run resumable analysis in adaptive shards: proxy, transcription, diarisation,
  scene/shot boundaries, OCR, objects/faces/subjects, motion, audio/music/
  dialogue/silence and quality markers.
- Build cited evidence queries and a hierarchical story map.  Current short
  limits and the three-hour/three-GB assumptions must be replaced by explicit
  scalable media contracts without degrading short-form latency.
- Create a durable job record for every long-running operation: tenant, job,
  parent command, idempotency key, state, retry cursor, cancellation, budget
  and emitted events.  Queue transport is an implementation detail, never the
  source of truth.
- Treat footage, stock metadata, OCR, retrieved references and tool output as
  untrusted ingress.  The planner receives bounded, sanitised structured
  evidence; it does not receive raw instructions from those sources.

**Exit:** the planner can retrieve exact, project-scoped evidence ranges for a
20-second clip or a ten-hour project, relink source/proxy safely, and resume or
cancel work without inventing a second job owner.

### Stage 2.5 - open-ended planner experiment gate

This gate is external and non-canonical. It must not mutate a live project or
become a second planner/runtime authority.

- Freeze four development tasks and eight unseen holdouts. Include one legal
  difficult-reference hero case, one native multi-operation edit, one
  audio/visual dependency and honest clarify/decline cases. Every task has an
  observable `BehaviourBrief`, target predicates and preservation constraints.
- Adapt a focused 30–50-operation slice from the frozen `CAP-0` packet into
  research `OperatorSpec` packets. The slice may include verified manual-only
  candidates through research adapters, but adapters describe existing owners
  and do not create new resolvers, renderers or writers.
- Build a research-only `PlannerEnvelope` before each call. Remove forbidden
  and technically ineligible operations, but retain eligible distractors so
  tool choice is still measured.
- Test the affordable provider routes and staged trial counts in the benchmark
  above with noisy/missing evidence; at least half of holdouts contain no
  technique names, aliases or graph templates.
- Verify every candidate deterministically without conceptual auto-repair;
  proxy-render only the best legal candidates and allow at most one
  predicate-specific planner repair.
- Attribute every failure to observation, retrieval, planning, primitive,
  compiler/runtime or judge. Record validity, preservation, false-success,
  editor preference, latency and cost across repeated trials.
- Decide `GO`, `MODIFY` or `NO-GO` against thresholds frozen before the runs.
  Template-dependent success is not open-ended success.

**Exit:** either a provider-neutral route demonstrates repeatable template-free
graph synthesis within safety, quality, latency and cost limits, or the master
plan explicitly narrows autonomy to certified known families while research
continues. No production control-plane contract is justified by a demo alone.

### Stage 3 - intelligence control plane

- Begin only after Stage 2.5 returns `GO`. Implement `CreativeDirection`,
  `EditorialPlan`, capability registry, `ConstraintMaterializer`, hashed
  `PlannerEnvelope`, model router, prompt/tool isolation, cost budgets and
  evaluation logs.
- Let the planner propose typed intents with evidence citations, alternatives,
  expected effect and confidence/risk.  It never directly mutates documents.
- Retrieve a small set of reviewed post-production knowledge entries by
  observable goal and evidence need. Knowledge can explain principles and
  failure modes; it cannot create missing support or bypass an owner.
- Make capability contracts two-layered: a small mandatory safety envelope
  (owner, I/O, state effects, validation, proof, undo/replay, rights and
  policy) plus a family-specific extension.  Manual UI operations use the same
  canonical commands as AI, preserving a manual escape hatch without creating
  a second automatic writer.
- Isolate model lanes and tools by trust.  A model has no raw database,
  network or renderer access; an action guard checks the project, tenant,
  capability, asset, envelope and declared permission before invoking a bounded
  tool. Web research may create a cited capability-gap proposal; it can never
  install code or promote a capability in a customer job.
- Productionise only the task routes that passed the locked benchmark. Version
  models, prompts, catalog, knowledge entries, envelope and direction with
  every decision; run shadow/canary evaluation before changing a route.

**Exit:** model choice is empirically measured; every AI action is auditable,
policy-bounded and only best-effort re-executable when every dependency is
pinned.  An audit record is never misrepresented as a guaranteed replay.

### Stage 4 - consolidate the creative overlay verticals

Admit one vertical at a time only after it has the Stage 1 command/proof path,
the Stage 1.5 editorial target, project direction and rights/evidence bindings,
a review state, and the Stage 3 action guard.  Each vertical then completes the
whole contract:

Before expanding any catalog or adding a new effect, run that vertical's
**overlay recovery gate**: trace each active UI, chat, Director and automatic
producer through its writer, saved-project projection, renderer and proof
consumer; turn the observed broken behaviour into a representative end-to-end
fixture; repair or retire duplicate form/writer paths; then prove the repaired
path can save, reload, render, report a truthful proof state and safely undo.
Expansion is blocked until the existing representative path works.  This gate
addresses current failures in overlays themselves rather than assuming that a
new resolver or a larger catalog will fix them.

1. **Captions:** resolver + owned evaluation set + safe UI/chat overrides.
2. **Transitions:** catalog + resolver + direct UI/chat/EDL convergence.
3. **Generated compositions and AI-generated MG:** repair stacking and strict
   delivery receipts, then admit `GeneratedCompositionProgramV1` as a
   first-class job-specific nested composition for footage layout, typography,
   masks, graphics and motion. Keep one codegen/composition owner; retain SaaS
   explainer as a separate scoped experience. Generated code executes only in
   the Stage 0 isolated worker: no network, allowlisted packages, immutable
   tokenised inputs/outputs, per-tenant quotas and isolation, artifact scanning
   and CPU/memory/wall-time limits. Native family resolvers retain final-form
   ownership for captions, transitions, masks/tracking, colour and audio.
4. **SFX/music/dialogue:** licensed catalog, rights-aware resolver, human
   calibration, mix/ducking/beat evidence and audible proof.
5. **B-roll/image/reframe and editorial effects:** placement/camera motion,
   speed/fade/shake and later colour owners.

For every completed vertical: migrate callers through adapters, prove fixtures,
then remove duplicated executable writers.  Do not move a folder to `legacy`
until no imports/callers remain and saved-project compatibility is covered.

**Exit per vertical:** same result from chat/UI/auto-edit; a rendered proof;
safe undo; no second form owner; quality scorecard clears threshold.

### Stage 5 - one user, review and delivery experience

- Show AI decisions as a readable plan with evidence and preview alternatives,
  not as opaque background work.
- Make operation state conspicuous throughout the product: `Brief`,
  `Analysing`, `Proposal ready`, `Preview`, `Applied pending proof`,
  `Verified`, `Needs review`, `Failed` and `Cancelled`.  Neither a background
  worker nor a model may collapse `Needs review` into success.
- Support timecoded comments, compare viewer, approvals, variants, version
  history, aspect-ratio/language/caption deliverables and client handoff.
- Add QC for missing media, fonts, rights, caption safety, audio peaks/loudness,
  black/silence and delivery package integrity.

**Exit:** a client can review, correct, approve and receive a verifiable
delivery without engineering rescue.

### Stage 6 - professional NLE and long-form foundation

- Native timeline: source/record editing, bins, tracks, trims, insert,
  overwrite, replace, lift/extract, takes, multicam, relink and timecode.
- Long-form global infrastructure: project/reel subdivision, segmented playback,
  shared derived-media indexes, sharded resumable render and analysis,
  distributed job observability, archival/restore drills and permissioned
  collaboration.
- Interchange: OTIO/FCPXML first with per-format loss matrices; later AAF-style
  audio turnover.  Never claim full round-trip fidelity a format cannot retain.

**Exit:** a large real project remains responsive, recoverable and auditable;
short-form remains fast because it uses the same infrastructure with smaller
work units, not a crippled profile.

### Stage 7 - agency certification

Run real, consented agency projects with no hidden manual rescue and certify
only the functions proven in use:

- dependable ingest, proxy/search/relink and rights-aware assets;
- strong editorial and brand-aware captions, transitions, MG, B-roll, SFX/music
  and dialogue treatment;
- safe UI/chat parity, undo/replay and no false success;
- rendered visual/audio proof, comments/approvals, variants, QC and delivery.

For each certification run, publish the project class, capability version,
holdout/acceptance sample, annotation and reviewer process, designated owner,
human-intervention minutes, client-approval outcome, proof-pass rate,
rights/safety incidents, p95 latency, cost and failures.  A fatal false-success
rate must be zero.  All manual work is visible in the scorecard; it cannot be
silently counted as an Editron success.

**Exit:** certification is based on scorecards and actual project outcomes, not
a polished demo.

### Stage 8 - production-house and film-post certification

Add and certify the additional post requirements:

- camera cards, reels, timecode, audio rolls, dailies, proxy/relink, bins,
  tracks, takes, mixed frame rates, multicam and script sync;
- colour-management, RAW/log, scopes, SDR/HDR, shot matching and grade review;
- professional audio: ADR, restoration, buses, automation, stems and surround/
  Atmos-grade handoff;
- VFX pulls: handles, plates, mattes, EXR, shot/task/version tracking and
  change lists;
- picture lock, conform/reconform, burn-ins, interchange, mastering, IMF/
  versioning, security, QC, archive and restoration tests.

**Exit:** only after end-to-end productions pass these workflows should Editron
claim production-house or film-post replacement.

## Authoritative code-grounded execution ledger - 2026-08-17

This ledger is the current status authority for this plan. It reconciles the
August planning documents, the task transcript, Git history, registered
worktrees, active imports and consumers, frozen artifacts, benchmark receipts
and current code. Where an older status paragraph or checkbox below disagrees
with this ledger, this ledger wins. Design intent still comes from the plan;
implementation status comes from code and executable evidence.

The governing design for durable Sequence/Range planning, bounded exact-edit
operation graphs, agent/tool history, render economics and the corrected
whole-episode model benchmark is the
[agentic editorial planning and benchmark reconciliation](./editron/open-ended-editing/oe-agentic-editorial-planning-and-benchmark-reconciliation-2026-08-17.md).
Its complete benchmark error ledger supersedes earlier aggregate provider
rankings and ambiguous `executable pass` interpretations. This execution ledger
remains the authority for implementation status.

The material constants, authored fixture choices, provisional thresholds,
invalid earlier evidence and unresolved production assumptions found from
2026-08-10 through 2026-08-20 are maintained in the
[hardcodes, assumptions and evidence-debt register](./editron/open-ended-editing/oe-codex-hardcodes-assumptions-and-evidence-debt-register-2026-08-20.md).
No fixture or research budget in that register becomes a product default
without a separately declared owner, calibration scorecard and held-out proof.

The audited active lane remains `editron-worktree` on
`infrastructure-improvs-+Editron`. The 2026-08-20 assumption-register audit was
run at `012012c5b1ea0aeaf689e1d3c17aaaa05dc35326`, exactly aligned with its
upstream at that instant. The earlier reconciliation anchors remain historical
evidence. The worktree is intentionally dirty with work from this programme.
This reconciliation does not reset, clean, stash, merge, commit or push that
work.

Status vocabulary used below:

- `DONE_ARTIFACT`: an accepted, immutable contract, census or report exists;
  this does not imply active runtime wiring.
- `DONE_ACTIVE`: verified active control flow reaches the intended owner and
  consumer on the active branch.
- `PARTIAL_ACTIVE`: useful active implementation exists, but one or more
  required authorities, callers, proofs or safety properties remain split.
- `RESEARCH_PROVEN`: an isolated research path executed and produced evidence;
  it is not a production capability.
- `NOT_WIRED`: code or a contract exists, but the product does not consume it
  end to end.
- `MISSING`: no implementation satisfying the stated contract was found.
- `INVALID_EVIDENCE`: an earlier score or verdict was produced by a benchmark
  condition that did not test what it claimed.
- `RAW_EXECUTED`: calls or jobs ran and their bytes/receipts are preserved, but
  no validity claim is implied until the governing contract is reconciled.

### Repository, IF1 and Phase 2C truth

| Item | Current status | Code-grounded meaning |
| --- | --- | --- |
| IF1 canonical contract | `DONE_ARTIFACT` | Annotated tag `editron-interface-freeze-1` (`71b67a4d...`) targets accepted commit `5a47e00896e0e915cd4c03e71a0b104ac0c05999` in worktree `editron-if1-freeze-v1`. It descends Phase 2C `7e9b4dd7...`. Session A's semantic review passed. |
| IF1 on the active infrastructure branch | `DONE_ARTIFACT`, `NOT_WIRED` | Commit `d1402ff38` restores the reviewed five-file IF1 freeze candidate to active HEAD. `lib/editron/if1` is present only as an inert vocabulary artifact; no production path imports it and ProjectService does not implement its issuer boundary. Therefore **IF1 freeze artifact is active; IF1 runtime migration is not**. These are separate claims. |
| Writer-issued after-revision and rollback work | `PARTIAL_ACTIVE` | The active branch independently added stale-save CAS, checkpoint CAS, writer-receipt capture and receipt-bound rollback on migrated paths. The exact migrated `R_after` race is closed on those paths. |
| Whole-system rollback/concurrency safety | `PARTIAL_ACTIVE` | `CheckpointService` can still pair a caller-supplied project snapshot with a separately sampled revision; live `saveProject` callers omit `expectedRevision`; generic `ProjectService.updateProject` has no CAS/receipt; redo is unavailable. Broad "rollback race closed" is therefore false. |
| P0 internal-worker fail-closed hardening | `DONE_ARTIFACT`, `NOT_WIRED` here | Commit `5299a42...` exists only in `editron-p0-hardening` and covers Director, Tribe and Video Analysis. It is not an ancestor of the active branch. The active routes still fall back to raw handlers when a QStash key is absent, and other internal workers have the same class of fallback. |

The active native `ProjectMutationReceiptV1` remains much smaller than IF1: it
contains project ID, revision and commit time, not canonical command hash,
timeline revision, changed paths, proof result, undo/replay binding or the full
retry disposition. Existing safety work is valuable, but it is not IF1 runtime
convergence.

### Stage 2.5 current evidence ledger - 2026-08-23

This subsection supersedes older "calls pending" and paid-cohort status text
below. The bullets remain as a chronological audit trail; the checkpoint in
this paragraph is authoritative for resuming work. The latest verified
programme code checkpoint represented by this ledger is `07c59690b` on
`infrastructure-improvs-+Editron`. The programme worktree is intentionally
dirty with unrelated user work that must remain untouched.

<!-- CURRENT RESUME CHECKPOINT: 07c59690b. Deterministic proposal recovery, two
real bounded native owners (cut_section plus focal-scale set_keyframes),
immutable reference/runtime-budget owners, strict
outcome-proof completion mechanics, a concrete cut/focal Phase-0 proof adapter
and one clone-supplied current proposal revision plus deterministic concrete-
owner issuer are implemented with zero-network tests. The cut owner no longer
keeps a private revision map. The clone now independently derives every
admitted writer revision from exact scope, base/previous revision, call and
before/after state, rejecting missing proof, state drift and copied/forged
revision material before the working revision advances. No live Remotion execution
or production apply is proven. The exact cut-then-focal-scale state chain now
has one versioned multi-operation outcome policy, two separate baseline-bound
render requests and required per-frame pixel inspection; zero-network tests
prove PASS, FAIL and UNVERIFIABLE behavior. Commit be8e12871 proves the exact
two-owner chain across two real OS processes: the suffix process reconstructs
the isolated proposal, replays only the committed cut, consumes the writer-
issued cut revision through an opaque result reference, executes only the focal
mutation and preserves canonical state. Its injected renderer intentionally
returns skipped evidence, so rendered obligations remain UNVERIFIABLE. Commit
1764a8ff8 adds the missing transport-neutral PlanService durable lifecycle
worker: claim, exact execution-time resolution, owner assertion, heartbeat,
resume-state CAS, cancellation, typed retry/dead-letter and owner-bound terminal
receipt all use the one existing durable store. Commit ee07f11cf then freezes
the exact PlanService-bound provider execution envelope, including immutable
scope, route, opaque tool set, isolated-proposal policy, reference identity and
runtime-budget binding. It correctly represents a fresh start without inventing
an empty resume checkpoint and accepts a resume checkpoint only as an optional
matching recovery artifact. The research provider durable worker still owns a
different job identity and requires a pre-existing checkpoint; directly feeding
it the PlanService job would be false convergence. Commit 454fb721a extracts
the resumed provider loop and durable outcome finalization into shared,
store-neutral modules while retaining the research worker as its lifecycle
adapter. This closes the duplicate-loop prerequisite for resumed execution,
not the product adapter or fresh-start proof contract. Commit e1a8e4a3f then
binds writer-bearing Plan envelopes to the exact ProjectService proposal-
recovery artifact; commit 31fcb279e extracts one store-neutral checkpoint
codec; and commit cd1829223 adds the PlanService resumed-execution owner over
the same scoped artifact owners, resumed core and outcome finalizer. The two
durable job identities remain distinct and the canonical project remains
unchanged. Fresh provider execution is still rejected. Provider 429/timeout
attempts terminalize as UNVERIFIABLE rather than retrying because the current
runtime guard can resume accounting only for committed tool turns; retrying a
failed provider attempt would otherwise forget potentially billed usage. Only
typed artifact-owner failures before provider invocation are retryable. The
durable resume cluster passes 55/55 at cd1829223. Commit 2e2471adc preserves
the V1 outcome-proof receipt byte-for-byte and adds a V2 receipt under the same
proof authority whose subject explicitly distinguishes
FRESH_EPISODE_RECEIPT from RESUMED_EPISODE_RECEIPT. A fresh trace must equal
the episode receipt; a resumed trace must bind a distinct resume receipt.
Unknown, copied, forged and tampered trace identities fail closed. The focused
outcome/resume cluster passes 49/49 with repository typecheck and quiet ESLint
clean. Commit f3b6ad44d adds a separate V2 finalizer that has no V1 fallback.
Commit d17ba67c1 then exposes V2 proof through the sole ProjectService clone,
adapts the existing cut/focal proof owner for honest resumed traces only and
switches the product Plan resumed adapter to that V2 finalizer. Fresh traces
fail before rendering; the separate research worker retains its V1 lifecycle
for backward compatibility. The migrated durable cluster passes 55/55 with
repository typecheck and quiet ESLint clean. Commits f57d0cb1c, 88114ec5a,
55b06b9e8 and 5f2c3b1f9 then add durable post-result provider-attempt
accounting and restart recovery. Commits 7cc90f161 and da252954b add the exact
pre-dispatch intent and checkpoint identity. Commit 9cf3cde0f connects that
write-ahead boundary to the provider episode: invocation cannot begin before
the callback confirms the pending-intent checkpoint; a recovered unresolved
intent is conservatively charged and durably converted to an attempt before
any separately authorised retry; stale ProjectService revisions fail before
reconciliation or invoke;
and the same logic survives a crash after an earlier accounted attempt. The
focused recovery suite passes 20/20, with repository typecheck and quiet
ESLint clean. Commit 8a2f4d535 then closes the product callback seam without a
second store or lifecycle: the shared resumed core requires both attempt phases
when invoked by the Plan owner, and the existing leased Plan resume-state CAS
persists the pending dispatch intent before provider invocation and the
reconciled attempt afterward. The Plan integration test proves sequence 1 is
the pending intent, sequence 2 contains the reconciled 429 attempt with no
pending intent, and an incompatible runtime guard dead-letters before invoke.
The focused Plan/core/worker suite passes 25/25, with repository typecheck and
quiet ESLint clean. Commits bfecfb314 and c6c416592 then add a real fresh
ProjectService proposal clone and a store-neutral fresh provider core without
manufacturing checkpoint history. Commit 898c3ba63 wires that core through the
existing Plan lifecycle: the first durable state is created only by a real
dispatch, attempt or writer event, and any later delivery resumes through the
same checkpoint/recovery path. Commit 93a72e756 removes the checkpoint-only
restriction from the existing cut/focal V2 proof port; a fresh cut now produces
the same exact state/render/visual proof contract as a resumed cut while the
canonical project remains unchanged. The focused fresh/resumed Plan and proof
suites pass, with repository typecheck and quiet ESLint clean. Commit
62fcc6c25 then proves the complete accepted-Plan -> generic fresh execution
owner -> real ProjectService proposal clone -> concrete cut_section owner ->
writer-issued revision/recovery -> strict V2 state/render/visual finalizer path
in one zero-inference receipt. It reaches PASS with three bound proof references
while canonical ProjectService state stays unchanged. Commit 5e0dd3b65 closes
the process-loss edge: after a real pending dispatch intent is durably saved,
an expired lease and fresh worker conservatively commit exactly one unknown-
outcome attempt, terminalize UNVERIFIABLE and make zero provider calls. A user
cancellation takes precedence on redelivery and retains the pending intent for
audit. All 242 provider-native tests pass (two intentional skips), with full
typecheck and quiet ESLint clean. Full Plan-to-real-native research-proxy
integration and zero-inference crash/cancellation proof are therefore complete.
Live authenticated QStash/Atlas recovery, live renderer evidence, canonical
ProjectService proposal apply/reload and paid resumed inference remain open.
Automatic provider retry remains unauthorised.
Commits 0f54a0a2a and b6171bed2 add the product transport adapters without
promoting the research proxy: authenticated actor scope binds the accepted
Plan node before QStash publication; the fixed HTTPS worker receives only a
strict versioned job identity; a returned message ID is durably recorded even
if the signed worker wins the claim race; and missing token/signing keys,
missing execution owner, widened payloads and ambiguous delivery fail closed.
No app route or production execution-owner composition root is exported, no
provider or renderer is invoked, and no project is mutated. The durable/
provider-native regression battery passes 317 tests with two intentional skips,
plus full typecheck and quiet ESLint. Commit 434563cd6 then removes the need
for a static per-episode definition registry: one worker execution owner
revalidates each accepted PlanService definition, derives only that Plan-bound
episode-definition resolver and delegates all execution and proof behavior to
the existing provider-native owner. Two different episodes reach their own
downstream guard, while a forged definition stops before any downstream owner;
the focused lifecycle cluster passes 37/37 with full typecheck and quiet
ESLint. This is definition composition only, not a product composition root.
Commit 498e018e6 then freezes the production-shaped canonical-media binding and
adapter used by that future root. It stores no media bytes, binds either native
video or ordered timestamped images to exact scope, accepted route, source
asset/version/content hash, policy authorization, manifest and per-artifact
hash/length identity, and rejects scope, route, policy, record and byte drift.
This proves the contract and owner-port boundary only: the concrete canonical
media locator, byte reader and rights/privacy policy authority remain unwired.
Commit de472b32b then freezes a distinct product-budget authorization,
reservation and settlement contract plus an adapter to the existing runtime-
guard owner port. It binds exact scope, wallet, route/pricing, hard limits,
approval, durable-job execution evidence and the existing job budget artifact
identity. The 8 focused and 76 adjacent tests pass with full typecheck and
quiet ESLint. It does not move credits: CreditsService still lacks the atomic
hold plus partial-settlement ledger and durable locator required by the port.
Commit 6d8fdf1ea corrects that unwired contract before persistence: customer
pricing now hash-binds the existing `main` credit pool, revision-1 product-
budget artifact/guard identifiers advance to revision 2, and an altered pool
fails reconstruction. No revision-1 fallback or live artifact migration is
needed because no product route or stored product reservation exists.
Commit 582c927d0 adds the product-budget policy coordinator and its explicit
atomic-ledger transaction boundary. It deterministically reserves the exact
revision-2 authorization against the main wallet pool, allocates subscription
before top-up, replays duplicate reservations without a second write, settles
actual usage by charging subscription before top-up, releases proven unused
credit, preserves the full hold when provider outcome is unknown and resolves
only an exact still-reserved runtime guard. Insufficient balances, subscription
lifetime conflicts, expired releases, forged scope and conflicting settlement
replays fail closed. The 15 focused and 83 adjacent tests pass with repository
typecheck and quiet ESLint. Its ledger is injected and tested in memory: no
Mongo collection, multi-document transaction, CreditsService wallet write,
live credit movement or production reservation locator is thereby proven.
Commit 5f7428248 then implements that port through the existing CreditsService
owner and the same configured Mongoose database. One majority-write/snapshot-
read transaction contains the user/org main-pool movement, permanent product-
budget reservation record and org reporting row. The record has deterministic
reserve/settle receipts, a unique guard identity, exact record-hash CAS and no
TTL; capped embedded history is audit only. Injected transaction tests prove
user and org reserve/settle, duplicate replay, exact guard lookup, rollback when
the record insert fails and rejection of unsupported wallet precision. Commit
9931ae77a separately corrects a stale billing assertion to the already-current
subscription/top-up split refund behavior. The combined wallet/durable cluster
passes 153/153 with repository typecheck and quiet ESLint. This is
`CONCRETE_ADAPTER_IMPLEMENTED_NOT_LIVE_PROVEN`: the default connection path is
not yet exercised against non-production Atlas and no product execution root
or route invokes it.
Commit 607212e02 next implements the three read-side canonical-media ports:
exact scoped bindings and independent unexpired/non-revoked policy grants come
from immutable Mongo records, while bytes remain exclusively in the declared
R2/GCS object selected by the existing `mediaAssets` row. Commit 8bf1d766e then
corrects the pre-issuance artifact shape: immutable scope-specific binding
metadata is owner-qualified as USER or ORG and stored outside the byte row, so
one object can be reused across episodes and org-shared media remains correctly
owned. Both reference arms and scope/ownership/policy/storage/byte drift are
covered; the combined related cluster passes 32/32 with repository typecheck
and quiet ESLint. This does not create a
second media store and does not accept cached URLs or backend fallback as
proof. It is `CONCRETE_READ_ADAPTERS_IMPLEMENTED_NOT_ISSUED_OR_LIVE_PROVEN`:
no authorized product writer yet persists these records and no live store was
contacted.
Commit 9251945e4 adds the store-neutral canonical-media issuance law and owner.
It binds a hashed source version, exact binding record, independent unexpired
rights/privacy authorization and the complete owner-consistent artifact set;
the policy owner must approve before one injected atomic create-or-compare
ledger is called. Native-video and ordered-image issuance, deterministic
replay, revoked/expired/future grants, copied scope, duplicate or missing
artifacts, owner drift, forged source records and policy refusal pass 19/19
focused tests with repository typecheck and quiet ESLint. This is
`ISSUANCE_POLICY_AND_IDENTITY_OWNER_PROVEN_NO_PERSISTENCE`: no concrete Mongo
ledger writes these records and no live store was contacted.
Commit 07c59690b implements that ledger through the existing Editron Mongo
client. One snapshot-read/majority-write transaction revalidates source,
authorization and artifact identity against existing `mediaAssets`, then
create-or-compares source-version, binding, policy and artifact metadata under
deterministic document identities. Mongo `_id` is treated only as transport
metadata on read. Exact replay, USER/ORG ownership, R2/GCS identity, conflicts,
mid-transaction rollback and non-commit pass 29/29 focused tests with repository
typecheck and quiet ESLint. This is
`CONCRETE_TRANSACTION_ADAPTER_IMPLEMENTED_NOT_LIVE_PROVEN`: no Atlas instance
was contacted and no product root invokes it.
Commit 061fc5168 closes one prerequisite that the earlier "single execution
root" shorthand hid: the Plan-bound owner can now derive shared artifact owners
from each already-validated definition. A Terra definition and a Luna
definition therefore receive their own route-scoped downstream composition,
while a forged Plan stops before that factory runs. The static injected-owner
form remains available for bounded tests. This is
`ROUTE_SCOPED_OWNER_DERIVATION_PROVEN_NO_PRODUCT_ROOT`; it does not itself
construct canonical media, budget, transport, ProjectService-clone or proof
owners.
Commit 7b81f6006 then removes a billing-policy violation from the existing
durable transport: one durable provider attempt now performs exactly one HTTP
request. The standalone research transport can still exercise retry behavior,
but the Plan worker cannot hide a 429/5xx retry inside one authorization or one
attempt receipt. Eight focused transport tests plus repository typecheck and
quiet ESLint pass. No provider was called.
Commit 2683002e7 extracts the existing token, cost, candidate, turn, dispatch
and resume mechanics into one configurable provider runtime-accounting core.
The sealed-holdout class remains a thin research authorization and receipt
owner over that core; it was not promoted into product authority. Exact guard,
authorization, limits, pricing and request-bound token-evidence identities are
injected, persisted resume events are re-derived, and unsafe-integer token or
cost arithmetic fails `RESOURCE_ACCOUNTING_UNVERIFIABLE` before dispatch or
further execution. Accounting, settlement, dispatch and resume verification
passes 24/24 with repository typecheck and quiet ESLint. This is
`SHARED_RUNTIME_ACCOUNTING_MECHANICS_PROVEN`.
Commit 9a2a8d9ad then implements the product runtime-guard factory. It strictly
rebinds one exact CreditsService authorization/reservation, maps its immutable
route, pricing and limits into the shared core, and accepts input-token evidence
only through a route- and serialized-request-bound receipt. Copied receipts,
route drift, forged reservations and token-counter failure stop before provider
dispatch. The focused runtime/budget/resume suite passes 36/36 with repository
typecheck and quiet ESLint.

Commits 133a15596 and b8f8a439d then implement the current OpenAI and Google
product input-token-count owners. The OpenAI owner calls the official Responses
input-token endpoint with the exact serialized request. The Google owner
strictly translates the current stateless Interactions subset into the official
multimodal `countTokens` request without flattening image/video bytes into text,
then applies a versioned conservative margin and structural allowance. Both
receipts bind the exact route and generation-request hash; copied routes,
unsupported request material, missing credentials and malformed provider
responses fail closed. The final focused cluster passes 21/21 with repository
typecheck and quiet ESLint. This is
`PRODUCT_GUARD_AND_CURRENT_ROUTE_TOKEN_COUNTERS_IMPLEMENTED_NOT_LIVE_PROVEN`:
no provider count or inference call occurred and no product composition root
invokes either owner yet.

Commit ce3e988a4 then derives terminal product-budget settlement from the
immutable durable-job terminal state and the exact runtime checkpoint. Normal
successful provider calls are priced from hash-bound cumulative runtime usage;
exceptional or unknown attempts remain separately receipt-bound. Proven
pre-dispatch cancellation releases the hold, while pending or unresolved
provider outcomes conservatively preserve it. A separate customer-pricing
receipt is required before actual customer charge, and only the existing
CreditsService owner moves wallet state. The focused accounting suite passes
26/26 with repository typecheck and quiet ESLint. This is
`TERMINAL_SETTLEMENT_DERIVATION_PROVEN_NOT_WORKER_INVOKED`: the durable worker
does not yet invoke or redrive settlement after a terminal commit.

The production root is now explicitly decomposed into these remaining gates:

1. Invoke the existing terminal-settlement owner from every terminal durable-
   job path and from terminal redelivery. A crash after job completion but
   before wallet settlement must produce a non-success response, then redrive
   the same idempotent CreditsService settlement without rerunning the episode.
2. Make the reference materializer register every source and derived artifact
   in the existing `mediaAssets` owner with content hash, byte length, storage
   identity and canonical envelope before issuance. The current reference-frame
   sampler uploads R2/GCS bytes only, so ordered-image issuance cannot yet work
   end to end.
3. Compose, behind the existing definition-bound execution owner, the exact
   route-scoped canonical reference owner, CreditsService locator/runtime guard,
   ProjectService isolated clone, existing cut/keyframe dispatcher and proof
   owner, and durable live transport. This remains an isolated proposal path;
   it must not mutate the canonical project or create another timeline owner.
4. Export the signed product route, then run the non-production Atlas/QStash
   crash/restart/redelivery exercise that proves the actual transactions and
   write-ahead recovery.

The inline research reference artifact and sealed-holdout controller remain
ineligible as product authorities. Exercise the real provider or renderer only
after fresh zero-inference preflight and explicit external-cost authorization;
do not rerun paid cohorts without both. -->

**Immediate native-handoff reliability reconciliation:** the previously listed
CAP-2A/native-V3R closeout is no longer pending. Its CAP-2A snapshot was
reissued against a stable source snapshot; the native V3R4 benchmark identity
explicitly binds the writer-issued
post-mutation revision in direct and opaque-reference arms; the evaluator
rejects missing, stale, forged and copied-literal revisions; the stale cohort
assertion was corrected; zero-inference preflight passed; and all eighteen
Luna/Terra/Gemini rows completed fairly under three tool orders. Those results
are bounded `VALID_EVIDENCE / RESEARCH_PROVEN` for the DEV-03 handoff/order
claim only. They do not need another paid rerun unless their frozen inputs,
operator contracts, evaluator policy or provider routes change.

The active Stage 2.5 reliability work starts after that completed closeout.

**Superseding V4R current-context execution checkpoint (2026-08-22):** commit
`ccbe5fc2d` fixes a current-only proof-eligibility defect discovered by a
partial run: generic visual retrieval plus any native mutation could previously
claim `READY_FOR_PROOF` even where no current proof owner existed. The reissued
manifest `df6d9024...` binds the evaluator and dispatcher to the same explicit
proof-owner set and forbids HOLD-01 range deletion. Fresh zero-inference
preflight receipt `ba2174fd...` passed all 45 initial requests with zero
inference or project access. The complete cohort receipt `fe4a3420...` records
13 claim-proof passes, 15 hidden-evaluation failures, two decoded claim-proof
failures, 15 Gemini-429 provider non-evaluations, zero resource-guard stops,
157 provider turns, `$2.91745742` spend and zero project reads, mutations or
state effects. Luna produced 7/15 proof passes and Terra 6/15; one row per
provider/case is not a reliability estimate or leaderboard. Gemini remains
unmeasured, not failed. Reopening the completed root returned the identical
receipt without duplicate work. Stage 2.5 remains
`MODIFY_AND_PROCEED_RESEARCH`; forced route, dependency/invalidation,
conflict/rebase/lock, mid-episode resume, long-form and blind-editor gates remain.
Full interpretation is in
`docs/editron/open-ended-editing/oe-v4r-stage25-generalisation-results-2026-08-22.md`.

**Route-ablation provider preflight checkpoint (2026-08-22):** commit
`18ac28f9b` binds the committed eight-row route-ablation qualification to Luna,
Terra and Gemini 3.7 Flash without changing the target or hidden evaluator.
Provider manifest `fe744744...` contains 24 rows: two target scopes x four route
arms x three provider routes. Real zero-inference preflight receipt
`0f2e02ce...` binds request-capture set `44ba549e...`, verifies all three model
identities, performs eight official Gemini `countTokens` calls and records zero
inference calls, project reads, mutations or state effects. The initial-attempt
upper-bound reservation is `$4.690021`; `$33.60` is the deliberately
pessimistic ceiling for two full `$0.70` attempts on every row, not expected
spend. The first operator attempt correctly failed before inference because the
checked-in `.env.local.prod` Gemini key was invalid; the linked Vercel
production key then passed, and its temporary full environment export was
deleted. At this preflight checkpoint no model artifact, route-quality result,
execution or rendered comparison existed.

**Route-ablation paid Stage-2 checkpoint (2026-08-22):** commit `567414438`
adds an exact 24-row, two-attempt, `$33.60`-ceiling authorization and resumable
runner with no project authority. All 24 rows then executed under cohort
receipt `9583de5c...`: 16 provider artifacts were schema-accepted, all eight
Gemini 3.7 calls returned HTTP 429, and hidden evaluation produced seven honest
capability gaps, nine failures and eight infrastructure non-evaluations for
`$1.5474777` known spend. Luna's split is three honest gaps/five failures;
Terra's is four/four. The failures are not compiler-port trivia: models often
named the architecturally appropriate generated or hybrid form while their own
graphs selected no executable owner and declared that owner ineligible. The
correct current result in those rows was `CAPABILITY_GAP`. Both models did
correctly reject forced native for both scopes. This is bounded routing and
capability-honesty evidence only; no alternative executed or rendered and no
provider leaderboard is supported. The temporary production environment file
was deleted and verified absent. Full interpretation is in
`docs/editron/open-ended-editing/oe-stage25-route-ablation-paid-results-2026-08-22.md`.

**Executable DEV-02 native-versus-hybrid comparison checkpoint
(2026-08-22):** commits `5255d3564`, `dd4f1b394` and `4304a6301` first
requalified the existing generated-composition sandbox budget, froze its V2
research capability and connected the real generated-island plus native-
continuation Stage-6 path without ProjectService mutation. Hybrid receipt
`1a56ecb4...` binds output `aa5f6644...`: a decoded 345-frame, 1080x1920,
30/1, 11.5-second H.264 proxy with no audio. Commit `aab32efcb` then exposed a
route-neutral DEV-02 target-proof seam without introducing a second proof
policy. Commit `8114058fd` rendered the same target through current native
Editron overlay state; native receipt `f8d8452f...`, proof `6ceb231d...` and
output `4b5b4cc1...` bind the same decoded output scope. Both candidates pass
frame integrity, geometry/gutters, title, opposed motion, phase structure,
full-canvas release and boundary continuity; flash safety and creative taste
remain `UNVERIFIABLE`. The forced-native representation requires sixteen
overlays, seven keyframe tracks and fourteen keyframes while representing zero
cross-element relationships; the generated program declares six layers and
five exposed parameters, but still lacks product nested-composition state.

Commit `301451570` adds the fail-closed randomized review pack. The public pack
hash is `23870abb472e9ccb4f112b2a435ab0ed2f61fd93a797b3c9ee43567385b6786c`;
its sealed operator-key hash is
`e9fc76de02a2aa252ce99cb8e2e54548f1f752d9622770a256f653de824fc880`
and technical-comparison hash is
`9e48547ad9ee175b2f57df0043764040b1d3c1ac73440491deb85685e8b7b9e3`.
Reviewer copies are under
`.calibration-temp/editron-stage25-route-execution-v1/dev02-route-comparison-v1-20260822-01/reviewer/`;
their public SHA-256 values are `26ad4d12...` and `a578ef23...`. Both were
independently probed at the shared output scope and the public files contain no
route/receipt identity. The A/B mapping must remain sealed until the sole
reviewer finishes both videos and freezes the review form. This is a fair
bounded route comparison, not production route certification or a blind-editor
panel; correction time, preference and confidence are still pending.

**Proposal reconciliation policy checkpoint (2026-08-22):** commit
`fd2eabcdb` adds the research-only, zero-mutation decision boundary needed for
stale user edits. A proposal is bound to a base project revision, versioned
project timebase, exact read/write regions, identity refs, evidence refs and
target predicates. Subsequent change receipts must form one unbroken,
hash-valid revision chain. Half-open disjoint changes rebase to the exact
current revision; an overlap is eligible only through one writer-issued,
proof-bound coordinate transform that covers the affected range and preserves
every bound identity. Ambiguous overlap, active current-coordinate locks and
invalidated proposal evidence remain distinct hard blocks. Forged proposals,
receipts, transforms and lock sets, duplicate receipts, incomplete chains and
invalid tick domains fail closed. The focused suite passes 9/9 with repository
typecheck and focused quiet ESLint passing. This is deterministic harness
evidence only: active `ProjectMutationReceiptV1` does not yet emit these
affected regions, invalidations, transforms or locks, and no product proposal
was applied or rebased.

**Dependency/invalidation scheduler checkpoint (2026-08-22):** commit
`34d9da281` exposes the existing timebase-bound region validation/intersection
owner and adds a separate mechanical research scheduler. It never invents a
node, dependency or edit. Declared artifact dependencies, half-open path/range
hazards, invalidations, stability requirements and resource ceilings produce
deterministic runnable waves. Canonical `MUTATION` nodes must form one total
order and every post-mutation node must consume the latest writer's opaque
revision receipt; reusing the graph base is rejected. The suite covers a
tracking -> parallel title-transform/background-grade -> composite -> proof
shape, unordered overlapping proposals, unordered canonical mutations,
picture-lock gating, stale caption proof after a trim, explicit post-trim
reproof, cycles, dangling dependencies, duplicate producers, shuffled node
presentation and render concurrency. The scheduler and reconciliation suites
pass 16/16 with typecheck and focused quiet ESLint passing. This remains
research-only: current Stage-4 graphs mostly use string effects rather than
these structured regions, no durable PlanService/lease executor consumes the
waves, and no model has yet been scored on this diverse dependency shape.

**Mid-episode resume contract checkpoint (2026-08-22):** commit `5c179d3a4`
adds a research-only checkpoint/resume boundary over the same scheduler graph.
The checkpoint hash-binds plan and schedule identities, completed and active
nodes, every completed-node artifact through an opaque result handle, the
latest completed writer's receipt as revision origin, compacted transcript and
summary hashes, remaining turn/spend budget, and declared unchecked work. The
summary is explicitly non-authoritative: resume rebuilds the schedule from the
original graph, resolves the opaque writer result through its external owner,
and compares that exact revision with current project truth. Altered graphs,
missing result handles, invalid completed-node dependencies, copied handles,
forged payloads, stale revisions and summary-only node invention fail closed.
The checkpoint, scheduler and reconciliation suites pass 21/21; repository
typecheck and quiet ESLint pass. This does **not** yet prove a live model episode
survives compaction: no provider loop, durable PlanService/result store,
ProjectService receipt or worker recovery path consumes this research contract.

**Provider-loop interruption/resume checkpoint (2026-08-23):** commit
`fe22e2f7b` extends the sole provider-native episode runner rather than adding a
second runner or planner. After each resumable committed turn, it can emit an
exact checkpoint bound to route, context, tool set, raw response, normalized
call, resolved arguments, isolated-owner output, opaque result references,
repair count, call fingerprints, mutation epoch and the latest writer-issued
`receipt.projectRevision`. Resume reconstructs that prefix from the original
prompt and schemas, compares the writer value with current project revision,
then gives the provider only a deterministic compacted navigation view and
opaque handles. It never replays prefix mutations or exposes the raw writer
revision in the resumed prompt. One focused episode consumes a schema-repair
attempt, commits a read and writer, terminates intentionally, consumes its
second and final repair after resume, executes only the suffix mutation and
finishes `READY_FOR_PROOF`. Stale revision, altered checkpoint, rehashed output
with mismatched issued reference, changed route/context/tool set, missing
writer-revision projection and forged final receipt all fail before provider
invocation or checkpoint publication. The resume/result-reference/episode
suites pass 25/25; repository typecheck and quiet ESLint pass; state effects are
empty.

This is `RESEARCH_PROVEN` for the in-process provider-loop mechanism, not a
durable or product resume claim. The test uses deterministic provider responses
and an isolated executor, not a paid model call, ProjectService mutation or
server restart. Checkpoint hashes provide reproducible integrity but are not an
authenticated external result store. Resume intentionally rejects runtime-
guard/spend state until that identity is bound. Durable PlanService/result
storage, leases/idempotency, exact V3R3 trace replay and worker-recovery proof
remain open.

**Reference-bound provider-resume checkpoint (2026-08-23):** commit
`ec1432446` extends that same checkpoint owner and provider-native runner with a
versioned reference-media identity; it does not add a second episode runner or
media owner. Reference-free episodes continue to issue the exact historical V1
checkpoint. Image- or native-video-reference episodes issue V2 only after the
existing binder validates the media and computes its manifest SHA-256. Resume
requires the exact same validated reference manifest and reattaches the supplied
media to the compact provider request. Missing, changed and previously unbound
references fail before provider invocation or isolated execution. The new and
legacy resume/episode suites pass 23/23, including the unchanged exact captured
Luna replay receipt; repository typecheck and quiet ESLint pass. This is
`RESEARCH_PROVEN` for reference identity across in-process restart. It is not
durable storage, cross-process recovery, runtime/spend-state recovery, paid
resumed inference, ProjectService mutation or rendered product acceptance.

**Runtime-accounting-bound provider-resume checkpoint (2026-08-23):** commit
`6217cf748` extends the same checkpoint owner, provider-native runner and sealed
runtime-budget controller; it does not introduce another runner, budget owner or
project authority. Reference-free runtime-guarded episodes issue V3 checkpoints
and reference-bound runtime-guarded episodes issue V4 checkpoints, while the
historical V1/V2 identities remain unchanged. Each completed turn stores its
actual provider output limit and the checkpoint binds the exact ordered runtime
audit, cumulative provider turns, selected operations, input/cached/cache-write/
output/thought/reasoning tokens and nano-USD spend to the completed-turn hash,
authorization and limits. Resume into a fresh controller independently derives
the cumulative usage from those turn audits before another provider call;
missing guards, legacy-unbound guards, changed authorizations/limits, stale turn
bindings and rehashed forged counters fail closed. An unresolved in-flight
provider request cannot be checkpointed. The resume/reference/runtime suites
pass 31/31; repository typecheck and quiet ESLint pass. This is
`RESEARCH_PROVEN` for cumulative resource-accounting integrity across one
in-process fresh-controller restart. It is not durable storage, authenticated
cross-process recovery, paid resumed inference, ProjectService mutation or
rendered product acceptance.

**Shared durable workflow-record checkpoint (2026-08-23):** commit
`1f22ef2f2` adds the first transport-neutral shared lifecycle owner required by
the durable-workflow ADR; it does not add a queue, provider runner, planner,
project owner or timeline owner. One tenant-scoped Mongo record now binds an
immutable canonically hashed input, dependency and budget references,
idempotency identity, dispatch metadata, bounded attempts, retry cursor,
exclusive expiring lease, cancellation request/cleanup takeover, monotonically
sequenced hash-checked resume state, terminal proof references and TTL cleanup.
Atomic filters reject concurrent claims, stale workers and stale checkpoint
writes; identical completion and cancellation settlement are retry-idempotent.
The five adversarial lifecycle groups pass, as do repository typecheck and
quiet ESLint. This is shared durable-record groundwork, **not workflow
convergence**: no production or research episode consumes the record yet; no
live Atlas/process-restart recovery was exercised; there is no authenticated
worker ingress, append-only event history, approval-pause protocol or transport
re-driver; and existing family-specific stores have not been migrated. The
next bounded step is to bind the existing V4 episode checkpoint into this sole
record, then prove zero-inference fresh-process claim/hydrate/suffix-only resume
before any paid resumed-inference authorization.

**Provider-episode durable-binding checkpoint (2026-08-23):** commit
`96d2e3923` extends the existing V4 checkpoint owner with one public integrity
seam and adds a research adapter into the shared record; it does not define a
second checkpoint, runner, budget owner or project authority. The durable job
input now binds tenant/project scope, provider route, context, exact tool set,
reference-media manifest, runtime-guard authorization and budget reservation.
The job's monotonic resume state stores the exact existing checkpoint and its
hash. Persist/restore revalidates the original checkpoint envelope plus job
input, dependency, budget, lease, tenant and state bindings. Four adapter tests
plus the existing store/runtime suites pass 12/12; forged or mismatched
checkpoints, wrong tenant, stale lease/sequence and altered stored bindings fail
before provider invocation. This proves bounded V4 persistence and fresh
**store-instance** restoration, not a fresh process or worker: no worker handler
claims the record, no artifact resolver reconstructs route/context/tool/media/
authorization inputs, no provider suffix runs from the stored state, and no
live Mongo/QStash recovery is proven. Next build that zero-inference worker
recovery harness before any paid resumed call.

**Final-writer checkpoint repair (2026-08-23):** commit `ecfa20c54` closes a
real terminal-turn hole in the same provider episode owner. A final mutating
tool call previously did not issue `receipt.projectRevision` when no later
model-visible tool consumed that value, so the durable checkpoint callback
could not bind the writer-issued revision. The opaque-result registry now
accepts an internal, owner-declared output projection for checkpointing; the
runner requires the exact writer revision only when it is publishing a
resumable committed turn, and hydration derives the same requirement for
prefix mutations. This internal projection never enters the provider prompt,
so frozen request identities and captured Luna evidence remain unchanged. The
focused regression proves that the terminal writer emits the revision needed
by the checkpoint without teaching the model that value.

**Durable provider-recovery worker checkpoint (2026-08-23):** commit
`81ce63d9b` adds one transport-neutral recovery core over the shared durable
job record and existing provider-native episode runner; it is not another
runner, project authority, checkpoint format, registry or queue. The worker
claims a leased job, restores the exact V4 checkpoint, resolves its declared
route/context/tool/reference/runtime artifacts through an injected trusted
port, verifies current ProjectService revision origin plus isolated-clone
revision and state hashes, executes only the unfinished provider suffix,
persists later checkpoints, heartbeats the lease and settles completion,
cancellation, retry or dead-letter state through the shared store. `READY_FOR_PROOF`
is deliberately persisted as `UNVERIFIABLE`, never `PASS`, because no product
proof owner has accepted the output. The adversarial suite covers fresh
store/worker instances, exact prefix preservation, later checkpoint sequence,
duplicate terminal delivery, tampered context/toolset, transient resolver and
provider failures, in-flight cancellation and competing leases. The broader
provider-native suite passes 130 tests with two intentional skips; repository
typecheck and quiet ESLint pass.

At this checkpoint this was a zero-inference, same-process recovery-core
qualification. It did not yet provide a concrete production artifact resolver,
authenticated worker ingress, QStash dispatch adapter, separate-OS-process or live Atlas recovery,
paid resumed inference, ProjectService mutation, approval waits or append-only
event history. Those distinctions are the remaining production gates; the
existence of an injectable port is not artifact-resolution convergence.

**Active-catalog test-provenance repair (2026-08-23):** commit `315443e21`
updates one stale provider test to bind the intentional CAP-2A V2R9 catalog
identity introduced by `85d1bdcae`. The test keeps the injected catalog and
current catalog identities separate; it does not rewrite prior benchmark
artifacts or create new model evidence. No paid inference or project state
effect occurred in any of these three slices.

**Owner-coordinating artifact-resolution checkpoint (2026-08-23):** commit
`fee52df57` adds the concrete coordination core behind the existing durable
worker's artifact port. It owns no artifact database or registry. By immutable
tenant/user/project/episode identity it asks the declared episode-definition,
ProjectService-scoped clone, provider-transport, reference-media and runtime-
budget owners for their artifacts, then independently re-hashes the complete
context, opaque tool set, route/dependency set, project scope and optional
reference manifest before returning anything to the worker. Missing reference
or runtime owners fail before a project clone or provider transport is
materialized; changed context, tool-set or project scope fails before provider
or isolated execution. Custom shadow tool factories and unbound additional
instructions are not accepted by this resolver contract.

The provider-native suite now passes 134 tests with two intentional skips;
repository typecheck and quiet ESLint pass. This remains zero-inference and
zero-project-effect evidence. The coordination core is production-shaped, but
its real episode-definition, ProjectService-clone/isolated-execution,
reference-media, runtime-budget and secret-bearing provider-transport adapters
are not yet wired. No authenticated worker ingress, QStash dispatch, separate-
process/live-Atlas recovery, paid resumed inference or product mutation was
added.

**Separate-OS-process captured-trace recovery checkpoint (2026-08-23):**
commit `372001cc1` exercises the existing shared durable record, provider
worker, strict artifact resolver and Stage-2.5 dependency owner across two
actual Node processes; it adds no production owner or alternate store. Process
A executes the exact captured Luna P1 prefix, persists the turn-four checkpoint
and owner-bound isolated-clone snapshot, then exits. Process B loads that
serialized Mongo-shaped record after the original lease expires, restores the
same validated owner at writer revision `R43`, consumes only the four captured
suffix responses and reaches the original owner state at `R45`. It persists
the three remaining resumable tool-turn checkpoints through sequence four and
settles `READY_FOR_PROOF` as durable `UNVERIFIABLE`; the terminal finish call
correctly does not manufacture another resumable checkpoint. The result binds
distinct process IDs, four prefix calls, four suffix calls, zero paid inference,
no replayed prefix mutation and zero project state effects. A re-enveloped but
forged clone snapshot fails before suffix execution. Twenty-four focused
restart/replay/resolver/worker/job/store tests pass, as do repository typecheck
and quiet ESLint.

This is `RESEARCH_PROVEN` for process-loss hydration and suffix-only execution
over a serialized test record. At that checkpoint it was **not** live-
infrastructure convergence: non-production Atlas persistence, QStash delivery/
redelivery, authenticated worker ingress, real ProjectService clone/execution,
secret-bearing provider transport, paid provider resume and rendered
acceptance were unchecked. Later commits close only the route-bound transport
adapter (`2bdb05d80`) and non-wired proposal-clone contract (`b50f9f9fa`), not
the live-infrastructure gates.

**Route-bound durable provider-transport checkpoint (2026-08-23):** commit
`2bdb05d80` adapts the existing live provider HTTP transport to the strict
durable artifact-owner port; it does not add a second transport, model registry
or fallback router. One durable route now resolves with only that provider's
credential. Before network access, the adapter requires an exact registered
route/provider/model tuple and recomputes the serialized request hash; provider,
request-model, route, hash and unregistered-model substitution fail closed.
After a successful response, the returned provider-native model identity must
equal the model frozen in the durable route. There is no fallback to another
model or provider. The transport/resolver/worker suites pass 17/17, as do
repository typecheck and quiet ESLint; no inference or project effect occurred.

This closes the secret-bearing provider-transport **adapter** seam only. At
that checkpoint the adapter was not reachable from an authenticated production
worker and the accepted PlanService node/definition, ProjectService clone,
reference-media and runtime-budget seams remained open. Later commits bind the
accepted job and non-wired proposal clone, but authenticated ingress/dispatch,
concrete operator ownership, live Atlas/QStash recovery and paid resumed
inference remain unwired.

**Manifest-bound durable episode-definition checkpoint (2026-08-23):** commit
`e3ac9b082` removes the inline episode-definition closure from the captured
separate-process recovery path. Process A now serializes one immutable research
definition issued by the existing Stage-2.5 cohort manifest; the artifact binds
the manifest version/identity/hash, tenant, user, project, episode, complete
context and opaque tool-set identity. Process B constructs the strict definition
owner only from that serialized artifact. Copied scope, stale expected context
or tool-set hashes, altered payloads and a forged definition whose inner and
outer envelopes were both recomputed fail before any captured suffix response
is consumed. The definition/resolver/worker/separate-process suite passes 17/17,
as do repository typecheck and quiet ESLint; no inference or project effect
occurred.

This is a **research definition-value adapter**, not the production
`PlanService` promised by the agentic architecture. At that checkpoint the
definition was serialized beside the Mongo-shaped test record rather than
issued through a tenant-scoped plan store. Commit `0c94bc059` now supplies the
non-wired product store; embedding an accepted definition in the shared job
input and live Atlas recovery remain open.

**Durable orchestration ownership decision (2026-08-23):** the bounded
[orchestration spike](./editron/open-ended-editing/oe-durable-editorial-orchestration-spike-2026-08-23.md)
selects one native, tenant/project-scoped Mongo `PlanService` as the accepted
Sequence/Range Plan and episode-definition owner. The existing shared durable
job record remains the execution-lifecycle owner, QStash remains a replaceable
delivery transport, and ProjectService remains the sole project/timeline owner.
Upstash/Vercel workflow runtimes and JCode/OpenCode remain optional
transport/session/UI adapters only. This freezes the owner split; it does not
claim that product PlanService is implemented.

**Canonical editorial-plan contract checkpoint (2026-08-23):** commit
`a012e226e` implements the first non-wired product PlanService boundary
contract. `EDITRON_EDITORIAL_PLAN_V1_1` provides strict, Unicode-normalized,
hash-bound immutable plan revisions; a bounded acyclic node graph; explicit
source/timeline/composition tick domains and authority references; observable
objectives, scopes, effects, locks, approvals, budgets, unchecked claims,
preview/proof/receipt references and terminal dispositions. The successor
validator rejects stale/cross-scope revisions, removed or unversioned nodes,
model overrides of user objectives, unauthorized semantic scope widening,
implicit lock removal and non-user lock release. A node cannot declare
`VERIFIED` without PASS proof, a receipt and zero unchecked claims. The shared
canonical JSON extraction preserves existing durable-job hashes and legacy
error codes. Focused contract/durable suites pass 18/18, as do repository
typecheck and quiet ESLint. No route, Mongo write, workflow dispatch, provider
inference or project effect exists in this commit.

This closes only verification-sequence step 1 in the orchestration ADR. The
immutable Mongo revision/definition store, artifact-owner resolution, plan-to-
job binding, event/approval transitions and live recovery remain open.

**Immutable editorial PlanService store checkpoint (2026-08-23):** commit
`0c94bc059` closes verification-sequence step 2. One tenant/project-scoped
Mongo adapter now persists immutable accepted plan revisions and exact bounded
execution definitions. Initial writes and successor appends are idempotent;
expected-revision and unique-index enforcement allow only one concurrent
successor branch. Authorized reads bind tenant, user, project and plan or
definition identity. A definition must resolve to an existing exact plan
revision and node hash, and its reference owner must be `PLAN_SERVICE`.
Copied scope, stale branches, non-owner definitions, altered envelopes and
forged source-node hashes fail closed. The plan/store/durable focused suites
pass 19/19, and repository typecheck plus quiet ESLint pass.

This is persistence, not runtime convergence: no request route, artifact-owner
resolver, accepted-node-to-job binding, live Mongo exercise, event history,
approval wait, ProjectService clone/execution, provider call or project effect
was added. The next bounded slice is therefore the exact plan/node/definition
binding in the existing durable job input, still with zero inference.

**Accepted editorial node-to-job checkpoint (2026-08-23):** commit
`9687dbd9f` closes orchestration verification step 3. One binder resolves the
latest exact accepted plan revision, requires a `READY` node, resolves its
PlanService-issued execution definition and proves that executable node
material has not changed since definition issuance. It binds plan, node,
definition, operation set, direction, base ProjectService revision, planner
schema, privacy/proof policy and one explicit aggregate budget into the
existing durable job input. Its deterministic identity makes re-creation
idempotent. Stale plan heads, copied tenant scope, forged definition refs,
changed executable material and terminal nodes fail before a job write. The
binder/plan/job suites pass 15/15, and repository typecheck plus quiet ESLint
pass.

This remains zero-inference plumbing. No route, dispatch, worker execution,
live Mongo, ProjectService read/mutation or provider call occurred. Because
plan and job records are separate writes, the input records the expected plan
head but does not falsely claim a cross-collection transaction. The next
adapter must re-resolve that head, definition and dependencies before any
worker/provider/tool effect, then prove crash/restart and redelivery with zero
inference.

**Execution-time durable editorial revalidation checkpoint (2026-08-23):**
commit `d16caaa5b` closes the fresh-instance portion of that adapter. The
resolver accepts only a currently leased `running` job, re-resolves the exact
PlanService plan head, node, definition and source plan, rebuilds the canonical
job contract through the same owner and rejects mismatched scope, operation
identity, dependencies, aggregate budget or payload hash before any effect.
Fresh PlanStore and job-store instances over the same persisted test
collection reclaim an expired lease without resetting attempt history; the
old lease, an unleased queued job, a forged recomputed payload and duplicate
delivery all fail closed. The resolver/binder/plan/job suites pass 18/18, and
repository typecheck plus quiet ESLint pass.

This is still zero-inference product plumbing, not full process-loss or live
recovery. The proof recreates store objects over one shared test persistence
abstraction; it does not start a separate OS process and does not exercise
Atlas or QStash. No route, provider call, ProjectService read/mutation or
project effect occurred. The next recovery slice must serialize the product
PlanService/job binding across an actual process exit, then the lifecycle must
cover approval suspension, cancellation, expiry and tenant isolation before a
live non-production transport exercise.

**Serialized separate-process product recovery checkpoint (2026-08-23):**
commit `b9cf5e820` closes that process boundary without claiming a live-store
result. Process A creates the real product PlanService revisions, execution
definition and durable job, acquires the first lease, serializes their
Mongo-shaped records into a hash-bound envelope and exits. A distinct Node
process hydrates fresh stores from that envelope, reclaims the expired lease,
passes the existing product resolver, preserves attempt count, rejects the old
lease and suppresses duplicate delivery. The proof records distinct process
IDs, zero provider inference, zero ProjectService reads and zero state effects.
A tampered outer envelope and a re-enveloped inner job forgery both fail before
execution. The plan/store/binder/recovery suites pass 16/16; repository
typecheck and quiet ESLint pass.

This proves serialized product-record portability and product-side
revalidation across an actual process exit. It is still a test persistence
adapter, not Atlas durability, QStash delivery, authenticated ingress,
ProjectService clone/mutation or provider resume. The next product lifecycle
slice is approval suspension, cancellation, expiry and tenant isolation; the
live-store/transport exercise remains later and independently gated.

**Editorial durable lifecycle checkpoint (2026-08-23):** commit
`c69a845ea` makes the shared job deadline an execution boundary rather than a
stored cleanup hint. Dispatch and normal leases now require `expiresAt` to be
in the future; expired queued or running work is atomically dead-lettered with
non-retryable `JOB_EXPIRED`; recovery lists include expired records for
cleanup; and a prior explicit user cancellation keeps its cancellation-cleanup
lease even after the job deadline. Product jobs bind every approval requirement
into their dependency set and refuse approval-required work unless the exact
immutable plan revision records `acceptedBy.actorKind = USER`. Cross-tenant
read/cancel attempts, cancelled execution, queued expiry, active-lease expiry,
deadline/dispatch races and cancellation-after-deadline are covered. The
combined lifecycle/recovery/binding/store suites pass 22/22; repository
typecheck and quiet ESLint pass.

This is approval **lineage**, not authenticated approval completion. No route
currently proves that the actor recorded as `USER` came from an authenticated
review action, and there is no product wait/wake UI or event history. Those
remain required before production dispatch. No provider call, ProjectService
read/mutation or project effect occurred.

**Immutable editorial review-decision checkpoint (2026-08-23):** commit
`aff06c8d4` closes the PlanService-owned wait/wake domain seam without keeping
a worker lease open. `NEEDS_REVIEW` is the durable wait. An owner-scoped review
call requires the exact current plan hash and appends one immutable successor:
`APPROVE -> READY_TO_APPLY` or `CANCEL -> CANCELLED`. The successor preserves
the node scope, requirements and locks, increments only the reviewed node, and
records the USER actor, timestamp, reason and prior revision. Successor policy
independently rejects a raw SYSTEM/MODEL promotion to `READY_TO_APPLY` or review
cancellation. Wrong actor, tenant, stale head, blank reason and wrong node
state fail before append. The review/plan/store/lifecycle suites pass 25/25;
repository typecheck and quiet ESLint pass.

The domain service requires an `authenticatedActorId` matching the plan owner,
but no web route currently derives that value from a real session. Therefore
the immutable wait/wake and event history are proven while authenticated UI/API
ingress remains pending. No job dispatch, provider call or project effect was
added.

**ProjectService isolated-proposal checkpoint (2026-08-23):** commit
`b50f9f9fa` closes the non-wired clone/receipt adapter seam without creating a
second project or timeline owner. The adapter consumes the existing
`ProjectService.loadProjectForMutation` paired snapshot/revision result and
gives only a deep in-memory clone to a supplied isolated operation owner. It
re-reads the canonical ProjectService state before and after every operation,
detects both revision drift and relevant proposal-state drift, rolls back
failed clone calls, rejects project/user/revision identity mutation and emits
one canonical changed-path/operation receipt only when finalization still sees
the original canonical base. The durable worker independently validates the
outer and nested receipt hashes and binds the accepted receipt as a terminal
proof reference; forgery dead-letters before durable completion. Twenty-five
durable regression tests pass, including stale-before/stale-after, sparse
state, failed-operation rollback and forged-receipt cases; repository
typecheck and quiet ESLint pass.

This is `RESEARCH_PROVEN` for the ProjectService-shaped isolated clone and
durable receipt contract, with zero provider inference and zero canonical
project mutation. It does **not** wire a concrete production operator owner,
authenticated route, live Atlas/QStash delivery, canonical proposal apply,
reload/render proof, undo or paid resumed inference. Those remain explicit
gates; no production convergence claim follows from this adapter.

**Canonical-base/isolated-working revision split (2026-08-23):** commit
`a9882903a` corrects a contract defect found while attempting the next product
wiring. The durable worker formerly labelled one string as a current
ProjectService revision while the resume verifier interpreted it as the latest
isolated writer revision. Synthetic fixtures made both values `revision-43`,
masking the collision. The new hash-bound proposal revision binding carries
canonical base revision/state separately from isolated working revision/state;
resume consumes only the isolated working revision while independently
checking the canonical base. Missing and forged proposal bindings dead-letter
before provider or operator execution, and a truthful `canonical R7 + working
R43` case passes. Twenty-four focused resume/worker/owner tests, repository
typecheck and quiet ESLint pass.

This checkpoint closed identity separation only. Deterministic proposal-state
recovery is now handled by the later recovery checkpoint below.

**Restart-safe isolated-proposal recovery (2026-08-23):** commits `270792c1a`,
`d143da69a`, `df61e818d` and `9f955033e` add and connect one compact,
noncanonical recovery chain. Each committed writer binds its exact turn,
operator, normalized call hash, recorded execution hash, writer-issued revision
and before/after proposal-state hashes. The durable worker restores and extends
that chain atomically with the episode checkpoint. A fresh ProjectService clone
replays only those committed writers through a separate pure replay port,
rejects output/state/canonical drift, and executes only the provider suffix.
The process proof kills process A, reconstructs in process B, records one prefix
writer replay plus one suffix writer execution, reaches `local-r44`, preserves
the canonical state hash and uses zero inference. The combined recovery cluster
passes 36/36; repository typecheck and quiet ESLint pass.

This is `RESEARCH_PROVEN` for deterministic proposal recovery through the sole
non-wired ProjectService clone adapter. It is not live Atlas persistence,
QStash delivery/redelivery, authenticated ingress, a concrete certified
operator owner, paid-provider resume, canonical proposal apply/reload or
rendered acceptance. Legacy research owners expose no ProjectService proposal
binding and remain honestly checkpoint-only; they cannot emit a proposal
receipt or be relabelled as this recovery path.

**First concrete ProjectService-clone operator checkpoint (2026-08-23):**
commit `7c9e7e6ea` replaces the dummy writer at this seam for one bounded native
operation. `cut_section` now delegates to the existing
`timeline-range-cut.ts#cutTimelineRange` owner against the ProjectService-issued
in-memory clone, validates exact project/proposal revision, range, evidence-ID
shape and unsupported constraints, returns the owner's coordinate transform
and split-child identities, and issues a hash-bound proposal-local writer
revision. A fresh owner deterministically replays the committed cut before a
second cut; copied/forged revisions and altered replay results fail closed,
while the canonical Project remains unchanged. The integration test also
exposed explicit `keyframeTracks: undefined` values from the canonical cut
owner; the same commit fixes all five cut paths to omit that absent optional
field. The concrete-owner plus canonical-cut regression set passes 21/21;
repository typecheck and quiet ESLint pass.

This is `RESEARCH_PROVEN_LIMITED` for `cut_section` proposal execution and
recovery only. It does not prove transcript/evidence resolution, protected
speech, rendered acceptance, undo, canonical apply/reload, other operator
families or production certification. The blanket “no concrete operator
owner” gap is retired; broad certified operator coverage remains open.

**Immutable reference-artifact owner checkpoint (2026-08-23):** commit
`90d034578` supplies the concrete scope-bound owner required by the durable
artifact coordinator for both existing reference arms: ordered timestamped
images and native MP4 video. The artifact binds tenant, user, project, episode,
source-owner provenance, normalized reference bytes and the exact manifest
hash. Resolution revalidates arm-specific bytes/signatures before returning a
canonical clone; wrong scope, wrong expected manifest, altered bytes and a
copied or rehashed outer artifact fail closed. Reference owner/resume suites
pass 18/18; repository typecheck and quiet ESLint pass.

This closes the immutable research-artifact owner seam only. Production still
needs a rights/privacy/egress-aware media locator that resolves the bound bytes
from canonical media storage rather than treating this inline research value
as a second media database. Reference interpretation and rendered proof remain
separate gates.

**Durable sealed-runtime-guard owner checkpoint (2026-08-23):** commit
`8ecc87a1c` binds the existing `SealedHoldoutRuntimeBudgetControllerV2R` to the
durable artifact coordinator without creating another accounting policy. The
immutable artifact binds tenant, user, project, episode, source-owner
provenance, public case, manifest, provider route, authorization, pricing and
the controller-issued guard identity. Resolution returns a fresh guard only
for the exact scope/kind/identity and injects the existing provider-specific
token-count owner. Binding and resolution make no token-count, provider or
project calls. Wrong scope, copied kind/identity, forged authorization binding
and stale outer hashes fail closed. Runtime-owner plus accounting/resume suites
pass 13/13; repository typecheck and quiet ESLint pass.

This is `RESEARCH_PROVEN_LIMITED` for sealed benchmark resource accounting and
process recovery. It is not a generic product budget service, current-price
authorization, authenticated worker wiring, paid-provider resume proof or
permission to spend. Every paid cohort still requires a fresh zero-inference
preflight and explicit authorization.

**Durable isolated-outcome-proof mechanics checkpoint (2026-08-23):** after
the required Step-0 export cleanup at `fba3ff58d`, commit `f85bc0f09` prevents
a changed proof-eligible proposal from completing on a model receipt or state
diff alone. The ProjectService clone now passes an immutable copy of its exact
final state to an injected proof owner while checking the canonical base before
and after inspection. The durable worker accepts only a versioned receipt bound
to tenant/user/project/episode, episode/resume/proposal/final-state hashes, one
proof-policy identity, explicit standardized obligations, referenced evidence
and derived `PASS | FAIL | UNVERIFIABLE`. Missing owners, re-signed wrong
subjects, inconsistent evidence and canonical drift fail closed. The focused
worker/clone/recovery cluster passes 30/30; repository typecheck and quiet
ESLint pass.

This is proof **ownership and acceptance plumbing**, exercised with an injected
test owner. It is not rendered proof by itself.

**Concrete single-cut Phase-0 proof-owner checkpoint (2026-08-23):** commit
`53baee0f3` adds a versioned `cut_section` proof policy whose default producer
is the existing `buildPhase0RenderedStillEvidence` owner. The ProjectService
clone supplies both the immutable baseline and exact isolated final project;
the adapter binds the episode call, proposal state hashes, cut duration,
project identity and the two frames around the resulting join. Only a complete
paired baseline/final artifact set for the exact project and requested frames
can pass. Missing, skipped, partial, cross-project, duplicate, extra or
wrong-frame evidence remains `UNVERIFIABLE`; canonical ProjectService state is
guarded and unchanged. The cut/proof/clone/worker/Phase-0 cluster passes 51/51,
and repository typecheck plus quiet ESLint pass.

This status is `CONCRETE_OWNER_IMPLEMENTED_ZERO_NETWORK_TESTED`, not
`RESEARCH_PROVEN_RENDERED`: tests inject the Phase-0 builder seam and no Lambda
render was purchased or executed in this checkpoint. The policy proves only
one numeric-FPS cut and boundary stills. It does not yet prove transcript
semantics, audio continuity, multiple operations, rational timebase support or
production apply. Those gaps remain mandatory before promotion.

**Concrete proposal-revision origin checkpoint (2026-08-23):** commit
`1af638999` makes the ProjectService isolated clone pass its one current
proposal revision into execution and committed replay, and exposes one
deterministic revision issuer for concrete isolated writers. The existing
`cut_section` adapter now consumes that value and no longer owns a private
`WeakMap`, counter or parallel revision chain. The cross-process recovery
fixture also satisfies the mandatory proof gate with an exact hash-bound
`UNVERIFIABLE` render obligation instead of fabricating `PASS` where no render
owner ran. Clone/cut/proof/durable/process tests pass 31/31; repository
typecheck and quiet ESLint pass.

This closes revision-origin duplication for the current concrete cut owner and
provides the required handoff for the next owner. It does **not** yet prove that
an arbitrary future injected owner called the issuer; clone-side validation or
an issuer port remains a hardening task. It also does not add a keyframe/audio
owner, multi-operation proof, live render, canonical apply or production
certification.

**Concrete focal-scale keyframe-owner checkpoint (2026-08-23):** commit
`b0f1442c0` adapts the existing
`keyframe-mutation.ts#buildKeyframeMutationPatch` owner to the same isolated
ProjectService clone revision chain as `cut_section`. It accepts only the
technically unambiguous video/image focal-scale subset, preserves unrelated
tracks, binds local frames/focal point/state hashes/changed paths and issues
its writer revision through the shared deterministic origin. Missing focal
evidence, non-scale property, stale revision, invalid local range and forged
replay fail closed. A same-process cut-then-keyframe test proves ordered
receipts while canonical ProjectService state stays unchanged. The affected
owner/form/clone/durable suite passes 97/97; repository typecheck and quiet
ESLint pass.

**Exact cut-plus-focal outcome-proof checkpoint (2026-08-23):** commit
`349a586c3` advances the sole existing isolated proof factory rather than
creating a second proof registry. It accepts only `cut_section` or the ordered
`cut_section -> focal-scale set_keyframes` sequence, verifies every episode and
operation audit hash, reconstructs the exact cut-only intermediate state with
the canonical pure owners and binds the keyframe writer to the cut-issued
revision. The cut boundary compares final state against the original project;
the focal terminal frame compares final state against the reconstructed
cut-only project, preventing the cut itself from masquerading as keyframe
evidence. A completed still URL is insufficient: operation-specific visual
PASS now requires inspected per-frame pixel deltas and the expected active
overlay. Missing inspection is `UNVERIFIABLE`; an inspected missing delta is
`FAIL`. Related proof/clone/durable/process/Phase-0 suites pass 96/96, and full
typecheck plus quiet ESLint pass. These are injected zero-network renderer
receipts; live Lambda evidence and separate-process replay of the two-owner
chain remain open.

**Fresh-process cut-plus-focal recovery checkpoint (2026-08-23):** commit
`be8e12871` proves that exact two-owner chain across two real operating-system
processes without paid inference or canonical project mutation. Process A
executes `cut_section`, persists the durable checkpoint and compact proposal
recovery state, then exits. Process B creates fresh store/worker/clone instances,
reconstructs the cut-only intermediate with the real cut owner, replays exactly
that committed prefix, resolves its writer-issued revision through opaque
`result_t1_1`, executes only the supplied focal-scale `set_keyframes` suffix and
finishes through the existing outcome-proof owner. The final isolated state is
210 frames, moves the product overlay from frame 100 to 90, and contains the
exact supplied `74% 50%` focal origin and two-point scale track. Canonical state
remains hash-identical. The injected evidence builder deliberately returns
`skipped`; edit-state proof is `PASS` while cut/focal render and visual
obligations remain `UNVERIFIABLE`. The neighboring durability/owner suite passes
42/42; repository typecheck and quiet ESLint pass.

This closes serialized fresh-process replay and suffix-only execution for these
two concrete owners only. It does not prove live Atlas, QStash delivery,
authenticated ingress, resumed paid inference, live rendered acceptance,
or canonical apply/reload.

**Clone-enforced writer-revision origin checkpoint (2026-08-23):** commit
`ee650e18b` closes the remaining convention-only revision seam. The clone now
independently recomputes the sole deterministic writer revision from the
receipt's declared writer authority plus the exact tenant/user/project,
canonical base revision, previous proposal revision, operator/turn/arguments
and observed before/after state hashes. It rejects a missing writer proof,
proof/state mismatch, a valid-looking revision copied from another call and a
forged revision before advancing the isolated working revision, rolling the
speculative clone state back on execution failure. The older synthetic
audio/beat-sync/shake process fixture was reissued with issuer-conformant
receipts rather than exempted. The neighboring owner/durable/process suite
passes 44/44; repository typecheck and quiet ESLint pass.

This validates issuer-conformant output material for every owner admitted by
the clone; it does not create an owner registry, secret signing authority or
second revision chain. Authenticated ingress, live Atlas/QStash recovery, live
rendered acceptance and canonical apply/reload remain unproved.

**Product durable lifecycle worker checkpoint (2026-08-23):** commit
`1764a8ff8` adds the previously missing execution transition for a leased
PlanService node. It re-resolves the exact accepted plan/node/definition before
delegation, requires one injected execution owner to assert support, exposes
only heartbeat and resume-state CAS controls, and binds the owner receipt,
proofs, plan revision, node version and definition hash into the outer terminal
receipt. Unknown failures dead-letter; only the explicit typed retry contract
can enter retry wait; cancellation and stale plan heads stop before completion.
The focused lifecycle cluster passes 19/19 and repository typecheck/quiet ESLint
pass. The test owner is zero-inference and non-production; this commit does not
select or wire the provider runtime.

**PlanService-to-provider execution-envelope checkpoint (2026-08-23):** commit
`ee07f11cf` binds a provider-native research proxy to one signed PlanService
execution definition without weakening either owner. The envelope fixes exact
tenant/user/project/episode scope, provider route and claimed model identity,
opaque tool-set hash, reference manifest when present, isolated-proposal/no-
canonical-mutation policy and runtime-budget identity. Fresh start and resume
are distinct: a new episode has no fake empty checkpoint; a supplied recovery
checkpoint must match route, episode, context, tool set, reference and budget
guard. Copied scope, changed schema/toolset/budget and tampering fail closed.
The provider-envelope/durable cluster passes 28/28 and repository typecheck/
quiet ESLint pass.

**Shared resumed-provider execution-core checkpoint (2026-08-23):** commit
`454fb721a` extracts the already-proven resumed provider loop and durable
proposal/outcome finalization from the research job-store adapter. The shared
core accepts exact scope, checkpoint, artifacts, heartbeat and checkpoint-
persistence ports; it owns no lease, store, registry, queue or ProjectService
mutation. The existing research worker remains the lifecycle adapter and its
public API, receipts and distinct recovery failures remain regression-tested.
The focused recovery/product-envelope cluster passes 47/47; repository
typecheck and quiet ESLint pass.

These commits close the product lifecycle, immutable definition and shared
resume-execution seams only.
The existing research provider worker still claims
`ProviderNativeToolEpisodeV2R/research_provider_native_episode` jobs, while the
product job is `PLAN_SERVICE/editorial_plan_node_episode`; the former also
requires a persisted non-empty resume checkpoint. The shared core is not yet a
PlanService execution-owner adapter, and it intentionally cannot represent a
fresh episode because the existing proof contract binds a real resumed receipt.
Do not add a second job store, weaken either identity, fabricate a zero-turn
resume checkpoint or copy the provider loop into a shadow owner.

This is `CONCRETE_OWNER_IMPLEMENTED_ZERO_NETWORK_TESTED`. The current V2R
`set_keyframes` dossier still omits the real product tool's general `property`
field, so the adapter must not be represented as generic x/y/opacity/rotation/
speed coverage. No live multi-operation rendered proof, canonical apply or
product certification has occurred.

**Model-selected schedule-binding checkpoint (2026-08-22):** commit
`99f363e28` connects the existing Stage-2 exact `selectedOperatorId` contract
and zero-add/zero-drop compiled graph to the Stage-2.5 dependency scheduler
without adding an editing operation. CAP-2A planner effects remain the declared
contract; exact project regions and artifacts are accepted only through
operator-owner-issued opaque effect-resolution references bound to the compiled
node hash, complete planner record and effect-contract hash. A six-operation
fork/join fixture uses real catalog identities for audio retrieval, visual
retrieval, beat alignment, keyframe-form resolution, keyframe mutation and
filter mutation. Independent reads run together; downstream work consumes the
latest writer receipt; project mutations remain totally ordered. Missing,
copied or stale opaque results, a rehashed invented effect reference, an added
compiled operation and unordered mutations all fail closed. The model-binding,
scheduler, checkpoint and reconciliation suites pass 26/26; repository
typecheck and quiet ESLint pass. This is still **constructed research evidence**:
no provider produced this held-out graph, no live effect owner/result store
issued the fixture receipts, the 37-candidate dossier does not yet have generic
exact-region binders, and no ProjectService mutation or rendered quality proof
occurred. Next freeze a non-leading held-out fork/join episode around this seam,
run the provider cohort, then interrupt/resume the same episode through opaque
results before long-form trials.

**Provider-trace schedule-binding checkpoint (2026-08-23):** commit
`a5c379121` closes the next mechanical seam without reopening the old one-shot
graph benchmark. The canonical provider-episode receipt and its lossless
selected-operation trace are now independently revalidated before scheduling:
episode, transcript, tool-set, trace and node hashes must agree; only
`OPAQUE_RESULT_REFERENCES` are eligible; every referenced value must match the
owner-issued output path and hash, the exact normalized target argument and
the target operator's declared CAP-2A input-origin policy. Those references
alone become data/dependency edges. The adapter adds zero operations, drops
zero selected operations and delegates region/effect validation and wave
construction to the existing Stage-2.5 binder and scheduler.

The six-operation provider-shaped fork/join fixture recovers independent audio
and visual retrieval in one wave, then orders beat alignment, keyframe-form
resolution, keyframe mutation and filter mutation. Every node after a writer
must consume that latest writer's opaque `receipt.projectRevision`; each writer
must issue an advanced revision. Re-signed forged value hashes, direct
handoffs, copied stale revisions, duplicate/added trace nodes and non-advancing
writers all fail closed. The provider-trace, model-binding, scheduler,
checkpoint and reconciliation suites pass 30/30; repository typecheck and
quiet ESLint pass.

This remains `RESEARCH_PROVEN`, not provider or product execution evidence.
The fixture uses authentic signed episode/trace shapes and real CAP-2A schemas,
but no Luna, Terra or Gemini call selected this fork/join episode, its exact
region effects are still owner-shaped test receipts rather than live generic
effect-owner outputs, and neither ProjectService nor a renderer ran. The next
bounded gate is therefore a frozen non-leading provider episode using this
same objective, complete relevant tool records, hidden evaluator and opaque
handoffs. Only after its zero-inference preflight may the three-provider cohort
run; interruption/resume of that same episode follows before long-form trials.

**Non-leading provider-dependency holdout zero-inference checkpoint
(2026-08-23):** commit `cdbee7456` freezes that next boundary without a paid
call. The model-facing context contains a directory entry for all forty V2R
research operations, exposes the exact six eligible records in a deliberately
non-causal presentation order and withholds the measured beat frames, product
overlay ID, target frame, focal point and evidence strength. Its objective
describes observable outcomes and preservation rules, not the required tool
sequence. The hidden evaluator is frozen separately from that context.

The real provider-native episode loop is exercised through a scripted OpenAI
transport, the canonical opaque-result registry and an isolated clone. Visual
and audio evidence are retrieved independently; the actual beat-alignment
owner moves the two legal boundaries; the existing keyframe resolver and
atomic zoom-form owner produce the product treatment; the canonical keyframe
patch owner applies it; and the existing filter owner applies the bounded warm
treatment. Writer receipts advance `R42 -> R43 -> R44 -> R45`. The lossless
trace adds zero operations and drops zero operations, and the provider-trace
adapter recovers the intended fork/join dependencies rather than a hidden
task-specific compiler topology. Stale revisions and fabricated beat evidence
fail without changing the clone. The provider protocol, opaque-reference,
trace, scheduler-projection and adversarial suites pass 33/33; full repository
typecheck and quiet ESLint pass.

This is `VALID_ZERO_INFERENCE_EVIDENCE`, not live-model or product evidence.
The exact 30/1 cadence, frames 119/239/660, ranges 0-360 and 600-720, overlay
42 and revisions R42-R45 are synthetic fixture facts, not production defaults.
No generic exact-effect owner/result store issued scheduler regions, no
renderer ran and no ProjectService state was read or written. One contract
debt is now explicit: the existing keyframe resolver returns
`property: "scale"`, while the current CAP-2A `set_keyframes` input schema
omits `property`; the research owner mechanically removes that known owner
field instead of pretending runtime convergence. The next bounded gate is a
new versioned cohort manifest binding this exact context, evaluator source,
tool-set identity, provider routes and spend ceiling, followed by a zero-
inference request-capture preflight. Only then may Luna, Terra and Gemini 3.7
Flash execute the holdout. Generic owner-issued effect resolutions and a real
bounded render remain subsequent gates, not hidden success criteria for the
first provider selection run.

**Non-leading provider-dependency V3R3 execution checkpoint (2026-08-23):**
commits `38de0ec96` through `9ca9e8f9a` freeze the provider manifest, pass the
zero-inference request-capture preflight, connect the resumable provider
runner, expose the existing beat-sync and filter owners honestly, randomize
three tool presentations and preserve all intermediate cohort identities.
Final manifest `4e380387...` is bound to source commit `9ca9e8f9a`, CAP-2A V6,
the complete forty-operation directory, the exact six eligible records and
result-reference contract `EDITRON_PROVIDER_NATIVE_RESULT_REFERENCE_V2R_3`.
Preflight receipt `1f6ec9dc...` covers all nine rows with zero inference and
zero project access.

The immutable V3R3 provider receipt `929241d7...` originally reported two
passes, four failures and three Gemini infrastructure non-evaluations. Row
audit proved that all six Luna/Terra episodes selected the exact six legal
operations, passed hidden semantic evaluation, advanced the isolated revision
`R42 -> R43 -> R44 -> R45` and stopped honestly at `READY_FOR_PROOF`. The four
reported failures came from an over-broad schedule rule that demanded
`expectedProjectRevision` from a read-only operation whose CAP-2A schema does
not define that input. Commit `9ecf50240` now requires the latest writer
revision only from operators that declare that input; stale, copied and forged
handoffs still fail at the next revision-sensitive owner.

Offline replay tool commit `a7e2cba3d` revalidates the immutable episodes
without provider inference or project mutation. Replay receipt `d1cc5d7c...`
at commit `dbbdece5b` records Luna 3/3, Terra 3/3, zero evaluable failures,
three Gemini credit-depletion 429 non-evaluations, zero inference calls and
zero state effects. Recorded estimated spend is `$0.244869160`: Luna
`$0.024154960`, Terra `$0.220714200`, Gemini `$0`. The result interpretation is
frozen in
`docs/editron/open-ended-editing/oe-stage25-provider-dependency-v3r3-results-2026-08-23.md`.

Earlier V1.1/V1.2/V3R1/V3R2 runs remain immutable diagnostics, not model
scores: they exposed hidden owner-value predicates, the absent public filter
form, schedule-rejection misclassification and rejection of semantically
empty optional result-reference arrays. V3R3 proves one six-operation
fork/join dependency episode under three tool orders. It does not prove
generic dependency planning, rendered quality, durable compaction/resume,
ProjectService execution or Stage 2.5 `GO`. Gemini remains unmeasured rather
than failed until a funded credential passes a separately versioned preflight.

**Bounded owner-issued effect checkpoint (2026-08-23):** commit `3a161c562`
removes the hand-authored effect fixture from the real dependency-episode path.
The existing isolated operation owner now supplies the observed calls,
outputs, writer revisions, changed paths and final clone state to a separately
versioned, holdout-scoped effect issuer. That issuer binds exact project paths,
half-open timeline ranges, identity refs, required/produced/invalidated
artifacts and every abstract CAP-2A effect string to the existing compiled-node
and planner-record hashes. The existing scheduler then produces the intended
read fork followed by the three ordered mutations; the effect owner adds no
operation and has no project authority. Altered owner paths or state fail
closed. The focused owner/trace/scheduler battery passes 20/20 with typecheck
and focused quiet lint passing.

This closes owner-issued effects only for these six frozen operations in this
research clone. It is not a generic forty-operation effect resolver and does
not prove a ProjectService reload or rendered result. The next proof slice must
replay an immutable passing episode into the isolated owner, bind this exact
effect receipt, render only the affected ranges through the existing Editron
renderer and keep unavailable audio/reload claims explicitly unverifiable.

**Superseding H03 V3R3 paid-run checkpoint (2026-08-22):** commits
`ee55d9d1d`, `b37e97005` and `ffe78719f` converge the generated render snapshot
onto the existing Debian Bookworm VCR runtime, bind the accepted snapshot into
the spend authorisation and make execution consume that authorised identity.
Fresh snapshot `snap_6Z8KLEnNn9kLx3JzW7UqcS5NgQEw` passed the exact Remotion
4.0.509, glibc 2.36, linked-compositor, browser, Sharp, TSX and real H.264
canaries. A fresh zero-inference preflight then passed, and all eighteen H03
V3R3 provider rows executed under authorisation
`7d3cf7dd6fd7aea53f421b70b704e34f9278dcb81d8ea056916ccd331b50ead4`.
Cohort receipt
`b0df262777a9e54ca95238ca7c06e4f2a2ebcd71528710a7bccf80ea414318a4`
records eighteen provider attempts, `$0.21793785` spend, zero project reads,
zero mutations and no state effects. Luna and Terra returned twelve complete,
untruncated, contract-accepted source artifacts. Gemini's six generation calls
returned HTTP 429 after successful official token counting and are
`UNVERIFIABLE_PROVIDER_RATE_LIMIT`, not editing failures.

The run also exposed a benchmark defect: the provider-visible API did not
declare component-to-layer-kind bindings or CSS-pixel translation units, and
the verifier checked only ID existence. Terra's six and Luna's two sources
therefore passed verification before failing on an undeclared `title-main`
source-panel use; four other Luna sources rendered real MP4s but failed motion
proof after using fractional translations. V3R3 remains immutable, valid raw
execution/accounting evidence, but **invalid for final model ranking**. The
frozen interpretation is `MODIFY_AND_RERUN_CORRECTED_IDENTITY`. Correct the API,
kind-aware verifier and target-not-recipe motion proof; reissue CAP-2A; freeze a
new H03 identity; then rerun affected rows. Full facts and hashes are in
`docs/editron/open-ended-editing/oe-h03-v3r3-provider-source-results-2026-08-22.md`.

**Corrected H03/CAP-2A checkpoint:** commits `9632e7541`, `9f0c2c072` and
`d84b54159` now declare component-to-layer kinds and CSS-pixel units to the
provider, reject kind-invalid programs before sandbox execution and verify all
six target-derived panel-motion directions rather than two convenient edges.
The real V3 sandbox/hybrid canary and the wider V2 H03 proof suite both pass.
Commit `e3ea46fde` then reissues CAP-2A V6 against source commit `d84b54159`,
including the committed ThinkForge canary route instead of claiming the old
surface was unchanged. V6 binds 222 source paths, 11 observations and 477
identifier occurrences to source snapshot
`705d4b3d5b8d51fc350af1828a5dea4b216cdb5f45d77c4828c409eb1c8d2060`;
its manifest is
`2549623eaca44feabf15aa53d8dd93c02804b37406db69879fd047981d2f9ce9`.
It still records 37 atomic candidates, zero certified operations, zero
production-eligible operations and no runtime authority. Commits `8352135de`,
`c1600e978`, `c9a6c1b51` and `7064fe381` then freeze the V6-bound H03
generated-source V3R4 identity, bind its sole row owner, authorise only the
bounded research run and provide committed operator scripts. Historical V3R3
artifacts remain unchanged and invalid for final model ranking.

**H03 generated-source V3R4 execution checkpoint:** zero-inference preflight
passed, after which all eighteen authorised rows executed under authorisation
`5e19fc932210dfad9ebf469adc1d72338413632b26d36fbb4a48d94984375f72`.
Cohort receipt
`47a57bf2b46f8be3b1e0ec27d8d1f2b68cae2185508895393ef0a7cae76f60a2`
records four `PASS_RENDERED`, eight `PROOF_UNVERIFIABLE` and six
`SOURCE_NOT_ACCEPTED`, `$0.21068595` exact recorded spend, zero project reads,
zero mutations and no state effects. Luna passed 3/6 rendered rows and Terra
1/6. The other eight OpenAI rows passed the corrected source contract but
failed target-derived motion proof, except one Luna program rejected for a
non-finite translation. All six Gemini 3.7 requests returned HTTP 429 before
inference and are provider non-evaluations. The capability-ceiling arm did not
exercise repair because every OpenAI source passed static verification on its
first response; it must not be described as a measured render-repair curve.
This is valid bounded evidence for one synthetic generated-composition task,
not a provider leaderboard or production promotion. Full frozen interpretation
is in
`docs/editron/open-ended-editing/oe-h03-v3r4-provider-source-results-2026-08-22.md`.

Truthful H03 protected-literal input, source-synthesis contract, owner-gated
zero-inference source episode and lossless trace/hidden-evaluator binding are
complete. The exact accepted model-tagged source is also connected to the sole
decoded-output measurement owner through the existing sandbox host contract.
Commits `06150a94e` and `82c7db926` now carry that synthetic, model-tagged
contract callback through a real Vercel deny-all microVM and the existing
decoded hybrid-proof owner. Receipt
`17a81dc399d1c9dc0dbe30bc39b6f40d25e4798756271045c39469092d05722f`
records `VERCEL_SANDBOX`, `DENY_ALL`, `persistent=false`, teardown success,
zero project mutation and a hash-bound 420-frame native/generated/native
proxy. This is live sandbox/proof infrastructure evidence only: its source is
`SYNTHETIC_CONTRACT_CALLBACK_NOT_PROVIDER_OUTPUT`, so it proves no provider
model performance. CAP-2A V5 is now reissued against this stable checkpoint.
Commit `d318a3122` connects the existing metered provider transport to H03's
exact owner-authorized, hash-bound source packet and returns generated source
only to the existing verifier. Its fake-provider tests prove route, argument,
packet and repair-ordinal drift fail before dispatch; the seam has no project
authority. No paid inference ran in that phase. Commit `aa33b4dbc` now freezes
the CAP-2A V5-bound H03 V3R3 cohort: three provider routes, production-budget
and capability-ceiling arms, three repetitions per route/arm and eighteen
planned rows. The absolute authorization ceiling is `$11.673`; this is a
worst-case bound rather than expected spend. The frozen contract-source and
manifest hashes are respectively
`cc9b801ebddc68f2aa427493bc3baca35e913fdee15f88ab2b362902ca6b5fe9`
and `6fec9b9ef6c8fb9e816f7dd6c2f78cab137872b7dc37d7abd2f86b08db3315a2`.
Commit `0302b43a4` adds the committed shared input builder and operator CLI.
The real credentialed zero-inference preflight then passed against the frozen
manifest. Provider-infrastructure receipt is `26ade7ec...`, H03 preflight
receipt is `05a941d7...` and operator receipt is `38e39712...`; three metadata
GETs and seven official Gemini token-count POSTs occurred, with zero inference,
project reads or project mutations. Dispatch remains unauthorized. Issue a
separate exact authorization before executing the frozen eighteen rows, then
bind every accepted source to the existing sandbox, decoded proof and hidden
evaluator. Only after that should the generalisation episodes and blind
quality receipts proceed toward `GO`, `MODIFY` or `NO-GO`.

**Latest bounded reissue checkpoint:** CAP-2A V5 was issued in commits
`839ce4be5` and `1d0107eab` against stable source commit `82c7db926`. It binds
221 source paths, 11 supplemental observations and 475 identifiers to source
snapshot `c68e1a33469c1ec5093bfa22b0e7cdf3e905622c4a8a637a6faee5014d456572`
and manifest `0b18f216bb7a825eb607353f80dd34fbe00b661ea3dd439782fcf76dab27a4f0`.
It reconciles the changed H03 source/proof code and binds the exact live
sandbox receipt while recording source origin
`SYNTHETIC_CONTRACT_CALLBACK_NOT_PROVIDER_OUTPUT`, model-performance claim
`NONE`, zero project mutation and zero catalog promotion. CAP-2A V1–V4 remain
immutable historical artifacts; the paid V2R2/V2R3 cohort below remains
truthfully bound to V4 and is not silently rehashed onto V5.

**Latest H03 provider-adapter checkpoint:** commit `d318a3122` factors the
already-tested direct provider transport into one non-authoritative source
adapter and binds H03 to its exact sealed packet. Focused adapter checks pass
5/5; the wider generated-composition/H03 set passes 27 tests with one
intentional skip; repository typecheck and lint pass. This is
`VALID_HARNESS_EVIDENCE`, not a provider result: all calls were injected fakes,
spend was zero, source was not rendered from a live provider response, and no
ProjectService state was read or mutated.

**Latest H03 V3R3 cohort checkpoint:** commit `aa33b4dbc` freezes
`EDITRON_OE_SEALED_HOLDOUT_H03_PROVIDER_COHORT_V3R_3` against CAP-2A V5,
the current route/pricing manifest and six exact implementation hashes. Its
production arm permits one source candidate, no verifier repair and at most
two provider HTTP requests; its capability-ceiling arm permits two candidates,
one verifier-guided repair and at most four provider HTTP requests. Three
providers x two arms x three repetitions produces eighteen rows. The exact
maximum-spend assertion is `$11.673`. Focused and H03/provider/render
regressions pass 34/34 across nine test files; repository typecheck and lint
pass. Those checks use fake provider traffic and prove only cohort/preflight
integrity. The credentialed preflight, inference, provider-generated renders
and model-quality results are still pending.

**Latest H03 V3R3 credentialed preflight checkpoint:** commit `0302b43a4`
adds one shared repository-byte input builder and a no-inference operator CLI.
The live preflight artifact is under
`.calibration-temp/open-ended-planner-v2/sealed-h03-provider-v3r3-preflight-20260822075538/`.
Infrastructure receipt `26ade7ec24fa4eb2da7cd756dc8f6903925c2e082725616eab6cbe9fc5578429`,
H03 receipt `05a941d79a8f716772a180cc1bda94e29972ac533475c4fb3d6ed57156c0741b`
and operator receipt `38e39712f62f1a9367d46c887409fb05935afbecb495d2201c0b32321257ba36`
all bind manifest `6fec9b9e...`. Network effects were exactly three model
metadata GETs and seven official Gemini token-count POSTs; inference calls,
project reads and project mutations were zero. Assessment is
`PASS_READY_FOR_EXPLICIT_SPEND_AUTHORIZATION`, not paid-dispatch authority and
not model-performance evidence.

**Latest sealed-cohort checkpoint:** commit `1a30d919d` reissues the unspent
cohort as contract `EDITRON_OE_SEALED_HOLDOUT_COHORT_V2R_2` and identity
`EDITRON_OE_SEALED_HOLDOUT_COHORT_IDENTITY_V2R_3`, bound to CAP-2A V4. Its
contract-source, manifest and zero-inference preflight hashes are respectively
`fae09443bde25364dfa5859e4213b2a027e8bdb3f7c8423b030612c8b60ddb92`,
`5a7ceece49f33378b8f13876e5e386e0ced41f642468d42671a67bcd35bdedaa`
and `0e2db9be7b77b1932ada24401048e714f0745ec5d2cc6916455d86ce27e83c7d`.
Stale CAP bindings fail closed.

**Complete zero-inference gate:** commit `051f7be27` composes the current
cohort, route/accounting owner, isolated causal episode, lossless trace, hidden
evaluator and all eight claim-specific proof paths. The regression passes
34/34 across ten test files, makes zero external network/inference calls, zero
real-project mutations and records only scripted provider turns. This is
`VALID_HARNESS_EVIDENCE`; it is not model performance, provider dispatch,
ProjectService execution or production certification.

**Current-identity credentialed preflight:** commit `5fbf025f5` corrects the
capture owner to serialize the same budgeted V2R-3 packet used by paid
execution. The former V1 receipt/capture pair `4f27e3fc...` / `bef05c65...`
captured the historical non-budgeted packet and is now
`INVALID_FOR_PAID_DISPATCH`. No inference call occurred while discovering the
drift. The Production-credential V2 reissue passed all 96 initial request
captures for Luna, Terra and Gemini 3.7. All request hashes are distinct;
bounded inputs remain below 85,000 tokens; the run made three model metadata
GETs, 32 Google `countTokens` context-egress calls and zero inference,
project-read or project-mutation calls. Receipt SHA-256 is
`428cdc9aea676c5dae8ac2887cc2e78507b3ef8dcff12d5a059fb5007cbad622`;
capture-set SHA-256 is
`62d2626084bfbacd34840ac391001e58c86dac6ce5074a95b1494807f5dc8356`.
At this historical preflight checkpoint dispatch remained false. The report is
`docs/editron/open-ended-editing/oe-v2r2-sealed-paid-cohort-runner-readiness-2026-08-22.md`.

**Paid execution and frozen-interpretation checkpoint:** the operator issued
authorization
`721324c56ef3d6f82316145df5c6de7de36085459068cd275ed97b09ec08038e`
and completed all 96 rows at
`.calibration-temp/open-ended-planner-v2/sealed-holdout-paid-cohort-20260822020829`.
The immutable raw cohort receipt is
`9582dffc068b7319835d48da4834c1de70bdb29b39aa011ce0239fa12238022f`:
466 provider inference turns, 176 Google `countTokens` calls,
`$9.730960595` recorded spend and zero real-project reads, mutations or state
effects. Re-running the exact cohort CLI against the completed root returned
the identical receipt without a provider call.

Commit `b5f2af0da` adds a hash-validating interpretation owner and a read-only
local environment-reproof CLI. It does not change a request, response, trace,
evaluation, proof or raw receipt. Interpretation receipt
`20b5e1c2f1e61c86f918b4894acaa34150faf57e23e86049a5d43cc2514dc01c`
separates the 96 rows into 24 valid safe-stop proofs, two valid rendered HOLD-02
edit proofs after unchanged short-path reproof, 21 valid model-trace failures,
19 benchmark-confounded rows and 30 resource-guard non-evaluations. The two
claim-proof receipts are `33327b06549e...` and `47d4d223280b...`; both render
the same hash `6901fd8ec486...`. Raw `PASS_CLAIM_PROOF=24` must never be
reported as 24 editing passes: every original pass was a no-edit safety proof.

The exact interpretation, route counts, confounds and artifact hashes are in
`docs/editron/open-ended-editing/oe-v2r2-sealed-paid-cohort-results-2026-08-22.md`.
The cohort does not support a provider leaderboard or Stage 2.5 `GO`.

**Historical paid-dispatch and proof-readiness checkpoint:** commit `408db9c3f` added the
separate, expiring, hash-bound paid-dispatch authorization contract. At that
pre-run checkpoint no authorization artifact or paid sealed inference existed;
the paid execution checkpoint above is the current truth.
Before spend, commit `d5a7d949f` closed the hidden-arm no-edit proof gap for
all eight C2 cases and rejects both forged evaluation and mutation-laundering.
Commit `dcc0e4008` then versioned the H01/H02/H04 C2 rendered-proof receipts;
all three noisy arms that are legally allowed to proceed pass the same exact
state/render predicates as C1. The focused proof regressions pass 14/14 and
9/9 respectively, with full typecheck and repository lint. This is
`VALID_HARNESS_EVIDENCE`, not model performance. Commit `5fbf025f5` adds the
resumable/cohort-budgeted runner, sole proof dispatcher and adversarial 96-row,
resume, row-tamper and aggregate-tamper tests. At that checkpoint the next
action was paid-authorization issuance followed by the 96-row run; the
execution/interpretation checkpoint above supersedes it.

- **V3 P1/P2/P3 is `RAW_EXECUTED`, not valid sequential-mutation evidence.**
  All eighteen Luna/Terra/Gemini 3.7 route/arm/permutation rows ran. The P2/P3
  paid root is
  `.calibration-temp/open-ended-planner-v2/provider-native-handoff-order-v3-run-20260821144755`;
  its manifest and experiment-receipt SHA-256 values are respectively
  `b9a4284b1c609472e91ca08ab21710b42da5be1a2f231541cec35c8f0033fcb3`
  and `46577191dd2c03d354975ce0fbe204e66099e59623466f49ffd0376aa95f8080`.
  The P2/P3 calls cost approximately `$0.421437`, made zero real-project
  mutations and selected `find_audio_moment` first in 12/12 rows. Across all
  three presentation orders, the only currently defensible model observation
  is 18/18 correct first relevant operation choice.
- **The old execution verdict is `INVALID_EVIDENCE`.** The isolated
  `sync_cuts_to_beats` write did not expose a writer-issued post-mutation
  project revision. Eleven raw P2/P3 passes reused stale `R11`; Terra direct P2
  correctly stopped with
  `MUTATION_REVISION_NOT_EXPOSED_FOR_REQUIRED_FOLLOW_ON_CAS`. P1 used the same
  defective clone, so all eighteen rows must be rerun under a new identity.
  The immutable reconciliation report is
  `docs/editron/open-ended-editing/oe-v3r-provider-native-handoff-order-p2-p3-results-2026-08-21.md`.
- **The writer foundation and fair benchmark contract are repaired; fair
  re-execution is complete.** The isolated DEV-03 session now issues an opaque revision
  after each write, records before/after revisions, rejects stale reuse and
  binds repair to the latest revision. The connected episode is V2R_5. The
  new V3R contract declares
  `sync_cuts_to_beats.receipt.projectRevision` as the origin of
  `apply_camera_shake.expectedProjectRevision`, carries it directly in one arm
  and by an opaque result reference in the other. Its evaluator rejects
  missing, stale, forged and copied-literal opaque revisions. Focused V3R tests
  pass 25/25; the complete provider-native suite passes 100/100 with two
  intentional real-render skips. The stale V2R_4 cohort assertion is corrected.
- **CAP-2A V3 is `DONE_ARTIFACT` for the current bound snapshot.** V1 and V2
  remain immutable historical evidence. V3 chains V2 manifest
  `3451770615e7313158b7fcb6e7d298cf7c5bd88db09287b4a9b07069b7c88276`,
  binds the current 221-path normalized snapshot
  `f9d7ed86323aa83605e491bb5d240235f4c228036fc69b9b9ade686e4b9b6655`,
  and has manifest hash
  `180e5699ee939b9514dfc50b41513361c525fb7a0b433bda4226b466553cbf2a`.
  All 81 CAP tests pass. Its four post-V2 deltas record the reaffirmed
  ThinkForge detach, organization-scoped Alyzitron Brand Vault lookup, the MG
  review deploy gate with missing per-operator authorization, and project
  intake script/aspect persistence with fail-soft gaps. It grants zero planner,
  mutation or production authority and is invalidated by any bound-file drift.
- **V3R4 is `VALID_EVIDENCE / RESEARCH_PROVEN` for the bounded DEV-03
  handoff/order claim.** The production-credential preflight bound V3R4 to
  CAP-2A V3 and passed 18/18 request/token checks with zero inference. The fair
  paid cohort then passed 18/18 for first relevant choice, causal execution,
  semantic handoff, writer-issued revision handoff, rendered proxy proof and
  no real-project mutation across Luna, Terra and Gemini 3.7, both handoff arms
  and three presentation permutations. There were zero evaluator,
  provider-infrastructure, render-infrastructure or harness failures. Estimated
  actual spend from provider token receipts is `$0.626745190`, not the
  `$21.126758` worst-case ceiling. The immutable interpretation is
  `docs/editron/open-ended-editing/oe-v3r4-provider-native-handoff-order-results-2026-08-22.md`.
- **HREF-01 is `READY_FOR_SINGLE_PROJECT_OWNER_REVIEW`, not human-approved.**
  One Gemini 3.6 native-video/audio observation completed with no editing
  operators and no project mutation. Its blinded pack contains the exact full
  64.75-second source plus the requested `[20s,23s)` window at 60/1 fps: 180
  decoded frames, embedded audio and a separate 96 kHz stereo PCM WAV. The
  public pack hash is
  `4431c08ba4f3731718f350723137699dd57cca810e0c80c0f5c95b922fbe93ba`.
  Gemini 3.7 attempts ended in provider HTTP 500/high-demand errors and are
  infrastructure failures, not semantic failures. The user's earlier sparse
  rubric approval approved the protocol, not this model output. A single
  project-owner review is useful evidence, while formal promotion remains
  blocked pending a second independent qualified reviewer. Exact artifacts and
  hashes are recorded in
  `docs/editron/open-ended-editing/oe-href01-native-review-pack-2026-08-22.md`.
- **Historical media-foundation checkpoint (superseded by the paid-cohort
  result below):** the eight sealed holdout media inputs reached
  `INPUT_EVIDENCE_READY` before provider dispatch. A separate V2R materializer binds all twelve
  internally owned synthetic artifacts for `HOLD-01` through `HOLD-08` to the
  immutable task recipes, codec binary and exact output bytes. Its manifest
  hash is
  `4527aadaea84cf91a9499439dafd369a773ee01b97a49fe0ef9c68ce74fa63b6`.
  The immutable V1 task fixture remains unchanged; a separately hashed V2R
  correction overlay binds HOLD-03's full-screen return to `h03-a` source
  frame 270. The corrected reference now contains six actual windows rather
  than six being asserted over a five-window image.
  `HOLD-04` contains a synthetic tone and quiet interval, not intelligible
  speech. The media contract is research-only and supplies no provider,
  ProjectService or production authority. Exact scope and limitations are in
  `docs/editron/open-ended-editing/oe-v2r-sealed-holdout-media-foundation-2026-08-22.md`.
- **Historical zero-inference checkpoint (superseded by the paid-cohort result
  below):** the reissued leakage-free sealed cohort passed local preflight at
  commit `f3ce50970`, before any provider inference dispatch. That commit
  binds eight tasks,
  sixteen opaque cases, the same forty-operation planning context for every
  case, thirty-three research-callable operations and seven honestly
  unavailable operations. Public packets exclude semantic condition names and
  all evaluator/expected-answer material. The local receipt made zero network,
  inference, project-read or project-mutation calls and has SHA-256
  `97ae84e7ebea8840e4e1cd8b6dac384e67ca8549080b0227324132081445326f`.
  Commit `dc341dfbe` previously captured all 96 exact initial requests under paid
  credentials: sixteen cases, three routes and two handoff modes. All 96
  request hashes are distinct; provider identities passed; bounded initial
  inputs span 67,364-81,464 tokens under an 85,000 research ceiling. The run
  made three model-metadata GETs, thirty-two Google `countTokens` context-egress
  calls and zero inference calls. Credential receipt
  `a7da12363bf0397a8e88c0d116fcc1ac0f6763eb28fbaddb388b9156d3d10eef`
  and capture-set hash
  `467e0163ec8485b83359d1e5e100e3dace2dc9e41b4b4677b49bd1fb504e2431`
  verify `dispatchAuthorized=false` for the superseded identity only. It is
  historical evidence, not authorization for the reissued cohort. At that
  checkpoint, credentialed preflight, cumulative per-turn token/spend controls
  and real proof were still pending; the later paid-cohort section records what
  actually ran.
- **The generic sealed-holdout episode, lossless selected-operation trace and
  hidden structural evaluator are `RESEARCH_PREPROOF_READY`; claim-specific
  proof is partial rather than globally unwired.** Commit
  `2a0176cc9f84f6b253a49757e1145f3dcf6c00be` connects every frozen public case
  to the existing provider-native episode loop. Every case receives the same
  forty-record planning context: thirty-three callable tools and seven visible
  unavailable records. Task-shaped tool subsets are rejected, evaluator-only
  facts remain absent, direct and opaque-result handoff remain available, and
  rights/privacy/security denial now has a distinct `POLICY_BLOCKED` terminal
  instead of being mislabeled as editing failure or capability absence.
  Commits `7e80a05b4` and `2835458fb` then make
  `CLARIFICATION_REQUIRED` distinct, derive opaque output references from the
  complete tool schemas, bind every callable writer's
  `receipt.projectRevision` as a possible downstream revision origin and add
  the default sealed owner session. The owner resolves only evidence classes
  authorized for the selected tool, never exposes condition/evaluator facts,
  rejects stale/project-drifted calls and issues a deterministic revision for
  its in-memory operation-log clone. A real wrapper run proves this connector
  without an injected executor. The clone does **not** execute real native
  media mechanics, compile generated code, render, mutate ProjectService or
  judge quality; its PASS receipt means only “typed operation admitted to the
  isolated log, proof not run.” Commit `b148486ce` then freezes a lossless
  projection of the model's exact calls, normalized arguments, typed result
  references, evidence references and writer-issued revisions. The projector
  adds or removes zero creative operations. A separate hidden post-episode
  evaluator rejects invalid traces, missing evidence, forbidden operations,
  stale conflicts without evidence, premature PASS and structurally incomplete
  task plans; it never repairs a model plan. Hidden rubric material is neither
  retained by the owner session nor returned in the trace. Focused
  causal/owner/trace/evaluator checks pass 21/21; repository typecheck and lint
  pass. `READY_FOR_PROOF` still means real claim-appropriate proof is required.
- **Historical resource-accounting implementation checkpoint (superseded by
  paid-cohort execution):** budgeted episode V2R-3 is a new identity;
  historical V2R-2 bytes and behavior remain unchanged. V2R-3 binds an
  operator authorization to the exact manifest, case, public-case hash and
  provider route hash. It derives selected-operation, per-operation candidate
  and cumulative-output limits from the case; permits only the node allowance
  plus two schema repairs and one finish; lowers each later output allowance;
  requires a request-hash-bound input-token upper bound; reserves worst-case
  spend before each call; and records actual normal/cached/cache-write,
  output/reasoning/thought usage afterward. Missing, inconsistent, stale or
  over-bound accounting terminates before an owner operation runs. Candidate
  counting is explicitly pinned to catalog V2R-8 discovery/resolver outputs,
  so a later catalog revision must update that policy instead of silently
  bypassing it. Commit `ddfc04b78` contains the four-file runtime owner slice.
  Commit `4d6230a04` then adds a separately versioned V2R-3 selected-operation
  trace and hidden evaluator: it binds the budgeted wrapper, provider receipt,
  runtime-budget receipt and V2R-3 context while preserving the historical
  V2R-2/V1 artifacts. Resource exhaustion or unverifiable accounting is now
  `NOT_EVALUATED_RESOURCE_GUARD`, never an editing-model failure; forged or
  inconsistent wrapper/trace bindings fail closed. The combined current
  episode/resource/trace/evaluator checks pass 17/17 and typecheck/focused lint
  pass. This was the pre-dispatch state. The later 96-row paid cohort used this
  accounting path: thirty rows stopped as
  `NOT_EVALUATED_RESOURCE_GUARD`, so those rows are resource evidence rather
  than model-capability verdicts.
- **Historical route/accounting checkpoint (superseded by paid-cohort
  execution):**
  Commit `94de011ae` binds each approved manifest/case/public-case/provider-route
  tuple to a dated official pricing snapshot, exact route identity and explicit
  provider-context-egress disposition. Luna and Terra use the owned conservative
  `o200k` counter without egress; Gemini 3.7 uses Google's official
  `countTokens` endpoint and records that disclosure. The receipt persists no
  secret and authorizes zero inference calls. Route, approval, request, price
  expiry and counter-response drift fail closed; focused tests pass 3/3 and
  repository typecheck passes. This is not yet an episode simulation and does
  not authorize provider dispatch.
- **The sealed no-edit proof family is `RESEARCH_PROVEN` for HOLD-06/07/08.**
  Commit `83405595b` recomputes the hidden V2R-3 evaluation and accepts only an
  accounted, allowed terminal with execution form `NONE`, zero successful
  mutation/generated nodes and zero declared state effects. It covers rights
  or authorization stop, stale-revision conflict and honest capability/evidence
  gap; focused tests pass 5/5. Its receipt explicitly does not claim real
  ProjectService byte equality or rendered quality. HOLD-01/02/03/04/05 are
  recorded separately below as bounded proof adapters; none is production
  ProjectService execution.
- **HOLD-01 now has `RESEARCH_PROVEN_LIMITED` rendered native-proxy proof.**
  Commit `3e22af490` consumes the accounted lossless trace-selected operation,
  requires the native `use_matching_footage` mutation and its writer-issued
  research revision, binds both input files to the committed media identity,
  renders the selected hard cut and decodes adjacent output frames 149/150.
  It passes only when centre distance is at most `0.03`, diameter ratio is
  within `0.9..1.1`, the output is 640x360 H.264 at 30/1 with exactly 300
  decoded frames and no audio, and no transition is present. A later incoming
  source start fails from the decoded pixels and altered source bytes fail by
  hash. Combined media/no-edit/HOLD-01 checks pass 12/12; typecheck and focused
  lint pass. This proves one isolated 30-fps source-range splice, not real
  ProjectService mutation, product-renderer parity, mixed-rate handling or a
  generally certified match-cut capability.
- **HOLD-02 now has `RESEARCH_PROVEN_LIMITED` rendered native-proxy proof.**
  Commit `81eeb933a` consumes three causally chained trace-selected
  `add_overlay` mutations, including opaque writer-revision handoff, and
  renders the exact door-open, process and door-close source ranges. Decoded
  frames prove the first door narrows, the process middle is visually distinct
  and the final door widens from a disjoint range. A structurally distinct but
  semantically wrong closing range reaches `READY_FOR_PROOF` structurally and
  is then rejected by the claim-specific adapter. HOLD-01/HOLD-02 regressions
  pass 5/5; typecheck and focused lint pass. This covers only the rendered
  `[0,240)` research proposal at 360x640 and 30/1. It does not prove the
  untouched `[240,720)` project range, real ProjectService writes, product
  renderer parity or a generally calibrated repetition policy.
- **HOLD-03 now has `RESEARCH_PROVEN_LIMITED` rendered hybrid-proxy proof.**
  Commits `4c5b5354b` and `625b36478` consume the sealed selected-operation
  trace and all three required evidence refs, compile a hash-bound
  human-authored generated-program fixture through the allowlisted
  generated-composition API, and render a six-window island over owned
  `h03-a`/`h03-b`. The complete 420-frame proxy keeps native
  `h03-a[0,90)` and `h03-a[270,420)` around the generated `[90,270)` island.
  Decoded evidence proves six filled panels, a visible centered title,
  measured entry/exit motion, zero source-panel/title-footprint intersection
  and source-frame-270 continuity. Supplying reference asset `h03-ref` as a
  render input fails closed. The focused proof is 2/2 and the generated plus
  sealed proof regression is 44/44. This does **not** prove that a model wrote
  the composition, a production security sandbox, real ProjectService nested
  composition insertion/update, product-renderer parity, mixed rates or
  general reference reconstruction quality.
- **HOLD-04 now has `RESEARCH_PROVEN_LIMITED` canonical-owner/state/AV proof.**
  Commit `82f412bbb` consumes one evidence-bound `cut_section`, requires its
  writer-issued research revision, and invokes the existing
  `timeline-range-cut.ts#cutTimelineRange` owner on an isolated project clone.
  That owner removes `[120,225)`, maps the retained second take from source
  frame 225 to timeline frame 120, leaves exactly one `our launch is Friday`
  caption occurrence and preserves a computed presentation-material hash.
  A hash-bound 640x360 H.264/AAC proxy then proves 435 decoded frames, mono
  48-kHz audio, and the retained visual/tone window. Wrong range and unresolved
  caption evidence fail closed; combined HOLD-01/02/04/no-edit checks pass
  13/13 with typecheck and focused lint. This is not ProjectService mutation,
  caption-pixel proof or speech-intelligibility proof: the fixture has only a
  symbolic caption-presentation reference and synthetic tone audio.
- **HOLD-05 is `RESEARCH_PROVEN_LIMITED`, not a production native PASS.** The
  historical zero-inference diagnostic found 38/450 clipped frames and an
  unprojected authored logo because the v1 owner confused normalized source
  centres with CSS cover-crop percentages. Commit `0404a253f` repairs that sole
  owner as `editron-subject-reframe-v2`: source rasters are explicit inputs,
  complete subject boxes constrain legal cover positions, tracking is linear,
  explicit authored corner relations are projected without being inferred,
  and missing rasters, malformed/duplicated layout evidence, absent targets
  and impossible crops fail closed. The owner/renderer/live-wrapper battery is
  80/80 with repository typecheck and quiet ESLint passing. Commit `8d1afc89f`
  then binds the exact trace-selected `reframe_project` operation, its
  writer-issued research revision, both sealed evidence records and the
  committed H05 media identity. It decodes all 450 source frames, invokes the
  sole v2 owner, renders a 360x640 H.264 proxy and decodes all 450 output
  frames. A static-centre plan and changed source bytes fail closed. The logo
  proof is deliberately a symbolic yellow marker for the authored
  top-right-five-percent relation; it does not claim logo-asset pixel identity.
  The live chat path still supplies no canonical authored-layout evidence,
  performs an unsafe whole-project save plus a separate audit write, and has no
  ProjectService receipt/undo/replay proof. The silent fixed-30 fixture proves
  neither audio-byte preservation, mixed rates nor production reframe
  certification. V3 historical CAP parsing is now separate from an explicit
  current-source assertion; V3 remains stale rather than being rewritten.
- **Stage 2.5 status remains `MODIFY_AND_PROCEED_RESEARCH`.** No production
  model-driven mutation or Stage 3 control plane is authorized. Revision
  handoff repair, CAP-2A V4, V3R4's fair eighteen-row rerun, the sealed
  credential preflight, paid authorization, all 96 paid rows and frozen
  interpretation are complete. The sealed run provides 24 valid safe-stop
  proofs, two rendered HOLD-02 edit proofs after environment-only reproof and
  21 valid bounded trace failures. Nineteen execution rows are invalid for
  model comparison because HOLD-01/03/04/05 contain owner, visible-schema,
  post-state or proof contradictions; thirty more were not evaluated after the
  85,000-token resource guard stopped them. HREF-01 still lacks its second
  qualified independent review.

  Commit `bb16d0b96` now provides the prerequisite versioned catalog seam: the
  frozen V2 builder remains hash-stable, corrected catalogs are explicit opt-in
  authorities, and forged hashes, operator sets or finish schemas fail before
  inference. This is enabling plumbing, not the corrected identity itself.

  Commit `14e3d791b` then publishes the opt-in
  `EDITRON_OE_SEALED_HOLDOUT_OPERATOR_CATALOG_V3R_1` contract and its injected
  semantic-owner policy without changing the historical V2 default. It closes
  the nested generated-composition and subject-reframe input forms, closes the
  resolver-specific visual output, and aligns the HOLD-01 resolver with
  `use_matching_footage`. Missing source duration, undeclared candidate-only
  windows and insufficient source handles fail loudly. Focused catalog/owner
  tests pass 12/12 and repository typecheck/lint pass. This is
  `VALID_HARNESS_EVIDENCE`: no cohort/manifest identity, proof owner, model
  response or paid-call authorization changed.

  Commit `3c8686859` freezes the corrected derived cohort identity
  `EDITRON_OE_SEALED_HOLDOUT_COHORT_V3R_1` without rewriting V2. Its contract,
  manifest and shared-context SHA-256 values are respectively
  `1294613a8ff5004f63fd94235a7f345e30d75ae1577b9a54f4e92ded07490c48`,
  `c82c4f3b512defe025ee2b57eee050305bb7380eddfea55bcddf8574901f68d2`
  and `be6a552fe1170e2143ac8773cfddbe034ddde2362520d8dcc36940dbafe28ecc`.
  It binds the V3R catalog, the unchanged V2 base/media identities, explicit
  source duration/rate, and measured H01 evidence. The old `[30,120)` value is
  retained only as a source-search interval; actual adjacent-frame geometry
  supports the half-open start window `[30,37)`. Noisy C2 remains
  `UNVERIFIABLE`, provider dispatch remains false, focused checks pass 14/14,
  and full typecheck/lint pass. This is a frozen input identity, not yet a
  connected V3R episode, proof, preflight or model result.

  Commit `d82441179` connects that exact V3R manifest/catalog to the existing
  provider-native tool loop and the existing isolated owner through explicit
  validators and semantic-policy injection. It does not clone an executor.
  Scripted C1 resolves owner evidence, produces `use_matching_footage`, issues
  a writer revision and stops `READY_FOR_PROOF`; noisy C2 stops
  `UNVERIFIABLE` with no mutation. A deliberately malformed timeline read also
  demonstrated that a model's later `READY_FOR_PROOF` cannot substitute for
  successful owner calls; the regression now requires every prerequisite
  execution to be `OK`. Focused V2/V3 connection checks pass 20/20, full
  typecheck/lint pass, and no provider or real-project call occurred.

  Commit `e1e92d9f5` then connects the same corrected C1 episode to a distinct
  V3R lossless trace, hidden evaluator and rendered H01 proof. The proof reuses
  the existing media/runtime owner, binds the V3 manifest, public case, trace,
  evaluation, writer-issued revision and source hashes, renders a real
  300-frame H.264/30/1 proxy, and measures decoded frames 149/150. The measured
  half-open `[30,37)` start window is enforced: 30 passes and 37 fails before
  render. An altered evaluation and noisy-C2 false-ready attempt also fail
  closed. Historical V2 proof remains green. Focused checks pass 10/10 and full
  typecheck/lint pass. This receipt explicitly says resource-budget proof and
  product ProjectService mutation are `NOT_CLAIMED`; it is not paid-row or
  production-execution evidence.

  Commit `6cc1f56de` closes the H04 evolving-clone defect at the isolated-owner
  state layer. The V3 episode now injects a HOLD-04-only state owner that calls
  canonical `cutTimelineRange`, advances a writer-issued revision only with the
  resulting state, exposes the post-cut timeline/caption projection on a
  revision-bound reread, and rejects stale rereads. The two transcript/caption
  occurrences become one, duration changes from 540 to 435 frames, and the
  retained source child starts at frame 225. Focused owner/V3 checks pass 11/11
  and full typecheck/lint pass. This remains a fixed-30-fps synthetic research
  clone: it is not H04 rendered proof, paid model evidence, caption-pixel proof
  or ProjectService execution.

  Commit `4b3209fa1` binds H04's full V3 C1 chain. A new V3R2 hidden evaluator
  requires a successful post-cut timeline read using the exact writer-issued
  revision. The V3 proof verifies the internally hashed provider episode,
  lossless trace, evaluator receipt, evolving state transition and reread
  before reusing the existing H04 AV mechanics to render a real 435-frame
  H.264/30/1 AAC proxy. Missing reread and an internally rehashed forged
  episode fail closed; historical V2 proof remains green. Focused H04 checks
  pass 9/9 and full typecheck/lint pass. The receipt still declares resource
  budget and product mutation `NOT_CLAIMED`; caption pixels and speech
  intelligibility remain unproved because the frozen fixture has no bound
  caption render and uses a synthetic tone.

  Commit `429fb45b1` freezes the derived H03 V3R2 public-input identity without
  rewriting V2 or V3R1. Both H03 arms now expose the exact protected title,
  blueprint identity, six measured panel bounds, title safe band, bounded
  motion relationship and native frame-270 return as hash-bound
  reference-analysis input. Rehashed literal, target or base-lineage forgery
  fails closed; focused V3R1/V3R2 checks pass 7/7 and repository typecheck/lint
  pass. This closes the missing-input defect only. It does not prove that a
  model supplied composition source, that the exact source passed the verifier
  and renderer, or that any provider row passed.

  Commit `1d902f20f` adds the distinct H03 model-source contract. It converts
  the frozen public target plus selected `generated_composition_program`
  arguments into a leak-free source-synthesis packet, then materializes any
  accepted TSX with exact model, prompt, orchestration, program and source
  hashes before the existing canonical verifier. Wrong literals, blueprint,
  assets, range, motion or continuity arguments fail before generation;
  oversized repair input and rehashed network code fail closed. DEV-02 keeps
  its historical task timing while the exported generated-composition API is
  now task-neutral. Focused source/verifier regressions pass 11/11 and full
  typecheck/lint pass. This is `SOURCE_CONTRACT_READY`, not a connected episode,
  provider call, rendered H03 proof or model pass.

  Commit `137692a5c` connects that source contract to the existing sealed owner
  and provider-native tool episode without modifying either authority. The
  owner must first accept the exact H03 evidence, assets and range; only then
  can the downstream source synthesizer run. Accepted source is bound to the
  public packet, selected arguments, model/prompt identity, program and source
  hashes and the canonical verifier. The provider episode receives hashes,
  not the raw TSX. Missing evidence prevents the source call; unsafe source has
  one bounded repair; forged packet lineage and duplicate generation fail
  closed; state effects remain empty. Focused connected/H03/V3 regressions pass
  14/14 and repository typecheck/lint pass. This is
  `SOURCE_CONTRACT_READY_FOR_RENDERED_PROOF`; it is still zero-inference
  harness evidence, not a metered provider result, rendered proof or model
  pass.

  Commit `4b04b8676` carries the accepted H03 source identity through a new
  V3R2 trace and V3R3 hidden evaluator without exposing raw TSX to the provider
  episode. The trace binds the exact program, source bundle, model, prompt,
  candidate ordinal, owner authorization and generation receipt hashes. The
  evaluator recomputes those bindings and rejects missing, stale, copied,
  forged or raw-source-leaking lineage. Historical V2/V3 identities remain
  unchanged; focused trace/episode/evaluator regressions pass 20/20 and full
  typecheck/lint pass. This remains zero-inference contract evidence, not a
  rendered or provider-model pass.

  Commit `545c311bc` separates H03 rendering mechanics from proof-version
  adapters and connects V3R2 to the existing Vercel Sandbox request/runner.
  V3R2 accepts only the exact model-tagged candidate already bound by the
  episode, trace and hidden evaluator; it verifies sandbox request/result/host
  receipt/output hashes, materializes the attested playable proxy, and reuses
  one decoded-output owner for six-panel fill, title-safe-band, entry/exit
  motion, reference exclusion and native frame-270 continuity. Historical V2
  still renders only the human fixture. Focused H03 proof/episode/trace checks
  pass 8/8 and full typecheck/lint pass. The success test uses an explicitly
  named in-process host-contract adapter, so it is wiring/render evidence—not
  proof that a Vercel microVM executed. The refactor changed a CAP-2A V4-bound
  source path, so V4 is now a preserved historical artifact rather than
  current-worktree truth until reissued.

  Commits `06150a94e` and `82c7db926` close the next infrastructure boundary.
  They restore the sandbox's existing npm/package-lock and TypeScript alias
  authority, pin the compatible Remotion/Mediabunny runtime, and carry the
  exact synthetic model-tagged callback through a real Vercel microVM with
  `DENY_ALL`, `persistent=false` and verified teardown. Immutable image
  `vcr.vercel.com/nimit-jains-projects-bd2b522e/front-end/editron-gcp-render:gcp-95c5a1fbdccb-1e26d111`
  has OCI digest
  `sha256:90328cd5426725635224528324d54cc38b3e0a812e904d9add81b0c4b3d6c9c1`;
  verified snapshot `snap_CRyxD1vbg4meL6dm1SqXhdxbofnR` is bound to app
  commit `95c5a1fbdccb3058b408079777266f4e97b10c94`. Receipt
  `17a81dc399d1c9dc0dbe30bc39b6f40d25e4798756271045c39469092d05722f`
  binds host receipt
  `b4a6d03f71842cdf23f3cf21ed14f3ed5d230d0a7141d777e07297dcd72eed7c`,
  output
  `sha256:0abf6bc3dbb5f85398f6c3480b129a25bc569c900c449874d52add7a3d27ee4b`
  and a decoded 360x640, 30/1, 420-frame native/generated/native hybrid.
  Six panels, title-safe placement, entry/exit motion, reference exclusion and
  frame-270 native continuation passed. The source origin is explicitly
  `SYNTHETIC_CONTRACT_CALLBACK_NOT_PROVIDER_OUTPUT`, model-performance claim is
  `NONE`, and project mutation is `NONE`. This proves live sandbox and decoded
  proof plumbing, not provider editing quality. The failed stock-image,
  glibc, registry-size, missing-tsconfig and incompatible-Mediabunny attempts
  remain diagnostic history rather than being relabelled as passes.

  **Superseded execution note:** the V5-bound H03 freeze/preflight/run described
  here subsequently completed through the V6-bound V3R4 cohort recorded in the
  authoritative ledger above. Do not repeat that paid run from this historical
  paragraph. Current work continues with the sole-owner HREF receipt, runtime-
  accounting and durable cross-process resume, genuinely new dependency and
  invalidation shapes, forced native/generated/hybrid comparisons, conflict/
  rebase/locked-range cases, long-form/range trials and blind-editor receipts
  before a frozen `GO`, `MODIFY` or `NO-GO` decision.

### Master-stage completion ledger

| Master stage | What is verified done | What remains before the stage exit is honest |
| --- | --- | --- |
| Stage 0 - governance and capability truth | `CAP-0` family-level census and `CAP-1` Adobe gap matrix remain `DONE_ARTIFACT`. CAP-2A V6 at `e3ea46fde` binds 222 source paths, 11 observations and 477 identifiers to corrected source commit `d84b54159`; manifest `2549623e...` records 37 atomic candidates, zero certified and zero production-eligible operations. | CAP-2A remains a bounded research tool dossier, not the complete Editron/Adobe toolset or production certification. Reissue again only if bound source/evidence drifts; never rewrite a prior version. |
| Stage 1 - canonical command/revision/receipt/proof safety | Several receipt/CAS/checkpoint/rollback and overlay-writer slices are `PARTIAL_ACTIVE`; their focused tests exist. The IF1 contract itself is frozen. | Wire IF1 semantics through the sole ProjectService authority; migrate all writers; remove stale whole-state writes; bind checkpoint state and revision atomically; implement safe redo/replay; close fail-open worker auth; prove UI/chat parity and rendered proof. |
| Stage 1.5 - professional project/sequence and non-blocking editing | Generated-composition project state now has schemas, verification, ProjectService prepare/finalize CAS and checkpoint preservation. | Canonical source/record sequences, reels, tracks, takes, rational timebase, range-scoped proposal/rebase/conflict handling and background editing while unaffected timeline ranges remain interactive are not complete. |
| Stage 2 - scalable ingest, media identity, evidence and durable jobs | Upload, proxy, transcription, several analyzers, R2/Mongo/Qdrant pieces and job mechanisms exist in separate paths. The shared durable chain now comprises the Mongo lifecycle record (`1f22ef2f2`), V4 checkpoint binding (`96d2e3923`), terminal-writer revision repair (`ecfa20c54`), zero-inference recovery worker (`81ce63d9b`), strict artifact coordination (`fee52df57`), separate-process captured suffix proof (`372001cc1`), exact provider-route transport (`2bdb05d80`), serialized manifest-bound research episode definition (`e3ac9b082`), the non-wired immutable product PlanService store (`0c94bc059`), exact accepted-node-to-job binding (`9687dbd9f`), fresh-instance execution-time revalidation (`d16caaa5b`), serialized separate-process product recovery (`b9cf5e820`), deadline/cancel/tenant/approval-lineage gates (`c69a845ea`), immutable PlanService review wait/wake revisions (`aff06c8d4`), the non-wired ProjectService proposal clone/durable diff receipt adapter (`b50f9f9fa`), canonical-base/isolated-working revision separation (`a9882903a`), compact writer/state recovery (`270792c1a`), worker enforcement (`d143da69a`), pure committed-writer replay (`df61e818d`), separate-OS-process ProjectService proposal recovery proof (`9f955033e`), the first real `cut_section` ProjectService-clone execution/replay owner (`7c9e7e6ea`), an immutable ordered-frame/native-video reference-artifact owner (`90d034578`), the exact-scope sealed runtime-budget owner (`8ecc87a1c`), strict isolated-outcome-proof completion mechanics (`f85bc0f09`) and the concrete zero-network-tested single-cut Phase-0 proof adapter (`53baee0f3`). | There is no converged long-form media identity/evidence contract. Source cadence/PTS, VFR/CFR mapping, timecode/reel identity, colour/audio metadata, shared invalidation, bounded dense inspection and sharded/resumable proof are incomplete. Proposal recovery, one cut owner, inline reference/accounting owners, proof receipt mechanics and one still-proof adapter remain non-wired and uncertified. Exercise its real renderer when explicitly authorized; add semantic/audio/multi-operation proof, the production canonical-media locator, broader operator ownership, authenticated review UI/API and worker ingress, authenticated QStash dispatch, live Atlas/QStash proof, canonical proposal apply/reload and family-store migration. |
| Stage 2.5 - open-ended planner experiment | Native handoff/order V3R4 remains valid bounded evidence: 18/18 Luna/Terra/Gemini rows passed one DEV-03 dependency chain, direct/opaque writer-revision handoff, rendered proxy proof and no mutation under three tool orders. The sealed V2R2/V2R3 cohort executed 96 paid rows for `$9.730960595`; its frozen interpretation separates passes, bounded failures, confounds and resource non-evaluations. H03 generated-source V3R4 executed 18 rows for `$0.21068595`, with 4/12 evaluable Luna/Terra rendered passes and six Gemini-429 non-evaluations. CAP-2A V6 remains a 37-candidate, zero-certified research dossier. Current-context V4R receipt `fe4a3420...` records 13 claim-proof passes, 17 evaluable failures and 15 Gemini-429 non-evaluations for `$2.91745742`. The route-ablation cohort completed all 24 Stage-2 rows under receipt `9583de5c...`: seven honest gaps, nine failures and eight Gemini-429 non-evaluations for `$1.5474777`, with zero project access. DEV-02 now has one real native alternative and one real generated-island/native-continuation hybrid at identical decoded scope, plus sealed blind pack `23870abb...`; hard target gates pass for both. The V3R3 non-leading dependency cohort adds a live six-operation fork/join result under three tool orders: corrected immutable replay receipt `d1cc5d7c...` records Luna 3/3, Terra 3/3, zero evaluable failures and three Gemini credit-depletion non-evaluations for `$0.244869160`, with zero replay inference and zero project effects. Commit `3a161c562` replaces the real-episode hand-built scheduler-effect fixture with exact, hash-bound effects issued from the observed isolated owner. Commits `7a16b0cec` and `03e7aa8a3` then replay one exact Luna P1 episode through those owners and the existing Remotion root; portable receipt `62a1fb24...` proves the two cut boundaries, warm treatment, 1.08 push-in and right-biased focal geometry in a decoded 640x360, 30/1, 720-frame H.264 proxy with zero project effects. Commit `fe22e2f7b` proves one provider-loop prefix can be compacted and resumed through opaque results without replaying mutations or resetting the repair budget. Commit `8512970f9` then replays the exact already-paid Luna P1 response bodies through an interruption after turn four, restores a fresh instance of the same isolated owner from a canonically validated snapshot, executes only the suffix and reaches the original `R45` owner state. Portable receipt `a7dd98a1...` binds all eight captured response hashes, four prefix and four suffix calls, zero inference, zero project effects and the deliberately changed compact-resume request identity. Commits `ec1432446` and `6217cf748` now bind exact reference-media identity and cumulative runtime/spend accounting across an in-process fresh-instance resume; forged or mismatched state fails before provider/tool execution. Commits `1f22ef2f2`, `96d2e3923`, `ecfa20c54` and `81ce63d9b` add the shared durable lifecycle record, bind the exact V4 research checkpoint, require the final writer revision and exercise suffix-only recovery through the existing runner over fresh store/worker instances. Commit `315443e21` corrects the active V2R9 catalog identity in test provenance, `fee52df57` adds owner-coordinated artifact resolution with exact hash/scope checks, `372001cc1` carries the exact captured Luna prefix/checkpoint/owner state through a real process exit and executes only the four-response suffix in another Node process, reaching `R45` with zero inference and zero project effects; and `2bdb05d80` supplies the exact route-bound, provider-scoped live transport owner without inference. Commits `270792c1a`, `d143da69a`, `df61e818d` and `9f955033e` additionally prove compact ProjectService proposal-state recovery, pure committed-writer replay and suffix-only continuation across two OS processes with an unchanged canonical project. Commit `7c9e7e6ea` adds the first real `cut_section` execution/replay owner on that clone without canonical mutation. HREF-01's technical review pack is complete: the full 64.75-second source, one model-requested `[20s,23s)` 60/1 dense clip and its 96 kHz stereo WAV are hash-bound under public pack `4431c08b...`. | Result remains `MODIFY_AND_PROCEED_RESEARCH`, not production `GO`. The exact-effect issuer covers only six holdout operations and the rendered supplement covers only one synthetic Luna row. Audio is absent from that dependency episode and ProjectService reload/product-authority integration are explicitly unverifiable; generic effect coverage and audiovisual proof remain open. HREF-01 now waits only for the sole project owner's blinded judgment; independent agreement remains `UNVERIFIABLE` without a real second reviewer. The phrase “seven unseen holdouts” is retired: HOLD-01 through HOLD-08 already executed, so the next task evidence must use genuinely new dependency/invalidation holdouts. Provider-loop resume now has a product-issued episode definition, in-process reference and cumulative runtime-budget identity, durable V4 persistence, strict owner coordination, serialized separate-OS-process suffix recovery, a non-wired ProjectService proposal-clone/recovery/diff-receipt adapter and one real cut owner. It still lacks broad certified operator coverage, complete reference-media/render-proof adapters, authenticated ingress/QStash dispatch, live Atlas/QStash recovery, paid resumed inference and canonical ProjectService apply/reload integration. Then complete product-authority conflict/rebase/lock integration, long-form range planning, forced native/generated/hybrid alternatives and blind quality/correction-time receipts. The user's DEV-02 qualitative order `B > C > A` is recorded in chat evidence, but a hash-bound correction-time/confidence review receipt remains pending; H04 still has synthetic tone/no caption-pixel proof; H05 lacks audio/real-logo pixel proof; DEV-03 lacks intelligible speech. |
| Stage 3 - production agent control plane | Planning and ADR material exists. | No production model-driven control plane is authorised or implemented. It must reuse ProjectService, checkpoint, media, registry and proof owners rather than create another authority. |
| Stage 4 - representative editing vertical recovery | Overlay authority/census/producer-to-proof documents exist; several focused caption, MG, SFX, music, B-roll, receipt and render paths have tests or partial repairs. | Captions, transitions, generated composition/MG, B-roll/reframe, music/SFX/dialogue, masking/tracking, colour and other native families still lack representative save/reload/render/proof/undo certification. Catalog expansion and MG pruning remain gated on these verticals. |
| Stage 5 - delivery, review and collaboration | Render/delivery code and internal quality-review mechanisms exist in partial paths. | A project-scoped view-only guest link, invite-by-email, timecoded comments, version comparison, approvals and a pre-render client review flow were not found in the Editron product path. Delivery/QC is not yet one certified authority. |
| Stage 6 - global scalable professional NLE | Some editor, proxy, chapter render and isolated 60 fps SaaS-explainer mechanisms exist. | Professional source/record editing, mixed rates, rational timebase, VFR, SMPTE/drop-frame display, multicam, relink, project/reel subdivision, shared storage coordination, interchange/conform and genuinely scalable long-form playback/render remain partial or missing. |
| Stage 7 - agency certification | No accepted certification run. | Real consented projects with zero hidden rescue, fatal false-success rate zero and published quality/cost/latency/rights scorecards. |
| Stage 8 - production-house/film-post certification | No accepted certification run. | Camera-card/reel/timecode identity, professional colour/audio/VFX/interchange/conform/mastering/QC/archive workflows and successful end-to-end productions. |

**Stage 2 row correction (2026-08-23):** commits `1af638999`, `b0f1442c0` and
`349a586c3`
supersede the
table's previous concrete-owner revision wording. The clone now supplies one
current proposal revision to execution and committed replay, and the current
`cut_section` owner uses the shared deterministic concrete-writer issuer
instead of a private `WeakMap`. The focal-scale keyframe owner consumes the
same origin. One exact outcome policy now reconstructs and state-binds the
cut-only intermediate, separately requests cut and focal render evidence, and
requires inspected pixel deltas before visual PASS. Clone-enforced issuer use,
generic keyframe-property contract correction, durable separate-process
two-operation replay, live rendering and canonical apply/reload are still open.

**Stage 2.5 row correction (2026-08-23):** the row's former combined
`runtime-budget/reference-input binding` clause predates commits `ec1432446`
and `6217cf748`. Reference-input identity and cumulative runtime-budget state
recovery are now research-proven across in-process fresh-instance restart.
This correction also supersedes any table wording that groups the now-proven
separate-OS-process seam with the still-unproven live Atlas/QStash seam.
A shared durable lifecycle record exists at `1f22ef2f2`; `96d2e3923` binds the
exact research V4 checkpoint into it; `ecfa20c54` closes terminal-writer
revision projection; and `81ce63d9b` proves the transport-neutral
zero-inference recovery core over fresh store/worker instances. Commit
`fee52df57` adds strict owner coordination and artifact revalidation. Commit
`e3ac9b082` then supplies the first serialized, manifest-issued research
episode-definition artifact and exact scope/hash owner; this supersedes the
table wording that still groups every definition seam as missing. Commit
`0c94bc059` supersedes the former product-persistence gap: a non-wired
`PlanService` revision/definition store now exists. Commit `9687dbd9f` binds an
exact accepted product definition into the shared job input, and commit
`d16caaa5b` adds the product-side leased-job resolver that revalidates its plan
head, definition, dependencies, scope, identity and aggregate budget over
fresh store instances. Commit `1764a8ff8` now adds the transport-neutral leased
PlanService execution lifecycle, and `ee07f11cf` binds one exact provider-native
research-proxy envelope into the signed definition while preserving distinct
fresh-start and resume states. Commit `454fb721a` extracts the resume-only
provider loop and outcome finalizer into store-neutral shared modules; the
research lifecycle adapter continues to own its existing job identity and
semantics. Commit `b9cf5e820` then carries those exact
Mongo-shaped product plan, definition and job records through a real process
exit and revalidates/reclaims them in another process with zero inference and
zero project effects. The research recovery worker is still a separate
research path, all referenced product artifacts are not yet resolved, and the
product binding has not exercised live Atlas or QStash. The product lifecycle,
provider envelope and resumed execution core are now explicit, but no
PlanService execution-owner adapter invokes that core and fresh execution still
lacks a truthful proof receipt; these are the next integration prerequisites.
Commit `b50f9f9fa` now supplies the non-wired ProjectService proposal-clone and
durable diff-receipt adapter, so the former blanket “ProjectService clone” gap
is retired. Broad certified operator ownership, reference-media and
runtime-budget adapters, authenticated ingress/QStash dispatch, live
Atlas/QStash suffix recovery, paid resumed inference, canonical apply/reload
and rendered ProjectService integration remain open.
Commit `a9882903a` then separates the unchanged canonical ProjectService base
revision/state from the isolated proposal working revision/state. Commits
`270792c1a`, `d143da69a` and `df61e818d` bind the exact committed writer/state
chain, make the durable worker require it for ProjectService-backed proposals,
and reconstruct it only through a pure replay port. Commit `9f955033e` proves
that path across two OS processes with zero inference and an unchanged
canonical project. Concrete certified owners, live infrastructure and paid
resume remain later gates; deterministic proposal recovery itself is no longer
the blocker.

Commit `7c9e7e6ea` then binds the existing pure `cutTimelineRange` owner to the
ProjectService proposal clone, issues and replays proposal-local writer
revisions, preserves coordinate/split-child outputs and leaves canonical state
unchanged. It also removes invalid explicit `undefined` keyframe-track fields
from all canonical cut paths. This retires the blanket “no concrete operator”
claim only; every other family, rendered proof and canonical apply remain open.

Commit `90d034578` next supplies the immutable, exact-scope reference owner for
ordered frames and native video. It closes the research owner/manifest seam,
not production retrieval from canonical media storage or reference-quality
proof.

Commit `372001cc1` separately proves process-loss hydration over a serialized
Mongo-shaped test record: one process persists the captured Luna prefix and
exits; another process leases and executes only the captured suffix through the
existing worker/resolver/owner chain. This closes the OS-process seam only. It
does not close the live Atlas, QStash, ingress or real ProjectService adapter
gates above.

Commit `2bdb05d80` closes the remaining live provider-transport adapter seam
with route-scoped credentials plus exact request and returned-model identity
checks. It does not make the worker reachable while the other owners and
authenticated ingress remain absent.

Commit `e3ac9b082` closes only the inline-definition defect in the serialized
research recovery proof. It does not select or implement the product
`PlanService`, create a durable artifact database, or make the worker reachable.
Commit `0c94bc059` later adds that non-wired product plan/definition database;
it still does not make the worker reachable.

**Stage 2/2.5 ingress correction (current at `6d8fdf1ea`):** the table and
chronological paragraphs above that say all authenticated dispatch/worker
adapters are missing are superseded. Commit `0f54a0a2a` now binds an
authenticated actor to the exact accepted Plan node, publishes only the opaque
durable job identity to a fixed HTTPS QStash destination and records a late
message acknowledgement without changing lifecycle state. Commit `b6171bed2`
wraps the existing durable Plan worker in fail-closed QStash verification,
strictly parses that opaque message and refuses to claim when an explicit
execution owner is absent. Commit `498e018e6` now adds the exact scoped
canonical-media binding/adapter contract for both native-video and ordered-image
reference arms, without storing bytes or becoming a second media authority.
Commits `607212e02` and `8bf1d766e` now implement the concrete read-side canonical-media
locator, byte reader and policy-grant owner without moving bytes out of the
existing `mediaAssets`-selected R2/GCS object. Commit `9251945e4` adds the
store-neutral issuance policy/identity owner and an atomic create-or-compare
ledger port; commit `07c59690b` implements that port using one existing-client
Mongo transaction and corrects real Mongo `_id` handling. What remains missing
is materially different: one execution-
root composition with the concrete CreditsService product-budget owner, actual
API route exports, live Atlas/QStash
execution and recovery, canonical
ProjectService apply/reload, broad certified operators and live rendered proof.
The research inline-reference and sealed-holdout budget owners are not valid
product substitutes.

### Global timebase and format truth

The current main editor is effectively a 30 fps constant-frame-rate system,
despite `Project.fps` making it look configurable. The editor and many writers,
analyzers and render consumers hard-code 30; Remotion metadata rounds rates;
source assets do not preserve exact rational rate, PTS/VFR mapping, source
timecode, field order, pixel aspect or full colour metadata. Therefore the plan
must not claim system-wide 24/25/29.97/50/59.94/60, mixed-rate, VFR,
drop-frame, DCI, HDR or high-bit-depth compatibility.

The remaining production contract must add exact rational identities for
source media, project timeline, generated-composition local time, analysis
sampling, preview and delivery; preserve source-PTS to editorial-proxy mapping;
use sample-accurate audio coordinates; and bind final proof to probed rate,
frame count, raster, pixel format, colour and audio properties. This is a
global infrastructure requirement, not a long-form-only preset. Short-form
uses the same contract with smaller ranges.

### Capability truth: what the model must actually receive

`CAP-0` is useful reconnaissance, not the final tool context. Its 30 rows are
broad families and its current statuses are 28 partial, one live-uncertified
and one missing; none is certified. The research benchmark's
`operator-specs-v2.json` exposes exactly 40 bounded operators: 10 reads, five
resolvers and 25 mutation/generated/legacy rows. That catalog is a research
slice, not "all tools in Editron", and it omits parts of the production
contract.

`CAP-2` must produce one row for every atomic operation that genuinely exists,
whether its current caller is manual UI, shortcut, chat, Director, worker or
API. Each row must include:

- stable operator ID/version, aliases only for retrieval, and authoritative
  owner;
- exact input/output schema and coordinate domain;
- current support/certification status and planner eligibility;
- resolver handoff and declared reads/writes/requires/produces/invalidates;
- persistence/mutation path, revision and concurrency semantics;
- deterministic validator, rendered proof obligation and failure disposition;
- undo, redo/replay and reproducibility bindings;
- rights, privacy, egress and prompt-injection policy;
- latency/compute limits, scorecard thresholds and project-class certification;
- manual/chat parity and final editor/renderer/delivery consumer.

A similarly named UI button or chat tool is not a separate capability when both
delegate to one owner. Conversely, a manual operation absent from chat still
belongs in `CAP-2`; the new planner must be able to select it only after the
same owner is exposed through a safe command path.

### What the models actually did, and why the old verdict is invalid

The claim that the models "did not give plans in tools" is disproved by the
stored receipts:

- Qwen's DEV-01 Stage-2 response selected real IDs including
  `read_project_file`, `get_timeline_view`, asset search/inspection,
  `get_video_transcription`, `find_transcript_moment`,
  `resolve_transcript_edit`, `cut_section`, `find_visual_moment`,
  `resolve_visual_edit`, `resolve_keyframe_edit`, `set_keyframes`,
  `find_audio_moment`, `resolve_audio_edit` and `apply_audio_ducking`, with
  dependencies.
- Terra selected the sensible executable families
  `resolve_transcript_edit -> cut_section`,
  `resolve_keyframe_edit -> set_keyframes` and
  `resolve_audio_edit -> apply_audio_ducking`, with the cut ordered before
  downstream edits.

The benchmark failed to interpret those plans consistently for four reasons:

1. Stage 2 used `candidateCapabilityIds: string[]`. One node could therefore
   mix several operations intended to execute with mere alternatives. Later
   code could not know which meaning the model intended.
2. Stage-2 instructions asked for editorial operations and dependencies, not
   exact runtime arguments. Stage 4 then judged exact low-level serialization
   and, in DEV-specific code, expected topology the model had not been asked to
   emit.
3. The documented planning/compiler boundary allowed models to omit some
   compiler-owned read/search adapters, but the evaluator failed Terra for
   omitting `find_transcript_moment`. That score contradicts the frozen packet
   and is invalid.
4. Stage-4 compilation is hard-coded separately for DEV-01, DEV-02 and DEV-03.
   A model can therefore be judged against a task recipe instead of generic
   operator schemas.

The corrected Stage-2 node schema is:

```text
nodeId
selectedOperatorId       exactly one operation that will execute
alternativeOperatorIds   zero or more considered but non-executed options
dependsOnNodeIds          explicit semantic/order dependencies
intent/evidence refs      why this operation was chosen
```

If an edit needs five actual tools, the model emits five executable nodes. It
does not put five IDs in one "candidate" array. A clarification or capability
gap is represented by its own typed disposition, not an empty pseudo-tool.

### Generic Stage-4 lowering: what it is and what it is not

"Lowering" means translating the model's selected high-level tool nodes into
the exact typed calls the runtime can execute. It is analogous to binding a
function call, not inventing an editing plan.

For every Stage-2 node, one generic lowerer must:

1. read `selectedOperatorId` and look up that exact `OperatorSpec`;
2. bind Stage-3 evidence and current project facts to the operator's declared
   input fields;
3. verify coordinate domains, source/timeline remapping, revisions and
   predecessor output types;
4. create exact input/output references and receipt/proof bindings;
5. reject missing or ambiguous facts before any project mutation.

The invariant is **zero catalog-operator insertion and zero selected-operator
deletion**. If the model selected `cut_section`, the lowerer may fill the exact
range, expected revision and typed output reference. It may not silently add
`find_transcript_moment`, a transition, a grade or any other catalog operation.
If a fresh read/search/analyzer call is required and is part of the catalog,
the model must select it. Immutable facts already supplied in the planner
envelope do not need a fake read node. System-owned post-render probes may run
outside the creative graph, but must be declared as proof infrastructure and
must never alter the edit.

"Exact runtime ports" are merely the operator's legal field names and typed
connections. For example, an output reference must use an output the upstream
operator really declares, and the downstream input must accept that type.
Historical Luna/Terra failures such as an unsupported
`expectedProjectRevision` field, missing dependency edges, or proof IDs in the
wrong reference array measure API serialization, not editorial intelligence.
The generic lowerer should own that mechanical binding while the model remains
responsible for selecting every creative and evidence-producing operation.

### Exact Luna and Terra correction

Luna did not fail DEV-01 editing. Its first Stage-2 provider call completed in
25.588 seconds with 9,182 input tokens, 3,522 visible output tokens and 1,091
reasoning tokens. It was not truncated; it omitted only the required
`artifactType` field. The single repair attempt inherited the same 40-second
stage wall clock, leaving about 14.4 seconds, and was aborted after 14.420
seconds. Final status is `UNVERIFIABLE / PROVIDER_TIMEOUT`, not an editing
failure. The output caps were 8,000 visible and 5,000 reasoning tokens, and the
first response did not hit them. The harness must give each allowed attempt its
own declared budget or reserve repair time explicitly.

Terra did provide the intended DEV-01 operation chain. The evaluator rejected
it because it omitted `find_transcript_moment`, even though the issued packet
said compiler-owned read/search adapters could be omitted. That failure is
`INVALID_EVIDENCE`. The replacement benchmark removes the contradiction rather
than giving Terra a hidden answer.

No existing Luna, Terra, Qwen, Gemini or DeepSeek aggregate score from the
contaminated chain may be used to rank models or decide production routing.

### Can the system perform model-planned native editing?

The honest answer today is **not yet proven end to end**, but the native
mechanisms are not imaginary. Active code contains deterministic silence-range
resolution and timeline cutting, keyframe form/mutation/render evaluation, and
dialogue-aware music ducking. Other manual and chat operations also exist. The
missing proof is a clean connected chain in which an actual model selects the
real operations from `CAP-2`, binds only available evidence, generic lowering
produces executable calls, an isolated clone executes the real owners, and the
rendered video/audio is checked.

DEV-01 is therefore still useful after repair. It must prove, with actual model
output, that a native plan can remove only the silent range, resolve the product
target after the cut's identity/time remap, apply a bounded focal push-in, duck
only background music under remapped speech, render the result and preserve all
other content. A canonical hand-authored graph or evaluator-approved handoff is
mechanics evidence, not model-planning evidence.

#### V2-1R causal execution progress - 2026-08-19

The active tree now closes one prerequisite at the pure timeline-mutation
boundary. `cutTimelineRange` emits a versioned half-open
`timelineCoordinateTransform` plus exact `splitChildren` records containing
the original/left/right overlay identities, before/after timeline ranges and
the right child's source-coordinate start. The truthful DEV-01 fixture now
consumes those returned values; it no longer reconstructs child IDs or the
45-frame shift from expected fixture constants. Focused tests cover surviving,
removed, intersecting and invalid coordinates and both video and dialogue
splits.

This remains **research-only causal plumbing**, not a connected model or
production pass, but the earlier canned Stage-6 limitation is now closed in the
active V2R lane:

- `71111d6ea` binds causal producer ports and makes the lowerer prove zero
  operator additions and zero selected-operator drops;
- `f8d0304fb` interprets all six compiled DEV-01 operators in dependency order,
  projects declared data edges, validates owner/spec/schema bindings and calls
  the existing pure cut, visual-resolution, keyframe and ducking owners on an
  isolated clone;
- `8a228c03c` applies one versioned independent video/audio proof policy before
  the causal executor is allowed to write a PASS receipt; malformed proof,
  wrong geometry, wrong media probes, wrong ducking, browser errors or forbidden
  external calls stop the run;
- `9f33b974a` closes the shared numeric-schema hole so declared minimum and
  maximum values for focal coordinates, evidence strength, frames and audio
  parameters are enforced before an owner runs.

The real DEV-01 proxy has rendered through Remotion and decoded audio under
this chain, but that proves mechanics only. The current causal test still starts
from the canonical Stage-1/2/3 artifact rather than an untouched provider
episode. The live `cut_section` chat response and canonical ProjectService/IF1
receipt also do not yet expose/bind the coordinate mapping. DEV-03 still needs
the same causal conversion, and the refreshed evaluator/manifest must be frozen
before Luna, Terra or Gemini 3.7 is called. Therefore no provider rerun, model
ranking or production mutation is authorised by these commits.

#### V2R V19 connected cohort - 2026-08-19

The subsequently issued V19 cohort is now the current model-experiment truth.
Its manifest hash is `88fb74c4...`, its cohort receipt hash is `f271c956...`,
and all 18 full-episode receipts were hash-verified. The run was research-only,
sequential and produced no project mutation.

- Luna and Terra are `UNVERIFIABLE_PROVIDER_RATE_LIMIT`, not editing failures:
  all twelve OpenAI rows returned HTTP 429 before Stage 1 acceptance.
- Qwen DEV-04 is an expected honest capability-gap pass.
- Qwen DEV-03 baseline reached semantic PASS and Stage-5 authorization, then
  failed Stage-6 rendered visual proof; its `0.15` shake was not measurably
  visible at the active proof sample.
- Qwen's remaining cases exposed Stage-1/2 schema failures or semantic-policy
  failures. They are not executable passes.
- Stage 7 is `NOT_READY_NO_EXECUTED_PROXY`; no human review is due.

V19 also changes cohort scoring so a coincidental terminal label cannot hide
the cause. An expected evidence stop requires `EVIDENCE_INSUFFICIENT` plus
semantic PASS; `CONNECTED_EPISODE_INCOMPLETE` is unexpected even when the final
label is `UNVERIFIABLE`.

The immediate benchmark work is therefore: repair and certify the shared
resolution-aware form/proof contract exposed by DEV-03; restore a usable
OpenAI test lane without changing the frozen semantics; add Gemini 3.7 to the
connected route; then issue a new version and run repeated trials. The detailed
ledger is
[oe-v2-1f-connected-model-episode-results-2026-08-19.md](editron/open-ended-editing/oe-v2-1f-connected-model-episode-results-2026-08-19.md).

#### Provider capability and benchmark-interface correction - 2026-08-19

The V17-V19 provider prompts explicitly forbade tool calls and asked each model
for staged JSON artifacts. Those receipts remain valid evidence for structured
plan/schema obedience, evidence policy, generic lowering and isolated proof;
they are **not** native tool-calling results. Coding-agent success, structured
artifact success, native tool orchestration and rendered editorial quality are
now separate evidence classes.

Current official documentation and live probes confirm that GPT-5.6 Luna,
GPT-5.6 Terra, Gemini 3.7 Flash and Qwen3.8-Max all support native function
calling. All four selected `resolve_transcript_edit` in an equivalent live
first-step resolver-versus-distractor smoke. This proves transport and initial
tool selection only, not a complete editing episode. Gemini 3.7 is live on the
configured account as returned version `3.7-flash-08-2026`; its omission from
V17-V19 came from the connected cohort roster, not model unavailability.

Qwen's fair receipt record is mixed rather than a universal failure: V17
DEV-03 completed real isolated video/audio execution and proof, V19 DEV-03
reached execution but failed visible-shake proof, and DEV-04 returned the
expected capability gap in all three cohorts. Other losses include strict
artifact-schema and missing-evidence policy failures. By operator decision on
2026-08-20, Qwen is now historical evidence only and is retired from every
future benchmark call, repair, score and production-routing slot.

The governing provider matrix, official-source record, exact Qwen
classification, live smoke and replacement multi-arm protocol are in
[the model-provider capability and benchmark protocol](editron/open-ended-editing/oe-model-provider-capabilities-and-benchmark-protocol-2026-08-19.md).
Before another paid cohort, preserve the structured-artifact test as its own
arm and add a provider-native, sequential tool-result loop for Luna, Terra and
Gemini 3.7.

#### V2-1R provider-native adapter progress - 2026-08-20

The research adapter core now exists without changing the historical
structured-artifact arm. `provider-native-tool-catalog-v2r.ts` derives each
eligible function and its exact input/output schema from
`V2R_OPERATOR_CATALOG`, and binds the same selected records to the CAP-2A
planner dossier. It rejects unknown, duplicate and `NOT_COMPILABLE` rows rather
than inventing or hiding operations. The separate finish function is explicitly
a control disposition, not a catalog editing operation.

`provider-native-tool-codecs-v2r.ts` implements stateless full-history request
shapes for Luna/Terra through OpenAI Responses and Gemini 3.7 through Gemini
Interactions. It preserves OpenAI reasoning items, Gemini thought steps and
exact function-call IDs when returning results. OpenAI parallel calls are
disabled for this causal baseline; the harness also rejects more than one call
per turn locally. Strict mode is enabled only where the current exact operator
schema is genuinely strict-compatible. Rows with open-ended fields such as
`cut_section.constraints` remain non-strict and are validated against the exact
local schema; the adapter does not falsely claim strict enforcement.

`provider-native-tool-episode-v2r.ts` gives the model one bounded objective,
revision/state, evidence, preservation/policy facts, budget and complete
eligible CAP-2A records; executes only a supplied research-isolated callback;
returns the typed result to the same conversation; and preserves raw response,
request, model-identity and transcript hashes. Unknown/invalid/parallel or
repeated calls, malformed tool results, missing typed finish, 429, timeout,
refusal and other provider failures remain distinct fail-closed outcomes. A
model `PASS` in this adapter is not product proof: every receipt is explicitly
`NOT_EVALUATED_ADAPTER_ONLY`, carries no state effects and imports no
ProjectService owner.

The fake transport suite passes for Luna, Terra and Gemini sequential result
replay, strict/local schema modes, missing evidence, invalid and parallel
calls, HTTP 429, timeout and raw-output retention. This closes the pure adapter
core only.

The candidate cohort manifest and zero-inference preflight now live in
`provider-native-cohort-manifest-v2r.ts`. The manifest freezes Luna, Terra and
Gemini 3.7 Flash; six DEV-01--04 baseline/withheld-evidence cases; three planned
repetitions per route/case; exact task, evidence, context and tool-set hashes;
the current price snapshot including OpenAI cache-write prices; and an absolute
worst-case ceiling of `$65.140838`. Qwen is absent. The stable 40-operation
CAP-2A dossier is bound once by identity/hash/count, while each episode exposes
only its relevant complete callable records through the provider-native tool
authority.

The live no-spend run on 2026-08-20 produced manifest
`38ec31270b1c0f9487ef3e848f4e17733f31e15c1a53d5867fb5cd29ca5205db` and
preflight receipt
`48cdb825ffd159402a333b793302f1f5b82b1944e234ceb3d844cebb9a9a70c9`.
It made three model-metadata GETs, six Gemini `countTokens` requests and zero
inference calls. Infrastructure assessment was `PASS`; every bounded initial
request was below the frozen 64,000-token limit (OpenAI range 13,938--21,695;
Gemini range 15,278--24,159). Dispatch correctly remained
`BLOCKED_CONNECTOR_GAP`.

That candidate status is superseded by the V27 result below. The adapter,
per-turn provider-native session binding and DEV-02 model-source-to-proof path
now exist in the research lane. This does not change product support or
authorise ProjectService mutation.

#### V2R V27 provider-native result - 2026-08-20

The corrected V27 manifest hash is
`1f807926d6c6a1fa061611e771d211dd36a1dc025173b7e9c0791ce80341ebe2`.
Across three independent repetitions of every case, Luna and Terra each matched
17/18 expected outcomes. Both routes passed DEV-01 native editing, DEV-02
generated-island/hybrid proof, both withheld-evidence controls and DEV-04 in
every repetition. Each route missed one DEV-03 baseline. No accepted row
mutated a real project, no harness error occurred and no failed proof became a
false product success.

The misses remain important. Luna chose a camera-shake form that rendered with
zero measurable displacement and then made a causally invalid repair. Terra
called beat sync before resolving the required audio evidence and searched the
wrong range after the typed failure. These findings require form-owner
calibration and additional operation-order holdouts; they must not be erased by
changing the evaluator after the run.

Gemini 3.7 produced no model output: the six-case prior attempt and the current
V27 probe returned HTTP 429 on every retry. Its editing performance remains
`PROVIDER_INFRASTRUCTURE_UNVERIFIABLE`.

The complete matrix and receipt hashes are in
[the V27 provider-native results](editron/open-ended-editing/oe-v2r-provider-native-v27-results-2026-08-20.md).
The research bet is supported, but production autonomy is not certified.

The later DEV-03 form-owner requalification supersedes V27 for that one
condition. After moving concrete shake intensity/duration back to the existing
visual form owner, Terra passed 3/3 and Luna/Gemini each passed 2/3. All nine
provider calls returned HTTP 200; the two misses were model-controlled causal
or evidence-handoff failures before execution, not provider infrastructure or
render failures. Its receipt and exact miss analysis are in
[the DEV-03 requalification](editron/open-ended-editing/oe-v2r-dev03-form-owner-requalification-2026-08-20.md).
This result also changes a CAP-2 evidence file, so the prior current-truth hash
binding is now stale and must be reissued rather than silently updated.

### GeneratedCompositionProgram current truth

The active branch has a substantial project-state foundation:
`ProjectGeneratedCompositionStateV1`, verification, pending/active entry
semantics, ProjectService prepare/finalize CAS, checkpoint preservation and a
legacy timeline projection helper. Research code has generated and rendered a
synthetic filmstrip/hybrid proxy.

It is still `NOT_WIRED` as a product capability. No active editor or app
consumer of `generatedCompositions` was found, and the legacy projection helper
is test-only. The remaining path is to make the editor/timeline/renderer consume
the ProjectService-owned nested composition, expose bounded parameters and
handles, preserve undo/replay and revisions, and prove the actual project
render. The research sandbox must not become a second timeline authority.

### Immediate risk interrupts outside the model experiment

These do not change the benchmark order, but they block production claims and
deployment:

1. integrate and broaden fail-closed internal-worker authentication across the
   complete worker surface;
2. finish IF1 runtime migration and remove stale whole-state write/checkpoint
   races;
3. implement the global rational timebase/source-media identity contract;
4. recover and certify representative native overlay/audio/colour/editing
   verticals;
5. build the project-scoped guest review/comment/approval flow;
6. implement professional NLE, interchange, conform, mastering and long-form
   scalability stages before agency or film-post replacement claims.

### Next three model-programme slices

The old `CAP-0 -> CAP-1 -> V2-0` next-three list is complete as historical
foundation and is no longer the active queue. The next three slices are:

1. **Corrected sealed-holdout identity and targeted rerun:** preserve V2R2/V2R3
   and its 96 raw rows unchanged. Commit `bb16d0b96` completed the prerequisite
   versioned catalog seam and fail-closed injection checks. Commit `14e3d791b`
   adds the explicit V3R catalog/semantic-owner contract, closes H03/H05 nested
   forms and aligns the HOLD-01 resolver operation. Commit `3c8686859` freezes
   the new derived cohort/manifest with explicit measured H01 start-window and
   source-duration evidence; dispatch remains false. Commit `d82441179` then
   connects it to the existing owner/episode with no new executor. Next align
   hidden evaluation/render proof; commits `6cc1f56de` and `4b3209fa1` expose
   truthful H04 post-mutation state/caption-retiming effects and bind them
   through V3R2 hidden evaluation plus rendered AV proof. Commits `429fb45b1`,
   `1d902f20f`, `137692a5c`, `4b04b8676` and `545c311bc` now supply H03 protected literals,
   bind its
   model-source contract and connect the existing owner to a verified
   zero-inference source episode, lossless trace, hidden evaluator and exact
   model-source sandbox/decoded-proof contract. Commits `06150a94e` and
   `82c7db926` additionally prove that exact synthetic callback through a real
   deny-all Vercel microVM; this is infrastructure evidence, not model quality.
   Commits `839ce4be5` and `1d0107eab` reissued historical CAP-2A V5 over the
   synthetic H03 checkpoint. Commits `9632e7541`, `9f0c2c072` and `d84b54159`
   correct the provider API, kind-aware verifier and six-direction motion
   proof. Commit `e3ea46fde` freezes CAP-2A V6 over that corrected source and
   the newly observed ThinkForge route without changing catalog or runtime
   authority. Commits `8352135de` through `7064fe381` freeze, preflight,
   authorise and operate the V6-bound H03 V3R4 cohort. Receipt `47a57bf2...`
   records 4/18 rendered passes, eight proof failures and six Gemini-429
   non-evaluations with zero project access. The interpretation is frozen in
   the H03 V3R4 result document; only a separately versioned Gemini supplement
   remains for that unavailable route.
2. **HREF-01 human-only closeout:** retain the fourteen-image arm as a sparse
   historical control. The full native-video/audio observation, exact
   180-frame dense window, separate WAV and blinded reviewer manifest already
   exist under public pack `4431c08b...`; do not rebuild them. The remaining
   action is to package the sole project owner's actual judgment as one
   qualified human receipt and keep independent agreement explicitly
   `UNVERIFIABLE`; do not fabricate a second reviewer. Formal multi-reviewer
   promotion still requires a real second qualified reviewer and a recorded
   agreement/adjudication disposition.
3. **Stage 2.5 generalisation episodes:** the eight HOLD tasks are no longer
   described as unseen. Current V4R manifest `df6d9024...` passed fresh
   zero-inference preflight and all 45 rows executed under receipt
   `fe4a3420...`. Its frozen disposition remains
   `MODIFY_AND_PROCEED_RESEARCH`: 13 claim-proof passes do not erase 17
   evaluable failures, and all 15 Gemini rows are infrastructure
   non-evaluations. The separate non-leading six-operation fork/join dependency
   holdout has now completed its live V3R3 cohort and immutable corrected
   replay. Receipt `d1cc5d7c...` records Luna 3/3 and Terra 3/3 under three tool
   orders; Gemini's three rows are infrastructure non-evaluations caused by
   depleted provider credits. This is one positive dependency-shape result,
   not Stage 2.5 completion. A holdout-scoped owner-issued exact-effect path is
   now verified for these six operations; generic coverage and bounded
   render/reload/audiovisual proof remain. Then test further genuinely held-
   out dependency/invalidation shapes; force native, generated and hybrid
   implementations on held-out tasks; inject stale user edits, overlap
   conflicts, safe rebase and locked ranges. Commit `ec1432446` binds exact
   image/native-video reference identity and commit `6217cf748` binds and
   independently restores cumulative runtime accounting across the working
   in-process provider-resume boundary.
   Commit `8512970f9` and receipt `a7dd98a1...` prove that one exact captured
   Luna P1 trace survives an in-process turn-four interruption, fresh-owner
   hydration and suffix-only replay without another inference call. Commit
   `96d2e3923` persists that exact V4 checkpoint through the shared record,
   `ecfa20c54` binds the terminal writer revision, `81ce63d9b` proves the
   zero-inference recovery core over fresh store/worker instances, and
   `fee52df57` revalidates artifacts through explicit owner ports. Commit
   `372001cc1` then proves the exact captured prefix and suffix survive an
   actual process exit over a serialized test record, without replay or
   inference. Commit `2bdb05d80` binds the existing live HTTP transport to one
   exact durable route without requiring an unrelated provider secret. Commit
   `e3ac9b082` replaces the inline research episode definition with one
   serialized manifest-bound artifact. The 2026-08-23 orchestration spike then
   selects one native Mongo PlanService as the product plan/definition owner
   while retaining the shared job record and replaceable QStash transport.
   Commit `0c94bc059` implements the immutable Mongo PlanService store,
   `9687dbd9f` binds one accepted node/definition into the shared job input and
   `d16caaa5b` revalidates the leased job through fresh store instances and
   `b9cf5e820` carries the product records across a serialized actual process
   exit with stale-lease, tamper and duplicate-delivery rejection. Next add
   deadline/cancel/tenant/approval-lineage gates (`c69a845ea`) and immutable
   review wait/wake revisions (`aff06c8d4`). Commit `b50f9f9fa` then binds the
   non-wired ProjectService proposal clone and durable diff receipt, and
   `a9882903a` separates canonical-base and isolated-working identities;
   `270792c1a`, `d143da69a`, `df61e818d` and `9f955033e` now recover that
   isolated proposal deterministically across process loss. Commits
   `62fcc6c25` and `5e0dd3b65` now additionally prove the full accepted-Plan-to-
   concrete-cut receipt plus product-lifecycle crash/redelivery/cancellation
   without provider re-invocation or canonical mutation. Commits `0f54a0a2a`
   and `b6171bed2` now add the fail-closed actor-bound QStash dispatcher and
   signed worker-ingress factory. They deliberately export no live route while
   the product execution-owner composition root is absent. Commit `498e018e6`
   freezes the canonical-media binding and adapter but deliberately leaves its
   concrete locator, byte reader and policy ports unwired. Commit `de472b32b`
   freezes the product-budget contract and runtime-guard adapter while
   deliberately leaving credit movement unwired. Next implement those media
   ports plus the atomic CreditsService reservation/partial-settlement writer
   and locator, bind both into that one composition root,
   export the signed routes and prove recovery against non-production Atlas and
   QStash;
   then run a fresh
   zero-inference preflight and obtain explicit authorization before any paid
   resumed inference. Exercise realistic long-form sequence/range plans under
   bounded evidence; and collect blind-editor quality, correction-time,
   latency and cost receipts. Only a frozen passing gate may authorise
   ProjectService-owned proposal integration design, never direct model writes.

Native handoff/order V3R4 answers one narrow premise positively: Luna, Terra
and Gemini 3.7 can execute the bounded DEV-03 native dependency chain through real tool calls,
including direct and opaque writer-revision handoff. It does not certify a
production model, a real-project mutation path or agency/film-post replacement.

## Historical current position and next three bounded slices

**Superseded-status notice (2026-08-17):** the following section is retained to
show the programme state when `CAP-0`, `CAP-1` and `V2-0` were still next. Use
the authoritative ledger above for current status and execution order.

The code-grounded record later in this document shows that the identified
receipt-hardening sequence progressed through 1-B7. That does **not** complete
the broader plan: IF1 remains deliberately un-wired, the complete editorial
spine and scalable media/evidence exits are not met, the open-ended model bet is
untested, and the caption/transition/MG/audio/B-roll verticals are not certified.

A subsequent manual-editor audit changes the immediate order. The existing
chat registry is not a sufficient capability packet: manual editing uses local
hooks, whole-array autosave, duplicated V1/V2 panels and direct routes that are
not semantically converged with chat. Confirmed examples include divergent
speed, fade and trim fields, a transition operation available to the manual
panel but filtered from live chat, and an unconsumed shorthand-to-AI prompt.
The model experiment must not be repaired against that incomplete inventory.

The first benchmark implementation produced valuable diagnostic artifacts but
did not honestly test the complete load-bearing assumption. Its model inputs
omitted original media/request inspection, its difficult reference task omitted
the intended generated-composition route, some operator handoffs were not
type-connectable, some evidence-removal conditions retained impossible hidden
predicates, and task token budgets were not enforced. Its executable pass rates
therefore neither validate nor falsify open-ended model planning and authorize
no production router or proxy execution.

The governing correction is the
[open-ended editing benchmark v2 production correction](editron/open-ended-editing/oe-benchmark-v2-production-correction-2026-08-12.md).
It separately scores seven stages: target reconstruction; operation and
native/generated/hybrid form selection; evidence and safety binding; exact
typed graph compilation; truthful clarification/capability-gap behavior;
isolated execution and deterministic proof; and blind editor quality/usefulness.

The next three bounded programme slices are now:

1. **CAP-0 — freeze current Editron capability truth (read-only code audit,
   documentation and probes):** enumerate every manual UI/shortcut operation
   plus chat, Director, worker and API-only operations. Trace request, owner,
   typed state, persistence, renderer, proof and undo; mark UI/chat parity and
   no-render/divergent/shadow paths explicitly. Produce the machine-readable
   capability packet that later model trials receive. Do not fix runtime paths
   or count registry entries as capabilities.
2. **CAP-1 — official Adobe function and gap map (research/documentation
   only):** compare the frozen `CAP-0` rows with current official Premiere Pro,
   After Effects, Audition, Media Encoder and Frame.io feature/workflow
   documentation. Preserve the difference between atomic controls, composite
   workflows and product duties. Do not claim support because Editron has a
   similarly named button or an LLM knows the concept.
3. **V2-0 — repair and freeze the experiment (documentation/fixtures/tests
   only):** build the seven-stage contracts, original request/media bindings,
   `ReferenceBlueprintV2`, `EditorialIntentGraphV2`, machine-readable operator
   schemas derived from `CAP-0`, a research-only
   `GeneratedCompositionProgram` operator, condition-aware predicates, exact
   budget telemetry and frozen scorecards. Multimodal and text/evidence-only
   provider arms must be declared separately rather than pretending every
   model received the same visual input.

After those three slices, **V2-1** runs the tiny owned/synthetic mechanics smoke
and **V2-2** runs the repeated development matrix and untouched holdouts. Only
V2-2 may publish `GO`, `MODIFY` or `NO-GO`; a `GO` authorizes production
integration design, not model-driven ProjectService mutation.

The operation-count proposal is a benchmark hypothesis, not an architectural
shortcut. A many-cut montage can remain native, while one unusual moving-panel
layout may require generated code. The experiment must show whether any
threshold generalizes better than free model choice and forced baselines.

The same correction records a separate production debt: the chat path decodes
audio and can use measured beats, while `five-track-analysis.ts` passes an audio
URL to a buffer-only analyzer and then accepts about 120 BPM when analysis is
empty. This is partial convergence, not unified beat analysis. Music/dialogue
evidence remains early in editing; final SFX resolution generally follows
stable picture timing. Beat-sync remains `LIVE_MULTIWRITE_UNCERTIFIED` until one
canonical evidence owner, explicit unavailable/low-confidence results,
revision-safe mutation, undo/replay and rendered proof are verified.

After V2-2, stop at a mandatory product checkpoint and return to the user to
design the requested **simpler auto-edit experience**. This plan deliberately
does not pre-empt that discussion. No existing or proposed auto-edit path may
be expanded into Stage 3 before that checkpoint decides its user interaction,
scope, authority, cancellation and conflict semantics.

The overlay recovery programme is preserved, not replaced by research. After
the OE verdict and auto-edit checkpoint, resume one production vertical at a
time: repair representative caption, transition, generated-composition/MG,
audio/SFX/music and B-roll/reframe paths before catalog expansion. MG pruning
still requires zero live imports/callers plus saved-project compatibility; the
TransitionCatalog still begins with a licence ledger and golden media fixtures,
not a wholesale repository import.

Every implementation slice is limited to an explicitly approved owner and no
more than five touched files per phase.  After code changes, it must pass the
project type-check and quiet ESLint, include its deterministic fixtures, and
receive review approval before the next phase begins.

## Certification rule

The product can pursue the broad Adobe-class destination while selling only
what is currently certified.  A feature is not certified because an LLM can
describe it, a component exists, or a demo rendered once.  It is certified only
when its contract, implementation, evaluation, proof, operational support and
real-project scorecard all meet the declared threshold.

## CEO and engineering review record - 2026-08-10

**Historical-stage notice (2026-08-12):** this review record is retained to
show what the reviewers approved at the time. Every later reference in this
dated record to `K/OE-0`, `OE-1`, `OE-2` or an `OE-2 GO` maps to the superseded
experiment and grants no current execution authority. The current governing
sequence is `CAP-0` -> `CAP-1` -> `V2-0` -> `V2-1` -> `V2-2` in the section
above and in the linked benchmark v2 correction.

### Review decision

**Approved architecture: canonical strangler migration (Approach A).**  Keep
the useful current foundations - upload, media processing, analysis, rendering
primitives, IF1 contract work and the tested SFX labelling tools - but route
future authority through canonical contracts.  Replace only the duplicated or
false-success execution paths after a producer-to-proof ledger proves they are
unused or safely adapted.  No clean-slate rewrite, no thin new AI shell and no
second project, timeline, proof, registry, journal, checkpoint or workflow
authority is authorised.

### CEO review

**Verdict: harden before scale, then proceed.**  The destination is worth
building because an AI editing system can compress the coordination work of an
agency while retaining human creative control.  The commercial sequence must
be narrow certification first, broad capability second: establish a real
agency workflow, measure its economics and client acceptance, then expand into
long-form and post only when the underlying editing and delivery promises are
earned.  Selling an Adobe-class promise before captions, transitions, MG,
proof and review work in real projects would damage trust.

The CEO review specifically required and this plan now includes:

- visible `APPLIED_PENDING_PROOF` / `VERIFIED` / `UNVERIFIABLE` / `FAILED`
  states instead of a false all-success story;
- explicit human override precedence, rights/egress boundaries and an audit
  trail for every override;
- a first certified agency lane with intervention, client-approval, latency
  and cost scorecards - no hidden rescue;
- feasibility evidence before committing to ten-hour media or arbitrary
  generated-code execution; and
- a clear split between the ambitious destination and only the capabilities
  that are certified today.

### Engineering review

**Verdict: viable only in the gated order below.**  The existing codebase has
useful components but it is not reliable enough to treat its overlay paths as
the target architecture.  The critical technical order is: canonical command
and proof semantics, canonical project/sequence identity and conflict rules,
durable workflow records and safe ingress, then one vertical at a time.
Captions, transitions and MG must not be mass-expanded before those shared
contracts exist.

The engineering review specifically required and this plan now includes:

- an early canonical editorial spine and saved-project migration rule rather
  than waiting for a complete NLE rebuild;
- a durable job record independent of queue transport, with cancellation,
  idempotency, retry cursor, budget and visibility;
- source masters and approved ProjectService revisions as truth, while model
  analysis and summaries remain versioned, fallible observations;
- no raw model access to a database, network or renderer; a tenant/project/
  capability-bound action guard; and
- an isolated MG execution boundary: no network, allowlisted dependencies,
  artifact scanning, immutable I/O, tenant isolation and explicit resource
  limits.

### Independent challenge findings and disposition

| Finding | Risk | Disposition in this plan |
|---|---|---|
| A document mutation and asynchronous proof could be conflated | False success or duplicate costly work | Command/proof state machine and idempotent receipt are mandatory in Stage 1. |
| The canonical sequence graph arrived too late | Overlay authors would recreate incompatible timeline state | Stage 1.5 now precedes every vertical. |
| AI-generated MG code could run with unsafe authority | Tenant escape, cost abuse or compromised rendering | Stage 0 feasibility spike and Stage 4 sandbox contract are mandatory. |
| Derived analysis was described too strongly | Model errors could overwrite project truth | Source/revision truth and evidence invalidation are explicit. |
| Certification was aspirational | Hidden manual rescue could be mistaken for product success | Stage 7 scorecards require visible human intervention and outcomes. |
| “Replayable” overstated what pinned dependencies can guarantee | Incorrect operational claim | The plan now says auditable and only best-effort re-executable when pinned. |

### Review status

| Review | Method | Result |
|---|---|---|
| CEO/founder | scope, customer value, go-to-market risk and certification challenge | Completed; Approach A approved with the hardening gates above. |
| Engineering | authority, data truth, concurrency, workflow, security, operability and testability challenge | Completed; viable only in the documented staged order. |
| Independent challenge | adversarial architecture review | Completed; six material findings incorporated above. |

**Final review verdict:** proceed with **Immediate Slice 1 only**.  It is a
bounded evidence-and-fixture slice; it does not authorise legacy pruning,
runtime wiring, a new workflow engine, a new branch/worktree, or an AI model
mutation path.  Slice 2 requires Slice 1's reviewed ledger; Slice 3 requires
both.  This is the approved sequence for the Adobe-capable, LLM-intelligent
Editron programme.

**No unresolved product-direction decision remains for the first slice.**

## Execution authorisation update and receipt-hardening subplan - 2026-08-11

The owner has authorised execution of the staged programme on
`infrastructure-improvs-+Editron` in the existing `editron-worktree`.  This is
standing approval to continue to the next verified bounded slice; it does not
change the ownership, proof, or no-second-runtime rules above.

### Current code truth at subplan creation (historical baseline)

The accepted IF1 artifact was frozen on its own tagged history and was not the
live command contract in this worktree.  At the time this subplan was written,
the current branch instead had a smaller `ProjectService` revision/receipt
mechanism:

- manual save, autosave and checkpoint restore use a ProjectService CAS and
  publish a writer-issued `ProjectMutationReceiptV1`;
- the chat stream captures those receipts and the transaction runtime refuses
  to perform automatic rollback without one; and
- direct `addOverlay`, `updateOverlay`, `deleteOverlay` and
  `replaceOverlayFamilyAtomic` calls bypassed that receipt mechanism.

This was **partial convergence**, not a unified editing core.  In particular,
a real chat tool could persist an overlay through a direct writer, then the
transaction runtime saw no receipt and returned a terminal failure without
undoing that already-persisted change.  That safe non-destructive failure was
better than an unsafe rollback, but it was unacceptable product behaviour.

The audit also established that automatic rollback callers in the chat,
dubbing, editorial and reference-style paths do not fall back to a current
project revision.  The remaining user-commanded checkpoint undo reads the
current revision and is intentionally a separate, CAS-protected operation; it
must be converted to persisted receipt semantics before it can claim replay or
redo support.  The legacy checkpoint-manager UI currently omits the required
revision and consequently fails closed.

### Non-negotiable boundary

The repair extends the existing `ProjectService`; it does not add a receipt
broker, MutationGate, journal, checkpoint store, project/timeline store,
registry, job runtime or proof authority.  Every migrated direct writer must
perform its actual persistence through the same ProjectService CAS, increment
the project revision, return the real post-write receipt, and publish that
receipt only after Mongo confirms exactly one durable update.  A transaction
may use the final receipt of its own ordered mutations solely as its rollback
CAS target.

### Executable Stage 1-A sequence

| Slice | Exact work | Completion evidence |
|---|---|---|
| 1-A0 - writer map | Keep the producer/caller matrix for every direct ProjectService write, including chat tools, Director, jobs and browser saves.  Stop any migration that discovers a raw Mongo project writer outside the mapped owner. | Current map and audit already identify direct overlay writers as the immediate gap; newly found writers are added before code changes. |
| 1-A1 - direct overlay receipts | Make the existing `addOverlay`, `updateOverlay` and `deleteOverlay` methods read the project revision with their target state, write by CAS, increment the revision, fail on a missing target, and publish the actual writer receipt through the existing capture boundary.  Preserve the existing overlay projection and renderer. | A competing-write fixture proves the losing mutation changes nothing; a captured direct mutation produces a receipt whose revision is its post-write revision. |
| 1-A2 - family replacement parity | Move `replaceOverlayFamilyAtomic` onto the same receipt/revision semantics without weakening its `updatedAt` compatibility guard.  Its caller must distinguish conflict from success. | Save/reload and conflict fixtures prove that a family writer has one receipt and cannot overwrite a newer project. |
| 1-A3 - real chat capture | Exercise `createTools` through the live chat capture boundary, not a synthetic receipt.  A real `update_overlay` must produce a captured receipt; a missing overlay must fail before the transaction can claim a completed edit. | The test observes the actual ProjectService receipt path and verifies no false terminal failure after a successful direct mutation. |
| 1-A4 - explicit undo/redo | Replace direct checkpoint undo's current-revision sampling with a receipt-bound command.  Define redo only if a persisted post-state receipt makes it safe; otherwise expose structured unsupported/unsafe undo. | Stale undo and redo tests prove a newer edit is never overwritten and no operation is advertised as redo when it cannot be performed. |
| 1-A5 - exposed authority hardening | Require `CRON_SECRET` on the DataBank cron route and stop ThinkForge sidecar from silently dropping a selected Brand Vault scope after an authority error. | Route-level adversarial tests reject forged `User-Agent` and selected-brand failure cannot generate an unscoped result. |
| 1-A6 - IF1 integration decision | Reconcile the frozen IF1 artifact with the now-working native ProjectService owner.  Import it only if its exact types and adapter can be wired without parallel authority; otherwise record the compatibility delta and keep it frozen. | IF1 focused tests, typecheck, lint and a producer-to-consumer trace; no claim of IF1 runtime wiring without all four. |

Each slice remains at five files or fewer, begins with a fresh source/history
search, and gets its own tests.  This is deliberately ordered before caption,
transition, MG, SFX, media and long-form expansion because the audits found
the same direct-writer/proof defect across those families.

### What this delays, and what it does not

This does not delete working upload, analysis, proxy, renderer or overlay
components.  It delays only new capability claims and broad catalog expansion
until their edits have a correct mutation/receipt/proof path.  The documented
caption audit (four effective style authorities), transition audit (two
materially different execution paths), media audit (generic raw form strings
and no visual rights/proof binding), and MG audit remain the Stage 4 vertical
backlog.  They are not declared solved by this hardening work.

### Code-grounded progress and corrected writer order - 2026-08-11

The preceding 1-A table is the design of the receipt-hardening subplan.  The
following is the later, code-verified execution record and takes precedence
where it differs from the earlier future-tense wording.

#### Completed bounded slices

- **1-A1 complete:** `bd4f9e79f` moved direct `ProjectService`
  `addOverlay`, `updateOverlay` and `deleteOverlay` calls to project-revision
  CAS, durable-write result checking, and writer-issued receipt publication.
  A missing overlay no longer silently succeeds.
- **1-A2 complete:** `8150e994f` gave
  `replaceOverlayFamilyAtomic` the same post-write receipt/revision semantics
  while retaining its compatibility timestamp guard.
- **1-A3 complete:** `e8b21937e` exercises the real `createTools` chat path
  against the real receipt-capture boundary.  A successful direct
  `update_overlay` produces one receipt; a missing overlay writes nothing and
  produces none.

These commits fix the four named **ProjectService overlay entry points**.  They
do **not** mean that all project mutations are unified, that IF1 is live in
this worktree, or that the historical writer census is complete.

#### Raw project-writer census

The follow-up audit searched concrete `projects` collection write sites rather
than inferring ownership from names.  Every row below still bypasses the
canonical `ProjectService` revision/receipt path at the time of this record.

| Risk | Existing writer and concrete effect | Why it is unsafe today | Required destination |
|---|---|---|---|
| **P0** | `lib/editron/agent/director-agent.ts` (11 raw project updates): Director lock, final quality/proof and lifecycle metadata | The lock is neither lease/CAS nor token-bound.  Director reads a project, later saves against a newly sampled revision, so a manual change can be overwritten.  Several post-save facts are revision-invisible and can bind proof to a different state. | A narrow ProjectService-owned Director command/lease boundary, with an expected revision from the input snapshot and a receipt/proof binding.  Do not create a Director project store. |
| **P0** | `app/api/services/editron/chat/stream/route.ts` (three raw render-proof/dispatch updates) | Checkpoint and project-document updates can split on a fan-out failure; proof metadata has no writer revision/receipt. | Persist a receipt-bound proof disposition through the existing canonical owner; keep job dispatch separate from project-state success. |
| **P1** | `lib/editron/services/native-video-audio-rights-attestation.ts`, `uploaded-export-audio-rights-attestation.ts`, and `uploaded-audio-assignment.ts` | Two replace the overlay array and one pushes an audio overlay directly.  Guards are useful but none advances canonical revision or emits a receipt. | Route a narrowly typed audio attachment/attestation command through ProjectService; the audio worker may retain analysis and external asset ownership. |
| **P1** | `lib/editron/motion-graphics/codegen/mg-render-job-runner.ts` successful delivery | A durable MG job directly pushes an `MG_SEQUENCE` overlay.  Its nested MG rendering receipt is not a canonical transaction receipt, and the project write is not revision fenced. | The job produces a typed candidate/artifact; ProjectService attaches it through CAS and emits the canonical receipt/proof state. |
| **P1** | Director proof persistence, MG design/delivery/taste mirrors, auto-edit planner/evidence writes, auto-BGM, assist-lane and EDL evidence writes | Some change `updatedAt`, which makes legacy timestamp callers conflict, but none has revision/receipt semantics; several ignore `matchedCount`. | Classify each as canonical editor state, derived evidence, or job-local state.  Migrate only canonical project state; retain execution-local records outside the project document. |
| **P2** | `projects/import-from-script`, auto-edit rescue/cancel and constrained fixture cleanup | These are metadata, workflow, billing, or disposable-fixture paths, not direct timeline writes. | Preserve their current scopes while the evidence/workflow record is designed; do not accidentally route billing or job leases into the timeline owner. |

This census also corrects the frozen IF1 manifest reading: its named legacy
Director lock and chat render-proof examples do **not** enumerate every live
raw Director project update in this branch.  The manifest is not evidence that
the migration is complete.

#### Revised production order

The next work is deliberately reordered by production-loss risk, without
skipping the receipt-hardening goals:

| Order | Bounded slice | Scope and proof required before advancing |
|---|---|---|
| **1-B0 (done)** | Direct ProjectService overlay receipt parity and live chat proof | The three commits above; direct tool success has a receipt and missing-target failure changes nothing. |
| **1-B1a (done, P0)** | Director snapshot/lease and final-save race closure | `4c4a52e0d` acquires a ProjectService-issued, token-bound lease with the paired snapshot/revision, requires both in final save, and releases only the matching failed-run token.  Focused adversarial coverage proves lease receipt issuance, token-bound save, and old-cleanup isolation. |
| **1-B1b (next, P0)** | Director final quality/render-proof binding | Replace the remaining raw post-save Director quality, live-truth and rendered-evidence writes with receipt-bound dispositions.  A proof must name the exact final writer revision and become stale/unverifiable—not attach to a newer manual state—if that revision changes. |
| **1-B2 (P0)** | Chat render-proof atomicity | Make the project proof disposition receipt-bound and ensure a failed project persistence cannot be reported as a dispatched/verified edit.  The checkpoint and project representations must have an explicit recovery rule, not a best-effort `Promise.all`. |
| **1-B3 (P1)** | One raw timeline family at a time: audio attachment/attestation, then MG attachment | Each family gets its own five-file-or-fewer phase, a real ProjectService command, conflict/idempotency fixtures, undo/proof disposition, and a producer-to-renderer trace.  Do not migrate job leases or media-asset persistence into ProjectService. |
| **1-B4 (P1)** | Classify and close raw evidence/lifecycle mirrors | Move a fact only after deciding whether it is canonical project state, derived evidence, or execution-local job state.  A legacy mirror must not be called canonical merely because it lives in the project document. |
| **1-B5 (P1)** | User-commanded receipt-bound undo/redo | Replace the direct checkpoint undo's current-revision sampling.  Redo remains unsupported unless an original command and post-state receipt make it safe. |
| **1-B6 (P1)** | Exposed authority hardening | Require a real cron secret and prevent selected Brand Vault scope from silently degrading to unscoped ThinkForge generation. |
| **1-B7 (decision)** | IF1 compatibility/wiring decision | Compare the tagged artifact against the working ProjectService path only after the relevant live writers are accounted for.  Wire it only if it remains the one command/revision/receipt owner; otherwise publish the exact delta and leave the freeze artifact unchanged. |

All further slices retain the global constraints: no second project, timeline,
checkpoint, media, proof, registry, journal, or job authority; no legacy
pruning until imports, saved-project compatibility and rendered consumers are
proved; no successful status without durable state plus its required proof.
The later caption, transition, AI-MG, SFX/music and long-form stages remain
part of the programme, but their implementation starts only after the relevant
writer path has passed this safety sequence.

#### Execution-status correction - 2026-08-11

`3a4d05fc6` completes the deterministic half of 1-B1b.  Director now builds
its final quality/live-truth/fixture facts without raw persistence and records
them through `ProjectService.recordPhase0ProofFacts` only when the final edit
receipt is still current.  The stale case records no facts and emits a visible
unbound-proof warning.

The remaining 1-B1b work is **1-B1b2**: carry the target receipt through the
asynchronous rendered-evidence dispatch and worker, render only that target
revision, and persist the worker result through a receipt-bound owner path.
This correction takes precedence over the older 1-B1b table row above.

#### Execution-status correction: 1-B1b2 complete - 2026-08-11

The Director proof-worker race is now closed for the non-chat Phase-0 rendered
evidence path.  This is a narrow ProjectService migration, not a new proof or
job authority:

- Director passes the `phase0ProofReceipt` returned by
  `recordPhase0ProofFacts` into the QStash payload.  A dispatch failure is a
  visible Director warning; it is no longer raw-written into the project as a
  misleading breadcrumb.
- The generic worker requires that target receipt and a valid request time.
  It asks ProjectService to atomically claim exactly that revision, which
  advances the revision and returns the precise snapshot to render.  A replay
  or stale delivery returns the explicit `stale-target` disposition before it
  invokes Remotion.
- The worker returns only typed evidence facts.  ProjectService persists them
  only if its claim receipt is still current and still names the original
  target receipt.  A manual edit during the render therefore wins; stale
  evidence is not attached to the newer edit.
- The old raw Mongo generic-project claim, lock release, dispatch-breadcrumb
  and evidence-persist helpers were deleted.  The worker may still own render
  execution and QStash delivery; it no longer owns a project document write.

Proof added for this slice covers the claim/result receipt chain, stale target
rejection before render, the absence of a generic raw worker writer, and
Director propagation of the target receipt.  The focused suite passed 66
tests and repository lint passed.  Full typecheck has no errors from this
slice; it remains blocked by the pre-existing SES dependency, untracked SFX
scripts, and an unrelated concurrent ThinkForge test type error.

**Next P0 slice: 1-B2, chat render-proof atomicity.**  Its checkpoint-backed
render path is intentionally separate and still has raw project proof writes.
It must receive its own receipt-bound ProjectService port and recovery rule;
do not reuse this Director-only evidence contract or merge the two proof
authorities.

#### Execution sub-plan: 1-B2 chat render-proof atomicity - 2026-08-11

This is a required part of the broader canonical-editing programme, not a
separate chat architecture.  Its authority split is deliberately narrow:

- The **before-operation checkpoint** owns the durable chat proof record and
  its execution lifecycle.  It is the source of truth for the proof request,
  rendered result and any later human-facing diagnosis.
- **ProjectService** remains the sole revision/CAS owner.  It may write a
  receipt-guarded *derived current projection* for the UI, but it must never
  become a second chat-proof store and a worker must never write `projects`
  directly.
- A render request names the exact writer-issued receipt for the edit it is
  proving.  It cannot be silently rebound to a newer project revision.

| Slice | Status | Exact work and acceptance condition |
|---|---|---|
| **1-B2a** | **complete** (`eb92696dd`) | The normal synchronous chat transaction passes its writer-issued receipt into the after checkpoint and render-verification request.  `CheckpointService` captures that supplied revision instead of re-reading the current project revision; cross-project receipts fail before persistence.  The lifecycle record preserves the immutable receipt. |
| **1-B2b** | **complete** (`3b343496b`, `39009d37f`) | Raw `projects` proof mirrors in the main chat stream and worker were replaced with the narrow ProjectService receipt-CAS projection port.  The checkpoint record remains authoritative; a receipt that is no longer current receives a stale disposition and cannot alter the newer project. |
| **1-B2c** | **complete** (`03007d618`, `b46654a5d`) | Reference-style, dubbing and direct editorial-intent work now carry their own writer receipt through the after checkpoint and proof request.  Async editorial MG-child reconciliation has no child receipt today, so it finishes `completed_unverified` with no after checkpoint or render dispatch; it never borrows a parent/Director receipt. |
| **1-B2d** | **complete** (`abeaf6a81`, `2470f4e6f`, `6b787b6f2`) | A server-issued attempt token binds the exact checkpoint/session/operation/after-checkpoint proof identity across checkpoint and derived ProjectService projection CAS writes, so a superseded worker cannot complete a replacement attempt.  The checkpoint retains immutable worker input and owns a leased, scheduled recovery of an abandoned or ambiguous queue publish.  Terminal notifications use a checkpoint lease plus a deterministic chat-message idempotency key, so a crash after message persistence is recovered without a duplicate message. |

The adversarial proof set for this sub-plan must show: a manual edit after a
chat edit cannot receive the older edit's proof; duplicate delivery cannot
overwrite a terminal result; a failed dispatch cannot look verified; a
cross-project receipt cannot create a checkpoint or projection; and every
unmigrated producer reports `completed_unverified` rather than fabricated
proof.  No slice may add a chat journal, a private checkpoint store, a worker
Mongo writer, or a second project/proof authority.

#### Execution-status correction: 1-B3 complete for the identified timeline writers - 2026-08-11

The three audio writers and the successful async MG delivery no longer write
timeline overlays through private Mongo paths.  In particular,
`3035d74cc` routes a generated `MG_SEQUENCE`, any selected kinetic-SFX
overlays, and the generated worker outcome through the narrow
`ProjectService.commitMgRenderDelivery` command.  That command requires the
exact snapshot revision, increments the canonical revision once, returns a
writer receipt, rejects a stale snapshot without a project change, and treats
an already-landed MG job as an idempotent replay without manufacturing a new
receipt.  The MG worker retains sandbox execution, job leasing/retry and
media-asset persistence; none became ProjectService responsibilities.

Focused tests prove the worker calls that command before job completion, the
full MG-plus-SFX delivery is one project mutation, and both stale and replay
cases have the required dispositions.  This is not a claim that every
`projects` write is now canonical.

#### 1-B4 classification ledger - 2026-08-11

The remaining project-document fields below are **not** a second timeline
authority merely because they live beside the timeline.  They must not be
silently promoted to canonical editing state either.

| Live field family | Classification | Correct owner/destination | Current caveat |
|---|---|---|---|
| `intelligence.mgDesignJob` | Execution-local job lifecycle mirror | Existing MG design-job record is the lifecycle owner; project value is a disposable UI projection. | Its raw mirror is not revision-bound and must never prove an edit. |
| `intelligence.mgDeliveryRecords`, `mgCodegenRun.outcomes`, `mgCodegenRun.asyncOutcomes` | Derived delivery/preflight evidence | Durable render job plus rendered overlay/receipt are the delivery facts; any project copy is derived UI/read-model evidence. | `mgDeliveryRecords` is best-effort and the worker does not read its `deliveryStaleGuard`; it is not a freshness or proof authority. |
| `intelligence.mgKineticSfxContexts` | Worker handoff input | Typed render-job request/execution data, not project editing state. | It is currently a raw project handoff and can be absent; the worker must honestly suppress kinetic SFX rather than invent it. |
| `intelligence.mgTasteContract` | Project-scoped creative-direction state | The future versioned CreativeDirection owner, not an MG shadow helper or a timeline mutation. | Current shadow/live persistence is unversioned and is not an undo/proof receipt. |
| Director decision logs, V-JEPA coverage, auto-BGM decisions and quality summaries | Derived evidence | Their producing analysis/job records, with receipt-bound proof only where an item is claimed as proof of a specific edit. | A field changing root `updatedAt` can still disrupt legacy callers; no UI success claim may rely on it alone. |
| Assist status, credit/refund flags and upload-batch orchestration | Billing/workflow state | Existing assist/billing and batch orchestration owners. | Never route billing, refunds or job leases through ProjectService's timeline command path. |

The next implementation slice therefore is **not** a generic "move all
metadata into ProjectService" refactor.  It is a bounded repair of the next
canonical mutation/proof path after its actual source owner and consumer are
traced.  In particular, `mgDeliveryRecords` must not be used to authorize a
late render until it has a real owner-bound freshness contract.

#### Execution-status correction: 1-B5 and 1-B6 complete - 2026-08-11

- **1-B5:** `26e9a2792` makes a chat redo request fail closed instead of
  treating an after-edit checkpoint as a replay authority.  Undo continues to
  use its writer-bound before checkpoint.  `ad5a99650` carries the resolver's
  action to the request owner so a rejected redo receives no checkpoint-restore
  tool at all.  A safe redo remains unimplemented: it needs an original command
  plus a receipt chain that proves each post-undo state.
- **1-B6:** selected ThinkForge Brand Vault authority was already fail-closed:
  `resolveThinkForgeBrandAuthority` converts an unavailable selected profile or
  scope into a typed error, and the context resolver does not substitute
  unscoped brand data.  `18747de74` closes the remaining exposed route defect:
  the DataBank maintenance cron now requires the configured bearer secret and
  rejects a forged `vercel-cron` user-agent.

#### 1-B7 IF1 compatibility decision: keep the freeze un-wired - 2026-08-11

**Decision: do not import or wire IF1 into the active runtime yet.**  This is
not a rejection of the frozen contract; it prevents a second command/revision
authority while the live project writer is still narrower than IF1.

Code and history evidence:

- `editron-interface-freeze-1` targets `5a47e008…`, descends from the Phase
  2C base `7e9b4dd7…`, and freezes only the five IF1 artifact files. It is not
  an ancestor of this active infrastructure branch; commit `d1402ff38` restores
  its reviewed artifact content here.
- The active tree now contains that isolated `lib/editron/if1` candidate, but no
  production runtime imports `ProjectServiceIF1RevisionIssuerV1` and
  `ProjectService` has not implemented it; therefore it is not secretly acting
  as a live authority.
- Active `ProjectService` now issues native `ProjectMutationReceiptV1` values
  containing project ID, numeric-plus-compatibility revision and commit time.
  It does not yet issue IF1's opaque project reference, canonical actor/project
  operation/replay identity, command hash, changed paths, timeline projection
  revision, checkpoint/undo reference, or versioned proof disposition.
- The IF1 adapter deliberately only projects an already-issued native receipt.
  Adding its issuer without the missing command and receipt semantics would
  create a parallel vocabulary, not a canonical migration.

**Re-entry conditions:** first prove a single ProjectService-issued codec for
opaque IF1 revisions; then map one live command family end-to-end from
actor/project-scoped canonical command through its receipt, proof and undo
fields; finally show that UI, chat and worker callers consume that one result
without retaining the native receipt as a competing public contract.  Until
then, the tag remains frozen and un-wired; no IF1 V2 or merge is authorised by
this decision.

## Final CEO and engineering review - 2026-08-12

### Review posture and decision

Mode: **HOLD SCOPE**. The broad destination remains an AI-native, Adobe-class
web post-production system, but the currently authorised build surface is only
K/OE-0, then OE-1 and OE-2 if each preceding slice verifies. The review does
not authorise a production planner, model router, live project mutation, broad
overlay expansion or an Adobe-replacement claim.

This is **sequenced execution clearance**, not a decision to stop at K/OE-0.
K/OE-0 freezes the fair test; OE-1 runs the models; OE-2 proves their proposed
graphs against isolated renders. If the locked gate passes, the next proposal
is production integration. Building the runtime first would make the benchmark
measure our repair code, templates and hidden assistance instead of the model's
ability to construct the graph.

The restrictions also fall into two different classes:

- **Permanent ownership/supply-chain boundaries:** ProjectService remains the
  only project mutation owner; a model or research harness never becomes a
  second authority. Web content never auto-installs executable capability.
  Candidate code or knowledge must be isolated, licensed, reviewed, tested,
  versioned and promoted through the normal capability process.
- **Evidence-gated product work:** model-driven production planning, controlled
  web research, live mutation and Adobe-class claims are deferred, not banned.
  A production planner may proceed after OE-2 proves graph quality and the
  auto-edit checkpoint defines interaction/conflict semantics. Controlled web
  research may proceed through a separately permissioned, injection-resistant
  research service that returns cited evidence or a capability-gap proposal;
  the live project agent does not receive unrestricted browsing or executable
  downloads. Adobe-class claims proceed capability family by capability family
  after their real workflows and proof gates pass.

**CEO verdict:** the bet is worth testing because successful graph synthesis
could materially compress agency editing labour, but the commercial wedge is
still reliable agency production. Knowledge gathering and model cleverness are
not sellable capability without working primitives, truthful proof and client
acceptance.

**Engineering verdict:** the plan is implementation-clear for the isolated
research sequence only. Production integration remains gated by an OE-2 `GO`,
the auto-edit checkpoint, canonical owner compatibility and repaired overlay
verticals.

### What already exists

| Existing fact | Reuse decision |
|---|---|
| ProjectService CAS and writer-issued native receipts for migrated paths | Reuse as the only live project mutation owner; do not copy into the research harness. |
| Frozen IF1 artifact and tag | Preserve un-wired until its documented re-entry conditions hold. |
| Fixed chat tool contract/metadata registry | Adapt a focused subset into research `OperatorSpec` records; do not call it a general capability runtime. |
| Six current editorial preference families | Preserve as current UI/chat preferences; do not treat them as the boundary of editing knowledge. |
| Upload, proxy, analysis, evidence, Remotion and FFmpeg paths | Reuse only where producer, source identity, supported media and final consumer are verified. |
| Creative knowledge graph (115 techniques, 95 mappings, 50 constraints) | Audit and use as optional knowledge/program memory and ablation input; never as authority or proof. |
| Existing caption, transition, MG, SFX/music and B-roll paths | Recover one end-to-end representative per vertical before catalog expansion. |
| Vitest and Playwright infrastructure | Reuse for contracts/integration and later user-flow tests; add a dedicated eval harness for stochastic model quality. |

### CEO Section 1 - architecture review

The accepted architecture has one creative proposer and multiple independent
guards without creating a second project runtime:

```text
OFFICIAL/REVIEWED KNOWLEDGE                  CANONICAL PROJECT FACTS
          |                                           |
          v                                           v
  KnowledgeRetriever                         ConstraintMaterializer
          |                                           |
          +-----------------> PlannerEnvelope <-------+
                                      |
                                      v
                              replaceable model route
                                      |
                               candidate EditDAG
                                      |
                           GraphVerifier --reject--> typed failure
                                      |
                           ExecutionScheduler
                                      |
                       family resolvers / generated program
                                      |
                         isolated preview + hard proof
                                      |
                          human approval where required
                                      |
                   ProjectService CAS -> receipt -> later proof
```

The first 10x bottleneck is provider/render throughput and evidence retrieval,
not graph verification. At 100x, derived-media storage, queue admission,
per-tenant budgets and reviewer capacity become limiting. The plan addresses
these by staged provider screening, compact evidence, sharded media work,
durable jobs and explicit cost/human-minute accounting.

Single points of failure are visible: ProjectService for canonical apply, each
selected provider route for planning, the proxy renderer for preview and the
evidence index for retrieval. ProjectService is intentionally singular for
consistency; provider and worker failures degrade to visible unavailable or
needs-review outcomes. No automatic failover may silently change privacy,
price, model or quality semantics.

Rollback posture is strong for the research sequence: it has no database
migration and no live writer. Disable provider credentials and the research
entry point, retain immutable trial artifacts, and revert the isolated commit.
A future production route must be feature-flagged per task family and fall back
to the already-certified manual/family path—not claim the AI edit succeeded.

### CEO Section 2 - error and rescue map

| Method/codepath | What can go wrong | Typed disposition | Rescue action | User/operator sees |
|---|---|---|---|---|
| Knowledge-source review | Licence absent, source moved, version changed | `KNOWLEDGE_SOURCE_UNAPPROVED` | Exclude entry; require legal/editor review | Coverage gap, not silent retrieval |
| `ConstraintMaterializer` | Missing revision/media/right; registry mismatch | `ENVELOPE_UNSATISFIABLE` | Clarify, narrow or decline; zero provider call | Exact missing constraint |
| Evidence retrieval | Empty, stale, wrong source range, index unavailable | `EVIDENCE_MISSING_OR_STALE` | Re-index/clarify or decline | Missing evidence and affected ranges |
| Provider adapter | Timeout, 429, refusal, malformed/empty JSON | `PROVIDER_*` | Declared bounded retry or fail route | Unavailable/needs review; no edit claim |
| Planner | Hallucinated operator, unbound port, unsupported assumption | `PLANNER_GRAPH_INVALID` | One bounded predicate-specific repair only after verifier feedback | Repaired preview or decline |
| `GraphVerifier` | Cycle, type/range/effect/policy/proof violation | `GRAPH_REJECTED` | No internal creative repair | Exact node/edge violations |
| Scheduler | Accepted graph cannot be ordered consistently | `SCHEDULER_INVARIANT_FAILED` | Quarantine trial as implementation defect | Internal failure; no render |
| Proxy executor | Sandbox limit, missing asset/font, codec/render crash | `PREVIEW_FAILED` | Declared safe retry or needs review | Failed preview and reason |
| Hard validators | Target/preservation/rights/accessibility failure | `PROOF_FAILED` | Reject candidate; never let model judge override | Failed predicates and frames/ranges |
| Human/editor review | No reviewer, disagreement, rejected result | `REVIEW_PENDING/REJECTED` | Keep alternatives/original evidence | Pending or rejected, never consensus |
| ProjectService apply | Stale revision, conflict, deleted source | IF1/native structured conflict | Replan/compare/explicit resolution | Current revision and conflict scope |

Catch-all “log and continue” is forbidden in these paths. Error records bind
tenant, project/task, envelope, provider/model, operation/trial, source ranges,
attempt, cost reservation and causal error without logging secrets or raw
private media.

### CEO Section 3 - security and threat model

| Threat | Likelihood | Impact | Required mitigation |
|---|---|---|---|
| Reference/transcript/stock metadata prompt injection | High | High | Treat all media-derived text as quoted evidence; fixed system/tool policy and structural envelope win. |
| Model calls an absent or forbidden tool | High | High | Tool broker requires the hashed envelope and rejects missing IDs server-side. |
| Cross-project ID/range substitution | Medium | High | Project-scoped opaque IDs, source/range validation and no raw provider-supplied database keys. |
| Provider egress violates client policy | Medium | High | Provider/privacy matrix before eligibility; approved region/retention terms; redact/minimise evidence. |
| Full manuals or creator videos are copied without rights | Medium | High | Rights ledger; original synthesis or explicitly licensed full-text ingestion only. |
| Generated composition escapes sandbox | Medium | High | No network/secrets/database/ProjectService; allowlisted dependencies; immutable tokenised I/O; tenant quotas and artifact scan. |
| Cost exhaustion through retry/long context | High | Medium | Reservation before dispatch, hard route budgets, one repair, cancellation and per-tenant concurrency. |
| Eval leakage/overfitting | Medium | High | Hidden holdouts, randomised semantic-preserving operator names/order and separate task authors/reviewers. |

No new public endpoint is authorised by K/OE-0. OE-1/OE-2 are operator-only
research tools, disabled in production builds and scoped to approved test
media. Secrets remain environment-managed and rotatable.

### CEO Section 4 - data flow and interaction edge cases

```text
INPUT --------> VALIDATE --------> TRANSFORM --------> STORE --------> OUTPUT
  |                 |                  |                  |                |
  + nil goal        + invalid rights   + provider error   + duplicate run  + stale view
  + empty evidence  + stale revision   + malformed graph  + partial write  + late result
  + huge project    + no eligible op   + render OOM       + quota full     + user edited

nil/empty -> clarify or decline
invalid/forbidden -> fail before provider call
provider/render error -> typed failed trial; no mutation
duplicate -> same trial/idempotency identity; no double charge where supported
user edits meanwhile -> preview stays bound to R_base; apply conflicts or rebases only by declared semantics
```

The eventual user interaction state map is explicit:

| Flow | Loading | Empty | Error | Success | Partial/stale |
|---|---|---|---|---|---|
| Analyse | progress + cancel | no usable evidence | shard/job failure | cited evidence ready | missing ranges identified |
| Plan | planning + budget | no legal graph | provider/verifier failure | proposal ready | clarification/decline |
| Preview | render progress | no candidate | render/proof failure | comparable preview | rendered against older revision |
| Apply | applying by CAS | no change warranted | conflict/failure | applied pending proof | needs review; never false success |

Double-submit uses operation/trial idempotency. Navigation does not cancel by
accident; cancellation is explicit. A late background result cannot overwrite
a manual edit or inherit proof from another revision.

### CEO Section 5 - code-quality review

The plan avoids two over-engineering traps: building a universal production
control plane before the model bet passes, and copying professional manuals
into a giant ontology. It avoids under-engineering by requiring exact
ownership, typed effects, verifier/proof coverage, provider records and real
render/human outcomes.

Naming now reflects responsibility: `ConstraintMaterializer` projects existing
facts; `PlannerEnvelope` is immutable call scope; `GraphVerifier` rejects;
`ExecutionScheduler` orders; `ProjectService` alone applies. “Compiler” may be
used colloquially for verifier+scheduler tooling but cannot hide creative graph
repair.

Before any new module or type is created, search direct references, type
references, string identifiers, dynamic imports, barrels, tests and mocks for
an existing owner. The fixed chat registry, current resolvers and ProjectService
are adapter sources, not systems to duplicate.

### CEO Section 6 - test review

```text
K/OE-0
  [UNIT] source/licence/version record validation
  [UNIT] BehaviourBrief and OperatorSpec schema boundaries
  [UNIT] forbidden vs eligible-distractor envelope fixtures
  [EVAL] four development + eight hidden holdout task integrity

OE-1
  [INTEGRATION] identical envelope/schema hashes across provider adapters
  [INTEGRATION] timeout, 429, refusal, empty/malformed JSON and cancellation
  [UNIT] token/cost accounting and no hidden retry
  [EVAL] three-trial development screen + five-trial hidden screen

OE-2
  [UNIT] cycles, unbound ports, incompatible types/ranges and state conflicts
  [UNIT] policy/proof/preservation rejection and scheduler determinism
  [INTEGRATION] sandbox missing asset/font, timeout/OOM and duplicate trial
  [EVAL] hard predicates + blind editor preference + one-repair ceiling
  [CHAOS] provider loss/render-worker crash/queue duplication during a trial

PRODUCTION (not yet authorised)
  [E2E] chat/UI parity -> proposal -> preview -> apply -> reload -> proof -> undo
  [E2E] user edits during AI work; stale result changes nothing
```

The Friday-at-2am test is a duplicate/stale provider result during a concurrent
manual edit: one canonical apply at most, correct revision-bound proof, no
wrong-project data and a recoverable user state. The hostile test injects tool
instructions through OCR/reference text and substitutes another project's
asset/range. Both must fail before mutation. The plan uses many unit/contract
tests, fewer integration tests, a small number of product E2E tests and a
separate repeated eval suite; it does not invert the pyramid.

### CEO Section 7 - performance review

The three expected slow paths are initial media indexing, multimodal evidence
inspection and preview rendering. Graph verification/scheduling should remain
linear in the small candidate DAG and is not allowed to query a database per
node. `PlannerEnvelope` construction performs batched, indexed reads and caps
operator/evidence payload size. Knowledge/source/operator content is hashed and
cached by version; trial-specific project facts are not globally cached.

Ten-hour footage is indexed once in resumable adaptive shards. Per-decision
work retrieves small source windows; model and renderer concurrency is bounded
per tenant. Load tests measure queue age, shard retries, memory, storage/egress,
provider rate limits and p95 end-to-end cost. No claim is made from context
window size alone.

### CEO Section 8 - observability and debuggability review

Every trial/job carries trace, tenant, task, project/revision where applicable,
envelope, model, knowledge-set, graph, render and proof IDs. Day-one metrics are
schema/graph validity, forbidden attempts, decline accuracy, verifier reasons,
render failures, hard-predicate failures, false accepts, repair count, latency,
cost and human-review minutes. Alerts cover false success (page immediately),
cross-tenant scope rejection, runaway spend, provider error spikes, queue age
and verifier/runtime invariant failures.

An operator can reconstruct a trial three weeks later from immutable hashes and
sanitised records without requiring hidden model reasoning. Runbooks cover
provider outage, price/model change, leaked holdout, renderer incident,
knowledge-rights withdrawal and stale production preview.

### CEO Section 9 - deployment and rollout review

```text
K/OE-0 fixtures -> review/legal sign-off -> OE-1 local/CI research flag
  -> development screen -> holdout lock -> OE-2 isolated renderer
  -> GO/MODIFY/NO-GO report -> mandatory auto-edit checkpoint
  -> only then propose shadow production integration
  -> canary per task family -> certified rollout
```

K/OE-0 has no migration. OE-1/OE-2 must be absent or disabled in production
bundles, have separate credentials/budgets and write only research artifacts.
Rollback is:

```text
incident -> disable research/route flag -> revoke provider credentials if needed
         -> cancel queued trials -> retain audit artifacts -> revert slice
         -> certified manual/family edit remains available
```

A future schema migration must be backward-compatible and deployed before any
writer. Smoke tests verify the tool broker cannot reach ProjectService, a
forbidden operation is rejected, a provider failure cannot mutate a project and
the cost cap cancels further attempts.

### CEO Section 10 - long-term trajectory review

Reversibility is **4/5** for K/OE-0/OE-1/OE-2 because they are isolated,
artifact-only experiments. A production planning control plane would drop to
2/5 if its vocabulary leaked into saved projects before owner compatibility;
the gate prevents that path dependency.

The 12-month platform value is a provider-neutral, evidence-grounded planning
surface that can serve manual UI, chat and future automation without owning
timeline state. The main long-term debts to avoid are proprietary provider
packets, an unlicensed knowledge corpus, stale operator specs, evaluation
leakage and techniques that outlive their real renderer support.

### CEO Section 11 - design and UX review

The UX promise is not “watch an agent think.” Users first see their playable
project, then a concise proposal with affected time ranges, evidence, visible
change, cost/time and risk; comparison appears only when useful. Manual timeline
interaction stays available while analysis/planning/rendering runs. Keyboard,
screen-reader, contrast, reduced-motion and non-colour status cues are required
for the future review surface.

```text
Project -> Ask/edit manually -> Background analysis/plan
   |                              |
   +---- keep playing/editing ----+
                                  v
                         Proposal / clarify / decline
                                  |
                         Compare preview(s)
                                  |
                  Apply by CAS / resolve conflict / cancel
                                  |
                       pending proof -> verified/needs review/failed
```

A dedicated `/plan-design-review` remains appropriate before Stage 5 UI work;
there is no new UI in the next three research slices.

### Deep engineering review

#### Engineering Section 1 - architecture findings

1. **[P0] (confidence 10/10) current planning surface is closed-world.**
   `lib/editron/agent/chat-tool-registry.ts:340` says
   `export const CHAT_TOOL_REGISTRY = {` and the object currently contains 66
   concrete `defineTool` entries. `lib/editron/production-brief/editorial-preferences.ts:1-8`
   exports only `captions`, `motionGraphics`, `zoom`, `transitions`, `sfx` and
   `music`. These are useful adapter sources, not proof of open-ended editing.
   **Disposition:** the research envelope adapts existing owners and adds no
   production registry/dispatcher.
2. **[P0] (confidence 10/10) named match-cut support is semantically partial.**
   `lib/editron/services/intent-translator.ts:560` says
   `'match-cut': 'hard-cut', // Match-cut is conceptual — executor does hard-cut`.
   `lib/editron/services/continuity-service.ts:120` begins visual matching with
   `// Keyword overlap (Jaccard similarity)`. **Disposition:** match cut is a
   benchmark/capability-gap case; the product must not claim geometric/action/
   semantic match selection from the name alone.
3. **[P1] (confidence 9/10) provider choice is scattered and Gemini-heavy.**
   `lib/editron/utils/gemini-model-factory.ts:34-35` defines analysis as
   `gemini-2.5-flash` and chat as `gemini-3.1-flash-lite`; line 64 defaults
   general work to `gemini-3.1-pro-preview`. **Disposition:** OE-1 normalises
   trial transport only; production router work waits for a measured winner.
4. **[P1] (confidence 9/10) the creative graph mixes memory with aspirational
   authority.** `lib/editron/data/creative-knowledge-graph.json:23-25` reports
   95 mappings, 115 techniques and 50 constraints, while lines 31-95 contain
   direct technique aliases. **Disposition:** source/support audit plus
   with/without-memory ablation; no alias-dependent competence claim.
5. **[P0] (confidence 9/10) a verifier that inserts operations would become a
   hidden planner.** This was present in the earlier draft and is now removed.
   **Disposition:** pure `GraphVerifier`; separate mechanical scheduler; any
   unbound/conceptually incomplete graph is planner failure.

#### Engineering Section 2 - code-quality findings

- Research contracts live outside production planner/runtime namespaces until
  OE-2. Provider-specific types stop at adapters; the canonical trial record is
  provider-neutral.
- `ConstraintMaterializer` is a pure read/projection service. It cannot persist,
  rank creative choices or become a second policy/rights owner.
- Knowledge retrieval, operator adaptation, graph verification, scheduling,
  rendering and judging remain separate modules with narrow inputs. No god
  service may branch over providers, families and renderers together.
- All new names/types require the full reference/type/string/dynamic-import/
  barrel/test search before creation. Files over 300 lines receive a separate
  dead-code/import/log cleanup only when executable code is actually changed.
- Provider exceptions are normalised into explicit trial dispositions; raw
  catch-all messages never become user-facing or success results.

#### Engineering Section 3 - test findings

The plan now covers every planned branch at the correct layer. The mandatory
eval baselines are: manually authored legal graph, current certified-family
path where one exists, with-knowledge vs without-knowledge, template-memory vs
template-free and cheap route vs frontier ceiling subset. Seeds/trial identity,
operator order and provider snapshot are recorded. Holdout task content is not
written into production prompts or knowledge entries.

Coverage gaps are intentionally blocking rather than deferred: no provider
adapter lands without malformed/empty/refusal/429/timeout/cancellation tests;
no verifier lands without every rejection class; no renderer trial lands
without sandbox/resource/missing-asset tests; no `GO` exists without blind
editor review and confidence intervals.

#### Engineering Section 4 - performance findings

- Model input is capped structured evidence, not raw long-form media. Multimodal
  source windows are separately metered.
- Operator specs and reviewed knowledge use content-addressed caches; project
  revision/range facts remain request-scoped.
- The harness streams trial artifacts, not all results into memory, and uses
  bounded concurrency per provider/tenant.
- Cost is reserved before each call/render; a failed reservation prevents
  dispatch. Rate limiting, exponential backoff and circuit breaking are
  provider-specific declared policy, never invisible unlimited retry.
- Performance gates include p95 plan time, render time, queue age, peak memory,
  provider and total accepted-edit cost. Short-form latency is measured
  separately so long-form infrastructure cannot normalize a sluggish product.

### Failure-modes registry

| Codepath | Failure mode | Rescued? | Test? | User/operator sees? | Logged? |
|---|---|---:|---:|---|---:|
| Knowledge review | unlicensed/stale source | Yes | Yes | excluded + coverage gap | Yes |
| Envelope | empty/no eligible operators | Yes | Yes | clarify/decline | Yes |
| Evidence | stale or wrong range | Yes | Yes | re-index/decline | Yes |
| Provider | timeout/429/refusal/empty/malformed | Yes | Yes | unavailable/declined | Yes |
| Planner | absent/forbidden operator | Yes | Yes | graph rejected | Yes |
| Verifier | cycle/type/range/effect/policy failure | Yes | Yes | exact violations | Yes |
| Scheduler | invariant failure | Yes | Yes | internal failure | Yes |
| Sandbox | escape/resource/codec/font/asset failure | Yes | Yes | preview failed | Yes |
| Validator | hard target/preservation failure | Yes | Yes | failed predicates | Yes |
| Human review | disagreement/rejection | Yes | Yes | unresolved/rejected | Yes |
| Apply | stale revision/concurrent edit | Yes | Yes | conflict/replan options | Yes |

There is no row with no rescue, no test and silent user impact. Therefore this
review contains **zero unresolved critical failure gaps** at plan level.

### NOT in scope

- Production planner/router implementation before OE-2 `GO` — the core model
  bet is unproved.
- The simpler auto-edit design — deliberately reserved for the mandatory
  post-OE-2 user checkpoint.
- IF1 runtime wiring or V2 — existing re-entry conditions remain unmet.
- Automatic capability installation from the web — research may only create a
  cited gap proposal.
- Full-text copying of manuals or scraped creator/course videos — rights and
  original synthesis come first.
- Broad caption/transition/SFX/MG catalog import or legacy pruning — current
  representative paths must first recover end to end.
- Ten-hour production infrastructure build — its measured sharded prototype and
  the common media contracts precede product claims.
- New branch, worktree, queue, journal, checkpoint, media, timeline, registry or
  proof authority.

### Dream-state delta

This plan establishes the path and the falsifiable model experiment; it does
not deliver the dream state. Remaining deltas include a canonical professional
timeline, reliable overlay verticals, broad certified operations, long-form
media/job infrastructure, client review/delivery, collaboration, interchange,
colour/audio/VFX/conform/mastering and successful agency/production-house
certification runs. The most important unknown—whether affordable models can
compose valid unfamiliar edit graphs—is now measured before architecture is
built around it.

### Implementation tasks

- [x] **T1 (historical diagnostic)** — K/OE-0/OE-1/OE-2A produced the frozen
  knowledge ledger, fixtures, provider artifacts and exact verifier results.
  - Disposition: preserved for audit, but its production interpretation is
    superseded by the v2 correction because the experiment mixed target
    reconstruction, form choice, exact serialization and execution readiness.
  - Verify: historical hashes and raw records remain unchanged.
- [x] **T2 (completed at `ac34f5b2a`)** — CAP-0 — freeze current Editron
  capability truth across manual UI, shortcuts, chat, Director, workers, APIs,
  persistence and render/export consumers.
  - Surfaced by: manual/chat parity audit and benchmark input invalidity.
  - Files: new capability census packet, human ledger and parity matrix selected
    only after the pre-creation owner search; no runtime imports or mutations.
  - Verify: every row has code citations, actual read/write fields, final
    consumer/proof, duplicate-owner status and a reproducible count report.
  - Scope correction (2026-08-17): this completed family-level reconnaissance;
    it did not create the final atomic executable tool sheet. `CAP-2A` now owns
    that remaining per-operation schema/owner/proof/parity work.
- [x] **T3 (completed at `ac34f5b2a`)** — CAP-1 — compare the frozen CAP-0
  packet with current official Adobe Premiere Pro, After Effects, Audition,
  Media Encoder and Frame.io functions and workflows.
  - Surfaced by: the need for a real Adobe-class destination rather than an
    invented list of generic product responsibilities.
  - Verify: official source/version per row, feature/workflow/product-duty
    classification, and an evidence-backed current/gap status.
- [ ] **T4 (P1, human ~1d / Codex ~3h)** — knowledge audit — classify every
  selected creative-graph record as supported, aspirational, stale or rejected.
  - Surfaced by: engineering finding 4.
  - Files: knowledge audit artifact and selected fixtures; do not rewrite the
    runtime graph in V2-0.
  - Verify: source/support evidence for every selected benchmark entry.
- [x] **T5 (completed at `e52ea9bf7`)** — V2-0 — freeze the corrected seven-stage
  contract, typed plan/compiler boundary, execution-form ablations,
  condition-aware predicates, CAP-0-derived operator packet, modality arms and
  budget telemetry.
  - Surfaced by: benchmark validity audit and model/provider diagnostics.
  - Files: research-only schema/fixtures/tests selected after an owner search;
    no production planner or ProjectService import.
  - Verify: schema and invariant tests, exact media/packet hashes, token/finish
    telemetry tests and zero runtime imports.
  - Scope correction (2026-08-17): the operator packet is a bounded 40-row
    research slice, not the complete Editron manual/chat/worker capability
    contract. Its `candidateCapabilityIds` node shape and compiler boundary are
    superseded by `CAP-2A` and `V2-1R` in the authoritative ledger.
- [x] **T6 (P1, bounded smoke)** — V2-1 — run one mechanics-only trial per
  model/arm across four owned/synthetic tasks.
  - Surfaced by: need to validate the benchmark before another paid matrix.
  - Reconciled state (2026-08-17): provider transports, token/cost telemetry,
    staged packets, synthetic mechanics, research proxy renderers and raw
    receipts exist. Those are useful harness/mechanics results. Previously
    recorded cohort hashes remain immutable historical records, but their model-ranking
    interpretation is `INVALID_EVIDENCE`.
  - Root causes: Stage 2 conflated executed tools and alternatives in
    `candidateCapabilityIds`; Stage 4 was DEV-specific rather than generic;
    evaluator-approved canonical handoffs substituted for actual model output;
    compiler-owned adapter policy contradicted Terra's evaluator; and Luna's
    repair inherited too little of the shared 40-second stage budget.
  - Provider dispositions: Luna DEV-01 is `UNVERIFIABLE / PROVIDER_TIMEOUT`,
    not an editing failure. Terra's DEV-01 omission failure is invalid because
    the issued packet allowed that omission. Qwen did select a detailed real
    tool chain, but the ambiguous node schema prevents an honest executable
    verdict. No model advances or fails on these records.
  - Superseding state (2026-08-22): CAP-2A and the corrected native
    handoff/order benchmark are complete for their bounded claims. H03 V3R3
    then carried untouched live Luna/Terra source through isolated generated
    and hybrid render attempts, but discovered a provider-visible API/verifier
    confound. T6 is complete as a harness-discovery smoke; it is not model
    promotion evidence. V2-2 remains blocked on a corrected versioned H03
    rerun, not on repeating the invalid historical DEV graph benchmark.
  - Verify: raw provider output survives unchanged through all seven stages;
    every executed catalog operator is model-selected; lowering adds or drops
    zero catalog operators; exact token/time/cost telemetry is reconciled;
    isolated video/audio proof and blind review bind to the model artifact; no
    ranking is published from a contaminated or single canonical graph.
- [ ] **T7 (P1, bounded matrix)** — V2-2 — run repeated development and locked
  holdout trials, then publish `GO`, `MODIFY` or `NO-GO`.
  - Surfaced by: the open-ended model and routing hypotheses.
  - Current gate (2026-08-22): H03 component-kind/translation contracts,
    six-direction motion proof, CAP-2A V6 and the corrected H03 V3R4 run are
    complete through `7064fe381`. The frozen result is 4/12 rendered passes for
    evaluable Luna/Terra rows; six Gemini 3.7 rows remain provider-rate-limit
    non-evaluations and require a separately versioned supplement if the route
    becomes callable. Current V4R manifest `df6d9024...` corrects the stale
    “seven unseen” claim and has executed all 45 current-context rows under
    receipt `fe4a3420...`: 13 proof passes, 17 evaluable failures and 15
    Gemini-429 non-evaluations, with zero project access. Commit `4d79e0986`
    freezes the first fair route-ablation qualification: eight no-provider rows,
    two DEV-02 scopes, four route arms, identical per-scope target/tool/ownership
    truth, manifest `b0511447...` and hidden evaluator `6e6e4586...`; its seven
    focused adversarial tests and repository typecheck/lint pass. Commit
    `18ac28f9b` and provider manifest `fe744744...` now bind 24 current-route
    rows. Real zero-inference receipt `0f2e02ce...` verifies request set
    `44ba549e...`, Luna/Terra/Gemini 3.7 identities, eight official Gemini token
    counts and zero inference/project access. Commit `567414438` then freezes
    the bounded paid runner. All 24 Stage-2 rows executed under receipt
    `9583de5c...`: seven honest gaps, nine hidden failures and eight Gemini-429
    non-evaluations for `$1.5474777`, with zero project access. This is still
    not an executed or rendered route comparison. The first executable-route
    requalification then found that the tracked DEV-02 smoke harness still
    imposed a stale 90-second wall/60-second CPU ceiling even though the frozen
    program and connected Stage 6 owner declare 180/120 seconds. The stale
    request failed `RESOURCE_BUDGET_EXCEEDED`; the unchanged current renderer
    passed under the program-owned ceiling in 94,057 ms on production snapshot
    `snap_CRyxD1...`, request `3c848041...`, host receipt `73291ed9...`, with
    hash-bound playable output and no project mutation. This proves current
    sandbox mechanics only. The historical V1 capability remains pinned to its
    old snapshot/hashes. The successor V2 research capability now preserves
    V1 as its explicit predecessor and binds the current snapshot, API, runner,
    worker, resource envelope and successful smoke receipt. Its capability hash
    is `ad429a4c950d97dd27d12c9b5e487e885ca30d33bb29e93165466290492c1de6`;
    the compiler and
    evaluator accept only the exact immutable V1 or V2 artifacts. Current
    DEV-02 fixture assembly now calls the existing deterministic, research-
    proxy and hybrid compilers with V2, while the mechanics take sandbox
    identity from that verified graph instead of a host-side V1 constant.
    Historical canonical V1 graphs remain unchanged. The real connected V2 run
    now passes: source Stage-6 receipt `9425dd46...`, sandbox host receipt
    `4e44af03...`, hybrid receipt `1a56ecb4...` and output SHA-256
    `aa5f6644...`. The result is a decoded 345-frame, 1080x1920, 30/1 H.264
    proxy with generated hard gates, timing, boundary continuity and native
    continuation all `PASS`, and zero project reads, changed paths or state
    effects. Creative taste and flash safety remain `UNVERIFIABLE`; there is no
    audio and no product nested-composition mutation. This does not promote
    product execution or prove the route choice. The same target now also has
    a real forced-native alternative through the production Editron Remotion
    root. A route-neutral seam in the existing DEV-02 proof owner applies the
    identical frame schedule, claim bindings and thresholds without forging a
    generated receipt or creating a second proof policy. The first native run
    is preserved as failed evidence: its row-19 black shape fell behind the
    editor root under the verified row-derived z-index rule, so gutters and
    motion proof failed. The corrected V1 baseline is hash
    `8e6cafec7383dfe3e533d189f6b36fed5959eafce63cf43052fbd315b613d409`;
    execution receipt `f8d8452f...`, target-proof `6ceb231d...` and output
    SHA-256 `4b5b4cc1...` bind a decoded 345-frame, 1080x1920, 30/1 H.264
    video with no audio stream. Frame integrity, five-panel/gutter geometry,
    two-line title, opposed motion, build/hold/release, full-canvas release and
    boundary continuity pass. Flash safety and creative taste remain
    `UNVERIFIABLE`. This forced plan required 16 independent native overlays,
    seven keyframe tracks and 14 keyframes versus the generated program's six
    declared layers, while representing zero cross-element relationships.
    It proves current native state can approximate this fixture with substantial
    authoring/revision surface; it does not prove native is the better route,
    that a model selected it, or that the target is production-certified.
    Commit `301451570` now freezes the randomized native-versus-hybrid review
    pack (`23870abb...`) with two independently probed identity-free reviewer
    copies and a sealed operator key. Next obtain the sole-reviewer preference,
    correction-time and confidence receipt without opening the key. Commit
    `fd2eabcdb` separately qualifies the deterministic stale/disjoint/
    transformed/conflict/lock/evidence policy in 9/9 research cases. Commit
    `34d9da281` adds the non-executing dependency/invalidation scheduler and
    commit `5c179d3a4` adds the hash-bound, non-authoritative compaction/resume
    checkpoint. Commit `99f363e28` then preserves six real model-selected
    operator identities through opaque owner-issued exact-effect bindings into
    the scheduler, bringing the combined safety suite to 26/26. That graph is a
    constructed fork/join qualification, not provider evidence. The provider
    cohort, the generic resume mechanism and one exact captured Luna P1
    fresh-owner restart, reference-input identity and cumulative runtime-budget
    recovery are now complete in process. Commit `1f22ef2f2` adds the unused
    shared durable lifecycle record, `96d2e3923` adapts the exact V4
    checkpoint, `ecfa20c54` closes terminal-writer revision projection and
    `81ce63d9b` adds the transport-neutral zero-inference recovery core, and
    `fee52df57` adds strict owner-coordinated artifact validation. Two bounded
    native owner adapters and their serialized separate-process recovery now
    exist at `be8e12871`; additional owner coverage,
    authenticated ingress/dispatch, paid resumed inference and live-store
    recovery remain before
    long-form/range trials. Product
    integration waits
    for ProjectService-issued change regions/transforms/locks and a durable
    PlanService rather than a second owner.
  - Verify: stage-separated scores, threshold/free-choice/forced-form ablations,
    blind review, cost/latency and no hidden manual rescue.

**Durable provider-dispatch checkpoint (2026-08-23):** commits
`f57d0cb1c`, `88114ec5a`, `55b06b9e8`, `5f2c3b1f9`, `7cc90f161`,
`da252954b`, `9cf3cde0f`, `8a2f4d535`, `bfecfb314`, `c6c416592`,
`898c3ba63`, `93a72e756`, `62fcc6c25`, `5e0dd3b65`, `0f54a0a2a` and
`b6171bed2` supersede older plan
wording that listed all failed-attempt accounting as absent. The current
research episode core can hash-bind a provider request/result, conservatively
charge an unknown transport outcome, persist the attempt and runtime budget in
a zero-turn resume checkpoint, restore both in a fresh process, and refuse any
separately requested retry before invocation when the original ProjectService
revision changed.
The core now additionally creates and callback-persists a hash-bound dispatch
intent before network invocation. On restart, an unresolved intent is charged
at its frozen conservative reservation and committed as an attempt. Commit
`5e0dd3b65` then stops that episode as `UNVERIFIABLE`: accounting approval is
not retry approval, so no automatic provider re-invocation occurs. Exact
intent/request/attempt-chain and unchanged project revision are mandatory. The
complete provider-native suite passes 242 tests with two intentional skips;
repository typecheck and quiet ESLint pass. Commit `8a2f4d535` wires both
callbacks through the shared resumed core and the product Plan worker's
existing leased resume
CAS. Its 429 integration proves pending intent before invocation and a separate
reconciled-attempt checkpoint afterward; an incompatible guard stops before
invocation. The focused Plan/core/worker suite passes 25/25 with full typecheck
and quiet ESLint. Fresh Plan startup, native fresh cut proof and their full
Plan-to-real-native-owner integration are now zero-inference proven without an
invented checkpoint. Crash/redelivery and cancellation are likewise proven
over the real leased Plan job lifecycle. This remains **durable recovery
groundwork**, not automatic retry authorization or production mutation. The
fail-closed product dispatch and signed worker adapters now exist but remain
non-routable without an explicit product execution-owner composition. Commit
`607212e02` plus `8bf1d766e` implement the `498e018e6` read-side storage/policy
ports. Commit `9251945e4` implements their store-neutral authorization and
issuance coordinator; commit `07c59690b` implements its concrete transaction
adapter but not live-store proof. Commit `5f7428248` implements the
concrete CreditsService-owned reservation writer/locator but not live Atlas
proof. Commit `ce3e988a4` derives the exact terminal settlement but does not yet
invoke it from terminal job paths. The next bounded reliability order is
therefore: terminal-redelivery settlement wiring, reference-materializer
`mediaAssets` registration, one execution-root composition, signed route export,
non-production QStash/Atlas crash/redelivery exercise, and only then a fresh
paid preflight with explicit approval.
Canonical project mutation remains disabled.

- [ ] **T8 (P1, human workshop ~2h)** — product — run the promised auto-edit
  simplification checkpoint after V2-2.
  - Surfaced by: explicit user deferral.
  - Verify: user-approved interaction/authority/conflict scope before Stage 3.
- [ ] **T9 (P1, staged)** — production verticals — resume representative
  overlay recovery, one family at a time.
  - Surfaced by: current overlay capability gap.
  - Verify: save/reload/render/truthful-proof/undo before catalog growth.

### Execution parallelisation

Conceptually, CAP-0 family reconnaissance can be divided for review, but its
counts and duplicate-owner conclusions freeze as one packet. CAP-1 waits for
that packet so the Adobe comparison is not made against chat-tool names.
Knowledge/source review and legal media/task preparation can then run in
parallel because they touch different evidence. Provider adapters can also be
developed independently after the shared trial contract freezes. However, the
approved operational lane is the existing `editron-worktree` on
`infrastructure-improvs-+Editron`; this review authorises no new worktree.
Within that lane: `CAP-0` -> `CAP-1` -> `V2-0` is mandatory; V2-1 validates
mechanics before any repeated paid matrix; V2-2 waits for V2-1; the auto-edit
checkpoint waits for V2-2. Runtime parity repairs and overlay recovery require
their own bounded implementation phases after the census identifies the sole
owners; they must not be smuggled into the read-only census.

### Stale-diagram audit

The earlier model flow and reference graph in this file were updated to put the
envelope before planning and the verifier/scheduler after it. No diagram still
claims that a compiler invents creative topology. Historical execution diagrams
describe receipt-hardening rather than the new research pipeline and remain
accurate within their dated sections.

### Review completion summary

| Review area | Result |
|---|---|
| Scope challenge | HOLD SCOPE; broad destination retained, immediate scope restricted to K/OE-0/OE-1/OE-2 |
| CEO architecture | 4 material gates, all folded into plan |
| Error/rescue | 11 paths mapped; 0 critical gaps |
| Security | 8 threats mapped; prompt injection, egress, rights and sandbox boundaries explicit |
| Data/UX | nil/empty/error/stale/concurrent paths and visible states mapped |
| Code quality | verifier/scheduler split and pre-creation owner search required |
| Tests | complete research coverage diagram; eval, integration and chaos gates explicit |
| Performance | long-form evidence, provider cost and bounded concurrency gates explicit |
| Observability | trace IDs, metrics, alerts and runbooks specified |
| Deployment | research-only rollout and rollback specified |
| Long-term | K/OE reversibility 4/5; production authority leakage blocked |
| Design | no immediate UI; later proposal/review flow mapped |
| Engineering | 5 architecture findings plus quality/test/performance review, all resolved in plan |
| Outside voice | unavailable: installed Codex binary returned Windows access denied; no fallback subagent was started |
| Unresolved decisions | 0 within current scope; auto-edit is an explicitly scheduled later checkpoint |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---:|---|---|
| CEO Review | `/plan-ceo-review` | Scope and strategy | 1 | CLEAR FOR K/OE-0 | HOLD SCOPE; model bet and commercial claim gated |
| Codex Review | `/codex review` | Independent second opinion | 0 | UNAVAILABLE | Local Codex executable denied access; no independent output claimed |
| Eng Review | `/plan-eng-review` | Architecture and tests | 1 | CLEAR FOR K/OE-0 | 5 architecture findings; 0 unresolved critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | NOT RUN | No UI in next three research slices; required before Stage 5 |
| DX Review | `/plan-devex-review` | Developer experience | 0 | NOT RUN | Not required for documentation/research-spec slice |

**VERDICT:** CEO + ENGINEERING CLEARED K/OE-0 ONLY. OE-1 requires the frozen reviewed K/OE-0 artifact; OE-2 requires OE-1. No production runtime integration is cleared.

NO UNRESOLVED DECISIONS
