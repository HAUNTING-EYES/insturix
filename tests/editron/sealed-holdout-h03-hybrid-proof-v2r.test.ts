import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { materializeHoldoutMediaV2R }
  from '@/lib/editron/research/open-ended-planner/holdout-media-materializer-v2r';
import {
  proveSealedHoldoutH03HybridOutcomeV2R,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-hybrid-proof-v2r';

import {
  finishSealedHoldoutScriptV2R,
  runScriptedBudgetedSealedHoldoutV2R,
  type SealedHoldoutScriptedCallV2R,
} from './helpers/sealed-holdout-v2r-test-driver';

const scratch: string[] = [];
afterEach(async () => {
  await Promise.all(scratch.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function calls(assetIds: readonly string[] = ['h03-a', 'h03-b']): readonly SealedHoldoutScriptedCallV2R[] {
  return [
    { name: 'find_visual_moment', arguments: {
      projectId: 'oe-hold-03', query: 'Resolve the measured six-window reference layout and face-safe title region.',
      evidenceIds: ['E1', 'E2'],
    } },
    { name: 'get_timeline_view', arguments: {
      projectId: 'oe-hold-03', expectedProjectRevision: 'R12',
    } },
    { name: 'generated_composition_program', arguments: {
      projectId: 'oe-hold-03', expectedProjectRevision: 'R12', assetIds,
      targetRange: { startFrame: 90, endFrame: 270 },
      referenceBlueprintId: 'HOLD-03-REFERENCE-BLUEPRINT-V2R-1',
      layoutSpec: {
        panelCount: 6, geometry: 'ASYMMETRIC_NORMALIZED_BOUNDS', gutters: true,
        titleSafeBand: { left: 0.15, top: 0.43, width: 0.70, height: 0.14 },
      },
      motionSpec: {
        entryFrames: [0, 24], stableFrames: [24, 150], exitFrames: [150, 180],
        relationship: 'OPPOSED_HORIZONTAL_SIDES_AND_VERTICAL_CENTRE',
      },
      typographySpec: {
        text: 'EVENT\nMOMENT', alignment: 'CENTER', fontAssetId: 'font-noto-sans-v27-regular',
      },
      constraints: {
        referencePixelsForbidden: true, preserveOutsideRange: true,
        returnBinding: { overlayId: 'ov-full', assetId: 'h03-a', sourceFrame: 270 },
        titleFaceOverlapMaximumPixels: 0,
      },
      evidenceIds: ['E1', 'E2', 'E3'],
    } },
    finishSealedHoldoutScriptV2R('READY_FOR_PROOF', ['E1', 'E2', 'E3']),
  ];
}

async function setup(selectedCalls = calls()) {
  const root = await mkdtemp(join(tmpdir(), 'editron-h03-proof-'));
  scratch.push(root);
  const [episode, mediaManifest] = await Promise.all([
    runScriptedBudgetedSealedHoldoutV2R({
      caseId: 'HOLD-03:C1', calls: selectedCalls,
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
    }),
    materializeHoldoutMediaV2R(join(root, 'media')),
  ]);
  return { root, mediaManifest, ...episode };
}

describe('sealed HOLD-03 rendered hybrid proof V2R', () => {
  it('proves the generated six-window island and native frame-270 return from decoded output', async () => {
    const result = await setup();
    expect(result.evaluation, JSON.stringify({
      evaluation: result.evaluation, trace: result.trace,
    }, null, 2)).toMatchObject({
      assessment: 'READY_FOR_PROOF', executionForm: 'GENERATED_COMPOSITION',
    });
    const proof = await proveSealedHoldoutH03HybridOutcomeV2R({
      manifest: result.manifest, caseId: 'HOLD-03:C1', trace: result.trace,
      evaluation: result.evaluation, mediaManifest: result.mediaManifest,
      outputDirectory: join(result.root, 'proof'),
    });
    expect(proof).toMatchObject({
      authority: 'RESEARCH_RENDERED_HYBRID_PROXY_NO_PROJECT_MUTATION',
      assessment: 'PASS_RESEARCH_RENDERED_HYBRID_PROXY', stateEffects: [],
      executionBoundary: {
        modelSelectedForm: 'GENERATED_COMPOSITION',
        projectRangeForm: 'HYBRID_NATIVE_SURROUND_GENERATED_ISLAND',
        generatedProgramSource: 'HUMAN_AUTHORED_FIXTURE_NOT_MODEL_OUTPUT',
        sandboxStatus: 'TRUSTED_LOCAL_PROCESS_NOT_PRODUCTION_SECURITY_SANDBOX',
      },
      generatedIsland: {
        projectRange: { startFrame: 90, endFrame: 270 }, referenceAssetRendered: false,
        layout: { detectedPanelCount: 6, sourcePanelTitleFootprintIntersectionPixels: 0 },
      },
      nativeSurround: {
        structuralOutsideRangeDisposition: 'SAME_SOURCE_VERSION_AND_RANGES_NO_PROJECT_MUTATION',
      },
      video: { codec: 'h264', width: 360, height: 640, averageFrameRate: '30/1', decodedFrameCount: 420, audioStreamCount: 0 },
    });
    expect(proof.generatedIsland.layout.minimumPanelFillRatio).toBeGreaterThanOrEqual(0.82);
    expect(proof.generatedIsland.layout.titleYellowPixels).toBeGreaterThan(1_000);
    expect(proof.generatedIsland.motion.entryEdgeLumaDelta).toBeGreaterThanOrEqual(20);
    expect(proof.generatedIsland.motion.exitEdgeLumaDelta).toBeGreaterThanOrEqual(20);
    expect(proof.nativeSurround.returnFrame270MeanAbsoluteRgbError).toBeLessThanOrEqual(6);
    expect(proof.nativeSurround.sampledOutsideRangeMaxMeanAbsoluteRgbError).toBeLessThanOrEqual(6);
  }, 240_000);

  it('rejects an attempt to render the reference asset as project media', async () => {
    const result = await setup(calls(['h03-a', 'h03-b', 'h03-ref']));
    expect(result.evaluation.assessment, JSON.stringify({
      evaluation: result.evaluation, trace: result.trace,
    }, null, 2)).toBe('READY_FOR_PROOF');
    await expect(proveSealedHoldoutH03HybridOutcomeV2R({
      manifest: result.manifest, caseId: 'HOLD-03:C1', trace: result.trace,
      evaluation: result.evaluation, mediaManifest: result.mediaManifest,
      outputDirectory: join(result.root, 'bad-proof'),
    })).rejects.toThrow('SEALED_H03_PROOF_GENERATED_ARGUMENTS_INVALID');
  }, 60_000);
});
