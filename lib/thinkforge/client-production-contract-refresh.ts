export type ProductionContractRefreshClientStage = 'treatment' | 'sidecar' | 'committing';

export interface ProductionContractRefreshClientJob {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'cancelled' | 'dead_letter';
  stage: ProductionContractRefreshClientStage;
  error: { code: string; message: string } | null;
}

export interface ProductionContractRefreshedScript {
  scriptId?: string;
  title?: string | null;
  content?: string | null;
  blocks?: unknown;
  richText?: unknown;
  metadata?: unknown;
  version: number;
  documentType?: unknown;
  contentContract?: unknown;
}

export interface RefreshProductionContractClientOptions {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  pollIntervalMs?: number;
  maxWaitMs?: number;
  onProgress?: (job: ProductionContractRefreshClientJob) => void;
}

const ENDPOINT = '/api/services/thinkforge/script/refresh-production-contract';

export async function refreshProductionContractClient(
  input: { sessionId: string; scriptId: string; baseVersion: number },
  options: RefreshProductionContractClientOptions = {},
): Promise<ProductionContractRefreshedScript> {
  const fetcher = options.fetcher ?? fetch;
  const pollIntervalMs = options.pollIntervalMs ?? 1_500;
  const maxWaitMs = options.maxWaitMs ?? 10 * 60_000;
  const startedAt = Date.now();
  options.signal?.throwIfAborted();

  const queuedResponse = await fetcher(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: options.signal,
  });
  const queuedBody = await readJson(queuedResponse);
  if (!queuedResponse.ok) throw new Error(readError(queuedBody, 'Production plan refresh could not be queued.'));
  const queuedJob = parseJob(queuedBody);
  options.onProgress?.(queuedJob);

  while (Date.now() - startedAt <= maxWaitMs) {
    options.signal?.throwIfAborted();
    await abortableDelay(pollIntervalMs, options.signal);
    const statusResponse = await fetcher(`${ENDPOINT}?jobId=${encodeURIComponent(queuedJob.id)}`, {
      signal: options.signal,
    });
    const statusBody = await readJson(statusResponse);
    if (!statusResponse.ok) throw new Error(readError(statusBody, 'Production plan refresh status could not be loaded.'));
    const job = parseJob(statusBody);
    options.onProgress?.(job);
    if (job.status === 'completed') return parseCompletedScript(statusBody);
    if (job.status === 'dead_letter' || job.status === 'cancelled') {
      throw new Error(job.error?.message || 'Production plan refresh could not be completed.');
    }
  }
  throw new Error('Production plan refresh is still processing. Reopen this script to check its latest status.');
}

export function productionContractRefreshStageLabel(
  job: ProductionContractRefreshClientJob | null,
): string {
  if (!job) return 'Starting refresh';
  if (job.stage === 'treatment') return 'Planning treatment';
  if (job.stage === 'sidecar') return 'Refreshing production metadata';
  return 'Saving production plan';
}

function parseJob(body: unknown): ProductionContractRefreshClientJob {
  const record = recordOf(body);
  const job = recordOf(record?.job);
  const error = recordOf(job?.error);
  if (!job
    || typeof job.id !== 'string'
    || !['queued', 'running', 'completed', 'cancelled', 'dead_letter'].includes(String(job.status))
    || !['treatment', 'sidecar', 'committing'].includes(String(job.stage))) {
    throw new Error('Production plan refresh returned an invalid job state.');
  }
  return {
    id: job.id,
    status: job.status as ProductionContractRefreshClientJob['status'],
    stage: job.stage as ProductionContractRefreshClientStage,
    error: error && typeof error.code === 'string' && typeof error.message === 'string'
      ? { code: error.code, message: error.message }
      : null,
  };
}

function parseCompletedScript(body: unknown): ProductionContractRefreshedScript {
  const script = recordOf(recordOf(body)?.script);
  if (!script || typeof script.version !== 'number') {
    throw new Error('Completed production refresh did not return its saved document.');
  }
  return script as unknown as ProductionContractRefreshedScript;
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function readError(body: unknown, fallback: string): string {
  const record = recordOf(body);
  if (typeof record?.error === 'string') return record.error;
  const nestedError = recordOf(recordOf(record?.job)?.error);
  return typeof nestedError?.message === 'string' ? nestedError.message : fallback;
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
