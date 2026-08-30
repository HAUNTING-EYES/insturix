import { describe, expect, it } from 'vitest';

import {
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobSnapshotV1,
} from '@/lib/editron/services/durable-workflow-job-v1';
import { createMediaProxyMasterR2PrivatePublicationPolicyV1 }
  from '@/lib/editron/services/media-proxy-master-r2-private-publication-policy-v1';
import {
  buildMediaProxyMasterTranscodeDurableJobContractV1,
  createMediaProxyMasterTranscodeDurableRuntimePolicyV1,
} from '@/lib/editron/services/media-proxy-master-transcode-durable-job-v1';
import {
  assertMediaProxyMasterTranscodeDurableResultForJobV1,
  assertMediaProxyMasterTranscodeDurableResultV1,
  createMediaProxyMasterTranscodeDurableResultV1,
  createMediaProxyMasterTranscodeDurableResumeStateV1,
  createMediaProxyMasterTranscodeDurableTerminalReceiptV1,
  readMediaProxyMasterTranscodeDurableResumeResultV1,
  MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RESUME_SCHEMA_V1,
} from '@/lib/editron/services/media-proxy-master-transcode-durable-result-v1';
import { createMediaProxyMasterTranscodeOutputProbeV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-output-probe-v1';
import {
  createMediaProxyMasterTranscodeCommandV1,
  createMediaProxyMasterTranscodePolicyV1,
  createMediaProxyMasterTrustedTranscodeReceiptV1,
  expectedMediaProxyMasterTranscodeR2ObjectKeyV1,
} from '@/lib/editron/services/media-proxy-master-trusted-transcode-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';

const COMPLETED_AT = new Date('2026-08-30T19:02:00.000Z');

describe('MediaProxyMasterTranscodeDurableResultV1', () => {
  it('binds the full trusted receipt before deriving a terminal PASS', () => {
    const value = fixture();
    const result = createResult(value);
    const expected = expectedJob(value);

    expect(assertMediaProxyMasterTranscodeDurableResultV1(result)).toEqual(result);
    expect(assertMediaProxyMasterTranscodeDurableResultForJobV1(result, expected))
      .toEqual(result);
    const resume = createMediaProxyMasterTranscodeDurableResumeStateV1({
      result, ...expected,
    });
    expect(resume.schemaId)
      .toBe(MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_RESUME_SCHEMA_V1);
    expect(resume.stateSha256).toBe(hashDurableWorkflowJobJsonV1(result));

    const terminal = createMediaProxyMasterTranscodeDurableTerminalReceiptV1({
      result, ...expected, completedAt: COMPLETED_AT,
    });
    expect(terminal.disposition).toBe('PASS');
    expect(terminal.proofReferences.map(({ proofId }) => proofId)).toEqual([
      'execution-budget-authorization',
      'private-publication-policy',
      'trusted-proxy-transcode',
      'durable-transcode-result',
    ]);
  });

  it('reads only an exact sequence-fenced resume result for the same job', () => {
    const value = fixture();
    const expected = expectedJob(value);
    const result = createResult(value);
    const resume = createMediaProxyMasterTranscodeDurableResumeStateV1({
      result, ...expected,
    });
    const job = snapshot(value, {
      sequence: 1,
      schemaId: resume.schemaId,
      stateSha256: resume.stateSha256,
      payload: resume.payload,
      committedAt: '2026-08-30T19:01:30.000Z',
    });

    expect(readMediaProxyMasterTranscodeDurableResumeResultV1(
      job,
      value.contract.payload,
    )).toEqual(result);
    expect(() => readMediaProxyMasterTranscodeDurableResumeResultV1({
      ...job,
      resumeState: { ...job.resumeState!, stateSha256: hash('forged-state') },
    }, value.contract.payload))
      .toThrow('MEDIA_PROXY_MASTER_DURABLE_RESUME_BINDING_MISMATCH');
  });

  it('rejects job, runtime, publication, budget, and outer-hash substitution', () => {
    const primary = fixture();
    const result = createResult(primary);
    expect(() => assertMediaProxyMasterTranscodeDurableResultForJobV1(result, {
      ...expectedJob(primary), operationId: 'other-operation',
    })).toThrow('MEDIA_PROXY_MASTER_DURABLE_RESULT_JOB_BINDING_MISMATCH');
    expect(() => createMediaProxyMasterTranscodeDurableResultV1({
      ...expectedJob(primary),
      jobInputBindingSha256: hash('forged-input-binding'),
      budgetAuthorizationReceiptSha256: hash('budget-authorization'),
      trustedTranscodeReceipt: primary.receipt,
    })).toThrow('MEDIA_PROXY_MASTER_DURABLE_RESULT_JOB_BINDING_MISMATCH');

    const runtimeSubstitution = fixture({ workerImageDigest: hash('other-image') });
    expect(() => assertMediaProxyMasterTranscodeDurableResultForJobV1(
      result,
      expectedJob(runtimeSubstitution),
    )).toThrow('MEDIA_PROXY_MASTER_DURABLE_RESULT_RECEIPT_JOB_MISMATCH');

    const publicationSubstitution = fixture({ bucketName: 'other-private-bucket' });
    expect(() => assertMediaProxyMasterTranscodeDurableResultForJobV1(
      result,
      expectedJob(publicationSubstitution),
    )).toThrow('MEDIA_PROXY_MASTER_DURABLE_RESULT_JOB_BINDING_MISMATCH');

    const budgetSubstitution = fixture({ reservationId: 'reservation-b' });
    expect(() => assertMediaProxyMasterTranscodeDurableResultForJobV1(
      result,
      expectedJob(budgetSubstitution),
    )).toThrow('MEDIA_PROXY_MASTER_DURABLE_RESULT_JOB_BINDING_MISMATCH');

    expect(() => assertMediaProxyMasterTranscodeDurableResultV1({
      ...result, resultSha256: hash('forged-result'),
    })).toThrow('MEDIA_PROXY_MASTER_DURABLE_RESULT_HASH_MISMATCH');
  });

  it('rejects a terminal timestamp before the trusted process completed', () => {
    const value = fixture();
    expect(() => createMediaProxyMasterTranscodeDurableTerminalReceiptV1({
      result: createResult(value),
      ...expectedJob(value),
      completedAt: new Date('2026-08-30T19:00:59.999Z'),
    })).toThrow('MEDIA_PROXY_MASTER_DURABLE_TERMINAL_TIME_INVALID');
  });
});

type FixtureOptions = Readonly<{
  workerImageDigest?: string;
  bucketName?: string;
  reservationId?: string;
}>;

function fixture(options: FixtureOptions = {}) {
  const command = transcodeCommand();
  const publicationPolicy = createMediaProxyMasterR2PrivatePublicationPolicyV1({
    bucketName: options.bucketName ?? 'editron-media-proxy-private',
    storagePolicyVersion: 'private-proxy-media-v1',
    browserRouteExposure: 'NO_BROWSER_ROUTE',
  });
  const runtimePolicy = createMediaProxyMasterTranscodeDurableRuntimePolicyV1({
    lifecycle: { maxAttempts: 6, retentionMs: 604_800_000 },
    executionBudgetPolicy: owner('budget'),
    retryPolicy: owner('retry'),
    heartbeatPolicy: owner('heartbeat'),
    executionProfile: {
      workerImageDigest: options.workerImageDigest ?? hash('worker-image'),
      platform: 'linux-x64',
      ffmpegVersion: 'ffmpeg version 8.1',
      ffprobeVersion: 'ffprobe version 8.1',
      compatibilityReceiptSha256: hash('compatibility'),
    },
  });
  const contract = buildMediaProxyMasterTranscodeDurableJobContractV1({
    tenantId: 'tenant-a',
    userId: 'user-a',
    orgId: null,
    assetId: 'asset-a',
    command,
    publicationPolicy,
    runtimePolicy,
    budgetReservation: {
      reservationId: options.reservationId ?? 'reservation-a',
      bindingSha256: hash(options.reservationId ?? 'reservation-a'),
    },
  });
  return { contract, receipt: trustedReceipt(command) };
}

function createResult(value: ReturnType<typeof fixture>) {
  return createMediaProxyMasterTranscodeDurableResultV1({
    ...expectedJob(value),
    budgetAuthorizationReceiptSha256: hash('budget-authorization'),
    trustedTranscodeReceipt: value.receipt,
  });
}

function expectedJob(value: ReturnType<typeof fixture>) {
  return {
    jobId: 'dwj_proxy_result_1',
    operationId: value.contract.operationIdentity,
    jobInputBindingSha256: value.contract.bindingSha256,
    jobInput: value.contract.payload,
  };
}

function snapshot(
  value: ReturnType<typeof fixture>,
  resumeState: NonNullable<DurableWorkflowJobSnapshotV1['resumeState']>,
): DurableWorkflowJobSnapshotV1 {
  return {
    jobId: 'dwj_proxy_result_1',
    version: 'EDITRON_DURABLE_WORKFLOW_JOB_V1_1',
    tenantId: 'tenant-a',
    userId: 'user-a',
    orgId: null,
    projectId: null,
    operationOwner: 'MEDIA_ASSETS',
    operationKind: 'media_proxy_master_trusted_transcode',
    operationId: value.contract.operationIdentity,
    parentCommandId: null,
    parentReceiptId: null,
    idempotencyKey: value.contract.operationIdentity,
    input: {
      schemaId: 'EDITRON_MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_V1_1',
      bindingSha256: value.contract.bindingSha256,
      payload: value.contract.payload,
    },
    dependencies: value.contract.dependencies,
    budgetReservation: value.contract.payload.budgetReservation,
    status: 'running',
    attemptCount: 1,
    maxAttempts: 6,
    remainingAttempts: 5,
    retryCursor: null,
    leaseOwnerId: 'worker-a',
    leaseExpiresAt: '2026-08-30T19:05:00.000Z',
    nextAttemptAt: null,
    cancelRequestedAt: null,
    cancelRequestedBy: null,
    cancelReason: null,
    resumeState,
    terminalReceipt: null,
    error: null,
    dispatchTransport: null,
    dispatchMessageId: null,
    dispatchCount: 0,
    createdAt: '2026-08-30T19:00:00.000Z',
    updatedAt: '2026-08-30T19:01:30.000Z',
    expiresAt: '2026-09-06T19:00:00.000Z',
  };
}

function trustedReceipt(command: ReturnType<typeof transcodeCommand>) {
  const proxy = proxySource(command);
  return createMediaProxyMasterTrustedTranscodeReceiptV1({
    command,
    runtime: {
      workerImageDigest: hash('worker-image'),
      platform: 'linux-x64',
      ffmpegVersion: 'ffmpeg version 8.1',
      ffprobeVersion: 'ffprobe version 8.1',
    },
    process: {
      startedAt: '2026-08-30T19:00:00.000Z',
      completedAt: '2026-08-30T19:01:00.000Z',
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
        frameCount: '300',
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
      probedAt: '2026-08-30T19:01:01.000Z',
    }),
    outputVideoStreamIndex: 0,
    outputAudioStreamIndexes: [1],
    completedAt: '2026-08-30T19:01:02.000Z',
  });
}

function transcodeCommand() {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: 'media/master.mp4' },
    byteLength: 100_000,
    providerVersion: { kind: 'R2_ETAG', value: 'etag-master' },
  });
  const master = createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-a' },
    assetId: 'asset-a',
    mediaKind: 'video',
    byteLength: storageVersion.byteLength,
    contentSha256: hash('master-content'),
    storageVersion,
  });
  const policy = createMediaProxyMasterTranscodePolicyV1({
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
    maxOutputBytes: 2_000_000,
    timeoutMs: 120_000,
  });
  return createMediaProxyMasterTranscodeCommandV1({
    transcodeJobId: 'transcode-result-1',
    policy,
    masterSourceVersion: master,
    masterTimeMap: {
      sourceVersionSha256: master.sourceVersionSha256,
      storageVersionSha256: master.storageVersion.storageVersionSha256,
      sourceBindingSha256: hash('source-binding'),
      technicalObservationSha256: hash('observation'),
      sourcePtsCadenceMapStateSha256V3: hash('state'),
      mapBindingSha256: hash('map-binding'),
      terminalReceiptSha256: hash('map-terminal'),
      verificationSha256: hash('map-verification'),
      epochIndexContentSha256: hash('epoch-index'),
      streamId: 'video-0',
      videoStreamIndex: 0,
      totalFrameCount: '300',
    },
    masterVideoStreamIndex: 0,
    masterAudioStreamIndexes: [1],
  });
}

function proxySource(command: ReturnType<typeof transcodeCommand>) {
  const contentSha256 = hash('proxy-content');
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: {
      provider: 'R2',
      objectKey: expectedMediaProxyMasterTranscodeR2ObjectKeyV1({
        command,
        proxyContentSha256: contentSha256,
      }),
    },
    byteLength: 40_000,
    providerVersion: { kind: 'R2_ETAG', value: 'etag-proxy' },
  });
  return createMediaSourceVersionV1({
    owner: command.masterSourceVersion.owner,
    assetId: command.masterSourceVersion.assetId,
    mediaKind: 'video',
    byteLength: storageVersion.byteLength,
    contentSha256,
    storageVersion,
  });
}

function owner(tag: string) {
  return {
    ownerId: `${tag}-owner`,
    ownerVersion: `${tag}-v1`,
    policySha256: hash(`${tag}-policy`),
  };
}

function hash(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}
