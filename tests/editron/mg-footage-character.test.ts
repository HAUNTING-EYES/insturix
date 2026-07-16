import { describe, expect, it } from 'vitest';

import {
  classifyFootage,
  footageStyleDelta,
  FOOTAGE_STYLE,
  type FootageCharacter,
} from '@/lib/editron/motion-graphics/codegen/style/footage-character';
import { resolveVideoStyle, resolveMomentStyle } from '@/lib/editron/motion-graphics/codegen/style/style-resolver';

describe('MG style resolver — footage classifier', () => {
  it('classifies from the analysis we already compute (motion / warmth / brightness)', () => {
    expect(classifyFootage({ motionEnergy: 0.9 })).toBe('energetic-vivid');
    expect(classifyFootage({ arousal: 0.85 })).toBe('energetic-vivid');
    expect(classifyFootage({ warmth: 0.8 })).toBe('calm-warm');
    expect(classifyFootage({ brightness: 0.2 })).toBe('cinematic-moody');
    expect(classifyFootage({ brightness: 0.8, saturation: 0.2 })).toBe('clean-neutral');
  });

  it('face emotion biases perceived warmth (harvested from resolveColor)', () => {
    expect(classifyFootage({ warmth: 0.55, faceEmotion: 'happy' })).toBe('calm-warm'); // +0.15 → >0.62
    expect(classifyFootage({ warmth: 0.7, faceEmotion: 'angry' })).not.toBe('calm-warm'); // -0.15 → <0.62
  });

  it('no / weak signal is a NO-OP (neutral, empty delta)', () => {
    expect(classifyFootage(undefined)).toBe('neutral');
    expect(classifyFootage({})).toBe('neutral');
    expect(classifyFootage({ warmth: 0.5, motionEnergy: 0.3 })).toBe('neutral');
    expect(FOOTAGE_STYLE.neutral).toEqual({});
  });

  it('deltas are PARTIAL (footage only narrows some axes)', () => {
    const chars: FootageCharacter[] = ['energetic-vivid', 'calm-warm', 'cinematic-moody', 'clean-neutral'];
    for (const c of chars) {
      const d = FOOTAGE_STYLE[c];
      expect(Object.keys(d).length, c).toBeGreaterThan(0);
      // never sets weight/corner/alignment — those stay the font's
      expect(d).not.toHaveProperty('weight');
      expect(d).not.toHaveProperty('corner');
    }
    const { character, delta } = footageStyleDelta({ motionEnergy: 0.9 });
    expect(character).toBe('energetic-vivid');
    expect(delta.motion).toBe('pop');
  });
});

describe('MG style resolver — footage narrows the MOMENT (video identity ⊇ moment footage)', () => {
  it('THIS moment\'s footage narrows the moment treatment; the video identity is untouched', () => {
    // Georgia = oldstyle-serif → video identity motion 'gentle', weight 'regular', base surface 'flat'
    const video = resolveVideoStyle({ brandFont: 'Georgia' });
    expect(video.motion).toBe('gentle');

    const energetic = resolveMomentStyle(video, { footage: { motionEnergy: 0.9 } });
    expect(energetic.motion).toBe('pop'); // footage won this axis, for THIS moment
    expect(energetic.surface).toBe('glow');
    expect(energetic.density).toBe('dense');
    expect(video.weight).toBe('regular'); // identity (weight) is not a per-moment axis
    expect(energetic.footageCharacter).toBe('energetic-vivid');
  });

  it('neutral footage leaves the moment at the video base', () => {
    const video = resolveVideoStyle({ brandFont: 'Anton' });
    const m = resolveMomentStyle(video, { footage: { warmth: 0.5 } });
    expect(m.motion).toBe(video.motion);
    expect(m.surface).toBe(video.baseSurface);
    expect(m.footageCharacter).toBe('neutral');
  });
});
