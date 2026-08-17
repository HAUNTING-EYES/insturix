# Open-ended editing benchmark v2 production correction

- Status: **GOVERNING CORRECTION BEFORE ANY FURTHER MODEL RANKING**
- Recorded: 2026-08-12
- Branch: `infrastructure-improvs-+Editron`
- Authority: `RESEARCH_ONLY_NO_PROJECT_MUTATION`
- Supersedes: the production interpretation and next-step authorization in the
  OE-1/OE-2A results; it does not alter or delete the historical responses.

## Decision in plain language

The completed model run is a useful diagnostic of prompt, schema and provider
failure modes. It is **not an honest test of whether a multimodal model can
understand an editing request, reconstruct a difficult reference and choose an
executable path through Editron**.

No production router will be implemented from its pass rates. In particular,
the system will not assume that native editing, generated composition or a
hybrid should be selected by a fixed operation-count threshold. Operation count
will be tested as one possible routing signal against free model choice and
forced baselines.

The next experiment separates seven questions that the earlier packet mixed
together. A model can pass editorial reasoning while failing exact API
serialization, or correctly report a capability gap while being unable to
render. Those outcomes must never collapse into one number.

## Why the previous executable score is not a production verdict

The `0/45`, `0/45` and `1/45` executable totals remain an accurate report of
the verifier's answer to the packet the models received. They do not establish
that the models cannot plan edits, for the following code-grounded reasons:

1. The model did not receive the original user request or inspect the actual
   reference, source video or audio. It received a pre-digested
   `BehaviourBrief`, including much of the reference decomposition that the
   product hypothesis needs the model to infer.
2. `DEV-02`, the moving-panel reference task, required a low-level native graph
   even though the agreed architecture treats this class as a strong
   `GeneratedCompositionProgram` or hybrid candidate. No generated-composition
   operator was available to the model.
3. The model had to emit exact low-level ports, dependency edges, state-effect
   acknowledgements and preservation statements in one response. That tests
   contract serialization together with editorial planning.
4. Some resolver outputs cannot be connected to the mutation operators using
   the declared types. For example, an opaque `setKeyframesInput` output does
   not satisfy the separately required `overlayId`, `property` and `keyframes`
   inputs. Likewise, `addOverlayInput` does not satisfy the separately declared
   overlay fields. The JSON response schema validates graph shape but leaves
   node inputs open rather than enforcing each selected operator's schema.
5. `C4` deliberately removes task evidence while retaining hidden predicates
   that require that evidence. `DEV-01/C4` withholds its visual product evidence
   but still demands evidence-bound product keyframes. `DEV-03/C4` withholds its
   beat grid but still demands beat-bound cut moves. Those executable trials
   are impossible by construction.
6. Task-level output-token budgets were declared but not enforced. Provider
   adapters used fixed limits instead. The DeepSeek route allowed 16,384 output
   tokens; sixteen calls reached that exact limit, and most of those responses
   were empty or malformed. Finish reason and reasoning-versus-visible token
   usage were not retained, so the artifact cannot distinguish truncation from
   every other empty-response cause.
7. The benchmark offered a narrow research envelope, not Editron's intended
   Adobe-class native capability surface. It therefore cannot support a claim
   that a model selected from all functions a production editor will require.

These defects do not prove that any evaluated model can perform open-ended
editing. They prove that the existing run neither validates nor falsifies that
premise.

## The seven separately scored benchmark stages

Every trial receives seven stage dispositions. A later stage may be skipped
because an earlier stage correctly stopped; it must not be recorded as a
failure merely because no executable graph was appropriate.

| Stage | Question being tested | Model-visible input | Required output | Pass evidence |
| --- | --- | --- | --- | --- |
| **1. Target reconstruction** | Can the model infer the visible, audible and editorial target? | Original user request plus actual reference image/video/audio and available source media or faithful owned proxies. | `ReferenceBlueprintV2`: observable layout, timing, motion, typography, audio relationships, continuity and uncertainty. | Blind comparison with an editor-authored observable target. Technique names are neither required nor sufficient. |
| **2. Operation and execution-form selection** | Can it choose what kinds of work are needed and whether each region should be native, generated or hybrid? | Stage 1 output plus the truthful capability catalog and support status. | `EditorialIntentGraphV2`: ordered/dependent operation families, chosen execution form, alternatives, unsupported needs and reasons bound to evidence. | Required families present, unnecessary/destructive work bounded, unavailable capabilities not invented, and execution-form choice defensible. |
| **3. Evidence and safety binding** | Can it bind the plan to real sources and preservation constraints? | Intent graph plus source identity, source ranges, timebase, beats, dialogue, rights, project revision and policy evidence. | Source/range/evidence bindings, preservation rules, failure dispositions and proof obligations. | Legal ranges and handles, dialogue protection, rights/privacy compliance, revision binding and no unsupported certainty. |
| **4. Exact typed graph compilation** | Can a mechanical compiler lower an accepted intent plan into exact executable ports without making creative decisions? | Stages 2-3 plus per-operator machine schemas. | Fully typed operation graph or a precise compile rejection. | Every required input is typed and connected once, control/data edges are valid, schemas pass, and the compiler invented no operation, source, timing or creative value. |
| **5. Clarification and capability-gap behavior** | Does the system stop truthfully when the request, evidence or implementation is insufficient? | Dedicated ambiguous, impossible, unavailable and policy-blocked cases, plus condition-specific evidence removal. | Clarification, partial-plan boundary, capability gap or refusal with the exact missing requirement. | Zero false success; no fabricated operator/evidence; correct user question or promotion candidate. This disposition is also checked cross-cutting at Stages 1-4. |
| **6. Isolated execution and deterministic proof** | Does the compiled graph actually run and produce the required technical state, image and sound? | Only Stage 4-approved graphs and owned/synthetic media. | Network-denied proxy execution, render, state receipt and deterministic visual/audio checks. | Correct mutation effects, no undeclared effects, expected pixels/audio/timing present, preserved content unchanged, and failures attributed to model, compiler, operator or renderer separately. |
| **7. Blind editor quality and usefulness** | Is the result good enough to use, revise and trust? | Blind outputs with model/provider identity hidden. | Editor scores and pairwise preferences for fidelity, taste, continuity, editability, time saved and hidden-rescue burden. | Predeclared quality and preservation floors, acceptable latency/cost, and no undisclosed manual reconstruction. |

No aggregate may hide a failed stage. Results are published by model, task,
condition, execution form and stage, with denominators and skipped dispositions.

## Honest native/generated/hybrid routing experiment

### The forms being compared

- **Native:** canonical timeline operations and native render atoms remain
  individually editable, inspectable, undoable and interoperable.
- **Generated composition:** an isolated, versioned program uses only the
  allowed composition API to create a bounded audiovisual region with declared
  assets, duration, parameters, markers and resource limits.
- **Hybrid:** native timeline structure owns source ranges, ordering, dialogue,
  music, revisions and surrounding editability; generated compositions own only
  the bounded regions whose layout or motion is better expressed as code.

The full reference-driven reel may contain all three. “Hybrid” is not a fourth
renderer and must never become a second timeline/project authority.

### Why a fixed step threshold is not accepted yet

Step count is not equivalent to representability. A ten-cut montage may be
straightforward native editing, while one request for five unequal, opposing
moving panels may require generated layout code. Conversely, generated code is
not automatically appropriate merely because an edit has several operations;
it can reduce timeline editability, interchange and cheap partial revision.

The benchmark therefore includes the following arms on the same tasks:

1. **Free choice:** the model selects native, generated or hybrid from truthful
   capability and cost evidence.
2. **Forced native baseline:** establishes what native operations can express
   and where complexity or quality collapses.
3. **Forced generated baseline:** establishes render freedom, editability cost
   and needless code-generation risk.
4. **Forced hybrid baseline:** tests whether deliberate decomposition improves
   quality or merely adds coordination overhead.
5. **Threshold ablations:** route tasks using several predeclared operation-count
   thresholds, including the proposed “more than N steps” rule.
6. **Signal ablation:** show step count to the model without enforcing a
   threshold, then remove it, to measure whether it improves decisions.

Each arm is compared on reference fidelity, render success, timeline
editability, compile/repair count, latency, cost, resource use, undo/replay,
interchange impact and blind-editor preference. A threshold becomes policy only
if it generalizes across held-out edit families and materially outperforms free
choice and forced baselines. Otherwise routing remains capability- and
evidence-based.

## Native capability truth and Adobe-class destination

The next catalog must not imply that captions, one transition and a few overlay
operators represent “native editing.” It must inventory all currently callable
operations and label each as certified, live-uncertified, partial, research-only
or missing. The destination includes, at minimum:

- source/record editing, insert/overwrite/replace, lift/extract, ripple/roll/
  slip/slide, tracks, linked selections, takes and multicam;
- keyframes, transforms, opacity, blend modes, masks, mattes, tracking,
  stabilization, retiming and reframing;
- captions, titles, graphics, native overlays and transition families;
- B-roll, dialogue edit, music structure, SFX, mixing, buses, automation,
  restoration and deliverable stems;
- colour management, correction/grade operations, scopes, SDR/HDR and shot
  matching;
- proxy/relink, timecode/reel identity, collaboration, review, interchange,
  conform/reconform, VFX pulls, mastering, QC, delivery and archive.

This is a destination and coverage map, not a claim that those functions work
today. The v2 development tasks expose the representative certified/research
operators required to test graph reasoning plus realistic distractors and
explicit gaps. Missing Adobe-class capabilities remain gaps; a model must not
paper over them with prose.

## Typed plan/compiler boundary

The model should not be required to hand-serialize every runtime port while it
is also making the editorial decision. It emits `EditorialIntentGraphV2`, which
contains semantic operation IDs, dependencies, evidence references, unresolved
choices and the selected execution form.

The deterministic compiler then:

1. resolves each semantic operation to exactly one versioned `OperatorSpec`;
2. validates complete machine-readable input/output schemas;
3. binds values that the model already selected to exact typed ports;
4. adds mechanical data/control edges implied by those bindings;
5. rejects ambiguity, missing inputs, incompatible types or unavailable
   versions.

The compiler may **not** decide that a transition, mask, cut, caption, generated
composition or audio treatment is creatively appropriate. It may not invent a
source range, crop, timing, style, operator, recovery or evidence reference. A
compiler rejection returns to the same model for at most one separately scored
repair during development.

## Fairness and observability fixes required before another paid matrix

1. Every operator has machine-readable per-version input/output schemas and
   typed resolver-to-mutation handoffs; open `inputs` objects are rejected.
2. Every task predicate declares `requiredEvidenceIds` and allowed dispositions
   per condition. **No hidden predicate may require evidence deliberately
   removed by that condition.**
3. The harness enforces each task's output-token, total-token, latency and cost
   budgets. Trial records retain provider finish reason, visible output tokens,
   reasoning tokens when exposed, truncation and parse disposition.
4. The same original request, media hashes, catalog, conditions, budgets and
   scorecards are used across Luna, Terra, DeepSeek-V4-Flash-0731, Gemini
   Flash-Lite and Gemini Flash. Provider-specific repairs are forbidden.
5. Development tasks run before locked holdouts. Use a small cross-model smoke
   run to validate the benchmark mechanics before buying the full repeated
   matrix.
6. Raw model output, normalized plan, compiled graph, verifier result, render
   evidence, cost and human scores remain distinct immutable artifacts.
7. A failed port or renderer is attributed to the contract/compiler/runtime,
   not silently counted as failed editorial understanding.

## Music, beat-sync and SFX ordering retained as explicit debt

### Intended production order

Dialogue and music analysis happen before and during picture editing because
speech ranges, beat/downbeat/phrase structure and energy affect cut and montage
timing. Boundary moves must preserve source handles and protected speech.

Most SFX selection happens after picture timing is stable:

1. cuts, actions, transitions and generated compositions emit semantic events;
2. each event is anchored to its owning operation and local time, not only an
   absolute frame that will become stale;
3. the SFX resolver retrieves or generates candidates from the final scene;
4. candidates and deliberate silence are judged against picture, dialogue and
   music;
5. the mixer owns final asset, placement and level;
6. rendered proof establishes audibility without clipping or masking speech.

A generated composition may emit cues such as `panel-entry` or `exit-impact`.
It does not own the chosen sound or mix. High-impact transitions may be designed
with provisional sound, but final selection follows stable picture timing.

### Current code discrepancy

The chat analysis route fetches and decodes audio into PCM before calling the
buffer-based beat analyzer. `chat-beat-sync.ts` can then load measured evidence,
project beats onto the timeline, protect caption/speech boundaries, reject
moves without source handles and commit with stale-project conflict handling.

`five-track-analysis.ts`, by contrast, passes an audio URL string cast as the
decoded buffer expected by `analyzeBeatsFull`. Invalid-buffer handling returns
empty beat evidence, after which the caller uses roughly `120 BPM` when no BPM
was measured. The result is shared downstream plumbing, **not unified beat
analysis**.

This remains a later production repair with these acceptance tests:

- one canonical decoded-audio/beat-evidence owner for every caller;
- no URL-to-buffer cast and no silent fabricated tempo;
- explicit `UNAVAILABLE`/low-confidence disposition when evidence is absent;
- cache identity bound to media/version/analyzer version;
- multi-clip mutation through the canonical revision/receipt boundary;
- safe undo/replay and rendered timing/audio proof.

Until those exits pass, beat-sync remains `LIVE_MULTIWRITE_UNCERTIFIED`. The SFX
human-label pilot and SFX catalog work do not certify this caller.

## Next three bounded research slices

### V2-0 — repair and freeze the experiment

Documentation/fixtures/tests only. Define the seven stage contracts,
`ReferenceBlueprintV2`, `EditorialIntentGraphV2`, execution-form arms,
condition-aware predicates, typed operator schemas, budget telemetry and frozen
scorecards. Include a research-only `GeneratedCompositionProgram` operator. No
provider call, renderer invocation or project write.

### V2-1 — tiny end-to-end smoke

Use owned/synthetic media for one difficult reference task, one multi-operation
native task, one audio/video task and one honest capability-gap task. Run one
attempt per model/arm only. Its purpose is to prove that all seven stages,
budgets, typed compilation, render attribution and artifacts work. Do not rank
models from this smoke.

### V2-2 — repeated development matrix and locked decision

Only after V2-1 mechanics pass, run repeated comparable development trials,
then the untouched holdouts. Publish stage-separated scores, routing ablations,
quality/cost/editability results and the explicit `GO`, `MODIFY` or `NO-GO`
decision. A `GO` authorizes design of a production integration slice; it does
not itself authorize model-driven ProjectService mutation.

## Non-authorization

This correction does not authorize production model mutation, a second
project/timeline owner, unrestricted web research, internet-derived capability
installation, auto-edit redesign, overlay catalog expansion or Adobe-class
replacement claims.

## Related evidence

- [Historical OE-1/OE-2A results](oe1-development-benchmark-results-2026-08-12.md)
- [Final execution plan](../../EDITRON_FINAL_EXECUTION_PLAN_2026-08-10.md)
- [Reference backtracking and GeneratedCompositionProgram](../../EDITRON_REFERENCE_BACKTRACKING_AND_GENERATED_COMPOSITION_PROGRAM_2026-08-11.md)
- [Open-ended editing research reconciliation](../../EDITRON_OPEN_ENDED_EDITING_RESEARCH_RECONCILIATION_2026-08-12.md)
- [`provider-development-runner-v1.ts`](../../../lib/editron/research/open-ended-planner/provider-development-runner-v1.ts)
- [`operator-specs-v1.json`](../../../tests/fixtures/editron/open-ended-planner-v1/operator-specs-v1.json)
- [`development-tasks-v1.json`](../../../tests/fixtures/editron/open-ended-planner-v1/development-tasks-v1.json)
- [`five-track-analysis.ts`](../../../lib/editron/services/five-track-analysis.ts)
- [`chat-beat-sync.ts`](../../../lib/editron/services/chat-beat-sync.ts)
- [`analyze-beats` route](../../../app/api/services/editron/audio/analyze-beats/route.ts)
