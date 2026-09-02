# Stage 2.5 held-out route freeze V1

Date: 2026-08-25

Authority: research specification and symbolic sentinels only

Provider dispatch: disabled

Project mutation: none

## Frozen identities

- Freeze: `6ce29e85500d5a56b4f3c42b568d5b682fde4464de4d298358ff30af0af315a8`
- Arm count: `16`
- Task hashes:
  - `RHC-01`: `9701f595b53c90e7a7ef921d51e91786b8204a63bcb60a8625b534f0d70f08cd`
  - `RHC-02`: `d5ee3689ef0ce3f9341c1363cbcdb9fa91636f6487b5d6bd4e6fbc0771292fa9`
  - `RHC-03`: `560623d9895a005e54b015a95433d9e6fee292a9dad5f4d18dbb6413d40571ab`
  - `RHC-04`: `1e34fb82b82f80fea9888039712af69984dc575942b04c4b9129bf80f7948ea1`

## Purpose

The previous route evidence is one DEV-02 moving-panel family. This successor
uses four new route-neutral targets: an editable feature board, an interview
chapter with continuous speech/room tone, synchronized dual views, and a
results card with a measured correction round trip.

Every target has identical public material under four arms:

- `FREE_CHOICE`
- `FORCED_NATIVE`
- `FORCED_GENERATED_COMPOSITION`
- `FORCED_HYBRID`

The route instruction changes; the brief, sources, fonts, target predicates,
preservation predicates and target hash do not.

## Fairness rules

- There is no single hidden expected route. Any route may pass when qualified
  owners satisfy all observable predicates and preserve editable state.
- A forced arm never creates capability. An unavailable forced owner may pass
  only through an untouched structured capability gap.
- Attempting an unavailable owner fails even if a downstream guard blocks it.
- Flattening fails whenever independently editable text, sources, layout or
  correction state is required.
- Hybrid needs explicit native owner, generated sandbox, timebase, audio and
  boundary handoffs.
- Public packets omit evaluator policy, baseline names, acceptable-route keys
  and sealed source-to-review mappings.

## Honest ceiling

The fixtures are not materialized. The evaluator exercises symbolic known-good,
equivalent-good, known-bad and safe-stop paths only. `STRUCTURAL_SENTINEL` is
not rendered proof, human quality proof, ProjectService proof or route
certification. The freeze has zero provider calls and zero state effects.

Before inference, fresh media/font fixtures, exact route owners, real shared
target/preservation proof, current-source closure and a separate no-spend
readiness receipt must exist. Any future paid call still requires an explicit
capped authorization.
