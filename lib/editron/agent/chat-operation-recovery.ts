export const CHAT_EDIT_OPERATION_TERMINAL_STATUSES = [
  'completed',
  'no-op',
  'rolled-back',
  'failed',
] as const;

export type ChatEditOperationTerminalStatus =
  typeof CHAT_EDIT_OPERATION_TERMINAL_STATUSES[number];
export type ChatEditOperationRecoveryStatus =
  | ChatEditOperationTerminalStatus
  | 'running'
  | 'unknown';

export interface ChatEditOperationStatusResponse {
  success: true;
  operationId: string;
  projectId: string;
  sessionId: string;
  operationStatus: Exclude<ChatEditOperationRecoveryStatus, 'unknown'>;
  mutatingToolNames: string[];
  beforeCheckpointId: string;
  afterCheckpointId?: string;
}

export interface ChatEditOperationRecoveryResult {
  status: ChatEditOperationRecoveryStatus;
  polls: number;
  snapshot?: ChatEditOperationStatusResponse;
}

interface RecoverChatEditOperationInput {
  projectId: string;
  sessionId: string;
  operationId: string;
  signal?: AbortSignal;
}

interface RecoverChatEditOperationDependencies {
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
}

const TERMINAL_STATUSES = new Set<string>(CHAT_EDIT_OPERATION_TERMINAL_STATUSES);

export async function recoverChatEditOperation(
  input: RecoverChatEditOperationInput,
  dependencies: RecoverChatEditOperationDependencies = {},
): Promise<ChatEditOperationRecoveryResult> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const now = dependencies.now ?? Date.now;
  const sleep = dependencies.sleep ?? defaultSleep;
  const timeoutMs = Math.max(0, dependencies.timeoutMs ?? 12_000);
  const initialDelayMs = Math.max(10, dependencies.initialDelayMs ?? 200);
  const maxDelayMs = Math.max(initialDelayMs, dependencies.maxDelayMs ?? 2_000);
  const deadline = now() + timeoutMs;
  let delayMs = initialDelayMs;
  let polls = 0;
  let latestSnapshot: ChatEditOperationStatusResponse | undefined;

  while (true) {
    throwIfAborted(input.signal);
    polls += 1;

    const query = new URLSearchParams({
      projectId: input.projectId,
      sessionId: input.sessionId,
      operationId: input.operationId,
    });
    let response: Response | undefined;
    try {
      response = await fetchImpl(
        `/api/services/editron/chat/operation-status?${query.toString()}`,
        {
          method: 'GET',
          cache: 'no-store',
          signal: input.signal,
        },
      );
    } catch (error) {
      if (input.signal?.aborted || isAbortError(error)) throw error;
    }

    if (response?.status === 401 || response?.status === 403) {
      throw new Error('Chat edit operation status is not authorized.');
    }
    if (response?.ok) {
      const snapshot = await parseOperationStatusResponseBody(response);
      if (snapshot) {
        latestSnapshot = snapshot;
        if (TERMINAL_STATUSES.has(snapshot.operationStatus)) {
          return {
            status: snapshot.operationStatus,
            polls,
            snapshot,
          };
        }
      }
    }

    if (now() >= deadline) {
      return {
        status: latestSnapshot?.operationStatus ?? 'unknown',
        polls,
        snapshot: latestSnapshot,
      };
    }

    const remainingMs = Math.max(0, deadline - now());
    await sleep(Math.min(delayMs, remainingMs));
    delayMs = Math.min(maxDelayMs, delayMs * 2);
  }
}

export function describeRecoveredChatEditOperation(
  result: ChatEditOperationRecoveryResult,
  fallbackError: unknown,
): string {
  switch (result.status) {
    case 'completed':
      return 'The edit finished and was saved, but the live response disconnected. I reloaded the latest project state.';
    case 'no-op':
      return 'The request finished without changing the project, but its live response disconnected.';
    case 'rolled-back':
      return 'The edit could not be completed and was safely rolled back. The latest project state has been reloaded.';
    case 'failed':
      return 'The edit failed before it could be saved. The latest project state has been reloaded.';
    case 'running':
      return 'The live response disconnected, but this edit is still processing on the server. It was not started twice.';
    default:
      return `Error: ${fallbackError instanceof Error ? fallbackError.message : 'The AI edit response was interrupted.'}`;
  }
}

function parseOperationStatusResponse(value: unknown): ChatEditOperationStatusResponse | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<ChatEditOperationStatusResponse>;
  if (
    candidate.success !== true
    || typeof candidate.operationId !== 'string'
    || typeof candidate.projectId !== 'string'
    || typeof candidate.sessionId !== 'string'
    || typeof candidate.operationStatus !== 'string'
    || (
      candidate.operationStatus !== 'running'
      && !TERMINAL_STATUSES.has(candidate.operationStatus)
    )
    || !Array.isArray(candidate.mutatingToolNames)
    || !candidate.mutatingToolNames.every((name) => typeof name === 'string')
    || typeof candidate.beforeCheckpointId !== 'string'
    || (
      candidate.afterCheckpointId !== undefined
      && typeof candidate.afterCheckpointId !== 'string'
    )
  ) {
    return null;
  }
  return candidate as ChatEditOperationStatusResponse;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }
}

async function parseOperationStatusResponseBody(
  response: Response,
): Promise<ChatEditOperationStatusResponse | null> {
  try {
    return parseOperationStatusResponse(await response.json());
  } catch {
    return null;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
