# Canonical media PTS sidecar content — Step-0 audit (2026-08-25)

## Finding

The current PTS/cadence artifact contracts are **descriptor and lifecycle
contracts**, not a recoverable source-time map.

`MediaSourcePtsCadenceShardV1` records aggregate facts: first ordinal, count,
start PTS, end-exclusive PTS, local cadence and a hash of the supplied frame
records.  It deliberately does not contain the individual `{PTS, duration}`
records.  `serializeMediaSourcePtsCadenceShardSidecarV1` serializes that
descriptor, so the emitted sidecar has the same omission.  Its descriptor hash
does not make omitted frame records recoverable.

The current manifest sidecar contains only the checkpoint.  The checkpoint has
the next ordinal/PTS, appended count and a rolling binding hash; it does not
enumerate the ordered shard sidecar references.  Therefore a full reader cannot
derive the complete object set from a terminal record without an unversioned
storage-listing convention or the mapper's lost transient memory.

This is a hard, code-grounded blocker to calling a terminal V1 lifecycle record
a usable source PTS map.  It does not invalidate the narrow properties already
tested: canonical descriptor hashes, conditional private writes, source-bound
CAS, and source-change invalidation remain useful prerequisites.

## Consequence

Do not build a runtime mapper, source/proxy transform, ProjectService binding,
or operation eligibility on the current V1 sidecar payloads.  A verifier could
only check aggregate descriptor continuity; it could not answer the central
question “which source PTS and duration belong to this frame ordinal?”

`COMPLETE_PRESENTATION_COVERAGE_AND_CONTIGUITY_V1` is consequently a required
future verifier name, not an implementation or proof that V1 contains enough
data to perform that verification.

## Required successor protocol

Keep V1 immutable as the existing narrow descriptor/lifecycle contract.  Add a
separate, versioned successor sidecar protocol before mapper runtime work:

1. **Lossless frame-batch payload.** Each immutable batch must contain the
   descriptor plus the ordered per-frame PTS/duration records (or a specified
   lossless encoding with an independently tested decoder). The decoder must
   recompute the descriptor's frame-evidence hash, count, start/end, local
   cadence and source binding.
2. **Recoverable manifest index.** The terminal manifest must carry the exact,
   ordered shard sidecar references and their immutable digests, not merely a
   rolling checkpoint. A resume must obtain that index from a durable verified
   reference, never from an assumed object-prefix listing.
3. **Bounded resource policy.** Batch byte/count and manifest fan-out limits
   must be named in the mapper policy and treated as provisional infrastructure
   policy until calibrated. Exceeding a bound ends `UNVERIFIABLE`; it must not
   silently discard frames or infer cadence.
4. **Independent full verifier.** It reads the indexed payloads, verifies every
   byte/digest and exact binding, checks ordinal/PTS coverage, then issues the
   only terminal receipt capable of supporting a source-wide cadence conclusion.
5. **Explicit discontinuity model.** The successor must either represent
   declared presentation epochs/segments or honestly reject them. It may not
   relax V1 contiguity while still claiming one global ordinal map.

The successor remains owned by the existing `MEDIA_ASSETS` record and existing
source-version/CAS ownership. It must not introduce another media registry,
timeline authority, or browser-visible evidence store.

## Scope and verification

This audit inspected the current implementations of:

- `media-source-pts-cadence-shard-v1.ts`;
- `media-source-pts-cadence-private-sidecar-codec-v1.ts`;
- `media-source-pts-cadence-map-lifecycle-v1.ts`; and
- the corresponding lifecycle and private-sidecar tests.

It is a design-correction record only. No runtime mapping behavior changes, and
no claim is made that a V2 protocol, mapper worker, private deployment, live
Atlas write, renderer consumer or ProjectService source binding exists.
