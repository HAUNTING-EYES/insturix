import { describe, expect, it } from 'vitest';

import { buildPhase0FixtureManifest, withPhase0RenderArtifactPack, withPhase0RenderedAestheticReport } from '../../lib/editron/services/phase0-fixture-manifest';
import type { Phase0FixtureProject } from '../../lib/editron/services/phase0-fixture-manifest';
import { buildPhase0RenderArtifactPack } from '../../lib/editron/services/phase0-render-artifact-pack';

const fps = 30;

function transitionSfxReceipt(transitionId = 'tr-1') {
  return {
    family: 'sfx',
    target: { transitionOverlayId: transitionId },
    payload: {
      syncAnchor: 'transition',
      transitionJob: 'emphasize-turn',
      transitionIntent: 'impact-transfer',
      transitionEvidenceSource: 'explicit-boundary-job',
    },
    atoms: [
      { kind: 'transition-relation', key: 'transition.overlay_id', value: transitionId },
      { kind: 'transition-relation', key: 'transition.job', value: 'emphasize-turn' },
      { kind: 'transition-relation', key: 'transition.intent', value: 'impact-transfer' },
      { kind: 'transition-relation', key: 'transition.evidence_source', value: 'explicit-boundary-job' },
    ],
  };
}

function signalAudit(overrides: Record<string, unknown> = {}) {
  const candidate = {
    version: 'signal-execution-candidate-v1',
    family: 'graphic',
    job: 'graphic-expression',
    role: 'graphic-expression',
    source: 'signal-driven',
    signal: 'signal:entity.number',
    confidence: 0.88,
    momentImportance: 0.55,
    timingAnchor: { kind: 'moment', frame: 30, durationFrames: 30 },
    evidenceStrength: 1,
    completeness: 0.82,
    physicalFormReadiness: 0.76,
    risk: 0.09,
    riskFlags: [],
    projectedAtoms: { family: 'graphic', role: 'graphic-expression' },
    sourcePacket: {
      hasSignals: true,
      signalKeys: ['signal:entity.number'],
      hasAtomicMomentBundle: true,
      hasUnifiedMomentEvidence: true,
    },
    calibrationStatus: 'invented-needs-calibration',
  };
  const bucket = {
    count: 1,
    confidence: { min: 0.88, max: 0.88, average: 0.88 },
    frames: { first: 30, last: 30, samples: [30] },
    sources: { 'signal-driven': 1 },
  };
  return {
    version: 'signal-decision-audit-v1',
    totalCount: 1,
    outcomes: { 'added-executable': 1, 'evidence-only': 0, 'signal-primary': 0, 'validated-primary': 0 },
    byType: { graphic: bucket },
    byFamily: { graphic: bucket },
    byReason: { 'licensed-signal-candidate': bucket },
    candidates: [candidate],
    samples: [{
      type: 'graphic',
      family: 'graphic',
      outcome: 'added-executable',
      candidate,
      frame: 30,
      confidence: 0.88,
      source: 'signal-driven',
      signal: 'signal:entity.number',
      reason: 'licensed-signal-candidate',
    }],
    ...overrides,
  };
}

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
      silenceRemovalPlan: [{
        startMs: 3000,
        endMs: 5000,
        action: 'remove',
        reason: 'transcript-edit',
      }, {
        startMs: 5000,
        endMs: 5000,
        action: 'split',
        reason: 'pacing-split',
        metadata: {
          kind: 'pacing-split',
          source: 'transcript-segment-boundary',
          calibrationStatus: 'invented-threshold',
          previousSegmentIndex: 0,
          nextSegmentIndex: 1,
          boundaryReasons: ['speech-pause'],
          speechGapMs: 1700,
          previousEndedSentence: false,
          previousWord: 'first',
          nextWord: 'second',
          previousTextPreview: 'first',
          nextTextPreview: 'second',
        },
      }],
    },
    qualityReview: {
      version: 'quality-review-persistence-v1',
      overallScore: 41,
      issueCount: 2,
      criticalCount: 1,
      warningCount: 1,
      infoCount: 0,
      autoFixableCount: 1,
      issuesPersistedCount: 2,
      issuesTruncated: false,
      issues: [
        {
          type: 'graphic_occlusion',
          severity: 'critical',
          description: 'Motion graphic covers the speaker face.',
          frameRange: { start: 30, end: 55 },
          overlayId: 101,
          suggestedFix: 'Move graphic to negative-space region.',
          autoFixable: true,
        },
        {
          type: 'caption_reading_speed',
          severity: 'warning',
          description: 'Caption group is too fast to read.',
          frameRange: { start: 0, end: 20 },
          overlayId: 102,
          suggestedFix: null,
          autoFixable: false,
        },
      ],
      suggestions: ['Reduce overlay collision before calibration.'],
      reviewedAt: '2026-06-14T00:00:00.000Z',
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
        captions: [{ text: 'first second' }],
        styles: { fontFamily: 'Inter', color: '#ffffff' },
        metadata: {
          captionStyle: 'clean',
          atomicOverlayReceipt: { family: 'caption' },
        },
      },
      {
        id: 'tr-1',
        type: 'transition',
        from: 44,
        durationInFrames: 12,
        clipAId: 'clip-1',
        clipBId: 'clip-2',
        transitionStyle: 'whip-pan',
        metadata: { atomicTransitionForm: { version: 'atomic-transition-form-v1', intent: 'motion-transfer' } },
      },
      {
        id: 'sfx-1',
        type: 'sound',
        from: 44,
        durationInFrames: 12,
        assetId: 'sfx_asset_1',
        metadata: {
          role: 'impact',
          atomicSfxForm: { role: 'impact', timing: { anchor: 'transition', syncFrame: 44 } },
          atomicOverlayReceipt: transitionSfxReceipt(),
        },
      },
    ],
    intelligence: {
      unifiedDecisionBundle: {
        source: 'creative-brief+signal-driven',
        authority: {
          version: 'unified-decision-authority-v1',
          executableProducer: 'creative-brief',
          advisoryProducers: ['signal-driven'],
          signalDecisionRole: 'advisor',
          signalDecisionsCanAddExecutable: false,
          decisionMode: 'creative-brief-primary',
        },
        totalDecisions: 3,
        counts: { graphic: 1, transition: 1, sound: 1 },
        evidence: { canonicalTimeline: true, signalDecisionAudit: signalAudit() },
      },
      postBundleProfileActionPolicy: {
        version: 'post-bundle-profile-action-policy-v1',
        unifiedDecisionBundleExecuted: true,
        evaluatedAt: '2026-06-14T00:00:00.000Z',
        allowedActionCount: 1,
        skippedActionCount: 2,
        allowedTools: ['quality_review'],
        skippedActions: [
          {
            tool: 'add_motion_graphics',
            action: 'Add legacy motion graphics',
            reason: 'primary_visual_overlays_already_owned_by_unified_bundle',
          },
          {
            tool: 'add_transition',
            action: 'Add legacy transitions',
            reason: 'transitions_already_owned_by_unified_bundle',
          },
        ],
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
      codeProvenance: {
        branch: 'infrastructure-improvs-+Editron',
        head: 'abc123',
        upstreamHead: 'def456',
        dirty: true,
        dirtyPaths: ['lib/editron/motion-graphics/engine/composition-planner.ts'],
        untrackedPaths: ['.codex-digest/'],
        capturedBy: 'test',
      },
    });

    expect(manifest).toMatchObject({
      version: 'editron-phase0-fixture-v1',
      projectId: 'proj_phase0_fixture',
      source: 'test',
      codeProvenance: {
        branch: 'infrastructure-improvs-+Editron',
        head: 'abc123',
        upstreamHead: 'def456',
        dirty: true,
        dirtyPaths: ['lib/editron/motion-graphics/engine/composition-planner.ts'],
        untrackedPaths: ['.codex-digest/'],
        capturedBy: 'test',
      },
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
      cutPlan: {
        status: 'present',
        actionCount: 2,
        countsByAction: { remove: 1, split: 1 },
        countsByReason: { 'transcript-edit': 1, 'pacing-split': 1 },
        removalActionCount: 1,
        splitActionCount: 1,
        pacingSplitCount: 1,
        pacingSplitsMissingEvidenceCount: 0,
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
        authority: {
          version: 'unified-decision-authority-v1',
          executableProducer: 'creative-brief',
          advisoryProducers: ['signal-driven'],
          signalDecisionRole: 'advisor',
          signalDecisionsCanAddExecutable: false,
          decisionMode: 'creative-brief-primary',
        },
        totalDecisions: 3,
        signalDecisionHealth: {
          status: 'present',
          totalCount: 1,
          addedExecutableCount: 1,
          executableSignalOutcomeCount: 1,
          promotionRate: 1,
          candidateSamples: [expect.objectContaining({
            family: 'graphic',
            confidence: 0.88,
            evidenceStrength: 1,
            hasSignals: true,
            hasAtomicMomentBundle: true,
          })],
          evidenceSamples: [expect.objectContaining({
            family: 'graphic',
            outcome: 'added-executable',
            reason: 'licensed-signal-candidate',
          })],
        },
      },
      oldProducerGating: {
        status: 'present',
        unifiedDecisionBundleExecuted: true,
        skippedLegacyActionCount: 2,
        allowedLegacyActionCount: 1,
        unknownReasonCount: 0,
        evidence: {
          version: 'post-bundle-profile-action-policy-v1',
          evaluatedAt: '2026-06-14T00:00:00.000Z',
          allowedTools: ['quality_review'],
        },
      },
      qualityReview: {
        status: 'present',
        overallScore: 41,
        issueCount: 2,
        criticalCount: 1,
        warningCount: 1,
        autoFixableCount: 1,
        issuesPersistedCount: 2,
        issuesTruncated: false,
        reviewedAt: '2026-06-14T00:00:00.000Z',
      },
      vjepaCoverage: {
        source: 'persisted',
        status: 'warn',
        overlayHitRate: 0.5,
        reliability: {
          screenAwarePlacement: 'degraded',
        },
        screenContextPolicy: {
          mode: 'degraded',
          allowSubjectAvoidance: false,
          allowNegativeSpacePlacement: false,
          allowMotionDirection: false,
          allowTextAvoidance: false,
        },
      },
      renderArtifacts: {
        status: 'not-rendered',
        artifactDir: 'fixtures/proj',
        artifactPackStatus: null,
        pendingFamilies: ['motion-graphic', 'caption', 'transition', 'sfx', 'zoom'],
        auditedVisualCount: 0,
        auditedMotionCount: 0,
        auditedAudioCount: 0,
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
    expect(manifest.overlayFamilies.captions).toMatchObject({
      count: 1,
      trackCount: 1,
      textOverlayCount: 0,
      groupCount: 1,
      wordCount: 2,
      timedGroupCount: 0,
      averageGroupDurationMs: null,
      maxGroupDurationMs: null,
      styleSignatures: ['Inter|#ffffff|clean'],
    });
    expect(manifest.overlayFamilies.transitions).toMatchObject({
      count: 1,
      types: ['whip-pan'],
      withAtomicForm: 1,
      withBoundaryPair: 1,
      withBoundaryReason: 1,
      boundaryEvidenceMissing: [],
    });
    expect(manifest.overlayFamilies.sfx).toMatchObject({
      count: 1,
      roles: ['impact'],
      withAtomicForm: 1,
      withTransitionAnchor: 1,
      withTransitionEvidence: 1,
      transitionEvidenceMissing: [],
    });
    expect(manifest.vjepaCoverage.reliability?.reasons).toEqual(expect.arrayContaining([
      'overlay-hit-rate-below-90:50%',
      'textCoverage-coverage-below-90:0%',
    ]));
    expect(manifest.vjepaCoverage.screenContextPolicy?.primitiveTrust).toEqual({
      motionVector: 'degraded',
      mainSubject: 'degraded',
      textCoverage: 'unavailable',
      negativeSpace: 'degraded',
    });
    expect(manifest.oldProducerGating.skippedLegacyActions).toEqual([
      {
        tool: 'add_motion_graphics',
        action: 'Add legacy motion graphics',
        reason: 'primary_visual_overlays_already_owned_by_unified_bundle',
      },
      {
        tool: 'add_transition',
        action: 'Add legacy transitions',
        reason: 'transitions_already_owned_by_unified_bundle',
      },
    ]);
    expect(manifest.qualityReview.issues).toEqual([
      {
        type: 'graphic_occlusion',
        severity: 'critical',
        description: 'Motion graphic covers the speaker face.',
        frameRange: { start: 30, end: 55 },
        overlayId: 101,
        suggestedFix: 'Move graphic to negative-space region.',
        autoFixable: true,
      },
      {
        type: 'caption_reading_speed',
        severity: 'warning',
        description: 'Caption group is too fast to read.',
        frameRange: { start: 0, end: 20 },
        overlayId: 102,
        suggestedFix: null,
        autoFixable: false,
      },
    ]);
    expect(manifest.qualityReview.suggestions).toEqual(['Reduce overlay collision before calibration.']);
    expect(manifest.cutPlan.actions[1]).toMatchObject({
      startMs: 5000,
      action: 'split',
      reason: 'pacing-split',
      pacingEvidence: {
        boundaryReasons: ['speech-pause'],
        speechGapMs: 1700,
        previousWord: 'first',
        nextWord: 'second',
      },
    });
  });

  it('records missing or weak cut-plan evidence without rewriting cuts', () => {
    const missing = buildPhase0FixtureManifest(baseProject({ rawFootageAnalysis: undefined }));
    expect(missing.cutPlan).toMatchObject({
      status: 'missing-raw-footage',
      actionCount: 0,
      issue: 'rawFootageAnalysis is not present on the project',
    });

    const weak = buildPhase0FixtureManifest(baseProject({
      rawFootageAnalysis: {
        ...baseProject().rawFootageAnalysis,
        silenceRemovalPlan: [{
          startMs: 2000,
          endMs: 2000,
          action: 'split',
          reason: 'pacing-split',
        }],
      },
    }));

    expect(weak.cutPlan).toMatchObject({
      status: 'present',
      pacingSplitCount: 1,
      pacingSplitsMissingEvidenceCount: 1,
    });
  });

  it('attaches render artifact pack evidence without pretending rendered pixels exist', () => {
    const baseManifest = buildPhase0FixtureManifest(baseProject(), {
      artifactDir: 'fixtures/proj',
    });
    const artifactPack = buildPhase0RenderArtifactPack(baseProject(), baseManifest, {
      artifactDir: 'fixtures/proj',
    });

    const manifest = withPhase0RenderArtifactPack(baseManifest, artifactPack);

    expect(manifest.renderArtifacts).toMatchObject({
      status: 'not-rendered',
      artifactDir: 'fixtures/proj',
      artifactPackStatus: 'ready',
      artifactPackIssues: [],
      auditedVisualCount: 3,
      auditedMotionCount: 0,
      auditedAudioCount: 1,
      presentRequiredFamilies: ['caption', 'motion-graphic', 'sfx', 'transition'],
      missingRequiredFamilies: ['zoom'],
      pendingFamilies: ['zoom'],
    });
    expect(manifest.renderArtifacts.renderCommand).toContain('scripts/render-editron-aesthetic.ts');
    expect(manifest.calibrationSafety.learningWritesAllowed).toBe(false);
  });

  it('attaches rendered aesthetic evidence after pixels are actually judged', () => {
    const baseManifest = buildPhase0FixtureManifest(baseProject(), {
      artifactDir: 'fixtures/proj',
    });
    const artifactPack = buildPhase0RenderArtifactPack(baseProject(), baseManifest, {
      artifactDir: 'fixtures/proj',
    });
    const preparedManifest = withPhase0RenderArtifactPack(baseManifest, artifactPack);

    const manifest = withPhase0RenderedAestheticReport(preparedManifest, {
      outputDir: 'fixtures/proj/rendered-aesthetic',
      jsonReport: 'fixtures/proj/rendered-aesthetic/rendered-aesthetic.json',
      htmlReport: 'fixtures/proj/rendered-aesthetic/report.html',
      summary: {
        status: 'fail',
        score: 0.37,
        passFrames: 1,
        warnFrames: 1,
        failFrames: 2,
        sampledFrames: 4,
        animationSampleFrames: 3,
      },
      frames: [{
        frame: 30,
        activeOverlayIds: ['mg-1', 'cap-1'],
        activeOverlayTypes: ['motion-graphic', 'caption'],
        fullStill: 'fixtures/proj/rendered-aesthetic/f00030/full.png',
        baselineStill: 'fixtures/proj/rendered-aesthetic/f00030/baseline.png',
        report: {
          status: 'fail',
          score: 0.37,
          issues: [{
            dimension: 'contrast',
            severity: 'fail',
            overlayId: 'cap-1',
            message: 'rendered text contrast is below accessibility floor',
            evidence: 'contrast=1.3',
          }, {
            dimension: 'safe-area',
            severity: 'warn',
            overlayId: 'mg-1',
            message: 'motion graphic leaves title safe bounds',
            evidence: 'overflow=22px',
          }],
        },
      }],
    });

    expect(manifest.renderArtifacts).toMatchObject({
      status: 'rendered',
      renderedAestheticDir: 'fixtures/proj/rendered-aesthetic',
      renderedAestheticJson: 'fixtures/proj/rendered-aesthetic/rendered-aesthetic.json',
      renderedAestheticHtml: 'fixtures/proj/rendered-aesthetic/report.html',
      pendingFamilies: ['zoom'],
      renderedSummary: {
        status: 'fail',
        score: 0.37,
        passFrames: 1,
        warnFrames: 1,
        failFrames: 2,
        sampledFrames: 4,
        animationSampleFrames: 3,
      },
      renderedIssueCount: 2,
      renderedIssuesBySeverity: { fail: 1, warn: 1, info: 0 },
      renderedIssuesByDimension: { contrast: 1, 'safe-area': 1 },
      sampledFrames: [{
        frame: 30,
        status: 'fail',
        score: 0.37,
        issueCount: 2,
        activeOverlayIds: ['mg-1', 'cap-1'],
        activeOverlayTypes: ['motion-graphic', 'caption'],
        fullStill: 'fixtures/proj/rendered-aesthetic/f00030/full.png',
        baselineStill: 'fixtures/proj/rendered-aesthetic/f00030/baseline.png',
      }],
    });
    expect(manifest.calibrationSafety.learningWritesAllowed).toBe(false);
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
    expect(manifest.cutContinuity.intentionalTransitionOverlapCount).toBe(0);
    expect(manifest.cutContinuity.unclassifiedOverlapCount).toBe(1);
    expect(manifest.cutContinuity.overlaps[0]).toMatchObject({
      clipId: 'clip-3',
      previousClipId: 'clip-2',
      overlapFrames: 5,
      classification: 'unclassified-overlap',
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

  it('classifies video overlaps covered by transition handles separately from broken overlaps', () => {
    const manifest = buildPhase0FixtureManifest(baseProject({
      durationInFrames: 100,
      overlays: [
        { id: 'clip-1', type: 'video', from: 0, durationInFrames: 60, sourceStartFrame: 0 },
        { id: 'clip-2', type: 'video', from: 30, durationInFrames: 60, sourceStartFrame: 60 },
        { id: 'transition-1', type: 'transition', from: 45, durationInFrames: 30, transitionStyle: 'cross-dissolve' },
      ],
    }));

    expect(manifest.cutContinuity.overlapCount).toBe(1);
    expect(manifest.cutContinuity.intentionalTransitionOverlapCount).toBe(1);
    expect(manifest.cutContinuity.unclassifiedOverlapCount).toBe(0);
    expect(manifest.cutContinuity.overlaps[0]).toMatchObject({
      clipId: 'clip-2',
      previousClipId: 'clip-1',
      overlapFrames: 30,
      classification: 'intentional-transition-handle',
      transitionId: 'transition-1',
      transitionStartFrame: 45,
      transitionDurationFrames: 30,
    });
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
    expect(manifest.vjepaCoverage.reliability?.screenAwarePlacement).toBe('trusted');
    expect(manifest.vjepaCoverage.screenContextPolicy).toMatchObject({
      mode: 'trusted',
      allowSubjectAvoidance: true,
      allowNegativeSpacePlacement: true,
      allowMotionDirection: true,
      allowTextAvoidance: true,
    });
    expect(manifest.vjepaCoverage.segmentCoverage?.fieldCoverage.motionVector).toBe(1);
    expect(manifest.vjepaCoverage.segmentCoverage?.fieldCoverage.mainSubject).toBe(1);
    expect(manifest.unifiedDecisionBundle.status).toBe('missing');
    expect(manifest.qualityReview.status).toBe('present');
    expect(manifest.oldProducerGating).toMatchObject({
      status: 'not-applicable',
      unifiedDecisionBundleExecuted: false,
      issue: 'unified decision bundle is missing',
    });
    expect(manifest.calibrationSafety.learningWritesAllowed).toBe(false);
  });

  it('marks screen context unavailable when V-JEPA evidence is missing', () => {
    const manifest = buildPhase0FixtureManifest(baseProject({
      vjepaAnalysis: undefined,
      intelligence: undefined,
    }));

    expect(manifest.vjepaCoverage.source).toBe('missing');
    expect(manifest.vjepaCoverage.screenContextPolicy).toEqual({
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
});
