# Editron Chat-To-Edit Phase 3D-B Evidence - 2026-07-16

## Scope

This slice connects script-led chat intent to Editron's existing durable Phase 2 multi-asset Storyline pipeline. It does not add a second script matcher, composer, Director, family planner, or renderer.

## Verified Control Flow

The signed internal path in `app/api/services/editron/auto-edit/from-batch/route.ts` already owns production script recomposition:

1. load every usable asset and per-asset analysis for the source upload batch;
2. merge the persisted `productionBriefIntake`;
3. build the production brief and multimodal scenes;
4. call `orderStorylineWithLLM` with the authoritative script and script-query embeddings;
5. fail loud if script grounding is unavailable or invalid;
6. materialize the selected Storyline into the canonical timeline;
7. persist overlays, duration, source provenance, and multi-asset Director context;
8. queue Director for the resulting timeline.

External requests with an existing project return/recover its status. A QStash-signed internal request continues through recomposition. This distinction was verified before wiring the chat seam.

## Production Change

`queueChatScriptRecomposition` now:

- validates the same 12,000-character script limit consumed by the batch route;
- loads the project and batch with `projectId + userId` ownership scope;
- rejects projects without a source upload batch;
- refuses to steal an active orchestration lease or Director lock;
- atomically persists script, goal, and normalized editorial preferences;
- resets the existing batch orchestration to `requested` without copying composer logic;
- clears stale orchestration/Director delivery state;
- publishes the existing signed `from-batch` route through QStash;
- attaches an intent-scoped QStash deduplication key;
- records dispatch metadata;
- marks transport failures retryable and clears the intent claim so a retry can reclaim it;
- returns `queued`, `already-queued`, or an explicit failure reason.

`dispatchScriptIntentToPhase2` is now the default script owner in `apply_editorial_intent`. The chat response reports processing and cannot claim that the timeline already changed. The legacy single-video `auto_edit_from_script` tool remains filtered from the live chat graph.

## Authority Boundary

Chat owns only semantic intent capture and durable dispatch. The existing owners remain:

- multimodal per-asset evidence: batch analysis plane;
- script-to-scene grounding and ordering: Phase 2 Storyline planner;
- canonical timeline materialization: existing batch composer;
- overlay/family decisions: Director and unified planner;
- physical form: existing family resolvers/renderers.

No renderer form, MG type, transition type, SFX token, caption style, keyframe recipe, or preset was added to the chat contract.

## Adversarial Verification

`tests/editron/chat-script-recomposition.test.ts` proves:

- owner-scoped atomic claim and signed dispatch;
- duplicate intent idempotency;
- active-lease exclusion;
- missing source-batch failure;
- concurrent claim resolution without double publish;
- publish failure is retryable and never reported as queued;
- oversized script rejection before database access;
- the selected chat script reaches only the durable Phase 2 owner.

The broader verification set passed 132/132 tests across chat intent, canonical evidence, tool registry, project isolation, the chat battle harness, the signed batch route, Storyline ordering, script beat planning, unified planning, and Director authority.

Focused ESLint passed. Full TypeScript reported only the pre-existing Avatar Vault route export, Calos route export, two prompt probe, and temporary SaaS fixture errors; no Phase 3D file appeared.

## Honest Remaining Proof

The code path is wired and regression-tested. A deployed, signed QStash request from a real chat turn still needs to prove the live environment contract end to end:

`chat request -> intent audit -> batch requested/composing -> grounded Storyline -> canonical timeline save -> Director queued`

Until that live trace is captured, Phase 3D-B is code-complete but not live-proven.
