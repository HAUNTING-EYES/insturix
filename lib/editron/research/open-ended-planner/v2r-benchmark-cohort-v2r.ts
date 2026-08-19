import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { DevelopmentModelRouteV2 } from './development-cohort-runner-v2';
import type { EvaluatorConditionPolicyV2R } from './evaluator-freeze-v2r';
import {
  runV2RFullEpisodeV2R,
  type V2RFullEpisodeExecutionV2R,
  type V2RFullEpisodeReceiptV2R,
} from './v2r-full-episode-v2r';
import {
  assertV2RBenchmarkTaskRegistryV2,
  type V2RBenchmarkTaskRegistryV2,
} from './v2r-benchmark-task-registry';
import {
  assertV2RPreregistrationComplete,
  type V2RPreregistrationManifest,
} from './v2r-preregistration-manifest';

type EpisodeRunnerV2R = typeof runV2RFullEpisodeV2R;
type EpisodeDispositionV2R = V2RFullEpisodeReceiptV2R['finalDisposition'];
type RowDispositionV2R = EpisodeDispositionV2R | 'HARNESS_ERROR';

export interface V2RBenchmarkCohortRowV2R {
  routeId: string;
  claimedModelIdentity: string;
  costBasis: DevelopmentModelRouteV2['costBasis'];
  caseId: string;
  taskId: string;
  conditionId: string;
  expectedFinalDisposition: 'PROXY_EXECUTED' | 'CAPABILITY_GAP' | 'UNVERIFIABLE';
  actualFinalDisposition: RowDispositionV2R;
  assessment: 'EXPECTED_OUTCOME' | 'UNEXPECTED_OUTCOME' | 'HARNESS_ERROR';
  fullEpisodeReceiptHash: string | null;
  fullEpisodeReceiptPath: string | null;
  actualProviderCostUsd: number | null;
  costDisposition: 'METERED' | 'UNPRICED_TOKEN_PLAN' | 'UNVERIFIABLE';
  elapsedMs: number;
  diagnostics: readonly string[];
}

export interface V2RBenchmarkCohortReceiptV2R {
  receiptVersion: 'EDITRON_OE_V2R_BENCHMARK_COHORT_RECEIPT_V1';
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  executionMode: 'SEQUENTIAL_FAIL_CLOSED_FULL_EPISODES';
  cohortId: string;
  createdAt: string;
  preregistrationManifestSha256: string;
  taskRegistrySha256: string;
  routes: V2RPreregistrationManifest['routeRoster']['routes'];
  rows: readonly Readonly<V2RBenchmarkCohortRowV2R>[];
  runDisposition: 'COMPLETE' | 'COMPLETE_WITH_FAILURES';
  actualProviderCostUsd: number;
  providerCostCoverage: 'COMPLETE' | 'PARTIAL_UNPRICED_ROUTE' | 'PARTIAL_UNVERIFIABLE';
  stage7Disposition: 'PENDING_NEW_BLIND_REVIEW' | 'NOT_READY_NO_EXECUTED_PROXY';
  stateEffects: readonly [];
  receiptSha256: string;
}

export async function runV2RBenchmarkCohortV2R(input: {
  manifest: unknown;
  registry: unknown;
  routes: readonly DevelopmentModelRouteV2[];
  cohortId: string;
  createdAt: string;
  outputDir: string;
  nowMs?: () => number;
  testOnlyRunEpisode?: EpisodeRunnerV2R;
}): Promise<{ receipt: Readonly<V2RBenchmarkCohortReceiptV2R>; receiptPath: string }> {
  const manifest = assertV2RPreregistrationComplete(input.manifest);
  const registry = assertV2RBenchmarkTaskRegistryV2(input.registry);
  validateIdentity(input.cohortId, input.createdAt);
  validateRoutes(input.routes, manifest);
  if (input.testOnlyRunEpisode && process.env.NODE_ENV !== 'test') {
    throw new Error('V2R_COHORT_TEST_RUNNER_FORBIDDEN');
  }
  const runEpisode = input.testOnlyRunEpisode ?? runV2RFullEpisodeV2R;
  const now = input.nowMs ?? Date.now;
  const root = path.resolve(input.outputDir);
  await mkdir(root, { recursive: true });
  const rows: V2RBenchmarkCohortRowV2R[] = [];

  for (const route of input.routes) {
    for (const taskCase of registry.cases) {
      const expected = expectedFinalDisposition(taskCase.expected);
      const executionId = executionIdentity(input.cohortId, route.routeId, taskCase.caseId);
      const episodeDir = path.join(root, slug(route.routeId), slug(taskCase.caseId));
      const startedAt = now();
      try {
        const execution = await runEpisode({
          manifest, task: taskCase.task, route, executionId,
          createdAt: input.createdAt, outputDir: episodeDir,
        });
        await validateEpisode(execution, {
          manifest, route, taskId: taskCase.task.taskId,
          conditionId: taskCase.task.conditionId, episodeDir,
        });
        const actual = execution.receipt.finalDisposition;
        rows.push({
          routeId: route.routeId, claimedModelIdentity: route.claimedModelIdentity,
          costBasis: route.costBasis, caseId: taskCase.caseId,
          taskId: taskCase.task.taskId, conditionId: taskCase.task.conditionId,
          expectedFinalDisposition: expected, actualFinalDisposition: actual,
          assessment: actual === expected ? 'EXPECTED_OUTCOME' : 'UNEXPECTED_OUTCOME',
          fullEpisodeReceiptHash: execution.receipt.receiptSha256,
          fullEpisodeReceiptPath: execution.receiptPath,
          actualProviderCostUsd: execution.receipt.actualProviderCostUsd,
          costDisposition: route.costBasis === 'USD_METERED' ? 'METERED' : 'UNPRICED_TOKEN_PLAN',
          elapsedMs: Math.max(0, now() - startedAt),
          diagnostics: actual === expected ? [] : [`EXPECTED_${expected}_GOT_${actual}`],
        });
      } catch (error) {
        rows.push({
          routeId: route.routeId, claimedModelIdentity: route.claimedModelIdentity,
          costBasis: route.costBasis, caseId: taskCase.caseId,
          taskId: taskCase.task.taskId, conditionId: taskCase.task.conditionId,
          expectedFinalDisposition: expected, actualFinalDisposition: 'HARNESS_ERROR',
          assessment: 'HARNESS_ERROR', fullEpisodeReceiptHash: null,
          fullEpisodeReceiptPath: null, actualProviderCostUsd: null,
          costDisposition: 'UNVERIFIABLE', elapsedMs: Math.max(0, now() - startedAt),
          diagnostics: [`HARNESS_ERROR:${safeError(error)}`],
        });
      }
    }
  }

  const actualProviderCostUsd = Number(rows.reduce(
    (sum, row) => sum + (row.actualProviderCostUsd ?? 0), 0,
  ).toFixed(12));
  const failures = rows.filter(({ assessment }) => assessment !== 'EXPECTED_OUTCOME');
  const material = {
    receiptVersion: 'EDITRON_OE_V2R_BENCHMARK_COHORT_RECEIPT_V1' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    executionMode: 'SEQUENTIAL_FAIL_CLOSED_FULL_EPISODES' as const,
    cohortId: input.cohortId, createdAt: input.createdAt,
    preregistrationManifestSha256: manifest.manifestSha256,
    taskRegistrySha256: registry.registrySha256,
    routes: manifest.routeRoster.routes, rows,
    runDisposition: failures.length ? 'COMPLETE_WITH_FAILURES' as const : 'COMPLETE' as const,
    actualProviderCostUsd,
    providerCostCoverage: costCoverage(rows),
    stage7Disposition: rows.some(({ actualFinalDisposition }) => actualFinalDisposition === 'PROXY_EXECUTED')
      ? 'PENDING_NEW_BLIND_REVIEW' as const : 'NOT_READY_NO_EXECUTED_PROXY' as const,
    stateEffects: [] as const,
  };
  const receipt = deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
  const receiptPath = path.join(root, `v2r-cohort-${input.cohortId}.json`);
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  return { receipt, receiptPath };
}

async function validateEpisode(
  execution: V2RFullEpisodeExecutionV2R,
  expected: {
    manifest: Readonly<V2RPreregistrationManifest>;
    route: DevelopmentModelRouteV2;
    taskId: string;
    conditionId: string;
    episodeDir: string;
  },
): Promise<void> {
  const receipt = execution.receipt;
  const { receiptSha256, ...material } = receipt;
  if (receipt.receiptVersion !== 'EDITRON_OE_V2R_FULL_EPISODE_RECEIPT_V2'
    || hashCanonicalJsonV1(material) !== receiptSha256) throw new Error('EPISODE_RECEIPT_HASH_DRIFT');
  if (receipt.authority !== 'RESEARCH_ONLY_NO_PROJECT_MUTATION' || receipt.stateEffects.length) {
    throw new Error('EPISODE_AUTHORITY_DRIFT');
  }
  if (receipt.preregistrationManifestSha256 !== expected.manifest.manifestSha256
    || receipt.routeId !== expected.route.routeId
    || receipt.claimedModelIdentity !== expected.route.claimedModelIdentity
    || receipt.taskId !== expected.taskId || receipt.conditionId !== expected.conditionId) {
    throw new Error('EPISODE_BINDING_DRIFT');
  }
  const resolved = path.resolve(execution.receiptPath);
  const root = path.resolve(expected.episodeDir);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('EPISODE_RECEIPT_PATH_OUTSIDE_CASE');
  }
  const persisted = JSON.parse(await readFile(resolved, 'utf8')) as unknown;
  if (hashCanonicalJsonV1(persisted) !== hashCanonicalJsonV1(receipt)) {
    throw new Error('EPISODE_PERSISTED_RECEIPT_DRIFT');
  }
}

function validateRoutes(
  routes: readonly DevelopmentModelRouteV2[],
  manifest: Readonly<V2RPreregistrationManifest>,
): void {
  const expected = manifest.routeRoster.routes;
  if (routes.length !== expected.length || new Set(routes.map(({ routeId }) => routeId)).size !== routes.length) {
    throw new Error('V2R_COHORT_ROUTE_SET_INVALID');
  }
  for (const identity of expected) {
    const route = routes.find(({ routeId }) => routeId === identity.routeId);
    if (!route || route.claimedModelIdentity !== identity.claimedModelIdentity
      || route.costBasis !== identity.costBasis) throw new Error(`V2R_COHORT_ROUTE_DRIFT:${identity.routeId}`);
  }
}

function expectedFinalDisposition(
  expected: Readonly<EvaluatorConditionPolicyV2R>,
): 'PROXY_EXECUTED' | 'CAPABILITY_GAP' | 'UNVERIFIABLE' {
  if (expected.expectedStage6Disposition === 'PASS') return 'PROXY_EXECUTED';
  if (expected.expectedStage6Disposition === 'HONEST_CAPABILITY_GAP') return 'CAPABILITY_GAP';
  return 'UNVERIFIABLE';
}

function costCoverage(rows: readonly V2RBenchmarkCohortRowV2R[]): V2RBenchmarkCohortReceiptV2R['providerCostCoverage'] {
  if (rows.some(({ costDisposition }) => costDisposition === 'UNVERIFIABLE')) return 'PARTIAL_UNVERIFIABLE';
  if (rows.some(({ costDisposition }) => costDisposition === 'UNPRICED_TOKEN_PLAN')) return 'PARTIAL_UNPRICED_ROUTE';
  return 'COMPLETE';
}

function validateIdentity(cohortId: string, createdAt: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(cohortId)) throw new Error('V2R_COHORT_ID_INVALID');
  if (!createdAt || Number.isNaN(Date.parse(createdAt))) throw new Error('V2R_COHORT_CREATED_AT_INVALID');
}
function executionIdentity(cohortId: string, routeId: string, caseId: string): string {
  return `${cohortId}-${slug(routeId)}-${slug(caseId)}`.slice(0, 96);
}
function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-'); }
function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/[\r\n]+/g, ' ').slice(0, 500);
}
