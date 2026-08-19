import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import {
  runV2RBenchmarkCohortV2R,
} from '@/lib/editron/research/open-ended-planner/v2r-benchmark-cohort-v2r';
import type {
  V2RFullEpisodeExecutionV2R,
  V2RFullEpisodeReceiptV2R,
} from '@/lib/editron/research/open-ended-planner/v2r-full-episode-v2r';
import { prepareV2RLiveCohortV2R } from '@/lib/editron/research/open-ended-planner/v2r-live-cohort-v2r';

const roots: string[] = [];
const environment = { OPENAI_API_KEY: 'secret-openai', QWEN_API_KEY: 'secret-qwen' };

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'editron-v2r-cohort-'));
  roots.push(root);
  return root;
}

describe('V2R full benchmark cohort owner', () => {
  it('preflights the exact safe six-case by three-route live cohort', async () => {
    const prepared = await prepareV2RLiveCohortV2R({ environment });
    expect(prepared.preflight.dispatchCount).toBe(18);
    expect(prepared.preflight.routes.map(({ routeId }) => routeId)).toEqual([
      'OPENAI_LUNA', 'OPENAI_TERRA', 'QWEN_3_8_MAX',
    ]);
    expect(prepared.preflight.caseIds).toEqual([
      'DEV-01:BASELINE', 'DEV-01:VISUAL_EVIDENCE_WITHHELD', 'DEV-02:BASELINE',
      'DEV-03:BASELINE', 'DEV-03:BEAT_EVIDENCE_WITHHELD', 'DEV-04:BASELINE',
    ]);
    expect(JSON.stringify(prepared.preflight)).not.toContain('secret-');
  });

  it('runs all 18 full episodes sequentially and scores condition-aware outcomes', async () => {
    const prepared = await prepareV2RLiveCohortV2R({ environment });
    const order: string[] = [];
    let clock = 1_000;
    const runEpisode = vi.fn(async (input) => {
      order.push(`${input.route.routeId}:${input.task.taskId}:${input.task.conditionId}`);
      return fakeEpisode(input, expectedDisposition(input.task.taskId, input.task.conditionId));
    });
    const execution = await runV2RBenchmarkCohortV2R({
      manifest: prepared.manifest, registry: prepared.registry, routes: prepared.routes,
      cohortId: 'cohort-pass', createdAt: '2026-08-19T08:00:00.000Z',
      outputDir: await tempRoot(), nowMs: () => (clock += 10),
      testOnlyRunEpisode: runEpisode,
    });

    expect(runEpisode).toHaveBeenCalledTimes(18);
    expect(order.slice(0, 6).every((entry) => entry.startsWith('OPENAI_LUNA:'))).toBe(true);
    expect(order.slice(6, 12).every((entry) => entry.startsWith('OPENAI_TERRA:'))).toBe(true);
    expect(order.slice(12).every((entry) => entry.startsWith('QWEN_3_8_MAX:'))).toBe(true);
    expect(execution.receipt).toMatchObject({
      runDisposition: 'COMPLETE', actualProviderCostUsd: 0.12,
      providerCostCoverage: 'PARTIAL_UNPRICED_ROUTE',
      stage7Disposition: 'PENDING_NEW_BLIND_REVIEW', stateEffects: [],
    });
    expect(execution.receipt.rows).toHaveLength(18);
    expect(execution.receipt.rows.every(({ assessment }) => assessment === 'EXPECTED_OUTCOME')).toBe(true);
    const { receiptSha256, ...material } = execution.receipt;
    expect(receiptSha256).toBe(hashCanonicalJsonV1(material));
    expect(JSON.parse(await readFile(execution.receiptPath, 'utf8'))).toEqual(execution.receipt);
  });

  it('records a harness error, continues the remaining episodes, and marks cost unverifiable', async () => {
    const prepared = await prepareV2RLiveCohortV2R({ environment });
    let calls = 0;
    const runEpisode = vi.fn(async (input) => {
      calls += 1;
      if (calls === 1) throw new Error('synthetic transport crash');
      return fakeEpisode(input, expectedDisposition(input.task.taskId, input.task.conditionId));
    });
    const execution = await runV2RBenchmarkCohortV2R({
      manifest: prepared.manifest, registry: prepared.registry, routes: prepared.routes,
      cohortId: 'cohort-error', createdAt: '2026-08-19T08:00:00.000Z',
      outputDir: await tempRoot(), testOnlyRunEpisode: runEpisode,
    });
    expect(runEpisode).toHaveBeenCalledTimes(18);
    expect(execution.receipt).toMatchObject({
      runDisposition: 'COMPLETE_WITH_FAILURES', providerCostCoverage: 'PARTIAL_UNVERIFIABLE',
    });
    expect(execution.receipt.rows[0]).toMatchObject({
      actualFinalDisposition: 'HARNESS_ERROR', assessment: 'HARNESS_ERROR',
      actualProviderCostUsd: null, costDisposition: 'UNVERIFIABLE',
    });
  });

  it('rejects an incomplete provider roster before dispatch', async () => {
    const prepared = await prepareV2RLiveCohortV2R({ environment });
    const runEpisode = vi.fn();
    await expect(runV2RBenchmarkCohortV2R({
      manifest: prepared.manifest, registry: prepared.registry,
      routes: prepared.routes.slice(0, 2), cohortId: 'cohort-bad-roster',
      createdAt: '2026-08-19T08:00:00.000Z', outputDir: await tempRoot(),
      testOnlyRunEpisode: runEpisode,
    })).rejects.toThrow('V2R_COHORT_ROUTE_SET_INVALID');
    expect(runEpisode).not.toHaveBeenCalled();
  });
});

function expectedDisposition(taskId: string, conditionId: string):
  V2RFullEpisodeReceiptV2R['finalDisposition'] {
  if (conditionId.includes('WITHHELD')) return 'UNVERIFIABLE';
  if (taskId === 'DEV-02' || taskId === 'DEV-04') return 'CAPABILITY_GAP';
  return 'PROXY_EXECUTED';
}

async function fakeEpisode(
  input: Parameters<NonNullable<Parameters<typeof runV2RBenchmarkCohortV2R>[0]['testOnlyRunEpisode']>>[0],
  finalDisposition: V2RFullEpisodeReceiptV2R['finalDisposition'],
): Promise<V2RFullEpisodeExecutionV2R> {
  await mkdir(input.outputDir, { recursive: true });
  const material = {
    receiptVersion: 'EDITRON_OE_V2R_FULL_EPISODE_RECEIPT_V2' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    executionId: input.executionId, createdAt: input.createdAt,
    taskId: input.task.taskId, conditionId: input.task.conditionId,
    routeId: input.route.routeId, claimedModelIdentity: input.route.claimedModelIdentity,
    preregistrationManifestSha256: (input.manifest as { manifestSha256: string }).manifestSha256,
    connectedEpisodeReceiptHash: 'connected-hash',
    connectedEpisodeReceiptPath: path.join(input.outputDir, 'connected.json'),
    stage5DecisionReceiptSha256: 'stage5-hash',
    stage5Disposition: finalDisposition === 'PROXY_EXECUTED' ? 'PROCEED' as const
      : finalDisposition === 'CAPABILITY_GAP' ? 'CAPABILITY_GAP' as const : 'UNVERIFIABLE' as const,
    stage6: finalDisposition === 'PROXY_EXECUTED'
      ? { attempted: true, executionMode: 'CANONICAL_TASK_ADAPTER' as const, disposition: 'PASS' as const, receiptHash: 'stage6-hash', receiptPath: path.join(input.outputDir, 'stage6.json'), diagnostics: [] }
      : { attempted: false, executionMode: 'NOT_AUTHORIZED' as const, disposition: 'NOT_AUTHORIZED' as const, receiptHash: null, receiptPath: null, diagnostics: [] },
    finalDisposition,
    actualProviderCostUsd: input.route.costBasis === 'USD_METERED' ? 0.01 : 0,
    stateEffects: [] as const,
  };
  const receipt: V2RFullEpisodeReceiptV2R = {
    ...material, receiptSha256: hashCanonicalJsonV1(material),
  };
  const receiptPath = path.join(input.outputDir, `full-${input.executionId}.json`);
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  return { receipt, receiptPath };
}
