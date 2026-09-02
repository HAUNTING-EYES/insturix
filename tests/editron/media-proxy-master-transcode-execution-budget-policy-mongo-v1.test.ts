import { describe, expect, it, vi } from 'vitest';

import {
  createMediaProxyMasterTranscodeExecutionBudgetPolicyMongoLocatorV1,
  MediaProxyMasterTranscodeExecutionBudgetPolicyMongoErrorV1,
} from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-policy-mongo-v1';
import {
  createMediaProxyMasterTranscodeExecutionBudgetPolicyV1,
  MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_OWNER_ID_V1,
} from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-policy-v1';

describe('proxy transcode execution-budget Finance policy Mongo locator v1', () => {
  it('resolves only the exact immutable identity and creates its index once', async () => {
    const policy = fixturePolicy();
    const createIndex = vi.fn(async () => 'policy-index');
    const findOne = vi.fn(async () => ({ _id: 'policy-row', ...policy }));
    const loadCollection = vi.fn(async () => ({ createIndex, findOne }));
    const locator =
      createMediaProxyMasterTranscodeExecutionBudgetPolicyMongoLocatorV1({
        loadCollection,
      });
    const request = {
      ownerId: MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_OWNER_ID_V1,
      ownerVersion: policy.ownerVersion,
      policySha256: policy.policySha256,
    };

    await expect(locator.resolve(request)).resolves.toEqual(policy);
    await expect(locator.resolve(request)).resolves.toEqual(policy);
    expect(findOne).toHaveBeenCalledWith(request);
    expect(createIndex).toHaveBeenCalledTimes(1);
    expect(createIndex).toHaveBeenCalledWith(
      { ownerId: 1, ownerVersion: 1, policySha256: 1 },
      {
        name: 'uniq_proxy_transcode_execution_budget_policy_v1',
        unique: true,
      },
    );
    expect(loadCollection).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the exact policy is absent or owner is invalid', async () => {
    const createIndex = vi.fn(async () => 'policy-index');
    const findOne = vi.fn(async () => null);
    const locator =
      createMediaProxyMasterTranscodeExecutionBudgetPolicyMongoLocatorV1({
        loadCollection: async () => ({ createIndex, findOne }),
      });
    const policy = fixturePolicy();

    await expect(locator.resolve({
      ownerId: MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_OWNER_ID_V1,
      ownerVersion: policy.ownerVersion,
      policySha256: policy.policySha256,
    })).rejects.toThrow('POLICY_MONGO_NOT_FOUND');
    await expect(locator.resolve({
      ownerId: 'FOREIGN_OWNER' as never,
      ownerVersion: policy.ownerVersion,
      policySha256: policy.policySha256,
    })).rejects.toBeInstanceOf(
      MediaProxyMasterTranscodeExecutionBudgetPolicyMongoErrorV1,
    );
    expect(findOne).toHaveBeenCalledTimes(1);
  });

  it('rejects a valid foreign policy returned for the exact filter', async () => {
    const policy = fixturePolicy();
    const foreign = fixturePolicy('finance-proxy-v2');
    const locator =
      createMediaProxyMasterTranscodeExecutionBudgetPolicyMongoLocatorV1({
        loadCollection: async () => ({
          createIndex: async () => 'policy-index',
          findOne: async () => ({ _id: 'foreign-row', ...foreign }),
        }),
      });

    await expect(locator.resolve({
      ownerId: MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_OWNER_ID_V1,
      ownerVersion: policy.ownerVersion,
      policySha256: policy.policySha256,
    })).rejects.toThrow('POLICY_MONGO_LOOKUP_MISMATCH');
  });

  it('retries index creation after failed initialization', async () => {
    const policy = fixturePolicy();
    const createIndex = vi.fn()
      .mockRejectedValueOnce(new Error('ATLAS_INDEX_UNAVAILABLE'))
      .mockResolvedValue('policy-index');
    const locator =
      createMediaProxyMasterTranscodeExecutionBudgetPolicyMongoLocatorV1({
        loadCollection: async () => ({
          createIndex,
          findOne: async () => ({ _id: 'policy-row', ...policy }),
        }),
      });
    const request = {
      ownerId: MEDIA_PROXY_MASTER_TRANSCODE_EXECUTION_BUDGET_OWNER_ID_V1,
      ownerVersion: policy.ownerVersion,
      policySha256: policy.policySha256,
    };

    await expect(locator.resolve(request)).rejects.toThrow(
      'ATLAS_INDEX_UNAVAILABLE',
    );
    await expect(locator.resolve(request)).resolves.toEqual(policy);
    expect(createIndex).toHaveBeenCalledTimes(2);
  });
});

function fixturePolicy(ownerVersion = 'finance-proxy-v1') {
  return createMediaProxyMasterTranscodeExecutionBudgetPolicyV1({
    ownerVersion,
    effectiveAt: '2026-08-30T00:00:00.000Z',
    expiresAt: '2026-09-01T00:00:00.000Z',
    sourceByteRead: { nanoUsdNumerator: '1', unitsDenominator: '100' },
    encodedFrameAttempt: { nanoUsdNumerator: '1', unitsDenominator: '1' },
    processMillisecond: { nanoUsdNumerator: '1', unitsDenominator: '1000' },
    artifactByteWritten: { nanoUsdNumerator: '2', unitsDenominator: '100' },
    artifactByteVerified: { nanoUsdNumerator: '3', unitsDenominator: '100' },
  });
}
