import { describe, expect, it, vi } from 'vitest';

import {
  createNativeMediaFinalRenderExecutionBudgetPolicyMongoLocatorV1,
  NativeMediaFinalRenderExecutionBudgetPolicyMongoErrorV1,
} from '@/lib/editron/services/native-media-final-render-execution-budget-policy-mongo-v1';
import {
  createNativeMediaFinalRenderExecutionBudgetPolicyV1,
  NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_OWNER_ID_V1,
} from '@/lib/editron/services/native-media-final-render-execution-budget-policy-v1';

describe('native final-render execution-budget Finance policy Mongo locator v1', () => {
  it('resolves only the exact immutable identity and creates its index once', async () => {
    const policy = fixturePolicy();
    const createIndex = vi.fn(async () => 'policy-index');
    const findOne = vi.fn(async () => ({ _id: 'policy-row', ...policy }));
    const loadCollection = vi.fn(async () => ({ createIndex, findOne }));
    const locator = createNativeMediaFinalRenderExecutionBudgetPolicyMongoLocatorV1({
      loadCollection,
    });
    const request = {
      ownerId: NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_OWNER_ID_V1,
      ownerVersion: policy.ownerVersion,
      policySha256: policy.policySha256,
    };

    await expect(locator.resolve(request)).resolves.toEqual(policy);
    await expect(locator.resolve(request)).resolves.toEqual(policy);
    expect(findOne).toHaveBeenCalledWith(request);
    expect(createIndex).toHaveBeenCalledTimes(1);
    expect(createIndex).toHaveBeenCalledWith(
      { ownerId: 1, ownerVersion: 1, policySha256: 1 },
      { name: 'uniq_exact_render_execution_budget_policy_v1', unique: true },
    );
    expect(loadCollection).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the exact policy is absent or the owner is invalid', async () => {
    const createIndex = vi.fn(async () => 'policy-index');
    const findOne = vi.fn(async () => null);
    const locator = createNativeMediaFinalRenderExecutionBudgetPolicyMongoLocatorV1({
      loadCollection: async () => ({ createIndex, findOne }),
    });
    const policy = fixturePolicy();

    await expect(locator.resolve({
      ownerId: NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_OWNER_ID_V1,
      ownerVersion: policy.ownerVersion,
      policySha256: policy.policySha256,
    })).rejects.toThrow('POLICY_MONGO_NOT_FOUND');
    await expect(locator.resolve({
      ownerId: 'FOREIGN_OWNER' as never,
      ownerVersion: policy.ownerVersion,
      policySha256: policy.policySha256,
    })).rejects.toBeInstanceOf(
      NativeMediaFinalRenderExecutionBudgetPolicyMongoErrorV1,
    );
    expect(findOne).toHaveBeenCalledTimes(1);
  });

  it('rejects a valid but foreign policy returned for the exact filter', async () => {
    const policy = fixturePolicy();
    const foreign = fixturePolicy('finance-render-v2');
    const locator = createNativeMediaFinalRenderExecutionBudgetPolicyMongoLocatorV1({
      loadCollection: async () => ({
        createIndex: async () => 'policy-index',
        findOne: async () => ({ _id: 'foreign-row', ...foreign }),
      }),
    });

    await expect(locator.resolve({
      ownerId: NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_OWNER_ID_V1,
      ownerVersion: policy.ownerVersion,
      policySha256: policy.policySha256,
    })).rejects.toThrow('POLICY_MONGO_LOOKUP_MISMATCH');
  });

  it('retries index creation after a failed initialization', async () => {
    const policy = fixturePolicy();
    const createIndex = vi.fn()
      .mockRejectedValueOnce(new Error('ATLAS_INDEX_UNAVAILABLE'))
      .mockResolvedValue('policy-index');
    const locator = createNativeMediaFinalRenderExecutionBudgetPolicyMongoLocatorV1({
      loadCollection: async () => ({
        createIndex,
        findOne: async () => ({ _id: 'policy-row', ...policy }),
      }),
    });
    const request = {
      ownerId: NATIVE_MEDIA_FINAL_RENDER_EXECUTION_BUDGET_OWNER_ID_V1,
      ownerVersion: policy.ownerVersion,
      policySha256: policy.policySha256,
    };

    await expect(locator.resolve(request)).rejects.toThrow('ATLAS_INDEX_UNAVAILABLE');
    await expect(locator.resolve(request)).resolves.toEqual(policy);
    expect(createIndex).toHaveBeenCalledTimes(2);
  });
});

function fixturePolicy(ownerVersion = 'finance-render-v1') {
  return createNativeMediaFinalRenderExecutionBudgetPolicyV1({
    ownerVersion,
    effectiveAt: '2026-08-30T00:00:00.000Z',
    expiresAt: '2026-09-01T00:00:00.000Z',
    encodedFrameAttempt: { nanoUsdNumerator: '3', unitsDenominator: '2' },
    artifactByteWritten: { nanoUsdNumerator: '1', unitsDenominator: '10' },
    artifactByteVerified: { nanoUsdNumerator: '2', unitsDenominator: '10' },
  });
}
