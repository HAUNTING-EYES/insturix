import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { DurableWorkflowJobSnapshotV1 }
  from '@/lib/editron/services/durable-workflow-job-v1';
import {
  createMediaProxyMasterR2PreparedArtifactManifestV1,
  expectedMediaProxyMasterR2PreparedArtifactChunkObjectKeyV1,
  expectedMediaProxyMasterR2PreparedArtifactHandleV1,
  serializeMediaProxyMasterR2PreparedArtifactManifestV1,
} from '@/lib/editron/services/media-proxy-master-r2-prepared-artifact-manifest-v1';
import { createMediaProxyMasterR2PreparedArtifactPolicyV1 }
  from '@/lib/editron/services/media-proxy-master-r2-prepared-artifact-policy-v1';
import { createMediaProxyMasterR2PreparedArtifactReferenceV1 }
  from '@/lib/editron/services/media-proxy-master-r2-prepared-artifact-reference-v1';
import { createMediaProxyMasterR2PrivatePublicationPolicyV2 }
  from '@/lib/editron/services/media-proxy-master-r2-private-publication-policy-v2';
import { buildMediaProxyMasterTranscodeDurableJobContractV2 }
  from '@/lib/editron/services/media-proxy-master-transcode-durable-job-v2';
import {
  assertMediaProxyMasterTranscodeDurablePreparedStateForJobV2,
  assertMediaProxyMasterTranscodeDurableResultForJobV2,
  createMediaProxyMasterTranscodeDurablePreparedStateV2,
  createMediaProxyMasterTranscodeDurableResultV2,
  createMediaProxyMasterTranscodeDurableTerminalReceiptV2,
  createMediaProxyMasterTranscodePreparedResumeStateV2,
  createMediaProxyMasterTranscodeResultResumeStateV2,
  createMediaProxyMasterTrustedReceiptFromPersistedPreparationV2,
  readMediaProxyMasterTranscodeDurableResumeStateV2,
} from '@/lib/editron/services/media-proxy-master-transcode-durable-result-v2';
import {
  createMediaProxyMasterTranscodeExecutionBudgetAuthorizationV2,
  createMediaProxyMasterTranscodeExecutionBudgetReservationV2,
  mediaProxyMasterTranscodeExecutionBudgetReservationRefV2,
} from '@/lib/editron/services/media-proxy-master-transcode-execution-budget-reservation-v2';
import { createMediaProxyMasterTranscodePreparedEvidenceV2 }
  from '@/lib/editron/services/media-proxy-master-transcode-prepared-evidence-v2';
import {
  buildMediaProxyMasterTranscodeBudgetFixtureV1,
  createMediaProxyMasterTranscodeBudgetTrustedReceiptV1,
} from './helpers/media-proxy-master-transcode-budget-fixture';

const MiB = 1_024 * 1_024;
const CREATED_AT = '2026-08-30T00:00:00.000Z';
const EXPIRES_AT = '2026-09-06T00:00:00.000Z';

describe('MediaProxyMasterTranscodeDurableResultV2', () => {
  it('requires persisted preparation before result and terminal PASS', () => {
    const fixture = buildFixture();
    const preparedState = createPreparedState(fixture);
    const preparedResume = createMediaProxyMasterTranscodePreparedResumeStateV2({
      job: fixture.job,
      preparedState,
    });
    const preparedJob = withResume(fixture.job, 1, preparedResume,
      '2026-08-30T00:12:01.750Z');

    expect(assertMediaProxyMasterTranscodeDurablePreparedStateForJobV2(
      preparedState,
      preparedJob,
    )).toEqual(preparedState);
    expect(readMediaProxyMasterTranscodeDurableResumeStateV2(preparedJob))
      .toEqual(preparedState);

    const trusted =
      createMediaProxyMasterTrustedReceiptFromPersistedPreparationV2({
        job: preparedJob,
        proxySourceVersion: fixture.seedReceipt.proxyEncode.sourceVersion,
        completedAt: fixture.seedReceipt.completedAt,
      });
    expect(trusted.receiptSha256).toBe(fixture.seedReceipt.receiptSha256);
    const result = createMediaProxyMasterTranscodeDurableResultV2({
      job: preparedJob,
      trustedTranscodeReceipt: trusted,
    });
    const resultResume = createMediaProxyMasterTranscodeResultResumeStateV2({
      job: preparedJob,
      result,
    });
    const resultJob = withResume(fixture.job, 2, resultResume,
      '2026-08-30T00:12:02.500Z');

    expect(assertMediaProxyMasterTranscodeDurableResultForJobV2(
      result,
      resultJob,
    )).toEqual(result);
    expect(readMediaProxyMasterTranscodeDurableResumeStateV2(resultJob))
      .toEqual(result);
    const terminal = createMediaProxyMasterTranscodeDurableTerminalReceiptV2({
      job: resultJob,
      completedAt: new Date('2026-08-30T00:12:03.000Z'),
    });
    expect(terminal.disposition).toBe('PASS');
    expect(terminal.proofReferences.map(({ proofId }) => proofId)).toEqual([
      'execution-budget-authorization',
      'private-publication-policy-v2',
      'prepared-artifact-policy',
      'prepared-artifact-reference',
      'prepared-transcode-evidence',
      'durable-prepared-state',
      'trusted-proxy-transcode',
      'durable-transcode-result',
    ]);
  });

  it('blocks finalization when sequence one was never persisted', () => {
    const fixture = buildFixture();

    expect(() => createMediaProxyMasterTrustedReceiptFromPersistedPreparationV2({
      job: fixture.job,
      proxySourceVersion: fixture.seedReceipt.proxyEncode.sourceVersion,
      completedAt: fixture.seedReceipt.completedAt,
    })).toThrow('PREPARED_RESUME_REQUIRED');
    expect(() => createMediaProxyMasterTranscodeDurableResultV2({
      job: fixture.job,
      trustedTranscodeReceipt: fixture.seedReceipt,
    })).toThrow('PREPARED_RESUME_REQUIRED');
    expect(() => createMediaProxyMasterTranscodeDurableTerminalReceiptV2({
      job: fixture.job,
      completedAt: new Date('2026-08-30T00:12:03.000Z'),
    })).toThrow('TERMINAL_RESULT_NOT_PERSISTED');
  });

  it('rejects sequence, state hash, and final result substitution', () => {
    const fixture = buildFixture();
    const prepared = createPreparedState(fixture);
    const resume = createMediaProxyMasterTranscodePreparedResumeStateV2({
      job: fixture.job,
      preparedState: prepared,
    });
    const wrongSequence = withResume(fixture.job, 2, resume,
      '2026-08-30T00:12:01.750Z');
    expect(() => readMediaProxyMasterTranscodeDurableResumeStateV2(wrongSequence))
      .toThrow('RESUME_SEQUENCE_INVALID');
    const forged = withResume(fixture.job, 1, {
      ...resume,
      stateSha256: sha('forged-state'),
    }, '2026-08-30T00:12:01.750Z');
    expect(() => readMediaProxyMasterTranscodeDurableResumeStateV2(forged))
      .toThrow('RESUME_BINDING_INVALID');

    const preparedJob = withResume(fixture.job, 1, resume,
      '2026-08-30T00:12:01.750Z');
    const result = createMediaProxyMasterTranscodeDurableResultV2({
      job: preparedJob,
      trustedTranscodeReceipt: fixture.seedReceipt,
    });
    expect(() => assertMediaProxyMasterTranscodeDurableResultForJobV2({
      ...result,
      resultSha256: sha('forged-result'),
    }, preparedJob)).toThrow('RESULT_BINDING_INVALID');
  });

  it('rejects preparation that expires before the durable job', () => {
    const fixture = buildFixture({ retainUntil: '2026-09-05T23:59:59.999Z' });
    expect(() => createPreparedState(fixture))
      .toThrow('PREPARED_REFERENCE_JOB_MISMATCH');
  });

  it('rejects impossible persistence and terminal chronology', () => {
    const fixture = buildFixture();
    const prepared = createPreparedState(fixture);
    const preparedResume = createMediaProxyMasterTranscodePreparedResumeStateV2({
      job: fixture.job,
      preparedState: prepared,
    });
    const preStageJob = withResume(fixture.job, 1, preparedResume,
      '2026-08-30T00:12:01.400Z');
    expect(() => readMediaProxyMasterTranscodeDurableResumeStateV2(preStageJob))
      .toThrow('RESUME_TIME_INVALID');
    const expiredPreparedJob = withResume(fixture.job, 1, preparedResume,
      EXPIRES_AT);
    expect(() => readMediaProxyMasterTranscodeDurableResumeStateV2(
      expiredPreparedJob,
    )).toThrow('RESUME_TIME_INVALID');

    const preparedJob = withResume(fixture.job, 1, preparedResume,
      '2026-08-30T00:12:01.750Z');
    expect(() => createMediaProxyMasterTrustedReceiptFromPersistedPreparationV2({
      job: preparedJob,
      proxySourceVersion: fixture.seedReceipt.proxyEncode.sourceVersion,
      completedAt: '2026-08-30T00:12:01.600Z',
    })).toThrow('TRUSTED_RECEIPT_BEFORE_PREPARED_COMMIT');

    const result = createMediaProxyMasterTranscodeDurableResultV2({
      job: preparedJob,
      trustedTranscodeReceipt: fixture.seedReceipt,
    });
    const resultResume = createMediaProxyMasterTranscodeResultResumeStateV2({
      job: preparedJob,
      result,
    });
    const preReceiptResultJob = withResume(fixture.job, 2, resultResume,
      '2026-08-30T00:12:01.900Z');
    expect(() => readMediaProxyMasterTranscodeDurableResumeStateV2(
      preReceiptResultJob,
    )).toThrow('RESUME_TIME_INVALID');

    const resultJob = withResume(fixture.job, 2, resultResume,
      '2026-08-30T00:12:02.500Z');
    expect(() => createMediaProxyMasterTranscodeDurableTerminalReceiptV2({
      job: resultJob,
      completedAt: new Date('2026-08-30T00:12:02.250Z'),
    })).toThrow('TERMINAL_TIME_INVALID');
    expect(() => createMediaProxyMasterTranscodeDurableTerminalReceiptV2({
      job: resultJob,
      completedAt: new Date(EXPIRES_AT),
    })).toThrow('TERMINAL_TIME_INVALID');
  });
});

function buildFixture(
  options: Readonly<{ retainUntil?: string }> = {},
) {
  const base = buildMediaProxyMasterTranscodeBudgetFixtureV1();
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
  const job = snapshot(contract, null);
  const seedReceipt =
    createMediaProxyMasterTranscodeBudgetTrustedReceiptV1(base.command);
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
    retainUntil: options.retainUntil ?? '2026-09-07T00:00:00.000Z',
  });
  return {
    job,
    seedReceipt,
    preparedEvidence,
    preparedArtifactReference,
    budgetAuthorization,
  };
}

function createPreparedState(fixture: ReturnType<typeof buildFixture>) {
  return createMediaProxyMasterTranscodeDurablePreparedStateV2({
    job: fixture.job,
    budgetAuthorizationReceiptSha256:
      fixture.budgetAuthorization.authorizationSha256,
    preparedEvidence: fixture.preparedEvidence,
    preparedArtifactReference: fixture.preparedArtifactReference,
  });
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
  const chunkSha256 = probe.proxyContentSha256;
  const manifest = createMediaProxyMasterR2PreparedArtifactManifestV1({
    ...base,
    chunks: [{
      sequence: 1,
      startByte: 0,
      endExclusiveByte: probe.proxyByteLength,
      byteLength: probe.proxyByteLength,
      contentSha256: chunkSha256,
      objectKey: expectedMediaProxyMasterR2PreparedArtifactChunkObjectKeyV1(
        artifactHandle,
        1,
        chunkSha256,
      ),
      fullGetETag: 'prepared-chunk-etag',
      headETag: 'prepared-chunk-etag',
      verifiedAt: '2026-08-30T00:12:01.250Z',
    }],
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

function snapshot(
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
    remainingAttempts:
      contract.payload.runtimePolicy.lifecycle.maxAttempts - 1,
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
    createdAt: CREATED_AT,
    updatedAt: '2026-08-30T00:12:00.000Z',
    expiresAt: EXPIRES_AT,
  };
}

function withResume(
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

function sha(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
