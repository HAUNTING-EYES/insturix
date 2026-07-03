import { describe, expect, it } from 'vitest';

import {
  refineCutPlanWithVisualIntelligence,
  resolveVisualCutRefinementMode,
} from '@/lib/editron/services/visual-cut-intelligence';
import type { RawFootageAnalysis, SilenceRemovalAction, TranscriptSegment } from '@/lib/editron/services/raw-footage-processor';
import type { VjepaAnalysisResult, VjepaSegmentResult } from '@/lib/editron/services/vjepa-service';

function rawFootage(overrides: Partial<RawFootageAnalysis> = {}): RawFootageAnalysis {
  const segments: TranscriptSegment[] = [
    {
      text: 'spoken moment',
      startMs: 0,
      endMs: 1_000,
      wordCount: 2,
      words: [
        { word: 'spoken', startMs: 0, endMs: 400, confidence: 0.98 },
        { word: 'moment', startMs: 500, endMs: 1_000, confidence: 0.97 },
      ],
      fillerCount: 0,
      silenceGapCount: 0,
      avgWordGapMs: 100,
      index: 0,
    },
  ];

  return {
    originalDurationMs: 12_000,
    estimatedCleanDurationMs: 12_000,
    silenceRemovalPlan: [],
    transcription: { text: 'spoken moment', words: segments[0].words },
    segments,
    contentTypeDetection: {
      contentType: 'talking-head',
      confidence: 0.9,
      signals: [],
      recommendedProfile: 'talking-head',
    },
    speechCoverage: 0.1,
    needsVisualDrivenEditing: true,
    ...overrides,
  } as RawFootageAnalysis;
}

function vjepa(segments: VjepaSegmentResult[]): VjepaAnalysisResult {
  return {
    segments,
    modelVersion: 'test-vjepa',
    processingTimeMs: 1,
  };
}

function visualSegment(overrides: Partial<VjepaSegmentResult>): VjepaSegmentResult {
  const startMs = overrides.startMs ?? 0;
  const endMs = overrides.endMs ?? startMs + 2_000;
  return {
    startMs,
    endMs,
    visualSignificance: 0.05,
    motionIntensity: 0.04,
    actionType: 'still',
    motionType: 'static',
    faceEmotion: null,
    eyeContact: null,
    motionVectorX: 0,
    motionVectorY: 0,
    mainSubject: { x: 0, y: 0, width: 0, height: 0, confidence: 0 },
    mainSubjectX: 0,
    mainSubjectY: 0,
    mainSubjectWidth: 0,
    mainSubjectHeight: 0,
    textBoxes: [],
    textBoxCount: 0,
    textCoverage: 0,
    objectCount: 0,
    faceCount: 0,
    negativeSpaceTop: 0.25,
    negativeSpaceRight: 0.25,
    negativeSpaceBottom: 0.25,
    negativeSpaceLeft: 0.25,
    primitivePresence: {
      motionVector: true,
      mainSubject: true,
      textBoxes: true,
      textCoverage: true,
      objectCount: true,
      faceCount: true,
      negativeSpace: true,
    },
    ...overrides,
  };
}

describe('visual cut refinement mode', () => {
  it('keeps speech-heavy footage speech-led while still licensing a visual check', () => {
    expect(resolveVisualCutRefinementMode({ speechCoverage: 0.82, needsVisualDrivenEditing: false })).toEqual({
      mode: 'speech-led-visual-check',
      modeReason: 'speech-coverage-sufficient',
      speechCoverage: 0.82,
      needsVisualDrivenEditing: false,
    });
  });

  it('switches to visual-led cutting when speech evidence is weak or explicitly marked visual-driven', () => {
    expect(resolveVisualCutRefinementMode({ speechCoverage: 0.12, needsVisualDrivenEditing: false })).toEqual(expect.objectContaining({
      mode: 'visual-led',
      modeReason: 'low-speech-coverage',
      needsVisualDrivenEditing: true,
    }));
    expect(resolveVisualCutRefinementMode({ speechCoverage: 0.8, needsVisualDrivenEditing: true })).toEqual(expect.objectContaining({
      mode: 'visual-led',
      modeReason: 'raw-footage-marked-visual-driven',
      needsVisualDrivenEditing: true,
    }));
  });
});

describe('visual cut intelligence', () => {
  it('skips safely when no V-JEPA evidence exists', () => {
    const plan: SilenceRemovalAction[] = [{ startMs: 2_000, endMs: 4_000, action: 'remove', reason: 'silence' }];
    const result = refineCutPlanWithVisualIntelligence(rawFootage({ silenceRemovalPlan: plan }), null);

    expect(result.plan).toEqual(plan);
    expect(result.report).toEqual(expect.objectContaining({
      status: 'skipped',
      inputActionCount: 1,
      outputActionCount: 1,
      visualSegmentCount: 0,
      perception: expect.objectContaining({
        status: 'unavailable',
        screenAwarePlacementTrust: 'unavailable',
        missingEvidence: ['vjepa-segments'],
      }),
    }));
  });

  it('protects meaningful silent visuals from transcript-only removals', () => {
    const result = refineCutPlanWithVisualIntelligence(
      rawFootage({
        silenceRemovalPlan: [{ startMs: 2_000, endMs: 5_000, action: 'remove', reason: 'silence' }],
      }),
      vjepa([
        visualSegment({
          startMs: 2_000,
          endMs: 5_000,
          visualSignificance: 0.82,
          motionIntensity: 0.6,
          actionType: 'demonstrating',
          objectCount: 3,
        }),
      ]),
    );

    expect(result.plan).toEqual([]);
    expect(result.report.protectedActionCount).toBe(1);
    expect(result.report.decisions[0]).toEqual(expect.objectContaining({
      type: 'protect-existing-cut',
      affectedAction: expect.objectContaining({ reason: 'silence' }),
      reasons: expect.arrayContaining(['high-visual-significance', 'high-motion', 'multiple-objects', 'action-demonstrating']),
      evidence: expect.objectContaining({
        viewerValue: expect.any(Number),
        brollUsefulness: expect.any(Number),
        missingEvidence: [],
      }),
    }));
  });

  it('does not add visual removals or splits during speech-led visual sanity checks', () => {
    const result = refineCutPlanWithVisualIntelligence(
      rawFootage({ speechCoverage: 0.88, needsVisualDrivenEditing: false }),
      vjepa([
        visualSegment({ startMs: 2_000, endMs: 4_500 }),
        visualSegment({ startMs: 5_000, endMs: 7_000, visualSignificance: 0.8, motionIntensity: 0.75, objectCount: 3 }),
      ]),
    );

    expect(result.report.mode).toBe('speech-led-visual-check');
    expect(result.report.addedRemovalCount).toBe(0);
    expect(result.report.addedSplitCount).toBe(0);
    expect(result.plan).toEqual([]);
  });

  it('adds visual dead-air removals only for low-speech, low-visual spans without speech overlap', () => {
    const result = refineCutPlanWithVisualIntelligence(
      rawFootage(),
      vjepa([
        visualSegment({ startMs: 2_000, endMs: 4_500 }),
      ]),
    );

    expect(result.plan).toHaveLength(1);
    expect(result.report.decisions[0].evidence).toEqual(expect.objectContaining({
      cutEligibility: expect.any(Number),
      viewerValue: expect.any(Number),
      missingEvidence: [],
    }));
    expect(result.plan[0]).toEqual(expect.objectContaining({
      action: 'remove',
      reason: 'visual-dead-air',
      startMs: 2_000,
      endMs: 4_500,
      metadata: expect.objectContaining({
        kind: 'visual-cut',
        source: 'vjepa-visual-dead-air',
        calibrationStatus: 'invented-threshold',
        visualCut: expect.objectContaining({
          decision: 'remove-visual-dead-air',
          reasons: expect.arrayContaining(['low-visual-significance', 'low-motion', 'no-face']),
          evidence: expect.objectContaining({
            coverageTrust: expect.any(Number),
            cutEligibility: expect.any(Number),
            missingEvidence: [],
          }),
        }),
      }),
    }));
    expect(result.report.addedRemovalCount).toBe(1);
  });

  it('does not remove low-visual spans that overlap speech', () => {
    const result = refineCutPlanWithVisualIntelligence(
      rawFootage(),
      vjepa([visualSegment({ startMs: 0, endMs: 2_000 })]),
    );

    expect(result.plan.filter(action => action.action === 'remove')).toEqual([]);
    expect(result.report.addedRemovalCount).toBe(0);
  });

  it('adds non-destructive split boundaries for strong visual changes in low-speech footage', () => {
    const result = refineCutPlanWithVisualIntelligence(
      rawFootage({ originalDurationMs: 16_000 }),
      vjepa([
        visualSegment({ startMs: 2_000, endMs: 4_000, visualSignificance: 0.1, motionIntensity: 0.1 }),
        visualSegment({ startMs: 5_000, endMs: 7_000, visualSignificance: 0.75, motionIntensity: 0.72, objectCount: 3 }),
      ]),
    );

    const split = result.plan.find(action => action.action === 'split');
    const splitDecision = result.report.decisions.find(decision => decision.type === 'split-visual-boundary');
    expect(splitDecision?.evidence).toEqual(expect.objectContaining({
      boundaryStrength: expect.any(Number),
      cutEligibility: expect.any(Number),
      missingEvidence: [],
    }));
    expect(split).toEqual(expect.objectContaining({
      startMs: 5_000,
      endMs: 5_000,
      reason: 'pacing-split',
      metadata: expect.objectContaining({
        kind: 'pacing-split',
        source: 'vjepa-visual-boundary',
        calibrationStatus: 'invented-threshold',
        boundaryReasons: expect.arrayContaining(['visual-state-change', 'visual-motion-change', 'visual-subject-change']),
        visualCut: expect.objectContaining({
          decision: 'split-visual-boundary',
          evidence: expect.objectContaining({
            boundaryStrength: expect.any(Number),
            cutEligibility: expect.any(Number),
            missingEvidence: [],
          }),
        }),
      }),
    }));
    expect(result.report.addedSplitCount).toBe(1);
  });
  it('persists reusable visual perception facts for downstream overlay planners', () => {
    const result = refineCutPlanWithVisualIntelligence(
      rawFootage({ speechCoverage: 0.84, needsVisualDrivenEditing: false }),
      vjepa([
        visualSegment({
          startMs: 2_000,
          endMs: 4_000,
          visualSignificance: 0.66,
          motionIntensity: 0.33,
          actionType: 'demonstrating',
          motionType: 'subject_moving',
          objectCount: 4,
          textBoxCount: 2,
          textCoverage: 0.22,
          mainSubject: { x: 0.12, y: 0.18, width: 0.28, height: 0.42, confidence: 0.74 },
          mainSubjectX: 0.12,
          mainSubjectY: 0.18,
          mainSubjectWidth: 0.28,
          mainSubjectHeight: 0.42,
          negativeSpaceTop: 0.16,
          negativeSpaceRight: 0.72,
          negativeSpaceBottom: 0.12,
          negativeSpaceLeft: 0.1,
        }),
        visualSegment({
          startMs: 4_000,
          endMs: 6_000,
          visualSignificance: 0.42,
          motionIntensity: 0.2,
          actionType: 'talking',
          motionType: 'static',
          faceCount: 1,
          objectCount: 1,
          mainSubject: { x: 0.2, y: 0.12, width: 0.32, height: 0.5, confidence: 0.81 },
          mainSubjectX: 0.2,
          mainSubjectY: 0.12,
          mainSubjectWidth: 0.32,
          mainSubjectHeight: 0.5,
          negativeSpaceTop: 0.18,
          negativeSpaceRight: 0.62,
          negativeSpaceBottom: 0.1,
          negativeSpaceLeft: 0.08,
        }),
      ]),
    );

    expect(result.plan).toEqual([]);
    expect(result.report.perception).toMatchObject({
      status: 'available',
      segmentCount: 2,
      durationMs: 4_000,
      speechCoverage: 0.84,
      primaryVisualMode: 'screen-text',
      preferredOverlayRegion: 'right',
      screenAwarePlacementTrust: 'trusted',
      visualExplainability: 'high',
      visibleExplanationRatio: 0.5,
      visualStateChangeCount: expect.any(Number),
      visualStateChangeRatePerMinute: expect.any(Number),
      visuallyValuableSilentRatio: expect.any(Number),
      brollUsefulnessRatio: expect.any(Number),
      visualDeadAirRatio: expect.any(Number),
      textPresenceRatio: 0.5,
      facePresenceRatio: 0.5,
      motionPresenceRatio: 0.5,
      screenClutterRatio: 0.5,
      missingEvidence: [],
    });
    expect(result.report.perception.reasons).toEqual(expect.arrayContaining([
      'primary:screen-text',
      'placement:trusted',
      'preferred-region:right',
      'visual-explainability:high',
    ]));
  });
});
