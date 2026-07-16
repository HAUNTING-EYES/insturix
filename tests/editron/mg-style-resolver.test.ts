import { describe, expect, it } from 'vitest';

import {
  resolveVideoStyle,
  resolveMomentStyle,
  renderStyleDirection,
  type VideoStyle,
} from '@/lib/editron/motion-graphics/codegen/style/style-resolver';
import { buildCodegenPrompt, CODEGEN_STABLE_PREFIX } from '@/lib/editron/motion-graphics/codegen/codegen-service';
import { INSTURIX } from '@/lib/editron/motion-graphics/codegen/kit/brand';
import type { MgMomentInput } from '@/lib/editron/motion-graphics/codegen/types';

const moment = (over: Partial<MgMomentInput> = {}): MgMomentInput => ({
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
  expressiveness: { tier: 'standard', intensity: 0.6, emphasisScale: 1 },
  placement: { region: 'full-frame', avoid: [], prefer: [] },
  ...over,
});

describe('MG style resolver — VIDEO identity (resolved once)', () => {
  it('font is the base; intent gets first say on name + weight', () => {
    const editorial = resolveVideoStyle({ brandFont: 'Georgia' });
    expect(editorial.styleName).toBe('editorial');
    expect(editorial.weight).toBe('regular');

    const hype = resolveVideoStyle({ brandFont: 'Georgia', intent: 'hype reel' });
    expect(hype.styleName).toBe('kinetic-bold'); // intent overrides the serif identity
    expect(hype.weight).toBe('heavy');
    expect(hype.corner).toBe(editorial.corner); // font identity holds where nothing overrode

    expect(resolveVideoStyle({ brandFont: 'X', styleOverride: 'neon' }).styleName).toBe('neon');
  });

  it('SIGNAL-DRIVEN: aggregate signals drive identity and BEAT the font (font demoted, precedence intent>signals>font)', () => {
    // high-energy/casual signals → kinetic-bold, even on a CALM serif brand font (Georgia alone = editorial)
    const energetic = resolveVideoStyle({ brandFont: 'Georgia', videoSignals: { energy: 0.9, formality: 0.2 } });
    expect(energetic.styleName).toBe('kinetic-bold'); // signals beat the font
    expect(energetic.motion).toBe('pop');
    expect(energetic.weight).toBe('heavy');
    expect(energetic.sources).toContain('signals');

    // formal/calm signals → editorial/restrained, even on a DISPLAY brand font (Anton alone = kinetic-bold)
    const calm = resolveVideoStyle({ brandFont: 'Anton', videoSignals: { energy: 0.2, formality: 0.9 } });
    expect(calm.styleName).toBe('editorial'); // signals beat the display font
    expect(calm.motion).toBe('gentle');
    expect(calm.weight).toBe('regular');

    // intent still wins the name over signals (the stated "why" is strongest)
    const intentWins = resolveVideoStyle({ intent: 'hype reel', videoSignals: { energy: 0.2, formality: 0.9 } });
    expect(intentWins.styleName).toBe('kinetic-bold');

    // no intent + no signals → font is the fallback (backward-compatible)
    expect(resolveVideoStyle({ brandFont: 'Georgia' }).styleName).toBe('editorial');
  });
});

describe('MG style resolver — MOMENT treatment (resolved PER moment, the anti-monotony fix)', () => {
  const video: VideoStyle = resolveVideoStyle({ brandFont: 'Plus Jakarta Sans, Inter, sans-serif' }); // clean-modern

  it('salience + tier drive per-moment emphasis (a peak reads large, a quiet beat small)', () => {
    expect(resolveMomentStyle(video, { tier: 'hero' }).emphasis).toBe('prominent');
    expect(resolveMomentStyle(video, { salience: 0.9 }).emphasis).toBe('prominent');
    expect(resolveMomentStyle(video, { tier: 'subtle' }).emphasis).toBe('quiet');
    expect(resolveMomentStyle(video, { salience: 0.2 }).emphasis).toBe('quiet');
    expect(resolveMomentStyle(video, { salience: 0.5 }).emphasis).toBe('balanced');
  });

  it('R5 regression: emphasis follows CONTINUOUS salience even when every beat is tier=hero', () => {
    expect(resolveMomentStyle(video, { tier: 'hero', salience: 0.9 }).emphasis).toBe('prominent');
    expect(resolveMomentStyle(video, { tier: 'hero', salience: 0.5 }).emphasis).toBe('balanced');
    expect(resolveMomentStyle(video, { tier: 'hero', salience: 0.2 }).emphasis).toBe('quiet');
  });

  it('R7 regression: quantitative facts suppress background texture (clean data graphic)', () => {
    const doc = resolveVideoStyle({ brandFont: 'Georgia', intent: 'documentary' }); // base texture grain
    expect(resolveMomentStyle(doc, { factKind: 'comparison' }).texture).toBe('none');
    expect(resolveMomentStyle(doc, { factKind: 'magnitude-stat' }).texture).toBe('none');
    expect(resolveMomentStyle(doc, { factKind: 'concept' }).texture).toBe('grain'); // non-data keeps it
  });

  it('THIS moment\'s footage narrows the treatment; beats enable sync', () => {
    const energetic = resolveMomentStyle(video, { footage: { motionEnergy: 0.9 } });
    expect(energetic.motion).toBe('pop'); // footage of THIS moment
    expect(energetic.surface).toBe('glow');
    expect(resolveMomentStyle(video, { beatFrames: [10, 20, 30] }).beatSync).toBe(true);
    expect(resolveMomentStyle(video, {}).beatSync).toBe(false);
  });

  it('TWO moments, SAME video identity, DIFFERENT treatment (monotony fix)', () => {
    const a = resolveMomentStyle(video, { tier: 'hero', footage: { motionEnergy: 0.9 }, beatFrames: [5] });
    const b = resolveMomentStyle(video, { tier: 'subtle', footage: { brightness: 0.2 } });
    // same identity underneath, but the two graphics differ in emphasis, motion, surface
    expect(a.emphasis).not.toBe(b.emphasis); // prominent vs quiet
    expect(a.motion).not.toBe(b.motion); // pop vs smooth (cinematic-moody)
    expect(a.surface).not.toBe(b.surface); // glow vs raised
  });
});

describe('MG style resolver — prompt wiring (cache-safe, per-moment)', () => {
  it('no videoStyle → byte-identical cached prefix, no style block', () => {
    const p = buildCodegenPrompt(moment());
    expect(p.startsWith(CODEGEN_STABLE_PREFIX)).toBe(true);
    expect(p).not.toMatch(/<style_direction>/);
  });

  it('with videoStyle → same cached prefix, the per-moment direction appended after', () => {
    const video = resolveVideoStyle({ brandFont: 'Anton' });
    const p = buildCodegenPrompt(moment({ videoStyle: video, footageSignals: { motionEnergy: 0.9 } }));
    expect(p.slice(0, CODEGEN_STABLE_PREFIX.length)).toBe(CODEGEN_STABLE_PREFIX);
    expect(p).toMatch(/<style_direction>/);
    expect(p).toMatch(/kinetic-bold/); // the video identity
    expect(p.indexOf('<style_direction>')).toBeGreaterThan(CODEGEN_STABLE_PREFIX.length);
  });

  it('renderStyleDirection carries BOTH the video identity and this moment\'s treatment', () => {
    const video = resolveVideoStyle({ brandFont: 'Anton' });
    const block = renderStyleDirection(video, resolveMomentStyle(video, { tier: 'hero', footage: { motionEnergy: 0.9 } }));
    expect(block).toMatch(/kinetic-bold/); // identity
    expect(block).toMatch(/PEAK moment/); // this moment's emphasis
    expect(block).toMatch(/surface="glow"/); // this moment's footage-driven surface
  });
});
