import { describe, expect, it } from 'vitest';
import { normalizeModalVjepaSegment } from '../../lib/editron/services/vjepa-service';

describe('V-JEPA service primitive normalization', () => {
  it('normalizes deployed Modal primitive fields into stable segment atoms', () => {
    const segment = normalizeModalVjepaSegment({
      start_ms: 1000,
      end_ms: 2200,
      visual_significance: 1.2,
      motion_intensity: 0.72,
      action_type: 'talking',
      motion_type: 'both',
      face_emotion: 'surprised',
      eye_contact: true,
      motion_vector_x: -0.64,
      motion_vector_y: 0.18,
      main_subject: { x: 0.2, y: 0.12, width: 0.42, height: 0.7, confidence: 0.81 },
      text_boxes: [
        { x: 0.08, y: 0.76, width: 0.5, height: 0.08, confidence: 0.67 },
      ],
      text_box_count: 1,
      text_coverage: 0.04,
      object_count: 2,
      face_count: 1,
      negative_space_top: 0.12,
      negative_space_right: 0.38,
      negative_space_bottom: 0.18,
      negative_space_left: 0.2,
    });

    expect(segment.visualSignificance).toBe(1);
    expect(segment.motionVectorX).toBe(-0.64);
    expect(segment.motionVectorY).toBe(0.18);
    expect(segment.mainSubject).toEqual({
      x: 0.2,
      y: 0.12,
      width: 0.42,
      height: 0.7,
      confidence: 0.81,
    });
    expect(segment.mainSubjectX).toBe(0.2);
    expect(segment.textBoxes).toHaveLength(1);
    expect(segment.textCoverage).toBe(0.04);
    expect(segment.negativeSpaceRight).toBe(0.38);
    expect(segment.objectCount).toBe(2);
    expect(segment.faceCount).toBe(1);
    expect(segment.primitivePresence).toEqual({
      motionVector: true,
      mainSubject: true,
      textBoxes: true,
      textCoverage: true,
      objectCount: true,
      faceCount: true,
      negativeSpace: true,
    });
  });

  it('emits conservative defaults without marking absent primitives as real', () => {
    const segment = normalizeModalVjepaSegment({
      start_ms: 0,
      end_ms: 1000,
      visual_significance: 0.4,
      motion_intensity: 0.2,
    });

    expect(segment.motionVectorX).toBe(0);
    expect(segment.motionVectorY).toBe(0);
    expect(segment.mainSubject).toEqual({
      x: 0.25,
      y: 0.15,
      width: 0.5,
      height: 0.7,
      confidence: 0,
    });
    expect(segment.textBoxes).toEqual([]);
    expect(segment.textBoxCount).toBe(0);
    expect(segment.textCoverage).toBe(0);
    expect(segment.negativeSpaceLeft).toBe(0.25);
    expect(segment.negativeSpaceRight).toBe(0.25);
    expect(segment.primitivePresence).toEqual({
      motionVector: false,
      mainSubject: false,
      textBoxes: false,
      textCoverage: false,
      objectCount: false,
      faceCount: false,
      negativeSpace: false,
    });
  });
});
