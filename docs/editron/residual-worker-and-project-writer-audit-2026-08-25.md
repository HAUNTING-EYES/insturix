# Residual worker and project-writer current-truth audit

Date: 2026-08-25  
Status: `CURRENT_SOURCE_AUDIT_COMPLETE` — no owner migration is implied by this
document.

## Scope and method

This audit re-read the live production Stage-1 lifecycle paths after the
pipeline-finalize Director-intent migration:

- `app/api/internal/workers/video-analysis/route.ts`;
- `app/api/internal/workers/tribe-analysis/route.ts`;
- `app/api/internal/workers/director/route.ts` and
  `lib/editron/agent/director-agent.ts`;
- `app/api/services/pipeline/storyboard/[id]/finalize/route.ts`;
- `lib/shared/project-status.ts`; and
- `lib/editron/security/internal-worker-auth.ts`.

It distinguishes an inbound worker-authentication failure from an outbound
publisher/configuration failure. It also distinguishes timeline mutations,
lifecycle state, derived analysis facts, and workflow/billing facts. They must
not be bulk-routed through one generic ProjectService metadata command.

## Worker-auth conclusion

`video-analysis`, `tribe-analysis`, and the automatic Director worker all end
in `withInternalQStashWorkerAuth(...)`. The shared wrapper reads both rotation
keys at request time and returns a structured `503
INTERNAL_WORKER_AUTH_NOT_CONFIGURED` before invoking the handler when either is
missing. There is no raw inbound-handler fallback in these three routes.

There is nevertheless a separate production fail-open branch:

| Producer | Current production behavior when `QSTASH_TOKEN` is absent | Why it is unsafe |
| --- | --- | --- |
| Video Analysis | At `video-analysis/route.ts:959-1069`, lack of the publisher token skips the signed Stage-2/Director publication path and enters the branch labelled "Dev fallback", which performs TRIBE and Director work inline. | A deployment configuration error changes execution topology, bypasses the intended signed worker boundary, and continues through raw lifecycle writers. |
| TRIBE | At `tribe-analysis/route.ts:447-493`, lack of the publisher token skips signed Director publication and runs Director inline. | The route can report successful inline completion instead of a configuration failure. |

The issue is not that either route accepts an unsigned inbound request. It is
that a signed upstream worker can silently use an inline downstream fallback in
production. The immediate repair is therefore deliberately narrow: allow that
fallback only in explicit development, and return a structured `503` before
database/work-provider side effects when production cannot publish the
dependent signed worker. Both the publisher token and signing-key pair must be
present for production dispatch.

## Residual project writer inventory

| Rank | Producer / fields | Current owner and consumer | Missing contract | Risk |
| --- | --- | --- | --- | --- |
| P0-1 | Video Analysis duration correction at `route.ts:531-543`: root `durationInFrames` and every video overlay duration are overwritten from `Math.round(actualDurationSec * 30)`. | The worker is currently its own writer; timeline playback, cuts, captions and render consume the result. | No user scope, expected revision, receipt, source-identity binding or range effect. It also hard-codes 30 fps. | A stale worker can overwrite user timeline timing; non-30-fps projects can be materially mis-timed. |
| P0-2 | Finalize synchronous BGM branch at `finalize/route.ts:1282-1294`: appends BGM overlays and music coverage facts after `saveProject`. | The finalizer is currently its own writer; the editor, Director and audio/render paths consume the timeline overlays. | No user scope, revision CAS, delivery identity, audio-only rebase decision, receipt, undo reference or rendered-mix proof. | Direct canonical timeline mutation can be lost or conflict with a later edit. |
| P0-3 | Video Analysis / TRIBE lifecycle and analysis completion writes (`video-analysis/route.ts:126-1336`; `tribe-analysis/route.ts:74-622`). | Each worker writes its own status and raw analysis facts; Director subsequently reads them. | No named lifecycle command, source/version identity, writer-issued receipt, or durable publisher handoff. Dev inline branches also have terminal raw writes. | Duplicate/stale deliveries can write over lifecycle state and derived evidence, then cause misleading downstream work. |
| P1-1 | Video native-audio evidence at `video-analysis/route.ts:587-602`. | Worker derives it; audio planning and later rendering consume it. | No revision/CAS/receipt and the update targets all video overlays; its evidence uses numeric `30` fps. | Can overwrite timing-adjacent user state and gives downstream audio paths no freshness binding. |
| P1-2 | Director facts (`unifiedDecisionBundle`, decision log, status/audit facts, V-JEPA audit and `qualityReview`) in `lib/editron/agent/director-agent.ts`. | Director derives facts; later quality/status readers consume selected subsets. | Project-wide raw updates are nonfatal, without user predicate, revision advancement or receipt. | Observer facts can be stale/lost and can disturb legacy `updatedAt` callers; they are not all timeline mutations. |
| P1-3 | Finalizer reused-project metadata, storyboard/music-policy facts and legacy `transitionProjectStatus`. | Finalizer and lifecycle state machine write them; UI and later pipeline stages read them. | The status machine has user and status CAS but no ProjectService revision/receipt; metadata writes have neither. | Compatibility token drift and lost project facts, but less immediate visual corruption than P0-1/P0-2. |
| P1-4 | `ProjectService.updateProject` callers in `agent/tools.ts`, `chat-visual-tools.ts` and `auto-edit-service.ts`. | A generic ProjectService helper currently writes project fields. | The helper has no expected revision, revision increment or returned receipt. | It can make an owner-looking call that is not a canonical mutation boundary. |

The `tribeLockAt` claim is a workflow lease, not a timeline mutation. Credits,
refunds, upload-batch aggregation and media-asset registration likewise retain
their existing specialized owners. None may be moved into a generic timeline
command merely to reduce the table count.

## Ordered repair plan

1. **Close the publisher-config fail-open** in Video Analysis and TRIBE. This
   is a bounded four-file implementation plus one plan update: no production
   inline fallback, no database/provider work before the configuration check,
   and regressions for development versus production policy.
2. **Design and migrate Video Analysis duration correction as its own command.**
   It must load an authenticated ProjectService mutation snapshot; bind the
   analyzed source asset/version and measured duration; use the current
   project numeric FPS rather than a literal 30; enumerate exact affected
   overlays; CAS on the expected revision; issue an effect-range receipt; and
   reject a changed target/source rather than broadly rebasing. This is the
   first bridge into the canonical media/timebase spine, not a claim of
   rational/VFR/timecode completion.
3. **Migrate finalizer synchronous BGM attachment through the existing
   ProjectService audio-delivery owner only if its delivery identity and exact
   planning timeline binding can be supplied.** Do not make a second audio
   attachment command. If the synchronous branch cannot meet that contract, it
   must report the explicit unavailable/degraded outcome rather than raw-push
   an overlay.
4. **Design lifecycle/analysis fact migration by named family.** Status,
   analysis provenance, native-audio evidence, Director observer facts and
   workflow leases have different lifecycle, proof and invalidation rules.

## Stage 2.5 note

HREF-01 is already formalized in
`oe-href01-native-review-pack-2026-08-22.md`: the sole qualified project-owner
review marked all nine criteria `PASS`, with no observed hard failure and a
zero-minute correction estimate. Its independent-agreement result remains
`UNVERIFIABLE_SINGLE_REVIEWER`; it is research evidence only and does not
authorize a product mutation or paid rerun.

## Non-claims

This audit does not migrate any writer, unify analysis storage, prove audio
mix/render quality, create a source/record timeline, resolve the global 30-fps
assumption, or close the remaining Stage-2.5 gate. It is the current-source
selection record for the next bounded safety slice.
