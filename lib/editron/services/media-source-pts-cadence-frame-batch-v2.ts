import { createHash } from 'node:crypto';

import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertMediaSourcePtsCadenceMapShardV1,
  mediaSourcePtsCadenceMapBindingSha256V1,
} from './media-source-pts-cadence-map-lifecycle-v1';
import {
  MEDIA_SOURCE_PTS_CADENCE_SHARD_KIND_V1,
  type MediaSourcePtsCadenceFrameInputV1,
  type MediaSourcePtsCadenceShardV1,
} from './media-source-pts-cadence-shard-v1';

/**
 * A recoverable, lossless per-frame payload. It intentionally does not change
 * the existing V1 lifecycle or sidecar key scheme: a later owner must bind
 * this protocol and its manifest index through an explicit V2 state path.
 */
export const MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_PAYLOAD_KIND_V2 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_PAYLOAD_V2' as const;

/** Parser ceilings, not a media-duration or product compatibility policy. */
export const MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_ABSOLUTE_MAX_BYTES_V2 = 8 * 1024 * 1024;
export const MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_ABSOLUTE_MAX_RECORDS_V2 = 100_000;

export type MediaSourcePtsCadenceFrameBatchResourcePolicyV2 = {
  policyVersion: string;
  maxCanonicalJsonBytes: number;
  maxFrameRecords: number;
};

export type MediaSourcePtsCadenceFrameBatchPayloadV2 = {
  schemaVersion: 2;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_PAYLOAD_KIND_V2;
  mapBindingSha256: string;
  resourcePolicy: MediaSourcePtsCadenceFrameBatchResourcePolicyV2;
  shard: MediaSourcePtsCadenceShardV1;
  frames: readonly MediaSourcePtsCadenceFrameInputV1[];
};

export type MediaSourcePtsCadenceFrameBatchSerializationV2 = {
  payload: Readonly<MediaSourcePtsCadenceFrameBatchPayloadV2>;
  canonicalJson: string;
  byteLength: number;
  contentSha256: string;
};

/**
 * Creates a canonical batch that retains every frame PTS/duration record used
 * to create its V1 descriptor. A descriptor hash alone is not recoverable.
 */
export function serializeMediaSourcePtsCadenceFrameBatchV2(input: {
  mapBindingSha256: string;
  resourcePolicy: MediaSourcePtsCadenceFrameBatchResourcePolicyV2;
  shard: MediaSourcePtsCadenceShardV1;
  frames: readonly MediaSourcePtsCadenceFrameInputV1[];
}): Readonly<MediaSourcePtsCadenceFrameBatchSerializationV2> {
  const payload = assertMediaSourcePtsCadenceFrameBatchPayloadV2({
    schemaVersion: 2,
    kind: MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_PAYLOAD_KIND_V2,
    mapBindingSha256: input.mapBindingSha256,
    resourcePolicy: input.resourcePolicy,
    shard: input.shard,
    frames: input.frames,
  });
  const canonicalJson = canonicalizeEditronJsonV1(payload);
  const byteLength = Buffer.byteLength(canonicalJson, 'utf8');
  if (byteLength > payload.resourcePolicy.maxCanonicalJsonBytes) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_BYTE_LIMIT_EXCEEDED');
  }
  return frozen({
    payload,
    canonicalJson,
    byteLength,
    contentSha256: hashUtf8(canonicalJson),
  });
}

/**
 * Decodes only exact canonical JSON. Storage must independently verify its
 * object digest before calling this parser; this function verifies content
 * semantics and descriptor/frame agreement.
 */
export function parseMediaSourcePtsCadenceFrameBatchV2(
  canonicalJson: string,
): Readonly<MediaSourcePtsCadenceFrameBatchPayloadV2> {
  if (typeof canonicalJson !== 'string'
    || Buffer.byteLength(canonicalJson, 'utf8') > MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_ABSOLUTE_MAX_BYTES_V2) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_INPUT_TOO_LARGE');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(canonicalJson);
  } catch {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_JSON_INVALID');
  }
  const normalized = assertMediaSourcePtsCadenceFrameBatchPayloadV2(parsed);
  if (canonicalizeEditronJsonV1(normalized) !== canonicalJson) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_JSON_NON_CANONICAL');
  }
  if (Buffer.byteLength(canonicalJson, 'utf8') > normalized.resourcePolicy.maxCanonicalJsonBytes) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_BYTE_LIMIT_EXCEEDED');
  }
  return normalized;
}

export function assertMediaSourcePtsCadenceFrameBatchPayloadV2(
  value: unknown,
): Readonly<MediaSourcePtsCadenceFrameBatchPayloadV2> {
  const record = asRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_INVALID');
  exactKeys(record, [
    'frames', 'kind', 'mapBindingSha256', 'resourcePolicy', 'schemaVersion', 'shard',
  ], 'MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_FIELDS_INVALID');
  if (record.schemaVersion !== 2 || record.kind !== MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_PAYLOAD_KIND_V2) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_INVALID');
  }
  const shard = assertMediaSourcePtsCadenceMapShardV1(record.shard);
  const resourcePolicy = assertResourcePolicy(record.resourcePolicy, shard.mapper.commandPolicyVersion);
  const frames = normalizeFrames(record.frames, resourcePolicy.maxFrameRecords);
  const mapBindingSha256 = sha256(record.mapBindingSha256, 'MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_BINDING_INVALID');
  if (mediaSourcePtsCadenceMapBindingSha256V1(shard) !== mapBindingSha256) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_BINDING_MISMATCH');
  }
  assertFramesMatchShard(frames, shard);
  return frozen({
    schemaVersion: 2,
    kind: MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_PAYLOAD_KIND_V2,
    mapBindingSha256,
    resourcePolicy,
    shard,
    frames,
  });
}

function assertResourcePolicy(
  value: unknown,
  commandPolicyVersion: string,
): MediaSourcePtsCadenceFrameBatchResourcePolicyV2 {
  const record = asRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_POLICY_INVALID');
  exactKeys(record, ['maxCanonicalJsonBytes', 'maxFrameRecords', 'policyVersion'], 'MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_POLICY_FIELDS_INVALID');
  const policyVersion = boundedText(record.policyVersion, 'MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_POLICY_INVALID');
  if (policyVersion !== commandPolicyVersion) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_POLICY_BINDING_MISMATCH');
  }
  return {
    policyVersion,
    maxCanonicalJsonBytes: positiveSafeIntegerInRange(
      record.maxCanonicalJsonBytes,
      MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_ABSOLUTE_MAX_BYTES_V2,
      'MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_POLICY_BYTES_INVALID',
    ),
    maxFrameRecords: positiveSafeIntegerInRange(
      record.maxFrameRecords,
      MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_ABSOLUTE_MAX_RECORDS_V2,
      'MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_POLICY_RECORDS_INVALID',
    ),
  };
}

function normalizeFrames(value: unknown, maxFrameRecords: number): readonly MediaSourcePtsCadenceFrameInputV1[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxFrameRecords) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_FRAME_COUNT_INVALID');
  }
  const frames = value.map((entry) => {
    const record = asRecord(entry, 'MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_FRAME_INVALID');
    exactKeys(record, ['durationTicks', 'presentationTimestampTicks'], 'MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_FRAME_FIELDS_INVALID');
    return {
      presentationTimestampTicks: signedIntegerText(
        record.presentationTimestampTicks,
        'MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_PTS_INVALID',
      ),
      durationTicks: positiveIntegerText(
        record.durationTicks,
        'MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_DURATION_INVALID',
      ),
    };
  });
  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1]!;
    if (BigInt(frames[index]!.presentationTimestampTicks)
      !== BigInt(previous.presentationTimestampTicks) + BigInt(previous.durationTicks)) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_NON_CONTIGUOUS');
    }
  }
  return frames;
}

function assertFramesMatchShard(
  frames: readonly MediaSourcePtsCadenceFrameInputV1[],
  shard: Readonly<MediaSourcePtsCadenceShardV1>,
): void {
  if (String(frames.length) !== shard.frameCount
    || frames[0]!.presentationTimestampTicks !== shard.startPresentationTimestampTicks) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_DESCRIPTOR_COUNT_OR_START_MISMATCH');
  }
  const last = frames[frames.length - 1]!;
  if (String(BigInt(last.presentationTimestampTicks) + BigInt(last.durationTicks))
    !== shard.endExclusivePresentationTimestampTicks) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_DESCRIPTOR_END_MISMATCH');
  }
  const expectedEvidence = hashEditronCanonicalJsonV1({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_SHARD_KIND_V1,
    timestampOrigin: shard.mapper.timestampOrigin,
    frames,
  });
  if (expectedEvidence !== shard.frameEvidenceSha256) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_EVIDENCE_MISMATCH');
  }
  const firstDuration = frames[0]!.durationTicks;
  const uniform = frames.every((frame) => frame.durationTicks === firstDuration);
  if (uniform !== (shard.localCadence.kind === 'UNIFORM_LOCAL')
    || (uniform && shard.localCadence.kind === 'UNIFORM_LOCAL'
      && shard.localCadence.durationTicks !== firstDuration)) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_FRAME_BATCH_CADENCE_MISMATCH');
  }
}

function asRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], code: string): void {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length || actual.some((key, index) => key !== sorted[index])) {
    throw new Error(code);
  }
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(code);
  return value;
}

function boundedText(value: unknown, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || /[\u0000-\u001F\u007F]/.test(normalized)) throw new Error(code);
  return normalized;
}

function positiveSafeIntegerInRange(value: unknown, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0 || Number(value) > maximum) throw new Error(code);
  return Number(value);
}

function positiveIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,127}$/.test(value.trim())) throw new Error(code);
  return BigInt(value.trim()).toString();
}

function signedIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^-?(0|[1-9]\d{0,127})$/.test(value.trim())) throw new Error(code);
  return BigInt(value.trim()).toString();
}

function hashUtf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(value) as Readonly<T>;
}
