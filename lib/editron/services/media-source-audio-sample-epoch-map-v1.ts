import {
  parseExactRationalRateV1,
  type ExactRationalRateV1,
} from '../contracts/canonical-media-time-v1';

import {
  canonicalizeEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  MEDIA_SOURCE_QUALIFICATION_VERSION_V1,
  type MediaSourceQualificationRecordV1,
} from './media-source-qualification-v1';
import type { MediaSourceAudioStreamObservationV1 } from './media-source-probe-v1';
import { sameMediaSourceStorageVersionV1 } from './media-source-storage-version-v1';
import { assertMediaSourceVersionV1, type MediaSourceVersionV1 } from './media-source-version-v1';

export const MEDIA_SOURCE_AUDIO_STREAM_BINDING_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_AUDIO_STREAM_BINDING_V1' as const;
export const MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_KIND_V1 =
  'EDITRON_MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_V1' as const;
export const MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_ADAPTER_VERSION_V1 =
  'EDITRON_MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FFMPEG_V1' as const;

export const MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_ABSOLUTE_MAX_BYTES_V1 = 8 * 1024 * 1024;
export const MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_ABSOLUTE_MAX_DECODED_FRAMES_V1 = 2_000_000;
export const MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_ABSOLUTE_MAX_EPOCHS_V1 = 100_000;
export const MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_ABSOLUTE_MAX_TIMEOUT_MS_V1 = 60 * 60 * 1000;

export type ExactSignedRationalV1 = Readonly<{
  numerator: string;
  denominator: string;
}>;

export type MediaSourceAudioStreamBindingV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_AUDIO_STREAM_BINDING_KIND_V1;
  assetId: string;
  mediaKind: 'video' | 'audio';
  sourceVersionSha256: string;
  storageVersionSha256: string;
  sourceBindingSha256: string;
  technicalObservationSha256: string;
  streamId: string;
  audioStreamIndex: number;
  codec: string | null;
  sampleRate: string;
  channelCount: number;
  channelLayout: string;
  sourceTimebase: ExactRationalRateV1;
  observedSourceStartPts: string | null;
  observedSourceDurationTicks: string | null;
  audioStreamBindingSha256: string;
}>;

export type MediaSourceAudioSampleEpochResourcePolicyV1 = Readonly<{
  policyVersion: string;
  maxSourceBytes: number;
  maxCanonicalJsonBytes: number;
  maxDecodedFrameEntries: number;
  maxEpochEntries: number;
  maxDecodedSampleFrames: number;
  maxDecodedPcmBytes: number;
  timeoutMs: number;
}>;

export type MediaSourceAudioSampleEpochToolchainV1 = Readonly<{
  adapterVersion: typeof MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_ADAPTER_VERSION_V1;
  ffmpegVersion: string;
  ffprobeVersion: string;
}>;

export type MediaSourceAudioDecodedFrameEvidenceV1 = Readonly<{
  presentationTimestampTicks: string;
  decodedSampleFrameCount: string;
}>;

export type MediaSourceAudioSampleEpochBoundaryKindV1 =
  | 'INITIAL'
  | 'TIMESTAMP_RESET'
  | 'GAP'
  | 'OVERLAP';

export type MediaSourceAudioSampleEpochV1 = Readonly<{
  epochId: string;
  boundaryKind: MediaSourceAudioSampleEpochBoundaryKindV1;
  precedingDisplacementSampleFrames: ExactSignedRationalV1;
  firstDecodedFrameOrdinal: string;
  endExclusiveDecodedFrameOrdinal: string;
  decodedStartSampleFrame: string;
  decodedEndExclusiveSampleFrame: string;
  sourceStartPresentationTimestampTicks: string;
  sourceLastFramePresentationTimestampTicks: string;
  sourceStartSamplePosition: ExactSignedRationalV1;
  sourceEndExclusiveSamplePosition: ExactSignedRationalV1;
}>;

export type MediaSourceAudioDecodedPcmReceiptV1 = Readonly<{
  codec: 'PCM_S32LE';
  sampleFormat: 'SIGNED_32_BIT_LITTLE_ENDIAN';
  interleaving: 'INTERLEAVED';
  sampleRate: string;
  channelCount: number;
  decodedSampleFrameCount: string;
  decodedByteLength: number;
  decodedPcmSha256: string;
}>;

export type MediaSourceAudioSampleEpochMapV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_KIND_V1;
  binding: MediaSourceAudioStreamBindingV1;
  toolchain: MediaSourceAudioSampleEpochToolchainV1;
  decodePolicy: Readonly<{
    timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP';
    timingModel: 'SOURCE_PTS_PLUS_DECODED_SAMPLE_COUNTS';
    primingAndPadding: 'FFMPEG_DECODED_OUTPUT_TIMELINE';
    editLists: 'FFMPEG_DEMUXED_OUTPUT_TIMELINE';
    gaps: 'DECLARED_AS_EPOCH_NO_SYNTHETIC_SAMPLES';
    overlaps: 'DECLARED_AS_EPOCH_NO_DROPPED_SAMPLES';
    resampling: 'FORBIDDEN';
    channelRemix: 'FORBIDDEN';
  }>;
  resourcePolicy: MediaSourceAudioSampleEpochResourcePolicyV1;
  frameScan: Readonly<{
    decodedFrameCount: string;
    decodedSampleFrameCount: string;
    frameEvidenceSha256: string;
  }>;
  epochs: readonly MediaSourceAudioSampleEpochV1[];
  pcm: MediaSourceAudioDecodedPcmReceiptV1;
  audioSampleEpochMapSha256: string;
}>;

export type MediaSourceAudioSampleEpochMapSerializationV1 = Readonly<{
  map: MediaSourceAudioSampleEpochMapV1;
  canonicalJson: string;
  byteLength: number;
  contentSha256: string;
}>;

const DECODE_POLICY = deepFreezeEditronJsonV1({
  timestampOrigin: 'FFPROBE_BEST_EFFORT_TIMESTAMP' as const,
  timingModel: 'SOURCE_PTS_PLUS_DECODED_SAMPLE_COUNTS' as const,
  primingAndPadding: 'FFMPEG_DECODED_OUTPUT_TIMELINE' as const,
  editLists: 'FFMPEG_DEMUXED_OUTPUT_TIMELINE' as const,
  gaps: 'DECLARED_AS_EPOCH_NO_SYNTHETIC_SAMPLES' as const,
  overlaps: 'DECLARED_AS_EPOCH_NO_DROPPED_SAMPLES' as const,
  resampling: 'FORBIDDEN' as const,
  channelRemix: 'FORBIDDEN' as const,
});

/**
 * Selects one audio stream from a measured, immutable source. This is the
 * sole stream-selection boundary for the sample-epoch evidence below. It does
 * not infer a default when the requested stream is absent or ambiguous.
 */
export function createMediaSourceAudioStreamBindingV1(input: Readonly<{
  sourceVersion: MediaSourceVersionV1;
  qualification: MediaSourceQualificationRecordV1;
  audioStreamIndex: number;
}>): MediaSourceAudioStreamBindingV1 {
  const sourceVersion = assertMediaSourceVersionV1(input.sourceVersion);
  if (sourceVersion.mediaKind !== 'video' && sourceVersion.mediaKind !== 'audio') {
    throw new Error('MEDIA_SOURCE_AUDIO_BINDING_MEDIA_KIND_INVALID');
  }
  const qualification = input.qualification;
  if (!qualification || qualification.schemaVersion !== 1
    || qualification.kind !== MEDIA_SOURCE_QUALIFICATION_VERSION_V1
    || qualification.status !== 'MEASURED_TECHNICAL'
    || qualification.assetId !== sourceVersion.assetId
    || qualification.storageVersion === null
    || qualification.observation === null
    || !sameMediaSourceStorageVersionV1(
      qualification.storageVersion,
      sourceVersion.storageVersion,
    )) {
    throw new Error('MEDIA_SOURCE_AUDIO_BINDING_QUALIFICATION_INVALID');
  }
  const sourceBindingSha256 = sha256(
    qualification.sourceBindingSha256,
    'MEDIA_SOURCE_AUDIO_BINDING_SOURCE_BINDING_INVALID',
  );
  const observation = qualification.observation;
  const { observationSha256, ...observationMaterial } = observation;
  if (sha256(observationSha256, 'MEDIA_SOURCE_AUDIO_BINDING_OBSERVATION_HASH_INVALID')
    !== hashEditronCanonicalJsonV1(observationMaterial)) {
    throw new Error('MEDIA_SOURCE_AUDIO_BINDING_OBSERVATION_HASH_MISMATCH');
  }
  const audioStreamIndex = nonNegativeSafeInteger(
    input.audioStreamIndex,
    'MEDIA_SOURCE_AUDIO_BINDING_STREAM_INDEX_INVALID',
  );
  const candidates = observation.audioStreams.filter(
    (candidate) => candidate.streamIndex === audioStreamIndex,
  );
  if (candidates.length !== 1) {
    throw new Error('MEDIA_SOURCE_AUDIO_BINDING_STREAM_NOT_UNIQUE');
  }
  const stream = normalizeAudioStream(candidates[0]!);
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_AUDIO_STREAM_BINDING_KIND_V1,
    assetId: identifier(sourceVersion.assetId, 'MEDIA_SOURCE_AUDIO_BINDING_ASSET_ID_INVALID'),
    mediaKind: sourceVersion.mediaKind,
    sourceVersionSha256: sourceVersion.sourceVersionSha256,
    storageVersionSha256: sourceVersion.storageVersion.storageVersionSha256,
    sourceBindingSha256,
    technicalObservationSha256: observationSha256,
    streamId: expectedAudioStreamIdV1(audioStreamIndex),
    audioStreamIndex,
    codec: stream.codec,
    sampleRate: stream.sampleRate,
    channelCount: stream.channelCount,
    channelLayout: stream.channelLayout,
    sourceTimebase: stream.sourceTimebase,
    observedSourceStartPts: stream.sourceStartPts,
    observedSourceDurationTicks: stream.sourceDurationTicks,
  };
  return frozen({
    ...material,
    audioStreamBindingSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function createMediaSourceAudioSampleEpochMapV1(input: Readonly<{
  binding: MediaSourceAudioStreamBindingV1;
  toolchain: MediaSourceAudioSampleEpochToolchainV1;
  resourcePolicy: MediaSourceAudioSampleEpochResourcePolicyV1;
  frames: readonly MediaSourceAudioDecodedFrameEvidenceV1[];
  pcm: Readonly<{
    decodedByteLength: number;
    decodedPcmSha256: string;
  }>;
}>): MediaSourceAudioSampleEpochMapV1 {
  const binding = assertMediaSourceAudioStreamBindingV1(input.binding);
  const toolchain = normalizeToolchain(input.toolchain);
  const resourcePolicy = assertMediaSourceAudioSampleEpochResourcePolicyV1(
    input.resourcePolicy,
  );
  if (!Array.isArray(input.frames) || input.frames.length === 0
    || input.frames.length > resourcePolicy.maxDecodedFrameEntries) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FRAME_COUNT_INVALID');
  }
  const frames = input.frames.map(normalizeDecodedFrame);
  const epochs: MediaSourceAudioSampleEpochV1[] = [];
  const sampleRate = BigInt(binding.sampleRate);
  let decodedSampleFrames = BigInt(0);
  let previousFramePts: bigint | null = null;
  let previousSourceEnd: ExactSignedRationalV1 | null = null;

  frames.forEach((frame, index) => {
    const pts = BigInt(frame.presentationTimestampTicks);
    const sampleCount = BigInt(frame.decodedSampleFrameCount);
    const sourceStart = samplePositionFromPts(pts, binding.sourceTimebase, sampleRate);
    const sourceEnd = addIntegerToRational(sourceStart, sampleCount);
    const decodedStart = decodedSampleFrames;
    decodedSampleFrames += sampleCount;
    if (decodedSampleFrames > BigInt(resourcePolicy.maxDecodedSampleFrames)) {
      throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_SAMPLE_LIMIT_EXCEEDED');
    }

    const isContinuous = previousSourceEnd !== null
      && compareRational(sourceStart, previousSourceEnd) === 0;
    if (index === 0 || !isContinuous) {
      if (epochs.length >= resourcePolicy.maxEpochEntries) {
        throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_EPOCH_LIMIT_EXCEEDED');
      }
      const displacement = previousSourceEnd === null
        ? rational(BigInt(0), BigInt(1))
        : subtractRational(sourceStart, previousSourceEnd);
      const boundaryKind: MediaSourceAudioSampleEpochBoundaryKindV1 = index === 0
        ? 'INITIAL'
        : previousFramePts !== null && pts < previousFramePts
          ? 'TIMESTAMP_RESET'
          : compareRational(displacement, rational(BigInt(0), BigInt(1))) > 0
            ? 'GAP'
            : 'OVERLAP';
      epochs.push({
        epochId: expectedEpochId(binding.audioStreamIndex, epochs.length),
        boundaryKind,
        precedingDisplacementSampleFrames: displacement,
        firstDecodedFrameOrdinal: String(index),
        endExclusiveDecodedFrameOrdinal: String(index + 1),
        decodedStartSampleFrame: decodedStart.toString(),
        decodedEndExclusiveSampleFrame: decodedSampleFrames.toString(),
        sourceStartPresentationTimestampTicks: pts.toString(),
        sourceLastFramePresentationTimestampTicks: pts.toString(),
        sourceStartSamplePosition: sourceStart,
        sourceEndExclusiveSamplePosition: sourceEnd,
      });
    } else {
      const epoch = epochs[epochs.length - 1]!;
      epochs[epochs.length - 1] = {
        ...epoch,
        endExclusiveDecodedFrameOrdinal: String(index + 1),
        decodedEndExclusiveSampleFrame: decodedSampleFrames.toString(),
        sourceLastFramePresentationTimestampTicks: pts.toString(),
        sourceEndExclusiveSamplePosition: sourceEnd,
      };
    }
    previousFramePts = pts;
    previousSourceEnd = sourceEnd;
  });

  const expectedPcmBytes = decodedSampleFrames * BigInt(binding.channelCount) * BigInt(4);
  const decodedByteLength = positiveSafeIntegerInRange(
    input.pcm.decodedByteLength,
    resourcePolicy.maxDecodedPcmBytes,
    'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_PCM_BYTES_INVALID',
  );
  if (expectedPcmBytes !== BigInt(decodedByteLength)) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_PCM_SAMPLE_COUNT_MISMATCH');
  }
  const pcm: MediaSourceAudioDecodedPcmReceiptV1 = {
    codec: 'PCM_S32LE',
    sampleFormat: 'SIGNED_32_BIT_LITTLE_ENDIAN',
    interleaving: 'INTERLEAVED',
    sampleRate: binding.sampleRate,
    channelCount: binding.channelCount,
    decodedSampleFrameCount: decodedSampleFrames.toString(),
    decodedByteLength,
    decodedPcmSha256: sha256(
      input.pcm.decodedPcmSha256,
      'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_PCM_HASH_INVALID',
    ),
  };
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_KIND_V1,
    binding,
    toolchain,
    decodePolicy: DECODE_POLICY,
    resourcePolicy,
    frameScan: {
      decodedFrameCount: String(frames.length),
      decodedSampleFrameCount: decodedSampleFrames.toString(),
      frameEvidenceSha256: hashEditronCanonicalJsonV1(frames),
    },
    epochs,
    pcm,
  };
  return assertMediaSourceAudioSampleEpochMapV1({
    ...material,
    audioSampleEpochMapSha256: hashEditronCanonicalJsonV1(material),
  });
}

export function serializeMediaSourceAudioSampleEpochMapV1(
  value: MediaSourceAudioSampleEpochMapV1,
): MediaSourceAudioSampleEpochMapSerializationV1 {
  const map = assertMediaSourceAudioSampleEpochMapV1(value);
  const canonicalJson = canonicalizeEditronJsonV1(map);
  const byteLength = Buffer.byteLength(canonicalJson, 'utf8');
  if (byteLength > map.resourcePolicy.maxCanonicalJsonBytes) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_BYTE_LIMIT_EXCEEDED');
  }
  return frozen({
    map,
    canonicalJson,
    byteLength,
    contentSha256: hashEditronCanonicalJsonV1(map),
  });
}

export function parseMediaSourceAudioSampleEpochMapV1(
  canonicalJson: string,
): MediaSourceAudioSampleEpochMapV1 {
  if (typeof canonicalJson !== 'string'
    || Buffer.byteLength(canonicalJson, 'utf8')
      > MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_ABSOLUTE_MAX_BYTES_V1) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_INPUT_TOO_LARGE');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(canonicalJson);
  } catch {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_JSON_INVALID');
  }
  const map = assertMediaSourceAudioSampleEpochMapV1(parsed);
  if (canonicalizeEditronJsonV1(map) !== canonicalJson) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_JSON_NON_CANONICAL');
  }
  if (Buffer.byteLength(canonicalJson, 'utf8') > map.resourcePolicy.maxCanonicalJsonBytes) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_BYTE_LIMIT_EXCEEDED');
  }
  return map;
}

export function assertMediaSourceAudioStreamBindingV1(
  value: unknown,
): MediaSourceAudioStreamBindingV1 {
  const record = objectRecord(value, 'MEDIA_SOURCE_AUDIO_BINDING_INVALID');
  exactKeys(record, [
    'assetId', 'audioStreamBindingSha256', 'audioStreamIndex', 'channelCount',
    'channelLayout', 'codec', 'kind', 'mediaKind', 'observedSourceDurationTicks',
    'observedSourceStartPts', 'sampleRate', 'schemaVersion', 'sourceBindingSha256',
    'sourceTimebase', 'sourceVersionSha256', 'storageVersionSha256', 'streamId',
    'technicalObservationSha256',
  ], 'MEDIA_SOURCE_AUDIO_BINDING_FIELDS_INVALID');
  if (record.schemaVersion !== 1 || record.kind !== MEDIA_SOURCE_AUDIO_STREAM_BINDING_KIND_V1
    || (record.mediaKind !== 'video' && record.mediaKind !== 'audio')) {
    throw new Error('MEDIA_SOURCE_AUDIO_BINDING_INVALID');
  }
  const audioStreamIndex = nonNegativeSafeInteger(
    record.audioStreamIndex,
    'MEDIA_SOURCE_AUDIO_BINDING_STREAM_INDEX_INVALID',
  );
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_AUDIO_STREAM_BINDING_KIND_V1,
    assetId: identifier(record.assetId, 'MEDIA_SOURCE_AUDIO_BINDING_ASSET_ID_INVALID'),
    mediaKind: record.mediaKind as 'video' | 'audio',
    sourceVersionSha256: sha256(record.sourceVersionSha256, 'MEDIA_SOURCE_AUDIO_BINDING_SOURCE_INVALID'),
    storageVersionSha256: sha256(record.storageVersionSha256, 'MEDIA_SOURCE_AUDIO_BINDING_STORAGE_INVALID'),
    sourceBindingSha256: sha256(record.sourceBindingSha256, 'MEDIA_SOURCE_AUDIO_BINDING_SCOPE_INVALID'),
    technicalObservationSha256: sha256(
      record.technicalObservationSha256,
      'MEDIA_SOURCE_AUDIO_BINDING_OBSERVATION_INVALID',
    ),
    streamId: expectedAudioStreamIdV1(audioStreamIndex),
    audioStreamIndex,
    codec: nullableBoundedText(record.codec, 'MEDIA_SOURCE_AUDIO_BINDING_CODEC_INVALID'),
    sampleRate: positiveIntegerText(record.sampleRate, 'MEDIA_SOURCE_AUDIO_BINDING_SAMPLE_RATE_INVALID'),
    channelCount: positiveSafeInteger(record.channelCount, 'MEDIA_SOURCE_AUDIO_BINDING_CHANNEL_COUNT_INVALID'),
    channelLayout: boundedText(record.channelLayout, 'MEDIA_SOURCE_AUDIO_BINDING_CHANNEL_LAYOUT_INVALID'),
    sourceTimebase: parseExactRationalRateV1(record.sourceTimebase),
    observedSourceStartPts: nullableSignedIntegerText(
      record.observedSourceStartPts,
      'MEDIA_SOURCE_AUDIO_BINDING_START_PTS_INVALID',
    ),
    observedSourceDurationTicks: nullableNonNegativeIntegerText(
      record.observedSourceDurationTicks,
      'MEDIA_SOURCE_AUDIO_BINDING_DURATION_INVALID',
    ),
  };
  if (record.streamId !== material.streamId
    || record.audioStreamBindingSha256 !== hashEditronCanonicalJsonV1(material)) {
    throw new Error('MEDIA_SOURCE_AUDIO_BINDING_HASH_OR_STREAM_MISMATCH');
  }
  return frozen({
    ...material,
    audioStreamBindingSha256: record.audioStreamBindingSha256 as string,
  });
}

export function assertMediaSourceAudioSampleEpochMapV1(
  value: unknown,
): MediaSourceAudioSampleEpochMapV1 {
  const record = objectRecord(value, 'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_INVALID');
  exactKeys(record, [
    'audioSampleEpochMapSha256', 'binding', 'decodePolicy', 'epochs', 'frameScan',
    'kind', 'pcm', 'resourcePolicy', 'schemaVersion', 'toolchain',
  ], 'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_FIELDS_INVALID');
  if (record.schemaVersion !== 1 || record.kind !== MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_KIND_V1) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_INVALID');
  }
  const binding = assertMediaSourceAudioStreamBindingV1(record.binding);
  const toolchain = normalizeToolchain(record.toolchain);
  const decodePolicy = normalizeDecodePolicy(record.decodePolicy);
  const resourcePolicy = assertMediaSourceAudioSampleEpochResourcePolicyV1(
    record.resourcePolicy,
  );
  const frameScan = normalizeFrameScan(record.frameScan, resourcePolicy);
  if (!Array.isArray(record.epochs) || record.epochs.length === 0
    || record.epochs.length > resourcePolicy.maxEpochEntries
    || record.epochs.length > BigInt(frameScan.decodedFrameCount)) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_EPOCH_COUNT_INVALID');
  }
  const epochs = record.epochs.map((epoch, index) => normalizeEpoch(
    epoch,
    binding.audioStreamIndex,
    index,
  ));
  assertEpochCoverage(epochs, frameScan);
  const pcm = normalizePcm(record.pcm, binding, resourcePolicy);
  if (pcm.decodedSampleFrameCount !== frameScan.decodedSampleFrameCount) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_PCM_SCAN_MISMATCH');
  }
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_KIND_V1,
    binding,
    toolchain,
    decodePolicy,
    resourcePolicy,
    frameScan,
    epochs,
    pcm,
  };
  if (record.audioSampleEpochMapSha256 !== hashEditronCanonicalJsonV1(material)) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_HASH_MISMATCH');
  }
  return frozen({
    ...material,
    audioSampleEpochMapSha256: record.audioSampleEpochMapSha256 as string,
  });
}

export function expectedAudioStreamIdV1(audioStreamIndex: number): string {
  return `audio-${nonNegativeSafeInteger(
    audioStreamIndex,
    'MEDIA_SOURCE_AUDIO_BINDING_STREAM_INDEX_INVALID',
  )}`;
}

function normalizeAudioStream(
  value: MediaSourceAudioStreamObservationV1,
): Readonly<{
  codec: string | null;
  sampleRate: string;
  channelCount: number;
  channelLayout: string;
  sourceTimebase: ExactRationalRateV1;
  sourceStartPts: string | null;
  sourceDurationTicks: string | null;
}> {
  if (value.sourceTimebase === null || value.sampleRate === null
    || value.channelCount === null || value.channelLayout === null) {
    throw new Error('MEDIA_SOURCE_AUDIO_BINDING_STREAM_TECHNICAL_EVIDENCE_INCOMPLETE');
  }
  return {
    codec: nullableBoundedText(value.codec, 'MEDIA_SOURCE_AUDIO_BINDING_CODEC_INVALID'),
    sampleRate: positiveIntegerText(value.sampleRate, 'MEDIA_SOURCE_AUDIO_BINDING_SAMPLE_RATE_INVALID'),
    channelCount: positiveSafeInteger(value.channelCount, 'MEDIA_SOURCE_AUDIO_BINDING_CHANNEL_COUNT_INVALID'),
    channelLayout: boundedText(value.channelLayout, 'MEDIA_SOURCE_AUDIO_BINDING_CHANNEL_LAYOUT_INVALID'),
    sourceTimebase: parseExactRationalRateV1(value.sourceTimebase),
    sourceStartPts: nullableSignedIntegerText(value.sourceStartPts ?? null, 'MEDIA_SOURCE_AUDIO_BINDING_START_PTS_INVALID'),
    sourceDurationTicks: nullableNonNegativeIntegerText(
      value.sourceDurationTicks ?? null,
      'MEDIA_SOURCE_AUDIO_BINDING_DURATION_INVALID',
    ),
  };
}

function normalizeDecodedFrame(value: unknown): MediaSourceAudioDecodedFrameEvidenceV1 {
  const record = objectRecord(value, 'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FRAME_INVALID');
  exactKeys(record, [
    'decodedSampleFrameCount', 'presentationTimestampTicks',
  ], 'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FRAME_FIELDS_INVALID');
  return {
    presentationTimestampTicks: signedIntegerText(
      record.presentationTimestampTicks,
      'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FRAME_PTS_INVALID',
    ),
    decodedSampleFrameCount: positiveIntegerText(
      record.decodedSampleFrameCount,
      'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FRAME_SAMPLES_INVALID',
    ),
  };
}

function normalizeToolchain(value: unknown): MediaSourceAudioSampleEpochToolchainV1 {
  const record = objectRecord(value, 'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_TOOLCHAIN_INVALID');
  exactKeys(record, [
    'adapterVersion', 'ffmpegVersion', 'ffprobeVersion',
  ], 'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_TOOLCHAIN_FIELDS_INVALID');
  if (record.adapterVersion !== MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_ADAPTER_VERSION_V1) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_ADAPTER_VERSION_INVALID');
  }
  return {
    adapterVersion: MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_ADAPTER_VERSION_V1,
    ffmpegVersion: boundedText(record.ffmpegVersion, 'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FFMPEG_VERSION_INVALID'),
    ffprobeVersion: boundedText(record.ffprobeVersion, 'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FFPROBE_VERSION_INVALID'),
  };
}

function normalizeDecodePolicy(value: unknown): typeof DECODE_POLICY {
  const record = objectRecord(value, 'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_DECODE_POLICY_INVALID');
  exactKeys(record, [
    'channelRemix', 'editLists', 'gaps', 'overlaps', 'primingAndPadding',
    'resampling', 'timestampOrigin', 'timingModel',
  ], 'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_DECODE_POLICY_FIELDS_INVALID');
  if (canonicalizeEditronJsonV1(record) !== canonicalizeEditronJsonV1(DECODE_POLICY)) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_DECODE_POLICY_INVALID');
  }
  return DECODE_POLICY;
}

export function assertMediaSourceAudioSampleEpochResourcePolicyV1(
  value: unknown,
): MediaSourceAudioSampleEpochResourcePolicyV1 {
  const record = objectRecord(value, 'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_POLICY_INVALID');
  exactKeys(record, [
    'maxCanonicalJsonBytes', 'maxDecodedFrameEntries', 'maxDecodedPcmBytes',
    'maxDecodedSampleFrames', 'maxEpochEntries', 'maxSourceBytes', 'policyVersion',
    'timeoutMs',
  ], 'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_POLICY_FIELDS_INVALID');
  return {
    policyVersion: boundedText(record.policyVersion, 'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_POLICY_VERSION_INVALID'),
    maxSourceBytes: positiveSafeInteger(record.maxSourceBytes, 'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_POLICY_SOURCE_BYTES_INVALID'),
    maxCanonicalJsonBytes: positiveSafeIntegerInRange(
      record.maxCanonicalJsonBytes,
      MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_ABSOLUTE_MAX_BYTES_V1,
      'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_POLICY_CANONICAL_BYTES_INVALID',
    ),
    maxDecodedFrameEntries: positiveSafeIntegerInRange(
      record.maxDecodedFrameEntries,
      MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_ABSOLUTE_MAX_DECODED_FRAMES_V1,
      'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_POLICY_FRAME_COUNT_INVALID',
    ),
    maxEpochEntries: positiveSafeIntegerInRange(
      record.maxEpochEntries,
      MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_ABSOLUTE_MAX_EPOCHS_V1,
      'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_POLICY_EPOCH_COUNT_INVALID',
    ),
    maxDecodedSampleFrames: positiveSafeInteger(
      record.maxDecodedSampleFrames,
      'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_POLICY_SAMPLE_COUNT_INVALID',
    ),
    maxDecodedPcmBytes: positiveSafeInteger(
      record.maxDecodedPcmBytes,
      'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_POLICY_PCM_BYTES_INVALID',
    ),
    timeoutMs: positiveSafeIntegerInRange(
      record.timeoutMs,
      MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_MAP_ABSOLUTE_MAX_TIMEOUT_MS_V1,
      'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_POLICY_TIMEOUT_INVALID',
    ),
  };
}

function normalizeFrameScan(
  value: unknown,
  policy: MediaSourceAudioSampleEpochResourcePolicyV1,
): MediaSourceAudioSampleEpochMapV1['frameScan'] {
  const record = objectRecord(value, 'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FRAME_SCAN_INVALID');
  exactKeys(record, [
    'decodedFrameCount', 'decodedSampleFrameCount', 'frameEvidenceSha256',
  ], 'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FRAME_SCAN_FIELDS_INVALID');
  const decodedFrameCount = positiveIntegerText(
    record.decodedFrameCount,
    'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FRAME_SCAN_COUNT_INVALID',
  );
  const decodedSampleFrameCount = positiveIntegerText(
    record.decodedSampleFrameCount,
    'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FRAME_SCAN_SAMPLES_INVALID',
  );
  if (BigInt(decodedFrameCount) > BigInt(policy.maxDecodedFrameEntries)
    || BigInt(decodedSampleFrameCount) > BigInt(policy.maxDecodedSampleFrames)) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FRAME_SCAN_LIMIT_EXCEEDED');
  }
  return {
    decodedFrameCount,
    decodedSampleFrameCount,
    frameEvidenceSha256: sha256(
      record.frameEvidenceSha256,
      'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FRAME_SCAN_HASH_INVALID',
    ),
  };
}

function normalizeEpoch(
  value: unknown,
  streamIndex: number,
  index: number,
): MediaSourceAudioSampleEpochV1 {
  const record = objectRecord(value, 'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_INVALID');
  exactKeys(record, [
    'boundaryKind', 'decodedEndExclusiveSampleFrame', 'decodedStartSampleFrame',
    'endExclusiveDecodedFrameOrdinal', 'epochId', 'firstDecodedFrameOrdinal',
    'precedingDisplacementSampleFrames', 'sourceEndExclusiveSamplePosition',
    'sourceLastFramePresentationTimestampTicks', 'sourceStartPresentationTimestampTicks',
    'sourceStartSamplePosition',
  ], 'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FIELDS_INVALID');
  if (record.epochId !== expectedEpochId(streamIndex, index)) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_ID_INVALID');
  }
  return {
    epochId: record.epochId,
    boundaryKind: boundaryKind(record.boundaryKind),
    precedingDisplacementSampleFrames: normalizeRational(record.precedingDisplacementSampleFrames),
    firstDecodedFrameOrdinal: nonNegativeIntegerText(
      record.firstDecodedFrameOrdinal,
      'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FRAME_START_INVALID',
    ),
    endExclusiveDecodedFrameOrdinal: positiveIntegerText(
      record.endExclusiveDecodedFrameOrdinal,
      'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_FRAME_END_INVALID',
    ),
    decodedStartSampleFrame: nonNegativeIntegerText(
      record.decodedStartSampleFrame,
      'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_SAMPLE_START_INVALID',
    ),
    decodedEndExclusiveSampleFrame: positiveIntegerText(
      record.decodedEndExclusiveSampleFrame,
      'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_SAMPLE_END_INVALID',
    ),
    sourceStartPresentationTimestampTicks: signedIntegerText(
      record.sourceStartPresentationTimestampTicks,
      'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_SOURCE_PTS_INVALID',
    ),
    sourceLastFramePresentationTimestampTicks: signedIntegerText(
      record.sourceLastFramePresentationTimestampTicks,
      'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_SOURCE_LAST_PTS_INVALID',
    ),
    sourceStartSamplePosition: normalizeRational(record.sourceStartSamplePosition),
    sourceEndExclusiveSamplePosition: normalizeRational(record.sourceEndExclusiveSamplePosition),
  };
}

function assertEpochCoverage(
  epochs: readonly MediaSourceAudioSampleEpochV1[],
  frameScan: MediaSourceAudioSampleEpochMapV1['frameScan'],
): void {
  let expectedFrame = BigInt(0);
  let expectedDecodedSample = BigInt(0);
  let previous: MediaSourceAudioSampleEpochV1 | null = null;
  epochs.forEach((epoch, index) => {
    const firstFrame = BigInt(epoch.firstDecodedFrameOrdinal);
    const endFrame = BigInt(epoch.endExclusiveDecodedFrameOrdinal);
    const decodedStart = BigInt(epoch.decodedStartSampleFrame);
    const decodedEnd = BigInt(epoch.decodedEndExclusiveSampleFrame);
    if (firstFrame !== expectedFrame || endFrame <= firstFrame
      || decodedStart !== expectedDecodedSample || decodedEnd <= decodedStart
      || compareRational(epoch.sourceEndExclusiveSamplePosition, epoch.sourceStartSamplePosition) <= 0) {
      throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_COVERAGE_INVALID');
    }
    if (index === 0) {
      if (epoch.boundaryKind !== 'INITIAL'
        || compareRational(epoch.precedingDisplacementSampleFrames, rational(BigInt(0), BigInt(1))) !== 0) {
        throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_INITIAL_BOUNDARY_INVALID');
      }
    } else {
      if (!previous || epoch.boundaryKind === 'INITIAL') {
        throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_BOUNDARY_INVALID');
      }
      const displacement = subtractRational(
        epoch.sourceStartSamplePosition,
        previous.sourceEndExclusiveSamplePosition,
      );
      if (compareRational(displacement, epoch.precedingDisplacementSampleFrames) !== 0
        || compareRational(displacement, rational(BigInt(0), BigInt(1))) === 0) {
        throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_DISPLACEMENT_INVALID');
      }
      const reset = BigInt(epoch.sourceStartPresentationTimestampTicks)
        < BigInt(previous.sourceLastFramePresentationTimestampTicks);
      const expectedBoundary = reset
        ? 'TIMESTAMP_RESET'
        : compareRational(displacement, rational(BigInt(0), BigInt(1))) > 0
          ? 'GAP'
          : 'OVERLAP';
      if (epoch.boundaryKind !== expectedBoundary) {
        throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_BOUNDARY_CLASSIFICATION_INVALID');
      }
    }
    expectedFrame = endFrame;
    expectedDecodedSample = decodedEnd;
    previous = epoch;
  });
  if (expectedFrame !== BigInt(frameScan.decodedFrameCount)
    || expectedDecodedSample !== BigInt(frameScan.decodedSampleFrameCount)) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_SCAN_COVERAGE_INVALID');
  }
}

function normalizePcm(
  value: unknown,
  binding: MediaSourceAudioStreamBindingV1,
  policy: MediaSourceAudioSampleEpochResourcePolicyV1,
): MediaSourceAudioDecodedPcmReceiptV1 {
  const record = objectRecord(value, 'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_PCM_INVALID');
  exactKeys(record, [
    'channelCount', 'codec', 'decodedByteLength', 'decodedPcmSha256',
    'decodedSampleFrameCount', 'interleaving', 'sampleFormat', 'sampleRate',
  ], 'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_PCM_FIELDS_INVALID');
  if (record.codec !== 'PCM_S32LE'
    || record.sampleFormat !== 'SIGNED_32_BIT_LITTLE_ENDIAN'
    || record.interleaving !== 'INTERLEAVED'
    || record.sampleRate !== binding.sampleRate
    || record.channelCount !== binding.channelCount) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_PCM_FORMAT_INVALID');
  }
  const decodedSampleFrameCount = positiveIntegerText(
    record.decodedSampleFrameCount,
    'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_PCM_SAMPLE_COUNT_INVALID',
  );
  const decodedByteLength = positiveSafeIntegerInRange(
    record.decodedByteLength,
    policy.maxDecodedPcmBytes,
    'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_PCM_BYTES_INVALID',
  );
  if (BigInt(decodedByteLength)
    !== BigInt(decodedSampleFrameCount) * BigInt(binding.channelCount) * BigInt(4)) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_PCM_BYTE_COUNT_MISMATCH');
  }
  return {
    codec: 'PCM_S32LE',
    sampleFormat: 'SIGNED_32_BIT_LITTLE_ENDIAN',
    interleaving: 'INTERLEAVED',
    sampleRate: binding.sampleRate,
    channelCount: binding.channelCount,
    decodedSampleFrameCount,
    decodedByteLength,
    decodedPcmSha256: sha256(record.decodedPcmSha256, 'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_PCM_HASH_INVALID'),
  };
}

function samplePositionFromPts(
  pts: bigint,
  timebase: ExactRationalRateV1,
  sampleRate: bigint,
): ExactSignedRationalV1 {
  return rational(
    pts * BigInt(timebase.numerator) * sampleRate,
    BigInt(timebase.denominator),
  );
}

function addIntegerToRational(
  value: ExactSignedRationalV1,
  integer: bigint,
): ExactSignedRationalV1 {
  return rational(
    BigInt(value.numerator) + integer * BigInt(value.denominator),
    BigInt(value.denominator),
  );
}

function subtractRational(
  left: ExactSignedRationalV1,
  right: ExactSignedRationalV1,
): ExactSignedRationalV1 {
  return rational(
    BigInt(left.numerator) * BigInt(right.denominator)
      - BigInt(right.numerator) * BigInt(left.denominator),
    BigInt(left.denominator) * BigInt(right.denominator),
  );
}

function compareRational(left: ExactSignedRationalV1, right: ExactSignedRationalV1): -1 | 0 | 1 {
  const leftCross = BigInt(left.numerator) * BigInt(right.denominator);
  const rightCross = BigInt(right.numerator) * BigInt(left.denominator);
  return leftCross < rightCross ? -1 : leftCross > rightCross ? 1 : 0;
}

function normalizeRational(value: unknown): ExactSignedRationalV1 {
  const record = objectRecord(value, 'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_RATIONAL_INVALID');
  exactKeys(record, ['denominator', 'numerator'], 'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_RATIONAL_FIELDS_INVALID');
  const normalized = rational(
    BigInt(signedIntegerText(record.numerator, 'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_RATIONAL_NUMERATOR_INVALID')),
    BigInt(positiveIntegerText(record.denominator, 'MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_RATIONAL_DENOMINATOR_INVALID')),
  );
  if (record.numerator !== normalized.numerator || record.denominator !== normalized.denominator) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_RATIONAL_NOT_REDUCED');
  }
  return normalized;
}

function rational(numerator: bigint, denominator: bigint): ExactSignedRationalV1 {
  if (denominator <= BigInt(0)) {
    throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_RATIONAL_DENOMINATOR_INVALID');
  }
  if (numerator === BigInt(0)) return { numerator: '0', denominator: '1' };
  const divisor = greatestCommonDivisor(numerator, denominator);
  return {
    numerator: (numerator / divisor).toString(),
    denominator: (denominator / divisor).toString(),
  };
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < BigInt(0) ? -left : left;
  let b = right;
  while (b !== BigInt(0)) [a, b] = [b, a % b];
  return a;
}

function boundaryKind(value: unknown): MediaSourceAudioSampleEpochBoundaryKindV1 {
  if (value === 'INITIAL' || value === 'TIMESTAMP_RESET'
    || value === 'GAP' || value === 'OVERLAP') return value;
  throw new Error('MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_BOUNDARY_INVALID');
}

function expectedEpochId(streamIndex: number, index: number): string {
  return `${expectedAudioStreamIdV1(streamIndex)}-epoch-${String(index).padStart(6, '0')}`;
}

function objectRecord(value: unknown, code: string): Record<string, unknown> {
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

function identifier(value: unknown, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(normalized)) throw new Error(code);
  return normalized;
}

function boundedText(value: unknown, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function nullableBoundedText(value: unknown, code: string): string | null {
  return value === null ? null : boundedText(value, code);
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(code);
  return value;
}

function nonNegativeSafeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(code);
  return Number(value);
}

function positiveSafeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error(code);
  return Number(value);
}

function positiveSafeIntegerInRange(value: unknown, maximum: number, code: string): number {
  const normalized = positiveSafeInteger(value, code);
  if (normalized > maximum) throw new Error(code);
  return normalized;
}

function signedIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^-?(0|[1-9]\d{0,127})$/.test(value.trim())) {
    throw new Error(code);
  }
  return BigInt(value.trim()).toString();
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

function nullableSignedIntegerText(value: unknown, code: string): string | null {
  return value === null ? null : signedIntegerText(value, code);
}

function nullableNonNegativeIntegerText(value: unknown, code: string): string | null {
  return value === null ? null : nonNegativeIntegerText(value, code);
}

function frozen<T extends object>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(value);
}
