# Editron evidence sufficiency and vibe-editing control loop

**Status:** architecture correction and future implementation contract. This
document does not claim that the described runtime exists today.

## Decision

The phrase `evidence sufficiency check` is rejected unless it means a
deterministic comparison between:

1. evidence requirements declared by the proposed operations and their exact
   parameters; and
2. versioned observations that demonstrably cover the required source or
   timeline ranges at the required temporal, spatial and audible resolution.

An LLM confidence score, a generic video summary, a vector-search score or the
presence of one analysis document is never evidence sufficiency.

The professional architecture has three evidence tiers:

```text
Reusable ingest/index evidence
  -> operation-demanded dense evidence
  -> preview/final rendered and delivery proof
```

The first tier finds material and describes coarse structure. The second tier
supports an exact edit. The third proves that the resulting image, sound,
timeline and deliverable are correct. None can replace the other two.

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
only, and every precision operation must declare and obtain its own evidence.

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

### `OperationEvidencePolicyV1`

Every planner-eligible operation has a versioned evidence policy owned with the
capability contract:

```ts
type OperationEvidencePolicyV1 = {
  operationId: string;
  policyVersion: string;
  deriveRequirements: "pure implementation identifier";
  certificationPackRef: string;
};
```

The pure implementation converts the operation's validated parameters, target
ranges and project timebase into requirements. The model cannot edit this
policy or lower its thresholds.

### `EvidenceRequirementV1`

Each derived requirement records:

```ts
type EvidenceRequirementV1 = {
  requirementId: string;
  operationNodeId: string;
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
  operationNodeId: string;
  result: "PASS" | "FAIL" | "UNVERIFIABLE" | "NEEDS_REVIEW";
  satisfiedRequirementIds: string[];
  missing: EvidenceGapV1[];
  incompatibleObservationIds: string[];
  contradictionIds: string[];
  reportHash: string;
};
```

### How automatic escalation is actually selected

The sequence is mechanical:

```text
model proposes operation + parameters
  -> schema validation
  -> operation evidence policy derives requirements
  -> evidence gate compares requirements with stored observations
  -> each missing clause becomes an AnalysisDemand
  -> scheduler selects a certified analyzer capable of that clause
  -> new evidence is stored
  -> the same gate runs again
```

The model does not decide that “this feels like it needs deeper analysis.” The
chosen operation and parameters create the requirement.

Examples:

| Proposed operation | Requirement forced by the operation |
|---|---|
| Ordinary hard cut | verified adjacent ranges, frame-accurate boundary and sufficient source handles |
| Action/graphic match cut | every-frame candidate windows, tracked matching entity/region, motion/action phase, crop viability and handles |
| Tracked mask | target identity, per-frame matte/track, occlusion handling and drift validation |
| Beat-aligned cut | decoded audio, onset/beat evidence with a declared alignment tolerance and protected speech ranges |
| Background-only grade | foreground/background separation plus colour-managed source and target evidence |
| Precise screen replacement | planar/perspective track, corner-pin geometry, occlusion masks and full-resolution edge validation |
| Generated moving collage | exact source ranges, crop-safe subjects, layout measurements, font assets, timing and rendered geometry/legibility proof |

Words such as `precisely` or `frame perfect` may select a stricter supported
operation parameter. They cannot manufacture an analyzer or lower a capability
boundary. If the operation cannot support the requested tolerance, Editron asks
for review or reports a capability gap.

For an open-ended graph, the compiler takes the union of requirements from all
proposed nodes. A new combination of existing operations is allowed; bypassing
their evidence policies is not.

## Exact-detail example: aligning a hand across a match cut

A generic caption such as `person moves hand` cannot support this edit. The
bounded dense path is:

1. Resolve the outgoing source window and inspect every source frame around the
   proposed cut.
2. Identify the intended matching entity. For a person, obtain body/hand
   landmarks where visible; for an arbitrary object, obtain a mask or tracked
   point set instead of pretending human pose applies.
3. Store per-frame screen position, scale, silhouette/shape descriptor,
   visibility/occlusion, motion vector, action phase, camera motion, crop room,
   colour/luminance and any relevant audio event.
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

Useful analyzer candidates include promptable video segmentation such as SAM 2
and point tracking such as CoTracker. They are replaceable analyzers, not proof
by brand name. Their outputs still need content-class evaluation, drift and
occlusion checks, artifact hashes and human correction when they fail.

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
3. Find operations whose declared effects address at least one unsatisfied delta.
4. Remove operations blocked by rights, support status, project state or policy.
5. Expand each candidate's evidence requirements.
6. If requirements are missing, schedule the smallest AnalysisDemand that can
   satisfy them; evidence collection is the next action.
7. Build dependencies from declared requires/produces/invalidates relationships.
8. Execute prerequisite and high-invalidation structural work before dependent
   finishing work.
9. Among equally legal ready actions, let the editorial model rank target
   coverage, narrative/taste fit, reversibility, expected rework, time and cost.
10. Compile and preview the selected bounded operation or subgraph.
11. Update CurrentStateFacts from the actual preview, not the prediction.
12. If a predicate failed, repair that node once when a legal repair exists;
    otherwise return review, clarification or capability gap.
13. Stop when all required predicates pass, the user stops it, the budget ends,
    or no legal progress is possible.
```

Dependencies decide much of the order. For example:

```text
source identity and rights
  -> source selection and story structure
     -> trims and picture timing
        -> compositions, transitions, masks and reframes
           -> stable picture-dependent SFX
              -> finishing grade, mix, captions and delivery QC
```

This is not an inflexible universal pipeline. A colour test can happen early;
music structure can guide the first cut; a generated composition can be
developed in parallel with a disjoint sequence. The actual order comes from
the operation graph's dependencies and invalidations. Final work is delayed
only when an upstream change would invalidate it.

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
goal then makes a generated/hybrid composition candidate eligible. Its source,
font, geometry and timing requirements must pass before preview. The preview
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

## Required implementation order

This document does not authorize the production implementation before the
open-ended planning experiment. When that gate permits the infrastructure work,
the order is:

1. Freeze the evidence-kind taxonomy and source/proxy coordinate contract.
2. Implement `EvidenceObservationV1`, coverage/sampling maps and durable storage.
3. Define `OperationEvidencePolicyV1` for the benchmark's existing operators.
4. Implement the pure sufficiency report and missing-evidence derivation.
5. Add idempotent `AnalysisDemand` records and one dense visual analyzer path.
6. Prove the match-cut hand-position fixture and one mask/track fixture.
7. Add the durable `GoalGraph`, `DeltaSet` and next-action research loop.
8. Benchmark next-action choice, not only one-shot graph serialization.
9. Only then propose production shadow integration through the frozen IF1/
   ProjectService boundary.

## Primary sources

- [Adobe Premiere media intelligence and Search panel](https://helpx.adobe.com/premiere/desktop/organize-media/file-organization/media-intelligence-and-search-panel.html)
- [Adobe analysis metadata caching](https://helpx.adobe.com/premiere/desktop/organize-media/file-organization/manage-media-intelligence-metadata.html)
- [Adobe reconnecting full-resolution media](https://helpx.adobe.com/premiere/desktop/organize-media/ingest-proxy-workflow/reconnect-full-resolution-media-to-proxies.html)
- [Adobe locating and linking offline files](https://helpx.adobe.com/premiere/desktop/organize-media/file-organization/locate-and-link-offline-files.html)
- [Adobe Productions for long-form work](https://helpx.adobe.com/premiere/desktop/collaborate-with-others/collaborate-using-team-projects/when-to-use-team-projects-and-when-to-use-productions.html)
- [Google Gemini video understanding and sampling](https://ai.google.dev/gemini-api/docs/video-understanding)
- [Adobe After Effects mask tracking](https://helpx.adobe.com/after-effects/using/rigid-mask-tracking.html)
- [Adobe After Effects content-aware fill](https://helpx.adobe.com/after-effects/using/content-aware-fill.html)
- [ACES Metadata File specification](https://docs.acescentral.com/amf/specification/)
- [EBU R 128 loudness recommendation](https://tech.ebu.ch/publications/r128)
- [OpenTimelineIO feature matrix](https://opentimelineio.readthedocs.io/en/latest/tutorials/feature-matrix.html)
- [SMPTE ST 2067 IMF overview](https://www.smpte.org/standards/st2067)
- [Frame.io frame-accurate comments](https://help.frame.io/en/articles/9105251-commenting-on-your-media)
- [Meta SAM 2 research](https://ai.meta.com/research/sam2/)
- [Meta/Oxford CoTracker repository](https://github.com/facebookresearch/co-tracker)

## Acceptance statement

The evidence architecture passes only when an auditor can answer, for any
planner operation:

```text
why this evidence kind was required;
which exact source/timeline range it covered;
what frames/samples and fidelity were inspected;
which analyzer/version/parameters produced it;
where the derived artifacts and canonical observation live;
which metric and threshold established sufficiency;
what was missing or contradictory;
how the preview/final render proved the requested result;
and why the selected next action was eligible before it executed.
```

If any answer is only “the model believed it,” the operation is not
production-certified.
