import { describe, expect, it } from 'vitest';
import { resolveAtomicZoomForm } from '@/lib/editron/services/zoom-form';
import { evaluateKeyframeTrack } from '@/components/editron/editor/version-7.0.0/utils/keyframe-evaluator';

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
    expect(form.scaleTo).toBeGreaterThan(1.15);
    expect(form.durationFrames).toBeLessThanOrEqual(14);
    expect(form.startFrame).toBeLessThan(60);
    expect(form.holdFrames).toBeGreaterThan(0);
    expect(form.focal.transformOrigin).toBe('72% 38%');
    expect(form.keyframes[0].easing).toBe('snap-out');

    const midpointFrame = Math.round((form.keyframes[0].frame + form.keyframes[1].frame) / 2);
    const easedMidpoint = evaluateKeyframeTrack({ property: 'scale', keyframes: form.keyframes }, midpointFrame);
    const linearMidpoint = form.scaleFrom + ((form.scaleTo - form.scaleFrom) * 0.5);
    expect(easedMidpoint).toBeGreaterThan(linearMidpoint);
  });

  it('uses intent-tiered scale ranges from signal strength', () => {
    const emphasis = resolveAtomicZoomForm({
      localFrame: 60,
      sceneEnd: 180,
      signals: { word_importance: 0.94, speech_energy: 0.9, visual_complexity: 0.05 },
    });
    const cinematic = resolveAtomicZoomForm({
      localFrame: 60,
      sceneEnd: 180,
      signals: { speech_energy: 0.45, visual_significance: 0.36, visual_complexity: 0.05 },
    });
    const reveal = resolveAtomicZoomForm({
      localFrame: 60,
      sceneEnd: 180,
      signals: { topic_shift: 0.88, visual_significance: 0.62, visual_complexity: 0.05 },
    });

    expect(emphasis.intent).toBe('emphasis-push');
    expect(emphasis.scaleDelta).toBeGreaterThanOrEqual(0.1);
    expect(emphasis.scaleDelta).toBeLessThanOrEqual(0.22);
    expect(cinematic.intent).toBe('cinematic-push');
    expect(cinematic.scaleDelta).toBeGreaterThanOrEqual(0.03);
    expect(cinematic.scaleDelta).toBeLessThanOrEqual(0.08);
    expect(reveal.intent).toBe('reveal-pull-back');
    expect(Math.abs(reveal.scaleDelta)).toBeGreaterThanOrEqual(0.06);
    expect(Math.abs(reveal.scaleDelta)).toBeLessThanOrEqual(0.15);
  });

  it('blends requested strength with signal intensity without licensing a preset', () => {
    const baseInput = {
      localFrame: 45,
      sceneEnd: 150,
      signals: { speech_energy: 0.64, visual_complexity: 0.05 },
    };
    const high = resolveAtomicZoomForm({
      ...baseInput,
      params: {
        editorialPreferencePolicy: {
          mode: 'prefer',
          editorialFamily: 'zoom',
          intensity: 1,
        },
      },
    });
    const low = resolveAtomicZoomForm({
      ...baseInput,
      params: {
        editorialPreferencePolicy: {
          mode: 'prefer',
          editorialFamily: 'zoom',
          intensity: 0.16,
        },
      },
    });
    const wrongFamily = resolveAtomicZoomForm({
      ...baseInput,
      params: {
        editorialPreferencePolicy: {
          mode: 'prefer',
          editorialFamily: 'transitions',
          intensity: 1,
        },
      },
    });

    expect(high.intensity).toBeCloseTo(0.8);
    expect(low.intensity).toBeCloseTo(0.32);
    expect(high.scaleDelta).toBeGreaterThan(low.scaleDelta);
    expect(high.editorialPreference).toMatchObject({
      mode: 'prefer',
      requestedIntensity: 1,
      method: 'geometric-mean',
    });
    expect(wrongFamily.intensity).toBeCloseTo(0.64);
    expect(wrongFamily.editorialPreference.mode).toBe('signal-only');
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

  it('does not anchor zoom to untrusted V-JEPA subject primitives', () => {
    const form = resolveAtomicZoomForm({
      localFrame: 60,
      sceneEnd: 180,
      signals: {
        speech_energy: 0.88,
        word_importance: 0.91,
        main_subject_x: 0.82,
        main_subject_y: 0.28,
        main_subject_width: 0.3,
        main_subject_height: 0.5,
        face_present: 1,
        'vjepa.allow_subject_avoidance': 0,
      },
    });

    expect(form.focal.transformOrigin).toBe('50% 50%');
    expect(form.focal.strength).toBe(0);
  });
});
