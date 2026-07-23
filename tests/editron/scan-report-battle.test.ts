/**
 * BATTLE LANE — adversarial attacks on the scan-report / marker builders.
 * The goal of each case is to BREAK an invariant: a NaN/Infinity position, a
 * negative width, a fabricated count, a marker past 100%, a broken downsample.
 * Markers feed `left:${x}%` CSS — a NaN there silently vanishes the marker, so
 * finiteness is a hard requirement, not a nicety.
 */
import { describe, expect, it } from 'vitest';
import { buildScanReport, buildScanMarkers } from '@/lib/editron/services/scan-report';

const ready = (over: Record<string, unknown> = {}) => ({
  editMode: 'assist', autoEditStatus: 'ready_for_chat', fps: 30, durationInFrames: 30 * 100,
  rawFootageAnalysis: { silenceGaps: [], transcription: { words: [] } },
  segmentAnalysis: { segments: [] },
  ...over,
});

const finite = (n: number) => Number.isFinite(n);

describe('ATTACK: marker positions must ALWAYS be finite and in [0,100]', () => {
  it('NaN / Infinity / negative ms never produce a NaN or out-of-range position', () => {
    const m = buildScanMarkers(ready({
      rawFootageAnalysis: { silenceGaps: [
        { startMs: NaN, endMs: 500 },
        { startMs: Infinity, endMs: Infinity },
        { startMs: -1000, endMs: -500 },
        { startMs: 500, endMs: NaN },
      ] },
      segmentAnalysis: { segments: [{ startMs: NaN }, { startMs: 999_999_999 }, { startMs: -5 }] },
    }))!;
    for (const mk of m.markers) {
      expect(finite(mk.leftPct)).toBe(true);
      expect(mk.leftPct).toBeGreaterThanOrEqual(0);
      expect(mk.leftPct).toBeLessThanOrEqual(100);
      expect(finite(mk.widthPct)).toBe(true);
      expect(mk.widthPct).toBeGreaterThanOrEqual(0);
      expect(mk.leftPct + mk.widthPct).toBeLessThanOrEqual(100.001);
    }
  });

  it('a backwards silence (endMs < startMs) never yields a negative width', () => {
    const m = buildScanMarkers(ready({ rawFootageAnalysis: { silenceGaps: [{ startMs: 40_000, endMs: 10_000 }] } }))!;
    const s = m.markers.find((x) => x.kind === 'silence')!;
    expect(s.widthPct).toBeGreaterThanOrEqual(0);
    expect(finite(s.widthPct)).toBe(true);
  });

  it('NaN durationInFrames does not spray NaN across every marker', () => {
    const m = buildScanMarkers(ready({ durationInFrames: NaN, segmentAnalysis: { segments: [{ startMs: 1000 }] } }));
    // Either no markers (undefined total) or finite ones — never NaN positions.
    if (m) for (const mk of m.markers) expect(finite(mk.leftPct)).toBe(true);
  });

  it('fps NaN/0/negative falls back instead of dividing by a bad number', () => {
    for (const fps of [NaN, 0, -30]) {
      const m = buildScanMarkers(ready({ fps, segmentAnalysis: { segments: [{ startMs: 50_000 }] } }))!;
      const scene = m.markers.find((x) => x.kind === 'scene')!;
      expect(finite(scene.leftPct)).toBe(true);
      expect(scene.leftPct).toBeCloseTo(50, 0); // 50s of 100s (fps falls back to 30)
    }
  });
});

describe('ATTACK: downsample integrity', () => {
  it('keeps BOTH the first AND the true last item (endpoints) — no blank right edge', () => {
    const N = 1234;
    const gaps = Array.from({ length: N }, (_, i) => ({ startMs: i * 80, endMs: i * 80 + 10 }));
    const m = buildScanMarkers(ready({ durationInFrames: 30 * 100, rawFootageAnalysis: { silenceGaps: gaps } }))!;
    const silences = m.markers.filter((x) => x.kind === 'silence');
    expect(silences.length).toBeLessThanOrEqual(200);
    expect(silences.length).toBeGreaterThan(150);
    expect(silences[0].startMs).toBe(0); // first preserved
    expect(silences[silences.length - 1].startMs).toBe((N - 1) * 80); // TRUE LAST preserved (was dropped)
    expect(m.clustered).toBe(true);
    for (const s of silences) expect(finite(s.leftPct)).toBe(true);
  });

  it('a huge set still keeps the exact last element (regression: the ~0.5% blank tail)', () => {
    const N = 40_000;
    const segs = Array.from({ length: N }, (_, i) => ({ startMs: i * 2 }));
    const m = buildScanMarkers(ready({ durationInFrames: 30 * 100, segmentAnalysis: { segments: segs } }))!;
    const scenes = m.markers.filter((x) => x.kind === 'scene');
    expect(scenes[scenes.length - 1].startMs).toBe((N - 1) * 2);
  });

  it('exactly 200 is NOT clustered; 201 IS', () => {
    const mk = (n: number) => buildScanMarkers(ready({ rawFootageAnalysis: { silenceGaps: Array.from({ length: n }, (_, i) => ({ startMs: i, endMs: i + 1 })) } }))!;
    expect(mk(200).clustered).toBe(false);
    expect(mk(201).clustered).toBe(true);
  });
});

describe('ATTACK: report never fabricates counts or emits NaN labels', () => {
  it('array-like {length:N} shapes do NOT become counts (R31)', () => {
    const r = buildScanReport(ready({
      rawFootageAnalysis: { transcription: { words: { length: 9999 } }, silenceGaps: { length: 5 } },
    }))!;
    const byId = Object.fromEntries(r.sections.map((s) => [s.id, s]));
    expect(byId.speech.value).toBe('No speech detected'); // not "9,999 words"
    expect(byId.silences.value).toBe('None');
  });

  it('NaN / huge / negative durations format without NaN in the label', () => {
    for (const durationInFrames of [NaN, -100, 30 * 36_000 /* 10h */]) {
      const r = buildScanReport(ready({ durationInFrames }))!;
      expect(r.overview.durationLabel).not.toContain('NaN');
      expect(r.overview.durationLabel).not.toContain('-');
    }
  });

  it('out-of-order / partial scenes never crash and stay finite', () => {
    const r = buildScanReport(ready({ segmentAnalysis: { segments: [{ endMs: 5000 }, { startMs: 'x' }, { startMs: 3000, endMs: 1000 }] } }))!;
    expect(r.scenes).toHaveLength(3);
    for (const s of r.scenes) { expect(finite(s.startMs)).toBe(true); expect(finite(s.endMs)).toBe(true); }
  });
});
