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
    expect(form.job).toBe('match-motion');
    expect(form.intent).toBe('motion-transfer');
    expect(form.compatibilityType).toBe('whip-pan');
    expect(form.evidence).toMatchObject({
      source: 'signal-atoms',
      reasonKeys: expect.arrayContaining(['motion-direction', 'visual-motion', 'beat', 'intensity']),
      boundary: { hasAnchor: false, hasReason: false },
    });
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
    expect(form.keyframeBased).toBe(false);
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

  it('treats upstream hard-cut as a weak editorial hint, not a preset veto', () => {
    const ordinaryCut = resolveAtomicTransitionForm({
      params: { transitionType: 'hard-cut' },
      signals: {
        speech_energy: 0.28,
        motion_intensity: 0.12,
        topic_shift: 0.1,
        text_on_screen: 0,
      },
    });
    const motionCut = resolveAtomicTransitionForm({
      params: { transitionType: 'hard-cut' },
      signals: {
        motion_vector_x: -0.81,
        motion_intensity: 0.88,
        beat_strength: 0.83,
        speech_energy: 0.74,
        text_on_screen: 0,
        visual_complexity: 0.12,
      },
    });

    expect(ordinaryCut.job).toBe('soft-release');
    expect(ordinaryCut.compatibilityType).toBe('hard-cut');
    expect(ordinaryCut.sfxRole).toBe('none');
    expect(motionCut.job).toBe('match-motion');
    expect(motionCut.compatibilityType).toBe('whip-pan');
    expect(motionCut.intent).toBe('motion-transfer');
    expect(motionCut.sfxRole).toBe('fast-whoosh');
  });

  it('uses boundary transition jobs to license form even when upstream compatibility says hard-cut', () => {
    const form = resolveAtomicTransitionForm({
      params: {
        transitionType: 'hard-cut',
        transitionJob: 'match-motion',
      },
      signals: {
        motion_vector_y: -0.36,
        motion_intensity: 0.3,
        beat_strength: 0.24,
        speech_energy: 0.26,
        text_on_screen: 0,
        visual_complexity: 0.12,
      },
    });

    expect(form.job).toBe('match-motion');
    expect(form.intent).toBe('motion-transfer');
    expect(form.compatibilityType).toBe('slide-up');
    expect(form.evidence).toMatchObject({
      source: 'explicit-boundary-job',
      reasonKeys: expect.arrayContaining(['job:match-motion', 'motion-direction']),
      boundary: { hasAnchor: false, hasReason: true },
    });
    expect(form.direction.label).toBe('up');
    expect(form.sfxRole).toBe('none');
  });

  it('turns hide-jump boundary jobs into restrained continuity bridges', () => {
    const form = resolveAtomicTransitionForm({
      params: {
        transitionType: 'hard-cut',
        transitionJob: 'hide-jump',
      },
      signals: {
        topic_shift: 0.48,
        emotion_intensity: 0.24,
        motion_intensity: 0.1,
        text_on_screen: 0.08,
        visual_complexity: 0.18,
      },
    });

    expect(form.job).toBe('hide-jump');
    expect(form.intent).toBe('continuity-blend');
    expect(form.compatibilityType).toBe('dissolve');
    expect(form.sfxRole).toBe('none');
    expect(form.durationFrames).toBeGreaterThanOrEqual(30);
  });

  it('lets explicit semantic transition intent win over boundary job hints', () => {
    const form = resolveAtomicTransitionForm({
      params: {
        transitionIntent: 'reveal-wipe',
        transitionJob: 'hide-jump',
      },
      signals: {
        motion_vector_x: 0.42,
        motion_intensity: 0.28,
        topic_shift: 0.35,
        visual_complexity: 0.12,
      },
    });

    expect(form.job).toBe('hide-jump');
    expect(form.intent).toBe('reveal-wipe');
    expect(form.compatibilityType).toBe('wipe-right');
    expect(form.evidence.source).toBe('explicit-boundary-job');
    expect(form.evidence.reasonKeys).toEqual(expect.arrayContaining(['job:hide-jump', 'intent:reveal-wipe']));
  });

  it('ignores unknown transition jobs instead of inventing a transition form', () => {
    const form = resolveAtomicTransitionForm({
      params: {
        transitionType: 'hard-cut',
        transitionJob: 'make-it-cool',
      },
      signals: {
        speech_energy: 0.2,
        motion_intensity: 0.1,
        topic_shift: 0.1,
      },
    });

    expect(form.job).toBe('soft-release');
    expect(form.compatibilityType).toBe('hard-cut');
    expect(form.evidence.source).toBe('signal-atoms');
    expect(form.sfxRole).toBe('none');
  });

  it('keeps upstream soft-cut requests as invisible polish instead of long mini-dissolves', () => {
    const form = resolveAtomicTransitionForm({
      params: { transitionType: 'soft-cut' },
      durationFrames: 20,
      defaultDurationFrames: 24,
      signals: {
        speech_energy: 0.78,
        motion_intensity: 0.59,
        visual_complexity: 0.12,
        text_on_screen: 0,
      },
    });

    expect(form.compatibilityType).toBe('soft-cut');
    expect(form.durationFrames).toBeGreaterThanOrEqual(3);
    expect(form.durationFrames).toBeLessThanOrEqual(6);
    expect(form.sfxRole).toBe('none');
  });

  it('does not use untrusted V-JEPA motion vectors to create directional transitions', () => {
    const form = resolveAtomicTransitionForm({
      signals: {
        motion_vector_x: 0.86,
        motion_vector_y: 0.08,
        motion_intensity: 0.82,
        beat_strength: 0.84,
        speech_energy: 0.72,
        text_on_screen: 0,
        'vjepa.allow_motion_direction': 0,
      },
    });

    expect(form.direction.label).toBe('center');
    expect(form.direction.magnitude).toBe(0);
    expect(form.compatibilityType).not.toBe('whip-pan');
  });

  it('does not let untrusted V-JEPA text coverage inflate visual pressure', () => {
    const trusted = resolveAtomicTransitionForm({
      signals: {
        text_coverage: 0.94,
        topic_shift: 0.2,
        speech_energy: 0.2,
        'vjepa.allow_text_avoidance': 1,
      },
    });
    const untrusted = resolveAtomicTransitionForm({
      signals: {
        text_coverage: 0.94,
        topic_shift: 0.2,
        speech_energy: 0.2,
        'vjepa.allow_text_avoidance': 0,
      },
    });

    expect(trusted.visualPressure).toBeGreaterThan(0.9);
    expect(untrusted.visualPressure).toBeLessThan(0.2);
  });
});
