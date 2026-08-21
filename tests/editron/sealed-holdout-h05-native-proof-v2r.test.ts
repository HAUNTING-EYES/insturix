import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { materializeHoldoutMediaV2R }
  from '@/lib/editron/research/open-ended-planner/holdout-media-materializer-v2r';
import { proveSealedHoldoutH05NativeOutcomeV2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h05-native-proof-v2r';

import {
  finishSealedHoldoutScriptV2R,
  runScriptedBudgetedSealedHoldoutV2R,
  type SealedHoldoutScriptedCallV2R,
} from './helpers/sealed-holdout-v2r-test-driver';

const scratch: string[] = [];
afterEach(async () => {
  await Promise.all(scratch.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function calls(trackingMode = 'FOLLOW_SPATIAL_EVIDENCE'): readonly SealedHoldoutScriptedCallV2R[] {
  return [
    { name: 'find_visual_moment', arguments: {
      projectId: 'oe-hold-05', query: 'track the moving speaker for a vertical reframe',
    } },
    { name: 'get_timeline_view', arguments: {
      projectId: 'oe-hold-05', expectedProjectRevision: 'R14',
    } },
    { name: 'reframe_project', arguments: {
      projectId: 'oe-hold-05', expectedProjectRevision: 'R14',
      reframePlan: {
        targetAspectRatio: '9:16', trackingMode, preserveAuthoredLayout: true,
      },
      evidenceIds: ['E1', 'E2'],
      constraints: { noStaticCenterCrop: true, preserveDuration: true },
    } },
    finishSealedHoldoutScriptV2R('READY_FOR_PROOF', ['E1', 'E2']),
  ];
}

async function setup(trackingMode?: string) {
  const root = await mkdtemp(join(tmpdir(), 'editron-h05-proof-'));
  scratch.push(root);
  const [episode, mediaManifest] = await Promise.all([
    runScriptedBudgetedSealedHoldoutV2R({
      caseId: 'HOLD-05:C1', calls: calls(trackingMode),
    }),
    materializeHoldoutMediaV2R(join(root, 'media')),
  ]);
  return { root, mediaManifest, ...episode };
}

describe('sealed HOLD-05 native tracked-reframe proof V2R', () => {
  it('uses the canonical owner and proves subject/logo geometry over all 450 decoded frames', async () => {
    const result = await setup();
    expect(result.evaluation.assessment).toBe('READY_FOR_PROOF');
    const proof = await proveSealedHoldoutH05NativeOutcomeV2R({
      manifest: result.manifest, caseId: 'HOLD-05:C1', trace: result.trace,
      evaluation: result.evaluation, mediaManifest: result.mediaManifest,
      outputDirectory: join(result.root, 'proof'),
    });
    expect(proof).toMatchObject({
      authority: 'RESEARCH_NATIVE_OWNER_AND_RENDERED_VISUAL_PROXY_NO_PROJECT_MUTATION',
      assessment: 'PASS_RESEARCH_NATIVE_OWNER_AND_RENDERED_VISUAL_PROXY_LIMITED',
      productProjectMutationProof: 'NOT_CLAIMED', stateEffects: [],
      selectedMutation: { operatorId: 'reframe_project', targetAspectRatio: '9:16' },
      sourceObservation: { decodedFrameCount: 450, frozenTrackFrameCount: 5 },
      canonicalOwnerProof: {
        ownerVersion: 'editron-subject-reframe-v2', subjectTrackedOverlayId: 501,
        authoredLayoutOverlayId: 502, targetCanvas: { width: 1080, height: 1920 },
      },
      authoredLayoutProof: {
        relation: 'top-right-5-percent', targetWidth: 54,
        minimumWidthPassed: true,
        assetPixelIdentity: 'NOT_CLAIMED_SYMBOLIC_PROXY_MARKER_ONLY',
      },
      video: {
        codec: 'h264', width: 360, height: 640, averageFrameRate: '30/1',
        decodedFrameCount: 450, audioStreamCount: 0,
      },
      visualProof: { decodedFrameCount: 450 },
      audioProof: 'NO_SOURCE_AUDIO_STREAM_AND_NO_OUTPUT_AUDIO_STREAM',
    });
    expect(proof.sourceObservation.maxFrozenCenterError).toBeLessThanOrEqual(0.02);
    expect(proof.visualProof.minSubjectMarginPx).toBeGreaterThan(0);
    expect(proof.visualProof.maxLogoTopMarginErrorPx).toBeLessThanOrEqual(3);
    expect(proof.visualProof.maxLogoRightMarginErrorPx).toBeLessThanOrEqual(3);
    expect(proof.writerIssuedProjectRevision).toMatch(/^OE-HOLD-/);
  }, 120_000);

  it('rejects a static-center plan even when the structural evaluator considers it ready', async () => {
    const result = await setup('STATIC_CENTER_CROP');
    expect(result.evaluation.assessment).toBe('READY_FOR_PROOF');
    await expect(proveSealedHoldoutH05NativeOutcomeV2R({
      manifest: result.manifest, caseId: 'HOLD-05:C1', trace: result.trace,
      evaluation: result.evaluation, mediaManifest: result.mediaManifest,
      outputDirectory: join(result.root, 'bad-proof'),
    })).rejects.toThrow('SEALED_H05_PROOF_SELECTED_MUTATION_INVALID');
  }, 120_000);

  it('rejects source bytes that no longer match the sealed media identity', async () => {
    const result = await setup();
    const source = result.mediaManifest.artifacts.find(({ assetId }) => assetId === 'h05-subject');
    if (!source) throw new Error('TEST_H05_SOURCE_MISSING');
    const bytes = await readFile(source.artifactPath); bytes[bytes.length - 1] ^= 1;
    await writeFile(source.artifactPath, bytes);
    await expect(proveSealedHoldoutH05NativeOutcomeV2R({
      manifest: result.manifest, caseId: 'HOLD-05:C1', trace: result.trace,
      evaluation: result.evaluation, mediaManifest: result.mediaManifest,
      outputDirectory: join(result.root, 'forged-proof'),
    })).rejects.toThrow('SEALED_MEDIA_ARTIFACT_HASH_DRIFT:h05-subject');
  }, 120_000);
});
