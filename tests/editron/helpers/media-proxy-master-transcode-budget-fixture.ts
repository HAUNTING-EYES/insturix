import { createMediaProxyMasterR2PrivatePublicationPolicyV1 }
  from '@/lib/editron/services/media-proxy-master-r2-private-publication-policy-v1';
import { createMediaProxyMasterTranscodeDurableRuntimePolicyV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-durable-job-v1';
import {
  createMediaProxyMasterTranscodeExecutionBudgetPolicyV1,
  type MediaProxyMasterTranscodeExecutionBudgetPolicyV1,
} from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-policy-v1';
import {
  createMediaProxyMasterTranscodeExecutionBudgetAuthorizationV1,
  createMediaProxyMasterTranscodeExecutionBudgetReservationV1,
} from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-reservation-v1';
import {
  createMediaProxyMasterTranscodeHeartbeatPolicyV1,
  createMediaProxyMasterTranscodeRetryPolicyV1,
} from '@/lib/editron/services/media-proxy-master-transcode-operational-policy-v1';
import {
  createMediaProxyMasterTranscodeCommandV1,
  createMediaProxyMasterTranscodePolicyV1,
  createMediaProxyMasterTrustedTranscodeReceiptV1,
  expectedMediaProxyMasterTranscodeR2ObjectKeyV1,
  type MediaProxyMasterTranscodeCommandV1,
} from '@/lib/editron/services/media-proxy-master-trusted-transcode-v1';
import { createMediaProxyMasterTranscodeOutputProbeV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-output-probe-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';

export function buildMediaProxyMasterTranscodeBudgetBasisFixtureV1(
  options: Readonly<{ maxOutputBytes?: number }> = {},
) {
  const policy = createMediaProxyMasterTranscodeExecutionBudgetPolicyV1({
    ownerVersion: 'finance-proxy-v1',
    effectiveAt: '2026-08-30T00:00:00.000Z',
    expiresAt: '2026-09-01T00:00:00.000Z',
    sourceByteRead: { nanoUsdNumerator: '1', unitsDenominator: '100' },
    encodedFrameAttempt: { nanoUsdNumerator: '1', unitsDenominator: '1' },
    processMillisecond: { nanoUsdNumerator: '1', unitsDenominator: '1000' },
    artifactByteWritten: { nanoUsdNumerator: '2', unitsDenominator: '100' },
    artifactByteVerified: { nanoUsdNumerator: '3', unitsDenominator: '100' },
  });
  const master = masterSource();
  const command = createMediaProxyMasterTranscodeCommandV1({
    transcodeJobId: 'transcode-budget-fixture',
    policy: createMediaProxyMasterTranscodePolicyV1({
      presentationPolicy: 'PRESERVE_ALL_DECODED_FRAMES_AND_TIMESTAMPS_V1',
      timestampOriginPolicy: 'SHIFT_SHARED_SOURCE_ORIGIN_TO_ZERO_V1',
      container: 'mp4',
      videoCodec: 'libx264',
      pixelFormat: 'yuv420p',
      scalingPolicy: 'FIT_WITHIN_NO_UPSCALE_EVEN_DIMENSIONS_V1',
      maximumWidth: 1_920,
      maximumHeight: 1_080,
      videoCrf: 23,
      videoPreset: 'fast',
      keyframeIntervalSeconds: 2,
      audioPolicy: 'PRESERVE_SELECTED_STREAM_COUNT_LAYOUT_AND_TIMESTAMPS_V1',
      audioCodec: 'aac',
      audioBitrateBitsPerSecond: 192_000,
      maxSourceBytes: 5_000_000,
      maxOutputBytes: options.maxOutputBytes ?? 2_000_000,
      timeoutMs: 120_000,
    }),
    masterSourceVersion: master,
    masterTimeMap: {
      sourceVersionSha256: master.sourceVersionSha256,
      storageVersionSha256: master.storageVersion.storageVersionSha256,
      sourceBindingSha256: hash('source-binding'),
      technicalObservationSha256: hash('observation'),
      sourcePtsCadenceMapStateSha256V3: hash('state'),
      mapBindingSha256: hash('map'),
      terminalReceiptSha256: hash('terminal'),
      verificationSha256: hash('verification'),
      epochIndexContentSha256: hash('epoch'),
      streamId: 'video-0',
      videoStreamIndex: 0,
      totalFrameCount: '300',
    },
    masterVideoStreamIndex: 0,
    masterAudioStreamIndexes: [1],
  });
  const operationalPolicies = createOperationalPolicies();
  const runtimePolicy = runtime(policy, operationalPolicies);
  return { policy, command, operationalPolicies, runtimePolicy };
}

export function buildMediaProxyMasterTranscodeBudgetFixtureV1(
  options: Readonly<{ maxOutputBytes?: number }> = {},
) {
  const {
    policy,
    command,
    operationalPolicies,
    runtimePolicy,
  } = buildMediaProxyMasterTranscodeBudgetBasisFixtureV1(options);
  const publicationPolicy =
    createMediaProxyMasterR2PrivatePublicationPolicyV1({
      bucketName: 'editron-media-proxy-private',
      storagePolicyVersion: 'private-proxy-media-v1',
      browserRouteExposure: 'NO_BROWSER_ROUTE',
    });
  const authorization =
    createMediaProxyMasterTranscodeExecutionBudgetAuthorizationV1({
      policy,
      evidence: {
        tenantId: 'tenant-a',
        userId: 'user-a',
        orgId: null,
        assetId: 'asset-a',
        command,
        runtimePolicy,
        publicationPolicy,
      },
      approvedBy: 'finance-admin',
      approvedAt: '2026-08-30T00:05:00.000Z',
      expiresAt: '2026-08-30T01:00:00.000Z',
    });
  const reservation =
    createMediaProxyMasterTranscodeExecutionBudgetReservationV1({
      policy,
      authorization,
      reservationId: 'mpmt-budget-fixture',
      reservedAt: '2026-08-30T00:10:00.000Z',
    });
  return {
    policy,
    command,
    operationalPolicies,
    runtimePolicy,
    publicationPolicy,
    authorization,
    reservation,
  };
}

export function mediaProxyMasterBudgetHashV1(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}

export function createMediaProxyMasterTranscodeBudgetTrustedReceiptV1(
  command: Readonly<MediaProxyMasterTranscodeCommandV1>,
  options: Readonly<{ proxyByteLength?: number }> = {},
) {
  const contentSha256 = hash('proxy-content');
  const proxyByteLength = options.proxyByteLength ?? 40_000;
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: {
      provider: 'R2',
      objectKey: expectedMediaProxyMasterTranscodeR2ObjectKeyV1({
        command,
        proxyContentSha256: contentSha256,
      }),
    },
    byteLength: proxyByteLength,
    providerVersion: { kind: 'R2_ETAG', value: 'etag-proxy-budget' },
  });
  const proxy = createMediaSourceVersionV1({
    owner: command.masterSourceVersion.owner,
    assetId: command.masterSourceVersion.assetId,
    mediaKind: 'video',
    byteLength: storageVersion.byteLength,
    contentSha256,
    storageVersion,
  });
  return createMediaProxyMasterTrustedTranscodeReceiptV1({
    command,
    runtime: {
      workerImageDigest: hash('worker-image'),
      platform: 'linux-x64',
      ffmpegVersion: 'ffmpeg version 8.1',
      ffprobeVersion: 'ffprobe version 8.1',
    },
    process: {
      startedAt: '2026-08-30T00:11:00.000Z',
      completedAt: '2026-08-30T00:12:00.000Z',
      exitCode: 0,
      stderrByteLength: 0,
      stderrSha256: hash('empty-stderr'),
    },
    masterLocalFileEvidence: {
      sourceVersionSha256: command.masterSourceVersion.sourceVersionSha256,
      storageVersionSha256:
        command.masterSourceVersion.storageVersion.storageVersionSha256,
      byteLength: command.masterSourceVersion.byteLength,
      contentSha256: command.masterSourceVersion.contentSha256,
    },
    proxySourceVersion: proxy,
    outputProbe: createMediaProxyMasterTranscodeOutputProbeV1({
      commandSha256: command.commandSha256,
      ffprobeVersion: 'ffprobe version 8.1',
      proxyContentSha256: proxy.contentSha256,
      proxyByteLength: proxy.byteLength,
      container: 'mp4',
      formatNames: ['mov', 'mp4'],
      video: {
        streamIndex: 0,
        codec: 'h264',
        pixelFormat: 'yuv420p',
        codedWidth: 1_280,
        codedHeight: 720,
        sourceTimebase: { numerator: '1', denominator: '90000' },
        sourceStartPts: '0',
        sourceDurationTicks: '900000',
        frameCount: command.masterTimeMap.totalFrameCount,
      },
      audio: [{
        streamIndex: 1,
        codec: 'aac',
        sampleRate: '48000',
        channelCount: 2,
        channelLayout: 'stereo',
        sourceTimebase: { numerator: '1', denominator: '48000' },
        sourceStartPts: '0',
        sourceDurationTicks: '480000',
      }],
      probedAt: '2026-08-30T00:12:01.000Z',
    }),
    outputVideoStreamIndex: 0,
    outputAudioStreamIndexes: [1],
    completedAt: '2026-08-30T00:12:02.000Z',
  });
}

function masterSource() {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'media/budget-fixture.mp4' },
    byteLength: 100_000,
    providerVersion: { kind: 'R2_ETAG', value: 'etag-budget-fixture' },
  });
  return createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-a' },
    assetId: 'asset-a',
    mediaKind: 'video',
    byteLength: storageVersion.byteLength,
    contentSha256: hash('content'),
    storageVersion,
  });
}

function runtime(
  policy: MediaProxyMasterTranscodeExecutionBudgetPolicyV1,
  operationalPolicies: ReturnType<typeof createOperationalPolicies>,
) {
  return createMediaProxyMasterTranscodeDurableRuntimePolicyV1({
    lifecycle: operationalPolicies.retry.durableJob,
    executionBudgetPolicy: {
      ownerId: policy.ownerId,
      ownerVersion: policy.ownerVersion,
      policySha256: policy.policySha256,
    },
    retryPolicy: binding(operationalPolicies.retry),
    heartbeatPolicy: binding(operationalPolicies.heartbeat),
    executionProfile: {
      workerImageDigest: hash('worker-image'),
      platform: 'linux-x64',
      ffmpegVersion: 'ffmpeg version 8.1',
      ffprobeVersion: 'ffprobe version 8.1',
      compatibilityReceiptSha256: hash('toolchain'),
    },
  });
}

function createOperationalPolicies() {
  return {
    retry: createMediaProxyMasterTranscodeRetryPolicyV1({
      durableJob: {
        maxAttempts: 6,
        retentionMs: 7 * 24 * 60 * 60 * 1_000,
      },
      qstashDelivery: {
        retries: 2,
        retryDelayMs: 30_000,
        timeoutSeconds: 300,
      },
      workerRetry: {
        baseDelayMs: 1_000,
        maximumDelayMs: 30_000,
        backoffMultiplier: 2,
        deterministicJitterPermille: 200,
        retryableDiagnostics: [
          'MEDIA_PROXY_MASTER_TRANSCODE_EXECUTOR_SOURCE_UNAVAILABLE',
        ],
      },
    }),
    heartbeat: createMediaProxyMasterTranscodeHeartbeatPolicyV1({
      heartbeatIntervalMs: 1_000,
    }),
  };
}

function binding(policy: Readonly<{
  ownerId: string;
  ownerVersion: string;
  policySha256: string;
}>) {
  return {
    ownerId: policy.ownerId,
    ownerVersion: policy.ownerVersion,
    policySha256: policy.policySha256,
  };
}

function hash(value: string): string {
  return mediaProxyMasterBudgetHashV1(value);
}
