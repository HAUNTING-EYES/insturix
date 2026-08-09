# Editron Interface Freeze 1 — candidate

Base: `7e9b4dd7ff60beeef2b6dfff4038ca367164cb65`.

This candidate freezes shared vocabulary for deliberately migrated paths. It
does not create a mutation runtime, tag a release, or migrate the project.

## Owner boundaries

- ProjectService alone issues and decodes native project revisions. IF1 exposes
  an opaque, project-scoped `ProjectRevisionRefV1`; consumers store, relay, and
  compare it only. Integer counters and `updatedAt` are never IF1 fields.
- A `TimelineRevisionRefV1` is project- and projection-owner-scoped normalized
  projection identity. `basisProjectRevision` is provenance, not semantic
  equality or a persistence CAS. `expectedTimelineRevision` may reject or
  re-resolve a timeline-relative target; only ProjectService CAS persists.
- Timeline ranges are explicitly frame-based and include a project-scoped,
  versioned `TimelineTimebaseRefV1`. IF1 never freezes naked timeline times.
- The canonical command hash uses the versioned NFC-normalized JSON format,
  code-unit key ordering, normalization-collision rejection, and SHA-256. It
  includes project, expected revision preconditions, target/coordinates,
  parameters, opaque external references, proof policy, and failure policy.
  Actor and operation ID scope replay separately through an actor/project
  replay key, so UI/chat representation cannot choose JSON semantics.
- IF2/IF3 cross this boundary only as `ExternalReferenceV1`; IF1 freezes no
  media, brand, evidence, or coverage schema.

## Proof, retry, and undo truth

Proof status is exactly `PASS`, `FAIL`, or `UNVERIFIABLE`. A missing required
proof is `UNVERIFIABLE`; a not-required proof policy produces no proof result,
never a synthetic pass. Obligations use governed core namespaces and admit
namespaced extensions for visual, semantic, undo, replay, and delivery proof.

Retry disposition is normative: stale project state is `after-reload`, stale
timeline resolution is `after-reresolve`, and `transient-same-command` is only
valid for a proven zero-mutation transient failure. `unsafe-undo` is always
`never`: it returns `CHECKPOINT_RESTORE_UNSAFE_UNDO` with zero mutation.

Every transaction receipt observes before/after project and timeline revisions,
the conflict `currentProjectRevision` in its own field, checkpoint and undo
references, changed paths, command/operation identity, and proof policy.
Undo cites the original receipt and CheckpointService checkpoint, provides the
ProjectService-issued expected current revision, and receives a newly issued
revision on successful ProjectService CAS restore. It is not arithmetic and is
not automatically idempotent.

Still-unmigrated writers remain recorded in the manifest: Director lock
metadata, chat render-proof metadata, and MG child paths. This candidate does
not import or promote MutationGateV0, a Session A journal or checkpoint store,
a private Mongo writer, a second registry, an ExecutionGraph runtime authority,
or detailed IF2/IF3 schemas. Rollback after review is `git revert
<artifact-commit>`; no tag is created by this candidate.
