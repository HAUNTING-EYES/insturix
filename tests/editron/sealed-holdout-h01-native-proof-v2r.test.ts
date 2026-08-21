import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { materializeHoldoutMediaV2R }
  from '@/lib/editron/research/open-ended-planner/holdout-media-materializer-v2r';
import { proveSealedHoldoutH01NativeOutcomeV2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h01-native-proof-v2r';

import {
  finishSealedHoldoutScriptV2R,
  runScriptedBudgetedSealedHoldoutV2R,
  type SealedHoldoutScriptedCallV2R,
} from './helpers/sealed-holdout-v2r-test-driver';

const scratch: string[] = [];

afterEach(async () => {
  await Promise.all(scratch.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function calls(incomingStartFrame = 30): readonly SealedHoldoutScriptedCallV2R[] {
  return [
    { name: 'read_project_file', arguments: {
      projectId: 'oe-hold-01', expectedProjectRevision: 'R9',
    } },
    { name: 'find_visual_moment', arguments: {
      projectId: 'oe-hold-01', query: 'align outgoing round clock with incoming round product dial',
      evidenceIds: ['E1'],
    } },
    { name: 'get_timeline_view', arguments: {
      projectId: 'oe-hold-01', expectedProjectRevision: 'R9',
    } },
    { name: 'use_matching_footage', arguments: {
      projectId: 'oe-hold-01', expectedProjectRevision: 'R9', assetId: 'h01-dial',
      targetRange: { startFrame: 150, endFrame: 300 },
      sourceRange: { startFrame: incomingStartFrame, endFrame: incomingStartFrame + 150 },
      evidenceIds: ['E1', 'E2'], constraints: { transition: 'HARD_CUT_ONLY' },
    } },
    finishSealedHoldoutScriptV2R('READY_FOR_PROOF', ['E1', 'E2']),
  ];
}

async function setup(incomingStartFrame = 30) {
  const root = await mkdtemp(join(tmpdir(), 'editron-h01-proof-'));
  scratch.push(root);
  const [episode, mediaManifest] = await Promise.all([
    runScriptedBudgetedSealedHoldoutV2R({ caseId: 'HOLD-01:C1', calls: calls(incomingStartFrame) }),
    materializeHoldoutMediaV2R(join(root, 'media')),
  ]);
  return { root, mediaManifest, ...episode };
}

describe('sealed HOLD-01 rendered native proof V2R', () => {
  it('renders the selected hard cut and proves adjacent decoded geometry', async () => {
    const result = await setup();
    const proof = await proveSealedHoldoutH01NativeOutcomeV2R({
      manifest: result.manifest, caseId: 'HOLD-01:C1', trace: result.trace,
      evaluation: result.evaluation, mediaManifest: result.mediaManifest,
      outputDirectory: join(result.root, 'proof'),
    });
    expect(proof).toMatchObject({
      authority: 'RESEARCH_RENDERED_NATIVE_PROXY_NO_PROJECT_MUTATION',
      assessment: 'PASS_RESEARCH_RENDERED_NATIVE_PROXY',
      productProjectMutationProof: 'NOT_CLAIMED', stateEffects: [],
      selectedMutation: { operatorId: 'use_matching_footage', incomingStartFrame: 30 },
      video: {
        codec: 'h264', width: 640, height: 360, averageFrameRate: '30/1',
        decodedFrameCount: 300, audioStreamCount: 0,
      },
    });
    expect(proof.geometry.normalizedCenterDistance).toBeLessThanOrEqual(0.03);
    expect(proof.geometry.diameterRatio).toBeGreaterThanOrEqual(0.9);
    expect(proof.geometry.diameterRatio).toBeLessThanOrEqual(1.1);
    expect(proof.writerIssuedProjectRevision).toMatch(/^OE-HOLD-/);
  }, 60_000);

  it('rejects a model-selected incoming window whose rendered geometry misses', async () => {
    const result = await setup(90);
    await expect(proveSealedHoldoutH01NativeOutcomeV2R({
      manifest: result.manifest, caseId: 'HOLD-01:C1', trace: result.trace,
      evaluation: result.evaluation, mediaManifest: result.mediaManifest,
      outputDirectory: join(result.root, 'bad-proof'),
    })).rejects.toThrow('SEALED_H01_PROOF_GEOMETRY_FAILED');
  }, 60_000);

  it('rejects source bytes that no longer match the committed holdout identity', async () => {
    const result = await setup();
    const dial = result.mediaManifest.artifacts.find(({ assetId }) => assetId === 'h01-dial');
    if (!dial) throw new Error('TEST_H01_DIAL_MISSING');
    const bytes = await readFile(dial.artifactPath);
    bytes[bytes.length - 1] ^= 1;
    await writeFile(dial.artifactPath, bytes);
    await expect(proveSealedHoldoutH01NativeOutcomeV2R({
      manifest: result.manifest, caseId: 'HOLD-01:C1', trace: result.trace,
      evaluation: result.evaluation, mediaManifest: result.mediaManifest,
      outputDirectory: join(result.root, 'forged-proof'),
    })).rejects.toThrow('SEALED_MEDIA_ARTIFACT_HASH_DRIFT:h01-dial');
  }, 60_000);
});
