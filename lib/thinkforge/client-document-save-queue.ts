export interface ThinkForgeDocumentSaveRequest {
  sessionId: string;
  scriptId: string;
  baseVersion: number;
  title: string;
  content: string;
  richText: Record<string, unknown>;
  contentHash: string;
}

export type ThinkForgeDocumentSaveResult =
  | { status: 'saved'; version: number; contentHash: string }
  | { status: 'conflict'; currentVersion: number; contentHash: string };

export type ThinkForgeDocumentSaveTransport = (
  request: ThinkForgeDocumentSaveRequest,
) => Promise<ThinkForgeDocumentSaveResult>;

interface DocumentQueueState {
  tail: Promise<void>;
  version?: number;
  lastSavedHash?: string;
}

const queues = new Map<string, DocumentQueueState>();
const SAVE_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 3;

export function enqueueThinkForgeDocumentSave(
  request: ThinkForgeDocumentSaveRequest,
  transport: ThinkForgeDocumentSaveTransport = persistThinkForgeDocument,
): Promise<ThinkForgeDocumentSaveResult> {
  const key = documentKey(request);
  const state = queues.get(key) ?? { tail: Promise.resolve() };
  queues.set(key, state);

  const task = state.tail.then(async () => {
    if (state.lastSavedHash === request.contentHash && state.version !== undefined) {
      return { status: 'saved', version: state.version, contentHash: request.contentHash } as const;
    }
    const queuedRequest = {
      ...request,
      baseVersion: Math.max(request.baseVersion, state.version ?? 0),
    };
    const result = await transport(queuedRequest);
    if (result.status === 'saved') {
      state.version = result.version;
      state.lastSavedHash = result.contentHash;
    } else {
      state.version = result.currentVersion;
    }
    return result;
  });
  state.tail = task.then(() => undefined, () => undefined);
  return task;
}

export function clearThinkForgeDocumentSaveQueuesForTests(): void {
  queues.clear();
}

async function persistThinkForgeDocument(
  request: ThinkForgeDocumentSaveRequest,
): Promise<ThinkForgeDocumentSaveResult> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS);
    try {
      const response = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
        body: JSON.stringify({
          type: 'ReplaceDocument',
          sessionId: request.sessionId,
          baseVersion: request.baseVersion,
          source: 'user',
          payload: {
            scriptId: request.scriptId,
            richText: request.richText,
            content: request.content,
            title: request.title,
          },
        }),
      });
      if (response.status === 409) {
        const data = await response.json().catch(() => ({}));
        return {
          status: 'conflict',
          currentVersion: typeof data?.currentVersion === 'number' ? data.currentVersion : request.baseVersion,
          contentHash: request.contentHash,
        };
      }
      if (!response.ok) {
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        if (!retryable) throw new Error(`Document save failed with status ${response.status}.`);
        lastError = new Error(`Document save transiently failed with status ${response.status}.`);
      } else {
        const data = await response.json();
        const version = data?.script?.version;
        if (typeof version !== 'number') throw new Error('Document save response omitted the committed version.');
        return { status: 'saved', version, contentHash: request.contentHash };
      }
    } catch (error) {
      lastError = error;
      if (error instanceof Error && error.message.startsWith('Document save failed with status')) throw error;
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Document save failed after retries.');
}

function documentKey(request: Pick<ThinkForgeDocumentSaveRequest, 'sessionId' | 'scriptId'>): string {
  return `${request.sessionId}:${request.scriptId}`;
}
