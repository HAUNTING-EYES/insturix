import { describe, expect, it } from 'vitest';
import {
  buildOverlayAtomicReceipt,
  deriveAtomicVisualContext,
  overlayAtom,
} from '../../lib/editron/engine/atomic-overlay-core';

describe('atomic overlay core', () => {
  it('derives primitive visual atoms below high-level salience labels', () => {
    const context = deriveAtomicVisualContext({
      visual_significance: 0.86,
      motion_intensity: 0.65,
      visual_complexity: 0.5,
      brightness: 0.22,
      contrast: 0.78,
      saturation: 0.44,
      color_count: 6,
      edge_density: 0.72,
      object_count: 5,
      face_count: 1,
      main_subject_x: 0.38,
      main_subject_y: 0.42,
      main_subject_width: 0.31,
      main_subject_height: 0.58,
      text_box_count: 2,
      text_coverage: 0.36,
      negative_space_right: 0.64,
      visual_action_type: 'pointing',
      visual_motion_type: 'camera_moving',
      visual_face_emotion: 'excited',
      visual_eye_contact: true,
    });

    expect(context.legibilityRisk).toBeGreaterThan(0.75);
    expect(context.recommendedDensity).toBe('restrained');
    expect(context.atoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'luma', key: 'visual.brightness', value: 0.22 }),
      expect.objectContaining({ kind: 'contrast', key: 'visual.contrast', value: 0.78 }),
      expect.objectContaining({ kind: 'edge-density', key: 'visual.edge_density', value: 0.72 }),
      expect.objectContaining({ kind: 'object-count', key: 'visual.object_count', value: 5 }),
      expect.objectContaining({ kind: 'main-subject-x', key: 'visual.main_subject.x', value: 0.38 }),
      expect.objectContaining({ kind: 'main-subject-height', key: 'visual.main_subject.height', value: 0.58 }),
      expect.objectContaining({ kind: 'text-box-count', key: 'visual.text_box_count', value: 2 }),
      expect.objectContaining({ kind: 'negative-space-right', key: 'visual.negative_space.right', value: 0.64, source: 'layout-analysis' }),
      expect.objectContaining({ kind: 'subject-action', key: 'visual.action_type', value: 'pointing' }),
    ]));
  });

  it('normalizes raw V-JEPA segment fields into visual atoms', () => {
    const context = deriveAtomicVisualContext({
      visualSignificance: 0.94,
      motionIntensity: 0.91,
      visualComplexity: 0.67,
      textOnScreen: 0.35,
      shotScale: 0.72,
      facePresent: true,
      actionType: 'talking',
      motion_type: 'both',
      faceEmotion: 'surprised',
      eye_contact: true,
      colorCount: 5,
      objectCount: ['person', 'desk', 'phone'],
      faceCount: 1,
      mainSubjectX: 0.48,
      mainSubjectY: 0.36,
      mainSubjectWidth: 0.28,
      mainSubjectHeight: 0.52,
      textCoverage: 0.18,
      negativeSpaceLeft: 0.42,
    });

    expect(context.visualSignificance).toBe(0.94);
    expect(context.motionIntensity).toBe(0.91);
    expect(context.shotScale).toBe(0.72);
    expect(context.facePresent).toBe(true);
    expect(context.motionType).toBe('both');
    expect(context.faceEmotion).toBe('surprised');
    expect(context.eyeContact).toBe(true);
    expect(context.objectCount).toBe(3);
    expect(context.atoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'salience', key: 'visual.significance', value: 0.94, source: 'vjepa' }),
      expect.objectContaining({ kind: 'motion-intensity', key: 'visual.motion_intensity', value: 0.91, source: 'vjepa' }),
      expect.objectContaining({ kind: 'subject-gaze', key: 'visual.eye_contact', value: true, source: 'vjepa' }),
      expect.objectContaining({ kind: 'motion-source', key: 'visual.motion_type', value: 'both', source: 'vjepa' }),
      expect.objectContaining({ kind: 'subject-emotion', key: 'visual.face_emotion', value: 'surprised', source: 'vjepa' }),
      expect.objectContaining({ kind: 'main-subject-x', key: 'visual.main_subject.x', value: 0.48, source: 'five-track' }),
      expect.objectContaining({ kind: 'negative-space-left', key: 'visual.negative_space.left', value: 0.42, source: 'layout-analysis' }),
    ]));
  });

  it('adds observe-safe placement hints from primitive visual atoms', () => {
    const receipt = buildOverlayAtomicReceipt({
      family: 'motion-graphic',
      intent: 'keyword-emphasis',
      frame: 90,
      durationFrames: 24,
      signals: {
        visualSignificance: 0.92,
        motionIntensity: 0.82,
        facePresent: true,
        eyeContact: true,
        faceEmotion: 'surprised',
        mainSubjectX: 0.42,
        mainSubjectY: 0.38,
        mainSubjectWidth: 0.26,
        mainSubjectHeight: 0.48,
        textOnScreen: 0.7,
        textCoverage: 0.22,
        negativeSpaceRight: 0.78,
      },
    });

    expect(receipt.observeMode).toBe(true);
    expect(receipt.placementHints).toEqual(expect.objectContaining({
      version: 'placement-hints-v1',
      density: 'restrained',
    }));
    expect(receipt.placementHints.avoid).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'avoid', reason: 'face-attention', region: 'middle-center', source: 'vjepa' }),
      expect.objectContaining({ kind: 'avoid', reason: 'text-occupancy', region: 'bottom-center', source: 'five-track' }),
    ]));
    expect(receipt.placementHints.prefer[0]).toEqual(expect.objectContaining({
      kind: 'prefer',
      reason: 'negative-space',
      region: 'middle-right',
      strength: 0.78,
      source: 'layout-analysis',
    }));
    expect(receipt.placementHints.constraints).toEqual(expect.arrayContaining([
      'reduce-overlay-density',
      'avoid-large-kinetic-overlays',
      'protect-human-attention',
      'protect-existing-text',
    ]));
  });

  it('adds shared moment atoms to non-MG overlay receipts', () => {
    const receipt = buildOverlayAtomicReceipt({
      family: 'zoom',
      intent: 'emphasis-push',
      frame: 120,
      durationFrames: 18,
      source: 'creative-brief:test',
      reason: 'important phrase with visual room on the right',
      signals: {
        speech_energy: 0.82,
        beat_strength: 0.76,
        word_importance: 0.91,
        emotional_arousal: 0.88,
        topic_shift: 0.2,
        pacing_velocity: 0.7,
        brand_vibe: 'premium-direct',
        screen_region: 'right-middle',
        safe_zone: 'right-third',
        negative_space_right: 0.7,
      },
      atoms: [
        overlayAtom('scale-delta', 'zoom.scale_delta', 0.12, 0.8, 'decision-param'),
      ],
    });

    expect(receipt.observeMode).toBe(true);
    expect(receipt.atoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'start-frame', key: 'time.start_frame', value: 120, source: 'edl' }),
      expect.objectContaining({ kind: 'duration', key: 'time.duration_frames', value: 18, source: 'edl' }),
      expect.objectContaining({ kind: 'end-frame', key: 'time.end_frame', value: 138, source: 'edl' }),
      expect.objectContaining({ kind: 'speech-energy', key: 'audio.speech_energy', value: 0.82, source: 'audio-analysis' }),
      expect.objectContaining({ kind: 'beat-strength', key: 'audio.beat_strength', value: 0.76, source: 'audio-analysis' }),
      expect.objectContaining({ kind: 'word-importance', key: 'text.word_importance', value: 0.91, source: 'transcript' }),
      expect.objectContaining({ kind: 'emotion-arousal', key: 'emotion.arousal', value: 0.88, source: 'transcript' }),
      expect.objectContaining({ kind: 'topic-shift', key: 'narrative.topic_shift', value: 0.2, source: 'transcript' }),
      expect.objectContaining({ kind: 'rhythm-density', key: 'rhythm.density', value: 0.7, source: 'derived-signal' }),
      expect.objectContaining({ kind: 'brand-vibe', key: 'brand.vibe', value: 'premium-direct', source: 'brand' }),
      expect.objectContaining({ kind: 'screen-region', key: 'layout.screen_region', value: 'right-middle', source: 'layout-analysis' }),
      expect.objectContaining({ kind: 'safe-zone', key: 'layout.safe_zone', value: 'right-third', source: 'layout-analysis' }),
      expect.objectContaining({ kind: 'scale-delta', key: 'zoom.scale_delta', value: 0.12, source: 'decision-param' }),
    ]));
    expect(receipt.form).toEqual(expect.objectContaining({
      version: 'overlay-atomic-form-v1',
      family: 'zoom',
      intent: 'emphasis-push',
      role: 'attention-direction',
    }));
    expect(receipt.form.timing).toEqual(expect.objectContaining({
      startFrame: 120,
      durationFrames: 18,
      endFrame: 138,
      anchor: expect.objectContaining({ kind: 'word', frame: 120 }),
    }));
    expect(receipt.form.placement).toEqual(expect.objectContaining({
      region: 'middle-right',
      preferredRegion: 'middle-right',
      constraints: expect.any(Array),
    }));
    expect(receipt.form.motion).toEqual(expect.objectContaining({
      entry: 'zoom',
      curve: 'ease-in-out',
      durationFrames: 18,
    }));
    expect(receipt.form.collisions).toEqual(expect.objectContaining({
      risk: expect.any(Number),
      visualRisk: expect.any(Number),
      overlayRisk: 0,
      reasons: expect.any(Array),
    }));
    expect(receipt.form.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'word-importance', key: 'text.word_importance' }),
      expect.objectContaining({ kind: 'scale-delta', key: 'zoom.scale_delta' }),
    ]));
  });
});
