import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

import {
  DEFAULT_MG_GATE_THRESHOLDS,
  evaluateMgPlacement,
  measureMgAlpha,
  mgPlacementGate,
  type MgAlphaMetrics,
} from '@/lib/editron/motion-graphics/codegen/mg-placement-gate';

const good: MgAlphaMetrics = {
  coverageFrac: 0.12,
  bbox: { x: 0.05, y: 0.06, width: 0.35, height: 0.18 },
  subjectOverlapFrac: 0.0,
  captionOverlapFrac: 0.0,
  marginBleedFrac: 0.0,
};

describe('evaluateMgPlacement - the deterministic verdict (pure)', () => {
  it('a small, clear, in-bounds graphic PASSES', () => {
    const r = evaluateMgPlacement(good);
    expect(r.pass).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('★ a full-frame swamp FAILS (coverage)', () => {
    const r = evaluateMgPlacement({ ...good, coverageFrac: 0.9 });
    expect(r.pass).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/swamps the footage/);
  });

  it('★ painting over the subject FAILS (the "obscures footage" case)', () => {
    const r = evaluateMgPlacement({ ...good, subjectOverlapFrac: 0.5 });
    expect(r.pass).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/obscures the person\/product/);
  });

  it('★ intruding into the caption band FAILS', () => {
    const r = evaluateMgPlacement({ ...good, captionOverlapFrac: 0.4 });
    expect(r.pass).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/caption band/);
  });

  it('★ bleeding outside title-safe FAILS', () => {
    const r = evaluateMgPlacement({ ...good, marginBleedFrac: 0.2 });
    expect(r.pass).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/title-safe/);
  });

  it('an empty render (no pixels) FAILS with a single clear reason', () => {
    const r = evaluateMgPlacement({ ...good, bbox: null, coverageFrac: 0 });
    expect(r.pass).toBe(false);
    expect(r.reasons).toEqual(['the component rendered no visible pixels']);
  });

  it('a graphic EDGE grazing the subject (within tolerance) still passes', () => {
    expect(evaluateMgPlacement({ ...good, subjectOverlapFrac: DEFAULT_MG_GATE_THRESHOLDS.maxSubjectOverlapFrac - 0.01 }).pass).toBe(true);
  });

  it('reports EVERY violated criterion at once', () => {
    const r = evaluateMgPlacement({ coverageFrac: 0.9, bbox: good.bbox, subjectOverlapFrac: 0.6, captionOverlapFrac: 0.5, marginBleedFrac: 0.3 });
    expect(r.pass).toBe(false);
    expect(r.reasons.length).toBe(4); // coverage + subject + caption + margin
  });
});

/** Compose an RGBA PNG: transparent background + opaque white boxes at pixel coords. */
async function alphaImage(width: number, height: number, boxes: Array<{ x: number; y: number; w: number; h: number }>): Promise<Buffer> {
  const composites = boxes.map((b) => ({
    input: { create: { width: b.w, height: b.h, channels: 4 as const, background: { r: 255, g: 255, b: 255, alpha: 1 } } },
    left: b.x,
    top: b.y,
  }));
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites)
    .png()
    .toBuffer();
}

describe('measureMgAlpha - reads real alpha geometry (sharp)', () => {
  it('★ a small top-left box → low coverage, top-left bbox, no subject/caption overlap', async () => {
    const frame = await alphaImage(400, 400, [{ x: 20, y: 20, w: 80, h: 80 }]); // 5%..25% region
    const m = await measureMgAlpha(frame, { subject: { x: 0.3, y: 0.4, width: 0.4, height: 0.5 } });
    expect(m.coverageFrac).toBeCloseTo((80 * 80) / (400 * 400), 1); // ~0.04
    expect(m.bbox).not.toBeNull();
    expect(m.bbox!.x).toBeLessThan(0.1);
    expect(m.bbox!.y).toBeLessThan(0.1);
    expect(m.subjectOverlapFrac).toBe(0); // box is top-left, subject is center-bottom
    expect(m.captionOverlapFrac).toBe(0);
  });

  it('★ a box ON the subject → high subjectOverlap (the failure the gate catches)', async () => {
    // subject occupies center; opaque box sits right on it
    const frame = await alphaImage(400, 400, [{ x: 140, y: 160, w: 120, h: 160 }]);
    const m = await measureMgAlpha(frame, { subject: { x: 0.35, y: 0.4, width: 0.3, height: 0.4 } });
    expect(m.subjectOverlapFrac).toBeGreaterThan(0.5);
    const verdict = evaluateMgPlacement(m);
    expect(verdict.pass).toBe(false);
  });

  it('★ a box in the bottom band → caption overlap', async () => {
    const frame = await alphaImage(400, 400, [{ x: 40, y: 340, w: 320, h: 50 }]); // bottom ~85-97%
    const m = await measureMgAlpha(frame);
    expect(m.captionOverlapFrac).toBeGreaterThan(0.1);
  });

  it('mgPlacementGate composes measure + verdict on a real frame', async () => {
    const frame = await alphaImage(400, 400, [{ x: 20, y: 20, w: 70, h: 60 }]); // small, clear, in-bounds
    const r = await mgPlacementGate(frame, { subject: { x: 0.4, y: 0.5, width: 0.3, height: 0.4 } });
    expect(r.pass).toBe(true);
    expect(r.metrics.bbox).not.toBeNull();
  });
});
