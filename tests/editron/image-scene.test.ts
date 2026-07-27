import { describe, expect, it } from 'vitest';

import {
  DEFAULT_IMAGE_HOLD_SEC,
  type ImageAssetInput,
  type ImageFacts,
  MAX_IMAGE_HOLD_SEC,
  MIN_IMAGE_HOLD_SEC,
  readTimeHold,
  sceneFromImage,
  scenesFromImages,
  synthesizeImageScenes,
} from '@/lib/editron/storyline/image-scene';

function asset(over: Partial<ImageAssetInput> = {}): ImageAssetInput {
  return { assetId: 'img-1', source: 'https://cdn/a.jpg', createdAt: 1000, ...over };
}

describe('sceneFromImage - maps a still to a Scene', () => {
  it('carries the vision facts onto the Scene (still = no speech)', () => {
    const facts: ImageFacts = {
      visualMode: 'product-shot', detectedText: ['50% OFF'], description: 'a red sneaker',
      dominantColor: { hex: '#f00', name: 'red' }, salience: 0.8, importance: 0.7,
    };
    const s = sceneFromImage(asset({ holdSec: 3 }), facts);
    expect(s.durationSec).toBe(3);
    expect(s.hasSpeech).toBe(false);
    expect(s.transcription).toBe('');
    expect(s.visualMode).toBe('product-shot');
    expect(s.detectedText).toEqual(['50% OFF']);
    expect(s.dominantColor).toEqual({ hex: '#f00', name: 'red' });
    expect(s.salience).toBe(0.8);
    expect(s.importance).toBe(0.7);
    expect(s.createdAt).toBe(1000);
    expect(s.source).toBe('https://cdn/a.jpg');
  });

  it('importance falls back to salience when the vision pass does not score it', () => {
    expect(sceneFromImage(asset(), { salience: 0.6 }).importance).toBe(0.6);
    expect(sceneFromImage(asset(), {}).importance).toBeUndefined();
  });

  it('falls back to assetId as source when none is given', () => {
    expect(sceneFromImage(asset({ source: null }), {}).source).toBe('img-1');
  });
});

describe('image hold duration', () => {
  it('a text-light still gets the default hold', () => {
    expect(readTimeHold({})).toBe(DEFAULT_IMAGE_HOLD_SEC);
    expect(sceneFromImage(asset({ holdSec: null }), {}).durationSec).toBe(DEFAULT_IMAGE_HOLD_SEC);
  });

  it('★ a text-heavy still holds longer (read-time), clamped to the max', () => {
    const heavy: ImageFacts = { detectedText: [Array.from({ length: 60 }, () => 'word').join(' ')] };
    const hold = readTimeHold(heavy);
    expect(hold).toBeGreaterThan(DEFAULT_IMAGE_HOLD_SEC);
    expect(hold).toBeLessThanOrEqual(MAX_IMAGE_HOLD_SEC);
  });

  it('clamps an explicit hold into [min, max]', () => {
    expect(sceneFromImage(asset({ holdSec: 0.1 }), {}).durationSec).toBe(MIN_IMAGE_HOLD_SEC);
    expect(sceneFromImage(asset({ holdSec: 999 }), {}).durationSec).toBe(MAX_IMAGE_HOLD_SEC);
  });
});

describe('scenesFromImages + synthesizeImageScenes', () => {
  it('maps a batch and dedupes identical stills', () => {
    const a = { asset: asset({ assetId: 'a', source: 'a.jpg' }), facts: {} };
    const b = { asset: asset({ assetId: 'b', source: 'b.jpg' }), facts: {} };
    expect(scenesFromImages([a, b, a]).map((s) => s.source)).toEqual(['a.jpg', 'b.jpg']);
  });

  it('★ analyzes each image via the injected vision fn, skipping ones that fail', async () => {
    const vision = async (a: ImageAssetInput): Promise<ImageFacts> => {
      if (a.assetId === 'boom') throw new Error('vision down');
      return { visualMode: 'photo', importance: 0.5 };
    };
    const scenes = await synthesizeImageScenes(
      [asset({ assetId: 'ok1', source: 'ok1.jpg' }), asset({ assetId: 'boom', source: 'boom.jpg' }), asset({ assetId: 'ok2', source: 'ok2.jpg' })],
      vision,
    );
    expect(scenes.map((s) => s.source)).toEqual(['ok1.jpg', 'ok2.jpg']); // boom skipped, rest compose
    expect(scenes.every((s) => s.visualMode === 'photo')).toBe(true);
  });

  it('empty input -> empty output (no crash)', async () => {
    expect(scenesFromImages([])).toEqual([]);
    expect(await synthesizeImageScenes([], async () => ({}))).toEqual([]);
  });
});
