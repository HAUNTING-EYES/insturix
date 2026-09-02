import { describe, expect, it, vi } from 'vitest';

import {
  createMediaProxyMasterTranscodeCurrentAssetOwnerV2,
  type MediaProxyMasterTranscodeCurrentAssetStoreV2,
} from '@/lib/editron/services/media-proxy-master-transcode-current-asset-owner-v2';
import type { MediaProxyMasterCurrentTimeMapPortV1 }
  from '@/lib/editron/services/media-proxy-master-trusted-transcode-executor-v1';
import type { MediaSourcePtsCadenceMapAssetStateInputV3 }
  from '@/lib/editron/services/media-source-pts-cadence-map-asset-owner-v3';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';
import { buildMediaProxyMasterTranscodeV2Fixture }
  from './helpers/media-proxy-master-transcode-v2-fixture';

describe('MediaProxyMasterTranscodeCurrentAssetOwnerV2', () => {
  it('returns only the exact current source and V3 time map', async () => {
    const fixture = ownerFixture();

    await expect(fixture.owner.resolve({
      job: fixture.job,
      jobInput: fixture.jobInput,
    })).resolves.toBe(fixture.asset);
    expect(fixture.load).toHaveBeenCalledWith(
      fixture.jobInput.assetId,
      fixture.jobInput.userId,
    );
    expect(fixture.readTimeMap).toHaveBeenCalledWith(fixture.asset);
  });

  it('returns null for an absent current asset', async () => {
    const fixture = ownerFixture();
    fixture.load.mockResolvedValueOnce(null);

    await expect(fixture.owner.resolve({
      job: fixture.job,
      jobInput: fixture.jobInput,
    })).resolves.toBeNull();
    expect(fixture.readTimeMap).not.toHaveBeenCalled();
  });

  it('classifies a current-asset store outage as retryable', async () => {
    const fixture = ownerFixture();
    fixture.load.mockRejectedValueOnce(new Error('mongo unavailable'));

    await expect(fixture.owner.resolve({
      job: fixture.job,
      jobInput: fixture.jobInput,
    })).rejects.toMatchObject({
      code: 'CURRENT_ASSET_LOAD_FAILED',
      retryable: true,
    });
    expect(fixture.readTimeMap).not.toHaveBeenCalled();
  });

  it('permanently rejects source substitution and V3 map drift', async () => {
    const substituted = ownerFixture();
    substituted.load.mockResolvedValueOnce({
      ...substituted.asset,
      sourceVersionV1: createMediaSourceVersionV1({
        ...substituted.jobInput.command.masterSourceVersion,
        contentSha256: hash('substituted-master'),
      }),
    });
    await expect(substituted.owner.resolve({
      job: substituted.job,
      jobInput: substituted.jobInput,
    })).rejects.toMatchObject({
      code: 'CURRENT_ASSET_INVALID',
      retryable: false,
    });
    expect(substituted.readTimeMap).not.toHaveBeenCalled();

    const mapDrift = ownerFixture();
    mapDrift.readTimeMap.mockResolvedValueOnce({
      ...mapDrift.jobInput.command.masterTimeMap,
      totalFrameCount: '299',
    });
    await expect(mapDrift.owner.resolve({
      job: mapDrift.job,
      jobInput: mapDrift.jobInput,
    })).rejects.toMatchObject({
      code: 'CURRENT_ASSET_INVALID',
      retryable: false,
    });
  });

  it('rejects unclaimed, altered and mismatched-runtime jobs before storage',
    async () => {
      const fixture = ownerFixture();
      await expect(fixture.owner.resolve({
        job: { ...fixture.job, status: 'queued' },
        jobInput: fixture.jobInput,
      })).rejects.toMatchObject({ retryable: false });
      await expect(fixture.owner.resolve({
        job: fixture.job,
        jobInput: {
          ...fixture.jobInput,
          assetId: 'asset-substituted',
        },
      })).rejects.toMatchObject({ retryable: false });

      const wrongOwner = createMediaProxyMasterTranscodeCurrentAssetOwnerV2({
        runtimePolicyBindingSha256: hash('wrong-runtime'),
        assetStore: { load: fixture.load },
        currentTimeMapPort: { read: fixture.readTimeMap },
      });
      await expect(wrongOwner.resolve({
        job: fixture.job,
        jobInput: fixture.jobInput,
      })).rejects.toMatchObject({
        code: 'CURRENT_ASSET_INVALID',
        retryable: false,
      });
      expect(fixture.load).not.toHaveBeenCalled();
    });
});

function ownerFixture() {
  const fixture = buildMediaProxyMasterTranscodeV2Fixture();
  const jobInput = fixture.contract.payload;
  const asset = {
    assetId: jobInput.assetId,
    type: 'video',
    sourceVersionV1: jobInput.command.masterSourceVersion,
  } as MediaSourcePtsCadenceMapAssetStateInputV3;
  const loadAsset: MediaProxyMasterTranscodeCurrentAssetStoreV2['load'] =
    async () => asset;
  const readCurrentTimeMap: MediaProxyMasterCurrentTimeMapPortV1['read'] =
    async () => jobInput.command.masterTimeMap;
  const load = vi.fn(loadAsset);
  const readTimeMap = vi.fn(readCurrentTimeMap);
  const owner = createMediaProxyMasterTranscodeCurrentAssetOwnerV2({
    runtimePolicyBindingSha256: jobInput.runtimePolicy.bindingSha256,
    assetStore: { load },
    currentTimeMapPort: { read: readTimeMap },
  });
  return {
    asset,
    job: fixture.job,
    jobInput,
    load,
    owner,
    readTimeMap,
  };
}

function hash(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}
