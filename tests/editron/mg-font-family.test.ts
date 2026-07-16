import { describe, expect, it } from 'vitest';

import {
  classifyFontFamily,
  fontStylePriors,
  FONT_FAMILY_STYLE,
  type FontFamily,
} from '@/lib/editron/motion-graphics/codegen/style/font-family';

describe('MG style resolver — font-family classifier', () => {
  it('classifies representative fonts into the right family', () => {
    const cases: Array<[string, FontFamily]> = [
      ['Inter', 'grotesque-sans'],
      ['Helvetica Neue', 'grotesque-sans'],
      ['Poppins', 'geometric-sans'],
      ['Futura', 'geometric-sans'],
      ['Open Sans', 'humanist-sans'],
      ['Lato', 'humanist-sans'],
      ['Georgia', 'oldstyle-serif'],
      ['EB Garamond', 'oldstyle-serif'],
      ['Playfair Display', 'modern-serif'],
      ['Bodoni', 'modern-serif'],
      ['Rockwell', 'slab-serif'],
      ['Roboto Slab', 'slab-serif'],
      ['JetBrains Mono', 'monospace'],
      ['Courier New', 'monospace'],
      ['Pacifico', 'script'],
      ['Anton', 'display'],
      ['Bebas Neue', 'display'],
      ['Oswald', 'display'],
    ];
    for (const [font, family] of cases) {
      expect(classifyFontFamily(font), font).toBe(family);
    }
  });

  it('handles CSS font stacks, quotes, and weight-suffixed variants', () => {
    expect(classifyFontFamily("'Poppins', sans-serif")).toBe('geometric-sans');
    expect(classifyFontFamily('Poppins SemiBold')).toBe('geometric-sans');
    expect(classifyFontFamily('"JetBrains Mono", monospace')).toBe('monospace');
    expect(classifyFontFamily('Plus Jakarta Sans, Inter, sans-serif')).toBe('grotesque-sans');
  });

  it('classifies generic CSS keywords and empties safely', () => {
    expect(classifyFontFamily('sans-serif')).toBe('grotesque-sans');
    expect(classifyFontFamily('serif')).toBe('oldstyle-serif');
    expect(classifyFontFamily('monospace')).toBe('monospace');
    expect(classifyFontFamily(undefined)).toBe('grotesque-sans');
    expect(classifyFontFamily('')).toBe('grotesque-sans');
  });

  it('falls back by heuristic for UNKNOWN fonts (any font gets a family)', () => {
    expect(classifyFontFamily('Zorptech Mono')).toBe('monospace');
    expect(classifyFontFamily('Megablast Display')).toBe('display');
    expect(classifyFontFamily('Fancy Brush Script')).toBe('script');
    expect(classifyFontFamily('Acme Slab')).toBe('slab-serif');
    expect(classifyFontFamily('Wingding Serif')).toBe('oldstyle-serif');
    expect(classifyFontFamily('Nonexistent Typeface')).toBe('grotesque-sans'); // safe default
  });

  it('every family has complete treatment priors in the atom vocabulary', () => {
    const families: FontFamily[] = ['geometric-sans', 'grotesque-sans', 'humanist-sans', 'oldstyle-serif', 'modern-serif', 'slab-serif', 'monospace', 'script', 'display'];
    const surfaces = new Set(['flat', 'frosted', 'raised', 'glow']);
    const motions = new Set(['gentle', 'smooth', 'snappy', 'sharp', 'elastic', 'pop']);
    for (const f of families) {
      const p = FONT_FAMILY_STYLE[f];
      expect(p, f).toBeDefined();
      expect(surfaces.has(p.surface), `${f}.surface`).toBe(true);
      expect(motions.has(p.motion), `${f}.motion`).toBe(true);
      expect(p.personality.length, `${f}.personality`).toBeGreaterThan(0);
    }
  });

  it('fontStylePriors returns family + priors together', () => {
    const p = fontStylePriors('Anton');
    expect(p.family).toBe('display');
    expect(p.weight).toBe('heavy');
    expect(p.surface).toBe('glow');
    expect(p.motion).toBe('pop');
  });

  it('the treatment matrix is coherent: display/slab are heavy, serif/script are gentle', () => {
    expect(FONT_FAMILY_STYLE.display.weight).toBe('heavy');
    expect(FONT_FAMILY_STYLE['slab-serif'].motion).toBe('sharp');
    expect(FONT_FAMILY_STYLE['oldstyle-serif'].motion).toBe('gentle');
    expect(FONT_FAMILY_STYLE.script.motion).toBe('gentle');
    expect(FONT_FAMILY_STYLE.monospace.texture).toBe('grid');
  });
});
