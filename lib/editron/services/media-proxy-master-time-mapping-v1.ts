import {
  compareCanonicalMediaTimeV1,
  parseCanonicalMediaTimeV1,
  parseSourcePositionV1,
  type CanonicalMediaTimeV1,
  type SourcePositionV1,
} from '../contracts/canonical-media-time-v1';

import {
  cloneCanonicalEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import {
  assertMediaProxyMasterRelationV1,
  type MediaProxyMasterRelationV1,
  type MediaSourceVersionReferenceV1,
} from './media-source-version-v1';

export const MEDIA_PROXY_MASTER_TIME_MAPPING_KIND_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_TIME_MAPPING_V1' as const;
export const MEDIA_PROXY_MASTER_TIME_MAPPING_OWNER_V1 =
  'EDITRON_SERVER_PROXY_MASTER_MAPPING_VERIFIER_V1' as const;
export const MEDIA_PROXY_MASTER_TIME_MAPPING_POLICY_V1 =
  'PRESERVE_REAL_TIME_VERIFIED_EPOCH_ANCHORS_V1' as const;
export const MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_KIND_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_V1' as const;

const MAX_SEGMENTS = 10_000;
const MAX_AUDIO_STREAMS = 64;
const MAX_INDEX_BYTES = 8 * 1024 * 1024;
const MAX_INDEX_BATCHES = 100_000;
const PRIVATE_INDEX_PREFIX = 'private/editron/media-proxy-master-correspondence/';

export type MediaProxyMasterTimeMapReferenceV1 = Readonly<{
  sourceVersionSha256: string;
  storageVersionSha256: string;
  sourceBindingSha256: string;
  technicalObservationSha256: string;
  sourcePtsCadenceMapStateSha256V3: string;
  mapBindingSha256: string;
  terminalReceiptSha256: string;
  verificationSha256: string;
  epochIndexContentSha256: string;
  streamId: string;
  videoStreamIndex: number;
  totalFrameCount: string;
}>;

export type MediaProxyMasterCorrespondenceIndexReferenceV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_KIND_V1;
  storage: 'R2_PRIVATE';
  objectKey: string;
  byteLength: number;
  contentSha256: string;
  batchCount: number;
  mappedProxyFrameCount: string;
  mappedMasterFrameCount: string;
}>;

export type MediaProxyMasterTimeMappingSegmentV1 = Readonly<{
  sequence: number;
  canonicalStartTime: CanonicalMediaTimeV1;
  canonicalEndExclusiveTime: CanonicalMediaTimeV1;
  proxyStart: SourcePositionV1;
  proxyEndExclusive: SourcePositionV1;
  proxyFirstFrameOrdinal: string;
  proxyEndExclusiveFrameOrdinal: string;
  masterStart: SourcePositionV1;
  masterEndExclusive: SourcePositionV1;
  masterFirstFrameOrdinal: string;
  masterEndExclusiveFrameOrdinal: string;
}>;

export type MediaProxyMasterAudioMappingV1 = Readonly<
  | { disposition: 'NO_AUDIO_IN_EITHER_SOURCE' }
  | {
      disposition: 'VERIFIED_SAMPLE_TIMELINE_LINEAGE';
      streams: readonly Readonly<{
        sequence: number;
        proxyStreamId: string;
        masterStreamId: string;
        proxyAudioEpochMapSha256: string;
        masterAudioEpochMapSha256: string;
        proxyChannelLayoutSha256: string;
        masterChannelLayoutSha256: string;
        canonicalTimelineEquivalenceSha256: string;
        lineageEvidenceSha256: string;
      }>[];
    }
>;

export type MediaProxyMasterTimeMappingV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_TIME_MAPPING_KIND_V1;
  writerAuthority: typeof MEDIA_PROXY_MASTER_TIME_MAPPING_OWNER_V1;
  disposition: 'QUALIFIED';
  policy: typeof MEDIA_PROXY_MASTER_TIME_MAPPING_POLICY_V1;
  relationSha256: string;
  proxy: MediaSourceVersionReferenceV1;
  master: MediaSourceVersionReferenceV1;
  verificationBasis: 'TRUSTED_SERVER_TRANSCODE_LINEAGE_V1';
  verifier: Readonly<{
    verifierId: string;
    verifierVersion: string;
    verificationPolicyVersion: string;
    workerImageDigest: string;
    executionReceiptSha256: string;
  }>;
  lineage: Readonly<{
    kind: 'TRUSTED_SERVER_TRANSCODE_LINEAGE_V1';
    transcodeJobId: string;
    transcodePolicyVersion: string;
    ffmpegVersion: string;
    commandSha256: string;
    masterDecodeReceiptSha256: string;
    proxyEncodeReceiptSha256: string;
    lineageReceiptSha256: string;
  }>;
  proxyTimeMap: MediaProxyMasterTimeMapReferenceV1;
  masterTimeMap: MediaProxyMasterTimeMapReferenceV1;
  frameCorrespondenceIndex: MediaProxyMasterCorrespondenceIndexReferenceV1;
  segments: readonly MediaProxyMasterTimeMappingSegmentV1[];
  canonicalEndExclusiveTime: CanonicalMediaTimeV1;
  audio: MediaProxyMasterAudioMappingV1;
  verifiedAt: string;
  mappingSha256: string;
}>;

type LineageInputV1 = Omit<MediaProxyMasterTimeMappingV1['lineage'], 'lineageReceiptSha256'>;

export type CreateMediaProxyMasterTimeMappingInputV1 = Readonly<{
  relation: MediaProxyMasterRelationV1;
  verificationBasis: MediaProxyMasterTimeMappingV1['verificationBasis'];
  verifier: MediaProxyMasterTimeMappingV1['verifier'];
  lineage: LineageInputV1;
  proxyTimeMap: MediaProxyMasterTimeMapReferenceV1;
  masterTimeMap: MediaProxyMasterTimeMapReferenceV1;
  frameCorrespondenceIndex: MediaProxyMasterCorrespondenceIndexReferenceV1;
  segments: readonly MediaProxyMasterTimeMappingSegmentV1[];
  audio: MediaProxyMasterAudioMappingV1;
  verifiedAt: string;
}>;

/**
 * Pure qualification boundary only. The future server verifier must read and
 * prove every referenced artifact before calling this normalizer.
 */
export function createMediaProxyMasterTimeMappingV1(
  input: CreateMediaProxyMasterTimeMappingInputV1,
): MediaProxyMasterTimeMappingV1 {
  const relation = assertMediaProxyMasterRelationV1(input.relation);
  if (relation.mediaKind !== 'video') fail('MEDIA_PROXY_MASTER_MAPPING_VIDEO_REQUIRED');
  if (input.verificationBasis !== 'TRUSTED_SERVER_TRANSCODE_LINEAGE_V1') {
    fail('MEDIA_PROXY_MASTER_MAPPING_VERIFICATION_BASIS_INVALID');
  }
  const verifier = normalizeVerifier(input.verifier);
  const lineageMaterial = normalizeLineage(input.lineage);
  const lineage = {
    ...lineageMaterial,
    lineageReceiptSha256: hashEditronCanonicalJsonV1(lineageMaterial),
  };
  const proxyTimeMap = normalizeTimeMap(input.proxyTimeMap, 'PROXY');
  const masterTimeMap = normalizeTimeMap(input.masterTimeMap, 'MASTER');
  assertTimeMapScope(proxyTimeMap, relation.proxy, 'PROXY');
  assertTimeMapScope(masterTimeMap, relation.master, 'MASTER');
  const frameCorrespondenceIndex = normalizeCorrespondenceIndex(
    input.frameCorrespondenceIndex,
  );
  const segments = normalizeSegments(input.segments, proxyTimeMap, masterTimeMap);
  if (frameCorrespondenceIndex.mappedProxyFrameCount !== proxyTimeMap.totalFrameCount
    || frameCorrespondenceIndex.mappedMasterFrameCount !== masterTimeMap.totalFrameCount) {
    fail('MEDIA_PROXY_MASTER_MAPPING_CORRESPONDENCE_COVERAGE_MISMATCH');
  }
  const audio = normalizeAudio(input.audio);
  const verifiedAt = isoInstant(input.verifiedAt, 'MEDIA_PROXY_MASTER_MAPPING_VERIFIED_AT_INVALID');
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_TIME_MAPPING_KIND_V1,
    writerAuthority: MEDIA_PROXY_MASTER_TIME_MAPPING_OWNER_V1,
    disposition: 'QUALIFIED' as const,
    policy: MEDIA_PROXY_MASTER_TIME_MAPPING_POLICY_V1,
    relationSha256: relation.relationSha256,
    proxy: relation.proxy,
    master: relation.master,
    verificationBasis: input.verificationBasis,
    verifier,
    lineage,
    proxyTimeMap,
    masterTimeMap,
    frameCorrespondenceIndex,
    segments,
    canonicalEndExclusiveTime: segments[segments.length - 1]!.canonicalEndExclusiveTime,
    audio,
    verifiedAt,
  };
  return frozen({ ...material, mappingSha256: hashEditronCanonicalJsonV1(material) });
}

export function assertMediaProxyMasterTimeMappingV1(
  value: unknown,
  relation: MediaProxyMasterRelationV1,
): MediaProxyMasterTimeMappingV1 {
  const candidate = object(value, 'MEDIA_PROXY_MASTER_MAPPING_INVALID');
  exactKeys(candidate, [
    'schemaVersion', 'kind', 'writerAuthority', 'disposition', 'policy',
    'relationSha256', 'proxy', 'master', 'verificationBasis', 'verifier',
    'lineage', 'proxyTimeMap', 'masterTimeMap', 'frameCorrespondenceIndex',
    'segments', 'canonicalEndExclusiveTime', 'audio', 'verifiedAt', 'mappingSha256',
  ], 'MEDIA_PROXY_MASTER_MAPPING_FIELDS_INVALID');
  if (candidate.schemaVersion !== 1
    || candidate.kind !== MEDIA_PROXY_MASTER_TIME_MAPPING_KIND_V1
    || candidate.writerAuthority !== MEDIA_PROXY_MASTER_TIME_MAPPING_OWNER_V1
    || candidate.disposition !== 'QUALIFIED'
    || candidate.policy !== MEDIA_PROXY_MASTER_TIME_MAPPING_POLICY_V1) {
    fail('MEDIA_PROXY_MASTER_MAPPING_HEADER_INVALID');
  }
  const lineage = object(candidate.lineage, 'MEDIA_PROXY_MASTER_MAPPING_LINEAGE_INVALID');
  exactKeys(lineage, [
    'kind', 'transcodeJobId', 'transcodePolicyVersion', 'ffmpegVersion',
    'commandSha256', 'masterDecodeReceiptSha256', 'proxyEncodeReceiptSha256',
    'lineageReceiptSha256',
  ], 'MEDIA_PROXY_MASTER_MAPPING_LINEAGE_FIELDS_INVALID');
  const rebuilt = createMediaProxyMasterTimeMappingV1({
    relation,
    verificationBasis: candidate.verificationBasis as MediaProxyMasterTimeMappingV1['verificationBasis'],
    verifier: candidate.verifier as MediaProxyMasterTimeMappingV1['verifier'],
    lineage: {
      kind: lineage.kind as LineageInputV1['kind'],
      transcodeJobId: lineage.transcodeJobId as string,
      transcodePolicyVersion: lineage.transcodePolicyVersion as string,
      ffmpegVersion: lineage.ffmpegVersion as string,
      commandSha256: lineage.commandSha256 as string,
      masterDecodeReceiptSha256: lineage.masterDecodeReceiptSha256 as string,
      proxyEncodeReceiptSha256: lineage.proxyEncodeReceiptSha256 as string,
    },
    proxyTimeMap: candidate.proxyTimeMap as MediaProxyMasterTimeMapReferenceV1,
    masterTimeMap: candidate.masterTimeMap as MediaProxyMasterTimeMapReferenceV1,
    frameCorrespondenceIndex:
      candidate.frameCorrespondenceIndex as MediaProxyMasterCorrespondenceIndexReferenceV1,
    segments: candidate.segments as readonly MediaProxyMasterTimeMappingSegmentV1[],
    audio: candidate.audio as MediaProxyMasterAudioMappingV1,
    verifiedAt: candidate.verifiedAt as string,
  });
  const { mappingSha256: _persistedMappingSha256, ...persistedMaterial } = candidate;
  const mappingSha256 = sha256(
    candidate.mappingSha256,
    'MEDIA_PROXY_MASTER_MAPPING_HASH_INVALID',
  );
  if (sha256(candidate.relationSha256, 'MEDIA_PROXY_MASTER_MAPPING_RELATION_HASH_INVALID')
      !== rebuilt.relationSha256
    || sha256(lineage.lineageReceiptSha256, 'MEDIA_PROXY_MASTER_MAPPING_LINEAGE_HASH_INVALID')
      !== rebuilt.lineage.lineageReceiptSha256
    || compareCanonicalMediaTimeV1(
      parseCanonicalMediaTimeV1(candidate.canonicalEndExclusiveTime),
      rebuilt.canonicalEndExclusiveTime,
    ) !== 0
    || mappingSha256 !== hashEditronCanonicalJsonV1(persistedMaterial)
    || mappingSha256 !== rebuilt.mappingSha256) {
    fail('MEDIA_PROXY_MASTER_MAPPING_HASH_OR_RELATION_MISMATCH');
  }
  return rebuilt;
}

function normalizeSegments(
  value: readonly MediaProxyMasterTimeMappingSegmentV1[],
  proxyTimeMap: MediaProxyMasterTimeMapReferenceV1,
  masterTimeMap: MediaProxyMasterTimeMapReferenceV1,
): readonly MediaProxyMasterTimeMappingSegmentV1[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SEGMENTS) {
    fail('MEDIA_PROXY_MASTER_MAPPING_SEGMENTS_INVALID');
  }
  const segments = value.map((entry, sequence) => normalizeSegment(entry, sequence));
  let canonicalCursor = parseCanonicalMediaTimeV1({ ticks: '0', timescale: '1' });
  let proxyOrdinalCursor = BigInt(0);
  let masterOrdinalCursor = BigInt(0);
  for (const segment of segments) {
    if (compareCanonicalMediaTimeV1(segment.canonicalStartTime, canonicalCursor) !== 0
      || BigInt(segment.proxyFirstFrameOrdinal) !== proxyOrdinalCursor
      || BigInt(segment.masterFirstFrameOrdinal) !== masterOrdinalCursor) {
      fail('MEDIA_PROXY_MASTER_MAPPING_SEGMENT_COVERAGE_GAP');
    }
    validateSourceSpan(segment, 'PROXY', proxyTimeMap);
    validateSourceSpan(segment, 'MASTER', masterTimeMap);
    canonicalCursor = segment.canonicalEndExclusiveTime;
    proxyOrdinalCursor = BigInt(segment.proxyEndExclusiveFrameOrdinal);
    masterOrdinalCursor = BigInt(segment.masterEndExclusiveFrameOrdinal);
  }
  if (proxyOrdinalCursor !== BigInt(proxyTimeMap.totalFrameCount)
    || masterOrdinalCursor !== BigInt(masterTimeMap.totalFrameCount)) {
    fail('MEDIA_PROXY_MASTER_MAPPING_FULL_SOURCE_COVERAGE_MISMATCH');
  }
  return frozen(segments);
}

function normalizeSegment(value: unknown, expectedSequence: number): MediaProxyMasterTimeMappingSegmentV1 {
  const candidate = object(value, 'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_INVALID');
  exactKeys(candidate, [
    'sequence', 'canonicalStartTime', 'canonicalEndExclusiveTime',
    'proxyStart', 'proxyEndExclusive', 'proxyFirstFrameOrdinal',
    'proxyEndExclusiveFrameOrdinal', 'masterStart', 'masterEndExclusive',
    'masterFirstFrameOrdinal', 'masterEndExclusiveFrameOrdinal',
  ], 'MEDIA_PROXY_MASTER_MAPPING_SEGMENT_FIELDS_INVALID');
  const sequence = safeInteger(candidate.sequence, 'MEDIA_PROXY_MASTER_MAPPING_SEQUENCE_INVALID');
  if (sequence !== expectedSequence) fail('MEDIA_PROXY_MASTER_MAPPING_SEQUENCE_INVALID');
  const canonicalStartTime = parseCanonicalMediaTimeV1(candidate.canonicalStartTime);
  const canonicalEndExclusiveTime = parseCanonicalMediaTimeV1(candidate.canonicalEndExclusiveTime);
  if (compareCanonicalMediaTimeV1(canonicalStartTime, canonicalEndExclusiveTime) >= 0) {
    fail('MEDIA_PROXY_MASTER_MAPPING_CANONICAL_RANGE_INVALID');
  }
  return frozen({
    sequence,
    canonicalStartTime,
    canonicalEndExclusiveTime,
    proxyStart: parseSourcePositionV1(candidate.proxyStart),
    proxyEndExclusive: parseSourcePositionV1(candidate.proxyEndExclusive),
    proxyFirstFrameOrdinal: nonNegativeIntegerText(candidate.proxyFirstFrameOrdinal, 'MEDIA_PROXY_MASTER_MAPPING_PROXY_ORDINAL_INVALID'),
    proxyEndExclusiveFrameOrdinal: positiveIntegerText(candidate.proxyEndExclusiveFrameOrdinal, 'MEDIA_PROXY_MASTER_MAPPING_PROXY_ORDINAL_INVALID'),
    masterStart: parseSourcePositionV1(candidate.masterStart),
    masterEndExclusive: parseSourcePositionV1(candidate.masterEndExclusive),
    masterFirstFrameOrdinal: nonNegativeIntegerText(candidate.masterFirstFrameOrdinal, 'MEDIA_PROXY_MASTER_MAPPING_MASTER_ORDINAL_INVALID'),
    masterEndExclusiveFrameOrdinal: positiveIntegerText(candidate.masterEndExclusiveFrameOrdinal, 'MEDIA_PROXY_MASTER_MAPPING_MASTER_ORDINAL_INVALID'),
  });
}

function validateSourceSpan(
  segment: MediaProxyMasterTimeMappingSegmentV1,
  side: 'PROXY' | 'MASTER',
  timeMap: MediaProxyMasterTimeMapReferenceV1,
): void {
  const start = side === 'PROXY' ? segment.proxyStart : segment.masterStart;
  const end = side === 'PROXY' ? segment.proxyEndExclusive : segment.masterEndExclusive;
  const firstOrdinal = BigInt(side === 'PROXY'
    ? segment.proxyFirstFrameOrdinal : segment.masterFirstFrameOrdinal);
  const endOrdinal = BigInt(side === 'PROXY'
    ? segment.proxyEndExclusiveFrameOrdinal : segment.masterEndExclusiveFrameOrdinal);
  if (start.sourceVersionSha256 !== timeMap.sourceVersionSha256
    || end.sourceVersionSha256 !== timeMap.sourceVersionSha256
    || start.streamId !== timeMap.streamId || end.streamId !== timeMap.streamId
    || start.epochId !== end.epochId
    || start.secondsPerSourceTick.numerator !== end.secondsPerSourceTick.numerator
    || start.secondsPerSourceTick.denominator !== end.secondsPerSourceTick.denominator
    || BigInt(start.presentationTimestampTicks) >= BigInt(end.presentationTimestampTicks)
    || firstOrdinal >= endOrdinal) {
    fail(`MEDIA_PROXY_MASTER_MAPPING_${side}_SPAN_INVALID`);
  }
  const sourceNumerator = (BigInt(end.presentationTimestampTicks)
    - BigInt(start.presentationTimestampTicks))
    * BigInt(start.secondsPerSourceTick.numerator);
  const sourceDenominator = BigInt(start.secondsPerSourceTick.denominator);
  const canonicalNumerator = BigInt(segment.canonicalEndExclusiveTime.ticks)
      * BigInt(segment.canonicalStartTime.timescale)
    - BigInt(segment.canonicalStartTime.ticks)
      * BigInt(segment.canonicalEndExclusiveTime.timescale);
  const canonicalDenominator = BigInt(segment.canonicalStartTime.timescale)
    * BigInt(segment.canonicalEndExclusiveTime.timescale);
  if (sourceNumerator * canonicalDenominator
    !== canonicalNumerator * sourceDenominator) {
    fail(`MEDIA_PROXY_MASTER_MAPPING_${side}_DURATION_MISMATCH`);
  }
}

function normalizeTimeMap(value: unknown, side: 'PROXY' | 'MASTER'): MediaProxyMasterTimeMapReferenceV1 {
  const candidate = object(value, `MEDIA_PROXY_MASTER_MAPPING_${side}_TIME_MAP_INVALID`);
  exactKeys(candidate, [
    'sourceVersionSha256', 'storageVersionSha256', 'sourceBindingSha256',
    'technicalObservationSha256', 'sourcePtsCadenceMapStateSha256V3',
    'mapBindingSha256', 'terminalReceiptSha256', 'verificationSha256',
    'epochIndexContentSha256', 'streamId', 'videoStreamIndex', 'totalFrameCount',
  ], `MEDIA_PROXY_MASTER_MAPPING_${side}_TIME_MAP_FIELDS_INVALID`);
  const videoStreamIndex = safeInteger(candidate.videoStreamIndex, `MEDIA_PROXY_MASTER_MAPPING_${side}_STREAM_INDEX_INVALID`);
  const streamId = identifier(candidate.streamId, `MEDIA_PROXY_MASTER_MAPPING_${side}_STREAM_INVALID`);
  if (streamId !== `video-${String(videoStreamIndex)}`) {
    fail(`MEDIA_PROXY_MASTER_MAPPING_${side}_STREAM_MISMATCH`);
  }
  return frozen({
    sourceVersionSha256: sha256(candidate.sourceVersionSha256, `MEDIA_PROXY_MASTER_MAPPING_${side}_SOURCE_INVALID`),
    storageVersionSha256: sha256(candidate.storageVersionSha256, `MEDIA_PROXY_MASTER_MAPPING_${side}_STORAGE_INVALID`),
    sourceBindingSha256: sha256(candidate.sourceBindingSha256, `MEDIA_PROXY_MASTER_MAPPING_${side}_SOURCE_BINDING_INVALID`),
    technicalObservationSha256: sha256(candidate.technicalObservationSha256, `MEDIA_PROXY_MASTER_MAPPING_${side}_OBSERVATION_INVALID`),
    sourcePtsCadenceMapStateSha256V3: sha256(candidate.sourcePtsCadenceMapStateSha256V3, `MEDIA_PROXY_MASTER_MAPPING_${side}_STATE_INVALID`),
    mapBindingSha256: sha256(candidate.mapBindingSha256, `MEDIA_PROXY_MASTER_MAPPING_${side}_BINDING_INVALID`),
    terminalReceiptSha256: sha256(candidate.terminalReceiptSha256, `MEDIA_PROXY_MASTER_MAPPING_${side}_TERMINAL_RECEIPT_INVALID`),
    verificationSha256: sha256(candidate.verificationSha256, `MEDIA_PROXY_MASTER_MAPPING_${side}_VERIFICATION_INVALID`),
    epochIndexContentSha256: sha256(candidate.epochIndexContentSha256, `MEDIA_PROXY_MASTER_MAPPING_${side}_INDEX_INVALID`),
    streamId,
    videoStreamIndex,
    totalFrameCount: positiveIntegerText(candidate.totalFrameCount, `MEDIA_PROXY_MASTER_MAPPING_${side}_FRAME_COUNT_INVALID`),
  });
}

function assertTimeMapScope(
  timeMap: MediaProxyMasterTimeMapReferenceV1,
  source: MediaSourceVersionReferenceV1,
  side: 'PROXY' | 'MASTER',
): void {
  if (timeMap.sourceVersionSha256 !== source.sourceVersionSha256
    || timeMap.storageVersionSha256 !== source.storageVersionSha256) {
    fail(`MEDIA_PROXY_MASTER_MAPPING_${side}_SOURCE_SCOPE_MISMATCH`);
  }
}

function normalizeCorrespondenceIndex(value: unknown): MediaProxyMasterCorrespondenceIndexReferenceV1 {
  const candidate = object(value, 'MEDIA_PROXY_MASTER_MAPPING_CORRESPONDENCE_INDEX_INVALID');
  exactKeys(candidate, [
    'schemaVersion', 'kind', 'storage', 'objectKey', 'byteLength', 'contentSha256',
    'batchCount', 'mappedProxyFrameCount', 'mappedMasterFrameCount',
  ], 'MEDIA_PROXY_MASTER_MAPPING_CORRESPONDENCE_INDEX_FIELDS_INVALID');
  const objectKey = identifier(candidate.objectKey, 'MEDIA_PROXY_MASTER_MAPPING_CORRESPONDENCE_KEY_INVALID', 1024);
  const byteLength = positiveSafeInteger(candidate.byteLength, 'MEDIA_PROXY_MASTER_MAPPING_CORRESPONDENCE_SIZE_INVALID');
  const batchCount = positiveSafeInteger(candidate.batchCount, 'MEDIA_PROXY_MASTER_MAPPING_CORRESPONDENCE_BATCH_COUNT_INVALID');
  if (candidate.schemaVersion !== 1
    || candidate.kind !== MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_KIND_V1
    || candidate.storage !== 'R2_PRIVATE'
    || !objectKey.startsWith(PRIVATE_INDEX_PREFIX)
    || byteLength > MAX_INDEX_BYTES || batchCount > MAX_INDEX_BATCHES) {
    fail('MEDIA_PROXY_MASTER_MAPPING_CORRESPONDENCE_INDEX_INVALID');
  }
  return frozen({
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_CORRESPONDENCE_INDEX_KIND_V1,
    storage: 'R2_PRIVATE' as const,
    objectKey,
    byteLength,
    contentSha256: sha256(candidate.contentSha256, 'MEDIA_PROXY_MASTER_MAPPING_CORRESPONDENCE_HASH_INVALID'),
    batchCount,
    mappedProxyFrameCount: positiveIntegerText(candidate.mappedProxyFrameCount, 'MEDIA_PROXY_MASTER_MAPPING_CORRESPONDENCE_PROXY_COUNT_INVALID'),
    mappedMasterFrameCount: positiveIntegerText(candidate.mappedMasterFrameCount, 'MEDIA_PROXY_MASTER_MAPPING_CORRESPONDENCE_MASTER_COUNT_INVALID'),
  });
}

function normalizeVerifier(value: unknown): MediaProxyMasterTimeMappingV1['verifier'] {
  const candidate = object(value, 'MEDIA_PROXY_MASTER_MAPPING_VERIFIER_INVALID');
  exactKeys(candidate, [
    'verifierId', 'verifierVersion', 'verificationPolicyVersion',
    'workerImageDigest', 'executionReceiptSha256',
  ], 'MEDIA_PROXY_MASTER_MAPPING_VERIFIER_FIELDS_INVALID');
  return frozen({
    verifierId: identifier(candidate.verifierId, 'MEDIA_PROXY_MASTER_MAPPING_VERIFIER_ID_INVALID'),
    verifierVersion: identifier(candidate.verifierVersion, 'MEDIA_PROXY_MASTER_MAPPING_VERIFIER_VERSION_INVALID'),
    verificationPolicyVersion: identifier(candidate.verificationPolicyVersion, 'MEDIA_PROXY_MASTER_MAPPING_VERIFIER_POLICY_INVALID'),
    workerImageDigest: sha256(candidate.workerImageDigest, 'MEDIA_PROXY_MASTER_MAPPING_WORKER_DIGEST_INVALID'),
    executionReceiptSha256: sha256(candidate.executionReceiptSha256, 'MEDIA_PROXY_MASTER_MAPPING_EXECUTION_RECEIPT_INVALID'),
  });
}

function normalizeLineage(value: unknown): LineageInputV1 {
  const candidate = object(value, 'MEDIA_PROXY_MASTER_MAPPING_LINEAGE_INVALID');
  exactKeys(candidate, [
    'kind', 'transcodeJobId', 'transcodePolicyVersion', 'ffmpegVersion',
    'commandSha256', 'masterDecodeReceiptSha256', 'proxyEncodeReceiptSha256',
  ], 'MEDIA_PROXY_MASTER_MAPPING_LINEAGE_FIELDS_INVALID');
  if (candidate.kind !== 'TRUSTED_SERVER_TRANSCODE_LINEAGE_V1') {
    fail('MEDIA_PROXY_MASTER_MAPPING_LINEAGE_KIND_INVALID');
  }
  return frozen({
    kind: candidate.kind,
    transcodeJobId: identifier(candidate.transcodeJobId, 'MEDIA_PROXY_MASTER_MAPPING_TRANSCODE_JOB_INVALID'),
    transcodePolicyVersion: identifier(candidate.transcodePolicyVersion, 'MEDIA_PROXY_MASTER_MAPPING_TRANSCODE_POLICY_INVALID'),
    ffmpegVersion: identifier(candidate.ffmpegVersion, 'MEDIA_PROXY_MASTER_MAPPING_FFMPEG_VERSION_INVALID'),
    commandSha256: sha256(candidate.commandSha256, 'MEDIA_PROXY_MASTER_MAPPING_COMMAND_INVALID'),
    masterDecodeReceiptSha256: sha256(candidate.masterDecodeReceiptSha256, 'MEDIA_PROXY_MASTER_MAPPING_MASTER_DECODE_INVALID'),
    proxyEncodeReceiptSha256: sha256(candidate.proxyEncodeReceiptSha256, 'MEDIA_PROXY_MASTER_MAPPING_PROXY_ENCODE_INVALID'),
  });
}

function normalizeAudio(value: unknown): MediaProxyMasterAudioMappingV1 {
  const candidate = object(value, 'MEDIA_PROXY_MASTER_MAPPING_AUDIO_INVALID');
  if (candidate.disposition === 'NO_AUDIO_IN_EITHER_SOURCE') {
    exactKeys(candidate, ['disposition'], 'MEDIA_PROXY_MASTER_MAPPING_AUDIO_FIELDS_INVALID');
    return frozen({ disposition: 'NO_AUDIO_IN_EITHER_SOURCE' as const });
  }
  exactKeys(candidate, ['disposition', 'streams'], 'MEDIA_PROXY_MASTER_MAPPING_AUDIO_FIELDS_INVALID');
  if (candidate.disposition !== 'VERIFIED_SAMPLE_TIMELINE_LINEAGE'
    || !Array.isArray(candidate.streams) || candidate.streams.length === 0
    || candidate.streams.length > MAX_AUDIO_STREAMS) {
    fail('MEDIA_PROXY_MASTER_MAPPING_AUDIO_INVALID');
  }
  const proxyIds = new Set<string>();
  const masterIds = new Set<string>();
  const streams = candidate.streams.map((value, sequence) => {
    const stream = object(value, 'MEDIA_PROXY_MASTER_MAPPING_AUDIO_STREAM_INVALID');
    exactKeys(stream, [
      'sequence', 'proxyStreamId', 'masterStreamId', 'proxyAudioEpochMapSha256',
      'masterAudioEpochMapSha256', 'proxyChannelLayoutSha256',
      'masterChannelLayoutSha256', 'canonicalTimelineEquivalenceSha256',
      'lineageEvidenceSha256',
    ], 'MEDIA_PROXY_MASTER_MAPPING_AUDIO_STREAM_FIELDS_INVALID');
    if (safeInteger(stream.sequence, 'MEDIA_PROXY_MASTER_MAPPING_AUDIO_SEQUENCE_INVALID') !== sequence) {
      fail('MEDIA_PROXY_MASTER_MAPPING_AUDIO_SEQUENCE_INVALID');
    }
    const proxyStreamId = identifier(stream.proxyStreamId, 'MEDIA_PROXY_MASTER_MAPPING_AUDIO_PROXY_STREAM_INVALID');
    const masterStreamId = identifier(stream.masterStreamId, 'MEDIA_PROXY_MASTER_MAPPING_AUDIO_MASTER_STREAM_INVALID');
    const proxyChannelLayoutSha256 = sha256(stream.proxyChannelLayoutSha256, 'MEDIA_PROXY_MASTER_MAPPING_AUDIO_PROXY_LAYOUT_INVALID');
    const masterChannelLayoutSha256 = sha256(stream.masterChannelLayoutSha256, 'MEDIA_PROXY_MASTER_MAPPING_AUDIO_MASTER_LAYOUT_INVALID');
    if (proxyIds.has(proxyStreamId) || masterIds.has(masterStreamId)
      || proxyChannelLayoutSha256 !== masterChannelLayoutSha256) {
      fail('MEDIA_PROXY_MASTER_MAPPING_AUDIO_SCOPE_OR_LAYOUT_MISMATCH');
    }
    proxyIds.add(proxyStreamId);
    masterIds.add(masterStreamId);
    return {
      sequence,
      proxyStreamId,
      masterStreamId,
      proxyAudioEpochMapSha256: sha256(stream.proxyAudioEpochMapSha256, 'MEDIA_PROXY_MASTER_MAPPING_AUDIO_PROXY_EPOCH_MAP_INVALID'),
      masterAudioEpochMapSha256: sha256(stream.masterAudioEpochMapSha256, 'MEDIA_PROXY_MASTER_MAPPING_AUDIO_MASTER_EPOCH_MAP_INVALID'),
      proxyChannelLayoutSha256,
      masterChannelLayoutSha256,
      canonicalTimelineEquivalenceSha256: sha256(stream.canonicalTimelineEquivalenceSha256, 'MEDIA_PROXY_MASTER_MAPPING_AUDIO_TIMELINE_INVALID'),
      lineageEvidenceSha256: sha256(stream.lineageEvidenceSha256, 'MEDIA_PROXY_MASTER_MAPPING_AUDIO_LINEAGE_INVALID'),
    };
  });
  return frozen({ disposition: 'VERIFIED_SAMPLE_TIMELINE_LINEAGE' as const, streams });
}

function object(value: unknown, error: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) fail(error);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], error: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(error);
}

function identifier(value: unknown, error: string, max = 256): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0 || value.length > max) fail(error);
  return value;
}

function sha256(value: unknown, error: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(error);
  return value;
}

function safeInteger(value: unknown, error: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(error);
  return value as number;
}

function positiveSafeInteger(value: unknown, error: string): number {
  const parsed = safeInteger(value, error);
  if (parsed === 0) fail(error);
  return parsed;
}

function nonNegativeIntegerText(value: unknown, error: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,127})$/.test(value)) fail(error);
  return value;
}

function positiveIntegerText(value: unknown, error: string): string {
  const parsed = nonNegativeIntegerText(value, error);
  if (parsed === '0') fail(error);
  return parsed;
}

function isoInstant(value: unknown, error: string): string {
  if (typeof value !== 'string' || value.length > 128
    || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) fail(error);
  return value;
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(cloneCanonicalEditronJsonV1(value));
}

function fail(message: string): never {
  throw new Error(message);
}
