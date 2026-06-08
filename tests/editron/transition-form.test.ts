import { describe, expect, it } from 'vitest';
import { resolveAtomicTransitionForm } from '@/lib/editron/services/transition-form';

describe('resolveAtomicTransitionForm', () => {
  it('generates motion-transfer form from primitive motion vector without requiring a transition preset', () => {
    const form = resolveAtomicTransitionForm({
      signals: {
        motion_vector_x: 0.86,
        motion_vector_y: 0.08,
        motion_intensity: 0.82,
        beat_strength: 0.84,
        speech_energy: 0.72,
        text_on_screen: 0,
      },
    });

    expect(form.version).toBe('atomic-transition-form-v1');
    expect(form.intent).toBe('motion-transfer');
    expect(form.compatibilityType).toBe('whip-pan');
    expect(form.direction.label).toBe('right');
    expect(form.direction.x).toBeGreaterThan(0.8);
    expect(form.durationFrames).toBeLessThanOrEqual(12);
    expect(form.blurPx).toBeGreaterThanOrEqual(25);
    expect(form.sfxRole).toBe('fast-whoosh');
  });

  it('restrains harsh transitions on text-heavy face/gaze frames', () => {
    const form = resolveAtomicTransitionForm({
      params: { transitionType: 'zoom-punch' },
      signals: {
        beat_strength: 0.9,
        text_on_screen: 0.92,
        visual_complexity: 0.86,
        face_present: 1,
        visual_eye_contact: 1,
      },
    });

    expect(form.compatibilityType).toBe('soft-cut');
    expect(form.visualPressure).toBeGreaterThan(0.9);
    expect(form.sfxRole).toBe('none');
    expect(form.softness).toBeGreaterThan(0.7);
  });

  it('generates dissolve form for low-motion topic continuity', () => {
    const form = resolveAtomicTransitionForm({
      signals: {
        topic_shift: 0.82,
        emotion_intensity: 0.52,
        motion_intensity: 0.12,
        text_on_screen: 0.1,
      },
    });

    expect(form.intent).toBe('continuity-blend');
    expect(form.compatibilityType).toBe('dissolve');
    expect(form.durationFrames).toBeGreaterThanOrEqual(30);
    expect(form.keyframeBased).toBe(true);
  });

  it('uses subject position as a weak fallback direction when no motion vector exists', () => {
    const form = resolveAtomicTransitionForm({
      signals: {
        main_subject_x: 0.82,
        main_subject_y: 0.45,
        speech_energy: 0.55,
      },
    });

    expect(form.direction.label).toBe('right');
    expect(form.direction.x).toBeGreaterThan(0.2);
    expect(form.direction.magnitude).toBeLessThan(0.3);
  });

  it('lets strong primitive motion atoms override an upstream soft-cut hint', () => {
    const form = resolveAtomicTransitionForm({
      params: { transitionType: 'soft-cut' },
      signals: {
        motion_vector_x: -0.74,
        motion_intensity: 0.86,
        beat_strength: 0.82,
        speech_energy: 0.78,
        text_on_screen: 0,
        visual_complexity: 0.12,
      },
    });

    expect(form.compatibilityType).toBe('whip-pan');
    expect(form.intent).toBe('motion-transfer');
    expect(form.sfxRole).toBe('fast-whoosh');
  });
});
