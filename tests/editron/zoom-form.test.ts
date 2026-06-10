import { describe, expect, it } from 'vitest';
import { resolveAtomicZoomForm } from '@/lib/editron/services/zoom-form';

describe('resolveAtomicZoomForm', () => {
  it('generates an emphasis push from atoms without requiring a zoom preset', () => {
    const form = resolveAtomicZoomForm({
      localFrame: 60,
      sceneEnd: 180,
      signals: {
        speech_energy: 0.88,
        word_importance: 0.91,
        beat_strength: 0.76,
        visual_significance: 0.7,
        main_subject_x: 0.72,
        main_subject_y: 0.38,
        face_present: 1,
      },
    });

    expect(form.version).toBe('atomic-zoom-form-v1');
    expect(form.intent).toBe('emphasis-push');
    expect(form.compatibilityType).toBe('punch-in');
    expect(form.scaleFrom).toBeCloseTo(1);
    expect(form.scaleTo).toBeGreaterThan(1.08);
    expect(form.durationFrames).toBeLessThanOrEqual(14);
    expect(form.startFrame).toBeLessThan(60);
    expect(form.holdFrames).toBeGreaterThan(0);
    expect(form.focal.transformOrigin).toBe('72% 38%');
  });

  it('restrains scale amplitude on busy visual frames', () => {
    const calm = resolveAtomicZoomForm({
      localFrame: 45,
      sceneEnd: 150,
      signals: { speech_energy: 0.82, word_importance: 0.8, visual_complexity: 0.1, text_on_screen: 0 },
    });
    const busy = resolveAtomicZoomForm({
      localFrame: 45,
      sceneEnd: 150,
      signals: { speech_energy: 0.82, word_importance: 0.8, visual_complexity: 0.92, text_on_screen: 0.9 },
    });

    expect(busy.scaleDelta).toBeLessThan(calm.scaleDelta);
    expect(busy.visualPressure).toBeGreaterThan(0.8);
  });

  it('generates pull-back form from reveal/topic-shift atoms without preset selection', () => {
    const form = resolveAtomicZoomForm({
      localFrame: 80,
      sceneEnd: 220,
      signals: {
        topic_shift: 0.84,
        visual_significance: 0.66,
        emotion_intensity: 0.52,
      },
    });

    expect(form.intent).toBe('reveal-pull-back');
    expect(form.direction).toBe('pull-back');
    expect(form.compatibilityType).toBe('pull-back');
    expect(form.scaleFrom).toBeGreaterThan(form.scaleTo);
    expect(form.keyframes[0].value).toBeGreaterThan(form.keyframes[form.keyframes.length - 1].value);
  });

  it('preserves explicit scale params as compatibility input while still emitting atomic form metadata', () => {
    const form = resolveAtomicZoomForm({
      localFrame: 30,
      sceneEnd: 120,
      durationFrames: 18,
      params: { scaleFrom: 1, scaleTo: 1.07 },
      signals: { main_subject_x: 0.61, main_subject_y: 0.44, face_present: 1 },
    });

    expect(form.scaleFrom).toBe(1);
    expect(form.scaleTo).toBe(1.07);
    expect(form.durationFrames).toBe(18);
    expect(form.focal.transformOrigin).toBe('61% 44%');
  });

  it('keeps inferred subject anchors inside a safe zoom focal zone', () => {
    const inferred = resolveAtomicZoomForm({
      localFrame: 30,
      sceneEnd: 120,
      signals: {
        speech_energy: 0.78,
        main_subject_x: 0.03,
        main_subject_y: 0.95,
        face_present: 1,
      },
    });
    const explicit = resolveAtomicZoomForm({
      localFrame: 30,
      sceneEnd: 120,
      signals: {
        speech_energy: 0.78,
        zoom_focal_x: 0.03,
        zoom_focal_y: 0.95,
      },
    });

    expect(inferred.focal.transformOrigin).toBe('16% 82%');
    expect(explicit.focal.transformOrigin).toBe('3% 95%');
  });
});
