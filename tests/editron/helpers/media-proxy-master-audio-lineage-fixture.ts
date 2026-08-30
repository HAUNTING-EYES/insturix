import { createHash } from 'node:crypto';

import { hashEditronCanonicalJsonV1 }
  from '@/lib/editron/services/canonical-json-v1';
import {
  createMediaProxyMasterAudioLineagePolicyV1,
} from '@/lib/editron/services/media-proxy-master-audio-lineage-verifier-v1';
import {
  createMediaSourceAudioArtifactAssetRecordV1,
  createMediaSourceAudioArtifactAssetStateV1,
  type MediaSourceAudioArtifactAssetStateInputV1,
} from '@/lib/editron/services/media-source-audio-artifact-asset-owner-v1';
import { captureMediaSourceAudioAvailabilityEvidenceV1 }
  from '@/lib/editron/services/media-source-audio-availability-evidence-v1';
import type { MediaSourceAudioPrivateArtifactReaderV1 }
  from '@/lib/editron/services/media-source-audio-private-artifact-port-v1';
import {
  createMediaSourceAudioEpochMapArtifactReferenceV1,
  createMediaSourceAudioPcmChunkPlanV1,
  createMediaSourceAudioPcmChunkReferenceV1,
  createMediaSourceAudioPrivateArtifactManifestV1,
  MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
  serializeMediaSourceAudioPrivateArtifactManifestV1,
  type MediaSourceAudioPrivateArtifactPolicyV1,
} from '@/lib/editron/services/media-source-audio-private-artifact-v1';
import {
  createMediaSourceAudioSampleEpochMapV1,
  createMediaSourceAudioStreamBindingV1,
  MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_ADAPTER_VERSION_V1,
  serializeMediaSourceAudioSampleEpochMapV1,
  type MediaSourceAudioDecodedFrameEvidenceV1,
} from '@/lib/editron/services/media-source-audio-sample-epoch-map-v1';
import { createMediaProxyMasterTranscodeOutputProbeV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-output-probe-v1';
import {
  createMediaProxyMasterTranscodeCommandV1,
  createMediaProxyMasterTranscodePolicyV1,
  createMediaProxyMasterTrustedTranscodeReceiptV1,
  expectedMediaProxyMasterTranscodeR2ObjectKeyV1,
} from '@/lib/editron/services/media-proxy-master-trusted-transcode-v1';
import {
  createMediaSourceQualificationV1,
  type MediaSourceQualificationRecordV1,
} from '@/lib/editron/services/media-source-qualification-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import {
  createMediaProxyMasterRelationV1,
  createMediaSourceVersionV1,
  type MediaSourceVersionV1,
} from '@/lib/editron/services/media-source-version-v1';

const NOW = new Date('2026-08-31T10:00:00.000Z');
const ARTIFACT_PUBLISHED_AT = new Date('2026-08-31T10:02:30.000Z');
const FFPROBE_VERSION = 'ffprobe version 8.1';

export type AudioLineageFixtureOptions = Readonly<{
  tag?: string;
  observedMasterAudioStreamIndexes?: readonly number[];
  selectedMasterAudioStreamIndexes?: readonly number[];
  masterSampleRate?: string;
  proxySampleRate?: string;
  masterChannelLayout?: string;
  proxyChannelLayout?: string;
  proxySecondFramePtsDelta?: bigint;
  maxAudioStreams?: number;
  maxArtifactReads?: number;
}>;

export function buildMediaProxyMasterAudioLineageFixtureV1(
  options: AudioLineageFixtureOptions = {},
) {
  const tag = options.tag ?? 'audio-lineage';
  const observedMasterIndexes = options.observedMasterAudioStreamIndexes ?? [1];
  const selectedMasterIndexes = options.selectedMasterAudioStreamIndexes
    ?? observedMasterIndexes;
  const masterRate = options.masterSampleRate ?? '48000';
  const proxyRate = options.proxySampleRate ?? masterRate;
  const masterLayout = options.masterChannelLayout ?? 'stereo';
  const proxyLayout = options.proxyChannelLayout ?? masterLayout;
  const owner = { kind: 'USER' as const, userId: 'user-audio-lineage' };
  const assetId = `asset-${tag}`;
  const master = sourceVersion(tag, 'master', owner, assetId, 100_000);
  const masterQualification = measuredQualification({
    sourceVersion: master,
    role: 'master',
    streamIndexes: observedMasterIndexes,
    sampleRate: masterRate,
    channelLayout: masterLayout,
    startPts: '480000',
    durationTicks: '480000',
    codec: 'pcm_s16le',
  });
  const command = createMediaProxyMasterTranscodeCommandV1({
    transcodeJobId: `transcode-${tag}`,
    policy: createMediaProxyMasterTranscodePolicyV1({
      presentationPolicy: 'PRESERVE_ALL_DECODED_FRAMES_AND_TIMESTAMPS_V1',
      timestampOriginPolicy: 'SHIFT_SHARED_SOURCE_ORIGIN_TO_ZERO_V1',
      container: 'mp4',
      videoCodec: 'libx264',
      pixelFormat: 'yuv420p',
      scalingPolicy: 'FIT_WITHIN_NO_UPSCALE_EVEN_DIMENSIONS_V1',
      maximumWidth: 1_280,
      maximumHeight: 720,
      videoCrf: 23,
      videoPreset: 'fast',
      keyframeIntervalSeconds: 2,
      audioPolicy: 'PRESERVE_SELECTED_STREAM_COUNT_LAYOUT_AND_TIMESTAMPS_V1',
      audioCodec: 'aac',
      audioBitrateBitsPerSecond: 192_000,
      maxSourceBytes: 2_000_000,
      maxOutputBytes: 2_000_000,
      timeoutMs: 120_000,
    }),
    masterSourceVersion: master,
    masterTimeMap: {
      sourceVersionSha256: master.sourceVersionSha256,
      storageVersionSha256: master.storageVersion.storageVersionSha256,
      sourceBindingSha256: masterQualification.sourceBindingSha256!,
      technicalObservationSha256:
        masterQualification.observation!.observationSha256,
      sourcePtsCadenceMapStateSha256V3: hash(`${tag}-master-state`),
      mapBindingSha256: hash(`${tag}-master-map`),
      terminalReceiptSha256: hash(`${tag}-master-terminal`),
      verificationSha256: hash(`${tag}-master-verification`),
      epochIndexContentSha256: hash(`${tag}-master-epoch-index`),
      streamId: 'video-0',
      videoStreamIndex: 0,
      totalFrameCount: '300',
    },
    masterVideoStreamIndex: 0,
    masterAudioStreamIndexes: selectedMasterIndexes,
  });
  const proxyStorage = createMediaSourceStorageVersionV1({
    locator: {
      provider: 'R2',
      objectKey: expectedMediaProxyMasterTranscodeR2ObjectKeyV1({
        command,
        proxyContentSha256: hash(`${tag}-proxy-content`),
      }),
    },
    byteLength: 40_000,
    providerVersion: { kind: 'R2_ETAG', value: `etag-${tag}-proxy` },
  });
  const proxy = createMediaSourceVersionV1({
    owner,
    assetId,
    mediaKind: 'video',
    byteLength: proxyStorage.byteLength,
    contentSha256: hash(`${tag}-proxy-content`),
    storageVersion: proxyStorage,
  });
  const proxyIndexes = selectedMasterIndexes.map((_, index) => index + 1);
  const outputProbe = createMediaProxyMasterTranscodeOutputProbeV1({
    commandSha256: command.commandSha256,
    ffprobeVersion: FFPROBE_VERSION,
    proxyContentSha256: proxy.contentSha256,
    proxyByteLength: proxy.byteLength,
    container: 'mp4',
    formatNames: ['mov', 'mp4'],
    video: videoObservation(),
    audio: proxyIndexes.map((streamIndex) => ({
      streamIndex,
      codec: 'aac' as const,
      sampleRate: proxyRate,
      channelCount: 2,
      channelLayout: proxyLayout,
      sourceTimebase: { numerator: '1', denominator: proxyRate },
      sourceStartPts: '0',
      sourceDurationTicks: proxyRate === '48000' ? '480000' : '441000',
    })),
    probedAt: '2026-08-31T10:02:01.000Z',
  });
  const receipt = createMediaProxyMasterTrustedTranscodeReceiptV1({
    command,
    runtime: {
      workerImageDigest: hash(`${tag}-worker`),
      platform: 'linux-x64',
      ffmpegVersion: 'ffmpeg version 8.1',
      ffprobeVersion: FFPROBE_VERSION,
    },
    process: {
      startedAt: '2026-08-31T10:01:00.000Z',
      completedAt: '2026-08-31T10:02:00.000Z',
      exitCode: 0,
      stderrByteLength: 0,
      stderrSha256: hash(`${tag}-stderr`),
    },
    masterLocalFileEvidence: {
      sourceVersionSha256: master.sourceVersionSha256,
      storageVersionSha256: master.storageVersion.storageVersionSha256,
      byteLength: master.byteLength,
      contentSha256: master.contentSha256,
    },
    proxySourceVersion: proxy,
    outputProbe,
    outputVideoStreamIndex: 0,
    outputAudioStreamIndexes: proxyIndexes,
    completedAt: '2026-08-31T10:02:02.000Z',
  });
  const proxyQualification = measuredQualification({
    sourceVersion: proxy,
    role: 'proxy',
    streamIndexes: proxyIndexes,
    sampleRate: proxyRate,
    channelLayout: proxyLayout,
    startPts: '0',
    durationTicks: proxyRate === '48000' ? '480000' : '441000',
    codec: 'aac',
  });
  const artifacts = new Map<string, Readonly<{
    manifest: ReturnType<typeof createMediaSourceAudioPrivateArtifactManifestV1>;
    mapCanonicalJson: string;
  }>>();
  const masterEvidence = audioEvidence({
    sourceVersion: master,
    qualification: masterQualification,
    streamIndexes: observedMasterIndexes,
    frames: frames(masterRate, BigInt(480000), BigInt(0)),
    artifacts,
    tag: `${tag}-master`,
  });
  const proxyEvidence = audioEvidence({
    sourceVersion: proxy,
    qualification: proxyQualification,
    streamIndexes: proxyIndexes,
    frames: frames(
      proxyRate,
      BigInt(0),
      options.proxySecondFramePtsDelta ?? BigInt(0),
    ),
    artifacts,
    tag: `${tag}-proxy`,
  });
  const reader: MediaSourceAudioPrivateArtifactReaderV1 = {
    async readArtifactSet(reference) {
      const artifact = artifacts.get(reference.objectKey);
      if (!artifact) throw new Error('TEST_ARTIFACT_NOT_FOUND');
      return artifact;
    },
  };
  return {
    relation: createMediaProxyMasterRelationV1({ proxy, master }),
    trustedTranscodeReceipt: receipt,
    masterAudioAvailabilityEvidence: masterEvidence,
    proxyAudioAvailabilityEvidence: proxyEvidence,
    verificationPolicy: createMediaProxyMasterAudioLineagePolicyV1({
      policyVersion: `${tag}-policy-v1`,
      maxAudioStreams: options.maxAudioStreams ?? 8,
      maxArtifactReads: options.maxArtifactReads ?? 16,
    }),
    reader,
    verifiedAt: '2026-08-31T10:03:00.000Z',
    artifacts,
  };
}

function audioEvidence(input: Readonly<{
  sourceVersion: Readonly<MediaSourceVersionV1>;
  qualification: MediaSourceQualificationRecordV1;
  streamIndexes: readonly number[];
  frames: readonly MediaSourceAudioDecodedFrameEvidenceV1[];
  artifacts: Map<string, Readonly<{
    manifest: ReturnType<typeof createMediaSourceAudioPrivateArtifactManifestV1>;
    mapCanonicalJson: string;
  }>>;
  tag: string;
}>) {
  const asset: MediaSourceAudioArtifactAssetStateInputV1 = {
    assetId: input.sourceVersion.assetId,
    type: 'video',
    sourceVersionV1: input.sourceVersion,
    sourceQualificationV1: input.qualification,
  };
  if (input.streamIndexes.length === 0) {
    return captureMediaSourceAudioAvailabilityEvidenceV1(asset);
  }
  const records = input.streamIndexes.map((streamIndex) => {
    const binding = createMediaSourceAudioStreamBindingV1({
      sourceVersion: input.sourceVersion,
      qualification: input.qualification,
      audioStreamIndex: streamIndex,
    });
    const sampleFrames = input.frames.reduce(
      (total, frame) => total + BigInt(frame.decodedSampleFrameCount),
      BigInt(0),
    );
    const decodedByteLength = Number(sampleFrames * BigInt(binding.channelCount) * BigInt(4));
    const map = createMediaSourceAudioSampleEpochMapV1({
      binding,
      toolchain: {
        adapterVersion: MEDIA_SOURCE_AUDIO_SAMPLE_EPOCH_ADAPTER_VERSION_V1,
        ffmpegVersion: 'ffmpeg version 8.1',
        ffprobeVersion: FFPROBE_VERSION,
      },
      resourcePolicy: {
        policyVersion: `${input.tag}-decode-v1`,
        maxSourceBytes: 2_000_000,
        maxCanonicalJsonBytes: 100_000,
        maxDecodedFrameEntries: 100,
        maxEpochEntries: 100,
        maxDecodedSampleFrames: 1_000_000,
        maxDecodedPcmBytes: 10_000_000,
        timeoutMs: 10_000,
      },
      frames: input.frames,
      pcm: {
        decodedByteLength,
        decodedPcmSha256: hash(`${input.tag}-pcm-${streamIndex}`),
      },
    });
    const policy: MediaSourceAudioPrivateArtifactPolicyV1 = {
      policyVersion: MEDIA_SOURCE_AUDIO_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
      maxChunkBytes: 1_000_000,
      maxChunkCount: 16,
      maxManifestBytes: 100_000,
      maxReadBytes: 10_000_000,
    };
    const mapSerialization = serializeMediaSourceAudioSampleEpochMapV1(map);
    const epochMapArtifact = createMediaSourceAudioEpochMapArtifactReferenceV1({
      serialization: mapSerialization,
    });
    const pcmChunks = createMediaSourceAudioPcmChunkPlanV1({ map, policy }).map(
      (entry) => createMediaSourceAudioPcmChunkReferenceV1({
        map,
        planEntry: entry,
        contentSha256: hash(`${input.tag}-chunk-${streamIndex}-${entry.chunkIndex}`),
      }),
    );
    const manifest = createMediaSourceAudioPrivateArtifactManifestV1({
      map,
      epochMapArtifact,
      pcmChunks,
      policy,
    });
    const manifestSerialization =
      serializeMediaSourceAudioPrivateArtifactManifestV1(manifest);
    input.artifacts.set(manifestSerialization.reference.objectKey, {
      manifest,
      mapCanonicalJson: mapSerialization.canonicalJson,
    });
    return createMediaSourceAudioArtifactAssetRecordV1({
      asset,
      mapSerialization,
      manifestSerialization,
      publishedAt: ARTIFACT_PUBLISHED_AT,
    });
  });
  return captureMediaSourceAudioAvailabilityEvidenceV1({
    ...asset,
    ...createMediaSourceAudioArtifactAssetStateV1({ asset, records }),
  });
}

function measuredQualification(input: Readonly<{
  sourceVersion: Readonly<MediaSourceVersionV1>;
  role: string;
  streamIndexes: readonly number[];
  sampleRate: string;
  channelLayout: string;
  startPts: string;
  durationTicks: string;
  codec: string;
}>): MediaSourceQualificationRecordV1 {
  const qualificationTime = input.role === 'proxy'
    ? new Date('2026-08-31T10:02:10.000Z')
    : NOW;
  const created = createMediaSourceQualificationV1({
    asset: {
      assetId: input.sourceVersion.assetId,
      source: 'user-upload',
      r2Key: input.sourceVersion.storageVersion.locator.objectKey,
    },
    now: qualificationTime,
  });
  if (created.disposition !== 'CREATED') throw new Error('TEST_QUALIFICATION_INVALID');
  const observationMaterial = {
    schemaVersion: 1 as const,
    kind: 'EDITRON_MEDIA_SOURCE_PROBE_V1' as const,
    probeVersion: FFPROBE_VERSION,
    formatName: 'mov',
    durationMilliseconds: 10_000,
    startTimeMilliseconds: Number(BigInt(input.startPts) * BigInt(1000)
      / BigInt(input.sampleRate)),
    videoStreams: [{
      streamIndex: 0,
      codec: 'h264',
      codedWidth: 1280,
      codedHeight: 720,
      pixelFormat: 'yuv420p',
      sourceTimebase: { numerator: '1', denominator: '90000' },
      sourceStartPts: '0',
      sourceDurationTicks: '900000',
      averageFrameRate: { numerator: '30', denominator: '1' },
      realFrameRate: { numerator: '30', denominator: '1' },
      frameCount: '300',
      colorSpace: 'bt709',
      colorTransfer: 'bt709',
      colorPrimaries: 'bt709',
      colorRange: 'tv',
      timecode: null,
      reelId: null,
    }],
    audioStreams: input.streamIndexes.map((streamIndex) => ({
      streamIndex,
      codec: input.codec,
      sampleRate: input.sampleRate,
      channelCount: 2,
      channelLayout: input.channelLayout,
      sourceTimebase: { numerator: '1', denominator: input.sampleRate },
      sourceStartPts: input.startPts,
      sourceDurationTicks: input.durationTicks,
    })),
  };
  return {
    ...created.record,
    status: 'MEASURED_TECHNICAL',
    attemptCount: 1,
    startedAt: qualificationTime.toISOString(),
    completedAt: qualificationTime.toISOString(),
    storageVersion: input.sourceVersion.storageVersion,
    observation: {
      ...observationMaterial,
      observationSha256: hashEditronCanonicalJsonV1(observationMaterial),
    },
  };
}

function sourceVersion(
  tag: string,
  role: string,
  owner: Readonly<{ kind: 'USER'; userId: string }>,
  assetId: string,
  byteLength: number,
) {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: `tests/${tag}-${role}.mov` },
    byteLength,
    providerVersion: { kind: 'R2_ETAG', value: `etag-${tag}-${role}` },
  });
  return createMediaSourceVersionV1({
    owner,
    assetId,
    mediaKind: 'video',
    byteLength,
    contentSha256: hash(`${tag}-${role}-content`),
    storageVersion,
  });
}

function frames(
  sampleRate: string,
  start: bigint,
  secondFrameDelta: bigint,
): readonly MediaSourceAudioDecodedFrameEvidenceV1[] {
  const half = BigInt(sampleRate) * BigInt(5);
  return [
    { presentationTimestampTicks: start.toString(), decodedSampleFrameCount: half.toString() },
    {
      presentationTimestampTicks: (start + half + secondFrameDelta).toString(),
      decodedSampleFrameCount: half.toString(),
    },
  ];
}

function videoObservation() {
  return {
    streamIndex: 0 as const,
    codec: 'h264' as const,
    pixelFormat: 'yuv420p' as const,
    codedWidth: 1280,
    codedHeight: 720,
    sourceTimebase: { numerator: '1', denominator: '90000' },
    sourceStartPts: '0',
    sourceDurationTicks: '900000',
    frameCount: '300',
  };
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
