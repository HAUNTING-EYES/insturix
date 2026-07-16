import { describe, expect, it } from 'vitest';

import {
  classifyFootage,
  footageStyleDelta,
  FOOTAGE_STYLE,
  type FootageCharacter,
} from '@/lib/editron/motion-graphics/codegen/style/footage-character';
import { resolveStyle } from '@/lib/editron/motion-graphics/codegen/style/style-resolver';

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

describe('MG style resolver — compose (brand ⊇ footage)', () => {
  it('footage NARROWS the font base only where it has an opinion; brand identity holds', () => {
    // Georgia = oldstyle-serif → base motion 'gentle', weight 'regular', surface 'flat'
    const base = resolveStyle({ brandFont: 'Georgia' });
    expect(base.motion).toBe('gentle');

    // high-energy footage overrides motion→pop, surface→glow, density→dense, but NOT weight/corner (font's)
    const energetic = resolveStyle({ brandFont: 'Georgia', footage: { motionEnergy: 0.9 } });
    expect(energetic.motion).toBe('pop'); // footage won this axis
    expect(energetic.surface).toBe('glow');
    expect(energetic.density).toBe('dense');
    expect(energetic.weight).toBe(base.weight); // font identity held
    expect(energetic.corner).toBe(base.corner);
    expect(energetic.sources).toContain('footage:energetic-vivid');
  });

  it('neutral footage leaves the font style exactly as-is', () => {
    const base = resolveStyle({ brandFont: 'Anton' });
    const withNeutral = resolveStyle({ brandFont: 'Anton', footage: { warmth: 0.5 } });
    expect(withNeutral.motion).toBe(base.motion);
    expect(withNeutral.surface).toBe(base.surface);
    expect(withNeutral.sources).not.toContain('footage:neutral');
  });
});
