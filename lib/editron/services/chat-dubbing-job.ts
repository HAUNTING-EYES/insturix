import { createHash, randomUUID } from 'node:crypto';

import { Client } from '@upstash/qstash';

import type { ChatAiEditTransaction } from '@/lib/editron/agent/chat-ai-edit-transaction-runtime';
import {
  buildChatProjectRevision,
} from '@/lib/editron/agent/chat-edit-postconditions';
import type {
  Checkpoint,
  CheckpointService,
  RestorableProjectState,
} from '@/lib/editron/services/checkpoint-service';
import type { Phase0RenderedEvidenceDispatchResult } from '@/lib/editron/services/phase0-rendered-evidence-worker';
import type { AudioRightsContract } from '@/lib/editron/shared/render-request-payload';
import type { GeneratedAudioReceipt } from '@/lib/pipeline/tts-service';
import type { ProjectMutationReceiptV1 } from '@/lib/editron/services/project-service';
import {
  listSupportedSpeechLanguages,
  resolveSpeechSynthesisCapability,
  type CanonicalSpeechLanguage,
  type GeneratedSpeechCapability,
  type SpeechSynthesisCapability,
} from '@/lib/pipeline/speech-capabilities';

export const CHAT_DUBBING_JOB_VERSION = 'editron-chat-dubbing-job-v4' as const;
const LEGACY_CHAT_DUBBING_JOB_V3 = 'editron-chat-dubbing-job-v3' as const;
const LEGACY_CHAT_DUBBING_JOB_V2 = 'editron-chat-dubbing-job-v2' as const;
export const CHAT_DUBBING_MAX_FAILURES = 2;

const JOB_LEASE_MS = 5 * 60 * 1000;
const JOB_TTL_MS = 24 * 60 * 60 * 1000;

export type ChatDubbingJobStatus =
  | 'resolved'
  | 'dispatching'
  | 'queued'
  | 'running'
  | 'retry_wait'
  | 'completed'
  | 'dispatch_failed'
  | 'failed'
  | 'stale';

export type DubbingFidelityCheck =
  | 'coreClaims'
  | 'entities'
  | 'quantities'
  | 'negation'
  | 'comparisons'
  | 'relationships'
  | 'certainty'
  | 'speakerIntent'
  | 'targetLanguage';

export type DubbingAcceptableCompression =
  | 'removed-disfluency'
  | 'removed-filler'
  | 'removed-repetition'
  | 'condensed-syntax';

export type DubbingFidelityIssueCode = DubbingFidelityCheck | 'judge-invalid';

export type DubbingFidelityState =
  | 'preserved'
  | 'not-applicable'
  | 'changed'
  | 'uncertain';

export interface DubbingTranslationFidelityReceipt {
  version: 'editron-dubbing-translation-fidelity-v1';
  outcome: 'faithful' | 'drift' | 'uncertain';
  checks: Record<DubbingFidelityCheck, DubbingFidelityState>;
  issueCodes: DubbingFidelityIssueCode[];
  acceptableCompression: DubbingAcceptableCompression[];
  judgeModel: 'gemini-2.5-flash';
}

export interface DubbingPhraseProgress {
  index: number;
  sourceText: string;
  translatedText: string;
  timelineStartFrame: number;
  timelineEndFrame: number;
  deliveryEndFrame?: number;
  sourceStartMs: number;
  sourceEndMs: number;
  translationRevision?: number;
  translationFidelity?: DubbingTranslationFidelityReceipt;
  fitAttempts?: Array<{
    revision: number;
    voiceDurationMs: number;
    availableDurationMs: number;
    requiredPlaybackRate: number;
    synthesisSpeed: number;
    outcome: 'accepted' | 'rephrase' | 'rate-adjustment';
  }>;
  voiceAssetId?: string;
  voiceUrl?: string;
  voiceDurationMs?: number;
  synthesisSpeed?: number;
  fitMode?: 'natural' | 'semantic-compression' | 'provider-native-rate' | 'post-hoc-playback';
  playbackRate?: number;
  voiceAudioRights?: AudioRightsContract;
  generatedAudioReceipt?: GeneratedAudioReceipt;
  generatedSpeechCapability?: GeneratedSpeechCapability;
}

export interface AudioSeparationReceipt {
  version: 'editron-audio-separation-receipt-v1';
  provider: 'fal-ai';
  model: 'fal-ai/demucs:mdx_extra';
  operation: 'preserve-non-vocal-background';
  stem: 'other';
  sourceAssetId: string;
  derivativeAssetId: string;
  jobId: string;
  createdAt: string;
  vendorRequestId?: string;
}

export interface DubbingMediaProgress {
  assetId: string;
  url: string;
  r2Key?: string | null;
  gcsPath?: string | null;
  audioRights?: AudioRightsContract;
  audioSeparationReceipt?: AudioSeparationReceipt;
}

export interface ChatDubbingProgress {
  stage: 'prepare' | 'separate' | 'voice' | 'commit';
  phrases?: DubbingPhraseProgress[];
  background?: DubbingMediaProgress;
  nextPhraseIndex?: number;
  generatedAssetIds?: string[];
}

export interface ChatDubbingJob {
  _id: string;
  idempotencyKey: string;
  version:
    | typeof CHAT_DUBBING_JOB_VERSION
    | typeof LEGACY_CHAT_DUBBING_JOB_V3
    | typeof LEGACY_CHAT_DUBBING_JOB_V2;
  status: ChatDubbingJobStatus;
  projectId: string;
  userId: string;
  sessionId?: string;
  operationId?: string;
  beforeCheckpointId?: string;
  afterCheckpointId?: string | null;
  renderVerification?: Phase0RenderedEvidenceDispatchResult | null;
  projectRevision: string;
  overlayId: string;
  assetId: string;
  targetLanguage: CanonicalSpeechLanguage | 'English';
  voiceId?: string | null;
  speechCapability?: SpeechSynthesisCapability;
  fps: number;
  timelineStartFrame: number;
  timelineEndFrame: number;
  sourceStartFrame: number;
  sourceEndFrame: number;
  progress: ChatDubbingProgress;
  failureCount: number;
  runCount: number;
  leaseId?: string | null;
  leaseExpiresAt?: Date | null;
  dispatchMessageId?: string | null;
  result?: Record<string, unknown> | null;
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date | null;
  expiresAt: Date;
}

export interface ResolveChatDubbingRequest {
  projectId: string;
  userId: string;
  sessionId?: string;
  operationId?: string;
  overlayId: string | number;
  targetLanguage?: string;
  voiceId?: string;
}

export interface ChatDubbingStepContinue {
  status: 'continue';
  progress: ChatDubbingProgress;
  reason: string;
}

export interface ChatDubbingStepCompleted {
  status: 'completed';
  result: Record<string, unknown>;
}

export type ChatDubbingStepResult = ChatDubbingStepContinue | ChatDubbingStepCompleted;

export interface ChatDubbingCompletion {
  jobId: string;
  userId: string;
  result: Record<string, unknown>;
  afterCheckpointId?: string;
  renderVerification?: Phase0RenderedEvidenceDispatchResult;
  now: Date;
}

export interface ChatDubbingJobStore {
  createOrGet(job: ChatDubbingJob): Promise<{ created: boolean; job: ChatDubbingJob }>;
  find(jobId: string, userId: string): Promise<ChatDubbingJob | null>;
  claimDispatch(jobId: string, userId: string, now: Date): Promise<boolean>;
  markPublished(jobId: string, userId: string, messageId: string | undefined, now: Date): Promise<void>;
  markDispatchFailed(jobId: string, userId: string, error: string, now: Date): Promise<void>;
  claimRun(jobId: string, userId: string, leaseId: string, now: Date): Promise<ChatDubbingJob | null>;
  markProgress(jobId: string, userId: string, progress: ChatDubbingProgress, now: Date): Promise<void>;
  markCompleted(completion: ChatDubbingCompletion): Promise<void>;
  markRetry(jobId: string, userId: string, error: string, now: Date): Promise<void>;
  markFailed(jobId: string, userId: string, status: 'failed' | 'stale', error: string, now: Date): Promise<void>;
}

interface ProjectLike extends Record<string, unknown> {
  projectId?: string;
  userId?: string;
  fps?: number;
  overlays?: Array<Record<string, unknown>>;
}

interface SharedDependencies {
  store: ChatDubbingJobStore;
  loadProject(userId: string, projectId: string): Promise<ProjectLike | null>;
  buildProjectRevision(project: unknown): string | null;
  buildCheckpointId: typeof import(
    '@/lib/editron/agent/chat-ai-edit-transaction-runtime'
  )['buildChatEditCheckpointId'];
  now(): Date;
}

interface QueueDependencies extends SharedDependencies {
  publish(payload: { jobId: string; projectId: string; userId: string }): Promise<{ messageId?: string }>;
}

type ProjectMutationReceiptCapture = <T>(
  callback: () => Promise<T> | T,
  onSettled?: (receipts: readonly ProjectMutationReceiptV1[]) => void,
) => Promise<{ value: T; receipts: ProjectMutationReceiptV1[] }>;

interface RunDependencies extends QueueDependencies {
  execute(job: ChatDubbingJob): Promise<ChatDubbingStepResult>;
  captureMutationReceipts: ProjectMutationReceiptCapture;
  cleanup(job: ChatDubbingJob): Promise<void>;
  checkpointService: Pick<
    CheckpointService,
    | 'createCheckpoint'
    | 'getCheckpoint'
    | 'recordRollbackExpectedRevision'
    | 'updateChatEditOperationScoped'
    | 'restoreProjectCheckpoint'
  >;
  captureProjectState(project: Record<string, unknown>): RestorableProjectState;
  fingerprintProjectState(state: RestorableProjectState): string;
  buildRenderVerificationRequest: typeof import(
    '@/lib/editron/agent/chat-ai-edit-transaction-runtime'
  )['buildChatEditRenderVerificationRequest'];
  dispatchRenderEvidence: typeof import(
    '@/lib/editron/services/phase0-rendered-evidence-worker'
  )['dispatchPhase0RenderedEvidenceJob'];
  verifyPostcondition: typeof import(
    '@/lib/editron/agent/chat-edit-postconditions'
  )['verifyChatToolPostcondition'];
}

export class TerminalDubbingError extends Error {
  readonly retryable = false;
  constructor(readonly code: string, message: string) {
    super(`${code}:${message}`);
    this.name = 'TerminalDubbingError';
  }
}

export async function resolveChatDubbingJob(
  raw: ResolveChatDubbingRequest,
  overrides: Partial<SharedDependencies> = {},
): Promise<{
  jobId: string;
  created: boolean;
  status: ChatDubbingJobStatus;
  targetLanguage: CanonicalSpeechLanguage;
  speechCapability: SpeechSynthesisCapability;
}> {
  const deps = await resolveSharedDependencies(overrides);
  const projectId = requiredIdentifier(raw.projectId, 'projectId');
  const userId = requiredIdentifier(raw.userId, 'userId');
  const sessionId = requiredIdentifier(raw.sessionId, 'sessionId');
  const operationId = requiredIdentifier(raw.operationId, 'operationId');
  const overlayId = requiredIdentifier(String(raw.overlayId), 'overlayId');
  const speechCapability = requireSpeechSynthesisCapability(raw.targetLanguage, raw.voiceId);
  const targetLanguage = speechCapability.language;
  const voiceId = speechCapability.voiceId;
  const project = await deps.loadProject(userId, projectId);
  if (!project) throw new TerminalDubbingError('project-not-found', 'Project is missing or not owned by the current user.');
  const revision = deps.buildProjectRevision(project);
  if (!revision) throw new TerminalDubbingError('project-revision-missing', 'Project revision could not be computed.');
  const fps = positiveFinite(project.fps ?? 30, 'project fps');
  const overlay = (project.overlays ?? []).find((item) => String(item.id ?? '') === overlayId);
  if (!overlay || String(overlay.type ?? '').toLowerCase() !== 'video') {
    throw new TerminalDubbingError('invalid-dubbing-target', 'Dubbing requires one selected video overlay.');
  }
  const assetId = requiredIdentifier(overlay.assetId, 'overlay assetId');
  const speed = Number(overlay.speed ?? 1);
  if (!Number.isFinite(speed) || Math.abs(speed - 1) > 0.0001 || (Array.isArray(overlay.speedCurve) && overlay.speedCurve.length > 0)) {
    throw new TerminalDubbingError('retimed-clip-unsupported', 'Dub the clip before applying speed changes so speech timing remains truthful.');
  }
  const timelineStartFrame = nonNegativeInteger(overlay.from, 'overlay.from');
  const durationInFrames = positiveInteger(overlay.durationInFrames, 'overlay.durationInFrames');
  const sourceStartFrame = nonNegativeInteger(
    overlay.sourceStartFrame ?? overlay.videoStartTime ?? 0,
    'overlay source start frame',
  );
  const timelineEndFrame = timelineStartFrame + durationInFrames;
  const sourceEndFrame = sourceStartFrame + durationInFrames;
  const beforeCheckpointId = deps.buildCheckpointId({
    operationId,
    sessionId,
    projectId,
    userId,
  }, 'before');
  const idempotencyKey = createHash('sha256').update(JSON.stringify({
    version: CHAT_DUBBING_JOB_VERSION,
    userId,
    projectId,
    sessionId,
    operationId,
    revision,
    overlayId,
    targetLanguage,
    voiceId,
    speechCapability,
  })).digest('hex');
  const now = deps.now();
  const proposed: ChatDubbingJob = {
    _id: `chat_dub_${idempotencyKey.slice(0, 32)}`,
    idempotencyKey,
    version: CHAT_DUBBING_JOB_VERSION,
    status: 'resolved',
    projectId,
    userId,
    sessionId,
    operationId,
    beforeCheckpointId,
    projectRevision: revision,
    overlayId,
    assetId,
    targetLanguage,
    voiceId,
    speechCapability,
    fps,
    timelineStartFrame,
    timelineEndFrame,
    sourceStartFrame,
    sourceEndFrame,
    progress: { stage: 'prepare', nextPhraseIndex: 0, generatedAssetIds: [] },
    failureCount: 0,
    runCount: 0,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + JOB_TTL_MS),
  };
  const stored = await deps.store.createOrGet(proposed);
  if (!sameContract(stored.job, proposed)) {
    throw new TerminalDubbingError('dubbing-job-collision', `Dubbing job collision for ${proposed._id}.`);
  }
  const storedCapability = resolveChatDubbingSpeechCapability(stored.job);
  return {
    jobId: stored.job._id,
    created: stored.created,
    status: stored.job.status,
    targetLanguage: storedCapability.language,
    speechCapability: storedCapability,
  };
}

export async function queueChatDubbingJob(
  input: { jobId: string; projectId: string; userId: string },
  overrides: Partial<QueueDependencies> = {},
): Promise<{ status: 'queued' | 'already-queued' | 'completed' | 'failed' | 'stale'; jobId: string; messageId?: string; reason?: string }> {
  const deps = await resolveQueueDependencies(overrides);
  const job = await deps.store.find(requiredIdentifier(input.jobId, 'jobId'), input.userId);
  if (!job || job.projectId !== input.projectId) return { status: 'failed', jobId: input.jobId, reason: 'dubbing-job-not-found-or-not-owned' };
  if (job.status === 'completed') return { status: 'completed', jobId: job._id };
  if (job.status === 'failed' || job.status === 'stale') {
    return { status: job.status, jobId: job._id, reason: job.error ?? `dubbing-job-${job.status}` };
  }
  if (['queued', 'dispatching', 'running'].includes(job.status)) {
    return { status: 'already-queued', jobId: job._id, ...(job.dispatchMessageId ? { messageId: job.dispatchMessageId } : {}) };
  }
  const project = await deps.loadProject(job.userId, job.projectId);
  const revision = project ? deps.buildProjectRevision(project) : null;
  if (!revision || revision !== job.projectRevision) {
    await deps.store.markFailed(job._id, job.userId, 'stale', 'project-revision-changed-before-dubbing', deps.now());
    return { status: 'stale', jobId: job._id, reason: 'project-revision-changed-before-dubbing' };
  }
  return dispatchExistingJob(job, deps);
}

export async function getChatDubbingJob(jobId: string, userId: string, store?: ChatDubbingJobStore): Promise<ChatDubbingJob | null> {
  return (store ?? new MongoChatDubbingJobStore()).find(requiredIdentifier(jobId, 'jobId'), userId);
}

export async function runChatDubbingJob(
  input: { jobId: string; projectId: string; userId: string },
  overrides: Partial<RunDependencies> = {},
): Promise<{ status: 'completed' | 'continuing' | 'retrying' | 'failed' | 'stale' | 'skipped'; jobId: string; reason?: string; result?: Record<string, unknown> }> {
  const deps = await resolveRunDependencies(overrides);
  const job = await deps.store.claimRun(input.jobId, input.userId, randomUUID(), deps.now());
  if (!job) return { status: 'skipped', jobId: input.jobId, reason: 'job-not-claimable' };
  if (job.projectId !== input.projectId) {
    await deps.store.markFailed(job._id, job.userId, 'failed', 'worker-project-scope-mismatch', deps.now());
    return { status: 'failed', jobId: job._id, reason: 'worker-project-scope-mismatch' };
  }
  const project = await deps.loadProject(job.userId, job.projectId);
  const revision = project ? deps.buildProjectRevision(project) : null;
  if (!revision || revision !== job.projectRevision) {
    await safeCleanup(deps, job);
    await deps.store.markFailed(job._id, job.userId, 'stale', 'project-revision-changed-during-dubbing', deps.now());
    return { status: 'stale', jobId: job._id, reason: 'project-revision-changed-during-dubbing' };
  }

  let cleanupJob = job;
  let beforeCheckpoint: Checkpoint | null = null;
  let writerIssuedReceipt: ProjectMutationReceiptV1 | undefined;
  try {
    beforeCheckpoint = job.version === CHAT_DUBBING_JOB_VERSION && job.progress.stage === 'commit'
      ? await requireDubbingBeforeCheckpoint(job, deps)
      : null;
    const capturedStep = await deps.captureMutationReceipts(
      () => deps.execute(job),
      (receipts) => {
        writerIssuedReceipt = latestWriterReceiptForProject(receipts, job.projectId);
      },
    );
    const step = capturedStep.value;
    if (step.status === 'completed') {
      if (job.version === CHAT_DUBBING_JOB_VERSION && job.progress.stage !== 'commit') {
        throw new TerminalDubbingError(
          'dubbing-stage-contract-violation',
          `The provider completed from ${job.progress.stage}; only the commit stage may mutate the project.`,
        );
      }
      const completedWriterReceipt = reconcileDubbingWriterReceipt(
        writerIssuedReceipt,
        writerIssuedReceiptFromDubbingResult(step.result, job.projectId),
      );
      writerIssuedReceipt = completedWriterReceipt;
      const completed = await completeDubbingMutation({
        job,
        result: step.result,
        beforeCheckpoint,
        writerIssuedReceipt: completedWriterReceipt,
        deps,
      });
      return { status: 'completed', jobId: job._id, result: completed };
    }
    await deps.store.markProgress(job._id, job.userId, step.progress, deps.now());
    const latest = { ...job, progress: step.progress, status: 'resolved' as const };
    cleanupJob = latest;
    const dispatched = await dispatchExistingJob(latest, deps);
    if (dispatched.status === 'failed') {
      return { status: 'retrying', jobId: job._id, reason: dispatched.reason ?? 'dubbing-continuation-dispatch-failed' };
    }
    return { status: 'continuing', jobId: job._id, reason: step.reason };
  } catch (error) {
    const message = errorMessage(error);
    let rollbackFailure: string | null = null;
    if (
      beforeCheckpoint
      && !(error instanceof TerminalDubbingError && error.code === 'dubbing-postcondition-failed')
    ) {
      const operationId = requiredCurrentJobField(job.operationId, 'operationId');
      if (!writerIssuedReceipt) {
        const receiptFailure = await markDubbingWriterReceiptMissing(
          beforeCheckpoint,
          job,
          operationId,
          message,
          deps,
        );
        await deps.store.markFailed(job._id, job.userId, 'failed', receiptFailure, deps.now());
        return { status: 'failed', jobId: job._id, reason: receiptFailure };
      }
      try {
        const receipt = await deps.checkpointService.recordRollbackExpectedRevision(
          beforeCheckpoint.checkpointId,
          job.userId,
          job.projectId,
          dubbingRollbackReceiptId(job),
          writerIssuedReceipt,
        );
        const restored = await deps.checkpointService.restoreProjectCheckpoint(beforeCheckpoint.checkpointId, job.userId, {
          projectId: job.projectId,
          expectedRevision: receipt.expectedRevision,
          actorKind: 'SYSTEM',
        });
        await deps.checkpointService.updateChatEditOperationScoped(
          beforeCheckpoint.checkpointId,
          job.userId,
          job.projectId,
          operationId,
          {
            operationStatus: restored?.restored ? 'rolled-back' : 'failed',
            mutatingToolNames: ['dub_selected_dialogue'],
            operationError: restored?.restored
              ? message
              : `rollback-failed:${restored?.reason ?? 'rollback-revision-receipt-missing'}:${message}`,
          },
        );
        if (!restored?.restored) {
          rollbackFailure = `dubbing-rollback-failed:${restored?.reason ?? 'rollback-revision-receipt-missing'}:${message}`;
        }
      } catch (rollbackError) {
        rollbackFailure = `dubbing-rollback-failed:${errorMessage(rollbackError)}:${message}`;
      }
    }
    if (rollbackFailure) {
      await safeCleanup(deps, cleanupJob);
      await deps.store.markFailed(job._id, job.userId, 'failed', rollbackFailure, deps.now());
      return { status: 'failed', jobId: job._id, reason: rollbackFailure };
    }
    const retryable = isRetryableDubbingError(error);
    if (retryable && job.failureCount + 1 < CHAT_DUBBING_MAX_FAILURES) {
      await deps.store.markRetry(job._id, job.userId, message, deps.now());
      return { status: 'retrying', jobId: job._id, reason: message };
    }
    await safeCleanup(deps, cleanupJob);
    await deps.store.markFailed(job._id, job.userId, 'failed', message, deps.now());
    return { status: 'failed', jobId: job._id, reason: message };
  }
}

async function completeDubbingMutation(input: {
  job: ChatDubbingJob;
  result: Record<string, unknown>;
  beforeCheckpoint: Checkpoint | null;
  writerIssuedReceipt?: ProjectMutationReceiptV1;
  deps: RunDependencies;
}): Promise<Record<string, unknown>> {
  const { job, result, beforeCheckpoint, writerIssuedReceipt, deps } = input;
  if (job.version !== CHAT_DUBBING_JOB_VERSION) {
    await deps.store.markCompleted({ jobId: job._id, userId: job.userId, result, now: deps.now() });
    return result;
  }
  if (!beforeCheckpoint) {
    throw new TerminalDubbingError(
      'dubbing-before-checkpoint-missing',
      'The durable dubbing mutation has no canonical before-state.',
    );
  }
  if (!writerIssuedReceipt) {
    throw new TerminalDubbingError(
      'dubbing-writer-receipt-missing',
      'The durable dubbing mutation has no ProjectService-issued writer receipt.',
    );
  }

  const rollbackReceipt = await deps.checkpointService.recordRollbackExpectedRevision(
    beforeCheckpoint.checkpointId,
    job.userId,
    job.projectId,
    dubbingRollbackReceiptId(job),
    writerIssuedReceipt,
  );
  const afterProject = await deps.loadProject(job.userId, job.projectId);
  if (!afterProject) {
    throw new TerminalDubbingError('project-not-found-after-dubbing', 'Project disappeared after dubbing commit.');
  }
  const beforeProject = projectFromCheckpoint(beforeCheckpoint);
  const postcondition = deps.verifyPostcondition({
    toolName: 'dub_selected_dialogue',
    args: { overlayId: job.overlayId, targetLanguage: job.targetLanguage, voiceId: job.voiceId },
    resultData: result,
    beforeProject,
    afterProject,
  });
  if (postcondition.status !== 'pass') {
    const restore = await deps.checkpointService.restoreProjectCheckpoint(
      beforeCheckpoint.checkpointId,
      job.userId,
      {
        projectId: job.projectId,
        expectedRevision: rollbackReceipt.expectedRevision,
        actorKind: 'SYSTEM',
      },
    );
    await deps.checkpointService.updateChatEditOperationScoped(
      beforeCheckpoint.checkpointId,
      job.userId,
      job.projectId,
      requiredCurrentJobField(job.operationId, 'operationId'),
      {
        operationStatus: restore.restored ? 'rolled-back' : 'failed',
        mutatingToolNames: ['dub_selected_dialogue'],
        operationError: restore.restored
          ? postcondition.reason
          : `${postcondition.reason}; rollback failed (${restore.reason ?? 'unknown'})`,
      },
    );
    throw new TerminalDubbingError(
      'dubbing-postcondition-failed',
      restore.restored
        ? `${postcondition.reason} The project was restored.`
        : `${postcondition.reason} Rollback failed (${restore.reason ?? 'unknown'}).`,
    );
  }

  const afterCheckpoint = await createDubbingAfterCheckpoint(
    job,
    afterProject,
    writerIssuedReceipt,
    deps,
  );
  const operationId = requiredCurrentJobField(job.operationId, 'operationId');
  const sessionId = requiredCurrentJobField(job.sessionId, 'sessionId');
  const beforeCheckpointId = requiredCurrentJobField(job.beforeCheckpointId, 'beforeCheckpointId');
  await deps.checkpointService.updateChatEditOperationScoped(
    beforeCheckpointId,
    job.userId,
    job.projectId,
    operationId,
    {
      operationStatus: 'completed',
      mutatingToolNames: ['dub_selected_dialogue'],
      afterCheckpointId: afterCheckpoint.checkpointId,
    },
  );

  const resultWithPostcondition = { ...result, postconditionVerification: postcondition };
  const transaction: ChatAiEditTransaction = {
    operationId,
    sessionId,
    projectId: job.projectId,
    userId: job.userId,
    beforeCheckpointId,
  };
  let renderVerification: Phase0RenderedEvidenceDispatchResult;
  try {
    const renderRequest = deps.buildRenderVerificationRequest({
      transaction,
      afterCheckpointId: afterCheckpoint.checkpointId,
      subjectReceipt: writerIssuedReceipt,
      project: afterProject,
      successfulCalls: [{
        call: {
          name: 'dub_selected_dialogue',
          args: { overlayId: job.overlayId, targetLanguage: job.targetLanguage, voiceId: job.voiceId },
        },
        result: {
          toolName: 'dub_selected_dialogue',
          result: JSON.stringify({
            status: 'success',
            data: resultWithPostcondition,
            error: null,
            nextAction: null,
          }),
        },
      }],
    });
    renderVerification = await deps.dispatchRenderEvidence({
      projectId: job.projectId,
      userId: job.userId,
      requestedAt: deps.now().toISOString(),
      chatEditVerification: renderRequest,
    });
  } catch (error) {
    renderVerification = {
      dispatched: false,
      reason: `dubbing-render-verification-dispatch-failed:${errorMessage(error)}`,
    };
  }
  await deps.store.markCompleted({
    jobId: job._id,
    userId: job.userId,
    result: resultWithPostcondition,
    afterCheckpointId: afterCheckpoint.checkpointId,
    renderVerification,
    now: deps.now(),
  });
  return { ...resultWithPostcondition, renderVerification };
}

async function requireDubbingBeforeCheckpoint(
  job: ChatDubbingJob,
  deps: RunDependencies,
): Promise<Checkpoint> {
  const operationId = requiredCurrentJobField(job.operationId, 'operationId');
  const sessionId = requiredCurrentJobField(job.sessionId, 'sessionId');
  const beforeCheckpointId = requiredCurrentJobField(job.beforeCheckpointId, 'beforeCheckpointId');
  const checkpoint = await deps.checkpointService.getCheckpoint(
    beforeCheckpointId,
    job.userId,
    job.projectId,
  );
  if (
    !checkpoint
    || checkpoint.operationId !== operationId
    || checkpoint.sessionId !== sessionId
    || checkpoint.projectId !== job.projectId
    || checkpoint.userId !== job.userId
  ) {
    throw new TerminalDubbingError(
      'dubbing-before-checkpoint-identity-mismatch',
      'The durable dubbing job is not bound to the originating chat transaction.',
    );
  }
  return checkpoint;
}

async function createDubbingAfterCheckpoint(
  job: ChatDubbingJob,
  afterProject: ProjectLike,
  writerIssuedReceipt: ProjectMutationReceiptV1,
  deps: RunDependencies,
): Promise<Checkpoint> {
  const operationId = requiredCurrentJobField(job.operationId, 'operationId');
  const sessionId = requiredCurrentJobField(job.sessionId, 'sessionId');
  const checkpointId = `ckpt_dub_${createHash('sha256')
    .update(`${job._id}:${operationId}:after`)
    .digest('hex')
    .slice(0, 32)}`;
  const projectState = deps.captureProjectState(afterProject);
  const expectedStateHash = deps.fingerprintProjectState(projectState);
  const existing = await deps.checkpointService.getCheckpoint(
    checkpointId,
    job.userId,
    job.projectId,
  );
  if (existing) {
    if (
      existing.operationId !== operationId
      || existing.sessionId !== sessionId
      || existing.projectId !== job.projectId
      || existing.userId !== job.userId
      || existing.stateHash !== expectedStateHash
    ) {
      throw new TerminalDubbingError(
        'dubbing-after-checkpoint-identity-mismatch',
        'A conflicting post-dubbing checkpoint already exists.',
      );
    }
    return existing;
  }
  const created = await deps.checkpointService.createCheckpoint({
    checkpointId,
    operationId,
    sessionId,
    projectId: job.projectId,
    userId: job.userId,
    overlays: Array.isArray(afterProject.overlays) ? afterProject.overlays as any[] : [],
    projectState,
    description: `After durable selected-dialogue dubbing ${operationId}`,
    type: 'after-llm',
    capturedWriterReceipt: writerIssuedReceipt,
    force: true,
  });
  if (!created) {
    throw new TerminalDubbingError(
      'dubbing-after-checkpoint-not-created',
      'The canonical post-dubbing checkpoint was not created.',
    );
  }
  return created;
}

export class MongoChatDubbingJobStore implements ChatDubbingJobStore {
  async createOrGet(job: ChatDubbingJob) {
    const collection = await jobsCollection();
    const result = await collection.updateOne({ idempotencyKey: job.idempotencyKey }, { $setOnInsert: job }, { upsert: true });
    const stored = await collection.findOne({ idempotencyKey: job.idempotencyKey });
    if (!stored) throw new Error(`Dubbing job ${job._id} disappeared after upsert.`);
    return { created: result.upsertedCount === 1, job: stored };
  }
  async find(jobId: string, userId: string) { return (await jobsCollection()).findOne({ _id: jobId, userId }); }
  async claimDispatch(jobId: string, userId: string, now: Date) {
    const result = await (await jobsCollection()).updateOne(
      { _id: jobId, userId, status: { $in: ['resolved', 'dispatch_failed', 'retry_wait'] } },
      { $set: { status: 'dispatching', updatedAt: now } },
    );
    return result.modifiedCount === 1;
  }
  async markPublished(jobId: string, userId: string, messageId: string | undefined, now: Date) {
    await (await jobsCollection()).updateOne(
      { _id: jobId, userId, status: 'dispatching' },
      { $set: { status: 'queued', dispatchMessageId: messageId ?? null, updatedAt: now } },
    );
  }
  async markDispatchFailed(jobId: string, userId: string, error: string, now: Date) {
    await (await jobsCollection()).updateOne(
      { _id: jobId, userId, status: 'dispatching' },
      { $set: { status: 'dispatch_failed', error, updatedAt: now } },
    );
  }
  async claimRun(jobId: string, userId: string, leaseId: string, now: Date) {
    return (await jobsCollection()).findOneAndUpdate(
      {
        _id: jobId,
        userId,
        failureCount: { $lt: CHAT_DUBBING_MAX_FAILURES },
        $or: [
          { status: 'queued' },
          { status: 'retry_wait' },
          { status: 'dispatch_failed' },
          { status: 'running', leaseExpiresAt: { $lt: now } },
        ],
      },
      {
        $set: { status: 'running', leaseId, leaseExpiresAt: new Date(now.getTime() + JOB_LEASE_MS), updatedAt: now },
        $inc: { runCount: 1 },
      },
      { returnDocument: 'after' },
    );
  }
  async markProgress(jobId: string, userId: string, progress: ChatDubbingProgress, now: Date) {
    await (await jobsCollection()).updateOne(
      { _id: jobId, userId, status: 'running' },
      { $set: { status: 'resolved', progress, updatedAt: now }, $unset: { leaseId: '', leaseExpiresAt: '', error: '' } },
    );
  }
  async markCompleted(completion: ChatDubbingCompletion) {
    const {
      jobId,
      userId,
      result,
      afterCheckpointId,
      renderVerification,
      now,
    } = completion;
    await (await jobsCollection()).updateOne(
      { _id: jobId, userId, status: 'running' },
      {
        $set: {
          status: 'completed',
          result,
          ...(afterCheckpointId ? { afterCheckpointId } : {}),
          ...(renderVerification ? { renderVerification } : {}),
          completedAt: now,
          updatedAt: now,
        },
        $unset: { leaseId: '', leaseExpiresAt: '', error: '' },
      },
    );
  }
  async markRetry(jobId: string, userId: string, error: string, now: Date) {
    await (await jobsCollection()).updateOne(
      { _id: jobId, userId, status: 'running' },
      { $set: { status: 'retry_wait', error, updatedAt: now }, $inc: { failureCount: 1 }, $unset: { leaseId: '', leaseExpiresAt: '' } },
    );
  }
  async markFailed(jobId: string, userId: string, status: 'failed' | 'stale', error: string, now: Date) {
    await (await jobsCollection()).updateOne(
      { _id: jobId, userId },
      { $set: { status, error, completedAt: now, updatedAt: now }, $unset: { leaseId: '', leaseExpiresAt: '' } },
    );
  }
}

async function dispatchExistingJob(job: ChatDubbingJob, deps: QueueDependencies) {
  const claimed = await deps.store.claimDispatch(job._id, job.userId, deps.now());
  if (!claimed) return { status: 'already-queued' as const, jobId: job._id };
  try {
    const published = await deps.publish({ jobId: job._id, projectId: job.projectId, userId: job.userId });
    await deps.store.markPublished(job._id, job.userId, published.messageId, deps.now());
    return { status: 'queued' as const, jobId: job._id, ...(published.messageId ? { messageId: published.messageId } : {}) };
  } catch (error) {
    const message = errorMessage(error);
    await deps.store.markDispatchFailed(job._id, job.userId, message, deps.now());
    return { status: 'failed' as const, jobId: job._id, reason: `dubbing-dispatch-failed:${message}` };
  }
}

async function resolveSharedDependencies(overrides: Partial<SharedDependencies>): Promise<SharedDependencies> {
  const buildCheckpointId = overrides.buildCheckpointId ?? (
    await import('@/lib/editron/agent/chat-ai-edit-transaction-runtime')
  ).buildChatEditCheckpointId;
  return {
    store: overrides.store ?? new MongoChatDubbingJobStore(),
    loadProject: overrides.loadProject ?? (async (userId, projectId) => {
      const { projectService } = await import('@/lib/editron/services/project-service');
      return projectService.loadProject(userId, projectId) as Promise<ProjectLike | null>;
    }),
    buildProjectRevision: overrides.buildProjectRevision ?? buildChatProjectRevision,
    buildCheckpointId,
    now: overrides.now ?? (() => new Date()),
  };
}

async function resolveQueueDependencies(overrides: Partial<QueueDependencies>): Promise<QueueDependencies> {
  return { ...(await resolveSharedDependencies(overrides)), publish: overrides.publish ?? publishChatDubbingJob };
}

async function resolveRunDependencies(overrides: Partial<RunDependencies>): Promise<RunDependencies> {
  const queue = await resolveQueueDependencies(overrides);
  const provider = !overrides.execute || !overrides.cleanup
    ? await import('@/lib/editron/services/chat-dubbing-provider')
    : null;
  const checkpointModule = !overrides.checkpointService
    || !overrides.captureProjectState
    || !overrides.fingerprintProjectState
    ? await import('@/lib/editron/services/checkpoint-service')
    : null;
  const transactionModule = !overrides.buildRenderVerificationRequest
    ? await import('@/lib/editron/agent/chat-ai-edit-transaction-runtime')
    : null;
  const renderedEvidenceModule = !overrides.dispatchRenderEvidence
    ? await import('@/lib/editron/services/phase0-rendered-evidence-worker')
    : null;
  const postconditionModule = !overrides.verifyPostcondition
    ? await import('@/lib/editron/agent/chat-edit-postconditions')
    : null;
  const captureMutationReceipts = overrides.captureMutationReceipts
    ?? (overrides.execute
      ? captureInjectedDubbingExecutionWithoutWriterReceipts
      : await resolveProjectMutationReceiptCapture());
  return {
    ...queue,
    execute: overrides.execute ?? provider!.executeChatDubbingStep,
    captureMutationReceipts,
    cleanup: overrides.cleanup ?? provider!.cleanupChatDubbingAssets,
    checkpointService: overrides.checkpointService ?? checkpointModule!.checkpointService,
    captureProjectState: overrides.captureProjectState ?? checkpointModule!.captureRestorableProjectState,
    fingerprintProjectState:
      overrides.fingerprintProjectState ?? checkpointModule!.projectStateFingerprint,
    buildRenderVerificationRequest:
      overrides.buildRenderVerificationRequest ?? transactionModule!.buildChatEditRenderVerificationRequest,
    dispatchRenderEvidence:
      overrides.dispatchRenderEvidence ?? renderedEvidenceModule!.dispatchPhase0RenderedEvidenceJob,
    verifyPostcondition:
      overrides.verifyPostcondition ?? postconditionModule!.verifyChatToolPostcondition,
  };
}

async function resolveProjectMutationReceiptCapture(): Promise<ProjectMutationReceiptCapture> {
  const { projectService } = await import('@/lib/editron/services/project-service');
  return projectService.captureMutationReceipts.bind(projectService);
}

async function captureInjectedDubbingExecutionWithoutWriterReceipts<T>(
  callback: () => Promise<T> | T,
): Promise<{ value: T; receipts: ProjectMutationReceiptV1[] }> {
  return { value: await callback(), receipts: [] };
}

async function publishChatDubbingJob(payload: { jobId: string; projectId: string; userId: string }) {
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error('QSTASH_TOKEN is required for durable chat dubbing.');
  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const client = new Client({ token, baseUrl: process.env.QSTASH_URL || undefined });
  const result = await client.publishJSON({
    url: `${baseUrl}/api/internal/workers/chat-dubbing`,
    body: payload,
    retries: 3,
    headers: { 'Upstash-Timeout': '280s' },
  });
  return { messageId: (result as { messageId?: string }).messageId };
}

async function jobsCollection() {
  const { COLLECTIONS, getDatabase } = await import('@/lib/editron/db/mongodb');
  return (await getDatabase()).collection<ChatDubbingJob>(COLLECTIONS.CHAT_DUBBING_JOBS);
}

export function resolveChatDubbingSpeechCapability(
  job: Pick<ChatDubbingJob, 'targetLanguage' | 'voiceId' | 'speechCapability'>,
): SpeechSynthesisCapability {
  const resolved = requireSpeechSynthesisCapability(job.targetLanguage, job.voiceId);
  if (job.speechCapability && !sameSpeechCapability(job.speechCapability, resolved)) {
    throw new TerminalDubbingError(
      'dubbing-capability-mismatch',
      'The persisted dubbing language/provider/voice contract no longer matches the executable speech capability.',
    );
  }
  return job.speechCapability ?? resolved;
}

function requireSpeechSynthesisCapability(
  targetLanguage: unknown,
  voiceId?: string | null,
): SpeechSynthesisCapability {
  const capability = resolveSpeechSynthesisCapability(targetLanguage, cleanString(voiceId));
  if (capability) return capability;
  const supported = listSupportedSpeechLanguages().map((item) => item.displayName).join(', ');
  throw new TerminalDubbingError(
    'unsupported-target-language',
    `No licensed dubbing capability matches the requested language/voice. Supported languages: ${supported}.`,
  );
}

function sameSpeechCapability(left: SpeechSynthesisCapability, right: SpeechSynthesisCapability): boolean {
  return left.language === right.language
    && left.provider === right.provider
    && left.model === right.model
    && left.voiceId === right.voiceId
    && left.fallback?.provider === right.fallback?.provider
    && left.fallback?.model === right.fallback?.model
    && left.fallback?.voiceId === right.fallback?.voiceId;
}

function sameContract(left: ChatDubbingJob, right: ChatDubbingJob) {
  return left.version === right.version
    && left.idempotencyKey === right.idempotencyKey
    && left.sessionId === right.sessionId
    && left.operationId === right.operationId
    && left.beforeCheckpointId === right.beforeCheckpointId
    && left.projectRevision === right.projectRevision
    && left.overlayId === right.overlayId
    && left.assetId === right.assetId
    && left.targetLanguage === right.targetLanguage
    && Boolean(left.speechCapability) === Boolean(right.speechCapability)
    && (!left.speechCapability || !right.speechCapability || sameSpeechCapability(left.speechCapability, right.speechCapability));
}

function projectFromCheckpoint(checkpoint: Checkpoint): ProjectLike {
  if (!checkpoint.projectState) {
    return { overlays: (checkpoint.overlays ?? []) as unknown as Array<Record<string, unknown>> };
  }
  return Object.fromEntries(
    checkpoint.projectState.presentFields.map((field) => [
      field,
      checkpoint.projectState?.fields[field],
    ]),
  ) as ProjectLike;
}

function writerIssuedReceiptFromDubbingResult(
  result: Record<string, unknown>,
  projectId: string,
): ProjectMutationReceiptV1 | undefined {
  const receipt = result.projectMutationReceipt;
  if (!receipt || typeof receipt !== 'object') return undefined;
  const candidate = receipt as Partial<ProjectMutationReceiptV1>;
  const revision = candidate.revision;
  if (
    candidate.schemaVersion !== 1
    || candidate.projectId !== projectId
    || !revision
    || revision.schemaVersion !== 1
    || !Number.isSafeInteger(revision.value)
    || revision.value < 0
    || typeof revision.compatibilityUpdatedAt !== 'string'
    || Number.isNaN(new Date(revision.compatibilityUpdatedAt).getTime())
    || typeof candidate.committedAt !== 'string'
    || Number.isNaN(new Date(candidate.committedAt).getTime())
  ) {
    return undefined;
  }
  return candidate as ProjectMutationReceiptV1;
}

function latestWriterReceiptForProject(
  receipts: readonly ProjectMutationReceiptV1[],
  projectId: string,
): ProjectMutationReceiptV1 | undefined {
  for (let index = receipts.length - 1; index >= 0; index -= 1) {
    const receipt = receipts[index];
    if (receipt?.projectId === projectId) return receipt;
  }
  return undefined;
}

function reconcileDubbingWriterReceipt(
  capturedReceipt: ProjectMutationReceiptV1 | undefined,
  returnedReceipt: ProjectMutationReceiptV1 | undefined,
): ProjectMutationReceiptV1 | undefined {
  if (capturedReceipt && returnedReceipt && (
    capturedReceipt.projectId !== returnedReceipt.projectId
    || capturedReceipt.revision.value !== returnedReceipt.revision.value
    || capturedReceipt.revision.compatibilityUpdatedAt !== returnedReceipt.revision.compatibilityUpdatedAt
    || capturedReceipt.committedAt !== returnedReceipt.committedAt
  )) {
    throw new TerminalDubbingError(
      'dubbing-writer-receipt-mismatch',
      'The provider receipt does not match the ProjectService-issued mutation receipt.',
    );
  }
  return capturedReceipt ?? returnedReceipt;
}

function dubbingRollbackReceiptId(job: ChatDubbingJob): string {
  return `chat-dubbing:${job._id}:run:${job.runCount}`;
}

async function markDubbingWriterReceiptMissing(
  beforeCheckpoint: Checkpoint,
  job: ChatDubbingJob,
  operationId: string,
  cause: string,
  deps: RunDependencies,
): Promise<string> {
  const failure = cause.startsWith('dubbing-writer-receipt-missing:')
    ? cause
    : `dubbing-writer-receipt-missing:${cause}`;
  try {
    await deps.checkpointService.updateChatEditOperationScoped(
      beforeCheckpoint.checkpointId,
      job.userId,
      job.projectId,
      operationId,
      {
        operationStatus: 'failed',
        mutatingToolNames: ['dub_selected_dialogue'],
        operationError: `rollback-not-attempted:writer-issued-receipt-missing:${cause}`,
      },
    );
  } catch (error) {
    return `${failure}:operation-status-update-failed:${errorMessage(error)}`;
  }
  return failure;
}

function requiredCurrentJobField(value: unknown, field: string): string {
  return requiredIdentifier(value, `current dubbing job ${field}`);
}

function isRetryableDubbingError(error: unknown) {
  if (error instanceof TerminalDubbingError) return false;
  const status = Number((error as { status?: unknown; statusCode?: unknown })?.status ?? (error as { statusCode?: unknown })?.statusCode);
  if ([408, 425, 429].includes(status) || status >= 500) return true;
  return /timeout|timed out|econnreset|etimedout|socket|stream.*closed|service unavailable|temporar|rate.?limit/i.test(errorMessage(error));
}

async function safeCleanup(deps: RunDependencies, job: ChatDubbingJob) {
  try { await deps.cleanup(job); } catch (error) { console.error('[ChatDubbing] cleanup failed', errorMessage(error)); }
}

function requiredIdentifier(value: unknown, label: string): string {
  const identifier = cleanString(value);
  if (!identifier || !/^[A-Za-z0-9:_-]{1,200}$/.test(identifier)) throw new TerminalDubbingError('invalid-identifier', `${label} is invalid.`);
  return identifier;
}
function cleanString(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function positiveFinite(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new TerminalDubbingError('invalid-number', `${label} must be positive.`);
  return number;
}
function nonNegativeInteger(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new TerminalDubbingError('invalid-frame', `${label} must be non-negative.`);
  return Math.round(number);
}
function positiveInteger(value: unknown, label: string) {
  const number = nonNegativeInteger(value, label);
  if (number <= 0) throw new TerminalDubbingError('invalid-frame', `${label} must be greater than zero.`);
  return number;
}
function errorMessage(error: unknown) { return (error instanceof Error ? error.message : String(error)).slice(0, 700); }
