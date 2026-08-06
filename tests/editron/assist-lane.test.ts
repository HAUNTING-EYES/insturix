/**
 * Assist lane (Director Mode) — Lane A phase 1 guardrails.
 *
 * 1. The chronological materializer moved out of the from-batch route MUST keep
 *    its exact auto-lane behavior (uploadedAt order, untrimmed videos, 4s image
 *    hold, duration-less video clamp, hook/body/outro roles, URL fallback chain)
 *    — the move is behavior-identical.
 * 2. The assist partition is what protects the zero-edit invariant: duration-less
 *    videos are EXCLUDED (degraded/retry), never silently clamped onto the timeline.
 * 3. The lane guard + server-side flag are the only two switches the three
 *    director-invocation sites consult.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const mocks = vi.hoisted(() => ({
  r2Available: { value: false },
  resolveAssetUrl: vi.fn(async (assetId: string) => `https://cdn.test/${assetId}`),
}));

vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: { resolveAssetUrl: mocks.resolveAssetUrl },
}));
vi.mock('@/lib/editron/services/r2-service', () => ({
  isR2Available: () => {
    if (mocks.r2Available.value === null) throw new Error('r2 config exploded');
    return mocks.r2Available.value;
  },
  getR2PublicUrl: (id: string) => `https://r2.test/${id}`,
}));
vi.mock('@/lib/pipeline/scene-to-editron', () => ({ ROW: { VIDEO: 2 } }));

import {
  DEFAULT_IMAGE_HOLD_SEC,
  FPS,
  materializeChronologicalFallback,
  resolveOverlayUrl,
  type MaterializableAsset,
} from '@/lib/editron/services/timeline-materializer';
import {
  isAssistIntakeEnabled,
  isAssistProject,
  parseEditMode,
  partitionAssistAssets,
} from '@/lib/editron/services/assist-lane';
import {
  CURRENT_NATIVE_VIDEO_AUDIO_RIGHTS_ATTESTATION,
  buildNativeVideoAudioRights,
} from '@/lib/editron/services/native-video-audio-rights';

const asset = (over: Partial<MaterializableAsset>): MaterializableAsset => ({
  assetId: 'a-default',
  type: 'video',
  ...over,
});

const dims = { width: 1920, height: 1080 };

beforeEach(() => {
  mocks.r2Available.value = false;
  mocks.resolveAssetUrl.mockReset();
  mocks.resolveAssetUrl.mockImplementation(async (assetId: string) => `https://cdn.test/${assetId}`);
});

describe('materializeChronologicalFallback (behavior-identical move)', () => {
  it('wires canonical native-audio rights into single and Storyline constructors', () => {
    const singleSource = readFileSync(
      join(process.cwd(), 'app/api/services/editron/auto-edit/from-asset/route.ts'),
      'utf8',
    );
    const batchSource = readFileSync(
      join(process.cwd(), 'app/api/services/editron/auto-edit/from-batch/route.ts'),
      'utf8',
    );

    expect(singleSource).toContain('readStoredNativeVideoAudioRights(asset)');
    expect(singleSource).toContain('audioRights: nativeVideoAudioRights');
    expect(batchSource).toContain('readStoredNativeVideoAudioRights(asset)');
    expect(batchSource).toContain('audioRights: nativeVideoAudioRights');
  });

  it('lays down all visual assets untrimmed, in uploadedAt order, images at the hold duration', async () => {
    const timeline = await materializeChronologicalFallback(
      [
        asset({ assetId: 'v-late', duration: 10, uploadedAt: '2026-07-01T00:02:00Z' }),
        asset({ assetId: 'img', type: 'image', uploadedAt: '2026-07-01T00:01:00Z' }),
        asset({ assetId: 'v-early', duration: '6.5', uploadedAt: '2026-07-01T00:00:00Z' }),
        asset({ assetId: 'song', type: 'audio', uploadedAt: '2026-07-01T00:00:30Z' }),
      ],
      'user_1', 'batch_1', dims,
    );

    expect(timeline.source).toBe('chronological-fallback');
    expect(timeline.clipCount).toBe(3);
    expect(timeline.overlays.map((o) => o.assetId)).toEqual(['v-early', 'img', 'v-late']);
    expect(timeline.overlays.map((o) => o.durationInFrames)).toEqual([
      Math.round(6.5 * FPS),
      DEFAULT_IMAGE_HOLD_SEC * FPS,
      10 * FPS,
    ]);
    for (const o of timeline.overlays.filter((o) => o.type === 'video')) {
      expect(o.sourceStartFrame).toBe(0);
      expect(o.videoStartTime).toBe(0);
    }
    expect(timeline.durationInFrames).toBe(Math.round(6.5 * FPS) + DEFAULT_IMAGE_HOLD_SEC * FPS + 10 * FPS);
    // overlays tile the timeline with no gaps
    let cursor = 0;
    for (const o of timeline.overlays) {
      expect(o.from).toBe(cursor);
      cursor += o.durationInFrames as number;
    }
  });

  it('keeps the auto-lane clamp: a duration-less video gets the image hold (assist must pre-partition)', async () => {
    const timeline = await materializeChronologicalFallback(
      [asset({ assetId: 'v-noprobe', duration: null })],
      'user_1', 'batch_1', dims,
    );
    expect(timeline.overlays[0]?.durationInFrames).toBe(DEFAULT_IMAGE_HOLD_SEC * FPS);
  });

  it('assigns hook/body/outro roles by position; a single clip is the hook', async () => {
    const three = await materializeChronologicalFallback(
      [
        asset({ assetId: 'a', duration: 1, uploadedAt: '2026-07-01T00:00:00Z' }),
        asset({ assetId: 'b', duration: 1, uploadedAt: '2026-07-01T00:00:01Z' }),
        asset({ assetId: 'c', duration: 1, uploadedAt: '2026-07-01T00:00:02Z' }),
      ],
      'u', 'b1', dims,
    );
    expect(three.overlays.map((o) => (o.storyline as { role: string }).role)).toEqual(['hook', 'body', 'outro']);

    const one = await materializeChronologicalFallback([asset({ assetId: 'solo', duration: 2 })], 'u', 'b1', dims);
    expect((one.overlays[0]?.storyline as { role: string }).role).toBe('hook');
  });

  it('missing uploadedAt sorts as epoch (first); empty and all-audio batches produce empty timelines', async () => {
    const mixed = await materializeChronologicalFallback(
      [
        asset({ assetId: 'dated', duration: 1, uploadedAt: '2026-07-01T00:00:00Z' }),
        asset({ assetId: 'undated', duration: 1 }),
      ],
      'u', 'b1', dims,
    );
    expect(mixed.overlays.map((o) => o.assetId)).toEqual(['undated', 'dated']);

    const empty = await materializeChronologicalFallback([], 'u', 'b1', dims);
    expect(empty.overlays).toEqual([]);
    expect(empty.durationInFrames).toBe(0);
    expect(empty.clipCount).toBe(0);

    const audioOnly = await materializeChronologicalFallback(
      [asset({ assetId: 'song', type: 'audio' })], 'u', 'b1', dims,
    );
    expect(audioOnly.overlays).toEqual([]);
  });

  it('stamps dims, video thumbnail as content, and image enter/exit animation', async () => {
    const timeline = await materializeChronologicalFallback(
      [
        asset({ assetId: 'v', duration: 1, thumbnail: 'thumb.jpg', uploadedAt: '2026-07-01T00:00:00Z' }),
        asset({ assetId: 'i', type: 'image', uploadedAt: '2026-07-01T00:00:01Z' }),
      ],
      'u', 'b1', { width: 1080, height: 1920 },
    );
    const [video, image] = timeline.overlays;
    expect(video.width).toBe(1080);
    expect(video.height).toBe(1920);
    expect(video.content).toBe('thumb.jpg');
    expect(image.content).toBe('https://cdn.test/i');
    expect((image.styles as { animation?: unknown }).animation).toEqual({ enter: 'fadeIn', exit: 'fadeOut' });
    expect((video.styles as { opacity?: number }).opacity).toBe(1);
  });

  it('copies only a canonical matching native-audio receipt onto video overlays', async () => {
    const rights = buildNativeVideoAudioRights({
      sourceAssetId: 'video-rights',
      userId: 'user_1',
      attestation: CURRENT_NATIVE_VIDEO_AUDIO_RIGHTS_ATTESTATION,
      attestedAt: new Date('2026-07-28T00:00:00.000Z'),
    });
    const timeline = await materializeChronologicalFallback(
      [
        asset({
          assetId: 'video-rights',
          type: 'video',
          source: 'user-upload',
          duration: 2,
          audioRights: rights,
        }),
        asset({
          assetId: 'video-mismatch',
          type: 'video',
          source: 'user-upload',
          duration: 2,
          audioRights: rights,
        }),
      ],
      'user_1',
      'batch_1',
      dims,
    );

    expect(timeline.overlays[0]?.audioRights).toEqual(rights);
    expect(timeline.overlays[1]?.audioRights).toBeUndefined();
  });
});

describe('resolveOverlayUrl fallback chain', () => {
  const a = asset({ assetId: 'x', publicUrl: 'https://pub.test/x', cachedUrl: 'https://cache.test/x' });

  it('prefers R2 when available and never calls the resolver', async () => {
    mocks.r2Available.value = true;
    expect(await resolveOverlayUrl(a, 'u')).toBe('https://r2.test/x');
    expect(mocks.resolveAssetUrl).not.toHaveBeenCalled();
  });

  it('falls to the asset resolver when R2 is off, and survives an R2 module explosion', async () => {
    expect(await resolveOverlayUrl(a, 'u')).toBe('https://cdn.test/x');
    mocks.r2Available.value = null as unknown as boolean; // isR2Available throws
    expect(await resolveOverlayUrl(a, 'u')).toBe('https://cdn.test/x');
  });

  it('resolver failure → publicUrl → cachedUrl → empty string', async () => {
    mocks.resolveAssetUrl.mockRejectedValue(new Error('resolver down'));
    expect(await resolveOverlayUrl(a, 'u')).toBe('https://pub.test/x');
    expect(await resolveOverlayUrl(asset({ assetId: 'x', cachedUrl: 'https://cache.test/x' }), 'u')).toBe('https://cache.test/x');
    expect(await resolveOverlayUrl(asset({ assetId: 'x' }), 'u')).toBe('');
  });
});

describe('partitionAssistAssets (zero-edit invariant guard)', () => {
  it('excludes duration-less videos as degraded instead of letting them be clamped', () => {
    const { usableAssets, excludedNoDurationAssetIds } = partitionAssistAssets([
      asset({ assetId: 'v-good', duration: 12 }),
      asset({ assetId: 'v-string', duration: '3.25' }),
      asset({ assetId: 'v-none', duration: null }),
      asset({ assetId: 'v-zero', duration: 0 }),
      asset({ assetId: 'img-nodur', type: 'image' }),
      asset({ assetId: 'song', type: 'audio' }),
    ]);
    expect(usableAssets.map((a) => a.assetId)).toEqual(['v-good', 'v-string', 'img-nodur', 'song']);
    expect(excludedNoDurationAssetIds).toEqual(['v-none', 'v-zero']);
  });

  it('empty input partitions to empty outputs', () => {
    expect(partitionAssistAssets([])).toEqual({ usableAssets: [], excludedNoDurationAssetIds: [] });
  });
});

describe('lane guard + flag', () => {
  it('parseEditMode accepts only the two lane values', () => {
    expect(parseEditMode('auto')).toBe('auto');
    expect(parseEditMode('assist')).toBe('assist');
    expect(parseEditMode('ASSIST')).toBeUndefined();
    expect(parseEditMode(1)).toBeUndefined();
    expect(parseEditMode(undefined)).toBeUndefined();
  });

  it('isAssistProject is false for every existing project shape (auto, legacy, absent)', () => {
    expect(isAssistProject({ editMode: 'assist' })).toBe(true);
    expect(isAssistProject({ editMode: 'auto' })).toBe(false);
    expect(isAssistProject({})).toBe(false);
    expect(isAssistProject(null)).toBe(false);
    expect(isAssistProject(undefined)).toBe(false);
  });

  it('server-side flag is dark by default and only opens on exact truthy values', () => {
    expect(isAssistIntakeEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isAssistIntakeEnabled({ DIRECTOR_MODE_ENABLED: 'false' } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(isAssistIntakeEnabled({ DIRECTOR_MODE_ENABLED: 'TRUE' } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(isAssistIntakeEnabled({ DIRECTOR_MODE_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(isAssistIntakeEnabled({ DIRECTOR_MODE_ENABLED: '1' } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });

  it('accepts the NEXT_PUBLIC deploy variable so one knob drives client toggle and server gate', () => {
    expect(isAssistIntakeEnabled({ NEXT_PUBLIC_DIRECTOR_MODE_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(isAssistIntakeEnabled({ NEXT_PUBLIC_DIRECTOR_MODE_ENABLED: 'false' } as unknown as NodeJS.ProcessEnv)).toBe(false);
    // The server-only variable wins when both are set.
    expect(isAssistIntakeEnabled({ DIRECTOR_MODE_ENABLED: 'false', NEXT_PUBLIC_DIRECTOR_MODE_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv)).toBe(false);
  });
});
