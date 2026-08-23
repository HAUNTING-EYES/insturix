import {
  canonicalizeEditronJsonV1,
  hashEditronCanonicalJsonV1,
} from './canonical-json-v1';

export const DURABLE_WORKFLOW_JOB_VERSION_V1 =
  'EDITRON_DURABLE_WORKFLOW_JOB_V1_1' as const;
export const DURABLE_WORKFLOW_JOB_COLLECTION_V1 =
  'editron_durable_workflow_jobs' as const;
export const DURABLE_WORKFLOW_JOB_LEASE_MS_V1 = 5 * 60 * 1000;
export const DURABLE_WORKFLOW_JOB_TTL_MS_V1 = 30 * 24 * 60 * 60 * 1000;

export type DurableWorkflowJobStatusV1 =
  | 'queued'
  | 'running'
  | 'retry_wait'
  | 'completed'
  | 'cancelled'
  | 'dead_letter';

export interface DurableWorkflowJobInputBindingV1 {
  schemaId: string;
  bindingSha256: string;
  payload: Readonly<Record<string, unknown>>;
}

export interface DurableWorkflowJobDependencyBindingV1 {
  dependencyId: string;
  dependencyVersion: string;
  bindingSha256: string;
}

export interface DurableWorkflowJobBudgetReservationV1 {
  reservationId: string;
  bindingSha256: string;
}

export interface DurableWorkflowJobCreateInputV1 {
  tenantId: string;
  userId: string;
  orgId: string | null;
  projectId: string | null;
  operationOwner: string;
  operationKind: string;
  operationId: string;
  parentCommandId: string | null;
  parentReceiptId: string | null;
  idempotencyKey: string;
  input: Readonly<DurableWorkflowJobInputBindingV1>;
  dependencies: readonly Readonly<DurableWorkflowJobDependencyBindingV1>[];
  budgetReservation: Readonly<DurableWorkflowJobBudgetReservationV1> | null;
  maxAttempts: number;
  expiresAt?: Date;
}

export interface DurableWorkflowJobResumeStateV1 {
  sequence: number;
  schemaId: string;
  stateSha256: string;
  payload: Readonly<Record<string, unknown>>;
  committedAt: Date;
}

export interface DurableWorkflowJobTerminalReceiptV1 {
  disposition: 'PASS' | 'FAIL' | 'UNVERIFIABLE' | 'CANCELLED';
  receiptId: string;
  receiptSha256: string;
  proofReferences: readonly Readonly<{
    proofId: string;
    proofSha256: string;
    disposition: 'PASS' | 'FAIL' | 'UNVERIFIABLE';
  }>[];
  completedAt: Date;
}

export interface DurableWorkflowJobErrorV1 {
  code: string;
  message: string;
  retryable: boolean;
  occurredAt: Date;
}

export interface DurableWorkflowJobRecordV1 {
  _id: string;
  jobId: string;
  version: typeof DURABLE_WORKFLOW_JOB_VERSION_V1;
  tenantId: string;
  userId: string;
  orgId: string | null;
  projectId: string | null;
  operationOwner: string;
  operationKind: string;
  operationId: string;
  parentCommandId: string | null;
  parentReceiptId: string | null;
  idempotencyKey: string;
  input: Readonly<DurableWorkflowJobInputBindingV1>;
  dependencies: readonly Readonly<DurableWorkflowJobDependencyBindingV1>[];
  budgetReservation: Readonly<DurableWorkflowJobBudgetReservationV1> | null;
  status: DurableWorkflowJobStatusV1;
  attemptCount: number;
  maxAttempts: number;
  remainingAttempts: number;
  retryCursor: Readonly<Record<string, unknown>> | null;
  leaseToken: string | null;
  leaseOwnerId: string | null;
  leaseExpiresAt: Date | null;
  nextAttemptAt: Date | null;
  cancelRequestedAt: Date | null;
  cancelRequestedBy: string | null;
  cancelReason: string | null;
  resumeState: Readonly<DurableWorkflowJobResumeStateV1> | null;
  terminalReceipt: Readonly<DurableWorkflowJobTerminalReceiptV1> | null;
  error: Readonly<DurableWorkflowJobErrorV1> | null;
  dispatchTransport: string | null;
  dispatchMessageId: string | null;
  dispatchCount: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export type DurableWorkflowJobSnapshotV1 = Omit<
  DurableWorkflowJobRecordV1,
  '_id' | 'leaseToken' | 'createdAt' | 'updatedAt' | 'expiresAt'
  | 'leaseExpiresAt' | 'nextAttemptAt' | 'cancelRequestedAt'
  | 'resumeState' | 'terminalReceipt' | 'error'
> & Readonly<{
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  leaseExpiresAt: string | null;
  nextAttemptAt: string | null;
  cancelRequestedAt: string | null;
  resumeState: (Omit<DurableWorkflowJobResumeStateV1, 'committedAt'> & {
    committedAt: string;
  }) | null;
  terminalReceipt: (Omit<DurableWorkflowJobTerminalReceiptV1, 'completedAt'> & {
    completedAt: string;
  }) | null;
  error: (Omit<DurableWorkflowJobErrorV1, 'occurredAt'> & {
    occurredAt: string;
  }) | null;
}>;

export type ClaimDurableWorkflowJobResultV1 =
  | Readonly<{
      kind: 'claimed';
      job: Readonly<DurableWorkflowJobSnapshotV1>;
      leaseToken: string;
    }>
  | Readonly<{
      kind: 'cancel_claimed';
      job: Readonly<DurableWorkflowJobSnapshotV1>;
      leaseToken: string;
    }>
  | Readonly<{
      kind: 'skipped';
      reason: 'terminal' | 'expired';
      job: Readonly<DurableWorkflowJobSnapshotV1>;
    }>
  | Readonly<{
      kind: 'skipped';
      reason: 'not_found' | 'lease_held' | 'cancel_requested'
        | 'retry_not_due' | 'attempts_exhausted';
    }>;

export class DurableWorkflowJobConflictErrorV1 extends Error {}
export class DurableWorkflowJobLeaseLostErrorV1 extends Error {}
export class DurableWorkflowJobTransitionErrorV1 extends Error {}

export function canonicalizeDurableWorkflowJobJsonV1(value: unknown): string {
  try {
    return canonicalizeEditronJsonV1(value);
  } catch (error) {
    throw durableCanonicalJsonError(error);
  }
}

export function hashDurableWorkflowJobJsonV1(value: unknown): string {
  try {
    return hashEditronCanonicalJsonV1(value);
  } catch (error) {
    throw durableCanonicalJsonError(error);
  }
}

function durableCanonicalJsonError(error: unknown): Error {
  if (error instanceof Error && error.message.startsWith('EDITRON_JSON_')) {
    return new Error(error.message.replace('EDITRON_JSON_', 'DURABLE_JOB_JSON_'));
  }
  return error instanceof Error ? error : new Error('DURABLE_JOB_JSON_INVALID');
}
