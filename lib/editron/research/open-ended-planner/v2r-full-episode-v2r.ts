import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import type { GenericLoweringResultV2R } from './generic-lowerer-v2r';
import {
  runV2RConnectedEpisodeV2,
  type V2RConnectedRouteV2,
  type V2RConnectedTaskV2,
} from './v2r-connected-episode-v2r';
import {
  decideV2RStage5ExecutionV2R,
  type V2RStage5ExecutionDecisionV2R,
} from './v2r-stage5-execution-gate';
import {
  executeV2RStage6TaskAdapter,
  type V2RStage6TaskExecutionResult,
} from './v2r-stage6-task-adapter-registry';

type JsonRecord = Record<string, unknown>;
type FinalDispositionV2R =
  | 'PROXY_EXECUTED'
  | 'PROXY_EXECUTED_TEST_DOUBLE'
  | 'CAPABILITY_GAP'
  | 'UNVERIFIABLE'
  | 'STAGE5_FAILED'
  | 'STAGE6_FAILED';

export interface V2RFullEpisodeReceiptV2R {
  receiptVersion: 'EDITRON_OE_V2R_FULL_EPISODE_RECEIPT_V1';
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  executionId: string;
  createdAt: string;
  taskId: string;
  conditionId: string;
  routeId: string;
  claimedModelIdentity: string;
  preregistrationManifestSha256: string;
  connectedEpisodeReceiptHash: string;
  stage5DecisionReceiptSha256: string;
  stage5Disposition: V2RStage5ExecutionDecisionV2R['disposition'];
  stage6: {
    attempted: boolean;
    executionMode: 'CANONICAL_TASK_ADAPTER' | 'TEST_DOUBLE' | 'NOT_AUTHORIZED';
    disposition: 'PASS' | 'FAIL' | 'NOT_AUTHORIZED';
    receiptHash: string | null;
    receiptPath: string | null;
    diagnostics: readonly string[];
  };
  finalDisposition: FinalDispositionV2R;
  actualProviderCostUsd: number;
  stateEffects: readonly [];
  receiptSha256: string;
}

export interface V2RFullEpisodeExecutionV2R {
  receipt: Readonly<V2RFullEpisodeReceiptV2R>;
  receiptPath: string;
}

type Stage6ExecutorV2R = (input: {
  taskId: string;
  lowering: Readonly<GenericLoweringResultV2R>;
  evidencePack: unknown;
  executionId: string;
  createdAt: string;
  outputDir: string;
}) => Promise<V2RStage6TaskExecutionResult>;

export async function runV2RFullEpisodeV2R(input: {
  manifest: unknown;
  task: V2RConnectedTaskV2;
  route: V2RConnectedRouteV2;
  executionId: string;
  createdAt: string;
  outputDir: string;
  testOnlyStage6Executor?: Stage6ExecutorV2R;
}): Promise<V2RFullEpisodeExecutionV2R> {
  validateExecutionIdentity(input.executionId, input.createdAt);
  if (input.testOnlyStage6Executor && process.env.NODE_ENV !== 'test') {
    throw new Error('V2R_FULL_EPISODE_TEST_EXECUTOR_FORBIDDEN');
  }
  const connectedEpisode = await runV2RConnectedEpisodeV2({
    manifest: input.manifest, task: input.task, route: input.route,
  });
  const gate = decideV2RStage5ExecutionV2R({
    manifest: input.manifest, task: input.task, connectedEpisode,
  });

  let stage6 = notAuthorizedStage6();
  let finalDisposition = mapGateDisposition(gate.decision.disposition);
  if (gate.decision.disposition === 'PROCEED') {
    if (!gate.lowering) throw new Error('V2R_FULL_EPISODE_AUTHORIZED_LOWERING_MISSING');
    const executionMode = input.testOnlyStage6Executor ? 'TEST_DOUBLE' : 'CANONICAL_TASK_ADAPTER';
    const executor = input.testOnlyStage6Executor ?? executeV2RStage6TaskAdapter;
    try {
      const execution = await executor({
        taskId: input.task.taskId,
        lowering: gate.lowering,
        evidencePack: input.task.evidencePack,
        executionId: input.executionId,
        createdAt: input.createdAt,
        outputDir: path.join(input.outputDir, 'stage6'),
      });
      const diagnostics = await validateStage6Execution({
        execution, lowering: gate.lowering, taskId: input.task.taskId,
        outputDir: path.join(input.outputDir, 'stage6'),
        requireReceiptFile: executionMode === 'CANONICAL_TASK_ADAPTER',
      });
      stage6 = {
        attempted: true, executionMode,
        disposition: diagnostics.length ? 'FAIL' : 'PASS',
        receiptHash: text(execution.receipt.receiptHash) || null,
        receiptPath: execution.receiptPath,
        diagnostics,
      };
      finalDisposition = diagnostics.length
        ? 'STAGE6_FAILED'
        : executionMode === 'TEST_DOUBLE' ? 'PROXY_EXECUTED_TEST_DOUBLE' : 'PROXY_EXECUTED';
    } catch (error) {
      stage6 = {
        attempted: true, executionMode, disposition: 'FAIL',
        receiptHash: null, receiptPath: null,
        diagnostics: [`STAGE6_EXECUTION_ERROR:${safeError(error)}`],
      };
      finalDisposition = 'STAGE6_FAILED';
    }
  }

  const material = {
    receiptVersion: 'EDITRON_OE_V2R_FULL_EPISODE_RECEIPT_V1' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    executionId: input.executionId, createdAt: input.createdAt,
    taskId: input.task.taskId, conditionId: input.task.conditionId,
    routeId: input.route.routeId, claimedModelIdentity: input.route.claimedModelIdentity,
    preregistrationManifestSha256: connectedEpisode.preregistrationManifestSha256,
    connectedEpisodeReceiptHash: connectedEpisode.receiptHash,
    stage5DecisionReceiptSha256: gate.decision.receiptSha256,
    stage5Disposition: gate.decision.disposition,
    stage6, finalDisposition,
    actualProviderCostUsd: connectedEpisode.actualProviderCostUsd,
    stateEffects: [] as const,
  };
  const receipt = deepFreezeV1({ ...material, receiptSha256: hashCanonicalJsonV1(material) });
  await mkdir(input.outputDir, { recursive: true });
  const receiptPath = path.join(input.outputDir, `v2r-full-episode-${input.executionId}.json`);
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  return { receipt, receiptPath };
}

async function validateStage6Execution(input: {
  execution: V2RStage6TaskExecutionResult;
  lowering: Readonly<GenericLoweringResultV2R>;
  taskId: string;
  outputDir: string;
  requireReceiptFile: boolean;
}): Promise<string[]> {
  const diagnostics: string[] = [];
  const receipt = record(input.execution.receipt);
  const { receiptHash, ...material } = receipt;
  if (!text(receiptHash) || hashCanonicalJsonV1(material) !== receiptHash) diagnostics.push('STAGE6_RECEIPT_HASH_DRIFT');
  if (receipt.authority !== 'RESEARCH_PROXY_ONLY_NO_PROJECT_MUTATION') diagnostics.push('STAGE6_AUTHORITY_DRIFT');
  if (receipt.taskId !== input.taskId) diagnostics.push('STAGE6_TASK_DRIFT');
  if (receipt.loweredGraphHash !== hashCanonicalJsonV1(input.lowering.compiled)) diagnostics.push('STAGE6_LOWERED_GRAPH_DRIFT');
  if (receipt.fullProjectExecutionEligibility !== 'NOT_EXECUTABLE') diagnostics.push('STAGE6_FULL_EXECUTION_ELIGIBILITY_DRIFT');
  if (records(receipt.stateEffects).length) diagnostics.push('STAGE6_PROJECT_STATE_EFFECT_PRESENT');
  const proof = record(receipt.proof);
  if (proof.state !== 'PASS' || proof.renderedVisual !== 'PASS'
    || proof.renderedAudio !== 'PASS' || proof.projectMutation !== 'NONE') {
    diagnostics.push('STAGE6_PROOF_NOT_PASS');
  }
  const validation = record(receipt.renderProofValidation);
  if (validation.assessment !== 'PASS' || validation.renderedVisual !== 'PASS'
    || validation.renderedAudio !== 'PASS') diagnostics.push('STAGE6_RENDER_VALIDATION_NOT_PASS');
  const executedOperators = records(receipt.operations).map(({ operatorId }) => text(operatorId));
  if (!same(executedOperators, input.lowering.compiledOperatorIds)) diagnostics.push('STAGE6_OPERATION_TRACE_DRIFT');
  if (input.requireReceiptFile) {
    const receiptPath = path.resolve(input.execution.receiptPath);
    const root = path.resolve(input.outputDir);
    const relative = path.relative(root, receiptPath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      diagnostics.push('STAGE6_RECEIPT_PATH_OUTSIDE_OUTPUT');
    } else {
      try {
        const persisted = JSON.parse(await readFile(receiptPath, 'utf8'));
        if (!same(persisted, receipt)) diagnostics.push('STAGE6_PERSISTED_RECEIPT_DRIFT');
      } catch {
        diagnostics.push('STAGE6_PERSISTED_RECEIPT_UNREADABLE');
      }
    }
  }
  return [...new Set(diagnostics)].sort(compareUtf16);
}

function notAuthorizedStage6(): V2RFullEpisodeReceiptV2R['stage6'] {
  return {
    attempted: false, executionMode: 'NOT_AUTHORIZED', disposition: 'NOT_AUTHORIZED',
    receiptHash: null, receiptPath: null, diagnostics: [],
  };
}

function mapGateDisposition(disposition: V2RStage5ExecutionDecisionV2R['disposition']): FinalDispositionV2R {
  if (disposition === 'CAPABILITY_GAP') return 'CAPABILITY_GAP';
  if (disposition === 'UNVERIFIABLE') return 'UNVERIFIABLE';
  return 'STAGE5_FAILED';
}

function validateExecutionIdentity(executionId: string, createdAt: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(executionId)) throw new Error('V2R_FULL_EPISODE_EXECUTION_ID_INVALID');
  if (!createdAt || Number.isNaN(Date.parse(createdAt))) throw new Error('V2R_FULL_EPISODE_CREATED_AT_INVALID');
}
function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/[\r\n]+/g, ' ').slice(0, 500);
}
function same(left: unknown, right: unknown): boolean { return hashCanonicalJsonV1(left) === hashCanonicalJsonV1(right); }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function compareUtf16(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
