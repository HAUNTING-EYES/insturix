# Proxy-to-master source swap — Step-0 audit (2026-08-25)

## Scope

This audit covers only the live path in which a client uploads a small proxy,
starts an edit, then uploads the original through multipart R2 and calls
`POST /api/services/editron/media/upload/swap`. It is not an implementation
approval for a second media registry, a new project/timeline owner, or a
claim that proxy/master precision is already supported.

## Code-grounded current truth

1. `components/editron/project/project-dashboard.tsx` registers the proxy as
   `isProxy: true`, starts auto-edit, then passes a browser-constructed
   `originalUrl` and client-visible `originalR2Key` to the swap route after
   multipart completion.
2. `app/api/services/editron/media/upload/multipart/complete/route.ts` does
   own the completed R2 upload record: `(assetId, userId, uploadId, r2Key,
   status: completed)`. It is therefore the only trustworthy source for the
   replacement storage key. The swap route does not currently consult it.
3. `app/api/services/editron/media/upload/swap/route.ts` accepts the supplied
   URL/key and raw-updates `cachedUrl`, `isProxy`, and optionally
   `originalR2Key`. It does not create a new source qualification, clear a
   prior identity, dispatch a signed qualification worker, record a
   proxy/master relation, create invalidation intent, or involve
   `ProjectService`.
4. `lib/editron/services/asset-resolver.ts` normally prefers `asset.r2Key`
   over `cachedUrl` when it creates a CDN or refreshed read URL. The swap route
   leaves `r2Key` pointing at the proxy. A later resolver call can therefore
   select the proxy after the UI says the original is ready.
5. `app/api/cron/cleanup-stale-uploads/route.ts` searches `isProxy: true` and
   relies on `asset.originalR2Key`, but multipart completion does not set that
   field. Its apparent healing condition is not reliably derived from the
   server-owned completed-upload record; it also performs its own raw media
   update and bypasses source qualification.
6. `app/api/services/editron/media/delete/route.ts` currently deletes
   `r2Key`, `originalR2Key`, and one completed multipart key. Any migration
   that changes which key is active must preserve both objects until deletion
   and invalidation policy explicitly releases the proxy.
7. Commit `278daa367` now issues `sourceVersionV1` only through the signed
   qualification worker. A raw swap can otherwise leave a prior proxy identity
   attached to an original byte source, which is unsafe.

## Required target state

`MEDIA_ASSETS` remains the only media-library persistence owner. The durable
multipart row is evidence of a completed object, not a replacement media
authority. `ProjectService` remains the only owner allowed to decide how a
source replacement affects approved project/timeline state.

The migration must use this sequence:

1. Resolve the candidate original exclusively from the caller's own completed
   multipart record. Ignore client `originalUrl` and `originalR2Key` for
   authority.
2. Verify the current proxy asset is still owned by that user and still has
   the expected proxy state. Read server storage metadata for the candidate
   before changing media state.
3. In one guarded media-owner transition, make the completed original the
   active storage key; retain the old proxy key and, if it exists, its issued
   source version as historical proxy evidence. Clear the active
   `sourceVersionV1` and install a fresh `PENDING` qualification bound to the
   original key. Never retain the proxy identity as the identity of the master.
4. Dispatch the existing signed qualification worker only after that guarded
   record is persisted. A dispatch failure leaves an explicit pending or
   unqualified source; it may not fall back to the old identity.
5. When the master identity succeeds, create the existing
   `MediaProxyMasterRelationV1` in the same `MEDIA_ASSETS` owner. Its mapping
   remains `UNQUALIFIED/SOURCE_PTS_MAPPING_REQUIRED` until an actual PTS map is
   measured; a ratio, URL, or matching duration is not a map.
6. Persist invalidation intent for the changed source version. A later
   ProjectService-owned command must decide whether each project binding can
   revalidate, needs a preview/render refresh, conflicts, or must remain on
   the proxy. The swap route must never rewrite a timeline itself.
7. Replace the cron's raw update with the same server-owned transition and
   make deletion retain both active and historical keys until that transition
   is safely complete.

## Required adversarial proof

- A caller cannot substitute another user's or arbitrary R2 key/URL.
- A stale or duplicate swap cannot overwrite a newer active source.
- An absent/deleted multipart object leaves the media record unchanged.
- A master read/hash/probe failure clears active identity and remains
  `UNVERIFIABLE`; no proxy identity is reused as a master identity.
- Resolver reads select the active master key after successful transition,
  while deletion still accounts for the retained proxy key.
- The cron and interactive path use the same transition semantics.
- A source replacement creates no direct project/timeline write; future
  ProjectService invalidation/rebase proof is required before promotion.

## Explicitly still open

This audit does not implement a source PTS map, rational project timebase,
CFR/VFR eligibility, proxy render alignment, analysis invalidation consumer,
ProjectService source binding, long-form resumable hash worker, deployment
verification, or production media certification.
