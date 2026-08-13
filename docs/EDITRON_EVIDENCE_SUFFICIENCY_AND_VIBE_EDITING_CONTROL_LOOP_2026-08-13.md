# Editron evidence sufficiency and vibe-editing control loop

**Status:** architecture correction and future implementation contract. This
document does not claim that the described runtime exists today.

The closed observable-target grammar and execution-form decision procedure are
governed by [the V2 target reconstruction and routing contract](./editron/open-ended-editing/oe-v2-target-reconstruction-and-routing-contract-2026-08-13.md).
The actual no-spend benchmark position and next paid-run gate are recorded in
[the V2-1E2 closeout](./editron/open-ended-editing/oe-benchmark-v2-1e2-closeout-and-next-run-2026-08-13.md).

## Decision

The phrase `evidence sufficiency check` is rejected unless it means a
deterministic comparison between versioned evidence requirements and versioned
observations that demonstrably cover the required source or timeline ranges at
the required temporal, spatial and audible resolution.

The earlier phrase `operation-demanded evidence` was incomplete and is replaced
by **decision- and target-claim-conditioned precision evidence**. It was
circular to require precision evidence only after an operation had already been
chosen: choosing the operation may itself require precision evidence, and a
planner could otherwise choose a weaker operation to avoid analysis.

An LLM confidence score, a generic video summary, a vector-search score or the
presence of one analysis document is never evidence sufficiency.

The professional control loop has four evidence gates. These are decision
moments, not four unrelated databases:

```text
Reusable ingest/index evidence
  -> target-understanding and route-decision evidence
  -> selected-operation execution evidence
  -> preview/final render and delivery proof
```

The first gate finds material and describes coarse structure. The second obtains
only the additional evidence needed to understand the intended visible/audible
claim and compare native, generated-composition and hybrid routes. The third
obtains the exact inputs required by the selected operations and parameters.
The fourth proves the real output. None can replace the others.

## Code-grounded current truth

The repository does not yet implement this contract:

- `asset-analysis-worker-policy.ts` runs ordinary full ingest analysis only for
  videos of at most 120 seconds by default. Longer or unknown-duration videos
  are explicitly deferred.
- `asset-analysis/route.ts` marks deferred videos `metadata-only` and
  `full-analysis-deferred` rather than creating durable long-form shards.
- `video-understanding-service.ts` allows at most 12 approximate semantic visual
  windows for an entire asset and explicitly says they do not provide frame
  precision.
- `vjepa-service.ts` creates at most 360 coverage segments. Once a source is
  longer than 30 minutes, its nominal five-second windows are automatically
  widened. A three-hour source therefore has roughly 30-second V-JEPA windows.
- `chat-deep-analysis-job.ts` is a separate targeted path. It limits a request
  to 120 seconds and samples video at one frame per second before sending it to
  Gemini.
- `asset-deep-analysis.ts` runs semantic visual, V-JEPA, Wav2Vec and music calls
  as one per-asset operation and stores a combined asset-level result. It is not
  an idempotent range-shard and merge system.
- `project-analysis-storage.ts` selects and merges per-asset snapshots. It does
  not store a canonical catalogue of observations keyed by asset version,
  exact range, sampling schedule, analyzer parameters and artifact hash.
- no production type named `EvidenceRequirement`, `AnalysisDemand` or
  `EvidenceSufficiencyReport` exists in the audited Editron runtime.

The current timebase/raster truth is also materially narrower than the project
model suggests:

- `version-7.0.0/constants.ts` fixes the main editor at 30 FPS and defaults its
  canvas to 1280x720. The React editor, player, timeline, captions, waveform,
  keyframe and several overlay paths consume that constant rather than the
  loaded project's rate.
- `ProjectService` creates 1920x1080@30 projects and stores a naked numeric
  `fps`; it does not own a rational timebase, source timestamp map or SMPTE
  timecode identity.
- Remotion metadata rounds FPS to a positive integer. Consequently 24000/1001,
  30000/1001 and 60000/1001 cannot survive exactly.
- the media asset/upload contract omits source frame rate/timebase, CFR/VFR,
  source timestamps/timecode, pixel aspect, field order, codec/pixel format,
  bit depth/chroma/alpha and colour metadata.
- overlay source offsets are stored in composition-like frame numbers without
  a source timebase. Mixed-rate or VFR source-to-timeline mapping is therefore
  not defined.
- five-track analysis, MG planning, chapter rendering and several audio/video
  consumers still contain explicit 30-FPS conversions. The chapter renderer
  even accepts an FPS argument but uses fixed 30-FPS frame thresholds.
- render paths are not fully converged: Lambda and SSR declare different output
  details and final proof does not validate rational rate, pixel format, colour
  or chapter continuity.

The only defensible description today is **a predominantly 30/1, progressive,
square-pixel SDR main editor with four 1080-long-edge UI canvas presets**. Even
that is a working envelope, not yet a golden-file-certified professional
delivery contract. System-wide 24, 25, 23.976, 29.97, 50, 59.94, 60, VFR,
mixed-rate, DCI or HDR compatibility must not be claimed.

These paths are useful inputs to a replacement. They are partial plumbing, not
a professional evidence fabric and not a single analysis authority.

## External professional-workflow findings

The professional sources do not support one cheap semantic pass as a complete
editing substrate:

- Adobe Premiere separates visual analysis, transcription and metadata. Its
  visual search currently identifies visuals only; it does not perform OCR or
  identify people. Search hits resolve to bounded source ranges rather than
  replacing the source media.
- Premiere caches analysis so it can be reused and recommends shareable sidecar
  analysis for a Production. This supports durable versioned observations, not
  repeated whole-video model calls.
- Adobe says proxy media should be reconnected to full-resolution sources for
  colour correction, complex effects, compositing and audio mixing. A proxy is
  therefore valid evidence only for operations whose declared fidelity permits
  it.
- Premiere relink uses combinations of filename, extension, tape name,
  timecode, media start and production metadata. A content embedding cannot
  replace professional source identity.
- Premiere Productions divides long-form projects into smaller projects/reels
  with shared master media and locking. This supports Editron's hierarchical
  show/reel/sequence/local-plan design rather than one enormous prompt or edit
  graph.
- Google documents one-FPS default video sampling and warns that it can miss
  rapid motion and quick changes. It supports bounded clipping and higher FPS
  when granular temporal analysis is required.
- After Effects mask tracking analyzes successive frames, emits mask-path
  keyframes and requires review/correction when the track drifts. Object removal
  may require a tracked mask, a selected analysis range and a human-corrected
  reference frame. A generic subject box is not a professional mask or track.
- ACES Metadata Files bind input, look and output transforms to clips so the
  viewing pipeline can be recreated. `warm`, `cool` or `cinematic` is not
  sufficient colour-pipeline evidence.
- EBU R 128 delivery measures programme loudness, loudness range and maximum
  true peak. `music present` or `dialogue present` is not audio-finishing proof.
- OpenTimelineIO documents that adapter formats preserve different subsets of
  tracks, transitions, effects and retimes. Interchange therefore needs a
  per-format loss report rather than a generic export success.
- Frame-accurate review comments, original camera filenames, timecode and clip
  identity are used to carry decisions from proxy editorial back to camera
  originals. A production system must preserve that chain.

The conclusion is not that every frame of every upload needs expensive
analysis. The conclusion is that the ingest baseline is certified for discovery
only. Target claims establish a precision floor before route selection; the
chosen route and exact operations then add their execution requirements.

## Professional timebase, frame and raster contract

There is no system-wide integer `fps` that is correct for professional work.
Editron must keep these identities distinct:

1. **source cadence and timestamps** -- exact rational stream rate and source
   presentation timestamps, including VFR where present;
2. **project/timeline edit rate** -- the rational rate at which edit boundaries
   and timeline frame addresses are defined;
3. **composition-local rate** -- an optional nested generated composition's
   local timebase, with an explicit mapping to the parent timeline;
4. **analysis sampling schedule** -- which actual source frames/audio samples
   were inspected; and
5. **preview/delivery rate** -- the rate required by a preview or delivery
   specification.

The canonical rate is a reduced rational pair, not a floating-point number:

```ts
type RationalRateV1 = {
  numerator: number;
  denominator: number;
};

type ProjectScopedTimebaseV1 = {
  timebaseId: string;
  version: string;
  projectId: string;
  editRate: RationalRateV1;
  ticksPerSecond: number;
  startTimecode?: string;
  dropFrameDisplay?: boolean;
};
```

`dropFrameDisplay` changes timecode numbering; it does not discard image
frames. A VFR master retains its source PTS map. A separately identified CFR
editorial proxy must carry an exact proxy-frame-to-source-PTS map so relink and
conform can be proved. Project frames, source frames, source timestamps, audio
samples and composition-local frames must never be treated as interchangeable.

The first certification matrix should independently cover 24000/1001, 24/1,
25/1, 30000/1001, 30/1, 50/1, 60000/1001 and 60/1. High-speed 100/120/240-FPS
media begins as source/conform/slow-motion support, not an automatic promise
that every final output rate is supported. Apple documents why this distinction
matters: a 120-FPS source in a 30-FPS project can play every source frame as
slow motion, while ordinary rate conforming may sample, blend or synthesize
frames.

Common targets are examples, not a hardcoded product ceiling:

| Use | Common raster/rate examples | Editron requirement |
|---|---|---|
| social/agency | 1080x1920, 1080x1350, 1080x1080, 1920x1080; often 24/25/30/50/60 families | exact delivery profile plus custom raster support |
| UHD/broadcast/streaming | 3840x2160 and 1920x1080 with delivery-specific rate, colour and audio | preserve raster, rate, fields, colour, bit depth and channel contract |
| digital cinema | DCI 2K 2048x1080 and DCI 4K 4096x2160; the DCI baseline includes 2K@24/48 and 4K@24 | DCP/cinema is a separately certified mastering profile |
| high-resolution source/VFX | camera-specific 4K/6K/8K+, RAW/log, EXR/alpha and non-square/anamorphic cases | preserve source identity; bounded proxies for interaction; master pixels for finishing |

A five-hour timeline contains 432,000 frames at 24 FPS, 450,000 at 25,
540,000 at 30, 900,000 at 50 and 1,080,000 at 60. Integer capacity is not the
problem. The system must avoid materialising them all: decode, analyze, render
and prove bounded addressable ranges using sharded workers. UHD has 8,294,400
pixels per frame and DCI 4K has 8,847,360, so full-frame, every-frame analysis is
reserved for operations that actually require it.

For an exact hand/action match, `every source frame` means every actual frame in
the bounded candidate window: every 1/24 second for 24/1, every 1001/60000
second for 60000/1001, and each source PTS for VFR. Editron does not blindly
convert everything to 60 FPS. It evaluates output continuity again at the
timeline/delivery rate and invokes interpolation only when an explicit retime
operation permits it.

## The professional ingest baseline

The baseline runs in resumable, idempotent shards and records explicit coverage.
It must include the following classes.

### 1. Source identity and integrity

- tenant, project, asset and immutable asset-version identity;
- content checksum and byte size;
- original filename and card/folder lineage where available;
- camera, reel/tape, clip, take, scene and audio-roll metadata where available;
- rational frame rate, start/end source timecode, drop-frame status and
  variable-frame-rate detection;
- duration, codec/profile, resolution, pixel aspect, orientation and alpha;
- audio sample rate, channel count/layout, embedded timecode and sync identity;
- colour primaries, transfer function, matrix/range, camera/log/RAW metadata,
  and attached ACES/CLF/CDL/LUT references where available;
- rights, releases, territory, expiry, consent, privacy and model-egress policy.

Missing camera or production metadata remains explicitly `UNKNOWN`. Editron must
not fabricate it from visual similarity.

### 2. Derivative and relink identity

- separately identified master, proxy, audio proxy, thumbnail/sprite, waveform
  and seekable-chunk artifacts;
- the exact transform from every proxy frame/sample back to the master;
- derivative hashes, encoder versions and colour/audio transformations;
- verification that source ranges resolve identically before and after relink.

### 3. Coarse editorial structure

- shot-boundary candidates with method, score and uncertainty;
- scene/chapter candidates whose claims cite child ranges;
- transcript with word timing, language and speaker observations where speech
  exists;
- silence, music, dialogue, noise and coarse audio-event ranges;
- OCR text with time range and screen box when the baseline OCR actually saw it;
- sparse subjects, objects, actions, settings and visible-state changes;
- shot scale, camera-motion class, subject-motion class and coarse composition;
- sparse semantic text, visual and audio embeddings for retrieval;
- quality flags such as corruption, black/frozen spans, blur, clipping, missing
  channels, excessive noise or unusable exposure;
- every observation's analyzer, model/version, parameters, confidence,
  coverage and creation time.

### 4. Coverage and uncertainty ledger

For each asset version and evidence kind, the baseline records:

- intervals observed and intervals not observed;
- actual frame/sample schedule, not merely the requested FPS;
- source or proxy fidelity used;
- analyzer certification scope and known content-class limitations;
- failed, timed-out, blocked and degraded shards;
- contradictions between analyzers or human corrections;
- invalidation links to source replacement, relink and analyzer-version change.

Without this ledger, absence of evidence is indistinguishable from evidence of
absence.

### What does not belong in the universal baseline

These are created only when a decision or delivery requires them:

- per-frame object masks, mattes and point tracks;
- human/object pose and silhouette sequences;
- dense optical flow and camera solves;
- full-resolution OCR or edge inspection on all frames;
- stem separation and detailed restoration across all audio;
- shot-matching grade measurements and final colour-pipeline validation;
- VFX plates, clean frames and occlusion maps;
- final programme loudness, true-peak, gamut, flash, caption, codec and package
  QC.

Running these over every uploaded hour would waste time and money. Omitting them
when an operation needs them would make the edit unreliable.

## The non-black-box evidence contract

### Two requirement owners, not one black box

The target claim and the operation each own a different evidence policy:

```ts
type TargetClaimEvidencePolicyV1 = {
  targetPredicateKind: string;
  policyVersion: string;
  deriveDecisionRequirements: "pure implementation identifier";
  certificationPackRef: string;
};

type OperationEvidencePolicyV1 = {
  operationId: string;
  policyVersion: string;
  deriveExecutionRequirements: "pure implementation identifier";
  certificationPackRef: string;
};
```

The target policy converts observable requested qualities and tolerances into
the minimum evidence needed to understand and route the task. The operation
policy converts a candidate operation's validated parameters, target ranges and
project timebase into the additional evidence needed to execute it. Both are
pure, versioned implementations. The model may propose target predicates and
candidate operations; it cannot edit either policy or lower either threshold.

For genuinely unknown target behaviour, Editron cannot invent a weak policy.
It must either obtain general high-recall bounded observations and label the
route experimental, ask the user/editor, or report a capability gap.

### `EvidenceRequirementV1`

Each derived requirement records:

```ts
type EvidenceRequirementV1 = {
  requirementId: string;
  ownerRef: TargetPredicateRefV1 | OperationNodeRefV1 | ProofObligationRefV1;
  criticality: "MUST" | "SHOULD";
  target: SourceRangeRefV1 | TimelineRangeRefV1;
  evidenceKind: string;
  temporal: {
    maximumSampleGapFrames?: number;
    boundaryToleranceFrames?: number;
    requiresEverySourceFrame?: boolean;
    maximumAudioHopMs?: number;
  };
  spatial: {
    minimumWidth?: number;
    minimumHeight?: number;
    requiresMasterPixels?: boolean;
    regionOfInterest?: NormalizedRectV1;
  };
  coverage: {
    minimumRangeCoverage: number;
    allowUnknownIntervals: boolean;
  };
  provenance: {
    allowedAnalyzerClasses: string[];
    maximumObservationAgeMs?: number;
    acceptedAssetVersions: string[];
  };
  validation: {
    metricId: string;
    thresholdSetRef: string;
    unresolvedContradiction: "FAIL" | "REVIEW";
  };
  fidelity: "PROXY_OK" | "MASTER_REQUIRED";
  failureDisposition: "ANALYZE" | "ASK_USER" | "DECLINE" | "NEEDS_REVIEW";
};
```

The threshold set is established by a held-out certification pack for the
specific operation and content classes. It is not a universal `confidence >
0.8` constant.

### `EvidenceObservationV1`

An observation records what was actually measured:

```ts
type EvidenceObservationV1 = {
  observationId: string;
  assetId: string;
  assetVersion: string;
  sourceRange: SourceRangeRefV1;
  evidenceKind: string;
  samplingMap: ArtifactRefV1;
  temporalResolution: Record<string, number | boolean>;
  spatialResolution: Record<string, number | boolean>;
  analyzerId: string;
  analyzerVersion: string;
  parameterHash: string;
  measurementArtifact: ArtifactRefV1;
  validatorMetrics: Record<string, number | string | boolean>;
  confidence: number | null;
  status: "COMPLETE" | "DEGRADED" | "FAILED" | "HUMAN_CORRECTED";
  createdAt: string;
};
```

Confidence remains useful for ranking and review. It cannot compensate for
missing range coverage, wrong asset version or inadequate sampling.

### Deterministic sufficiency algorithm

For every `MUST` requirement, the gate performs these steps:

1. Resolve the exact target range and asset version.
2. Select only observations whose evidence kind, analyzer class, parameters,
   source/proxy fidelity and asset version are compatible.
3. Compute the union of their observed intervals and sampling maps.
4. Fail the coverage clause if required intervals or samples are missing.
5. Fail the temporal or spatial clause if resolution is too coarse.
6. Run or read the named independent validation metric and compare it with the
   versioned certification threshold.
7. Apply freshness, rights, privacy and egress rules.
8. Apply the declared contradiction disposition.
9. Return `PASS` only when every `MUST` clause passes. `SHOULD` failures affect
   ranking or review but never become silent success.

The output is not a boolean alone:

```ts
type EvidenceSufficiencyReportV1 = {
  subjectRef: TargetPredicateRefV1 | OperationNodeRefV1 | ProofObligationRefV1;
  result: "PASS" | "FAIL" | "UNVERIFIABLE" | "NEEDS_REVIEW";
  satisfiedRequirementIds: string[];
  missing: EvidenceGapV1[];
  incompatibleObservationIds: string[];
  contradictionIds: string[];
  reportHash: string;
};
```

### How automatic precision escalation is actually selected

Requirements are authored and certified with target-predicate and capability
contracts; they are not improvised in a prompt. The sequence is mechanical:

```text
user/reference/brief
  -> model proposes observable target predicates
  -> target schema validation
  -> target policies derive route-decision evidence floors
  -> missing decision evidence becomes bounded AnalysisDemand records
  -> native/generated/hybrid candidate forms are enumerated
  -> each candidate operation policy adds execution requirements
  -> backward requirement propagation through each candidate graph
  -> evidence gate compares requirements with stored observations
  -> scheduler runs only certified analyzers for missing clauses
  -> new observations are stored and the same gates run again
```

The model does not decide that "this feels like it needs deeper analysis." Its
validated target predicates establish a non-negotiable floor; candidate
operations can only add requirements. A candidate cannot win merely because it
demands less evidence than the requested result.

Examples:

| Target claim | Decision evidence before route | Execution evidence added by selected form |
|---|---|---|
| exact ordinary cut here | source/timeline identity and intended boundary | adjacent ranges, exact boundary and sufficient handles |
| visually match this action across shots | candidate entities/regions, action windows, motion/geometry similarity and narrative eligibility | every-source-frame finalist windows, chosen track/shape/phase, crop, handles and endpoint proof |
| isolate this moving subject | target identity, separation/occlusion difficulty and range | per-frame matte/track, occlusion recovery and drift validation |
| cut exactly to these beats without hurting speech | audible music/speech ranges and whether beat evidence exists | decoded audio, measured onsets/beats, alignment tolerance and protected speech |
| grade only the background | foreground/background separability and colour-source identity | selected matte plus colour-managed source/target and edge proof |
| replace this moving screen | screen visibility, surface/occlusion ranges and replacement compatibility | perspective track, corners, occlusion masks and master-pixel edge validation |
| reproduce this moving collage | reference states, moving-panel geometry, typography, continuity goal and candidate sources | generated-program inputs, source ranges, crop safety, font, timing and rendered geometry/legibility proof |

Words such as `precisely` or `frame perfect` may select a stricter supported
operation parameter. They cannot manufacture an analyzer or lower a capability
boundary. If the operation cannot support the requested tolerance, Editron asks
for review or reports a capability gap.

For an open-ended graph, a plain set union is not sufficient. The compiler
propagates requirements backwards from final predicates and proof obligations
through every node. It then:

1. recognises when one upstream artifact satisfies several downstream nodes;
2. adds cross-node coordinate, ordering and compatibility requirements;
3. deduplicates overlapping range analysis;
4. rejects contradictory requirements or invalid source/timeline mappings; and
5. computes invalidation and end-to-end proof obligations.

For example, `track subject -> build matte -> grade background -> composite`
does not need three unrelated subject analyses: one certified source-coordinate
track/matte may satisfy several nodes. But the combined claim `clean
background-only grade` still needs final edge, colour and composite proof.

A new graph made from existing certified operations is technically executable
when every primitive and edge passes. That does **not** automatically certify a
new semantic/taste claim such as `good match cut`. Until its combined outcome
has a held-out evaluation and threshold, Editron labels that claim experimental
and obtains explicit editor approval. Primitive safety and creative success are
different claims.

## Exact-detail example: aligning a hand across a match cut

A generic caption such as `person moves hand` cannot support this edit. The
bounded dense path is:

1. Resolve the outgoing source window and inspect every source frame around the
   proposed cut.
2. Identify the intended matching entity. For a person, obtain body/hand
   landmarks where visible; for an arbitrary object, obtain a mask or tracked
   point set instead of pretending human pose applies.
3. Store a generic frame-indexed relationship observation: entity/region
   identity, bounds/shape/landmarks as applicable, visibility/occlusion, scale,
   pose or orientation, motion, action phase, camera motion, crop room,
   colour/luminance and related audio events. `hand centre` is one derived field
   for this fixture, not a universal schema.
4. Use coarse semantic and geometry retrieval to find eligible incoming
   windows across the project.
5. Reject rights, source-handle, resolution and crop failures before dense
   analysis.
6. Inspect every frame in the remaining incoming windows and compute the same
   measurements.
7. Search cut-frame pairs and permitted reframes against declared position,
   scale, shape, motion-direction and phase tolerances.
8. Preserve several technically valid alternatives and let the editorial model
   or editor rank narrative meaning and taste.
9. Render the candidate cut. Validate real endpoint geometry and timing, then
   ask a visual judge or human whether the match is perceptually readable.

SAM 2 can propose which pixels belong to a prompted subject over time;
CoTracker can propose the coordinates of selected or dense points over time.
Those are measurements, not proof that the right identity stayed selected, the
mask edge is usable, the track survived occlusion or the final composite looks
clean. Either model can drift onto the wrong object or fail under blur,
occlusion and scene change. They are replaceable analyzer implementations behind
evidence kinds. Independent drift/identity/edge metrics, content-class tests,
artifact hashes, render validation and human correction establish whether an
observation is usable.

## Where escalated evidence is stored

Deep inspection is reusable derived evidence, not an ephemeral prompt result:

```text
R2 / object storage
  dense frame strips, proxy windows, masks/masklets, flow fields, tracks,
  waveforms, stems, crops, analyzer inputs/outputs and validation artifacts

Mongo canonical evidence catalogue
  asset/version/range identity, evidence kind, coverage and sampling map,
  analyzer/version/parameters, artifact hashes, metrics, rights and invalidation

Qdrant derived retrieval index
  compact searchable vectors and payload pointers, rebuildable from Mongo

ProjectService
  no analysis blobs; only approved project/timeline state and receipt bindings
```

An `AnalysisDemand` is keyed by tenant, asset version, range, evidence kind,
required resolution, analyzer version and parameter hash. Retrying the same
demand reuses or completes the same record rather than producing an unrelated
analysis. Higher-resolution observations do not overwrite coarse observations;
both remain cited and the compatibility rules choose the applicable one.

## How the vibe-editing agent knows what edit to make next

There are two different decisions and they must not be hidden inside one model
call:

1. **What remains wrong or incomplete?** Compare observable target predicates
   with current timeline/render/evidence facts.
2. **Which legal action should address it next?** Use declared operation
   effects, prerequisites and invalidations, then let a tested editorial model
   rank the remaining creative alternatives.

### Durable state used by the loop

- `EditorialProjectBrief`: deliverable, story, brand, reference, rights and
  preservation instructions;
- `GoalGraph`: observable target and preservation predicates, with dependencies;
- `CurrentStateFacts`: current project revision, timeline facts, evidence and
  latest preview measurements;
- `DeltaSet`: target predicates that are unsatisfied, failed, unknown or stale;
- `CapabilityPacket`: eligible operations with inputs, outputs, state effects,
  evidence policies, conflicts and proof obligations;
- `WorkingEditPlan`: proposed local operations against one pinned base revision;
- `ReceiptsAndProof`: what actually executed and what the render demonstrated.

### Next-action algorithm

```text
1. Recompute DeltaSet from the latest real state and render evidence.
2. If a required target is ambiguous, request clarification before mutation.
3. Expand target-claim decision evidence and collect any missing route evidence.
4. Enumerate native, generated-composition and hybrid candidate forms that can
   address the unsatisfied deltas.
5. Remove candidates blocked by certification, rights, source compatibility,
   ownership, sandbox, editability, handoff, proof, project state or policy.
6. Expand operation execution requirements and backward-propagate them through
   each remaining candidate graph.
7. If requirements are missing, schedule the smallest reusable AnalysisDemand
   that can satisfy them; evidence collection is the next action.
8. Build typed dependencies and invalidations, then topologically order the DAG.
9. Run only nodes whose prerequisites pass and whose read/write/invalidation
   domains are compatible; disjoint ready nodes may run in parallel.
10. Rank remaining legal ready alternatives with the staged scorecard below.
11. Compile and preview one bounded operation or subgraph.
12. Update CurrentStateFacts from the actual preview, not the prediction.
13. If a predicate failed, repair that node once when a legal repair exists;
    otherwise return review, clarification or capability gap.
14. Stop when all required predicates pass, the user stops it, the budget ends,
    or no legal progress is possible.
```

### Why edit action order matters

Order changes both the pixels and the amount of work invalidated. Adobe's own
render pipeline applies masks, effects, transforms and layer styles in a defined
order, while effects within a group run top to bottom. Editorial dependencies
also matter: transitions require post-trim handles; picture changes can stale
captions, SFX cues, VFX pulls and mix automation; final delivery must bind the
final creative component versions.

Every executable node therefore declares:

```text
reads / writes / requires / produces / invalidates
coordinate domain and source/project/composition revision
stability: NONE | RANGE_STABLE | PICTURE_LOCK | FINAL_CONFORM
proof obligation and failure disposition
owner, concurrency class, reversibility and resource budget
```

Edges include data, time/anchor, read-after-write/write-conflict, approval/policy
and proof relationships. The scheduler topologically orders the graph only after
it validates. It may parallelize satisfied, range-disjoint nodes; it may not
turn an unordered model list into concurrent mutations.

A typical dependency spine is:

```text
source identity and rights
  -> sync/proxy/roles/coarse evidence
     -> story assembly and rough cut
        -> continuity, performance, pacing and precision trims
           -> range-stable VFX/compositions/masks/reframes
              -> picture lock/conform by sequence or reel
                 -> final VFX + grade + sound + captions/localization
                    -> reconform/version bind -> master/package/QC/archive
```

This is not an inflexible universal pipeline. A colour test can happen early;
music structure can guide the first cut; a generated composition can be
developed in parallel with a disjoint sequence. The actual order comes from
the operation graph's dependencies and invalidations. Final work is delayed
only when an upstream change would invalidate it.

Concrete invalidation rules include:

- source replacement/relink stales proxy-to-master mapping and source-version
  evidence;
- trim/ripple/reorder/retime stales affected timeline-timed captions, SFX, VFX
  pulls, automation, burn-ins and render proof, while unchanged source-coordinate
  transcript evidence may survive;
- retime also stales onset/action projection unless source observations can be
  reprojected through an explicit rate map;
- crop/layout/composition change stales safe-zone, collision, legibility and
  geometry proof;
- colour-pipeline change stales colour metrics, look approval and final render
  proof, but not transcript;
- generated-program hash or input change stales its renders, emitted cue anchors
  and surrounding hybrid continuity proof;
- releasing picture lock marks dependent final audio/captions/VFX/conform work
  reconform-required rather than deleting its source artifacts; and
- a delivery-spec-only change stales encode/package/QC when the verified creative
  master is unchanged.

### Native, generated-composition or hybrid routing

Operation count is not a valid router. One novel collage can require generated
code; one hundred ordinary cuts should remain native. Editron builds a
`TargetPredicate x CandidateForm` coverage matrix and applies hard gates before
any model preference:

1. **Native** is eligible when certified native owners cover every hard target,
   preserve editable timeline/media semantics and remain maintainable,
   interoperable and provable.
2. **Generated composition** is eligible for a bounded custom composition whose
   internal layout/choreography cannot be expressed faithfully by certified
   native operations, or would otherwise become a brittle opaque keyframe
   explosion. Its sources, fonts, parameters, effects, program hash, sandbox,
   resource budget and render proof must be explicit. It cannot shadow timeline,
   mask, tracking, grade, audio, caption or project mutation owners.
3. **Hybrid** is eligible when a bounded generated composition island is needed
   while source selection, surrounding clips/cuts, main timeline, audio, colour,
   captions and delivery remain native.

If native and generated candidates satisfy the target equally, prefer native
for editability and interchange. Generated code must materially improve target
coverage while remaining bounded and provable. Route quality is benchmarked by
forcing native/generated/hybrid baselines on held-out tasks and comparing target
satisfaction, render defects, editor correction time, round-trip preservation,
latency and cost.

The filmstrip case is precise: **the moving filmstrip element itself is a
`GeneratedCompositionProgram`; the complete reel is hybrid** because native
source ranges, clips, adjacent cuts, music/mix, captions, colour and delivery
surround that generated island.

### Staged ranking, not one magic score

The earlier creative list was necessary but incomplete. No universal scalar is
robust enough for every film, agency piece, podcast and social edit. Use this
lexicographic/constraint order:

1. **Hard gates, never scores:** user preservation requirements, rights/privacy/
   egress, support/certification, source/timebase/range compatibility, required
   evidence, prerequisites, revision/conflict safety, accessibility/delivery
   requirements and proofability.
2. **Dependency and production priority:** prerequisite readiness, critical-path
   effect, invalidation footprint, expected reconform/rework, range stability,
   parallelizability, reversibility and handoff/interchange preservation.
3. **Editorial Pareto set:** target coverage; story causality and clarity;
   performance/emotion; intentional continuity or discontinuity; pacing/rhythm;
   information hierarchy and legibility; dialogue/music/SFX relationship;
   reference/brand/audience fit; composition and tonal/colour coherence;
   repetition versus deliberate motif; density/fatigue; whole-sequence
   consequence; and the user's correction history.
4. **Uncertainty and learning value:** calibrated uncertainty, margin between
   alternatives, disagreement between judges and expected information gain from
   a cheap bounded preview.
5. **Cost tie-break:** preview/final latency and monetary/compute cost only after
   the required quality and preservation floor passes.

Taste is ultimately evaluated on rendered alternatives. Pairwise/blind editor
review and accepted-edit/correction-time data calibrate model ranking; ITU
P.910/BT.500 provide disciplined subjective audiovisual test methods, but no
standard or model supplies a universal automated oracle for editorial taste.

### Concrete example: reference-driven event recap

Suppose the brief and reference create these unsatisfied goals:

- establish a clear opening and story arc;
- use the supplied participants and workshop footage;
- reproduce an unequal moving-panel sequence;
- keep a fixed readable title over moving footage;
- continue the final panel into a full-screen shot;
- cut with the music while protecting dialogue;
- finish with coherent colour and a compliant mix.

The first action is not chosen from taste alone. Source assignment and dialogue/
music evidence are prerequisites for picture construction, so the agent first
retrieves and densely verifies the required source windows. The moving-panel
element then makes a bounded `GeneratedCompositionProgram` candidate eligible;
nesting it into native source clips, timeline structure and music makes the
complete route hybrid. Its source, font, geometry and timing requirements must
pass before preview. The preview
updates the real geometry and continuity facts. Only after picture timing is
stable does the SFX resolver bind most event cues. Colour, mix and delivery QC
then use their own evidence and proof requirements.

If the preview reveals a black frame, the next action is a local assembly repair
because a hard predicate failed. If it is technically correct but creatively
weak, the editorial judge can rank an alternative, but cannot turn weakness
into a certified success without the required review threshold.

### What remains model-dependent

The system can deterministically find missing evidence, enforce prerequisites,
order dependencies and reject impossible actions. It cannot mathematically
guarantee that a general model will invent the best story, decompose a novel
reference correctly or make good taste decisions.

That is the load-bearing model experiment:

- provide the brief, observable targets, current facts and complete eligible
  capability packet;
- require the model to identify deltas and propose the next legal operation;
- compare its choices with expert gold sequences and valid alternatives;
- execute and inspect the result;
- measure false success, instruction preservation, accepted-edit rate, human
  preference, latency and cost.

The agent loop makes model judgment observable and repairable. It does not make
an unproven model intelligent.

## `EDITRON.md` and the visual agent shell

The project-facing `EDITRON.md` is a versioned human-readable editorial
constitution containing the brief, references, brand, preservation, rights,
egress, review, quality, cost and delivery instructions. It is compiled into
structured project direction. It is not media analysis, timeline state or a
second authority.

The useful vibe-coding mapping is:

| Vibe coding | Editron |
|---|---|
| repository instructions | `EDITRON.md` plus platform safety/tool rules |
| source files | immutable media, source ranges, timeline and compositions |
| code search | authorised hierarchical evidence retrieval |
| tool calls | certified editing and analysis operations |
| diff | proposed time-ranged timeline/change set with preview |
| tests | deterministic validators plus visual/audio/render proof |
| Git revision | ProjectService revision, checkpoint and receipt |
| agent repair | inspect failed predicate, revise bounded node, rerender |

An open-source non-terminal agent shell may later contribute its task UI,
approval flow, tool loop, logs and sandbox interface. Its file/Git mutation
model cannot be adopted as Editron's authority. The media hierarchy, timeline,
ProjectService revision, background job, render proof and time-range conflict
model remain Editron-native.

This build-versus-adapt spike follows the planner experiment. A polished chat UI
is not evidence that a coding-agent runtime can safely edit professional media.

## Certification programme

Professional readiness is established per evidence kind and operation, not by
declaring the baseline complete. Evaluation packs must include agency short
form, interviews/podcasts, multicamera events, documentary/narrative long form,
music-driven montage, multilingual material, mixed frame rates, log/HDR media,
noisy production audio and VFX/turnover cases.

Measure at least:

- source/proxy/relink identity correctness;
- ingest and shard coverage, retries and invalidation;
- shot-boundary frame error and gradual-transition classification;
- transcript word error/timing and diarisation error by language/content class;
- OCR recall and box/time accuracy;
- section/moment retrieval recall before top-k truncation;
- track drift, occlusion recovery and mask quality;
- action/pose/motion phase alignment for match-like edits;
- colour metadata and transform-chain correctness;
- audio onset/beat timing, channel mapping, loudness and true-peak measurement;
- interchange round-trip loss by format and operation;
- rendered black/frozen frame, legibility, safe-area, flash and audio failures;
- human editor preference, correction time and hidden-manual-rescue rate.

Candidate counts, sample rates and thresholds are selected from these curves by
content class and operation. They are versioned certification data, not prompt
constants.

## Current benchmark gate

The V2 target-reconstruction smoke has not run. V2-1E and V2-1E2 repaired
provider identity, OpenAI cache-write pricing and Google exact-request token
counting, but produced no live provider receipt. The currently frozen
`ReferenceBlueprintV2` still accepts arbitrary string targets and therefore
cannot prove the target/evidence/routing contract in this document.

The next bounded slice is V2-1F: close that stage-one/stage-two schema gap,
including rational source/project/composition coordinates and the explicit
filmstrip-island-generated/full-reel-hybrid evaluator case. Only then may the
operator-confirmed six-row, $0.48-maximum V2-1G stage-one smoke dispatch.

## Required implementation order

This document does not authorize the production implementation before the
open-ended planning experiment. When that gate permits the infrastructure work,
the order is:

1. Freeze rational source/project/composition coordinate identities, the source/
   proxy timestamp mapping and evidence-kind taxonomy.
2. Implement `EvidenceObservationV1`, coverage/sampling maps and durable storage.
3. Define `TargetClaimEvidencePolicyV1` for benchmark target predicates and
   `OperationEvidencePolicyV1` for the benchmark's existing operators.
4. Implement pure route-decision and execution sufficiency reports, backward
   requirement propagation and missing-evidence derivation.
5. Add idempotent `AnalysisDemand` records and one dense visual analyzer path.
6. Prove mixed-rate/source-frame mapping plus the match-action and mask/track
   fixtures at more than one rational cadence.
7. Freeze the executable-node read/write/require/produce/invalidate/stability
   contract and validate its dependency DAG.
8. Add the durable `GoalGraph`, `DeltaSet`, route coverage matrix and next-action
   research loop.
9. Benchmark forced native/generated/hybrid routes, ordered next-action choice,
   invalidation/reconform and rendered/editor outcomes -- not only graph JSON.
10. Only then propose production shadow integration through the frozen IF1/
   ProjectService boundary.

## Primary sources

- [Adobe Premiere media intelligence and Search panel](https://helpx.adobe.com/premiere/desktop/organize-media/file-organization/media-intelligence-and-search-panel.html)
- [Adobe analysis metadata caching](https://helpx.adobe.com/premiere/desktop/organize-media/file-organization/manage-media-intelligence-metadata.html)
- [Adobe reconnecting full-resolution media](https://helpx.adobe.com/premiere/desktop/organize-media/ingest-proxy-workflow/reconnect-full-resolution-media-to-proxies.html)
- [Adobe locating and linking offline files](https://helpx.adobe.com/premiere/desktop/organize-media/file-organization/locate-and-link-offline-files.html)
- [Adobe Productions for long-form work](https://helpx.adobe.com/premiere/desktop/collaborate-with-others/collaborate-using-team-projects/when-to-use-team-projects-and-when-to-use-productions.html)
- [Adobe ingest and proxy workflow](https://helpx.adobe.com/ie/premiere/desktop/organize-media/ingest-proxy-workflow/ingest-and-proxy-workflow.html)
- [Adobe sequence timebase and media parameters](https://helpx.adobe.com/uk/premiere/desktop/edit-projects/change-clip-sequence/sequence-presets-and-settings.html)
- [Adobe export frame size, rate, aspect and depth](https://helpx.adobe.com/premiere/desktop/render-and-export/export-files/overview-of-export-settings.html)
- [Apple mixed-rate conforming and frame sampling](https://support.apple.com/en-euro/guide/final-cut-pro/ver3363b44e/mac)
- [Apple high-frame-rate source slow motion](https://support.apple.com/en-euro/guide/final-cut-pro/ver40b00150/mac)
- [DCI Digital Cinema System Specification](https://dcss.dcimovies.com/0c0cff34d231b516cb89ae3fad352d5cf37a9515/dcss.pdf)
- [Google Gemini video understanding and sampling](https://ai.google.dev/gemini-api/docs/video-understanding)
- [Adobe After Effects mask tracking](https://helpx.adobe.com/after-effects/using/rigid-mask-tracking.html)
- [Adobe After Effects content-aware fill](https://helpx.adobe.com/after-effects/using/content-aware-fill.html)
- [Adobe After Effects render order and nesting](https://helpx.adobe.com/ca/after-effects/using/precomposing-nesting-pre-rendering.html)
- [Adobe Premiere transition handles](https://helpx.adobe.com/premiere/desktop/add-video-effects/apply-video-transitions/transitions-overview.html)
- [Adobe captions near final edit](https://helpx.adobe.com/premiere/desktop/add-text-images/insert-captions/about-captions.html)
- [Adobe Dynamic Link bounded editable compositions](https://helpx.adobe.com/ca/premiere/desktop/use-premiere-with-other-apps/working-with-other-adobe-applications/replace-clips-with-a-dynamically-linked-after-effects-composition.html)
- [ACES Metadata File specification](https://docs.acescentral.com/amf/specification/)
- [ACES workflow stages and metadata handoff](https://docs.acescentral.com/amf/guides/implementation/)
- [EBU R 128 loudness recommendation](https://tech.ebu.ch/publications/r128)
- [OpenTimelineIO feature matrix](https://opentimelineio.readthedocs.io/en/latest/tutorials/feature-matrix.html)
- [SMPTE ST 2067 IMF overview](https://www.smpte.org/standards/st2067)
- [Frame.io frame-accurate comments](https://help.frame.io/en/articles/9105251-commenting-on-your-media)
- [Meta SAM 2 research](https://ai.meta.com/research/sam2/)
- [Meta/Oxford CoTracker repository](https://github.com/facebookresearch/co-tracker)
- [ITU-T P.910 audiovisual subjective assessment](https://www.itu.int/rec/t-rec-p.910/en)
- [ITU-R BT.500 television-image subjective assessment](https://www.itu.int/rec/R-REC-BT.500)

## Acceptance statement

The evidence architecture passes only when an auditor can answer, for any
planner operation:

```text
why this evidence kind was required;
which target-claim policy established the route-decision floor;
why native, generated-composition or hybrid was eligible;
which exact source/timeline range it covered;
which rational source/project/composition coordinate system was used;
what frames/samples and fidelity were inspected;
which analyzer/version/parameters produced it;
where the derived artifacts and canonical observation live;
which metric and threshold established sufficiency;
what was missing or contradictory;
how the preview/final render proved the requested result;
which later operations would invalidate that proof;
and why the selected next action was eligible before it executed.
```

If any answer is only "the model believed it," the operation is not
production-certified.
