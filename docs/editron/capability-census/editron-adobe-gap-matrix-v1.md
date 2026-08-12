# Editron CAP-1 — official Adobe/Frame.io function and gap map

Date: 2026-08-13
Branch: `infrastructure-improvs-+Editron`
Input truth: `editron-capability-census-v1.json` (`CAP-0_CURRENT_TRUTH_FROZEN`)
Machine packet: `editron-adobe-gap-matrix-v1.json`

## Result

The Adobe-class destination is much larger than the overlay/chat surface that
Editron exposes today. This comparison freezes the external target without
pretending that every Adobe workflow is one tool, and without treating product
duties such as rights, proof, safety, review, scalability, or certification as
toolbar commands.

Every row is one of:

- `ATOMIC_FEATURE`: a directly invokable media operation or management
  function;
- `COMPOSITE_WORKFLOW`: a multi-step outcome that composes atomic features and
  durable handoffs;
- `PRODUCT_DUTY`: an Editron operating responsibility, not an Adobe command.

Every Adobe/Frame.io row cites official current documentation checked on
2026-08-13. The displayed page update date is stored in the machine packet.
The product changes continuously, so CAP-1 records documentation dates instead
of inventing a single permanent "Adobe version." Beta documentation is not
silently treated as a stable requirement.

Frozen packet size: **118 rows** — 90 atomic features, 20 composite workflows,
and 8 product duties. Current Editron classification is 52 partial, 8
research-only, 58 missing, and **0 certified**. The 110 external-comparison
rows resolve to 44 official Adobe/Frame.io source pages; product duties use one
clearly separated internal plan source.

## What the comparison proves

1. Editron is not currently an Adobe replacement. CAP-0 certifies **zero**
   capabilities, and CAP-1 does not upgrade any status.
2. The current system has useful partial foundations: projects, media upload,
   range-based overlays, transform keyframes, captions, transitions, graphics,
   music/SFX, analysis jobs, render jobs, and an IF1 contract artifact.
3. Those foundations are not yet a professional NLE, compositor, audio
   workstation, delivery queue, or client-review system. Tracks, source/record
   editing, professional trims, proxy/relink, timecode identity, multicam,
   masks/mattes/tracking, managed color, scopes/HDR, professional mixing,
   interchange/conform, review/approval, and secure sharing are missing or only
   partial.
4. Generated composition is first-class, but it does not erase native editing.
   It is the right owner for authored/generated layouts, typography, shapes,
   masks, procedural motion, and reference-driven composites. Canonical source
   ranges, tracks, trims, audio, project revisions, and delivery remain native
   platform responsibilities.
5. A strong model cannot manufacture a missing certified renderer operation.
   It may plan or generate against declared capabilities; the compiler and
   runtime must still reject unsupported state or execution. Adobe's own 2026
   AI features reinforce the separation: Media Intelligence retrieves source
   ranges, Generative Extend creates bounded media, and After Effects' beta AI
   Assistant performs a documented subset of project/expression/generation
   tasks. None of those is evidence that an unrestricted model can safely
   synthesize every edit graph.

## Product-surface verdict

| Surface | Current Editron truth | Major missing production blocks |
| --- | --- | --- |
| Premiere-class NLE | Partial overlay/range editing with divergent callers | tracks, source/record, insert/overwrite, lift/extract, full trim family, markers, multicam, proxy/relink, timecode/reels, managed color/scopes/HDR, complete interchange, multimodal project-media search, bounded generative-media provenance and long-form collaboration |
| After Effects-class composition | Partial text/graphics/keyframes plus research-stage generated compositions | composition graph, masks/mattes/keying, roto/tracking/stabilization, general expressions, 3D, OCIO/ACES, safe plug-ins, governed AI assistance and VFX publish/version workflow |
| Audition-class audio | Partial clip/music/SFX/dubbing/beat paths | waveform/spectral repair, multitrack routing, buses/sends, automation, meters/loudness, restoration, surround, stems and turnover |
| Media Encoder-class delivery | Partial render jobs and basic outputs | governed presets, multiple outputs, watch folders, verified ingest, proxy transcode identity, professional format matrix, parallel scheduling, durable cancel/resume and QC receipts |
| Frame.io-class review | Partial asset ingest and review assistance | timecoded comments/annotations, version stacks, comparison, secure shares, approvals, roles, watermarking, transfer manager and Camera-to-Cloud |

## Critical architecture conclusions

### Native editing is not “whatever is simple”

Native editing owns project and timeline truth: source identity, ranges, tracks,
edits, retimes, masks, audio routing, color state, revisions, receipts, undo,
replay, interchange and delivery bindings. An operation does not become a
generated composition merely because it has several steps.

### GeneratedCompositionProgram is not an MG fallback

It is an editable, versioned program for visual structures that are naturally
described as a composition: a moving filmstrip, multi-panel collage, custom
title sequence, data-driven graphic, mask-driven composite, or a hybrid visual
section. It may reference canonical source ranges, but it must not become a
second media/timeline/project authority. Its code runs only against an allowed,
versioned media-composition API with declared inputs, limits and proof.

### Composite workflows must not be miscounted as buttons

“Proxy edit and online conform,” “multicam,” “client approval,” and “audio
turnover” are workflows. A single UI control or route is not parity. The packet
therefore lists their required atomic dependencies and leaves them missing or
partial until the full producer → owner → state → renderer/consumer → proof
chain works.

### Product duties remain explicit

Rights, privacy/egress, prompt-injection safety, no false success, background
editing conflicts, long-form scaling, capability promotion, model evaluation,
and replacement certification are duties of Editron itself. They must not be
hidden inside an LLM prompt or mislabelled as Adobe features.

## Risk-ranked gap groups

### P0 — authority and false-success safety

- finish migration to one ProjectService revision/receipt/proof authority;
- replace no-op, preview-only, silent-fallback, and information-only success;
- keep playback/user edits available during background work through
  revision-scoped drafts, rebase/conflict handling, and atomic publish;
- unify render cancellation, failure receipts, visual proof and audible proof.

These gates precede production model mutation. Otherwise a better planner only
drives inconsistent writers faster.

### P0 — canonical NLE substrate

- source/timecode/reel identity and versioned timebases;
- video/audio tracks, targeting, locking and channel layouts;
- source/record monitoring and three-point editing;
- insert/overwrite/lift/extract plus frame-accurate regular/ripple/rolling/slip/
  slide/rate-stretch semantics;
- proxy derivatives, offline media and relink;
- markers, takes and multicam.

Without this substrate, generated reference edits remain isolated demos rather
than durable editable projects.

### P0 — make today’s visible editing reliable

- one caption form resolver with legal fonts, accessible layout and rendered
  evaluation;
- one transition resolver with a licensed/tested catalog and real handles;
- one generated-composition programme in place of conflicting MG authorities;
- one audio event/mix owner for dialogue, music, SFX, ambience and dubbing;
- repair the documented beat-analysis caller divergence before certification.

### P1 — professional finishing and handoff

- masks/mattes/keying/tracking/stabilization and compositing;
- managed RAW/log color, grading, scopes and HDR/SDR;
- waveform/spectral restoration, buses, sends, automation, loudness, stems and
  surround-ready audio foundations;
- interchange with explicit loss matrices, conform/reconform, VFX pulls,
  turnovers, burn-ins and change lists;
- multi-format mastering, QC, checksums, manifests and archive/restore drills.

### P1 — review and collaboration

- timecoded comments and annotations;
- review asset versions and comparison;
- approval state bound to the exact rendered revision;
- secure shares, permissions, expiry, watermarking and audit;
- project/sequence locking that still permits read/play/copy behavior.

## Source rules

- Adobe and Frame.io rows use only official product documentation.
- The internal execution plan is cited only for `PRODUCT_DUTY` rows.
- Documentation proves the external comparison target; it does not prove that
  Editron implements it.
- CAP-0 code evidence decides Editron status. A planner name, UI label, shared
  helper, renderer enum, or unverified test does not upgrade a row.
- Interchange is never assumed lossless. Adobe itself documents that some Final
  Cut Pro XML effects, transitions and audio adjustments do not translate.

## Next gate

After human review of this CAP-1 packet, `V2-0` may derive **research-only**
OperatorSpecs from approved atomic rows. V2-0 must not copy the Adobe UI, create
a second registry, authorize production model mutation, or advertise missing
capabilities. Each OperatorSpec still needs:

- canonical owner and mutation path;
- input/output schema and declared state effects;
- support status and planner eligibility;
- deterministic validator/compiler handoff;
- proof obligation and version;
- undo/replay and failure dispositions;
- reproducibility, privacy/egress/injection, rights and project-profile
  certification bindings.

CAP-1 therefore freezes the target map. It does not start Adobe-class feature
implementation and does not claim replacement readiness.
