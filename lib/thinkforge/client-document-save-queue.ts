import { isTiptapJSON, validateTiptapJSON } from './schemas/tiptap-validation';

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
  conflictVersion?: number;
}

export interface ThinkForgePreservedConflictDraft {
  request: ThinkForgeDocumentSaveRequest;
  currentVersion: number;
  preservedAt: string;
}

const queues = new Map<string, DocumentQueueState>();
const SAVE_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 3;
const CONFLICT_DRAFT_PREFIX = 'thinkforge_conflict_draft_';

export function enqueueThinkForgeDocumentSave(
  request: ThinkForgeDocumentSaveRequest,
  transport: ThinkForgeDocumentSaveTransport = persistThinkForgeDocument,
): Promise<ThinkForgeDocumentSaveResult> {
  const key = documentKey(request);
  const state = queues.get(key) ?? { tail: Promise.resolve() };
  queues.set(key, state);

  const task = state.tail.then(async () => {
    if (state.conflictVersion !== undefined) {
      return {
        status: 'conflict',
        currentVersion: state.conflictVersion,
        contentHash: request.contentHash,
      } as const;
    }
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
      state.conflictVersion = result.currentVersion;
    }
    return result;
  });
  state.tail = task.then(() => undefined, () => undefined);
  return task;
}

export function overwriteThinkForgeDocumentAfterConflict(
  request: ThinkForgeDocumentSaveRequest,
  expectedCurrentVersion: number,
  transport: ThinkForgeDocumentSaveTransport = persistThinkForgeDocument,
): Promise<ThinkForgeDocumentSaveResult> {
  const key = documentKey(request);
  const state = queues.get(key);
  if (!state) {
    return Promise.reject(new Error('Document save conflict is no longer active.'));
  }

  const task = state.tail.then(async () => {
    if (state.conflictVersion !== expectedCurrentVersion) {
      throw new Error('Document save conflict changed before it was resolved.');
    }

    const result = await transport({
      ...request,
      baseVersion: expectedCurrentVersion,
    });
    if (result.status === 'saved') {
      state.version = result.version;
      state.lastSavedHash = result.contentHash;
      state.conflictVersion = undefined;
    } else {
      state.conflictVersion = result.currentVersion;
    }
    return result;
  });
  state.tail = task.then(() => undefined, () => undefined);
  return task;
}

export function acceptThinkForgeServerDocument(
  identity: Pick<ThinkForgeDocumentSaveRequest, 'sessionId' | 'scriptId'>,
  expectedConflictVersion: number,
  loadedVersion: number,
  contentHash: string,
): void {
  const state = queues.get(documentKey(identity));
  if (!state || state.conflictVersion !== expectedConflictVersion) {
    throw new Error('Document save conflict changed before the server version was loaded.');
  }
  state.version = loadedVersion;
  state.lastSavedHash = contentHash;
  state.conflictVersion = undefined;
}

export function restoreThinkForgeDocumentConflict(
  identity: Pick<ThinkForgeDocumentSaveRequest, 'sessionId' | 'scriptId'>,
  currentVersion: number,
): void {
  if (!Number.isInteger(currentVersion) || currentVersion < 0) {
    throw new Error('Stored document conflict version is invalid.');
  }

  const key = documentKey(identity);
  const state = queues.get(key) ?? { tail: Promise.resolve() };
  if (state.conflictVersion !== undefined && state.conflictVersion !== currentVersion) {
    throw new Error('Stored document conflict differs from the active conflict.');
  }
  if (state.version !== undefined && state.version > currentVersion) {
    throw new Error('Stored document conflict is older than the active document queue.');
  }
  state.conflictVersion = currentVersion;
  queues.set(key, state);
}

export function preserveThinkForgeConflictDraft(
  request: ThinkForgeDocumentSaveRequest,
  currentVersion: number,
): void {
  const storage = browserStorage();
  if (!storage) return;
  if (!Number.isInteger(currentVersion) || currentVersion < request.baseVersion) {
    throw new Error('Document conflict version cannot precede the local draft version.');
  }
  storage.setItem(conflictDraftStorageKey(request), JSON.stringify({
    request,
    currentVersion,
    preservedAt: new Date().toISOString(),
  } satisfies ThinkForgePreservedConflictDraft));
}

export function readThinkForgeConflictDraft(
  identity: Pick<ThinkForgeDocumentSaveRequest, 'sessionId' | 'scriptId'>,
): ThinkForgePreservedConflictDraft | null {
  const storage = browserStorage();
  if (!storage) return null;
  const raw = storage.getItem(conflictDraftStorageKey(identity));
  if (!raw) return null;

  const parsed = JSON.parse(raw) as Partial<ThinkForgePreservedConflictDraft>;
  const request = parsed?.request;
  if (!request || typeof request !== 'object') {
    throw new Error('Stored document conflict draft omitted its save request.');
  }
  if (request.sessionId !== identity.sessionId || request.scriptId !== identity.scriptId) {
    throw new Error('Stored document conflict draft belongs to another document.');
  }
  if (!Number.isInteger(request.baseVersion) || request.baseVersion < 0) {
    throw new Error('Stored document conflict draft has an invalid base version.');
  }
  if (!Number.isInteger(parsed.currentVersion)
    || (parsed.currentVersion as number) < request.baseVersion) {
    throw new Error('Stored document conflict draft has an invalid conflict version.');
  }
  if (typeof request.title !== 'string'
    || typeof request.content !== 'string'
    || typeof request.contentHash !== 'string'
    || !request.contentHash) {
    throw new Error('Stored document conflict draft has invalid document fields.');
  }
  if (!isTiptapJSON(request.richText)) {
    throw new Error('Stored document conflict draft has invalid rich text.');
  }

  const richText = validateTiptapJSON(request.richText);
  if (JSON.stringify(richText) !== request.contentHash) {
    throw new Error('Stored document conflict draft failed its content integrity check.');
  }

  return {
    request: { ...request, richText: richText as unknown as Record<string, unknown> },
    currentVersion: parsed.currentVersion as number,
    preservedAt: typeof parsed.preservedAt === 'string' ? parsed.preservedAt : '',
  };
}

export function clearThinkForgeConflictDraft(
  identity: Pick<ThinkForgeDocumentSaveRequest, 'sessionId' | 'scriptId'>,
): void {
  try {
    browserStorage()?.removeItem(conflictDraftStorageKey(identity));
  } catch {
    // Storage cleanup cannot invalidate a conflict already resolved on the server.
  }
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

function conflictDraftStorageKey(
  identity: Pick<ThinkForgeDocumentSaveRequest, 'sessionId' | 'scriptId'>,
): string {
  return `${CONFLICT_DRAFT_PREFIX}${documentKey(identity)}`;
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
