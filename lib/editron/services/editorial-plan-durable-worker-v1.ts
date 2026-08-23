import {
  hashDurableWorkflowJobJsonV1,
  DurableWorkflowJobLeaseLostErrorV1,
  type DurableWorkflowJobSnapshotV1,
  type DurableWorkflowJobTerminalReceiptV1,
} from './durable-workflow-job-v1';
import { DurableWorkflowJobStoreV1 }
  from './durable-workflow-job-store-v1';
import {
  EditorialPlanDurableJobResolutionErrorV1,
  resolveEditorialPlanDurableJobV1,
} from './editorial-plan-durable-job-resolver-v1';
import type { EditorialPlanExecutionDefinitionV1 }
  from './editorial-plan-execution-definition-v1';
import type { EditorialPlanStoreV1 } from './editorial-plan-store-v1';
import type { EditorialPlanNodeV1, EditorialPlanRevisionV1 }
  from './editorial-plan-v1';

export const EDITORIAL_PLAN_DURABLE_WORKER_RECEIPT_VERSION_V1 =
  'EDITRON_EDITORIAL_PLAN_DURABLE_WORKER_RECEIPT_V1_1' as const;

type ProofReference = DurableWorkflowJobTerminalReceiptV1['proofReferences'][number];
type ResolvedPlanJob = Readonly<{
  plan: Readonly<EditorialPlanRevisionV1>;
  node: Readonly<EditorialPlanNodeV1>;
  definition: Readonly<EditorialPlanExecutionDefinitionV1>;
}>;

export interface EditorialPlanDurableExecutionOwnerReceiptV1 {
  disposition: 'PASS' | 'FAIL' | 'UNVERIFIABLE';
  receiptId: string;
  receiptSha256: string;
  proofReferences: readonly Readonly<ProofReference>[];
}

export interface EditorialPlanDurableExecutionOwnerV1 {
  ownerId: string;
  ownerVersion: string;
  assertDefinitionSupported(input: ResolvedPlanJob): void;
  execute(input: ResolvedPlanJob & Readonly<{
    job: Readonly<DurableWorkflowJobSnapshotV1>;
    lifecycle: Readonly<{
      heartbeat(): Promise<void>;
      persistResumeState(input: Readonly<{
        schemaId: string;
        payload: Readonly<Record<string, unknown>>;
      }>): Promise<number>;
    }>;
  }>): Promise<Readonly<EditorialPlanDurableExecutionOwnerReceiptV1>>;
}

export interface EditorialPlanDurableTerminalSettlementOwnerV1 {
  settleTerminal(
    job: Readonly<DurableWorkflowJobSnapshotV1>,
  ): Promise<unknown>;
}

export class EditorialPlanDurableRetryableErrorV1 extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryCursor: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'EditorialPlanDurableRetryableErrorV1';
    requireIdentity(code, 'RETRY_ERROR_CODE');
    hashDurableWorkflowJobJsonV1(retryCursor);
  }
}

export type EditorialPlanDurableWorkerResultV1 = Readonly<
  | { kind: 'skipped'; reason: string }
  | { kind: 'lease_lost'; reason: string }
  | { kind: 'cancelled'; jobId: string }
  | { kind: 'retry_wait' | 'dead_letter'; jobId: string; errorCode: string }
  | {
      kind: 'completed';
      jobId: string;
      disposition: 'PASS' | 'FAIL' | 'UNVERIFIABLE';
      receiptSha256: string;
    }
>;

class CancellationRequestedV1 extends Error {}

/**
 * Transport-neutral lifecycle owner for one accepted PlanService node.
 * Selection of `executionOwner` must be authorized by an immutable execution
 * definition adapter; this worker deliberately does not interpret a generic
 * planner envelope or choose a model/operator family itself.
 */
export async function runEditorialPlanDurableWorkerV1(input: Readonly<{
  jobStore: Pick<DurableWorkflowJobStoreV1,
    'claim' | 'heartbeat' | 'saveResumeState' | 'complete' | 'retryOrDeadLetter'
    | 'markCancelled' | 'getAuthorized'>;
  planStore: Pick<EditorialPlanStoreV1,
    'getRevisionAuthorized' | 'getLatestAuthorized' | 'getExecutionDefinitionAuthorized'>;
  jobId: string;
  workerId: string;
  executionOwner: Readonly<EditorialPlanDurableExecutionOwnerV1>;
  terminalSettlementOwner?: Readonly<EditorialPlanDurableTerminalSettlementOwnerV1>;
  clock?: () => Date;
  retryDelayMs?: number;
}>): Promise<EditorialPlanDurableWorkerResultV1> {
  const clock = input.clock ?? (() => new Date());
  const claim = await input.jobStore.claim({
    jobId: input.jobId, workerId: input.workerId, now: clock(),
  });
  if (claim.kind === 'skipped') {
    if ('job' in claim) {
      await settleTerminalSnapshot(input.terminalSettlementOwner, claim.job);
    }
    return { kind: 'skipped', reason: claim.reason };
  }
  if (claim.kind === 'cancel_claimed') {
    await input.jobStore.markCancelled({
      jobId: input.jobId, leaseToken: claim.leaseToken,
      receipt: cancellationReceipt(claim.job, clock()), now: clock(),
    });
    await settleCommittedTerminal(input, claim.job);
    return { kind: 'cancelled', jobId: input.jobId };
  }

  let cancellationRequested = false;
  let terminalSettlementStarted = false;
  let resumeSequence = claim.job.resumeState?.sequence ?? 0;
  const heartbeat = async (): Promise<void> => {
    const state = await input.jobStore.heartbeat({
      jobId: input.jobId, leaseToken: claim.leaseToken, now: clock(),
    });
    if (state === 'CANCEL_REQUESTED') {
      cancellationRequested = true;
      throw new CancellationRequestedV1('PLAN_DURABLE_WORKER_CANCEL_REQUESTED');
    }
  };

  try {
    await heartbeat();
    const resolved = await resolveEditorialPlanDurableJobV1({
      planStore: input.planStore, job: claim.job,
    });
    requireIdentity(input.executionOwner.ownerId, 'EXECUTION_OWNER_ID');
    requireIdentity(input.executionOwner.ownerVersion, 'EXECUTION_OWNER_VERSION');
    input.executionOwner.assertDefinitionSupported(resolved);
    await heartbeat();
    const ownerReceipt = await input.executionOwner.execute({
      ...resolved,
      job: claim.job,
      lifecycle: {
        heartbeat,
        persistResumeState: async (state) => {
          await heartbeat();
          const payloadSha256 = hashDurableWorkflowJobJsonV1(state.payload);
          await input.jobStore.saveResumeState({
            jobId: input.jobId, leaseToken: claim.leaseToken,
            expectedSequence: resumeSequence,
            state: {
              schemaId: state.schemaId, stateSha256: payloadSha256,
              payload: state.payload,
            },
            now: clock(),
          });
          resumeSequence += 1;
          return resumeSequence;
        },
      },
    });
    assertOwnerReceipt(ownerReceipt);
    await heartbeat();
    const terminal = terminalReceipt({
      job: claim.job, resolved, owner: input.executionOwner,
      ownerReceipt, completedAt: clock(),
    });
    await input.jobStore.complete({
      jobId: input.jobId, leaseToken: claim.leaseToken,
      receipt: terminal, now: clock(),
    });
    // Do not retry settlement inside this delivery. A failure must escape so
    // QStash redelivery enters the terminal-only branch and cannot rerun edits.
    terminalSettlementStarted = true;
    await settleCommittedTerminal(input, claim.job);
    return {
      kind: 'completed', jobId: input.jobId,
      disposition: ownerReceipt.disposition,
      receiptSha256: terminal.receiptSha256,
    };
  } catch (error) {
    if (terminalSettlementStarted) throw error;
    if (error instanceof DurableWorkflowJobLeaseLostErrorV1) {
      return { kind: 'lease_lost', reason: error.message };
    }
    const current = await input.jobStore.getAuthorized({
      jobId: claim.job.jobId,
      tenantId: claim.job.tenantId,
      userId: claim.job.userId,
    });
    if (current && isTerminalStatus(current.status)) {
      await settleTerminalSnapshot(input.terminalSettlementOwner, current);
      return { kind: 'skipped', reason: 'terminal' };
    }
    if (cancellationRequested || error instanceof CancellationRequestedV1
      || current?.cancelRequestedAt) {
      try {
        await input.jobStore.markCancelled({
          jobId: input.jobId, leaseToken: claim.leaseToken,
          receipt: cancellationReceipt(current ?? claim.job, clock()), now: clock(),
        });
        await settleCommittedTerminal(input, current ?? claim.job);
        return { kind: 'cancelled', jobId: input.jobId };
      } catch (cancelError) {
        if (cancelError instanceof DurableWorkflowJobLeaseLostErrorV1) {
          return { kind: 'lease_lost', reason: cancelError.message };
        }
        throw cancelError;
      }
    }
    const failure = await settleFailure({ ...input, claim, current, error, clock });
    if (failure.kind === 'dead_letter') {
      await settleCommittedTerminal(input, current ?? claim.job);
    }
    return failure;
  }
}

async function settleCommittedTerminal(input: Readonly<{
  jobStore: Pick<DurableWorkflowJobStoreV1, 'getAuthorized'>;
  terminalSettlementOwner?: Readonly<EditorialPlanDurableTerminalSettlementOwnerV1>;
}>, job: Readonly<DurableWorkflowJobSnapshotV1>): Promise<void> {
  if (!input.terminalSettlementOwner) return;
  const terminal = await input.jobStore.getAuthorized({
    jobId: job.jobId, tenantId: job.tenantId, userId: job.userId,
  });
  if (!terminal || !isTerminalStatus(terminal.status)) {
    throw new Error('PLAN_DURABLE_WORKER_TERMINAL_SETTLEMENT_STATE_INVALID');
  }
  await settleTerminalSnapshot(input.terminalSettlementOwner, terminal);
}

async function settleTerminalSnapshot(
  owner: Readonly<EditorialPlanDurableTerminalSettlementOwnerV1> | undefined,
  job: Readonly<DurableWorkflowJobSnapshotV1>,
): Promise<void> {
  if (!owner) return;
  if (!isTerminalStatus(job.status)) {
    throw new Error('PLAN_DURABLE_WORKER_TERMINAL_SETTLEMENT_STATE_INVALID');
  }
  await owner.settleTerminal(job);
}

function isTerminalStatus(status: DurableWorkflowJobSnapshotV1['status']): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'dead_letter';
}

async function settleFailure(input: Readonly<{
  jobStore: Pick<DurableWorkflowJobStoreV1, 'retryOrDeadLetter'>;
  jobId: string;
  retryDelayMs?: number;
  claim: Readonly<{
    job: Readonly<DurableWorkflowJobSnapshotV1>;
    leaseToken: string;
  }>;
  current: Readonly<DurableWorkflowJobSnapshotV1> | null;
  error: unknown;
  clock: () => Date;
}>): Promise<EditorialPlanDurableWorkerResultV1> {
  const now = input.clock();
  const retryable = input.error instanceof EditorialPlanDurableRetryableErrorV1;
  const errorCode = retryable ? input.error.code : workerErrorCode(input.error);
  try {
    const status = await input.jobStore.retryOrDeadLetter({
      jobId: input.jobId, leaseToken: input.claim.leaseToken,
      error: {
        code: errorCode, message: errorMessage(input.error), retryable, occurredAt: now,
      },
      retryAt: new Date(now.getTime() + Math.max(1_000, input.retryDelayMs ?? 30_000)),
      retryCursor: {
        resumeSequence: input.current?.resumeState?.sequence ?? 0,
        resumeStateSha256: input.current?.resumeState?.stateSha256 ?? null,
        ownerCursor: retryable ? input.error.retryCursor : {},
      },
      now,
    });
    return { kind: status, jobId: input.jobId, errorCode };
  } catch (error) {
    if (error instanceof DurableWorkflowJobLeaseLostErrorV1) {
      return { kind: 'lease_lost', reason: error.message };
    }
    throw error;
  }
}

function terminalReceipt(input: Readonly<{
  job: Readonly<DurableWorkflowJobSnapshotV1>;
  resolved: ResolvedPlanJob;
  owner: Readonly<EditorialPlanDurableExecutionOwnerV1>;
  ownerReceipt: Readonly<EditorialPlanDurableExecutionOwnerReceiptV1>;
  completedAt: Date;
}>): DurableWorkflowJobTerminalReceiptV1 {
  const material = {
    version: EDITORIAL_PLAN_DURABLE_WORKER_RECEIPT_VERSION_V1,
    jobId: input.job.jobId,
    planRevisionSha256: input.resolved.plan.revisionSha256,
    nodeId: input.resolved.node.nodeId,
    nodeVersion: input.resolved.node.nodeVersion,
    definitionSha256: input.resolved.definition.definitionSha256,
    executionOwnerId: input.owner.ownerId,
    executionOwnerVersion: input.owner.ownerVersion,
    ownerReceiptId: input.ownerReceipt.receiptId,
    ownerReceiptSha256: input.ownerReceipt.receiptSha256,
    disposition: input.ownerReceipt.disposition,
    proofReferences: input.ownerReceipt.proofReferences,
    completedAt: input.completedAt.toISOString(),
  };
  const receiptSha256 = hashDurableWorkflowJobJsonV1(material);
  return {
    disposition: input.ownerReceipt.disposition,
    receiptId: `epw_${receiptSha256.slice(0, 24)}`,
    receiptSha256,
    proofReferences: input.ownerReceipt.proofReferences,
    completedAt: input.completedAt,
  };
}

function cancellationReceipt(
  job: Readonly<DurableWorkflowJobSnapshotV1>,
  completedAt: Date,
): DurableWorkflowJobTerminalReceiptV1 {
  const material = {
    version: EDITORIAL_PLAN_DURABLE_WORKER_RECEIPT_VERSION_V1,
    jobId: job.jobId, disposition: 'CANCELLED',
    requestedBy: job.cancelRequestedBy,
    reason: job.cancelReason,
    completedAt: completedAt.toISOString(),
  };
  const receiptSha256 = hashDurableWorkflowJobJsonV1(material);
  return {
    disposition: 'CANCELLED', receiptId: `epw_cancel_${receiptSha256.slice(0, 24)}`,
    receiptSha256, proofReferences: [], completedAt,
  };
}

function assertOwnerReceipt(
  receipt: Readonly<EditorialPlanDurableExecutionOwnerReceiptV1>,
): void {
  if (!['PASS', 'FAIL', 'UNVERIFIABLE'].includes(receipt.disposition)) {
    throw new Error('PLAN_DURABLE_WORKER_OWNER_DISPOSITION_INVALID');
  }
  requireIdentity(receipt.receiptId, 'OWNER_RECEIPT_ID');
  requireSha256(receipt.receiptSha256, 'OWNER_RECEIPT');
  for (const proof of receipt.proofReferences) {
    requireIdentity(proof.proofId, 'OWNER_PROOF_ID');
    requireSha256(proof.proofSha256, 'OWNER_PROOF');
    if (!['PASS', 'FAIL', 'UNVERIFIABLE'].includes(proof.disposition)) {
      throw new Error('PLAN_DURABLE_WORKER_OWNER_PROOF_DISPOSITION_INVALID');
    }
  }
  if (new Set(receipt.proofReferences.map(({ proofId }) => proofId)).size
    !== receipt.proofReferences.length) {
    throw new Error('PLAN_DURABLE_WORKER_OWNER_PROOF_DUPLICATE');
  }
}

function workerErrorCode(error: unknown): string {
  if (error instanceof EditorialPlanDurableJobResolutionErrorV1) {
    return requireIdentity(error.message, 'RESOLUTION_ERROR_CODE');
  }
  return 'PLAN_EXECUTION_FAILED';
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown plan execution failure.';
}
function requireIdentity(value: string, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(normalized)) {
    throw new Error(`PLAN_DURABLE_WORKER_${label}_INVALID`);
  }
  return normalized;
}
function requireSha256(value: string, label: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`PLAN_DURABLE_WORKER_${label}_SHA256_INVALID`);
  }
  return value;
}
