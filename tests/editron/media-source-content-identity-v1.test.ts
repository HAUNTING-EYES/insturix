import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  issueMediaSourceContentIdentityV1,
  issueStoredMediaSourceContentIdentityV1,
  type MediaSourceContentIdentityPortsV1,
} from '@/lib/editron/services/media-source-content-identity-v1';
import { createMediaSourceStorageVersionV1 } from '@/lib/editron/services/media-source-storage-version-v1';

describe('MediaSourceContentIdentityV1', () => {
  it('issues a full-byte source version only after an unchanged storage observation', async () => {
    const bytes = Buffer.from('complete immutable bytes');
    const expected = storageVersion(bytes.byteLength, 'etag-a');

    const result = await issueMediaSourceContentIdentityV1(input(expected), ports(bytes, observed(expected)));

    expect(result).toEqual({
      disposition: 'ISSUED',
      sourceVersion: expect.objectContaining({
        assetId: 'asset-a',
        byteLength: bytes.byteLength,
        contentSha256: sha(bytes),
        storageVersion: expected,
      }),
    });
  });

  it('never issues from a partial stream, a changed object, or an unavailable after-observation', async () => {
    const bytes = Buffer.from('complete immutable bytes');
    const expected = storageVersion(bytes.byteLength, 'etag-a');

    await expect(issueMediaSourceContentIdentityV1(input(expected), ports(bytes.subarray(0, -1), observed(expected))))
      .resolves.toEqual({ disposition: 'UNVERIFIABLE', diagnostic: 'MEDIA_SOURCE_BYTE_LENGTH_MISMATCH' });
    await expect(issueMediaSourceContentIdentityV1(input(expected), ports(bytes, observed(storageVersion(bytes.byteLength, 'etag-b')))))
      .resolves.toEqual({ disposition: 'UNVERIFIABLE', diagnostic: 'MEDIA_SOURCE_STORAGE_VERSION_CHANGED' });
    await expect(issueMediaSourceContentIdentityV1(input(expected), ports(bytes, { disposition: 'UNVERIFIABLE', diagnostic: 'MEDIA_SOURCE_STORAGE_VERSION_UNAVAILABLE' })))
      .resolves.toEqual({ disposition: 'UNVERIFIABLE', diagnostic: 'MEDIA_SOURCE_STORAGE_VERSION_UNAVAILABLE' });
  });

  it('fails closed on a bad stream or storage read failure', async () => {
    const bytes = Buffer.from('complete immutable bytes');
    const expected = storageVersion(bytes.byteLength, 'etag-a');

    await expect(issueMediaSourceContentIdentityV1(input(expected), {
      openExactByteStream: async function* () {
        yield 'not-a-byte-chunk' as unknown as Uint8Array;
      },
      inspectStorageVersionAfterRead: async () => ({ disposition: 'OBSERVED', storageVersion: expected }),
    })).resolves.toEqual({ disposition: 'UNVERIFIABLE', diagnostic: 'MEDIA_SOURCE_BYTE_STREAM_INVALID' });
    await expect(issueMediaSourceContentIdentityV1(input(expected), {
      openExactByteStream: async function* () {
        throw new Error('storage read failed');
      },
      inspectStorageVersionAfterRead: async () => {
        throw new Error('not reached');
      },
    })).resolves.toEqual({ disposition: 'UNVERIFIABLE', diagnostic: 'MEDIA_SOURCE_READ_FAILED' });
  });

  it('never opens bytes when the immediately preceding storage observation is unavailable', async () => {
    let opened = false;

    await expect(issueStoredMediaSourceContentIdentityV1({
      owner: { kind: 'USER', userId: 'user-a' },
      assetId: 'asset-a',
      mediaKind: 'video',
    }, {
      inspectStorageVersionBeforeRead: async () => ({
        disposition: 'UNVERIFIABLE',
        diagnostic: 'MEDIA_SOURCE_STORAGE_VERSION_UNAVAILABLE',
      }),
      openExactByteStream: async function* () {
        opened = true;
        yield Buffer.from('must not be read');
      },
      inspectStorageVersionAfterRead: async () => observed(storageVersion(1, 'unused')),
    })).resolves.toEqual({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'MEDIA_SOURCE_STORAGE_VERSION_UNAVAILABLE',
    });
    expect(opened).toBe(false);
  });
});

function input(expectedStorageVersion: ReturnType<typeof storageVersion>) {
  return {
    owner: { kind: 'USER' as const, userId: 'user-a' },
    assetId: 'asset-a',
    mediaKind: 'video' as const,
    expectedStorageVersion,
  };
}

function ports(
  bytes: Uint8Array,
  after: Awaited<ReturnType<MediaSourceContentIdentityPortsV1['inspectStorageVersionAfterRead']>>,
): MediaSourceContentIdentityPortsV1 {
  return {
    openExactByteStream: async function* () {
      yield bytes.subarray(0, 5);
      yield bytes.subarray(5);
    },
    inspectStorageVersionAfterRead: async () => after,
  };
}

function storageVersion(byteLength: number, eTag: string) {
  return createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'asset-a' },
    byteLength,
    providerVersion: { kind: 'R2_ETAG', value: eTag },
  });
}

function observed(version: ReturnType<typeof storageVersion>) {
  return { disposition: 'OBSERVED' as const, storageVersion: version };
}

function sha(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
