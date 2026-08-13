# Editron V2 reference understanding, evidence policy and routing programme

Date: 2026-08-14

Branch: `infrastructure-improvs-+Editron`

Status: normative research addendum before the corrected V2-1G provider smoke

Authority: `RESEARCH_ONLY_NO_PROJECT_MUTATION`

This addendum refines, and where stated supersedes, the reference and routing
sections of:

- `oe-v2-target-reconstruction-and-routing-contract-2026-08-13.md`;
- `EDITRON_EVIDENCE_SUFFICIENCY_AND_VIBE_EDITING_CONTROL_LOOP_2026-08-13.md`;
- `EDITRON_FINAL_EXECUTION_PLAN_2026-08-10.md`.

It does not make the current runtime production-ready and does not authorise a
model to mutate a project.

## Decisions frozen by this addendum

1. A reference is first captured completely enough to describe its material
   visual and audible behaviour. Capturing a feature does not automatically
   require copying that feature into the output.
2. Reference observation and reference application are different artifacts.
   The first records what exists; the second combines those observations with
   the user's requested fidelity, rights and project constraints.
3. Reference understanding uses four layers: global editorial language,
   recurring design grammar, bounded hero moments and content-literal details.
4. `HARD | SOFT` is too coarse for the production contract. Normative
   obligation and graded salience/fidelity/confidence are separate dimensions.
5. Evidence policy is a versioned, calibrated requirement contract. It is not
   a prompt, a model confidence threshold or a universal list of sample rates.
6. Models may propose target claims and candidate forms. Provider-neutral code
   owns hard eligibility, evidence sufficiency, authority, revision safety and
   proof gates.
7. Native/generated/hybrid routing is a coverage-and-eligibility decision, not
   a keyword classifier and not an operation-count threshold.
8. The moving filmstrip is a generated composition island. The complete event
   reel is hybrid because native editorial, audio, colour and delivery surround
   that island.
9. Generated-program repair budgets are selected from measured 0/1/2/4/8
   repair curves and explicit service-level/cost limits. Neither 1-3 nor 50 is
   adopted as dogma.
10. A 15-minute aggregate reference allowance is an initial product guardrail,
    not permission to reduce every reference to one-frame-per-second evidence
    and not a permanent architecture limit.
11. Missing mandatory evidence returns `UNVERIFIABLE`, `NEEDS_REVIEW`, a
    precise clarification request or a named capability gap. The system never
    substitutes a weaker result while reporting success.

## The two-artifact reference contract

### `ReferenceObservationMapV1`: what is actually in the reference

This artifact is independent of what Editron later chooses to reproduce. It
records four layers.

#### Global editorial language

Behaviours distributed across substantial parts of the reference:

- story and energy progression;
- shot-length distribution and change through sections;
- music/dialogue relationship and cut-to-audio behaviour;
- framing, crop and shot-scale tendencies;
- colour, contrast and texture tendencies;
- typography behaviour;
- transition and effect density;
- information density and breathing room.

#### Recurring design grammar

Recognisable rules or motifs that recur at several evidenced moments:

- title appearances after phrase changes;
- flashes restricted to major impacts;
- a recurring alternation of shot types;
- repeated word-emphasis behaviour;
- recurring gutters, borders, crops or motion relations.

Recurrence is not inferred from one instance. The observation stores every
supporting range and the counter-ranges where the rule did not occur.

#### Bounded hero moments

Local constructions that appear once or a few times but materially affect the
reference's identity:

- a moving filmstrip or relational mosaic;
- a custom opening reveal;
- an unusual title sequence;
- a photo wall that becomes live footage;
- a distinctive audiovisual transition.

The filmstrip is not treated as the reference's global style merely because it
is memorable. It is a bounded hero moment with its own states, events,
geometry, typography, motion and continuity evidence.

#### Content-literal details

People, logos, exact words, products, locations, music, footage or other
copyright/identity-bearing content. These observations are needed to avoid
accidental copying and to detect explicit user requirements. The default is
`DO_NOT_COPY` unless the user owns or has licensed the content and explicitly
requires it.

### `ReferenceApplicationPlanV1`: what should influence this project

The application plan combines the observation map with the user's instruction,
project brief, rights, available media and delivery requirements. Every
material observation receives a disposition:

```ts
type ReferenceApplicationDispositionV1 = {
  observationRef: string;
  obligation: "MUST" | "SHOULD" | "MAY" | "MUST_NOT" | "UNRESOLVED";
  applicationScope: "GLOBAL" | "SECTION" | "MOMENT" | "NONE";
  targetRangeOrSectionRef: string | null;
  referenceCoveragePermille: number;
  prominencePermille: number;
  userEmphasisPermille: number;
  fidelityWeightPermille: number;
  evidenceConfidencePermille: number;
  rightsDisposition: "CLEARED" | "TRANSFORM_ONLY" | "DO_NOT_COPY" | "UNKNOWN";
  rationaleEvidenceRefs: string[];
};
```

The five numeric fields are integers in the inclusive range `0..1000` and are
deliberately separate:

- `referenceCoveragePermille`: how much of the reference supports the
  observation;
- `prominencePermille`: how visually/audibly salient it is;
- `userEmphasisPermille`: how directly the user asked for it;
- `fidelityWeightPermille`: how strongly it should influence ranking among
  already legal candidates;
- `evidenceConfidencePermille`: how well the observation is supported.

They do not override obligation. A high-salience copyrighted logo remains
`MUST_NOT`; a direct user requirement remains `MUST` even when it occupies only
one second. `UNRESOLVED` is used when ambiguity changes cost, route or visible
outcome enough that Editron must ask.

The existing V2 benchmark's `HARD | SOFT` field remains current executable
truth. This addendum requires a later schema migration and validator tests; it
does not falsely claim that migration has happened.

## Event-reel application example

Suppose the user supplies raw event footage and a reference reel containing a
moving filmstrip.

1. `ReferenceObservationMapV1` records the reference's pacing, progression,
   typography, audio relationships, recurring grammar and the complete bounded
   filmstrip construction.
2. The user requests one of several fidelity scopes, either explicitly or
   through a clarification:
   - exact/structural reconstruction: the hero moment is normally `MUST` or
     `SHOULD`;
   - strong inspiration: its relationships may be `SHOULD`, while exact content
     and geometry remain replaceable;
   - loose inspiration: it is normally `MAY` and Editron may propose an
     alternative hero moment;
   - pacing/colour only: the filmstrip is recorded but has application scope
     `NONE`.
3. The application plan binds the requested global language and grammar to the
   project's sections. It does not sprinkle every observed effect everywhere.
4. The filmstrip target is reconstructed into independent observable claims:
   panel count and bounds, gutter treatment, title placement, motion relations,
   source-slot behaviour, entrance/exit states and continuity into the next
   full-screen clip.
5. Candidate native, generated and hybrid forms are then evaluated. The
   generated island implements the relational mosaic; the surrounding reel
   remains native, so the complete execution plan is hybrid.

This separation answers the core reference problem: Editron captures the
reference in detail, then applies only the parts authorised by the user's
fidelity request and rights—not every detected object or memorable flourish.

## What “deterministic analysis” means

The safer term is **version-bound sensor analysis**. Three classes must not be
conflated.

1. **Exact probes** are deterministic facts for a fixed asset: bytes and hash,
   container/stream metadata, rational rates and timestamps, sample rate,
   channel layout, dimensions and encoded colour metadata.
2. **Algorithmic measurements** are repeatable only when implementation,
   parameters and execution environment are fixed: waveforms, onset functions,
   optical flow, palette measurements, histogram changes and geometric
   calculations.
3. **Learned observations** are fallible model outputs: shot boundaries, OCR,
   object masks, point tracks, speech recognition and semantic descriptions.
   They must retain model/version/parameters, coverage, uncertainty and
   independent validation metrics.

The editorial model receives these observations plus authorised visual/audio
windows. It does not turn its own confidence into measurement truth.

## Production reference-ingest path

A native-video model may accept a fifteen-minute reference, but a production
system must not assume that one pass at the provider's default sampling finds
every short hero moment. Google's current video-understanding documentation
states that File API video is sampled at one frame per second by default and
that higher/custom frame rates may be needed for granular temporal analysis.

The initial path is hierarchical:

1. ingest the immutable reference with exact stream, rational-rate, timestamp,
   audio and rights identity;
2. run exact probes and low-cost full-duration sensors;
3. run a coarse full-reference native-video sweep where provider policy allows;
4. propose candidate boundaries, recurrences and hero windows;
5. resample only those windows at 2/4/8 frames per second or at every source
   frame when the target requires it;
6. include boundary handles so a brief event is not lost at a coarse-sampling
   edge;
7. reconcile the coarse and dense passes into one cited observation map;
8. run completeness/contradiction checks and request another bounded window
   only when a material claim remains unsupported.

OpenAI Luna and Terra are multimodal in the text-plus-image sense, but their
current model pages do not list native audio or video input. They therefore
receive version-bound frame/contact-sheet evidence packs plus separate audio
observations. Native-video providers receive the same held-out reference and
are scored against the same gold observations; provider-specific ingestion is
not allowed to change the task.

The proposed fifteen-minute aggregate reference cap is a launch guardrail. It
must be benchmarked across 1/2/4/8-fps and adaptive schedules for global,
grammar and hero recall, false invention, cost and latency. Full source-FPS
encoding of all fifteen minutes is neither necessary nor economical. Dense
source-frame inspection is reserved for bounded candidate windows.

## Reference-observation prompt programme

No prompt is frozen as a production oracle. Prompts are versioned experimental
components scored on held-out moving references. The initial prompt has two
passes so that observation is not confused with application.

### Pass R1: observe the reference

```text
SYSTEM ROLE
You are a reference-video observer. Describe observable visual and audible
behaviour. Do not choose editing tools, software operations or an execution
route. Do not decide what the new project must copy.

INPUTS
- immutable reference asset/version and exact timebase identity;
- authorised video/audio evidence windows and their sampling maps;
- exact sensor observations with analyzer/version provenance;
- known gaps and unavailable intervals.

RULES
1. Separate OBSERVATION from INTERPRETATION.
2. Every observation must cite exact evidence IDs and source time ranges.
3. Classify each observation as GLOBAL_EDITORIAL_LANGUAGE,
   RECURRING_DESIGN_GRAMMAR, HERO_MOMENT or CONTENT_LITERAL.
4. A recurring grammar claim needs at least two cited occurrences and must list
   relevant counterexamples. Do not invent recurrence from one event.
5. For hero moments, enumerate visible/audible states and transitions in time;
   identify subjects/regions and measured relations. Do not merely name a
   technique such as “filmstrip”.
6. Mark unsupported, ambiguous or missing material UNVERIFIABLE. Never fill a
   missing frame/audio interval from genre expectations.
7. Keep exact content identity separate from transferable structure/style.
8. Return only the closed ReferenceObservationMapV1 JSON schema.

REQUIRED COVERAGE
- section/story/energy structure;
- shot and crop behaviour;
- layout, geometry and motion relationships;
- typography and information hierarchy;
- transition/effect distribution;
- colour/contrast/texture observations;
- dialogue/music/SFX relationships;
- recurring motifs and bounded unique constructions;
- content-literal and rights-sensitive details;
- unresolved intervals and requested dense reinspection windows.
```

### Pass R2: decide reference application

```text
SYSTEM ROLE
You are a reference-application planner. You receive a validated observation
map, the user's exact instruction, project brief, rights policy, available
sources and delivery constraints. You do not choose editing operators.

TASK
For every material observation, produce one ReferenceApplicationDispositionV1.
Assign MUST/SHOULD/MAY/MUST_NOT/UNRESOLVED; bind the intended application scope;
keep coverage, prominence, user emphasis, fidelity weight and evidence
confidence separate; cite the user/brief/reference evidence supporting the
disposition.

PRECEDENCE
User prohibitions, preservation and rights constraints outrank inferred
reference behaviour. High prominence does not create a MUST. A material
ambiguity that changes cost, route, rights or the visible result must be
UNRESOLVED with one precise question.
```

The benchmark may compare one-pass and two-pass variants, but the artifacts and
scores remain separate even if one model call eventually emits both.

## Evidence-policy system

There is no well-verified universal system that can generate correct production
evidence policies for every novel edit automatically. Editron can build a
robust, research-backed policy lifecycle using NIST-style test, evaluation,
validation and verification discipline, operation contracts, held-out media
packs and measured human/editor outcomes.

### Policy contract

Every policy records:

```text
policy ID, version, owner and approval/expiry
claim kind and intended decision or proof use
content domains, risk tier and known exclusions
coordinate domain and accepted asset/proxy identities
required evidence kinds, range coverage and temporal/spatial fidelity
accepted analyzer classes, versions and parameters
hard eligibility clauses and contradiction treatment
named validation metrics and threshold-set reference
failure disposition and allowed analysis escalation
proof obligation and invalidation triggers
calibration pack, held-out pack and adversarial cases
false-pass/false-fail costs, uncertainty and reviewer agreement
```

### How a policy is designed

1. Define one observable claim and exactly what a false pass or false fail would
   harm. “Final center panel continues into the next shot” is a claim; “good
   edit” is not yet specific enough.
2. Enumerate failure modes: wrong source, missing endpoint, identity change,
   crop jump, geometry discontinuity, black frame, timestamp mismatch or an
   unlicensed asset.
3. Gather representative positive, negative and adversarial examples across
   declared content classes and timebases.
4. Choose candidate observations and validators. Fix analyzer versions and
   parameters.
5. Calibrate resolution/coverage/tolerance on a development set. Sample count
   is justified by uncertainty and risk; `50 examples` is not universal law.
6. Freeze the policy before evaluating a held-out set. Measure false passes,
   false failures, unverified cases and reviewer disagreement.
7. Approve only the declared content/rate/risk envelope. Everything outside it
   remains experimental or requires review.
8. Monitor drift and correction data. Analyzer, source-map or policy changes
   create a new version and invalidate only the affected observations/proofs.

### Exact runtime logic

For a proposed claim, provider-neutral code looks up its versioned policy and
derives requirements. It compares those requirements with stored observations
by exact asset version, source range, sampling map, fidelity and validator
metrics.

- Missing but obtainable evidence creates bounded `AnalysisDemand` records.
- Incompatible/stale evidence is rejected rather than averaged in.
- Every mandatory clause passing yields `PASS`.
- A measured contradiction yields `FAIL` or `NEEDS_REVIEW` as declared.
- Missing evidence that cannot legally or technically be obtained yields
  `UNVERIFIABLE`, clarification or a capability gap.

The candidate operation adds its execution-specific evidence only after target
understanding establishes the independent minimum. This prevents a weak
candidate from avoiding dense analysis merely by asking for less evidence.

## Native, generated and hybrid routing

The model can help propose candidate forms, but it does not have unilateral
routing authority. The system applies the following order per target element.

1. **Authority and certification.** Enumerate only currently supported owners.
   Generated code cannot shadow project, timeline, caption, mask, tracking,
   colour, audio or delivery owners.
2. **Hard target coverage.** Build a target-claim by candidate-form matrix. A
   form is ineligible if it misses any `MUST`/`MUST_NOT`, preservation, rights,
   coordinate, editability or proof requirement.
3. **Boundedness.** A generated island must have declared input/output ranges,
   sources, local timebase, exposed controls, sandbox and resource ceiling.
4. **Representability.** Evaluate whether certified native state can preserve
   all required relationships editably. Cross-element dependencies, shared
   parameter fan-out, procedural repetition, data-driven geometry and per-frame
   procedural functions trigger a generated candidate only when no certified
   native owner already represents them.
5. **Plan composition.** If the island coexists with native clips, trims,
   tracks, audio, captions, colour or delivery, the complete plan is hybrid.
6. **Preference among legal candidates.** Compare rendered target fidelity,
   exposed editability, correction time, round-trip preservation, invalidation
   footprint, latency and cost. Native wins a true tie.

Operation count is not a router. One relational hero construction may require a
generated island; hundreds of ordinary edits can remain native.

This decision procedure is plausible and code-grounded, not yet certified.
V2 must force native, generated and hybrid implementations of held-out tasks and
have blind editors compare fidelity, defects, correction time, editability,
round-trip preservation, latency and cost. The moving-filmstrip island and
full-reel hybrid case are mandatory benchmark fixtures.

## Generated-program repair policy

MoVer reports a rise from 58.8% one-shot correctness to 93.6% with a repair
loop allowed up to 50 iterations. That proves the value of verification-guided
repair, not the commercial viability of fifty production attempts.

Editron will measure success, latency and cumulative cost at 0, 1, 2, 4 and 8
repairs. It will separately establish:

- a low-latency interactive preview budget;
- an explicit asynchronous/high-quality budget;
- a hard per-job inference/render/spend ceiling;
- progress predicates so a repair continues only when named failures improve;
- cycle/duplicate detection and fail-closed stopping;
- final human/editor review thresholds for uncertified forms.

The production limit is selected at the knee of the measured quality-versus-
cost curve. It is not predeclared as 1-3, and no job receives an implicit
50-attempt allowance.

## Adobe-class achievability

Broad functional workflow parity is achievable as a multi-year engineering and
certification programme. An exact clone of every Adobe implementation,
proprietary format, third-party plug-in ecosystem or licensed codec is neither
required nor always legally/technically achievable.

Editron can natively pursue professional timeline/trimming/tracks, keyframes,
masks/mattes/tracking, stabilisation/retiming, captions/titles, transitions,
colour management/grading/scopes, professional audio/mix, proxy/relink,
timecode/multicam, collaboration, interchange/conform, VFX turnover and
master/QC/delivery/archive outcomes. Each still needs an actual owner, renderer,
proof, undo/replay and certification envelope.

Dependencies and limits must remain explicit:

- proprietary Adobe project/Dynamic Link behaviour cannot be promised as exact
  native compatibility;
- camera RAW SDKs, professional codecs, Dolby/immersive audio and some delivery
  packages require vendor technology and licensing;
- AAF/XML/OTIO interchange has format-specific loss and cannot promise every
  effect survives round trip;
- fonts, templates, media and trained/evaluation data require rights;
- browser interaction can be web-native while heavy decode, GPU, render, ML and
  mastering work runs on bounded server/GPU workers.

The product claim is certified workflow-outcome parity, capability by
capability—not “we contain Adobe.”

## Benchmark and V2-1G correction

### Current fixture limitation

The present DEV-02 development task does not prove reference understanding. It
attaches a static filmstrip image while text evidence already states five
panels, centered title, black gutters and opposed column slides. Two MP4 files
are source footage, not a moving reference. A successful response can therefore
repeat supplied answers without discovering motion from media.

### Correct separation

1. **V2-1G transport smoke:** prove provider identity, media serialization,
   request token counting, schema normalization, retry and spend accounting.
   Four fair reference-image rows give Luna, Terra, Gemini Flash-Lite and Gemini
   Flash the same static reference evidence. Two additional Gemini rows exercise
   native audio/video transport and are reported as plumbing-only, not a fair
   competence comparison.
2. **Reference competence pilot:** at least twenty rights-cleared moving
   references across agency/social, event, interview/documentary, narrative and
   music-driven work; two expert annotations plus adjudication; no target answer
   leaked through text evidence.
3. **Held-out routing/execution benchmark:** separate target reconstruction,
   routing, graph planning, exact compilation, proxy execution, rendered proof
   and blind editor judgment. Force native/generated/hybrid baselines.

The competence pilot measures per-layer precision/recall, temporal boundary
accuracy, false invention, obligation classification, clarification quality,
hero-moment recall, route/gate attribution, cost and latency. Pilot results set
later GO/MODIFY/NO-GO thresholds according to measured uncertainty and business
risk; the research pack's proposed `50 examples`, routing threshold and
15-minute quality claims are hypotheses, not frozen production law.

The previously confirmed six-row plan hash is superseded before any provider
call because its Luna/Terra rows were text-only and the multimedia rows were not
scientifically comparable. A new exact plan hash and maximum spend require
operator confirmation before dispatch.

## Immediate sequence

1. Correct the six V2-1G input arms and current official provider pricing.
2. Freeze and present the replacement plan hash and maximum spend.
3. After exact operator confirmation, run the sanitized V2-1G transport smoke.
4. Record provider identity, actual input modality, exact token/spend accounting,
   schema validity and repair outcome. Do not report reference competence.
5. Build and freeze the separate moving-reference pilot before any claim that a
   model can reconstruct global language, recurring grammar or hero moments.
6. Migrate the benchmark from `HARD | SOFT` to the obligation-plus-graded-fields
   contract, with shared schema validation and held-out tests.
7. Continue the seven-stage benchmark: target reconstruction, routing, planning,
   compilation, proxy execution, rendered proof and blind editor judgment.

## Primary evidence

- [Google Gemini video understanding and sampling](https://ai.google.dev/gemini-api/docs/video-understanding)
- [Google Gemini media resolution](https://ai.google.dev/gemini-api/docs/media-resolution)
- [OpenAI GPT-5.6 Luna model modalities](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- [OpenAI GPT-5.6 Terra model modalities](https://developers.openai.com/api/docs/models/gpt-5.6-terra)
- [NIST AI test, evaluation, validation and verification](https://www.nist.gov/ai-test-evaluation-validation-and-verification-tevv)
- [NIST AI RMF measurement guidance](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/)
- [AgenticVBench](https://arxiv.org/abs/2605.27705)
- [VEU-Bench](https://openaccess.thecvf.com/content/CVPR2025/html/Li_VEU-Bench_Towards_Comprehensive_Understanding_of_Video_Editing_CVPR_2025_paper.html)
- [MoVer verification-guided motion generation](https://arxiv.org/abs/2502.13372)
- [LogoMotion visually grounded code synthesis](https://research.adobe.com/publication/logomotion-visually-grounded-code-synthesis-for-creating-and-editing-animation/)
- [Structured clarification under uncertainty](https://aclanthology.org/2026.findings-acl.2028/)
- [OpenTimelineIO shot ranges and handles](https://opentimelineio.readthedocs.io/en/latest/use-cases/animation-shot-frame-ranges.html)
