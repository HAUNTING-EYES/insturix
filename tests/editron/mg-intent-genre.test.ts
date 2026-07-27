import { describe, expect, it } from 'vitest';

import { classifyIntent, intentStyleDelta, INTENT_STYLE } from '@/lib/editron/motion-graphics/codegen/style/intent-genre';
import { resolveVideoStyle, resolveMomentStyle } from '@/lib/editron/motion-graphics/codegen/style/style-resolver';

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

  it('R4 regression: specific genre beats the generic saas catch-all on ambiguous strings', () => {
    expect(classifyIntent('documentary-style product demo')).toBe('documentary');
    expect(classifyIntent('product launch hype')).toBe('hype-reel');
    expect(classifyIntent('tiktok')).toBe('hype-reel');
    expect(classifyIntent('product explainer')).toBe('saas-demo'); // still saas when no specific genre
  });

  it('generic is a no-op; other genres carry a name + delta', () => {
    expect(INTENT_STYLE.generic).toEqual({});
    expect(INTENT_STYLE['hype-reel'].styleName).toBe('kinetic-bold');
    expect(intentStyleDelta('reel').genre).toBe('hype-reel');
  });
});

describe('MG style resolver — intent sets the video IDENTITY; moments vary within it', () => {
  it('intent gets first say on the video name + pushes weight, even on a neutral serif font', () => {
    // Georgia = oldstyle-serif → editorial base (gentle, regular weight)
    const doc = resolveVideoStyle({ brandFont: 'Georgia' });
    expect(doc.styleName).toBe('editorial');
    expect(doc.weight).toBe('regular');

    // hype-reel intent overrides the identity: kinetic name, heavy weight, pop base motion, glow base surface
    const hype = resolveVideoStyle({ brandFont: 'Georgia', intent: 'hype reel' });
    expect(hype.styleName).toBe('kinetic-bold');
    expect(hype.weight).toBe('heavy');
    expect(hype.motion).toBe('pop');
    expect(hype.baseSurface).toBe('glow');
    expect(hype.corner).toBe(doc.corner); // font identity still holds where nothing overrode
    expect(hype.sources).toContain('intent:hype-reel');
  });

  it('a calm reflective beat INSIDE a hype video reads calmer — identity holds, the moment softens', () => {
    const video = resolveVideoStyle({ brandFont: 'Inter', intent: 'reel' }); // kinetic-bold, base motion pop
    expect(resolveMomentStyle(video, {}).motion).toBe('pop'); // most moments ride the identity
    const calmBeat = resolveMomentStyle(video, { footage: { warmth: 0.9 } });
    expect(calmBeat.motion).toBe('gentle'); // THIS moment softened (calm-warm footage)
    expect(video.styleName).toBe('kinetic-bold'); // the video is STILL kinetic-bold overall
    expect(video.weight).toBe('heavy'); // identity weight held
  });

  it('a moody beat in a documentary: footage sets this moment\'s surface, identity sets the name', () => {
    const video = resolveVideoStyle({ brandFont: 'Inter', intent: 'documentary' }); // editorial, gentle
    const moody = resolveMomentStyle(video, { footage: { brightness: 0.2, faceEmotion: 'sad' } }); // cinematic-moody (dark + a face)
    expect(video.styleName).toBe('editorial');
    expect(video.motion).toBe('gentle'); // documentary identity
    expect(moody.surface).toBe('raised'); // this moment's footage
    expect(moody.motion).toBe('smooth'); // cinematic-moody footage softens this moment
  });
});
