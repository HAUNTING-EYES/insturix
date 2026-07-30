import {
  getChatCapabilityAuthorityContract,
  resolveChatLocalizedWorkflowAdapter,
  type ChatLocalizedEditRequest,
  type ChatRequestCapability,
  type ChatRequiredToolStep,
} from './chat-command-authority';
import { resolveServerOwnedLocalizedWorkflowStep } from './chat-localized-workflow';
import type {
  ChatToolExecutionOutcome,
  ChatToolTurnLedger,
  CompletedChatToolExecution,
} from './chat-tool-execution-policy';
import type {
  ChatRequestOwnerLicense,
  ChatRequestRoutingFacts,
} from './chat-request-owner';
import { normalizeChatWorkflowCapabilities } from './chat-request-owner';

export type ServerOwnedChatWorkflowStep =
  | {
      kind: 'tool-call';
      operationId: string;
      toolCall: {
        id: string;
        name: string;
        args: Record<string, unknown>;
      };
    }
  | {
      kind: 'model-call';
      operationId: string;
      stepIndex: number;
      allowedToolNames: ReadonlySet<string>;
      instruction: string;
    }
  | { kind: 'complete'; message: string }
  | { kind: 'halt'; message: string };

interface LocalizedOperation {
  kind: 'localized';
  id: string;
  capability: ChatRequestCapability;
  edit: ChatLocalizedEditRequest;
}

interface CapabilityOperation {
  kind: 'capability';
  id: string;
  capability: ChatRequestCapability;
  steps: readonly ChatRequiredToolStep[];
}

type ChatExecutionOperation = LocalizedOperation | CapabilityOperation;

interface OperationTerminal {
  status: 'completed' | 'halted';
  message?: string;
}

const TIMELINE_READ_TOOLS = new Set(['read_project_file', 'get_timeline_view']);
const RETRYABLE_OUTCOMES = new Set<ChatToolExecutionOutcome>([
  'replan-required',
  'validation-error',
  'precondition-blocked',
]);
const OPERATION_TERMINAL_OUTCOMES = new Set<ChatToolExecutionOutcome>([
  'advisory',
  'no-op',
  'declined',
  'needs-choice',
]);
const MAX_STEP_ATTEMPTS = 3;

export function resolveServerOwnedChatWorkflowStep(input: {
  requestOwnerLicense?: ChatRequestOwnerLicense;
  ledger: ChatToolTurnLedger;
  projectId: string;
  projectRevision: string | null;
}): ServerOwnedChatWorkflowStep | null {
  const license = input.requestOwnerLicense;
  if (license?.owner !== 'semantic-editorial-planner') return null;

  const compiled = compileChatExecutionOperations(license.routingFacts);
  if (compiled.status === 'unsupported') {
    return { kind: 'halt', message: compiled.message };
  }
  if (compiled.operations.length === 0) return null;
  if (!input.projectRevision) {
    return {
      kind: 'halt',
      message: 'I could not read the current project revision, so I did not make the edit.',
    };
  }

  const projectRevision = input.projectRevision;
  const haltedMessages: string[] = [];
  for (const operation of compiled.operations) {
    const operationInput = { ...input, projectRevision };
    const resolution = operation.kind === 'localized'
      ? resolveLocalizedOperation(operation, operationInput)
      : resolveCapabilityOperation(operation, operationInput);
    if (!resolution) continue;
    if ('status' in resolution) {
      if (resolution.status === 'halted' && resolution.message) {
        haltedMessages.push(resolution.message);
      }
      continue;
    }
    return resolution;
  }

  if (haltedMessages.length > 0) {
    return {
      kind: 'halt',
      message: haltedMessages.join('\n\n'),
    };
  }
  return {
    kind: 'complete',
    message: compiled.operations.length === 1
      ? 'Done. I completed the licensed workflow.'
      : `Done. I completed all ${compiled.operations.length} licensed workflows in order.`,
  };
}

function compileChatExecutionOperations(
  facts?: ChatRequestRoutingFacts,
): { status: 'ready'; operations: ChatExecutionOperation[] }
  | { status: 'unsupported'; message: string } {
  if (!facts) return { status: 'ready', operations: [] };

  const localizedByCapability = new Map<ChatRequestCapability, ChatLocalizedEditRequest[]>();
  for (const edit of facts.localizedEdits ?? []) {
    const adapter = resolveChatLocalizedWorkflowAdapter(edit);
    if (!adapter) {
      return {
        status: 'unsupported',
        message: `I cannot safely perform the requested ${edit.operation} operation on ${edit.modality} evidence yet.`,
      };
    }
    const edits = localizedByCapability.get(adapter.capability) ?? [];
    edits.push(edit);
    localizedByCapability.set(adapter.capability, edits);
  }

  const operations: ChatExecutionOperation[] = [];
  const consumedLocalizedCapabilities = new Set<ChatRequestCapability>();
  const capabilities = normalizeChatWorkflowCapabilities(
    facts,
    facts.requestedCapabilities,
  );
  for (const capability of capabilities) {
    const contract = getChatCapabilityAuthorityContract(capability);
    if (contract.authority === 'localized-workflow') {
      const localizedEdits = localizedByCapability.get(capability) ?? [];
      if (localizedEdits.length === 0) {
        return {
          status: 'unsupported',
          message: `The ${capability} workflow is missing the exact media target it must resolve.`,
        };
      }
      consumedLocalizedCapabilities.add(capability);
      for (const edit of localizedEdits) {
        operations.push({
          kind: 'localized',
          id: `${operations.length}:${capability}`,
          capability,
          edit,
        });
      }
      continue;
    }
    operations.push({
      kind: 'capability',
      id: `${operations.length}:${capability}`,
      capability,
      steps: contract.requiredToolSequence,
    });
  }

  for (const [capability, localizedEdits] of localizedByCapability.entries()) {
    if (consumedLocalizedCapabilities.has(capability)) continue;
    for (const edit of localizedEdits) {
      operations.push({
        kind: 'localized',
        id: `${operations.length}:${capability}`,
        capability,
        edit,
      });
    }
  }
  return { status: 'ready', operations };
}

function resolveLocalizedOperation(
  operation: LocalizedOperation,
  input: {
    requestOwnerLicense?: ChatRequestOwnerLicense;
    ledger: ChatToolTurnLedger;
    projectId: string;
    projectRevision: string;
  },
): Exclude<ServerOwnedChatWorkflowStep, { kind: 'complete' }> | OperationTerminal | null {
  const operationPrefix = workflowOperationPrefix(operation.id);
  const operationLedger: ChatToolTurnLedger = {
    requestedToolNames: input.ledger.requestedToolNames,
    completedExecutions: input.ledger.completedExecutions.filter((execution) =>
      execution.toolCallId.startsWith(operationPrefix)
      || hasCurrentTimelineReceipt(execution, input.projectId, input.projectRevision),
    ),
  };
  const localizedLicense: ChatRequestOwnerLicense = {
    ...input.requestOwnerLicense!,
    semanticWorkflow: 'localized-mutation',
    routingFacts: {
      ...input.requestOwnerLicense!.routingFacts!,
      localizedEdits: [operation.edit],
      requestedCapabilities: [operation.capability],
    },
  };
  const step = resolveServerOwnedLocalizedWorkflowStep({
    requestOwnerLicense: localizedLicense,
    ledger: operationLedger,
    projectId: input.projectId,
    projectRevision: input.projectRevision,
  });
  if (!step) return null;
  if (step.kind === 'complete') return { status: 'completed' };
  if (step.kind === 'halt') return { status: 'halted', message: step.message };

  const stage = localizedStageForTool(step.toolCall.name);
  const attempt = operationLedger.completedExecutions.filter(
    (execution) => execution.toolCallId.startsWith(`${operationPrefix}${stage}:`),
  ).length;
  return {
    kind: 'tool-call',
    operationId: operation.id,
    toolCall: {
      ...step.toolCall,
      id: `${operationPrefix}${stage}:${attempt}`,
    },
  };
}

function resolveCapabilityOperation(
  operation: CapabilityOperation,
  input: {
    ledger: ChatToolTurnLedger;
    projectId: string;
    projectRevision: string;
  },
): Exclude<ServerOwnedChatWorkflowStep, { kind: 'complete' }> | OperationTerminal | null {
  const operationPrefix = workflowOperationPrefix(operation.id);
  const requiresTimeline = operation.steps.some(stepContainsTimelineRead);

  for (const [stepIndex, step] of operation.steps.entries()) {
    if (stepContainsTimelineRead(step)) continue;
    const executions = input.ledger.completedExecutions.filter((execution) =>
      execution.toolCallId.startsWith(`${operationPrefix}${stepIndex}:`),
    );
    const latest = executions.at(-1);
    if (latest?.outcome === 'success') continue;
    if (latest && OPERATION_TERMINAL_OUTCOMES.has(latest.outcome)) {
      return {
        status: latest.outcome === 'no-op' ? 'completed' : 'halted',
        ...(latest.outcome === 'no-op' ? {} : { message: humanizeWorkflowFailure(latest) }),
      };
    }
    if (latest && !RETRYABLE_OUTCOMES.has(latest.outcome)) {
      return { status: 'halted', message: humanizeWorkflowFailure(latest) };
    }
    if (executions.length >= MAX_STEP_ATTEMPTS) {
      return {
        status: 'halted',
        message: `I could not complete ${operation.capability} after ${MAX_STEP_ATTEMPTS} validated attempts, so I stopped without guessing.`,
      };
    }

    if (
      requiresTimeline
      && !hasCurrentTimelineEvidence(input.ledger, input.projectId, input.projectRevision)
    ) {
      const timelineAttempt = input.ledger.completedExecutions.filter((execution) =>
        execution.toolCallId.startsWith(`${operationPrefix}timeline:`),
      ).length;
      return {
        kind: 'tool-call',
        operationId: operation.id,
        toolCall: {
          id: `${operationPrefix}timeline:${timelineAttempt}`,
          name: 'get_timeline_view',
          args: detailedTimelineArgs(),
        },
      };
    }

    const allowedToolNames = new Set(Array.isArray(step) ? step : [step]);
    return {
      kind: 'model-call',
      operationId: operation.id,
      stepIndex,
      allowedToolNames,
      instruction: `Complete ${operation.capability} through its licensed ${authorityLabel(operation.capability)}.`,
    };
  }
  return { status: 'completed' };
}

function authorityLabel(capability: ChatRequestCapability): string {
  const authority = getChatCapabilityAuthorityContract(capability).authority;
  if (authority === 'family-owner') return 'family owner';
  if (authority === 'mechanical-workflow') return 'mechanical workflow';
  if (authority === 'project-transform') return 'project transform';
  if (authority === 'unified-planner') return 'unified planner';
  if (authority === 'durable-workflow') return 'durable workflow';
  return 'localized workflow';
}

function stepContainsTimelineRead(step: ChatRequiredToolStep): boolean {
  return (Array.isArray(step) ? step : [step]).some((name) => TIMELINE_READ_TOOLS.has(name));
}

function hasCurrentTimelineEvidence(
  ledger: ChatToolTurnLedger,
  projectId: string,
  projectRevision: string,
): boolean {
  return ledger.completedExecutions.some((execution) =>
    hasCurrentTimelineReceipt(execution, projectId, projectRevision),
  );
}

function hasCurrentTimelineReceipt(
  execution: CompletedChatToolExecution,
  projectId: string,
  projectRevision: string,
): boolean {
  return execution.evidenceReceipts.some((receipt) =>
    receipt.projectId === projectId
    && receipt.projectRevision === projectRevision
    && receipt.evidenceClass === 'timeline-state',
  );
}

function localizedStageForTool(toolName: string): string {
  if (TIMELINE_READ_TOOLS.has(toolName)) return 'timeline';
  if (toolName.startsWith('resolve_')) return 'resolver';
  return 'mutation';
}

function workflowOperationPrefix(operationId: string): string {
  return `server-workflow:${operationId}:`;
}

function detailedTimelineArgs(): Record<string, unknown> {
  return {
    granularity: 'detailed',
    includeVideo: true,
    includeAudio: true,
    includeText: true,
  };
}

function humanizeWorkflowFailure(execution: CompletedChatToolExecution): string {
  const envelope = parseRecord(execution.output);
  const data = asRecord(envelope?.data);
  const error = asRecord(envelope?.error);
  const message = firstString(envelope?.message, data.message, error.message);
  if (message) return message;
  if (execution.outcome === 'needs-choice') {
    return 'I found more than one possible target. Please choose the moment you meant before I edit.';
  }
  if (execution.outcome === 'declined') {
    return `${execution.name} found no warranted edit, so I left that part unchanged.`;
  }
  return `I could not safely complete ${execution.name}, so I left that part unchanged.`;
}

function parseRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}
