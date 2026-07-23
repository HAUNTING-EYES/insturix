/**
 * Scan report — the Director Mode trust-surface data. Every number traces to
 * persisted evidence; non-assist / non-ready projects yield null; hostile shapes
 * never crash.
 */
import { describe, expect, it } from 'vitest';

import { buildScanReport, buildScanMarkers } from '@/lib/editron/services/scan-report';

const ready = (over: Record<string, unknown> = {}) => ({
  editMode: 'assist',
  autoEditStatus: 'ready_for_chat',
  fps: 30,
  durationInFrames: 30 * 154,
  overlays: [{ type: 'video' }, { type: 'video' }, { type: 'image' }, { type: 'caption' }],
  rawFootageAnalysis: {
    transcription: { words: new Array(842).fill({ word: 'x' }) },
    silenceGaps: new Array(7).fill({ startMs: 0, endMs: 400 }),
    contentTypeDetection: { contentType: 'talking-head' },
  },
  segmentAnalysis: { segments: [{ startMs: 0, endMs: 5000 }, { startMs: 5000, endMs: 154000 }] },
  musicAnalysis: { bpm: 128.4 },
  assistDegradedAssetIds: [],
  ...over,
});

describe('buildScanReport', () => {
  it('returns null for auto, wrong status, and garbage', () => {
    expect(buildScanReport(ready({ editMode: 'auto' }))).toBeNull();
    expect(buildScanReport(ready({ autoEditStatus: 'scanning' }))).toBeNull();
    expect(buildScanReport(ready({ autoEditStatus: 'scan_failed' }))).toBeNull();
    expect(buildScanReport(null)).toBeNull();
    expect(buildScanReport(42)).toBeNull();
  });

  it('grounds every value in the persisted evidence', () => {
    const r = buildScanReport(ready())!;
    expect(r.overview).toEqual({ clipCount: 3, durationLabel: '2m 34s', contentType: 'talking-head' });
    const byId = Object.fromEntries(r.sections.map((s) => [s.id, s]));
    expect(byId.speech.value).toBe('842 words transcribed');
    expect(byId.scenes.value).toBe('2 detected');
    expect(byId.scenes.detail).toBe('0:00–2:34');
    expect(byId.silences.value).toBe('7 found');
    expect(byId.music.value).toBe('Detected · 128 BPM');
    expect(r.scenes).toHaveLength(2);
    expect(r.scenes[1]).toEqual({ index: 1, startMs: 5000, endMs: 154000 });
  });

  it('image-only / silent scans read honestly (no speech, no music)', () => {
    const r = buildScanReport(ready({
      rawFootageAnalysis: { transcription: { words: [] }, silenceGaps: [] },
      segmentAnalysis: { segments: [] },
      musicAnalysis: null,
    }))!;
    const byId = Object.fromEntries(r.sections.map((s) => [s.id, s]));
    expect(byId.speech.value).toBe('No speech detected');
    expect(byId.scenes.value).toBe('0 detected');
    expect(byId.scenes.detail).toBeUndefined();
    expect(byId.silences.value).toBe('None');
    expect(byId.music.value).toBe('None detected');
  });

  it('never crashes on hostile shapes and surfaces degraded clips', () => {
    const r = buildScanReport({ editMode: 'assist', autoEditStatus: 'ready_for_chat', overlays: 'nope', rawFootageAnalysis: 7, segmentAnalysis: null, assistDegradedAssetIds: ['v2'] })!;
    expect(r.overview.clipCount).toBe(0);
    expect(r.scenes).toEqual([]);
    expect(r.degradedAssetIds).toEqual(['v2']);
  });
});

describe('buildScanMarkers', () => {
  const project = (over: Record<string, unknown> = {}) => ({
    editMode: 'assist', autoEditStatus: 'ready_for_chat', fps: 30, durationInFrames: 30 * 100, // 100s = 100000ms
    rawFootageAnalysis: { silenceGaps: [{ startMs: 10_000, endMs: 12_000 }, { startMs: 50_000, endMs: 50_500 }] },
    segmentAnalysis: { segments: [{ startMs: 0 }, { startMs: 25_000 }, { startMs: 75_000 }] },
    ...over,
  });

  it('positions silences as spans and scenes as hairlines, as % of duration', () => {
    const m = buildScanMarkers(project())!;
    const silences = m.markers.filter((x) => x.kind === 'silence');
    const scenes = m.markers.filter((x) => x.kind === 'scene');
    expect(silences[0]).toMatchObject({ startMs: 10_000, leftPct: 10 });
    expect(silences[0].widthPct).toBeCloseTo(2, 5); // 2000ms of 100000ms = 2%
    expect(silences[1].widthPct).toBeGreaterThanOrEqual(0.15); // min hairline width enforced
    expect(scenes.map((s) => s.leftPct)).toEqual([0, 25, 75]);
    expect(m.clustered).toBe(false);
  });

  it('null for auto / non-ready / zero-duration; clamps out-of-range', () => {
    expect(buildScanMarkers(project({ editMode: 'auto' }))).toBeNull();
    expect(buildScanMarkers(project({ autoEditStatus: 'scanning' }))).toBeNull();
    expect(buildScanMarkers(project({ durationInFrames: 0 }))!.markers).toEqual([]);
    const past = buildScanMarkers(project({ segmentAnalysis: { segments: [{ startMs: 999_999 }] } }))!;
    expect(past.markers.find((x) => x.kind === 'scene')!.leftPct).toBe(100); // clamped
  });

  it('downsamples past 200 per kind so long footage stays cheap', () => {
    const manySilences = Array.from({ length: 5000 }, (_, i) => ({ startMs: i * 10, endMs: i * 10 + 5 }));
    const m = buildScanMarkers(project({ rawFootageAnalysis: { silenceGaps: manySilences } }))!;
    expect(m.markers.filter((x) => x.kind === 'silence').length).toBeLessThanOrEqual(200);
    expect(m.clustered).toBe(true);
  });
});
