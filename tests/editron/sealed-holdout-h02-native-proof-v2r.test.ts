import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { materializeHoldoutMediaV2R }
  from '@/lib/editron/research/open-ended-planner/holdout-media-materializer-v2r';
import { proveSealedHoldoutH02NativeOutcomeV2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h02-native-proof-v2r';

import {
  finishSealedHoldoutScriptV2R,
  runScriptedBudgetedSealedHoldoutV2R,
  type SealedHoldoutScriptedCallV2R,
} from './helpers/sealed-holdout-v2r-test-driver';

const scratch: string[] = [];
afterEach(async () => {
  await Promise.all(scratch.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function calls(closingRange = { startFrame: 240, endFrame: 315 }): readonly SealedHoldoutScriptedCallV2R[] {
  return [
    { name: 'inspect_user_asset', arguments: { projectId: 'oe-hold-02', assetId: 'h02-door' } },
    { name: 'read_project_file', arguments: { projectId: 'oe-hold-02', expectedProjectRevision: 'R4' } },
    { name: 'add_overlay', arguments: {
      projectId: 'oe-hold-02', expectedProjectRevision: 'R4', assetId: 'h02-door',
      targetRange: { startFrame: 0, endFrame: 75 }, sourceRange: { startFrame: 30, endFrame: 105 },
    } },
    { name: 'add_overlay', arguments: {
      projectId: 'oe-hold-02', assetId: 'h02-process',
      targetRange: { startFrame: 75, endFrame: 165 }, sourceRange: { startFrame: 0, endFrame: 90 },
      argumentReferences: [{ targetField: 'expectedProjectRevision', resultReferenceId: 'result_t3_1' }],
    } },
    { name: 'add_overlay', arguments: {
      projectId: 'oe-hold-02', assetId: 'h02-door', targetRange: { startFrame: 165, endFrame: 240 },
      sourceRange: closingRange,
      argumentReferences: [{ targetField: 'expectedProjectRevision', resultReferenceId: 'result_t4_1' }],
    } },
    finishSealedHoldoutScriptV2R('READY_FOR_PROOF', ['E1', 'E2']),
  ];
}

async function setup(closingRange?: { startFrame: number; endFrame: number }) {
  const root = await mkdtemp(join(tmpdir(), 'editron-h02-proof-'));
  scratch.push(root);
  const [episode, mediaManifest] = await Promise.all([
    runScriptedBudgetedSealedHoldoutV2R({
      caseId: 'HOLD-02:C1', calls: calls(closingRange),
      argumentHandoffMode: 'OPAQUE_RESULT_REFERENCES',
    }),
    materializeHoldoutMediaV2R(join(root, 'media')),
  ]);
  return { root, mediaManifest, ...episode };
}

describe('sealed HOLD-02 rendered native proof V2R', () => {
  it('proves a causally written open-process-close bookend from decoded frames', async () => {
    const result = await setup();
    const proof = await proveSealedHoldoutH02NativeOutcomeV2R({
      manifest: result.manifest, caseId: 'HOLD-02:C1', trace: result.trace,
      evaluation: result.evaluation, mediaManifest: result.mediaManifest,
      outputDirectory: join(result.root, 'proof'),
    });
    expect(proof).toMatchObject({
      authority: 'RESEARCH_RENDERED_NATIVE_PROXY_NO_PROJECT_MUTATION',
      assessment: 'PASS_RESEARCH_RENDERED_NATIVE_PROXY', stateEffects: [],
      affectedRange: { startFrame: 0, endFrame: 240 },
      outsideRangeProof: 'NOT_RENDERED_NOT_CLAIMED',
      video: { width: 360, height: 640, averageFrameRate: '30/1', decodedFrameCount: 240 },
    });
    expect(proof.selectedSequence.map(({ assetId }) => assetId))
      .toEqual(['h02-door', 'h02-process', 'h02-door']);
    expect(proof.actionProof.openingDoorWidthRatio).toBeLessThan(0.4);
    expect(proof.actionProof.closingDoorWidthRatio).toBeGreaterThan(2.5);
    expect(result.trace.nodes.filter(({ researchCloneMutation }) => researchCloneMutation).slice(1)
      .every(({ argumentReferenceBindings }) => argumentReferenceBindings.length === 1)).toBe(true);
  }, 60_000);

  it('rejects a structurally distinct but semantically wrong closing window', async () => {
    const result = await setup({ startFrame: 120, endFrame: 195 });
    expect(result.evaluation.assessment).toBe('READY_FOR_PROOF');
    await expect(proveSealedHoldoutH02NativeOutcomeV2R({
      manifest: result.manifest, caseId: 'HOLD-02:C1', trace: result.trace,
      evaluation: result.evaluation, mediaManifest: result.mediaManifest,
      outputDirectory: join(result.root, 'bad-proof'),
    })).rejects.toThrow('SEALED_H02_PROOF_SELECTED_SEQUENCE_INVALID');
  }, 60_000);
});
