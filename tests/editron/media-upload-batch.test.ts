import { describe, expect, it, vi } from 'vitest';

import {
  buildMediaUploadBatchAssetUpsert,
  buildMediaUploadBatchSummary,
  encodeUploadBatchAssetKey,
  normalizeMediaUploadBatchIntake,
  normalizeUploadBatchId,
  persistMediaUploadBatchAsset,
  MEDIA_UPLOAD_BATCHES_COLLECTION,
} from '../../lib/editron/services/media-upload-batch';

describe('media upload batch manifest', () => {
  it('normalizes batch ids and rejects empty ids', () => {
    expect(normalizeUploadBatchId(' upload batch:1 ')).toBe('upload_batch:1');
    expect(normalizeUploadBatchId('a'.repeat(200))).toHaveLength(128);
    expect(() => normalizeUploadBatchId('   ')).toThrow('uploadBatchId is required');
  });

  it('normalizes optional batch intake before manifest persistence', () => {
    const normalized = normalizeMediaUploadBatchIntake({
      aspectRatio: ' 9:16 ',
      platform: 'instagram_reels',
      userIntent: '  make a fast launch reel  ',
      script: ` ${'x'.repeat(12050)} `,
      captionStyle: '',
      musicPreference: ' match_video ',
      unknown: 'drop me',
      pacingFeel: ['fast'],
    });

    expect(normalized).toEqual({
      aspectRatio: '9:16',
      platform: 'instagram_reels',
      userIntent: 'make a fast launch reel',
      script: 'x'.repeat(12000),
      musicPreference: 'match_video',
    });
    expect(normalizeMediaUploadBatchIntake(null)).toBeUndefined();
    expect(normalizeMediaUploadBatchIntake({ userIntent: '   ' })).toBeUndefined();
  });
  it('builds an idempotent manifest upsert with Mongo-safe asset keys', () => {
    const now = new Date('2026-07-06T00:00:00.000Z');
    const key = encodeUploadBatchAssetKey('asset.with.$unsafe.parts');
    const write = buildMediaUploadBatchAssetUpsert({
      uploadBatchId: ' upload_batch_1 ',
      userId: 'user_1',
      orgId: 'org_1',
      asset: {
        assetId: 'asset.with.$unsafe.parts',
        filename: 'clip.mp4',
        type: 'video',
        size: 123,
        duration: 9.5,
      },
    }, now);

    expect(key).not.toContain('.');
    expect(key).not.toContain('$');
    expect(write).toEqual({
      filter: { uploadBatchId: 'upload_batch_1', userId: 'user_1' },
      update: {
        $set: {
          uploadBatchId: 'upload_batch_1',
          userId: 'user_1',
          orgId: 'org_1',
          updatedAt: now,
          [`assetsById.${key}`]: {
            assetId: 'asset.with.$unsafe.parts',
            filename: 'clip.mp4',
            type: 'video',
            size: 123,
            duration: 9.5,
            dimensions: undefined,
            thumbnail: undefined,
            registeredAt: now,
            updatedAt: now,
          },
          [`assetIndex.${key}`]: { assetId: 'asset.with.$unsafe.parts', updatedAt: now },
        },
        $setOnInsert: { createdAt: now },
        $addToSet: { assetIds: 'asset.with.$unsafe.parts' },
      },
      options: { upsert: true },
    });
  });

  it('stores sanitized production brief intake on the batch manifest', () => {
    const now = new Date('2026-07-06T00:00:00.000Z');
    const write = buildMediaUploadBatchAssetUpsert({
      uploadBatchId: 'batch_1',
      userId: 'user_1',
      intake: {
        userIntent: '  cut this as a product teaser  ',
        script: 'Opening line',
        musicPreference: 'subtle_bed',
        pacingFeel: 123,
      },
      asset: { assetId: 'asset_1', filename: 'clip.mp4', type: 'video', size: 99 },
    }, now);

    expect(write.update.$set.productionBriefIntake).toEqual({
      userIntent: 'cut this as a product teaser',
      script: 'Opening line',
      musicPreference: 'subtle_bed',
    });
  });
  it('persists the manifest to the upload batch collection', async () => {
    const updateOne = vi.fn().mockResolvedValue({ acknowledged: true });
    const collection = vi.fn().mockReturnValue({ updateOne });
    const now = new Date('2026-07-06T00:00:00.000Z');

    await persistMediaUploadBatchAsset({ collection }, {
      uploadBatchId: 'batch_1',
      userId: 'user_1',
      asset: { assetId: 'asset_1', filename: 'image.png', type: 'image', size: 99 },
    }, now);

    expect(collection).toHaveBeenCalledWith(MEDIA_UPLOAD_BATCHES_COLLECTION);
    expect(updateOne).toHaveBeenCalledWith(
      { uploadBatchId: 'batch_1', userId: 'user_1' },
      expect.objectContaining({
        $addToSet: { assetIds: 'asset_1' },
      }),
      { upsert: true },
    );
  });

  it('derives readiness from live media asset analysis state', () => {
    const summary = buildMediaUploadBatchSummary([
      { assetId: 'ready_1', filename: 'a.mp4', type: 'video', size: 10, analysisStatus: 'complete' },
      { assetId: 'queued_1', filename: 'b.png', type: 'image', size: 20, analysisStatus: 'queued' },
      { assetId: 'failed_1', filename: 'c.mp4', type: 'video', size: 30, analysisStatus: 'dispatch_failed', analysisError: 'qstash down' },
      { assetId: 'skipped_1', filename: 'd.png', type: 'image', size: 40, analysisStatus: 'skipped_insufficient_credits', analysisSkipReason: 'insufficient_credits' },
    ]);

    expect(summary.status).toBe('analyzing');
    expect(summary.canCreateProject).toBe(false);
    expect(summary.counts).toMatchObject({ total: 4, ready: 1, queued: 1, failed: 1, skipped: 1 });
    expect(summary.assets.find((asset) => asset.assetId === 'failed_1')).toMatchObject({
      readiness: 'failed',
      needsAttention: true,
      blockingReason: 'qstash down',
    });
  });

  it('allows project creation when at least one ready asset remains and nothing is still analyzing', () => {
    const summary = buildMediaUploadBatchSummary([
      { assetId: 'ready_1', filename: 'a.mp4', type: 'video', size: 10, analysisStatus: 'complete' },
      { assetId: 'skipped_1', filename: 'b.png', type: 'image', size: 20, analysisStatus: 'skipped_credit_deduction_failed' },
    ]);

    expect(summary.status).toBe('needs_attention');
    expect(summary.canCreateProject).toBe(true);
  });
});