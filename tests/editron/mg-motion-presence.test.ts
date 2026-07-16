import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

import {
  evaluateMgMotionPresence,
  measureMgMotionPresence,
  mgMotionPresenceGate,
  MIN_MG_MOTION_PRESENCE,
} from '@/lib/editron/motion-graphics/codegen/mg-placement-gate';

/** A 32x18 solid RGBA frame (alpha 0-1: 0 transparent, 1 opaque). */
const solid = (r: number, g: number, b: number, alpha: number): Promise<Buffer> =>
  sharp({ create: { width: 32, height: 18, channels: 4, background: { r, g, b, alpha } } }).png().toBuffer();

describe('taste-gate floor — motion presence', () => {
  it('PURE evaluate: below the floor fails, at/above passes', () => {
    expect(evaluateMgMotionPresence(0).pass).toBe(false);
    expect(evaluateMgMotionPresence(MIN_MG_MOTION_PRESENCE - 0.001).pass).toBe(false);
    expect(evaluateMgMotionPresence(MIN_MG_MOTION_PRESENCE).pass).toBe(true);
    expect(evaluateMgMotionPresence(0.5).pass).toBe(true);
    expect(evaluateMgMotionPresence(0).reasons[0]).toMatch(/static\/frozen/);
  });

  it('measure: identical frames ≈ 0 (frozen), changing frames large; <2 frames = 0', async () => {
    const black = await solid(0, 0, 0, 1);
    const white = await solid(255, 255, 255, 1);
    const clear = await solid(0, 0, 0, 0);
    expect(await measureMgMotionPresence([black, black, black])).toBeLessThan(0.001); // frozen
    expect(await measureMgMotionPresence([black, white, black])).toBeGreaterThan(0.1); // big luma change
    expect(await measureMgMotionPresence([clear, white])).toBeGreaterThan(0.1); // appear/fade = motion
    expect(await measureMgMotionPresence([black])).toBe(0); // can't judge one frame
  });

  it('gate: a frozen sequence fails; an animated one passes', async () => {
    const black = await solid(0, 0, 0, 1);
    const white = await solid(255, 255, 255, 1);
    const frozen = await mgMotionPresenceGate([black, black, black, black]);
    expect(frozen.pass).toBe(false);
    expect(frozen.motion).toBeLessThan(MIN_MG_MOTION_PRESENCE);
    expect(frozen.reasons[0]).toMatch(/static|frozen/);

    const animated = await mgMotionPresenceGate([black, white, black, white]);
    expect(animated.pass).toBe(true);
    expect(animated.motion).toBeGreaterThan(MIN_MG_MOTION_PRESENCE);
  });
});
