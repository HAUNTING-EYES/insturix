import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { createMediaSourcePtsCadenceR2LifecycleManifestReaderV1 } from '@/lib/editron/services/media-source-pts-cadence-r2-lifecycle-manifest-reader-v1';

describe('media source PTS lifecycle manifest R2 reader V1', () => {
  it('reads exact private lifecycle-manifest bytes and nothing else', async () => {
    let bytes = new TextEncoder().encode('{"manifest":true}');
    const client = { send: vi.fn(async () => ({ Body: asyncBytes(bytes) })) };
    const reader = createMediaSourcePtsCadenceR2LifecycleManifestReaderV1({
      privateStorage: {
        bucketName: 'editron-private-evidence',
        browserRouteExposure: 'NO_BROWSER_ROUTE',
        storagePolicyVersion: 'private-r2-v1',
      },
      client,
    });
    const sidecar = manifestSidecar(bytes);
    await expect(reader.read(sidecar)).resolves.toEqual({
      canonicalJson: '{"manifest":true}',
      byteLength: bytes.byteLength,
      contentSha256: sidecar.contentSha256,
    });

    await expect(reader.read({
      ...sidecar,
      objectKey: sidecar.objectKey.replace('/manifests/', '/shards/'),
    })).rejects.toThrow('MEDIA_SOURCE_PTS_LIFECYCLE_R2_SIDECAR_INVALID');

    bytes = new TextEncoder().encode('{"manifest":false}');
    await expect(reader.read(sidecar))
      .rejects.toThrow('MEDIA_SOURCE_PTS_LIFECYCLE_R2_CONTENT_MISMATCH');
  });

  it('rejects a browser-facing bucket declaration before any read', () => {
    expect(() => createMediaSourcePtsCadenceR2LifecycleManifestReaderV1({
      privateStorage: {
        bucketName: 'editron-cdn',
        browserRouteExposure: 'NO_BROWSER_ROUTE',
        storagePolicyVersion: 'private-r2-v1',
      },
      client: { send: vi.fn() },
    })).toThrow('MEDIA_SOURCE_PTS_LIFECYCLE_R2_PRIVATE_STORAGE_INVALID');
  });
});

function manifestSidecar(bytes: Uint8Array) {
  return {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PTS_CADENCE_PRIVATE_SIDECAR_V1' as const,
    storage: 'R2_PRIVATE' as const,
    objectKey: `private/editron/media-source-pts-cadence/v1/${'a'.repeat(64)}/manifests/${'b'.repeat(64)}.json`,
    byteLength: bytes.byteLength,
    contentSha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function* asyncBytes(value: Uint8Array) {
  yield value;
}
