import type { DurableWorkflowJobSnapshotV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import {
  createMediaProxyMasterR2PreparedArtifactManifestV1,
  expectedMediaProxyMasterR2PreparedArtifactChunkObjectKeyV1,
  expectedMediaProxyMasterR2PreparedArtifactHandleV1,
  serializeMediaProxyMasterR2PreparedArtifactManifestV1,
} from '@/lib/editron/services/media-proxy-master-r2-prepared-artifact-manifest-v1';
import {
  createMediaProxyMasterR2PreparedArtifactPolicyV1,
  resolveMediaProxyMasterR2PreparedArtifactChunkPlanV1,
}
  from '@/lib/editron/services/media-proxy-master-r2-prepared-artifact-policy-v1';
import { createMediaProxyMasterR2PreparedArtifactReferenceV1 }
  from '@/lib/editron/services/media-proxy-master-r2-prepared-artifact-reference-v1';
import { createMediaProxyMasterR2PrivatePublicationPolicyV2 }
  from '@/lib/editron/services/media-proxy-master-r2-private-publication-policy-v2';
import { buildMediaProxyMasterTranscodeDurableJobContractV2 }
  from '@/lib/editron/services/media-proxy-master-transcode-durable-job-v2';
import { createMediaProxyMasterTranscodeDurablePreparedStateV2 }
  from '@/lib/editron/services/media-proxy-master-transcode-durable-result-v2';
import {
  createMediaProxyMasterTranscodeExecutionBudgetAuthorizationV2,
  createMediaProxyMasterTranscodeExecutionBudgetReservationV2,
  mediaProxyMasterTranscodeExecutionBudgetReservationRefV2,
} from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-reservation-v2';
import { createMediaProxyMasterTranscodePreparedEvidenceV2 }
  from '@/lib/editron/services/media-proxy-master-transcode-prepared-evidence-v2';
import {
  buildMediaProxyMasterTranscodeBudgetBasisFixtureV1,
  createMediaProxyMasterTranscodeBudgetTrustedReceiptV1,
} from './media-proxy-master-transcode-budget-fixture';

const MiB = 1_024 * 1_024;
export const MEDIA_PROXY_MASTER_TRANSCODE_V2_FIXTURE_CREATED_AT =
  '2026-08-30T00:00:00.000Z';
export const MEDIA_PROXY_MASTER_TRANSCODE_V2_FIXTURE_EXPIRES_AT =
  '2026-09-06T00:00:00.000Z';

export function buildMediaProxyMasterTranscodeV2Fixture(
  options: Readonly<{
    retainUntil?: string;
    artifactByteLength?: number;
    maxOutputBytes?: number;
  }> = {},
) {
  const artifactByteLength = options.artifactByteLength ?? 40_000;
  const base = buildMediaProxyMasterTranscodeBudgetBasisFixtureV1({
    maxOutputBytes: options.maxOutputBytes
      ?? Math.max(2_000_000, artifactByteLength),
  });
  const publicationPolicy = createMediaProxyMasterR2PrivatePublicationPolicyV2({
    bucketName: 'editron-media-proxy-private',
    storagePolicyVersion: 'private-proxy-media-v1',
    browserRouteExposure: 'NO_BROWSER_ROUTE',
  });
  const preparedArtifactPolicy =
    createMediaProxyMasterR2PreparedArtifactPolicyV1({
      publicationPolicy,
      targetChunkBytes: 5 * MiB,
      maximumManifestBytes: MiB,
    });
  const budgetEvidence = {
    tenantId: 'tenant-a', userId: 'user-a', orgId: null, assetId: 'asset-a',
    command: base.command, runtimePolicy: base.runtimePolicy,
    publicationPolicy, preparedArtifactPolicy,
  } as const;
  const budgetAuthorization =
    createMediaProxyMasterTranscodeExecutionBudgetAuthorizationV2({
      policy: base.policy,
      evidence: budgetEvidence,
      approvedBy: 'finance-admin',
      approvedAt: '2026-08-30T00:05:00.000Z',
      expiresAt: '2026-08-30T01:00:00.000Z',
    });
  const budgetReservation =
    createMediaProxyMasterTranscodeExecutionBudgetReservationV2({
      policy: base.policy,
      authorization: budgetAuthorization,
      reservationId: 'mpmt-result-v2-budget',
      reservedAt: '2026-08-30T00:10:00.000Z',
    });
  const contract = buildMediaProxyMasterTranscodeDurableJobContractV2({
    ...budgetEvidence,
    budgetReservation:
      mediaProxyMasterTranscodeExecutionBudgetReservationRefV2(
        budgetReservation,
      ),
  });
  const job = mediaProxyMasterTranscodeV2SnapshotFixture(contract, null);
  const seedReceipt =
    createMediaProxyMasterTranscodeBudgetTrustedReceiptV1(base.command, {
      proxyByteLength: artifactByteLength,
    });
  const preparedEvidence = createMediaProxyMasterTranscodePreparedEvidenceV2({
    jobInput: contract.payload,
    process: {
      startedAt: seedReceipt.process.startedAt,
      completedAt: seedReceipt.process.completedAt,
      exitCode: 0,
      stderrByteLength: seedReceipt.process.stderrByteLength,
      stderrSha256: seedReceipt.process.stderrSha256,
    },
    masterLocalFileEvidence: seedReceipt.masterDecode.localFileEvidence,
    outputProbe: seedReceipt.proxyEncode.outputProbe,
    outputVideoStreamIndex: seedReceipt.proxyEncode.outputVideoStreamIndex,
    outputAudioStreamIndexes: seedReceipt.proxyEncode.outputAudioStreamIndexes,
  });
  const preparedArtifactReference = createReference({
    job,
    policy: preparedArtifactPolicy,
    preparedEvidence,
    retainUntil: options.retainUntil
      ?? MEDIA_PROXY_MASTER_TRANSCODE_V2_FIXTURE_EXPIRES_AT,
  });
  return {
    base,
    contract,
    job,
    seedReceipt,
    preparedEvidence,
    preparedArtifactReference,
    budgetAuthorization,
    budgetReservation,
  };
}

export function createMediaProxyMasterTranscodePreparedStateV2Fixture(
  fixture: ReturnType<typeof buildMediaProxyMasterTranscodeV2Fixture>,
) {
  return createMediaProxyMasterTranscodeDurablePreparedStateV2({
    job: fixture.job,
    budgetAuthorizationReceiptSha256:
      fixture.budgetAuthorization.authorizationSha256,
    preparedEvidence: fixture.preparedEvidence,
    preparedArtifactReference: fixture.preparedArtifactReference,
  });
}

export function withMediaProxyMasterTranscodeResumeV2Fixture(
  job: DurableWorkflowJobSnapshotV1,
  sequence: number,
  resume: Readonly<{
    schemaId: string;
    stateSha256: string;
    payload: Readonly<Record<string, unknown>>;
  }>,
  committedAt: string,
): DurableWorkflowJobSnapshotV1 {
  return {
    ...job,
    resumeState: {
      sequence,
      schemaId: resume.schemaId,
      stateSha256: resume.stateSha256,
      payload: resume.payload,
      committedAt,
    },
    updatedAt: committedAt,
  };
}

function createReference(input: Readonly<{
  job: DurableWorkflowJobSnapshotV1;
  policy: ReturnType<typeof createMediaProxyMasterR2PreparedArtifactPolicyV1>;
  preparedEvidence: ReturnType<
    typeof createMediaProxyMasterTranscodePreparedEvidenceV2>;
  retainUntil: string;
}>) {
  const payload = input.job.input.payload as never as ReturnType<
    typeof buildMediaProxyMasterTranscodeDurableJobContractV2>['payload'];
  const probe = input.preparedEvidence.outputProbe;
  const base = {
    policy: input.policy,
    jobId: input.job.jobId,
    tenantId: payload.tenantId,
    userId: payload.userId,
    orgId: payload.orgId,
    owner: payload.command.masterSourceVersion.owner,
    assetId: payload.assetId,
    commandSha256: payload.command.commandSha256,
    outputProbeSha256: probe.probeSha256,
    artifactByteLength: probe.proxyByteLength,
    artifactContentSha256: probe.proxyContentSha256,
  };
  const artifactHandle = expectedMediaProxyMasterR2PreparedArtifactHandleV1(base);
  const chunkPlan = resolveMediaProxyMasterR2PreparedArtifactChunkPlanV1({
    policy: input.policy,
    artifactByteLength: probe.proxyByteLength,
  });
  const chunks = Array.from({ length: chunkPlan.totalChunks }, (_, index) => {
    const sequence = index + 1;
    const startByte = index * chunkPlan.chunkSize;
    const endExclusiveByte = Math.min(
      startByte + chunkPlan.chunkSize,
      probe.proxyByteLength,
    );
    const chunkSha256 = chunkPlan.totalChunks === 1
      ? probe.proxyContentSha256
      : fixtureHash(`prepared-chunk-${sequence}`);
    return {
      sequence,
      startByte,
      endExclusiveByte,
      byteLength: endExclusiveByte - startByte,
      contentSha256: chunkSha256,
      objectKey: expectedMediaProxyMasterR2PreparedArtifactChunkObjectKeyV1(
        artifactHandle,
        sequence,
        chunkSha256,
      ),
      fullGetETag: `prepared-chunk-etag-${sequence}`,
      headETag: `prepared-chunk-etag-${sequence}`,
      verifiedAt: '2026-08-30T00:12:01.250Z',
    };
  });
  const manifest = createMediaProxyMasterR2PreparedArtifactManifestV1({
    ...base,
    chunks,
    stagedAt: '2026-08-30T00:12:01.500Z',
    retainUntil: input.retainUntil,
  });
  const serialization = serializeMediaProxyMasterR2PreparedArtifactManifestV1({
    policy: input.policy,
    manifest,
  });
  return createMediaProxyMasterR2PreparedArtifactReferenceV1({
    policy: input.policy,
    serialization,
    manifestFullGetETag: 'prepared-manifest-etag',
    manifestHeadETag: 'prepared-manifest-etag',
  });
}

function fixtureHash(value: string): string {
  return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
}

function mediaProxyMasterTranscodeV2SnapshotFixture(
  contract: ReturnType<typeof buildMediaProxyMasterTranscodeDurableJobContractV2>,
  resumeState: DurableWorkflowJobSnapshotV1['resumeState'],
): DurableWorkflowJobSnapshotV1 {
  return {
    jobId: 'dwj_proxy_result_v2',
    version: 'EDITRON_DURABLE_WORKFLOW_JOB_V1_1',
    tenantId: contract.payload.tenantId,
    userId: contract.payload.userId,
    orgId: contract.payload.orgId,
    projectId: null,
    operationOwner: 'MEDIA_ASSETS',
    operationKind: 'media_proxy_master_trusted_transcode',
    operationId: contract.operationIdentity,
    parentCommandId: null,
    parentReceiptId: null,
    idempotencyKey: contract.operationIdentity,
    input: {
      schemaId: contract.payload.version,
      bindingSha256: contract.bindingSha256,
      payload: contract.payload,
    },
    dependencies: contract.dependencies,
    budgetReservation: contract.payload.budgetReservation,
    status: 'running',
    attemptCount: 1,
    maxAttempts: contract.payload.runtimePolicy.lifecycle.maxAttempts,
    remainingAttempts: contract.payload.runtimePolicy.lifecycle.maxAttempts - 1,
    retryCursor: null,
    leaseOwnerId: 'worker-v2',
    leaseExpiresAt: '2026-08-30T00:15:00.000Z',
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
    createdAt: MEDIA_PROXY_MASTER_TRANSCODE_V2_FIXTURE_CREATED_AT,
    updatedAt: '2026-08-30T00:12:00.000Z',
    expiresAt: MEDIA_PROXY_MASTER_TRANSCODE_V2_FIXTURE_EXPIRES_AT,
  };
}
