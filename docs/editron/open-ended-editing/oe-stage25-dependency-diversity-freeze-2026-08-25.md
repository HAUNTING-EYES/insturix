# Stage 2.5 dependency-diversity freeze

Date: 2026-08-25

Authority: research specification only

Provider dispatch: disabled

Project mutation: none

## Frozen identities

- Freeze: `1901f375a7628b81a2fc4a713f6db1e3acf57578df9b63314cae6124df938d57`
- No-spend policy: `236de0a11f7c7499e69a9555406280f7b470184a74957f4a4dfabeda604c653a`
- Sentinel receipt: `40487156e8804a4eb7707ba22a122775b202722b36f66acc266ea8324d8cdd50`
- Task hashes:
  - `HOLD-DEP-01`: `b418cafe043a52a00faaa24dd457311493c2c83689167658798dc70dc416830d`
  - `HOLD-DEP-02`: `7762ca44b6ef4ee23e882ac96e29661b5e76e6106dd4741e77786765d5956dd7`
  - `HOLD-DEP-03`: `99373d1813edfa3a8601fc48c93e8199080c41b6798988b1e3d0f35d02957c4a`
  - `HOLD-DEP-04`: `07392d64a1a29313396f4912305d5faae6548ec3a66a39c706ae07db96bafad9`

## Why this successor exists

`HOLD-01` through `HOLD-08` and `HOLD-FORK-JOIN-01` are historical evidence.
The fork/join result proves one six-operation chain, not general dependency or
invalidation behavior. This successor freezes four genuinely new shapes without
rewriting the earlier tasks or calling a model.

## Frozen tasks

1. `HOLD-DEP-01` requires a complete evidence quorum before three disjoint,
   serialized colour writers. Every writer permutation is acceptable when it
   consumes the latest receipt and preserves protected state.
2. `HOLD-DEP-02` forks old-state and replacement evidence, then requires a
   resolver-owned replacement to exist before destructive deletion. List and
   search discovery are equivalent when they bind the same asset version.
3. `HOLD-DEP-03` retimes a source event and then rebinds a later effect to that
   semantic event. It is deliberately `NOT_READY_PUBLIC_CONTRACT_GAP`: the
   current `apply_speed_ramp` catalog output contains only a receipt, not the
   downstream source-time transform. No hidden evaluator rule may substitute
   for that missing contract.
4. `HOLD-DEP-04` composes transforms from two noncontiguous cuts. Late-first and
   early-first-with-transformed-late are equivalent; stale coordinates, a
   partial single cut, forged transforms and unproved audio preservation fail.

Each task publicly exposes every scored rule, eligible operator, evidence ID,
safe-stop condition, proof ceiling and equivalent form. Each includes
known-good, equivalent-good, known-bad, zero-write safe-stop and tamper
sentinels. An owner-blocked unsafe attempt is still a model/benchmark failure;
it never receives safe-stop credit.

## Proof ceiling

This phase proves only that the task specification is complete enough to build
exact fixture/effect owners. It does not prove model competence, rendered
quality, product mutation, route selection or provider health. All fixtures are
explicitly `NOT_MATERIALIZED`, `dispatchAuthorized=false`, provider call count
is zero and state effects are empty.

## Next gate

Before inference, a separate bounded phase must materialize fresh fixtures,
implement exact state/effect owners, execute every sentinel at zero spend and
bind current-source closure. `HOLD-DEP-03` additionally requires a versioned
public speed-ramp/source-time mapping contract. Only a new readiness receipt and
an explicit capped authorization may permit a provider call.

## Zero-spend owner-materialization successor

This successor does not rewrite the frozen packets or authorize inference. It
materializes only the shapes that the current public owners can execute without
inventing hidden form, evidence or authority.

- Owner materialization:
  `f7ee9345be837a73d0135d9ce2d1484c7b0face37e83769e5eba6f7e100615d0`
- Owner-derived sentinel receipt:
  `3b1107dacabde47b843443024e0596240d405370b2c87fb76e7ae12fcfc2f19f`
- The receipt binds the original freeze `1901f375...` and original spec receipt
  `40487156...`; it contains 24 deterministic owner outcomes.
- `HOLD-DEP-01` and `HOLD-DEP-04` each execute all six frozen sentinels. Their
  known-good and equivalent-good forms reach the same task-specific final
  semantic state. Unsafe attempts fail, zero-write safe stops remain distinct,
  and tampered evidence or transforms earn no proof.
- The `HOLD-DEP-04` observing owner validates the complete materialized
  evidence-fact set and the exact ordered evidence-ID list before delegating to
  the cut owner. Missing IDs, forged IDs and stale-hash evidence facts stop
  before any isolated mutation.
- `HOLD-DEP-02` remains `NOT_READY_PUBLIC_FORM_OWNER_GAP`. The current public
  replacement resolver emits `use_matching_footage`, outside the frozen
  eligible set, and exposes neither the rights binding nor source-handle
  binding required for an honest add-before-delete owner. This conclusion is
  derived from explicit replacement-handoff fields; descriptive text that
  mentions rights or handles cannot create a binding.
- `HOLD-DEP-03` remains `NOT_READY_PUBLIC_SOURCE_TIME_MAP_GAP`; the speed-ramp
  output still lacks the public downstream source-time transform needed to
  rebind the semantic event.

The `HOLD-DEP-01` and `HOLD-DEP-04` projects, media descriptions and evidence
facts are deterministic synthetic fixtures. They establish structural owner
mechanics only. They do not establish real colour-evidence quality,
motion-evidence quality, audio-evidence quality or editorial quality.

The focused suite passes 19/19. Provider inference calls, render calls and
canonical ProjectService mutations are all zero. Execution occurs only on
fresh in-memory ProjectService clones through existing owner-issued revision
and cut/filter authorities. The receipt binds bounded runtime identities, not
a transitive current-source closure, rendered proof, canonical apply/reload or
model competence. Its inference disposition is therefore still
`NOT_READY_FOR_INFERENCE`.

## Public retime callable successor

Commit `afee8f1cc` closes the live-callable half of the `HOLD-DEP-03` gap. The
chat `apply_speed_ramp` handler no longer persists a planned curve through
independent `updateOverlay` calls. It now reads one ProjectService snapshot,
carries that exact revision into `applyVideoSourceRangeRetimeV1`, and returns
the writer-issued mutation receipt, timeline receipt, exact retime/ripple
effect and downstream source-time transform.

The callable is deliberately fail-closed and bounded to one complete isolated
CFR video source range at a constant rate above 1x through 4x. Partial curves,
slow motion, VFR, mixed-track reconform, overlapping dependent state,
insufficient handles, existing retime/keyframes and stale revisions are not
silently approximated. They return a no-write failure.

This does **not** rewrite the frozen V2R9 operator packet or its original
`NOT_READY_PUBLIC_CONTRACT_GAP` finding. That immutable packet still declares
receipt-only output. `HOLD-DEP-03` remains blocked until a new versioned public
operator contract binds the callable's closed form and output, all six frozen
sentinels execute at zero spend, and a successor readiness receipt is issued.
No inference, render or canonical test-project mutation occurred in this
callable phase.

## DEP-03 zero-spend owner successor

Commit `fa05fe4d8` adds the separately versioned successor that the frozen
packet required. It deliberately leaves the original V2R9 task, output and
expectations unchanged.

- Public contract:
  `EDITRON_OE_DEP03_PUBLIC_SPEED_RETIME_CONTRACT_V1_1`
- Contract hash:
  `5aa21f066ba5f8ac7cb39086da2cb7a6c48d0cf9ba20d907a0543037f75d40c8`
- Current-source audit:
  `dc49cd468507668853d19d92f3b4512749d7a0ffc38b97a0bf627c39fdbf1ee1`
- Baseline semantic project state:
  `99a9c4e510cb51bb326d2468c378c006caeebbf47e341206526bbb4132f69447`
- Expected final semantic state:
  `c5adbf7df5a8981fd7aaf29e9bd5000e5e40c8bc45c5365bcc0556b3eda01274`
- Owner materialization:
  `14efa0a6d21d2b97020f3943b5ea379c6e2b1c46d24e4c5112123bee8c2758e2`
- Owner-derived successor receipt:
  `fd2fb090abc47a8ef2bff474b427943df5bb1f537d1eb71c446207a3ef96d94a`

The public contract exposes exactly the writer-issued mutation receipt,
timeline receipt, retime/ripple effect and source-time transform. Its audit
hash-binds the current chat caller, ProjectService mutation owner, pure
source-range retime owner and downstream PTS-rebind owner. It also confirms the
frozen V2R9 output still contains only `receipt`; historical evidence was not
silently rewritten.

All six DEP-03 sentinels now execute in the isolated owner. Both legal paths
produce the same final semantic state: a source event at frame 100/PTS 300000
rebinds to project frame 50 after a complete 2x retime, and the restrained
shake is attached there rather than to the later spoken warning. A stale frame
100 attempt is blocked, absent mapping is a zero-write safe stop, a forged map
is rejected, and overlapping dialogue prevents the retime. The two formerly
blocked good cases intentionally do not match the frozen expectations; DEP-03
records 4/6 frozen matches and 6/6 successor matches.

The complete owner receipt now covers 24/24 sentinels across all four tasks.
Provider inference, render and canonical ProjectService mutation counts remain
zero. Focused verification passes 51/51; repository typecheck and quiet ESLint
pass. This proves synthetic current-edit mechanics only. It does not prove real
event/dialogue evidence, canonical apply/reload, a receipt-bearing camera-shake
writer, rendering, audiovisual quality, undo/replay, transitive current-source
closure or model competence. Inference remains `NOT_READY_FOR_INFERENCE`; the
next gate is the bounded native/generated/hybrid preview-candidate phase.
