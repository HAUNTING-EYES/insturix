import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from 'dotenv';

import { hashCanonicalJsonV1 } from '../lib/editron/research/open-ended-planner/contracts-v1';
import { buildDevelopmentCohortCasesV2 } from '../lib/editron/research/open-ended-planner/development-cohort-cases-v2';
import { buildDevelopmentMechanicsMapV2 } from '../lib/editron/research/open-ended-planner/development-cohort-mechanics-v2';
import { buildQwenDevelopmentModelRouteV2 } from '../lib/editron/research/open-ended-planner/development-cohort-routes-v2';
import type { ConnectedDevelopmentCohortReceiptV2 } from '../lib/editron/research/open-ended-planner/development-connected-cohort-runner-v2';
import {
  continueConnectedDevelopmentStage123V2,
} from '../lib/editron/research/open-ended-planner/development-connected-stage123-runner-v2';
import { continueConnectedDevelopmentStage14V2 } from '../lib/editron/research/open-ended-planner/development-connected-stage14-runner-v2';
import { buildConnectedDevelopmentStage4OwnerForTaskV2 } from '../lib/editron/research/open-ended-planner/development-connected-stage4-owners-v2';
import { decideConnectedDevelopmentStage5V2 } from '../lib/editron/research/open-ended-planner/development-connected-stage5-gate-v2';
import { buildCanonicalDev03MeasuredEvidenceV2 } from '../lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';

const DEFAULT_SOURCE = '.calibration-temp/open-ended-planner-v2/cohort-runs/'
  + 'cohort-20260816120405-connected-fair/connected-fair-cohort-receipt.json';
const DIAGNOSTIC_TIMEOUT_MS = 900_000;
const ALLOWED_TASK_IDS = ['DEV-01', 'DEV-02', 'DEV-03', 'DEV-04'] as const;
type TaskId = typeof ALLOWED_TASK_IDS[number];

async function main(): Promise<void> {
  config({ path: '.env.local', quiet: true });
  const sourcePath = process.argv[2] ?? DEFAULT_SOURCE;
  const taskIds = parseTaskIds(process.argv.slice(3));
  const createdAt = new Date().toISOString();
  const runId = `qwen-continuation-${createdAt.replace(/[^0-9]/g, '').slice(0, 14)}`;
  const evidenceRoot = path.resolve('.calibration-temp/open-ended-planner-v2/cohort-runs');
  const runRoot = path.join(evidenceRoot, runId);

  const [sourceBytes, audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile(sourcePath, 'utf8'),
    readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'),
    readFile('lib/editron/services/media/beat-detection-service.ts'),
  ]);
  const source = JSON.parse(sourceBytes) as ConnectedDevelopmentCohortReceiptV2;
  verifySourceCohort(source);
  const measured = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
  const mechanics = buildDevelopmentMechanicsMapV2({ measuredDev03: measured, evidenceRoot, runId, createdAt });
  const tasks = buildDevelopmentCohortCasesV2({ measuredDev03: measured, mechanics });
  const baseRoute = buildQwenDevelopmentModelRouteV2({
    environment: process.env,
    qwenBudgetMode: 'ASYNC_QUALITY_DIAGNOSTIC',
    diagnosticTimeoutOverrideMs: DIAGNOSTIC_TIMEOUT_MS,
  });
  const route = {
    ...baseRoute,
    runStage: async (packet: Parameters<typeof baseRoute.runStage>[0]) => {
      process.stdout.write(`START QWEN ${packet.packet.taskId} STAGE-${packet.packet.stage}\n`);
      const run = await baseRoute.runStage(packet);
      process.stdout.write(`END QWEN ${packet.packet.taskId} STAGE-${packet.packet.stage} ${run.disposition}\n`);
      return run;
    },
  };
  const sourceRoute = source.routes.find(({ routeId }) => routeId === route.routeId);
  if (!sourceRoute) throw new Error('QWEN_CONTINUATION_SOURCE_ROUTE_MISSING');
  await mkdir(runRoot, { recursive: false });

  const rows = [];
  for (const taskId of taskIds) {
    const task = tasks.find((candidate) => candidate.taskId === taskId);
    const sourceRow = sourceRoute.rows.find((candidate) => candidate.taskId === taskId);
    if (!task || !sourceRow) throw new Error(`QWEN_CONTINUATION_SOURCE_TASK_MISSING:${taskId}`);
    const continuation = await continueConnectedDevelopmentStage123V2({
      task, route, sourceReceipt: sourceRow.stage14Receipt.stage123Receipt,
    });
    const stage14Receipt = await continueConnectedDevelopmentStage14V2({
      task,
      route,
      owner: buildConnectedDevelopmentStage4OwnerForTaskV2({ taskId, measuredDev03: measured }),
      stage123Receipt: continuation.stage123Receipt,
    });
    const stage5Decision = decideConnectedDevelopmentStage5V2(stage14Receipt);
    const row = { taskId, continuation, stage14Receipt, stage5Decision };
    rows.push(row);
    await writeJson(path.join(runRoot, `${taskId.toLowerCase()}-continuation-receipt.json`), row);
    process.stdout.write(`SAVED ${taskId} ${stage5Decision.disposition}\n`);
  }

  const material = {
    receiptVersion: 'EDITRON_OE_QWEN_CONNECTED_CONTINUATION_BATCH_V2' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    scoreStatus: 'SUPPLEMENTAL_NOT_PRIMARY_FAIR_SCORE' as const,
    handoffMode: 'REUSE_HASH_IDENTICAL_ACCEPTED_PREFIX_CALL_ONLY_MISSING' as const,
    createdAt,
    sourceReceiptPath: sourcePath,
    sourceReceiptHash: source.receiptHash,
    routeId: route.routeId,
    claimedModelIdentity: route.claimedModelIdentity,
    budgetMode: 'ASYNC_QUALITY_DIAGNOSTIC' as const,
    transportTimeoutOverrideMs: DIAGNOSTIC_TIMEOUT_MS,
    rows,
    providerCostCoverage: 'TOKEN_PLAN_CREDITS_UNPRICED' as const,
    stateEffects: [] as const,
  };
  const receipt = { ...material, receiptHash: hashCanonicalJsonV1(material) };
  const receiptPath = path.join(runRoot, 'qwen-connected-continuation-batch-receipt.json');
  await writeJson(receiptPath, receipt);
  process.stdout.write(`${JSON.stringify({ runId, receiptPath, receiptHash: receipt.receiptHash,
    results: rows.map(({ taskId, stage5Decision }) => ({ taskId, disposition: stage5Decision.disposition })) })}\n`);
}

function parseTaskIds(values: readonly string[]): readonly TaskId[] {
  const taskIds = values.length ? values : ['DEV-02', 'DEV-03'];
  if (taskIds.some((value) => !ALLOWED_TASK_IDS.includes(value as TaskId))
    || new Set(taskIds).size !== taskIds.length) throw new Error('QWEN_CONTINUATION_TASK_SET_INVALID');
  return taskIds as TaskId[];
}

function verifySourceCohort(source: ConnectedDevelopmentCohortReceiptV2): void {
  const { receiptHash, ...unsigned } = source;
  if (source.authority !== 'RESEARCH_ONLY_NO_PROJECT_MUTATION'
    || receiptHash !== hashCanonicalJsonV1(unsigned)) throw new Error('QWEN_CONTINUATION_SOURCE_COHORT_INVALID');
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`QWEN_CONTINUATION_FAILED:${message.replace(/[\r\n]+/g, ' ').slice(0, 800)}\n`);
  process.exitCode = 1;
});
