import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pipeline/sfx-library-service', () => ({
  audioDescriptionToSearchQuery: vi.fn((description: string) => description),
  isSFXLibraryAvailable: vi.fn(() => false),
  searchAndDownloadSFX: vi.fn(async () => null),
}));

vi.mock('@/lib/editron/db/mongodb', () => ({
  getDatabase: vi.fn(async () => ({
    collection: vi.fn(() => ({
      findOne: vi.fn(async () => null),
    })),
  })),
}));

import { OverlayType, type Overlay } from '../../components/editron/editor/version-7.0.0/types';
import { buildPhase0FixtureManifest, type Phase0FixtureProject } from '../../lib/editron/services/phase0-fixture-manifest';
import { classifyPhase0Fixture } from '../../lib/editron/services/phase0-failure-taxonomy';
import { executeEDL } from '../../lib/editron/services/edl-executor';
import type { EditDecisionList } from '../../lib/editron/services/reactive-edit-engine';

describe('decision output trace', () => {
  it('records which overlay a decision modified', async () => {
    const overlays: Overlay[] = [{
      id: 101,
      type: OverlayType.VIDEO,
      content: 'https://example.com/source.mp4',
      src: 'https://example.com/source.mp4',
      from: 0,
      durationInFrames: 150,
      assetId: 'asset-trace-1',
      row: 2,
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      isDragging: false,
      rotation: 0,
      styles: { opacity: 1 },
      metadata: {},
    } as Overlay];
    const edl: EditDecisionList = {
      projectId: 'decision-output-trace-edl',
      generatedAt: new Date('2026-06-20T00:00:00.000Z'),
      totalDecisions: 1,
      decisions: [{
        type: 'zoom',
        frame: 45,
        durationFrames: 18,
        priority: 3,
        source: 'signal-planner:test',
        signal: 'speech_peak',
        reason: 'speech peak should push camera',
        confidence: 0.94,
        params: {
          signals: {
            speech_energy: 0.9,
            word_importance: 0.84,
            main_subject_x: 0.58,
            main_subject_y: 0.42,
            face_present: 1,
          },
        },
      }],
      stats: {
        cutsPerMinute: 0,
        transitionCount: 0,
        graphicCount: 0,
        zoomCount: 1,
        speedChangeCount: 0,
        averageConfidence: 0.94,
      },
    };

    const result = await executeEDL(edl, 'decision-output-trace-edl', 'user-1', overlays, { width: 1920, height: 1080 });

    expect(result.decisionsExecuted).toBe(1);
    expect(result.decisionExecutionTraceTotal).toBe(1);
    expect(result.decisionExecutionTrace).toEqual([
      expect.objectContaining({
        decisionIndex: 0,
        type: 'zoom',
        frame: 45,
        source: 'signal-planner:test',
        signal: 'speech_peak',
        outcome: 'executed',
        modifiedOverlayIds: [101],
        createdOverlayIds: [],
      }),
    ]);
  });

  it('surfaces missing decision-to-overlay links in Phase 0 taxonomy', () => {
    const project = cleanProjectWithTrace({
      status: 'no-output-links',
      totalObserved: 1,
      keptEntries: 1,
      executed: 1,
      skipped: 0,
      overlaysCreated: 0,
      overlaysModified: 0,
      createdOverlayLinkCount: 0,
      modifiedOverlayLinkCount: 0,
      executedWithoutOverlayLinkCount: 1,
      byOutcome: { executed: 1 },
      samples: [{
        decisionIndex: 0,
        type: 'zoom',
        frame: 45,
        outcome: 'executed',
        reason: 'handler-applied',
        createdOverlayIds: [],
        modifiedOverlayIds: [],
        beforeOverlayCount: 1,
        afterOverlayCount: 1,
      }],
    });

    const manifest = buildPhase0FixtureManifest(project);
    const taxonomy = classifyPhase0Fixture(manifest);

    expect(manifest.unifiedDecisionBundle.decisionOutputTrace).toMatchObject({
      status: 'no-output-links',
      executed: 1,
      executedWithoutOverlayLinkCount: 1,
    });
    expect(taxonomy.classes.find((item) => item.id === 'decision.output_trace_no_overlay_links')).toMatchObject({
      severity: 'warn',
      evidence: {
        executed: 1,
        executedWithoutOverlayLinkCount: 1,
        samples: [expect.objectContaining({ type: 'zoom', outcome: 'executed' })],
      },
    });
  });
});

function cleanProjectWithTrace(executionTrace: Record<string, unknown>): Phase0FixtureProject {
  return {
    projectId: 'proj_decision_output_trace',
    fps: 30,
    durationInFrames: 90,
    playerDimensions: { width: 1080, height: 1920 },
    rawFootageAnalysis: {
      originalDurationMs: 3000,
      estimatedCleanDurationMs: 3000,
      transcription: { words: [{ word: 'hello', startMs: 0, endMs: 300 }] },
      segments: [{ text: 'hello', startMs: 0, endMs: 300, fillerCount: 0, silenceGapCount: 0, avgWordGapMs: 0 }],
      silenceRemovalPlan: [],
    },
    overlays: [{ id: 'clip-1', type: 'video', from: 0, durationInFrames: 90, sourceStartFrame: 0 }],
    intelligence: {
      unifiedDecisionBundle: {
        source: 'creative-brief+signal-driven',
        authority: {
          version: 'unified-decision-authority-v1',
          executableProducer: 'unified-planner',
          advisoryProducers: [],
          signalDecisionRole: 'candidate-source',
          signalDecisionsCanAddExecutable: true,
          decisionMode: 'unified-planner',
        },
        totalDecisions: 1,
        counts: { zoom: 1 },
        executionTrace: {
          version: 'decision-output-trace-v1',
          truncated: false,
          ...executionTrace,
        },
        evidence: {
          signalDecisionAudit: {
            totalCount: 1,
            outcomes: { 'added-executable': 1 },
            byType: {},
            byFamily: {},
            byReason: {},
            candidates: [{
              family: 'camera',
              role: 'camera-motion',
              source: 'signal-driven',
              signal: 'speech_peak',
              confidence: 0.94,
              momentImportance: 0.8,
              evidenceStrength: 0.9,
              completeness: 0.9,
              physicalFormReadiness: 0.9,
              risk: 0.1,
              sourcePacket: { hasSignals: true, signalKeys: ['speech_peak'], hasAtomicMomentBundle: true, hasUnifiedMomentEvidence: true },
            }],
            samples: [{
              type: 'zoom',
              family: 'camera',
              outcome: 'added-executable',
              frame: 45,
              confidence: 0.94,
              source: 'signal-driven',
              signal: 'speech_peak',
              reason: 'licensed-signal-candidate',
            }],
          },
        },
      },
      postBundleProfileActionPolicy: {
        version: 'post-bundle-profile-action-policy-v1',
        unifiedDecisionBundleExecuted: true,
        evaluatedAt: '2026-06-20T00:00:00.000Z',
        allowedActionCount: 1,
        skippedActionCount: 0,
        allowedTools: ['quality_review'],
        skippedActions: [],
      },
    },
  };
}
