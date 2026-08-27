import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { executeStage25Rhc03RenderedHybridProofV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-rhc03-rendered-hybrid-proof-v1';

import { executeLocalH03SandboxContractAdapter }
  from './helpers/sealed-holdout-h03-v3r2-proof-driver';

const SNAPSHOT_ID = 'snap_FuRFrHL9WE4IgNXjhWjMxeWZP9mW';
const SNAPSHOT_COMMIT = 'eb896ffbd8927621a77c4bd4073dad2a1119876d';
const ACTION_SHA256 =
  '7fe82cf9defe10ef19de428cd57592fc7cb0fd1070827ea3ca3a00f210b0bab2';
const scratch: string[] = [];

afterEach(async () => {
  await Promise.all(scratch.splice(0).map(removeVerifiedScratch));
});

describe('Stage 2.5 RHC03 rendered hybrid proof V1', () => {
  it('proves synchronized views, safe label, exact return, and stereo PCM', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'editron-rhc03-live-proof-'),
    );
    scratch.push(root);
    let capturedRequest:
      Parameters<typeof executeLocalH03SandboxContractAdapter>[0]['request']
      | undefined;
    let executions = 0;
    const localSandbox: typeof executeLocalH03SandboxContractAdapter =
      async (options) => {
        executions += 1;
        capturedRequest = options.request;
        return executeLocalH03SandboxContractAdapter(options);
      };
    const result = await executeStage25Rhc03RenderedHybridProofV1({
      outputDirectory: path.join(root, 'proof'),
      executionId: 'rhc03-local-contract-proof',
      createdAt: '2026-08-27T16:00:00.000Z',
      sandboxEnvironment: {
        snapshotId: SNAPSHOT_ID,
        snapshotCommit: SNAPSHOT_COMMIT,
      },
      sandboxExecutor: localSandbox,
    });

    expect(executions).toBe(1);
    expect(capturedRequest?.proofFrames).toEqual([0, 1, 74, 149]);
    expect(capturedRequest?.inputs.map(({ bindingId, kind }) => ({
      bindingId,
      kind,
    }))).toEqual([
      { bindingId: 'rhc03-action-left', kind: 'SOURCE_MEDIA' },
      { bindingId: 'rhc03-action-right', kind: 'SOURCE_MEDIA' },
      { bindingId: 'rhc03-licensed-label', kind: 'FONT' },
    ]);
    const left = capturedRequest?.inputs.find(
      ({ bindingId }) => bindingId === 'rhc03-action-left',
    );
    const right = capturedRequest?.inputs.find(
      ({ bindingId }) => bindingId === 'rhc03-action-right',
    );
    expect(left?.contentSha256).toBe(ACTION_SHA256);
    expect(right?.contentSha256).toBe(ACTION_SHA256);
    expect(left?.data).toBe(right?.data);
    expect(capturedRequest?.inputs.some(({ bindingId }) =>
      bindingId === 'rhc03-authored-wide'
      || bindingId === 'rhc03-production-audio')).toBe(false);
    expect(result.receipt).toMatchObject({
      authority: 'RHC03_RESEARCH_SANDBOX_AND_NATIVE_AV_PROOF_NO_PROJECT_MUTATION',
      taskId: 'RHC-03',
      assessment: 'PASS_TECHNICAL_RENDERED_HYBRID_UNJUDGED',
      humanQuality: 'UNJUDGED',
      stage25Completion: 'NOT_CLAIMED',
      historicalPaidCohortRerun: false,
      providerModelInference: 'NONE',
      projectStateEffects: [],
      frozenTarget: {
        projectRange: { startFrame: 450, endExclusiveFrame: 600 },
        generatedLocalRange: { startFrame: 0, endExclusiveFrame: 150 },
        proofWindow: { startFrame: 420, endExclusiveFrame: 630 },
        returnFrame: { projectFrame: 600, authoredWideSourceFrame: 600 },
      },
      generatedProgram: {
        programId: 'gcp-rhc03-hybrid-v1',
        programSha256:
          '4f782d45f4b04c0c804c1d52093cf7598e7353ff457b40e7f735a5684cba825f',
        sourceBundleSha256:
          '17aa73433e470a138f3127b44b0e5e715cfe58e43e7e4011fdfa2b0513c4fc03',
        exactLabel: 'SYNC',
        nativeWideOrProductionAudioSentToSandbox: false,
      },
      projectServiceProjection: {
        draftSha256:
          '90820c534856ff7e63e49eb5132d98c16903d4beffc57bfe594cfb07fa3df091',
        adapterReceiptSha256:
          'b12cb13694bb3920ef2b3c6516822fbcbddbc5965fca314b3eb8a22b20a35f31',
        lifecycleStage: 'PENDING_PROPOSAL_ONLY',
        canonicalMutationOwnerCalled: false,
      },
      sandboxProof: {
        provider: 'VERCEL_SANDBOX',
        snapshotId: SNAPSHOT_ID,
        snapshotCommit: SNAPSHOT_COMMIT,
        networkPolicy: 'DENY_ALL',
        persistent: false,
        sandboxDeleted: true,
        productionSandbox: 'PASS',
        projectMutation: 'NONE',
      },
      synchronizationProof: {
        independentlyEditableSourceSlots: ['source-left', 'source-right'],
        independentlyAddressedAssets: [
          'rhc03-action-left',
          'rhc03-action-right',
        ],
        sharedTemporalArtifactSha256: ACTION_SHA256,
        localFrameRange: { startFrame: 0, endExclusiveFrame: 150 },
        authoredWideOffsetFrames: 450,
        renderedViewsMateriallyDistinct: true,
        disposition: 'PASS_SAME_ACTION_PHASE_DISTINCT_VIEWS',
      },
      renderedVisualProof: {
        technicalDisposition: 'PASS',
        creativeDisposition: 'UNJUDGED',
        proof: {
          requiredFramesCaptured: 'PASS',
          twoDistinctViewsVisible: 'PASS',
          renderedGlyphBoundsMeasured: 'PASS',
          labelOutsideConservativeSubjectRegions: 'PASS',
          renderedContrast: 'PASS',
          humanAestheticQuality: 'UNJUDGED',
        },
      },
      hybridAvProof: {
        timebaseHandoff: {
          decodedFrameSequenceProof: {
            beforeTarget: { frameCount: 30, equivalence: 'EXACT' },
            generatedIsland: { frameCount: 150, equivalence: 'EXACT' },
            afterTarget: { frameCount: 30, equivalence: 'EXACT' },
          },
          entry: { projectFrame: 450, generatedLocalFrame: 0 },
          exit: { projectFrame: 599, generatedLocalFrame: 149 },
          return: { projectFrame: 600, nativeVisualFrame: 600 },
        },
        audioHandoff: {
          sampleRate: 48_000,
          channels: 2,
          samplesPerFrame: 1_600,
          proofWindowSampleCountPerChannel: 336_000,
          proofWindow: {
            baselineStartFrame: 420,
            baselineEndExclusiveFrame: 630,
            renderedStartFrame: 0,
            renderedEndExclusiveFrame: 210,
            equivalence: 'EXACT',
          },
          targetRange: {
            baselineStartFrame: 450,
            baselineEndExclusiveFrame: 600,
            renderedStartFrame: 30,
            renderedEndExclusiveFrame: 180,
            equivalence: 'EXACT',
          },
          generatedVisualAudioAuthority: 'NONE',
        },
        outputs: {
          proofMaster: {
            video: { codec: 'ffv1', decodedFrameCount: 210 },
            audio: { codec: 'pcm_s16le', sampleRate: 48_000, channels: 2 },
          },
          reviewProxy: {
            video: { codec: 'h264', decodedFrameCount: 210 },
            audio: { codec: 'aac', sampleRate: 48_000, channels: 2 },
          },
        },
        proof: {
          timebase: 'PASS',
          nativeAudioPcmEquivalence: 'PASS',
          entryBoundary: 'PASS',
          exitBoundary: 'PASS',
          returnBoundary: 'PASS',
          outsideTargetUnchanged: 'PASS',
          playableAudioReviewProxy: 'PASS',
          humanQuality: 'UNJUDGED',
        },
      },
      routeDisposition: {
        hybrid: 'TECHNICAL_RENDER_PASS_HUMAN_QUALITY_UNJUDGED',
      },
    });
    expect(result.receipt.renderedVisualProof.measurements).toHaveLength(4);
    for (const measurement of result.receipt.renderedVisualProof.measurements) {
      expect(measurement.detectedBackgroundSrgb).toBe('#05070A');
      expect(measurement.contrastRatio).toBeGreaterThanOrEqual(4.5);
      expect(measurement.glyphBounds.left).toBeGreaterThanOrEqual(864);
      expect(measurement.glyphBounds.right).toBeLessThan(1056);
      expect(measurement.glyphClearanceFromPanelPx).toBeGreaterThanOrEqual(24);
      expect(measurement.distinctViewNormalizedDifference)
        .toBeGreaterThanOrEqual(0.01);
    }
    expect(result.receipt.hybridAvProof.audioHandoff.proofWindow)
      .toMatchObject({ byteLength: 1_344_000 });
    const { receiptSha256, ...receiptMaterial } = result.receipt;
    expect(receiptSha256).toBe(hashCanonicalJsonV1(receiptMaterial));
    await expect(fs.stat(result.hostPaths.hybridMasterPath))
      .resolves.toMatchObject({ size: expect.any(Number) });
    await expect(fs.stat(result.hostPaths.hybridReviewPath))
      .resolves.toMatchObject({ size: expect.any(Number) });
  }, 480_000);

  it('rejects a sandbox snapshot not bound by the accepted qualification', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'editron-rhc03-live-proof-'),
    );
    scratch.push(root);
    await expect(executeStage25Rhc03RenderedHybridProofV1({
      outputDirectory: path.join(root, 'wrong-snapshot'),
      executionId: 'rhc03-wrong-snapshot',
      createdAt: '2026-08-27T16:00:00.000Z',
      sandboxEnvironment: {
        snapshotId: 'snap_wrong',
        snapshotCommit: SNAPSHOT_COMMIT,
      },
      sandboxExecutor: executeLocalH03SandboxContractAdapter,
    })).rejects.toThrow(
      'STAGE25_RHC03_RENDERED_HYBRID_EXECUTION_IDENTITY_INVALID',
    );
    await expect(fs.stat(path.join(root, 'wrong-snapshot'))).rejects.toThrow();
  });
});

async function removeVerifiedScratch(value: string): Promise<void> {
  const resolved = path.resolve(value);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir())
    || !path.basename(resolved).startsWith('editron-rhc03-live-proof-')) {
    throw new Error(`Unsafe RHC03 live-proof scratch: ${resolved}`);
  }
  await fs.rm(resolved, { recursive: true, force: true });
}
