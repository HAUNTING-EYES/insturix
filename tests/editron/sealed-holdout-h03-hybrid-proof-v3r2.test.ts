import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  proveSealedHoldoutH03HybridOutcomeV3R2,
} from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-hybrid-proof-v3r2';
import { SEALED_H03_GENERATED_SOURCE_V2R }
  from '@/lib/editron/research/open-ended-planner/sealed-holdout-h03-generated-program-v2r';

import {
  executeLocalH03SandboxContractAdapter,
  H03_TEST_SNAPSHOT_COMMIT,
  H03_TEST_SNAPSHOT_ID,
  prepareSealedH03V3R2ProofFixture,
} from './helpers/sealed-holdout-h03-v3r2-proof-driver';

const scratch: string[] = [];

afterEach(async () => {
  await Promise.all(scratch.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })));
});

describe('sealed HOLD-03 exact model-source sandbox proof V3R2', () => {
  it('binds the accepted source through host attestation and decoded hybrid proof', async () => {
    const root = await mkdtemp(join(tmpdir(), 'editron-h03-v3r2-proof-'));
    scratch.push(root);
    const fixture = await prepareSealedH03V3R2ProofFixture(root);
    let cached: Awaited<ReturnType<typeof executeLocalH03SandboxContractAdapter>> | undefined;
    let executions = 0;
    const cachedExecutor: typeof executeLocalH03SandboxContractAdapter = async (options) => {
      executions += 1;
      cached ??= await executeLocalH03SandboxContractAdapter(options);
      return cached;
    };
    const common = {
      manifest: fixture.manifest,
      caseId: 'HOLD-03:C1' as const,
      connectedEpisode: fixture.connected,
      trace: fixture.trace,
      evaluation: fixture.evaluation,
      mediaManifest: fixture.mediaManifest,
      executionId: 'h03-v3r2-contract-test',
      createdAt: '2026-08-22T06:00:00.000Z',
      sandboxEnvironment: {
        snapshotId: H03_TEST_SNAPSHOT_ID,
        snapshotCommit: H03_TEST_SNAPSHOT_COMMIT,
      },
    };
    const proof = await proveSealedHoldoutH03HybridOutcomeV3R2({
      ...common,
      outputDirectory: join(root, 'proof'),
      sandboxExecutor: cachedExecutor,
    });
    expect(proof).toMatchObject({
      authority: 'RESEARCH_MODEL_SOURCE_SANDBOX_RENDERED_HYBRID_PROXY_NO_PROJECT_MUTATION',
      assessment: 'PASS_RESEARCH_MODEL_SOURCE_SANDBOX_RENDERED_HYBRID_PROXY',
      stateEffects: [],
      generatedSourceLineage: {
        candidateOrdinal: 0,
        modelId: 'contract-test-model',
      },
      sandboxProof: {
        provider: 'VERCEL_SANDBOX',
        snapshotId: H03_TEST_SNAPSHOT_ID,
        appCommit: H03_TEST_SNAPSHOT_COMMIT,
        networkPolicy: 'DENY_ALL',
        persistent: false,
        sandboxDeleted: true,
        productionSandbox: 'PASS',
        projectMutation: 'NONE',
      },
      generatedIsland: {
        projectRange: { startFrame: 90, endFrame: 270 },
        layout: {
          detectedPanelCount: 6,
          sourcePanelTitleFootprintIntersectionPixels: 0,
        },
        referenceAssetRendered: false,
      },
      nativeSurround: {
        structuralOutsideRangeDisposition:
          'SAME_SOURCE_VERSION_AND_RANGES_NO_PROJECT_MUTATION',
      },
      video: {
        codec: 'h264',
        width: 360,
        height: 640,
        averageFrameRate: '30/1',
        decodedFrameCount: 420,
        audioStreamCount: 0,
      },
    });
    expect(JSON.stringify(proof)).not.toContain(
      SEALED_H03_GENERATED_SOURCE_V2R.slice(0, 80),
    );
    expect(proof.generatedIsland.layout.minimumPanelFillRatio)
      .toBeGreaterThanOrEqual(0.82);
    expect(proof.generatedIsland.motion.entryEdgeLumaDelta).toBeGreaterThanOrEqual(20);
    expect(proof.generatedIsland.motion.exitEdgeLumaDelta).toBeGreaterThanOrEqual(20);
    expect(proof.nativeSurround.returnFrame270MeanAbsoluteRgbError).toBeLessThanOrEqual(6);
    expect(executions).toBe(1);

    const staleEvaluation = structuredClone(fixture.evaluation) as any;
    staleEvaluation.receiptSha256 = 'f'.repeat(64);
    await expect(proveSealedHoldoutH03HybridOutcomeV3R2({
      ...common,
      evaluation: staleEvaluation,
      outputDirectory: join(root, 'stale-evaluation'),
      sandboxExecutor: cachedExecutor,
    })).rejects.toThrow('SEALED_V3R2_H03_PROOF_EVALUATION_DRIFT');
    expect(executions).toBe(1);

    const forgedHostExecutor: typeof executeLocalH03SandboxContractAdapter = async () => {
      const forged = structuredClone(cached) as any;
      forged.receipt.receiptHash = 'e'.repeat(64);
      return forged;
    };
    await expect(proveSealedHoldoutH03HybridOutcomeV3R2({
      ...common,
      outputDirectory: join(root, 'forged-host'),
      sandboxExecutor: forgedHostExecutor,
    })).rejects.toThrow('SEALED_V3R2_H03_PROOF_SANDBOX_ATTESTATION_DRIFT');
  }, 240_000);
});
