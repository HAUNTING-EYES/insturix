import { describe, expect, it } from 'vitest';

import { createMediaProxyMasterR2PrivatePublicationPolicyV1 }
  from '@/lib/editron/services/media-proxy-master-r2-private-publication-policy-v1';
import {
  buildMediaProxyMasterTranscodeDurableJobContractV1,
  createMediaProxyMasterTranscodeDurableRuntimePolicyV1,
} from '@/lib/editron/services/media-proxy-master-transcode-durable-job-v1';
import { createMediaProxyMasterTranscodeExecutionBudgetPolicyV1 }
  from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-policy-v1';
import {
  assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationForJobV1,
  assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV1,
  assertMediaProxyMasterTranscodeExecutionBudgetReservationV1,
  createMediaProxyMasterTranscodeExecutionBudgetAuthorizationV1,
  createMediaProxyMasterTranscodeExecutionBudgetReservationV1,
  deriveMediaProxyMasterTranscodeExecutionBudgetMaximumUsageV1,
  mediaProxyMasterTranscodeExecutionBudgetReservationRefV1,
} from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-reservation-v1';
import {
  createMediaProxyMasterTranscodeCommandV1,
  createMediaProxyMasterTranscodePolicyV1,
} from '@/lib/editron/services/media-proxy-master-trusted-transcode-v1';
import { createMediaSourceStorageVersionV1 }
  from '@/lib/editron/services/media-source-storage-version-v1';
import { createMediaSourceVersionV1 }
  from '@/lib/editron/services/media-source-version-v1';

describe('proxy transcode execution-budget authorization and reservation v1', () => {
  it('derives a conservative retry ceiling and binds a durable reservation', () => {
    const fixture = build();
    expect(deriveMediaProxyMasterTranscodeExecutionBudgetMaximumUsageV1(
      fixture.command,
      fixture.runtimePolicy,
    )).toEqual({
      sourceBytesRead: '30000000',
      encodedFrameAttempts: '1800',
      processMilliseconds: '720000',
      artifactBytesWritten: '12000000',
      artifactBytesVerified: '12000000',
    });
    expect(fixture.authorization).toMatchObject({
      authority: 'FINANCE_POLICY_BOUND_PROXY_TRANSCODE_EXECUTION_AUTHORIZATION',
      scope: {
        tenantId: 'tenant-a',
        userId: 'user-a',
        orgId: null,
        assetId: 'asset-a',
        commandSha256: fixture.command.commandSha256,
        runtimePolicyBindingSha256: fixture.runtimePolicy.bindingSha256,
        publicationPolicySha256: fixture.publicationPolicy.policySha256,
      },
      maximumCostNanoUsd: '902520',
    });
    expect(fixture.reservation).toMatchObject({
      authority: 'PROXY_TRANSCODE_INTERNAL_COST_RESERVATION_NO_CUSTOMER_CHARGE',
      status: 'RESERVED',
      reservedNanoUsd: fixture.authorization.maximumCostNanoUsd,
    });
    expect(mediaProxyMasterTranscodeExecutionBudgetReservationRefV1(
      fixture.reservation,
    )).toEqual({
      reservationId: 'mpmt-budget-1',
      bindingSha256: fixture.reservation.reservationSha256,
    });
  });

  it('revalidates the authorization against the exact durable job input', () => {
    const fixture = build();
    const job = buildMediaProxyMasterTranscodeDurableJobContractV1({
      ...jobRequest(fixture),
      budgetReservation:
        mediaProxyMasterTranscodeExecutionBudgetReservationRefV1(
          fixture.reservation,
        ),
    });
    expect(
      assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationForJobV1(
        fixture.authorization,
        fixture.policy,
        job.payload,
      ),
    ).toEqual(fixture.authorization);

    const drifted = build({ commandTag: 'drifted' });
    const driftedJob = buildMediaProxyMasterTranscodeDurableJobContractV1({
      ...jobRequest(drifted),
      budgetReservation:
        mediaProxyMasterTranscodeExecutionBudgetReservationRefV1(
          fixture.reservation,
        ),
    });
    expect(() =>
      assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationForJobV1(
        fixture.authorization,
        fixture.policy,
        driftedJob.payload,
      )).toThrow('AUTHORIZATION_JOB_BINDING_MISMATCH');
  });

  it('rejects policy, owner, source-limit, and publication-capability drift', () => {
    const fixture = build();
    expect(() => authorization({
      runtimePolicy: runtimePolicy(fixture.policy, { ownerVersion: 'foreign-v1' }),
    })).toThrow('RUNTIME_POLICY_BINDING_MISMATCH');
    expect(() => authorization({ userId: 'copied-user' }))
      .toThrow('SCOPE_OWNER_MISMATCH');
    expect(() => authorization({ command: command('oversource', 50_000, 99_999) }))
      .toThrow('SCOPE_SOURCE_RESOURCE_LIMIT_EXCEEDED');
    expect(() => authorization({
      command: command('overoutput', 6 * 1_024 * 1_024 * 1_024),
    }))
      .toThrow('SCOPE_PUBLICATION_CAPABILITY_MISMATCH');
  });

  it('rejects forged or noncanonical authorization and reservation fields', () => {
    const fixture = build();
    expect(() => assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV1({
      ...fixture.authorization,
      maximumCostNanoUsd: '1',
    }, fixture.policy)).toThrow('AUTHORIZATION_INVALID');
    expect(() => assertMediaProxyMasterTranscodeExecutionBudgetAuthorizationV1({
      ...fixture.authorization,
      extra: true,
    }, fixture.policy)).toThrow('AUTHORIZATION_INVALID');
    expect(() => assertMediaProxyMasterTranscodeExecutionBudgetReservationV1({
      ...fixture.reservation,
      reservedNanoUsd: '1',
    }, fixture.authorization, fixture.policy)).toThrow('RESERVATION_INVALID');
  });

  it('rejects approval and reservation outside their exact policy windows', () => {
    expect(() => authorization({
      approvedAt: '2026-08-29T23:59:59.000Z',
    })).toThrow('AUTHORIZATION_POLICY_WINDOW_MISMATCH');
    const fixture = build();
    expect(() => createMediaProxyMasterTranscodeExecutionBudgetReservationV1({
      policy: fixture.policy,
      authorization: fixture.authorization,
      reservationId: 'mpmt-budget-late',
      reservedAt: fixture.authorization.approval.expiresAt,
    })).toThrow('RESERVATION_TIME_INVALID');
  });
});

function build(options: Readonly<{ commandTag?: string }> = {}) {
  const policy = budgetPolicy();
  const commandValue = command(options.commandTag ?? 'primary');
  const runtimePolicyValue = runtimePolicy(policy);
  const publicationPolicy = publication();
  const authorizationValue = authorization({
    policy,
    command: commandValue,
    runtimePolicy: runtimePolicyValue,
    publicationPolicy,
  });
  const reservation =
    createMediaProxyMasterTranscodeExecutionBudgetReservationV1({
      policy,
      authorization: authorizationValue,
      reservationId: 'mpmt-budget-1',
      reservedAt: '2026-08-30T00:10:00.000Z',
    });
  return {
    policy,
    command: commandValue,
    runtimePolicy: runtimePolicyValue,
    publicationPolicy,
    authorization: authorizationValue,
    reservation,
  };
}

function authorization(overrides: Readonly<Record<string, unknown>> = {}) {
  const policy = overrides.policy ?? budgetPolicy();
  const commandValue = overrides.command ?? command('primary');
  const runtimePolicyValue = overrides.runtimePolicy ?? runtimePolicy(policy as never);
  const publicationPolicy = overrides.publicationPolicy ?? publication();
  return createMediaProxyMasterTranscodeExecutionBudgetAuthorizationV1({
    policy,
    evidence: {
      tenantId: String(overrides.tenantId ?? 'tenant-a'),
      userId: String(overrides.userId ?? 'user-a'),
      orgId: null,
      assetId: 'asset-a',
      command: commandValue,
      runtimePolicy: runtimePolicyValue,
      publicationPolicy,
    },
    approvedBy: 'finance-admin',
    approvedAt: String(overrides.approvedAt ?? '2026-08-30T00:05:00.000Z'),
    expiresAt: '2026-08-30T01:00:00.000Z',
  });
}

function jobRequest(fixture: ReturnType<typeof build>) {
  return {
    tenantId: 'tenant-a',
    userId: 'user-a',
    orgId: null,
    assetId: 'asset-a',
    command: fixture.command,
    publicationPolicy: fixture.publicationPolicy,
    runtimePolicy: fixture.runtimePolicy,
  };
}

function budgetPolicy() {
  return createMediaProxyMasterTranscodeExecutionBudgetPolicyV1({
    ownerVersion: 'finance-proxy-v1',
    effectiveAt: '2026-08-30T00:00:00.000Z',
    expiresAt: '2026-09-01T00:00:00.000Z',
    sourceByteRead: { nanoUsdNumerator: '1', unitsDenominator: '100' },
    encodedFrameAttempt: { nanoUsdNumerator: '1', unitsDenominator: '1' },
    processMillisecond: { nanoUsdNumerator: '1', unitsDenominator: '1000' },
    artifactByteWritten: { nanoUsdNumerator: '2', unitsDenominator: '100' },
    artifactByteVerified: { nanoUsdNumerator: '3', unitsDenominator: '100' },
  });
}

function runtimePolicy(
  policy: ReturnType<typeof budgetPolicy>,
  overrides: Readonly<{ ownerVersion?: string }> = {},
) {
  return createMediaProxyMasterTranscodeDurableRuntimePolicyV1({
    lifecycle: { maxAttempts: 6, retentionMs: 7 * 24 * 60 * 60 * 1_000 },
    executionBudgetPolicy: {
      ownerId: policy.ownerId,
      ownerVersion: overrides.ownerVersion ?? policy.ownerVersion,
      policySha256: policy.policySha256,
    },
    retryPolicy: policyOwner('retry'),
    heartbeatPolicy: policyOwner('heartbeat'),
    executionProfile: {
      workerImageDigest: hash('worker-image'),
      platform: 'linux-x64',
      ffmpegVersion: 'ffmpeg version 8.1',
      ffprobeVersion: 'ffprobe version 8.1',
      compatibilityReceiptSha256: hash('toolchain'),
    },
  });
}

function command(tag: string, maxOutputBytes = 2_000_000, maxSourceBytes = 5_000_000) {
  const master = masterSource(tag);
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
    maxSourceBytes,
    maxOutputBytes,
    timeoutMs: 120_000,
  });
  return createMediaProxyMasterTranscodeCommandV1({
    transcodeJobId: `transcode-${tag}`,
    policy,
    masterSourceVersion: master,
    masterTimeMap: {
      sourceVersionSha256: master.sourceVersionSha256,
      storageVersionSha256: master.storageVersion.storageVersionSha256,
      sourceBindingSha256: hash(`source-binding-${tag}`),
      technicalObservationSha256: hash(`observation-${tag}`),
      sourcePtsCadenceMapStateSha256V3: hash(`state-${tag}`),
      mapBindingSha256: hash(`map-${tag}`),
      terminalReceiptSha256: hash(`terminal-${tag}`),
      verificationSha256: hash(`verification-${tag}`),
      epochIndexContentSha256: hash(`epoch-${tag}`),
      streamId: 'video-0',
      videoStreamIndex: 0,
      totalFrameCount: '300',
    },
    masterVideoStreamIndex: 0,
    masterAudioStreamIndexes: [1],
  });
}

function masterSource(tag: string) {
  const storageVersion = createMediaSourceStorageVersionV1({
    locator: { provider: 'R2', objectKey: `media/${tag}.mp4` },
    byteLength: 100_000,
    providerVersion: { kind: 'R2_ETAG', value: `etag-${tag}` },
  });
  return createMediaSourceVersionV1({
    owner: { kind: 'USER', userId: 'user-a' },
    assetId: 'asset-a',
    mediaKind: 'video',
    byteLength: storageVersion.byteLength,
    contentSha256: hash(`content-${tag}`),
    storageVersion,
  });
}

function publication() {
  return createMediaProxyMasterR2PrivatePublicationPolicyV1({
    bucketName: 'editron-media-proxy-private',
    storagePolicyVersion: 'private-proxy-media-v1',
    browserRouteExposure: 'NO_BROWSER_ROUTE',
  });
}

function policyOwner(tag: string) {
  return {
    ownerId: `editron-${tag}-owner`,
    ownerVersion: `editron-${tag}-v1`,
    policySha256: hash(`${tag}-policy`),
  };
}

function hash(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}
