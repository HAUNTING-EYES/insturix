import { describe, expect, it } from 'vitest';

import { brandToKit, type UnifiedBrandLike } from '@/lib/editron/motion-graphics/codegen/brand-mapper';

// ── tiny color helpers for asserting the legibility property ──
function rgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function lum(hex: string): number {
  const { r, g, b } = rgb(hex);
  const lin = (c: number) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a: string, b: string): number {
  const la = lum(a); const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
const isHex = (s: string) => /^#[0-9a-f]{6}$/i.test(s);

function brand(over: Partial<UnifiedBrandLike['visual']> = {}, name = 'Acme'): UnifiedBrandLike {
  return { name, visual: { colors: [], visualStyle: null, typography: null, ...over } };
}

describe('brandToKit - color role assignment (Law 4: on-brand + legible)', () => {
  it('dark brand → dark bg, light text, vibrant accent, legible', () => {
    const { brand: b, isDefault } = brandToKit(brand({ colors: ['#0B0B0A', '#D4A652', '#F7F4EA'] }));
    expect(isDefault).toBe(false);
    expect(lum(b.colors.bg)).toBeLessThan(0.15); // dark bg
    expect(lum(b.colors.text)).toBeGreaterThan(0.6); // light text
    expect(b.colors.accent.toLowerCase()).toBe('#d4a652'); // the vibrant one
    expect(contrast(b.colors.text, b.colors.bg)).toBeGreaterThanOrEqual(4.5); // ★ legibility
  });

  it('light brand (explicit light style) → light bg, dark text, legible', () => {
    const { brand: b } = brandToKit(brand({ colors: ['#F5F7FB', '#FFFFFF', '#2F6BFF', '#0F1B2D'], visualStyle: 'airy corporate light' }));
    expect(lum(b.colors.bg)).toBeGreaterThan(0.7); // light bg
    expect(lum(b.colors.text)).toBeLessThan(0.15); // dark text
    expect(contrast(b.colors.text, b.colors.bg)).toBeGreaterThanOrEqual(4.5); // ★ legibility
  });

  it('★ accentText always contrasts the accent (WCAG pick of black/white)', () => {
    for (const accent of ['#D4A652', '#2F6BFF', '#FF0000', '#00FF00', '#111111', '#EEEEEE']) {
      const { brand: b } = brandToKit(brand({ colors: ['#0B0B0A', accent, '#FFFFFF'] }));
      expect(contrast(b.colors.accentText, b.colors.accent)).toBeGreaterThanOrEqual(
        contrast(b.colors.accentText === '#0b0b0a' ? '#f7f4ea' : '#0b0b0a', b.colors.accent) - 0.01,
      );
    }
  });

  it('every emitted color is valid hex or rgba (never garbage)', () => {
    const { brand: b } = brandToKit(brand({ colors: ['#0B0B0A', '#D4A652', '#F7F4EA'] }));
    for (const k of ['bg', 'surface', 'surfaceAlt', 'text', 'muted', 'accent', 'accentText'] as const) {
      expect(isHex(b.colors[k])).toBe(true);
    }
    expect(b.colors.border).toMatch(/^rgba\(/);
  });
});

describe('brandToKit - robustness (Rule 29)', () => {
  it('a SINGLE color still yields a full legible palette', () => {
    const { brand: b } = brandToKit(brand({ colors: ['#2F6BFF'] }));
    expect(isHex(b.colors.bg)).toBe(true);
    expect(contrast(b.colors.text, b.colors.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('unparseable colors are skipped; valid ones used', () => {
    const { brand: b, isDefault } = brandToKit(brand({ colors: ['not-a-color', '#D4A652', 'xyz', 'rgb(11,11,10)'] }));
    expect(isDefault).toBe(false);
    expect(b.colors.accent.toLowerCase()).toBe('#d4a652');
  });

  it('rgb()/rgba() and 3-digit hex parse', () => {
    const { brand: b } = brandToKit(brand({ colors: ['#000', 'rgb(212,166,82)', 'rgba(247,244,234,1)'] }));
    expect(b.colors.accent.toLowerCase()).toBe('#d4a652');
  });

  it('all-grey palette (no saturation) does not crash, picks a mid accent', () => {
    const { brand: b } = brandToKit(brand({ colors: ['#111111', '#888888', '#EEEEEE'] }));
    expect(isHex(b.colors.accent)).toBe(true);
    expect(contrast(b.colors.text, b.colors.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('★ no colors / null → platform default (INSTURIX), isDefault=true (never a silent wrong brand)', () => {
    expect(brandToKit(brand({ colors: [] })).isDefault).toBe(true);
    expect(brandToKit(null).isDefault).toBe(true);
    expect(brandToKit(brand({ colors: ['garbage', ''] })).isDefault).toBe(true);
    // keeps the client name even on default
    expect(brandToKit(brand({ colors: [] }, 'ClientX')).brand.name).toBe('ClientX');
  });

  it('never throws on garbage input', () => {
    expect(() => brandToKit({} as UnifiedBrandLike)).not.toThrow();
    expect(() => brandToKit({ visual: { colors: [null as unknown as string, 123 as unknown as string] } })).not.toThrow();
  });
});

describe('brandToKit - style + type hints', () => {
  it('"bold" → denser + decor + snappier; "minimal" → airy + no decor', () => {
    const bold = brandToKit(brand({ colors: ['#000', '#f00'], visualStyle: 'bold editorial' })).brand;
    const min = brandToKit(brand({ colors: ['#000', '#f00'], visualStyle: 'minimal clean' })).brand;
    expect(bold.density).toBeGreaterThan(min.density);
    expect(bold.decor.grid).toBe(true);
    expect(min.decor.grid).toBe(false);
    expect(bold.motion.energy).toBeGreaterThan(min.motion.energy);
  });

  it('typography hint → font family', () => {
    expect(brandToKit(brand({ colors: ['#000'], typography: 'elegant serif' })).brand.fontSans).toMatch(/serif/i);
    expect(brandToKit(brand({ colors: ['#000'], typography: 'clean sans' })).brand.fontSans).toMatch(/Jakarta|Inter|sans/i);
  });
});
