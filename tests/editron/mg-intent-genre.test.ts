import { describe, expect, it } from 'vitest';

import { classifyIntent, intentStyleDelta, INTENT_STYLE } from '@/lib/editron/motion-graphics/codegen/style/intent-genre';
import { resolveStyle } from '@/lib/editron/motion-graphics/codegen/style/style-resolver';

describe('MG style resolver — intent classifier', () => {
  it('maps upstream format/intent strings to a genre', () => {
    expect(classifyIntent('Product explainer video')).toBe('saas-demo');
    expect(classifyIntent('Instagram Reel')).toBe('hype-reel');
    expect(classifyIntent('daily vlog')).toBe('vlog');
    expect(classifyIntent('How-to guide')).toBe('tutorial');
    expect(classifyIntent('mini documentary')).toBe('documentary');
    expect(classifyIntent('brand commercial spot')).toBe('ad');
    expect(classifyIntent('untitled thing')).toBe('generic');
    expect(classifyIntent(undefined)).toBe('generic');
  });

  it('generic is a no-op; other genres carry a name + delta', () => {
    expect(INTENT_STYLE.generic).toEqual({});
    expect(INTENT_STYLE['hype-reel'].styleName).toBe('kinetic-bold');
    expect(intentStyleDelta('reel').genre).toBe('hype-reel');
  });
});

describe('MG style resolver — full compose (font ⊇ footage ⊇ intent)', () => {
  it('intent gets first say on the name + can push weight, even on a neutral serif font', () => {
    // Georgia = oldstyle-serif → editorial base (gentle, regular weight, flat)
    const doc = resolveStyle({ brandFont: 'Georgia' });
    expect(doc.styleName).toBe('editorial');
    expect(doc.weight).toBe('regular');

    // hype-reel intent overrides: kinetic name, heavy weight, pop motion, glow — even on the serif brand
    const hype = resolveStyle({ brandFont: 'Georgia', intent: 'hype reel' });
    expect(hype.styleName).toBe('kinetic-bold');
    expect(hype.weight).toBe('heavy'); // intent pushed weight (footage cannot)
    expect(hype.motion).toBe('pop');
    expect(hype.surface).toBe('glow');
    expect(hype.corner).toBe(doc.corner); // font identity still holds where nothing overrode
    expect(hype.sources).toContain('intent:hype-reel');
  });

  it('precedence is intent > footage > font on a contested axis', () => {
    // calm-warm footage wants motion 'gentle'; hype-reel intent wants 'pop' → intent wins
    const b = resolveStyle({ brandFont: 'Inter', footage: { warmth: 0.9 }, intent: 'reel' });
    expect(b.motion).toBe('pop');
    expect(b.sources).toContain('footage:calm-warm');
    expect(b.sources).toContain('intent:hype-reel');
  });

  it('footage wins where intent is silent; font wins where both are silent', () => {
    // documentary intent is silent on surface; cinematic-moody footage sets surface 'raised'
    const b = resolveStyle({ brandFont: 'Inter', footage: { brightness: 0.2 }, intent: 'documentary' });
    expect(b.surface).toBe('raised'); // footage (intent silent on surface)
    expect(b.motion).toBe('gentle'); // documentary intent
    expect(b.corner).toBe('medium'); // Inter/grotesque font default (both silent)
  });
});
