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
4. The AI reads a compact, cited project view rather than blindly watching every
   frame on every request.  It creates an editorial plan containing proposed
   moments, goals, evidence, alternatives, risk and expected visible changes.
5. A deterministic capability layer checks that each proposed operation is
   supported, allowed by the brand/rights/privacy rules, and safe in the current
   project revision.  The correct owner resolves the concrete form.
6. ProjectService applies the approved, canonical commands atomically and gives
   receipts with revision/undo/replay facts.  The renderer produces preview and
   final media.  Validators inspect the actual rendered frames and audio.
7. The user can accept, reject or steer individual decisions, compare variants,
   comment at a timecode, undo safely, and export delivery packages.

The AI should feel fast and creative.  The execution substrate is strict so a
good-looking demo cannot silently save the wrong project or claim a missing
graphic was delivered.

## How a model makes a specific editing decision

The model is a planner/ranker, not a magic effects engine.  Its decision is
connected to evidence and constrained tools:

```text
User goal + CreativeDirection + project evidence
  -> typed intent proposal with citations and alternatives
  -> Capability Registry: is this supported and permitted?
  -> Resolver: chooses only legal concrete form
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
and benchmark suite rather than a Gemini lock-in.  Benchmark candidate
orchestrators and specialists on our own consented/reproducible project set:
planning quality, citations, tool choice, visual taste, audio judgement,
latency, cost, privacy and failure behaviour.  Keep the same CreativeDirection
and evaluator rules across candidates, so model changes do not change the
product's taste by accident.

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

**Exit:** every future vertical has a stable project-scoped target, timeline
identity and conflict rule.  No overlay may mutate an unofficial intermediate
timeline state.

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

### Stage 3 - intelligence control plane

- Implement `CreativeDirection`, `EditorialPlan`, capability registry, model
  router, prompt/tool isolation, cost budgets and evaluation logs.
- Let the planner propose typed intents with evidence citations, alternatives,
  expected effect and confidence/risk.  It never directly mutates documents.
- Make capability contracts two-layered: a small mandatory safety envelope
  (owner, I/O, state effects, validation, proof, undo/replay, rights and
  policy) plus a family-specific extension.  Manual UI operations use the same
  canonical commands as AI, preserving a manual escape hatch without creating
  a second automatic writer.
- Isolate model lanes and tools by trust.  A model has no raw database,
  network or renderer access; an action guard checks the project, tenant,
  capability, asset and declared permission before invoking a bounded tool.
- Benchmark candidate multimodal orchestrators and specialist models against a
  locked internal eval set.  Version models, prompts, catalog and direction
  with every decision.

**Exit:** model choice is empirically measured; every AI action is auditable,
policy-bounded and only best-effort re-executable when every dependency is
pinned.  An audit record is never misrepresented as a guaranteed replay.

### Stage 4 - consolidate the creative overlay verticals

Admit one vertical at a time only after it has the Stage 1 command/proof path,
the Stage 1.5 editorial target, project direction and rights/evidence bindings,
a review state, and the Stage 3 action guard.  Each vertical then completes the
whole contract:

1. **Captions:** resolver + owned evaluation set + safe UI/chat overrides.
2. **Transitions:** catalog + resolver + direct UI/chat/EDL convergence.
3. **AI-generated MG:** repair stacking, strict delivery receipt, one codegen
   owner; retain SaaS explainer as a separate scoped experience.  Generated
   code executes only in the Stage 0 isolated worker: no network, allowlisted
   packages, immutable inputs/outputs, per-tenant quotas and isolation,
   artifact scanning and CPU/memory/wall-time limits.
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

## Immediate approved implementation slices

These are deliberately small and sequential; each gets its own reviewed,
verified phase.

1. **Overlay authority ledger and MG failure fixtures (read-only mapping plus
   tests):** trace every active MG/text/HTML producer, source, importer,
   mutation owner, renderer and proof consumer; add fixtures proving the
   current z-order and degraded-delivery defects.  Decide the migration
   boundary from facts.
2. **Editorial-spine, command/proof and durable-workflow ADR (design only):**
   specify the project/sequence graph, saved-project migration rule,
   multi-writer CAS rule, visible proof state machine and durable-job record.
   Assess QStash against that contract; no new queue or runtime is introduced.
3. **Canonical caption vertical contract and evaluation data schema:** gated on
   slices 1-2, define the one `CaptionFormResolver`, rights-cleared evaluation
   record, legal data provenance, quality scorecard and chat/UI adapter plan.
   No mass style import and no broad UX migration.

MG code removal comes only after slice 1 identifies exact producer/consumer
edges and a canonical AI-codegen migration path.  This keeps the requested
pruning safe rather than cosmetic.

The TransitionCatalog begins immediately after these slices: first the licence
ledger and contract, then one controlled temporal and one directional entry
with video/image/alpha/audio fixtures.  It is intentionally not allowed to
overtake the editorial spine or proof path.

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
