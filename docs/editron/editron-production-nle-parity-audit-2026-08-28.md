# Editron production NLE parity audit — 2026-08-28

## Decision

Editron is not yet an Adobe Premiere Pro- or DaVinci Resolve-class editing
runtime. It has several strong safety and proof components, but many are
research-only, bounded to selected operations, or stop safely where a
professional NLE would continue through an explicit conform workflow.

The frozen Stage 2.5 decision of `MODIFY` is therefore correct. It must not be
rewritten. The route to `GO` is to close the gaps below and issue a new,
versioned successor readiness receipt. `GO` cannot be obtained by changing the
meaning of the existing evidence.

The most important correction is this:

```text
Current mixed-rate behavior
  exact same-rate CFR -> run
  mixed CFR / VFR / fractional project rate -> block without mutation

Required production behavior
  ingest exact timestamps -> establish an editorial time identity
  -> choose and record an explicit conform policy
  -> preview and render by timestamp
  -> preserve source-to-proxy-to-master mappings
  -> block only corrupt, ambiguous, unsupported, or unprovable cases
```

The existing block is valuable containment. It is not the finished product.

## Scope and evidence standard

This is a capability-level audit of the declared Editron surface, not a claim
that every line in every historical file has been manually inspected. It
reconciles:

- the 118-row CAP-1 Adobe workflow/gap inventory;
- the 37 currently declared CAP-2 atomic-operation candidates;
- the CAP-0 caller/renderer/operation census;
- current ProjectService mutation owners and their direct callers;
- current media identity, PTS, proxy/master, renderer and delivery owners;
- the Stage 2.5 receipts for RHC-01 through RHC-04, long-form evidence, paid
  cohort audit and frozen decision;
- official Adobe and Blackmagic descriptions of mixed-rate/VFR behavior; and
- a source inspection of OpenCut at public repository commit
  `400f097b...` and its classic implementation at `cf5e79e...`.

Code remains the source of truth. Existing matrices remain the row-level
inventories:

- [CAP-0 capability census](./capability-census/editron-capability-census-v1.md)
- [CAP-1 Adobe gap matrix](./capability-census/editron-adobe-gap-matrix-v1.md)
- [Stage 2.5 paid-cohort audit](./open-ended-editing/oe-stage25-final-paid-cohort-audit-2026-08-26.md)

At this checkpoint CAP-1 contains 90 atomic capabilities, 20 workflows and 8
cross-cutting duties. Its dispositions are 52 partial, 8 research-only and 58
missing; none is certified. CAP-2 declares 37 candidates; none is yet
production-certified. RHC-01 through RHC-04 are route and handoff canaries, not
a substitute for those capability rows.

## What Premiere Pro and Resolve actually do with frame rates

### Publicly documented behavior

Adobe documents that a clip whose frame rate differs from the sequence is
automatically conformed to the sequence while preserving normal playback speed.
It also exposes a separate Interpret Footage action when the editor deliberately
wants to reinterpret playback rate and duration. Premiere's VFR guidance offers
different choices: preserve audio synchronization by adding/dropping video
frames, use every video frame with possible audio drift, or transcode VFR to a
CFR intermediate for a more dependable proxy/consolidate workflow.

Blackmagic documents the same broad model: clips are conformed to a timeline
rate, with retime processing choices such as nearest-frame/drop-duplicate,
frame blend and optical flow. Resolve also has explicit project/import controls
for mixed-frame-rate media.

Primary/public references:

- [Adobe: edit mixed frame-rate footage](https://helpx.adobe.com/ee/premiere-pro/how-to/mixed-frame-rates.html)
- [Adobe: sequence timebase settings](https://helpx.adobe.com/premiere/desktop/edit-projects/change-clip-sequence/sequence-settings-reference.html)
- [Adobe: Interpret Footage frame rate](https://helpx.adobe.com/premiere/desktop/edit-projects/modify-clip-properties/change-the-frame-rate-of-a-clip.html)
- [Adobe: VFR workflow guidance](https://community.adobe.com/questions-729/faq-how-to-work-with-variable-frame-rate-vfr-media-in-premiere-pro-1349720)
- [Adobe: audio sample-rate handling](https://helpx.adobe.com/premiere/desktop/organize-media/import-files/audio-sample-rates-in-premiere.html)
- [Blackmagic: DaVinci Resolve reference manual](https://documents.blackmagicdesign.com/UserManuals/DaVinci_Resolve_15_Reference_Manual.pdf)
- [Blackmagic: Resolve 20 Colorist Guide](https://documents.blackmagicdesign.com/UserManuals/DaVinci-Resolve-20-Colorist-Guide.pdf)

This does **not** mean those products make every VFR file perfect. Adobe has
publicly acknowledged real VFR drift, stutter, duplication and export mismatch
cases. The professional behavior is to retain explicit time/conform choices and
fall back to a controlled transcode when direct consumption is unreliable—not
to approximate silently.

### What can and cannot be copied

Adobe and Blackmagic's internal architectures are proprietary. We can reproduce
their observable contract, but cannot honestly claim to implement their exact
private infrastructure. The architecture below is an Editron design inference
that produces the same required behavior and can be independently tested.

OpenCut contributes two useful public patterns:

- rational project frame rates instead of a floating `number`; and
- integer media-time ticks plus timestamp-based decoded-frame access.

OpenCut is not a complete answer. In the inspected classic implementation,
asset FPS is still rounded in one ingest path, export is fixed-CFR, and no
durable private per-frame VFR PTS sidecar, discontinuity epoch contract, or
verified proxy/master online mapping was found. It is a reference for selected
data types and preview mechanics, not a production conform system to copy
wholesale. Public source: [OpenCut](https://github.com/opencut-app/OpenCut).

## Root cause of Editron's current mixed-rate limitation

Editron already has good upstream vocabulary:

- rational source rate;
- SOURCE_PTS identity;
- VFR cadence metadata;
- a private PTS sidecar adapter;
- proxy/master transition records; and
- sample-aware audio proof.

But the actual project and renderer boundary still uses values such as:

```text
Project.fps: number
overlay.from / durationInFrames: integer project frames
sourceStartFrame / sourceEndFrame: integer source frames
Remotion <Video startFrom={sourceStartFrame}>
```

That creates a precision cliff. A 29.97 source cannot be mapped truthfully into
a 30 fps project by one integer-frame offset, and a VFR source does not have one
constant frame duration at all. `video-source-time-transform-v1.ts` therefore
blocks these cases rather than inventing a mapping. The block is correct at
that boundary; the boundary itself must now be replaced.

## Required production time architecture

### 1. Canonical time values

Use an immutable rational/integer representation at every owner boundary:

```text
RationalRate       = { numerator, denominator }
MediaTime          = { ticks, timescale }
AudioSampleRange   = { startSampleFrame, endSampleFrame, sampleRate }
SourcePosition     = { sourceVersion, streamId, epochId, pts }
TimelinePosition   = { projectRevision, sequenceId, time }
```

`ticks` must be serialized as a lossless integer, not a JavaScript float.
Ordering and conversion use integer cross-multiplication with overflow-safe
arithmetic. Audio remains in integer sample frames; it is not rounded through a
video frame rate. SMPTE/drop-frame values are display labels derived from the
canonical coordinate, never the stored source of truth.

### 2. Ingest and PTS index

For every decodable stream, ingest records at least:

```text
PTS, duration, decode-order/keyframe seek data, stream timebase, epoch,
source-object version/hash, scan version and cadence classification
```

Timestamp resets, gaps, overlaps and wraps create explicit epochs. Editron must
not force discontinuous media into one fictional monotonic frame counter. A
clip binds one or more declared epoch ranges, or the operation blocks with the
exact ambiguity.

The existing private R2 PTS sidecar is reusable as storage plumbing, but a real
dedicated private bucket, lifecycle policy, live write/read/hash probe and
recovery proof are still required.

### 3. Explicit conform policy

Each clip records a policy; no hidden approximation is allowed:

- `PRESERVE_REAL_TIME_NEAREST`: preserve duration/audio; hold/drop/duplicate the
  nearest source image at timeline sample instants;
- `FRAME_BLEND`: blend adjacent source presentations;
- `OPTICAL_FLOW`: synthesize intermediate images through a separately certified
  motion owner;
- `INTERPRET_RATE`: intentionally change playback duration using a declared
  source-rate interpretation;
- `TRANSCODE_TO_CFR_PROXY`: create a controlled CFR intermediate while
  retaining the source/master mapping.

The default for ordinary mixed-rate editorial media is preserve real time and
audio sync. Interpret-rate is an explicit creative action, never an ingest
side effect.

### 4. Timestamp-driven preview and render

For every output frame time, the renderer asks the conform owner which source
presentation interval covers that time. It does not calculate
`sourceStartFrame + outputFrame`.

The current Remotion renderer can remain a generated-graphics compositor, but
its integer `startFrom` video path cannot remain the authoritative native-media
decoder for mixed/VFR sources. A timestamp-aware media decode/conform service
must supply exact frames or a verified conformed proxy. Final export samples the
timeline at the declared rational delivery rate and binds frame/audio proofs to
the same mapping.

### 5. Proxy/master invariance

Proxy creation records immutable anchors between proxy PTS and master PTS for
every epoch. Relinking may change the decoded object, never the editorial
coordinate. Promotion to master must:

1. compare-and-set the expected source/proxy revision;
2. validate mapping anchors, duration, cadence, audio and source identity;
3. invalidate dependent analysis/render caches;
4. rerender boundary samples and audio windows; and
5. roll back visibly if equivalence cannot be proved.

The current transition owner performs a useful CAS/invalidation skeleton but
does not yet materialize this source-time mapping or complete live project and
render proof.

### 6. Fail-closed cases that should remain

Even a production NLE must stop when media is undecodable, timestamps are
contradictory, an epoch is not selected, a proxy/master mapping is missing, a
required codec or optical-flow owner is unavailable, or proof cannot establish
the requested preservation. The product improvement is converting normal
mixed-rate and VFR media from “unsupported” into explicit conform workflows—not
removing safety stops.

## Native, generated and hybrid: the production categorization

Native/generated/hybrid are execution strategies, not edit categories. “Place
an image,” “make a chapter card,” “cut dialogue,” and “build a result card” are
edit requirements. More than one strategy may satisfy a requirement.

The router must use this order:

1. **Decompose the request.** Record target claims, preservation claims,
   coordinate ranges, required evidence, editability and delivery requirements.
2. **Enumerate real candidates.** A candidate may use only registered owners
   whose inputs and proof capabilities exist now.
3. **Hard-filter candidates.** Reject any candidate that cannot prove source,
   timebase, audio, boundaries, rights, revision, editability, delivery or
   rollback requirements.
4. **Compare eligible candidates.** Rank target fidelity, preservation,
   canonical editability and continuity before aesthetic risk, latency and
   cost. Do not route by operation count.
5. **Apply project policy/user choice.** If two candidates are materially
   equivalent, use the declared project preference or show bounded previews;
   do not pretend one route is universally superior.
6. **Compile through canonical owners.** The selected strategy produces
   commands for ProjectService and the authoritative media/render owners. The
   planner or generated runtime never becomes a second project authority.

Strategy meanings:

| Strategy | Use when | Important limit |
| --- | --- | --- |
| Native | Existing editable timeline/overlay/audio primitives cover every claim. Still-image placement is native when its image, transform, typography, timing and proof owners exist. | “Native” is not automatically better if it cannot represent the requested form faithfully. |
| Generated | A bounded, self-contained authored visual or clip is best represented as an editable generated program and it owns every required output it is allowed to change. | It cannot silently take ownership of existing dialogue, source identity or the project timeline. |
| Hybrid | A generated visual island is composited inside a native timeline while native media/audio remains authoritative. | Requires exact timebase, audio-ownership and entry/exit boundary handoffs. |

For RHC-02, native image placement is absolutely possible in principle. The
tested native candidate was blocked because that isolated dispatcher lacked the
complete overlay adapter and exact font binding—not because Editron can never
place an image natively. The hybrid candidate proved one safe alternative:
native timeline/audio continuously owns the interview, while generated
composition owns only frames 300–389 of the picture. That technical handoff
does not decide which route looks better.

The current route-ablation and staged-packet code contains much of this research
vocabulary, but no production router currently owns the end-to-end decision.
That is partial convergence, not a merged routing architecture.

## Why the five paid-cohort rows were confounded

The root cause is now specific:

1. The frozen schema used generic fields `before` and `after` without saying
   which operation was the prerequisite.
2. Canonical serialization displayed the keys alphabetically as `after`, then
   `before`.
3. The prompt supplied no directional definition or worked example.
4. The zero-spend preflight checked hash identity, rule visibility, provider
   parity and evaluator wiring, but not whether the public contract had one
   unambiguous human meaning.
5. Luna's four reversed graphs and Terra's one reversed graph were consistent
   with the opposite reading in their own explanations.

Therefore the historical outputs cannot truthfully be converted into passes or
failures after seeing the answers. They remain immutable
`CONFOUNDED / UNVERIFIABLE`. That is evidence hygiene, not the remediation.

The implemented schema correction—`predecessorOperatorId`,
`successorOperatorId`, explicit semantics and provider/resource accounting—is
necessary. The 74/74 zero-inference gate proves the corrected harness wiring; it
does not prove how a model performs on those task families.

Before any successor paid evaluation, add all of these gates:

- schema lint forbids semantically reversible dependency field names;
- canonical-presentation tests assert prose meaning is independent of key
  order;
- an independent human contract-clarity sign-off occurs before sealing;
- public positive, negative and equivalent-order examples are included without
  revealing holdout answers;
- a contract-comprehension sentinel requires normalized prerequisite meaning;
- unseen isomorphic tasks cover the six real failure families; and
- the cohort receives a new identity and separately capped authorization.

Do not rerun the historical 24 rows. Run a new successor cohort only if, after
runtime safety and product evidence are complete, model inference remains
decision-critical.

## What the long-form receipt means in plain language

| Receipt phrase | Plain meaning | What it does not prove |
| --- | --- | --- |
| Exactly 14,400,000 stereo 48 kHz sample frames | Five minutes × 48,000 audio instants per second. Each instant contains one left and one right sample. | It does not prove a complete five-minute picture render. |
| Decoded PCM equivalence | The files were decoded to raw sample numbers and compared. Matching PCM means the protected audio samples did not change. | It does not mean two lossy review encodes have identical file bytes. |
| No browser/render errors | Chromium/Remotion completed without reported render exceptions. | It does not prove editorial taste, sync outside the measured windows, or every visual frame. |
| Live isolated Atlas compare-and-set update | A temporary real database record changed only when its expected old revision matched. | It was not a live customer project edit. |
| Deliberately stale Atlas update rejected | A second writer using old state could not overwrite the newer state. | It does not prove every mutation owner binds earlier evidence to that revision. |
| Exact fixture cleanup | The UUID-scoped temporary database row was deleted and verified absent. | It says nothing about hosted disaster recovery. |
| Generic R2 reachability | The configured object-store bucket answered a reachability request. | No PTS object was written; the dedicated private PTS store was not configured. |
| Mixed-rate fail-closed | Unsupported timing was rejected before a project write. | It did not successfully conform or edit that media. |

The six named gaps are equally concrete:

1. **Private PTS storage not configured:** the adapter exists, but no dedicated
   live private bucket/write/read/recovery proof exists.
2. **Neo4j unavailable:** the graph retrieval route was not running in the
   evidence execution.
3. **No rights-cleared multi-hour creative project:** synthetic or short
   fixtures tested mechanics, not a real long-form editorial workload.
4. **Retrieval accuracy unjudged:** no labelled editor queries established
   whether the right scenes/ranges were returned.
5. **Audio-only production render:** the long canary proved audio mechanics, not
   full visual playback and export.
6. **Proxy/master, delivery and recovery unproved:** no live online conform,
   invalidation, relink, final delivery, hosted interruption and recovery chain
   completed end to end.

## Production gap register

The table groups all declared CAP-1 rows and additional cross-cutting findings
into execution owners. The linked CAP-1 matrix remains the item-by-item list.

| Area | Current truth | Production target before certification |
| --- | --- | --- |
| Timebase and media identity | Rich contract/PTS research exists; project and renderer remain numeric/integer-frame biased; normal mixed/VFR media stops. | Rational timeline/source identity, PTS/epoch ingest, explicit conform policies, timestamp-driven preview/export and proxy/master invariance. |
| Ingest, proxy and online conform | Upload/storage/analysis and transition pieces exist; source-time mapping and live online proof are incomplete. | Checksummed ingest, background proxy/transcode, immutable mapping, relink/invalidation, master promotion and rollback proof. |
| Core NLE timeline | Selected overlay/cut/retime owners exist; track targeting/locking, insert/overwrite, lift/extract, markers, multicam, source timecode and interchange remain partial or missing. | Canonical editable operations with undo/replay, range/revision evidence and rendered certification per operation. |
| Graphics, captions and generated composition | Several rendered paths and generated-composition mutation owners exist; overlay enums/renderer forms and callers diverge; many paths are preview/research only. | One capability registry, family resolver per form, no shadow form owners, native/generated/hybrid route broker and editable interchange. |
| Audio | Sample-level proof, ducking/SFX/music pieces exist; recording, spectral repair, loudness, routing/buses, channel layouts and turnovers are incomplete. | Sample-accurate timeline, declared channel mapping, loudness/delivery standards, protected-dialogue evidence and full audio operation coverage. |
| Colour and finishing | Metadata vocabulary is incomplete at consumers; scopes, managed colour/HDR/high bit depth and finishing proof are not certified. | Source/display transforms, scopes, HDR/SDR policy, bit-depth/pixel-format proof and delivery transforms. |
| VFX and tracking | Basic transforms/generated visuals exist; masks, mattes, keying, roto, tracking, stabilization and 3D families are largely missing. | Explicit owners or truthful external interchange; never model-invented approximations. |
| Semantic retrieval | Media observations, embeddings and graph contracts exist; live graph availability, labelled accuracy and real multi-hour proof are absent. | Rights-cleared corpus, query gold set, recall/precision/range scoring, source-revision binding and stale-index invalidation. |
| Mutation safety | CAS and stronger specialized owners exist; generic add/update/delete callers do not bind all prior evidence, ranges, locks, rights and invalidations. | One mutation precondition envelope checked by scheduler and independently by every authoritative writer; no false success. |
| Collaboration and review | Hash-bound RHC packet/contracts exist; no submissions, qualification policy, review UI, version-stack/timecoded-comment workflow or independent agreement exists. | Blinded reviewer operations, qualification owner, timecoded comments, approvals/version comparison and audit receipts. |
| Render/export/delivery | Remotion/FFmpeg/cloud pieces exist; full visual long-form, watch folders, parallel outputs, live delivery, hosted recovery and full cost accounting are incomplete. | Deterministic render graph, target-specific validation, retry/recovery, delivery receipts and local/cloud/provider cost attribution. |
| Security, rights and observability | Many fail-closed contracts exist; enforcement is not universal across media, providers and mutations. | Project/tenant-scoped rights and egress, secret-safe telemetry, budget reservation, causal receipts and incident disable/recovery controls. |
| Product UX and parity | Manual, chat, Director and worker paths still diverge. | Same operation owner and semantics regardless of caller; UI exposes conform/conflict/proof choices without hiding safe stops. |
| Certification | Many tests and bounded receipts exist; zero CAP rows are certified. | Per-family fixtures, adversarial/concurrency tests, real rendered proof, editor acceptance and project-class support matrix. |

This means several current “solutions” are intentionally MVP/research-grade:

- mixed-rate rejection instead of conform consumption;
- contract-only rational/PTS identity without a final renderer consumer;
- proxy/master CAS skeleton without online mapping/relink proof;
- selected mutation guards instead of a universal precondition envelope;
- RHC technical renders without qualified aesthetic judgments;
- audio-only long-form proof;
- research route qualification without a production route decision owner;
- semantic plumbing without accuracy judgment; and
- incomplete cost/delivery/recovery accounting.

## Human-quality evidence

The public RHC packet is real and playable, but it has zero qualified
submissions. The review workflow is documented in
[the RHC human-review guide](./open-ended-editing/stage25-rhc-human-review-guide-2026-08-28.md).

The programme owner may give valuable non-blind product feedback. Because this
chat and the engineering documents have disclosed route identities, that
feedback must be labelled `USER_NON_BLIND_AESTHETIC_FEEDBACK`; it cannot satisfy
the existing declaration that candidate/operator identity was not accessed
before completion. A different qualified reviewer who receives only the public
packet is required for the formal blind receipt.

There is another current gap: the contract accepts a truthful qualification
basis, but the programme has not frozen a deterministic reviewer-qualification
policy. That policy and reviewer operations must be versioned before human
evidence can support production promotion.

## Ordered route from MODIFY to a successor GO

These gates are cumulative. A later gate cannot erase an earlier failure.

1. **Freeze this audit and reviewer operations.** Preserve the existing receipt,
   make the packet usable, establish reviewer qualification/blinding policy and
   collect non-blind owner feedback separately.
2. **Canonical time foundation.** Introduce lossless rational time types, PTS
   epochs and migration/read compatibility without yet changing all writers.
3. **Timestamp-aware consumption.** Wire preview, render and analysis to the
   canonical mapping; support preserve-real-time nearest conform first, then
   separately certify blend/optical-flow/interpret-rate policies.
4. **Proxy/master online conform.** Configure private PTS storage and prove live
   proxy generation, mapping, master relink, invalidation and rollback.
5. **Universal mutation envelope.** Inventory every real ProjectService writer;
   enforce evidence, project/source revision, coordinate range, locks, rights,
   predecessors and invalidations both before dispatch and inside each owner.
6. **Production route broker.** Promote the route-neutral requirement and
   candidate-eligibility model into a product owner; keep final form in existing
   family resolvers/renderers.
7. **Capability-family closure.** Implement and certify the CAP-1/CAP-2 rows in
   bounded verticals: core timeline, graphics/captions, audio, colour, VFX,
   interchange, collaboration and delivery.
8. **Real long-form evidence.** Use rights-cleared multi-hour media, labelled
   semantic queries, full visual/audio playback, compaction/resume and measured
   retrieval accuracy.
9. **Delivery, recovery and accounting.** Prove local/cloud rendering, parallel
   outputs, final delivery, hosted interruption/recovery and complete cost
   attribution.
10. **Human acceptance.** Collect qualified blinded RHC-01–04 reviews, a fresh
    isolated measured RHC-04 correction session and independent agreement where
    promotion policy requires it.
11. **Successor whole-episode evaluation only if needed.** Use the corrected,
    comprehension-gated unseen benchmark under new explicit capped authority.
12. **Issue a successor readiness receipt.** `GO` is permitted only if every
    declared blocker is closed or explicitly removed from the supported product
    class. Stage 3 model-driven production mutation remains blocked until then.

## Required proof for the next decision

A successor `GO` packet must show, at minimum:

- a supported project-class matrix rather than “all editing” marketing;
- mixed CFR, VFR and discontinuity fixtures consumed with exact mapping;
- sample-accurate protected audio through preview, render and delivery;
- live private PTS and proxy/master lifecycle evidence;
- stale, overlapping, locked, wrong-project, wrong-range, wrong-revision,
  rights-denied and invalidated-evidence mutations blocked at every writer;
- safely rebasable edits applied only under an explicit policy;
- real rights-cleared multi-hour visual/audio project evidence and retrieval
  scoring;
- qualified route-blind quality receipts and measured correction evidence;
- complete latency/local-compute/cloud/provider cost receipts; and
- hosted render/delivery interruption and recovery proof.

Until those exist, the truthful product position is “selected bounded editing
and route feasibility with strong safe stops,” not “full professional NLE
parity.”
