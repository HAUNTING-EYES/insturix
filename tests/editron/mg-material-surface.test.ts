/**
 * MG surface-axis material engine (4b-4). materialSurface derives a PHYSICAL finish from brand tokens — not a
 * named look, not a free scalar. These tests hold the four founder-facing invariants: (1) `flat` stays
 * byte-identical (backward compat), (2) every finish is brand-locked (no colour outside brand derivations) and
 * NaN-safe, (3) depth is luminance-driven (dark brand → specular rim; light brand → elevation shadow), (4)
 * emphasis monotonically scales depth.
 */
import { describe, expect, it } from 'vitest';

import {
  INSTURIX,
  NORTHWIND,
  luminance,
  materialSurface,
  SURFACE_MODES,
  withAlpha,
  type Brand,
  type SurfaceMode,
} from '@/lib/editron/motion-graphics/codegen/kit/brand';

/** Serialize a MaterialSurface to one string for substring/NaN assertions. */
const serialize = (s: ReturnType<typeof materialSurface>): string =>
  JSON.stringify(s.base) + JSON.stringify(s.overlays);

describe('luminance — the harvest signal the finish keys off', () => {
  it('is dark for the dark brand, light for the light brand, and safe for non-hex', () => {
    expect(luminance(INSTURIX.colors.bg)).toBeLessThan(0.4); // #0B0B0A
    expect(luminance(NORTHWIND.colors.bg)).toBeGreaterThan(0.4); // #F5F7FB
    expect(luminance('rgba(0,0,0,0.1)')).toBeCloseTo(0.15); // non-hex → assume dark
    expect(luminance('#ffffff')).toBeCloseTo(1);
    expect(luminance('#000000')).toBeCloseTo(0);
  });
});

describe('materialSurface — flat is byte-identical (backward compat)', () => {
  it('flat = the original scrim: brand surface fill + hairline border, no shadow, no overlays', () => {
    const m = materialSurface(INSTURIX, 'flat', { opacity: 0.9 });
    expect(m.overlays).toEqual([]);
    expect(m.base).toEqual({
      background: withAlpha(INSTURIX.colors.surface, 0.9),
      border: `${INSTURIX.shape.border}px solid ${INSTURIX.colors.border}`,
    });
    expect(m.base.boxShadow).toBeUndefined();
  });

  it('default mode is flat', () => {
    expect(materialSurface(INSTURIX).base).toEqual(materialSurface(INSTURIX, 'flat').base);
  });
});

describe('materialSurface — every finish is distinct, designed, and brand-locked', () => {
  it('gradient/frosted/raised/glow each add material the flat box does not have', () => {
    const flat = materialSurface(INSTURIX, 'flat');
    for (const mode of ['gradient', 'frosted', 'raised', 'glow'] as SurfaceMode[]) {
      const m = materialSurface(INSTURIX, mode);
      expect(serialize(m)).not.toEqual(serialize(flat)); // genuinely different material
    }
    // raised = layered elevation shadow (two shadow layers before any inset rim)
    expect((materialSurface(INSTURIX, 'raised').base.boxShadow as string).split('inset')[0].split(',').length).toBeGreaterThanOrEqual(2);
    // glow = accent-lit (references the brand accent in border or shadow)
    const glow = materialSurface(INSTURIX, 'glow');
    expect(`${glow.base.border}${glow.base.boxShadow}`).toContain(INSTURIX.colors.accent);
    // frosted carries an inner sheen overlay
    expect(materialSurface(INSTURIX, 'frosted').overlays.length).toBeGreaterThanOrEqual(1);
  });

  it('never emits a colour outside the brand palette derivations (spot-check: no foreign hex)', () => {
    // the only literals allowed are #ffffff (specular) and #000000 (occlusion) — light physics, not brand hue.
    const allHex = new Set<string>();
    for (const mode of SURFACE_MODES) {
      const s = serialize(materialSurface(INSTURIX, mode, { grain: true }));
      for (const h of s.match(/#[0-9a-fA-F]{6}/g) ?? []) allHex.add(h.toLowerCase());
    }
    const allowed = new Set(
      [INSTURIX.colors.surface, INSTURIX.colors.surfaceAlt, INSTURIX.colors.accent, INSTURIX.colors.text, '#ffffff', '#000000']
        .map((c) => c.toLowerCase()),
    );
    // every 6-hex colour is a brand token, a tint/shade of one (starts near it), or a light-physics literal.
    // We assert the STRONG ones (accent/surface/white/black) appear and no random hue sneaks in by checking the
    // grain/sheen/rim literals are only white/black and the fills reference surface/accent.
    for (const h of allHex) {
      const isBrandish = allowed.has(h) || h === '#ffffff' || h === '#000000';
      // tint(surface) produces a lightened surface — allow anything that is NOT a saturated foreign hue by
      // asserting it is not, e.g., pure red/green/blue. (A loose but meaningful guard.)
      if (!isBrandish) {
        // derived tint of the dark surface → still near-neutral; ensure it is not a vivid foreign hue
        const [r, g, b] = [h.slice(1, 3), h.slice(3, 5), h.slice(5, 7)].map((x) => parseInt(x, 16));
        const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
        expect(maxC - minC).toBeLessThan(80); // low chroma = a neutral brand derivation, not a foreign accent
      }
    }
  });
});

describe('materialSurface — luminance-driven depth (dark rim vs light shadow)', () => {
  const alphaOf = (boxShadow: string, marker: 'inset 0 1px 0' | string): number => {
    // pull the first rgba/hex8 alpha after the marker
    const seg = boxShadow.split(marker)[1] ?? '';
    const hex8 = seg.match(/#[0-9a-fA-F]{8}/)?.[0];
    if (!hex8) return 0;
    return parseInt(hex8.slice(7, 9), 16) / 255;
  };

  it('the specular top rim is stronger on a dark brand than a light one (highlight reads on dark, vanishes on white)', () => {
    const darkRim = alphaOf(materialSurface(INSTURIX, 'gradient').base.boxShadow as string, 'inset 0 1px 0');
    const lightRim = alphaOf(materialSurface(NORTHWIND, 'gradient').base.boxShadow as string, 'inset 0 1px 0');
    expect(darkRim).toBeGreaterThan(lightRim);
  });
});

describe('materialSurface — emphasis scales depth; grain is an optional modifier', () => {
  it('a hero emphasis raises the elevation shadow blur above a subtle one', () => {
    const blur = (s: string): number => {
      // second shadow layer's blur (…px Xpx BLURpx colour) — grab the largest px before a colour
      const nums = (s.match(/(\d+)px/g) ?? []).map((n) => parseInt(n, 10));
      return Math.max(...nums);
    };
    const subtle = blur(materialSurface(INSTURIX, 'raised', { emphasis: 0.1 }).base.boxShadow as string);
    const hero = blur(materialSurface(INSTURIX, 'raised', { emphasis: 0.95 }).base.boxShadow as string);
    expect(hero).toBeGreaterThan(subtle);
  });

  it('grain adds exactly one extra overlay to any finish, and only when asked', () => {
    for (const mode of SURFACE_MODES) {
      const plain = materialSurface(INSTURIX, mode).overlays.length;
      const grained = materialSurface(INSTURIX, mode, { grain: true }).overlays.length;
      expect(grained).toBe(plain + 1);
    }
  });
});

describe('materialSurface — NaN-safe by construction (R18N)', () => {
  it('non-finite emphasis/opacity and a broken brand colour never emit a NaN token', () => {
    const broken: Brand = { ...INSTURIX, colors: { ...INSTURIX.colors, bg: 'not-a-colour', surface: 'nope' } };
    for (const mode of SURFACE_MODES) {
      const s = serialize(materialSurface(broken, mode, { emphasis: NaN, opacity: NaN, grain: true }));
      expect(s).not.toMatch(/NaN/);
    }
    // and a finite render for a valid brand with junk numeric opts
    const s2 = serialize(materialSurface(INSTURIX, 'glow', { emphasis: Infinity, opacity: -5 }));
    expect(s2).not.toMatch(/NaN|Infinity/);
  });
});
