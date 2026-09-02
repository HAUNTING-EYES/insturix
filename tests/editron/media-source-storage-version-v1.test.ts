import { describe, expect, it, vi } from 'vitest';

import {
  createMediaSourceStorageVersionV1,
  inspectMediaSourceStorageVersionV1,
  sameMediaSourceStorageVersionV1,
} from '@/lib/editron/services/media-source-storage-version-v1';

describe('MediaSourceStorageVersionV1', () => {
  it('creates a stable opaque version binding from one inspected R2 object', () => {
    const first = createMediaSourceStorageVersionV1({
      locator: { provider: 'R2', objectKey: 'asset-source-a' },
      byteLength: 2_048,
      providerVersion: { kind: 'R2_ETAG', value: 'opaque-r2-etag' },
    });
    const second = createMediaSourceStorageVersionV1({
      locator: { provider: 'R2', objectKey: 'asset-source-a' },
      byteLength: 2_048,
      providerVersion: { kind: 'R2_ETAG', value: 'opaque-r2-etag' },
    });

    expect(first.storageVersionSha256).toBe(second.storageVersionSha256);
    expect(sameMediaSourceStorageVersionV1(first, second)).toBe(true);
    expect(JSON.stringify(first)).not.toContain('https://');
  });

  it('treats a provider token or byte-length change as a different object version', () => {
    const baseline = createMediaSourceStorageVersionV1({
      locator: { provider: 'GCS', objectKey: 'editron/user/source-a.mov' },
      byteLength: 4_096,
      providerVersion: { kind: 'GCS_GENERATION', value: '1724678400000000' },
    });
    const replacement = createMediaSourceStorageVersionV1({
      locator: { provider: 'GCS', objectKey: 'editron/user/source-a.mov' },
      byteLength: 4_096,
      providerVersion: { kind: 'GCS_GENERATION', value: '1724678400000001' },
    });

    expect(sameMediaSourceStorageVersionV1(baseline, replacement)).toBe(false);
  });

  it('uses only the provider matching the persisted locator', async () => {
    const inspectR2 = vi.fn(async () => ({ byteLength: 512, eTag: 'r2-etag-a' }));
    const inspectGcs = vi.fn(async () => ({ byteLength: 999, generation: 'gcs-generation-a' }));

    const result = await inspectMediaSourceStorageVersionV1(
      { provider: 'R2', objectKey: 'source-a' },
      { inspectR2, inspectGcs },
    );

    expect(result).toEqual(expect.objectContaining({
      disposition: 'OBSERVED',
      storageVersion: expect.objectContaining({
        locator: { provider: 'R2', objectKey: 'source-a' },
        byteLength: 512,
        providerVersion: { kind: 'R2_ETAG', value: 'r2-etag-a' },
      }),
    }));
    expect(inspectR2).toHaveBeenCalledWith('source-a');
    expect(inspectGcs).not.toHaveBeenCalled();
  });

  it('never substitutes a missing or malformed provider observation', async () => {
    await expect(inspectMediaSourceStorageVersionV1(
      { provider: 'GCS', objectKey: 'source-a' },
      { inspectGcs: async () => null },
    )).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'MEDIA_SOURCE_STORAGE_VERSION_UNAVAILABLE',
    });

    await expect(inspectMediaSourceStorageVersionV1(
      { provider: 'R2', objectKey: 'source-a' },
      { inspectR2: async () => ({ byteLength: 512, eTag: '' }) },
    )).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'MEDIA_SOURCE_STORAGE_VERSION_INVALID',
    });
  });

  it('rejects a provider-version kind that does not belong to the storage provider', () => {
    expect(() => createMediaSourceStorageVersionV1({
      locator: { provider: 'R2', objectKey: 'source-a' },
      byteLength: 512,
      providerVersion: { kind: 'GCS_GENERATION', value: '1724678400000000' },
    })).toThrow('MEDIA_SOURCE_STORAGE_PROVIDER_VERSION_KIND_INVALID');
  });
});
