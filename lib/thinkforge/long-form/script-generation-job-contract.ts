import { createHash } from 'node:crypto';
import type { IndexDescription } from 'mongodb';
import type { ScriptChapterPlanInput } from '../agents/script-chapter-plan-agent';
import type { ScriptWriterInput, ScriptWriterResult } from '../agents/script-writer-agent';
import type { ThinkForgeResolvedAuthoringContext } from '../context/resolved-authoring-context';
import type { ThinkForgeWriterInvocationTraceV1 } from '../provenance/generation-trace';
import type { ScriptChapterPlan } from '../schemas/script-chapter-plan';
import {
  assertVideoTreatmentReferences,
  parseVideoTreatment,
} from '../schemas/video-treatment';
import type { ThinkForgeSignalTrace } from '../signals/signal-trace';
import type { ScriptChapterSemanticValidationReceipt } from './script-chapter-semantic-validation';

export const LONG_FORM_SCRIPT_JOB_VERSION = 2;
export const LONG_FORM_SCRIPT_JOB_COLLECTION = 'thinkforge_long_form_script_jobs';
export const LONG_FORM_SCRIPT_JOB_LEASE_MS = 8 * 60_000;
export const LONG_FORM_SCRIPT_JOB_MAX_STAGE_FAILURES = 3;
export const LONG_FORM_SCRIPT_JOB_TTL_MS = 48 * 60 * 60_000;
export const LONG_FORM_SCRIPT_GENERATION_INTENT = 'long_form_chaptered';

export const LONG_FORM_SCRIPT_JOB_INDEXES: IndexDescription[] = [
  { key: { activeDedupeKey: 1 }, name: 'thinkforge_long_form_active_dedupe', unique: true, sparse: true },
  {
    key: { userId: 1, orgId: 1, sessionId: 1, generationId: 1 },
    name: 'thinkforge_long_form_generation_identity',
    unique: true,
  },
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
  contextMetadata?: {
    trendContext?: Record<string, unknown>;
    castingContext?: Record<string, unknown>;
  };
}

export interface ScriptChapterArtifact {
  actId: string;
  chapterId: string;
  planHash: string;
  result: ScriptWriterResult;
  writerTrace: ThinkForgeWriterInvocationTraceV1;
  semanticValidation: ScriptChapterSemanticValidationReceipt;
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

export class LongFormScriptJobInputIntegrityError extends Error {
  readonly code = 'LONG_FORM_SCRIPT_INPUT_INTEGRITY_INVALID';

  constructor(readonly failures: readonly string[]) {
    super(`Long-form script input integrity failed: ${failures.join(', ')}`);
    this.name = 'LongFormScriptJobInputIntegrityError';
  }
}

export function createLongFormScriptJobDedupeKey(input: LongFormScriptGenerationJobInput): string {
  return hashLongFormScriptJobValue({
    version: LONG_FORM_SCRIPT_JOB_VERSION,
    immutableInput: input,
  });
}

/**
 * A V3 long-form job must keep the exact treatment, approved audiovisual
 * constraints, evidence boundary, and creative-reference scope it started with.
 * The durable input hash catches mutation; the semantic checks catch a
 * consistently persisted but internally contradictory contract.
 */
export function assertLongFormScriptJobInputIntegrity(
  job: Pick<LongFormScriptGenerationJobSnapshot, 'version' | 'dedupeKey' | 'input'>,
): void {
  const treatmentInput = job.input.authoringInput.videoTreatment;
  const failures: string[] = [];
  const isCurrentVersion = job.version === LONG_FORM_SCRIPT_JOB_VERSION;
  const isLegacyUntreatedJob = job.version === 1 && !treatmentInput;
  if (!isCurrentVersion && !isLegacyUntreatedJob) {
    failures.push(`job_version_mismatch:${job.version}/${LONG_FORM_SCRIPT_JOB_VERSION}`);
  }
  if (isCurrentVersion && job.dedupeKey !== createLongFormScriptJobDedupeKey(job.input)) {
    failures.push('immutable_input_hash_mismatch');
  }
  if (!treatmentInput) {
    if (failures.length > 0) throw new LongFormScriptJobInputIntegrityError(failures);
    return;
  }

  const treatmentResult = (() => {
    try {
      return { treatment: parseVideoTreatment(treatmentInput), error: null } as const;
    } catch (error) {
      return { treatment: null, error } as const;
    }
  })();
  if (!treatmentResult.treatment) {
    const detail = treatmentResult.error instanceof Error ? treatmentResult.error.message : 'unknown';
    failures.push(`video_treatment_invalid:${detail}`);
    throw new LongFormScriptJobInputIntegrityError(failures);
  }

  const treatment = treatmentResult.treatment;
  const editorialPlan = job.input.authoringInput.editorialPlan;
  if (editorialPlan.writerKind !== 'script' || editorialPlan.execution.kind !== 'script') {
    failures.push('script_editorial_plan_required');
  } else if (
    hashLongFormScriptJobValue(treatment.audiovisualIntent)
    !== hashLongFormScriptJobValue(editorialPlan.execution.plan.audiovisualIntent)
  ) {
    failures.push('audiovisual_intent_mismatch');
  }

  const allowedSourceRefs = new Set(
    job.input.authoringInput.sourceLedger.entries.map((entry) => entry.referenceId),
  );
  const treatmentSourceRefs = new Set([
    ...treatment.decisionTrace.sourceRefs,
    ...treatment.visualEvents.flatMap((event) => event.sourceRefs),
    ...treatment.captureRequirements.flatMap((requirement) => requirement.sourceRefs),
  ]);
  treatmentSourceRefs.forEach((sourceRef) => {
    if (!allowedSourceRefs.has(sourceRef)) failures.push(`unknown_source_ref:${sourceRef}`);
  });

  const creativeReferenceIds = new Set([
    ...treatment.decisionTrace.creativeReferenceIds,
    ...treatment.visualEvents.flatMap((event) => event.creativeReferenceIds),
    ...treatment.captureRequirements.flatMap((requirement) => requirement.creativeReferenceIds),
  ]);
  if (creativeReferenceIds.size > 0) {
    const referenceSet = job.input.authoringContext.creativeReferenceContext?.referenceSet;
    if (!referenceSet) {
      failures.push('creative_reference_context_missing');
    } else {
      try {
        assertVideoTreatmentReferences(treatment, referenceSet);
      } catch (error) {
        const issues = error instanceof Error && 'issues' in error && Array.isArray(error.issues)
          ? error.issues.filter((issue): issue is string => typeof issue === 'string')
          : ['unknown'];
        failures.push(...issues.map((issue) => `creative_reference_invalid:${issue}`));
      }
    }
  }

  if (failures.length > 0) throw new LongFormScriptJobInputIntegrityError(failures);
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
    code: longFormScriptJobErrorCode(error),
    message: safeLongFormScriptJobErrorMessage(error),
    retryable,
    stage,
  };
}

function longFormScriptJobErrorCode(error: unknown): string {
  if (
    error
    && typeof error === 'object'
    && 'code' in error
    && typeof (error as { code?: unknown }).code === 'string'
    && (error as { code: string }).code.trim()
  ) {
    return (error as { code: string }).code;
  }
  return error instanceof Error ? error.name || 'processing_failed' : 'processing_failed';
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
