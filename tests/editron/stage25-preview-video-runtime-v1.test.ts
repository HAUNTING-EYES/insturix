import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  OverlayType,
  type ClipOverlay,
} from '@/components/editron/editor/version-7.0.0/types';
import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  materializeStage25PreviewMediaFixtureV1,
  type Stage25PreviewMediaFixtureReceiptV1,
} from '@/lib/editron/research/open-ended-planner/stage25-preview-media-fixture-v1';
import {
  assembleStage25GeneratedContinuationPreviewV1,
  renderStage25NativeOverlayPreviewV1,
} from '@/lib/editron/research/open-ended-planner/stage25-preview-video-runtime-v1';

describe('Stage 2.5 bounded preview media/runtime', () => {
  let root = '';
  let media: Readonly<Stage25PreviewMediaFixtureReceiptV1>;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'editron-stage25-preview-'));
    media = await materializeStage25PreviewMediaFixtureV1({
      outputDir: path.join(root, 'media'),
      createdAt: '2026-08-26T00:00:00.000Z',
    });
  }, 180_000);

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('materializes exact, hash-bound continuation media without claiming product authority', async () => {
    const { receiptHash, hostPaths, ...portable } = media;
    expect(receiptHash).toBe(hashCanonicalJsonV1(portable));
    expect(media.authority).toBe('LOCAL_RESEARCH_FIXTURE_MATERIALIZER_ONLY');
    expect(media.videoContract).toEqual({
      width: 540,
      height: 960,
      frameRate: '30/1',
      frameCount: 210,
      codec: 'h264',
      audioStreamCount: 0,
      colorIntent: 'SDR_BT709_LIMITED',
    });
    expect(media.assets).toHaveLength(4);
    expect(media.stateEffects).toHaveLength(4);
    const productC = media.assets.find(({ assetId }) => assetId === 'rhc01-product-c');
    const following = media.assets.find(({ assetId }) => assetId === 'rhc01-following-shot');
    expect(productC?.sha256).toBe(following?.sha256);
    expect(Object.keys(hostPaths.assetPaths)).toEqual([
      'rhc01-product-a',
      'rhc01-product-b',
      'rhc01-product-c',
      'rhc01-following-shot',
    ]);
    await expect(materializeStage25PreviewMediaFixtureV1({
      outputDir: path.join(root, 'media'),
      createdAt: '2026-08-26T00:00:00.000Z',
    })).rejects.toMatchObject({ code: 'EEXIST' });
  });

  it('renders an actual native editor overlay to an exact muted proxy and proof stills', async () => {
    const src = '/rhc01-product-a.mp4';
    const overlay: ClipOverlay = {
      id: 1,
      type: OverlayType.VIDEO,
      content: src,
      src,
      assetId: 'rhc01-product-a',
      from: 0,
      durationInFrames: 30,
      videoStartTime: 0,
      hasNativeAudio: false,
      row: 0,
      left: 0,
      top: 0,
      width: 270,
      height: 480,
      rotation: 0,
      isDragging: false,
      styles: { objectFit: 'cover', objectPosition: '50% 50%', opacity: 1, volume: 0 },
    };
    const result = await renderStage25NativeOverlayPreviewV1({
      overlays: [overlay],
      durationInFrames: 30,
      fps: 30,
      width: 270,
      height: 480,
      assetPaths: media.hostPaths.assetPaths,
      outputDir: path.join(root, 'native'),
      outputFileName: 'native-smoke.mp4',
      proofFrames: [0, 15, 29],
    });
    expect(result.probe).toEqual({
      codec: 'h264', width: 270, height: 480, frameRate: '30/1', frameCount: 30,
      durationSeconds: 1, audioStreamCount: 0,
    });
    expect(result.stills).toHaveLength(3);
    expect(result.stills.every(({ sha256 }) => /^[a-f0-9]{64}$/.test(sha256))).toBe(true);
    expect(result.browserErrors).toEqual([]);
  }, 180_000);

  it('assembles a generated-island boundary and measures its exact source continuation', async () => {
    const result = await assembleStage25GeneratedContinuationPreviewV1({
      islandPath: media.hostPaths.assetPaths['rhc01-product-c'],
      followingPath: media.hostPaths.assetPaths['rhc01-following-shot'],
      islandFrames: 210,
      followingSourceStartFrame: 180,
      totalFrames: 240,
      fps: 30,
      width: 540,
      height: 960,
      outputPath: path.join(root, 'assembly', 'assembled.mp4'),
    });
    expect(result.probe).toEqual({
      codec: 'h264', width: 540, height: 960, frameRate: '30/1', frameCount: 240,
      durationSeconds: 8, audioStreamCount: 0,
    });
    expect(result.boundaryEvidence.islandExitToOutputExit).toBeLessThan(0.03);
    expect(result.boundaryEvidence.outputEntryToSourceEntry).toBeLessThan(0.03);
    expect(result.boundaryEvidence.outputBoundaryDelta).toBeGreaterThan(0);
    expect(result.boundaryEvidence.naturalSourceBoundaryDelta).toBeGreaterThan(0);
  }, 180_000);
});
