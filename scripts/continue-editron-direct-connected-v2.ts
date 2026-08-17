import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from 'dotenv';

import { hashCanonicalJsonV1 } from '../lib/editron/research/open-ended-planner/contracts-v1';
import { buildDevelopmentCohortCasesV2 } from '../lib/editron/research/open-ended-planner/development-cohort-cases-v2';
import { buildDevelopmentMechanicsMapV2 } from '../lib/editron/research/open-ended-planner/development-cohort-mechanics-v2';
import { buildDevelopmentModelRoutesV2 } from '../lib/editron/research/open-ended-planner/development-cohort-routes-v2';
import type { ConnectedDevelopmentCohortReceiptV2 } from '../lib/editron/research/open-ended-planner/development-connected-cohort-runner-v2';
import {
  continueConnectedDevelopmentStage123V2,
  runConnectedDevelopmentStage123V2,
  type ConnectedDevelopmentStage123ReceiptV2,
} from '../lib/editron/research/open-ended-planner/development-connected-stage123-runner-v2';
import { continueConnectedDevelopmentStage14V2 } from '../lib/editron/research/open-ended-planner/development-connected-stage14-runner-v2';
import {
  buildConnectedStage1RequalificationHandoffV2,
  buildConnectedStage1SemanticRepairHandoffV2,
  buildConnectedStage2ReevaluationHandoffV2,
  CONNECTED_SOURCE_RELATIVE_STAGE23_EVALUATOR_V2,
} from '../lib/editron/research/open-ended-planner/development-connected-stage1-requalification-v2';
import { buildConnectedDevelopmentStage4OwnerForTaskV2 } from '../lib/editron/research/open-ended-planner/development-connected-stage4-owners-v2';
import { decideConnectedDevelopmentStage5V2 } from '../lib/editron/research/open-ended-planner/development-connected-stage5-gate-v2';
import { buildCanonicalDev03MeasuredEvidenceV2 } from '../lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';

const DEFAULT_SOURCE = '.calibration-temp/open-ended-planner-v2/cohort-runs/'
  + 'cohort-20260816120405-connected-fair/connected-fair-cohort-receipt.json';
const ALLOWED_ROUTE_IDS = ['OPENAI_LUNA', 'OPENAI_TERRA'] as const;
const ALLOWED_TASK_IDS = ['DEV-01', 'DEV-02', 'DEV-03', 'DEV-04'] as const;
const DEV02_STAGE1_PROOF_REPAIR_FLAG = '--repair-dev02-proof-claims';
const DEV02_STAGE1_PROOF_REPAIR_DIAGNOSTICS = [
  'MISSING_EXECUTABLE_TARGET_CLAIMS:FIVE_PANEL_LAYOUT,BLACK_GUTTERS,TITLE_TWO_LINE,TITLE_YELLOW,OPPOSED_PANEL_MOTION,CENTRE_PANEL_TAKEOVER,BUILD_PHASE,HOLD_PHASE — promote an observation only when the supplied ordered evidence supports it; otherwise preserve uncertainty.',
] as const;
type RouteId = typeof ALLOWED_ROUTE_IDS[number];
type TaskId = typeof ALLOWED_TASK_IDS[number];
interface DirectContinuationBatchSourceV2 {
  receiptVersion: 'EDITRON_OE_DIRECT_CONNECTED_CONTINUATION_BATCH_V2';
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  routeId: string;
  rows: Array<{
    taskId: string;
    stage123Receipt?: ConnectedDevelopmentStage123ReceiptV2;
    continuation: { stage123Receipt: ConnectedDevelopmentStage123ReceiptV2 } | null;
  }>;
  receiptHash: string;
}
type SourceReceiptV2 = ConnectedDevelopmentCohortReceiptV2 | DirectContinuationBatchSourceV2;

async function main(): Promise<void> {
  config({ path: '.env.local', quiet: true });
  const routeId = parseRouteId(process.argv[2]);
  const sourcePath = process.argv[3] ?? DEFAULT_SOURCE;
  const requestedArgs = process.argv.slice(4);
  const repairDev02ProofClaims = requestedArgs.includes(DEV02_STAGE1_PROOF_REPAIR_FLAG);
  const taskIds = parseTaskIds(requestedArgs.filter((value) => value !== DEV02_STAGE1_PROOF_REPAIR_FLAG));
  if (repairDev02ProofClaims && (taskIds.length !== 1 || taskIds[0] !== 'DEV-02')) {
    throw new Error('DIRECT_CONTINUATION_DEV02_PROOF_REPAIR_REQUIRES_DEV02_ONLY');
  }
  const createdAt = new Date().toISOString();
  const runId = `${routeId.toLowerCase().replaceAll('_', '-')}-continuation-`
    + createdAt.replace(/[^0-9]/g, '').slice(0, 14);
  const evidenceRoot = path.resolve('.calibration-temp/open-ended-planner-v2/cohort-runs');
  const runRoot = path.join(evidenceRoot, runId);

  const [sourceBytes, audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile(sourcePath, 'utf8'),
    readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'),
    readFile('lib/editron/services/media/beat-detection-service.ts'),
  ]);
  const source = JSON.parse(sourceBytes) as SourceReceiptV2;
  verifySource(source);
  const measured = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
  const mechanics = buildDevelopmentMechanicsMapV2({ measuredDev03: measured, evidenceRoot, runId, createdAt });
  const tasks = buildDevelopmentCohortCasesV2({ measuredDev03: measured, mechanics });
  const baseRoute = buildDevelopmentModelRoutesV2({
    environment: process.env,
    qwenBudgetMode: 'ASYNC_QUALITY_DIAGNOSTIC',
  }).find((candidate) => candidate.routeId === routeId);
  if (!baseRoute) throw new Error(`DIRECT_CONTINUATION_ROUTE_MISSING:${routeId}`);
  const route = {
    ...baseRoute,
    runStage: async (packet: Parameters<typeof baseRoute.runStage>[0]) => {
      process.stdout.write(`START ${routeId} ${packet.packet.taskId} STAGE-${packet.packet.stage}\n`);
      const run = await baseRoute.runStage(packet);
      process.stdout.write(`END ${routeId} ${packet.packet.taskId} STAGE-${packet.packet.stage} ${run.disposition}\n`);
      return run;
    },
  };
  await mkdir(runRoot, { recursive: false });

  const rows = [];
  for (const taskId of taskIds) {
    const task = tasks.find((candidate) => candidate.taskId === taskId);
    if (!task) throw new Error(`DIRECT_CONTINUATION_SOURCE_TASK_MISSING:${taskId}`);
    const sourceStage123 = sourceStage123ForTask(source, routeId, taskId);
    const replaySignedPrefix = isStage4Eligible(sourceStage123);
    let activeTask = task;
    let stage1SemanticRepair = null;
    let requalification = null;
    let continuation = null;
    let stage123Receipt = sourceStage123;
    let incrementalProviderCostUsd = 0;
    if (repairDev02ProofClaims) {
      const repair = buildConnectedStage1SemanticRepairHandoffV2({
        task,
        route,
        sourceReceipt: sourceStage123,
        repairDiagnostics: DEV02_STAGE1_PROOF_REPAIR_DIAGNOSTICS,
      });
      activeTask = repair.repairedTask;
      stage1SemanticRepair = repair.handoff;
      stage123Receipt = await runConnectedDevelopmentStage123V2({ task: activeTask, route });
      incrementalProviderCostUsd = stage123Receipt.actualProviderCostUsd;
    } else if (!replaySignedPrefix) {
      const stageOne = sourceStage123.rows[0];
      const stageTwo = sourceStage123.rows[1];
      if (source.receiptVersion === 'EDITRON_OE_DIRECT_CONNECTED_CONTINUATION_BATCH_V2'
        && taskId === 'DEV-02'
        && stageTwo?.providerRun.disposition === 'ARTIFACT_ACCEPTED'
        && ['PASS', 'EXPECTED_CAPABILITY_GAP'].includes(stageTwo.evaluation.disposition)) {
        requalification = buildConnectedStage2ReevaluationHandoffV2({
          task,
          route,
          sourceReceipt: sourceStage123,
        });
      } else if (stageOne?.providerRun.disposition === 'ARTIFACT_ACCEPTED' && stageOne.providerRun.artifact) {
        requalification = buildConnectedStage1RequalificationHandoffV2({
          task,
          route,
          sourceReceipt: sourceStage123,
          evaluatorContractId: CONNECTED_SOURCE_RELATIVE_STAGE23_EVALUATOR_V2,
        });
      }
      continuation = await continueConnectedDevelopmentStage123V2({
        task,
        route,
        sourceReceipt: requalification && 'stage2Receipt' in requalification
          ? requalification.stage2Receipt
          : requalification?.stage1Receipt ?? sourceStage123,
      });
      stage123Receipt = continuation.stage123Receipt;
      incrementalProviderCostUsd = continuation.incrementalProviderCostUsd;
    }
    let stage14Receipt = await continueConnectedDevelopmentStage14V2({
      task: activeTask,
      route,
      owner: buildConnectedDevelopmentStage4OwnerForTaskV2({ taskId, measuredDev03: measured }),
      stage123Receipt,
    });
    if (!repairDev02ProofClaims && replaySignedPrefix
      && stage14Receipt.stage4Receipt?.evaluation.disposition === 'UNVERIFIABLE') {
      requalification = buildConnectedStage1RequalificationHandoffV2({
        task,
        route,
        sourceReceipt: sourceStage123,
        evaluatorContractId: CONNECTED_SOURCE_RELATIVE_STAGE23_EVALUATOR_V2,
      });
      continuation = await continueConnectedDevelopmentStage123V2({
        task,
        route,
        sourceReceipt: requalification.stage1Receipt,
      });
      stage123Receipt = continuation.stage123Receipt;
      incrementalProviderCostUsd = continuation.incrementalProviderCostUsd;
      stage14Receipt = await continueConnectedDevelopmentStage14V2({
        task,
        route,
        owner: buildConnectedDevelopmentStage4OwnerForTaskV2({ taskId, measuredDev03: measured }),
        stage123Receipt,
      });
    }
    const stage5Decision = decideConnectedDevelopmentStage5V2(stage14Receipt);
    const row = {
      taskId,
      stage123SourceMode: stage1SemanticRepair
        ? 'REPAIR_STAGE1_RERUN_STAGE123' as const
        : requalification && 'stage2Receipt' in requalification
        ? 'REQUALIFY_STAGE2_CALL_ONLY_STAGE3' as const
        : requalification
          ? 'REQUALIFY_STAGE1_SUPERSEDE_STAGE23' as const
        : replaySignedPrefix
          ? 'REPLAY_SIGNED_STAGE3_PREFIX_NO_PROVIDER_CALL' as const
          : 'CONTINUE_ACCEPTED_PREFIX_CALL_ONLY_MISSING' as const,
      requalification,
      stage1SemanticRepair,
      continuation,
      stage123Receipt,
      incrementalProviderCostUsd,
      stage14Receipt,
      stage5Decision,
    };
    rows.push(row);
    await writeJson(path.join(runRoot, `${taskId.toLowerCase()}-continuation-receipt.json`), row);
    process.stdout.write(`SAVED ${routeId} ${taskId} ${stage5Decision.disposition}\n`);
  }

  const material = {
    receiptVersion: 'EDITRON_OE_DIRECT_CONNECTED_CONTINUATION_BATCH_V2' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    scoreStatus: 'SUPPLEMENTAL_NOT_PRIMARY_FAIR_SCORE' as const,
    handoffMode: repairDev02ProofClaims
      ? 'STAGE1_SEMANTIC_REPAIR_RERUN_STAGE123' as const
      : 'REUSE_HASH_IDENTICAL_ACCEPTED_PREFIX_CALL_ONLY_MISSING' as const,
    createdAt,
    sourceReceiptPath: sourcePath,
    sourceReceiptHash: source.receiptHash,
    routeId: route.routeId,
    claimedModelIdentity: route.claimedModelIdentity,
    rows,
    incrementalProviderCostUsd: Number(rows.reduce((total, row) =>
      total + row.incrementalProviderCostUsd, 0).toFixed(12)),
    stateEffects: [] as const,
  };
  const receipt = { ...material, receiptHash: hashCanonicalJsonV1(material) };
  const receiptPath = path.join(runRoot, 'direct-connected-continuation-batch-receipt.json');
  await writeJson(receiptPath, receipt);
  process.stdout.write(`${JSON.stringify({
    runId,
    receiptPath,
    receiptHash: receipt.receiptHash,
    incrementalProviderCostUsd: receipt.incrementalProviderCostUsd,
    results: rows.map(({ taskId, stage14Receipt, stage5Decision }) => ({
      taskId,
      stage4: stage14Receipt.stage4Receipt?.evaluation.disposition ?? null,
      stage5: stage5Decision.disposition,
    })),
  })}\n`);
}

function parseRouteId(value: string | undefined): RouteId {
  if (!ALLOWED_ROUTE_IDS.includes(value as RouteId)) {
    throw new Error(`Usage: tsx scripts/continue-editron-direct-connected-v2.ts <${ALLOWED_ROUTE_IDS.join('|')}> [source.json] [DEV-01 ... DEV-04]`);
  }
  return value as RouteId;
}

function parseTaskIds(values: readonly string[]): readonly TaskId[] {
  const taskIds = values.length ? values : [...ALLOWED_TASK_IDS];
  if (taskIds.some((value) => !ALLOWED_TASK_IDS.includes(value as TaskId))
    || new Set(taskIds).size !== taskIds.length) throw new Error('DIRECT_CONTINUATION_TASK_SET_INVALID');
  return taskIds as TaskId[];
}

function verifySource(source: SourceReceiptV2): void {
  const { receiptHash, ...unsigned } = source;
  if (source.authority !== 'RESEARCH_ONLY_NO_PROJECT_MUTATION'
    || receiptHash !== hashCanonicalJsonV1(unsigned)) throw new Error('DIRECT_CONTINUATION_SOURCE_INVALID');
}

function sourceStage123ForTask(
  source: SourceReceiptV2,
  routeId: RouteId,
  taskId: TaskId,
): ConnectedDevelopmentStage123ReceiptV2 {
  if (source.receiptVersion === 'EDITRON_OE_CONNECTED_DEVELOPMENT_COHORT_RECEIPT_V2') {
    const route = source.routes.find((candidate) => candidate.routeId === routeId);
    const row = route?.rows.find((candidate) => candidate.taskId === taskId);
    if (!row) throw new Error(`DIRECT_CONTINUATION_SOURCE_TASK_MISSING:${routeId}:${taskId}`);
    return row.stage14Receipt.stage123Receipt;
  }
  if (source.routeId !== routeId) throw new Error(`DIRECT_CONTINUATION_SOURCE_ROUTE_MISSING:${routeId}`);
  const row = source.rows.find((candidate) => candidate.taskId === taskId);
  const stage123Receipt = row?.stage123Receipt ?? row?.continuation?.stage123Receipt;
  if (!stage123Receipt) throw new Error(`DIRECT_CONTINUATION_SOURCE_TASK_MISSING:${routeId}:${taskId}`);
  return stage123Receipt;
}

function isStage4Eligible(
  receipt: ConnectedDevelopmentCohortReceiptV2['routes'][number]['rows'][number]['stage14Receipt']['stage123Receipt'],
): boolean {
  const stageThree = receipt.rows.find(({ stage }) => stage === 3);
  return receipt.finalDisposition === 'STAGE3_EVALUATED'
    && Boolean(stageThree)
    && ['PASS', 'EXPECTED_CAPABILITY_GAP'].includes(stageThree!.evaluation.disposition);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`DIRECT_CONTINUATION_FAILED:${message.replace(/[\r\n]+/g, ' ').slice(0, 1000)}\n`);
  process.exitCode = 1;
});
