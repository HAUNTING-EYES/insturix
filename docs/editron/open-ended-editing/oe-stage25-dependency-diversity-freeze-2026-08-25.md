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
