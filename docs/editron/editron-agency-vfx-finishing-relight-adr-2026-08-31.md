# Editron agency VFX, finishing and relighting ADR - 2026-08-31

## Status

`ACCEPTED_SCOPE / IMPLEMENTATION_OPEN`

This ADR expands `AGENCY_100GB_4H_V1`. It does not implement a VFX, colour,
relighting, conform, IMF or archive owner; authorize provider spend; mutate a
project; or certify the agency class.

## Founder decision

The following capabilities are required in the first agency infrastructure and
are not deferred to film-post certification:

- editable rotoscoping, keying and tracking;
- plates, EXR interchange and VFX pulls with handles and identity;
- non-destructive temporally consistent relighting;
- picture-lock/version identity sufficient for conform workflows;
- online conform, reconform and change lists;
- mastering and a declared agency IMF delivery class; and
- archive plus verified restoration into a fresh environment.

CAP-2 V11 must freeze the exact production-grade agency subclasses. This is not
permission to claim every possible film/VFX/IMF variation.

## Current code truth

- No relight, Depth Anything, Lambertian-light or virtual-light product owner is
  present in `app`, `components`, `lib/editron`, `modal` or Editron tests.
- The current planner research explicitly reports moving-matte/segmentation and
  tracked-fine-contour matte capability gaps.
- CAP-1 records masks/mattes/keying, roto, tracking, professional VFX publish,
  managed finishing, conform/turnover and restoration as missing or partial.
- Professional reconform, change-list, IMF, VFX-pull and archival-restoration
  product paths were not found. Existing bounded retime/project owners refuse
  mixed-track reconform rather than invent it.
- Proxy/master time mapping, source pins, transcode/recovery components and
  ProjectService relink provide useful foundations. They do not yet form a
  professional online conform or finishing system.
- Editron already has Modal/PyTorch CUDA GPU paths for other analyzers. That
  makes a server-GPU spike plausible but does not make relighting implemented or
  prove that an existing worker is the correct deployment owner.
- The creative knowledge graph contains lighting analysis, grade consistency,
  skin-tone protection, highlight/shadow consistency and temporal-flicker
  constraints. It does not contain an executable relighting capability.

## Relighting brief assessment

The supplied `editron-relight-pipeline-brief (1).md` is treated as a proposal,
not executable instruction. Its useful core is:

```text
video frame
-> temporally consistent depth/geometry evidence
-> approximate normals and subject/region evidence
-> bounded deterministic light transform
-> non-destructive preview and render
```

The brief correctly distinguishes cheap depth-guided shading from expensive
per-frame diffusion. It also correctly identifies temporal flicker and server
GPU cost as first-class problems.

The proposed ingest-time default bake is rejected. It would change every clip
before editorial intent exists, spend GPU budget on unused footage, complicate
proxy/master invariance and make reversal difficult. Relighting is instead a
range-scoped, editable project effect that the user or planner may propose. The
source and master bytes remain immutable.

TypeGPU is a useful WebGPU/TypeScript reference, not the selected server
runtime. Editron's browser remains a low-compute terminal. Candidate server
runtimes must be measured against the current trusted GPU-job, storage, budget,
recovery and final-render owners before selection.

## Model and licence gate

The first shared benchmark must compare at least:

1. Depth Anything V2 Small plus an explicit temporal-consistency strategy; and
2. Video Depth Anything Small with its native long-video temporal model.

The official repositories state that the Small weights are Apache-2.0, while
larger Base/Large variants use CC-BY-NC-4.0. Only weights and dependencies that
pass a separately recorded commercial-rights review may enter the agency
runtime. Model-name familiarity or an open code licence is not a complete
training-data, patent or deployment-rights review.

Primary sources:

- <https://github.com/DepthAnything/Depth-Anything-V2>
- <https://github.com/DepthAnything/Video-Depth-Anything>
- <https://github.com/software-mansion/TypeGPU>

## Production relight contract

The eventual operation must declare:

- exact project, source version, stream, epoch and timeline range;
- immutable input media and proxy/master mapping;
- model/runtime/checkpoint and commercial-rights identity;
- depth, subject/region, temporal confidence and invalidation lineage;
- editable light direction, intensity, falloff, warmth and protected regions;
- working/output colour space and bit-depth limits;
- skin-tone, highlight, shadow, halo, edge and flicker proof;
- latency, GPU-memory, GPU-time, storage and delivery-cost ceilings;
- preview, final-render, undo/replay, reload and archive behavior; and
- structured safe-stop reasons.

The effect must not claim to reconstruct information that the camera never
captured. Clipped highlights, crushed shadows, heavy motion blur, reflective or
transparent geometry, fine hair and uncertain depth may require reduced effect,
manual masks or a safe stop. “Users never need to care about lighting” is not an
honest product promise; the supported promise is “Editron can improve declared
lighting problems non-destructively when evidence and preservation gates pass.”

## VFX preparation contract

Agency certification requires one canonical compositing state and renderer for:

- vector and object masks with feather, expansion, inversion and alpha modes;
- editable temporal mattes and manual correction strokes;
- colour/chroma keying with spill and edge controls;
- point/planar/object/face tracking subclasses selected by CAP-2 V11;
- plate and matte source/version identity;
- EXR sequence/channel/alpha/colour metadata for declared formats;
- VFX pulls with source handles, shot/task/version identity, burn-ins and
  checksums; and
- preview, correction, save/reload, proxy/master relink, render, undo and
  turnover proof.

Generated composition may consume declared masks/tracks and render bounded
visuals. It may not become a second source, timeline, matte, colour or VFX-pull
authority.

## Finishing contract

Agency certification requires:

```text
approved sequence version
-> picture-lock/version identity
-> verified proxy-to-master conform
-> master-source render and QC
-> later editorial change
-> deterministic reconform + human-readable/machine-readable change list
-> versioned master
-> declared IMF package + validation
-> content-addressed archive manifest
-> restore into a fresh isolated runtime
-> relink, reread and rerender verification
```

The agency IMF class must name its application constraints, essence codecs,
audio layouts, captions/subtitles, supplemental versions, identifiers and
validator. A ZIP containing media is not IMF. An archive upload is not a
restoration pass.

## QA and acceptance

The fast lane uses small deterministic clips to prove operation semantics and
safe stops. Release certification uses rights-cleared material within the real
100 GB/four-hour envelope and includes:

- moving hair, occlusion, transparency/reflection and keying edges;
- subject/camera movement and track loss;
- mixed and changing illumination, different skin tones, clipped highlights,
  crushed shadows and a flicker-prone clip;
- proxy/master relink after VFX and relight edits;
- an editorial version change after lock, with reconform and change-list proof;
- EXR/plate/VFX pull round-trip;
- ordinary delivery plus the declared IMF package and independent validation;
- interrupted archive creation and a clean-environment restoration drill; and
- exact/perceptual/human evidence with correction time and complete cost.

## Sequencing

This scope joins Queue item 7's agency capability closure and Queue items 8-9's
render, delivery and recovery proof. It does not replace current Queue 3-5
dependencies. The intended dependency order is:

```text
CAP-2 V11 supported-subclass freeze
-> media time/proxy + mutation safety
-> mask/matte/track and finishing identities
-> relight candidate spike and rights gate
-> product owners and ProjectService commands
-> fast QA integration
-> full-envelope VFX/conform/IMF/archive evidence
-> qualified human acceptance
```

## Forecast impact

The previously recorded agency-first order deferred most of this work. Bringing
it into the first class materially extends the critical path. Under fixed scope,
available infrastructure/fixtures and real independent-lane execution, the
current estimate is 14-20 weeks to a complete technical agency candidate and
18-26 weeks to the full release evidence, qualified acceptance and readiness
receipt. CAP-2 V11 is the first mandatory recalibration point.
