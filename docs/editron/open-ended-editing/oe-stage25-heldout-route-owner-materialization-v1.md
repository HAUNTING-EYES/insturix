# Stage 2.5 held-out route owner materialization V1

Date: 2026-08-25

Authority: zero-spend owner-derived safe-stop evidence only

Provider calls: zero

Render calls: zero

Canonical project mutation: none

## Result

All sixteen `RHC-01` through `RHC-04` route arms now pass through current owner
boundaries rather than caller-authored availability booleans. Every arm returns
`PASS_SAFE_STOP`, because no arm is currently executable without inventing an
owner or fixture.

The native probe invokes the real ProjectService isolated proposal-clone owner
and its real sole dispatcher, but supplies them an in-memory, read-only
canonical project-loader fixture rather than a live ProjectService datastore.
It asks the dispatcher for `add_overlay`. The dispatcher returns
`PROJECTSERVICE_ISOLATED_DISPATCH_OPERATOR_UNSUPPORTED`; its only concrete
writers remain `cut_section` and focal-scale `set_keyframes`. The proposal
receipt has no changed paths and the canonical fixture remains unchanged.

The generated-composition probe validates the current research capability and
the existing program verifier. The capability is qualified only for `DEV-02`.
No RHC program, evidence pack, reference blueprint, media, font or proof bundle
exists, so verification returns `CONTRACT_INPUT_MISSING`. The generated
composition sandbox execution owner is recorded only as the candidate owner;
it was not invoked or exercised, and sandbox execution calls remain zero.

Hybrid therefore also stops: it lacks both an isolated native overlay writer
and an RHC-qualified generated program, before timebase, audio or boundary
handoffs could be proved.

## Proof ceiling

`SAFE_STOP_OWNER_PROOF_ONLY`

This proves that missing owners and materialization fail closed with zero state
effects. It does not prove target fidelity, route quality, editability,
ProjectService product mutation, rendering, correction time, latency or cost.

## Required next materialization

1. Reuse or extract the live `add_overlay` form owner behind an isolated,
   revision-issued ProjectService proposal writer; do not copy its form logic.
2. Materialize exact licensed RHC media and fonts plus evidence/rights records.
3. Issue RHC-specific generated programs through the existing verifier and
   deny-all sandbox; the DEV-02 capability cannot be relabelled.
4. Compose explicit timebase, audio and boundary handoffs for hybrid arms.
5. Bind actual proxy outputs to target/preservation proof and the blind-quality
   receipt before drawing a route conclusion.
