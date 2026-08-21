import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { materializeHoldoutMediaV2R }
  from '@/lib/editron/research/open-ended-planner/holdout-media-materializer-v2r';
import { proveSealedHoldoutH04NativeOutcomeV2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h04-native-proof-v2r';

import {
  finishSealedHoldoutScriptV2R,
  runScriptedBudgetedSealedHoldoutV2R,
  type SealedHoldoutScriptedCallV2R,
} from './helpers/sealed-holdout-v2r-test-driver';

const scratch: string[] = [];
afterEach(async () => {
  await Promise.all(scratch.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function calls(input: {
  cutRange?: Readonly<{ startFrame: number; endFrame: number }>;
  includeCaptionEvidence?: boolean;
} = {}): readonly SealedHoldoutScriptedCallV2R[] {
  const evidenceIds = input.includeCaptionEvidence === false ? ['E1'] : ['E1', 'E2'];
  return [
    { name: 'get_video_transcription', arguments: {
      projectId: 'oe-hold-04', assetId: 'h04-host',
    } },
    ...(input.includeCaptionEvidence === false ? [] : [{
      name: 'get_timeline_view', arguments: {
        projectId: 'oe-hold-04', expectedProjectRevision: 'R6',
      },
    }]),
    { name: 'cut_section', arguments: {
      projectId: 'oe-hold-04', expectedProjectRevision: 'R6',
      targetRange: input.cutRange ?? { startFrame: 120, endFrame: 225 },
      evidenceIds,
      constraints: {
        retainOccurrence: 'SECOND', preserveCaptionPresentation: true,
      },
    } },
    finishSealedHoldoutScriptV2R('READY_FOR_PROOF', evidenceIds),
  ];
}

async function setup(input?: Parameters<typeof calls>[0]) {
  const root = await mkdtemp(join(tmpdir(), 'editron-h04-proof-'));
  scratch.push(root);
  const [episode, mediaManifest] = await Promise.all([
    runScriptedBudgetedSealedHoldoutV2R({ caseId: 'HOLD-04:C1', calls: calls(input) }),
    materializeHoldoutMediaV2R(join(root, 'media')),
  ]);
  return { root, mediaManifest, ...episode };
}

describe('sealed HOLD-04 native cut and caption-preservation proof V2R', () => {
  it('uses the canonical cut owner to retain one clean take and preserve caption form', async () => {
    const result = await setup();
    const proof = await proveSealedHoldoutH04NativeOutcomeV2R({
      manifest: result.manifest, caseId: 'HOLD-04:C1', trace: result.trace,
      evaluation: result.evaluation, mediaManifest: result.mediaManifest,
      outputDirectory: join(result.root, 'proof'),
    });
    expect(proof).toMatchObject({
      authority: 'RESEARCH_NATIVE_OWNER_AND_RENDERED_AV_PROXY_NO_PROJECT_MUTATION',
      assessment: 'PASS_RESEARCH_NATIVE_OWNER_AND_RENDERED_AV_PROXY',
      productProjectMutationProof: 'NOT_CLAIMED', stateEffects: [],
      selectedMutation: {
        operatorId: 'cut_section', removedRange: { startFrame: 120, endFrame: 225 },
      },
      canonicalOwnerProof: {
        beforeDurationInFrames: 540, afterDurationInFrames: 435,
        rightSourceStartFrame: 225, retainedCaptionText: 'our launch is Friday',
        retainedCaptionOccurrences: 1,
      },
      video: {
        codec: 'h264', width: 640, height: 360, averageFrameRate: '30/1',
        decodedFrameCount: 435, audioStreamCount: 1,
      },
      audio: { codec: 'aac', sampleRate: 48000, channels: 1 },
      captionPixelProof: 'NOT_RENDERED_FIXTURE_HAS_NO_BOUND_CAPTION_PIXEL_FORM',
      speechIntelligibilityProof: 'NOT_CLAIMED_SYNTHETIC_TONE_ONLY',
    });
    expect(proof.canonicalOwnerProof.presentationMaterialSha256After)
      .toBe(proof.canonicalOwnerProof.presentationMaterialSha256Before);
    expect(proof.audio.retainedTakeMeanAbsolutePcm)
      .toBeGreaterThan(proof.audio.precedingQuietMeanAbsolutePcm * 10);
    expect(proof.audio.retainedTakeMeanAbsolutePcm)
      .toBeGreaterThan(proof.audio.followingQuietMeanAbsolutePcm * 10);
    expect(proof.visualTakeProof.greenPixelsAtStart).toBeGreaterThan(1_000);
    expect(proof.visualTakeProof.greenPixelsBefore).toBeLessThanOrEqual(50);
  }, 60_000);

  it('rejects a range that leaves part of the authored pause in the output', async () => {
    const result = await setup({ cutRange: { startFrame: 120, endFrame: 224 } });
    expect(result.evaluation.assessment).toBe('FAIL');
    await expect(proveSealedHoldoutH04NativeOutcomeV2R({
      manifest: result.manifest, caseId: 'HOLD-04:C1', trace: result.trace,
      evaluation: result.evaluation, mediaManifest: result.mediaManifest,
      outputDirectory: join(result.root, 'bad-range-proof'),
    })).rejects.toThrow('SEALED_PROOF_INPUT_PRECONDITION_FAILED');
  }, 60_000);

  it('rejects a cut that never resolved the existing caption state', async () => {
    const result = await setup({ includeCaptionEvidence: false });
    expect(result.evaluation.assessment).toBe('FAIL');
    await expect(proveSealedHoldoutH04NativeOutcomeV2R({
      manifest: result.manifest, caseId: 'HOLD-04:C1', trace: result.trace,
      evaluation: result.evaluation, mediaManifest: result.mediaManifest,
      outputDirectory: join(result.root, 'missing-caption-proof'),
    })).rejects.toThrow('SEALED_PROOF_INPUT_PRECONDITION_FAILED');
  }, 60_000);
});
