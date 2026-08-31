import { createHash } from 'node:crypto';
import type { IndexDescription } from 'mongodb';
import type { VideoTreatment } from '../schemas/video-treatment';

export const PRODUCTION_CONTRACT_REFRESH_JOB_VERSION = 1;
export const PRODUCTION_CONTRACT_REFRESH_JOB_COLLECTION = 'thinkforge_production_contract_refresh_jobs';
export const PRODUCTION_CONTRACT_REFRESH_JOB_LEASE_MS = 8 * 60_000;
export const PRODUCTION_CONTRACT_REFRESH_JOB_MAX_STAGE_FAILURES = 3;
export const PRODUCTION_CONTRACT_REFRESH_JOB_TTL_MS = 48 * 60 * 60_000;

export const PRODUCTION_CONTRACT_REFRESH_JOB_INDEXES: IndexDescription[] = [
  { key: { activeDedupeKey: 1 }, name: 'thinkforge_contract_refresh_active_dedupe', unique: true, sparse: true },
  { key: { userId: 1, orgId: 1, sessionId: 1, scriptId: 1, baseVersion: 1 }, name: 'thinkforge_contract_refresh_identity' },
  { key: { status: 1, updatedAt: 1 }, name: 'thinkforge_contract_refresh_recovery' },
  { key: { expiresAt: 1 }, name: 'thinkforge_contract_refresh_ttl', expireAfterSeconds: 0 },
];

export type ProductionContractRefreshJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'dead_letter';

export type ProductionContractRefreshJobStage = 'treatment' | 'sidecar' | 'committing';

export type ProductionContractRefreshBillingStatus =
  | 'pending'
  | 'charged'
  | 'settled'
  | 'refund_pending'
  | 'refunded';

export interface ProductionContractRefreshJobInput {
  userId: string;
  orgId: string | null;
  sessionId: string;
  scriptId: string;
  baseVersion: number;
  documentHash: string;
}

export interface ProductionContractRefreshTreatmentCheckpoint {
  treatment: VideoTreatment;
  inputFingerprint: string;
  source: 'cache' | 'generated';
  cacheStatus: 'hit' | 'miss' | 'unavailable';
  modelName: string;
  latencyMs: number;
  writingContextCacheStatus?: 'hit' | 'created' | 'inline';
}

export interface ProductionContractRefreshCommitReceipt {
  documentVersion: number;
  contentHash: string;
  committedAt: string;
}

export interface ProductionContractRefreshJobError {
  code: string;
  message: string;
  retryable: boolean;
  stage: ProductionContractRefreshJobStage;
}

export interface ProductionContractRefreshBillingState {
  status: ProductionContractRefreshBillingStatus;
  updatedAt: Date;
  reason: string | null;
}

export interface ProductionContractRefreshJobRecord {
  _id: string;
  id: string;
  version: number;
  dedupeKey: string;
  activeDedupeKey?: string;
  userId: string;
  orgId: string | null;
  sessionId: string;
  scriptId: string;
  baseVersion: number;
  input: ProductionContractRefreshJobInput;
  status: ProductionContractRefreshJobStatus;
  stage: ProductionContractRefreshJobStage;
  dispatchCount: number;
  stageFailureCount: number;
  maxStageFailures: number;
  leaseToken?: string;
  leaseExpiresAt: Date | null;
  queueMessageId: string | null;
  treatmentCheckpoint: ProductionContractRefreshTreatmentCheckpoint | null;
  treatmentCheckpointHash: string | null;
  commitReceipt: ProductionContractRefreshCommitReceipt | null;
  billing: ProductionContractRefreshBillingState;
  error: ProductionContractRefreshJobError | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export interface ProductionContractRefreshJobSnapshot extends Omit<
  ProductionContractRefreshJobRecord,
  '_id' | 'activeDedupeKey' | 'leaseToken' | 'leaseExpiresAt' | 'createdAt' | 'updatedAt' | 'expiresAt' | 'billing'
> {
  leaseExpiresAt: string | null;
  billing: Omit<ProductionContractRefreshBillingState, 'updatedAt'> & { updatedAt: string };
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export type ClaimProductionContractRefreshJobResult =
  | { kind: 'claimed'; job: ProductionContractRefreshJobSnapshot; leaseToken: string }
  | { kind: 'skipped'; reason: 'not_found' | 'terminal' | 'lease_held' | 'billing_pending' };

export class ProductionContractRefreshJobLeaseLostError extends Error {
  constructor() {
    super('Production-contract refresh job lease was lost.');
    this.name = 'ProductionContractRefreshJobLeaseLostError';
  }
}

export class ProductionContractRefreshJobCheckpointConflictError extends Error {
  constructor(readonly checkpoint: 'treatment' | 'commit') {
    super(`Production-contract refresh ${checkpoint} checkpoint differs from durable state.`);
    this.name = 'ProductionContractRefreshJobCheckpointConflictError';
  }
}

export class ProductionContractRefreshJobTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductionContractRefreshJobTransitionError';
  }
}

export function createProductionContractRefreshJobDedupeKey(
  input: ProductionContractRefreshJobInput,
): string {
  return hashProductionContractRefreshJobValue({
    version: PRODUCTION_CONTRACT_REFRESH_JOB_VERSION,
    immutableInput: input,
  });
}

export function hashProductionContractRefreshJobValue(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function cloneProductionContractRefreshJobValue<T>(value: T): T {
  return structuredClone(value);
}

export function normalizeProductionContractRefreshJobError(
  error: unknown,
  stage: ProductionContractRefreshJobStage,
  retryable: boolean,
): ProductionContractRefreshJobError {
  const candidate = error as { code?: unknown } | null;
  return {
    code: typeof candidate?.code === 'string' && candidate.code.trim()
      ? candidate.code
      : error instanceof Error ? error.name || 'processing_failed' : 'processing_failed',
    message: safeErrorMessage(error),
    retryable,
    stage,
  };
}

function safeErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|redis|https?):\/\/[^\s]+/gi, '[redacted-url]')
    .replace(/\b(token|key|secret|password)=([^&\s]+)/gi, '$1=[redacted]')
    .replace(/\b(?:sk|pk)-[a-z0-9_-]{12,}\b/gi, '[redacted-key]')
    .slice(0, 2_000);
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${Array.from(value, (entry) => (
      entry === undefined ? 'null' : stableStringify(entry)
    )).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}
