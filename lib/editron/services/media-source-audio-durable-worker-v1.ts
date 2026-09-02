import {
  DURABLE_WORKFLOW_JOB_LEASE_MS_V1,
  DurableWorkflowJobLeaseLostErrorV1,
  hashDurableWorkflowJobJsonV1,
  type DurableWorkflowJobSnapshotV1,
  type DurableWorkflowJobTerminalReceiptV1,
} from './durable-workflow-job-v1';
import type { DurableWorkflowJobStoreV1 }
  from './durable-workflow-job-store-v1';
import {
  MEDIA_SOURCE_AUDIO_DURABLE_JOB_INPUT_VERSION_V1,
  assertMediaSourceAudioDurableJobInputV1,
  buildMediaSourceAudioDurableJobContractV1,
  type MediaSourceAudioDurableJobInputV1,
} from './media-source-audio-durable-job-v1';
import {
  MediaSourceAudioProductMaterializationErrorV1,
  type MediaSourceAudioProductMaterializationInputV1,
} from './media-source-audio-product-materializer-v1';
import {
  assertMediaSourceAudioProductMaterializationReceiptV2,
  type MediaSourceAudioProductMaterializationReceiptV2,
} from './media-source-audio-product-receipt-v2';
import type { MediaSourceAudioProductRuntimeResultV1 }
  from './media-source-audio-product-runtime-v1';
import type { MediaSourceQualificationRecordV1 }
  from './media-source-qualification-v1';
import type { MediaSourceVersionV1 } from './media-source-version-v1';

export const MEDIA_SOURCE_AUDIO_DURABLE_WORKER_RECEIPT_VERSION_V2 =
  'EDITRON_MEDIA_SOURCE_AUDIO_DURABLE_WORKER_RECEIPT_V2_1' as const;
export const MEDIA_SOURCE_AUDIO_DURABLE_HEARTBEAT_INTERVAL_MS_V1 =
  Math.floor(DURABLE_WORKFLOW_JOB_LEASE_MS_V1 / 3);

type CurrentSourceV1 = Readonly<{
  sourceVersion: MediaSourceVersionV1;
  qualification: MediaSourceQualificationRecordV1;
}>;

export type MediaSourceAudioDurableWorkerPortsV1 = Readonly<{
  loadCurrentSource(input: Readonly<{
    assetId: string;
    userId: string;
  }>): Promise<CurrentSourceV1 | null>;
  materializeProduct(
    input: MediaSourceAudioProductMaterializationInputV1,
  ): Promise<MediaSourceAudioProductRuntimeResultV1>;
}>;

export type MediaSourceAudioDurableWorkerResultV1 = Readonly<
  | { kind: 'skipped'; reason: string }
  | { kind: 'lease_lost'; reason: string }
  | { kind: 'cancelled'; jobId: string; productReceiptSha256: string | null }
  | { kind: 'retry_wait' | 'dead_letter'; jobId: string; errorCode: string }
  | {
      kind: 'completed';
      jobId: string;
      disposition: 'PASS';
      receiptSha256: string;
    }
>;

class WorkerFailureV1 extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly cursor: Readonly<Record<string, unknown>> = {},
  ) {
    super(code);
    this.name = 'MediaSourceAudioDurableWorkerFailureV1';
  }
}

export type MediaSourceAudioDurableWorkerPortFailureCodeV1 =
  | 'MEDIA_SOURCE_AUDIO_WORKER_CURRENT_SOURCE_LOAD_FAILED'
  | 'MEDIA_SOURCE_AUDIO_WORKER_CURRENT_SOURCE_INVALID';

export class MediaSourceAudioDurableWorkerPortErrorV1 extends Error {
  constructor(
    public readonly code: MediaSourceAudioDurableWorkerPortFailureCodeV1,
    public readonly retryable: boolean,
  ) {
    super(code);
    this.name = 'MediaSourceAudioDurableWorkerPortErrorV1';
  }
}

class CancellationRequestedV1 extends Error {}

export async function runMediaSourceAudioDurableWorkerV1(input: Readonly<{
  jobStore: Pick<DurableWorkflowJobStoreV1,
    'claim' | 'heartbeat' | 'complete' | 'retryOrDeadLetter'
    | 'markCancelled' | 'getAuthorized'>;
  ports: MediaSourceAudioDurableWorkerPortsV1;
  jobId: string;
  workerId: string;
  clock?: () => Date;
  retryDelayMs?: number;
  heartbeatIntervalMs?: number;
}>): Promise<MediaSourceAudioDurableWorkerResultV1> {
  const clock = input.clock ?? (() => new Date());
  const heartbeatIntervalMs = normalizeHeartbeatInterval(
    input.heartbeatIntervalMs,
  );
  const claim = await input.jobStore.claim({
    jobId: input.jobId,
    workerId: input.workerId,
    now: clock(),
  });
  if (claim.kind === 'skipped') {
    return { kind: 'skipped', reason: claim.reason };
  }
  if (claim.kind === 'cancel_claimed') {
    const now = clock();
    await input.jobStore.markCancelled({
      jobId: input.jobId,
      leaseToken: claim.leaseToken,
      receipt: cancellationReceipt(claim.job, now, null),
      now,
    });
    return {
      kind: 'cancelled',
      jobId: input.jobId,
      productReceiptSha256: null,
    };
  }

  const abortController = new AbortController();
  let cancellationRequested = false;
  let heartbeatInFlight: Promise<void> | null = null;
  let committedProductReceipt:
    MediaSourceAudioProductMaterializationReceiptV2 | null = null;
  const heartbeat = (): Promise<void> => {
    if (heartbeatInFlight) return heartbeatInFlight;
    const next = (async () => {
      try {
        const state = await input.jobStore.heartbeat({
          jobId: input.jobId,
          leaseToken: claim.leaseToken,
          now: clock(),
        });
        if (state === 'CANCEL_REQUESTED') {
          cancellationRequested = true;
          abortController.abort();
          throw new CancellationRequestedV1(
            'MEDIA_SOURCE_AUDIO_WORKER_CANCEL_REQUESTED',
          );
        }
      } catch (error) {
        abortController.abort();
        throw error;
      }
    })();
    heartbeatInFlight = next;
    next.then(
      () => { if (heartbeatInFlight === next) heartbeatInFlight = null; },
      () => { if (heartbeatInFlight === next) heartbeatInFlight = null; },
    );
    return next;
  };

  try {
    await heartbeat();
    const execution = await runWithLeaseMonitor({
      abortController,
      heartbeat,
      heartbeatIntervalMs,
      task: async () => {
        const resolved = await resolveCurrentJob(claim.job, input.ports);
        const result = await input.ports.materializeProduct({
          assetId: resolved.payload.assetId,
          userId: resolved.payload.userId,
          expectedAudioStreamBindings: resolved.payload.audioStreamBindings,
          resourcePolicy: resolved.payload.resourcePolicy,
          publishedAt: jobCreatedAt(claim.job),
          abortSignal: abortController.signal,
          beforeActiveStateMutation: heartbeat,
        });
        return { resolved, result } as const;
      },
    });
    if (execution.result.kind === 'runtime_unavailable') {
      throw new WorkerFailureV1(
        `MEDIA_SOURCE_AUDIO_WORKER_RUNTIME_${execution.result.reason}`,
        true,
        { runtimeReason: execution.result.reason },
      );
    }
    let productReceipt: MediaSourceAudioProductMaterializationReceiptV2;
    try {
      productReceipt = assertMediaSourceAudioProductMaterializationReceiptV2(
        execution.result,
      );
    } catch (error) {
      throw contractFailure(
        error,
        'MEDIA_SOURCE_AUDIO_WORKER_PRODUCT_RECEIPT_INVALID',
      );
    }
    assertProductReceiptMatchesJob(
      productReceipt,
      execution.resolved.payload,
      claim.job,
    );
    committedProductReceipt = productReceipt;
    await heartbeat();
    return completeTerminal({ input, claim, productReceipt, clock });
  } catch (error) {
    let current: Readonly<DurableWorkflowJobSnapshotV1> | null = null;
    try {
      current = await input.jobStore.getAuthorized({
        jobId: claim.job.jobId,
        tenantId: claim.job.tenantId,
        userId: claim.job.userId,
      });
    } catch (lookupError) {
      if (error instanceof DurableWorkflowJobLeaseLostErrorV1) {
        return { kind: 'lease_lost', reason: error.message };
      }
      throw lookupError;
    }
    if (current && isTerminal(current.status)) {
      return { kind: 'skipped', reason: 'terminal' };
    }
    if (cancellationRequested || error instanceof CancellationRequestedV1
      || current?.cancelRequestedAt) {
      const now = clock();
      try {
        await input.jobStore.markCancelled({
          jobId: input.jobId,
          leaseToken: claim.leaseToken,
          receipt: cancellationReceipt(
            current ?? claim.job,
            now,
            committedProductReceipt,
          ),
          now,
        });
        return {
          kind: 'cancelled',
          jobId: input.jobId,
          productReceiptSha256:
            committedProductReceipt?.receiptSha256 ?? null,
        };
      } catch (cancelError) {
        if (cancelError instanceof DurableWorkflowJobLeaseLostErrorV1) {
          return { kind: 'lease_lost', reason: cancelError.message };
        }
        throw cancelError;
      }
    }
    if (error instanceof DurableWorkflowJobLeaseLostErrorV1) {
      return { kind: 'lease_lost', reason: error.message };
    }
    return settleFailure({ input, claim, current, error, clock });
  }
}

async function resolveCurrentJob(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  ports: MediaSourceAudioDurableWorkerPortsV1,
) {
  if (job.operationOwner !== 'MEDIA_ASSETS'
    || job.operationKind !== 'media_source_audio_materialization'
    || job.projectId !== null
    || job.parentCommandId !== null
    || job.parentReceiptId !== null
    || job.input.schemaId !== MEDIA_SOURCE_AUDIO_DURABLE_JOB_INPUT_VERSION_V1) {
    throw new WorkerFailureV1(
      'MEDIA_SOURCE_AUDIO_WORKER_JOB_CONTRACT_INVALID',
      false,
    );
  }
  let payload: Readonly<MediaSourceAudioDurableJobInputV1>;
  try {
    payload = assertMediaSourceAudioDurableJobInputV1(job.input.payload);
  } catch (error) {
    throw contractFailure(error, 'MEDIA_SOURCE_AUDIO_WORKER_JOB_INPUT_INVALID');
  }
  if (hashDurableWorkflowJobJsonV1(payload) !== job.input.bindingSha256
    || payload.tenantId !== job.tenantId
    || payload.userId !== job.userId
    || payload.orgId !== job.orgId) {
    throw new WorkerFailureV1(
      'MEDIA_SOURCE_AUDIO_WORKER_JOB_BINDING_MISMATCH',
      false,
    );
  }
  const source = await ports.loadCurrentSource({
    assetId: payload.assetId,
    userId: payload.userId,
  });
  if (!source) {
    throw new WorkerFailureV1(
      'MEDIA_SOURCE_AUDIO_WORKER_ASSET_NOT_FOUND',
      false,
    );
  }
  let contract: ReturnType<typeof buildMediaSourceAudioDurableJobContractV1>;
  try {
    contract = buildMediaSourceAudioDurableJobContractV1({
      tenantId: payload.tenantId,
      userId: payload.userId,
      orgId: payload.orgId,
      assetId: payload.assetId,
      sourceVersion: source.sourceVersion,
      qualification: source.qualification,
      resourcePolicy: payload.resourcePolicy,
    });
  } catch (error) {
    throw contractFailure(
      error,
      'MEDIA_SOURCE_AUDIO_WORKER_CURRENT_SOURCE_INVALID',
    );
  }
  if (contract.operationIdentity !== job.operationId
    || contract.bindingSha256 !== job.input.bindingSha256
    || hashDurableWorkflowJobJsonV1(contract.payload)
      !== hashDurableWorkflowJobJsonV1(payload)
    || hashDurableWorkflowJobJsonV1(contract.dependencies)
      !== hashDurableWorkflowJobJsonV1(job.dependencies)) {
    throw new WorkerFailureV1(
      'MEDIA_SOURCE_AUDIO_WORKER_CURRENT_SOURCE_STALE',
      false,
    );
  }
  return { payload, source } as const;
}

function assertProductReceiptMatchesJob(
  receipt: Readonly<MediaSourceAudioProductMaterializationReceiptV2>,
  payload: Readonly<MediaSourceAudioDurableJobInputV1>,
  job: Readonly<DurableWorkflowJobSnapshotV1>,
): void {
  const first = payload.audioStreamBindings[0]!;
  const expectedIndexes = payload.audioStreamBindings.map(
    ({ audioStreamIndex }) => audioStreamIndex,
  );
  if (receipt.assetId !== payload.assetId
    || receipt.userId !== payload.userId
    || receipt.sourceVersionSha256 !== first.sourceVersionSha256
    || receipt.audioStreamBindingsSha256
      !== payload.audioStreamBindingsSha256
    || hashDurableWorkflowJobJsonV1(receipt.observedAudioStreamIndexes)
      !== hashDurableWorkflowJobJsonV1(expectedIndexes)
    || receipt.completedAt !== jobCreatedAt(job).toISOString()) {
    throw new WorkerFailureV1(
      'MEDIA_SOURCE_AUDIO_WORKER_PRODUCT_RECEIPT_CONTRACT_MISMATCH',
      false,
    );
  }
}

async function completeTerminal(input: Readonly<{
  input: Parameters<typeof runMediaSourceAudioDurableWorkerV1>[0];
  claim: Readonly<{
    job: Readonly<DurableWorkflowJobSnapshotV1>;
    leaseToken: string;
  }>;
  productReceipt: Readonly<MediaSourceAudioProductMaterializationReceiptV2>;
  clock: () => Date;
}>): Promise<MediaSourceAudioDurableWorkerResultV1> {
  const completedAt = input.clock();
  const proofReferences = [
    proofReference(
      `msaudio-product:${input.claim.job.jobId}`,
      input.productReceipt.receiptSha256,
      'PASS',
    ),
    proofReference(
      `msaudio-availability:${input.claim.job.jobId}`,
      input.productReceipt.sourceAudioAvailabilityEvidenceSha256,
      'PASS',
    ),
    proofReference(
      `msaudio-evidence:${input.claim.job.jobId}`,
      input.productReceipt.sourceVersionEvidenceSha256,
      'PASS',
    ),
  ];
  const material = {
    version: MEDIA_SOURCE_AUDIO_DURABLE_WORKER_RECEIPT_VERSION_V2,
    jobId: input.claim.job.jobId,
    operationId: input.claim.job.operationId,
    inputBindingSha256: input.claim.job.input.bindingSha256,
    productReceiptSha256: input.productReceipt.receiptSha256,
    audioArtifactStateSha256: input.productReceipt.audioArtifactStateSha256,
    sourceAudioAvailabilityEvidenceSha256:
      input.productReceipt.sourceAudioAvailabilityEvidenceSha256,
    sourceVersionEvidenceSha256:
      input.productReceipt.sourceVersionEvidenceSha256,
    disposition: 'PASS' as const,
    proofReferences,
    completedAt: completedAt.toISOString(),
  };
  const receiptSha256 = hashDurableWorkflowJobJsonV1(material);
  await input.input.jobStore.complete({
    jobId: input.claim.job.jobId,
    leaseToken: input.claim.leaseToken,
    receipt: {
      disposition: 'PASS',
      receiptId: `msaw_${receiptSha256.slice(0, 24)}`,
      receiptSha256,
      proofReferences,
      completedAt,
    },
    now: input.clock(),
  });
  return {
    kind: 'completed',
    jobId: input.claim.job.jobId,
    disposition: 'PASS',
    receiptSha256,
  };
}

async function settleFailure(input: Readonly<{
  input: Parameters<typeof runMediaSourceAudioDurableWorkerV1>[0];
  claim: Readonly<{
    job: Readonly<DurableWorkflowJobSnapshotV1>;
    leaseToken: string;
  }>;
  current: Readonly<DurableWorkflowJobSnapshotV1> | null;
  error: unknown;
  clock: () => Date;
}>): Promise<MediaSourceAudioDurableWorkerResultV1> {
  const failure = normalizeFailure(input.error);
  const now = input.clock();
  try {
    const status = await input.input.jobStore.retryOrDeadLetter({
      jobId: input.claim.job.jobId,
      leaseToken: input.claim.leaseToken,
      error: {
        code: identity(failure.code, 'ERROR_CODE'),
        message: failure.message,
        retryable: failure.retryable,
        occurredAt: now,
      },
      retryAt: new Date(
        now.getTime() + Math.max(1_000, input.input.retryDelayMs ?? 30_000),
      ),
      retryCursor: {
        inputBindingSha256: input.claim.job.input.bindingSha256,
        resumeSequence: input.current?.resumeState?.sequence ?? 0,
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

function normalizeFailure(error: unknown): WorkerFailureV1 {
  if (error instanceof WorkerFailureV1) return error;
  if (error instanceof MediaSourceAudioDurableWorkerPortErrorV1) {
    return new WorkerFailureV1(error.code, error.retryable);
  }
  if (error instanceof MediaSourceAudioProductMaterializationErrorV1) {
    return new WorkerFailureV1(
      `MEDIA_SOURCE_AUDIO_WORKER_PRODUCT_${error.reason}`,
      error.retryable,
      {
        productReason: error.reason,
        diagnosticCode: error.diagnosticCode,
      },
    );
  }
  return new WorkerFailureV1(
    'MEDIA_SOURCE_AUDIO_WORKER_EXECUTION_FAILED',
    false,
  );
}

function cancellationReceipt(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  completedAt: Date,
  productReceipt: Readonly<
    MediaSourceAudioProductMaterializationReceiptV2
  > | null,
): DurableWorkflowJobTerminalReceiptV1 {
  const proofReferences = productReceipt
    ? [
        proofReference(
          `msaudio-product:${job.jobId}`,
          productReceipt.receiptSha256,
          'PASS',
        ),
        proofReference(
          `msaudio-availability:${job.jobId}`,
          productReceipt.sourceAudioAvailabilityEvidenceSha256,
          'PASS',
        ),
        proofReference(
          `msaudio-evidence:${job.jobId}`,
          productReceipt.sourceVersionEvidenceSha256,
          'PASS',
        ),
      ]
    : [];
  const material = {
    version: MEDIA_SOURCE_AUDIO_DURABLE_WORKER_RECEIPT_VERSION_V2,
    jobId: job.jobId,
    disposition: 'CANCELLED' as const,
    requestedBy: job.cancelRequestedBy,
    reason: job.cancelReason,
    productReceiptSha256: productReceipt?.receiptSha256 ?? null,
    sourceAudioAvailabilityEvidenceSha256:
      productReceipt?.sourceAudioAvailabilityEvidenceSha256 ?? null,
    sourceVersionEvidenceSha256:
      productReceipt?.sourceVersionEvidenceSha256 ?? null,
    proofReferences,
    completedAt: completedAt.toISOString(),
  };
  const receiptSha256 = hashDurableWorkflowJobJsonV1(material);
  return {
    disposition: 'CANCELLED',
    receiptId: `msaw_cancel_${receiptSha256.slice(0, 24)}`,
    receiptSha256,
    proofReferences,
    completedAt,
  };
}

async function runWithLeaseMonitor<T>(input: Readonly<{
  abortController: AbortController;
  heartbeat(): Promise<void>;
  heartbeatIntervalMs: number;
  task(): Promise<T>;
}>): Promise<T> {
  const stopController = new AbortController();
  let monitorError: unknown = null;
  const monitor = (async () => {
    while (await waitForInterval(
      input.heartbeatIntervalMs,
      stopController.signal,
    )) {
      try {
        await input.heartbeat();
      } catch (error) {
        monitorError = error;
        input.abortController.abort();
        return;
      }
    }
  })();
  try {
    const result = await input.task();
    stopController.abort();
    await monitor;
    return result;
  } catch (error) {
    stopController.abort();
    await monitor;
    throw monitorError ?? error;
  }
}

function waitForInterval(
  milliseconds: number,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (elapsed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', stopped);
      resolve(elapsed);
    };
    const stopped = () => finish(false);
    const timer = setTimeout(() => finish(true), milliseconds);
    signal.addEventListener('abort', stopped, { once: true });
    if (signal.aborted) stopped();
  });
}

function normalizeHeartbeatInterval(value: number | undefined): number {
  const interval = value ?? MEDIA_SOURCE_AUDIO_DURABLE_HEARTBEAT_INTERVAL_MS_V1;
  if (!Number.isSafeInteger(interval) || interval < 10
    || interval >= DURABLE_WORKFLOW_JOB_LEASE_MS_V1) {
    throw new Error('MEDIA_SOURCE_AUDIO_WORKER_HEARTBEAT_INTERVAL_INVALID');
  }
  return interval;
}

function jobCreatedAt(job: Readonly<DurableWorkflowJobSnapshotV1>): Date {
  const createdAt = new Date(job.createdAt);
  if (Number.isNaN(createdAt.getTime())
    || createdAt.toISOString() !== job.createdAt) {
    throw new WorkerFailureV1(
      'MEDIA_SOURCE_AUDIO_WORKER_JOB_CREATED_AT_INVALID',
      false,
    );
  }
  return createdAt;
}

function proofReference(
  proofId: string,
  proofSha256: string,
  disposition: 'PASS' | 'FAIL' | 'UNVERIFIABLE',
) {
  return {
    proofId: identity(proofId, 'PROOF_ID'),
    proofSha256: sha256(proofSha256, 'PROOF_SHA256'),
    disposition,
  } as const;
}

function contractFailure(error: unknown, fallback: string): WorkerFailureV1 {
  const code = error instanceof Error
      && /^MEDIA_SOURCE_[A-Z0-9_]+$/.test(error.message)
    ? error.message
    : fallback;
  return new WorkerFailureV1(code, false);
}

function isTerminal(status: DurableWorkflowJobSnapshotV1['status']): boolean {
  return status === 'completed'
    || status === 'cancelled'
    || status === 'dead_letter';
}

function identity(value: unknown, label: string): string {
  if (typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value.trim())) {
    throw new WorkerFailureV1(
      `MEDIA_SOURCE_AUDIO_WORKER_${label}_INVALID`,
      false,
    );
  }
  return value.trim();
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new WorkerFailureV1(
      `MEDIA_SOURCE_AUDIO_WORKER_${label}_INVALID`,
      false,
    );
  }
  return value;
}
