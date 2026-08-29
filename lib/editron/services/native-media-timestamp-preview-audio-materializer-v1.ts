import { createHash } from 'node:crypto';

import {
  assertNativeMediaTimestampPreviewAudioWindowV1,
  NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_WINDOW_KIND_V1,
  type NativeMediaTimestampPreviewAudioSamplePositionV1,
  type NativeMediaTimestampPreviewAudioWindowSegmentV1,
  type NativeMediaTimestampPreviewAudioWindowV1,
} from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-audio-window-v1';
import type { NativeMediaTimestampPreviewWindowLeaseV2 } from '@/components/editron/editor/version-7.0.0/remotion/native-media-timestamp-preview-window-v2';

import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import type { MediaSourceAudioPrivateArtifactStoreV1 } from './media-source-audio-r2-private-artifact-v1';
import {
  assertMediaSourceAudioPrivateObjectReferenceV1,
  type MediaSourceAudioPrivateObjectReferenceV1,
} from './media-source-audio-private-artifact-v1';
import type {
  NativeMediaTimestampPreviewAudioSurfaceStorePortV1,
} from './native-media-timestamp-r2-preview-audio-surface-v1';
import type {
  NativeMediaTimestampPreviewSurfaceLeaseScopeV1,
} from './native-media-timestamp-r2-preview-surface-v1';
import type { VideoSourceTimestampConformV3 } from './video-source-time-transform-v1';

export const NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_MATERIALIZER_POLICY_VERSION_V1 =
  'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_MATERIALIZER_V1' as const;

export type NativeMediaTimestampPreviewAudioMaterializerPolicyV1 = Readonly<{
  policyVersion: typeof NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_MATERIALIZER_POLICY_VERSION_V1;
  maxWindowFrames: number;
  maxMappingSegments: number;
  maxWindowSegments: number;
  maxReadOperations: number;
  maxTotalPcmBytes: number;
}>;

export const NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_MATERIALIZER_DEFAULT_POLICY_V1:
NativeMediaTimestampPreviewAudioMaterializerPolicyV1 = Object.freeze({
  policyVersion: NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_MATERIALIZER_POLICY_VERSION_V1,
  maxWindowFrames: 1_024,
  maxMappingSegments: 200_001,
  maxWindowSegments: 256,
  maxReadOperations: 256,
  maxTotalPcmBytes: 16 * 1024 * 1024,
});

type AudioMappingV3 = NonNullable<VideoSourceTimestampConformV3['audioMapping']>;

export type NativeMediaTimestampPreviewAudioMaterializerResultV1 = Readonly<
  | {
      disposition: 'AUDIO_WINDOW_MATERIALIZED';
      window: NativeMediaTimestampPreviewAudioWindowV1;
    }
  | {
      disposition: 'UNVERIFIABLE';
      reason:
        | 'INPUT_INVALID'
        | 'RESOURCE_LIMIT_EXCEEDED'
        | 'PCM_READ_FAILED'
        | 'PCM_SCOPE_MISMATCH'
        | 'SURFACE_WRITE_FAILED'
        | 'CLEANUP_FAILED'
        | 'OUTPUT_INVALID';
      diagnostic: string | null;
    }
>;

export async function materializeNativeMediaTimestampPreviewAudioWindowV1(
  input: Readonly<{
    leaseScope: NativeMediaTimestampPreviewSurfaceLeaseScopeV1;
    lease: NativeMediaTimestampPreviewWindowLeaseV2;
    mapping: AudioMappingV3;
    projectRate: VideoSourceTimestampConformV3['projectRate'];
    overlayFromFrame: number;
    windowLocalStartFrame: number;
    windowDurationInFrames: number;
    expectedAssetId: string;
    manifestSha256: string;
    manifestReference: MediaSourceAudioPrivateObjectReferenceV1;
  }>,
  ports: Readonly<{
    pcmReader: Pick<MediaSourceAudioPrivateArtifactStoreV1, 'readPcmSampleRange'>;
    surfaceStore: NativeMediaTimestampPreviewAudioSurfaceStorePortV1;
  }>,
  policyInput: NativeMediaTimestampPreviewAudioMaterializerPolicyV1 =
    NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_MATERIALIZER_DEFAULT_POLICY_V1,
): Promise<NativeMediaTimestampPreviewAudioMaterializerResultV1> {
  let normalized: ReturnType<typeof normalizeInput>;
  try {
    const policy = normalizePolicy(policyInput);
    assertPorts(ports);
    normalized = normalizeInput(input, policy);
  } catch (error) {
    return unverifiable('INPUT_INVALID', diagnostic(error));
  }

  const writtenHandles: string[] = [];
  const outputSegments: NativeMediaTimestampPreviewAudioWindowSegmentV1[] = [];
  let readOperations = 0;
  let totalPcmBytes = 0;
  for (const segment of normalized.mapping.segments) {
    const start = maximum(normalized.windowStart, segment.timelineStart);
    const end = minimum(normalized.windowEnd, segment.timelineEnd);
    if (compare(start, end) >= 0) continue;
    if (outputSegments.length >= normalized.policy.maxWindowSegments) {
      return cleanupThen(
        writtenHandles,
        ports.surfaceStore,
        'RESOURCE_LIMIT_EXCEEDED',
        'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_SEGMENT_LIMIT_EXCEEDED',
      );
    }
    const timelineStartSamplePosition = position(start);
    const timelineEndExclusiveSamplePosition = position(end);
    if (segment.kind === 'SILENCE') {
      outputSegments.push({
        kind: 'SILENCE',
        reason: segment.reason,
        precedingAudioEpochId: segment.precedingAudioEpochId,
        nextAudioEpochId: segment.nextAudioEpochId,
        timelineStartSamplePosition,
        timelineEndExclusiveSamplePosition,
      });
      continue;
    }
    if (readOperations >= normalized.policy.maxReadOperations) {
      return cleanupThen(
        writtenHandles,
        ports.surfaceStore,
        'RESOURCE_LIMIT_EXCEEDED',
        'NATIVE_MEDIA_PREVIEW_AUDIO_READ_LIMIT_EXCEEDED',
      );
    }
    const decodedStart = add(
      segment.decodedStart,
      subtract(start, segment.timelineStart),
    );
    const decodedEnd = add(decodedStart, subtract(end, start));
    const sourceStartSampleFrame = floorFraction(decodedStart).toString();
    const sourceEndExclusiveSampleFrame = ceilFraction(decodedEnd).toString();
    let range: Awaited<ReturnType<typeof ports.pcmReader.readPcmSampleRange>>;
    try {
      readOperations += 1;
      range = await ports.pcmReader.readPcmSampleRange({
        manifestReference: normalized.manifestReference,
        startSampleFrame: sourceStartSampleFrame,
        endExclusiveSampleFrame: sourceEndExclusiveSampleFrame,
      });
    } catch (error) {
      return cleanupThen(
        writtenHandles,
        ports.surfaceStore,
        'PCM_READ_FAILED',
        diagnostic(error),
      );
    }
    if (!sameRangeEvidence(range, {
      manifestSha256: normalized.manifestSha256,
      mapping: normalized.mapping,
      sourceStartSampleFrame,
      sourceEndExclusiveSampleFrame,
    })) {
      return cleanupThen(
        writtenHandles,
        ports.surfaceStore,
        'PCM_SCOPE_MISMATCH',
        'NATIVE_MEDIA_PREVIEW_AUDIO_PCM_RANGE_SCOPE_MISMATCH',
      );
    }
    totalPcmBytes += range.pcmBytes.byteLength;
    if (!Number.isSafeInteger(totalPcmBytes)
      || totalPcmBytes > normalized.policy.maxTotalPcmBytes) {
      return cleanupThen(
        writtenHandles,
        ports.surfaceStore,
        'RESOURCE_LIMIT_EXCEEDED',
        'NATIVE_MEDIA_PREVIEW_AUDIO_PCM_BYTE_LIMIT_EXCEEDED',
      );
    }
    let stored: Awaited<ReturnType<typeof ports.surfaceStore.putAudioSegment>>;
    try {
      stored = await ports.surfaceStore.putAudioSegment({
        audioMappingSha256: normalized.mapping.audioMappingSha256,
        audioSampleEpochMapSha256: normalized.mapping.audioSampleEpochMapSha256,
        sourceVersionSha256: normalized.mapping.sourceVersionSha256,
        storageVersionSha256: normalized.mapping.storageVersionSha256,
        decodedPcmSha256: normalized.mapping.decodedPcmSha256,
        sampleRate: normalized.mapping.sampleRate,
        channelCount: normalized.mapping.channelCount,
        sourceStartSampleFrame,
        sourceEndExclusiveSampleFrame,
        decodedStartSamplePosition: position(decodedStart),
        decodedEndExclusiveSamplePosition: position(decodedEnd),
        timelineStartSamplePosition,
        timelineEndExclusiveSamplePosition,
        pcmBytes: range.pcmBytes,
      });
      writtenHandles.push(stored.audioHandle);
    } catch (error) {
      return cleanupThen(
        writtenHandles,
        ports.surfaceStore,
        'SURFACE_WRITE_FAILED',
        diagnostic(error),
      );
    }
    if (stored.expiresAtEpochMs !== normalized.lease.expiresAtEpochMs) {
      return cleanupThen(
        writtenHandles,
        ports.surfaceStore,
        'SURFACE_WRITE_FAILED',
        'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_LEASE_MISMATCH',
      );
    }
    outputSegments.push({
      kind: 'PCM',
      audioEpochId: segment.audioEpochId,
      audioHandle: stored.audioHandle,
      segmentIdentitySha256: stored.segmentIdentitySha256,
      sourceStartSampleFrame,
      sourceEndExclusiveSampleFrame,
      decodedStartSamplePosition: position(decodedStart),
      decodedEndExclusiveSamplePosition: position(decodedEnd),
      timelineStartSamplePosition,
      timelineEndExclusiveSamplePosition,
    });
  }
  if (outputSegments.length < 1) {
    return cleanupThen(
      writtenHandles,
      ports.surfaceStore,
      'OUTPUT_INVALID',
      'NATIVE_MEDIA_PREVIEW_AUDIO_WINDOW_EMPTY',
    );
  }
  const material = {
    schemaVersion: 1 as const,
    kind: NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_WINDOW_KIND_V1,
    projectId: normalized.leaseScope.projectId,
    sequenceId: normalized.leaseScope.sequenceId,
    overlayId: normalized.leaseScope.overlayId,
    projectRevision: normalized.leaseScope.projectRevision,
    audioMappingSha256: normalized.mapping.audioMappingSha256,
    audioSampleEpochMapSha256: normalized.mapping.audioSampleEpochMapSha256,
    decodedPcmSha256: normalized.mapping.decodedPcmSha256,
    sampleRate: normalized.mapping.sampleRate,
    channelCount: normalized.mapping.channelCount,
    windowLocalStartFrame: normalized.windowLocalStartFrame,
    windowDurationInFrames: normalized.windowDurationInFrames,
    windowProjectStartFrame: normalized.windowProjectStartFrame,
    windowProjectEndExclusiveFrame: normalized.windowProjectEndExclusiveFrame,
    canonicalWindowStartSamplePosition: position(normalized.windowStart),
    canonicalWindowEndExclusiveSamplePosition: position(normalized.windowEnd),
    lease: normalized.lease,
    segments: outputSegments,
  };
  try {
    const window = assertNativeMediaTimestampPreviewAudioWindowV1({
      ...material,
      windowSha256: hashEditronCanonicalJsonV1(material),
    });
    return Object.freeze({
      disposition: 'AUDIO_WINDOW_MATERIALIZED' as const,
      window,
    });
  } catch (error) {
    return cleanupThen(
      writtenHandles,
      ports.surfaceStore,
      'OUTPUT_INVALID',
      diagnostic(error),
    );
  }
}

type NormalizedMappingV1 = Readonly<{
  audioMappingSha256: string;
  audioSampleEpochMapSha256: string;
  sourceVersionSha256: string;
  storageVersionSha256: string;
  decodedPcmSha256: string;
  decodedSampleFrameCount: bigint;
  streamId: string;
  sampleRate: number;
  channelCount: number;
  timelineStartFrame: bigint;
  endExclusiveTimelineFrame: bigint;
  canonicalStart: FractionV1;
  canonicalEnd: FractionV1;
  segments: readonly NormalizedSegmentV1[];
}>;

type NormalizedSegmentV1 = Readonly<
  | {
      kind: 'PCM';
      audioEpochId: string;
      timelineStart: FractionV1;
      timelineEnd: FractionV1;
      decodedStart: FractionV1;
      decodedEnd: FractionV1;
    }
  | {
      kind: 'SILENCE';
      reason: 'LEADING_STREAM_OFFSET' | 'DECLARED_SOURCE_GAP';
      precedingAudioEpochId: string | null;
      nextAudioEpochId: string;
      timelineStart: FractionV1;
      timelineEnd: FractionV1;
    }
>;

function normalizeInput(
  input: Parameters<typeof materializeNativeMediaTimestampPreviewAudioWindowV1>[0],
  policy: NativeMediaTimestampPreviewAudioMaterializerPolicyV1,
) {
  if (!input || !input.leaseScope || !input.lease || !input.manifestReference) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_INPUT_INVALID');
  }
  const overlayFromFrame = nonNegativeSafeInteger(
    input.overlayFromFrame,
    'NATIVE_MEDIA_PREVIEW_AUDIO_FRAME_RANGE_INVALID',
  );
  const windowLocalStartFrame = nonNegativeSafeInteger(
    input.windowLocalStartFrame,
    'NATIVE_MEDIA_PREVIEW_AUDIO_FRAME_RANGE_INVALID',
  );
  const windowDurationInFrames = positiveSafeIntegerInRange(
    input.windowDurationInFrames,
    policy.maxWindowFrames,
    'NATIVE_MEDIA_PREVIEW_AUDIO_FRAME_RANGE_INVALID',
  );
  const windowProjectStart = BigInt(overlayFromFrame) + BigInt(windowLocalStartFrame);
  const windowProjectEnd = windowProjectStart + BigInt(windowDurationInFrames);
  if (windowProjectEnd > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_FRAME_RANGE_INVALID');
  }
  const projectRate = normalizeRate(input.projectRate);
  const expectedAssetId = identifier(
    input.expectedAssetId,
    'NATIVE_MEDIA_PREVIEW_AUDIO_ASSET_INVALID',
  );
  const mapping = normalizeMapping(input.mapping, projectRate, policy, expectedAssetId);
  if (mapping.timelineStartFrame !== BigInt(overlayFromFrame)
    || windowProjectStart < mapping.timelineStartFrame
    || windowProjectEnd > mapping.endExclusiveTimelineFrame) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_MAPPING_WINDOW_SCOPE_MISMATCH');
  }
  const sampleRate = BigInt(mapping.sampleRate);
  const windowStart = add(mapping.canonicalStart, fraction(
    (windowProjectStart - mapping.timelineStartFrame)
      * projectRate.denominator * sampleRate,
    projectRate.numerator,
  ));
  const windowEnd = add(mapping.canonicalStart, fraction(
    (windowProjectEnd - mapping.timelineStartFrame)
      * projectRate.denominator * sampleRate,
    projectRate.numerator,
  ));
  const leaseScope = normalizeLeaseScope(input.leaseScope);
  const lease = normalizeLease(input.lease);
  const manifestReference = assertMediaSourceAudioPrivateObjectReferenceV1(
    input.manifestReference,
  );
  if (manifestReference.artifactKind !== 'MANIFEST') {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_MANIFEST_REFERENCE_INVALID');
  }
  return Object.freeze({
    policy,
    mapping,
    leaseScope,
    lease,
    manifestSha256: sha256(
      input.manifestSha256,
      'NATIVE_MEDIA_PREVIEW_AUDIO_MANIFEST_INVALID',
    ),
    manifestReference,
    windowLocalStartFrame,
    windowDurationInFrames,
    windowProjectStartFrame: Number(windowProjectStart),
    windowProjectEndExclusiveFrame: Number(windowProjectEnd),
    windowStart,
    windowEnd,
  });
}

function normalizeMapping(
  mapping: AudioMappingV3,
  projectRate: FractionV1,
  policy: NativeMediaTimestampPreviewAudioMaterializerPolicyV1,
  expectedAssetId: string,
): NormalizedMappingV1 {
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_MAPPING_INVALID');
  }
  const record = mapping as unknown as Record<string, unknown>;
  exactKeys(record, [
    'assetId', 'audioMappingSha256', 'audioSampleEpochMapSha256',
    'audioStreamBindingSha256', 'audioStreamIndex',
    'canonicalTimelineEndExclusiveSamplePosition',
    'canonicalTimelineStartSamplePosition', 'channelCount', 'decodedPcmSha256',
    'decodedSampleFrameCount', 'endExclusiveTimelineFrame', 'kind', 'policy',
    'sampleRate', 'schemaVersion', 'segments', 'sourceBindingSha256',
    'sourceVersionSha256', 'storageVersionSha256', 'streamId',
    'technicalObservationSha256', 'timelineStartFrame',
  ], 'NATIVE_MEDIA_PREVIEW_AUDIO_MAPPING_FIELDS_INVALID');
  if (record.schemaVersion !== 3
    || record.kind !== 'EDITRON_VERIFIED_AUDIO_SAMPLE_TIME_MAPPING_V3'
    || !Array.isArray(record.segments)
    || record.segments.length < 1
    || record.segments.length > policy.maxMappingSegments) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_MAPPING_INVALID');
  }
  const audioMappingSha256 = sha256(
    record.audioMappingSha256,
    'NATIVE_MEDIA_PREVIEW_AUDIO_MAPPING_HASH_INVALID',
  );
  const material = Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== 'audioMappingSha256'),
  );
  if (hashEditronCanonicalJsonV1(material) !== audioMappingSha256) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_MAPPING_HASH_INVALID');
  }
  if (identifier(record.assetId, 'NATIVE_MEDIA_PREVIEW_AUDIO_ASSET_INVALID')
      !== expectedAssetId) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_ASSET_SCOPE_MISMATCH');
  }
  sha256(
    record.sourceBindingSha256,
    'NATIVE_MEDIA_PREVIEW_AUDIO_SOURCE_BINDING_INVALID',
  );
  sha256(
    record.technicalObservationSha256,
    'NATIVE_MEDIA_PREVIEW_AUDIO_OBSERVATION_INVALID',
  );
  sha256(
    record.audioStreamBindingSha256,
    'NATIVE_MEDIA_PREVIEW_AUDIO_STREAM_BINDING_INVALID',
  );
  const sampleRateText = positiveIntegerText(
    record.sampleRate,
    'NATIVE_MEDIA_PREVIEW_AUDIO_SAMPLE_RATE_INVALID',
  );
  const sampleRate = Number(sampleRateText);
  if (!Number.isSafeInteger(sampleRate) || sampleRate > 768_000) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SAMPLE_RATE_INVALID');
  }
  const channelCount = positiveSafeIntegerInRange(
    record.channelCount,
    32,
    'NATIVE_MEDIA_PREVIEW_AUDIO_CHANNEL_COUNT_INVALID',
  );
  const timelineStartFrame = BigInt(nonNegativeIntegerText(
    record.timelineStartFrame,
    'NATIVE_MEDIA_PREVIEW_AUDIO_TIMELINE_RANGE_INVALID',
  ));
  const endExclusiveTimelineFrame = BigInt(positiveIntegerText(
    record.endExclusiveTimelineFrame,
    'NATIVE_MEDIA_PREVIEW_AUDIO_TIMELINE_RANGE_INVALID',
  ));
  if (timelineStartFrame >= endExclusiveTimelineFrame) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_TIMELINE_RANGE_INVALID');
  }
  const canonicalStart = positionFraction(
    record.canonicalTimelineStartSamplePosition,
    'NATIVE_MEDIA_PREVIEW_AUDIO_CANONICAL_RANGE_INVALID',
  );
  const canonicalEnd = positionFraction(
    record.canonicalTimelineEndExclusiveSamplePosition,
    'NATIVE_MEDIA_PREVIEW_AUDIO_CANONICAL_RANGE_INVALID',
  );
  const expectedEnd = add(canonicalStart, fraction(
    (endExclusiveTimelineFrame - timelineStartFrame)
      * projectRate.denominator * BigInt(sampleRate),
    projectRate.numerator,
  ));
  if (compare(expectedEnd, canonicalEnd) !== 0) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_CANONICAL_DURATION_MISMATCH');
  }
  const decodedSampleFrameCount = BigInt(positiveIntegerText(
    record.decodedSampleFrameCount,
    'NATIVE_MEDIA_PREVIEW_AUDIO_DECODED_COUNT_INVALID',
  ));
  const segments: NormalizedSegmentV1[] = [];
  let cursor = canonicalStart;
  let previousDecodedEnd: FractionV1 | null = null;
  for (const candidate of record.segments) {
    const segment = objectRecord(
      candidate,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SEGMENT_INVALID',
    );
    const timelineStart = positionFraction(
      segment.canonicalStartSamplePosition,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SEGMENT_RANGE_INVALID',
    );
    const timelineEnd = positionFraction(
      segment.canonicalEndExclusiveSamplePosition,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SEGMENT_RANGE_INVALID',
    );
    if (compare(timelineStart, cursor) !== 0 || compare(timelineStart, timelineEnd) >= 0
      || compare(timelineEnd, canonicalEnd) > 0) {
      throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SEGMENT_COVERAGE_INVALID');
    }
    cursor = timelineEnd;
    if (segment.kind === 'PCM') {
      exactKeys(segment, [
        'audioEpochId', 'canonicalEndExclusiveSamplePosition',
        'canonicalStartSamplePosition', 'decodedEndExclusiveSamplePosition',
        'decodedStartSamplePosition', 'kind',
      ], 'NATIVE_MEDIA_PREVIEW_AUDIO_PCM_SEGMENT_FIELDS_INVALID');
      const decodedStart = positionFraction(
        segment.decodedStartSamplePosition,
        'NATIVE_MEDIA_PREVIEW_AUDIO_PCM_SEGMENT_RANGE_INVALID',
      );
      const decodedEnd = positionFraction(
        segment.decodedEndExclusiveSamplePosition,
        'NATIVE_MEDIA_PREVIEW_AUDIO_PCM_SEGMENT_RANGE_INVALID',
      );
      if (compare(decodedStart, decodedEnd) >= 0
        || compare(decodedEnd, fraction(decodedSampleFrameCount, BigInt(1))) > 0
        || compare(subtract(decodedEnd, decodedStart), subtract(timelineEnd, timelineStart)) !== 0
        || (previousDecodedEnd !== null && compare(decodedStart, previousDecodedEnd) !== 0)) {
        throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_PCM_SEGMENT_INVALID');
      }
      previousDecodedEnd = decodedEnd;
      segments.push({
        kind: 'PCM',
        audioEpochId: identifier(
          segment.audioEpochId,
          'NATIVE_MEDIA_PREVIEW_AUDIO_EPOCH_INVALID',
        ),
        timelineStart,
        timelineEnd,
        decodedStart,
        decodedEnd,
      });
      continue;
    }
    exactKeys(segment, [
      'canonicalEndExclusiveSamplePosition', 'canonicalStartSamplePosition',
      'kind', 'nextAudioEpochId', 'precedingAudioEpochId', 'reason',
    ], 'NATIVE_MEDIA_PREVIEW_AUDIO_SILENCE_SEGMENT_FIELDS_INVALID');
    if (segment.kind !== 'SILENCE'
      || (segment.reason !== 'LEADING_STREAM_OFFSET'
        && segment.reason !== 'DECLARED_SOURCE_GAP')) {
      throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SILENCE_SEGMENT_INVALID');
    }
    segments.push({
      kind: 'SILENCE',
      reason: segment.reason,
      precedingAudioEpochId: segment.precedingAudioEpochId === null
        ? null
        : identifier(
            segment.precedingAudioEpochId,
            'NATIVE_MEDIA_PREVIEW_AUDIO_EPOCH_INVALID',
          ),
      nextAudioEpochId: identifier(
        segment.nextAudioEpochId,
        'NATIVE_MEDIA_PREVIEW_AUDIO_EPOCH_INVALID',
      ),
      timelineStart,
      timelineEnd,
    });
  }
  if (compare(cursor, canonicalEnd) !== 0) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SEGMENT_COVERAGE_INVALID');
  }
  const mappingPolicy = objectRecord(
    record.policy,
    'NATIVE_MEDIA_PREVIEW_AUDIO_MAPPING_POLICY_INVALID',
  );
  exactKeys(mappingPolicy, [
    'channelRemix', 'epochAlignment', 'gaps', 'overlapsAndResets',
    'resampling', 'samplePhase',
  ], 'NATIVE_MEDIA_PREVIEW_AUDIO_MAPPING_POLICY_FIELDS_INVALID');
  if (mappingPolicy.epochAlignment !== 'PAIRED_VERIFIED_VIDEO_AUDIO_EPOCH_ORDINAL_V1'
    || mappingPolicy.samplePhase !== 'PRESERVE_EXACT_RATIONAL_NO_ROUNDING'
    || mappingPolicy.gaps !== 'EXPLICIT_SILENCE_SEGMENTS'
    || mappingPolicy.overlapsAndResets !== 'VERIFIED_CANONICAL_EPOCH_HANDOFF'
    || mappingPolicy.resampling !== 'FORBIDDEN'
    || mappingPolicy.channelRemix !== 'FORBIDDEN') {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_MAPPING_POLICY_INVALID');
  }
  const audioStreamIndex = nonNegativeSafeInteger(
    record.audioStreamIndex,
    'NATIVE_MEDIA_PREVIEW_AUDIO_STREAM_INDEX_INVALID',
  );
  const streamId = identifier(record.streamId, 'NATIVE_MEDIA_PREVIEW_AUDIO_STREAM_INVALID');
  if (streamId !== 'audio-' + String(audioStreamIndex)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_STREAM_INVALID');
  }
  return Object.freeze({
    audioMappingSha256,
    audioSampleEpochMapSha256: sha256(
      record.audioSampleEpochMapSha256,
      'NATIVE_MEDIA_PREVIEW_AUDIO_MAP_INVALID',
    ),
    sourceVersionSha256: sha256(
      record.sourceVersionSha256,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SOURCE_INVALID',
    ),
    storageVersionSha256: sha256(
      record.storageVersionSha256,
      'NATIVE_MEDIA_PREVIEW_AUDIO_STORAGE_INVALID',
    ),
    decodedPcmSha256: sha256(
      record.decodedPcmSha256,
      'NATIVE_MEDIA_PREVIEW_AUDIO_PCM_INVALID',
    ),
    decodedSampleFrameCount,
    streamId,
    sampleRate,
    channelCount,
    timelineStartFrame,
    endExclusiveTimelineFrame,
    canonicalStart,
    canonicalEnd,
    segments: Object.freeze(segments),
  });
}

function sameRangeEvidence(
  value: Awaited<ReturnType<MediaSourceAudioPrivateArtifactStoreV1['readPcmSampleRange']>>,
  expected: Readonly<{
    manifestSha256: string;
    mapping: NormalizedMappingV1;
    sourceStartSampleFrame: string;
    sourceEndExclusiveSampleFrame: string;
  }>,
): boolean {
  return !!value
    && value.manifestSha256 === expected.manifestSha256
    && value.audioSampleEpochMapSha256 === expected.mapping.audioSampleEpochMapSha256
    && value.decodedPcmSha256 === expected.mapping.decodedPcmSha256
    && value.streamId === expected.mapping.streamId
    && value.sampleRate === String(expected.mapping.sampleRate)
    && value.channelCount === expected.mapping.channelCount
    && value.startSampleFrame === expected.sourceStartSampleFrame
    && value.endExclusiveSampleFrame === expected.sourceEndExclusiveSampleFrame
    && value.pcmBytes instanceof Uint8Array
    && value.pcmBytes.byteLength > 0
    && BigInt(value.pcmBytes.byteLength) === (
      BigInt(expected.sourceEndExclusiveSampleFrame)
        - BigInt(expected.sourceStartSampleFrame)
    ) * BigInt(expected.mapping.channelCount * 4)
    && value.rangeSha256 === digest(value.pcmBytes);
}

async function cleanupThen(
  handles: readonly string[],
  surfaceStore: NativeMediaTimestampPreviewAudioSurfaceStorePortV1,
  reason: Exclude<
    Extract<NativeMediaTimestampPreviewAudioMaterializerResultV1, {
      disposition: 'UNVERIFIABLE';
    }>['reason'],
    'INPUT_INVALID' | 'CLEANUP_FAILED'
  >,
  detail: string | null,
): Promise<NativeMediaTimestampPreviewAudioMaterializerResultV1> {
  let cleanupFailed = false;
  for (const handle of [...handles].reverse()) {
    try {
      await surfaceStore.deleteAudioSegment(handle);
    } catch {
      cleanupFailed = true;
    }
  }
  return cleanupFailed
    ? unverifiable('CLEANUP_FAILED', reason)
    : unverifiable(reason, detail);
}

function normalizePolicy(
  value: NativeMediaTimestampPreviewAudioMaterializerPolicyV1,
): NativeMediaTimestampPreviewAudioMaterializerPolicyV1 {
  if (!value
    || value.policyVersion !== NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_MATERIALIZER_POLICY_VERSION_V1
    || !positivePolicyInteger(value.maxWindowFrames, 1_024)
    || !positivePolicyInteger(value.maxMappingSegments, 200_001)
    || !positivePolicyInteger(value.maxWindowSegments, 256)
    || !positivePolicyInteger(value.maxReadOperations, 256)
    || !positivePolicyInteger(value.maxTotalPcmBytes, 64 * 1024 * 1024)
    || value.maxReadOperations > value.maxWindowSegments) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_POLICY_INVALID');
  }
  return Object.freeze({ ...value });
}

function assertPorts(
  value: Readonly<{
    pcmReader: Pick<MediaSourceAudioPrivateArtifactStoreV1, 'readPcmSampleRange'>;
    surfaceStore: NativeMediaTimestampPreviewAudioSurfaceStorePortV1;
  }>,
): void {
  if (!value?.pcmReader
    || typeof value.pcmReader.readPcmSampleRange !== 'function'
    || !value.surfaceStore
    || typeof value.surfaceStore.putAudioSegment !== 'function'
    || typeof value.surfaceStore.deleteAudioSegment !== 'function') {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_PORTS_INVALID');
  }
}

function normalizeLeaseScope(
  value: NativeMediaTimestampPreviewSurfaceLeaseScopeV1,
): NativeMediaTimestampPreviewSurfaceLeaseScopeV1 {
  if (!value || !value.projectRevision || value.projectRevision.schemaVersion !== 1
    || !Number.isSafeInteger(value.projectRevision.value)
    || value.projectRevision.value < 0) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SCOPE_INVALID');
  }
  return Object.freeze({
    userId: identifier(value.userId, 'NATIVE_MEDIA_PREVIEW_AUDIO_SCOPE_INVALID'),
    projectId: identifier(value.projectId, 'NATIVE_MEDIA_PREVIEW_AUDIO_SCOPE_INVALID'),
    sequenceId: identifier(value.sequenceId, 'NATIVE_MEDIA_PREVIEW_AUDIO_SCOPE_INVALID'),
    overlayId: identifier(value.overlayId, 'NATIVE_MEDIA_PREVIEW_AUDIO_SCOPE_INVALID'),
    projectRevision: Object.freeze({
      schemaVersion: 1 as const,
      value: value.projectRevision.value,
      compatibilityUpdatedAt: boundedText(
        value.projectRevision.compatibilityUpdatedAt,
        240,
        'NATIVE_MEDIA_PREVIEW_AUDIO_SCOPE_INVALID',
      ),
    }),
  });
}

function normalizeLease(
  value: NativeMediaTimestampPreviewWindowLeaseV2,
): NativeMediaTimestampPreviewWindowLeaseV2 {
  if (!value || typeof value.leaseId !== 'string'
    || !/^nmpwl2_[a-f0-9]{64}$/.test(value.leaseId)
    || !Number.isSafeInteger(value.issuedAtEpochMs) || value.issuedAtEpochMs < 0
    || !Number.isSafeInteger(value.renewAfterEpochMs)
    || value.renewAfterEpochMs <= value.issuedAtEpochMs
    || !Number.isSafeInteger(value.expiresAtEpochMs)
    || value.expiresAtEpochMs <= value.renewAfterEpochMs
    || value.expiresAtEpochMs - value.issuedAtEpochMs > 24 * 60 * 60 * 1_000) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_LEASE_INVALID');
  }
  return Object.freeze({ ...value });
}

type FractionV1 = Readonly<{ numerator: bigint; denominator: bigint }>;

function normalizeRate(
  value: VideoSourceTimestampConformV3['projectRate'],
): FractionV1 {
  if (!value || typeof value !== 'object') {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_PROJECT_RATE_INVALID');
  }
  return fraction(
    BigInt(positiveIntegerText(
      value.numerator,
      'NATIVE_MEDIA_PREVIEW_AUDIO_PROJECT_RATE_INVALID',
    )),
    BigInt(positiveIntegerText(
      value.denominator,
      'NATIVE_MEDIA_PREVIEW_AUDIO_PROJECT_RATE_INVALID',
    )),
  );
}

function positionFraction(value: unknown, code: string): FractionV1 {
  const record = objectRecord(value, code);
  exactKeys(record, ['denominator', 'disposition', 'numerator'], code);
  const numerator = BigInt(nonNegativeIntegerText(record.numerator, code));
  const denominator = BigInt(positiveIntegerText(record.denominator, code));
  const normalized = fraction(numerator, denominator);
  if (normalized.numerator !== numerator || normalized.denominator !== denominator
    || record.disposition !== (denominator === BigInt(1)
      ? 'INTEGER_SAMPLE_FRAME'
      : 'BETWEEN_SAMPLE_FRAMES')) {
    throw new Error(code);
  }
  return normalized;
}

function position(value: FractionV1): NativeMediaTimestampPreviewAudioSamplePositionV1 {
  if (value.numerator < BigInt(0)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_POSITION_NEGATIVE');
  }
  return Object.freeze({
    numerator: value.numerator.toString(),
    denominator: value.denominator.toString(),
    disposition: value.denominator === BigInt(1)
      ? 'INTEGER_SAMPLE_FRAME' as const
      : 'BETWEEN_SAMPLE_FRAMES' as const,
  });
}

function fraction(numerator: bigint, denominator: bigint): FractionV1 {
  if (denominator <= BigInt(0)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_FRACTION_INVALID');
  }
  const divisor = gcd(abs(numerator), denominator);
  return Object.freeze({
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  });
}

function add(left: FractionV1, right: FractionV1): FractionV1 {
  return fraction(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function subtract(left: FractionV1, right: FractionV1): FractionV1 {
  return fraction(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function compare(left: FractionV1, right: FractionV1): number {
  const delta = left.numerator * right.denominator
    - right.numerator * left.denominator;
  return delta < BigInt(0) ? -1 : delta > BigInt(0) ? 1 : 0;
}

function maximum(left: FractionV1, right: FractionV1): FractionV1 {
  return compare(left, right) >= 0 ? left : right;
}

function minimum(left: FractionV1, right: FractionV1): FractionV1 {
  return compare(left, right) <= 0 ? left : right;
}

function floorFraction(value: FractionV1): bigint {
  return value.numerator / value.denominator;
}

function ceilFraction(value: FractionV1): bigint {
  return (value.numerator + value.denominator - BigInt(1)) / value.denominator;
}

function gcd(left: bigint, right: bigint): bigint {
  let a = abs(left);
  let b = abs(right);
  while (b !== BigInt(0)) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a === BigInt(0) ? BigInt(1) : a;
}

function abs(value: bigint): bigint {
  return value < BigInt(0) ? -value : value;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(code);
  }
}

function objectRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(code);
  return value;
}

function identifier(value: unknown, code: string): string {
  return boundedText(value, 256, code);
}

function boundedText(value: unknown, maximum: number, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum
    || /[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function nonNegativeIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,127})$/.test(value)) throw new Error(code);
  return BigInt(value).toString();
}

function positiveIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,127}$/.test(value)) throw new Error(code);
  return BigInt(value).toString();
}

function nonNegativeSafeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(code);
  return Number(value);
}

function positiveSafeIntegerInRange(value: unknown, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum) {
    throw new Error(code);
  }
  return Number(value);
}

function positivePolicyInteger(value: unknown, maximum: number): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= maximum;
}

function diagnostic(error: unknown): string | null {
  if (!(error instanceof Error) || !/^[A-Z0-9_]{1,180}$/.test(error.message)) return null;
  return error.message;
}

function unverifiable(
  reason: Extract<NativeMediaTimestampPreviewAudioMaterializerResultV1, {
    disposition: 'UNVERIFIABLE';
  }>['reason'],
  detail: string | null,
): NativeMediaTimestampPreviewAudioMaterializerResultV1 {
  return Object.freeze({
    disposition: 'UNVERIFIABLE' as const,
    reason,
    diagnostic: detail,
  });
}
