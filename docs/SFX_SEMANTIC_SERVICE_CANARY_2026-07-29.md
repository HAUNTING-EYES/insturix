# SFX Semantic Service Artifact Canary

Date: 2026-07-29

Branch: `infrastructure-improvs-+Editron`

Worker implementation commit: `fd1ca86d`

## Scope

This canary proves the evidence-preserving FSD50K publication chain and immutable
semantic release format needed by the remote SFX worker. It does not activate a
production catalog entry.

The sole review receipt identifies its reviewer as
`codex-canary-not-human-approval` and states that it is not a production approval.
The repository's live `public/sfx/manifest.json` was not changed.

## Artifact Root

```text
D:\.pnpm-store\v11\projects\d60e9ddb05b5ddd9c39d2270cb07340c\tmp\sfx-harvest\fsd50k-v1\p8-full-corpus\p13-semantic-service-canary
```

The canary was regenerated through the current contracts:

```text
review receipt
  -> publication-gate-v3
  -> publication-aggregate-v3
  -> evidence-preserving curated delta
  -> catalog merge
  -> R2 publication and byte verification
  -> catalog promotion
  -> immutable semantic release
  -> pinned local CLAP retrieval
```

## Publication Evidence

- Existing catalog entries preserved: `29`
- Isolated canary delta: `1`
- Promoted manifest entries: `30`
- Entries carrying semantic evidence: `1`
- Semantic evidence version: `sfx-catalog-semantic-evidence-v2`
- Promoted manifest digest:
  `43156cdaec78d89a2fcd527d782dcedcb20798c09d9e7674340c201879b4bb9f`
- Promotion receipt digest:
  `e3163b4d0c33f0d1168c7bd61ce157e04db648c1239f0038352ae103e28e2a9e`

The content-addressed canary object was uploaded to R2 and fetched again through
the public asset proxy:

- Asset ID: `sfx_catalog_54e86c875de6bf85a7f560df`
- Public bytes: `2,285,508`
- Public SHA-256:
  `54e86c875de6bf85a7f560df6163b0dd8e90129bbf522d18114dc31e74cf2089`

## Semantic Release

Directory: `semantic-release`

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `metadata.json` | 2,469 | `a2abe65323e4bcab79a2158791177ae71ba540ba259a0ceae34ea778f3f2d62c` |
| `vectors.f32` | 2,048 | `d986e0a931171ed9e9b196889fee39d2fef07bf3397982505bb09099d5456e06` |
| `semantic-release-receipt.json` | 1,583 | `937742e17a7f39b5241ebf717379813b2d698c81b6ea17c3da3d9d479478d4e9` |

Receipt payload digest:
`5b8a1618a5f586397c78a1bccf9027b6ca6d3a06c647bbd9c0e554099cc4327a`

Release counts:

- Approved canary assets: `1`
- Semantic vectors: `1`
- Source gates: `1`
- New checkpoints: `1`
- Unreviewed corpus assets included: `0`

## Retrieval Proof

The immutable release was loaded using the pinned offline model:

```text
Xenova/clap-htsat-unfused
revision c28f2883575e590e04d3146ff0713c2448d691ba
Transformers.js 3.8.1
q8, 512 dimensions
```

Measured local canary:

- Cold release/model load: `3,598 ms`
- Query: `fast car pass directional whoosh`
- Query time: `43 ms`
- Returned asset: `sfx_catalog_54e86c875de6bf85a7f560df`
- Cosine similarity: `0.404444`
- Runtime manifest digest matched the promoted manifest digest
- Runtime release receipt digest matched the immutable receipt

## Verification

Focused artifact suite:

```text
5 test files passed
24 tests passed
```

Covered publication gate, aggregate/merge/promotion, semantic release, semantic
index, and authenticated worker behavior.

`npx eslint . --quiet` passed.

`npx tsc --noEmit` remains blocked by the pre-existing generated Next route-export
errors plus unrelated errors in `scripts/render-editron-aesthetic.ts` and
`tests/editron/rendered-aesthetic-harness.test.ts`. No canary or semantic-worker
TypeScript error was reported.

## Activation Boundary

This artifact is sufficient to package and deploy the semantic worker and run an
infrastructure canary. It is not sufficient to activate semantic selection in the
live editor because the bundled manifest still has zero semantic-evidence entries.

Production activation requires a genuinely human-approved evidence-bearing catalog
release. The 13,552-entry FSD50K CLAP index remains a discovery/review index and is
not implicitly approved for publication.
