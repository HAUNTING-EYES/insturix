import { describe, expect, it } from 'vitest';
import { buildSegmentAnalysis } from '../../lib/editron/services/segment-analysis-builder';
import { buildSignalTimeline, buildSignalTimelineFromAnalysis } from '../../lib/editron/services/signal-registry';

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

  it('preserves V-JEPA primitives through SegmentAnalysis before building signal snapshots', () => {
    const rawFootage = {
      originalDurationMs: 2_000,
      estimatedCleanDurationMs: 2_000,
      transcription: { segments: [], words: [] },
      silenceGaps: [],
      contentTypeDetection: { contentType: 'unknown', confidence: 0.5 },
      segments: [{
        startMs: 0,
        endMs: 2_000,
        text: 'screen aware moment',
        wordCount: 3,
        fillerCount: 0,
        silenceGapCount: 0,
        avgWordGapMs: 120,
      }],
    } as any;

    const segmentAnalysis = buildSegmentAnalysis(
      rawFootage,
      null,
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
          eyeContact: true,
          motionVectorX: -0.42,
          motionVectorY: 0.14,
          mainSubject: { x: 0.18, y: 0.2, width: 0.34, height: 0.62, confidence: 0.76 },
          mainSubjectX: 0.18,
          mainSubjectY: 0.2,
          mainSubjectWidth: 0.34,
          mainSubjectHeight: 0.62,
          textBoxes: [{ x: 0.5, y: 0.1, width: 0.2, height: 0.08, confidence: 0.6, text: 'title' }],
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

    expect(segmentAnalysis?.segments[0].visual).toEqual(expect.objectContaining({
      motionVectorX: -0.42,
      mainSubjectX: 0.18,
      textBoxCount: 2,
      negativeSpaceRight: 0.82,
    }));

    const timeline = buildSignalTimelineFromAnalysis(segmentAnalysis!, [], rawFootage, [], 30);
    const snapshot = timeline.gridSignals.get(0);

    expect(snapshot).toEqual(expect.objectContaining({
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
      'visual.negative_space.right': 0.82,
    }));
  });
  it('marks partial V-JEPA coverage in SegmentAnalysis metadata', () => {
    const rawFootage = {
      originalDurationMs: 4_000,
      estimatedCleanDurationMs: 4_000,
      transcription: { segments: [], words: [] },
      silenceGaps: [],
      contentTypeDetection: { contentType: 'unknown', confidence: 0.5 },
      segments: [
        {
          startMs: 0,
          endMs: 2_000,
          text: 'first visual segment',
          wordCount: 3,
          fillerCount: 0,
          silenceGapCount: 0,
          avgWordGapMs: 120,
        },
        {
          startMs: 2_000,
          endMs: 4_000,
          text: 'missing visual segment',
          wordCount: 3,
          fillerCount: 0,
          silenceGapCount: 0,
          avgWordGapMs: 120,
        },
      ],
    } as any;

    const segmentAnalysis = buildSegmentAnalysis(
      rawFootage,
      null,
      {
        modelVersion: 'vjepa-2',
        processingTimeMs: 100,
        requestedSegmentCount: 2,
        analyzedSegmentCount: 1,
        droppedSegmentCount: 1,
        coverageRatio: 0.5,
        partial: true,
        failedBatchCount: 1,
        failedBatchIndices: [1],
        segments: [{
          startMs: 0,
          endMs: 2_000,
          visualSignificance: 0.88,
          motionIntensity: 0.64,
          actionType: 'talking',
          motionType: 'both',
          faceEmotion: null,
          eyeContact: true,
          motionVectorX: -0.42,
          motionVectorY: 0.14,
          mainSubject: { x: 0.18, y: 0.2, width: 0.34, height: 0.62, confidence: 0.76 },
          mainSubjectX: 0.18,
          mainSubjectY: 0.2,
          mainSubjectWidth: 0.34,
          mainSubjectHeight: 0.62,
          textBoxes: [],
          textBoxCount: 0,
          textCoverage: 0,
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

    expect(segmentAnalysis?.meta).toEqual(expect.objectContaining({
      hasVjepa: true,
      vjepaStatus: 'partial',
      vjepaRequestedSegmentCount: 2,
      vjepaAnalyzedSegmentCount: 1,
      vjepaDroppedSegmentCount: 1,
      vjepaCoverageRatio: 0.5,
      vjepaFailedBatchCount: 1,
    }));
    expect(segmentAnalysis?.segments[0].visual).not.toBeNull();
    expect(segmentAnalysis?.segments[1].visual).toBeNull();
  });

  it('projects holistic visual setup into global signals from SegmentAnalysis', () => {
    const rawFootage = {
      originalDurationMs: 3_000,
      estimatedCleanDurationMs: 3_000,
      transcription: { segments: [], words: [] },
      silenceGaps: [],
      contentTypeDetection: { contentType: 'product-demo', confidence: 0.8 },
      segments: [{
        startMs: 0,
        endMs: 3_000,
        text: 'screen walkthrough',
        wordCount: 2,
        fillerCount: 0,
        silenceGapCount: 0,
        avgWordGapMs: 120,
      }],
    } as any;

    const segmentAnalysis = buildSegmentAnalysis(
      rawFootage,
      {
        sourceVideoUrl: 'https://example.com/demo.mp4',
        contentType: 'product-demo',
        platform: 'youtube',
        title: 'Demo',
        overallMusicPrompt: '',
        globalEditDirections: {
          colorGrade: 'neutral',
          pacing: 'medium',
          graphicsDensity: 'moderate',
          musicMood: '',
          narrativeArc: 'hook-value-cta',
        },
        visualSetup: {
          environment: 'screen-recording',
          subjectCount: 0,
          hasFace: false,
          dominantShotScale: 'wide',
          availableShotTypes: ['screen-share'],
          lightingQuality: 'professional',
          productionQuality: 'prosumer',
          colorTemperature: 'cool',
          hasBRoll: true,
          cameraMovement: 'static',
          visualComplexity: 0.74,
          backgroundDescription: 'dashboard UI',
          notableVisualElements: ['pricing table'],
        },
        scenes: [],
        analyzedAt: '2026-07-03T00:00:00.000Z',
      },
      null,
      null,
      null,
    );

    const timeline = buildSignalTimelineFromAnalysis(segmentAnalysis!, [], rawFootage, [], 30);

    expect(timeline.globalSignals).toEqual(expect.objectContaining({
      'enrichment.visual_setup_source': 'gemini-visual-understanding',
      'visual.environment': 'screen-recording',
      'visual.scene_type': 'screen-recording',
      'visual.shot_scale': 'wide',
      'visual.dominant_shot_scale': 'wide',
      'visual.has_face': 0,
      'visual.subject_count': 0,
      'visual.has_b_roll': 1,
      'visual.camera_movement': 'static',
      'visual.lighting_quality': 'professional',
      'visual.production_quality_label': 'prosumer',
      'visual.production_quality': 0.72,
      'visual.color_temperature': 'cool',
      'visual.visual_complexity': 0.74,
      visual_complexity: 0.74,
    }));
  });
});
