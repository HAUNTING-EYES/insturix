import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

import {
  DEFAULT_MG_RENDER_SANITY_THRESHOLDS,
  evaluateMgRenderSanity,
  measureMgRenderSanity,
  mgRenderSanityGate,
  type MgRenderSanityMetrics,
} from '@/lib/editron/motion-graphics/codegen/mg-placement-gate';

const small: MgRenderSanityMetrics = { coverageFrac: 0.12, nearOpaqueFrac: 0.05 };

describe('evaluateMgRenderSanity - the deterministic degenerate-render verdict (pure)', () => {
  it('a small, transparent graphic PASSES', () => {
    const r = evaluateMgRenderSanity(small);
    expect(r.pass).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('★ a FULL-FRAME transparent graphic PASSES (kinetic type / concept scene — the Tier-B case the old gate killed)', () => {
    // high visible coverage, but the frame is mostly transparent (glyph gaps) → not a solid field.
    const r = evaluateMgRenderSanity({ coverageFrac: 0.45, nearOpaqueFrac: 0.12 });
    expect(r.pass).toBe(true);
  });

  it('★ a full-frame TRANSLUCENT wash (a legibility scrim) PASSES — visible everywhere, opaque nowhere', () => {
    const r = evaluateMgRenderSanity({ coverageFrac: 1.0, nearOpaqueFrac: 0.0 });
    expect(r.pass).toBe(true);
  });

  it('★ an empty render (no pixels) FAILS', () => {
    const r = evaluateMgRenderSanity({ coverageFrac: 0, nearOpaqueFrac: 0 });
    expect(r.pass).toBe(false);
    expect(r.reasons).toEqual(['the component rendered no visible pixels']);
  });

  it('★ a near-opaque full-frame field FAILS (hides the footage — the one coverage-like defect)', () => {
    const r = evaluateMgRenderSanity({ coverageFrac: 1.0, nearOpaqueFrac: 0.95 });
    expect(r.pass).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/hides the footage/);
  });

  it('the near-opaque threshold is a boundary: at the limit passes, just above fails', () => {
    const t = DEFAULT_MG_RENDER_SANITY_THRESHOLDS;
    expect(evaluateMgRenderSanity({ coverageFrac: 1, nearOpaqueFrac: t.maxNearOpaqueFrac }).pass).toBe(true);
    expect(evaluateMgRenderSanity({ coverageFrac: 1, nearOpaqueFrac: t.maxNearOpaqueFrac + 0.01 }).pass).toBe(false);
  });

  it('★ 4b-3 opaque-scene routing: expectOpaque lets a legitimately-opaque full-frame Scene PASS…', () => {
    const r = evaluateMgRenderSanity({ coverageFrac: 1.0, nearOpaqueFrac: 1.0 }, DEFAULT_MG_RENDER_SANITY_THRESHOLDS, { expectOpaque: true });
    expect(r.pass).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('…while WITHOUT the declared mode the same frame still FAILS (overlays never get an opaque pass), and an empty render fails in BOTH modes', () => {
    expect(evaluateMgRenderSanity({ coverageFrac: 1.0, nearOpaqueFrac: 1.0 }).pass).toBe(false);
    expect(evaluateMgRenderSanity({ coverageFrac: 0, nearOpaqueFrac: 0 }, DEFAULT_MG_RENDER_SANITY_THRESHOLDS, { expectOpaque: true }).pass).toBe(false);
  });
});

/** Compose an RGBA PNG: transparent background + boxes at pixel coords with a given alpha. */
async function alphaImage(
  width: number,
  height: number,
  boxes: Array<{ x: number; y: number; w: number; h: number; alpha?: number }>,
  bgAlpha = 0,
): Promise<Buffer> {
  const composites = boxes.map((b) => ({
    input: { create: { width: b.w, height: b.h, channels: 4 as const, background: { r: 255, g: 255, b: 255, alpha: b.alpha ?? 1 } } },
    left: b.x,
    top: b.y,
  }));
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: bgAlpha } } })
    .composite(composites)
    .png()
    .toBuffer();
}

describe('measureMgRenderSanity - reads real alpha (sharp)', () => {
  it('a small opaque box → low coverage, low near-opaque → passes', async () => {
    const frame = await alphaImage(400, 400, [{ x: 20, y: 20, w: 80, h: 80 }]);
    const m = await measureMgRenderSanity(frame);
    expect(m.coverageFrac).toBeCloseTo((80 * 80) / (400 * 400), 1); // ~0.04
    expect(m.nearOpaqueFrac).toBeLessThan(0.1);
    expect(evaluateMgRenderSanity(m).pass).toBe(true);
  });

  it('★ a SOLID full-frame opaque fill → near-opaque ~1 → FAILS (hides footage)', async () => {
    const frame = await alphaImage(400, 400, [{ x: 0, y: 0, w: 400, h: 400, alpha: 1 }]);
    const m = await measureMgRenderSanity(frame);
    expect(m.nearOpaqueFrac).toBeGreaterThan(0.92);
    expect((await mgRenderSanityGate(frame)).pass).toBe(false);
  });

  it('★ a full-frame SPARSE composition (many small marks, big gaps) → PASSES (footage reads through)', async () => {
    const boxes: Array<{ x: number; y: number; w: number; h: number }> = [];
    for (let gy = 0; gy < 400; gy += 80) for (let gx = 0; gx < 400; gx += 80) boxes.push({ x: gx, y: gy, w: 24, h: 24 });
    const frame = await alphaImage(400, 400, boxes); // spans the whole frame, but ~9% ink
    const m = await measureMgRenderSanity(frame);
    expect(m.nearOpaqueFrac).toBeLessThan(0.5);
    expect(evaluateMgRenderSanity(m).pass).toBe(true);
  });

  it('★ a full-frame TRANSLUCENT wash (alpha 0.5) → visible but not near-opaque → PASSES', async () => {
    const frame = await alphaImage(400, 400, [], 0.5); // whole frame at alpha 0.5
    const m = await measureMgRenderSanity(frame);
    expect(m.coverageFrac).toBeGreaterThan(0.9);
    expect(m.nearOpaqueFrac).toBeLessThan(0.5);
    expect(evaluateMgRenderSanity(m).pass).toBe(true);
  });

  it('mgRenderSanityGate composes measure + verdict on a real frame', async () => {
    const frame = await alphaImage(400, 400, [{ x: 20, y: 20, w: 70, h: 60 }]);
    const r = await mgRenderSanityGate(frame);
    expect(r.pass).toBe(true);
    expect(r.metrics.coverageFrac).toBeGreaterThan(0);
  });
});
