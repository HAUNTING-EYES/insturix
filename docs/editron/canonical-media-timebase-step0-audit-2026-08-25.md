# Canonical media/timebase spine — Step-0 audit (2026-08-25)

## Scope and decision

This is a code-grounded pre-work audit for the next ordered foundation in the
master plan: canonical media identity, timebase and durable evidence.  It does
not promote the current upload, proxy, research-reference, or chapter-render
paths to a unified media architecture.

The completed bounded code slice in `800f2f543` makes the existing chapter
renderer derive its 15-minute split, 2.5-minute target and 30-second minimum
from its supplied numeric render FPS; the admission route and UI use the same
duration policy.  That removes one concrete non-30-fps duration error.  It
does **not** introduce rational rates, source PTS, VFR, timecode, conform,
proxy/master identity, or production long-form certification.

## Existing authority and ingress map

| Path | Actual owner/state today | What it establishes | Missing before it can be canonical ingest |
| --- | --- | --- | --- |
| Signed upload registration: `media/upload/url` -> `media/upload` | The route directly inserts `MEDIA_ASSETS`; `MediaAsset` is the existing media-library persistence record. | URL/storage key, loose byte size, client type, optional duration/dimensions, thumbnail and some rights fields; its signed qualification worker can now CAS-persist a complete-byte `sourceVersionV1` only after stable provider observations and a measured technical probe. | Rational source cadence/PTS/CFR-VFR/reel/timecode/colour/audio identity; durable proxy mapping; invalidation links; range-addressable analysis receipt; resumable large-object hashing. |
| Server-side `media/upload/direct` | `uploadMedia` creates bytes and the route directly `upsert`s `MEDIA_ASSETS`. | A small-file R2 upload and basic metadata. | It bypasses the main registration path's duration verification and async analysis dispatch, and has the same missing source identity. |
| Multipart upload | `mediaUploads` tracks parts/completion and quota; the main registration route creates the later `MEDIA_ASSETS` record. | Retryable object assembly and storage accounting. | Completion itself does not issue a media identity/probe receipt or register a canonical source version. |
| Proxy then original | The project dashboard first registers the compressed proxy as `isProxy`; the original later reaches `media/upload/swap`, which rewrites that same asset's `cachedUrl`, clears `isProxy`, and optionally stores `originalR2Key`. | A UI convenience for replacing a temporary preview with a full-quality URL. | No immutable master/proxy pair, no source/proxy transform, no version increment, no analyzer invalidation or project receipt. Existing edits can therefore change byte source without a durable media-version handoff. |
| Provider-native reference materialization | `ProviderNativeCanonicalMedia*V2R` has identity/policy/byte-binding records and product ports. Its root is explicitly `PRODUCT_COMPOSITION_NO_CANONICAL_PROJECT_MUTATION`. | Exact, route-authorized reference bytes for bounded provider episodes, stored separately from the bytes selected by `mediaAssets`. | It is reference/episode scoped and has no live upload, project sequence, source PTS, proxy/relink or render consumer. Reusing it as generic ingest would create a second media authority, so it is not the migration target. |
| Chapter rendering | `chapter-renderer.ts` stores a separate transient render-job/chapter record and sends `Overlay[]`, `totalFrames`, and numeric `fps` to Lambda. | Bounded concurrent chapter rendering and fail-loud concat handling; duration thresholds now derive from numeric render FPS. | Project/source/timebase revision binding, source identity, rational cadence, format/QC proof and durable render provenance. |

## Verified source facts

1. `MediaAsset` in `lib/editron/services/asset-resolver.ts` stores URLs, size,
   optional duration/display dimensions, loose `isProxy`/`originalR2Key`, and
   selected rights/reference fields.  It does not contain a rational source
   rate, source PTS map, CFR/VFR classification, reel/timecode, full codec,
   pixel or colour identity.
2. `app/api/services/editron/media/upload/route.ts` treats R2 HEAD failure and
   server object-size probe failure as non-fatal; video duration extraction is
   also non-fatal.  Those are current ingress behaviours, not identity proof.
3. `components/editron/project/project-dashboard.tsx` registers the proxy,
   starts auto-edit, then eventually calls `media/upload/swap` for the
   background original.  This is not a stable proxy/master relation.
4. `lib/editron/contracts/editorial-media-identity-contract-v1.ts` and its
   documentation deliberately state `UNWIRED_CONTRACT_ONLY`; repository use is
   contract/research-oriented, not a product upload or ProjectService consumer.
5. Before `800f2f543`, `lib/editron/services/chapter-renderer.ts` defined
   `27000`, `4500`, and `900` frame thresholds while accepting but ignoring
   `_fps` in boundary detection. The completed slice replaces those with
   duration constants converted only from the supplied numeric render FPS and
   passes that FPS through the render route. It remains intentionally unable to
   represent rational, VFR, source-PTS, reel, or timecode identity.

## Existing owner boundaries to preserve

- `MEDIA_ASSETS` remains the present storage/library persistence owner.  The
  migration must enrich/version that record or bind a qualified source identity
  to it; it must not add an independent media byte registry.
- `ProjectService` remains the sole owner of approved project/timeline state.
  Ingest and evidence receipts may be referenced by a future ProjectService
  command, but ingest must not write a second project/timeline state.
- Render jobs remain render-lifecycle records, not a source-media authority.
- The provider-native reference records remain scoped adapters for their
  declared provider route and must not be relabelled as global media ingest.

## Ordered implementation after the immediate chapter correction

1. Define one production ingest-probe/qualified-source receipt that binds an
   existing `MEDIA_ASSETS` record to immutable bytes and measured technical
   identity.  It must cover a rational source timebase, source PTS policy,
   CFR/VFR status, reel/timecode evidence, video/audio/colour fields and
   probe-version parameters.
2. Issue the receipt only after storage verification and probe success; no
   client-declared duration, `isProxy` flip or URL replacement may stand in for
   it.  Failed/unknown fields need an explicit unqualified disposition rather
   than invented metadata.
3. Model master/proxy as separate immutable versions with a declared mapping
   and invalidation chain.  Existing proxy swap is a compatibility path to be
   migrated, not the desired relationship.
4. Bind source versions and timebase references to source/record sequence
   operations through ProjectService.  Then make analysis, preview/render and
   delivery proof consume those bindings.
5. Add real-media sharding, retry/resume, range observations and render proof
   only after the identity chain exists.  The 4.5-hour research proxy does not
   prove this product pipeline.

## Current bounded advancement

Commit `c6e715d9e` contributes only the pure-contract portion of steps 1–3:
one immutable byte-source-version shape, an explicitly unmapped proxy/master
relation and invalidation intent. It rejects forged hashes, cross-owner/asset
relations and byte-length disagreement with the provider observation. It does
not hash a real object, persist any record, alter upload ingress, clear an
analysis record, or modify ProjectService. The next implementation must use a
server-side streaming hash whose before/after storage observations match; only
then may the existing `MEDIA_ASSETS` owner persist an issued version.

Commit `278daa367` implements that precise next boundary for the existing
signed-registration qualification worker only. It streams the server-minted
R2/GCS object, rejects a malformed/partial stream, requires stable provider
observations across the hash and technical probe, and CAS-writes
`sourceVersionV1` beside the existing qualification record. The worker takes
the asset's already persisted owner scope and supported media kind; it does
not infer either from a URL or probe result. A failed technical probe, source
read, provider observation, changed object, stale message, or CAS race leaves
the version unset. The route's current `maxDuration = 180` makes this an
explicitly bounded identity attempt: it is not resumable large-media hashing,
proxy/master qualification, rational timebase/PTS extraction, a source-record
sequence consumer, analysis invalidation, deployment proof, or long-form
certification.

## Verification boundary

This audit does not claim a working production media spine, a raised upload
cap, VFR support, or long-form readiness. Commit `800f2f543` adds numeric-FPS
duration-policy coverage at 24, 29.97 and 60 FPS and rejects invalid FPS; it
retains the honest numeric-only limitation until a rational-timebase consumer
exists.
