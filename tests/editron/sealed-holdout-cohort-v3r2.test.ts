import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import {
  buildSealedHoldoutCohortManifestV3R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v3r';
import {
  assertSealedHoldoutCohortManifestV3R2,
  buildSealedHoldoutCohortManifestV3R2,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R2,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v3r2';
import { SEALED_H03_PUBLIC_TARGET_CONTRACT_V3R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-target-contract-v3r';
import identity
  from '@/tests/fixtures/editron/open-ended-planner-v3/sealed-holdout-cohort-identity-v3r2.json';

type JsonRecord = Record<string, unknown>;

describe('sealed holdout cohort V3R2 H03 public target identity', () => {
  it('derives a new immutable identity and leaves V3R1 unchanged', async () => {
    const base = await v3Manifest();
    const before = hashCanonicalJsonV1(base);
    const manifest = await v3r2Manifest(base);
    expect(hashCanonicalJsonV1(base)).toBe(before);
    expect(manifest.contractSource.sha256).toBe(identity.contractSourceSha256);
    expect(manifest.manifestSha256).toBe(identity.manifestSha256);
    expect(manifest.sharedModelContextSha256).toBe(identity.sharedModelContextSha256);
    expect(manifest.operatorCatalogIdentity.catalogSha256).toBe(identity.operatorCatalogSha256);
    expect(manifest.baseCohortIdentity.manifestSha256).toBe(identity.baseManifestSha256);
    expect(manifest.mediaIdentity.manifestSha256).toBe(identity.mediaManifestSha256);
    expect(SEALED_H03_PUBLIC_TARGET_CONTRACT_V3R.contractSha256)
      .toBe(identity.targetContractSha256);
    expect(manifest.executionPolicy.dispatchAuthorized).toBe(false);
    expect(assertSealedHoldoutCohortManifestV3R2(manifest)).toBe(manifest);
  });

  it('makes required H03 literals and measured target facts visible in both arms', async () => {
    const manifest = await v3r2Manifest(await v3Manifest());
    const cases = manifest.cases.filter(({ caseId }) => caseId.startsWith('HOLD-03:'));
    expect(cases).toHaveLength(2);
    for (const entry of cases) {
      expect(record(entry.publicCase).referenceTargetContract).toMatchObject({
        authority: 'HASH_BOUND_REFERENCE_ANALYSIS_INPUT_NOT_EVALUATOR',
        protectedLiteralMaterial: { titleText: 'EVENT\nMOMENT' },
        layoutObservation: {
          panelCount: 6,
          panelBounds: expect.arrayContaining([
            { left: 0.33, top: 0.60, width: 0.34, height: 0.37 },
          ]),
        },
        motionObservation: {
          relationship: 'OPPOSED_HORIZONTAL_SIDES_AND_VERTICAL_CENTRE',
        },
        continuityObservation: {
          returnBinding: { overlayId: 'ov-full', assetId: 'h03-a', sourceFrame: 270 },
        },
      });
    }
  });

  it('rejects rehashed literal, target and base-lineage forgery', async () => {
    const manifest = await v3r2Manifest(await v3Manifest());
    const forgedTitle = structuredClone(manifest) as any;
    const h03 = forgedTitle.cases.find((entry: any) => entry.caseId === 'HOLD-03:C1');
    h03.publicCase.referenceTargetContract = structuredClone(
      h03.publicCase.referenceTargetContract,
    );
    h03.publicCase.referenceTargetContract.protectedLiteralMaterial.titleText = 'WRONG';
    h03.publicCaseSha256 = hashCanonicalJsonV1(h03.publicCase);
    refreshManifestHash(forgedTitle);
    expect(() => assertSealedHoldoutCohortManifestV3R2(forgedTitle))
      .toThrow('HOLDOUT_V3R2_H03_TARGET_DRIFT:HOLD-03:C1');

    const forgedBase = structuredClone(manifest) as any;
    forgedBase.baseCohortIdentity.manifestSha256 = 'f'.repeat(64);
    refreshManifestHash(forgedBase);
    expect(() => assertSealedHoldoutCohortManifestV3R2(forgedBase))
      .toThrow('HOLDOUT_V3R2_MANIFEST_DRIFT');
  });
});

async function v3Manifest() {
  const v2 = buildSealedHoldoutCohortManifestV2R(
    await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R),
  );
  return buildSealedHoldoutCohortManifestV3R({
    contractSourceSha256: await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R),
    baseManifest: v2,
  });
}

async function v3r2Manifest(baseManifest: Awaited<ReturnType<typeof v3Manifest>>) {
  return buildSealedHoldoutCohortManifestV3R2({
    contractSourceSha256: await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R2),
    baseManifest,
  });
}

async function fileSha(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(path.resolve(filePath))).digest('hex');
}

function refreshManifestHash(manifest: any): void {
  const { manifestSha256: _oldHash, ...material } = manifest;
  manifest.manifestSha256 = hashCanonicalJsonV1(material);
}
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord : {};
}
