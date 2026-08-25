import {
  DURABLE_WORKFLOW_JOB_LEASE_MS_V1,
  DurableWorkflowJobLeaseLostErrorV1,
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobSnapshotV1,
  type DurableWorkflowJobTerminalReceiptV1,
} from './durable-workflow-job-v1';
import type { DurableWorkflowJobStoreV1 } from './durable-workflow-job-store-v1';
import {
  MEDIA_SOURCE_PTS_CADENCE_COVERAGE_POLICY_VERSION_V1,
  MEDIA_SOURCE_PTS_CADENCE_DURABLE_JOB_INPUT_VERSION_V1,
  assertMediaSourcePtsCadenceDurableJobInputV1,
  buildMediaSourcePtsCadenceDurableJobContractV1,
  type MediaSourcePtsCadenceDurableJobInputV1,
} from './media-source-pts-cadence-durable-job-binding-v1';
import type { MediaSourcePtsCadenceManifestIndexResourcePolicyV2 }
  from './media-source-pts-cadence-manifest-index-v2';
import {
  assertMediaSourcePtsCadenceScanResultV1,
  type MediaSourcePtsCadenceScanResultV1,
} from './media-source-pts-cadence-scan-result-v1';
import {
  assertMediaSourcePtsCadenceScanJobV1,
  createMediaSourcePtsCadenceScanRequestV1,
  createMediaSourcePtsCadenceScanSubmissionV1,
  type MediaSourcePtsCadenceScanJobV1,
  type MediaSourcePtsCadenceScanPollResultV1,
  type MediaSourcePtsCadenceScanRequestV1,
  type MediaSourcePtsCadenceScanSubmitResultV1,
  type ScanTransportDiagnosticV1,
} from './media-source-pts-cadence-scan-transport-v1';
import type { MediaSourceQualificationRecordV1 }
  from './media-source-qualification-v1';
import type { MediaSourceVersionV1 } from './media-source-version-v1';

export const MEDIA_SOURCE_PTS_CADENCE_DURABLE_RESUME_VERSION_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_DURABLE_RESUME_V1_1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_DURABLE_WORKER_RECEIPT_VERSION_V1 =
  'EDITRON_MEDIA_SOURCE_PTS_CADENCE_DURABLE_WORKER_RECEIPT_V1_1' as const;
export const MEDIA_SOURCE_PTS_CADENCE_DURABLE_POLL_DELAY_MS_V1 = 30_000;

type CurrentSourceV1 = Readonly<{
  sourceVersion: MediaSourceVersionV1;
  qualification: MediaSourceQualificationRecordV1;
}>;

type ResolvedSourceUrlV1 = Readonly<
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

export type MediaSourcePtsCadenceDurableFinalizerResultV1 = Readonly<
  | {
      disposition: 'COMPLETED' | 'ALREADY_COMPLETE';
      terminalReceiptSha256: string;
    }
  | { disposition: 'UNVERIFIABLE'; diagnostic: string }
  | { disposition: 'BUSY'; activeClaimId: string }
  | { disposition: 'REJECTED'; reason: string }
>;

export type MediaSourcePtsCadenceDurableWorkerPortsV1 = Readonly<{
  loadCurrentSource(input: Readonly<{
    assetId: string;
    userId: string;
  }>): Promise<CurrentSourceV1 | null>;
  resolveVerifiedSourceUrl(input: Readonly<{
    assetId: string;
    userId: string;
    qualification: MediaSourceQualificationRecordV1;
  }>): Promise<ResolvedSourceUrlV1>;
  submitScan(
    submission: ReturnType<typeof createMediaSourcePtsCadenceScanSubmissionV1>,
  ): Promise<MediaSourcePtsCadenceScanSubmitResultV1>;
  pollScan(job: MediaSourcePtsCadenceScanJobV1): Promise<MediaSourcePtsCadenceScanPollResultV1>;
  finalizeScan(input: Readonly<{
    assetId: string;
    userId: string;
    claimId: string;
    claimExpiresAt: Date;
    now(): Date;
    request: MediaSourcePtsCadenceScanRequestV1;
    result: MediaSourcePtsCadenceScanResultV1;
    sourceVersion: MediaSourceVersionV1;
    qualification: MediaSourceQualificationRecordV1;
    coveragePolicyVersion: string;
    manifestPolicy: MediaSourcePtsCadenceManifestIndexResourcePolicyV2;
    lifecycle: Readonly<{
      heartbeat(): Promise<void>;
      nextClaimExpiresAt(): Date;
    }>;
  }>): Promise<MediaSourcePtsCadenceDurableFinalizerResultV1>;
}>;

export type MediaSourcePtsCadenceDurableWorkerResultV1 = Readonly<
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

type ResumePayloadV1 = Readonly<
  | {
      version: typeof MEDIA_SOURCE_PTS_CADENCE_DURABLE_RESUME_VERSION_V1;
      stage: 'SUBMITTING';
      submissionId: string;
      mapBindingSha256: string;
    }
  | {
      version: typeof MEDIA_SOURCE_PTS_CADENCE_DURABLE_RESUME_VERSION_V1;
      stage: 'SUBMITTED';
      submissionId: string;
      functionCallId: string;
      mapBindingSha256: string;
    }
>;

class WorkerFailureV1 extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly cursor: Readonly<Record<string, unknown>> = {},
  ) {
    super(code);
    this.name = 'MediaSourcePtsCadenceDurableWorkerFailureV1';
  }
}

class CancellationRequestedV1 extends Error {}

export async function runMediaSourcePtsCadenceDurableWorkerV1(input: Readonly<{
  jobStore: Pick<DurableWorkflowJobStoreV1,
    'claim' | 'heartbeat' | 'saveResumeState' | 'deferUntil' | 'complete'
    | 'retryOrDeadLetter' | 'markCancelled' | 'getAuthorized'>;
  ports: MediaSourcePtsCadenceDurableWorkerPortsV1;
  jobId: string;
  workerId: string;
  clock?: () => Date;
  retryDelayMs?: number;
  pollDelayMs?: number;
}>): Promise<MediaSourcePtsCadenceDurableWorkerResultV1> {
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
      throw new CancellationRequestedV1('MEDIA_SOURCE_PTS_WORKER_CANCEL_REQUESTED');
    }
  };
  const persistResume = async (payload: ResumePayloadV1): Promise<void> => {
    await heartbeat();
    await input.jobStore.saveResumeState({
      jobId: input.jobId,
      leaseToken: claim.leaseToken,
      expectedSequence: resumeSequence,
      state: {
        schemaId: MEDIA_SOURCE_PTS_CADENCE_DURABLE_RESUME_VERSION_V1,
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
    const submitting: Extract<ResumePayloadV1, { stage: 'SUBMITTING' }> = {
      version: MEDIA_SOURCE_PTS_CADENCE_DURABLE_RESUME_VERSION_V1,
      stage: 'SUBMITTING',
      submissionId: claim.job.operationId,
      mapBindingSha256: resolved.payload.mapBindingSha256,
    };
    let scanJob: MediaSourcePtsCadenceScanJobV1;
    if (!resume || resume.stage === 'SUBMITTING') {
      if (!resume) await persistResume(submitting);
      const request = await createFreshScanRequest(resolved, input.ports);
      const submitted = await input.ports.submitScan(
        createMediaSourcePtsCadenceScanSubmissionV1({
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
      scanJob = {
        submissionId: resume.submissionId,
        functionCallId: resume.functionCallId,
        mapBindingSha256: resume.mapBindingSha256,
      };
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
          stage: 'SCAN_PENDING',
          submissionId: scanJob.submissionId,
          functionCallId: scanJob.functionCallId,
          mapBindingSha256: scanJob.mapBindingSha256,
        },
        resumeAt: new Date(
          now.getTime() + Math.max(1_000, input.pollDelayMs
            ?? MEDIA_SOURCE_PTS_CADENCE_DURABLE_POLL_DELAY_MS_V1),
        ),
        now,
      });
      return {
        kind: 'deferred',
        jobId: input.jobId,
        submissionId: scanJob.submissionId,
      };
    }

    const result = assertMediaSourcePtsCadenceScanResultV1(polled.result);
    if (result.mapBindingSha256 !== resolved.payload.mapBindingSha256) {
      throw new WorkerFailureV1('MEDIA_SOURCE_PTS_WORKER_RESULT_BINDING_MISMATCH', false);
    }
    if (result.status === 'UNVERIFIABLE') {
      return completeTerminal({
        input,
        claim,
        scanJob,
        disposition: 'UNVERIFIABLE',
        proofReferences: [proofReference(
          `mpts-scan-result:${scanJob.submissionId}`,
          hashDurableWorkflowJobJsonV1(result),
          'UNVERIFIABLE',
        )],
        clock,
      });
    }

    const request = await createFreshScanRequest(resolved, input.ports);
    const finalizer = await input.ports.finalizeScan({
      assetId: resolved.payload.assetId,
      userId: resolved.payload.userId,
      claimId: `mpts-finalizer:${claim.job.jobId}`,
      claimExpiresAt: nextLeaseExpiry(clock),
      now: clock,
      request,
      result,
      sourceVersion: resolved.source.sourceVersion,
      qualification: resolved.source.qualification,
      coveragePolicyVersion: MEDIA_SOURCE_PTS_CADENCE_COVERAGE_POLICY_VERSION_V1,
      manifestPolicy: resolved.payload.manifestResourcePolicy,
      lifecycle: {
        heartbeat,
        nextClaimExpiresAt: () => nextLeaseExpiry(clock),
      },
    });
    if (finalizer.disposition === 'BUSY') {
      throw new WorkerFailureV1(
        'MEDIA_SOURCE_PTS_WORKER_FINALIZER_BUSY',
        true,
        { activeClaimId: finalizer.activeClaimId },
      );
    }
    if (finalizer.disposition === 'REJECTED') {
      const retryable = finalizer.reason === 'STORE_RACE_LOST';
      throw new WorkerFailureV1(
        `MEDIA_SOURCE_PTS_WORKER_FINALIZER_${safeCode(finalizer.reason)}`,
        retryable,
      );
    }
    if (finalizer.disposition === 'UNVERIFIABLE') {
      return completeTerminal({
        input,
        claim,
        scanJob,
        disposition: 'UNVERIFIABLE',
        proofReferences: [proofReference(
          `mpts-finalizer:${scanJob.submissionId}`,
          hashDurableWorkflowJobJsonV1({
            mapBindingSha256: scanJob.mapBindingSha256,
            diagnostic: finalizer.diagnostic,
          }),
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
        `mpts-media-receipt:${resolved.payload.assetId}`,
        requireSha256(finalizer.terminalReceiptSha256, 'FINALIZER_RECEIPT'),
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
    if (cancellationRequested || error instanceof CancellationRequestedV1
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
  ports: MediaSourcePtsCadenceDurableWorkerPortsV1,
) {
  if (job.operationOwner !== 'MEDIA_ASSETS'
    || job.operationKind !== 'media_source_pts_cadence_scan'
    || job.projectId !== null
    || job.parentCommandId !== null
    || job.parentReceiptId !== null
    || job.input.schemaId !== MEDIA_SOURCE_PTS_CADENCE_DURABLE_JOB_INPUT_VERSION_V1) {
    throw new WorkerFailureV1('MEDIA_SOURCE_PTS_WORKER_JOB_CONTRACT_INVALID', false);
  }
  let payload: Readonly<MediaSourcePtsCadenceDurableJobInputV1>;
  try {
    payload = assertMediaSourcePtsCadenceDurableJobInputV1(job.input.payload);
  } catch (error) {
    throw contractFailure(error);
  }
  if (hashDurableWorkflowJobJsonV1(payload) !== job.input.bindingSha256
    || payload.tenantId !== job.tenantId
    || payload.userId !== job.userId
    || payload.orgId !== job.orgId) {
    throw new WorkerFailureV1('MEDIA_SOURCE_PTS_WORKER_JOB_BINDING_MISMATCH', false);
  }
  const source = await ports.loadCurrentSource({
    assetId: payload.assetId,
    userId: payload.userId,
  });
  if (!source) {
    throw new WorkerFailureV1('MEDIA_SOURCE_PTS_WORKER_ASSET_NOT_FOUND', false);
  }
  let contract: ReturnType<typeof buildMediaSourcePtsCadenceDurableJobContractV1>;
  try {
    contract = buildMediaSourcePtsCadenceDurableJobContractV1({
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
    throw new WorkerFailureV1('MEDIA_SOURCE_PTS_WORKER_CURRENT_SOURCE_STALE', false);
  }
  return { payload, source } as const;
}

async function createFreshScanRequest(
  resolved: Awaited<ReturnType<typeof resolveCurrentJob>>,
  ports: MediaSourcePtsCadenceDurableWorkerPortsV1,
): Promise<MediaSourcePtsCadenceScanRequestV1> {
  const source = await ports.resolveVerifiedSourceUrl({
    assetId: resolved.payload.assetId,
    userId: resolved.payload.userId,
    qualification: resolved.source.qualification,
  });
  if (source.disposition !== 'AVAILABLE') {
    throw new WorkerFailureV1(
      `MEDIA_SOURCE_PTS_WORKER_SOURCE_${safeCode(source.diagnostic)}`,
      source.retryable,
    );
  }
  if (requireSha256(source.storageVersionSha256, 'SOURCE_STORAGE_VERSION')
    !== resolved.payload.mapBinding.storageVersionSha256) {
    throw new WorkerFailureV1('MEDIA_SOURCE_PTS_WORKER_SOURCE_STORAGE_STALE', false);
  }
  return createMediaSourcePtsCadenceScanRequestV1({
    mapBinding: resolved.payload.mapBinding,
    resourcePolicy: resolved.payload.scanResourcePolicy,
    sourceUrl: source.sourceUrl,
  });
}

function assertResumeState(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  payload: Readonly<MediaSourcePtsCadenceDurableJobInputV1>,
): ResumePayloadV1 {
  const resume = job.resumeState;
  if (!resume || resume.schemaId !== MEDIA_SOURCE_PTS_CADENCE_DURABLE_RESUME_VERSION_V1
    || hashDurableWorkflowJobJsonV1(resume.payload) !== resume.stateSha256) {
    throw new WorkerFailureV1('MEDIA_SOURCE_PTS_WORKER_RESUME_INVALID', false);
  }
  const record = asRecord(resume.payload);
  const expectedKeys = record?.stage === 'SUBMITTING'
    ? ['mapBindingSha256', 'stage', 'submissionId', 'version']
    : ['functionCallId', 'mapBindingSha256', 'stage', 'submissionId', 'version'];
  if (!record || !exactKeys(record, expectedKeys)
    || record.version !== MEDIA_SOURCE_PTS_CADENCE_DURABLE_RESUME_VERSION_V1
    || (record.stage !== 'SUBMITTING' && record.stage !== 'SUBMITTED')
    || record.submissionId !== job.operationId
    || record.mapBindingSha256 !== payload.mapBindingSha256
    || resume.sequence !== (record.stage === 'SUBMITTING' ? 1 : 2)) {
    throw new WorkerFailureV1('MEDIA_SOURCE_PTS_WORKER_RESUME_INVALID', false);
  }
  if (record.stage === 'SUBMITTING') {
    return {
      version: MEDIA_SOURCE_PTS_CADENCE_DURABLE_RESUME_VERSION_V1,
      stage: 'SUBMITTING',
      submissionId: requireIdentity(record.submissionId, 'SUBMISSION_ID'),
      mapBindingSha256: requireSha256(record.mapBindingSha256, 'RESUME_MAP_BINDING'),
    };
  }
  let validatedJob: MediaSourcePtsCadenceScanJobV1;
  try {
    validatedJob = assertMediaSourcePtsCadenceScanJobV1({
      submissionId: record.submissionId,
      functionCallId: record.functionCallId,
      mapBindingSha256: record.mapBindingSha256,
    });
  } catch {
    throw new WorkerFailureV1('MEDIA_SOURCE_PTS_WORKER_RESUME_INVALID', false);
  }
  return {
    version: MEDIA_SOURCE_PTS_CADENCE_DURABLE_RESUME_VERSION_V1,
    stage: 'SUBMITTED',
    submissionId: requireIdentity(record.submissionId, 'SUBMISSION_ID'),
    functionCallId: validatedJob.functionCallId,
    mapBindingSha256: requireSha256(record.mapBindingSha256, 'RESUME_MAP_BINDING'),
  };
}

async function completeTerminal(input: Readonly<{
  input: Parameters<typeof runMediaSourcePtsCadenceDurableWorkerV1>[0];
  claim: Readonly<{
    job: Readonly<DurableWorkflowJobSnapshotV1>;
    leaseToken: string;
  }>;
  scanJob: Readonly<MediaSourcePtsCadenceScanJobV1>;
  disposition: 'PASS' | 'UNVERIFIABLE';
  proofReferences: DurableWorkflowJobTerminalReceiptV1['proofReferences'];
  clock: () => Date;
}>): Promise<MediaSourcePtsCadenceDurableWorkerResultV1> {
  const completedAt = input.clock();
  const material = {
    version: MEDIA_SOURCE_PTS_CADENCE_DURABLE_WORKER_RECEIPT_VERSION_V1,
    jobId: input.claim.job.jobId,
    operationId: input.claim.job.operationId,
    inputBindingSha256: input.claim.job.input.bindingSha256,
    submissionId: input.scanJob.submissionId,
    functionCallId: input.scanJob.functionCallId,
    mapBindingSha256: input.scanJob.mapBindingSha256,
    disposition: input.disposition,
    proofReferences: input.proofReferences,
    completedAt: completedAt.toISOString(),
  };
  const receiptSha256 = hashDurableWorkflowJobJsonV1(material);
  const receipt: DurableWorkflowJobTerminalReceiptV1 = {
    disposition: input.disposition,
    receiptId: `mptsw_${receiptSha256.slice(0, 24)}`,
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
  input: Parameters<typeof runMediaSourcePtsCadenceDurableWorkerV1>[0];
  claim: Readonly<{
    job: Readonly<DurableWorkflowJobSnapshotV1>;
    leaseToken: string;
  }>;
  current: Readonly<DurableWorkflowJobSnapshotV1> | null;
  error: unknown;
  clock: () => Date;
}>): Promise<MediaSourcePtsCadenceDurableWorkerResultV1> {
  const failure = input.error instanceof WorkerFailureV1
    ? input.error
    : new WorkerFailureV1('MEDIA_SOURCE_PTS_WORKER_EXECUTION_FAILED', false);
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
    version: MEDIA_SOURCE_PTS_CADENCE_DURABLE_WORKER_RECEIPT_VERSION_V1,
    jobId: job.jobId,
    disposition: 'CANCELLED',
    requestedBy: job.cancelRequestedBy,
    reason: job.cancelReason,
    completedAt: completedAt.toISOString(),
  };
  const receiptSha256 = hashDurableWorkflowJobJsonV1(material);
  return {
    disposition: 'CANCELLED',
    receiptId: `mptsw_cancel_${receiptSha256.slice(0, 24)}`,
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
  job: Readonly<MediaSourcePtsCadenceScanJobV1>,
  resume: Extract<ResumePayloadV1, { stage: 'SUBMITTING' }>,
): void {
  if (job.submissionId !== resume.submissionId
    || job.mapBindingSha256 !== resume.mapBindingSha256) {
    throw new WorkerFailureV1('MEDIA_SOURCE_PTS_WORKER_SUBMIT_BINDING_MISMATCH', false);
  }
  try {
    assertMediaSourcePtsCadenceScanJobV1(job);
  } catch {
    throw new WorkerFailureV1('MEDIA_SOURCE_PTS_WORKER_SUBMIT_JOB_INVALID', false);
  }
}

function assertSameScanJob(
  left: Readonly<MediaSourcePtsCadenceScanJobV1>,
  right: Readonly<MediaSourcePtsCadenceScanJobV1>,
): void {
  if (hashDurableWorkflowJobJsonV1(left) !== hashDurableWorkflowJobJsonV1(right)) {
    throw new WorkerFailureV1('MEDIA_SOURCE_PTS_WORKER_POLL_JOB_MISMATCH', false);
  }
}

function transportFailure(diagnostic: ScanTransportDiagnosticV1): WorkerFailureV1 {
  const retryable = diagnostic === 'SCAN_TRANSPORT_REQUEST_FAILED'
    || diagnostic === 'SCAN_TRANSPORT_HTTP_FAILURE';
  return new WorkerFailureV1(
    `MEDIA_SOURCE_PTS_WORKER_${diagnostic}`,
    retryable,
  );
}

function contractFailure(error: unknown): WorkerFailureV1 {
  const code = error instanceof Error && /^MEDIA_SOURCE_[A-Z0-9_]+$/.test(error.message)
    ? error.message
    : 'MEDIA_SOURCE_PTS_WORKER_CURRENT_SOURCE_INVALID';
  return new WorkerFailureV1(code, false);
}

function nextLeaseExpiry(clock: () => Date): Date {
  return new Date(clock().getTime() + DURABLE_WORKFLOW_JOB_LEASE_MS_V1);
}

function isTerminal(status: DurableWorkflowJobSnapshotV1['status']): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'dead_letter';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function exactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
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

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value.trim())) {
    throw new WorkerFailureV1(`MEDIA_SOURCE_PTS_WORKER_${label}_INVALID`, false);
  }
  return value.trim();
}

function requireSha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new WorkerFailureV1(`MEDIA_SOURCE_PTS_WORKER_${label}_INVALID`, false);
  }
  return value;
}
