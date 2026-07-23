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
import type {
  ChatEditRenderVerificationModality,
  ChatEditRenderVerificationRequest,
  ChatEditRenderVerificationTarget,
} from '@/lib/editron/services/phase0-rendered-evidence-worker';

import { getChatToolMetadata } from './chat-tool-registry';

export interface ChatAiToolCall {
  id?: string;
  name: string;
  args?: unknown;
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
  recoveredInputToolNames?: string[];
  recoveredPreconditionToolNames?: string[];
  checkpointIds: string[];
  beforeCheckpointId: string;
  afterCheckpointId?: string;
  renderVerification?: ChatEditRenderVerificationRequest;
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
    const renderVerification = batch.successfulCalls.some(requiresImmediateRenderVerification)
      ? buildChatEditRenderVerificationRequest({
          transaction: input.transaction,
          afterCheckpointId: afterCheckpoint.checkpointId,
          project,
          successfulCalls: batch.successfulCalls,
        })
      : undefined;
    return summary(
      input.transaction,
      'created',
      batch.successfulToolNames,
      [],
      afterCheckpoint.checkpointId,
      undefined,
      renderVerification,
      batch.recoveredInputToolNames,
      batch.recoveredPreconditionToolNames,
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
  const classifiedCalls: Array<{
    call: ChatAiToolCall;
    result?: ChatAiToolResult;
    outcome: ReturnType<typeof toolOutcome> | 'missing';
  }> = [];
  const successfulCalls: Array<{ call: ChatAiToolCall; result: ChatAiToolResult }> = [];

  for (const call of inferred) {
    const resultIndex = toolResults.findIndex((result, index) =>
      !usedResults.has(index)
      && (call.id ? result.toolCallId === call.id : result.toolName === call.name),
    );
    if (resultIndex < 0) {
      classifiedCalls.push({ call, outcome: 'missing' });
      continue;
    }
    usedResults.add(resultIndex);
    const matchedResult = toolResults[resultIndex];
    const outcome = toolOutcome(matchedResult.result);
    classifiedCalls.push({ call, result: matchedResult, outcome });
    if (outcome.status === 'success') {
      successfulCalls.push({ call, result: matchedResult });
    }
  }

  const successfulToolNames = classifiedCalls
    .filter((entry) => entry.outcome !== 'missing' && entry.outcome.status === 'success')
    .map((entry) => entry.call.name);
  const recoveredInputToolNames: string[] = [];
  const recoveredPreconditionToolNames: string[] = [];
  const failedToolNames: string[] = [];
  classifiedCalls.forEach((entry, index) => {
    if (entry.outcome === 'missing') {
      failedToolNames.push(entry.call.name);
      return;
    }
    if (entry.outcome.status !== 'failed') return;
    const hasLaterSuccessfulRetry = (
      entry.outcome.failureKind === 'input-validation'
      || entry.outcome.failureKind === 'precondition'
    )
      && classifiedCalls.slice(index + 1).some((candidate) =>
        candidate.call.name === entry.call.name
        && candidate.outcome !== 'missing'
        && candidate.outcome.status === 'success',
      );
    if (hasLaterSuccessfulRetry) {
      if (entry.outcome.failureKind === 'precondition') {
        recoveredPreconditionToolNames.push(entry.call.name);
      } else {
        recoveredInputToolNames.push(entry.call.name);
      }
      return;
    }
    failedToolNames.push(entry.call.name);
  });

  return {
    attemptedToolNames: unique(inferred.map((call) => call.name)),
    successfulToolNames: unique(successfulToolNames),
    failedToolNames: unique(failedToolNames),
    recoveredInputToolNames: unique(recoveredInputToolNames),
    recoveredPreconditionToolNames: unique(recoveredPreconditionToolNames),
    successfulCalls,
  };
}

export function buildChatEditRenderVerificationRequest(input: {
  transaction: ChatAiEditTransaction;
  afterCheckpointId: string;
  project: Record<string, unknown>;
  successfulCalls: Array<{ call: ChatAiToolCall; result: ChatAiToolResult }>;
  requestedAt?: string;
}): ChatEditRenderVerificationRequest {
  const targetsByKey = new Map<string, ChatEditRenderVerificationTarget>();
  const modalitySet = new Set<ChatEditRenderVerificationModality>();

  for (const successful of input.successfulCalls) {
    const receipt = readPassedPostconditionReceipt(successful.result.result);
    if (receipt?.required === false) continue;
    const targets = receipt?.targets ?? [];
    for (const target of targets) {
      targetsByKey.set(`${target.overlayId}:${target.state}`, target);
    }
    for (const modality of inferMutationModalities(successful.call, targets, receipt?.modalities)) {
      modalitySet.add(modality);
    }
  }

  const targets = Array.from(targetsByKey.values());
  if (modalitySet.size === 0) modalitySet.add('visual');
  const durationInFrames = Math.max(1, Math.round(finitePositiveNumber(input.project.durationInFrames) ?? 1));
  const sampleFrames = buildVerificationSampleFrames(targets, durationInFrames);

  return {
    version: 'editron-chat-render-verification-v1',
    operationId: input.transaction.operationId,
    sessionId: input.transaction.sessionId,
    beforeCheckpointId: input.transaction.beforeCheckpointId,
    afterCheckpointId: input.afterCheckpointId,
    requestedAt: input.requestedAt ?? new Date().toISOString(),
    modalities: Array.from(modalitySet),
    targets,
    sampleFrames,
  };
}

function readPassedPostconditionReceipt(result: unknown): {
  targets: ChatEditRenderVerificationTarget[];
  modalities: ChatEditRenderVerificationModality[];
  required: boolean;
} | null {
  const envelope = parseToolResult(result);
  const data = asRecord(envelope?.data);
  const receipt = asRecord(data.postconditionVerification);
  if (receipt.version !== 'editron-chat-postcondition-v1' || receipt.status !== 'pass') return null;

  const targets = Array.isArray(receipt.affectedTargets)
    ? receipt.affectedTargets.flatMap((value) => {
        const target = asRecord(value);
        const state = target.state;
        if (!['created', 'updated', 'deleted'].includes(String(state))) return [];
        const overlayId = String(target.overlayId ?? '').trim();
        if (!overlayId) return [];
        return [{
          overlayId,
          overlayType: String(target.overlayType ?? 'unknown'),
          state: state as ChatEditRenderVerificationTarget['state'],
          from: finiteNumberOrNull(target.from),
          endFrame: finiteNumberOrNull(target.endFrame),
        }];
      })
    : [];
  const renderVerification = asRecord(receipt.renderVerification);
  const modalities = Array.isArray(renderVerification.modalities)
    ? renderVerification.modalities.filter(
        (value): value is ChatEditRenderVerificationModality => value === 'visual' || value === 'audio',
      )
    : [];
  return {
    targets,
    modalities,
    required: renderVerification.required !== false,
  };
}

function requiresImmediateRenderVerification(
  successful: { result: ChatAiToolResult },
): boolean {
  return readPassedPostconditionReceipt(successful.result.result)?.required !== false;
}

function inferMutationModalities(
  call: ChatAiToolCall,
  targets: ChatEditRenderVerificationTarget[],
  declared: ChatEditRenderVerificationModality[] = [],
): ChatEditRenderVerificationModality[] {
  const isTimelineMutation = [
    'split_overlay', 'trim_overlay', 'cut_section', 'close_gaps',
    'auto_edit_from_script', 'apply_editorial_intent',
  ].includes(call.name);

  // A passed postcondition receipt is the family owner's explicit contract.
  // Do not broaden a visual-only video edit into audio verification merely
  // because the target video may contain an audio stream. Timeline mutations
  // remain the exception because they can change picture and sound together.
  if (declared.length > 0 && !isTimelineMutation) {
    return Array.from(new Set(declared));
  }

  const targetTypes = new Set(targets.map((target) => target.overlayType.toLowerCase()));
  const argumentKeys = collectObjectKeys(call.args);
  const hasExplicitAudioArgument = [...argumentKeys].some((key) => [
    'audio', 'volume', 'muted', 'mute', 'startfromsound', 'fadein', 'fadeout',
    'ducking', 'soundoverlayid', 'musicprompt', 'bgm', 'speed',
  ].includes(key));
  const hasExplicitVisualArgument = [...argumentKeys].some((key) => [
    'x', 'y', 'left', 'top', 'width', 'height', 'scale', 'opacity', 'rotation',
    'content', 'text', 'styles', 'fontsize', 'color', 'backgroundcolor', 'keyframes',
  ].includes(key));
  const inferred = new Set<ChatEditRenderVerificationModality>();

  if ([...targetTypes].some((type) => type !== 'audio' && type !== 'sound')) inferred.add('visual');
  if (targetTypes.has('audio') || targetTypes.has('sound')) inferred.add('audio');
  if (targetTypes.has('video')) {
    if (!hasExplicitAudioArgument || hasExplicitVisualArgument) inferred.add('visual');
    if (hasExplicitAudioArgument || isTimelineMutation || !hasExplicitVisualArgument) inferred.add('audio');
  }
  if (targets.length === 0 || isTimelineMutation) {
    for (const modality of declared) inferred.add(modality);
  }
  if (hasExplicitAudioArgument) inferred.add('audio');
  if (hasExplicitVisualArgument) inferred.add('visual');
  return Array.from(inferred);
}

export function buildChatEditRenderVerificationStatusMessage(result: {
  dispatched: boolean;
  reason?: string;
}): string {
  if (result.dispatched) {
    return 'The edit was saved and its state checks passed. I am rendering the affected output now; I am not marking it successful until that verification finishes.';
  }
  const reason = String(result.reason ?? 'render verification is unavailable')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .slice(0, 240);
  return `The edit was saved and its state checks passed, but rendered verification could not start (${reason}). I am not marking this edit as successful.`;
}

function buildVerificationSampleFrames(
  targets: ChatEditRenderVerificationTarget[],
  projectDurationInFrames: number,
): number[] {
  const targetDurationInFrames = targets.reduce((maximum, target) => Math.max(
    maximum,
    target.from == null ? 0 : target.from + 1,
    target.endFrame ?? 0,
  ), 0);
  const durationInFrames = Math.max(1, projectDurationInFrames, targetDurationInFrames);
  const frames: number[] = [];
  for (const target of targets) {
    if (target.from == null) continue;
    const start = clampFrame(target.from, durationInFrames);
    const end = clampFrame(Math.max(start, (target.endFrame ?? start + 1) - 1), durationInFrames);
    const span = end - start + 1;
    if (span <= 2) {
      frames.push(start, end);
      continue;
    }

    // Entrance and exit frames are commonly transparent by design. Sample the
    // interior hold instead so animation boundaries do not become false blanks.
    const inset = Math.max(1, Math.floor(span / 4));
    frames.push(
      Math.min(end, start + inset),
      Math.round((start + end) / 2),
      Math.max(start, end - inset),
    );
  }
  if (frames.length === 0) {
    frames.push(0, Math.floor((durationInFrames - 1) / 2), durationInFrames - 1);
  }
  return Array.from(new Set(frames)).slice(0, 12);
}

function collectObjectKeys(value: unknown, output = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) collectObjectKeys(entry, output);
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    output.add(key.toLowerCase());
    collectObjectKeys(entry, output);
  }
  return output;
}

function toolOutcome(result: unknown): {
  status: 'success' | 'advisory' | 'failed';
  failureKind?: 'input-validation' | 'precondition' | 'execution';
} {
  const parsed = parseToolResult(result);
  if (!parsed) return { status: 'failed', failureKind: 'execution' };
  if (parsed.status === 'error' || parsed.error) {
    const errorCode = String(asRecord(parsed.error).code ?? '');
    return {
      status: 'failed',
      failureKind: isInputValidationFailure(parsed)
        ? 'input-validation'
        : errorCode === 'CHAT_TOOL_EVIDENCE_REQUIRED' || errorCode === 'CHAT_TOOL_EVIDENCE_STALE'
          ? 'precondition'
          : 'execution',
    };
  }
  if (parsed.status === 'advisory') return { status: 'advisory' };
  return parsed.status === 'success'
    ? { status: 'success' }
    : { status: 'failed', failureKind: 'execution' };
}

function isInputValidationFailure(result: Record<string, unknown>): boolean {
  const error = asRecord(result.error);
  return error.code === 'TOOL_INVOKE_EXCEPTION'
    && String(error.message ?? '').startsWith('Received tool input did not match expected schema');
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finiteNumberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finitePositiveNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function clampFrame(frame: number, durationInFrames: number): number {
  return Math.max(0, Math.min(durationInFrames - 1, Math.round(frame)));
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
  renderVerification?: ChatEditRenderVerificationRequest,
  recoveredInputToolNames: string[] = [],
  recoveredPreconditionToolNames: string[] = [],
): ChatAiEditTransactionSummary {
  return {
    status,
    operationId: transaction.operationId,
    mutatingToolNames,
    failedToolNames,
    ...(recoveredInputToolNames.length > 0 ? { recoveredInputToolNames } : {}),
    ...(recoveredPreconditionToolNames.length > 0 ? { recoveredPreconditionToolNames } : {}),
    checkpointIds: afterCheckpointId
      ? [transaction.beforeCheckpointId, afterCheckpointId]
      : [transaction.beforeCheckpointId],
    beforeCheckpointId: transaction.beforeCheckpointId,
    afterCheckpointId,
    renderVerification,
    error,
  };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
