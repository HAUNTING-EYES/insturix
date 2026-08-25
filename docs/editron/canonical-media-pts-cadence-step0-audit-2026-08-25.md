# Canonical media PTS/cadence mapping — Step-0 audit (2026-08-25)

## Decision

The next canonical-media implementation is **not** another numeric-FPS helper
and is **not** a large JSON response from the existing probe.  It must be a
server-owned, source-version-bound PTS/cadence artifact lifecycle on the
existing `MEDIA_ASSETS` record.  Until that owner and its sidecar persistence
exist, source PTS anchors remain technical evidence only and every precise
source/proxy/timeline operation remains unavailable.

This began as a pre-implementation audit.  Commit `426d3d09a` now adds one
pure, deterministic prerequisite: it verifies a *local* cadence-shard
descriptor against an existing qualified source/version/technical observation
binding.  It still adds no persistence field, deployment, worker dispatch,
capability eligibility, ProjectService command, source-wide cadence result or
long-form claim.

## Code-grounded current truth

| Concern | Actual current owner/path | What it proves | What it does not prove |
| --- | --- | --- | --- |
| Immutable byte source | `runMediaSourceQualificationWorkerV1` reads the existing `MEDIA_ASSETS` row, observes storage before/after a complete server byte hash, then CAS-writes `sourceVersionV1` on that same row. | A source version is bound to one unchanged provider object and full-byte digest. | Frame presentation order, cadence, source-time ranges, proxy mapping or project eligibility. |
| Stream technical observation | `modal/media_source_probe.py` runs `ffprobe -show_format -show_streams`; `media-source-probe-v1.ts` parses a bounded report. | Per-stream rational timebase plus nullable exact-text `start_pts` and `duration_ts`. | A frame PTS map or CFR/VFR result. Stream rate labels are not enough. |
| Existing proxy/master relationship | `MediaProxyMasterRelationV1`, persisted only after a qualified master promotion. | Exact proxy/master source-version identities and invalidation intent. | Its mapping is deliberately `UNQUALIFIED/SOURCE_PTS_MAPPING_REQUIRED`. |
| Existing storage adapter | `r2-service.ts` can server-read object versions and issue short-lived read URLs. The normal upload helper deliberately creates browser-facing media object URLs. | Server-side object access for the existing media owner. | A private, chunked, hash-addressed derivative-artifact lifecycle. |
| Current qualification delivery | `app/api/internal/workers/media-source-qualification/route.ts` is signed and capped at 180 seconds. | Bounded source qualification work. | Ten-hour mapping, resumable frame indexing or a durable shard owner. |
| Current legacy frame projection | `edited-timeline-context.ts` and `brief-executor.ts` use numeric project/source frame arithmetic. | Historical feature-specific frame mapping. | Source-version identity, PTS, VFR, proxy transform, receipt, or canonical authority. |

`EditorialMediaIdentityContractV1` describes future source-time vocabulary but
is expressly `UNWIRED_CONTRACT_ONLY`.  The provider-native reference ledger is
episode-scoped and must not be reused as global ingest or derivative authority.

## Why the anchors are not enough

`avg_frame_rate`, `r_frame_rate`, `nb_frames`, stream duration and matching
rate labels are descriptive metadata.  They cannot establish that presentation
timestamps are uniformly spaced: containers may omit values, have edit lists,
variable frame durations, repeated timing, B-frame decode ordering or damaged
data.  In particular, equality of `avg_frame_rate` and `r_frame_rate` must
never become a CFR shortcut.

A measured result needs ordered presentation evidence for the selected video
stream.  The durable source-coordinate unit is the integer PTS in that
stream's declared rational timebase, never a JavaScript floating-point second
or an inferred project frame number.

## Required future artifact boundary

The existing `MEDIA_ASSETS` document owns lifecycle/status and the reference
to a future immutable artifact manifest.  It must not store a multi-million
entry time map inline or create a second media registry.

One measured manifest must bind at least:

- `sourceVersionSha256`, provider-storage-version hash and the exact technical
  observation hash;
- selected video stream index and its reduced rational source timebase;
- mapper/FFmpeg version, command policy and mapping schema version;
- ordered shard descriptors: source PTS bounds, frame count, immutable bytes
  digest, sequence number and private storage locator;
- a source-wide cadence disposition: `CFR`, `VFR` or `UNVERIFIABLE`;
- the exact reason whenever mapping cannot be completed, verified or resumed;
- a manifest digest and creation/terminal receipt that are idempotent for the
  same source version and mapper policy.

The sidecar's frame records must preserve exact PTS/duration integers as text
or another lossless integer encoding.  Shard metadata belongs in the existing
asset record; large, immutable indexed payloads belong in server-only object
storage.  A public browser-media upload helper, a client URL, or an opaque
unverified key is not an acceptable substitute.

## Cadence decision rule

The mapper may return `CFR` only after it has validated the ordered complete
presentation sequence for the declared source version and stream under a
versioned policy.  Every usable inter-frame duration must match one legal
rational cadence interval, including the policy for the terminal frame.

It returns `VFR` when a valid, complete mapping shows more than one legal
presentation interval.  It returns `UNVERIFIABLE` for missing/torn chunks,
non-monotonic or undecodable timestamps, inconsistent timebase/source binding,
incomplete inspection, invalid shard digest, timeout, source replacement or an
otherwise unsupported container condition.  `UNVERIFIABLE` never falls back
to numeric project FPS.

The same rule applies to proxy mapping: a source-to-proxy transform is only
available after both immutable coordinate artifacts and the measured transform
are bound.  A source cadence result alone does not authorize a proxy transform.

## Scalable execution shape to implement next

1. A signed, source-version-bound mapper job is claimed and resumed on the
   existing asset record.  Its work identity includes the mapper policy and
   exact source version.
2. The worker processes bounded presentation-order shards and writes only
   private immutable sidecar chunks.  It records a hash/checkpoint after each
   completed shard so a retry never silently trusts partial output.
3. A final server-side verifier checks contiguous shard coverage, digests,
   source/timebase binding and cadence before one compare-and-set terminal
   record points at the manifest.
4. A source replacement clears/invalidates the map alongside the existing
   invalidation intent.  The current intent remains unconsumed until actual
   analysis/render/project consumers are separately migrated.
5. ProjectService may bind a measured map only in a later source/record
   timeline command.  Existing numeric timeline callers, chat tools and
   renderer paths remain unqualified until then.

This shape avoids making the current 180-second qualification route, Modal
probe response, Mongo document or browser tab carry an entire ten-hour media
map.  Short media uses fewer shards; long media uses the same immutable source
identity and resumable shard protocol rather than a different product profile.

## Implemented prerequisites and next runtime gate

Commit `426d3d09a` introduces `MediaSourcePtsCadenceShardV1` as a pure
verifier.  It binds one contiguous presentation-order shard to the existing
source version, measured qualification/storage version, exact technical
observation hash, selected video stream, reduced rational timebase, mapper
identity/policy and timestamp origin.  PTS and duration ticks are lossless
text parsed as `BigInt`; the verifier emits only `UNIFORM_LOCAL` or
`VARIABLE_LOCAL` for that supplied shard.

It deliberately cannot call a source `CFR`/`VFR`, persist a sidecar, resume
work, write `MEDIA_ASSETS`, derive a proxy transform, bind ProjectService or
make an operation eligible.  `FFPROBE_BEST_EFFORT_TIMESTAMP` is a
decoder-derived candidate origin, not camera timecode.  Its 128-decimal-digit
tick/ordinal guard and 256-character mapper-identity guard are defensive
resource limits, not media-duration or format limits.

Commit `bece283e3` now specifies and tests the corresponding pure map-lifecycle
contract. It accepts only a hash-verified bootstrap shard; then permits an
owner-supplied lease, exactly contiguous presentation-order checkpoints and
deterministically addressed `R2_PRIVATE`/`GCS_PRIVATE` sidecar references. A
completion candidate names the required full-coverage verifier and one
`MEDIA_ASSETS` compare-and-set write. Forged shard bindings, sequence/ordinal
or PTS gaps, stale claims, public/incorrect sidecar keys, terminal reuse,
corrupt diagnostics and counter overflow fail closed.

Commit `ff27d6da6` corrects the candidate-only gap in that pure contract. A
successful `COMPLETE` terminal record now requires the active claim, exact
candidate and a hash-bound completion receipt naming a full-coverage verifier
and its policy. The envelope itself does not read a manifest or prove coverage;
only a future private-sidecar reader and complete-coverage verifier may issue
that input through the existing media owner's one compare-and-set transition.
It remains neither a CFR/VFR conclusion nor a source/proxy mapping result.

This is still a pure contract: there is no private R2/GCS adapter, actual
sidecar byte write/read, `MEDIA_ASSETS` field, mapper worker, claim CAS,
complete-manifest verifier or terminal map persistence. It intentionally
cannot call a large map "measured" until a real qualified source passes the
full verifier. The next runtime phase is therefore the existing media owner's
private artifact port and source-version-bound claim/checkpoint/terminal CAS,
not a ProjectService, generated-composition, overlay, caption, transition,
renderer, user-data or research-proxy change.

## Verification boundary

This audit was initially grounded against `d4d3a9c7b` and rechecked through
the pure verifier commit `426d3d09a` and lifecycle-contract commit
`bece283e3` plus terminal-contract correction `ff27d6da6`, including the
signed qualification worker, `MEDIA_ASSETS`
persistence, Modal probe, R2 adapter, proxy/master relation and legacy numeric
frame projections. Twenty focused shard/lifecycle tests, TypeScript and
repository ESLint pass for those commits. It does not establish a deployed
Modal endpoint, an R2 private-artifact policy, a persisted PTS map,
source-wide CFR/VFR support, source/proxy mapping, mixed-rate editing,
long-form media processing or production certification.
