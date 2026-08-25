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
| Existing storage adapter | `r2-service.ts` remains browser-media oriented. Commit `173432a4c` adds an unwired injectable R2 sidecar codec/port that requires a declared no-browser-route bucket and conditionally writes/verifies exact bytes. Commit `f7da79e32` reserves `private/` in the checked-in browser worker. | Deterministic sidecar bytes plus source-level CDN denial for that namespace. | A deployed private bucket/worker binding, asset lifecycle persistence, a mapper worker or a source map. |
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

Commit `173432a4c` adds the next bounded adapter layer: canonical map-bound
shard/manifest serialization and an injected server-only R2 port. It makes a
conditional `If-None-Match: *` write, then checks the exact bounded stored
bytes and SHA-256 both after the first write and after an already-present retry.
It rejects the known public `editron-cdn` bucket and requires a deployment-owned
`NO_BROWSER_ROUTE` declaration. That declaration alone is not security.
Commit `f7da79e32` additionally makes the checked-in Clickatron worker reject
raw and URL-encoded `private/` keys before R2 access, and reject non-read
methods. Its test proves source behavior only; the deployed worker/bucket
binding remains unverified.

Commit `822e9182e` adds the optional asset field shape and a pure state reader
that accepts a map only if its source version, storage version, measured
qualification observation and canonical state hash agree. It does not write a
Mongo record, change a source, claim work or expose a consumer.

Commit `3ad3a1078` supplies the matching existing-media-owner Mongo adapter.
It rereads the asset, rejects a partial/tampered current state or wrong expected
state hash, verifies the next record against the live source/qualification,
then performs a source-bound compare-and-set. The adapter is not called by a
mapper and its injected-port suite is not a live Atlas write proof.

Commits `228b28dd4` and `584b913ff` close the two current code paths that
directly reset or issue `sourceVersionV1`: proxy-to-master promotion and the
qualification worker. Both now write the cadence record and its state hash as
`null` before fresh source identity can be used. This is explicit
source-bound-observation invalidation, not a mapper result. The broader raw
`r2Key` writer inventory remains open because old migration or generator paths
may not participate in source-version ownership; it is recorded as `MEDIA-15`.

Commit `923fd6fc6` adds a pure V2 recoverable manifest index after the V2
frame-batch codec. It can enumerate exact deterministic private sidecar
references, their content digests and contiguous source/frame coordinate
summaries, and it rejects a cross-bound source/policy batch or a forged key.
It does not write or read private storage, persist a V2 state, prove a listed
sidecar exists, prove full presentation coverage or issue a cadence result.
The next runtime design must add a V2 read/verify/state path before a mapper
can claim terminal completion.

Commit `3cd22d54f` fills the read/verify portion only through an injected
reader. It verifies every listed object's measured bytes and canonical payload
against the V2 index and reports an explicit indexed-range cadence observation.
Commit `650d46b82` adds a pure qualified-source coverage decision over that
result: exact source/stream/mapper binding plus exact qualified start/end PTS
coverage is required before it calls the observed result `CFR` or `VFR`.
Partial indexes, forged coverage and another map binding remain
`UNVERIFIABLE`. At that point both were injected-reader contracts only.

Commit `981b5f903` adds the first V2 `MEDIA_ASSETS` state owner. One V2 asset
envelope embeds the existing V1 lease/checkpoint lifecycle rather than
persisting a second V1 authority. Each checkpoint binds a content-addressed V2
manifest index, requires it to extend the previous immutable index, rereads the
stored index and every indexed frame batch, and only then advances the embedded
lifecycle. Terminal `CFR` or `VFR` additionally requires exact qualified-source
coverage plus reread of the V1 lifecycle manifest; the terminal receipt binds
the source range, index verification, lifecycle completion and verifier
version. The matching Mongo adapter writes only the existing `MEDIA_ASSETS`
record through source/qualification-bound compare-and-set and rejects a
parallel persisted V1 pair, malformed current state, stale expectation,
changed source or lost race. Lease time is sampled after asynchronous evidence
reads so a slow verification cannot complete under an expired claim.

Commit `b7b92ea68` adds the server-only R2 V2 artifact port. It writes both
recoverable frame batches and manifest indexes with `If-None-Match: *`, rereads
bounded bytes, and requires exact canonical content hashes on initial write and
retry. It rejects GCS references on the R2 port, malformed/private-key escapes,
forged expected sidecars, missing reads and altered existing bytes. The port
shares the existing deployment-owned private-storage declaration; it does not
prove that the declared bucket is privately deployed. Commit `713718566`
narrows its reader to the exact V2 frame-batch and manifest-index object-key
grammars, so a merely prefixed or traversal-shaped key is rejected before R2.

Commit `e4709d0c9` completes V2 invalidation in the two audited source-version
writers. Both qualification claim/completion writes and proxy-to-master
promotion now clear `sourcePtsCadenceMapV2` and its state hash in the same
atomic payload that clears V1 and changes source identity. A stale V2 map can
therefore no longer survive those successful replacements.

This is a real state/CAS owner plus a private artifact adapter, but remains
deliberately **unwired**. There is still no continuous presentation-order
scanner, signed durable mapper job, live Atlas/private-bucket proof,
source/proxy transform, ProjectService consumer or product source-time
permission. Until those exist, no runtime caller may treat the optional V2
fields as a usable map. The next bounded phase is the signed durable continuous
scanner; it is not a ProjectService, generated-composition, overlay, caption,
transition, renderer, user-data or research-proxy change.

The measured execution constraint is recorded in
[media-source-pts-cadence-mapper-feasibility-2026-08-25.md](./media-source-pts-cadence-mapper-feasibility-2026-08-25.md).
`ffprobe -read_intervals` seeks to a keyframe and therefore cannot provide
independent exact time chunks for a global ordinal map. The only candidate
production mode is a continuous presentation-order scan with durable exact
checkpoints. The current V1 contiguous PTS rule is intentionally fail-closed
for discontinuities or epochs; it is not universal professional-source support.

The next required protocol correction is recorded in
[canonical-media-pts-sidecar-content-audit-2026-08-25.md](./canonical-media-pts-sidecar-content-audit-2026-08-25.md).
The current V1 shard sidecar omits the per-frame records and its manifest omits
the full sidecar index, so neither can recover a source-time map. V1 remains a
strict descriptor/lifecycle prerequisite; a versioned frame-payload and
manifest-index successor must exist before the runtime mapper starts.

## Verification boundary

This audit was initially grounded against `d4d3a9c7b` and rechecked through
the pure verifier commit `426d3d09a`, lifecycle-contract commit `bece283e3`,
terminal-contract correction `ff27d6da6`, guarded private-sidecar adapter
`173432a4c`, source worker hardening `f7da79e32` and asset-state boundary
`822e9182e` plus Mongo CAS adapter `3ad3a1078`, proxy-promotion invalidation
`228b28dd4` and qualification invalidation `584b913ff`, including the
signed qualification worker, `MEDIA_ASSETS`
persistence, Modal probe, R2 adapter, proxy/master relation and legacy numeric
frame projections. Fifty-two focused shard/lifecycle/sidecar/asset-state/CAS,
qualification, proxy-promotion and worker-denial tests, TypeScript and
repository ESLint pass for those commits.
Commit `981b5f903` adds a further 5 adversarial V2 owner cases; the complete
focused V1/V2 PTS chain passes 38/38, with repository TypeScript and quiet
ESLint passing at that commit.
Commit `b7b92ea68` adds 3 V2 private-artifact cases; its V1/V2 storage/owner
focus passes 12/12. Commit `e4709d0c9` adds complete V2 invalidation to the two
audited writers; their owner/invalidation focus passes 22/22. Full TypeScript
passes with an 8 GB compiler heap after the default 4 GB process exhausted its
heap, and repository quiet ESLint passes.
It does not establish a deployed Modal endpoint, an R2 private-artifact policy,
a deployed worker/bucket binding, an invoked mapper or live persisted PTS map,
source-wide CFR/VFR support, source/proxy mapping, mixed-rate editing,
long-form media processing or production certification.
