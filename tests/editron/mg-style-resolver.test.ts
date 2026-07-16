import { describe, expect, it } from 'vitest';

import { resolveStyle, renderStyleDirection } from '@/lib/editron/motion-graphics/codegen/style/style-resolver';
import { buildCodegenPrompt, CODEGEN_STABLE_PREFIX } from '@/lib/editron/motion-graphics/codegen/codegen-service';
import { INSTURIX } from '@/lib/editron/motion-graphics/codegen/kit/brand';
import type { MgMomentInput } from '@/lib/editron/motion-graphics/codegen/types';
import type { StyleBundle } from '@/lib/editron/motion-graphics/codegen/style/style-resolver';

const moment = (style?: StyleBundle): MgMomentInput => ({
  momentId: 'm',
  brand: INSTURIX,
  window: { startFrame: 0, endFrame: 60, fps: 30 },
  candidate: {
    id: 's', factKind: 'comparison',
    sourceSpan: { text: 'x', startMs: 0, endMs: 1, source: 'voiceover-transcript' },
    content: { from: 480, to: 20, unit: 's' }, evidenceKeys: [], licenses: ['source-span'],
    salience: 0.7, rhetoricalRole: 'claim', hardGate: { passed: true, reasons: [], blockedBy: [] },
    scoreInputs: { structuralStrength: 0.7, salience: 0.7, evidenceStrength: 0.6, renderRisk: 0.2 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any,
  expressiveness: { tier: 'hero', intensity: 0.8, emphasisScale: 1.2 },
  placement: { region: 'full-frame', avoid: [], prefer: [] },
  style,
});

describe('MG style resolver — composer + prompt wiring', () => {
  it('resolves a coherent bundle from the brand font', () => {
    const anton = resolveStyle({ brandFont: 'Anton' });
    expect(anton.styleName).toBe('kinetic-bold');
    expect(anton.weight).toBe('heavy');
    expect(anton.surface).toBe('glow');
    expect(anton.motion).toBe('pop');
    expect(anton.sources).toContain('font:display');

    const mono = resolveStyle({ brandFont: 'JetBrains Mono' });
    expect(mono.styleName).toBe('technical');
    expect(mono.texture).toBe('grid');

    const jakarta = resolveStyle({ brandFont: 'Plus Jakarta Sans, Inter, sans-serif' });
    expect(jakarta.styleName).toBe('clean-modern'); // grotesque-sans
  });

  it('a user style override wins the name and is recorded in sources', () => {
    const b = resolveStyle({ brandFont: 'Anton', styleOverride: 'neon-brutalist' });
    expect(b.styleName).toBe('neon-brutalist');
    expect(b.sources).toContain('user:override');
    // priors still come from the font (the override renames, does not fabricate priors)
    expect(b.weight).toBe('heavy');
  });

  it('renderStyleDirection surfaces the style, weight number, and surface lean', () => {
    const block = renderStyleDirection(resolveStyle({ brandFont: 'Anton' }));
    expect(block).toMatch(/<style_direction>/);
    expect(block).toMatch(/kinetic-bold/);
    expect(block).toMatch(/surface="glow"/);
    expect(block).toMatch(/~750/); // heavy → 750
  });

  it('the prompt is cache-safe: no style → byte-identical prefix, no style block', () => {
    const p = buildCodegenPrompt(moment());
    expect(p.startsWith(CODEGEN_STABLE_PREFIX)).toBe(true);
    expect(p).not.toMatch(/<style_direction>/);
  });

  it('with a style: same cached prefix, the direction is VOLATILE (appended after)', () => {
    const styled = buildCodegenPrompt(moment(resolveStyle({ brandFont: 'Anton' })));
    // the cached prefix is byte-identical to the unstyled prompt's prefix
    expect(styled.startsWith(CODEGEN_STABLE_PREFIX)).toBe(true);
    expect(styled.slice(0, CODEGEN_STABLE_PREFIX.length)).toBe(CODEGEN_STABLE_PREFIX);
    // the style block exists and lives AFTER the prefix (in the volatile tail)
    expect(styled).toMatch(/<style_direction>/);
    expect(styled.indexOf('<style_direction>')).toBeGreaterThan(CODEGEN_STABLE_PREFIX.length);
  });
});
