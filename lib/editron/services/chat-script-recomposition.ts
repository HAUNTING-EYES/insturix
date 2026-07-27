import type { EditorialPreferences } from '@/lib/editron/production-brief/editorial-preferences';

export const CHAT_SCRIPT_RECOMPOSITION_VERSION = 'chat-script-recomposition-v1' as const;
export const CHAT_SCRIPT_MAX_CHARS = 12_000;

export interface QueueChatScriptRecompositionInput {
  projectId: string;
  userId: string;
  intentId: string;
  script: string;
  goal: string;
  editorialPreferences?: EditorialPreferences;
}

export interface QueueChatScriptRecompositionResult {
  status: 'queued' | 'already-queued' | 'failed';
  messageId?: string;
  reason?: string;
  uploadBatchId?: string;
}

interface ScriptRecompositionProject {
  projectId: string;
  userId: string;
  orgId?: string | null;
  sourceUploadBatchId?: string | null;
  directorLock?: boolean;
}

interface ScriptRecompositionBatch {
  uploadBatchId: string;
  userId: string;
  projectId?: string | null;
  orgId?: string | null;
  lastChatScriptIntentId?: string | null;
  orchestrationLeaseUntil?: Date | string | null;
  orchestrationMessageId?: string | null;
}

export interface ChatScriptRecompositionDependencies {
  loadProject(projectId: string, userId: string): Promise<ScriptRecompositionProject | null>;
  loadBatch(uploadBatchId: string, userId: string, projectId: string): Promise<ScriptRecompositionBatch | null>;
  claimBatch(args: {
    uploadBatchId: string;
    userId: string;
    projectId: string;
    intentId: string;
    script: string;
    goal: string;
    editorialPreferences?: EditorialPreferences;
    now: Date;
  }): Promise<boolean>;
  markPublished(args: {
    uploadBatchId: string;
    userId: string;
    projectId: string;
    intentId: string;
    messageId?: string;
    now: Date;
  }): Promise<void>;
  markDispatchFailed(args: {
    uploadBatchId: string;
    userId: string;
    projectId: string;
    intentId: string;
    error: string;
    now: Date;
  }): Promise<void>;
  publish(args: {
    uploadBatchId: string;
    userId: string;
    orgId?: string | null;
    intentId: string;
  }): Promise<{ messageId?: string }>;
  now(): Date;
}

export async function queueChatScriptRecomposition(
  input: QueueChatScriptRecompositionInput,
  overrides?: Partial<ChatScriptRecompositionDependencies>,
): Promise<QueueChatScriptRecompositionResult> {
  const script = input.script.trim();
  if (!script) return { status: 'failed', reason: 'script-is-empty' };
  if (script.length > CHAT_SCRIPT_MAX_CHARS) {
    return { status: 'failed', reason: `script-exceeds-${CHAT_SCRIPT_MAX_CHARS}-character-limit` };
  }

  const deps = await resolveDependencies(overrides);
  const now = deps.now();
  const project = await deps.loadProject(input.projectId, input.userId);
  if (!project) return { status: 'failed', reason: 'project-not-found-or-not-owned' };
  if (project.directorLock) return { status: 'failed', reason: 'director-is-already-editing-project' };

  const uploadBatchId = cleanId(project.sourceUploadBatchId);
  if (!uploadBatchId) {
    return { status: 'failed', reason: 'project-has-no-source-upload-batch' };
  }
  const batch = await deps.loadBatch(uploadBatchId, input.userId, input.projectId);
  if (!batch) return { status: 'failed', reason: 'source-upload-batch-not-found' };

  if (batch.lastChatScriptIntentId === input.intentId) {
    return {
      status: 'already-queued',
      uploadBatchId,
      ...(cleanId(batch.orchestrationMessageId) ? { messageId: cleanId(batch.orchestrationMessageId) } : {}),
    };
  }
  if (isActiveLease(batch.orchestrationLeaseUntil, now)) {
    return { status: 'failed', reason: 'batch-recomposition-already-in-progress', uploadBatchId };
  }

  const claimed = await deps.claimBatch({
    uploadBatchId,
    userId: input.userId,
    projectId: input.projectId,
    intentId: input.intentId,
    script,
    goal: input.goal.trim(),
    editorialPreferences: input.editorialPreferences,
    now,
  });
  if (!claimed) {
    const current = await deps.loadBatch(uploadBatchId, input.userId, input.projectId);
    if (current?.lastChatScriptIntentId === input.intentId) {
      return {
        status: 'already-queued',
        uploadBatchId,
        ...(cleanId(current.orchestrationMessageId) ? { messageId: cleanId(current.orchestrationMessageId) } : {}),
      };
    }
    return { status: 'failed', reason: 'batch-recomposition-claim-conflict', uploadBatchId };
  }

  try {
    const published = await deps.publish({
      uploadBatchId,
      userId: input.userId,
      orgId: batch.orgId ?? project.orgId ?? null,
      intentId: input.intentId,
    });
    await deps.markPublished({
      uploadBatchId,
      userId: input.userId,
      projectId: input.projectId,
      intentId: input.intentId,
      messageId: published.messageId,
      now: deps.now(),
    });
    return {
      status: 'queued',
      uploadBatchId,
      ...(published.messageId ? { messageId: published.messageId } : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deps.markDispatchFailed({
      uploadBatchId,
      userId: input.userId,
      projectId: input.projectId,
      intentId: input.intentId,
      error: message,
      now: deps.now(),
    });
    return { status: 'failed', reason: `phase2-dispatch-failed:${message}`, uploadBatchId };
  }
}

async function resolveDependencies(
  overrides?: Partial<ChatScriptRecompositionDependencies>,
): Promise<ChatScriptRecompositionDependencies> {
  let loadProject = overrides?.loadProject;
  let loadBatch = overrides?.loadBatch;
  let claimBatch = overrides?.claimBatch;
  let markPublished = overrides?.markPublished;
  let markDispatchFailed = overrides?.markDispatchFailed;

  if (!loadProject || !loadBatch || !claimBatch || !markPublished || !markDispatchFailed) {
    const { getDatabase } = await import('@/lib/editron/db/mongodb');
    const database = await getDatabase();
    loadProject ??= async (projectId, userId) => database.collection('projects').findOne(
      { projectId, userId },
      { projection: { _id: 0, projectId: 1, userId: 1, orgId: 1, sourceUploadBatchId: 1, directorLock: 1 } },
    ) as Promise<ScriptRecompositionProject | null>;
    loadBatch ??= async (uploadBatchId, userId, projectId) => database.collection('mediaUploadBatches').findOne(
      { uploadBatchId, userId, projectId },
      { projection: { _id: 0, uploadBatchId: 1, userId: 1, projectId: 1, orgId: 1, lastChatScriptIntentId: 1, orchestrationLeaseUntil: 1, orchestrationMessageId: 1 } },
    ) as Promise<ScriptRecompositionBatch | null>;
    claimBatch ??= async (args) => {
      const preferenceSet = args.editorialPreferences
        ? { 'productionBriefIntake.editorialPreferences': args.editorialPreferences }
        : {};
      const result = await database.collection('mediaUploadBatches').updateOne(
        {
          uploadBatchId: args.uploadBatchId,
          userId: args.userId,
          projectId: args.projectId,
          lastChatScriptIntentId: { $ne: args.intentId },
          $or: [
            { orchestrationLeaseUntil: { $exists: false } },
            { orchestrationLeaseUntil: null },
            { orchestrationLeaseUntil: { $lte: args.now } },
          ],
        },
        {
          $set: {
            'productionBriefIntake.script': args.script,
            'productionBriefIntake.userIntent': args.goal,
            ...preferenceSet,
            orchestrationStatus: 'requested',
            orchestrationRequestedAt: args.now,
            orchestrationAttempt: 0,
            lastChatScriptIntentId: args.intentId,
            chatScriptRecompositionQueuedAt: args.now,
            updatedAt: args.now,
          },
          $unset: {
            orchestrationLeaseUntil: '',
            orchestrationRecoveryLeaseUntil: '',
            orchestrationRecoveryClaimedAt: '',
            orchestrationError: '',
            orchestrationRecoveryError: '',
            directorFailure: '',
            directorMessageId: '',
          },
        },
      );
      return result.matchedCount === 1;
    };
    markPublished ??= async (args) => {
      await database.collection('mediaUploadBatches').updateOne(
        {
          uploadBatchId: args.uploadBatchId,
          userId: args.userId,
          projectId: args.projectId,
          lastChatScriptIntentId: args.intentId,
        },
        {
          $set: {
            orchestrationLastDispatchedAt: args.now,
            ...(args.messageId ? { orchestrationMessageId: args.messageId } : {}),
            updatedAt: args.now,
          },
        },
      );
    };
    markDispatchFailed ??= async (args) => {
      await database.collection('mediaUploadBatches').updateOne(
        {
          uploadBatchId: args.uploadBatchId,
          userId: args.userId,
          projectId: args.projectId,
          lastChatScriptIntentId: args.intentId,
        },
        {
          $set: {
            orchestrationStatus: 'retryable_error',
            orchestrationError: args.error.slice(0, 1_000),
            updatedAt: args.now,
          },
          $unset: {
            orchestrationLeaseUntil: '',
            orchestrationMessageId: '',
            lastChatScriptIntentId: '',
          },
        },
      );
    };
  }

  return {
    loadProject,
    loadBatch,
    claimBatch,
    markPublished,
    markDispatchFailed,
    publish: overrides?.publish ?? defaultPublish,
    now: overrides?.now ?? (() => new Date()),
  };
}

async function defaultPublish(args: {
  uploadBatchId: string;
  userId: string;
  orgId?: string | null;
  intentId: string;
}): Promise<{ messageId?: string }> {
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error('QSTASH_TOKEN is required for durable script recomposition');
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : cleanBaseUrl(process.env.NEXT_PUBLIC_APP_URL);
  if (!baseUrl) throw new Error('NEXT_PUBLIC_APP_URL or VERCEL_URL is required for durable script recomposition');
  const target = `${baseUrl}/api/services/editron/auto-edit/from-batch`;
  const { Client } = await import('@upstash/qstash');
  const qstash = new Client({ token, baseUrl: process.env.QSTASH_URL || undefined });
  const result = await qstash.publishJSON({
    url: target,
    body: {
      uploadBatchId: args.uploadBatchId,
      _orchestration: {
        userId: args.userId,
        orgId: args.orgId ?? null,
        pollAttempt: 0,
        failureCount: 0,
      },
    },
    retries: 2,
    timeout: 300,
    deduplicationId: `editron-chat-script-${args.intentId}`,
    label: 'editron-chat-script-recomposition',
  });
  const messageId = (result as { messageId?: unknown })?.messageId;
  return typeof messageId === 'string' ? { messageId } : {};
}

function isActiveLease(value: Date | string | null | undefined, now: Date): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

function cleanId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim();
  return cleaned || undefined;
}

function cleanBaseUrl(value: unknown): string | undefined {
  const cleaned = cleanId(value);
  return cleaned?.replace(/\/$/, '');
}
