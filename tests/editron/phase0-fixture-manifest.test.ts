import { describe, expect, it } from 'vitest';

import { buildPhase0FixtureManifest } from '../../lib/editron/services/phase0-fixture-manifest';
import type { Phase0FixtureProject } from '../../lib/editron/services/phase0-fixture-manifest';

const fps = 30;

function baseProject(overrides: Partial<Phase0FixtureProject> = {}): Phase0FixtureProject {
  return {
    projectId: 'proj_phase0_fixture',
    fps,
    durationInFrames: 90,
    playerDimensions: { width: 1920, height: 1080 },
    aspectRatio: '16:9',
    rawFootageAnalysis: {
      originalDurationMs: 6000,
      estimatedCleanDurationMs: 3000,
      transcription: {
        words: [
          { word: 'first', startMs: 0, endMs: 300 },
          { word: 'removed', startMs: 3000, endMs: 3300 },
          { word: 'second', startMs: 5000, endMs: 5300 },
        ],
      },
      segments: [{
        text: 'first removed second',
        startMs: 0,
        endMs: 5300,
        fillerCount: 1,
        silenceGapCount: 1,
        avgWordGapMs: 2350,
      }],
    },
    overlays: [
      { id: 'clip-1', type: 'video', from: 0, durationInFrames: 45, sourceStartFrame: 0, assetId: 'asset-a' },
      { id: 'clip-2', type: 'video', from: 45, durationInFrames: 45, sourceStartFrame: 150, assetId: 'asset-a' },
      {
        id: 'mg-1',
        type: 'motion-graphic',
        from: 30,
        durationInFrames: 45,
        content: '42% completion',
        metadata: {
          graphicType: 'numeric',
          atomicOverlayPlan: { version: 'atomic-overlay-plan-v1' },
          atomicOverlayReceipt: { family: 'motion-graphic' },
          atomicMomentBundle: {
            semanticAtoms: [{ kind: 'number', value: 42 }],
            relations: [{ kind: 'proportion' }],
          },
        },
      },
      {
        id: 'cap-1',
        type: 'caption',
        from: 0,
        durationInFrames: 60,
        styles: { fontFamily: 'Inter', color: '#ffffff' },
        metadata: { captionStyle: 'clean' },
      },
      {
        id: 'tr-1',
        type: 'transition',
        from: 44,
        durationInFrames: 12,
        transitionStyle: 'whip-pan',
        metadata: { atomicTransitionForm: { version: 'atomic-transition-form-v1' } },
      },
      {
        id: 'sfx-1',
        type: 'sound',
        from: 44,
        durationInFrames: 12,
        metadata: { role: 'impact', atomicSfxForm: { role: 'impact' } },
      },
    ],
    intelligence: {
      unifiedDecisionBundle: {
        source: 'creative-brief+signal-driven',
        authority: 'creative-primary-signal-evidence',
        totalDecisions: 3,
        counts: { graphic: 1, transition: 1, sound: 1 },
        evidence: { canonicalTimeline: true },
      },
      vjepaCoverageAudit: {
        status: 'warn',
        issues: ['warn:test coverage gap'],
        fps,
        overlayHitRate: 0.5,
        overlayHits: [],
        segmentCoverage: {
          segmentCount: 2,
          spanStartMs: 0,
          spanEndMs: 3000,
          coveredMs: 3000,
          gapCount: 0,
          gapTotalMs: 0,
          maxGapMs: 0,
          coverageRatio: 1,
          fieldCoverage: {
            visualSignificance: 1,
            motionIntensity: 1,
            actionType: 0,
            motionType: 0,
            faceEmotion: 0,
            eyeContact: 0,
            motionVector: 1,
            mainSubject: 1,
            textBoxes: 0,
            textCoverage: 0,
            negativeSpace: 1,
            objectCount: 0,
            faceCount: 0,
          },
        },
      },
    },
    ...overrides,
  };
}

describe('phase0 fixture manifest', () => {
  it('captures canonical timeline, overlay counts, atomic summaries, and safety flags', () => {
    const manifest = buildPhase0FixtureManifest(baseProject(), {
      capturedAt: '2026-06-14T00:00:00.000Z',
      source: 'test',
      artifactDir: 'fixtures/proj',
    });

    expect(manifest).toMatchObject({
      version: 'editron-phase0-fixture-v1',
      projectId: 'proj_phase0_fixture',
      source: 'test',
      durationFrames: 90,
      durationSeconds: 3,
      canvas: { width: 1920, height: 1080, aspectRatio: '16:9' },
      overlayCounts: {
        video: 2,
        'motion-graphic': 1,
        caption: 1,
        transition: 1,
        sound: 1,
      },
      cutContinuity: {
        clipCount: 2,
        firstStartFrame: 0,
        lastEndFrame: 90,
        tailGapFrames: 0,
        midTimelineGapCount: 0,
        overlapCount: 0,
      },
      sourceMapping: {
        clipCount: 2,
        mappedClipCount: 2,
        missingSourceMappingCount: 0,
        hasCompleteSourceMapping: true,
      },
      canonicalTimeline: {
        status: 'ok',
        durationFrames: 90,
        durationMs: 3000,
        transcriptionWordCount: 2,
        evidence: {
          hasSourceMapping: true,
          isCanonicalDecisionTimeline: true,
          inputWordCount: 3,
          keptWordCount: 2,
          droppedWordCount: 1,
        },
      },
      unifiedDecisionBundle: {
        status: 'present',
        source: 'creative-brief+signal-driven',
        authority: 'creative-primary-signal-evidence',
        totalDecisions: 3,
      },
      vjepaCoverage: {
        source: 'persisted',
        status: 'warn',
        overlayHitRate: 0.5,
      },
      renderArtifacts: {
        status: 'not-rendered',
        artifactDir: 'fixtures/proj',
      },
      calibrationSafety: {
        renderQualityRequiredBeforeWrites: true,
        learningWritesAllowed: false,
      },
    });
    expect(manifest.overlayFamilies.motionGraphics[0]).toMatchObject({
      id: 'mg-1',
      contentPreview: '42% completion',
      graphicType: 'numeric',
      hasAtomicPlan: true,
      hasAtomicReceipt: true,
      semanticAtomCount: 1,
      relationCount: 1,
    });
    expect(manifest.overlayFamilies.captions.styleSignatures).toEqual(['Inter|#ffffff|clean']);
    expect(manifest.overlayFamilies.transitions).toMatchObject({ count: 1, types: ['whip-pan'], withAtomicForm: 1 });
    expect(manifest.overlayFamilies.sfx).toMatchObject({ count: 1, roles: ['impact'], withAtomicForm: 1 });
  });

  it('records gaps, overlaps, tail gaps, and missing source maps without rewriting them', () => {
    const manifest = buildPhase0FixtureManifest(baseProject({
      durationInFrames: 160,
      overlays: [
        { id: 'clip-1', type: 'video', from: 0, durationInFrames: 30, sourceStartFrame: 0 },
        { id: 'clip-2', type: 'video', from: 45, durationInFrames: 30 },
        { id: 'clip-3', type: 'video', from: 70, durationInFrames: 20, sourceStartFrame: 150 },
      ],
    }));

    expect(manifest.cutContinuity.midTimelineGapCount).toBe(1);
    expect(manifest.cutContinuity.gaps[0]).toMatchObject({
      afterClipId: 'clip-1',
      beforeClipId: 'clip-2',
      startFrame: 30,
      endFrame: 45,
      durationFrames: 15,
    });
    expect(manifest.cutContinuity.overlapCount).toBe(1);
    expect(manifest.cutContinuity.overlaps[0]).toMatchObject({
      clipId: 'clip-3',
      previousClipId: 'clip-2',
      overlapFrames: 5,
    });
    expect(manifest.cutContinuity.tailGapFrames).toBe(70);
    expect(manifest.sourceMapping).toMatchObject({
      clipCount: 3,
      mappedClipCount: 2,
      missingSourceMappingCount: 1,
      hasCompleteSourceMapping: false,
    });
    expect(manifest.canonicalTimeline.status).toBe('unsafe');
    expect(manifest.canonicalTimeline.issue).toContain('source mapping');
  });

  it('computes V-JEPA coverage when only segments are present', () => {
    const manifest = buildPhase0FixtureManifest(baseProject({
      vjepaAnalysis: {
        segments: [
          {
            startMs: 0,
            endMs: 6000,
            visualSignificance: 0.8,
            motionIntensity: 0.4,
            actionType: 'talking',
            motionType: 'stable',
            motionVectorX: 0.3,
            motionVectorY: 0.1,
            mainSubject: { x: 0.2, y: 0.1, width: 0.4, height: 0.6 },
            textBoxes: [],
            textCoverage: 0,
            negativeSpaceTop: 0.1,
            negativeSpaceRight: 0.5,
            negativeSpaceBottom: 0.2,
            negativeSpaceLeft: 0.1,
            objectCount: 1,
            faceCount: 1,
          },
        ],
      },
      intelligence: undefined,
    }));

    expect(manifest.vjepaCoverage.source).toBe('computed');
    expect(manifest.vjepaCoverage.status).toBe('pass');
    expect(manifest.vjepaCoverage.segmentCoverage?.fieldCoverage.motionVector).toBe(1);
    expect(manifest.vjepaCoverage.segmentCoverage?.fieldCoverage.mainSubject).toBe(1);
    expect(manifest.unifiedDecisionBundle.status).toBe('missing');
    expect(manifest.calibrationSafety.learningWritesAllowed).toBe(false);
  });
});
