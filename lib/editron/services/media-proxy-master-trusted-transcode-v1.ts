import path from 'node:path';

import {
  canonicalizeEditronJsonV1,
  cloneCanonicalEditronJsonV1,
  deepFreezeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';
import type {
  VerifiedMediaSourceLocalFileEvidenceV1,
} from './verified-media-source-local-file-v1';
import {
  assertMediaSourceVersionV1,
  type MediaSourceOwnerV1,
  type MediaSourceVersionV1,
} from './media-source-version-v1';
import type {
  MediaProxyMasterTimeMapReferenceV1,
  MediaProxyMasterTimeMappingV1,
} from './media-proxy-master-time-mapping-v1';

export const MEDIA_PROXY_MASTER_TRANSCODE_POLICY_KIND_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_POLICY_V1' as const;
export const MEDIA_PROXY_MASTER_TRANSCODE_COMMAND_KIND_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_COMMAND_V1' as const;
export const MEDIA_PROXY_MASTER_TRUSTED_TRANSCODE_RECEIPT_KIND_V1 =
  'EDITRON_MEDIA_PROXY_MASTER_TRUSTED_TRANSCODE_RECEIPT_V1' as const;
export const MEDIA_PROXY_MASTER_TRANSCODE_POLICY_VERSION_V1 =
  'editron-media-proxy-master-transcode-policy-v1' as const;

export const MEDIA_PROXY_MASTER_INPUT_PLACEHOLDER_V1 =
  '$EDITRON_MASTER_INPUT_V1' as const;
export const MEDIA_PROXY_MASTER_OUTPUT_PLACEHOLDER_V1 =
  '$EDITRON_PROXY_OUTPUT_V1' as const;

const MAX_BYTES = Number.MAX_SAFE_INTEGER;
const MAX_TIMEOUT_MS = 24 * 60 * 60 * 1_000;
const MAX_STREAMS = 64;
const MAX_DIAGNOSTIC_BYTES = 64 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/;

export type MediaProxyMasterTranscodePolicyV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_TRANSCODE_POLICY_KIND_V1;
  policyVersion: typeof MEDIA_PROXY_MASTER_TRANSCODE_POLICY_VERSION_V1;
  presentationPolicy: 'PRESERVE_ALL_DECODED_FRAMES_AND_TIMESTAMPS_V1';
  timestampOriginPolicy: 'SHIFT_SHARED_SOURCE_ORIGIN_TO_ZERO_V1';
  container: 'mp4';
  videoCodec: 'libx264';
  pixelFormat: 'yuv420p';
  scalingPolicy: 'FIT_WITHIN_NO_UPSCALE_EVEN_DIMENSIONS_V1';
  maximumWidth: number;
  maximumHeight: number;
  videoCrf: number;
  videoPreset: 'veryfast' | 'faster' | 'fast' | 'medium';
  keyframeIntervalSeconds: number;
  audioPolicy: 'PRESERVE_SELECTED_STREAM_COUNT_LAYOUT_AND_TIMESTAMPS_V1';
  audioCodec: 'aac';
  audioBitrateBitsPerSecond: number;
  maxSourceBytes: number;
  maxOutputBytes: number;
  timeoutMs: number;
  policySha256: string;
}>;

type CreatePolicyInputV1 = Omit<
  MediaProxyMasterTranscodePolicyV1,
  'schemaVersion' | 'kind' | 'policyVersion' | 'policySha256'
>;

export type MediaProxyMasterTranscodeCommandV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_TRANSCODE_COMMAND_KIND_V1;
  transcodeJobId: string;
  policy: MediaProxyMasterTranscodePolicyV1;
  masterSourceVersion: Readonly<MediaSourceVersionV1>;
  masterTimeMap: MediaProxyMasterTimeMapReferenceV1;
  masterVideoStreamIndex: number;
  masterAudioStreamIndexes: readonly number[];
  executableRole: 'WORKER_BOUND_FFMPEG';
  argumentTemplate: readonly string[];
  commandSha256: string;
}>;

export type MediaProxyMasterTrustedTranscodeReceiptV1 = Readonly<{
  schemaVersion: 1;
  kind: typeof MEDIA_PROXY_MASTER_TRUSTED_TRANSCODE_RECEIPT_KIND_V1;
  disposition: 'TRUSTED_SERVER_TRANSCODE_COMPLETED';
  command: MediaProxyMasterTranscodeCommandV1;
  runtime: Readonly<{
    workerImageDigest: string;
    platform: string;
    ffmpegVersion: string;
    ffprobeVersion: string;
    runtimeReceiptSha256: string;
  }>;
  process: Readonly<{
    startedAt: string;
    completedAt: string;
    exitCode: 0;
    stderrByteLength: number;
    stderrSha256: string;
    commandSha256: string;
    runtimeReceiptSha256: string;
    processReceiptSha256: string;
  }>;
  masterDecode: Readonly<{
    sourceVersionSha256: string;
    storageVersionSha256: string;
    contentSha256: string;
    localFileEvidence: VerifiedMediaSourceLocalFileEvidenceV1;
    timeMapVerificationSha256: string;
    epochIndexContentSha256: string;
    totalFrameCount: string;
    videoStreamIndex: number;
    audioStreamIndexes: readonly number[];
    commandSha256: string;
    processReceiptSha256: string;
    masterDecodeReceiptSha256: string;
  }>;
  proxyEncode: Readonly<{
    sourceVersion: Readonly<MediaSourceVersionV1>;
    outputVideoStreamIndex: 0;
    outputAudioStreamIndexes: readonly number[];
    commandSha256: string;
    processReceiptSha256: string;
    proxyEncodeReceiptSha256: string;
  }>;
  completedAt: string;
  receiptSha256: string;
}>;

type RuntimeInputV1 = Omit<
  MediaProxyMasterTrustedTranscodeReceiptV1['runtime'],
  'runtimeReceiptSha256'
>;
type ProcessInputV1 = Omit<
  MediaProxyMasterTrustedTranscodeReceiptV1['process'],
  'commandSha256' | 'runtimeReceiptSha256' | 'processReceiptSha256'
>;
type MappingLineageInputV1 = Omit<
  MediaProxyMasterTimeMappingV1['lineage'],
  'lineageReceiptSha256'
>;

export function createMediaProxyMasterTranscodePolicyV1(
  input: CreatePolicyInputV1,
): MediaProxyMasterTranscodePolicyV1 {
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_TRANSCODE_POLICY_KIND_V1,
    policyVersion: MEDIA_PROXY_MASTER_TRANSCODE_POLICY_VERSION_V1,
    presentationPolicy: exact(
      input.presentationPolicy,
      'PRESERVE_ALL_DECODED_FRAMES_AND_TIMESTAMPS_V1',
      'MEDIA_PROXY_MASTER_TRANSCODE_PRESENTATION_POLICY_INVALID',
    ),
    timestampOriginPolicy: exact(
      input.timestampOriginPolicy,
      'SHIFT_SHARED_SOURCE_ORIGIN_TO_ZERO_V1',
      'MEDIA_PROXY_MASTER_TRANSCODE_TIMESTAMP_POLICY_INVALID',
    ),
    container: exact(
      input.container, 'mp4', 'MEDIA_PROXY_MASTER_TRANSCODE_CONTAINER_INVALID',
    ),
    videoCodec: exact(
      input.videoCodec, 'libx264', 'MEDIA_PROXY_MASTER_TRANSCODE_VIDEO_CODEC_INVALID',
    ),
    pixelFormat: exact(
      input.pixelFormat, 'yuv420p', 'MEDIA_PROXY_MASTER_TRANSCODE_PIXEL_FORMAT_INVALID',
    ),
    scalingPolicy: exact(
      input.scalingPolicy,
      'FIT_WITHIN_NO_UPSCALE_EVEN_DIMENSIONS_V1',
      'MEDIA_PROXY_MASTER_TRANSCODE_SCALING_POLICY_INVALID',
    ),
    maximumWidth: positiveSafeInteger(
      input.maximumWidth, 16_384, 'MEDIA_PROXY_MASTER_TRANSCODE_WIDTH_INVALID',
    ),
    maximumHeight: positiveSafeInteger(
      input.maximumHeight, 16_384, 'MEDIA_PROXY_MASTER_TRANSCODE_HEIGHT_INVALID',
    ),
    videoCrf: integerRange(
      input.videoCrf, 0, 51, 'MEDIA_PROXY_MASTER_TRANSCODE_CRF_INVALID',
    ),
    videoPreset: videoPreset(input.videoPreset),
    keyframeIntervalSeconds: positiveSafeInteger(
      input.keyframeIntervalSeconds,
      60,
      'MEDIA_PROXY_MASTER_TRANSCODE_KEYFRAME_INTERVAL_INVALID',
    ),
    audioPolicy: exact(
      input.audioPolicy,
      'PRESERVE_SELECTED_STREAM_COUNT_LAYOUT_AND_TIMESTAMPS_V1',
      'MEDIA_PROXY_MASTER_TRANSCODE_AUDIO_POLICY_INVALID',
    ),
    audioCodec: exact(
      input.audioCodec, 'aac', 'MEDIA_PROXY_MASTER_TRANSCODE_AUDIO_CODEC_INVALID',
    ),
    audioBitrateBitsPerSecond: positiveSafeInteger(
      input.audioBitrateBitsPerSecond,
      10_000_000,
      'MEDIA_PROXY_MASTER_TRANSCODE_AUDIO_BITRATE_INVALID',
    ),
    maxSourceBytes: positiveSafeInteger(
      input.maxSourceBytes, MAX_BYTES, 'MEDIA_PROXY_MASTER_TRANSCODE_SOURCE_LIMIT_INVALID',
    ),
    maxOutputBytes: positiveSafeInteger(
      input.maxOutputBytes, MAX_BYTES, 'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_LIMIT_INVALID',
    ),
    timeoutMs: positiveSafeInteger(
      input.timeoutMs, MAX_TIMEOUT_MS, 'MEDIA_PROXY_MASTER_TRANSCODE_TIMEOUT_INVALID',
    ),
  };
  return frozen({ ...material, policySha256: hashEditronCanonicalJsonV1(material) });
}

export function assertMediaProxyMasterTranscodePolicyV1(
  value: unknown,
): MediaProxyMasterTranscodePolicyV1 {
  const record = object(value, 'MEDIA_PROXY_MASTER_TRANSCODE_POLICY_INVALID');
  exactKeys(record, [
    'schemaVersion', 'kind', 'policyVersion', 'presentationPolicy',
    'timestampOriginPolicy', 'container', 'videoCodec', 'pixelFormat',
    'scalingPolicy', 'maximumWidth', 'maximumHeight', 'videoCrf',
    'videoPreset', 'keyframeIntervalSeconds', 'audioPolicy', 'audioCodec',
    'audioBitrateBitsPerSecond', 'maxSourceBytes', 'maxOutputBytes',
    'timeoutMs', 'policySha256',
  ], 'MEDIA_PROXY_MASTER_TRANSCODE_POLICY_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_PROXY_MASTER_TRANSCODE_POLICY_KIND_V1
    || record.policyVersion !== MEDIA_PROXY_MASTER_TRANSCODE_POLICY_VERSION_V1) {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_POLICY_IDENTITY_INVALID');
  }
  const rebuilt = createMediaProxyMasterTranscodePolicyV1(
    record as unknown as CreatePolicyInputV1,
  );
  if (sha256(record.policySha256, 'MEDIA_PROXY_MASTER_TRANSCODE_POLICY_HASH_INVALID')
    !== rebuilt.policySha256) {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_POLICY_HASH_MISMATCH');
  }
  return rebuilt;
}

/** Owns the only V1 FFmpeg form; callers supply evidence and stream choices. */
export function createMediaProxyMasterTranscodeCommandV1(input: Readonly<{
  transcodeJobId: string;
  policy: MediaProxyMasterTranscodePolicyV1;
  masterSourceVersion: Readonly<MediaSourceVersionV1>;
  masterTimeMap: MediaProxyMasterTimeMapReferenceV1;
  masterVideoStreamIndex: number;
  masterAudioStreamIndexes: readonly number[];
}>): MediaProxyMasterTranscodeCommandV1 {
  const transcodeJobId = identifier(
    input.transcodeJobId,
    'MEDIA_PROXY_MASTER_TRANSCODE_JOB_ID_INVALID',
  );
  const policy = assertMediaProxyMasterTranscodePolicyV1(input.policy);
  const masterSourceVersion = assertMediaSourceVersionV1(input.masterSourceVersion);
  if (masterSourceVersion.mediaKind !== 'video') {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_VIDEO_SOURCE_REQUIRED');
  }
  const masterTimeMap = normalizeTimeMap(input.masterTimeMap);
  const masterVideoStreamIndex = nonNegativeSafeInteger(
    input.masterVideoStreamIndex,
    'MEDIA_PROXY_MASTER_TRANSCODE_VIDEO_STREAM_INVALID',
  );
  const masterAudioStreamIndexes = streamIndexes(
    input.masterAudioStreamIndexes,
    masterVideoStreamIndex,
  );
  if (masterTimeMap.sourceVersionSha256 !== masterSourceVersion.sourceVersionSha256
    || masterTimeMap.storageVersionSha256
      !== masterSourceVersion.storageVersion.storageVersionSha256
    || masterTimeMap.videoStreamIndex !== masterVideoStreamIndex) {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_MASTER_TIME_SCOPE_MISMATCH');
  }
  const argumentTemplate = commandArguments({
    policy,
    masterVideoStreamIndex,
    masterAudioStreamIndexes,
  });
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_TRANSCODE_COMMAND_KIND_V1,
    transcodeJobId,
    policy,
    masterSourceVersion,
    masterTimeMap,
    masterVideoStreamIndex,
    masterAudioStreamIndexes,
    executableRole: 'WORKER_BOUND_FFMPEG' as const,
    argumentTemplate,
  };
  return frozen({ ...material, commandSha256: hashEditronCanonicalJsonV1(material) });
}

export function assertMediaProxyMasterTranscodeCommandV1(
  value: unknown,
): MediaProxyMasterTranscodeCommandV1 {
  const record = object(value, 'MEDIA_PROXY_MASTER_TRANSCODE_COMMAND_INVALID');
  exactKeys(record, [
    'schemaVersion', 'kind', 'transcodeJobId', 'policy', 'masterSourceVersion',
    'masterTimeMap', 'masterVideoStreamIndex', 'masterAudioStreamIndexes',
    'executableRole', 'argumentTemplate', 'commandSha256',
  ], 'MEDIA_PROXY_MASTER_TRANSCODE_COMMAND_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_PROXY_MASTER_TRANSCODE_COMMAND_KIND_V1
    || record.executableRole !== 'WORKER_BOUND_FFMPEG') {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_COMMAND_IDENTITY_INVALID');
  }
  const rebuilt = createMediaProxyMasterTranscodeCommandV1({
    transcodeJobId: record.transcodeJobId as string,
    policy: record.policy as MediaProxyMasterTranscodePolicyV1,
    masterSourceVersion: record.masterSourceVersion as MediaSourceVersionV1,
    masterTimeMap: record.masterTimeMap as MediaProxyMasterTimeMapReferenceV1,
    masterVideoStreamIndex: record.masterVideoStreamIndex as number,
    masterAudioStreamIndexes: record.masterAudioStreamIndexes as number[],
  });
  if (canonicalizeEditronJsonV1(record.argumentTemplate)
      !== canonicalizeEditronJsonV1(rebuilt.argumentTemplate)
    || sha256(record.commandSha256, 'MEDIA_PROXY_MASTER_TRANSCODE_COMMAND_HASH_INVALID')
      !== rebuilt.commandSha256) {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_COMMAND_HASH_MISMATCH');
  }
  return rebuilt;
}

/** Replaces only the two inert path placeholders; no shell is involved. */
export function materializeMediaProxyMasterTranscodeArgumentsV1(input: Readonly<{
  command: MediaProxyMasterTranscodeCommandV1;
  masterInputPath: string;
  proxyOutputPath: string;
}>): readonly string[] {
  const command = assertMediaProxyMasterTranscodeCommandV1(input.command);
  const masterInputPath = absolutePath(
    input.masterInputPath,
    'MEDIA_PROXY_MASTER_TRANSCODE_MASTER_PATH_INVALID',
  );
  const proxyOutputPath = absolutePath(
    input.proxyOutputPath,
    'MEDIA_PROXY_MASTER_TRANSCODE_PROXY_PATH_INVALID',
  );
  if (masterInputPath === proxyOutputPath) {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_PATH_COLLISION');
  }
  return frozen(command.argumentTemplate.map((argument) => {
    if (argument === MEDIA_PROXY_MASTER_INPUT_PLACEHOLDER_V1) return masterInputPath;
    if (argument === MEDIA_PROXY_MASTER_OUTPUT_PLACEHOLDER_V1) return proxyOutputPath;
    return argument;
  }));
}

export function expectedMediaProxyMasterTranscodeR2ObjectKeyV1(input: Readonly<{
  command: MediaProxyMasterTranscodeCommandV1;
  proxyContentSha256: string;
}>): string {
  const command = assertMediaProxyMasterTranscodeCommandV1(input.command);
  const proxyContentSha256 = sha256(
    input.proxyContentSha256,
    'MEDIA_PROXY_MASTER_TRANSCODE_PROXY_CONTENT_HASH_INVALID',
  );
  const scopeSha256 = hashEditronCanonicalJsonV1({
    owner: command.masterSourceVersion.owner,
    assetId: command.masterSourceVersion.assetId,
    masterSourceVersionSha256: command.masterSourceVersion.sourceVersionSha256,
    commandSha256: command.commandSha256,
  });
  return `editron_proxy_v1_${scopeSha256}_${proxyContentSha256}.mp4`;
}

export function createMediaProxyMasterTrustedTranscodeReceiptV1(input: Readonly<{
  command: MediaProxyMasterTranscodeCommandV1;
  runtime: RuntimeInputV1;
  process: ProcessInputV1;
  masterLocalFileEvidence: VerifiedMediaSourceLocalFileEvidenceV1;
  proxySourceVersion: Readonly<MediaSourceVersionV1>;
  outputVideoStreamIndex: number;
  outputAudioStreamIndexes: readonly number[];
  completedAt: string;
}>): MediaProxyMasterTrustedTranscodeReceiptV1 {
  const command = assertMediaProxyMasterTranscodeCommandV1(input.command);
  const runtimeMaterial = normalizeRuntime(input.runtime);
  const runtime = frozen({
    ...runtimeMaterial,
    runtimeReceiptSha256: hashEditronCanonicalJsonV1(runtimeMaterial),
  });
  const processMaterial = normalizeProcess(input.process, command, runtime);
  const process = frozen({
    ...processMaterial,
    processReceiptSha256: hashEditronCanonicalJsonV1(processMaterial),
  });
  const completedAt = isoInstant(
    input.completedAt,
    'MEDIA_PROXY_MASTER_TRANSCODE_COMPLETED_AT_INVALID',
  );
  if (completedAt !== process.completedAt) {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_COMPLETION_MISMATCH');
  }
  const localFileEvidence = normalizeLocalFileEvidence(
    input.masterLocalFileEvidence,
    command.masterSourceVersion,
  );
  const masterDecodeMaterial = {
    sourceVersionSha256: command.masterSourceVersion.sourceVersionSha256,
    storageVersionSha256:
      command.masterSourceVersion.storageVersion.storageVersionSha256,
    contentSha256: command.masterSourceVersion.contentSha256,
    localFileEvidence,
    timeMapVerificationSha256: command.masterTimeMap.verificationSha256,
    epochIndexContentSha256: command.masterTimeMap.epochIndexContentSha256,
    totalFrameCount: command.masterTimeMap.totalFrameCount,
    videoStreamIndex: command.masterVideoStreamIndex,
    audioStreamIndexes: command.masterAudioStreamIndexes,
    commandSha256: command.commandSha256,
    processReceiptSha256: process.processReceiptSha256,
  };
  const masterDecode = frozen({
    ...masterDecodeMaterial,
    masterDecodeReceiptSha256: hashEditronCanonicalJsonV1(masterDecodeMaterial),
  });

  const proxySourceVersion = assertMediaSourceVersionV1(input.proxySourceVersion);
  assertProxyScope(command, proxySourceVersion);
  const outputVideoStreamIndex = exactNumber(
    input.outputVideoStreamIndex,
    0,
    'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_VIDEO_STREAM_INVALID',
  );
  const outputAudioStreamIndexes = sequentialOutputAudioStreams(
    input.outputAudioStreamIndexes,
    command.masterAudioStreamIndexes.length,
  );
  const proxyEncodeMaterial = {
    sourceVersion: proxySourceVersion,
    outputVideoStreamIndex,
    outputAudioStreamIndexes,
    commandSha256: command.commandSha256,
    processReceiptSha256: process.processReceiptSha256,
  };
  const proxyEncode = frozen({
    ...proxyEncodeMaterial,
    proxyEncodeReceiptSha256: hashEditronCanonicalJsonV1(proxyEncodeMaterial),
  });
  const material = {
    schemaVersion: 1 as const,
    kind: MEDIA_PROXY_MASTER_TRUSTED_TRANSCODE_RECEIPT_KIND_V1,
    disposition: 'TRUSTED_SERVER_TRANSCODE_COMPLETED' as const,
    command,
    runtime,
    process,
    masterDecode,
    proxyEncode,
    completedAt,
  };
  return frozen({ ...material, receiptSha256: hashEditronCanonicalJsonV1(material) });
}

export function assertMediaProxyMasterTrustedTranscodeReceiptV1(
  value: unknown,
): MediaProxyMasterTrustedTranscodeReceiptV1 {
  const record = object(value, 'MEDIA_PROXY_MASTER_TRANSCODE_RECEIPT_INVALID');
  exactKeys(record, [
    'schemaVersion', 'kind', 'disposition', 'command', 'runtime', 'process',
    'masterDecode', 'proxyEncode', 'completedAt', 'receiptSha256',
  ], 'MEDIA_PROXY_MASTER_TRANSCODE_RECEIPT_FIELDS_INVALID');
  if (record.schemaVersion !== 1
    || record.kind !== MEDIA_PROXY_MASTER_TRUSTED_TRANSCODE_RECEIPT_KIND_V1
    || record.disposition !== 'TRUSTED_SERVER_TRANSCODE_COMPLETED') {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_RECEIPT_IDENTITY_INVALID');
  }
  const runtime = object(record.runtime, 'MEDIA_PROXY_MASTER_TRANSCODE_RUNTIME_INVALID');
  const process = object(record.process, 'MEDIA_PROXY_MASTER_TRANSCODE_PROCESS_INVALID');
  const masterDecode = object(
    record.masterDecode,
    'MEDIA_PROXY_MASTER_TRANSCODE_MASTER_DECODE_INVALID',
  );
  const proxyEncode = object(
    record.proxyEncode,
    'MEDIA_PROXY_MASTER_TRANSCODE_PROXY_ENCODE_INVALID',
  );
  const rebuilt = createMediaProxyMasterTrustedTranscodeReceiptV1({
    command: record.command as MediaProxyMasterTranscodeCommandV1,
    runtime: {
      workerImageDigest: runtime.workerImageDigest as string,
      platform: runtime.platform as string,
      ffmpegVersion: runtime.ffmpegVersion as string,
      ffprobeVersion: runtime.ffprobeVersion as string,
    },
    process: {
      startedAt: process.startedAt as string,
      completedAt: process.completedAt as string,
      exitCode: process.exitCode as 0,
      stderrByteLength: process.stderrByteLength as number,
      stderrSha256: process.stderrSha256 as string,
    },
    masterLocalFileEvidence:
      masterDecode.localFileEvidence as VerifiedMediaSourceLocalFileEvidenceV1,
    proxySourceVersion: proxyEncode.sourceVersion as MediaSourceVersionV1,
    outputVideoStreamIndex: proxyEncode.outputVideoStreamIndex as number,
    outputAudioStreamIndexes: proxyEncode.outputAudioStreamIndexes as number[],
    completedAt: record.completedAt as string,
  });
  if (canonicalizeEditronJsonV1(record) !== canonicalizeEditronJsonV1(rebuilt)
    || sha256(record.receiptSha256, 'MEDIA_PROXY_MASTER_TRANSCODE_RECEIPT_HASH_INVALID')
      !== rebuilt.receiptSha256) {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_RECEIPT_HASH_MISMATCH');
  }
  return rebuilt;
}

export function mediaProxyMasterMappingLineageFromTranscodeReceiptV1(
  value: unknown,
): MappingLineageInputV1 {
  const receipt = assertMediaProxyMasterTrustedTranscodeReceiptV1(value);
  return frozen({
    kind: 'TRUSTED_SERVER_TRANSCODE_LINEAGE_V1' as const,
    transcodeJobId: receipt.command.transcodeJobId,
    transcodePolicyVersion: receipt.command.policy.policyVersion,
    ffmpegVersion: receipt.runtime.ffmpegVersion,
    commandSha256: receipt.command.commandSha256,
    masterDecodeReceiptSha256: receipt.masterDecode.masterDecodeReceiptSha256,
    proxyEncodeReceiptSha256: receipt.proxyEncode.proxyEncodeReceiptSha256,
  });
}

function commandArguments(input: Readonly<{
  policy: MediaProxyMasterTranscodePolicyV1;
  masterVideoStreamIndex: number;
  masterAudioStreamIndexes: readonly number[];
}>): readonly string[] {
  const scale = `scale=w=min(${String(input.policy.maximumWidth)}\\,iw):h=min(${String(input.policy.maximumHeight)}\\,ih):force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1`;
  const audioMaps = input.masterAudioStreamIndexes.flatMap((streamIndex) => [
    '-map', `0:${String(streamIndex)}`,
  ]);
  return frozen([
    '-hide_banner', '-loglevel', 'error', '-nostdin',
    '-copyts', '-start_at_zero',
    '-i', MEDIA_PROXY_MASTER_INPUT_PLACEHOLDER_V1,
    '-map', `0:${String(input.masterVideoStreamIndex)}`,
    ...audioMaps,
    '-map_metadata', '-1', '-map_chapters', '-1', '-sn', '-dn',
    '-vf', scale,
    '-c:v', input.policy.videoCodec,
    '-preset', input.policy.videoPreset,
    '-crf', String(input.policy.videoCrf),
    '-pix_fmt', input.policy.pixelFormat,
    '-fps_mode:v', 'passthrough',
    '-enc_time_base:v', 'demux',
    '-force_key_frames',
    `expr:gte(t,n_forced*${String(input.policy.keyframeIntervalSeconds)})`,
    ...(input.masterAudioStreamIndexes.length === 0
      ? ['-an']
      : [
          '-c:a', input.policy.audioCodec,
          '-b:a', String(input.policy.audioBitrateBitsPerSecond),
        ]),
    '-avoid_negative_ts', 'disabled',
    '-movflags', '+faststart',
    '-f', input.policy.container,
    '-y', MEDIA_PROXY_MASTER_OUTPUT_PLACEHOLDER_V1,
  ]);
}

function normalizeTimeMap(value: unknown): MediaProxyMasterTimeMapReferenceV1 {
  const record = object(value, 'MEDIA_PROXY_MASTER_TRANSCODE_TIME_MAP_INVALID');
  exactKeys(record, [
    'sourceVersionSha256', 'storageVersionSha256', 'sourceBindingSha256',
    'technicalObservationSha256', 'sourcePtsCadenceMapStateSha256V3',
    'mapBindingSha256', 'terminalReceiptSha256', 'verificationSha256',
    'epochIndexContentSha256', 'streamId', 'videoStreamIndex', 'totalFrameCount',
  ], 'MEDIA_PROXY_MASTER_TRANSCODE_TIME_MAP_FIELDS_INVALID');
  const videoStreamIndex = nonNegativeSafeInteger(
    record.videoStreamIndex,
    'MEDIA_PROXY_MASTER_TRANSCODE_TIME_MAP_STREAM_INDEX_INVALID',
  );
  const streamId = identifier(
    record.streamId,
    'MEDIA_PROXY_MASTER_TRANSCODE_TIME_MAP_STREAM_INVALID',
  );
  if (streamId !== `video-${String(videoStreamIndex)}`) {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_TIME_MAP_STREAM_MISMATCH');
  }
  return frozen({
    sourceVersionSha256: sha256(record.sourceVersionSha256, 'MEDIA_PROXY_MASTER_TRANSCODE_TIME_MAP_SOURCE_INVALID'),
    storageVersionSha256: sha256(record.storageVersionSha256, 'MEDIA_PROXY_MASTER_TRANSCODE_TIME_MAP_STORAGE_INVALID'),
    sourceBindingSha256: sha256(record.sourceBindingSha256, 'MEDIA_PROXY_MASTER_TRANSCODE_TIME_MAP_BINDING_INVALID'),
    technicalObservationSha256: sha256(record.technicalObservationSha256, 'MEDIA_PROXY_MASTER_TRANSCODE_TIME_MAP_OBSERVATION_INVALID'),
    sourcePtsCadenceMapStateSha256V3: sha256(record.sourcePtsCadenceMapStateSha256V3, 'MEDIA_PROXY_MASTER_TRANSCODE_TIME_MAP_STATE_INVALID'),
    mapBindingSha256: sha256(record.mapBindingSha256, 'MEDIA_PROXY_MASTER_TRANSCODE_TIME_MAP_MAP_BINDING_INVALID'),
    terminalReceiptSha256: sha256(record.terminalReceiptSha256, 'MEDIA_PROXY_MASTER_TRANSCODE_TIME_MAP_TERMINAL_INVALID'),
    verificationSha256: sha256(record.verificationSha256, 'MEDIA_PROXY_MASTER_TRANSCODE_TIME_MAP_VERIFICATION_INVALID'),
    epochIndexContentSha256: sha256(record.epochIndexContentSha256, 'MEDIA_PROXY_MASTER_TRANSCODE_TIME_MAP_INDEX_INVALID'),
    streamId,
    videoStreamIndex,
    totalFrameCount: positiveIntegerText(
      record.totalFrameCount,
      'MEDIA_PROXY_MASTER_TRANSCODE_TIME_MAP_FRAME_COUNT_INVALID',
    ),
  });
}

function normalizeRuntime(value: RuntimeInputV1): RuntimeInputV1 {
  const record = object(value, 'MEDIA_PROXY_MASTER_TRANSCODE_RUNTIME_INVALID');
  exactKeys(record, [
    'workerImageDigest', 'platform', 'ffmpegVersion', 'ffprobeVersion',
  ], 'MEDIA_PROXY_MASTER_TRANSCODE_RUNTIME_FIELDS_INVALID');
  return frozen({
    workerImageDigest: sha256(
      record.workerImageDigest,
      'MEDIA_PROXY_MASTER_TRANSCODE_WORKER_IMAGE_INVALID',
    ),
    platform: identifier(
      record.platform,
      'MEDIA_PROXY_MASTER_TRANSCODE_PLATFORM_INVALID',
    ),
    ffmpegVersion: boundedText(
      record.ffmpegVersion,
      'MEDIA_PROXY_MASTER_TRANSCODE_FFMPEG_VERSION_INVALID',
    ),
    ffprobeVersion: boundedText(
      record.ffprobeVersion,
      'MEDIA_PROXY_MASTER_TRANSCODE_FFPROBE_VERSION_INVALID',
    ),
  });
}

function normalizeProcess(
  value: ProcessInputV1,
  command: MediaProxyMasterTranscodeCommandV1,
  runtime: MediaProxyMasterTrustedTranscodeReceiptV1['runtime'],
): Omit<
  MediaProxyMasterTrustedTranscodeReceiptV1['process'],
  'processReceiptSha256'
> {
  const record = object(value, 'MEDIA_PROXY_MASTER_TRANSCODE_PROCESS_INVALID');
  exactKeys(record, [
    'startedAt', 'completedAt', 'exitCode', 'stderrByteLength', 'stderrSha256',
  ], 'MEDIA_PROXY_MASTER_TRANSCODE_PROCESS_FIELDS_INVALID');
  const startedAt = isoInstant(
    record.startedAt,
    'MEDIA_PROXY_MASTER_TRANSCODE_PROCESS_STARTED_AT_INVALID',
  );
  const completedAt = isoInstant(
    record.completedAt,
    'MEDIA_PROXY_MASTER_TRANSCODE_PROCESS_COMPLETED_AT_INVALID',
  );
  if (Date.parse(completedAt) < Date.parse(startedAt)
    || record.exitCode !== 0) {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_PROCESS_TERMINATION_INVALID');
  }
  return frozen({
    startedAt,
    completedAt,
    exitCode: 0 as const,
    stderrByteLength: nonNegativeSafeInteger(
      record.stderrByteLength,
      'MEDIA_PROXY_MASTER_TRANSCODE_PROCESS_DIAGNOSTIC_SIZE_INVALID',
      MAX_DIAGNOSTIC_BYTES,
    ),
    stderrSha256: sha256(
      record.stderrSha256,
      'MEDIA_PROXY_MASTER_TRANSCODE_PROCESS_DIAGNOSTIC_HASH_INVALID',
    ),
    commandSha256: command.commandSha256,
    runtimeReceiptSha256: runtime.runtimeReceiptSha256,
  });
}

function normalizeLocalFileEvidence(
  value: VerifiedMediaSourceLocalFileEvidenceV1,
  source: Readonly<MediaSourceVersionV1>,
): VerifiedMediaSourceLocalFileEvidenceV1 {
  const record = object(
    value,
    'MEDIA_PROXY_MASTER_TRANSCODE_LOCAL_EVIDENCE_INVALID',
  );
  exactKeys(record, [
    'sourceVersionSha256', 'storageVersionSha256', 'byteLength', 'contentSha256',
  ], 'MEDIA_PROXY_MASTER_TRANSCODE_LOCAL_EVIDENCE_FIELDS_INVALID');
  const normalized = frozen({
    sourceVersionSha256: sha256(record.sourceVersionSha256, 'MEDIA_PROXY_MASTER_TRANSCODE_LOCAL_SOURCE_INVALID'),
    storageVersionSha256: sha256(record.storageVersionSha256, 'MEDIA_PROXY_MASTER_TRANSCODE_LOCAL_STORAGE_INVALID'),
    byteLength: positiveSafeInteger(record.byteLength, MAX_BYTES, 'MEDIA_PROXY_MASTER_TRANSCODE_LOCAL_BYTES_INVALID'),
    contentSha256: sha256(record.contentSha256, 'MEDIA_PROXY_MASTER_TRANSCODE_LOCAL_CONTENT_INVALID'),
  });
  if (normalized.sourceVersionSha256 !== source.sourceVersionSha256
    || normalized.storageVersionSha256 !== source.storageVersion.storageVersionSha256
    || normalized.byteLength !== source.byteLength
    || normalized.contentSha256 !== source.contentSha256) {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_LOCAL_EVIDENCE_MISMATCH');
  }
  return normalized;
}

function assertProxyScope(
  command: MediaProxyMasterTranscodeCommandV1,
  proxy: Readonly<MediaSourceVersionV1>,
): void {
  const master = command.masterSourceVersion;
  if (proxy.mediaKind !== 'video'
    || proxy.assetId !== master.assetId
    || !sameOwner(proxy.owner, master.owner)
    || proxy.sourceVersionSha256 === master.sourceVersionSha256
    || proxy.storageVersion.locator.provider !== 'R2'
    || proxy.storageVersion.locator.objectKey
      !== expectedMediaProxyMasterTranscodeR2ObjectKeyV1({
        command,
        proxyContentSha256: proxy.contentSha256,
      })) {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_PROXY_SCOPE_MISMATCH');
  }
}

function streamIndexes(value: unknown, videoStreamIndex: number): readonly number[] {
  if (!Array.isArray(value) || value.length > MAX_STREAMS) {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_AUDIO_STREAMS_INVALID');
  }
  const seen = new Set<number>();
  return frozen(value.map((entry) => {
    const streamIndex = nonNegativeSafeInteger(
      entry,
      'MEDIA_PROXY_MASTER_TRANSCODE_AUDIO_STREAM_INVALID',
    );
    if (streamIndex === videoStreamIndex || seen.has(streamIndex)) {
      fail('MEDIA_PROXY_MASTER_TRANSCODE_AUDIO_STREAM_DUPLICATE');
    }
    seen.add(streamIndex);
    return streamIndex;
  }));
}

function sequentialOutputAudioStreams(
  value: unknown,
  expectedCount: number,
): readonly number[] {
  if (!Array.isArray(value) || value.length !== expectedCount) {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_AUDIO_STREAMS_INVALID');
  }
  return frozen(value.map((entry, sequence) => exactNumber(
    entry,
    sequence + 1,
    'MEDIA_PROXY_MASTER_TRANSCODE_OUTPUT_AUDIO_STREAM_INVALID',
  )));
}

function sameOwner(left: MediaSourceOwnerV1, right: MediaSourceOwnerV1): boolean {
  return left.kind === right.kind && (left.kind === 'USER'
    ? left.userId === (right as Extract<MediaSourceOwnerV1, { kind: 'USER' }>).userId
    : left.orgId === (right as Extract<MediaSourceOwnerV1, { kind: 'ORG' }>).orgId);
}

function object(value: unknown, error: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) fail(error);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  error: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])) fail(error);
}

function exact<const T>(value: unknown, expected: T, error: string): T {
  if (value !== expected) fail(error);
  return expected;
}

function exactNumber<const T extends number>(
  value: unknown,
  expected: T,
  error: string,
): T {
  if (value !== expected) fail(error);
  return expected;
}

function identifier(value: unknown, error: string): string {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) fail(error);
  return value;
}

function boundedText(value: unknown, error: string): string {
  if (typeof value !== 'string' || value.trim() !== value
    || value.length === 0 || value.length > 256
    || /[\u0000-\u001F\u007F]/.test(value)) fail(error);
  return value;
}

function sha256(value: unknown, error: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(error);
  return value;
}

function positiveSafeInteger(value: unknown, max: number, error: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > max) {
    fail(error);
  }
  return Number(value);
}

function nonNegativeSafeInteger(
  value: unknown,
  error: string,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > max) {
    fail(error);
  }
  return Number(value);
}

function integerRange(
  value: unknown,
  minimum: number,
  maximum: number,
  error: string,
): number {
  if (!Number.isSafeInteger(value)
    || Number(value) < minimum || Number(value) > maximum) fail(error);
  return Number(value);
}

function positiveIntegerText(value: unknown, error: string): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,127}$/.test(value)) fail(error);
  return value;
}

function videoPreset(value: unknown): MediaProxyMasterTranscodePolicyV1['videoPreset'] {
  if (value !== 'veryfast' && value !== 'faster'
    && value !== 'fast' && value !== 'medium') {
    fail('MEDIA_PROXY_MASTER_TRANSCODE_VIDEO_PRESET_INVALID');
  }
  return value;
}

function isoInstant(value: unknown, error: string): string {
  if (typeof value !== 'string' || value.length > 128
    || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    fail(error);
  }
  return value;
}

function absolutePath(value: unknown, error: string): string {
  if (typeof value !== 'string' || !path.isAbsolute(value)
    || value.length > 4096 || /[\u0000-\u001F\u007F]/.test(value)) fail(error);
  return value;
}

function frozen<T>(value: T): Readonly<T> {
  return deepFreezeEditronJsonV1(cloneCanonicalEditronJsonV1(value));
}

function fail(message: string): never {
  throw new Error(message);
}
