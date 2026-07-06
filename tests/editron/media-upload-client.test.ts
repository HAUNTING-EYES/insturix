import { afterEach, describe, expect, it, vi } from 'vitest';

import { getMediaUploadBatchStatus } from '../../components/editron/editor/version-7.0.0/utils/media-upload';

function batchResponse(overrides: Record<string, unknown> = {}) {
  return {
    uploadBatchId: 'batch_1',
    exists: true,
    status: 'ready',
    canCreateProject: true,
    counts: {
      total: 1,
      uploaded: 0,
      queued: 0,
      analyzing: 0,
      ready: 1,
      failed: 0,
      skipped: 0,
    },
    assets: [
      {
        assetId: 'asset_1',
        filename: 'clip.mp4',
        type: 'video',
        size: 123,
        readiness: 'ready',
        blockingReason: null,
        needsAttention: false,
      },
    ],
    ...overrides,
  };
}

describe('media upload batch client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads batch status from the server-owned readiness endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, batch: batchResponse() }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const status = await getMediaUploadBatchStatus('batch id/1');

    expect(fetchMock).toHaveBeenCalledWith('/api/services/editron/media/batches/batch%20id%2F1');
    expect(status.canCreateProject).toBe(true);
    expect(status.counts.ready).toBe(1);
    expect(status.assets[0]?.readiness).toBe('ready');
  });

  it('surfaces API errors instead of treating missing status as ready', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'Batch lookup failed' }), { status: 500 })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getMediaUploadBatchStatus('batch_1')).rejects.toThrow('Batch lookup failed');
  });

  it('rejects empty batch ids before making a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(getMediaUploadBatchStatus('   ')).rejects.toThrow('uploadBatchId is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});