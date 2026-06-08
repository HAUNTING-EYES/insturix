import { describe, expect, it } from 'vitest';
import {
  buildAtomicMomentBundle,
  buildMomentAtomsFromSnapshot,
  bundleHasLegacyPresetLabels,
  momentBundleToSignalMap,
  MOMENT_PRIMITIVE_SIGNAL_KEYS,
} from '../../lib/editron/services/moment-bundle';
import { resolveAtomicTransitionForm } from '../../lib/editron/services/transition-form';
import { resolveAtomicZoomForm } from '../../lib/editron/services/zoom-form';
import type { SignalSnapshot } from '../../lib/editron/services/signal-registry';

function richSnapshot(): SignalSnapshot {
  return {
    frame: 120,
    timestampMs: 4_000,
    'speech.energy': 0.86,
    'speech.emotion_intensity': 0.78,
    'audio.music_beat': 0.4,
    'visual.significance': 0.9,
    'visual.motion_intensity': 0.42,
    'visual.motion_vector.x': -0.35,
    'visual.motion_vector.y': 0.18,
    'visual.main_subject.x': 0.22,
    'visual.main_subject.y': 0.35,
    'visual.main_subject.width': 0.28,
    'visual.main_subject.height': 0.52,
    'visual.face_count': 1,
    'visual.eye_contact': 0.8,
    'visual.text_coverage': 0.38,
    'visual.text_box_count': 2,
    'visual.object_count': 5,
    'visual.negative_space.right': 0.82,
    'visual.negative_space.left': 0.12,
    'composite.cinematic_moment': 0.74,
    'composite.narrative_pressure': 0.68,
  };
}

describe('atomic moment bundle', () => {
  it('splits primitive facts from derived moment atoms and constraints', () => {
    const bundle = buildAtomicMomentBundle({
      frame: 150,
      fps: 30,
      snapshot: richSnapshot(),
      sourceFrame: 615,
    });

    expect(bundle).toMatchObject({
      version: 'moment-bundle-v1',
      frame: 150,
      sourceFrame: 615,
      northstar: {
        sourceOfTruth: 'primitive-atoms',
        generatesLegacyPresetLabels: false,
      },
    });
    expect(bundle.primitiveAtoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ level: 'primitive', key: 'visual.main_subject.x', value: 0.22 }),
      expect.objectContaining({ level: 'primitive', key: 'visual.text_coverage', value: 0.38 }),
      expect.objectContaining({ level: 'primitive', key: 'visual.motion_vector.x', value: -0.35 }),
    ]));
    expect(bundle.derivedAtoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ level: 'derived', key: 'moment.speech_peak' }),
      expect.objectContaining({ level: 'derived', key: 'moment.screen_busyness' }),
      expect.objectContaining({ level: 'derived', key: 'moment.negative_space_region', value: 'right' }),
    ]));
    expect(bundle.screen).toMatchObject({
      negativeSpace: { region: 'right', strength: 0.82 },
      subject: { x: 0.22, y: 0.35, width: 0.28, height: 0.52 },
    });
    expect(bundle.screen.motionVector).toMatchObject({
      x: -0.35,
      y: 0.18,
    });
    expect(bundle.constraints).toMatchObject({
      avoidFaces: true,
      avoidOnScreenText: true,
      preferNegativeSpace: true,
      preserveLegibility: true,
    });
    expect(bundle.familyIntents.motionGraphic).toBeGreaterThan(0);
    expect(bundle.familyIntents.captionEmphasis).toBeGreaterThan(0);
    expect(bundle.familyIntents.sfx).toBeGreaterThan(0);
  });

  it('keeps the shared primitive signal vocabulary factual and broad', () => {
    const atoms = buildMomentAtomsFromSnapshot(richSnapshot());
    const primitiveKeys = atoms
      .filter((atom) => atom.level === 'primitive')
      .map((atom) => atom.key);

    expect(MOMENT_PRIMITIVE_SIGNAL_KEYS.has('visual.main_subject.x')).toBe(true);
    expect(MOMENT_PRIMITIVE_SIGNAL_KEYS.has('visual.text_coverage')).toBe(true);
    expect(MOMENT_PRIMITIVE_SIGNAL_KEYS.has('visual.negative_space.right')).toBe(true);
    expect(primitiveKeys).toEqual(expect.arrayContaining([
      'speech.energy',
      'speech.emotion_intensity',
      'visual.motion_vector.x',
      'visual.face_count',
      'visual.object_count',
    ]));
  });

  it('does not emit legacy preset labels as bundle output', () => {
    const bundle = buildAtomicMomentBundle({
      frame: 30,
      fps: 30,
      snapshot: {
        frame: 30,
        timestampMs: 1_000,
        'speech.energy': 0.9,
        'visual.significance': 0.7,
        zoomType: 'punch-in',
        transitionType: 'whip-pan',
        graphicType: 'keyword-highlight',
      } as SignalSnapshot,
    });

    expect(bundleHasLegacyPresetLabels(bundle)).toBe(false);
    expect(JSON.stringify(bundle)).not.toContain('punch-in');
    expect(JSON.stringify(bundle)).not.toContain('whip-pan');
    expect(JSON.stringify(bundle)).not.toContain('keyword-highlight');
  });

  it('lets zoom and transition forms consume moment bundles without preset labels', () => {
    const bundle = buildAtomicMomentBundle({
      frame: 90,
      fps: 30,
      snapshot: {
        frame: 90,
        timestampMs: 3_000,
        'speech.energy': 0.78,
        'audio.music_beat': 0.9,
        'visual.significance': 0.8,
        'visual.motion_intensity': 0.84,
        'visual.motion_vector.x': -0.86,
        'visual.motion_vector.y': 0.06,
        'visual.main_subject.x': 0.25,
        'visual.main_subject.y': 0.44,
        'visual.main_subject.width': 0.24,
        'visual.main_subject.height': 0.5,
        'visual.text_coverage': 0.04,
        'visual.text_box_count': 0,
        'visual.object_count': 1,
        'visual.face_count': 0,
      } as SignalSnapshot,
    });

    const signals = momentBundleToSignalMap(bundle);
    expect(signals.motion_vector_x).toBe(-0.86);
    expect(signals.transitionType).toBeUndefined();
    expect(signals.zoomType).toBeUndefined();

    const zoom = resolveAtomicZoomForm({
      momentBundle: bundle,
      localFrame: 90,
      sceneEnd: 210,
    });
    expect(zoom.compatibilityType).toBe('punch-in');
    expect(zoom.focal.transformOrigin).toBe('25% 44%');

    const transition = resolveAtomicTransitionForm({
      momentBundle: bundle,
    });
    expect(transition.intent).toBe('motion-transfer');
    expect(transition.compatibilityType).toBe('whip-pan');
    expect(transition.direction.label).toBe('left');
  });
});
