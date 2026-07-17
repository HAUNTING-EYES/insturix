import { getChatToolMetadata } from './chat-tool-registry';

export interface CompletedChatToolExecution {
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
  output: string;
}

export interface ChatToolTurnLedger {
  requestedToolNames: string[];
  completedExecutions: CompletedChatToolExecution[];
}

export type ChatToolExecutionDecision =
  | { action: 'execute' }
  | { action: 'replay'; output: string; reason: 'identical-call' }
  | { action: 'block'; output: string; reason: 'turn-limit' | 'owner-conflict' };

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
    completedExecutions.push({
      toolCallId,
      name: matchedCall.name,
      args: matchedCall.args,
      output: stringifyToolOutput(record.content),
    });
  }

  return { requestedToolNames, completedExecutions };
}

export function decideChatToolExecution(input: {
  toolName: string;
  args: Record<string, unknown>;
  ledger: ChatToolTurnLedger;
}): ChatToolExecutionDecision {
  const policy = getChatToolMetadata(input.toolName)?.executionPolicy;
  if (!policy) return { action: 'execute' };

  const blockingOwner = policy.blockedWhenTurnRequests?.find((toolName) =>
    input.ledger.requestedToolNames.includes(toolName),
  );
  if (blockingOwner) {
    return {
      action: 'block',
      reason: 'owner-conflict',
      output: advisoryOutput({
        code: 'CHAT_TOOL_OWNER_CONFLICT',
        toolName: input.toolName,
        reason: `${input.toolName} cannot execute in the same turn as ${blockingOwner}; use the dedicated workflow owner.`,
      }),
    };
  }

  const sameToolExecutions = input.ledger.completedExecutions.filter(
    (execution) => execution.name === input.toolName,
  );
  const identicalExecution = sameToolExecutions.find(
    (execution) => stableStringify(execution.args) === stableStringify(input.args),
  );
  if (policy.replayIdenticalCalls && identicalExecution) {
    return { action: 'replay', output: identicalExecution.output, reason: 'identical-call' };
  }

  if (
    policy.maxExecutionsPerTurn !== undefined
    && sameToolExecutions.length >= policy.maxExecutionsPerTurn
  ) {
    return {
      action: 'block',
      reason: 'turn-limit',
      output: advisoryOutput({
        code: 'CHAT_TOOL_TURN_LIMIT',
        toolName: input.toolName,
        reason: `${input.toolName} already executed ${sameToolExecutions.length} time(s) in this turn.`,
      }),
    };
  }

  return { action: 'execute' };
}

function advisoryOutput(input: { code: string; toolName: string; reason: string }): string {
  return JSON.stringify({
    status: 'advisory',
    data: {
      executionPolicy: {
        code: input.code,
        toolName: input.toolName,
        reason: input.reason,
      },
    },
    error: null,
    nextAction: 'Stop repeating this tool. Continue with the dedicated workflow owner or explain the result.',
  });
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

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}
