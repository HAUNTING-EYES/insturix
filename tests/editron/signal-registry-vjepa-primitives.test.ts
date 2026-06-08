import { describe, expect, it } from 'vitest';
import { buildSignalTimeline } from '../../lib/editron/services/signal-registry';

describe('signal registry V-JEPA primitive bridge', () => {
  it('copies deployed V-JEPA primitive fields into signal snapshots', () => {
    const timeline = buildSignalTimeline(
      [],
      {
        originalDurationMs: 2_000,
        transcription: { segments: [], words: [] },
        silenceGaps: [],
        contentTypeDetection: { contentType: 'unknown', confidence: 0.5 },
      } as any,
      [],
      30,
      {
        modelVersion: 'vjepa-2',
        processingTimeMs: 100,
        segments: [{
          startMs: 0,
          endMs: 2_000,
          visualSignificance: 0.88,
          motionIntensity: 0.64,
          actionType: 'talking',
          motionType: 'both',
          faceEmotion: null,
          eyeContact: null,
          motionVectorX: -0.42,
          motionVectorY: 0.14,
          mainSubject: { x: 0.18, y: 0.2, width: 0.34, height: 0.62, confidence: 0.76 },
          mainSubjectX: 0.18,
          mainSubjectY: 0.2,
          mainSubjectWidth: 0.34,
          mainSubjectHeight: 0.62,
          textBoxes: [],
          textBoxCount: 2,
          textCoverage: 0.16,
          objectCount: 1,
          faceCount: 1,
          negativeSpaceTop: 0.2,
          negativeSpaceRight: 0.82,
          negativeSpaceBottom: 0.18,
          negativeSpaceLeft: 0.18,
          primitivePresence: {
            motionVector: true,
            mainSubject: true,
            textBoxes: true,
            textCoverage: true,
            objectCount: true,
            faceCount: true,
            negativeSpace: true,
          },
        }],
      },
      null,
      null,
    );

    const snapshot = timeline.gridSignals.get(0);

    expect(snapshot).toEqual(expect.objectContaining({
      'visual.significance': 0.88,
      'visual.motion_intensity': 0.64,
      'visual.motion_vector.x': -0.42,
      'visual.motion_vector.y': 0.14,
      'visual.main_subject.x': 0.18,
      'visual.main_subject.y': 0.2,
      'visual.main_subject.width': 0.34,
      'visual.main_subject.height': 0.62,
      'visual.text_coverage': 0.16,
      'visual.text_box_count': 2,
      'visual.object_count': 1,
      'visual.face_count': 1,
      'visual.negative_space.top': 0.2,
      'visual.negative_space.right': 0.82,
      'visual.negative_space.bottom': 0.18,
      'visual.negative_space.left': 0.18,
    }));
  });
});
