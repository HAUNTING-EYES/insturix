import { createHash } from 'node:crypto';
import type { IndexDescription } from 'mongodb';
import type {
  PostMortemInput,
  PostMortemPreparedPlan,
  PostMortemResult,
} from './post-mortem-contract';

export const THINKFORGE_POST_MORTEM_JOB_VERSION = 1;
export const THINKFORGE_POST_MORTEM_JOB_COLLECTION = 'thinkforge_post_mortem_jobs';
export const THINKFORGE_POST_MORTEM_JOB_MAX_ATTEMPTS = 3;
export const THINKFORGE_POST_MORTEM_JOB_LEASE_MS = 5 * 60_000;
export const THINKFORGE_POST_MORTEM_JOB_TTL_MS = 14 * 24 * 60 * 60_000;

export const THINKFORGE_POST_MORTEM_JOB_INDEXES: IndexDescription[] = [
  { key: { activeDedupeKey: 1 }, name: 'thinkforge_post_mortem_active_dedupe', unique: true, sparse: true },
  { key: { userId: 1, orgId: 1, status: 1, updatedAt: -1 }, name: 'thinkforge_post_mortem_actor_status' },
  { key: { status: 1, updatedAt: 1 }, name: 'thinkforge_post_mortem_recovery' },
  { key: { expiresAt: 1 }, name: 'thinkforge_post_mortem_ttl', expireAfterSeconds: 0 },
];

export type PostMortemJobStatus = 'queued' | 'running' | 'completed' | 'dead_letter';

export interface PostMortemJobInput extends PostMortemInput {
  deleteSessionOnCompletion: boolean;
}

export interface PostMortemJobError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface PostMortemJobRecord {
  _id: string;
  id: string;
  version: number;
  dedupeKey: string;
  activeDedupeKey?: string;
  userId: string;
  orgId: string | null;
  input: PostMortemJobInput;
  status: PostMortemJobStatus;
  attemptCount: number;
  maxAttempts: number;
  leaseToken?: string;
  leaseExpiresAt: Date | null;
  queueMessageId: string | null;
  checkpoint: PostMortemPreparedPlan | null;
  checkpointHash: string | null;
  result: PostMortemResult | null;
  resultHash: string | null;
  error: PostMortemJobError | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export interface PostMortemJobSnapshot extends Omit<
  PostMortemJobRecord,
  '_id' | 'activeDedupeKey' | 'leaseToken' | 'leaseExpiresAt' | 'createdAt' | 'updatedAt' | 'expiresAt'
> {
  leaseExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export type ClaimPostMortemJobResult =
  | { kind: 'claimed'; job: PostMortemJobSnapshot; leaseToken: string }
  | { kind: 'skipped'; reason: 'not_found' | 'terminal' | 'lease_held' | 'attempts_exhausted' };

export class PostMortemJobLeaseLostError extends Error {
  constructor() {
    super('Post-mortem job lease was lost.');
    this.name = 'PostMortemJobLeaseLostError';
  }
}

export class PostMortemJobCheckpointConflictError extends Error {
  constructor() {
    super('Post-mortem job checkpoint differs from the durable checkpoint.');
    this.name = 'PostMortemJobCheckpointConflictError';
  }
}

export class PostMortemJobResultConflictError extends Error {
  constructor() {
    super('Post-mortem job result differs from the durable result checkpoint.');
    this.name = 'PostMortemJobResultConflictError';
  }
}

export class PostMortemJobResultMissingError extends Error {
  constructor() {
    super('Post-mortem job cannot complete before its result is durable.');
    this.name = 'PostMortemJobResultMissingError';
  }
}

export function createPostMortemJobDedupeKey(input: PostMortemJobInput): string {
  return createHash('sha256').update(JSON.stringify({
    version: THINKFORGE_POST_MORTEM_JOB_VERSION,
    userId: input.userId,
    orgId: input.orgId ?? null,
    sessionId: input.sessionId,
  })).digest('hex');
}

export function hashPostMortemJobValue(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function normalizePostMortemJobError(error: unknown, retryable: boolean): PostMortemJobError {
  const message = safePostMortemJobErrorMessage(error);
  return { code: error instanceof Error ? error.name || 'processing_failed' : 'processing_failed', message, retryable };
}

export function safePostMortemJobErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|redis|https?):\/\/[^\s]+/gi, '[redacted-url]')
    .replace(/\b(token|key|secret|password)=([^&\s]+)/gi, '$1=[redacted]')
    .replace(/\b(?:sk|pk)-[a-z0-9_-]{12,}\b/gi, '[redacted-key]')
    .slice(0, 2_000);
}

export function clonePostMortemJobValue<T>(value: T): T {
  return structuredClone(value);
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}
