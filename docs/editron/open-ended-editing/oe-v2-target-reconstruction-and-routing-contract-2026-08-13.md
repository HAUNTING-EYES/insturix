# Editron V2 target reconstruction and execution-form routing contract

Date: 2026-08-13

Branch: `infrastructure-improvs-+Editron`

Status: governing research correction before the paid V2 stage-one smoke

Authority: `RESEARCH_ONLY_NO_PROJECT_MUTATION`

## Decision

Editron does not route from the user's wording, a technique name, operation
count, or model confidence. It first converts the request and references into
typed, observable target claims. Evidence policies establish what must be
measured to understand those claims. Only then does the system compare native,
generated-composition and hybrid candidates against the same target.

There is no complete industry guide that performs this translation for every
kind of edit. Editron must own and benchmark a `TargetReconstructionProtocolV1`.
The model performs the open-ended observation and decomposition; schemas,
evidence requirements, capability truth, routing gates and proof remain
provider-neutral and deterministic.

## Current benchmark discrepancy

The V2 architecture names the right stages, but the current executable packet
does not yet enforce this contract:

- `benchmark-contract-v2.json` lists only the required field names for
  `ReferenceBlueprintV2` and `EditorialIntentGraphV2`;
- `staged-packet-v2.ts` accepts `observableTargets`, `layoutAndMotion` and
  `audioIntent` as arrays of arbitrary strings;
- its stage-two `nodes` and `edges` are arrays of open objects;
- its free-choice routing instruction is only "Choose NATIVE,
  GENERATED_COMPOSITION, or HYBRID from evidence";
- it carries a naked numeric project FPS and has no source-frame/timebase map.

That packet can test whether a model returns shaped JSON. It cannot yet prove
that the model reconstructed measurable targets, used the right evidence, or
made a defensible execution-form choice. The paid smoke must not be interpreted
as that proof until the contracts below are frozen in fixtures and tests.

## `TargetReconstructionProtocolV1`

### Inputs

The protocol receives only versioned, cited material:

1. resolved user brief, musts, prohibitions and preservation instructions;
2. reference scope: inspiration, structural, visual, audible or exact;
3. current project/timeline facts and delivery requirements;
4. source/reference observations with exact asset versions and ranges;
5. authorised proxy windows when the model must actually see or hear media;
6. unresolved facts and conflicts, never hidden evaluator answers.

### Observable target grammar

Every target is a predicate, not a software instruction:

```ts
type ObservableTargetClaimV1 = {
  claimId: string;
  claimKind: string;
  scope: SourceRangeRefV1 | TimelineRangeRefV1 | CompositionRangeRefV1;
  subjects: SubjectOrRegionRefV1[];
  relation:
    | "HAS" | "EQUALS" | "WITHIN" | "AT_LEAST" | "AT_MOST"
    | "ALIGNS_WITH" | "CONTINUES_INTO" | "MOVES_RELATIVE_TO"
    | "PRESERVES" | "AVOIDS" | "PRECEDES" | "FOLLOWS";
  desired: TypedObservableValueV1;
  tolerance: TypedToleranceV1 | null;
  criticality: "HARD" | "SOFT";
  provenance: "USER_EXPLICIT" | "REFERENCE_OBSERVED" | "BRIEF_DERIVED";
  evidenceRefs: string[];
  ambiguity: "RESOLVED" | "ALTERNATIVES" | "ASK_USER";
  proofKind: string;
};
```

`claimKind` is versioned, but it is not a finite editing-technique list. The
grammar composes spatial, temporal, motion, appearance/colour, typography,
audio, continuity, semantic/story, preservation, accessibility and delivery
relations. A novel edit may create a novel combination without inventing a new
runtime primitive.

### Exact translation algorithm

1. **Copy explicit authority.** Extract the user's required result,
   preservation rules, forbidden changes, reference scope and delivery facts.
   These cannot be weakened by reference inference.
2. **Observe the reference.** Segment it into stable states and events. Record
   measured objects/regions, layout, motion, timing, typography, colour and
   audio relationships with evidence references. Do not name a technique yet.
3. **Observe the current state.** Build the same kinds of observations for the
   current timeline and available sources.
4. **Compute deltas.** For each desired observation, state what is currently
   absent, different, uncertain or already satisfied.
5. **Normalise predicates.** Convert each delta into the grammar above with an
   exact scope, subjects, relation, desired value and tolerance. Split compound
   prose until every hard claim can be proved or failed independently.
6. **Separate fact from taste.** Geometry such as five panels or a fixed title
   is measurable. "Energetic" is a soft comparative claim unless the user or
   reference supplies measurable pacing/motion/audio evidence.
7. **Resolve contradictions.** User authority wins over inferred reference
   behaviour. Unresolved hard conflicts produce a question, not an invented
   compromise.
8. **Validate and hash.** Reject missing scopes, dangling subjects, unsupported
   value domains, impossible tolerances and uncited reference claims. Freeze
   the accepted `ReferenceBlueprintV2` before routing.

For the filmstrip fixture this produces separate claims such as: five unequal
panels; black gutters; fixed centred title; opposed motion between declared
panel groups; legal crop visibility; and identity/geometry continuity from the
final centre panel into the following full-screen shot. The complete reel also
has native story, music, dialogue, colour and delivery claims. These are not
hardcoded roles for every reference; they are the measured predicates for this
reference.

## What an evidence policy is

An evidence policy is a pure, versioned requirement generator. It is not an
analyser, a model prompt, a confidence score or the evidence itself.

```ts
type TargetClaimEvidencePolicyV1 = {
  claimKind: string;
  policyVersion: string;
  deriveDecisionRequirements(claim: ObservableTargetClaimV1,
    context: CoordinateAndMediaContextV1): EvidenceRequirementV1[];
  certificationPackRef: string;
};
```

For a claim such as "the final panel continues into the next shot", its policy
can require endpoint frames from both ranges, subject/region identity,
project/source coordinate mapping, geometry/crop comparison and a declared
tolerance. For "align this action across shots", the policy requires candidate
action windows and enough motion/geometry evidence to choose finalists. The
selected execution form may later add every-source-frame tracks, crop and
handle evidence.

The deterministic gate then checks compatible observations for asset version,
range coverage, sampling map, temporal/spatial fidelity, analyzer class,
validation metric, rights and contradictions. It returns `PASS`, `FAIL`,
`UNVERIFIABLE` or `NEEDS_REVIEW` with exact missing clauses. A model cannot edit
the policy, lower its tolerance or substitute confidence for missing coverage.

Policies are authored from operation contracts and held-out certification
packs. A threshold is promoted only after measured error/coverage curves show
it supports that claim and content class. Unknown claims use conservative
bounded observations and remain experimental or require review; they do not
receive an invented weak policy.

## Exact routing logic

### Step 1: enumerate candidate forms

The capability packet produces candidate implementations. Each candidate
declares the target predicates it can represent, its owner, input/output
schemas, source/timebase compatibility, editability, interchange behaviour,
rights/egress rules, sandbox, resource cost and proof obligations.

### Step 2: hard coverage matrix

Build `ObservableTargetClaim x CandidateForm`. A candidate is ineligible if any
hard target or preservation predicate is uncovered, unverifiable or would be
owned by an uncertified/shadow path. A lower-cost candidate cannot win by
ignoring a target.

### Step 3: representability tests

**Native** is eligible when certified native owners can preserve all required
timeline/media semantics and target relationships as editable canonical state.

**Generated composition** is eligible when all of these hold:

- the custom audiovisual region is bounded;
- at least one required relationship is not faithfully/editably representable
  by certified native owners, or a generated candidate is being forced as a
  benchmark baseline;
- immutable sources, fonts, parameters, local timebase and parent mapping are
  explicit;
- code runs in the network-denied allowlisted sandbox with hard resource and
  cancellation limits;
- exposed controls and render/proof obligations are declared;
- it does not become a project, timeline, mask, tracking, colour, caption,
  audio or delivery owner.

**Hybrid** is the plan-level result when at least one bounded generated island
is combined with native timeline, source selection, clips/cuts, audio, colour,
captions or delivery. It is not a fourth renderer or another authority.

### Step 4: relationship signals

Claude's research usefully identifies signals that should cause a generated
candidate to be evaluated:

1. cross-element dependency;
2. one shared parameter driving many coordinated properties;
3. procedural repetition;
4. data-driven geometry or text;
5. per-frame procedural computation.

The repository supports the first concern: current overlay keyframes store
independent numeric tracks and contain no cross-overlay property reference.
Adobe likewise documents expressions for linked/automated properties and
avoiding large hand-authored keyframe sets.

These signals are not unconditional routers. A certified native particle,
data-graphics or constraint owner could cover signals 3-5. Cross-element
dependency forces generated execution only when the target requires that
relationship to remain editable and no certified native constraint owner can
represent it. The proposed `N >= 4` fan-out/repetition threshold has no primary
source establishing it as a universal professional boundary; it remains a
benchmark feature to calibrate, not production law.

### Step 5: choose among eligible candidates

After hard eligibility, compare target fidelity, editable parameter coverage,
round-trip/interchange preservation, invalidation footprint, expected repair,
preview latency and cost. Native wins a true tie because it preserves timeline
semantics more cheaply. Creative quality is judged from rendered alternatives,
not from the route label.

The filmstrip result is therefore unambiguous: the moving relational mosaic is
a generated composition candidate; the complete reference-driven reel is
hybrid because native editorial and finishing surround it.

## Generated-island production riders

- Expose user-relevant text, font, colour, source slots, ranges and timing as a
  typed control surface. Parameter changes must not require code regeneration.
- Carry head/tail handles when adjacent trim requirements demand them. Handle
  length derives from the timeline/delivery contract; `12-24` frames is not a
  universal constant.
- Require visual grounding before generation and render-inspect-repair after
  generation.
- Do not copy the MoVer paper's iteration count into production policy. Its
  reported improvement from 58.8% one-shot correctness to 93.6% used **up to
  50 correction iterations**, not one to three. Editron must benchmark a much
  smaller cost/latency-bounded repair budget.

## Executable node contract and ordering

The existing planned fields are necessary but not sufficient. Every node must
declare:

```text
versioned owner and closed input/output schemas
reads / writes / requires / produces / invalidates
source, timeline or composition coordinate domain and exact revisions
stability: NONE | RANGE_STABLE | PICTURE_LOCK | FINAL_CONFORM
state-effect and idempotency/replay identity
proof obligation and failure/retry disposition
rights, privacy, egress and security policy
concurrency class, cancellation/timeout and resource budget
reversibility/undo binding and observability/trace fields
```

The scheduler follows data, time/anchor, read-after-write, write-conflict,
approval/policy and proof edges. It may run ready, range-disjoint analysis or
previews concurrently. It may not run a grade before its matte, apply two
overlapping timeline mutations together, or treat final captions/mix/VFX
turnover as current after picture changes.

This is normal video-post dependency management, not an After Effects product
decision. Premiere transition legality depends on post-trim handles; linked
compositions are bounded editable regions inside the NLE; picture changes make
downstream time-based work stale. After Effects render-order documentation is
relevant only to the pixels inside a composition node.

## Timebase and benchmark correction

The production contract must distinguish rational source cadence/PTS, project
timeline rate, generated-composition local rate, analysis sampling schedule and
preview/delivery rate. Current Editron is predominantly 30/1 SDR and cannot
claim professional mixed-rate, fractional-rate, VFR, DCI or HDR support.

V2 must add mixed-rate/source-frame fixtures and exact source-to-timeline maps.
The certification target includes 24000/1001, 24/1, 25/1, 30000/1001, 30/1,
50/1, 60000/1001 and 60/1 independently; VFR requires preserved source PTS plus
an explicitly mapped CFR proxy. This work is already sequenced first in the
evidence/control-loop implementation order; it is documented, not implemented.

## Required V2 benchmark changes

Before interpreting a paid target-reconstruction result, V2 must:

1. replace string-list target output with the closed claim grammar above;
2. score target precision/recall, false invention, scope/tolerance accuracy,
   preservation capture and correct ambiguity handling against editor gold;
3. separate target reconstruction, route selection, intent planning and exact
   compilation in artifacts and telemetry;
4. force native, generated and hybrid baselines, with filmstrip-island generated
   and full-reel hybrid evaluator cases;
5. include mixed-rate/source-frame, ordering and invalidation cases;
6. score rendered/editor outcomes: fidelity, defects, correction time,
   editability, round-trip preservation, latency and cost;
7. retain one bounded repair as a separately scored attempt.

## Primary evidence

- [Adobe expressions: linked properties and large keyframe sets](https://helpx.adobe.com/after-effects/desktop/work-with-expressions/expression-basics/expression-basics.html)
- [Adobe Motion Graphics templates: exposed controls and locked design](https://helpx.adobe.com/after-effects/desktop/motion-graphics/work-with-motion-graphics-templates/creating-motion-graphics-templates.html)
- [Adobe Premiere: bounded editable linked compositions](https://helpx.adobe.com/ca/premiere/desktop/use-premiere-with-other-apps/working-with-other-adobe-applications/replace-clips-with-a-dynamically-linked-after-effects-composition.html)
- [OpenTimelineIO shot handles and reconform](https://opentimelineio.readthedocs.io/en/latest/use-cases/animation-shot-frame-ranges.html)
- [MoVer motion verification](https://arxiv.org/abs/2502.13372)
- [LogoMotion visually grounded synthesis and repair](https://research.adobe.com/publication/logomotion-visually-grounded-code-synthesis-for-creating-and-editing-animation/)
- [MG-Gen layered decomposition and per-layer animation](https://arxiv.org/abs/2504.02361)
- [MoGraphGPT modular element control](https://arxiv.org/abs/2502.04983)
