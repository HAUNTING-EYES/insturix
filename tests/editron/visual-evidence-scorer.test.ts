import { describe, expect, it } from 'vitest';

import {
  scoreVisualBoundaryEvidence,
  scoreVisualSegmentEvidence,
  type VisualArtifactEvidence,
} from '@/lib/editron/services/visual-evidence-scorer';
import type { VjepaSegmentResult } from '@/lib/editron/services/vjepa-service';

function visualSegment(overrides: Partial<VjepaSegmentResult> = {}): VjepaSegmentResult {
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

describe('visual evidence scorer', () => {
  it('speech-locks low-motion talking head footage instead of calling it dead air', () => {
    const score = scoreVisualSegmentEvidence(
      visualSegment({
        visualSignificance: 0.08,
        motionIntensity: 0.06,
        actionType: 'talking',
        motionType: 'static',
        faceCount: 1,
        eyeContact: true,
        mainSubject: { x: 0.34, y: 0.16, width: 0.32, height: 0.62, confidence: 0.84 },
        mainSubjectX: 0.34,
        mainSubjectY: 0.16,
        mainSubjectWidth: 0.32,
        mainSubjectHeight: 0.62,
      }),
      {
        speechOverlapRatio: 0.92,
        speechEnergy: 0.74,
        narrativePressure: 0.5,
      },
    );

    expect(score.speechLock).toBeGreaterThan(0.82);
    expect(score.cutEligibility).toBeLessThan(0.12);
    expect(score.reasons).toEqual(expect.arrayContaining(['speech-locked', 'face-or-eye-contact']));
    expect(score.missingEvidence).toEqual([]);
  });

  it('treats visual-only demonstration footage as useful B-roll evidence', () => {
    const score = scoreVisualSegmentEvidence(
      visualSegment({
        visualSignificance: 0.82,
        motionIntensity: 0.62,
        actionType: 'demonstrating',
        motionType: 'subject_moving',
        objectCount: 4,
        textBoxCount: 1,
        textCoverage: 0.18,
        mainSubject: { x: 0.18, y: 0.2, width: 0.5, height: 0.55, confidence: 0.72 },
        mainSubjectX: 0.18,
        mainSubjectY: 0.2,
        mainSubjectWidth: 0.5,
        mainSubjectHeight: 0.55,
      }),
      {
        speechOverlapRatio: 0,
        narrativePressure: 0.42,
        assetRole: 'b-roll',
      },
    );

    expect(score.viewerValue).toBeGreaterThan(0.6);
    expect(score.brollUsefulness).toBeGreaterThan(0.7);
    expect(score.cutEligibility).toBeLessThan(0.08);
    expect(score.reasons).toEqual(expect.arrayContaining(['high-viewer-value', 'useful-broll', 'visible-text']));
  });

  it('marks empty silent visual spans as cut-eligible without pretending the content type is known', () => {
    const score = scoreVisualSegmentEvidence(
      visualSegment({
        startMs: 3_000,
        endMs: 6_000,
        visualSignificance: 0.04,
        motionIntensity: 0.03,
        actionType: 'still',
        motionType: 'static',
      }),
      { speechOverlapRatio: 0 },
    );

    expect(score.viewerValue).toBeLessThan(0.08);
    expect(score.brollUsefulness).toBeLessThan(0.08);
    expect(score.cutEligibility).toBeGreaterThan(0.85);
    expect(score.reasons).toEqual(expect.arrayContaining(['cut-eligible']));
  });

  it('uses explicit artifact ranges instead of inferring artifact risk from AI source alone', () => {
    const artifactRanges: VisualArtifactEvidence[] = [
      { startMs: 1_000, endMs: 2_800, severity: 0.86, source: 'five-track' },
    ];

    const segment = visualSegment({
      startMs: 1_200,
      endMs: 2_600,
      visualSignificance: 0.3,
      actionType: 'gesturing',
      faceCount: 1,
    });

    const explicit = scoreVisualSegmentEvidence(segment, {
      speechOverlapRatio: 0,
      isAiGenerated: true,
      artifactRanges,
    });
    const sourceOnly = scoreVisualSegmentEvidence(segment, {
      speechOverlapRatio: 0,
      isAiGenerated: true,
    });

    expect(explicit.artifactRisk).toBeGreaterThan(0.8);
    expect(sourceOnly.artifactRisk).toBe(0);
    expect(sourceOnly.missingEvidence).toEqual(expect.arrayContaining(['artifact-ranges']));
  });

  it('scores visual boundaries from state, motion, subject, and text deltas', () => {
    const boundary = scoreVisualBoundaryEvidence(
      visualSegment({
        startMs: 0,
        endMs: 2_000,
        visualSignificance: 0.1,
        motionIntensity: 0.08,
        actionType: 'still',
        motionVectorX: 0.02,
        objectCount: 1,
      }),
      visualSegment({
        startMs: 2_000,
        endMs: 4_000,
        visualSignificance: 0.86,
        motionIntensity: 0.72,
        actionType: 'interacting_with_object',
        motionType: 'both',
        motionVectorX: -0.7,
        motionVectorY: 0.28,
        objectCount: 4,
        textBoxCount: 3,
        textCoverage: 0.22,
        mainSubject: { x: 0.56, y: 0.18, width: 0.3, height: 0.54, confidence: 0.8 },
        mainSubjectX: 0.56,
        mainSubjectY: 0.18,
        mainSubjectWidth: 0.3,
        mainSubjectHeight: 0.54,
      }),
    );

    expect(boundary.boundaryStrength).toBeGreaterThan(0.45);
    expect(boundary.cutEligibility).toBeGreaterThan(0.32);
    expect(boundary.reasons).toEqual(expect.arrayContaining([
      'strong-boundary',
      'visual-state-change',
      'motion-change',
      'subject-or-action-change',
      'text-state-change',
    ]));
  });

  it('surfaces low primitive coverage so planners know perception is degraded', () => {
    const score = scoreVisualSegmentEvidence(
      visualSegment({
        primitivePresence: {
          motionVector: false,
          mainSubject: false,
          textBoxes: false,
          textCoverage: true,
          objectCount: true,
          faceCount: false,
          negativeSpace: false,
        },
      }),
      { speechOverlapRatio: 0 },
    );

    expect(score.coverageTrust).toBeLessThan(0.5);
    expect(score.missingEvidence).toEqual(expect.arrayContaining([
      'motion-vector',
      'main-subject',
      'text-boxes',
      'face-count',
      'negative-space',
    ]));
  });
});
