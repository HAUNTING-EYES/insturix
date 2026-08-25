# Canonical media source probe V1 — bounded implementation (2026-08-25)

## What this slice adds

`media-source-probe-v1.ts` defines a read-only, typed client for a new Modal
`ffprobe` endpoint. The endpoint receives a short-lived storage URL, measures
only bounded container/stream metadata, and returns a strict subset of:

- container name and measured duration/start;
- video codec, coded dimensions, pixel format, source timebase and nominal
  rates;
- audio codec, sample rate, channels and layout; and
- reported colour, timecode and reel tags when they actually exist.

The client canonical-hashes only that normalized observation. It deliberately
does not return or persist the presigned URL.

## Why this is the next safe step

The live upload route currently allows a media record to exist after a storage
HEAD/size/duration check that may be non-fatal. Existing serverless analysis
downloads whole URLs into `/tmp`, which cannot be treated as the long-form
ingest architecture. A remote ffprobe header/range observation gives the
future ingest owner measured technical facts without making Vercel download a
3 GB or multi-hour source.

## Explicitly not completed

This is **not** canonical source qualification. It does not yet issue an
immutable byte digest, source-version receipt, PTS mapping, CFR/VFR
classification, proxy/master mapping, reel/timecode guarantee, ProjectService
binding, media invalidation, or operation eligibility. A malformed, missing,
unconfigured, failed, or stream-empty response is `UNVERIFIABLE`, never
silently filled from client metadata.

The Modal endpoint has not been deployed. Deployment still requires the normal
Modal token configuration plus an explicit allowlist for any non-R2/GCS storage
host. The signed registration route now persists the bounded job and dispatches
only a signed QStash worker. That worker independently verifies the persisted
R2/GCS object, creates a short-lived server URL, and compare-and-set writes the
result to the existing asset record. Missing queue/probe configuration or a
storage failure remains explicitly pending/unverifiable; no unsigned or inline
fallback exists.

No project/timeline, renderer, analysis, or UI consumer treats this observation
as a qualified source yet.

## Source-bound lifecycle contract

The current bounded source-contract phase adds
`MediaSourceQualificationRecordV1` as an optional field on the *existing*
`MediaAsset` type. Its storage locator can only be the server-owned R2 key or
GCS path of a user upload; it never accepts a browser URL, raw `assetId`, a
public asset, or an unproven GCS mirror as an equivalent source.

The lifecycle is `PENDING -> PROBING -> MEASURED_TECHNICAL | UNVERIFIABLE`.
Every claim and completion carries the deterministic hash of `(assetId,
provider, objectKey)`, so a stale worker cannot apply an observation to a
different source. A stale `PROBING` lease can retry after 15 minutes. Even a
successful result is named `MEASURED_TECHNICAL`, deliberately not
`QUALIFIED`.

## Provider storage-version observation foundation

Commit `2234fbc18` adds a separate, deterministic observation of the concrete
stored object behind that locator:

- R2: authoritative `HeadObject` byte length plus opaque ETag;
- GCS: authoritative metadata byte length plus immutable provider generation;
- the observation hash binds the provider, object key, byte length and opaque
  provider token, but no URL or observation timestamp.

This closes neither byte identity nor source qualification. An R2 ETag is not
treated as a SHA-256 digest, and no code currently persists this observation
on `MediaAsset`, invalidates old analysis, changes proxy swap behavior or
allows ProjectService to consume it. Its sole current purpose is to give the
next worker phase an exact before/after storage identity to compare around a
remote probe. Missing/malformed metadata becomes `UNVERIFIABLE`; it never
falls back to browser metadata.

## Next ordered implementation

1. Wire the signed qualification worker to persist this observation only after
   a matching before/after storage read around the remote probe. A changed
   object must end `UNVERIFIABLE`, not retain a technically measured result.
2. Deploy the bounded worker configuration only after environment review; no
   deployment occurred in this code slice.
3. Migrate the remaining direct-upload and proxy-swap ingress paths through
   immutable byte/source-version and invalidation work rather than pretending a
   URL swap is the same source.
4. Add PTS/cadence and then ProjectService source/record binding only after the
   immutable source-version phase.

No second media registry, project owner, or timeline authority is introduced.
