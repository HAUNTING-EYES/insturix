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
