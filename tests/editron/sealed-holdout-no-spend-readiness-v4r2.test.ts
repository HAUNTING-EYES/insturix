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
  assertCurrentSealedHoldoutNoSpendReadinessV4R2,
  issueSealedHoldoutNoSpendReadinessV4R2,
  SEALED_HOLDOUT_NO_SPEND_ROOTS_V4R2,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-no-spend-readiness-v4r2';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sealed holdout current-source no-spend readiness V4R2', () => {
  it('recomputes eight sentinels and binds the real strict Git closure', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('network forbidden')));
    vi.stubGlobal('fetch', fetchSpy);
    const { baseManifest, manifest } = fixture();
    const receipt = await issueSealedHoldoutNoSpendReadinessV4R2({
      baseManifest, manifest,
    });

    expect(receipt).toMatchObject({
      lane: 'SEALED_HOLDOUT_GENERALISATION_V4R2',
      successorManifestSha256: manifest.manifestSha256,
      sentinelExecution: {
        sentinelCount: 8,
        assessment: 'PASS_ALL_REQUIRED_SENTINELS_RECOMPUTED',
      },
      executableClosure: {
        mode: 'verification',
        contentSource: 'GIT_HEAD_BLOB',
        roots: [...SEALED_HOLDOUT_NO_SPEND_ROOTS_V4R2].sort(),
        sourceControl: { strict: true },
      },
      dispatchAuthorized: false,
      spendAuthorizedMicroUsd: 0,
      providerInferenceCalls: 0,
      networkCalls: 0,
      projectReads: 0,
      projectMutations: 0,
      mediaWrites: 0,
      stateEffects: [],
      assessment: 'PASS_CURRENT_SOURCE_INTEGRITY_READY_FOR_ZERO_INFERENCE_RESCORE_ONLY',
    });
    expect(receipt.executableClosure.files.map(({ path }) => path)).toEqual(
      expect.arrayContaining([
        'lib/editron/research/open-ended-planner/sealed-holdout-catalog-v4r2.ts',
        'lib/editron/research/open-ended-planner/sealed-holdout-owner-session-v2r.ts',
        'lib/editron/research/open-ended-planner/sealed-holdout-sentinel-runner-v4r2.ts',
      ]),
    );
    expect(await assertCurrentSealedHoldoutNoSpendReadinessV4R2({
      value: receipt, baseManifest, manifest,
    })).toEqual(receipt);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a self-rehashed alternate closure root', async () => {
    const { baseManifest, manifest } = fixture();
    const receipt = await issueSealedHoldoutNoSpendReadinessV4R2({
      baseManifest, manifest,
    });
    const forged = structuredClone(receipt) as unknown as Record<string, unknown>;
    const closure = forged.executableClosure as Record<string, unknown>;
    (closure.roots as string[])[0] = 'lib/editron/research/open-ended-planner/contracts-v1.ts';
    rehash(closure, 'closureSha256');
    rehash(forged, 'receiptSha256');

    await expect(assertCurrentSealedHoldoutNoSpendReadinessV4R2({
      value: forged, baseManifest, manifest,
    })).rejects.toThrow('NO_SPEND_LANE_INTEGRITY_V2_EXECUTABLE_CLOSURE_ROOT_SET_DRIFT');
  });
});

function fixture() {
  const baseManifest = buildSealedHoldoutCohortManifestV2R(
    fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R),
  );
  const manifest = buildSealedHoldoutGeneralisationManifestV4R2({
    contractSourceSha256: fileSha(SEALED_HOLDOUT_GENERALISATION_PATH_V4R2),
    baseManifest,
  });
  return { baseManifest, manifest };
}
function fileSha(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
function rehash(value: Record<string, unknown>, field: string): void {
  const material = { ...value };
  delete material[field];
  value[field] = hashEditronCanonicalJsonV1(material);
}
