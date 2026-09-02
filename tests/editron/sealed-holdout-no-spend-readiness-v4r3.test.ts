import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import {
  buildSealedHoldoutGeneralisationManifestV4R2,
  SEALED_HOLDOUT_GENERALISATION_PATH_V4R2,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-generalisation-cohort-v4r2';
import {
  buildSealedHoldoutGeneralisationManifestV4R3,
  type SealedHoldoutGeneralisationManifestV4R3,
  SEALED_HOLDOUT_GENERALISATION_PATH_V4R3,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-generalisation-cohort-v4r3';
import {
  assertCurrentSealedHoldoutNoSpendReadinessV4R3,
  issueSealedHoldoutNoSpendReadinessV4R3,
  SEALED_HOLDOUT_NO_SPEND_ROOTS_V4R3,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-no-spend-readiness-v4r3';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sealed holdout current-source no-spend readiness V4R3', () => {
  it('binds 12 sentinels and route health to the real strict Git closure', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('network forbidden')));
    vi.stubGlobal('fetch', fetchSpy);
    const input = fixture();
    const receipt = await issueSealedHoldoutNoSpendReadinessV4R3(input);
    expect(receipt).toMatchObject({
      lane: 'SEALED_HOLDOUT_GENERALISATION_V4R3',
      successorManifestSha256: input.manifest.manifestSha256,
      sentinelExecution: {
        sentinelCount: 12,
        assessment: 'PASS_ALL_V4R3_REQUIRED_SENTINELS_RECOMPUTED',
      },
      executableClosure: {
        mode: 'verification', contentSource: 'GIT_HEAD_BLOB',
        roots: [...SEALED_HOLDOUT_NO_SPEND_ROOTS_V4R3].sort(),
        sourceControl: { strict: true },
      },
      dispatchAuthorized: false, spendAuthorizedMicroUsd: 0,
      providerInferenceCalls: 0, networkCalls: 0,
      projectReads: 0, projectMutations: 0, mediaWrites: 0,
      secretsPersisted: false, stateEffects: [],
    });
    expect(receipt.executableClosure.files.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        'lib/editron/research/open-ended-planner/sealed-holdout-catalog-v4r3.ts',
        'lib/editron/research/open-ended-planner/sealed-holdout-route-health-v4r3.ts',
        'lib/editron/research/open-ended-planner/sealed-holdout-sentinel-runner-v4r3.ts',
      ]),
    );
    expect(await assertCurrentSealedHoldoutNoSpendReadinessV4R3({
      ...input, value: receipt,
    })).toEqual(receipt);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects V4R2 substitution and a self-rehashed alternate closure root', async () => {
    const input = fixture();
    await expect(issueSealedHoldoutNoSpendReadinessV4R3({
      ...input,
      manifest: input.predecessorManifest as unknown as
        SealedHoldoutGeneralisationManifestV4R3,
    })).rejects.toThrow('SEALED_GENERALISATION_V4R3_MANIFEST_DRIFT');

    const receipt = await issueSealedHoldoutNoSpendReadinessV4R3(input);
    const forged = structuredClone(receipt) as unknown as Record<string, unknown>;
    const closure = forged.executableClosure as Record<string, unknown>;
    (closure.roots as string[])[0] =
      'lib/editron/research/open-ended-planner/contracts-v1.ts';
    rehash(closure, 'closureSha256');
    rehash(forged, 'receiptSha256');
    await expect(assertCurrentSealedHoldoutNoSpendReadinessV4R3({
      ...input, value: forged,
    })).rejects.toThrow('NO_SPEND_LANE_INTEGRITY_V2_EXECUTABLE_CLOSURE_ROOT_SET_DRIFT');
  });
});

function fixture() {
  const baseManifest = buildSealedHoldoutCohortManifestV2R(
    fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R),
  );
  const predecessorManifest = buildSealedHoldoutGeneralisationManifestV4R2({
    contractSourceSha256: fileSha(SEALED_HOLDOUT_GENERALISATION_PATH_V4R2),
    baseManifest,
  });
  const manifest = buildSealedHoldoutGeneralisationManifestV4R3({
    contractSourceSha256: fileSha(SEALED_HOLDOUT_GENERALISATION_PATH_V4R3),
    baseManifest, predecessorManifest,
  });
  return { manifest, baseManifest, predecessorManifest };
}
function fileSha(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
function rehash(value: Record<string, unknown>, field: string): void {
  const material = { ...value };
  delete material[field];
  value[field] = hashEditronCanonicalJsonV1(material);
}
