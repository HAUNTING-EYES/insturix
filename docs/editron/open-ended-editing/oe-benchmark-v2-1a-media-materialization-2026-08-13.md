# Editron OE Benchmark V2-1A — Development Media Materialization

Date: 2026-08-13
Branch: `infrastructure-improvs-+Editron`
Status: development media materialized and hash-frozen; no model run

## Result

The eight development-task recipes frozen in V2-0 now produce actual, viewable/audible media:

- 5 H.264 MP4 videos, 68 seconds total;
- 2 mono 48 kHz PCM WAV files, 36 seconds total;
- 1 RGB PNG reference image;
- 3,712,715 encoded bytes in total.

Two complete materialization runs produced a byte-identical manifest. Every manifest artifact hash was independently recalculated from disk and matched.

This result proves deterministic development-fixture generation on the recorded toolchain. It does **not** prove model planning, professional creative quality, production mutation, cross-platform encoded-byte identity, or holdout performance.

## Existing-owner reconciliation

Repository search found an existing owner for V1 planner-packet materialization but no owner that generated the synthetic media named by the task recipes. V2-1A therefore adds one research-only media materializer and reuses the existing server FFmpeg resolver.

It does not add:

- a second planner/operator registry;
- a project, timeline, checkpoint, or render authority;
- a provider or network caller;
- a replacement for the V1 planner-packet materializer;
- production media-generation behavior.

## Provenance model

Each manifest record separates three identities:

1. `recipeSha256` — canonical hash of the frozen V1 asset recipe;
2. `contentSha256` — raw RGB-frame or PCM-sample identity before encoding;
3. `artifactSha256` — exact MP4, WAV, or PNG byte identity.

The manifest also binds:

- V1 development-task fixture SHA-256;
- V2 task fixture SHA-256;
- materializer source SHA-256;
- Node version, OS, and architecture;
- FFmpeg version and binary SHA-256;
- exact video encoding profile.

This distinction matters because raw content can remain deterministic even when another explicitly recorded platform/codec build produces different container bytes.

## Media semantics

The controlled fixtures encode the evidence required by the four visible development tasks:

- `DEV-01`: host-left/product-right reveal plus two speech-envelope ranges over a constant bed;
- `DEV-02`: two opposed-motion source clips and a five-panel black-gutter centered-title reference;
- `DEV-03`: four visually distinct shot sections, a 120 BPM click grid, strong accents, and a protected dialogue range;
- `DEV-04`: a changing-size foreground subject crossing a central title zone without a supplied matte.

These are intentionally simple geometric proxies. Their purpose is to make target reconstruction, operation selection, evidence use, and rendered differences objectively inspectable. They are not presented as client footage, a caption-style corpus, or an editor-taste benchmark.

## Deterministic generation rules

- Inputs come only from the hash-bound development fixtures.
- No download, stock lookup, model generation, or fallback media is allowed.
- Video frames are rendered as deterministic RGB24 buffers.
- Audio is synthesized as deterministic signed 16-bit PCM.
- Video encoding uses one thread, bit-exact flags, fixed GOP parameters, stripped metadata, and the repository FFmpeg owner.
- Files are produced through exact temporary targets and renamed only after successful completion.
- Broad output directories such as the repository root are rejected.
- Unknown asset IDs, recipe drift, missing bindings, and FFmpeg failures stop the run.

## Artifacts

Tracked:

- `lib/editron/research/open-ended-planner/media-materializer-v2.ts`
- `scripts/materialize-open-ended-planner-v2.ts`
- `tests/fixtures/editron/open-ended-planner-v2/development-media-manifest-v2.json`
- `tests/editron/open-ended-planner-v2-media-materializer.test.ts`
- this closeout document

Generated and gitignored:

- `.calibration-temp/open-ended-planner-v2/development-media/`
- `.calibration-temp/open-ended-planner-v2/development-media-manifest-v2.json`
- `.calibration-temp/open-ended-planner-v2/inspection/`

The tracked manifest is the frozen provenance record. The media can be reproduced locally with:

```powershell
pnpm exec tsx scripts/materialize-open-ended-planner-v2.ts
```

## Inspection and verification

Container inspection confirmed:

- MP4: H.264 High, `yuv420p`, 30 fps, expected 640×360 or 360×640 dimensions and exact expected durations;
- WAV: PCM signed 16-bit little-endian, 48 kHz, mono, exact expected durations;
- PNG: RGB24, 360×640.

Visual frame inspection confirmed the product reveal, moving blue/yellow sources, five-panel reference, four card sections, and foreground crossing. Waveform inspection confirmed the two DEV-01 speech regions and DEV-03 periodic beat spikes/protected dialogue region. Peak levels remained below clipping.

Automated verification:

- V2 fixture + media tests: 14/14 passed;
- repeated real FFmpeg encode: identical raw-content hash and MP4 bytes;
- `pnpm exec tsc --noEmit`: passed with an 8 GB Node heap;
- `pnpm exec eslint . --quiet`: passed with an 8 GB Node heap.

## Boundary and next slice

Only development media was materialized. The eight sealed holdout tasks remain inaccessible to providers and their media remains unmaterialized.

V2-1B is the next bounded slice:

1. assemble per-stage model-visible development packets;
2. mechanically prove `evaluatorOnly` fields cannot enter provider payloads;
3. capture every stage artifact and the frozen budget/termination telemetry;
4. run a no-provider harness smoke before authorizing any development model call.

V2-1B still must not mutate ProjectService, render through production owners, expose holdout evaluator data, or claim that a model has passed the benchmark.
