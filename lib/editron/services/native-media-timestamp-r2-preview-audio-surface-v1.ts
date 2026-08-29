import { createHash, randomBytes } from 'node:crypto';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import type {
  MediaSourcePtsCadenceR2CommandClientV1,
  MediaSourcePtsCadenceR2PrivateStorageScopeV1,
} from './media-source-pts-cadence-r2-private-sidecar-v1';
import type {
  NativeMediaTimestampPreviewSurfaceLeaseScopeV1,
} from './native-media-timestamp-r2-preview-surface-v1';
import type { ProjectRevisionV1 } from './project-service';

export const NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_SURFACE_POLICY_VERSION_V1 =
  'EDITRON_NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_SURFACE_R2_V1' as const;

const HANDLE_PATTERN = /^nmpa1_([a-f0-9]{64})$/;
const OBJECT_KEY_PREFIX = 'private/editron/native-media-preview-audio/v1/';
const WAV_HEADER_BYTES = 44;
const BYTES_PER_CHANNEL_SAMPLE = 4;
const ABSOLUTE_MAX_PCM_BYTES = 64 * 1024 * 1024;
const ABSOLUTE_MAX_LEASE_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_METADATA_BYTES = 1_900;
const PUT_ATTEMPTS = 3;

export type NativeMediaTimestampPreviewAudioSamplePositionV1 = Readonly<{
  numerator: string;
  denominator: string;
  disposition: 'INTEGER_SAMPLE_FRAME' | 'BETWEEN_SAMPLE_FRAMES';
}>;

export type NativeMediaTimestampPreviewAudioSurfacePolicyV1 = Readonly<{
  policyVersion: typeof NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_SURFACE_POLICY_VERSION_V1;
  leaseTtlMs: number;
  maxPcmBytes: number;
  maxSampleRate: number;
  maxChannelCount: number;
}>;

export const NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_SURFACE_DEFAULT_POLICY_V1:
NativeMediaTimestampPreviewAudioSurfacePolicyV1 = Object.freeze({
  policyVersion: NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_SURFACE_POLICY_VERSION_V1,
  leaseTtlMs: 60 * 60 * 1_000,
  maxPcmBytes: 16 * 1024 * 1024,
  maxSampleRate: 768_000,
  maxChannelCount: 32,
});

export type NativeMediaTimestampPreviewAudioSurfaceBindingV1 = Readonly<{
  schemaVersion: 1;
  storage: 'R2_PRIVATE';
  audioHandle: string;
  userIdSha256: string;
  projectIdSha256: string;
  projectRevision: ProjectRevisionV1;
  sequenceIdSha256: string;
  overlayIdSha256: string;
  audioMappingSha256: string;
  audioSampleEpochMapSha256: string;
  sourceVersionSha256: string;
  storageVersionSha256: string;
  decodedPcmSha256: string;
  sampleRate: number;
  channelCount: number;
  sourceStartSampleFrame: string;
  sourceEndExclusiveSampleFrame: string;
  decodedStartSamplePosition: NativeMediaTimestampPreviewAudioSamplePositionV1;
  decodedEndExclusiveSamplePosition: NativeMediaTimestampPreviewAudioSamplePositionV1;
  timelineStartSamplePosition: NativeMediaTimestampPreviewAudioSamplePositionV1;
  timelineEndExclusiveSamplePosition: NativeMediaTimestampPreviewAudioSamplePositionV1;
  segmentIdentitySha256: string;
  segmentPcmSha256: string;
  pcmByteLength: number;
  wavContentSha256: string;
  wavByteLength: number;
  expiresAtEpochMs: number;
}>;

export type NativeMediaTimestampPreviewAudioSurfaceReadResultV1 = Readonly<
  | {
      disposition: 'AVAILABLE';
      binding: NativeMediaTimestampPreviewAudioSurfaceBindingV1;
      wavBytes: Uint8Array;
    }
  | {
      disposition: 'EXPIRED';
      binding: NativeMediaTimestampPreviewAudioSurfaceBindingV1;
    }
  | {
      disposition: 'NOT_FOUND';
      audioHandle: string;
    }
>;

export interface NativeMediaTimestampPreviewAudioSurfaceStorePortV1 {
  putAudioSegment(input: Readonly<{
    audioMappingSha256: string;
    audioSampleEpochMapSha256: string;
    sourceVersionSha256: string;
    storageVersionSha256: string;
    decodedPcmSha256: string;
    sampleRate: number;
    channelCount: number;
    sourceStartSampleFrame: string;
    sourceEndExclusiveSampleFrame: string;
    decodedStartSamplePosition: NativeMediaTimestampPreviewAudioSamplePositionV1;
    decodedEndExclusiveSamplePosition: NativeMediaTimestampPreviewAudioSamplePositionV1;
    timelineStartSamplePosition: NativeMediaTimestampPreviewAudioSamplePositionV1;
    timelineEndExclusiveSamplePosition: NativeMediaTimestampPreviewAudioSamplePositionV1;
    pcmBytes: Uint8Array;
  }>): Promise<Readonly<{
    audioHandle: string;
    segmentIdentitySha256: string;
    expiresAtEpochMs: number;
  }>>;
  deleteAudioSegment(audioHandle: string): Promise<void>;
}

export interface NativeMediaTimestampPreviewAudioSurfaceReaderPortV1 {
  readAudioSegment(
    audioHandle: string,
  ): Promise<NativeMediaTimestampPreviewAudioSurfaceReadResultV1>;
}

type SurfaceDependenciesV1 = Readonly<{
  privateStorage: MediaSourcePtsCadenceR2PrivateStorageScopeV1;
  client: MediaSourcePtsCadenceR2CommandClientV1;
  policy: NativeMediaTimestampPreviewAudioSurfacePolicyV1;
  now?: () => number;
}>;

export function createNativeMediaTimestampR2PreviewAudioSurfaceStoreV1(
  input: SurfaceDependenciesV1 & Readonly<{
    leaseScope: NativeMediaTimestampPreviewSurfaceLeaseScopeV1;
    randomIdentifier?: () => string;
  }>,
): NativeMediaTimestampPreviewAudioSurfaceStorePortV1 {
  const storage = normalizeStorage(input.privateStorage, input.client);
  const policy = normalizePolicy(input.policy);
  const leaseScope = normalizeLeaseScope(input.leaseScope);
  const now = input.now ?? Date.now;
  const randomIdentifier = input.randomIdentifier ?? (() => randomBytes(32).toString('hex'));

  return {
    async putAudioSegment(value) {
      const writtenAt = validEpochMs(
        now(),
        'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_CLOCK_INVALID',
      );
      const expiresAtEpochMs = writtenAt + policy.leaseTtlMs;
      if (!Number.isSafeInteger(expiresAtEpochMs)) {
        throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_EXPIRY_INVALID');
      }
      const segment = normalizeSegment(value, policy);
      const wavBytes = createCanonicalS32LeWav(segment);
      const segmentIdentitySha256 = hashEditronCanonicalJsonV1({
        audioMappingSha256: segment.audioMappingSha256,
        audioSampleEpochMapSha256: segment.audioSampleEpochMapSha256,
        sourceVersionSha256: segment.sourceVersionSha256,
        storageVersionSha256: segment.storageVersionSha256,
        decodedPcmSha256: segment.decodedPcmSha256,
        sampleRate: segment.sampleRate,
        channelCount: segment.channelCount,
        sourceStartSampleFrame: segment.sourceStartSampleFrame,
        sourceEndExclusiveSampleFrame: segment.sourceEndExclusiveSampleFrame,
        decodedStartSamplePosition: segment.decodedStartSamplePosition,
        decodedEndExclusiveSamplePosition: segment.decodedEndExclusiveSamplePosition,
        timelineStartSamplePosition: segment.timelineStartSamplePosition,
        timelineEndExclusiveSamplePosition: segment.timelineEndExclusiveSamplePosition,
        segmentPcmSha256: digest(segment.pcmBytes),
        pcmByteLength: segment.pcmBytes.byteLength,
      });
      const bindingMaterial = {
        schemaVersion: 1 as const,
        storage: 'R2_PRIVATE' as const,
        userIdSha256: digestText(leaseScope.userId),
        projectIdSha256: digestText(leaseScope.projectId),
        projectRevision: leaseScope.projectRevision,
        sequenceIdSha256: digestText(leaseScope.sequenceId),
        overlayIdSha256: digestText(leaseScope.overlayId),
        audioMappingSha256: segment.audioMappingSha256,
        audioSampleEpochMapSha256: segment.audioSampleEpochMapSha256,
        sourceVersionSha256: segment.sourceVersionSha256,
        storageVersionSha256: segment.storageVersionSha256,
        decodedPcmSha256: segment.decodedPcmSha256,
        sampleRate: segment.sampleRate,
        channelCount: segment.channelCount,
        sourceStartSampleFrame: segment.sourceStartSampleFrame,
        sourceEndExclusiveSampleFrame: segment.sourceEndExclusiveSampleFrame,
        decodedStartSamplePosition: segment.decodedStartSamplePosition,
        decodedEndExclusiveSamplePosition: segment.decodedEndExclusiveSamplePosition,
        timelineStartSamplePosition: segment.timelineStartSamplePosition,
        timelineEndExclusiveSamplePosition: segment.timelineEndExclusiveSamplePosition,
        segmentIdentitySha256,
        segmentPcmSha256: digest(segment.pcmBytes),
        pcmByteLength: segment.pcmBytes.byteLength,
        wavContentSha256: digest(wavBytes),
        wavByteLength: wavBytes.byteLength,
        expiresAtEpochMs,
      };

      for (let attempt = 0; attempt < PUT_ATTEMPTS; attempt += 1) {
        const identifier = normalizeRandomIdentifier(randomIdentifier());
        const audioHandle = 'nmpa1_' + identifier;
        const binding = Object.freeze({ ...bindingMaterial, audioHandle });
        const metadata = serializeBinding(binding);
        assertMetadataSize(metadata);
        try {
          await storage.client.send(new PutObjectCommand({
            Bucket: storage.bucketName,
            Key: objectKey(audioHandle),
            Body: wavBytes,
            ContentLength: wavBytes.byteLength,
            ContentType: 'audio/wav',
            CacheControl: 'private, no-store, max-age=0',
            Expires: new Date(expiresAtEpochMs),
            IfNoneMatch: '*',
            Metadata: metadata,
          }));
        } catch (error) {
          if (isPreconditionFailed(error)) continue;
          throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_WRITE_FAILED');
        }
        try {
          const verified = await readStoredAudioSegment({
            ...storage,
            audioHandle,
            policy,
            now,
          });
          if (verified.disposition !== 'AVAILABLE'
            || hashEditronCanonicalJsonV1(verified.binding)
              !== hashEditronCanonicalJsonV1(binding)
            || digest(verified.wavBytes) !== binding.wavContentSha256) {
            throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_WRITE_VERIFICATION_FAILED');
          }
          return Object.freeze({
            audioHandle,
            segmentIdentitySha256,
            expiresAtEpochMs,
          });
        } catch {
          await deleteObjectBestEffort(storage, audioHandle);
          throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_WRITE_VERIFICATION_FAILED');
        }
      }
      throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_HANDLE_COLLISION');
    },
    async deleteAudioSegment(audioHandle) {
      const normalized = normalizeHandle(audioHandle);
      try {
        await storage.client.send(new DeleteObjectCommand({
          Bucket: storage.bucketName,
          Key: objectKey(normalized),
        }));
      } catch {
        throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_DELETE_FAILED');
      }
    },
  };
}

export function createNativeMediaTimestampR2PreviewAudioSurfaceReaderV1(
  input: SurfaceDependenciesV1,
): NativeMediaTimestampPreviewAudioSurfaceReaderPortV1 {
  const storage = normalizeStorage(input.privateStorage, input.client);
  const policy = normalizePolicy(input.policy);
  const now = input.now ?? Date.now;
  return {
    async readAudioSegment(audioHandle) {
      return readStoredAudioSegment({
        ...storage,
        audioHandle: normalizeHandle(audioHandle),
        policy,
        now,
      });
    },
  };
}

async function readStoredAudioSegment(input: Readonly<{
  client: MediaSourcePtsCadenceR2CommandClientV1;
  bucketName: string;
  audioHandle: string;
  policy: NativeMediaTimestampPreviewAudioSurfacePolicyV1;
  now: () => number;
}>): Promise<NativeMediaTimestampPreviewAudioSurfaceReadResultV1> {
  let response: unknown;
  try {
    response = await input.client.send(new GetObjectCommand({
      Bucket: input.bucketName,
      Key: objectKey(input.audioHandle),
    }));
  } catch (error) {
    if (isNotFound(error)) {
      return { disposition: 'NOT_FOUND', audioHandle: input.audioHandle };
    }
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_READ_FAILED');
  }
  if (!response || typeof response !== 'object') {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_RESPONSE_INVALID');
  }
  const candidate = response as {
    Body?: unknown;
    CacheControl?: unknown;
    ContentLength?: unknown;
    ContentType?: unknown;
    Metadata?: unknown;
  };
  if (candidate.ContentType !== 'audio/wav'
    || candidate.CacheControl !== 'private, no-store, max-age=0') {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_HEADERS_INVALID');
  }
  const binding = parseBinding(candidate.Metadata, input.audioHandle, input.policy);
  if (candidate.ContentLength !== binding.wavByteLength) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_BYTE_LENGTH_MISMATCH');
  }
  const observedNow = validEpochMs(
    input.now(),
    'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_CLOCK_INVALID',
  );
  if (observedNow >= binding.expiresAtEpochMs) {
    await deleteObjectBestEffort(input, input.audioHandle);
    return { disposition: 'EXPIRED', binding };
  }
  const wavBytes = await readExactlyBoundedBytes(
    candidate.Body,
    binding.wavByteLength,
    input.policy.maxPcmBytes + WAV_HEADER_BYTES,
  );
  assertCanonicalS32LeWav(wavBytes, binding);
  if (digest(wavBytes) !== binding.wavContentSha256) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_CONTENT_MISMATCH');
  }
  return { disposition: 'AVAILABLE', binding, wavBytes };
}

function normalizeSegment(
  value: Parameters<NativeMediaTimestampPreviewAudioSurfaceStorePortV1['putAudioSegment']>[0],
  policy: NativeMediaTimestampPreviewAudioSurfacePolicyV1,
) {
  if (!value || !(value.pcmBytes instanceof Uint8Array)
    || value.pcmBytes.byteLength < BYTES_PER_CHANNEL_SAMPLE
    || value.pcmBytes.byteLength > policy.maxPcmBytes) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_PCM_INVALID');
  }
  const sampleRate = positiveSafeIntegerInRange(
    value.sampleRate,
    policy.maxSampleRate,
    'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_SAMPLE_RATE_INVALID',
  );
  const channelCount = positiveSafeIntegerInRange(
    value.channelCount,
    policy.maxChannelCount,
    'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_CHANNEL_COUNT_INVALID',
  );
  const sourceStartSampleFrame = nonNegativeIntegerText(
    value.sourceStartSampleFrame,
    'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_SOURCE_RANGE_INVALID',
  );
  const sourceEndExclusiveSampleFrame = positiveIntegerText(
    value.sourceEndExclusiveSampleFrame,
    'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_SOURCE_RANGE_INVALID',
  );
  const sampleFrameCount = BigInt(sourceEndExclusiveSampleFrame)
    - BigInt(sourceStartSampleFrame);
  if (sampleFrameCount < BigInt(1)
    || sampleFrameCount * BigInt(channelCount * BYTES_PER_CHANNEL_SAMPLE)
      !== BigInt(value.pcmBytes.byteLength)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_PCM_RANGE_MISMATCH');
  }
  const decodedStartSamplePosition = normalizePosition(
    value.decodedStartSamplePosition,
    'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_DECODED_RANGE_INVALID',
  );
  const decodedEndExclusiveSamplePosition = normalizePosition(
    value.decodedEndExclusiveSamplePosition,
    'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_DECODED_RANGE_INVALID',
  );
  const timelineStartSamplePosition = normalizePosition(
    value.timelineStartSamplePosition,
    'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_TIMELINE_RANGE_INVALID',
  );
  const timelineEndExclusiveSamplePosition = normalizePosition(
    value.timelineEndExclusiveSamplePosition,
    'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_TIMELINE_RANGE_INVALID',
  );
  const decodedStart = fraction(decodedStartSamplePosition);
  const decodedEnd = fraction(decodedEndExclusiveSamplePosition);
  const timelineStart = fraction(timelineStartSamplePosition);
  const timelineEnd = fraction(timelineEndExclusiveSamplePosition);
  if (compare(decodedStart, decodedEnd) >= 0 || compare(timelineStart, timelineEnd) >= 0
    || floorFraction(decodedStart) !== BigInt(sourceStartSampleFrame)
    || ceilFraction(decodedEnd) !== BigInt(sourceEndExclusiveSampleFrame)
    || compare(subtract(decodedEnd, decodedStart), subtract(timelineEnd, timelineStart)) !== 0) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_PHASE_OR_DURATION_MISMATCH');
  }
  return Object.freeze({
    audioMappingSha256: sha256(
      value.audioMappingSha256,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_MAPPING_INVALID',
    ),
    audioSampleEpochMapSha256: sha256(
      value.audioSampleEpochMapSha256,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_EPOCH_MAP_INVALID',
    ),
    sourceVersionSha256: sha256(
      value.sourceVersionSha256,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_SOURCE_VERSION_INVALID',
    ),
    storageVersionSha256: sha256(
      value.storageVersionSha256,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_STORAGE_VERSION_INVALID',
    ),
    decodedPcmSha256: sha256(
      value.decodedPcmSha256,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_DECODED_PCM_INVALID',
    ),
    sampleRate,
    channelCount,
    sourceStartSampleFrame,
    sourceEndExclusiveSampleFrame,
    decodedStartSamplePosition,
    decodedEndExclusiveSamplePosition,
    timelineStartSamplePosition,
    timelineEndExclusiveSamplePosition,
    pcmBytes: value.pcmBytes,
  });
}

function createCanonicalS32LeWav(
  segment: ReturnType<typeof normalizeSegment>,
): Uint8Array {
  const wav = new Uint8Array(WAV_HEADER_BYTES + segment.pcmBytes.byteLength);
  const view = new DataView(wav.buffer);
  writeAscii(wav, 0, 'RIFF');
  view.setUint32(4, wav.byteLength - 8, true);
  writeAscii(wav, 8, 'WAVE');
  writeAscii(wav, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, segment.channelCount, true);
  view.setUint32(24, segment.sampleRate, true);
  view.setUint32(
    28,
    segment.sampleRate * segment.channelCount * BYTES_PER_CHANNEL_SAMPLE,
    true,
  );
  view.setUint16(32, segment.channelCount * BYTES_PER_CHANNEL_SAMPLE, true);
  view.setUint16(34, 32, true);
  writeAscii(wav, 36, 'data');
  view.setUint32(40, segment.pcmBytes.byteLength, true);
  wav.set(segment.pcmBytes, WAV_HEADER_BYTES);
  return wav;
}

function assertCanonicalS32LeWav(
  value: Uint8Array,
  binding: NativeMediaTimestampPreviewAudioSurfaceBindingV1,
): void {
  if (value.byteLength !== binding.wavByteLength
    || value.byteLength !== WAV_HEADER_BYTES + binding.pcmByteLength
    || ascii(value, 0, 4) !== 'RIFF'
    || ascii(value, 8, 4) !== 'WAVE'
    || ascii(value, 12, 4) !== 'fmt '
    || ascii(value, 36, 4) !== 'data') {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_WAV_INVALID');
  }
  const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
  if (view.getUint32(4, true) !== value.byteLength - 8
    || view.getUint32(16, true) !== 16
    || view.getUint16(20, true) !== 1
    || view.getUint16(22, true) !== binding.channelCount
    || view.getUint32(24, true) !== binding.sampleRate
    || view.getUint32(28, true)
      !== binding.sampleRate * binding.channelCount * BYTES_PER_CHANNEL_SAMPLE
    || view.getUint16(32, true) !== binding.channelCount * BYTES_PER_CHANNEL_SAMPLE
    || view.getUint16(34, true) !== 32
    || view.getUint32(40, true) !== binding.pcmByteLength
    || digest(value.subarray(WAV_HEADER_BYTES)) !== binding.segmentPcmSha256) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_WAV_INVALID');
  }
}

function serializeBinding(
  binding: NativeMediaTimestampPreviewAudioSurfaceBindingV1,
): Record<string, string> {
  return {
    binding: hashEditronCanonicalJsonV1(binding),
    schema: '1',
    policy: NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_SURFACE_POLICY_VERSION_V1,
    handle: binding.audioHandle,
    user: binding.userIdSha256,
    project: binding.projectIdSha256,
    revision: String(binding.projectRevision.value),
    updated: encodeText(binding.projectRevision.compatibilityUpdatedAt),
    sequence: binding.sequenceIdSha256,
    overlay: binding.overlayIdSha256,
    mapping: binding.audioMappingSha256,
    epochmap: binding.audioSampleEpochMapSha256,
    source: binding.sourceVersionSha256,
    storage: binding.storageVersionSha256,
    decoded: binding.decodedPcmSha256,
    rate: String(binding.sampleRate),
    channels: String(binding.channelCount),
    sourcefrom: binding.sourceStartSampleFrame,
    sourceto: binding.sourceEndExclusiveSampleFrame,
    decodedfrom: serializePosition(binding.decodedStartSamplePosition),
    decodedto: serializePosition(binding.decodedEndExclusiveSamplePosition),
    timelinefrom: serializePosition(binding.timelineStartSamplePosition),
    timelineto: serializePosition(binding.timelineEndExclusiveSamplePosition),
    segment: binding.segmentIdentitySha256,
    pcm: binding.segmentPcmSha256,
    pcmbytes: String(binding.pcmByteLength),
    wav: binding.wavContentSha256,
    wavbytes: String(binding.wavByteLength),
    expires: String(binding.expiresAtEpochMs),
  };
}

function parseBinding(
  value: unknown,
  audioHandle: string,
  policy: NativeMediaTimestampPreviewAudioSurfacePolicyV1,
): NativeMediaTimestampPreviewAudioSurfaceBindingV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_METADATA_INVALID');
  }
  const metadata = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key.toLowerCase(),
      entry,
    ]),
  );
  const expectedKeys = [
    'binding', 'channels', 'decoded', 'decodedfrom', 'decodedto', 'epochmap',
    'expires', 'handle', 'mapping', 'overlay', 'pcm', 'pcmbytes', 'policy',
    'project', 'rate', 'revision', 'schema', 'segment', 'sequence', 'source',
    'sourcefrom', 'sourceto', 'storage', 'timelinefrom', 'timelineto',
    'updated', 'user', 'wav', 'wavbytes',
  ];
  const actualKeys = Object.keys(metadata).sort();
  if (actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])
    || metadata.schema !== '1'
    || metadata.policy !== NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_SURFACE_POLICY_VERSION_V1
    || metadata.handle !== audioHandle) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_METADATA_SCOPE_INVALID');
  }
  const sourceStartSampleFrame = nonNegativeIntegerText(
    metadata.sourcefrom,
    'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_SOURCE_RANGE_INVALID',
  );
  const sourceEndExclusiveSampleFrame = positiveIntegerText(
    metadata.sourceto,
    'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_SOURCE_RANGE_INVALID',
  );
  const sampleRate = positiveIntegerTextInRange(
    metadata.rate,
    policy.maxSampleRate,
    'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_SAMPLE_RATE_INVALID',
  );
  const channelCount = positiveIntegerTextInRange(
    metadata.channels,
    policy.maxChannelCount,
    'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_CHANNEL_COUNT_INVALID',
  );
  const pcmByteLength = positiveIntegerTextInRange(
    metadata.pcmbytes,
    policy.maxPcmBytes,
    'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_PCM_INVALID',
  );
  const wavByteLength = positiveIntegerTextInRange(
    metadata.wavbytes,
    policy.maxPcmBytes + WAV_HEADER_BYTES,
    'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_WAV_INVALID',
  );
  const binding = Object.freeze({
    schemaVersion: 1 as const,
    storage: 'R2_PRIVATE' as const,
    audioHandle,
    userIdSha256: sha256(metadata.user, 'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_USER_INVALID'),
    projectIdSha256: sha256(
      metadata.project,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_PROJECT_INVALID',
    ),
    projectRevision: Object.freeze({
      schemaVersion: 1 as const,
      value: nonNegativeSafeInteger(
        metadata.revision,
        'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_REVISION_INVALID',
      ),
      compatibilityUpdatedAt: decodeText(
        metadata.updated,
        'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_REVISION_INVALID',
      ),
    }),
    sequenceIdSha256: sha256(
      metadata.sequence,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_SEQUENCE_INVALID',
    ),
    overlayIdSha256: sha256(
      metadata.overlay,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_OVERLAY_INVALID',
    ),
    audioMappingSha256: sha256(
      metadata.mapping,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_MAPPING_INVALID',
    ),
    audioSampleEpochMapSha256: sha256(
      metadata.epochmap,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_EPOCH_MAP_INVALID',
    ),
    sourceVersionSha256: sha256(
      metadata.source,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_SOURCE_VERSION_INVALID',
    ),
    storageVersionSha256: sha256(
      metadata.storage,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_STORAGE_VERSION_INVALID',
    ),
    decodedPcmSha256: sha256(
      metadata.decoded,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_DECODED_PCM_INVALID',
    ),
    sampleRate,
    channelCount,
    sourceStartSampleFrame,
    sourceEndExclusiveSampleFrame,
    decodedStartSamplePosition: parsePosition(
      metadata.decodedfrom,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_DECODED_RANGE_INVALID',
    ),
    decodedEndExclusiveSamplePosition: parsePosition(
      metadata.decodedto,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_DECODED_RANGE_INVALID',
    ),
    timelineStartSamplePosition: parsePosition(
      metadata.timelinefrom,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_TIMELINE_RANGE_INVALID',
    ),
    timelineEndExclusiveSamplePosition: parsePosition(
      metadata.timelineto,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_TIMELINE_RANGE_INVALID',
    ),
    segmentIdentitySha256: sha256(
      metadata.segment,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_SEGMENT_INVALID',
    ),
    segmentPcmSha256: sha256(
      metadata.pcm,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_PCM_INVALID',
    ),
    pcmByteLength,
    wavContentSha256: sha256(
      metadata.wav,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_WAV_INVALID',
    ),
    wavByteLength,
    expiresAtEpochMs: nonNegativeSafeInteger(
      metadata.expires,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_EXPIRY_INVALID',
    ),
  });
  assertBindingRanges(binding);
  if (metadata.binding !== hashEditronCanonicalJsonV1(binding)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_BINDING_MISMATCH');
  }
  return binding;
}

function assertBindingRanges(
  binding: NativeMediaTimestampPreviewAudioSurfaceBindingV1,
): void {
  const expectedPcmBytes = (
    BigInt(binding.sourceEndExclusiveSampleFrame)
      - BigInt(binding.sourceStartSampleFrame)
  ) * BigInt(binding.channelCount * BYTES_PER_CHANNEL_SAMPLE);
  if (expectedPcmBytes !== BigInt(binding.pcmByteLength)
    || binding.wavByteLength !== binding.pcmByteLength + WAV_HEADER_BYTES) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_BINDING_RANGE_MISMATCH');
  }
  const decodedStart = fraction(binding.decodedStartSamplePosition);
  const decodedEnd = fraction(binding.decodedEndExclusiveSamplePosition);
  const timelineStart = fraction(binding.timelineStartSamplePosition);
  const timelineEnd = fraction(binding.timelineEndExclusiveSamplePosition);
  if (compare(decodedStart, decodedEnd) >= 0 || compare(timelineStart, timelineEnd) >= 0
    || floorFraction(decodedStart) !== BigInt(binding.sourceStartSampleFrame)
    || ceilFraction(decodedEnd) !== BigInt(binding.sourceEndExclusiveSampleFrame)
    || compare(subtract(decodedEnd, decodedStart), subtract(timelineEnd, timelineStart)) !== 0) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_BINDING_RANGE_MISMATCH');
  }
}

function normalizePosition(
  value: unknown,
  code: string,
): NativeMediaTimestampPreviewAudioSamplePositionV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate).sort();
  if (keys.join(',') !== 'denominator,disposition,numerator') throw new Error(code);
  const numerator = nonNegativeIntegerText(candidate.numerator, code);
  const denominator = positiveIntegerText(candidate.denominator, code);
  if (gcd(BigInt(numerator), BigInt(denominator)) !== BigInt(1)) throw new Error(code);
  const disposition = denominator === '1'
    ? 'INTEGER_SAMPLE_FRAME' as const
    : 'BETWEEN_SAMPLE_FRAMES' as const;
  if (candidate.disposition !== disposition) throw new Error(code);
  return Object.freeze({ numerator, denominator, disposition });
}

function serializePosition(value: NativeMediaTimestampPreviewAudioSamplePositionV1): string {
  return value.numerator + '/' + value.denominator;
}

function parsePosition(
  value: unknown,
  code: string,
): NativeMediaTimestampPreviewAudioSamplePositionV1 {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,127})\/[1-9]\d{0,127}$/.test(value)) {
    throw new Error(code);
  }
  const [numerator, denominator] = value.split('/');
  return normalizePosition({
    numerator,
    denominator,
    disposition: denominator === '1'
      ? 'INTEGER_SAMPLE_FRAME'
      : 'BETWEEN_SAMPLE_FRAMES',
  }, code);
}

type FractionV1 = Readonly<{ numerator: bigint; denominator: bigint }>;

function fraction(value: NativeMediaTimestampPreviewAudioSamplePositionV1): FractionV1 {
  return { numerator: BigInt(value.numerator), denominator: BigInt(value.denominator) };
}

function subtract(left: FractionV1, right: FractionV1): FractionV1 {
  const numerator = left.numerator * right.denominator
    - right.numerator * left.denominator;
  const denominator = left.denominator * right.denominator;
  const divisor = gcd(abs(numerator), denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function compare(left: FractionV1, right: FractionV1): number {
  const delta = left.numerator * right.denominator
    - right.numerator * left.denominator;
  return delta < BigInt(0) ? -1 : delta > BigInt(0) ? 1 : 0;
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

function normalizeStorage(
  privateStorage: MediaSourcePtsCadenceR2PrivateStorageScopeV1,
  client: MediaSourcePtsCadenceR2CommandClientV1,
): Readonly<{ bucketName: string; client: MediaSourcePtsCadenceR2CommandClientV1 }> {
  if (!privateStorage || privateStorage.browserRouteExposure !== 'NO_BROWSER_ROUTE'
    || privateStorage.bucketName === 'editron-cdn'
    || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(privateStorage.bucketName)
    || !privateStorage.storagePolicyVersion) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_PRIVATE_STORAGE_INVALID');
  }
  if (!client || typeof client.send !== 'function') {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_CLIENT_INVALID');
  }
  return { bucketName: privateStorage.bucketName, client };
}

function normalizePolicy(
  value: NativeMediaTimestampPreviewAudioSurfacePolicyV1,
): NativeMediaTimestampPreviewAudioSurfacePolicyV1 {
  if (!value
    || value.policyVersion !== NATIVE_MEDIA_TIMESTAMP_PREVIEW_AUDIO_SURFACE_POLICY_VERSION_V1
    || !Number.isSafeInteger(value.leaseTtlMs) || value.leaseTtlMs < 1_000
    || value.leaseTtlMs > ABSOLUTE_MAX_LEASE_TTL_MS
    || !Number.isSafeInteger(value.maxPcmBytes) || value.maxPcmBytes < 4
    || value.maxPcmBytes > ABSOLUTE_MAX_PCM_BYTES
    || !Number.isSafeInteger(value.maxSampleRate) || value.maxSampleRate < 1
    || value.maxSampleRate > 768_000
    || !Number.isSafeInteger(value.maxChannelCount) || value.maxChannelCount < 1
    || value.maxChannelCount > 32) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_POLICY_INVALID');
  }
  return Object.freeze({ ...value });
}

function normalizeLeaseScope(
  value: NativeMediaTimestampPreviewSurfaceLeaseScopeV1,
): NativeMediaTimestampPreviewSurfaceLeaseScopeV1 {
  if (!value || !value.projectRevision || value.projectRevision.schemaVersion !== 1
    || !Number.isSafeInteger(value.projectRevision.value)
    || value.projectRevision.value < 0) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_LEASE_SCOPE_INVALID');
  }
  return Object.freeze({
    userId: identifier(value.userId, 'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_USER_INVALID'),
    projectId: identifier(
      value.projectId,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_PROJECT_INVALID',
    ),
    sequenceId: identifier(
      value.sequenceId,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_SEQUENCE_INVALID',
    ),
    overlayId: identifier(
      value.overlayId,
      'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_OVERLAY_INVALID',
    ),
    projectRevision: Object.freeze({
      schemaVersion: 1 as const,
      value: value.projectRevision.value,
      compatibilityUpdatedAt: boundedText(
        value.projectRevision.compatibilityUpdatedAt,
        240,
        'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_REVISION_INVALID',
      ),
    }),
  });
}

async function readExactlyBoundedBytes(
  body: unknown,
  expectedByteLength: number,
  maximumByteLength: number,
): Promise<Uint8Array> {
  if (expectedByteLength < WAV_HEADER_BYTES || expectedByteLength > maximumByteLength) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_WAV_INVALID');
  }
  if (body instanceof Uint8Array) {
    if (body.byteLength !== expectedByteLength) {
      throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_BYTE_LENGTH_MISMATCH');
    }
    return body;
  }
  if (body && typeof body === 'object' && 'transformToByteArray' in body) {
    const transform = (body as { transformToByteArray?: unknown }).transformToByteArray;
    if (typeof transform === 'function') {
      return readExactlyBoundedBytes(
        await transform.call(body),
        expectedByteLength,
        maximumByteLength,
      );
    }
  }
  if (!body || typeof body !== 'object' || !(Symbol.asyncIterator in body)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_BODY_INVALID');
  }
  const output = new Uint8Array(expectedByteLength);
  let offset = 0;
  for await (const chunk of body as AsyncIterable<unknown>) {
    if (!(chunk instanceof Uint8Array) || offset + chunk.byteLength > output.byteLength) {
      throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_BYTE_LENGTH_MISMATCH');
    }
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (offset !== output.byteLength) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_BYTE_LENGTH_MISMATCH');
  }
  return output;
}

function assertMetadataSize(value: Record<string, string>): void {
  const bytes = Object.entries(value).reduce(
    (total, [key, entry]) => total
      + Buffer.byteLength(key, 'utf8')
      + Buffer.byteLength(entry, 'utf8'),
    0,
  );
  if (bytes > MAX_METADATA_BYTES) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_METADATA_TOO_LARGE');
  }
}

function normalizeHandle(value: unknown): string {
  if (typeof value !== 'string' || !HANDLE_PATTERN.test(value)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_HANDLE_INVALID');
  }
  return value;
}

function objectKey(audioHandle: string): string {
  const match = HANDLE_PATTERN.exec(normalizeHandle(audioHandle));
  return OBJECT_KEY_PREFIX + match![1] + '.wav';
}

function normalizeRandomIdentifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_RANDOM_IDENTIFIER_INVALID');
  }
  return value;
}

function writeAscii(output: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    output[offset + index] = value.charCodeAt(index);
  }
}

function ascii(value: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...value.subarray(offset, offset + length));
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function nativeMediaTimestampPreviewIdentitySha256V1(value: string): string {
  return digestText(identifier(value, 'NATIVE_MEDIA_PREVIEW_AUDIO_SURFACE_IDENTITY_INVALID'));
}

function digestText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
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

function encodeText(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,1024}$/.test(value)) throw new Error(code);
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    if (encodeText(decoded) !== value) throw new Error(code);
    return boundedText(decoded, 240, code);
  } catch {
    throw new Error(code);
  }
}

function nonNegativeIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,127})$/.test(value)) throw new Error(code);
  return BigInt(value).toString();
}

function positiveIntegerText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,127}$/.test(value)) throw new Error(code);
  return BigInt(value).toString();
}

function positiveSafeIntegerInRange(value: unknown, maximum: number, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum) {
    throw new Error(code);
  }
  return Number(value);
}

function validEpochMs(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(code);
  return Number(value);
}

function nonNegativeSafeInteger(value: unknown, code: string): number {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,15})$/.test(value)) throw new Error(code);
  return validEpochMs(Number(value), code);
}

function positiveIntegerTextInRange(value: unknown, maximum: number, code: string): number {
  const parsed = nonNegativeSafeInteger(value, code);
  if (parsed < 1 || parsed > maximum) throw new Error(code);
  return parsed;
}

async function deleteObjectBestEffort(
  input: Readonly<{ client: MediaSourcePtsCadenceR2CommandClientV1; bucketName: string }>,
  audioHandle: string,
): Promise<void> {
  try {
    await input.client.send(new DeleteObjectCommand({
      Bucket: input.bucketName,
      Key: objectKey(audioHandle),
    }));
  } catch {
    // The authenticated read remains fail-closed even if provider cleanup is delayed.
  }
}

function isPreconditionFailed(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return candidate.name === 'PreconditionFailed'
    || candidate.$metadata?.httpStatusCode === 412;
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return candidate.name === 'NoSuchKey'
    || candidate.name === 'NotFound'
    || candidate.$metadata?.httpStatusCode === 404;
}
