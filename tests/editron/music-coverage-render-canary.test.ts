import { describe, expect, it } from 'vitest';

import {
  MUSIC_COVERAGE_CANARY_TOTAL_FRAMES,
  MUSIC_COVERAGE_CANARY_VERSION,
  driveCoverageMode,
} from '@/scripts/music-coverage-render-canary-core';

describe('zero-credit music coverage render canary (none / sections / full)', () => {
  it('declares a timeboxed 20s target contract', () => {
    expect(MUSIC_COVERAGE_CANARY_VERSION).toBe('editron-music-coverage-render-canary-v1');
    expect(MUSIC_COVERAGE_CANARY_TOTAL_FRAMES).toBe(600);
  });

  it('proves music:none via the runtime planner produces zero music overlays', () => {
    const result = driveCoverageMode('none');

    expect(result.planMode).toBe('none');
    expect(result.musicOverlayCount).toBe(0);
    expect(result.assembledSoundOverlayCount).toBe(0);
    expect(result.coverageRatio).toBe(0);
    expect(result.rightsNotices).toBe(0);
  });

  it('proves full coverage produces one overlay spanning the whole timeline', () => {
    const result = driveCoverageMode('full');

    expect(result.planMode).toBe('full');
    expect(result.musicOverlayCount).toBe(1);
    expect(result.assembledSoundOverlayCount).toBe(1);
    expect(result.coverageRatio).toBe(1);
    expect(result.rightsNotices).toBe(0);
  });

  it('proves sections coverage produces speech-gapped music sections', () => {
    // Speech from 4s-8s and 14s-18s leaves music sections elsewhere.
    const result = driveCoverageMode('sections', [
      { startFrame: 120, endFrame: 240 },
      { startFrame: 420, endFrame: 540 },
    ]);

    expect(result.planMode).toBe('sections');
    expect(result.musicOverlayCount).toBeGreaterThanOrEqual(1);
    expect(result.coverageRatio).toBeGreaterThan(0);
    expect(result.coverageRatio).toBeLessThan(1);
    expect(result.rightsNotices).toBe(0);
  });

  it('drives all three modes through the real planner and assembler without paid calls', () => {
    const none = driveCoverageMode('none');
    const sections = driveCoverageMode('sections', [{ startFrame: 120, endFrame: 240 }]);
    const full = driveCoverageMode('full');

    expect([none.mode, sections.mode, full.mode]).toEqual(['none', 'sections', 'full']);
    expect(none.musicOverlayCount).toBe(0);
    expect(full.musicOverlayCount).toBe(1);
    expect(sections.musicOverlayCount).toBeGreaterThan(0);
    expect([none, sections, full].every(r => r.rightsNotices === 0)).toBe(true);
  });
});
