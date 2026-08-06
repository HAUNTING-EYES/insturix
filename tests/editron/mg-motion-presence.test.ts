import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

import {
  evaluateMgMotionPresence,
  evaluateMgMotionProfile,
  measureMgMotionPresence,
  measureMgMotionProfile,
  mgMotionPresenceGate,
  MIN_MG_MOTION_PRESENCE,
  MIN_MG_MOTION_BUILD,
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
    expect(frozen.peak).toBeLessThan(MIN_MG_MOTION_BUILD); // frozen: no build either
    expect(frozen.reasons[0]).toMatch(/static|frozen/);

    const animated = await mgMotionPresenceGate([black, white, black, white]);
    expect(animated.pass).toBe(true);
    expect(animated.motion).toBeGreaterThan(MIN_MG_MOTION_PRESENCE);
  });

  it('★ PROFILE: a real build with a calm hold (diluted mean, strong peak) PASSES; frozen fails both', () => {
    // frozen — clears neither path
    expect(evaluateMgMotionProfile({ mean: 0, peak: 0 }).pass).toBe(false);
    expect(evaluateMgMotionProfile({ mean: 0.002, peak: 0.003 }).pass).toBe(false); // timid: below both
    // continuous motion — passes on mean
    expect(evaluateMgMotionProfile({ mean: 0.006, peak: 0.006 }).pass).toBe(true);
    // build-then-hold — mean diluted under the floor, but a real build peak carries it (the P4 fix)
    expect(evaluateMgMotionProfile({ mean: 0.0037, peak: 0.0069 }).pass).toBe(true);
    // a build peak just below the bar with a diluted mean still fails (only genuine builds pass)
    expect(evaluateMgMotionProfile({ mean: 0.0035, peak: 0.0059 }).pass).toBe(false);
    expect(evaluateMgMotionProfile({ mean: 0, peak: 0 }).reasons[0]).toMatch(/never moves|frozen/);
  });

  it('measure PROFILE: returns mean + peak; a single big change spikes the peak above the diluted mean', async () => {
    const black = await solid(0, 0, 0, 1);
    const clear = await solid(0, 0, 0, 0);
    const white = await solid(255, 255, 255, 1);
    expect(await measureMgMotionProfile([black, black, black])).toEqual({ mean: expect.closeTo(0, 5), peak: expect.closeTo(0, 5), sustained: expect.closeTo(0, 5) });
    const built = await measureMgMotionProfile([clear, white, white, white]); // appear once, then hold
    expect(built.peak).toBeGreaterThan(built.mean); // the single build spike exceeds the whole-clip mean
    expect(built.peak).toBeGreaterThan(0.1);
  });

  it('normalizes motion over visible graphic pixels instead of diluting compact overlays over transparency', async () => {
    const compact = async (alpha: number) => sharp({
      create: { width: 320, height: 180, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{
        input: await sharp({
          create: { width: 36, height: 36, channels: 4, background: { r: 212, g: 166, b: 82, alpha } },
        }).png().toBuffer(),
        left: 260,
        top: 72,
      }])
      .png()
      .toBuffer();

    const lowOpacity = await compact(0.72);
    const settled = await compact(1);
    const lowOpacityRaw = await sharp(lowOpacity).ensureAlpha().raw().toBuffer();
    const settledRaw = await sharp(settled).ensureAlpha().raw().toBuffer();
    let wholeCanvasDelta = 0;
    for (let index = 0; index < lowOpacityRaw.length; index += 1) {
      wholeCanvasDelta += Math.abs(lowOpacityRaw[index] - settledRaw[index]);
    }
    wholeCanvasDelta /= lowOpacityRaw.length * 255;
    const profile = await measureMgMotionProfile([lowOpacity, settled, settled]);

    expect(wholeCanvasDelta).toBeLessThan(MIN_MG_MOTION_BUILD);
    expect(profile.peak).toBeGreaterThan(MIN_MG_MOTION_BUILD);
    expect(evaluateMgMotionProfile(profile).pass).toBe(true);
  });

  it('★ EXIT-ONLY movement earns NO build credit (audit repro: frozen clip + fade-out must FAIL)', async () => {
    const white = await solid(255, 255, 255, 1);
    const clear = await solid(0, 0, 0, 0);
    // 5 identical frames, then one transparent exit frame — the only change is the departure
    const exitOnly = await measureMgMotionProfile([white, white, white, white, white, clear]);
    expect(exitOnly.peak).toBeCloseTo(0, 5); // the final interval is past the build cutoff — no credit
    const gate = await mgMotionPresenceGate([white, white, white, white, white, clear]);
    expect(gate.pass).toBe(false); // frozen-with-exit is still a frozen render
    // and an EARLY build still earns its credit (entrance in the build window)
    const earlyBuild = await measureMgMotionProfile([clear, white, white, white, white, white]);
    expect(earlyBuild.peak).toBeGreaterThan(0.1);
  });
});
