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

## RHC-01 candidate-state successor — 2026-08-26

Commit `ca197f370` materializes exact editable candidate state for one frozen
target without changing this historical safe-stop receipt. `RHC-01` now has:

- a native Editron overlay plan with independent source and text objects;
- an RHC-specific generated-composition program that passes the existing
  program verifier;
- a hybrid generated-island/native-continuation form with an explicit 30/1
  timebase and source-frame boundary handoff.

All three bind the same frozen task hash, source identities, target predicates
and preservation predicates. They remain `NOT_RENDERED`, `UNJUDGED` and
`NOT_AUTHORIZED`; provider calls, render calls and canonical project writes are
zero. The generated programs are human-authored fixtures, not model evidence,
and the fixture's silent 1080x1920 30/1 scope is not a universal product claim.

Focused route/candidate verification is 27/27; repository typecheck and quiet
ESLint pass. Next: materialize exact fixture bytes, render each candidate
through the existing native/generated owners, prove the declared boundary, and
only then issue a blind-review pack.

## Preview-runtime successor — 2026-08-26

Commit `1646244e6` adds the bounded local runtime needed for that next step. It
materializes three deterministic, silent H.264/BT.709 source fixtures at
540x960, 30/1 and 210 frames, then byte-copies the third source as the declared
continuation asset. The receipt binds every byte, the installed FFmpeg and
ffprobe identities, and the bundled OFL Noto Sans font without claiming a
licensed customer corpus or universal media support.

The same slice renders a real video overlay through Editron's existing
Remotion editor root and assembles a generated-island/native-source boundary
through an exact FFmpeg frame contract. The initial assembly exposed a real
239/240-frame timestamp defect; segment timestamps are now constructed from
their frame ordinal before concatenation, and the exact 240-frame assertion
passes. Focused runtime verification is 3/3; repository typecheck and quiet
ESLint pass.

This is still runtime-mechanics evidence only. It made zero provider, cloud,
database or ProjectService calls; did not mutate a project; did not render the
three full RHC-01 candidates; and issued no route, quality, fidelity or product
authorization. The next bounded slice remains the full candidate render and
hash-bound blind-review pack.
