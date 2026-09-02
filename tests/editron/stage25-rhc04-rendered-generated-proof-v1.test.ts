import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 }
  from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { executeStage25Rhc04RenderedGeneratedProofV1 }
  from '@/lib/editron/research/open-ended-planner/stage25-rhc04-rendered-generated-proof-v1';

import { executeLocalH03SandboxContractAdapter }
  from './helpers/sealed-holdout-h03-v3r2-proof-driver';

const SNAPSHOT_ID = 'snap_FuRFrHL9WE4IgNXjhWjMxeWZP9mW';
const SNAPSHOT_COMMIT = 'eb896ffbd8927621a77c4bd4073dad2a1119876d';
const INITIAL_PROGRAM_SHA256 =
  '97c8fe0a5f7a9a46b7c43f3d38c7961a36eaedb27302297961f801d60858808a';
const CORRECTED_PROGRAM_SHA256 =
  'c34472f796e3a26fca97d1bb6ff0ba358e98e99567e63f2a3309800bb72419ff';
const scratch: string[] = [];

afterEach(async () => {
  await Promise.all(scratch.splice(0).map(removeVerifiedScratch));
});

describe('Stage 2.5 RHC04 rendered generated correction proof V1', () => {
  it('renders both versions and proves a bounded, stale-safe correction', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'editron-rhc04-live-proof-'),
    );
    scratch.push(root);
    const capturedRequests: Array<
      Parameters<typeof executeLocalH03SandboxContractAdapter>[0]['request']
    > = [];
    const localSandbox: typeof executeLocalH03SandboxContractAdapter =
      async (options) => {
        capturedRequests.push(options.request);
        return executeLocalH03SandboxContractAdapter(options);
      };
    const result = await executeStage25Rhc04RenderedGeneratedProofV1({
      outputDirectory: path.join(root, 'proof'),
      executionId: 'rhc04-local-contract-proof',
      createdAt: '2026-08-27T18:00:00.000Z',
      sandboxEnvironment: {
        snapshotId: SNAPSHOT_ID,
        snapshotCommit: SNAPSHOT_COMMIT,
      },
      sandboxExecutor: localSandbox,
    });

    expect(capturedRequests).toHaveLength(2);
    expect(capturedRequests.map(({ programHash, proofFrames }) => ({
      programHash,
      proofFrames,
    }))).toEqual([
      {
        programHash: INITIAL_PROGRAM_SHA256,
        proofFrames: [0, 44, 45, 89, 90, 104, 105, 179],
      },
      {
        programHash: CORRECTED_PROGRAM_SHA256,
        proofFrames: [0, 44, 45, 89, 90, 104, 105, 179],
      },
    ]);
    expect(inputBindings(capturedRequests[0]!)).toEqual([
      ['rhc04-closeup-60', 'SOURCE_MEDIA'],
      ['rhc04-closeup-30', 'SOURCE_MEDIA'],
      ['rhc04-closeup-10', 'SOURCE_MEDIA'],
      ['rhc04-licensed-numerals', 'FONT'],
    ]);
    expect(inputBindings(capturedRequests[1]!)).toEqual([
      ['rhc04-closeup-60', 'SOURCE_MEDIA'],
      ['rhc04-correction-source', 'SOURCE_MEDIA'],
      ['rhc04-closeup-10', 'SOURCE_MEDIA'],
      ['rhc04-licensed-numerals', 'FONT'],
    ]);
    expect(result.receipt).toMatchObject({
      authority:
        'RHC04_RESEARCH_DUAL_SANDBOX_AND_ISOLATED_PROPOSAL_PROOF_NO_CANONICAL_MUTATION',
      taskId: 'RHC-04',
      assessment: 'PASS_TECHNICAL_RENDERED_GENERATED_CORRECTION_UNJUDGED',
      historicalPaidCohortRerun: false,
      providerModelInference: 'NONE',
      humanQuality: 'UNJUDGED',
      stage25Completion: 'NOT_CLAIMED',
      canonicalProjectMutationWrites: 0,
      projectStateEffects: [],
      generatedPrograms: {
        initial: { programSha256: INITIAL_PROGRAM_SHA256 },
        corrected: { programSha256: CORRECTED_PROGRAM_SHA256 },
        sourceBundleExactAcrossCorrection: true,
        sourceBundleRegeneratedForCorrection: false,
        mediaRegeneratedForCorrection: false,
        declaredCorrectionScope: {
          changedSourceSlotIds: ['source-middle'],
          changedControlIds: ['param-number-middle', 'param-final-hold'],
          unchangedControlIds: ['param-number-60', 'param-number-10'],
          unchangedSourceSlotIds: ['source-60', 'source-10'],
        },
      },
      sandboxProof: {
        initial: {
          provider: 'VERCEL_SANDBOX',
          snapshotId: SNAPSHOT_ID,
          snapshotCommit: SNAPSHOT_COMMIT,
          networkPolicy: 'DENY_ALL',
          persistent: false,
          sandboxDeleted: true,
          productionSandbox: 'PASS',
          projectMutation: 'NONE',
        },
        corrected: {
          provider: 'VERCEL_SANDBOX',
          snapshotId: SNAPSHOT_ID,
          snapshotCommit: SNAPSHOT_COMMIT,
          networkPolicy: 'DENY_ALL',
          persistent: false,
          sandboxDeleted: true,
          productionSandbox: 'PASS',
          projectMutation: 'NONE',
        },
      },
      renderedCorrectionProof: {
        technicalDisposition: 'PASS',
        creativeDisposition: 'UNJUDGED',
        proof: {
          requiredBoundaryFramesCaptured: 'PASS',
          unrelated60StateExactAcrossCorrection: 'PASS',
          overlappingFinal10StateExactAcrossCorrection: 'PASS',
          declaredCorrectionRegionChanged: 'PASS',
          humanAestheticQuality: 'UNJUDGED',
        },
      },
      projectServiceProposalProof: {
        initialInsert: {
          disposition: 'OK',
          changedPaths: ['$.generatedCompositions[0]'],
        },
        passingInitialStateProjection: {
          disposition: 'SCHEMA_VALID_PASSING_STATE_PROJECTION',
          canonicalFinalizerCalled: false,
          canonicalPromotionClaimed: false,
        },
        staleRevise: {
          disposition: 'CONFLICT',
          code:
            'PROJECTSERVICE_ISOLATED_GENERATED_COMPOSITION_BASE_STATE_CONFLICT',
          workingStateUnchanged: true,
        },
        exactBaseRevise: {
          disposition: 'OK',
          activeInitialStatePreservedExactly: true,
          correctionScope: {
            changedSourceSlotIds: ['source-middle'],
            changedControlIds: ['param-number-middle', 'param-final-hold'],
          },
        },
        passingCorrectedStateProjection: {
          disposition: 'SCHEMA_VALID_PASSING_STATE_PROJECTION',
          canonicalFinalizerCalled: false,
          canonicalPromotionClaimed: false,
        },
        canonicalSnapshots: {
          initialCanonicalUnchanged: true,
          correctionCanonicalUnchanged: true,
          canonicalMutationOwnerCalled: false,
          canonicalMutationWrites: 0,
        },
        lifecycleCeiling:
          'ISOLATED_INSERT_AND_REVISE_PROVED_CANONICAL_PREPARE_FINALIZE_NOT_CALLED',
      },
      correctionMeasurement: {
        humanHandsOnCorrectionTime: 'PENDING_MEASURED_HANDS_ON_SESSION',
        providerExecutionCost:
          'UNVERIFIABLE_PROVIDER_BILLING_NOT_EXPOSED_BY_EXECUTION_RECEIPT',
      },
      routeDisposition: {
        native: 'CAPABILITY_GAP_EXACT_PRODUCT_FONT_BINDING_UNPROVED',
        generatedOnly:
          'TECHNICAL_INITIAL_AND_CORRECTED_RENDER_PASS_HUMAN_QUALITY_UNJUDGED',
        hybrid: 'NOT_APPLICABLE_NO_DISTINCT_NATIVE_CONTRIBUTION',
      },
    });
    expect(result.receipt.renderedCorrectionProof.measurements).toHaveLength(16);
    expect(result.receipt.renderedCorrectionProof.frameIdentity).toMatchObject({
      exactAcrossCorrectionFrames: [0, 44, 105, 179],
      changedAcrossCorrectionFrames: [45, 89, 90, 104],
    });
    const { receiptSha256, ...receiptMaterial } = result.receipt;
    expect(receiptSha256).toBe(hashCanonicalJsonV1(receiptMaterial));
    await expect(fs.stat(result.hostPaths.initialPlayablePath))
      .resolves.toMatchObject({ size: expect.any(Number) });
    await expect(fs.stat(result.hostPaths.correctedPlayablePath))
      .resolves.toMatchObject({ size: expect.any(Number) });
  }, 600_000);

  it('rejects a sandbox snapshot outside the accepted qualification', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'editron-rhc04-live-proof-'),
    );
    scratch.push(root);
    await expect(executeStage25Rhc04RenderedGeneratedProofV1({
      outputDirectory: path.join(root, 'wrong-snapshot'),
      executionId: 'rhc04-wrong-snapshot',
      createdAt: '2026-08-27T18:00:00.000Z',
      sandboxEnvironment: {
        snapshotId: 'snap_wrong',
        snapshotCommit: SNAPSHOT_COMMIT,
      },
      sandboxExecutor: executeLocalH03SandboxContractAdapter,
    })).rejects.toThrow(
      'STAGE25_RHC04_RENDERED_GENERATED_EXECUTION_IDENTITY_INVALID',
    );
    await expect(fs.stat(path.join(root, 'wrong-snapshot'))).rejects.toThrow();
  });
});

function inputBindings(request: Readonly<{
  inputs: readonly Readonly<{ bindingId: string; kind: string }>[];
}>) {
  return request.inputs.map(({ bindingId, kind }) => [bindingId, kind]);
}

async function removeVerifiedScratch(value: string): Promise<void> {
  const resolved = path.resolve(value);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir())
    || !path.basename(resolved).startsWith('editron-rhc04-live-proof-')) {
    throw new Error(`Unsafe RHC04 live-proof scratch: ${resolved}`);
  }
  await fs.rm(resolved, { recursive: true, force: true });
}
