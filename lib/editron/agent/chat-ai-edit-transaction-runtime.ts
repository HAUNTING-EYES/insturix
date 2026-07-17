import { createHash } from 'crypto';

import {
  captureRestorableProjectState,
  checkpointService,
  type ChatEditOperationStatus,
  type Checkpoint,
  type CheckpointInput,
  type ChatEditOperationUpdate,
  type RestoreProjectCheckpointResult,
} from '@/lib/editron/services/checkpoint-service';

import { getChatToolMetadata } from './chat-tool-registry';

export interface ChatAiToolCall {
  id?: string;
  name: string;
}

export interface ChatAiToolResult {
  toolCallId?: string;
  toolName: string;
  result: unknown;
}

interface ChatEditCheckpointStore {
  claimChatEditOperation(input: CheckpointInput & {
    checkpointId: string;
    operationId: string;
    projectState: ReturnType<typeof captureRestorableProjectState>;
  }): Promise<{ claimed: boolean; checkpoint: Checkpoint }>;
  createCheckpoint(input: CheckpointInput): Promise<Checkpoint | null>;
  updateChatEditOperation(
    checkpointId: string,
    userId: string,
    operationId: string,
    update: ChatEditOperationUpdate,
  ): Promise<void>;
  restoreProjectCheckpoint(checkpointId: string, userId: string): Promise<RestoreProjectCheckpointResult>;
}

type LoadProject = (
  userId: string,
  projectId: string,
) => Promise<(Record<string, unknown> & { overlays?: unknown[] }) | null | undefined>;

export interface ChatAiEditTransaction {
  operationId: string;
  sessionId: string;
  projectId: string;
  userId: string;
  beforeCheckpointId: string;
}

export interface PrepareChatAiEditTransactionResult {
  status: 'ready' | 'duplicate';
  transaction?: ChatAiEditTransaction;
  operationStatus?: ChatEditOperationStatus;
  beforeCheckpointId: string;
  afterCheckpointId?: string;
  message: string;
}

export interface ChatAiEditTransactionSummary {
  status: 'not-needed' | 'created' | 'rolled-back' | 'failed';
  operationId: string;
  mutatingToolNames: string[];
  failedToolNames: string[];
  checkpointIds: string[];
  beforeCheckpointId: string;
  afterCheckpointId?: string;
  error?: string;
}

interface RuntimeDependencies {
  checkpointStore?: ChatEditCheckpointStore;
  loadProject?: LoadProject;
}

export async function prepareChatAiEditTransaction(
  input: {
    operationId: string;
    sessionId: string;
    projectId: string;
    userId: string;
    project: Record<string, unknown>;
  },
  dependencies: RuntimeDependencies = {},
): Promise<PrepareChatAiEditTransactionResult> {
  assertOperationId(input.operationId);
  const checkpointStore = dependencies.checkpointStore ?? checkpointService;
  const beforeCheckpointId = checkpointIdFor(input, 'before');
  const projectState = captureRestorableProjectState(input.project);
  const claim = await checkpointStore.claimChatEditOperation({
    checkpointId: beforeCheckpointId,
    operationId: input.operationId,
    operationStatus: 'running',
    sessionId: input.sessionId,
    projectId: input.projectId,
    userId: input.userId,
    overlays: Array.isArray(input.project.overlays) ? input.project.overlays as any[] : [],
    projectState,
    description: `Before AI chat edit ${input.operationId}`,
    type: 'before-llm',
    force: true,
  });

  if (!claim.claimed) {
    return {
      status: 'duplicate',
      operationStatus: claim.checkpoint.operationStatus ?? 'running',
      beforeCheckpointId,
      afterCheckpointId: claim.checkpoint.afterCheckpointId,
      message: `Operation ${input.operationId} has already been claimed and will not execute again.`,
    };
  }

  return {
    status: 'ready',
    beforeCheckpointId,
    transaction: {
      operationId: input.operationId,
      sessionId: input.sessionId,
      projectId: input.projectId,
      userId: input.userId,
      beforeCheckpointId,
    },
    message: 'Durable pre-mutation checkpoint created.',
  };
}

export async function completeChatAiEditTransaction(
  input: {
    transaction: ChatAiEditTransaction;
    toolCalls: ChatAiToolCall[];
    toolResults: ChatAiToolResult[];
  },
  dependencies: RuntimeDependencies = {},
): Promise<ChatAiEditTransactionSummary> {
  const services = await resolveServices(dependencies);
  const batch = classifyMutatingBatch(input.toolCalls, input.toolResults);

  if (batch.attemptedToolNames.length === 0 || batch.successfulToolNames.length === 0 && batch.failedToolNames.length === 0) {
    await services.checkpointStore.updateChatEditOperation(
      input.transaction.beforeCheckpointId,
      input.transaction.userId,
      input.transaction.operationId,
      { operationStatus: 'no-op', mutatingToolNames: [] },
    );
    return summary(input.transaction, 'not-needed', [], [], undefined);
  }

  if (batch.failedToolNames.length > 0) {
    return rollbackChatAiEditTransaction({
      transaction: input.transaction,
      mutatingToolNames: batch.attemptedToolNames,
      failedToolNames: batch.failedToolNames,
      reason: `Mutating tool batch failed: ${batch.failedToolNames.join(', ')}`,
    }, dependencies);
  }

  try {
    const project = await services.loadProject(input.transaction.userId, input.transaction.projectId);
    if (!project) throw new Error('Project could not be loaded after AI edit execution.');
    const afterCheckpointId = checkpointIdFor(input.transaction, 'after');
    const afterCheckpoint = await services.checkpointStore.createCheckpoint({
      checkpointId: afterCheckpointId,
      operationId: input.transaction.operationId,
      sessionId: input.transaction.sessionId,
      projectId: input.transaction.projectId,
      userId: input.transaction.userId,
      overlays: Array.isArray(project.overlays) ? project.overlays as any[] : [],
      projectState: captureRestorableProjectState(project),
      description: `After AI chat edit: ${batch.successfulToolNames.join(', ')}`,
      type: 'after-llm',
      force: true,
    });
    if (!afterCheckpoint) throw new Error('Durable post-mutation checkpoint was not created.');

    await services.checkpointStore.updateChatEditOperation(
      input.transaction.beforeCheckpointId,
      input.transaction.userId,
      input.transaction.operationId,
      {
        operationStatus: 'completed',
        mutatingToolNames: batch.successfulToolNames,
        afterCheckpointId: afterCheckpoint.checkpointId,
      },
    );
    return summary(
      input.transaction,
      'created',
      batch.successfulToolNames,
      [],
      afterCheckpoint.checkpointId,
    );
  } catch (error: unknown) {
    return rollbackChatAiEditTransaction({
      transaction: input.transaction,
      mutatingToolNames: batch.successfulToolNames,
      failedToolNames: [],
      reason: error instanceof Error ? error.message : 'AI edit transaction finalization failed.',
    }, dependencies);
  }
}

export async function rollbackChatAiEditTransaction(
  input: {
    transaction: ChatAiEditTransaction;
    mutatingToolNames?: string[];
    failedToolNames?: string[];
    reason: string;
  },
  dependencies: RuntimeDependencies = {},
): Promise<ChatAiEditTransactionSummary> {
  const services = await resolveServices(dependencies);
  const restore = await services.checkpointStore.restoreProjectCheckpoint(
    input.transaction.beforeCheckpointId,
    input.transaction.userId,
  );
  const mutatingToolNames = input.mutatingToolNames ?? [];
  const failedToolNames = input.failedToolNames ?? [];

  if (!restore.restored) {
    const error = `Rollback failed (${restore.reason ?? 'unknown'}): ${input.reason}`;
    await services.checkpointStore.updateChatEditOperation(
      input.transaction.beforeCheckpointId,
      input.transaction.userId,
      input.transaction.operationId,
      { operationStatus: 'failed', mutatingToolNames, operationError: error },
    );
    return summary(input.transaction, 'failed', mutatingToolNames, failedToolNames, undefined, error);
  }

  await services.checkpointStore.updateChatEditOperation(
    input.transaction.beforeCheckpointId,
    input.transaction.userId,
    input.transaction.operationId,
    { operationStatus: 'rolled-back', mutatingToolNames, operationError: input.reason },
  );
  return summary(input.transaction, 'rolled-back', mutatingToolNames, failedToolNames, undefined, input.reason);
}

function classifyMutatingBatch(toolCalls: ChatAiToolCall[], toolResults: ChatAiToolResult[]) {
  const attempted = toolCalls.filter((call) => getChatToolMetadata(call.name)?.mutatesProject === true);
  const inferred = attempted.length > 0
    ? attempted
    : toolResults
      .filter((result) => getChatToolMetadata(result.toolName)?.mutatesProject === true)
      .map((result) => ({ id: result.toolCallId, name: result.toolName }));
  const usedResults = new Set<number>();
  const successfulToolNames: string[] = [];
  const failedToolNames: string[] = [];

  for (const call of inferred) {
    const resultIndex = toolResults.findIndex((result, index) =>
      !usedResults.has(index)
      && (call.id ? result.toolCallId === call.id : result.toolName === call.name),
    );
    if (resultIndex < 0) {
      failedToolNames.push(call.name);
      continue;
    }
    usedResults.add(resultIndex);
    const outcome = toolOutcome(toolResults[resultIndex].result);
    if (outcome === 'success') successfulToolNames.push(call.name);
    if (outcome === 'failed') failedToolNames.push(call.name);
  }

  return {
    attemptedToolNames: unique(inferred.map((call) => call.name)),
    successfulToolNames: unique(successfulToolNames),
    failedToolNames: unique(failedToolNames),
  };
}

function toolOutcome(result: unknown): 'success' | 'advisory' | 'failed' {
  const parsed = parseToolResult(result);
  if (!parsed) return 'failed';
  if (parsed.status === 'error' || parsed.error) return 'failed';
  if (parsed.status === 'advisory') return 'advisory';
  return parsed.status === 'success' ? 'success' : 'failed';
}

function parseToolResult(result: unknown): Record<string, unknown> | null {
  if (result && typeof result === 'object') return result as Record<string, unknown>;
  if (typeof result !== 'string') return null;
  try {
    return JSON.parse(result) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function resolveServices(dependencies: RuntimeDependencies) {
  const checkpointStore = dependencies.checkpointStore ?? checkpointService;
  if (dependencies.loadProject) return { checkpointStore, loadProject: dependencies.loadProject };
  const { projectService } = await import('@/lib/editron/services/project-service');
  return { checkpointStore, loadProject: projectService.loadProject.bind(projectService) as LoadProject };
}

function checkpointIdFor(
  input: Pick<ChatAiEditTransaction, 'operationId' | 'sessionId' | 'projectId' | 'userId'>,
  position: 'before' | 'after',
): string {
  const digest = createHash('sha256')
    .update(`${input.userId}:${input.projectId}:${input.sessionId}:${input.operationId}:${position}`)
    .digest('hex')
    .slice(0, 28);
  return `ckpt_chat_${position}_${digest}`;
}

function assertOperationId(operationId: string): void {
  if (!/^[A-Za-z0-9:_-]{8,128}$/.test(operationId)) {
    throw new Error('A valid 8-128 character chat edit operationId is required before execution.');
  }
}

function summary(
  transaction: ChatAiEditTransaction,
  status: ChatAiEditTransactionSummary['status'],
  mutatingToolNames: string[],
  failedToolNames: string[],
  afterCheckpointId?: string,
  error?: string,
): ChatAiEditTransactionSummary {
  return {
    status,
    operationId: transaction.operationId,
    mutatingToolNames,
    failedToolNames,
    checkpointIds: afterCheckpointId
      ? [transaction.beforeCheckpointId, afterCheckpointId]
      : [transaction.beforeCheckpointId],
    beforeCheckpointId: transaction.beforeCheckpointId,
    afterCheckpointId,
    error,
  };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
