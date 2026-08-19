import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { getCanonicalDev01Stage123V2 } from '@/lib/editron/research/open-ended-planner/dev01-stage123-canonical-v2';
import { DEV01_LOWERING_POLICY_V2R } from '@/lib/editron/research/open-ended-planner/dev01-lowering-policy-v2r';
import type { GenericLoweringResultV2R } from '@/lib/editron/research/open-ended-planner/generic-lowerer-v2r';
import type { ProviderStageRunV2 } from '@/lib/editron/research/open-ended-planner/provider-transport-v2';
import { buildDev01TruthfulStageOneTextPacketV2 } from '@/lib/editron/research/open-ended-planner/staged-packet-v2';
import type { V2RConnectedRouteV2, V2RConnectedTaskV2 } from '@/lib/editron/research/open-ended-planner/v2r-connected-episode-v2r';
import { runV2RFullEpisodeV2R } from '@/lib/editron/research/open-ended-planner/v2r-full-episode-v2r';
import { buildV2RPreregistrationManifest } from '@/lib/editron/research/open-ended-planner/v2r-preregistration-manifest';

type JsonRecord = Record<string, unknown>;
const canonical = getCanonicalDev01Stage123V2();
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function task(
  conditionId: 'BASELINE' | 'VISUAL_EVIDENCE_WITHHELD' = 'BASELINE',
): V2RConnectedTaskV2 {
  return {
    taskId: 'DEV-01', conditionId, executionFormArm: 'FORCED_NATIVE',
    stageOnePacket: buildDev01TruthfulStageOneTextPacketV2(conditionId),
    evidencePack: canonical.evidencePacks[conditionId],
    loweringPolicy: DEV01_LOWERING_POLICY_V2R,
  };
}

function route(conditionId: 'BASELINE' | 'VISUAL_EVIDENCE_WITHHELD'): V2RConnectedRouteV2 {
  const artifacts = [
    canonical.referenceBlueprints[conditionId] as JsonRecord,
    canonical.editorialIntentV2R as JsonRecord,
    canonical.evidenceBoundIntentsV2R[conditionId] as JsonRecord,
  ];
  let call = 0;
  return {
    routeId: 'OPENAI_LUNA', claimedModelIdentity: 'gpt-5.6-luna',
    costBasis: 'USD_METERED',
    runStage: async (packet) => {
      const artifact = artifacts[call++];
      return {
        runVersion: 'EDITRON_OE_PROVIDER_STAGE_RUN_V2',
        authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION', packetHash: packet.packetHash,
        disposition: artifact ? 'ARTIFACT_ACCEPTED' : 'PROVIDER_TIMEOUT', attempts: [],
        ...(artifact ? { artifact } : {}),
      } as ProviderStageRunV2;
    },
  };
}

async function outputDir(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'editron-v2r-full-'));
  roots.push(root);
  return root;
}

function stage6Receipt(input: {
  taskId: string;
  lowering: Readonly<GenericLoweringResultV2R>;
  outputDir: string;
  proofPass?: boolean;
}): { receipt: Readonly<JsonRecord>; receiptPath: string } {
  const pass = input.proofPass !== false;
  const material = {
    authority: 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION',
    taskId: input.taskId,
    loweredGraphHash: hashCanonicalJsonV1(input.lowering.compiled),
    fullProjectExecutionEligibility: 'NOT_EXECUTABLE',
    stateEffects: [],
    operations: input.lowering.compiledOperatorIds.map((operatorId) => ({ operatorId })),
    proof: {
      state: pass ? 'PASS' : 'FAIL', renderedVisual: pass ? 'PASS' : 'FAIL',
      renderedAudio: pass ? 'PASS' : 'FAIL', projectMutation: 'NONE',
    },
    renderProofValidation: {
      assessment: pass ? 'PASS' : 'FAIL', renderedVisual: pass ? 'PASS' : 'FAIL',
      renderedAudio: pass ? 'PASS' : 'FAIL',
    },
  };
  return {
    receipt: { ...material, receiptHash: hashCanonicalJsonV1(material) },
    receiptPath: path.join(input.outputDir, 'test-double-stage6.json'),
  };
}

describe('V2R full connected episode runner', () => {
  it('binds Stage 1-6 into one immutable receipt without claiming a test double is production proof', async () => {
    const root = await outputDir();
    const execution = await runV2RFullEpisodeV2R({
      manifest: buildV2RPreregistrationManifest(), task: task(), route: route('BASELINE'),
      executionId: 'dev01-luna-test-001', createdAt: '2026-08-19T00:00:00.000Z',
      outputDir: root,
      testOnlyStage6Executor: async (input) => stage6Receipt(input),
    });

    expect(execution.receipt).toMatchObject({
      stage5Disposition: 'PROCEED', finalDisposition: 'PROXY_EXECUTED_TEST_DOUBLE',
      stage6: { attempted: true, executionMode: 'TEST_DOUBLE', disposition: 'PASS' },
      stateEffects: [],
    });
    expect(execution.receipt.finalDisposition).not.toBe('PROXY_EXECUTED');
    const { receiptSha256, ...material } = execution.receipt;
    expect(receiptSha256).toBe(hashCanonicalJsonV1(material));
    expect(JSON.parse(await readFile(execution.receiptPath, 'utf8'))).toEqual(execution.receipt);
    const connectedEpisode = JSON.parse(
      await readFile(execution.receipt.connectedEpisodeReceiptPath, 'utf8'),
    ) as { receiptHash: string; rows: unknown[] };
    expect(connectedEpisode.receiptHash).toBe(execution.receipt.connectedEpisodeReceiptHash);
    expect(connectedEpisode.rows).toHaveLength(3);
    expect(Object.isFrozen(execution.receipt)).toBe(true);
  });

  it('does not call Stage 6 when evidence is intentionally withheld', async () => {
    const executor = vi.fn(async (input: Parameters<typeof stage6Receipt>[0]) => stage6Receipt(input));
    const execution = await runV2RFullEpisodeV2R({
      manifest: buildV2RPreregistrationManifest(),
      task: task('VISUAL_EVIDENCE_WITHHELD'), route: route('VISUAL_EVIDENCE_WITHHELD'),
      executionId: 'dev01-withheld-001', createdAt: '2026-08-19T00:00:00.000Z',
      outputDir: await outputDir(), testOnlyStage6Executor: executor,
    });

    expect(executor).not.toHaveBeenCalled();
    expect(execution.receipt).toMatchObject({
      stage5Disposition: 'UNVERIFIABLE', finalDisposition: 'UNVERIFIABLE',
      stage6: { attempted: false, disposition: 'NOT_AUTHORIZED' },
    });
  });

  it('records failed Stage-6 proof as failure instead of success', async () => {
    const execution = await runV2RFullEpisodeV2R({
      manifest: buildV2RPreregistrationManifest(), task: task(), route: route('BASELINE'),
      executionId: 'dev01-bad-proof-001', createdAt: '2026-08-19T00:00:00.000Z',
      outputDir: await outputDir(),
      testOnlyStage6Executor: async (input) => stage6Receipt({ ...input, proofPass: false }),
    });

    expect(execution.receipt).toMatchObject({
      stage5Disposition: 'PROCEED', finalDisposition: 'STAGE6_FAILED',
      stage6: { attempted: true, disposition: 'FAIL' },
    });
    expect(execution.receipt.stage6.diagnostics).toEqual(expect.arrayContaining([
      'STAGE6_PROOF_NOT_PASS', 'STAGE6_RENDER_VALIDATION_NOT_PASS',
    ]));
  });

  it('rejects unsafe execution identities before provider dispatch', async () => {
    const provider = route('BASELINE');
    const runStage = vi.spyOn(provider, 'runStage');
    await expect(runV2RFullEpisodeV2R({
      manifest: buildV2RPreregistrationManifest(), task: task(), route: provider,
      executionId: '../escape', createdAt: '2026-08-19T00:00:00.000Z',
      outputDir: await outputDir(),
    })).rejects.toThrow('V2R_FULL_EPISODE_EXECUTION_ID_INVALID');
    expect(runStage).not.toHaveBeenCalled();
  });
});
