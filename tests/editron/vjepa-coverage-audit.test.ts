import { describe, expect, it } from 'vitest';
import {
  auditVjepaCoverage,
  resolveVjepaScreenContextPolicy,
  summarizeSegments,
} from '../../lib/editron/services/vjepa-coverage-audit';

describe('V-JEPA coverage audit', () => {
  it('maps overlay frames from cut timeline back to original V-JEPA segment time', () => {
    const audit = auditVjepaCoverage({
      fps: 30,
      originalDurationMs: 20_000,
      vjepaSegments: [
        {
          startMs: 16_000,
          endMs: 19_000,
          visualSignificance: 0.9,
          motionIntensity: 0.7,
          actionType: 'talking',
          motionType: 'both',
          faceEmotion: 'surprised',
          eyeContact: true,
        },
      ],
      overlays: [
        { id: 'clip-a', type: 'video', from: 0, durationInFrames: 100, sourceStartFrame: 100 },
        { id: 'clip-b', type: 'video', from: 100, durationInFrames: 100, sourceStartFrame: 500 },
        { id: 'mg-1', type: 'motion-graphic', from: 150, durationInFrames: 60 },
      ],
    });

    expect(audit.overlayHits).toHaveLength(1);
    expect(audit.overlayHits[0]).toEqual(expect.objectContaining({
      cutFrame: 150,
      sourceFrame: 550,
      mappedClipId: 'clip-b',
      exactHit: true,
      nearestGapMs: 0,
    }));
    expect(audit.overlayHitRate).toBe(1);
    expect(audit.reliability!.screenAwarePlacement).toBe('degraded');
    expect(audit.reliability!.reasons).toEqual(expect.arrayContaining([
      'motionVector-coverage-below-90:0%',
      'mainSubject-coverage-below-90:0%',
      'textCoverage-coverage-below-90:0%',
      'negativeSpace-coverage-below-90:0%',
    ]));
    expect(audit.issues).not.toContain('warn:overlay-without-source-clip');
  });

  it('flags missing coverage and overlay misses without pretending fallback signals are safe', () => {
    const audit = auditVjepaCoverage({
      fps: 30,
      originalDurationMs: 60_000,
      vjepaSegments: [{
        startMs: 0,
        endMs: 5_000,
        visualSignificance: 0.8,
        motionIntensity: 0.6,
      }],
      overlays: [
        { id: 'clip', type: 'video', from: 0, durationInFrames: 1_800, sourceStartFrame: 0 },
        { id: 'late-mg', type: 'motion-graphic', from: 900, durationInFrames: 60 },
      ],
    });

    expect(audit.status).toBe('warn');
    expect(audit.overlayHitRate).toBe(0);
    expect(audit.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('warn:low-vjepa-duration-coverage'),
      expect.stringContaining('warn:low-overlay-vjepa-hit-rate'),
      'warn:missing-semantic-vjepa-fields',
      expect.stringContaining('warn:vjepa-screen-aware-placement-degraded'),
    ]));
    expect(audit.reliability).toEqual(expect.objectContaining({
      screenAwarePlacement: 'degraded',
      score: expect.any(Number),
    }));
    expect(audit.reliability!.reasons).toEqual(expect.arrayContaining([
      'duration-coverage-below-90:8%',
      'overlay-hit-rate-below-90:0%',
      'motionVector-coverage-below-90:0%',
      'mainSubject-coverage-below-90:0%',
      'textCoverage-coverage-below-90:0%',
      'negativeSpace-coverage-below-90:0%',
    ]));
    expect(audit.overlayHits[0]).toEqual(expect.objectContaining({
      exactHit: false,
      nearestGapMs: 25_000,
    }));
  });

  it('marks screen-aware placement trusted only when temporal and primitive coverage are healthy', () => {
    const audit = auditVjepaCoverage({
      fps: 30,
      originalDurationMs: 2_000,
      vjepaSegments: [
        {
          startMs: 0,
          endMs: 2_000,
          visualSignificance: 0.8,
          motionIntensity: 0.4,
          actionType: 'talking',
          motionType: 'stable',
          motionVectorX: 0.01,
          motionVectorY: 0.02,
          mainSubject: { x: 0.25, y: 0.1, width: 0.45, height: 0.7 },
          textBoxes: [],
          textCoverage: 0.05,
          negativeSpaceTop: 0.15,
          negativeSpaceRight: 0.3,
          negativeSpaceBottom: 0.12,
          negativeSpaceLeft: 0.2,
        },
      ],
      overlays: [
        { id: 'clip', type: 'video', from: 0, durationInFrames: 60, sourceStartFrame: 0 },
        { id: 'mg', type: 'motion-graphic', from: 30, durationInFrames: 30 },
      ],
    });

    expect(audit.status).toBe('pass');
    expect(audit.reliability).toEqual({
      screenAwarePlacement: 'trusted',
      score: 1,
      reasons: [],
    });
    expect(audit.issues).not.toEqual(expect.arrayContaining([
      expect.stringContaining('vjepa-screen-aware-placement-degraded'),
    ]));
  });

  it('marks screen-aware placement unavailable when no V-JEPA segments exist', () => {
    const audit = auditVjepaCoverage({
      fps: 30,
      originalDurationMs: 2_000,
      vjepaSegments: [],
      overlays: [
        { id: 'clip', type: 'video', from: 0, durationInFrames: 60, sourceStartFrame: 0 },
        { id: 'mg', type: 'motion-graphic', from: 30, durationInFrames: 30 },
      ],
    });

    expect(audit.status).toBe('fail');
    expect(audit.issues).toContain('fail:no-vjepa-segments');
    expect(audit.reliability).toEqual({
      screenAwarePlacement: 'unavailable',
      score: 0,
      reasons: ['no-vjepa-segments'],
    });
  });

  it('includes caption, transition, and zoom overlays in default screen-aware hit coverage', () => {
    const audit = auditVjepaCoverage({
      fps: 30,
      originalDurationMs: 4_000,
      vjepaSegments: [
        {
          startMs: 0,
          endMs: 4_000,
          visualSignificance: 0.8,
          motionIntensity: 0.4,
          actionType: 'talking',
          motionType: 'stable',
          motionVectorX: 0.01,
          motionVectorY: 0.02,
          mainSubject: { x: 0.25, y: 0.1, width: 0.45, height: 0.7 },
          textCoverage: 0.05,
          negativeSpaceTop: 0.15,
          negativeSpaceRight: 0.3,
          negativeSpaceBottom: 0.12,
          negativeSpaceLeft: 0.2,
        },
      ],
      overlays: [
        { id: 'clip', type: 'video', from: 0, durationInFrames: 120, sourceStartFrame: 0 },
        { id: 'cap', type: 'caption', from: 15, durationInFrames: 30 },
        { id: 'tr', type: 'transition', from: 45, durationInFrames: 12 },
        { id: 'zoom', type: 'zoom', from: 75, durationInFrames: 30 },
      ],
    });

    expect(audit.overlayHits.map((hit) => hit.overlayType)).toEqual(['caption', 'transition', 'zoom']);
    expect(audit.overlayHitRate).toBe(1);
  });

  it('resolves unavailable screen-context policy when no usable audit exists', () => {
    expect(resolveVjepaScreenContextPolicy(null)).toEqual({
      mode: 'unavailable',
      score: 0,
      overlayHitRate: null,
      reasons: ['no-usable-vjepa-audit'],
      allowSubjectAvoidance: false,
      allowNegativeSpacePlacement: false,
      allowMotionDirection: false,
      allowTextAvoidance: false,
      primitiveTrust: {
        motionVector: 'unavailable',
        mainSubject: 'unavailable',
        textCoverage: 'unavailable',
        negativeSpace: 'unavailable',
      },
    });
  });

  it('allows only trusted primitive dimensions when V-JEPA is degraded', () => {
    const audit = auditVjepaCoverage({
      fps: 30,
      originalDurationMs: 4_000,
      vjepaSegments: [
        {
          startMs: 0,
          endMs: 4_000,
          visualSignificance: 0.8,
          motionIntensity: 0.4,
          actionType: 'talking',
          motionType: 'stable',
          mainSubject: { x: 0.25, y: 0.1, width: 0.45, height: 0.7 },
          negativeSpaceTop: 0.15,
          negativeSpaceRight: 0.3,
          negativeSpaceBottom: 0.12,
          negativeSpaceLeft: 0.2,
        },
      ],
      overlays: [
        { id: 'clip', type: 'video', from: 0, durationInFrames: 120, sourceStartFrame: 0 },
        { id: 'cap', type: 'caption', from: 15, durationInFrames: 30 },
      ],
    });

    const policy = resolveVjepaScreenContextPolicy(audit);

    expect(policy.mode).toBe('degraded');
    expect(policy.allowSubjectAvoidance).toBe(true);
    expect(policy.allowNegativeSpacePlacement).toBe(true);
    expect(policy.allowMotionDirection).toBe(false);
    expect(policy.allowTextAvoidance).toBe(false);
    expect(policy.primitiveTrust).toEqual({
      motionVector: 'unavailable',
      mainSubject: 'trusted',
      textCoverage: 'unavailable',
      negativeSpace: 'trusted',
    });
  });

  it('reports primitive field coverage separately from legacy semantic fields', () => {
    const summary = summarizeSegments([
      {
        startMs: 0,
        endMs: 1_000,
        visualSignificance: 0.8,
        motionIntensity: 0.4,
        actionType: 'talking',
        motionType: 'camera',
        motion_vector_x: 0.12,
        motion_vector_y: -0.08,
        main_subject_x: 0.2,
        main_subject_y: 0.1,
        main_subject_width: 0.4,
        main_subject_height: 0.7,
        text_box_count: 1,
        text_coverage: 0.08,
        negative_space_top: 0.2,
        negative_space_right: 0.65,
        negative_space_bottom: 0.1,
        negative_space_left: 0.15,
        object_count: 3,
        face_count: 1,
      },
      {
        startMs: 1_000,
        endMs: 2_000,
        visualSignificance: 0.7,
        motionIntensity: 0.3,
        actionType: 'presenting',
        motionType: 'subject',
      },
    ], 2_000);

    expect(summary.fieldCoverage.visualSignificance).toBe(1);
    expect(summary.fieldCoverage.motionVector).toBe(0.5);
    expect(summary.fieldCoverage.mainSubject).toBe(0.5);
    expect(summary.fieldCoverage.textBoxes).toBe(0.5);
    expect(summary.fieldCoverage.textCoverage).toBe(0.5);
    expect(summary.fieldCoverage.negativeSpace).toBe(0.5);
    expect(summary.fieldCoverage.objectCount).toBe(0.5);
    expect(summary.fieldCoverage.faceCount).toBe(0.5);
  });

  it('does not count normalized fallback primitive values as emitted V-JEPA primitives', () => {
    const summary = summarizeSegments([
      {
        startMs: 0,
        endMs: 1_000,
        visualSignificance: 0.8,
        motionIntensity: 0.4,
        actionType: 'talking',
        motionType: 'camera',
        motionVectorX: 0,
        motionVectorY: 0,
        mainSubjectX: 0.25,
        mainSubjectY: 0.15,
        mainSubjectWidth: 0.5,
        mainSubjectHeight: 0.7,
        textBoxCount: 0,
        textCoverage: 0,
        negativeSpaceTop: 0.15,
        negativeSpaceRight: 0.25,
        negativeSpaceBottom: 0.15,
        negativeSpaceLeft: 0.25,
        objectCount: 0,
        faceCount: 0,
        primitivePresence: {
          motionVector: false,
          mainSubject: false,
          textBoxes: false,
          textCoverage: false,
          objectCount: false,
          faceCount: false,
          negativeSpace: false,
        },
      },
    ], 1_000);

    expect(summary.fieldCoverage.motionVector).toBe(0);
    expect(summary.fieldCoverage.mainSubject).toBe(0);
    expect(summary.fieldCoverage.textBoxes).toBe(0);
    expect(summary.fieldCoverage.textCoverage).toBe(0);
    expect(summary.fieldCoverage.negativeSpace).toBe(0);
    expect(summary.fieldCoverage.objectCount).toBe(0);
    expect(summary.fieldCoverage.faceCount).toBe(0);
  });

  it('merges overlapping segments before computing duration coverage', () => {
    const summary = summarizeSegments([
      { startMs: 0, endMs: 5_000 },
      { startMs: 4_000, endMs: 8_000 },
      { startMs: 10_000, endMs: 12_000 },
    ], 20_000);

    expect(summary.coveredMs).toBe(10_000);
    expect(summary.gapCount).toBe(1);
    expect(summary.maxGapMs).toBe(2_000);
    expect(summary.coverageRatio).toBe(0.5);
  });

  it('uses only V-JEPA-eligible video duration for a canonical mixed-media timeline', () => {
    const audit = auditVjepaCoverage({
      fps: 30,
      originalDurationMs: 28_500,
      eligibleDurationMs: 24_500,
      vjepaSegments: [
        {
          startMs: 0,
          endMs: 24_500,
          visualSignificance: 0.5,
          motionIntensity: 0.4,
          actionType: 'other',
          motionType: 'stable',
        },
      ],
      overlays: [
        { id: 'video', type: 'video', from: 0, durationInFrames: 735, sourceStartFrame: 0 },
        { id: 'still', type: 'image', from: 735, durationInFrames: 120 },
      ],
    });

    expect(audit.expectedDurationMs).toBe(24_500);
    expect(audit.durationBasis).toBe('vjepa-eligible-video-timeline');
    expect(audit.segmentCoverage.coverageRatio).toBe(1);
    expect(audit.issues).not.toContain('warn:low-vjepa-duration-coverage:86%');
  });
});
