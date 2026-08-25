import { createHash } from 'node:crypto';

import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
} from './canonical-json-v1';
import {
  assertMediaSourcePtsCadenceMapCheckpointV1,
  assertMediaSourcePtsCadenceMapShardV1,
  expectedMediaSourcePtsCadenceManifestObjectKeyV1,
  expectedMediaSourcePtsCadenceShardObjectKeyV1,
  mediaSourcePtsCadenceMapBindingSha256V1,
  MEDIA_SOURCE_PTS_CADENCE_PRIVATE_SIDECAR_KIND_V1,
  type MediaSourcePtsCadenceMapCheckpointV1,
  type MediaSourcePtsCadencePrivateSidecarV1,
} from './media-source-pts-cadence-map-lifecycle-v1';
import type { MediaSourcePtsCadenceShardV1 } from './media-source-pts-cadence-shard-v1';

export const MEDIA_SOURCE_PTS_CADENCE_SHARD_SIDECAR_PAYLOAD_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_SHARD_SIDECAR_PAYLOAD_V1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_MANIFEST_SIDECAR_PAYLOAD_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_MANIFEST_SIDECAR_PAYLOAD_V1' as const;

export type MediaSourcePtsCadencePrivateSidecarSerializationV1 = {
  sidecar: Readonly<MediaSourcePtsCadencePrivateSidecarV1>;
  canonicalJson: string;
};

/**
 * Serializes one already-verified PTS shard into the exact immutable private
 * payload its lifecycle record will reference. It cannot write storage.
 */
export function serializeMediaSourcePtsCadenceShardSidecarV1(input: {
  storage: MediaSourcePtsCadencePrivateSidecarV1['storage'];
  mapBindingSha256: string;
  shard: MediaSourcePtsCadenceShardV1;
}): Readonly<MediaSourcePtsCadencePrivateSidecarSerializationV1> {
  const shard = assertMediaSourcePtsCadenceMapShardV1(input.shard);
  const mapBindingSha256 = assertSha256(input.mapBindingSha256);
  if (mediaSourcePtsCadenceMapBindingSha256V1(shard) !== mapBindingSha256) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_SIDECAR_SHARD_BINDING_MISMATCH');
  }
  return serialize({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_SHARD_SIDECAR_PAYLOAD_KIND_V1,
    mapBindingSha256,
    shard,
  }, input.storage, expectedMediaSourcePtsCadenceShardObjectKeyV1(mapBindingSha256, shard));
}

/**
 * Serializes the checkpoint manifest handed to the later full-coverage reader.
 * The manifest is data only; it does not certify coverage or source cadence.
 */
export function serializeMediaSourcePtsCadenceManifestSidecarV1(input: {
  storage: MediaSourcePtsCadencePrivateSidecarV1['storage'];
  mapBindingSha256: string;
  checkpoint: MediaSourcePtsCadenceMapCheckpointV1;
}): Readonly<MediaSourcePtsCadencePrivateSidecarSerializationV1> {
  const mapBindingSha256 = assertSha256(input.mapBindingSha256);
  const checkpoint = assertMediaSourcePtsCadenceMapCheckpointV1(input.checkpoint);
  return serialize({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_MANIFEST_SIDECAR_PAYLOAD_KIND_V1,
    mapBindingSha256,
    checkpoint,
  }, input.storage, expectedMediaSourcePtsCadenceManifestObjectKeyV1(mapBindingSha256, checkpoint));
}

function serialize(
  payload: Record<string, unknown>,
  storage: MediaSourcePtsCadencePrivateSidecarV1['storage'],
  objectKey: string,
): Readonly<MediaSourcePtsCadencePrivateSidecarSerializationV1> {
  if (storage !== 'R2_PRIVATE' && storage !== 'GCS_PRIVATE') {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_SIDECAR_STORAGE_INVALID');
  }
  const canonicalJson = canonicalizeEditronJsonV1(payload);
  const sidecar: MediaSourcePtsCadencePrivateSidecarV1 = {
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_PRIVATE_SIDECAR_KIND_V1,
    storage,
    objectKey,
    byteLength: Buffer.byteLength(canonicalJson, 'utf8'),
    contentSha256: createHash('sha256').update(canonicalJson, 'utf8').digest('hex'),
  };
  return deepFreezeEditronJsonV1({ sidecar, canonicalJson });
}

function assertSha256(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_SIDECAR_BINDING_INVALID');
  }
  return value;
}
