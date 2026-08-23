import fs from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

// The sampler's legacy FFmpeg-path import currently pulls the full analysis
// service (and its Mongo bootstrap) at module load. Frame extraction is injected
// in this suite, so keep that unrelated process-global dependency out of scope.
vi.mock('@/lib/editron/services/media/analysis-service', () => ({
  getFFmpegPath: () => 'ffmpeg',
}));

import {
  buildReferenceFrameVersionAssetId,
  sampleReferenceVideoFrames,
} from '@/lib/editron/reference-video/reference-frame-sampler';
import type { UploadOptions, UploadResult } from '@/lib/editron/services/upload-service';
import {
  registerReferenceMaterializedMediaAssetV1,
  type ReferenceMaterializedMediaAssetRowV1,
  type ReferenceMaterializedMediaAssetStoreV1,
} from '@/lib/editron/reference-video/reference-materialized-media-registration-v1';

describe('reference frame sampler media registration', () => {
  it('returns only frames registered with exact byte, storage, source and timestamp identity', async () => {
    const store = new MemoryStore();
    const frameBytes = Buffer.from('deterministic-jpeg-frame');
    const upload = vi.fn(async (
      bytes: Buffer,
      _userId: string,
      filename: string,
      contentType: string,
      options?: UploadOptions,
    ): Promise<UploadResult> => ({
      assetId: options?.customAssetId ?? 'unexpected',
      signedUrl: `https://cdn.example.com/${filename}`,
      gcsPath: null,
      r2Key: `r2/${options?.customAssetId}`,
      urlExpiresAt: null,
      size: bytes.byteLength,
      contentType,
    }));
    const samples = await sampleReferenceVideoFrames({
      videoUrl: 'D:/fixtures/reference.mp4',
      userId: 'user-1',
      referenceAssetId: 'source_asset',
      durationSec: 4,
      sampleCount: 2,
    }, {
      upload,
      extractFrame: async ({ outputPath }) => { await fs.writeFile(outputPath, frameBytes); },
      register: (input) => registerReferenceMaterializedMediaAssetV1(input, { store }),
    });

    expect(samples).toHaveLength(2);
    expect(samples.map(({ frameId, timestampUs }) => ({ frameId, timestampUs }))).toEqual([
      { frameId: 'frame_000000', timestampUs: '0' },
      { frameId: 'frame_000001', timestampUs: '3500000' },
    ]);
    expect(samples[0]).toMatchObject({
      mimeType: 'image/jpeg',
      byteLength: frameBytes.length,
      storage: { backend: 'R2' },
    });
    expect(store.rows).toHaveLength(2);
    expect(store.rows[1]).toMatchObject({
      contentHash: samples[1].bytesSha256,
      referenceMaterialization: {
        role: 'DERIVED_FRAME', sourceAssetId: 'source_asset',
        frameId: 'frame_000001', timestampUs: '3500000',
      },
    });
    expect(upload).toHaveBeenCalledTimes(2);
    expect(samples[0].assetId).toBe(buildReferenceFrameVersionAssetId(
      samples[0].assetId.slice(0, -17), samples[0].bytesSha256,
    ));
  });

  it('uses a new object identity when exact frame bytes change', () => {
    const logical = 'ref_frame_1';
    expect(buildReferenceFrameVersionAssetId(logical, 'a'.repeat(64)))
      .not.toBe(buildReferenceFrameVersionAssetId(logical, 'b'.repeat(64)));
  });

  it('does not return an orphaned frame when registration fails', async () => {
    await expect(sampleReferenceVideoFrames({
      videoUrl: 'D:/fixtures/reference.mp4',
      userId: 'user-1', referenceAssetId: 'source_asset', sampleCount: 1,
    }, {
      extractFrame: async ({ outputPath }) => { await fs.writeFile(outputPath, 'frame'); },
      upload: async (bytes) => ({
        assetId: 'frame_asset', signedUrl: 'https://cdn.example.com/frame.jpg',
        gcsPath: null, r2Key: 'frame_asset', urlExpiresAt: null,
        size: bytes.byteLength, contentType: 'image/jpeg',
      }),
      register: async () => { throw new Error('registration unavailable'); },
    })).rejects.toThrow('registration unavailable');
  });
});

class MemoryStore implements ReferenceMaterializedMediaAssetStoreV1 {
  readonly rows: ReferenceMaterializedMediaAssetRowV1[] = [];

  async createOrRead(row: Readonly<ReferenceMaterializedMediaAssetRowV1>) {
    this.rows.push(structuredClone(row));
    return structuredClone(row);
  }
}
