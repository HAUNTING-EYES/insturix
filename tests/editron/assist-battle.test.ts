/**
 * BATTLE LANE — adversarial attacks on every pure Director Mode surface.
 * The goal of each case is to BREAK an invariant: silent trims, crashed
 * builders, fabricated counts, hostile input shapes, degenerate scales.
 * Route/worker-level attacks live in the harness suites; money-path attacks
 * in assist-cancel-route.test.ts.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/editron/services/asset-resolver', () => ({
  assetResolver: { resolveAssetUrl: vi.fn(async (assetId: string) => `https://cdn.test/${assetId}`) },
}));
vi.mock('@/lib/editron/services/r2-service', () => ({
  isR2Available: () => false,
  getR2PublicUrl: (id: string) => `https://r2.test/${id}`,
}));
vi.mock('@/lib/pipeline/scene-to-editron', () => ({ ROW: { VIDEO: 2 } }));

// The hydration attacks own the FILTER contract: the real builder must only ever
// receive context-ready video overlays. The builder itself is mocked (its input
// doc shape is deep); the real-builder integration is covered by the live-upload
// E2E gate. The validity predicate mirrors the route harness's.
const builderMock = vi.hoisted(() => ({
  buildMultiAssetDirectorContext: vi.fn(() => ({
    rawFootageAnalysis: { timelineCoordinateSpace: 'canonical-edited-v1' },
    segmentAnalysis: { version: 1, segments: [] },
    vjepaAnalysis: null,
    wav2vecAnalysis: null,
    momentWeightMap: null,
    musicAnalysis: null,
    provenance: { version: 'test', coordinateSpace: 'canonical-edited-v1', selectedVideoClipCount: 1, sourceAssetCount: 1 },
  })),
}));
vi.mock('@/lib/editron/services/multi-asset-director-context', () => ({
  buildMultiAssetDirectorContext: builderMock.buildMultiAssetDirectorContext,
  isCanonicalAnalysisComplete: (doc: unknown) =>
    Boolean((doc as { rawFootageAnalysis?: unknown } | null)?.rawFootageAnalysis
      && (doc as { segmentAnalysis?: unknown } | null)?.segmentAnalysis),
}));

import {
  materializeChronologicalFallback,
  type MaterializableAsset,
} from '@/lib/editron/services/timeline-materializer';
import {
  buildAssistHydration,
  isAssistProject,
  parseEditMode,
  partitionAssistAssets,
} from '@/lib/editron/services/assist-lane';
import { buildAssistBriefing } from '@/lib/editron/services/assist-briefing';

const asset = (over: Partial<MaterializableAsset>): MaterializableAsset => ({
  assetId: 'a', type: 'video', ...over,
});

describe('ATTACK: partition — hostile durations must never sneak onto the timeline', () => {
  it('NaN, Infinity-string, negative, boolean-ish, and whitespace durations are all degraded', () => {
    const { usableAssets, excludedNoDurationAssetIds } = partitionAssistAssets([
      asset({ assetId: 'nan', duration: NaN }),
      asset({ assetId: 'neg', duration: -4 }),
      asset({ assetId: 'inf-str', duration: 'Infinity' }),
      asset({ assetId: 'ws', duration: '   ' }),
      asset({ assetId: 'bool', duration: 'true' }),
      asset({ assetId: 'ok', duration: '0.001' }),
    ]);
    expect(usableAssets.map((a) => a.assetId)).toEqual(['ok']);
    expect(excludedNoDurationAssetIds).toEqual(['nan', 'neg', 'inf-str', 'ws', 'bool']);
  });

  it('Infinity as a NUMBER is accepted by positiveDurationSec — document the clamp downstream', () => {
    // positiveNumber(Infinity) → Infinity is finite? No: Number.isFinite(Infinity) === false.
    const { excludedNoDurationAssetIds } = partitionAssistAssets([asset({ assetId: 'inf', duration: Infinity })]);
    expect(excludedNoDurationAssetIds).toEqual(['inf']);
  });

  it('survives 10,000 assets without blowing up', () => {
    const many = Array.from({ length: 10_000 }, (_, i) => asset({ assetId: `v${i}`, duration: (i % 7) || null }));
    const { usableAssets, excludedNoDurationAssetIds } = partitionAssistAssets(many);
    expect(usableAssets.length + excludedNoDurationAssetIds.length).toBe(10_000);
  });
});

describe('ATTACK: materializer — ordering and tiling under degenerate inputs', () => {
  it('identical uploadedAt keeps a stable input order (sort must not scramble)', async () => {
    const t = '2026-07-01T00:00:00Z';
    const timeline = await materializeChronologicalFallback(
      [
        asset({ assetId: 'first', duration: 1, uploadedAt: t }),
        asset({ assetId: 'second', duration: 1, uploadedAt: t }),
        asset({ assetId: 'third', duration: 1, uploadedAt: t }),
      ],
      'u', 'b', { width: 1920, height: 1080 },
    );
    expect(timeline.overlays.map((o) => o.assetId)).toEqual(['first', 'second', 'third']);
  });

  it('Date objects and ISO strings sort together correctly', async () => {
    const timeline = await materializeChronologicalFallback(
      [
        asset({ assetId: 'str-late', duration: 1, uploadedAt: '2026-07-01T00:00:02Z' }),
        asset({ assetId: 'date-early', duration: 1, uploadedAt: new Date('2026-07-01T00:00:01Z') }),
      ],
      'u', 'b', { width: 1920, height: 1080 },
    );
    expect(timeline.overlays.map((o) => o.assetId)).toEqual(['date-early', 'str-late']);
  });

  it('zero-size player dims still produce a valid gapless timeline', async () => {
    const timeline = await materializeChronologicalFallback(
      [asset({ assetId: 'v', duration: 2 })], 'u', 'b', { width: 0, height: 0 },
    );
    expect(timeline.overlays[0]).toMatchObject({ width: 0, height: 0, from: 0, durationInFrames: 60 });
  });
});

describe('ATTACK: hydration — duplicate, missing, and orphaned asset references', () => {
  const fps = 30;
  const overlay = (assetId: string | undefined, type = 'video') => ({
    id: assetId ?? 'x', type, from: 0, durationInFrames: 30, sourceStartFrame: 0, ...(assetId ? { assetId } : {}),
  });
  const completeDoc = (assetId: string) => ({
    assetId,
    rawFootageAnalysis: { transcription: { words: [] } },
    segmentAnalysis: { version: 1, segments: [{ startMs: 0, endMs: 1000 }], globalContext: {}, meta: { segmentCount: 1 } },
  });

  it('a video overlay with NO assetId is degraded, never hydrated, never crashes', () => {
    const plan = buildAssistHydration({
      analyses: [completeDoc('v1')] as never,
      overlays: [overlay('v1'), overlay(undefined)] as never,
      fps,
      durationInFrames: 60,
    });
    expect(plan.degradedVideoAssetIds).toEqual(['unknown-asset']);
    expect(plan.hydratedVideoAssetIds).toEqual(['v1']);
  });

  it('duplicate overlays of one asset hydrate once (no double counting)', () => {
    const plan = buildAssistHydration({
      analyses: [completeDoc('v1')] as never,
      overlays: [overlay('v1'), overlay('v1'), overlay('v1')] as never,
      fps,
      durationInFrames: 90,
    });
    expect(plan.hydratedVideoAssetIds).toEqual(['v1']);
  });

  it('all-degraded lay-down clears EVERY evidence field — stale evidence is worse than none', () => {
    const plan = buildAssistHydration({
      analyses: [] as never,
      overlays: [overlay('ghost')] as never,
      fps,
      durationInFrames: 30,
    });
    expect(Object.keys(plan.set)).toEqual([]);
    expect(Object.keys(plan.unset).sort()).toEqual([
      'momentWeightMap', 'multiAssetDirectorContext', 'musicAnalysis',
      'rawFootageAnalysis', 'segmentAnalysis', 'vjepaAnalysis', 'wav2vecAnalysis',
    ]);
  });

  it('analyses for assets NOT on the timeline are ignored, not hydrated', () => {
    const plan = buildAssistHydration({
      analyses: [completeDoc('on-timeline'), completeDoc('orphan')] as never,
      overlays: [overlay('on-timeline')] as never,
      fps,
      durationInFrames: 30,
    });
    expect(plan.hydratedVideoAssetIds).toEqual(['on-timeline']);
  });

  it('BATTLE FINDING: a malformed video overlay (builder would THROW) degrades instead of detonating', () => {
    // Complete analysis, but the overlay lacks sourceStartFrame/videoStartTime —
    // exactly the shape a user-edited/rescued timeline can carry.
    const malformed = { id: 'v-bad', type: 'video', assetId: 'v-bad', from: 0, durationInFrames: 30 };
    const plan = buildAssistHydration({
      analyses: [completeDoc('v-bad'), completeDoc('v-good')] as never,
      overlays: [malformed, overlay('v-good')] as never,
      fps,
      durationInFrames: 60,
    });
    expect(plan.degradedVideoAssetIds).toEqual(['v-bad']);
    expect(plan.hydratedVideoAssetIds).toEqual(['v-good']);
    // Zero/negative durations and NaN frames are equally radioactive:
    const nasty = buildAssistHydration({
      analyses: [completeDoc('v1')] as never,
      overlays: [
        { id: 'v1', type: 'video', assetId: 'v1', from: NaN, durationInFrames: 30, sourceStartFrame: 0 },
        { id: 'v1b', type: 'video', assetId: 'v1', from: 0, durationInFrames: 0, sourceStartFrame: 0 },
      ] as never,
      fps,
      durationInFrames: 30,
    });
    expect(nasty.hydratedVideoAssetIds).toEqual([]);
    expect(nasty.degradedVideoAssetIds).toEqual(['v1']);
  });

  it('a partially-valid asset (one good overlay, one malformed) hydrates and is NOT double-reported', () => {
    const plan = buildAssistHydration({
      analyses: [completeDoc('v1')] as never,
      overlays: [
        overlay('v1'),
        { id: 'v1-dup', type: 'video', assetId: 'v1', from: 0, durationInFrames: 30 },
      ] as never,
      fps,
      durationInFrames: 60,
    });
    expect(plan.hydratedVideoAssetIds).toEqual(['v1']);
    expect(plan.degradedVideoAssetIds).toEqual([]);
  });

  it('THE FILTER CONTRACT: the builder only ever receives context-ready video overlays', () => {
    builderMock.buildMultiAssetDirectorContext.mockClear();
    buildAssistHydration({
      analyses: [completeDoc('v-good')] as never,
      overlays: [
        overlay('v-good'),
        { id: 'bad', type: 'video', assetId: 'v-bad-shape', from: NaN, durationInFrames: 30 },
        overlay('img', 'image'),
      ] as never,
      fps,
      durationInFrames: 90,
    });
    const [passed] = builderMock.buildMultiAssetDirectorContext.mock.calls[0] as unknown as [{ overlays: Array<{ assetId?: string; type: string }> }];
    expect(passed.overlays.filter((o) => o.type === 'video').map((o) => o.assetId)).toEqual(['v-good']);
    // non-video overlays pass through untouched
    expect(passed.overlays.some((o) => o.type === 'image')).toBe(true);
  });
});

describe('ATTACK: briefing — hostile project shapes and absurd scales', () => {
  it('never crashes on garbage: arrays, numbers, deeply wrong nesting', () => {
    expect(buildAssistBriefing([])).toBeNull();
    expect(buildAssistBriefing(42)).toBeNull();
    expect(buildAssistBriefing({ editMode: 'assist', autoEditStatus: 'ready_for_chat', overlays: 'not-an-array', rawFootageAnalysis: 7 })).not.toBeNull();
  });

  it('a million words formats with separators instead of scientific notation', () => {
    const briefing = buildAssistBriefing({
      editMode: 'assist',
      autoEditStatus: 'ready_for_chat',
      fps: 30,
      durationInFrames: 30 * 3600,
      overlays: [{ type: 'video' }],
      rawFootageAnalysis: { transcription: { words: { length: 1_000_000 } }, silenceGaps: [] },
    });
    // words is a fake array-like — Array.isArray fails → count 0 → chip hidden.
    // Fabricating a count from a non-array would violate R31.
    expect(briefing!.chips.find((c) => c.id === 'captions')).toBeUndefined();

    const real = buildAssistBriefing({
      editMode: 'assist',
      autoEditStatus: 'ready_for_chat',
      fps: 30,
      durationInFrames: 30 * 3600,
      overlays: [{ type: 'video' }],
      rawFootageAnalysis: { transcription: { words: new Array(1_000_000).fill({ word: 'x' }) }, silenceGaps: [] },
    });
    expect(real!.chips[0].label).toBe(`Add captions (${(1_000_000).toLocaleString()} words ready)`);
    expect(real!.summary).toContain('60m 00s');
  });

  it('zero and negative fps fall back instead of dividing by zero', () => {
    const briefing = buildAssistBriefing({
      editMode: 'assist', autoEditStatus: 'ready_for_chat', fps: 0,
      durationInFrames: 300, overlays: [{ type: 'video' }], rawFootageAnalysis: null,
    });
    expect(briefing!.summary).toContain('10s'); // 300 frames / fallback 30fps
  });
});

describe('ATTACK: lane guard — exotic project shapes', () => {
  it('never true for anything but the exact string on an object', () => {
    expect(isAssistProject({ editMode: ['assist'] })).toBe(false);
    expect(isAssistProject({ editMode: { toString: () => 'assist' } })).toBe(false);
    expect(isAssistProject(Object.create({ editMode: 'assist' }))).toBe(true); // prototype chain reads are fine — documents behavior
    expect(parseEditMode(new String('assist'))).toBeUndefined(); // boxed string rejected
  });
});
