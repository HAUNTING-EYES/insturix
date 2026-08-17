import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from 'dotenv';

import { hashCanonicalJsonV1 } from '../lib/editron/research/open-ended-planner/contracts-v1';
import { buildDevelopmentCohortCasesV2 } from '../lib/editron/research/open-ended-planner/development-cohort-cases-v2';
import { buildDevelopmentMechanicsMapV2 } from '../lib/editron/research/open-ended-planner/development-cohort-mechanics-v2';
import { buildQwenDevelopmentModelRouteV2 } from '../lib/editron/research/open-ended-planner/development-cohort-routes-v2';
import type { ConnectedDevelopmentCohortReceiptV2 } from '../lib/editron/research/open-ended-planner/development-connected-cohort-runner-v2';
import { continueConnectedDevelopmentStage14V2 } from '../lib/editron/research/open-ended-planner/development-connected-stage14-runner-v2';
import { buildConnectedDev04Stage4OwnerV2 } from '../lib/editron/research/open-ended-planner/development-connected-stage4-owners-v2';
import { decideConnectedDevelopmentStage5V2 } from '../lib/editron/research/open-ended-planner/development-connected-stage5-gate-v2';
import { buildCanonicalDev03MeasuredEvidenceV2 } from '../lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';

const DEFAULT_SOURCE = '.calibration-temp/open-ended-planner-v2/cohort-runs/'
  + 'cohort-20260816120405-connected-fair/connected-fair-cohort-receipt.json';

async function main(): Promise<void> {
  config({ path: '.env.local', quiet: true });
  const sourcePath = process.argv[2] ?? DEFAULT_SOURCE;
  const createdAt = new Date().toISOString();
  const runId = `qwen-dev04-stage45-${createdAt.replace(/[^0-9]/g, '').slice(0, 14)}`;
  const evidenceRoot = path.resolve('.calibration-temp/open-ended-planner-v2/cohort-runs');
  const runRoot = path.join(evidenceRoot, runId);
  const [sourceBytes, audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile(sourcePath, 'utf8'),
    readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'),
    readFile('lib/editron/services/media/beat-detection-service.ts'),
  ]);
  const source = JSON.parse(sourceBytes) as ConnectedDevelopmentCohortReceiptV2;
  verifySource(source);
  const sourceRoute = source.routes.find(({ routeId }) => routeId === 'QWEN_3_8_MAX');
  const sourceRow = sourceRoute?.rows.find(({ taskId }) => taskId === 'DEV-04');
  if (!sourceRow) throw new Error('QWEN_DEV04_REPLAY_SOURCE_ROW_MISSING');

  const measured = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
  const mechanics = buildDevelopmentMechanicsMapV2({
    measuredDev03: measured,
    evidenceRoot,
    runId,
    createdAt,
  });
  const task = buildDevelopmentCohortCasesV2({ measuredDev03: measured, mechanics })
    .find((candidate) => candidate.taskId === 'DEV-04');
  if (!task) throw new Error('QWEN_DEV04_REPLAY_TASK_MISSING');
  const route = buildQwenDevelopmentModelRouteV2({
    environment: process.env,
    qwenBudgetMode: 'ASYNC_QUALITY_DIAGNOSTIC',
    diagnosticTimeoutOverrideMs: 900_000,
  });
  await mkdir(runRoot, { recursive: false });

  const stage14Receipt = await continueConnectedDevelopmentStage14V2({
    task,
    route,
    owner: buildConnectedDev04Stage4OwnerV2(),
    stage123Receipt: sourceRow.stage14Receipt.stage123Receipt,
  });
  const stage5Decision = decideConnectedDevelopmentStage5V2(stage14Receipt);
  if (stage14Receipt.stage4Receipt?.evaluation.disposition !== 'EXPECTED_CAPABILITY_GAP'
    || stage5Decision.disposition !== 'CAPABILITY_GAP') {
    throw new Error(`QWEN_DEV04_REPLAY_GAP_INVALID:${stage14Receipt.stage4Receipt?.evaluation.disposition ?? 'MISSING'}:${stage5Decision.disposition}`);
  }

  const material = {
    receiptVersion: 'EDITRON_OE_QWEN_DEV04_STAGE45_REPLAY_V2' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    scoreStatus: 'SUPPLEMENTAL_CONNECTED_REPLAY_NO_PROVIDER_CALL' as const,
    createdAt,
    sourceReceiptPath: sourcePath,
    sourceCohortReceiptHash: source.receiptHash,
    sourceStage123ReceiptHash: sourceRow.stage14Receipt.stage123Receipt.receiptHash,
    stage14Receipt,
    stage5Decision,
    providerCallCount: 0,
    stateEffects: [] as const,
  };
  const receipt = { ...material, receiptHash: hashCanonicalJsonV1(material) };
  const receiptPath = path.join(runRoot, 'qwen-dev04-stage45-replay-result.json');
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({
    runId,
    receiptPath,
    receiptHash: receipt.receiptHash,
    stage4: stage14Receipt.stage4Receipt.evaluation.disposition,
    stage5: stage5Decision.disposition,
    missingCapabilityIds: stage5Decision.missingCapabilityIds,
    providerCallCount: 0,
  })}\n`);
}

function verifySource(source: ConnectedDevelopmentCohortReceiptV2): void {
  const { receiptHash, ...unsigned } = source;
  if (receiptHash !== hashCanonicalJsonV1(unsigned)
    || source.authority !== 'RESEARCH_ONLY_NO_PROJECT_MUTATION') {
    throw new Error('QWEN_DEV04_REPLAY_SOURCE_INVALID');
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`QWEN_DEV04_STAGE45_REPLAY_FAILED:${message.replace(/[\r\n]+/g, ' ').slice(0, 800)}\n`);
  process.exitCode = 1;
});
