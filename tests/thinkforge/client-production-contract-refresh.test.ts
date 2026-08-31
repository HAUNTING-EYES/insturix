import { describe, expect, it, vi } from 'vitest';

import {
  productionContractRefreshStageLabel,
  refreshProductionContractClient,
} from '@/lib/thinkforge/client-production-contract-refresh';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('production-contract refresh client', () => {
  it('polls durable stages and returns only the completed saved document', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({
        job: { id: 'contractrefresh_abc', status: 'queued', stage: 'treatment', error: null },
      }, 202))
      .mockResolvedValueOnce(response({
        job: { id: 'contractrefresh_abc', status: 'running', stage: 'sidecar', error: null },
      }))
      .mockResolvedValueOnce(response({
        job: { id: 'contractrefresh_abc', status: 'completed', stage: 'committing', error: null },
        script: { scriptId: 'default', version: 3, content: 'unchanged' },
      }));
    const progress = vi.fn();

    const script = await refreshProductionContractClient({
      sessionId: 'session_1',
      scriptId: 'default',
      baseVersion: 2,
    }, {
      fetcher,
      pollIntervalMs: 0,
      onProgress: progress,
    });

    expect(script).toMatchObject({ version: 3, content: 'unchanged' });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(progress.mock.calls.map(([job]) => job.stage)).toEqual(['treatment', 'sidecar', 'committing']);
  });

  it('surfaces the durable terminal error instead of spinning forever', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({
        job: { id: 'contractrefresh_abc', status: 'queued', stage: 'treatment', error: null },
      }, 202))
      .mockResolvedValueOnce(response({
        job: {
          id: 'contractrefresh_abc',
          status: 'dead_letter',
          stage: 'sidecar',
          error: { code: 'VersionConflict', message: 'The script changed while refreshing.' },
        },
      }));

    await expect(refreshProductionContractClient({
      sessionId: 'session_1',
      scriptId: 'default',
      baseVersion: 2,
    }, { fetcher, pollIntervalMs: 0 })).rejects.toThrow('The script changed while refreshing.');
  });

  it('aborts polling when the user switches documents', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn().mockImplementation(async () => {
      controller.abort();
      return response({
        job: { id: 'contractrefresh_abc', status: 'queued', stage: 'treatment', error: null },
      }, 202);
    });

    await expect(refreshProductionContractClient({
      sessionId: 'session_1',
      scriptId: 'default',
      baseVersion: 2,
    }, { fetcher, pollIntervalMs: 0, signal: controller.signal })).rejects.toThrow();
  });

  it('uses concise stage labels', () => {
    expect(productionContractRefreshStageLabel(null)).toBe('Starting refresh');
    expect(productionContractRefreshStageLabel({
      id: 'contractrefresh_abc',
      status: 'running',
      stage: 'sidecar',
      error: null,
    })).toBe('Refreshing production metadata');
  });
});
