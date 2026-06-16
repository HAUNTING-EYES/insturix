import { describe, expect, it } from 'vitest';
import { overlayResultsToEditDecisions } from '../../lib/editron/engine/overlay-bridge';
import { buildOverlayAtomicReceipt } from '../../lib/editron/engine/atomic-overlay-core';
import type { SignalTimeline } from '../../lib/editron/services/signal-registry';

describe('overlay bridge V-JEPA signal handoff', () => {
  it('keeps utility bridge signals object-shaped and atom-ready', () => {
    const timeline: SignalTimeline = {
      fps: 30,
      totalFrames: 180,
      gridInterval: 15,
      globalSignals: { formality: 0.4 },
      eventSignals: [],
      gridSignals: new Map([[
        30,
        {
          frame: 30,
          timestampMs: 1000,
          'visual.significance': 0.94,
          'visual.motion_intensity': 0.91,
          'visual.motion_vector.x': -0.72,
          'visual.motion_vector.y': 0.18,
          'visual.action_type': 'talking',
          'visual.motion_type': 'both',
          'visual.face_emotion': 'surprised',
          'visual.eye_contact': true,
          'visual.face_present': true,
          'visual.text_on_screen': 0.35,
          'visual.text_coverage': 0.18,
          'visual.text_box_count': 2,
          'visual.shot_scale': 0.72,
          'visual.main_subject.x': 0.62,
          'visual.main_subject.y': 0.44,
          'visual.main_subject.width': 0.24,
          'visual.main_subject.height': 0.5,
          'visual.negative_space.right': 0.71,
          'visual.negative_space.left': 0.22,
          'speech.energy': 0.82,
          'composite.cinematic_moment': 0.88,
        },
      ]]),
    };

    const result = overlayResultsToEditDecisions([
      {
        frame: 30,
        timestampMs: 1000,
        winners: {
          zoom: {
            overlayId: 'slow-push',
            category: 'zoom',
            rank: 1,
            totalScore: 0.93,
            considerationScores: [],
            outputValues: { scale_delta: 0.08 },
            placementAdjustment: {
              candidateRegion: 'middle-right',
              multiplier: 1.12,
              penalty: 0,
              bonus: 0.2,
              avoidHits: [],
              preferHits: ['negative-space'],
              constraints: ['protect-human-attention'],
            },
          },
        },
      },
    ], timeline, 30);

    const params = result.decisions[0]?.params as Record<string, unknown>;
    const signals = params.signals as Record<string, unknown>;
    expect(params.position).toBe('middle-right');
    expect(params.placementAdjustment).toEqual(expect.objectContaining({
      candidateRegion: 'middle-right',
      preferHits: ['negative-space'],
    }));
    expect(signals).toEqual(expect.objectContaining({
      visual_significance: 0.94,
      motion_intensity: 0.91,
      motion_vector_x: -0.72,
      motion_vector_y: 0.18,
      action_type: 'talking',
      motion_type: 'both',
      face_emotion: 'surprised',
      eye_contact: true,
      face_present: true,
      text_on_screen: 0.35,
      text_coverage: 0.18,
      text_box_count: 2,
      shot_scale: 0.72,
      main_subject_x: 0.62,
      main_subject_y: 0.44,
      main_subject_width: 0.24,
      main_subject_height: 0.5,
      negative_space_right: 0.71,
      negative_space_left: 0.22,
    }));

    const receipt = buildOverlayAtomicReceipt({
      family: 'zoom',
      intent: 'utility-visual-push',
      frame: 30,
      durationFrames: 18,
      source: 'utility-bridge:test',
      signals,
    });

    expect(receipt.visualContext.recommendedDensity).toBe('restrained');
    expect(receipt.visualContext.motionType).toBe('both');
    expect(receipt.visualContext.faceEmotion).toBe('surprised');
    expect(receipt.visualContext.eyeContact).toBe(true);
    expect(receipt.visualContext.mainSubjectX).toBe(0.62);
    expect(receipt.visualContext.negativeSpaceRight).toBe(0.71);
    expect(receipt.atoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'salience', key: 'visual.significance', value: 0.94, source: 'vjepa' }),
      expect.objectContaining({ kind: 'motion-intensity', key: 'visual.motion_intensity', value: 0.91, source: 'vjepa' }),
      expect.objectContaining({ kind: 'motion-vector-x', key: 'visual.motion_vector.x', value: -0.72, source: 'vjepa' }),
      expect.objectContaining({ kind: 'main-subject-x', key: 'visual.main_subject.x', value: 0.62 }),
      expect.objectContaining({ kind: 'negative-space-right', key: 'visual.negative_space.right', value: 0.71 }),
      expect.objectContaining({ kind: 'subject-action', key: 'visual.action_type', value: 'talking', source: 'vjepa' }),
      expect.objectContaining({ kind: 'motion-source', key: 'visual.motion_type', value: 'both', source: 'vjepa' }),
      expect.objectContaining({ kind: 'subject-emotion', key: 'visual.face_emotion', value: 'surprised', source: 'vjepa' }),
      expect.objectContaining({ kind: 'subject-gaze', key: 'visual.eye_contact', value: true, source: 'vjepa' }),
    ]));
  });

  it('enriches utility graphic winners with semantic facts and removes graphicType render authority', () => {
    const timeline: SignalTimeline = {
      fps: 30,
      totalFrames: 180,
      gridInterval: 15,
      globalSignals: { formality: 0.4 },
      eventSignals: [{
        timestampMs: 1000,
        frame: 30,
        signal: 'entity.number',
        value: true,
        context: '90% completion rate',
      }],
      gridSignals: new Map([[30, {
        frame: 30,
        timestampMs: 1000,
        'speech.energy': 0.62,
        'visual.face_present': true,
      }]]),
    };

    const result = overlayResultsToEditDecisions([
      {
        frame: 30,
        timestampMs: 1000,
        winners: {
          graphic: {
            overlayId: 'stat_graphic',
            category: 'graphic',
            rank: 1,
            totalScore: 0.91,
            considerationScores: [],
            outputValues: { graphicType: 'stat_graphic' },
          },
        },
      },
    ], timeline, 30);

    const params = result.decisions[0]?.params as Record<string, any>;
    expect(params.graphicType).toBeUndefined();
    expect(params.value).toBe('90%');
    expect(params.semanticAtoms.quantity).toEqual(expect.objectContaining({
      displayText: '90%',
      kind: 'percent',
      bounded: true,
      label: 'completion rate',
    }));
    expect(params.contentStructure.evidence).toEqual(expect.objectContaining({
      hasScalar: true,
      proportionAffordance: true,
    }));
  });
});
