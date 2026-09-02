import {
  DURABLE_WORKFLOW_JOB_LEASE_MS_V1,
  DurableWorkflowJobLeaseLostErrorV1,
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobSnapshotV1,
  type DurableWorkflowJobTerminalReceiptV1,
} from './durable-workflow-job-v1';
import type { DurableWorkflowJobStoreV1 } from './durable-workflow-job-store-v1';
import {
  MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_JOB_INPUT_VERSION_V3,
  assertMediaSourcePtsCadenceDurableEpochJobInputV3,
  buildMediaSourcePtsCadenceDurableEpochJobContractV3,
  type MediaSourcePtsCadenceDurableEpochJobInputV3,
} from './media-source-pts-cadence-durable-job-binding-v3';
import type { MediaSourcePtsCadenceEpochArtifactVerificationPolicyV3 }
  from './media-source-pts-cadence-epoch-artifact-verifier-v3';
import type { MediaSourcePtsCadenceEpochIndexResourcePolicyV3 }
  from './media-source-pts-cadence-epoch-index-v3';
import {
  MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3,
  MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3,
  assertMediaSourcePtsCadenceEpochScanJobV3,
  createMediaSourcePtsCadenceEpochScanSubmissionV3,
  type MediaSourcePtsCadenceEpochScanJobV3,
  type MediaSourcePtsCadenceEpochScanPollResultV3,
  type MediaSourcePtsCadenceEpochScanSubmitResultV3,
} from './media-source-pts-cadence-epoch-scan-transport-v3';
import {
  assertMediaSourcePtsCadenceEpochScanResultV3,
  type MediaSourcePtsCadenceScanResultV1,
} from './media-source-pts-cadence-scan-result-v1';
import {
  createMediaSourcePtsCadenceScanRequestV1,
  type MediaSourcePtsCadenceScanRequestV1,
  type ScanTransportDiagnosticV1,
} from './media-source-pts-cadence-scan-transport-v1';
import type { MediaSourcePtsCadenceSourceCoverageV2 }
  from './media-source-pts-cadence-source-coverage-v2';
import type { MediaSourceQualificationRecordV1 }
  from './media-source-qualification-v1';
import type { MediaSourceVersionV1 } from './media-source-version-v1';

export const MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_RESUME_VERSION_V3 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_RESUME_V3_1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_WORKER_RECEIPT_VERSION_V3 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_WORKER_RECEIPT_V3_1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_POLL_DELAY_MS_V3 = 30_000;

type CurrentSourceV3 = Readonly<{
  sourceVersion: MediaSourceVersionV1;
  qualification: MediaSourceQualificationRecordV1;
}>;

type ResolvedSourceUrlV3 = Readonly<
  | {
      disposition: 'AVAILABLE';
      sourceUrl: string;
      storageVersionSha256: string;
    }
  | {
      disposition: 'UNVERIFIABLE';
      diagnostic: string;
      retryable: boolean;
    }
>;

export type MediaSourcePtsCadenceDurableEpochPublisherResultV3 = Readonly<
  | {
      disposition: 'COMPLETED' | 'ALREADY_COMPLETE';
      terminalReceiptSha256: string;
    }
  | {
      disposition: 'UNVERIFIABLE';
      diagnostic: string;
      terminalReceiptSha256: string | null;
    }
  | { disposition: 'RETRYABLE'; reason: string }
  | { disposition: 'BUSY'; activeClaimId: string }
  | { disposition: 'REJECTED'; reason: string }
>;

export type MediaSourcePtsCadenceDurableEpochWorkerPortsV3 = Readonly<{
  loadCurrentSource(input: Readonly<{
    assetId: string;
    userId: string;
  }>): Promise<CurrentSourceV3 | null>;
  resolveVerifiedSourceUrl(input: Readonly<{
    assetId: string;
    userId: string;
    qualification: MediaSourceQualificationRecordV1;
  }>): Promise<ResolvedSourceUrlV3>;
  submitScan(
    submission: ReturnType<typeof createMediaSourcePtsCadenceEpochScanSubmissionV3>,
  ): Promise<MediaSourcePtsCadenceEpochScanSubmitResultV3>;
  pollScan(
    job: MediaSourcePtsCadenceEpochScanJobV3,
  ): Promise<MediaSourcePtsCadenceEpochScanPollResultV3>;
  publishScan(input: Readonly<{
    assetId: string;
    userId: string;
    claimId: string;
    claimExpiresAt: Date;
    now(): Date;
    request: MediaSourcePtsCadenceScanRequestV1;
    result: MediaSourcePtsCadenceScanResultV1;
    sourceVersion: MediaSourceVersionV1;
    qualification: MediaSourceQualificationRecordV1;
    expectedCoverage: MediaSourcePtsCadenceSourceCoverageV2;
    epochIndexResourcePolicy: MediaSourcePtsCadenceEpochIndexResourcePolicyV3;
    verificationPolicy: MediaSourcePtsCadenceEpochArtifactVerificationPolicyV3;
    lifecycle: Readonly<{
      heartbeat(): Promise<void>;
      nextClaimExpiresAt(): Date;
    }>;
  }>): Promise<MediaSourcePtsCadenceDurableEpochPublisherResultV3>;
}>;

export type MediaSourcePtsCadenceDurableEpochWorkerResultV3 = Readonly<
  | { kind: 'skipped'; reason: string }
  | { kind: 'lease_lost'; reason: string }
  | { kind: 'cancelled'; jobId: string }
  | { kind: 'deferred'; jobId: string; submissionId: string }
  | { kind: 'retry_wait' | 'dead_letter'; jobId: string; errorCode: string }
  | {
      kind: 'completed';
      jobId: string;
      disposition: 'PASS' | 'UNVERIFIABLE';
      receiptSha256: string;
    }
>;

type ResumePayloadV3 = Readonly<
  | {
      version: typeof MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_RESUME_VERSION_V3;
      stage: 'SUBMITTING';
      submissionId: string;
      mapBindingSha256: string;
      mapperVersion: typeof MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3;
      commandPolicyVersion:
        typeof MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3;
    }
  | {
      version: typeof MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_RESUME_VERSION_V3;
      stage: 'SUBMITTED';
      submissionId: string;
      functionCallId: string;
      mapBindingSha256: string;
      mapperVersion: typeof MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3;
      commandPolicyVersion:
        typeof MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3;
    }
>;

class WorkerFailureV3 extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly cursor: Readonly<Record<string, unknown>> = {},
  ) {
    super(code);
    this.name = 'MediaSourcePtsCadenceDurableEpochWorkerFailureV3';
  }
}

class CancellationRequestedV3 extends Error {}

export async function runMediaSourcePtsCadenceDurableEpochWorkerV3(
  input: Readonly<{
    jobStore: Pick<DurableWorkflowJobStoreV1,
      'claim' | 'heartbeat' | 'saveResumeState' | 'deferUntil' | 'complete'
      | 'retryOrDeadLetter' | 'markCancelled' | 'getAuthorized'>;
    ports: MediaSourcePtsCadenceDurableEpochWorkerPortsV3;
    jobId: string;
    workerId: string;
    clock?: () => Date;
    retryDelayMs?: number;
    pollDelayMs?: number;
  }>,
): Promise<MediaSourcePtsCadenceDurableEpochWorkerResultV3> {
  const clock = input.clock ?? (() => new Date());
  const claim = await input.jobStore.claim({
    jobId: input.jobId,
    workerId: input.workerId,
    now: clock(),
  });
  if (claim.kind === 'skipped') {
    return { kind: 'skipped', reason: claim.reason };
  }
  if (claim.kind === 'cancel_claimed') {
    await input.jobStore.markCancelled({
      jobId: input.jobId,
      leaseToken: claim.leaseToken,
      receipt: cancellationReceipt(claim.job, clock()),
      now: clock(),
    });
    return { kind: 'cancelled', jobId: input.jobId };
  }

  let cancellationRequested = false;
  let resumeSequence = claim.job.resumeState?.sequence ?? 0;
  const heartbeat = async (): Promise<void> => {
    const state = await input.jobStore.heartbeat({
      jobId: input.jobId,
      leaseToken: claim.leaseToken,
      now: clock(),
    });
    if (state === 'CANCEL_REQUESTED') {
      cancellationRequested = true;
      throw new CancellationRequestedV3(
        'MEDIA_SOURCE_PTS_EPOCH_WORKER_CANCEL_REQUESTED',
      );
    }
  };
  const persistResume = async (payload: ResumePayloadV3): Promise<void> => {
    await heartbeat();
    await input.jobStore.saveResumeState({
      jobId: input.jobId,
      leaseToken: claim.leaseToken,
      expectedSequence: resumeSequence,
      state: {
        schemaId: MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_RESUME_VERSION_V3,
        stateSha256: hashDurableWorkflowJobJsonV1(payload),
        payload,
      },
      now: clock(),
    });
    resumeSequence += 1;
  };

  try {
    await heartbeat();
    const resolved = await resolveCurrentJob(claim.job, input.ports);
    const resume = claim.job.resumeState
      ? assertResumeState(claim.job, resolved.payload)
      : null;
    const submitting: Extract<ResumePayloadV3, { stage: 'SUBMITTING' }> = {
      version: MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_RESUME_VERSION_V3,
      stage: 'SUBMITTING',
      submissionId: claim.job.operationId,
      mapBindingSha256: resolved.payload.mapBindingSha256,
      mapperVersion: MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3,
      commandPolicyVersion:
        MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3,
    };
    let scanJob: MediaSourcePtsCadenceEpochScanJobV3;
    if (!resume || resume.stage === 'SUBMITTING') {
      if (!resume) await persistResume(submitting);
      const request = await createFreshScanRequest(resolved, input.ports);
      const submitted = await input.ports.submitScan(
        createMediaSourcePtsCadenceEpochScanSubmissionV3({
          submissionId: submitting.submissionId,
          request,
        }),
      );
      if (submitted.disposition !== 'ACCEPTED') {
        throw transportFailure(submitted.diagnostic);
      }
      scanJob = submitted.job;
      assertScanJobMatchesResume(scanJob, submitting);
      await persistResume({
        ...submitting,
        stage: 'SUBMITTED',
        functionCallId: scanJob.functionCallId,
      });
    } else {
      scanJob = assertMediaSourcePtsCadenceEpochScanJobV3({
        submissionId: resume.submissionId,
        functionCallId: resume.functionCallId,
        mapBindingSha256: resume.mapBindingSha256,
        mapperVersion: resume.mapperVersion,
        commandPolicyVersion: resume.commandPolicyVersion,
      });
    }

    await heartbeat();
    const polled = await input.ports.pollScan(scanJob);
    if (polled.disposition === 'UNVERIFIABLE') {
      throw transportFailure(polled.diagnostic);
    }
    if (polled.disposition === 'PENDING') {
      assertSameScanJob(polled.job, scanJob);
      const now = clock();
      await input.jobStore.deferUntil({
        jobId: input.jobId,
        leaseToken: claim.leaseToken,
        resumeCursor: {
          stage: 'EPOCH_SCAN_PENDING',
          submissionId: scanJob.submissionId,
          functionCallId: scanJob.functionCallId,
          mapBindingSha256: scanJob.mapBindingSha256,
          mapperVersion: scanJob.mapperVersion,
          commandPolicyVersion: scanJob.commandPolicyVersion,
        },
        resumeAt: new Date(
          now.getTime() + Math.max(
            1_000,
            input.pollDelayMs
              ?? MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_POLL_DELAY_MS_V3,
          ),
        ),
        now,
      });
      return {
        kind: 'deferred',
        jobId: input.jobId,
        submissionId: scanJob.submissionId,
      };
    }

    const result = assertMediaSourcePtsCadenceEpochScanResultV3(polled.result);
    assertTerminalResultMatchesContract(result, resolved.payload);
    if (result.status === 'UNVERIFIABLE') {
      return completeTerminal({
        input,
        claim,
        scanJob,
        disposition: 'UNVERIFIABLE',
        proofReferences: [proofReference(
          `mptsv3-scan-result:${scanJob.submissionId}`,
          hashDurableWorkflowJobJsonV1(result),
          'UNVERIFIABLE',
        )],
        clock,
      });
    }

    const request = await createFreshScanRequest(resolved, input.ports);
    const publisher = await input.ports.publishScan({
      assetId: resolved.payload.assetId,
      userId: resolved.payload.userId,
      claimId: `mptsv3-publisher:${claim.job.jobId}`,
      claimExpiresAt: nextLeaseExpiry(clock),
      now: clock,
      request,
      result,
      sourceVersion: resolved.source.sourceVersion,
      qualification: resolved.source.qualification,
      expectedCoverage: resolved.payload.expectedCoverage,
      epochIndexResourcePolicy: resolved.payload.epochIndexResourcePolicy,
      verificationPolicy: resolved.payload.verificationPolicy,
      lifecycle: {
        heartbeat,
        nextClaimExpiresAt: () => nextLeaseExpiry(clock),
      },
    });
    if (publisher.disposition === 'BUSY') {
      throw new WorkerFailureV3(
        'MEDIA_SOURCE_PTS_EPOCH_WORKER_PUBLISHER_BUSY',
        true,
        { activeClaimId: publisher.activeClaimId },
      );
    }
    if (publisher.disposition === 'RETRYABLE') {
      throw new WorkerFailureV3(
        `MEDIA_SOURCE_PTS_EPOCH_WORKER_PUBLISHER_${safeCode(publisher.reason)}`,
        true,
        { publisherReason: publisher.reason },
      );
    }
    if (publisher.disposition === 'REJECTED') {
      throw new WorkerFailureV3(
        `MEDIA_SOURCE_PTS_EPOCH_WORKER_PUBLISHER_${safeCode(publisher.reason)}`,
        publisher.reason === 'STORE_RACE_LOST',
      );
    }
    if (publisher.disposition === 'UNVERIFIABLE') {
      const proofSha256 = publisher.terminalReceiptSha256
        ? requireSha256(publisher.terminalReceiptSha256, 'PUBLISHER_RECEIPT')
        : hashDurableWorkflowJobJsonV1({
            mapBindingSha256: scanJob.mapBindingSha256,
            diagnostic: requireDiagnostic(publisher.diagnostic),
          });
      return completeTerminal({
        input,
        claim,
        scanJob,
        disposition: 'UNVERIFIABLE',
        proofReferences: [proofReference(
          `mptsv3-publisher:${scanJob.submissionId}`,
          proofSha256,
          'UNVERIFIABLE',
        )],
        clock,
      });
    }
    return completeTerminal({
      input,
      claim,
      scanJob,
      disposition: 'PASS',
      proofReferences: [proofReference(
        `mptsv3-media-receipt:${resolved.payload.assetId}`,
        requireSha256(publisher.terminalReceiptSha256, 'PUBLISHER_RECEIPT'),
        'PASS',
      )],
      clock,
    });
  } catch (error) {
    if (error instanceof DurableWorkflowJobLeaseLostErrorV1) {
      return { kind: 'lease_lost', reason: error.message };
    }
    const current = await input.jobStore.getAuthorized({
      jobId: claim.job.jobId,
      tenantId: claim.job.tenantId,
      userId: claim.job.userId,
    });
    if (current && isTerminal(current.status)) {
      return { kind: 'skipped', reason: 'terminal' };
    }
    if (cancellationRequested || error instanceof CancellationRequestedV3
      || current?.cancelRequestedAt) {
      try {
        await input.jobStore.markCancelled({
          jobId: input.jobId,
          leaseToken: claim.leaseToken,
          receipt: cancellationReceipt(current ?? claim.job, clock()),
          now: clock(),
        });
        return { kind: 'cancelled', jobId: input.jobId };
      } catch (cancelError) {
        if (cancelError instanceof DurableWorkflowJobLeaseLostErrorV1) {
          return { kind: 'lease_lost', reason: cancelError.message };
        }
        throw cancelError;
      }
    }
    return settleFailure({ input, claim, current, error, clock });
  }
}

async function resolveCurrentJob(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  ports: MediaSourcePtsCadenceDurableEpochWorkerPortsV3,
) {
  if (job.operationOwner !== 'MEDIA_ASSETS'
    || job.operationKind !== 'media_source_pts_cadence_epoch_scan'
    || job.projectId !== null
    || job.parentCommandId !== null
    || job.parentReceiptId !== null
    || job.input.schemaId
      !== MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_JOB_INPUT_VERSION_V3) {
    throw new WorkerFailureV3(
      'MEDIA_SOURCE_PTS_EPOCH_WORKER_JOB_CONTRACT_INVALID',
      false,
    );
  }
  let payload: Readonly<MediaSourcePtsCadenceDurableEpochJobInputV3>;
  try {
    payload = assertMediaSourcePtsCadenceDurableEpochJobInputV3(job.input.payload);
  } catch (error) {
    throw contractFailure(error);
  }
  if (hashDurableWorkflowJobJsonV1(payload) !== job.input.bindingSha256
    || payload.tenantId !== job.tenantId
    || payload.userId !== job.userId
    || payload.orgId !== job.orgId) {
    throw new WorkerFailureV3(
      'MEDIA_SOURCE_PTS_EPOCH_WORKER_JOB_BINDING_MISMATCH',
      false,
    );
  }
  const source = await ports.loadCurrentSource({
    assetId: payload.assetId,
    userId: payload.userId,
  });
  if (!source) {
    throw new WorkerFailureV3(
      'MEDIA_SOURCE_PTS_EPOCH_WORKER_ASSET_NOT_FOUND',
      false,
    );
  }
  let contract: ReturnType<
    typeof buildMediaSourcePtsCadenceDurableEpochJobContractV3
  >;
  try {
    contract = buildMediaSourcePtsCadenceDurableEpochJobContractV3({
      tenantId: payload.tenantId,
      userId: payload.userId,
      orgId: payload.orgId,
      assetId: payload.assetId,
      sourceVersion: source.sourceVersion,
      qualification: source.qualification,
      videoStreamIndex: payload.mapBinding.videoStreamIndex,
    });
  } catch (error) {
    throw contractFailure(error);
  }
  if (contract.operationIdentity !== job.operationId
    || contract.bindingSha256 !== job.input.bindingSha256
    || hashDurableWorkflowJobJsonV1(contract.payload)
      !== hashDurableWorkflowJobJsonV1(payload)
    || hashDurableWorkflowJobJsonV1(contract.dependencies)
      !== hashDurableWorkflowJobJsonV1(job.dependencies)) {
    throw new WorkerFailureV3(
      'MEDIA_SOURCE_PTS_EPOCH_WORKER_CURRENT_SOURCE_STALE',
      false,
    );
  }
  return { payload, source } as const;
}

async function createFreshScanRequest(
  resolved: Awaited<ReturnType<typeof resolveCurrentJob>>,
  ports: MediaSourcePtsCadenceDurableEpochWorkerPortsV3,
): Promise<MediaSourcePtsCadenceScanRequestV1> {
  const source = await ports.resolveVerifiedSourceUrl({
    assetId: resolved.payload.assetId,
    userId: resolved.payload.userId,
    qualification: resolved.source.qualification,
  });
  if (source.disposition !== 'AVAILABLE') {
    throw new WorkerFailureV3(
      `MEDIA_SOURCE_PTS_EPOCH_WORKER_SOURCE_${safeCode(source.diagnostic)}`,
      source.retryable,
    );
  }
  if (requireSha256(source.storageVersionSha256, 'SOURCE_STORAGE_VERSION')
    !== resolved.payload.mapBinding.storageVersionSha256) {
    throw new WorkerFailureV3(
      'MEDIA_SOURCE_PTS_EPOCH_WORKER_SOURCE_STORAGE_STALE',
      false,
    );
  }
  return createMediaSourcePtsCadenceScanRequestV1({
    mapBinding: resolved.payload.mapBinding,
    resourcePolicy: resolved.payload.scanResourcePolicy,
    sourceUrl: source.sourceUrl,
  });
}

function assertResumeState(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  payload: Readonly<MediaSourcePtsCadenceDurableEpochJobInputV3>,
): ResumePayloadV3 {
  const resume = job.resumeState;
  if (!resume
    || resume.schemaId
      !== MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_RESUME_VERSION_V3
    || hashDurableWorkflowJobJsonV1(resume.payload) !== resume.stateSha256) {
    throw new WorkerFailureV3(
      'MEDIA_SOURCE_PTS_EPOCH_WORKER_RESUME_INVALID',
      false,
    );
  }
  const record = asRecord(resume.payload);
  const expectedKeys = record?.stage === 'SUBMITTING'
    ? [
        'commandPolicyVersion', 'mapBindingSha256', 'mapperVersion', 'stage',
        'submissionId', 'version',
      ]
    : [
        'commandPolicyVersion', 'functionCallId', 'mapBindingSha256',
        'mapperVersion', 'stage', 'submissionId', 'version',
      ];
  if (!record || !exactKeys(record, expectedKeys)
    || record.version
      !== MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_RESUME_VERSION_V3
    || (record.stage !== 'SUBMITTING' && record.stage !== 'SUBMITTED')
    || record.submissionId !== job.operationId
    || record.mapBindingSha256 !== payload.mapBindingSha256
    || record.mapperVersion !== MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3
    || record.commandPolicyVersion
      !== MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3
    || resume.sequence !== (record.stage === 'SUBMITTING' ? 1 : 2)) {
    throw new WorkerFailureV3(
      'MEDIA_SOURCE_PTS_EPOCH_WORKER_RESUME_INVALID',
      false,
    );
  }
  if (record.stage === 'SUBMITTING') {
    return {
      version: MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_RESUME_VERSION_V3,
      stage: 'SUBMITTING',
      submissionId: requireIdentity(record.submissionId, 'SUBMISSION_ID'),
      mapBindingSha256: requireSha256(
        record.mapBindingSha256,
        'RESUME_MAP_BINDING',
      ),
      mapperVersion: MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3,
      commandPolicyVersion:
        MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3,
    };
  }
  let validatedJob: MediaSourcePtsCadenceEpochScanJobV3;
  try {
    validatedJob = assertMediaSourcePtsCadenceEpochScanJobV3({
      submissionId: record.submissionId,
      functionCallId: record.functionCallId,
      mapBindingSha256: record.mapBindingSha256,
      mapperVersion: record.mapperVersion,
      commandPolicyVersion: record.commandPolicyVersion,
    });
  } catch {
    throw new WorkerFailureV3(
      'MEDIA_SOURCE_PTS_EPOCH_WORKER_RESUME_INVALID',
      false,
    );
  }
  return {
    version: MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_RESUME_VERSION_V3,
    stage: 'SUBMITTED',
    submissionId: requireIdentity(record.submissionId, 'SUBMISSION_ID'),
    functionCallId: validatedJob.functionCallId,
    mapBindingSha256: requireSha256(
      record.mapBindingSha256,
      'RESUME_MAP_BINDING',
    ),
    mapperVersion: MEDIA_SOURCE_PTS_CADENCE_EPOCH_MAPPER_VERSION_V3,
    commandPolicyVersion:
      MEDIA_SOURCE_PTS_CADENCE_EPOCH_COMMAND_POLICY_VERSION_V3,
  };
}

function assertTerminalResultMatchesContract(
  result: Readonly<MediaSourcePtsCadenceScanResultV1>,
  payload: Readonly<MediaSourcePtsCadenceDurableEpochJobInputV3>,
): void {
  if (result.mapBindingSha256 !== payload.mapBindingSha256
    || result.ffprobeVersion !== payload.mapBinding.mapper.ffprobeVersion
    || result.videoStreamIndex !== payload.mapBinding.videoStreamIndex
    || hashDurableWorkflowJobJsonV1(result.sourceTimebase)
      !== hashDurableWorkflowJobJsonV1(payload.mapBinding.sourceTimebase)
    || hashDurableWorkflowJobJsonV1(result.resourcePolicy)
      !== hashDurableWorkflowJobJsonV1(payload.scanResourcePolicy)) {
    throw new WorkerFailureV3(
      'MEDIA_SOURCE_PTS_EPOCH_WORKER_RESULT_CONTRACT_MISMATCH',
      false,
    );
  }
}

async function completeTerminal(input: Readonly<{
  input: Parameters<typeof runMediaSourcePtsCadenceDurableEpochWorkerV3>[0];
  claim: Readonly<{
    job: Readonly<DurableWorkflowJobSnapshotV1>;
    leaseToken: string;
  }>;
  scanJob: Readonly<MediaSourcePtsCadenceEpochScanJobV3>;
  disposition: 'PASS' | 'UNVERIFIABLE';
  proofReferences: DurableWorkflowJobTerminalReceiptV1['proofReferences'];
  clock: () => Date;
}>): Promise<MediaSourcePtsCadenceDurableEpochWorkerResultV3> {
  const completedAt = input.clock();
  const material = {
    version: MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_WORKER_RECEIPT_VERSION_V3,
    jobId: input.claim.job.jobId,
    operationId: input.claim.job.operationId,
    inputBindingSha256: input.claim.job.input.bindingSha256,
    submissionId: input.scanJob.submissionId,
    functionCallId: input.scanJob.functionCallId,
    mapBindingSha256: input.scanJob.mapBindingSha256,
    mapperVersion: input.scanJob.mapperVersion,
    commandPolicyVersion: input.scanJob.commandPolicyVersion,
    disposition: input.disposition,
    proofReferences: input.proofReferences,
    completedAt: completedAt.toISOString(),
  };
  const receiptSha256 = hashDurableWorkflowJobJsonV1(material);
  const receipt: DurableWorkflowJobTerminalReceiptV1 = {
    disposition: input.disposition,
    receiptId: `mptsv3w_${receiptSha256.slice(0, 24)}`,
    receiptSha256,
    proofReferences: input.proofReferences,
    completedAt,
  };
  await input.input.jobStore.complete({
    jobId: input.claim.job.jobId,
    leaseToken: input.claim.leaseToken,
    receipt,
    now: input.clock(),
  });
  return {
    kind: 'completed',
    jobId: input.claim.job.jobId,
    disposition: input.disposition,
    receiptSha256,
  };
}

async function settleFailure(input: Readonly<{
  input: Parameters<typeof runMediaSourcePtsCadenceDurableEpochWorkerV3>[0];
  claim: Readonly<{
    job: Readonly<DurableWorkflowJobSnapshotV1>;
    leaseToken: string;
  }>;
  current: Readonly<DurableWorkflowJobSnapshotV1> | null;
  error: unknown;
  clock: () => Date;
}>): Promise<MediaSourcePtsCadenceDurableEpochWorkerResultV3> {
  const failure = input.error instanceof WorkerFailureV3
    ? input.error
    : new WorkerFailureV3(
        'MEDIA_SOURCE_PTS_EPOCH_WORKER_EXECUTION_FAILED',
        false,
      );
  const now = input.clock();
  try {
    const status = await input.input.jobStore.retryOrDeadLetter({
      jobId: input.claim.job.jobId,
      leaseToken: input.claim.leaseToken,
      error: {
        code: requireIdentity(failure.code, 'ERROR_CODE'),
        message: failure.message,
        retryable: failure.retryable,
        occurredAt: now,
      },
      retryAt: new Date(
        now.getTime() + Math.max(1_000, input.input.retryDelayMs ?? 30_000),
      ),
      retryCursor: {
        resumeSequence: input.current?.resumeState?.sequence ?? 0,
        resumeStateSha256: input.current?.resumeState?.stateSha256 ?? null,
        ownerCursor: failure.cursor,
      },
      now,
    });
    return {
      kind: status,
      jobId: input.claim.job.jobId,
      errorCode: failure.code,
    };
  } catch (error) {
    if (error instanceof DurableWorkflowJobLeaseLostErrorV1) {
      return { kind: 'lease_lost', reason: error.message };
    }
    throw error;
  }
}

function cancellationReceipt(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  completedAt: Date,
): DurableWorkflowJobTerminalReceiptV1 {
  const material = {
    version: MEDIA_SOURCE_PTS_CADENCE_DURABLE_EPOCH_WORKER_RECEIPT_VERSION_V3,
    jobId: job.jobId,
    disposition: 'CANCELLED',
    requestedBy: job.cancelRequestedBy,
    reason: job.cancelReason,
    completedAt: completedAt.toISOString(),
  };
  const receiptSha256 = hashDurableWorkflowJobJsonV1(material);
  return {
    disposition: 'CANCELLED',
    receiptId: `mptsv3w_cancel_${receiptSha256.slice(0, 24)}`,
    receiptSha256,
    proofReferences: [],
    completedAt,
  };
}

function proofReference(
  proofId: string,
  proofSha256: string,
  disposition: 'PASS' | 'FAIL' | 'UNVERIFIABLE',
) {
  return {
    proofId: requireIdentity(proofId, 'PROOF_ID'),
    proofSha256: requireSha256(proofSha256, 'PROOF'),
    disposition,
  } as const;
}

function assertScanJobMatchesResume(
  job: Readonly<MediaSourcePtsCadenceEpochScanJobV3>,
  resume: Extract<ResumePayloadV3, { stage: 'SUBMITTING' }>,
): void {
  if (job.submissionId !== resume.submissionId
    || job.mapBindingSha256 !== resume.mapBindingSha256
    || job.mapperVersion !== resume.mapperVersion
    || job.commandPolicyVersion !== resume.commandPolicyVersion) {
    throw new WorkerFailureV3(
      'MEDIA_SOURCE_PTS_EPOCH_WORKER_SUBMIT_BINDING_MISMATCH',
      false,
    );
  }
  try {
    assertMediaSourcePtsCadenceEpochScanJobV3(job);
  } catch {
    throw new WorkerFailureV3(
      'MEDIA_SOURCE_PTS_EPOCH_WORKER_SUBMIT_JOB_INVALID',
      false,
    );
  }
}

function assertSameScanJob(
  left: Readonly<MediaSourcePtsCadenceEpochScanJobV3>,
  right: Readonly<MediaSourcePtsCadenceEpochScanJobV3>,
): void {
  if (hashDurableWorkflowJobJsonV1(left)
    !== hashDurableWorkflowJobJsonV1(right)) {
    throw new WorkerFailureV3(
      'MEDIA_SOURCE_PTS_EPOCH_WORKER_POLL_JOB_MISMATCH',
      false,
    );
  }
}

function transportFailure(
  diagnostic: ScanTransportDiagnosticV1,
): WorkerFailureV3 {
  const retryable = diagnostic === 'SCAN_TRANSPORT_REQUEST_FAILED'
    || diagnostic === 'SCAN_TRANSPORT_HTTP_FAILURE';
  return new WorkerFailureV3(
    `MEDIA_SOURCE_PTS_EPOCH_WORKER_${diagnostic}`,
    retryable,
  );
}

function contractFailure(error: unknown): WorkerFailureV3 {
  const code = error instanceof Error
      && /^MEDIA_SOURCE_[A-Z0-9_]+$/.test(error.message)
    ? error.message
    : 'MEDIA_SOURCE_PTS_EPOCH_WORKER_CURRENT_SOURCE_INVALID';
  return new WorkerFailureV3(code, false);
}

function nextLeaseExpiry(clock: () => Date): Date {
  return new Date(clock().getTime() + DURABLE_WORKFLOW_JOB_LEASE_MS_V1);
}

function isTerminal(status: DurableWorkflowJobSnapshotV1['status']): boolean {
  return status === 'completed'
    || status === 'cancelled'
    || status === 'dead_letter';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function exactKeys(
  record: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(record).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length
    && actual.every((key, index) => key === sorted[index]);
}

function safeCode(value: unknown): string {
  return typeof value === 'string'
    ? value.toUpperCase().replace(/[^A-Z0-9_]+/g, '_').slice(0, 120)
    : 'INVALID';
}

function requireDiagnostic(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 512) {
    throw new WorkerFailureV3(
      'MEDIA_SOURCE_PTS_EPOCH_WORKER_PUBLISHER_DIAGNOSTIC_INVALID',
      false,
    );
  }
  return value.trim();
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value.trim())) {
    throw new WorkerFailureV3(
      `MEDIA_SOURCE_PTS_EPOCH_WORKER_${label}_INVALID`,
      false,
    );
  }
  return value.trim();
}

function requireSha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new WorkerFailureV3(
      `MEDIA_SOURCE_PTS_EPOCH_WORKER_${label}_INVALID`,
      false,
    );
  }
  return value;
}
