import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readAudioState: vi.fn(),
  resolveBinding: vi.fn(),
}));

vi.mock('@/lib/editron/services/media-source-audio-artifact-asset-owner-v1', async (original) => ({
  ...await original<typeof import('@/lib/editron/services/media-source-audio-artifact-asset-owner-v1')>(),
  readMediaSourceAudioArtifactAssetStateV1: mocks.readAudioState,
}));
vi.mock('@/lib/editron/services/video-source-time-transform-v1', async (original) => ({
  ...await original<typeof import('@/lib/editron/services/video-source-time-transform-v1')>(),
  resolveVerifiedVideoSourceEpochTimeBindingV3: mocks.resolveBinding,
}));

import { hashDurableWorkflowJobJsonV1 } from '@/lib/editron/services/durable-workflow-job-v1';
import {
  nativeMediaFinalRenderAssetTimingStateSha256V1,
  readNativeMediaFinalRenderVideoOverlayV1,
} from '@/lib/editron/services/native-media-final-render-admission-v1';
import { NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1 } from '@/lib/editron/services/native-media-final-render-ffmpeg-encoder-v1';
import { NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1 } from '@/lib/editron/services/native-media-final-render-materializer-v1';
import { createNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1 }
  from '@/lib/editron/services/native-media-final-render-preparation-delivery-retry-policy-v1';
import {
  buildNativeMediaFinalRenderPreparationJobContractV1,
} from '@/lib/editron/services/native-media-final-render-preparation-job-v1';
import { createNativeMediaFinalRenderPreparationRuntimePolicyV1 } from '@/lib/editron/services/native-media-final-render-preparation-runtime-policy-v1';
import {
  createNativeMediaFinalRenderPreparationResumeStateV1,
  createNativeMediaFinalRenderPreparationTerminalReceiptV1,
} from '@/lib/editron/services/native-media-final-render-preparation-result-v1';
import {
  createNativeMediaFinalRenderPublicationRightsReceiptV1,
  createNativeMediaFinalRenderPreparedSourcePublisherV1,
  type NativeMediaFinalRenderPublicationRightsOwnerV1,
} from '@/lib/editron/services/native-media-final-render-prepared-source-publisher-v1';
import { NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1 } from '@/lib/editron/services/native-media-final-render-profile-v1';
import { NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1 } from '@/lib/editron/services/native-media-final-render-r2-private-artifact-v1';
import {
  createNativeMediaFinalRenderArtifactV1,
  createNativeMediaFinalRenderSourceLeaseV1,
} from '@/lib/editron/services/native-media-final-render-source-preparation-v1';

const sha = (value: string) => value.repeat(64);
const NOW = Date.parse('2026-08-30T12:00:00.000Z');
const revision = Object.freeze({
  schemaVersion: 1 as const,
  value: 12,
  compatibilityUpdatedAt: '2026-08-30T00:00:00.000Z',
});
type RightsAuthorizeInput = Parameters<
  NativeMediaFinalRenderPublicationRightsOwnerV1['authorize']
>[0];
type RightsDecision = Readonly<
  | { disposition: 'AUTHORIZED'; rightsEvidenceSha256: string }
  | { disposition: 'BLOCKED'; diagnosticCode: string }
>;

function overlay(overrides: Record<string, unknown> = {}): Overlay {
  return {
    id: 'overlay_1', type: 'video', assetId: 'asset_1', from: 90,
    durationInFrames: 60, sourceStartFrame: 30, sourceEndFrame: 90,
    hasNativeAudio: true, content: '/api/assets/asset_1', styles: {},
    ...overrides,
  } as unknown as Overlay;
}

function asset(overrides: Record<string, unknown> = {}) {
  return {
    assetId: 'asset_1', type: 'video' as const, source: 'user-upload',
    sourceVersionV1: {
      sourceVersionSha256: sha('3'),
      storageVersion: { storageVersionSha256: sha('4') },
    },
    sourcePtsCadenceMapV3: {},
    sourcePtsCadenceMapStateSha256V3: sha('6'),
    sourceAudioArtifactsV1: {},
    sourceAudioArtifactsStateSha256V1: sha('7'),
    ...overrides,
  };
}

function contract(currentAsset = asset(), currentOverlay = overlay()) {
  const exactOverlay = readNativeMediaFinalRenderVideoOverlayV1(currentOverlay);
  return buildNativeMediaFinalRenderPreparationJobContractV1({
    tenantId: 'tenant_1', userId: 'user_1', orgId: null,
    projectId: 'project_1', sequenceId: 'main', projectRevision: revision,
    admissionReceiptSha256: sha('8'),
    budgetReservation: { reservationId: 'budget_1', bindingSha256: sha('9') },
    exactSourceRequest: {
      overlayId: exactOverlay.overlayId,
      assetId: exactOverlay.assetId,
      overlayTimingSha256: exactOverlay.overlayTimingSha256,
      assetTimingStateSha256:
        nativeMediaFinalRenderAssetTimingStateSha256V1(currentAsset as never),
      sourceVersionSha256: sha('3'), storageVersionSha256: sha('4'),
      sourceBindingSha256: sha('5'),
      sourcePtsCadenceMapStateSha256V3: sha('6'),
      renderNativeAudio: true,
    },
    policyBindings: {
      materializerPolicyVersion: NATIVE_MEDIA_FINAL_RENDER_MATERIALIZER_POLICY_VERSION_V1,
      materializerPolicySha256: sha('a'),
      encoderPolicyVersion: NATIVE_MEDIA_FINAL_RENDER_FFMPEG_ENCODER_POLICY_VERSION_V1,
      encoderPolicySha256: sha('b'),
      privateArtifactPolicyVersion:
        NATIVE_MEDIA_FINAL_RENDER_R2_PRIVATE_ARTIFACT_POLICY_VERSION_V1,
      privateArtifactPolicySha256: sha('c'),
      runtimePolicy: runtimePolicy(),
    },
    executionProfile: {
      workerImageDigest: `sha256:${sha('d')}`,
      compatibilityProfileVersion: NATIVE_MEDIA_FINAL_RENDER_PROFILE_VERSION_V1,
      compatibilityReceiptSha256: sha('e'),
    },
  });
}

function runtimePolicy() {
  const policy = deliveryRetryPolicy();
  return createNativeMediaFinalRenderPreparationRuntimePolicyV1({
    executionBudget: {
      ownerId: 'TEST_RENDER_BUDGET_OWNER',
      ownerVersion: 'TEST_RENDER_BUDGET_OWNER_V1',
      policySha256: sha('e'),
    },
    retryPolicy: {
      ownerId: policy.ownerId,
      ownerVersion: policy.ownerVersion,
      policySha256: policy.policySha256,
    },
    heartbeatPolicySha256: sha('0'),
  });
}

function artifact(currentAsset = asset(), currentOverlay = overlay()) {
  const job = contract(currentAsset, currentOverlay).payload;
  const request = job.exactSourceRequest;
  return createNativeMediaFinalRenderArtifactV1({
    schemaVersion: 1, kind: 'EDITRON_NATIVE_MEDIA_FINAL_RENDER_ARTIFACT_V1',
    artifactHandle: `nmfrv1_${sha('f')}`,
    projectId: job.projectId, sequenceId: job.sequenceId,
    projectRevision: job.projectRevision, overlayId: request.overlayId,
    assetId: request.assetId, overlayTimingSha256: request.overlayTimingSha256,
    assetTimingStateSha256: request.assetTimingStateSha256,
    sourceVersionSha256: request.sourceVersionSha256,
    storageVersionSha256: request.storageVersionSha256,
    sourceBindingSha256: request.sourceBindingSha256,
    sourcePtsCadenceMapStateSha256V3: request.sourcePtsCadenceMapStateSha256V3,
    transformSha256: sha('0'), projectRate: { numerator: '30', denominator: '1' },
    timelineStartFrame: '90', timelineFrameCount: '60',
    artifactProfile: 'EDITRON_EXACT_TIMESTAMP_AV_MEZZANINE_V1',
    container: 'matroska', videoCodec: 'h264', pixelFormat: 'gbrp',
    videoFrameCount: '60', decodedFrameSequenceSha256: sha('1'),
    remotionCompatibilityReceiptSha256: sha('e'),
    audio: {
      disposition: 'EMBEDDED_EXACT_NATIVE_PCM', audioCodec: 'pcm_s32le',
      audioMappingSha256: sha('2'), sourceDecodedPcmSha256: sha('a'),
      artifactDecodedPcmSha256: sha('b'),
      decodedPcmEquivalenceReceiptSha256: sha('c'), sampleRate: '48000',
      channelCount: 2, decodedSampleFrameCount: '96000',
    },
    contentType: 'video/x-matroska', artifactContentSha256: sha('f'),
    artifactByteLength: '123456',
  });
}

function completedJob(currentAsset = asset(), currentOverlay = overlay()) {
  const job = contract(currentAsset, currentOverlay);
  const prepared = artifact(currentAsset, currentOverlay);
  const resume = createNativeMediaFinalRenderPreparationResumeStateV1({
    jobInput: job.payload, jobInputBindingSha256: job.bindingSha256,
    publishHandle: `nmfrpubv1_${sha('f')}`, artifact: prepared,
  });
  const terminal = createNativeMediaFinalRenderPreparationTerminalReceiptV1({
    jobId: 'job_1', operationId: job.operationIdentity,
    jobInput: job.payload, jobInputBindingSha256: job.bindingSha256,
    result: resume.payload, executionAuthorizationReceiptSha256: sha('d'),
    completedAt: new Date(NOW - 60_000),
  });
  return {
    jobId: 'job_1', version: 'EDITRON_DURABLE_WORKFLOW_JOB_V1_1',
    tenantId: 'tenant_1', userId: 'user_1', orgId: null,
    projectId: 'project_1', operationOwner: 'NATIVE_MEDIA_FINAL_RENDER',
    operationKind: 'native_media_final_render_prepare_source',
    operationId: job.operationIdentity, parentCommandId: null,
    parentReceiptId: null, idempotencyKey: job.operationIdentity,
    input: { schemaId: job.payload.version, bindingSha256: job.bindingSha256,
      payload: job.payload },
    dependencies: job.dependencies, budgetReservation: job.payload.budgetReservation,
    status: 'completed', attemptCount: 1, maxAttempts: 5, remainingAttempts: 4,
    retryCursor: null, leaseOwnerId: null, leaseExpiresAt: null,
    nextAttemptAt: null, cancelRequestedAt: null, cancelRequestedBy: null,
    cancelReason: null,
    resumeState: { ...resume, sequence: 1, committedAt: new Date(NOW - 120_000).toISOString() },
    terminalReceipt: { ...terminal, completedAt: terminal.completedAt.toISOString() },
    error: null, dispatchTransport: 'QSTASH', dispatchMessageId: 'message_1',
    dispatchCount: 1, createdAt: new Date(NOW - 600_000).toISOString(),
    updatedAt: new Date(NOW - 60_000).toISOString(),
    expiresAt: new Date(NOW + 3_600_000).toISOString(),
  } as const;
}

function audioState(stateSha256 = sha('7')) {
  return {
    sourceAudioArtifactsStateSha256V1: stateSha256,
    sourceAudioArtifactsV1: { records: [{
      source: {
        sourceVersionSha256: sha('3'), storageVersionSha256: sha('4'),
        sourceBindingSha256: sha('5'),
      },
      decodedPcmSha256: sha('a'), sampleRate: '48000', channelCount: 2,
    }] },
  };
}

function rightsReceipt(
  input: RightsAuthorizeInput,
  rightsEvidenceSha256: string,
  overrides: Readonly<{
    projectId?: string;
    artifactBindingSha256?: string;
  }> = {},
) {
  return createNativeMediaFinalRenderPublicationRightsReceiptV1({
    ownerId: 'PROJECT_MEDIA_RIGHTS', ownerVersion: 'PROJECT_MEDIA_RIGHTS_V1',
    tenantId: input.tenantId, userId: input.userId, orgId: input.orgId,
    projectId: overrides.projectId ?? input.projectId,
    projectOwnerId: input.projectOwnerId,
    sequenceId: input.sequenceId, projectRevision: input.projectRevision,
    overlayId: String(input.overlay.id), assetId: String(input.asset.assetId),
    sourceVersionSha256: input.artifact.sourceVersionSha256,
    artifactBindingSha256: overrides.artifactBindingSha256
      ?? input.artifact.artifactBindingSha256,
    currentScopeSha256: input.currentScopeSha256,
    rightsEvidenceSha256,
  });
}

function setup(options: Readonly<{
  jobs?: readonly ReturnType<typeof completedJob>[];
  projects?: readonly Record<string, unknown>[];
  assets?: readonly ReturnType<typeof asset>[];
  rights?: readonly RightsDecision[];
  leaseExpiry?: number;
  deliveryRetryPolicy?: ReturnType<typeof deliveryRetryPolicy>;
}> = {}) {
  const currentOverlay = overlay();
  const currentAsset = asset();
  const prepared = artifact(currentAsset, currentOverlay);
  const jobs = options.jobs ?? [completedJob(currentAsset, currentOverlay)];
  const projects = options.projects ?? [{
    project: { projectId: 'project_1', userId: 'user_1', fps: 30,
      overlays: [currentOverlay] },
    revision,
  }, {
    project: { projectId: 'project_1', userId: 'user_1', fps: 30,
      overlays: [currentOverlay] },
    revision,
  }];
  const assets = options.assets ?? [currentAsset, currentAsset];
  const rights = options.rights ?? [
    { disposition: 'AUTHORIZED', rightsEvidenceSha256: sha('9') },
    { disposition: 'AUTHORIZED', rightsEvidenceSha256: sha('9') },
  ];
  const publisher = { publish: vi.fn(async () => ({
    disposition: 'SOURCE_PUBLISHED' as const,
    lease: createNativeMediaFinalRenderSourceLeaseV1({
      leaseId: 'lease_1', artifact: prepared,
      sourceUrl: 'https://private.example/exact.mkv?signature=secret',
      issuedAtEpochMs: NOW,
      expiresAtEpochMs: options.leaseExpiry ?? NOW + 600_000,
    }),
  })) };
  let rightsCallIndex = 0;
  const rightsOwner = {
    ownerId: 'PROJECT_MEDIA_RIGHTS', ownerVersion: 'PROJECT_MEDIA_RIGHTS_V1',
    authorize: vi.fn(async (input: RightsAuthorizeInput) => {
      const decision = rights[Math.min(rightsCallIndex, rights.length - 1)]!;
      rightsCallIndex += 1;
      if (decision.disposition === 'BLOCKED') return decision;
      return {
        disposition: 'AUTHORIZED' as const,
        receipt: rightsReceipt(input, decision.rightsEvidenceSha256),
      };
    }),
  };
  const ports = {
    jobReader: { getAuthorized: vi.fn(async () => jobs[0] ?? null) },
    projectSnapshotReader: {
      loadProjectForMutation: vi.fn()
        .mockResolvedValueOnce(projects[0])
        .mockResolvedValueOnce(projects[1] ?? projects[0]),
    },
    assetReader: {
      load: vi.fn()
        .mockResolvedValueOnce(assets[0])
        .mockResolvedValueOnce(assets[1] ?? assets[0]),
    },
    deliveryRetryPolicy: options.deliveryRetryPolicy ?? deliveryRetryPolicy(),
    rightsOwner,
    publisher,
    now: () => NOW,
  };
  return {
    owner: createNativeMediaFinalRenderPreparedSourcePublisherV1(ports as never),
    ports,
    publisher,
  };
}

async function publish(runtime = setup()) {
  return runtime.owner.publishPreparedSource({
    jobId: 'job_1', tenantId: 'tenant_1', userId: 'user_1',
    projectId: 'project_1', sequenceId: 'main',
    minimumExpiresAtEpochMs: NOW + 300_000,
  });
}

describe('native final-render prepared source publisher v1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveBinding.mockReturnValue({
      assetId: 'asset_1', sourceVersionSha256: sha('3'),
      storageVersionSha256: sha('4'), sourceBindingSha256: sha('5'),
      sourcePtsCadenceMapStateSha256V3: sha('6'), bindingSha256: sha('5'),
    });
    mocks.readAudioState.mockReturnValue(audioState());
  });

  it('publishes a fresh lease only after durable, current-scope and rights proof', async () => {
    const runtime = setup();
    const result = await publish(runtime);

    expect(result.disposition).toBe('SOURCE_PUBLISHED');
    if (result.disposition !== 'SOURCE_PUBLISHED') return;
    expect(result.receipt).toMatchObject({
      jobId: 'job_1', rightsOwnerId: 'PROJECT_MEDIA_RIGHTS',
      artifactBindingSha256: result.lease.artifact.artifactBindingSha256,
      leaseBindingSha256: result.lease.leaseBindingSha256,
    });
    expect(result.receipt.receiptSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.receipt.rightsAuthorizationReceiptSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result.receipt)).not.toContain('signature=secret');
    expect(runtime.ports.projectSnapshotReader.loadProjectForMutation).toHaveBeenCalledTimes(2);
    expect(runtime.ports.assetReader.load).toHaveBeenCalledTimes(2);
    expect(runtime.ports.rightsOwner.authorize).toHaveBeenCalledTimes(2);
    expect(runtime.publisher.publish).toHaveBeenCalledTimes(1);
  });

  it('rejects a forged resume or terminal receipt before project access', async () => {
    const forgedResume = completedJob();
    const runtime = setup({ jobs: [{
      ...forgedResume,
      resumeState: { ...forgedResume.resumeState, stateSha256: sha('0') },
    } as never] });
    const result = await publish(runtime);

    expect(result).toEqual({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_RESUME_INVALID',
    });
    expect(runtime.ports.projectSnapshotReader.loadProjectForMutation).not.toHaveBeenCalled();

    const forgedTerminal = completedJob();
    const terminalRuntime = setup({ jobs: [{
      ...forgedTerminal,
      terminalReceipt: { ...forgedTerminal.terminalReceipt, receiptSha256: sha('0') },
    } as never] });
    expect(await publish(terminalRuntime)).toEqual({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_TERMINAL_RECEIPT_INVALID',
    });
  });

  it('blocks stale project, overlay and source state without publishing', async () => {
    const staleProject = setup({ projects: [{
      project: { projectId: 'project_1', userId: 'user_1', fps: 30,
        overlays: [overlay()] },
      revision: { ...revision, value: revision.value + 1 },
    }] });
    expect(await publish(staleProject)).toMatchObject({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_PROJECT_STALE',
    });
    expect(staleProject.publisher.publish).not.toHaveBeenCalled();

    const staleOverlay = setup({ projects: [{
      project: { projectId: 'project_1', userId: 'user_1', fps: 30,
        overlays: [overlay({ from: 91 })] }, revision,
    }] });
    expect(await publish(staleOverlay)).toMatchObject({
      diagnostic: 'NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_OVERLAY_STALE',
    });

    const staleAsset = setup({ assets: [asset({ sourcePtsCadenceMapStateSha256V3: sha('0') })] });
    expect(await publish(staleAsset)).toMatchObject({
      diagnostic: 'NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_ASSET_STALE',
    });
  });

  it('blocks missing exact PCM and a rights denial before publication', async () => {
    mocks.readAudioState.mockReturnValueOnce(null);
    const missingAudio = setup();
    expect(await publish(missingAudio)).toMatchObject({
      diagnostic: 'NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_AUDIO_STALE',
    });
    expect(missingAudio.publisher.publish).not.toHaveBeenCalled();

    const rightsDenied = setup({ rights: [{
      disposition: 'BLOCKED', diagnosticCode: 'PROJECT_MEDIA_RIGHTS_REVOKED',
    }] });
    expect(await publish(rightsDenied)).toEqual({
      disposition: 'UNVERIFIABLE', diagnostic: 'PROJECT_MEDIA_RIGHTS_REVOKED',
    });
    expect(rightsDenied.publisher.publish).not.toHaveBeenCalled();
  });

  it('withholds a lease when source or rights change during publication', async () => {
    const first = asset();
    const second = asset();
    mocks.readAudioState
      .mockReturnValueOnce(audioState(sha('7')))
      .mockReturnValueOnce(audioState(sha('8')));
    const changedSource = setup({ assets: [first, second] });
    expect(await publish(changedSource)).toMatchObject({
      diagnostic: 'NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_SCOPE_CHANGED',
    });
    expect(changedSource.publisher.publish).toHaveBeenCalledTimes(1);

    mocks.readAudioState.mockReturnValue(audioState());
    const changedRights = setup({ rights: [
      { disposition: 'AUTHORIZED', rightsEvidenceSha256: sha('9') },
      { disposition: 'AUTHORIZED', rightsEvidenceSha256: sha('8') },
    ] });
    expect(await publish(changedRights)).toMatchObject({
      diagnostic: 'NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_RIGHTS_CHANGED',
    });
  });

  it('rejects leases that miss the requested floor or outlive the durable job', async () => {
    const tooShort = setup({ leaseExpiry: NOW + 120_000 });
    expect(await publish(tooShort)).toMatchObject({
      diagnostic: 'NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_LEASE_INVALID',
    });

    const tooLong = setup({ leaseExpiry: NOW + 7_200_000 });
    expect(await publish(tooLong)).toMatchObject({
      diagnostic: 'NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_LEASE_INVALID',
    });
  });

  it('rejects an expired job and invalid owner wiring deterministically', async () => {
    const expired = completedJob();
    const runtime = setup({ jobs: [{
      ...expired,
      createdAt: new Date(NOW - 4_200_001).toISOString(),
      expiresAt: new Date(NOW - 1).toISOString(),
    } as never] });
    expect(await publish(runtime)).toMatchObject({
      diagnostic: 'NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_JOB_EXPIRED',
    });
    expect(runtime.publisher.publish).not.toHaveBeenCalled();

    expect(() => createNativeMediaFinalRenderPreparedSourcePublisherV1({
      ...runtime.ports,
      rightsOwner: { ...runtime.ports.rightsOwner, ownerVersion: 'bad owner version' },
    } as never)).toThrow(
      'NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_RIGHTS_OWNER_VERSION_INVALID',
    );
  });

  it('rejects delivery/retry policy or durable lifecycle drift before project access', async () => {
    const differentPolicy = createNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1({
      durableJob: { maxAttempts: 5, retentionMs: 4_200_000 },
      qstashDelivery: { retries: 2, retryDelayMs: 20_000, timeoutSeconds: 120 },
      workerRetry: { delayMs: 1_000 },
    });
    const policyDrift = setup({ deliveryRetryPolicy: differentPolicy });
    expect(await publish(policyDrift)).toMatchObject({
      diagnostic:
        'NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_DELIVERY_RETRY_POLICY_BINDING_INVALID',
    });
    expect(policyDrift.ports.projectSnapshotReader.loadProjectForMutation)
      .not.toHaveBeenCalled();

    const job = completedJob();
    const retentionDrift = setup({ jobs: [{
      ...job,
      expiresAt: new Date(Date.parse(job.expiresAt) + 1).toISOString(),
    } as never] });
    expect(await publish(retentionDrift)).toMatchObject({
      diagnostic:
        'NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_DELIVERY_RETRY_POLICY_BINDING_INVALID',
    });
    expect(retentionDrift.ports.projectSnapshotReader.loadProjectForMutation)
      .not.toHaveBeenCalled();
  });

  it('rejects a validly rehashed rights receipt for another project', async () => {
    const runtime = setup();
    runtime.ports.rightsOwner.authorize.mockReset().mockImplementation(
      async (input: RightsAuthorizeInput) => ({
        disposition: 'AUTHORIZED' as const,
        receipt: rightsReceipt(input, sha('9'), { projectId: 'project_2' }),
      }),
    );

    expect(await publish(runtime)).toEqual({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_RIGHTS_RECEIPT_SCOPE_INVALID',
    });
    expect(runtime.publisher.publish).not.toHaveBeenCalled();
  });

  it('rejects a durable envelope whose org differs from its bound payload', async () => {
    const job = completedJob();
    const runtime = setup({ jobs: [{ ...job, orgId: 'org_2' } as never] });

    expect(await publish(runtime)).toEqual({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'NATIVE_MEDIA_FINAL_RENDER_PUBLICATION_JOB_BINDING_INVALID',
    });
    expect(runtime.ports.projectSnapshotReader.loadProjectForMutation).not.toHaveBeenCalled();
  });

  it('does not accept a merely rehashed forged terminal result', async () => {
    const job = completedJob();
    const forgedPayload = {
      ...job.resumeState.payload,
      publishHandleSha256: sha('0'),
    };
    const runtime = setup({ jobs: [{
      ...job,
      resumeState: {
        ...job.resumeState,
        payload: forgedPayload,
        stateSha256: hashDurableWorkflowJobJsonV1(forgedPayload),
      },
    } as never] });
    expect(await publish(runtime)).toMatchObject({
      disposition: 'UNVERIFIABLE',
      diagnostic: 'NATIVE_MEDIA_FINAL_RENDER_RESULT_BINDING_INVALID',
    });
  });
});

function deliveryRetryPolicy() {
  return createNativeMediaFinalRenderPreparationDeliveryRetryPolicyV1({
    durableJob: { maxAttempts: 5, retentionMs: 4_200_000 },
    qstashDelivery: { retries: 2, retryDelayMs: 10_000, timeoutSeconds: 120 },
    workerRetry: { delayMs: 1_000 },
  });
}
