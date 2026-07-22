/**
 * Assist lane (Director Mode) — Lane A phase 1 guardrails.
 *
 * 1. The chronological materializer moved out of the from-batch route MUST keep
 *    its exact auto-lane behavior (uploadedAt order, untrimmed videos, 4s image
 *    hold, duration-less video clamp) — the move is behavior-identical.
 * 2. The assist partition is what protects the zero-edit invariant: duration-less
 *    videos are EXCLUDED (degraded/retry), never silently clamped onto the timeline.
 * 3. The lane guard + server-side flag are the only two switches the three
 *    director-invocation sites consult.
 */
import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';

vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: { resolveAssetUrl: vi.fn(async (assetId: string) => `https://cdn.test/${assetId}`) },
}));
vi.mock('@/lib/editron/services/r2-service', () => ({
  isR2Available: () => false,
  getR2PublicUrl: (id: string) => `https://r2.test/${id}`,
}));
vi.mock('@/lib/pipeline/scene-to-editron', () => ({ ROW: { VIDEO: 2 } }));

import {
  DEFAULT_IMAGE_HOLD_SEC,
  FPS,
  materializeChronologicalFallback,
  type MaterializableAsset,
} from '@/lib/editron/services/timeline-materializer';
import {
  isAssistIntakeEnabled,
  isAssistProject,
  parseEditMode,
  partitionAssistAssets,
} from '@/lib/editron/services/assist-lane';

const asset = (over: Partial<MaterializableAsset>): MaterializableAsset => ({
  assetId: 'a-default',
  type: 'video',
  ...over,
});

describe('materializeChronologicalFallback (behavior-identical move)', () => {
  it('lays down all visual assets untrimmed, in uploadedAt order, images at the hold duration', async () => {
    const timeline = await materializeChronologicalFallback(
      [
        asset({ assetId: 'v-late', duration: 10, uploadedAt: '2026-07-01T00:02:00Z' }),
        asset({ assetId: 'img', type: 'image', uploadedAt: '2026-07-01T00:01:00Z' }),
        asset({ assetId: 'v-early', duration: '6.5', uploadedAt: '2026-07-01T00:00:00Z' }),
        asset({ assetId: 'song', type: 'audio', uploadedAt: '2026-07-01T00:00:30Z' }),
      ],
      'user_1',
      'batch_1',
      { width: 1920, height: 1080 },
    );

    expect(timeline.source).toBe('chronological-fallback');
    expect(timeline.overlays.map((o) => o.assetId)).toEqual(['v-early', 'img', 'v-late']);
    const durations = timeline.overlays.map((o) => o.durationInFrames);
    expect(durations).toEqual([
      Math.round(6.5 * FPS),
      DEFAULT_IMAGE_HOLD_SEC * FPS,
      10 * FPS,
    ]);
    // untrimmed: every video starts at source frame 0
    for (const o of timeline.overlays.filter((o) => o.type === 'video')) {
      expect(o.sourceStartFrame).toBe(0);
      expect(o.videoStartTime).toBe(0);
    }
    expect(timeline.durationInFrames).toBe(Math.round(6.5 * FPS) + DEFAULT_IMAGE_HOLD_SEC * FPS + 10 * FPS);
  });

  it('keeps the auto-lane clamp: a duration-less video gets the image hold (assist must pre-partition)', async () => {
    const timeline = await materializeChronologicalFallback(
      [asset({ assetId: 'v-noprobe', duration: null })],
      'user_1',
      'batch_1',
      { width: 1080, height: 1920 },
    );
    expect(timeline.overlays[0]?.durationInFrames).toBe(DEFAULT_IMAGE_HOLD_SEC * FPS);
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
    ]);
    expect(usableAssets.map((a) => a.assetId)).toEqual(['v-good', 'v-string', 'img-nodur']);
    expect(excludedNoDurationAssetIds).toEqual(['v-none', 'v-zero']);
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

  it('server-side flag is dark by default and only opens on explicit truthy values', () => {
    expect(isAssistIntakeEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isAssistIntakeEnabled({ DIRECTOR_MODE_ENABLED: 'false' } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(isAssistIntakeEnabled({ DIRECTOR_MODE_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(isAssistIntakeEnabled({ DIRECTOR_MODE_ENABLED: '1' } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });
});
