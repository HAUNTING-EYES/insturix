type SessionDeletionFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface SessionDeletionOptions {
  fetcher?: SessionDeletionFetcher;
  maxPolls?: number;
  signal?: AbortSignal;
  wait?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

export async function deleteThinkForgeSessionWhenDurable(
  sessionId: string,
  options: SessionDeletionOptions = {},
): Promise<void> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(`/api/services/thinkforge/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    signal: options.signal,
  });
  const body = await readJson(response);
  if (!response.ok) throw new Error(readError(body, `Failed (${response.status})`));

  // Supports a rolling deployment while the previous synchronous route is still live.
  if (response.status !== 202) return;
  if (body.status === 'completed') return;
  const statusUrl = typeof body.statusUrl === 'string' ? body.statusUrl : null;
  if (!statusUrl) throw new Error('Session deletion was accepted without a status endpoint.');

  const wait = options.wait ?? waitWithAbort;
  const maxPolls = Math.max(1, Math.min(options.maxPolls ?? 20, 60));
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    const statusResponse = await fetcher(statusUrl, { cache: 'no-store', signal: options.signal });
    const statusBody = await readJson(statusResponse);
    if (!statusResponse.ok) {
      throw new Error(readError(statusBody, `Deletion status failed (${statusResponse.status})`));
    }
    if (statusBody.status === 'completed') return;
    if (statusBody.status === 'dead_letter') {
      throw new Error(readError(statusBody, 'Session deletion could not be completed. Retry from the Library.'));
    }
    if (attempt < maxPolls - 1) {
      await wait(Math.min(1_000 + attempt * 250, 3_000), options.signal);
    }
  }
  throw new Error('Session deletion is still processing. Please retry from the Library shortly.');
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json().catch(() => ({}));
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readError(body: Record<string, unknown>, fallback: string): string {
  if (typeof body.error === 'string' && body.error.trim()) return body.error;
  if (body.error && typeof body.error === 'object') {
    const message = (body.error as Record<string, unknown>).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

function waitWithAbort(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function abortError(): Error {
  return Object.assign(new Error('Session deletion cancelled.'), { name: 'AbortError' });
}
