import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

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
import {
  assertSealedHoldoutGeneralisationManifestV4R3,
  buildSealedHoldoutGeneralisationManifestV4R3,
  SEALED_HOLDOUT_GENERALISATION_PATH_V4R3,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-generalisation-cohort-v4r3';

describe('sealed holdout V4R3 successor generalisation cohort', () => {
  it('binds the repaired V4R3 catalog while preserving immutable V4R2 provenance', () => {
    const { base, predecessor, manifest } = fixture();
    expect(manifest).toMatchObject({
      version: 'EDITRON_OE_SEALED_HOLDOUT_GENERALISATION_COHORT_V4R3_1',
      authority: 'RESEARCH_ONLY_NO_PROVIDER_DISPATCH_NO_PROJECT_AUTHORITY',
      operatorCatalogIdentity: {
        version: 'EDITRON_OE_SEALED_HOLDOUT_OPERATOR_CATALOG_V4R3_1',
      },
      predecessorManifestBinding: {
        manifestSha256: predecessor.manifestSha256,
        role: 'IMMUTABLE_V4R2_PREDECESSOR_NOT_DISPATCH_AUTHORITY',
      },
      executionPolicy: {
        dispatchAuthorized: false,
        v4r3OwnerEvidencePolicyRequired: true,
        v4r2ManifestAcceptedForV4R3Dispatch: false,
      },
      stateEffects: [],
    });
    expect(manifest.pilotRows).toHaveLength(3);
    expect(manifest.scoredRows).toHaveLength(45);
    expect(assertSealedHoldoutGeneralisationManifestV4R3({
      value: manifest, baseManifest: base, predecessorManifest: predecessor,
    })).toEqual(manifest);
  });

  it('rejects predecessor substitution, a forged catalog, and self-rehashed dispatch authority', () => {
    const { base, predecessor, manifest } = fixture();
    expect(() => assertSealedHoldoutGeneralisationManifestV4R3({
      value: predecessor, baseManifest: base, predecessorManifest: predecessor,
    })).toThrow('SEALED_GENERALISATION_V4R3_MANIFEST_DRIFT');

    for (const mutate of [
      (value: Record<string, unknown>) => {
        ((value.operatorCatalogIdentity as Record<string, unknown>).version) = 'FORGED';
      },
      (value: Record<string, unknown>) => {
        ((value.executionPolicy as Record<string, unknown>).dispatchAuthorized) = true;
      },
    ]) {
      const forged = structuredClone(manifest) as unknown as Record<string, unknown>;
      mutate(forged);
      const { manifestSha256: _ignored, ...material } = forged;
      forged.manifestSha256 = hashCanonicalJsonV1(material);
      expect(() => assertSealedHoldoutGeneralisationManifestV4R3({
        value: forged, baseManifest: base, predecessorManifest: predecessor,
      })).toThrow('SEALED_GENERALISATION_V4R3_MANIFEST_DRIFT');
    }

    expect(() => assertSealedHoldoutGeneralisationManifestV4R2({
      value: manifest, baseManifest: base,
    })).toThrow('SEALED_GENERALISATION_V4R2_MANIFEST_DRIFT');
  });
});

function fixture() {
  const base = buildSealedHoldoutCohortManifestV2R(
    fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R),
  );
  const predecessor = buildSealedHoldoutGeneralisationManifestV4R2({
    contractSourceSha256: fileSha(SEALED_HOLDOUT_GENERALISATION_PATH_V4R2),
    baseManifest: base,
  });
  const manifest = buildSealedHoldoutGeneralisationManifestV4R3({
    contractSourceSha256: fileSha(SEALED_HOLDOUT_GENERALISATION_PATH_V4R3),
    baseManifest: base,
    predecessorManifest: predecessor,
  });
  return { base, predecessor, manifest };
}
function fileSha(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
