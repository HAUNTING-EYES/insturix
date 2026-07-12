import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/editron/db/mongodb', () => ({
  COLLECTIONS: { MEDIA_ASSETS: 'media_assets' },
  getDatabase: vi.fn(),
}));

vi.mock('@/lib/editron/services/gcs-service', () => ({
  refreshSignedUrl: vi.fn(),
}));

import { OverlayType, type MgSequenceOverlay } from '@/components/editron/editor/version-7.0.0/types';
import { hydrateMgSequenceOverlay, type SequenceMediaAsset } from '@/lib/editron/services/asset-resolver';
import { deleteR2Prefix } from '@/lib/editron/services/r2-service';

function sequenceOverlay(): MgSequenceOverlay {
  return {
    id: 1,
    type: OverlayType.MG_SEQUENCE,
    assetId: 'asset_seqA',
    from: 0,
    durationInFrames: 90,
    row: 6,
    left: 0,
    top: 0,
    width: 1920,
    height: 1080,
    isDragging: false,
    rotation: 0,
    styles: { opacity: 1 },
  };
}

function sequenceAsset(overrides: Partial<SequenceMediaAsset> = {}): SequenceMediaAsset {
  return {
    assetId: 'asset_seqA',
    userId: 'user_1',
    projectId: 'project_1',
    type: 'sequence',
    filename: 'sequence-seqA',
    source: 'generated',
    gcsPath: null,
    cachedUrl: '',
    urlExpiresAt: new Date('2099-01-01'),
    size: 1234,
    dimensions: { width: 1920, height: 1080 },
    uploadedAt: new Date(),
    r2Prefix: 'mgseq_seqA_',
    sequenceId: 'seqA',
    frameCount: 90,
    fps: 30,
    frameFormat: 'webp',
    transparent: true,
    status: 'ready',
    ...overrides,
  };
}

describe('MG sequence asset hydration', () => {
  it('hydrates a compact runtime descriptor without persisting frame URLs', () => {
    const hydrated = hydrateMgSequenceOverlay(sequenceOverlay(), sequenceAsset(), 'cdn.example.com/');
    expect(hydrated.sequence).toEqual({
      sequenceId: 'seqA',
      frameCount: 90,
      fps: 30,
      width: 1920,
      height: 1080,
      transparent: true,
      frameFormat: 'webp',
      cdnBaseUrl: 'https://cdn.example.com',
    });
    expect(hydrated).not.toHaveProperty('frameUrls');
  });

  it('fails closed for incomplete, unready, or mismatched sequence records', () => {
    expect(() => hydrateMgSequenceOverlay(sequenceOverlay(), undefined, 'cdn.example.com')).toThrow(/missing/);
    expect(() => hydrateMgSequenceOverlay(sequenceOverlay(), sequenceAsset({ status: 'processing' }), 'cdn.example.com')).toThrow(/not ready/);
    expect(() => hydrateMgSequenceOverlay(sequenceOverlay(), sequenceAsset({ r2Prefix: 'wrong_' }), 'cdn.example.com')).toThrow(/R2 prefix/);
  });
});

describe('MG sequence R2 lifecycle', () => {
  it('paginates listing and deletes every object under one validated sequence prefix', async () => {
    const send = vi.fn(async (command: any) => {
      if (command.constructor.name === 'ListObjectsV2Command') {
        return command.input.ContinuationToken
          ? { Contents: [{ Key: 'mgseq_seqA_00002' }], IsTruncated: false }
          : { Contents: [{ Key: 'mgseq_seqA_00000' }, { Key: 'mgseq_seqA_00001' }], IsTruncated: true, NextContinuationToken: 'next' };
      }
      if (command.constructor.name === 'DeleteObjectsCommand') return { Errors: [] };
      throw new Error(`Unexpected command ${command.constructor.name}`);
    });

    await expect(deleteR2Prefix('mgseq_seqA_', { send })).resolves.toBe(3);
    expect(send.mock.calls.filter(([command]) => command.constructor.name === 'DeleteObjectsCommand')).toHaveLength(2);
  });

  it('refuses broad prefixes and surfaces partial object deletion failures', async () => {
    await expect(deleteR2Prefix('', { send: vi.fn() })).rejects.toThrow(/unsafe/);
    const send = vi.fn(async (command: any) => command.constructor.name === 'ListObjectsV2Command'
      ? { Contents: [{ Key: 'mgseq_seqA_00000' }], IsTruncated: false }
      : { Errors: [{ Key: 'mgseq_seqA_00000', Code: 'AccessDenied' }] });
    await expect(deleteR2Prefix('mgseq_seqA_', { send })).rejects.toThrow(/AccessDenied/);
  });
});

describe('MG sequence deletion wiring', () => {
  it('keeps both manual deletion and LRU eviction prefix-aware and bytes-first', () => {
    const route = readFileSync('app/api/services/editron/media/delete/route.ts', 'utf8');
    const eviction = readFileSync('lib/editron/services/storage-eviction-service.ts', 'utf8');
    expect(route).toContain('await deleteR2Prefix(asset.r2Prefix)');
    expect(route.indexOf('await deleteR2Prefix(asset.r2Prefix)')).toBeLessThan(route.indexOf('.deleteOne({ assetId, userId })'));
    expect(route).not.toContain('Error deleting from storage:');
    expect(eviction).toContain('await deleteR2Prefix(a.r2Prefix)');
    expect(eviction).toContain("source: { $in: ['user-upload', 'generated'] }");
  });
});
