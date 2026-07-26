import {
  buildChatEvidenceReceipts,
  decideChatToolExecution,
  type ChatToolEvidenceReceipt,
  type ChatToolTurnLedger,
} from './chat-tool-execution-policy';
import { getChatToolMetadata } from './chat-tool-registry';
import type { ChatRequestOwnerLicense } from './chat-request-owner';

interface PreflightToolCall {
  id: string;
  name: string;
  args: unknown;
}

export interface ServerTimelinePreflight {
  targetToolCallIds: string[];
  producerTool: 'get_timeline_view' | 'read_project_file';
  source: 'server-inserted' | 'model-provided';
  status: 'ready' | 'failed';
  evidenceOutput: string | null;
  evidenceReceipts: ChatToolEvidenceReceipt[];
  failureMessage: string | null;
}

export async function prepareServerTimelinePreflight(input: {
  toolCalls: PreflightToolCall[];
  invokeTimelineView?: (args: Record<string, unknown>) => Promise<unknown>;
  ledger: ChatToolTurnLedger;
  projectId: string;
  projectRevision: string | null;
  requestOwnerLicense?: ChatRequestOwnerLicense;
}): Promise<ServerTimelinePreflight | null> {
  const targetToolCallIds = input.toolCalls
    .filter((toolCall) => requiresTimelinePreflight({
      toolCall,
      ledger: input.ledger,
      projectId: input.projectId,
      projectRevision: input.projectRevision,
      requestOwnerLicense: input.requestOwnerLicense,
    }))
    .map((toolCall) => toolCall.id);
  if (targetToolCallIds.length === 0) return null;

  const modelProvidedTimelineRead = input.toolCalls.find((toolCall) =>
    (
      toolCall.name === 'get_timeline_view'
      || toolCall.name === 'read_project_file'
    ) && getChatToolMetadata(toolCall.name)?.turnContract.producesEvidence.includes('timeline-state'),
  );
  if (modelProvidedTimelineRead) {
    const producerTool = modelProvidedTimelineRead.name === 'read_project_file'
      ? 'read_project_file'
      : 'get_timeline_view';
    return {
      targetToolCallIds,
      producerTool,
      source: 'model-provided',
      status: 'ready',
      evidenceOutput: null,
      evidenceReceipts: [],
      failureMessage: null,
    };
  }

  if (!input.invokeTimelineView) {
    return failedPreflight(targetToolCallIds, 'get_timeline_view is not licensed for this request.');
  }

  try {
    const rawOutput = await input.invokeTimelineView({
      granularity: 'detailed',
      includeVideo: true,
      includeAudio: true,
      includeText: true,
    });
    const evidenceOutput = stringifyToolOutput(rawOutput);
    const evidenceReceipts = buildChatEvidenceReceipts({
      toolName: 'get_timeline_view',
      args: { granularity: 'detailed' },
      output: evidenceOutput,
      projectId: input.projectId,
      projectRevision: input.projectRevision,
    });
    if (evidenceReceipts.length === 0) {
      return failedPreflight(
        targetToolCallIds,
        `get_timeline_view did not produce current evidence: ${evidenceOutput.slice(0, 500)}`,
      );
    }
    return {
      targetToolCallIds,
      producerTool: 'get_timeline_view',
      source: 'server-inserted',
      status: 'ready',
      evidenceOutput,
      evidenceReceipts,
      failureMessage: null,
    };
  } catch (error) {
    return failedPreflight(
      targetToolCallIds,
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function interceptToolCallForServerPreflight(input: {
  preflight: ServerTimelinePreflight | null;
  toolCallId: string;
  toolName: string;
}): { output: string; evidenceReceipts: ChatToolEvidenceReceipt[] } | null {
  const preflight = input.preflight;
  if (!preflight || !preflight.targetToolCallIds.includes(input.toolCallId)) return null;

  if (preflight.status === 'failed') {
    return {
      output: JSON.stringify({
        status: 'error',
        data: {
          serverEvidencePreflight: {
            status: 'failed',
            evidenceClass: 'timeline-state',
            producerTool: preflight.producerTool,
          },
        },
        error: {
          code: 'CHAT_TOOL_SERVER_PREFLIGHT_FAILED',
          message: preflight.failureMessage ?? 'Timeline preflight failed.',
        },
        nextAction: 'Stop this mutation and report that current timeline evidence is unavailable.',
      }),
      evidenceReceipts: [],
    };
  }

  const isPrimaryTarget = preflight.targetToolCallIds[0] === input.toolCallId;
  return {
    output: JSON.stringify({
      status: 'error',
      data: {
        serverEvidencePreflight: {
          status: 'ready',
          evidenceClass: 'timeline-state',
          producerTool: preflight.producerTool,
          source: preflight.source,
          ...(isPrimaryTarget && preflight.evidenceOutput
            ? { evidence: parseJson(preflight.evidenceOutput) }
            : {}),
        },
      },
      error: {
        code: 'CHAT_TOOL_EVIDENCE_REQUIRED',
        message: `${input.toolName} was paused until current timeline evidence reached the model.`,
      },
      nextAction: 'Review the timeline evidence, then retry this exact mutation once with the same target.',
    }),
    evidenceReceipts: isPrimaryTarget ? preflight.evidenceReceipts : [],
  };
}

function requiresTimelinePreflight(input: {
  toolCall: PreflightToolCall;
  ledger: ChatToolTurnLedger;
  projectId: string;
  projectRevision: string | null;
  requestOwnerLicense?: ChatRequestOwnerLicense;
}): boolean {
  const metadata = getChatToolMetadata(input.toolCall.name);
  if (
    !metadata?.mutatesProject
    || !metadata.turnContract.requiredEvidence.includes('timeline-state')
  ) {
    return false;
  }
  const decision = decideChatToolExecution({
    toolName: input.toolCall.name,
    args: asRecord(input.toolCall.args),
    ledger: input.ledger,
    projectId: input.projectId,
    projectRevision: input.projectRevision,
    canonicalProjectEvidence: true,
    requestOwnerLicense: input.requestOwnerLicense,
  });
  if (decision.action !== 'block' || decision.reason !== 'missing-evidence') return false;
  return parsePolicyCode(decision.output) === 'CHAT_TOOL_EVIDENCE_REQUIRED';
}

function failedPreflight(
  targetToolCallIds: string[],
  failureMessage: string,
): ServerTimelinePreflight {
  return {
    targetToolCallIds,
    producerTool: 'get_timeline_view',
    source: 'server-inserted',
    status: 'failed',
    evidenceOutput: null,
    evidenceReceipts: [],
    failureMessage,
  };
}

function stringifyToolOutput(output: unknown): string {
  return typeof output === 'string' ? output : JSON.stringify(output);
}

function parsePolicyCode(output: string): string | null {
  const parsed = parseJson(output);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const error = (parsed as { error?: unknown }).error;
  if (!error || typeof error !== 'object' || Array.isArray(error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
