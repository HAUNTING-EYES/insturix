import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from 'dotenv';

import { buildDevelopmentCohortCasesV2, type DevelopmentMechanicsMapV2 } from '../lib/editron/research/open-ended-planner/development-cohort-cases-v2';
import { buildDevelopmentMechanicsMapV2 } from '../lib/editron/research/open-ended-planner/development-cohort-mechanics-v2';
import { buildDevelopmentModelRoutesV2 } from '../lib/editron/research/open-ended-planner/development-cohort-routes-v2';
import { runConnectedDevelopmentCohortV2 } from '../lib/editron/research/open-ended-planner/development-connected-cohort-runner-v2';
import { buildConnectedDevelopmentStage4OwnerForTaskV2 } from '../lib/editron/research/open-ended-planner/development-connected-stage4-owners-v2';
import {
  runDevelopmentCohortV2,
  type DevelopmentModelRouteV2,
} from '../lib/editron/research/open-ended-planner/development-cohort-runner-v2';
import { buildCanonicalDev03MeasuredEvidenceV2 } from '../lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import { buildDev01TruthfulStageOneTextPacketV2 } from '../lib/editron/research/open-ended-planner/staged-packet-v2';

type Mode = 'qwen-smoke' | 'qwen-smoke-diagnostic' | 'qwen-fair' | 'mechanics-only' | 'fair' | 'qwen-diagnostic'
  | 'connected-fair' | 'connected-qwen';

async function main(): Promise<void> {
  config({ path: '.env.local', quiet: true });
  const mode = parseMode(process.argv[2]);
  const createdAt = new Date().toISOString();
  const runId = `cohort-${createdAt.replace(/[^0-9]/g, '').slice(0, 14)}-${mode}`;
  const evidenceRoot = path.resolve('.calibration-temp/open-ended-planner-v2/cohort-runs');
  const runRoot = path.join(evidenceRoot, runId);
  await mkdir(evidenceRoot, { recursive: true });
  await mkdir(runRoot, { recursive: false });

  const routes = withProgress(buildDevelopmentModelRoutesV2({
    environment: process.env,
    qwenBudgetMode: mode === 'qwen-diagnostic' || mode === 'qwen-smoke-diagnostic'
      || mode === 'connected-fair' || mode === 'connected-qwen'
      ? 'ASYNC_QUALITY_DIAGNOSTIC'
      : 'FAIR_STAGE_BUDGET',
  }));

  if (mode === 'qwen-smoke' || mode === 'qwen-smoke-diagnostic') {
    const route = requiredRoute(routes, 'QWEN_3_8_MAX');
    const packet = buildDev01TruthfulStageOneTextPacketV2('BASELINE');
    process.stdout.write(`START ${route.routeId} DEV-01 STAGE-1\n`);
    const run = await route.runStage(packet);
    process.stdout.write(`END ${route.routeId} DEV-01 STAGE-1 ${run.disposition}\n`);
    await writeJson(path.join(runRoot, 'qwen-smoke.json'), run);
    process.stdout.write(`${JSON.stringify({ mode, runId, disposition: run.disposition })}\n`);
    return;
  }

  const measured = await measuredDev03();
  const mechanics = withMechanicsProgress(buildDevelopmentMechanicsMapV2({
    measuredDev03: measured,
    evidenceRoot,
    runId,
    createdAt,
  }));

  if (mode === 'mechanics-only') {
    const receipts = [];
    for (const taskId of ['DEV-01', 'DEV-02', 'DEV-03', 'DEV-04'] as const) {
      receipts.push(await mechanics[taskId]());
    }
    await writeJson(path.join(runRoot, 'mechanics.json'), receipts);
    process.stdout.write(`${JSON.stringify({ mode, runId, mechanics: receipts.map((receipt) => ({
      taskId: receipt.taskId,
      stage4: receipt.stage4Disposition,
      stage5: receipt.stage5Disposition,
      stage6: receipt.stage6Disposition,
    })) })}\n`);
    return;
  }

  const selectedRoutes = mode === 'qwen-diagnostic' || mode === 'qwen-fair' || mode === 'connected-qwen'
    ? [requiredRoute(routes, 'QWEN_3_8_MAX')]
    : routes;
  const tasks = buildDevelopmentCohortCasesV2({ measuredDev03: measured, mechanics });
  if (mode === 'connected-fair' || mode === 'connected-qwen') {
    const receipt = await runConnectedDevelopmentCohortV2({
      tasks,
      routes: selectedRoutes,
      ownerForTask: ({ taskId }) => buildConnectedDevelopmentStage4OwnerForTaskV2({
        taskId,
        measuredDev03: measured,
      }),
    });
    const receiptPath = path.join(runRoot, `${mode}-cohort-receipt.json`);
    await writeJson(receiptPath, receipt);
    process.stdout.write(`${JSON.stringify({
      mode,
      runId,
      receiptPath,
      receiptHash: receipt.receiptHash,
      actualProviderCostUsd: receipt.actualProviderCostUsd,
      providerCostCoverage: receipt.providerCostCoverage,
      routes: receipt.routes.map((route) => ({
        routeId: route.routeId,
        proceed: route.rows.filter(({ stage5Decision }) => stage5Decision.disposition === 'PROCEED').length,
        capabilityGap: route.rows.filter(({ stage5Decision }) => stage5Decision.disposition === 'CAPABILITY_GAP').length,
        fail: route.rows.filter(({ stage5Decision }) => stage5Decision.disposition === 'FAIL').length,
        unverifiable: route.rows.filter(({ stage5Decision }) => stage5Decision.disposition === 'UNVERIFIABLE').length,
      })),
      stage6Disposition: receipt.stage6Disposition,
    })}\n`);
    return;
  }
  const receipt = await runDevelopmentCohortV2({ tasks, routes: selectedRoutes });
  const receiptPath = path.join(runRoot, `${mode}-cohort-receipt.json`);
  await writeJson(receiptPath, receipt);
  process.stdout.write(`${JSON.stringify({
    mode,
    runId,
    receiptPath,
    receiptHash: receipt.receiptHash,
    actualProviderCostUsd: receipt.actualProviderCostUsd,
    providerCostCoverage: receipt.providerCostCoverage,
    routes: receipt.routes.map((route) => ({
      routeId: route.routeId,
      accepted: route.rows.filter(({ transportDisposition }) => transportDisposition === 'ARTIFACT_ACCEPTED').length,
      pass: route.rows.filter(({ evaluation }) => evaluation.disposition === 'PASS').length,
      humanReview: route.rows.filter(({ evaluation }) => evaluation.disposition === 'HUMAN_REVIEW_REQUIRED').length,
      expectedGap: route.rows.filter(({ evaluation }) => evaluation.disposition === 'EXPECTED_CAPABILITY_GAP').length,
      fail: route.rows.filter(({ evaluation }) => evaluation.disposition === 'FAIL').length,
      unverifiable: route.rows.filter(({ evaluation }) => evaluation.disposition === 'UNVERIFIABLE').length,
    })),
  })}\n`);
}

function withProgress(routes: readonly DevelopmentModelRouteV2[]): readonly DevelopmentModelRouteV2[] {
  return routes.map((route) => ({
    ...route,
    runStage: async (packet) => {
      process.stdout.write(`START ${route.routeId} ${packet.packet.taskId} STAGE-${packet.packet.stage}\n`);
      const run = await route.runStage(packet);
      process.stdout.write(`END ${route.routeId} ${packet.packet.taskId} STAGE-${packet.packet.stage} ${run.disposition}\n`);
      return run;
    },
  }));
}

function withMechanicsProgress(mechanics: DevelopmentMechanicsMapV2): DevelopmentMechanicsMapV2 {
  return Object.fromEntries(Object.entries(mechanics).map(([taskId, execute]) => [taskId, async () => {
    process.stdout.write(`START MECHANICS ${taskId}\n`);
    const receipt = await execute();
    process.stdout.write(`END MECHANICS ${taskId} ${receipt.stage6Disposition}\n`);
    return receipt;
  }])) as DevelopmentMechanicsMapV2;
}

async function measuredDev03() {
  const [audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'),
    readFile('lib/editron/services/media/beat-detection-service.ts'),
  ]);
  return buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
}

function requiredRoute(routes: readonly DevelopmentModelRouteV2[], routeId: string): DevelopmentModelRouteV2 {
  const route = routes.find((candidate) => candidate.routeId === routeId);
  if (!route) throw new Error(`COHORT_ROUTE_MISSING:${routeId}`);
  return route;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

function parseMode(value: string | undefined): Mode {
  const mode = value ?? 'fair';
  if (!['qwen-smoke', 'qwen-smoke-diagnostic', 'qwen-fair', 'mechanics-only', 'fair', 'qwen-diagnostic',
    'connected-fair', 'connected-qwen'].includes(mode)) {
    throw new Error(`COHORT_MODE_INVALID:${mode}`);
  }
  return mode as Mode;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`COHORT_RUN_FAILED:${message.replace(/[\r\n]+/g, ' ').slice(0, 800)}\n`);
  process.exitCode = 1;
});
