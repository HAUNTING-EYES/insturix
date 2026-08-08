# SFX S1 Milestone Report — 2026-08-08

Session G0. Branch `infrastructure-improvs-+Editron` (P0-audited live branch).

## Summary

S1 wires existing realized transition/MG evidence into the selector's already-present
`surface/direction/motionSpeed/material` fields, without changing role eligibility,
score weights, semantic behavior, silence, provider policy, or catalog contents.

## What changed (owned paths only)

| File | Change |
|---|---|
| `lib/pipeline/sfx-selection-evidence.ts` | NEW pure `SfxSelectionEvidenceV1` + `deriveSfxSelectionEvidence` + `quantizeMotionSpeed`. Anti-fabrication: direction only from real transition label/axis or signed motion vector; motionSpeed only when motion is real (normalized magnitude never fabricated into px); material only when explicit; center/absent → no direction. |
| `lib/pipeline/sfx-catalog.ts` | `SfxCatalogSelectionRequest.evidence` + `SfxCatalogSelectionReport.requestedEvidence`. Selector already scored these fields; evidence is now surfaced in the report. No score/role/silence change. |
| `lib/pipeline/sfx-library-service.ts` | `searchAndDownloadSFX` accepts optional 8th `selectionEvidence` param; copies `surface/direction/motionSpeed/material/evidence` into the selector request. Backward compatible. |
| `lib/editron/services/transition-sfx-placer.ts` | Passes realized transition direction (from atomic transition form label) + surface `transition` as evidence. |
| `lib/editron/services/kinetic-sfx-service.ts` | Passes surface `motion-graphic` + motionSpeed only for genuinely kinetic kinds (entrance-pop, directional-swipe); tick/rustle/sting get no speed. |
| `app/api/services/editron/transitions/suggest-sfx/route.ts` | Direction/motionSpeed from the explicit transition key (wipe-left/slide-up/whip-pan); dissolve/iris → absent. |

## Evidence provenance (S1 §7.4)

Each value is reported with `evidenceKeys` and a single confidence in
`SfxCatalogSelectionReport.requestedEvidence`, and the whole selection report is
returned by `SFXLibrarySearchReport.catalog`. Reports prove where every value came from.

## Tests (all green)

- NEW `tests/pipeline/sfx-selection-evidence.test.ts` (13): wipe-left/right, whip-pan fast,
  dissolve no-direction, center not a direction, MG directional slide, static crop/mask
  no-fake-motion, weak/absent material, version+confidence, quantizer velocity+duration buckets.
- NEW `tests/pipeline/sfx-catalog-s1-evidence.test.ts` (5, production path): evidence reaches the
  report via `searchAndDownloadSFX`, whip-pan speed, dissolve no-direction, neutral-catalog
  non-regression, absent-evidence backward compatibility.
- P0/core + rights + canaries: **82/82** (sfx-form, sfx-library-service, provider-outage,
  render-canary, render-mix, edl-atomic-sfx-form, native-rights, catalog-publish, catalog-curation,
  uploaded-sfx-render-canary, sfx-library-route). Neutral assets remain eligible under directional
  evidence (S1 §7.3 honored).
- `npx tsc --noEmit`: **0 errors in owned paths** (pre-existing unrelated errors unchanged).
- ESLint `--quiet` on all owned files: clean.

## Anti-fabrication verification (per instruction)

- wipe-left/right direction comes ONLY from the real transition direction (label/axis), never invented.
- dissolve/iris → no fabricated direction; center → absent.
- MG directional-swipe does NOT fabricate left/right without a real signed vector (only
  `entrance-pop`/`directional-swipe` get motionSpeed; direction requires a real vector).
- static crop/mask → no fake motionSpeed (no motion source).
- weak/ambiguous material → absent.
- neutral catalog entries are NOT hard-rejected by directional evidence (S1 keeps them eligible; direction only influences rank).

## S1 EXIT GATE: PASS

- evidence reaches the selector ✅
- baseline behavior does not regress (82/82) ✅
- reports prove where every value came from (`requestedEvidence.evidenceKeys`) ✅
- no S3/S4/S5 policy introduced ✅

## Commits
- S1 implementation + tests (this report accompanies the commit). Not merged into programme branch.
