import { createHash } from 'node:crypto';
import type { IndexDescription } from 'mongodb';
import type { ScriptChapterPlanInput } from '../agents/script-chapter-plan-agent';
import type { ScriptWriterInput, ScriptWriterResult } from '../agents/script-writer-agent';
import type { ThinkForgeResolvedAuthoringContext } from '../context/resolved-authoring-context';
import type { ThinkForgeWriterInvocationTraceV1 } from '../provenance/generation-trace';
import type { ScriptChapterPlan } from '../schemas/script-chapter-plan';
import type { ThinkForgeSignalTrace } from '../signals/signal-trace';

export const LONG_FORM_SCRIPT_JOB_VERSION = 1;
export const LONG_FORM_SCRIPT_JOB_COLLECTION = 'thinkforge_long_form_script_jobs';
export const LONG_FORM_SCRIPT_JOB_LEASE_MS = 8 * 60_000;
export const LONG_FORM_SCRIPT_JOB_MAX_STAGE_FAILURES = 3;
export const LONG_FORM_SCRIPT_JOB_TTL_MS = 48 * 60 * 60_000;

export const LONG_FORM_SCRIPT_JOB_INDEXES: IndexDescription[] = [
  { key: { activeDedupeKey: 1 }, name: 'thinkforge_long_form_active_dedupe', unique: true, sparse: true },
  { key: { userId: 1, orgId: 1, status: 1, updatedAt: -1 }, name: 'thinkforge_long_form_actor_status' },
  { key: { status: 1, updatedAt: 1 }, name: 'thinkforge_long_form_recovery' },
  { key: { expiresAt: 1 }, name: 'thinkforge_long_form_ttl', expireAfterSeconds: 0 },
];

export type LongFormScriptJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'dead_letter';

export type LongFormScriptJobStage = 'planning' | 'writing' | 'assembling' | 'committing';

export interface LongFormScriptAuthoringInput extends Omit<
  ScriptChapterPlanInput,
  'context' | 'retrievedContext'
> {
  context: Omit<ScriptChapterPlanInput['context'], 'systemBrief'>;
  contentSignalProfile?: ScriptWriterInput['contentSignalProfile'];
}

/**
 * Immutable input for the complete long-form operation. The accepted Brand
 * Vault revision and retrieval set are frozen by authoringContext; raw writer
 * context is retained only for the job TTL and never copied to the document.
 */
export interface LongFormScriptGenerationJobInput {
  userId: string;
  orgId: string | null;
  sessionId: string;
  generationId: string;
  scriptId: string;
  baseVersion: number;
  authoringContext: ThinkForgeResolvedAuthoringContext;
  authoringInput: LongFormScriptAuthoringInput;
  signalTrace: ThinkForgeSignalTrace;
}

export interface ScriptChapterArtifact {
  actId: string;
  chapterId: string;
  planHash: string;
  result: ScriptWriterResult;
  writerTrace: ThinkForgeWriterInvocationTraceV1;
}

export interface LongFormScriptCommitReceipt {
  documentVersion: number;
  contentHash: string;
  committedAt: string;
}

export interface LongFormScriptJobError {
  code: string;
  message: string;
  retryable: boolean;
  stage: LongFormScriptJobStage;
}

export interface LongFormScriptGenerationJobRecord {
  _id: string;
  id: string;
  version: number;
  dedupeKey: string;
  activeDedupeKey?: string;
  userId: string;
  orgId: string | null;
  sessionId: string;
  generationId: string;
  input: LongFormScriptGenerationJobInput;
  status: LongFormScriptJobStatus;
  stage: LongFormScriptJobStage;
  dispatchCount: number;
  stageFailureCount: number;
  maxStageFailures: number;
  leaseToken?: string;
  leaseExpiresAt: Date | null;
  queueMessageId: string | null;
  plan: ScriptChapterPlan | null;
  planHash: string | null;
  chapterArtifacts: Record<string, ScriptChapterArtifact>;
  chapterArtifactHashes: Record<string, string>;
  assembledResult: ScriptWriterResult | null;
  assembledResultHash: string | null;
  commitReceipt: LongFormScriptCommitReceipt | null;
  error: LongFormScriptJobError | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export interface LongFormScriptGenerationJobSnapshot extends Omit<
  LongFormScriptGenerationJobRecord,
  '_id' | 'activeDedupeKey' | 'leaseToken' | 'leaseExpiresAt' | 'createdAt' | 'updatedAt' | 'expiresAt'
> {
  leaseExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export type ClaimLongFormScriptJobResult =
  | { kind: 'claimed'; job: LongFormScriptGenerationJobSnapshot; leaseToken: string }
  | { kind: 'skipped'; reason: 'not_found' | 'terminal' | 'lease_held' };

export type LongFormScriptJobNextAction =
  | { kind: 'plan' }
  | { kind: 'write_chapter'; actId: string; chapterId: string }
  | { kind: 'assemble' }
  | { kind: 'commit' }
  | { kind: 'complete' }
  | { kind: 'none' };

export class LongFormScriptJobLeaseLostError extends Error {
  constructor() {
    super('Long-form script job lease was lost.');
    this.name = 'LongFormScriptJobLeaseLostError';
  }
}

export class LongFormScriptJobCheckpointConflictError extends Error {
  constructor(readonly checkpoint: 'plan' | 'chapter' | 'assembly' | 'commit') {
    super(`Long-form script ${checkpoint} checkpoint differs from durable state.`);
    this.name = 'LongFormScriptJobCheckpointConflictError';
  }
}

export class LongFormScriptJobTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LongFormScriptJobTransitionError';
  }
}

export function createLongFormScriptJobDedupeKey(input: LongFormScriptGenerationJobInput): string {
  return hashLongFormScriptJobValue({
    version: LONG_FORM_SCRIPT_JOB_VERSION,
    userId: input.userId,
    orgId: input.orgId,
    sessionId: input.sessionId,
    generationId: input.generationId,
    scriptId: input.scriptId,
    baseVersion: input.baseVersion,
  });
}

export function hashLongFormScriptJobValue(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function cloneLongFormScriptJobValue<T>(value: T): T {
  return structuredClone(value);
}

export function normalizeLongFormScriptJobError(
  error: unknown,
  stage: LongFormScriptJobStage,
  retryable: boolean,
): LongFormScriptJobError {
  return {
    code: error instanceof Error ? error.name || 'processing_failed' : 'processing_failed',
    message: safeLongFormScriptJobErrorMessage(error),
    retryable,
    stage,
  };
}

export function resolveLongFormScriptJobNextAction(
  job: Pick<
    LongFormScriptGenerationJobRecord,
    'status' | 'plan' | 'chapterArtifacts' | 'assembledResult' | 'commitReceipt'
  >,
): LongFormScriptJobNextAction {
  if (job.status === 'completed' || job.status === 'cancelled' || job.status === 'dead_letter') {
    return { kind: 'none' };
  }
  if (!job.plan) return { kind: 'plan' };
  for (const act of job.plan.acts) {
    for (const chapter of act.chapters) {
      if (!job.chapterArtifacts[chapter.id]) {
        return { kind: 'write_chapter', actId: act.id, chapterId: chapter.id };
      }
    }
  }
  if (!job.assembledResult) return { kind: 'assemble' };
  if (!job.commitReceipt) return { kind: 'commit' };
  return { kind: 'complete' };
}

export function longFormScriptStageForAction(
  action: LongFormScriptJobNextAction,
): LongFormScriptJobStage {
  switch (action.kind) {
    case 'plan': return 'planning';
    case 'write_chapter': return 'writing';
    case 'assemble': return 'assembling';
    case 'commit':
    case 'complete':
    case 'none':
      return 'committing';
  }
}

function safeLongFormScriptJobErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|redis|https?):\/\/[^\s]+/gi, '[redacted-url]')
    .replace(/\b(token|key|secret|password)=([^&\s]+)/gi, '$1=[redacted]')
    .replace(/\b(?:sk|pk)-[a-z0-9_-]{12,}\b/gi, '[redacted-key]')
    .slice(0, 2_000);
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => (
    `${JSON.stringify(key)}:${stableStringify(record[key])}`
  )).join(',')}}`;
}
