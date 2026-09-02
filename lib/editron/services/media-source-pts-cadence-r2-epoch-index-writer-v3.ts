import { PutObjectCommand } from '@aws-sdk/client-s3';

import {
  createMediaSourcePtsCadenceEpochIndexSidecarV3,
  type MediaSourcePtsCadenceEpochIndexSerializationV3,
  type MediaSourcePtsCadenceEpochIndexSidecarV3,
} from './media-source-pts-cadence-epoch-index-v3';
import {
  createMediaSourcePtsCadenceR2PrivateEpochArtifactReaderV3,
  type MediaSourcePtsCadenceR2CommandClientV1,
  type MediaSourcePtsCadenceR2PrivateStorageScopeV1,
} from './media-source-pts-cadence-r2-private-sidecar-v1';

export type MediaSourcePtsCadenceR2EpochIndexWriterV3 = Readonly<{
  writeImmutableEpochIndex(input: Readonly<{
    serialization: MediaSourcePtsCadenceEpochIndexSerializationV3;
    expected: MediaSourcePtsCadenceEpochIndexSidecarV3;
  }>): Promise<MediaSourcePtsCadenceEpochIndexSidecarV3>;
}>;

/**
 * Writes only the immutable V3 epoch index. Frame batches remain owned by the
 * V2 artifact port and boundary evidence requires its own future producer.
 * A create collision is accepted only after the existing exact reader proves
 * that the already-stored bytes are identical.
 */
export function createMediaSourcePtsCadenceR2EpochIndexWriterV3(input: {
  privateStorage: MediaSourcePtsCadenceR2PrivateStorageScopeV1;
  client: MediaSourcePtsCadenceR2CommandClientV1;
}): MediaSourcePtsCadenceR2EpochIndexWriterV3 {
  const reader = createMediaSourcePtsCadenceR2PrivateEpochArtifactReaderV3(input);
  const bucketName = input.privateStorage.bucketName.trim();

  return Object.freeze({
    writeImmutableEpochIndex: async ({ serialization, expected }) => {
      const actual = createMediaSourcePtsCadenceEpochIndexSidecarV3({
        storage: 'R2_PRIVATE',
        serialization,
      });
      if (!sameEpochIndexSidecar(actual, expected)) {
        throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_V3_EPOCH_INDEX_EXPECTED_MISMATCH');
      }
      const bytes = Buffer.from(serialization.canonicalJson, 'utf8');
      try {
        await input.client.send(new PutObjectCommand({
          Bucket: bucketName,
          Key: actual.objectKey,
          Body: bytes,
          ContentLength: bytes.byteLength,
          ContentType: 'application/json; charset=utf-8',
          CacheControl: 'no-store',
          IfNoneMatch: '*',
          Metadata: {
            'content-sha256': actual.contentSha256,
            'source-version-sha256': actual.sourceVersionSha256,
            'map-binding-sha256': actual.mapBindingSha256,
          },
        }));
      } catch (error) {
        if (!isPreconditionFailed(error)) {
          throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_V3_EPOCH_INDEX_WRITE_FAILED');
        }
      }

      const stored = await reader.read(actual);
      if (stored.canonicalJson !== serialization.canonicalJson
        || stored.byteLength !== serialization.byteLength
        || stored.contentSha256 !== serialization.contentSha256) {
        throw new Error('MEDIA_SOURCE_PTS_CADENCE_R2_V3_EPOCH_INDEX_CONTENT_MISMATCH');
      }
      return actual;
    },
  });
}

function sameEpochIndexSidecar(
  left: MediaSourcePtsCadenceEpochIndexSidecarV3,
  right: MediaSourcePtsCadenceEpochIndexSidecarV3,
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.kind === right.kind
    && left.storage === right.storage
    && left.objectKey === right.objectKey
    && left.byteLength === right.byteLength
    && left.contentSha256 === right.contentSha256
    && left.sourceVersionSha256 === right.sourceVersionSha256
    && left.mapBindingSha256 === right.mapBindingSha256
    && left.epochCount === right.epochCount
    && left.batchCount === right.batchCount
    && left.endExclusiveFrameOrdinal === right.endExclusiveFrameOrdinal;
}

function isPreconditionFailed(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return candidate.name === 'PreconditionFailed'
    || candidate.$metadata?.httpStatusCode === 412;
}
