import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { executeStage25Rhc02RenderedHybridProofV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-rhc02-rendered-hybrid-proof-v1';

import { executeLocalH03SandboxContractAdapter }
  from './helpers/sealed-holdout-h03-v3r2-proof-driver';

const SNAPSHOT_ID = 'snap_FuRFrHL9WE4IgNXjhWjMxeWZP9mW';
const SNAPSHOT_COMMIT = 'eb896ffbd8927621a77c4bd4073dad2a1119876d';
const scratch: string[] = [];

afterEach(async () => {
  await Promise.all(scratch.splice(0).map(removeVerifiedScratch));
});

describe('Stage 2.5 RHC02 rendered hybrid proof V1', () => {
  it('binds still-only sandbox rendering to exact native audio and frame handoffs', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-rhc02-live-proof-'));
    scratch.push(root);
    let cached: Awaited<ReturnType<typeof executeLocalH03SandboxContractAdapter>> | undefined;
    let capturedRequest: Parameters<typeof executeLocalH03SandboxContractAdapter>[0]['request'] | undefined;
    let executions = 0;
    const localSandbox: typeof executeLocalH03SandboxContractAdapter = async (options) => {
      executions += 1;
      capturedRequest = options.request;
      cached ??= await executeLocalH03SandboxContractAdapter(options);
      return cached;
    };
    const common = {
      executionId: 'rhc02-local-contract-proof',
      createdAt: '2026-08-27T12:00:00.000Z',
      sandboxEnvironment: {
        snapshotId: SNAPSHOT_ID,
        snapshotCommit: SNAPSHOT_COMMIT,
      },
      sandboxExecutor: localSandbox,
    } as const;
    const result = await executeStage25Rhc02RenderedHybridProofV1({
      ...common,
      outputDirectory: path.join(root, 'proof'),
    });

    expect(executions).toBe(1);
    expect(capturedRequest?.inputs.map(({ bindingId, kind }) => ({ bindingId, kind })))
      .toEqual([
        { bindingId: 'rhc02-still-a', kind: 'SOURCE_MEDIA' },
        { bindingId: 'rhc02-still-b', kind: 'SOURCE_MEDIA' },
        { bindingId: 'rhc02-licensed-title', kind: 'FONT' },
      ]);
    expect(capturedRequest?.inputs.some(({ bindingId }) =>
      bindingId === 'rhc02-interview' || bindingId === 'rhc02-room-tone')).toBe(false);
    expect(result.receipt).toMatchObject({
      authority: 'RHC02_RESEARCH_SANDBOX_AND_NATIVE_AV_PROOF_NO_PROJECT_MUTATION',
      taskId: 'RHC-02',
      assessment: 'PASS_TECHNICAL_RENDERED_HYBRID_UNJUDGED',
      humanQuality: 'UNJUDGED',
      stage25Completion: 'NOT_CLAIMED',
      historicalPaidCohortRerun: false,
      providerModelInference: 'NONE',
      projectStateEffects: [],
      generatedProgram: {
        programId: 'gcp-rhc02-hybrid-v2',
        programSha256: 'e9eccd5ce966de6924ec9b2c1936214e5bbc52f6a0eff0594fe44c603f399852',
        sourceBundleSha256: 'ba1ec8f349a652e829faf1d6d2fd6d8837f0875b03b1ae9836f041d7dfa445c3',
        exactTitle: 'How we shipped it',
        nativeInterviewOrAudioSentToSandbox: false,
      },
      projectServiceProjection: {
        draftSha256: 'f0eb5a241cf52728b71b3229295f30fa349b94bbf82dbd9d2da4e9d5cb92843e',
        adapterReceiptSha256: '2a18583574f189ab2fe31b2b5f177f07d724a3ece460a2fa3ca0f449db288a3d',
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
      routeDisposition: {
        hybrid: 'TECHNICAL_RENDER_PASS_HUMAN_QUALITY_UNJUDGED',
      },
      hybridAvProof: {
        timebaseHandoff: {
          decodedFrameSequenceProof: {
            beforeTarget: { frameCount: 300, equivalence: 'EXACT' },
            generatedIsland: { frameCount: 90, equivalence: 'EXACT' },
            afterTarget: { frameCount: 60, equivalence: 'EXACT' },
          },
          entry: { projectFrame: 300, generatedLocalFrame: 0 },
          exit: { projectFrame: 389, generatedLocalFrame: 89 },
          return: { projectFrame: 390, interviewSourceFrame: 390 },
        },
        audioHandoff: {
          sampleRate: 48_000,
          channels: 1,
          sampleCount: 720_000,
          fullTimelineEquivalence: 'EXACT',
          proofWindow: { startFrame: 270, endExclusiveFrame: 420, equivalence: 'EXACT' },
          targetRange: { startFrame: 300, endExclusiveFrame: 390, equivalence: 'EXACT' },
          generatedVisualAudioAuthority: 'NONE',
        },
        outputs: {
          proofMaster: {
            video: { codec: 'ffv1', decodedFrameCount: 450 },
            audio: { codec: 'pcm_s16le', sampleRate: 48_000, channels: 1 },
          },
          reviewProxy: {
            video: { codec: 'h264', decodedFrameCount: 450 },
            audio: { codec: 'aac', sampleRate: 48_000, channels: 1 },
          },
        },
        proof: {
          timebase: 'PASS',
          nativeAudioPcmEquivalence: 'PASS',
          entryBoundary: 'PASS',
          exitBoundary: 'PASS',
          outsideTargetUnchanged: 'PASS',
          playableAudioReviewProxy: 'PASS',
          humanQuality: 'UNJUDGED',
        },
      },
    });
    expect(result.receipt.hybridAvProof.audioHandoff.baselinePcmSha256)
      .toBe(result.receipt.hybridAvProof.audioHandoff.renderedMasterPcmSha256);
    const { receiptSha256, ...receiptMaterial } = result.receipt;
    expect(receiptSha256).toBe(hashCanonicalJsonV1(receiptMaterial));
    await expect(fs.stat(result.hostPaths.hybridMasterPath))
      .resolves.toMatchObject({ size: expect.any(Number) });
    await expect(fs.stat(result.hostPaths.hybridReviewPath))
      .resolves.toMatchObject({ size: expect.any(Number) });

    const forgedHostExecutor: typeof executeLocalH03SandboxContractAdapter = async () => {
      const forged = structuredClone(cached!);
      (forged.receipt as { receiptHash: string }).receiptHash = 'f'.repeat(64);
      return forged;
    };
    await expect(executeStage25Rhc02RenderedHybridProofV1({
      ...common,
      outputDirectory: path.join(root, 'forged-host'),
      sandboxExecutor: forgedHostExecutor,
    })).rejects.toThrow('STAGE25_RHC02_RENDERED_HYBRID_SANDBOX_ATTESTATION_DRIFT');
  }, 360_000);

  it('rejects any snapshot identity not bound by the accepted qualification', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'editron-rhc02-live-proof-'));
    scratch.push(root);
    await expect(executeStage25Rhc02RenderedHybridProofV1({
      outputDirectory: path.join(root, 'wrong-snapshot'),
      executionId: 'rhc02-wrong-snapshot',
      createdAt: '2026-08-27T12:00:00.000Z',
      sandboxEnvironment: {
        snapshotId: 'snap_wrong',
        snapshotCommit: SNAPSHOT_COMMIT,
      },
      sandboxExecutor: executeLocalH03SandboxContractAdapter,
    })).rejects.toThrow('STAGE25_RHC02_RENDERED_HYBRID_EXECUTION_IDENTITY_INVALID');
    await expect(fs.stat(path.join(root, 'wrong-snapshot'))).rejects.toThrow();
  });
});

async function removeVerifiedScratch(value: string): Promise<void> {
  const resolved = path.resolve(value);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir())
    || !path.basename(resolved).startsWith('editron-rhc02-live-proof-')) {
    throw new Error(`Unsafe RHC02 live-proof scratch: ${resolved}`);
  }
  await fs.rm(resolved, { recursive: true, force: true });
}
