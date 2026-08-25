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

The Modal endpoint has not been deployed or wired into public ingress by this
slice. Deployment requires the normal Modal token configuration plus an
explicit allowlist for any non-R2/GCS storage host. Until that subsequent
worker/ingress phase, no product path consumes this adapter.

## Next ordered implementation

1. Introduce a `MEDIA_ASSETS`-embedded, source-bound qualification job record
   with a stable storage locator and an explicit pending/unverifiable state.
2. Dispatch the signed internal worker only after actual storage verification.
3. Have that worker resolve a server-generated direct storage URL, call this
   probe, and persist the measured observation with a job/revision receipt.
4. Add a separate immutable byte/source-version and PTS/cadence phase before
   any ProjectService source/record command consumes it.

No second media registry, project owner, or timeline authority is introduced.
