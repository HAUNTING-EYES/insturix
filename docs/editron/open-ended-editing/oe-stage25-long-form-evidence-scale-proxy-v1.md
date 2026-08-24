# Stage 2.5 long-form evidence-fabric scale proxy V1

**Status:** `SCALE_PROXY_ONLY` / zero spend / zero project effects. This is a
structural research fixture and bounded retrieval receipt. It is not a
production media/evidence fabric, media-quality proof, semantic-accuracy proof,
or long-form product certification.

## Result

The slice replaces the old six-ID/duration-only long-form approximation with a
complete synthetic inventory representing exactly 4.5 hours (16,200 seconds)
of source duration. It validates professional identity *shape* using the
existing unwired `EditorialMediaIdentityContractV1` and existing
`EditorialPlanArtifactRefV1` vocabulary. It adds no media, evidence, plan,
timeline, project, storage, index, provider, render, or proof authority.

Exact fixture identities:

- inventory SHA-256:
  `421cd9bfca4853a3212a8cc48602d901191e321688308de08b4152be4b167fba`
- bounded request SHA-256:
  `a0a3aac3b9a363ab7455b2652180f6b01df6d9634a3ea34ac96ef07c021ab05f`
- bounded retrieval receipt SHA-256:
  `5fd746ddc7dd8385970a4f91347719093d5081a8f9a6942e8eb79582ad1c69f1`
- focused verification: 11/11 tests passed.

## Inventory represented

| Source | Duration | Cadence | Reel/timecode |
| --- | ---: | --- | --- |
| `source-camera-a` | 1,001 s | CFR 24000/1001 | `A001`, `01:00:00:00` |
| `source-camera-b` | 1,001 s | CFR 30000/1001 | `A002`, `02:00:00;00` |
| `source-camera-c` | 1,001 s | CFR 60000/1001 | `A003`, `03:00:00;00` |
| `source-keynote` | 3,600 s | CFR 24/1 | `K001`, `04:00:00:00` |
| `source-workshops` | 3,600 s | CFR 25/1 | `W001`, `05:00:00:00` |
| `source-broll` | 3,000 s | CFR 50/1 | `B001`, `06:00:00:00` |
| `source-phones-vfr` | 2,997 s | VFR, nominal 30000/1001 | `P001`, `07:00:00;00` |

Every source has a unique immutable source-version hash, source-PTS timebase,
reel/timecode evidence, audio-stream identity, proxy mapping reference and four
full-source references: `TRANSCRIPT`, `SHOT`, `AUDIO` and `RIGHTS`. The 28
references are hash-bound to source asset, source version, exact full-source
range, producer reference and summary-unit count. They deliberately contain no
evidence payload or media bytes.

## Bounded retrieval behavior

The measured passing receipt requests two exact PTS windows totaling 90 seconds:

- 60 seconds from `source-camera-a`, requiring transcript, shot, audio and
  rights references;
- 30 seconds from `source-phones-vfr`, requiring shot and audio references.

It selects six references, records six `COVERED` entries, consumes 590 of the
fixture's 2,000 estimated context tokens and leaves 1,410. Each selected window
carries the exact source version, source PTS/timebase, reel identity, cadence,
artifact reference and producer reference. A constrained run remains inside
its reference/token ceilings, records every excluded requested reference in an
omission ledger, and returns `UNVERIFIABLE_CONTEXT_BUDGET`; it cannot report a
partial context as complete.

Every requested range carries an explicit, unique, contiguous
`priorityOrdinal`. The request constructor sorts ranges by that declared
priority and evidence kinds by the frozen contract order before hashing or
selection. The kind order is only a deterministic transport order; it is not
an editorial-quality ranking. Tight-budget metamorphic tests prove that
permuting either input array leaves the selected/omitted semantic set, request
identity and receipt identity unchanged. Duplicate or gapped range priorities
fail closed.

The receipt has a strict nested schema and recomputes its own structural
accounting: disposition versus omissions, covered/omitted tuples, selected
bindings, unique window/evidence/coverage identities, range counts, duration
ceilings, reference ceilings, token consumption and remaining-token
arithmetic. Its limitation tuple is exact and the accepted receipt is deeply
frozen. Adversarial tests alter those inner values, recompute the receipt hash,
and still prove deterministic rejection.

The token count is a deterministic scale-proxy estimate, not a provider-native
token count or invoice. Production hydration must count the actual serialized
text/media representation through the chosen provider's official tokenizer or
counting endpoint while preserving the same fail-closed budget semantics.

## Failure and proof boundary

The focused suite proves deterministic rejection of:

- a missing required evidence kind, even when the outer inventory is rehashed;
- a tampered evidence artifact binding;
- a stale source-version request;
- duplicate or non-contiguous range priorities;
- an unknown source or out-of-bounds source-PTS range;
- a per-window duration-budget violation;
- an inventory/request hash mismatch; and
- a tampered retrieval receipt, including self-rehashed inner-accounting
  forgeries.

The three modules contain no provider, network, database, renderer,
ProjectService or PlanService execution path. Counters bind zero inference,
network, render, canonical project reads and canonical project mutations;
`stateEffects` is empty.

This proves local structural integrity only. A SHA-256 value contained in the
same object is not an issuer signature, trusted timestamp, or provenance
proof. The slice does not authenticate a storage/index owner, bind real
evidence payloads, or establish that the referenced observations exist.

## Files

- `lib/editron/research/open-ended-planner/stage25-long-form-evidence-scale-proxy-v1.ts`
- `lib/editron/research/open-ended-planner/stage25-long-form-evidence-scale-proxy-fixture-v1.ts`
- `lib/editron/research/open-ended-planner/stage25-long-form-evidence-range-retrieval-v1.ts`
- `tests/editron/open-ended-planner-v2-stage25-long-form-evidence-scale-proxy.test.ts`

## What remains

This slice does not materialize source bytes, transcripts, shots, waveforms,
rights records or vectors. It does not exercise R2, Mongo, Qdrant, mediaAssets,
durable sharding, cancellation, relink, ProjectService, PlanService, a provider,
a renderer, semantic retrieval quality or an editor. The production successor
must bind actual canonical evidence-owner records and authorized byte windows,
measure real context/token cost, prove cache/invalidation behavior, and then run
held-out long-form retrieval plus rendered/editor review. These open links must
not be bridged by promoting this receipt.
