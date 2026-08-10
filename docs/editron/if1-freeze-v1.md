# Editron Interface Freeze 1 — candidate

Base: `7e9b4dd7ff60beeef2b6dfff4038ca367164cb65`.

This candidate freezes the shared vocabulary for migrated and new mutation paths. It does not tag a release, migrate the project as a whole, or make a new runtime authority.

## Owner boundaries

- ProjectService is the sole native ProjectRevision issuer and decoder. The IF1 adapter delegates to that owner, exposes only opaque references, and has no persistence behavior.
- CheckpointService remains the sole checkpoint store; ProjectService remains the sole restore writer. Undo requires the Phase 2C writer-issued R_after, and a competing mutation returns `unsafe-undo`, `CHECKPOINT_RESTORE_UNSAFE_UNDO`, and `zeroMutation: true`.
- TimelineRevisionRefV1 is a projection-equality token. Its basis ProjectRevision is provenance, never a second CAS.
- Canonical command hashing is deterministic across UI/chat intent. Actor, project, and operation scope remain outside the hash and must be enforced by authenticated owners.
- IF2/IF3 cross this boundary only as ExternalReferenceV1. This candidate freezes no media, brand, evidence, or coverage internals.

## Proof and migration truth

Proof states are `PASS`, `FAIL`, `UNVERIFIABLE`, and `NOT_REQUIRED`. Missing required proof is always `UNVERIFIABLE`; proof-not-required is not proof success.

Still-unmigrated project writers are deliberately recorded in the manifest:

- Director lock metadata
- chat render-proof metadata
- MG child paths

The candidate does not import or promote MutationGateV0, `projects.mutationSpineV0`, the Session A operation journal or checkpoint store, a private Mongo writer, a second capability registry, ExecutionGraph runtime authority, or detailed IF2/IF3 schemas.

Rollback after review is `git revert <artifact-commit>`. No tag is created by this candidate.
