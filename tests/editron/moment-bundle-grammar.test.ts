import { describe, expect, it } from 'vitest';
import { buildAtomicMomentBundle } from '../../lib/editron/services/moment-bundle';
import { resolveMomentBundleGrammar } from '../../lib/editron/services/moment-bundle-grammar';
import type { SignalSnapshot } from '../../lib/editron/services/signal-registry';

function expressiveSnapshot(): SignalSnapshot {
  return {
    frame: 180,
    timestampMs: 6_000,
    'speech.energy': 0.9,
    'speech.emotion_intensity': 0.86,
    'audio.music_beat': 0.74,
    'visual.significance': 0.82,
    'visual.motion_intensity': 0.48,
    'visual.motion_vector.x': -0.52,
    'visual.motion_vector.y': 0.18,
    'visual.face_present': true,
    'visual.eye_contact': 0.76,
    'visual.text_coverage': 0.46,
    'visual.text_box_count': 2,
    'visual.object_count': 3,
    'visual.negative_space.right': 0.84,
    'composite.cinematic_moment': 0.78,
    'composite.narrative_pressure': 0.7,
  };
}

describe('atomic moment bundle grammar', () => {
  it('coordinates non-SFX overlay families from bundle timing without selecting templates or assets', () => {
    const bundle = buildAtomicMomentBundle({
      frame: 180,
      fps: 30,
      snapshot: expressiveSnapshot(),
    });
    const grammar = resolveMomentBundleGrammar({ bundle });
    const byFamily = new Map(grammar.actions.map((action) => [action.family, action]));

    expect(grammar).toMatchObject({
      version: 'moment-bundle-grammar-v1',
      sourceBundleVersion: 'moment-bundle-v1',
      anchorFrame: bundle.rhythm.anchorFrame,
      northstar: {
        sourceOfTruth: 'primitive-atoms',
        createsOverlays: false,
        selectsAssets: false,
        selectsTemplates: false,
      },
    });
    expect(byFamily.get('frame-movement')?.startFrame).toBeLessThan(bundle.rhythm.anchorFrame);
    expect(byFamily.get('caption')?.peakFrame).toBe(bundle.rhythm.anchorFrame);
    expect(byFamily.get('motion-graphic')?.form.placementRegion).toBe('right');
    expect(byFamily.get('transition')?.status).toBe('ready');
    expect(byFamily.get('pacing')?.timing.holdFrames).toBe(bundle.rhythm.holdFrames);

    const sfx = byFamily.get('sfx');
    expect(sfx).toMatchObject({
      status: 'ready',
      role: expect.stringMatching(/accent|riser|punctuation|bed|detail|shimmer/),
    });
    expect(sfx?.startFrame).toBeLessThanOrEqual(bundle.rhythm.anchorFrame);
    expect(sfx?.form.sfx).toEqual(expect.objectContaining({
      intent: expect.any(String),
      compatibilityToken: expect.not.stringMatching(/^none$/),
      primitiveAtoms: expect.objectContaining({
        transient: expect.any(Object),
        rhythm: expect.any(Object),
        mix: expect.any(Object),
      }),
      queryTerms: expect.any(Array),
    }));
    expect(grammar.actions.every((action) => action.evidenceAtomKeys.length > 0)).toBe(true);
    expect(JSON.stringify(grammar)).not.toContain('presetId');
    expect(JSON.stringify(grammar)).not.toContain('templateId');
    expect(JSON.stringify(grammar)).not.toContain('transitionType');
    expect(JSON.stringify(grammar)).not.toContain('zoomType');
  });

  it('stays conservative on busy low-intent frames', () => {
    const bundle = buildAtomicMomentBundle({
      frame: 90,
      fps: 30,
      snapshot: {
        frame: 90,
        timestampMs: 3_000,
        'speech.energy': 0.12,
        'speech.emotion_intensity': 0.08,
        'visual.significance': 0.1,
        'visual.motion_intensity': 0.16,
        'visual.text_coverage': 0.82,
        'visual.text_box_count': 4,
        'visual.object_count': 7,
        'visual.face_present': true,
      } as SignalSnapshot,
    });
    const grammar = resolveMomentBundleGrammar({ bundle });
    const families = grammar.actions.map((action) => action.family);

    expect(grammar.timeline.screenDensity).toBe('restrained');
    expect(families).not.toContain('motion-graphic');
    expect(families).not.toContain('transition');
    expect(grammar.actions.every((action) => action.form.density === 'restrained')).toBe(true);
    for (const action of grammar.actions) {
      expect(action.constraints).toEqual(expect.arrayContaining(['preserve-legibility']));
    }
  });
});
