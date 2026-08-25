import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  mediaProxyMasterTransitionSetV1,
  resolveActiveMediaR2StorageKeyV1,
  transitionMediaProxyMasterV1,
  type MediaProxyMasterTransitionAssetV1,
  type MediaProxyMasterTransitionPortsV1,
} from '@/lib/editron/services/media-proxy-master-transition-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 } from '@/lib/editron/services/media-source-version-v1';

const repoRoot = resolve(__dirname, '../..');
const now = new Date('2026-08-25T12:00:00.000Z');

describe('MediaProxyMasterTransitionV1', () => {
  it('selects the completed server-owned upload, clears active identity, and retains a valid proxy identity', async () => {
    const memory = inMemory();

    await expect(transitionMediaProxyMasterV1({ assetId: 'asset-a', userId: 'user-a' }, memory.ports))
      .resolves.toEqual({
        disposition: 'TRANSITIONED',
        qualification: 'DISPATCHED',
        proxySourceVersion: 'PRESERVED',
      });

    expect(memory.inspectMasterStorage).toHaveBeenCalledWith('master-r2-key');
    expect(memory.replace).toHaveBeenCalledWith(expect.objectContaining({
      expectedProxyR2Key: 'proxy-r2-key',
      next: expect.objectContaining({
        cachedUrl: 'https://cdn.test/asset/master-r2-key',
        originalR2Key: 'master-r2-key',
        sourceVersionV1: null,
        sourcePtsCadenceMapV1: null,
        sourcePtsCadenceMapStateSha256V1: null,
        proxySourceVersionV1: expect.objectContaining({
          sourceVersionSha256: memory.proxySourceVersion.sourceVersionSha256,
        }),
        proxyMasterRelationV1: null,
        sourceInvalidationPlanV1: null,
        sourceQualificationV1: expect.objectContaining({
          status: 'PENDING',
          locator: { provider: 'R2', objectKey: 'master-r2-key' },
        }),
      }),
    }));
    expect(memory.events).toEqual(['replace', 'dispatch']);
    expect(memory.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      assetId: 'asset-a',
      userId: 'user-a',
      sourceBindingSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
  });

  it('leaves the media record untouched for missing, foreign, or unavailable masters', async () => {
    const missing = inMemory({ upload: null });
    await expect(transitionMediaProxyMasterV1({ assetId: 'asset-a', userId: 'user-a' }, missing.ports))
      .resolves.toEqual({ disposition: 'SKIPPED', reason: 'COMPLETED_UPLOAD_NOT_FOUND' });
    expect(missing.replace).not.toHaveBeenCalled();

    const foreign = inMemory({ upload: { assetId: 'asset-a', userId: 'user-b', status: 'completed', r2Key: 'master-r2-key' } });
    await expect(transitionMediaProxyMasterV1({ assetId: 'asset-a', userId: 'user-a' }, foreign.ports))
      .resolves.toEqual({ disposition: 'SKIPPED', reason: 'COMPLETED_UPLOAD_MISMATCH' });
    expect(foreign.replace).not.toHaveBeenCalled();

    const unavailable = inMemory({
      storage: { disposition: 'UNVERIFIABLE', diagnostic: 'MEDIA_SOURCE_STORAGE_VERSION_UNAVAILABLE' },
    });
    await expect(transitionMediaProxyMasterV1({ assetId: 'asset-a', userId: 'user-a' }, unavailable.ports))
      .resolves.toEqual({ disposition: 'SKIPPED', reason: 'MASTER_STORAGE_UNVERIFIABLE' });
    expect(unavailable.replace).not.toHaveBeenCalled();
  });

  it('does not treat dispatch loss as a qualified source or reuse a malformed proxy identity', async () => {
    const memory = inMemory({
      asset: { ...proxyAsset(), sourceVersionV1: { forged: true } },
      dispatched: false,
    });

    await expect(transitionMediaProxyMasterV1({ assetId: 'asset-a', userId: 'user-a' }, memory.ports))
      .resolves.toEqual({
        disposition: 'TRANSITIONED',
        qualification: 'PENDING',
        proxySourceVersion: 'UNAVAILABLE',
      });
    expect(memory.replace).toHaveBeenCalledWith(expect.objectContaining({
      next: expect.objectContaining({
        sourceVersionV1: null,
        sourcePtsCadenceMapV1: null,
        sourcePtsCadenceMapStateSha256V1: null,
        proxySourceVersionV1: null,
        proxyMasterRelationV1: null,
        sourceInvalidationPlanV1: null,
      }),
    }));
  });

  it('uses the master only after a successful non-proxy promotion', () => {
    expect(resolveActiveMediaR2StorageKeyV1({
      r2Key: 'proxy-r2-key', originalR2Key: 'master-r2-key', isProxy: true,
    })).toBe('proxy-r2-key');
    expect(resolveActiveMediaR2StorageKeyV1({
      r2Key: 'proxy-r2-key', originalR2Key: 'master-r2-key', isProxy: false,
    })).toBe('master-r2-key');
    expect(resolveActiveMediaR2StorageKeyV1({ r2Key: 'legacy-r2-key' })).toBe('legacy-r2-key');
  });

  it('clears any proxy-bound cadence state in the production persistence payload', async () => {
    const memory = inMemory();
    await transitionMediaProxyMasterV1({ assetId: 'asset-a', userId: 'user-a' }, memory.ports);
    const next = memory.replace.mock.calls[0]?.[0]?.next;
    expect(next).toBeDefined();
    expect(mediaProxyMasterTransitionSetV1(next!)).toMatchObject({
      isProxy: false,
      sourceVersionV1: null,
      sourcePtsCadenceMapV1: null,
      sourcePtsCadenceMapStateSha256V1: null,
    });
  });

  it('keeps both interactive and cron callers on the shared server-owned transition', () => {
    const swapRoute = readFileSync(resolve(repoRoot, 'app/api/services/editron/media/upload/swap/route.ts'), 'utf8');
    const cleanupRoute = readFileSync(resolve(repoRoot, 'app/api/cron/cleanup-stale-uploads/route.ts'), 'utf8');

    expect(swapRoute).toContain('runMediaProxyMasterTransitionV1');
    expect(swapRoute).not.toContain('originalUrl');
    expect(swapRoute).not.toContain('originalR2Key } = body');
    expect(cleanupRoute).toContain('runMediaProxyMasterTransitionV1');
    expect(cleanupRoute).toContain('CRON_SECRET_NOT_CONFIGURED');
    expect(cleanupRoute).not.toContain('r2FileExists');
    expect(cleanupRoute).not.toContain("$set: {\n            cachedUrl");
  });
});

function inMemory(options: {
  asset?: MediaProxyMasterTransitionAssetV1;
  upload?: { assetId: string; userId: string; status: string; r2Key: string } | null;
  storage?: Awaited<ReturnType<MediaProxyMasterTransitionPortsV1['inspectMasterStorage']>>;
  dispatched?: boolean;
} = {}) {
  const proxySourceVersion = sourceVersion();
  const asset = options.asset ?? {
    ...proxyAsset(),
    sourceVersionV1: proxySourceVersion,
    sourcePtsCadenceMapV1: { stale: 'proxy-map' },
    sourcePtsCadenceMapStateSha256V1: 'b'.repeat(64),
  };
  const upload = options.upload === undefined
    ? { assetId: 'asset-a', userId: 'user-a', status: 'completed', r2Key: 'master-r2-key' }
    : options.upload;
  const storage = options.storage ?? {
    disposition: 'OBSERVED' as const,
    storageVersion: storageVersion('master-r2-key', 'master-etag'),
  };
  const events: string[] = [];
  const replace = vi.fn(async (_input: Parameters<MediaProxyMasterTransitionPortsV1['replace']>[0]) => {
    events.push('replace');
    return true;
  });
  const dispatch = vi.fn(async () => {
    events.push('dispatch');
    return { dispatched: options.dispatched ?? true };
  });
  const inspectMasterStorage = vi.fn(async () => storage);
  return {
    proxySourceVersion,
    events,
    replace,
    dispatch,
    inspectMasterStorage,
    ports: {
      loadAsset: vi.fn(async () => asset),
      loadCompletedMultipartUpload: vi.fn(async () => upload),
      inspectMasterStorage,
      replace,
      dispatch,
      getPublicReadUrl: (r2Key: string) => `https://cdn.test/asset/${r2Key}`,
      now: () => now,
    } satisfies MediaProxyMasterTransitionPortsV1,
  };
}

function proxyAsset(): MediaProxyMasterTransitionAssetV1 {
  return {
    assetId: 'asset-a',
    userId: 'user-a',
    type: 'video',
    source: 'user-upload',
    r2Key: 'proxy-r2-key',
    isProxy: true,
  };
}

function sourceVersion() {
  return createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-a' },
    assetId: 'asset-a',
    mediaKind: 'video',
    byteLength: 1_024,
    contentSha256: 'a'.repeat(64),
    storageVersion: storageVersion('proxy-r2-key', 'proxy-etag'),
  });
}

function storageVersion(objectKey: string, eTag: string) {
  return createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey },
    byteLength: 1_024,
    providerVersion: { kind: 'R2_ETAG', value: eTag },
  });
}
