import {
  getChatToolMetadata,
  type ChatToolEffect,
  type ChatToolEvidenceClass,
  type ChatToolExecutionPolicy,
  type ChatToolOwnerClass,
} from './chat-tool-registry';

export const CHAT_TOOL_EVIDENCE_RECEIPT_VERSION = 'editron-chat-evidence-v1' as const;

export type ChatToolExecutionOutcome =
  | 'success'
  | 'advisory'
  | 'validation-error'
  | 'precondition-blocked'
  | 'policy-blocked'
  | 'postcondition-failed'
  | 'execution-error';

export interface ChatToolEvidenceReceipt {
  version: typeof CHAT_TOOL_EVIDENCE_RECEIPT_VERSION;
  evidenceClass: ChatToolEvidenceClass;
  projectId: string;
  projectRevision: string;
  producerTool: string;
  target: {
    scope: 'project' | 'target';
    overlayIds: string[];
    startFrame: number | null;
    endFrame: number | null;
  };
}

export interface CompletedChatToolExecution {
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
  output: string;
  outcome: ChatToolExecutionOutcome;
  evidenceReceipts: ChatToolEvidenceReceipt[];
}

export interface ChatToolTurnLedger {
  requestedToolNames: string[];
  completedExecutions: CompletedChatToolExecution[];
}

export type ChatToolExecutionDecision =
  | { action: 'execute' }
  | { action: 'replay'; output: string; reason: 'identical-call' }
  | { action: 'shadow'; output: string; reason: 'effect-already-satisfied' }
  | {
      action: 'block';
      output: string;
      reason:
        | 'turn-limit'
        | 'target-limit'
        | 'validation-retry-limit'
        | 'owner-conflict'
        | 'missing-evidence'
        | 'stale-evidence';
    };

export function buildChatToolTurnLedger(messages: unknown[]): ChatToolTurnLedger {
  const turnMessages = messages.slice(lastHumanMessageIndex(messages) + 1);
  const callsById = new Map<string, { name: string; args: Record<string, unknown> }>();
  const requestedToolNames: string[] = [];
  const completedExecutions: CompletedChatToolExecution[] = [];

  for (const message of turnMessages) {
    const record = asRecord(message);
    const toolCalls = Array.isArray(record.tool_calls) ? record.tool_calls : [];
    for (const rawCall of toolCalls) {
      const call = asRecord(rawCall);
      const id = String(call.id ?? '');
      const name = String(call.name ?? '');
      if (!id || !name) continue;
      const args = asRecord(call.args);
      callsById.set(id, { name, args });
      requestedToolNames.push(name);
    }

    const toolCallId = String(record.tool_call_id ?? '');
    const matchedCall = callsById.get(toolCallId);
    if (!toolCallId || !matchedCall) continue;
    const output = stringifyToolOutput(record.content);
    completedExecutions.push({
      toolCallId,
      name: matchedCall.name,
      args: matchedCall.args,
      output,
      outcome: classifyChatToolExecutionOutcome(output),
      evidenceReceipts: parseEvidenceReceipts(record.additional_kwargs),
    });
  }

  return { requestedToolNames, completedExecutions };
}

export function decideChatToolExecution(input: {
  toolName: string;
  args: Record<string, unknown>;
  ledger: ChatToolTurnLedger;
  projectId?: string;
  projectRevision?: string | null;
}): ChatToolExecutionDecision {
  const metadata = getChatToolMetadata(input.toolName);
  const policy = metadata?.executionPolicy;

  const blockingOwner = policy?.blockedWhenTurnRequests.find((toolName) =>
    input.ledger.requestedToolNames.includes(toolName),
  );
  if (blockingOwner) {
    return blockedDecision({
      reason: 'owner-conflict',
      code: 'CHAT_TOOL_OWNER_CONFLICT',
      toolName: input.toolName,
      message: `${input.toolName} cannot execute in the same turn as ${blockingOwner}; use one workflow owner.`,
      nextAction: 'Stop the conflicting workflow and continue with exactly one owner.',
    });
  }

  const activeOwner = findActiveOwner(input.ledger.completedExecutions);
  const pendingOwner = metadata?.mutatesProject ? metadata.turnContract.owner : null;
  if (activeOwner && pendingOwner && activeOwner !== pendingOwner) {
    return blockedDecision({
      reason: 'owner-conflict',
      code: 'CHAT_TOOL_OWNER_CONFLICT',
      toolName: input.toolName,
      message: `This turn is already owned by ${activeOwner}; ${pendingOwner} cannot mutate the same turn.`,
      nextAction: 'Finish the active workflow. Start the other edit in a new user turn.',
    });
  }

  const satisfiedEffectDecision = resolveSatisfiedEffectDecision({
    toolName: input.toolName,
    ledger: input.ledger,
  });
  if (satisfiedEffectDecision) return satisfiedEffectDecision;

  const evidenceDecision = enforceEvidenceContract({
    toolName: input.toolName,
    projectId: input.projectId,
    projectRevision: input.projectRevision,
    ledger: input.ledger,
  });
  if (evidenceDecision) return evidenceDecision;

  if (!policy) return { action: 'execute' };

  const sameToolExecutions = input.ledger.completedExecutions.filter(
    (execution) => execution.name === input.toolName,
  );
  const completedOwnerExecutions = sameToolExecutions.filter(isCompletedOwnerExecution);
  const targetKey = policy.cardinality === 'once-per-target'
    ? resolveExecutionTargetKey(policy, input.args)
    : null;
  const scopedExecutions = targetKey === null
    ? completedOwnerExecutions
    : completedOwnerExecutions.filter(
      (execution) => resolveExecutionTargetKey(policy, execution.args) === targetKey,
    );
  const identicalExecution = scopedExecutions.find(
    (execution) => stableStringify(execution.args) === stableStringify(input.args),
  );
  if (
    policy.replayBehavior === 'same-project-revision'
    && identicalExecution
    && isReplaySafeForRevision(identicalExecution, input.projectRevision)
  ) {
    return { action: 'replay', output: identicalExecution.output, reason: 'identical-call' };
  }

  if (policy.cardinality === 'once-per-turn' && completedOwnerExecutions.length >= 1) {
    return blockedDecision({
      reason: 'turn-limit',
      code: 'CHAT_TOOL_TURN_LIMIT',
      toolName: input.toolName,
      message: `${input.toolName} already completed ${completedOwnerExecutions.length} time(s) in this turn.`,
      nextAction: 'Stop repeating this tool and explain the completed result.',
    });
  }

  if (policy.cardinality === 'once-per-target' && scopedExecutions.length >= 1) {
    return blockedDecision({
      reason: 'target-limit',
      code: 'CHAT_TOOL_TARGET_LIMIT',
      toolName: input.toolName,
      message: `${input.toolName} already completed for target ${targetKey ?? 'project'} in this turn.`,
      nextAction: 'Use the completed result, choose a different target, or start a new user turn.',
    });
  }

  const validationFailures = sameToolExecutions.filter(
    (execution) => execution.outcome === 'validation-error',
  ).length;
  if (validationFailures > policy.maxValidationCorrectionsPerTurn) {
    return blockedDecision({
      reason: 'validation-retry-limit',
      code: 'CHAT_TOOL_VALIDATION_RETRY_LIMIT',
      toolName: input.toolName,
      message: `${input.toolName} exhausted its one deterministic schema-correction retry.`,
      nextAction: 'Stop retrying. Explain which fields were invalid and ask for a new user turn.',
    });
  }

  return { action: 'execute' };
}

function resolveSatisfiedEffectDecision(input: {
  toolName: string;
  ledger: ChatToolTurnLedger;
}): Extract<ChatToolExecutionDecision, { action: 'shadow' }> | null {
  const pending = getChatToolMetadata(input.toolName)?.effectContract;
  if (!pending || pending.redundantAfter.length === 0) return null;

  const requiredEffects = new Set<ChatToolEffect>(pending.redundantAfter);
  const producers = input.ledger.completedExecutions.flatMap((execution) => {
    if (execution.outcome !== 'success') return [];
    const produced = getChatToolMetadata(execution.name)?.effectContract.produces ?? [];
    const matchingEffects = produced.filter((effect) => requiredEffects.has(effect));
    return matchingEffects.length > 0
      ? [{ toolName: execution.name, effects: matchingEffects }]
      : [];
  });
  if (producers.length === 0) return null;

  const producerTools = unique(producers.map((producer) => producer.toolName));
  const satisfiedEffects = unique(producers.flatMap((producer) => producer.effects));
  return {
    action: 'shadow',
    reason: 'effect-already-satisfied',
    output: JSON.stringify({
      status: 'advisory',
      data: {
        executionPolicy: {
          code: 'CHAT_TOOL_EFFECT_ALREADY_SATISFIED',
          shadowedTool: input.toolName,
          producerTools,
          satisfiedEffects,
        },
      },
      error: null,
      nextAction: `Do not run ${input.toolName}; the earlier atomic tool already satisfied this effect.`,
    }),
  };
}

export function buildChatEvidenceReceipts(input: {
  toolName: string;
  args: Record<string, unknown>;
  output: string;
  projectId: string;
  projectRevision: string | null;
}): ChatToolEvidenceReceipt[] {
  const metadata = getChatToolMetadata(input.toolName);
  if (
    !metadata
    || metadata.turnContract.producesEvidence.length === 0
    || !input.projectRevision
    || !isCompletedOwnerOutcome(classifyChatToolExecutionOutcome(input.output))
  ) {
    return [];
  }

  const target = resolveEvidenceTarget(input.args, input.output);
  return metadata.turnContract.producesEvidence.map((evidenceClass) => ({
    version: CHAT_TOOL_EVIDENCE_RECEIPT_VERSION,
    evidenceClass,
    projectId: input.projectId,
    projectRevision: input.projectRevision as string,
    producerTool: input.toolName,
    target: evidenceClass === 'project-state'
      ? { scope: 'project', overlayIds: [], startFrame: null, endFrame: null }
      : target,
  }));
}

export function classifyChatToolExecutionOutcome(output: string): ChatToolExecutionOutcome {
  const envelope = parseJsonRecord(output);
  if (!envelope) return /^Error:/i.test(output.trim()) ? 'execution-error' : 'success';

  const status = String(envelope.status ?? '').toLowerCase();
  if (status === 'success') return 'success';
  if (status === 'advisory') {
    const advisoryCode = resolveEnvelopeCode(envelope);
    return advisoryCode?.startsWith('CHAT_TOOL_') ? 'policy-blocked' : 'advisory';
  }
  if (status !== 'error') return 'success';

  const code = resolveEnvelopeCode(envelope);
  if (code === 'CHAT_TOOL_VALIDATION_ERROR') return 'validation-error';
  if (code === 'CHAT_TOOL_EVIDENCE_REQUIRED' || code === 'CHAT_TOOL_EVIDENCE_STALE') {
    return 'precondition-blocked';
  }
  if (code === 'CHAT_EDIT_POSTCONDITION_FAILED') return 'postcondition-failed';
  if (code?.startsWith('CHAT_TOOL_')) return 'policy-blocked';
  return 'execution-error';
}

export function formatChatToolInvocationError(toolName: string, error: unknown): string {
  const record = asRecord(error);
  const cause = asRecord(record.cause);
  const name = String(record.name ?? cause.name ?? '');
  const message = error instanceof Error ? error.message : String(record.message ?? 'Tool execution failed');
  const issues = Array.isArray(record.issues)
    ? record.issues
    : Array.isArray(cause.issues)
      ? cause.issues
      : [];
  const validationFailure = /ToolInputParsingException|ZodError/i.test(name)
    || /did not match expected schema|validation/i.test(message)
    || issues.length > 0;

  return JSON.stringify({
    status: 'error',
    data: null,
    error: {
      code: validationFailure ? 'CHAT_TOOL_VALIDATION_ERROR' : 'CHAT_TOOL_EXECUTION_ERROR',
      message,
      details: {
        toolName,
        ...(validationFailure ? { issues: issues.map(normalizeValidationIssue) } : {}),
      },
    },
    nextAction: validationFailure
      ? 'Correct only the reported fields and retry this tool once. Do not change the user intent.'
      : 'Stop this workflow and explain the execution failure without claiming an edit was made.',
  });
}

function enforceEvidenceContract(input: {
  toolName: string;
  projectId?: string;
  projectRevision?: string | null;
  ledger: ChatToolTurnLedger;
}): ChatToolExecutionDecision | null {
  const contract = getChatToolMetadata(input.toolName)?.turnContract;
  if (!contract || contract.evidenceStrategy !== 'preflight' || contract.requiredEvidence.length === 0) {
    return null;
  }

  const receipts = input.ledger.completedExecutions.flatMap(
    (execution) => execution.evidenceReceipts,
  );
  const projectReceipts = receipts.filter((receipt) => receipt.projectId === input.projectId);
  const validReceipts = projectReceipts.filter(
    (receipt) => receipt.projectRevision === input.projectRevision,
  );
  const missing = contract.requiredEvidence.filter(
    (evidenceClass) => !validReceipts.some((receipt) => receipt.evidenceClass === evidenceClass),
  );
  if (missing.length === 0) return null;

  const hasStaleRequiredEvidence = contract.requiredEvidence.some(
    (evidenceClass) => projectReceipts.some(
      (receipt) => receipt.evidenceClass === evidenceClass
        && receipt.projectRevision !== input.projectRevision,
    ),
  );
  return blockedDecision({
    reason: hasStaleRequiredEvidence ? 'stale-evidence' : 'missing-evidence',
    code: hasStaleRequiredEvidence ? 'CHAT_TOOL_EVIDENCE_STALE' : 'CHAT_TOOL_EVIDENCE_REQUIRED',
    toolName: input.toolName,
    message: hasStaleRequiredEvidence
      ? `Canonical evidence for ${input.toolName} belongs to an older project revision.`
      : `${input.toolName} requires current ${missing.join(', ')} evidence before mutation.`,
    nextAction: 'Call read_project_file as the only next tool, then retry this exact target once.',
  });
}

function findActiveOwner(executions: CompletedChatToolExecution[]): ChatToolOwnerClass | null {
  for (const execution of executions) {
    if (!isCompletedOwnerExecution(execution)) continue;
    const metadata = getChatToolMetadata(execution.name);
    if (metadata?.mutatesProject && metadata.turnContract.owner) return metadata.turnContract.owner;
  }
  return null;
}

function isCompletedOwnerExecution(execution: CompletedChatToolExecution): boolean {
  return isCompletedOwnerOutcome(execution.outcome);
}

function isCompletedOwnerOutcome(outcome: ChatToolExecutionOutcome): boolean {
  return outcome === 'success' || outcome === 'advisory';
}

function resolveExecutionTargetKey(
  policy: ChatToolExecutionPolicy,
  args: Record<string, unknown>,
): string {
  const targetParts = policy.targetKeys.flatMap((key) =>
    collectNamedStrings(args, new Set([key])).map((value) => `${key}:${value}`),
  ).sort();
  return targetParts.length > 0 ? targetParts.join('|') : 'project';
}

function isReplaySafeForRevision(
  execution: CompletedChatToolExecution,
  projectRevision: string | null | undefined,
): boolean {
  if (!projectRevision || execution.outcome !== 'success') return false;
  const envelope = parseJsonRecord(execution.output);
  const verification = asRecord(asRecord(envelope?.data).postconditionVerification);
  return verification.status === 'pass' && verification.afterStateHash === projectRevision;
}

function blockedDecision(input: {
  reason: Extract<ChatToolExecutionDecision, { action: 'block' }>['reason'];
  code: string;
  toolName: string;
  message: string;
  nextAction: string;
}): Extract<ChatToolExecutionDecision, { action: 'block' }> {
  return {
    action: 'block',
    reason: input.reason,
    output: JSON.stringify({
      status: 'error',
      data: null,
      error: {
        code: input.code,
        message: input.message,
        details: { toolName: input.toolName },
      },
      nextAction: input.nextAction,
    }),
  };
}

function resolveEvidenceTarget(
  args: Record<string, unknown>,
  output: string,
): ChatToolEvidenceReceipt['target'] {
  const envelope = parseJsonRecord(output);
  const searchable = [args, asRecord(envelope?.data), envelope ?? {}];
  const overlayIds = unique(searchable.flatMap((value) => collectNamedStrings(value, new Set([
    'id',
    'overlayId',
    'videoOverlayId',
    'audioOverlayId',
    'assetId',
  ]))));
  const startFrame = firstFinite(searchable, ['startFrame', 'fromFrame', 'from', 'frame']);
  const endFrame = firstFinite(searchable, ['endFrame', 'toFrame', 'end']);
  return { scope: 'target', overlayIds, startFrame, endFrame };
}

function collectNamedStrings(value: unknown, keys: Set<string>, currentKey?: string): string[] {
  if (Array.isArray(value)) return value.flatMap((entry) => collectNamedStrings(entry, keys, currentKey));
  if (!value || typeof value !== 'object') {
    return currentKey && keys.has(currentKey) && (typeof value === 'string' || typeof value === 'number')
      ? [String(value)]
      : [];
  }
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, entry]) => collectNamedStrings(entry, keys, key));
}

function firstFinite(values: unknown[], keys: string[]): number | null {
  for (const value of values) {
    const found = findNamedFinite(value, new Set(keys));
    if (found !== null) return found;
  }
  return null;
}

function findNamedFinite(value: unknown, keys: Set<string>, currentKey?: string): number | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findNamedFinite(entry, keys, currentKey);
      if (found !== null) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') {
    const numeric = Number(value);
    return currentKey && keys.has(currentKey) && Number.isFinite(numeric) ? numeric : null;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const found = findNamedFinite(entry, keys, key);
    if (found !== null) return found;
  }
  return null;
}

function parseEvidenceReceipts(value: unknown): ChatToolEvidenceReceipt[] {
  const raw = asRecord(value).chatEvidenceReceipts;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isEvidenceReceipt);
}

function isEvidenceReceipt(value: unknown): value is ChatToolEvidenceReceipt {
  const record = asRecord(value);
  return record.version === CHAT_TOOL_EVIDENCE_RECEIPT_VERSION
    && typeof record.evidenceClass === 'string'
    && typeof record.projectId === 'string'
    && typeof record.projectRevision === 'string'
    && typeof record.producerTool === 'string';
}

function resolveEnvelopeCode(envelope: Record<string, unknown>): string | null {
  const error = asRecord(envelope.error);
  if (typeof error.code === 'string') return error.code;
  const policy = asRecord(asRecord(envelope.data).executionPolicy);
  return typeof policy.code === 'string' ? policy.code : null;
}

function normalizeValidationIssue(value: unknown): { path: string; message: string; code: string | null } {
  const issue = asRecord(value);
  const path = Array.isArray(issue.path) ? issue.path.map(String).join('.') : String(issue.path ?? '');
  return {
    path,
    message: String(issue.message ?? 'Invalid value'),
    code: typeof issue.code === 'string' ? issue.code : null,
  };
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function lastHumanMessageIndex(messages: unknown[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const record = asRecord(messages[index]);
    const type = typeof record._getType === 'function'
      ? String((record._getType as () => unknown)())
      : String((record.constructor as { name?: string } | undefined)?.name ?? '');
    if (type === 'human' || type === 'HumanMessage') return index;
  }
  return -1;
}

function stringifyToolOutput(content: unknown): string {
  if (typeof content === 'string') return content;
  return JSON.stringify(content ?? null);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}
