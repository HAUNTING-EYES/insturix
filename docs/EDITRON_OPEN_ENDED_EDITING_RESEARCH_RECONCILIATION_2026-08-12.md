# Editron open-ended editing research reconciliation

Date: 2026-08-12

Status: architecture decision and experiment gate; no runtime implementation

Approved lane: `editron-worktree` / `infrastructure-improvs-+Editron`

## Executive decision

The new research does **not** solve open-ended editing graph construction.
It turns graph construction into a precise, falsifiable product bet:

> Given a gold observable target, the relevant project evidence, a bounded set
> of typed editing operators and post-production principles, can a frontier
> multimodal model propose an executable multi-operation graph, repair it after
> compiler/render feedback and do so reliably enough for production?

That is materially better than saying that a model "understands editing," but
it remains an unproved hypothesis. The deterministic compiler does not invent
the graph. The renderer does not invent the graph. A technique catalog does not
make the system open-ended. In the near-term experiment, the model is the graph
proposer; everything around it constrains, measures and falsifies its proposal.

Therefore:

1. Do not build `EditorialTechniqueLibrary` as the competence boundary.
2. Do not wire the research contracts into the live planner yet.
3. Preserve the completed ProjectService, receipt, proof and stale-write work.
4. Build an external, non-canonical battle-test harness before Stage 3's
   production intelligence control plane.
5. Run a template-free condition. If no model clears the locked thresholds,
   narrow the product claim or change the operator/evidence surface; do not hide
   the failure behind more prompts or a larger technique list.
6. Treat known techniques and approved programs as optional memories and fast
   paths. They improve speed and consistency but never define the limit of what
   the planner is allowed to attempt.

## Sources actually reviewed

The complete paragraph and table content of every DOCX below was extracted and
read. The supplied pasted brief was also read completely and compared with the
DOCX brief; it is substantively the same brief with formatting differences.

| Research artifact | SHA-256 |
|---|---|
| `CODEX BRIEF — EDITRON OPEN-ENDED EDITING + LONG-FORM EDITORIAL ORCHESTRATION.docx` | `E1782AA6D7E9474899B06351DD1634ED29005933DEF791D79C7A32FB00C79ADE` |
| `Editron_01_Near_Term_Open_Ended_Editing_Architecture.docx` | `E24E200E5680A460434E22A759DF2F61A27404964E4F31A58C07742D9CFE082F` |
| `Editron_02_Complex_Edit_Planner_Battle_Test_Protocol.docx` | `D2FEEA97F0A76A08B71DE5529ABA65B3B07BF03894B95CC4AAC76DFEC42E8EAB` |
| `Editron_03_Blackmagic_Claude_Research_and_Implications.docx` | `7ACA8C60D6783E58F5809B57A94A0628DF50B7315873FFBC4B9C5292B5679965` |
| `Editron_04_Long_Term_Learning_and_Self_Improvement_Roadmap.docx` | `7158E927706E831F2D162FD66E6BBEE737F0F0E1A33C6D8558903B165EB148C5` |
| `Editron_05_Construction_and_Deployment_Behaviour_Architecture.docx` | `77F9E82E4E02388E27890BD6A6ED4D41C3FAD409443760C4063CBF610179BB41` |

The environment did not contain LibreOffice/`soffice`, so page rendering and a
visual layout inspection of the DOCX files were unavailable. This does not
limit the architecture reconciliation, which used all document text and
tables, but it is not a claim that the DOCX page layout was visually approved.

The current master plan and generated-composition plan were read completely,
then the live producer, registry, executor, model, reference-analysis,
continuity, upload and ProjectService paths were inspected in code.

## The graph-construction problem, stated honestly

The sentence "reconstruct the target and synthesise an editing program" is a
product objective. It is not the algorithm. The concrete near-term algorithm
has five separate owners:

```text
observer -> gold/derived BehaviourBrief
model planner -> candidate operation graph
deterministic compiler -> legal or rejected graph
isolated executor -> preview media
comparators + hard validators -> evidence for accept, repair or decline
```

Only the model planner invents a candidate graph. The other four stages stop it
from getting away with an invalid or bad graph.

### 1. BehaviourBrief: state what the result must do

A `BehaviourBrief` must be observable and testable. It is not a technique name
and not a prose mood board. For a difficult portal-to-typography reference it
might contain:

```text
input range: exact source frames and project snapshot
preserve: foreground subject identity, dialogue, untouched timeline regions
target state A: subject silhouette is isolated at frame F0
target state B: the isolated region expands along measured boundaries
target state C: live image is replaced by typography inside that region
target state D: transition completes at frame F1 without a black/frozen frame
target state E: audio remains continuous across F0..F1
hard tolerances: frame range, alpha holes, safe zones, flash ceiling, loudness
soft goals: perceived continuity, brand fit, reference similarity
```

For reference-driven work, this brief is derived from measured observations.
For the planner-only battle test, humans provide it as gold input so perception
errors cannot be confused with graph-synthesis errors.

### 2. Operator surface: expose what Editron can actually execute

The planner receives a focused slice of an operator catalog, not a list of
Adobe menu names. Each operator declares at least:

```text
operator ID and version
typed inputs and outputs
hard preconditions
project and media effects
facts it preserves and invalidates
supported ranges, regions, tracks and media forms
cost and latency class
failure dispositions
undo/replay behavior
proof obligations
certification status
```

Example operators might be `TrackSubject`, `BuildMask`, `InvertMask`,
`ApplyRegionalGrade`, `AnimateTransform`, `CompositeLayers` and
`RenderPreview`. These declarations establish legal dataflow. They still do
not tell the planner which operators solve a new target.

### 3. Candidate graph proposal: this is the unproved model bet

The model reads the BehaviourBrief, focused operator specifications, relevant
project evidence and post-production principles. It returns one or more typed
DAG candidates with:

```text
node IDs and operator versions
input bindings
output bindings
ordering/data dependencies
which target predicate each node helps satisfy
assumptions and missing evidence
expected cost and expected failure risks
```

For "keep the person natural, make the background teal, move the person to the
centre," a valid proposal could bind:

```text
source -> TrackSubject -> BuildMask
source + inverse(mask) -> ApplyRegionalGrade
source + mask -> AnimateTransform
graded background + animated subject -> CompositeLayers
composite -> RenderPreview
```

Nothing deterministic in the current proposal discovers that decomposition.
We are testing whether a strong model can do it from the target and operator
semantics, including when no named technique or graph template is supplied.

### 4. Compiler: reject; never pretend to be creative

The compiler checks:

- every required input is bound to a compatible output or project fact;
- every range, track, region and asset belongs to the snapshot;
- the graph is acyclic;
- state effects and invalidations are declared;
- parallel nodes do not make conflicting writes;
- required preservation and proof obligations are still achievable;
- unsupported, uncertified or policy-forbidden operators are not silently used.

It may make mechanical repairs such as inserting a declared format conversion
or resolving an unambiguous port. It may not invent the missing editorial plan.
A planner graph that needs conceptual replacement is returned as a planner
failure, not counted as compiler success.

### 5. Render and compare

The top legal candidate or small number of candidates renders against an
immutable project snapshot in an isolated environment. Hard predicates are
checked deterministically where possible. Multimodal judges and humans score
semantic/reference/taste qualities. Hard failures cannot be overruled by a
judge's confidence.

The model receives a bounded failure packet such as:

```text
predicate P3 failed: alpha leak at frames 41..47
predicate P5 failed: dialogue discontinuity of 180 ms
preservation violation: foreground saturation changed by 14%
```

It may patch the graph or parameters for a small number of attempts. A repair
must keep the original BehaviourBrief and preservation constraints. Exhausting
the budget produces `DECLINED` or `NEEDS_REVIEW`, never false success.

### 6. What would count as proof that this bet works

Not one impressive demo. The gate needs repeated held-out results:

- valid graph before repair;
- valid graph after bounded repair;
- target-predicate pass rate;
- preservation violation rate;
- false-accept and false-success rate;
- render success and defect rate;
- editor preference against a strong baseline;
- latency, token, provider and render cost;
- template-free performance;
- stability across multiple trials and model versions.

If the model cannot reliably propose graphs from the template-free condition,
the honest conclusion is that open-ended autonomous planning is not ready. We
can still ship certified known families and user-reviewed experimental edits.

## What an editorial-technique system would actually do

The old plan made `EditorialTechniqueLibrary` sound like an external competence
layer. That strategy is flawed as the central solution because a finite library
can only retrieve decompositions somebody already entered.

A technique record can still be useful, but only as **optional memory**:

```text
memory ID and version
semantic description of the observed before/after behaviour
conditions under which it previously worked
approved program/DAG and operator versions
actual render/proof outcome
known failure cases
rights and project-scope restrictions
certification and deprecation state
```

It has three legitimate jobs:

1. **Certified fast path.** A known caption, transition or match-cut workflow
   can reuse an approved program when its preconditions match.
2. **Planner warm start.** A semantically similar past program can be supplied
   as evidence, while the planner remains free to modify or ignore it.
3. **Evaluation baseline.** A newly synthesised graph can be compared with the
   known program for cost, quality and preservation.

It must not have these jobs:

- converting user words to a technique only when an alias string matches;
- declaring that all possible edits are a finite set of named techniques;
- licensing an unsupported primitive;
- replacing operator validation, preview proof or ProjectService;
- making template retrieval count as proof of open-ended synthesis.

### Aliases, explained without handwaving

An alias is only search metadata: for example, "J-cut," "audio lead" and
"sound precedes picture" may help retrieve related knowledge. Runtime intent
must not depend on the user's sentence containing one of those strings.

Retrieval uses the full user request, reference observations and target
behaviour. Semantic retrieval may find a relevant memory even when no term is
shared. The planner then checks the memory's observable result and
preconditions. If it does not fit, it is discarded. Aliases improve recall;
they are neither classification authority nor execution logic.

### Unknown terms and unknown behaviours

If a user requests an unknown term, the runtime does not download code or
silently install a capability. It asks the model to express the requested
before/after behaviour, then checks whether current operators can express it:

```text
unknown term/request
  -> observable BehaviourBrief
  -> focused operator retrieval
  -> candidate graph synthesis
  -> compile and preview as EXPERIMENTAL
  -> user/editor approval or honest decline
```

If the current operators cannot express the target, the system creates a gap
record naming the missing primitive/evidence/validator. A separate reviewed R&D
workflow may research it and add a new operator. Web search can provide cited
knowledge; it never becomes runtime authority merely because a model found it.

## Current repository truth

The research architecture is not secretly present under different names.
Searches across `lib`, `app`, `components` and `tests` found no runtime types
named `BehaviourBrief`, `OperatorSpec`, `ConstructionBehaviour`,
`DeploymentBehaviour`, `GeneratedCompositionProgram`,
`EditorialTechniqueLibrary` or `ProgramMemory`.

| Area | Code-grounded current state | Reconciliation |
|---|---|---|
| Canonical mutations | `ProjectService` issues `ProjectMutationReceiptV1` and contains the hardened save/proof/MG-delivery paths. | Reuse. Do not create a second writer, revision or receipt authority. |
| Chat tools | `chat-tool-registry.ts` declares owner/evidence/execution policy/postconditions for fixed chat tools; Gemini export is capped at 64 declarations. | Useful seed for operator adapters, but it is not typed media dataflow or a general graph compiler. |
| Editorial-intent input | `chat-editorial-intent-wire.ts` exposes six fixed families: captions, MG, zoom, transitions, SFX and music. | Closed family preference wire, not open-ended planning. |
| Current decision catalog | `decision-registry.ts` contains 58 entries that map fixed brief decisions to fixed EDL types. Its header claims a new feature needs no code changes. | That claim is false for a new behaviour: an executor/operator/resolver still has to exist. |
| Current planner/merge | `unified-decision-bundle.ts` licenses, scores, deduplicates and merges fixed `ReactiveEditDecision` families. | Valuable recovery/calibration work; not arbitrary DAG synthesis. |
| Current execution | `edl-executor.ts` dispatches fixed decision types through a large `switch`, then invokes family-specific paths. | Closed-world executor; it cannot execute a novel graph node merely because a registry entry exists. |
| Project-wide placement | Director/creative-brief paths select fixed decision families under budgets, gaps and evidence rules. | Partial placement machinery, not the research `DeploymentBehaviour` owner. |
| Reference transfer | `style-transfer-service.ts` reduces a reference to coarse `EditDNA` buckets; `derive-edit-dna.ts` explicitly fills unobservable fields from defaults. | Useful compatibility path; inadequate for reconstructing a difficult reference event or its placement logic. |
| Match cut | `continuity-service.ts` uses description-token Jaccard, a short subject list and shot-type words, with a `>0.7` threshold. | Partial label/adjacency plumbing, not source search, phase alignment, render comparison or match-quality proof. |
| Creative knowledge graph | `graph-query.ts` indexes fixed signals, mappings, techniques, constraints and constants. | Advisory post-production knowledge and current fixed mappings; not execution or proof authority. |
| Models | Live core paths are Gemini-centred; chat owner classification has a narrow Kimi alternative. | There is no provider-neutral planner/router/evaluation plane yet. |
| Long-form limits | Presigned upload is capped at 3 GB; Alyzitron upload/YouTube analysis is capped at 55 minutes/1 GB; music conditioning/inspection is capped at 600 seconds; public asset metadata permits up to 6 hours. | Limits are inconsistent and do not form a global long-form contract. Ten-hour operation is not currently supported end to end. |
| Sequence reuse | Search found local duplicate/repetition guards and taste penalties, but no project-wide intent-aware source-range reuse policy or joint B-roll sequence optimiser. | New design required; do not turn "avoid repetition" into a universal hard rule. |

### Already solved or worth preserving

- ProjectService stale-write/CAS and writer-receipt hardening.
- Chat checkpoint, undo and proof-lifecycle work.
- Director proof receipt and MG delivery receipt work.
- Evidence retrieval and current fixed tool contracts.
- Storyline coverage/feasibility and source-range identity pieces.
- Reference fingerprint observations and deterministic dense-cut evidence.
- MG sandbox, render and judge components that can be hardened and reused.
- Brand Vault, rights-aware SFX work and human calibration infrastructure.

### Missing or only partial

- provider-neutral model routing and locked comparative evaluations;
- focused typed media/operator dataflow contracts;
- a candidate-DAG compiler separated from the model;
- construction-versus-deployment behaviour evidence;
- a hierarchical long-form source/project evidence map;
- intent-aware sequence optimisation and deliberate reuse;
- a networkless production generated-composition sandbox;
- end-to-end difficult-reference proof through ProjectService;
- professional mask, tracking, colour, audio and NLE primitives needed by hard
  graphs even when the model plans them correctly.

## ConstructionBehaviour and DeploymentBehaviour

This split is the strongest addition in the new pack.

`ConstructionBehaviour` answers: **what happens locally inside the edit?**

```text
inputs and exact source windows
before state
after state over time
spatial/temporal relationships
preserved content
required operations/evidence
local proof predicates
```

`DeploymentBehaviour` answers: **why is that edit placed here, and why not at
another plausible moment?**

```text
narrative function
setup and payoff
beat/section/dialogue context
allowed repetition or motif role
density and recency state
negative placement examples
whole-sequence consequence
```

A beautiful construction at the wrong moment is a failed edit. Therefore the
benchmark must test placement separately: offer one approved moment and one
plausible-but-wrong moment with similar local signals. A constructor cannot
promote its own output into the timeline. The project/director placement owner
selects the opportunity; the constructor proposes how to realise it.

This does not require separate project authorities. Both results become
evidence for one canonical apply command issued through ProjectService.

## Deliberate B-roll and source-range reuse

Repetition is sometimes a defect and sometimes the edit's meaning: a motif,
recap, callback, before/after comparison, flashback, evidence reminder, chorus,
running joke or continuity bridge may intentionally reuse the same source.

Therefore repetition cannot be one global penalty. Each opportunity needs a
reuse intent:

```text
ReuseIntent = FORBID | NEUTRAL | PREFER | REQUIRE
ReuseRole = motif | recap | continuity | callback | flashback | evidence |
            comparison | chorus | none
identity level = exact range | overlapping range | same shot | same subject |
                 same composition
evidence = user request | reference recurrence | script structure |
           prior approval | none
```

Hard rights, handle and technical failures remain hard failures. Everything
else enters a joint sequence objective:

```text
reuseCost = fatigue
          + adjacencyClutter
          + missedCoverage
          - motifBenefit
          - continuityBenefit
          - recallBenefit
          - explicitUserOrReferenceBenefit
```

Consequences:

- `FORBID` can reject exact reuse when the user/brief requires unique coverage.
- `NEUTRAL` allows reuse and scores it on sequence consequence.
- `PREFER` rewards recurrence while still checking spacing and legibility.
- `REQUIRE` treats failure to reuse the identified range/subject as a target
  failure.
- "same source" is not enough identity: two non-overlapping shots from a long
  interview are different coverage, while the exact same three seconds are an
  exact recurrence.

The optimiser selects the whole assignment, not the highest independent score
per slot. An initial implementation may use beam search over role order:

```text
beam = [empty sequence]
for each role:
  expand every surviving sequence with each legal candidate
  update semantic, continuity, dialogue, rights and reuse features
  discard hard-invalid sequences
  keep the best B diverse sequences
return best sequence plus close alternatives and feature evidence
```

`B` is an experiment parameter, not a permanent taste constant. The held-out
set must include both accidental repetition and deliberate recurrence so the
system cannot improve one by destroying the other.

## Making the pipeline fast enough for long footage

Running dense perception, large-model ranking and multiple renders across ten
hours for every edit would be unusable. The real optimisation is a cached
cascade, not a faster prompt.

### One-time ingest/index path

1. Preserve immutable master identity and create relinkable proxies.
2. Compute shot/audio boundaries and cheap features once.
3. Store exact range-addressed observations with extractor/model versions.
4. Build text, visual, audio and geometry indexes.
5. Invalidate only observations affected by a changed source or newer analysis
   version; timeline edits do not re-analyse immutable masters.

### Per-decision retrieval path

1. Scope to eligible tenant/project assets and rights.
2. Use cheap metadata and hard constraints before any expensive model call.
3. Query approximate-nearest-neighbour indexes to retrieve an initial top set.
4. Run a lightweight reranker over roughly tens of candidates.
5. Densely inspect only the best few exact windows.
6. Let the expensive planner/judge see only those evidence packets, not ten
   hours of video.

The research's example values—roughly top 50 coarse candidates and dense
inspection of top 3–5—are starting measurements, not production constants.
For each content class we must plot candidate recall against latency/cost and
choose the smallest cascade that preserves the approved range.

### Per-plan execution path

- Generate one candidate for simple/high-confidence tasks; generate a small
  portfolio only when complexity or uncertainty justifies it.
- Compile every candidate before rendering; compilation is cheaper.
- Proxy-render only the top one or two legal candidates.
- Render independent candidate windows in parallel within tenant quotas.
- Repair only the failed predicate/node; do not restart observation and source
  retrieval when their versioned evidence is still valid.
- Cache BehaviourBriefs, source assignments, compiled plans and render inputs
  by content/version hash.
- Stop early when hard predicates pass and the score clears the calibrated
  acceptance margin; ask for review when alternatives are too close.

### User concurrency

Analysis and preview jobs read a project revision and exact intended change
set, while the user continues playing and editing. At apply time:

- unchanged revision: apply through ProjectService;
- newer, provably disjoint edits: revalidate a command against the current
  revision;
- overlapping edits: `NEEDS_REBASE_OR_REVIEW`;
- stale generated code never merges or writes by itself.

Ten hours is a scale target for the same global infrastructure, not a separate
"ten-hour mode" and not a product profile. Short projects use the same source
identity, index, planner, apply and proof contracts; their indexes and job
graphs are simply smaller.

## The required battle test

### P1: isolate graph synthesis

Use a gold `BehaviourBrief`, gold local source/effect evidence and a frozen set
of 30–50 typed operators with realistic distractors. Require a roughly 10–15
operation solution for the hero case. Test at least these conditions:

```text
A: tool names + shallow descriptions
B: full OperatorSpecs
C: OperatorSpecs + post-production principles
D: C + optional similar program memory
E: C with no technique names or graph templates
F: ablations with missing/noisy evidence and distractor operators
```

Condition E is essential. If only D works, Editron has retrieval-assisted known
editing, not open-ended synthesis.

### P2–P5: add one uncertainty at a time

- P2: raw reference -> gold project evidence.
- P3: raw reference -> project evidence -> compile/render/repair.
- P4: ambiguous chat requests and honest clarification/decline.
- P5: autonomous placement, construction and local execution together.

Do not begin with P5; its failures cannot tell us whether observation,
retrieval, planning, missing primitive, runtime or judging was responsible.

### Trial and scoring rules

- Keep tasks, operator versions, media and judges locked.
- Run at least five trials per model/condition for the initial screen.
- Record every model response, tool packet, compiled graph, repair and render.
- Use executable validators for topology, types, predicates and preservation.
- Blind human/editor review for actual editorial quality.
- Report confidence intervals and failure categories, not only an average.
- Use separate model roles when evidence shows a specialist wins; do not force
  one provider to observe, plan, code, judge image and judge audio.

### Go/modify/no-go decision

`GO`: at least one provider route clears locked validity, preservation,
false-accept, quality, latency and cost thresholds template-free.

`MODIFY`: failures cluster in the evidence/operator surface and a bounded
change can be retested without changing the task.

`NO-GO`: success depends on templates, human rescue or unbounded repair, or
false-success remains unsafe. Continue certified known-family work instead of
pretending general synthesis is solved.

## Model facts and routing

The research pack's model roster is plausible as an experiment list, not a
winner declaration. Official sources currently confirm:

- GPT-5.6 Sol/Terra/Luna are API-accessible tiers and support agentic tool use;
- Gemini 3.1 Pro Preview accepts text, image, video, audio and PDF and supports
  structured output/function calling with a one-million-token input limit;
- Claude Fable 5/Mythos 5 exist and have current availability history;
- Kimi K3 exists, but the live Editron Kimi adapter is only a narrow owner
  classifier, not a multimodal planner route.

General coding or tool-use benchmarks do not answer the Editron question.
VEBench itself reports a significant human gap in editing cognition, and
CoVEBench reports omitted edits and preservation violations in compositional
video editing. Editron must run its own locked operational benchmark.

Primary references:

- [OpenAI GPT-5.6 launch](https://openai.com/index/gpt-5-6/)
- [Gemini 3.1 Pro Preview model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview)
- [Anthropic Claude Fable 5 and Mythos 5](https://www.anthropic.com/news/claude-fable-5-mythos-5)
- [Kimi K3 technical blog](https://www.kimi.com/tr/blog/kimi-k3)
- [VEBench](https://arxiv.org/abs/2605.03276)
- [CoVEBench](https://arxiv.org/abs/2606.08415)

## Integration into the master programme

This work is a gate inside the larger Adobe-class plan, not a replacement for
it.

1. Continue P0 safety, canonical mutation and truthful proof hardening.
2. Do not wire IF1 until its already documented re-entry conditions are met.
3. Add the open-ended planner battle test before production Stage 3 model
   control-plane implementation.
4. In parallel, continue recovering one real overlay vertical at a time;
   models cannot plan primitives that do not work.
5. If the experiment passes, productionise only the minimum proven
   `BehaviourBrief`, operator-adapter, candidate-DAG and compiler contracts.
6. Add Construction/Deployment behaviour evidence after the P1 planner result,
   then run placement tests.
7. Treat GeneratedCompositionProgram as one first-class operator family for
   unique composites, not the universal executor and not an MG-only fallback.
8. Add program memory only after real approved outputs exist; never pre-fill a
   finite technique ontology and call it intelligence.
9. Long-term self-improvement may rank or retrieve approved programs, but no
   model may promote its own program, alter validators or bypass proof.

## Immediate next three implementation slices

These are the next three slices for this research path only. They do not
supersede the active safety and overlay-recovery order.

### OE-0 — frozen battle-test specification

Documentation/fixtures only. Select the legal hero media, freeze the gold
BehaviourBrief, target predicates, preservation constraints, 30–50 operator
specifications, distractors, conditions A–F and scoring thresholds. No live
planner or ProjectService wiring.

### OE-1 — external planner-only harness

Build a non-production harness that sends the same frozen packets to several
providers, validates returned DAG JSON, runs no project mutation and stores all
trials/cost/latency/failures. Include the template-free condition from day one.

### OE-2 — isolated compile/render/repair trial

Add deterministic compilation and a sandboxed proxy renderer for the hero
case. Limit repair attempts, compare target/preservation predicates and produce
the go/modify/no-go report. It still must not become a second runtime or write a
project.

Only a passing OE-2 authorises a proposal to integrate a general graph planner
into the production architecture.

## Non-negotiable ownership rules

- ProjectService remains the sole project mutation/revision/receipt owner.
- The existing family resolver remains the sole final-form owner where one is
  certified.
- A planner proposes; it does not mutate or prove.
- A compiler validates; it does not claim editorial intelligence.
- A generated program executes with no network/secrets/database/ProjectService.
- A judge scores; it cannot waive hard constraints.
- Program/technique memory advises; it cannot license missing capability.
- Research harness records are not production receipts.
- PASS, FAIL, UNVERIFIABLE, NEEDS_REVIEW and DECLINED remain distinct.

## Final architecture statement

Editron's open-ended thesis is now precise:

> Editron may use frontier multimodal models to propose new editing programs
> from observable targets and typed operators. Known programs are reusable
> memories, not a closed list of allowed creativity. Deterministic compilation,
> isolated rendering, preservation checks, editorial evaluation and one
> canonical ProjectService apply path decide whether a proposal is safe and
> real. The thesis is accepted only after template-free held-out experiments
> prove it; until then it is an R&D bet, not a production capability claim.
