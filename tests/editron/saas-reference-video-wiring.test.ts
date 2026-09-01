import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildReferenceFrameAssetId } from '../../lib/editron/reference-video/reference-frame-asset-id';
import { mapSaasReferenceAnalysisToEditDNA } from '../../lib/editron/reference-video/saas-reference-edit-dna';
import type {
  SaasReferenceGate,
  SaasReferenceStyleAnalysis,
} from '../../lib/editron/reference-video/saas-reference-video-analyzer';

describe('SaaS reference video production wiring', () => {
  it('maps accepted SaaS analysis into the existing EditDNA contract plus evidence metadata', () => {
    const dna = mapSaasReferenceAnalysisToEditDNA({
      analysis: analysisPayload(),
      gate: gatePayload(),
      sourceName: 'reference.mp4',
      cacheKey: 'saas-reference-v1:analysis:abc',
      createdAt: '2026-06-29T00:00:00.000Z',
    });

    expect(dna).toMatchObject({
      provider: 'glm-saas-reference',
      referenceKind: 'saas',
      sourceName: 'reference.mp4',
      pacing: { overall: 'medium', hookSpeed: 'fast', mainSpeed: 'medium' },
      transitions: { dominant: 'hard_cut' },
      graphicsDensity: 'moderate',
    });
    expect(dna.profileId).toContain('style_saas_');
    expect(dna.saasReference).toMatchObject({
      rubricVersion: 'saas-reference-v1',
      cacheKey: 'saas-reference-v1:analysis:abc',
      evaluationWindowSec: 120,
      createdAt: '2026-06-29T00:00:00.000Z',
    });
  });

  it('builds safe deterministic frame asset IDs for uploaded GLM gate frames', () => {
    expect(buildReferenceFrameAssetId({
      referenceAssetId: 'upload weird/id:123',
      index: 2,
      timestampSec: 59.755,
    })).toBe('ref_saas_reference_v1_upload_weird_id_123_2_5976');
  });

  it('wires GLM SaaS reference evidence into the video-analysis reference path', () => {
    const workerSource = readFileSync(
      join(process.cwd(), 'app/api/internal/workers/video-analysis/route.ts'),
      'utf8',
    );

    expect(workerSource).toContain('EDITRON_SAAS_REFERENCE_GLM_ENABLED');
    expect(workerSource).toContain("import('@/lib/editron/reference-video/reference-frame-sampler')");
    expect(workerSource).toContain('analyzeSaasReferenceVideo');
    expect(workerSource).toContain('mapSaasReferenceAnalysisToEditDNA');
    expect(workerSource).toContain('referenceVideoAnalysis');
    expect(workerSource).toContain('shouldRunLegacyReferenceExtraction(referenceVideoAnalysis)');
  });

  it('persists accepted reference evidence before Director consumes it from Mongo', () => {
    const videoWorkerSource = readFileSync(
      join(process.cwd(), 'app/api/internal/workers/video-analysis/route.ts'),
      'utf8',
    );
    const tribeWorkerSource = readFileSync(
      join(process.cwd(), 'app/api/internal/workers/tribe-analysis/route.ts'),
      'utf8',
    );
    const directorWorkerSource = readFileSync(
      join(process.cwd(), 'lib/editron/services/canonical-director-run.ts'),
      'utf8',
    );

    const phase1OwnerIndex = videoWorkerSource.indexOf('commitProjectAnalysisPhase1V1');
    const editDnaPersistIndex = videoWorkerSource.indexOf('...(editDNA ? { referenceEditDNA: editDNA } : {})');
    const analysisPersistIndex = videoWorkerSource.indexOf('...(referenceVideoAnalysis ? { referenceVideoAnalysis } : {})');
    const directorPayloadIndex = videoWorkerSource.indexOf('const directorPayload = {');

    expect(phase1OwnerIndex).toBeGreaterThan(0);
    expect(editDnaPersistIndex).toBeGreaterThan(phase1OwnerIndex);
    expect(analysisPersistIndex).toBeGreaterThan(editDnaPersistIndex);
    expect(directorPayloadIndex).toBeGreaterThan(analysisPersistIndex);
    expect(videoWorkerSource).toContain("if (referenceVideoAnalysis?.status === 'rejected') return false;");
    expect(videoWorkerSource).toContain("if (referenceVideoAnalysis?.status === 'failed') return false;");
    expect(tribeWorkerSource).toContain('referenceEditDNA: 1');
    expect(tribeWorkerSource).toContain('referenceVideoAnalysis: 1');
    expect(tribeWorkerSource).toContain("import('@/lib/editron/services/canonical-director-run')");
    expect(directorWorkerSource).toContain('const editDNA = asRecord(projectDoc.referenceEditDNA);');
    expect(directorWorkerSource).toContain('executeDirectorPlan(');
    expect(directorWorkerSource).toContain('input.projectId, input.userId, input.profileId, brief');
  });
});

function gatePayload(): SaasReferenceGate {
  return {
    isSaasVideo: true,
    confidence: 0.94,
    category: 'saas_product_demo',
    evidence: ['dashboard UI', 'workflow labels', 'product CTA'],
    rejectionReasons: [],
    sampledFrameVerdicts: [0, 1, 2, 3, 4].map((frameIndex) => ({
      frameIndex,
      isSaasFrame: true,
      confidence: 0.94,
      evidence: ['visible SaaS dashboard UI'],
    })),
  };
}

function analysisPayload(): SaasReferenceStyleAnalysis {
  return {
    summary: 'A focused SaaS product demo with dashboard-led proof.',
    saasCategory: 'saas_product_demo',
    evaluationWindowSec: 120,
    structure: {
      hook: 'Starts with the product value prop over UI.',
      demoFlow: ['problem', 'workflow', 'proof', 'CTA'],
      proofMoments: ['dashboard state change'],
      cta: 'Try the product',
    },
    styleSignals: {
      pacing: {
        speed: 'medium',
        cutRhythm: 'Short UI-led beats with pauses on proof screens.',
        attentionPattern: 'Alternates text claims with interface evidence.',
      },
      visualLanguage: ['dark canvas', 'precise product closeups'],
      uiTreatment: {
        density: 'balanced',
        framing: 'Centered app surfaces with generous margins.',
        screenshotTreatment: 'Clean screen captures with subtle depth.',
      },
      typography: {
        weight: 'medium to bold',
        hierarchy: 'Large claim, smaller product labels.',
        motion: 'Soft fades and small slides.',
      },
      color: {
        palette: ['#0B0B0A', '#D4A652'],
        contrast: 'High contrast editorial UI.',
        backgroundTreatment: 'Dark neutral canvas.',
      },
      motion: {
        transitionStyle: 'Clean cuts and gentle pushes.',
        cameraMoves: ['slow push'],
        microInteractions: ['cursorless UI changes'],
      },
      brandTransferBoundaries: ['Do not copy exact app layout or claims.'],
    },
    decisionInputs: ['Use dark editorial pacing as context only.'],
    risks: [],
  };
}
