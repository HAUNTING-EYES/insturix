import { describe, expect, it } from 'vitest';

import {
  assertMediaProxyMasterRelationV1,
  assertMediaSourceVersionV1,
  createMediaProxyMasterRelationV1,
  createMediaSourceInvalidationPlanV1,
  createMediaSourceVersionV1,
} from '@/lib/editron/services/media-source-version-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';

describe('MediaSourceVersionV1', () => {
  it('creates a deterministic immutable byte identity from server-measured fields', () => {
    const first = sourceVersion();
    const second = sourceVersion();

    expect(first.sourceVersionSha256).toBe(second.sourceVersionSha256);
    expect(assertMediaSourceVersionV1(first)).toEqual(first);
    expect(JSON.stringify(first)).not.toContain('https://');
  });

  it('rejects a byte/storage mismatch and forged source or storage hashes', () => {
    const source = sourceVersion();
    expect(() => createMediaSourceVersionV1({
      owner: { kind: 'USER', userId: 'user-a' },
      assetId: 'asset-a',
      mediaKind: 'video',
      byteLength: 2_049,
      contentSha256: 'a'.repeat(64),
      storageVersion: source.storageVersion,
    })).toThrow('MEDIA_SOURCE_STORAGE_BYTE_LENGTH_MISMATCH');

    expect(() => assertMediaSourceVersionV1({
      ...source,
      sourceVersionSha256: 'f'.repeat(64),
    })).toThrow('MEDIA_SOURCE_VERSION_HASH_MISMATCH');
    expect(() => assertMediaSourceVersionV1({
      ...source,
      storageVersion: {
        ...source.storageVersion,
        storageVersionSha256: 'f'.repeat(64),
      },
    })).toThrow('MEDIA_SOURCE_STORAGE_VERSION_HASH_MISMATCH');
  });

  it('models proxy and master as separate immutable versions with no implied time mapping', () => {
    const proxy = sourceVersion({
      contentSha256: 'b'.repeat(64),
      storageVersion: storageVersion({ objectKey: 'asset-a-proxy', eTag: 'proxy-etag' }),
    });
    const master = sourceVersion({
      contentSha256: 'c'.repeat(64),
      storageVersion: storageVersion({ objectKey: 'asset-a-master', eTag: 'master-etag' }),
    });

    const relation = createMediaProxyMasterRelationV1({ proxy, master });

    expect(relation.proxy.sourceVersionSha256).toBe(proxy.sourceVersionSha256);
    expect(relation.master.sourceVersionSha256).toBe(master.sourceVersionSha256);
    expect(relation.mapping).toEqual({
      disposition: 'UNQUALIFIED',
      diagnostic: 'SOURCE_PTS_MAPPING_REQUIRED',
    });
    expect(assertMediaProxyMasterRelationV1(relation)).toEqual(relation);
  });

  it('rejects unsafe proxy/master relations across assets, owners, media kinds, or the same source', () => {
    const proxy = sourceVersion();
    expect(() => createMediaProxyMasterRelationV1({ proxy, master: proxy })).toThrow(
      'MEDIA_PROXY_MASTER_SAME_SOURCE_VERSION',
    );
    expect(() => createMediaProxyMasterRelationV1({
      proxy,
      master: sourceVersion({ assetId: 'asset-b', contentSha256: 'b'.repeat(64) }),
    })).toThrow('MEDIA_PROXY_MASTER_SCOPE_MISMATCH');
    expect(() => createMediaProxyMasterRelationV1({
      proxy,
      master: sourceVersion({
        owner: { kind: 'ORG', orgId: 'org-a' },
        contentSha256: 'b'.repeat(64),
      }),
    })).toThrow('MEDIA_PROXY_MASTER_SCOPE_MISMATCH');
  });

  it('derives invalidation intent without clearing evidence or mutating a project', () => {
    const proxy = sourceVersion({
      contentSha256: 'b'.repeat(64),
      storageVersion: storageVersion({ objectKey: 'asset-a-proxy', eTag: 'proxy-etag' }),
    });
    const master = sourceVersion({
      contentSha256: 'c'.repeat(64),
      storageVersion: storageVersion({ objectKey: 'asset-a-master', eTag: 'master-etag' }),
    });
    const relation = createMediaProxyMasterRelationV1({ proxy, master });

    const plan = createMediaSourceInvalidationPlanV1({
      previous: proxy,
      next: master,
      proxyMasterRelation: relation,
    });

    expect(plan).toMatchObject({
      disposition: 'INVALIDATE_DERIVATIVES',
      reason: 'PROXY_MASTER_PROMOTED',
      projectServiceReviewRequired: true,
      previousSourceVersionSha256: proxy.sourceVersionSha256,
      nextSourceVersionSha256: master.sourceVersionSha256,
    });
    if (plan.disposition !== 'INVALIDATE_DERIVATIVES') throw new Error('expected invalidation');
    expect(plan.invalidates).toContain('PROJECT_SOURCE_BINDING_REVALIDATION');
    expect(plan.invalidates).toContain('TRANSCRIPTION');
    expect(plan.invalidates).toContain('RENDERED_PREVIEW');
  });

  it('returns a deterministic no-change plan for the same immutable source version', () => {
    const source = sourceVersion();
    const plan = createMediaSourceInvalidationPlanV1({ previous: source, next: source });

    expect(plan).toMatchObject({
      disposition: 'NO_CHANGE',
      sourceVersionSha256: source.sourceVersionSha256,
    });
  });

  it('rejects a proxy/master relation that does not match the requested promotion', () => {
    const proxy = sourceVersion({ contentSha256: 'b'.repeat(64) });
    const master = sourceVersion({
      contentSha256: 'c'.repeat(64),
      storageVersion: storageVersion({ objectKey: 'asset-a-master', eTag: 'master-etag' }),
    });
    const unrelated = sourceVersion({
      contentSha256: 'd'.repeat(64),
      storageVersion: storageVersion({ objectKey: 'asset-a-other', eTag: 'other-etag' }),
    });
    const relation = createMediaProxyMasterRelationV1({ proxy, master });

    expect(() => createMediaSourceInvalidationPlanV1({
      previous: proxy,
      next: unrelated,
      proxyMasterRelation: relation,
    })).toThrow('MEDIA_SOURCE_REPLACEMENT_RELATION_MISMATCH');
  });
});

function sourceVersion(overrides: Partial<Parameters<typeof createMediaSourceVersionV1>[0]> = {}) {
  return createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-a' },
    assetId: 'asset-a',
    mediaKind: 'video',
    byteLength: 2_048,
    contentSha256: 'a'.repeat(64),
    storageVersion: storageVersion(),
    ...overrides,
  });
}

function storageVersion(overrides: { objectKey?: string; eTag?: string } = {}) {
  return createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: overrides.objectKey ?? 'asset-a' },
    byteLength: 2_048,
    providerVersion: { kind: 'R2_ETAG', value: overrides.eTag ?? 'etag-a' },
  });
}
