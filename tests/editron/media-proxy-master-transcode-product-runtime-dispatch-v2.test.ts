import { describe, expect, it, vi } from 'vitest';

import { MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V1 }
  from '@/lib/editron/services/media-proxy-master-transcode-durable-job-v1';
import { MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V2 }
  from '@/lib/editron/services/media-proxy-master-transcode-durable-job-v2';
import { runMediaProxyMasterTranscodeProductRuntimeDispatchV2 }
  from '@/lib/editron/services/media-proxy-master-transcode-product-runtime-dispatch-v2';

const request = { jobId: 'proxy-job', workerId: 'proxy-worker' } as const;

describe('MediaProxyMasterTranscodeProductRuntimeDispatchV2', () => {
  it('selects V2 from the exact persisted schema and never calls V1', async () => {
    const getForWorkerExecution = vi.fn(async () => ({} as never));
    const runV2 = vi.fn(async () => ({
      kind: 'skipped' as const,
      reason: 'v2-selected',
    }));
    const runV1 = vi.fn();

    await expect(runMediaProxyMasterTranscodeProductRuntimeDispatchV2(
      request,
      { jobStore: { getForWorkerExecution }, runV1, runV2 },
    )).resolves.toEqual({ kind: 'skipped', reason: 'v2-selected' });
    expect(getForWorkerExecution).toHaveBeenCalledOnce();
    expect(getForWorkerExecution).toHaveBeenCalledWith(expect.objectContaining({
      inputSchemaId:
        MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V2,
      operationOwner: 'MEDIA_ASSETS',
      operationKind: 'media_proxy_master_trusted_transcode',
    }));
    expect(runV2).toHaveBeenCalledWith(request);
    expect(runV1).not.toHaveBeenCalled();
  });

  it('selects V1 only after the exact V2 scope is absent', async () => {
    const getForWorkerExecution = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({} as never);
    const runV1 = vi.fn(async () => ({
      kind: 'skipped' as const,
      reason: 'v1-selected',
    }));
    const runV2 = vi.fn();

    await expect(runMediaProxyMasterTranscodeProductRuntimeDispatchV2(
      request,
      { jobStore: { getForWorkerExecution }, runV1, runV2 },
    )).resolves.toEqual({ kind: 'skipped', reason: 'v1-selected' });
    expect(getForWorkerExecution.mock.calls.map(([value]) => (
      value.inputSchemaId
    ))).toEqual([
      MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V2,
      MEDIA_PROXY_MASTER_TRANSCODE_DURABLE_JOB_INPUT_VERSION_V1,
    ]);
    expect(runV1).toHaveBeenCalledWith(request);
    expect(runV2).not.toHaveBeenCalled();
  });

  it('returns not_found only when neither exact schema exists', async () => {
    const getForWorkerExecution = vi.fn(async () => null);
    const runV1 = vi.fn();
    const runV2 = vi.fn();
    await expect(runMediaProxyMasterTranscodeProductRuntimeDispatchV2(
      request,
      { jobStore: { getForWorkerExecution }, runV1, runV2 },
    )).resolves.toEqual({ kind: 'skipped', reason: 'not_found' });
    expect(getForWorkerExecution).toHaveBeenCalledTimes(2);
    expect(runV1).not.toHaveBeenCalled();
    expect(runV2).not.toHaveBeenCalled();
  });

  it('never reinterprets a V2 runtime failure as V1 work', async () => {
    const failure = new Error('v2 unavailable');
    const runV1 = vi.fn();
    const runV2 = vi.fn(async () => {
      throw failure;
    });
    await expect(runMediaProxyMasterTranscodeProductRuntimeDispatchV2(
      request,
      {
        jobStore: {
          getForWorkerExecution: vi.fn(async () => ({} as never)),
        },
        runV1,
        runV2,
      },
    )).rejects.toBe(failure);
    expect(runV1).not.toHaveBeenCalled();
  });
});
