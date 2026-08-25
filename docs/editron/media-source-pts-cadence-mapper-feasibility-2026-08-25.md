# Canonical media PTS mapper — feasibility boundary (2026-08-25)

## Decision

Do **not** implement a production source-PTS mapper by independently invoking
`ffprobe -read_intervals` at wall-clock offsets and assigning frame ordinals to
the returned frames.  The tool seeks to a nearby keyframe, so the first returned
presentation timestamp can precede the requested offset.  Such chunks cannot
truthfully establish an exact global frame ordinal, complete coverage, or a
gap-free source map.

The only candidate production mapping mode is a source-version-bound,
continuous presentation-order scan with durable checkpoints.  Seek/overlap
partitioning remains an explicit experimental optimization until it proves
exact checkpoint resumption, duplicate handling and complete coverage against
the continuous result.

This is a mapper feasibility decision only.  It does not create a mapper job,
make a PTS map live, certify CFR/VFR, change ProjectService, or authorize a
long-form product claim.

## Reproducible local measurement

The checked-in asset `public/product_demos/showcase/insturix-final-intro.mp4`
was measured locally with FFmpeg 8.1 `ffprobe`.

| Item | Measured value |
| --- | --- |
| SHA-256 | `d95dd77fccaa5e6eb4f1c0e42b399b95a801937c49ef072160d10b2a4208e73f` |
| Video stream | H.264, stream `v:0` |
| Declared rate / timebase | `60/1` / `1/90000` |
| Source duration | `5,827,500` ticks |
| Requested interval | `-read_intervals 30%+3` |
| Requested start in ticks | `2,700,000` |
| First returned `best_effort_timestamp` | `2,505,000` (`27.833…` s) |
| Last returned timestamp | `2,772,000` (`30.800` s) |
| Returned frames | `179` |

The measured first frame is 195,000 ticks (2.166… seconds) before the requested
30-second offset.  That is expected seek behavior, not a fault in this source.
The [ffprobe documentation](https://ffmpeg.org/ffprobe.html) describes
`-read_intervals` starts as seeking; it also states that the interval duration
is evaluated after the actual seek point.  Therefore a requested timestamp is
not an exact global chunk boundary.

## Required mapper shape

1. A signed durable owner claims a map for one immutable `sourceVersionV1`,
   selected video stream, technical-observation hash and mapper policy.
2. It scans presentation order continuously, emitting bounded canonical frame
   line batches.  Each line preserves exact PTS and duration evidence; it never
   synthesizes a duration from nominal FPS.
3. It conditionally writes and read-verifies each private sidecar batch, then
   advances the existing source-bound asset state through the CAS owner.
4. A final verifier reads every batch and proves binding, ordering, coverage,
   digests and cadence before a terminal map can be published.
5. A retry resumes only from an exact emitted presentation checkpoint.  It may
   not reinterpret a requested seek time as the next frame ordinal.

The existing `MediaSourcePtsCadenceMapV1` lifecycle already gives a candidate
claim/checkpoint/terminal envelope.  It is not itself this scanner or verifier.

## Source discontinuities and long-form transport

The current V1 shard contract deliberately requires adjacent presentation
timestamps.  That is a safe fail-closed constraint, not support for every
professional source.  Edit lists, epochs, discontinuities or other valid
non-adjacent presentation behavior need an explicit versioned segment/epoch
model before they can be represented; they must currently end `UNVERIFIABLE`.

The existing signed qualification route is capped at 180 seconds.  A ten-hour
scan must therefore be dispatched to durable compute and observed asynchronously
by the web/queue boundary; it must not hold an HTTP request open.  Modal allows
long-running function timeouts, while web request handling has a much shorter
request ceiling ([function timeouts](https://modal.com/docs/guide/timeouts),
[web request timeouts](https://modal.com/docs/guide/webhook-timeouts)).  This
does not select Modal or deploy a worker; it defines the minimum transport
property any chosen owner must satisfy.

## What remains blocked

- No continuous mapper, private deployment proof, live Atlas CAS, full verifier
  or terminal map exists.
- `MEDIA-15` remains open: every legacy storage/source writer must be
  classified before a map consumer is wired.
- V1 cannot represent source discontinuities or epochs; `MEDIA-17` records
  that missing model.
- No ProjectService source/record command, renderer consumer, proxy transform,
  mixed-rate edit path, or long-form production certification exists.
