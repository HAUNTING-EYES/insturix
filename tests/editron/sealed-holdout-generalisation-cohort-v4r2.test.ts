import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7 }
  from '@/lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v7';
import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import {
  assertSealedHoldoutGeneralisationManifestV4R2,
  buildSealedHoldoutGeneralisationManifestV4R2,
  SEALED_HOLDOUT_GENERALISATION_PATH_V4R2,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-generalisation-cohort-v4r2';

describe('sealed holdout successor generalisation cohort V4R2', () => {
  it('binds current CAP truth while preserving historical task and result identities', () => {
    const base = buildBase();
    const manifest = buildSealedHoldoutGeneralisationManifestV4R2({
      contractSourceSha256: fileSha(SEALED_HOLDOUT_GENERALISATION_PATH_V4R2),
      baseManifest: base,
    });

    expect(manifest.currentTruthBinding).toMatchObject({
      manifestSha256: CAP2_CURRENT_TRUTH_REISSUE_AUDIT_V7.manifestHash,
      runtimeAuthorityDenied: true,
    });
    expect(manifest.frozenTaskPacketBinding).toMatchObject({
      manifestSha256: base.manifestSha256,
      role: 'IMMUTABLE_TASK_PACKET_INPUT_NOT_CURRENT_CAP_ASSERTION',
    });
    expect(manifest.historicalEvidenceBinding).toMatchObject({
      paidCohortReceiptSha256:
        'fe4a3420356675d040c62c4f77f6fa6e98321c99c29eb9e767736f248b186787',
      historicalClaimsNotInherited: true,
    });
    expect(manifest.pilotRows).toHaveLength(3);
    expect(manifest.scoredRows).toHaveLength(45);
    expect(manifest.executionPolicy).toMatchObject({
      dispatchAuthorized: false,
      pilotAuditRequiredBeforeScoredCohort: true,
    });
    expect(manifest.stateEffects).toEqual([]);
    expect(assertSealedHoldoutGeneralisationManifestV4R2({
      value: manifest, baseManifest: base,
    })).toEqual(manifest);
  });

  it('keeps pilot rows disjoint and one-per-route', () => {
    const manifest = buildSealedHoldoutGeneralisationManifestV4R2({
      contractSourceSha256: fileSha(SEALED_HOLDOUT_GENERALISATION_PATH_V4R2),
      baseManifest: buildBase(),
    });
    const pilots = new Set(manifest.pilotRows.map(({ rowId }) => rowId));
    expect(manifest.scoredRows.some(({ rowId }) => pilots.has(rowId))).toBe(false);
    expect(manifest.routeSet.map(({ routeId }) => routeId)).toEqual([
      'OPENAI_LUNA', 'OPENAI_TERRA', 'GOOGLE_FLASH',
    ]);
    expect(manifest.pilotRows.map(({ caseId }) => caseId))
      .toEqual(['HOLD-08:C2', 'HOLD-08:C2', 'HOLD-08:C2']);
    expect(manifest.pilotRowSetSha256).toBe(hashCanonicalJsonV1(manifest.pilotRows));
    expect(manifest.scoredRowSetSha256).toBe(hashCanonicalJsonV1(manifest.scoredRows));
  });

  it('rejects forged authority and row identities', () => {
    const base = buildBase();
    const manifest = buildSealedHoldoutGeneralisationManifestV4R2({
      contractSourceSha256: fileSha(SEALED_HOLDOUT_GENERALISATION_PATH_V4R2),
      baseManifest: base,
    });
    for (const mutate of [
      (value: Record<string, unknown>) => { value.authority = 'PRODUCTION'; },
      (value: Record<string, unknown>) => {
        (value.pilotRows as Record<string, unknown>[])[0].rowId =
          (value.scoredRows as Record<string, unknown>[])[0].rowId;
      },
    ]) {
      const forged = structuredClone(manifest) as unknown as Record<string, unknown>;
      mutate(forged);
      const { manifestSha256: _ignored, ...material } = forged;
      forged.manifestSha256 = hashCanonicalJsonV1(material);
      expect(() => assertSealedHoldoutGeneralisationManifestV4R2({
        value: forged, baseManifest: base,
      })).toThrow('SEALED_GENERALISATION_V4R2_MANIFEST_DRIFT');
    }
  });
});

function buildBase() {
  return buildSealedHoldoutCohortManifestV2R(
    fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R),
  );
}
function fileSha(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
