import { createHash } from 'node:crypto';

import {
  createMediaSourceVersionV1,
  type MediaSourceOwnerV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';
import {
  sameMediaSourceStorageVersionV1,
  type MediaSourceStorageVersionInspectionV1,
  type MediaSourceStorageVersionV1,
} from './media-source-storage-version-v1';

/**
 * Issues an immutable source version only from a complete server-read byte
 * stream whose provider object was unchanged before and after the read.
 *
 * Persistence deliberately belongs to the existing MEDIA_ASSETS owner. This
 * helper has no storage, project, queue, or renderer authority of its own.
 */
export type MediaSourceContentIdentityResultV1 =
  | {
      disposition: 'ISSUED';
      sourceVersion: Readonly<MediaSourceVersionV1>;
    }
  | {
      disposition: 'UNVERIFIABLE';
      diagnostic:
        | 'MEDIA_SOURCE_BYTE_STREAM_INVALID'
        | 'MEDIA_SOURCE_READ_FAILED'
        | 'MEDIA_SOURCE_BYTE_LENGTH_MISMATCH'
        | 'MEDIA_SOURCE_STORAGE_VERSION_UNAVAILABLE'
        | 'MEDIA_SOURCE_STORAGE_VERSION_CHANGED';
    };

export type MediaSourceContentIdentityPortsV1 = {
  /**
   * Opens the exact storage object represented by `expectedStorageVersion`.
   * The production owner obtains this only after its before-observation.
   */
  openExactByteStream(
    expectedStorageVersion: MediaSourceStorageVersionV1,
  ): AsyncIterable<Uint8Array>;
  /** Reads the provider object again after the complete byte stream is consumed. */
  inspectStorageVersionAfterRead(): Promise<MediaSourceStorageVersionInspectionV1>;
};

export type StoredMediaSourceContentIdentityPortsV1 = {
  /** Reads the source's provider observation immediately before opening it. */
  inspectStorageVersionBeforeRead(): Promise<MediaSourceStorageVersionInspectionV1>;
  /** Opens the server-owned object after the before-observation succeeds. */
  openExactByteStream(
    expectedStorageVersion: MediaSourceStorageVersionV1,
  ): AsyncIterable<Uint8Array>;
  /** Reads the source's provider observation after the complete hash. */
  inspectStorageVersionAfterRead(): Promise<MediaSourceStorageVersionInspectionV1>;
};

/**
 * The storage-owning adapter performs the before-observation and opens the
 * exact object only after it has one. This wrapper keeps that ordering out of
 * callers so a URL, client hash, or stale provider token cannot be substituted.
 */
export async function issueStoredMediaSourceContentIdentityV1(input: {
  owner: MediaSourceOwnerV1;
  assetId: string;
  mediaKind: MediaSourceVersionV1['mediaKind'];
}, ports: StoredMediaSourceContentIdentityPortsV1): Promise<MediaSourceContentIdentityResultV1> {
  let beforeRead: MediaSourceStorageVersionInspectionV1;
  try {
    beforeRead = await ports.inspectStorageVersionBeforeRead();
  } catch {
    return { disposition: 'UNVERIFIABLE', diagnostic: 'MEDIA_SOURCE_STORAGE_VERSION_UNAVAILABLE' };
  }
  if (beforeRead.disposition !== 'OBSERVED') {
    return { disposition: 'UNVERIFIABLE', diagnostic: 'MEDIA_SOURCE_STORAGE_VERSION_UNAVAILABLE' };
  }

  return issueMediaSourceContentIdentityV1({
    ...input,
    expectedStorageVersion: beforeRead.storageVersion,
  }, {
    openExactByteStream: ports.openExactByteStream,
    inspectStorageVersionAfterRead: ports.inspectStorageVersionAfterRead,
  });
}

export async function issueMediaSourceContentIdentityV1(input: {
  owner: MediaSourceOwnerV1;
  assetId: string;
  mediaKind: MediaSourceVersionV1['mediaKind'];
  expectedStorageVersion: MediaSourceStorageVersionV1;
}, ports: MediaSourceContentIdentityPortsV1): Promise<MediaSourceContentIdentityResultV1> {
  const hash = createHash('sha256');
  let byteLength = 0;

  try {
    for await (const chunk of ports.openExactByteStream(input.expectedStorageVersion)) {
      if (!(chunk instanceof Uint8Array)) {
        return { disposition: 'UNVERIFIABLE', diagnostic: 'MEDIA_SOURCE_BYTE_STREAM_INVALID' };
      }
      byteLength += chunk.byteLength;
      if (!Number.isSafeInteger(byteLength)) {
        return { disposition: 'UNVERIFIABLE', diagnostic: 'MEDIA_SOURCE_BYTE_STREAM_INVALID' };
      }
      hash.update(chunk);
    }
  } catch {
    return { disposition: 'UNVERIFIABLE', diagnostic: 'MEDIA_SOURCE_READ_FAILED' };
  }

  if (byteLength !== input.expectedStorageVersion.byteLength) {
    return { disposition: 'UNVERIFIABLE', diagnostic: 'MEDIA_SOURCE_BYTE_LENGTH_MISMATCH' };
  }

  let afterRead: MediaSourceStorageVersionInspectionV1;
  try {
    afterRead = await ports.inspectStorageVersionAfterRead();
  } catch {
    return { disposition: 'UNVERIFIABLE', diagnostic: 'MEDIA_SOURCE_STORAGE_VERSION_UNAVAILABLE' };
  }
  if (afterRead.disposition !== 'OBSERVED') {
    return { disposition: 'UNVERIFIABLE', diagnostic: 'MEDIA_SOURCE_STORAGE_VERSION_UNAVAILABLE' };
  }
  if (!sameMediaSourceStorageVersionV1(
    input.expectedStorageVersion,
    afterRead.storageVersion,
  )) {
    return { disposition: 'UNVERIFIABLE', diagnostic: 'MEDIA_SOURCE_STORAGE_VERSION_CHANGED' };
  }

  return {
    disposition: 'ISSUED',
    sourceVersion: createMediaSourceVersionV1({
      owner: input.owner,
      assetId: input.assetId,
      mediaKind: input.mediaKind,
      byteLength,
      contentSha256: hash.digest('hex'),
      storageVersion: input.expectedStorageVersion,
    }),
  };
}
