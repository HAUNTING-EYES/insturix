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

The same separation applies to captions, crop/reframe, SFX, music and MG.
The LLM can select, rank, explain and ask for a missing capability.  It cannot
write an unbounded style object, arbitrary raw database mutation or a fake proof.

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
| GPT-5.6 Luna | low-cost graph planner | $1 / $6 | Test structured planning/tool use; do not assume it is the best visual judge. |
| GPT-5.6 Terra | stronger affordable planner | $2.50 / $15 | Compare quality gained per accepted edit, not headline benchmark score. |
| DeepSeek-V4-Flash | very-low-cost text/tool planner | $0.14 cache-miss input, $0.0028 cache-hit input / $0.28 output | Official API confirms JSON/tool calls; keep it on structured evidence unless its exact pinned route proves approved multimodal handling. Privacy/egress approval is mandatory. |
| Gemini 3.5 Flash-Lite | low-cost multimodal observer and planner candidate | $0.30 / $2.50 | Officially accepts text, image, video, audio and PDF; useful for cheap evidence tasks, but must still prove graph quality. |
| Gemini 3.6 Flash | higher-capability multimodal candidate | $1.50 / $7.50 | Compare only where the cheaper candidates fail; do not send ten hours per request. |

Sources: [OpenAI GPT-5.6 launch and
pricing](https://openai.com/index/gpt-5-6/), [DeepSeek model and pricing
documentation](https://api-docs.deepseek.com/quick_start/pricing/), [Gemini
model guide](https://ai.google.dev/gemini-api/docs/latest-model) and [Gemini
pricing](https://ai.google.dev/gemini-api/docs/pricing). Prices and model
aliases are volatile; every run records the exact provider model/snapshot,
region, service tier and retrieved price sheet. GPT-5.6 Sol and other expensive
frontier models may run on a small blinded subset as a quality ceiling, not as
the assumed production route.

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

**Exit:** every active producer, mutation route, renderer and proof path is
known; no pruning decision depends on a filename guess; the two feasibility
spikes have measured input, failure, latency and cost results.

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
- Adapt a focused 30–50-operation slice of existing capabilities into research
  `OperatorSpec` packets; adapters describe existing owners and do not create
  new resolvers or writers.
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

## Current position and next three bounded slices

The code-grounded record later in this document shows that the identified
receipt-hardening sequence progressed through 1-B7. That does **not** complete
the broader plan: IF1 remains deliberately un-wired, the complete editorial
spine and scalable media/evidence exits are not met, the open-ended model bet is
untested, and the caption/transition/MG/audio/B-roll verticals are not certified.

The next three research slices test the load-bearing AI assumption before we
build a production router around it:

1. **K/OE-0 — knowledge map and frozen benchmark specification
   (documentation/fixtures only):** create the official-source coverage and
   rights ledger, `KnowledgeEntryV1` schema, four development tasks, eight
   holdouts, gold target/preservation predicates, a 30–50-operator research
   envelope, provider/privacy matrix, exact price snapshot and locked
   go/modify/no-go thresholds. No provider call and no project mutation.
2. **OE-1 — external planner-only harness:** implement the provider-neutral
   trial record and the first provider adapter in one five-file phase; add each
   additional provider adapter in its own five-file-or-fewer phase. Run Luna,
   Terra, DeepSeek-V4-Flash, Gemini 3.5 Flash-Lite and Gemini 3.6 Flash under the
   same envelopes. Store raw trials, verifier results, cost and latency. Do not
   render, write a project or reuse the production planner as an authority.
3. **OE-2 — isolated verify/render/repair trial:** add the pure
   `GraphVerifier`, mechanical scheduler and proxy executor for the frozen task
   surface. Render only legal candidates, permit one predicate-specific repair,
   run blind editor scoring and publish the `GO`, `MODIFY` or `NO-GO` report.
   It still cannot write ProjectService or become a production runtime.

After OE-2, stop at a mandatory product checkpoint and return to the user to
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
  2C base `7e9b4dd7…`, and freezes only the five IF1 artifact files.  It is not
  an ancestor of this active infrastructure branch.
- The active tree has no `lib/editron/if1` module or runtime import of
  `ProjectServiceIF1RevisionIssuerV1`; therefore the tagged adapter is not
  secretly acting as a live authority.
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

- [ ] **T1 (P1, human ~3d / Codex ~1d)** — K/OE-0 — freeze the knowledge rights/source map, task set, operator envelope and scorecard.
  - Surfaced by: CEO architecture/security and engineering architecture.
  - Files: final/reconciliation docs plus new research fixtures; exact paths are chosen only after the pre-creation owner search.
  - Verify: schema/fixture tests, licence/source review, zero runtime imports.
- [ ] **T2 (P1, human ~1d / Codex ~3h)** — knowledge audit — classify every selected creative-graph record as supported, aspirational, stale or rejected.
  - Surfaced by: engineering finding 4.
  - Files: knowledge audit artifact and selected fixtures; do not rewrite the runtime graph in K/OE-0.
  - Verify: source/support evidence for every selected benchmark entry.
- [ ] **T3 (P1, human ~5d / Codex ~2d)** — OE-1 — implement the provider-neutral trial record/envelope harness and provider adapters in five-file phases.
  - Surfaced by: model bet and provider-coupling findings.
  - Files: research-only modules/tests selected after owner search.
  - Verify: adapter parity, failure tests, trial immutability, zero ProjectService import.
- [ ] **T4 (P1, human ~5d / Codex ~2d)** — OE-2 — implement pure verification, scheduling and isolated proxy execution.
  - Surfaced by: compiler-boundary and false-success findings.
  - Verify: rejection matrix, sandbox/chaos tests, blind eval and GO/MODIFY/NO-GO report.
- [ ] **T5 (P1, human workshop ~2h)** — product — run the promised auto-edit simplification checkpoint after OE-2.
  - Surfaced by: explicit user deferral.
  - Verify: user-approved interaction/authority/conflict scope before Stage 3.
- [ ] **T6 (P1, staged)** — production verticals — resume representative overlay recovery, one family at a time.
  - Surfaced by: current overlay capability gap.
  - Verify: save/reload/render/truthful-proof/undo before catalog growth.

### Execution parallelisation

Conceptually, knowledge/source review and legal media/task preparation can run
in parallel because they touch different evidence. Provider adapters can also
be developed independently after the shared trial contract freezes. However,
the approved operational lane is the existing `editron-worktree` on
`infrastructure-improvs-+Editron`; this review authorises no new worktree.
Within that lane: K/OE-0 must finish first; OE-1 core precedes provider adapter
phases; OE-2 waits for OE-1; the auto-edit checkpoint waits for OE-2. Overlay
runtime recovery remains sequential with research implementation to avoid
shared owner/config/test conflicts.

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
