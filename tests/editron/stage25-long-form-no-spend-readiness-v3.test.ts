import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  buildStage25LongFormProviderCohortManifestV3,
  STAGE25_LONG_FORM_PROVIDER_COHORT_PATH_V3,
} from '@/lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-cohort-v3';
import {
  assertCurrentStage25LongFormNoSpendReadinessV3,
  issueStage25LongFormNoSpendReadinessV3,
  STAGE25_LONG_FORM_NO_SPEND_ROOTS_V3,
} from '@/lib/editron/research/open-ended-planner/stage25-long-form-no-spend-readiness-v3';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Stage 2.5 long-form current-source no-spend readiness V3', () => {
  it('recomputes five sentinels and binds the real strict Git closure', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('network forbidden')));
    vi.stubGlobal('fetch', fetchSpy);
    const manifest = buildManifest();
    const receipt = await issueStage25LongFormNoSpendReadinessV3({ manifest });

    expect(receipt).toMatchObject({
      lane: 'STAGE25_LONG_FORM_PROVIDER_V3',
      successorManifestSha256: manifest.manifestSha256,
      sentinelExecution: {
        sentinelCount: 5,
        assessment: 'PASS_ALL_REQUIRED_LONG_FORM_SENTINELS_RECOMPUTED',
      },
      executableClosure: {
        mode: 'verification',
        contentSource: 'GIT_HEAD_BLOB',
        roots: [...STAGE25_LONG_FORM_NO_SPEND_ROOTS_V3].sort(),
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
        'lib/editron/research/open-ended-planner/stage25-long-form-plan-compiler-v2.ts',
        'lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-evaluator-v2.ts',
        'lib/editron/research/open-ended-planner/stage25-long-form-sentinel-runner-v3.ts',
      ]),
    );
    expect(await assertCurrentStage25LongFormNoSpendReadinessV3({
      value: receipt, manifest,
    })).toEqual(receipt);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects self-rehashed nonzero inference authority', async () => {
    const manifest = buildManifest();
    const receipt = await issueStage25LongFormNoSpendReadinessV3({ manifest });
    const forged = structuredClone(receipt) as unknown as Record<string, unknown>;
    forged.providerInferenceCalls = 1;
    rehash(forged, 'receiptSha256');

    await expect(assertCurrentStage25LongFormNoSpendReadinessV3({
      value: forged, manifest,
    })).rejects.toThrow('NO_SPEND_LANE_INTEGRITY_V2_RECEIPT_FORGED_OR_EXPECTATION_DRIFT');
  });
});

function buildManifest() {
  return buildStage25LongFormProviderCohortManifestV3({
    contractSourceSha256: createHash('sha256')
      .update(readFileSync(STAGE25_LONG_FORM_PROVIDER_COHORT_PATH_V3)).digest('hex'),
  });
}
function rehash(value: Record<string, unknown>, field: string): void {
  const material = { ...value };
  delete material[field];
  value[field] = hashEditronCanonicalJsonV1(material);
}
