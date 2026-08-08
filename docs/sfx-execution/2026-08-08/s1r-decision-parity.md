# SFX S1-R Reconciliation — Decision Parity (2026-08-08)

Session G0. Trigger: definitive current-truth audit — populating
`surface/direction/motionSpeed/material` changes live selection because those
fields already participate in `selectSfxCatalogEntry` eligibility/scoring,
even with unchanged weights.

## Baseline identity

- Branch: `infrastructure-improvs-+Editron`
- HEAD at reconciliation: `e463e026c` (billing commits landed after S1; SFX work is
  committed on top of `15c40951e`)
- **Pre-S1 baseline SHA: `15c40951e2f06d260159a885ac0eca22617590aa`** (`eb791a490^`)
- S1 candidate SHA: `eb791a4902692c33d7f578d86a78e86d8a3f26d3` (preserved, not amended)
- Follow-up SHA: see commit (S1-R shadow)

## Parity model (vs the audit's objection)

`selectSfxCatalogEntry` is pure; its request already contains the scored fields
pre-S1. Real behavior change = callers now *populate* those fields.

| Model | Request fields surface/direction/motionSpeed/material | Selection effect |
|---|---|---|
| BEFORE (pre-S1) | absent (callers never set them) | baseline decisions |
| AFTER (eb791a490) | populated from derived evidence | **decisions/ordering changed** (11/11 corpus items) |
| SHADOW (S1-R) | **absent; evidence only in `request.evidence` (report)** | identical to BEFORE (11/11) |

## Why populating changes behavior (verified in `scoreCatalogEntry`)

- `surface`: when set, `surfaceMatch ? +0.14 : 0` replaces the no-surface `+0.1`
  and can add `surface-mismatch` rejection reason.
- `direction`: when set, neutral entries get `+0.03` instead of `+0.04`, and
  mismatches add `direction-mismatch`.
- `motionSpeed`: `+0.05` only when matching entry.
- `material`: `+0.04` when equal.
All are score paths present pre-S1; populating the fields activates them.

## Decision-parity matrix (11 representative corpus items)

Script: `scripts/s1r-decision-parity.ts` (harness). Full JSON:
`.calibration-temp/sfx-p0/p0-2026-08-08/s1r-decision-parity.json`.

| # | Corpus item | AFTER changed? | SHADOW equivalent to BEFORE? |
|---|---|---|---|
| 1 | transition wipe-left | YES | YES |
| 2 | transition wipe-right | YES | YES |
| 3 | transition dissolve | YES | YES |
| 4 | transition whip-pan | YES | YES |
| 5 | MG kinetic directional-swipe | YES | YES |
| 6 | MG static count-settle-tick | YES | YES |
| 7 | MG static crop (no motion) | YES | YES |
| 8 | impact | YES | YES |
| 9 | UI tick | YES | YES |
| 10 | ambience bed (scene) | YES | YES |
| 11 | foley rustle | YES | YES |

**BEFORE→AFTER:** 11/11 decisions changed (selected assetId, candidate set,
or ordered ranking — even when the top asset id coincided, ordering differed).
**BEFORE→SHADOW:** 11/11 selection-identical (decision, selectedAssetId,
acceptedAssetIds, rejected+reasons, orderedTop all equal).

Where the audit's inference (populating scored fields changes selection) was
correct — on a 49/49-neutral manifest the direction field happened not to
hard-reject, but surface eligibility + all score deltas changed ordering.
That is exactly why S1 must be shadow-only until S2 calibrates classifiers.

## S1-R follow-up (shadow-only for selection)

Committed after this report: `lib/pipeline/sfx-library-service.ts` now passes
only `evidence` (report) into `selectSfxCatalogEntry` — it no longer copies
`surface/direction/motionSpeed/material` into the live scored request fields.

Preserved (not weakened, per instructions):
- `SfxSelectionEvidenceV1` + derivation (pure helper)
- `evidenceKeys` provenance
- report visibility (`SfxCatalogSelectionReport.requestedEvidence` +
  `SFXLibrarySearchReport.catalog.requestedEvidence`)
- production caller plumbing (transition-sfx-placer, kinetic-sfx-service,
  suggest-sfx all still pass derived evidence)

Selection behavior now identical to the frozen pre-S1 baseline.

## Tests

- `tests/pipeline/sfx-selection-evidence.test.ts` (13) — helper anti-fabrication (unchanged).
- `tests/pipeline/sfx-catalog-s1-evidence.test.ts` (6, incl. new S1-R parity test):
  shipped `searchAndDownloadSFX` no-evidence vs evidence produce **equal**
  `{selectedAssetId, acceptedCandidateCount, rejectedCandidateCount, decision}`;
  provenance still visible in the report.
- P0/core + rights + canaries: 82/82.
- `npx tsc --noEmit`: 0 errors owned; ESLint owned: clean.

## Verdict

**NEEDS-SHADOW-FOLLOWUP** → follow-up committed (evidence removed from live
scored fields; report-only). Post-follow-up:
**S1-R PASS — selection-equivalent to pre-S1 baseline.**

## Rebaselined P0 caller coverage (addendum to P0)

Definitive audit also disproved P0's "no hidden producer" claim. Corrected map
(additions in bold):

- **Manual Freesound insertion** (`sfx-library-panel.tsx:77-117`) — direct
  `addOverlay`, hard-coded 30fps/vol, bypasses sfx-form/searchAndDownloadSFX.
- **Uploaded SFX assignment** (`uploaded-audio-assignment.ts:422-484,713-759`) —
  direct overlay append, bypasses form/catalog selector.
- Transition SFX (`transition-sfx-placer.ts`) — audited path.
- MG kinetic SFX (`kinetic-sfx-service.ts`) — audited path.
- Chat add/replace (`agent/tools.ts`, `generateSFX`) — audited path.
- EDL/Director/Auto Edit indirect producers (`edl-executor.ts`) — audited path.

P0 completeness claim revised: NOT complete until manual + uploaded producers
are represented (they are SFX producers that reach render admission via
rights receipts; both are recorded now).