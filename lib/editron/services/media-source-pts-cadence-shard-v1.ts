import {
  cloneCanonicalEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import type {
  MediaRationalV1,
} from './media-source-probe-v1';
import { MEDIA_SOURCE_PROBE_VERSION_V1 } from './media-source-probe-v1';
import type { MediaSourceQualificationRecordV1 } from './media-source-qualification-v1';
import {
  assertMediaSourceVersionV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';
import { sameMediaSourceStorageVersionV1 } from './media-source-storage-version-v1';

/**
 * Immutable descriptor for one bounded, presentation-order PTS shard.
 *
 * It intentionally makes a local cadence observation only. A future
 * MEDIA_ASSETS-owned mapper must verify every contiguous shard before it can
 * issue a source-wide CFR/VFR result, persist a sidecar, or enable a timeline
 * operation.
 */
export const MEDIA_SOURCE_PTS_CADENCE_SHARD_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_SHARD_V1' as const;

const ZERO_BIGINT = BigInt(0);
const ONE_BIGINT = BigInt(1);

export type MediaSourcePtsCadenceTimestampOriginV1 =
  'FFPROBE_BEST_EFFORT_TIMESTAMP';

export type MediaSourcePtsCadenceMapperV1 = {
  mapperVersion: string;
  ffprobeVersion: string;
  commandPolicyVersion: string;
  timestampOrigin: MediaSourcePtsCadenceTimestampOriginV1;
};

export type MediaSourcePtsCadenceFrameInputV1 = {
  presentationTimestampTicks: string;
  durationTicks: string;
};

export type MediaSourcePtsCadenceShardV1 = {
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_PTS_CADENCE_SHARD_KIND_V1;
  sourceVersionSha256: string;
  storageVersionSha256: string;
  sourceBindingSha256: string;
  technicalObservationSha256: string;
  videoStreamIndex: number;
  sourceTimebase: MediaRationalV1;
  mapper: MediaSourcePtsCadenceMapperV1;
  shardSequence: number;
  firstFrameOrdinal: string;
  frameCount: string;
  startPresentationTimestampTicks: string;
  endExclusivePresentationTimestampTicks: string;
  localCadence:
    | { kind: 'UNIFORM_LOCAL'; durationTicks: string }
    | { kind: 'VARIABLE_LOCAL' };
  frameEvidenceSha256: string;
  shardSha256: string;
};

export type CreateMediaSourcePtsCadenceShardV1Input = {
  sourceVersion: MediaSourceVersionV1;
  qualification: MediaSourceQualificationRecordV1;
  videoStreamIndex: number;
  mapper: MediaSourcePtsCadenceMapperV1;
  shardSequence: number;
  firstFrameOrdinal: string;
  frames: readonly MediaSourcePtsCadenceFrameInputV1[];
};

/**
 * Validates exact lossless frame timing for one bounded shard. The accepted
 * timestamp origin is deliberately named: FFmpeg describes best-effort frame
 * timestamps as decoder-derived heuristics, so this descriptor is evidence
 * for a later verified map, never camera-timecode truth by itself.
 */
export function createMediaSourcePtsCadenceShardV1(
  input: CreateMediaSourcePtsCadenceShardV1Input,
): Readonly<MediaSourcePtsCadenceShardV1> {
  const sourceVersion = assertMediaSourceVersionV1(input.sourceVersion);
  const qualification = assertQualificationBinding(input.qualification, sourceVersion);
  const videoStreamIndex = nonNegativeSafeInteger(
    input.videoStreamIndex,
    'MEDIA_SOURCE_PTS_CADENCE_STREAM_INDEX_INVALID',
  );
  const sourceTimebase = selectedReducedVideoTimebase(
    qualification.observation,
    videoStreamIndex,
  );
  const mapper = normalizeMapper(input.mapper);
  const shardSequence = nonNegativeSafeInteger(
    input.shardSequence,
    'MEDIA_SOURCE_PTS_CADENCE_SHARD_SEQUENCE_INVALID',
  );
  const firstFrameOrdinal = nonNegativeIntegerText(
    input.firstFrameOrdinal,
    'MEDIA_SOURCE_PTS_CADENCE_FIRST_FRAME_ORDINAL_INVALID',
  );
  const frames = normalizeFrames(input.frames);
  const localCadence = determineLocalCadence(frames);
  const frameEvidenceSha256 = hashEditronCanonicalJsonV1({
    schemaVersion: 1,
    kind: MEDIA_SOURCE_PTS_CADENCE_SHARD_KIND_V1,
    timestampOrigin: mapper.timestampOrigin,
    frames,
  });
  const last = frames[frames.length - 1]!;
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_PTS_CADENCE_SHARD_KIND_V1,
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    storageVersionSha256: sourceVersion.storageVersion.storageVersionSha256,
    sourceBindingSha256: qualification.sourceBindingSha256,
    technicalObservationSha256: qualification.observation.observationSha256,
    videoStreamIndex,
    sourceTimebase,
    mapper,
    shardSequence,
    firstFrameOrdinal,
    frameCount: String(frames.length),
    startPresentationTimestampTicks: frames[0]!.presentationTimestampTicks,
    endExclusivePresentationTimestampTicks: signedIntegerText(
      parseSignedInteger(last.presentationTimestampTicks)
        + parsePositiveInteger(last.durationTicks),
    ),
    localCadence,
    frameEvidenceSha256,
  };
  return frozen({
    ...material,
    shardSha256: hashEditronCanonicalJsonV1(material),
  });
}

type QualificationBindingV1 = {
  sourceBindingSha256: string;
  observation: TechnicalObservationBindingV1;
};

type TechnicalObservationBindingV1 = {
  observationSha256: string;
  videoStreams: readonly unknown[];
};

function assertQualificationBinding(
  value: unknown,
  sourceVersion: Readonly<MediaSourceVersionV1>,
): QualificationBindingV1 {
  const record = asRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_QUALIFICATION_INVALID');
  if (
    record.status !== 'MEASURED_TECHNICAL'
    || record.assetId !== sourceVersion.assetId
    || typeof record.sourceBindingSha256 !== 'string'
    || !isSha256(record.sourceBindingSha256)
  ) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_QUALIFICATION_INVALID');
  }
  if (!record.storageVersion || !record.observation) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_QUALIFICATION_UNMEASURED');
  }
  try {
    if (!sameMediaSourceStorageVersionV1(
      sourceVersion.storageVersion,
      record.storageVersion as typeof sourceVersion.storageVersion,
    )) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_STORAGE_VERSION_MISMATCH');
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'MEDIA_SOURCE_PTS_CADENCE_STORAGE_VERSION_MISMATCH') {
      throw error;
    }
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_STORAGE_VERSION_INVALID');
  }
  return {
    sourceBindingSha256: record.sourceBindingSha256,
    observation: assertTechnicalObservation(record.observation),
  };
}

function assertTechnicalObservation(value: unknown): TechnicalObservationBindingV1 {
  const record = asRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_OBSERVATION_INVALID');
  const observationSha256 = record.observationSha256;
  if (
    record.schemaVersion !== 1
    || record.kind !== MEDIA_SOURCE_PROBE_VERSION_V1
    || typeof record.probeVersion !== 'string'
    || !record.probeVersion.trim()
    || !Array.isArray(record.videoStreams)
    || !Array.isArray(record.audioStreams)
    || typeof observationSha256 !== 'string'
    || !isSha256(observationSha256)
  ) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_OBSERVATION_INVALID');
  }
  const material = { ...record };
  delete material.observationSha256;
  let expectedHash: string;
  try {
    expectedHash = hashEditronCanonicalJsonV1(material);
  } catch {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_OBSERVATION_INVALID');
  }
  if (expectedHash !== observationSha256) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_OBSERVATION_HASH_MISMATCH');
  }
  return {
    observationSha256,
    videoStreams: record.videoStreams,
  };
}

function selectedReducedVideoTimebase(
  observation: TechnicalObservationBindingV1,
  videoStreamIndex: number,
): MediaRationalV1 {
  const matches = observation.videoStreams
    .map((stream) => stream && typeof stream === 'object' && !Array.isArray(stream)
      ? stream as Record<string, unknown>
      : null)
    .filter((stream): stream is Record<string, unknown> => stream?.streamIndex === videoStreamIndex);
  if (matches.length !== 1) throw new Error('MEDIA_SOURCE_PTS_CADENCE_VIDEO_STREAM_UNAVAILABLE');
  return reducedRational(matches[0]!.sourceTimebase);
}

function normalizeMapper(value: MediaSourcePtsCadenceMapperV1): MediaSourcePtsCadenceMapperV1 {
  const record = asRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_MAPPER_INVALID');
  exactKeys(record, [
    'mapperVersion',
    'ffprobeVersion',
    'commandPolicyVersion',
    'timestampOrigin',
  ], 'MEDIA_SOURCE_PTS_CADENCE_MAPPER_FIELDS_INVALID');
  if (record.timestampOrigin !== 'FFPROBE_BEST_EFFORT_TIMESTAMP') {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_TIMESTAMP_ORIGIN_INVALID');
  }
  return {
    mapperVersion: boundedText(record.mapperVersion, 'MEDIA_SOURCE_PTS_CADENCE_MAPPER_VERSION_INVALID'),
    ffprobeVersion: boundedText(record.ffprobeVersion, 'MEDIA_SOURCE_PTS_CADENCE_FFPROBE_VERSION_INVALID'),
    commandPolicyVersion: boundedText(
      record.commandPolicyVersion,
      'MEDIA_SOURCE_PTS_CADENCE_COMMAND_POLICY_VERSION_INVALID',
    ),
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP',
  };
}

function normalizeFrames(
  value: readonly MediaSourcePtsCadenceFrameInputV1[],
): readonly MediaSourcePtsCadenceFrameInputV1[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_FRAMES_EMPTY');
  }
  const frames = value.map((frame) => {
    const record = asRecord(frame, 'MEDIA_SOURCE_PTS_CADENCE_FRAME_INVALID');
    exactKeys(record, [
      'presentationTimestampTicks',
      'durationTicks',
    ], 'MEDIA_SOURCE_PTS_CADENCE_FRAME_FIELDS_INVALID');
    return {
      presentationTimestampTicks: signedIntegerText(
        parseSignedInteger(parseSignedIntegerText(
          record.presentationTimestampTicks,
          'MEDIA_SOURCE_PTS_CADENCE_PRESENTATION_TIMESTAMP_INVALID',
        )),
      ),
      durationTicks: positiveIntegerText(
        record.durationTicks,
        'MEDIA_SOURCE_PTS_CADENCE_DURATION_INVALID',
      ),
    };
  });
  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1]!;
    const current = frames[index]!;
    const expected = parseSignedInteger(previous.presentationTimestampTicks)
      + parsePositiveInteger(previous.durationTicks);
    if (parseSignedInteger(current.presentationTimestampTicks) !== expected) {
      throw new Error('MEDIA_SOURCE_PTS_CADENCE_SHARD_NON_CONTIGUOUS');
    }
  }
  return frames;
}

function determineLocalCadence(
  frames: readonly MediaSourcePtsCadenceFrameInputV1[],
): MediaSourcePtsCadenceShardV1['localCadence'] {
  const durationTicks = frames[0]!.durationTicks;
  return frames.every((frame) => frame.durationTicks === durationTicks)
    ? { kind: 'UNIFORM_LOCAL', durationTicks }
    : { kind: 'VARIABLE_LOCAL' };
}

function reducedRational(value: unknown): MediaRationalV1 {
  const record = asRecord(value, 'MEDIA_SOURCE_PTS_CADENCE_TIMEBASE_INVALID');
  exactKeys(record, ['numerator', 'denominator'], 'MEDIA_SOURCE_PTS_CADENCE_TIMEBASE_FIELDS_INVALID');
  const numerator = positiveIntegerText(
    record.numerator,
    'MEDIA_SOURCE_PTS_CADENCE_TIMEBASE_NUMERATOR_INVALID',
  );
  const denominator = positiveIntegerText(
    record.denominator,
    'MEDIA_SOURCE_PTS_CADENCE_TIMEBASE_DENOMINATOR_INVALID',
  );
  if (greatestCommonDivisor(parsePositiveInteger(numerator), parsePositiveInteger(denominator)) !== ONE_BIGINT) {
    throw new Error('MEDIA_SOURCE_PTS_CADENCE_TIMEBASE_NOT_REDUCED');
  }
  return { numerator, denominator };
}

function asRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], code: string): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length
    || actual.some((key, index) => key !== sortedExpected[index])) {
    throw new Error(code);
  }
}

function nonNegativeSafeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(code);
  return Number(value);
}

function boundedText(value: unknown, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function positiveIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,127}$/.test(value.trim())) {
    throw new Error(code);
  }
  return BigInt(value.trim()).toString();
}

function nonNegativeIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,127})$/.test(value.trim())) {
    throw new Error(code);
  }
  return BigInt(value.trim()).toString();
}

function parseSignedIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^-?(0|[1-9]\d{0,127})$/.test(value.trim())) {
    throw new Error(code);
  }
  return value.trim();
}

function signedIntegerText(value: bigint): string {
  return value.toString();
}

function parseSignedInteger(value: string): bigint {
  return BigInt(value);
}

function parsePositiveInteger(value: string): bigint {
  return BigInt(value);
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left;
  let b = right;
  while (b !== ZERO_BIGINT) {
    [a, b] = [b, a % b];
  }
  return a;
}

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(cloneCanonicalEditronJsonV1(value)) as Readonly<T>;
}
