# Residual worker and project-writer current-truth audit

Date: 2026-08-25  
Status: `CURRENT_SOURCE_AUDIT_COMPLETE`; publisher-config closeout is commit
`0a12c798d`, the source-bound Video Analysis duration-owner migration is
commit `13d02b5c0`, and the finalizer synchronous-BGM owner migration is in the
current branch. Remaining rows are current residual writers, not a claim that
their families have been migrated.

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

The audit found a separate production fail-open branch:

| Producer | Current production behavior when `QSTASH_TOKEN` is absent | Why it is unsafe |
| --- | --- | --- |
| Video Analysis | At `video-analysis/route.ts:959-1069`, lack of the publisher token skips the signed Stage-2/Director publication path and enters the branch labelled "Dev fallback", which performs TRIBE and Director work inline. | A deployment configuration error changes execution topology, bypasses the intended signed worker boundary, and continues through raw lifecycle writers. |
| TRIBE | At `tribe-analysis/route.ts:447-493`, lack of the publisher token skips signed Director publication and runs Director inline. | The route can report successful inline completion instead of a configuration failure. |

The issue was not that either route accepted an unsigned inbound request. It
was that a signed upstream worker could silently use an inline downstream
fallback in production. Commit `0a12c798d` closes that branch: the shared
predicate requires a nonblank publisher token and signing-key pair for
production dispatch, both handlers return structured `503
INTERNAL_WORKER_DISPATCH_NOT_CONFIGURED` before `getDatabase`, and only
explicit development retains the inline path. Focused auth/wiring, financial
source and Director completion coverage passes 28/28; repository typecheck and
quiet ESLint pass. This does not migrate any raw lifecycle/analysis writer.

## Closed since this audit began

`13d02b5c0` replaces the raw Video Analysis 30-fps/all-video duration write
with `ProjectService.commitVideoAnalysisDurationCorrectionV1`. The command
uses a fresh authenticated snapshot, project numeric FPS, an exact initial
source-overlay target, one CAS write, replay/timeline receipts and no stale
rebase. It makes no write for stale, ambiguous, moved, duplicate-ID or
root-mismatched targets. Focused coverage passes 11/11, with typecheck and
quiet lint passing. It does not solve native-audio evidence, lifecycle facts,
canonical source identity or rational/VFR timebases.

The finalizer synchronous beat-sync branch now captures a fresh ProjectService
snapshot after its own legacy metadata write and before BGM generation, derives
the canonical visual-timeline binding, and sends a deterministic
`BGM`/`ATTACHED` delivery through `ProjectService.commitPipelineAudioDeliveryV1`.
The existing owner supplies the user-scoped CAS, replay receipt, audio-only
safe rebase, visual-change block and unverified rendered-mix disposition. The
raw BGM project `$push` is gone. A blocked binding retains the explicit
degraded warning and uses existing asynchronous dispatch; it does not
raw-append the already-generated audio. Finalizer and core audio-owner tests
pass 36/36 with repository typecheck and quiet lint passing. This does not
migrate the finalizer's other metadata/lifecycle writes or provide rendered
mix proof.

## Residual project writer inventory

| Rank | Producer / fields | Current owner and consumer | Missing contract | Risk |
| --- | --- | --- | --- | --- |
| Closed P0 | Single-asset auto-edit queue admission in `from-asset/route.ts`. | Commit `c2eeafb1c` uses the shared QStash dispatch + explicit-development policy before credits/project creation. | It does not migrate the later lifecycle/fact writes. | Production missing-token or missing-signing-key configuration now fails with zero credit/project/analysis/Director work. |
| P0-1 | Single-asset Video Analysis / TRIBE lifecycle and analysis completion writes (`from-asset/route.ts`; `video-analysis/route.ts:126-1336`; `tribe-analysis/route.ts:74-622`). | Intake, each worker, recovery and Director handoff write different pieces; Director subsequently reads selected facts. | No named analysis-run lifecycle, qualified source/version identity, writer-issued analysis receipt, or source-bound downstream handoff. Dev inline branches also have terminal raw writes. | Duplicate/stale deliveries can write over lifecycle state and derived evidence, then cause misleading downstream work. |
| P1-1 | Video native-audio evidence at `video-analysis/route.ts:587-602`. | Worker derives it; audio planning and later rendering consume it. | No revision/CAS/receipt and the update targets all video overlays; its evidence uses numeric `30` fps. | Can overwrite timing-adjacent user state and gives downstream audio paths no freshness binding. |
| P1-2 | Director facts (`unifiedDecisionBundle`, decision log, status/audit facts, V-JEPA audit and `qualityReview`) in `lib/editron/agent/director-agent.ts`. | Director derives facts; later quality/status readers consume selected subsets. | Project-wide raw updates are nonfatal, without user predicate, revision advancement or receipt. | Observer facts can be stale/lost and can disturb legacy `updatedAt` callers; they are not all timeline mutations. |
| P1-3 | Finalizer reused-project metadata, storyboard/music-policy facts and legacy `transitionProjectStatus`. | Finalizer and lifecycle state machine write them; UI and later pipeline stages read them. | The status machine has user and status CAS but no ProjectService revision/receipt; metadata writes have neither. | Compatibility token drift and lost project facts, but less immediate visual corruption than P0-1/P0-2. |
| P1-4 | `ProjectService.updateProject` callers in `agent/tools.ts`, `chat-visual-tools.ts` and `auto-edit-service.ts`. | A generic ProjectService helper currently writes project fields. | The helper has no expected revision, revision increment or returned receipt. | It can make an owner-looking call that is not a canonical mutation boundary. |

The `tribeLockAt` claim is a workflow lease, not a timeline mutation. Credits,
refunds, upload-batch aggregation and media-asset registration likewise retain
their existing specialized owners. None may be moved into a generic timeline
command merely to reduce the table count.

## Ordered repair plan

1. **Completed — close the publisher-config fail-open** in Video Analysis and
   TRIBE (`0a12c798d`). Production has no inline fallback and no
   database/provider work before the configuration check.
2. **Completed — migrate Video Analysis duration correction as its own
   command** (`13d02b5c0`). This is the first narrow bridge into the canonical
   media/timebase spine, not a claim of rational/VFR/timecode completion.
3. **Completed — migrate finalizer synchronous BGM attachment through the
   existing ProjectService audio-delivery owner.** The finalizer supplies the
   exact planning binding and deterministic delivery identity; no second audio
   command or raw BGM project write remains.
4. **Completed — close single-asset production queue admission**
   (`c2eeafb1c`). Outside explicit development, `from-asset` requires the
   publisher token plus both signing keys before credits/project creation.
   This is admission only, not a lifecycle migration.
5. **Next — audit and close the separate batch-dispatch configuration gap.**
   Its current direct-Director fallback and signing-key admission check must
   be handled with its batch/credit lifecycle, not copied from single-asset
   intake.
6. **Then — design lifecycle/analysis fact migration by named family after
   qualified media identity exists.** Status, analysis provenance,
   native-audio evidence, Director observer facts, workflow leases and batch
   orchestration have different lifecycle, proof and invalidation rules. The
   exact current-source boundary is
   [pipeline-analysis-lifecycle-step0-audit-2026-08-25.md](./pipeline-analysis-lifecycle-step0-audit-2026-08-25.md).

## Stage 2.5 note

HREF-01 is already formalized in
`oe-href01-native-review-pack-2026-08-22.md`: the sole qualified project-owner
review marked all nine criteria `PASS`, with no observed hard failure and a
zero-minute correction estimate. Its independent-agreement result remains
`UNVERIFIABLE_SINGLE_REVIEWER`; it is research evidence only and does not
authorize a product mutation or paid rerun.

## Non-claims

This audit does not migrate any remaining writer, unify analysis storage,
prove audio mix/render quality, create a source/record timeline, resolve the
global 30-fps assumption, or close the remaining Stage-2.5 gate. It is the
current-source selection record for the next bounded safety slice.
