# Editorial media identity contract V1

Status: `UNWIRED_CONTRACT_ONLY`

This is a vocabulary and validator for the future canonical editorial media
graph. It is deliberately not an ingest migration, media resolver, source-to-
proxy mapper, ProjectService command, operation authorizer, or production
timeline schema.

## Current ownership remains unchanged

| Concern | Current owner | This contract does not do |
| --- | --- | --- |
| Stored media asset metadata | Existing `MediaAsset` / `AssetResolver` path | Read, write, resolve, or replace an asset record |
| Upload metadata | Existing Editron upload route | Probe, persist, or backfill source identity |
| Project timing and overlays | Existing `ProjectService` and legacy editor | Mutate a project, convert frames, or apply an edit |
| Source/proxy conversion | No canonical product owner yet | Generate a PTS map or infer a ratio-only mapping |

## Contract boundary

The implementation at
`lib/editron/contracts/editorial-media-identity-contract-v1.ts` accepts only a
supplied value and returns validation diagnostics. It requires:

- immutable asset and receipt references for a `QUALIFIED` identity;
- a rational source PTS timebase and half-open source range;
- reel/timecode evidence, video colour/pixel fields, and audio stream identity;
- an immutable PTS mapping reference for VFR media; and
- a source-to-proxy mapping before precise timeline or conform use.

Legacy media can be represented only as `UNQUALIFIED_LEGACY` and is always
`REFERENCE_ONLY`. The schema is strict, so raw URLs and unrecognised fields are
rejected rather than becoming a hidden resolver input.

## Migration gate

No runtime consumes this contract yet. A later, separately approved phase must
introduce a real ingest probe/receipt owner, persist qualified source identity
through the existing media owner, and reference it from a ProjectService-owned
canonical sequence command. That phase must also requalify the CAP-2 evidence
boundary and must not reuse the Stage 2.5 research reference or budget owners.
