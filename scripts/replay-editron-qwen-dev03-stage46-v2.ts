import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from 'dotenv';

import { hashCanonicalJsonV1 } from '../lib/editron/research/open-ended-planner/contracts-v1';
import { buildDevelopmentCohortCasesV2 } from '../lib/editron/research/open-ended-planner/development-cohort-cases-v2';
import { buildDevelopmentMechanicsMapV2 } from '../lib/editron/research/open-ended-planner/development-cohort-mechanics-v2';
import { buildQwenDevelopmentModelRouteV2 } from '../lib/editron/research/open-ended-planner/development-cohort-routes-v2';
import { continueConnectedDevelopmentStage14V2 } from '../lib/editron/research/open-ended-planner/development-connected-stage14-runner-v2';
import { buildConnectedDev03Stage4OwnerV2 } from '../lib/editron/research/open-ended-planner/development-connected-stage4-owners-v2';
import { decideConnectedDevelopmentStage5V2 } from '../lib/editron/research/open-ended-planner/development-connected-stage5-gate-v2';
import type { ConnectedDevelopmentStage123ReceiptV2 } from '../lib/editron/research/open-ended-planner/development-connected-stage123-runner-v2';
import { buildCanonicalDev03MeasuredEvidenceV2 } from '../lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import { executeDev03Stage6NativeProxyV2 } from '../lib/editron/research/open-ended-planner/dev03-stage6-native-proxy-executor-v2';
import { evaluateDev03Stage6NativeProxyV2 } from '../lib/editron/research/open-ended-planner/dev03-stage6-native-proxy-evaluator-v2';

const DEFAULT_SOURCE = '.calibration-temp/open-ended-planner-v2/cohort-runs/'
  + 'qwen-continuation-20260816184825/dev-03-continuation-receipt.json';

async function main(): Promise<void> {
  config({ path: '.env.local', quiet: true });
  const sourcePath = process.argv[2] ?? DEFAULT_SOURCE;
  const createdAt = new Date().toISOString();
  const runId = `qwen-dev03-stage46-${createdAt.replace(/[^0-9]/g, '').slice(0, 14)}`;
  const evidenceRoot = path.resolve('.calibration-temp/open-ended-planner-v2/cohort-runs');
  const runRoot = path.join(evidenceRoot, runId);
  const [sourceBytes, audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile(sourcePath, 'utf8'),
    readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'),
    readFile('lib/editron/services/media/beat-detection-service.ts'),
  ]);
  const source = JSON.parse(sourceBytes) as {
    taskId: string;
    continuation: { stage123Receipt: ConnectedDevelopmentStage123ReceiptV2 };
  };
  if (source.taskId !== 'DEV-03') throw new Error('QWEN_DEV03_REPLAY_SOURCE_TASK_INVALID');
  verifyStage123(source.continuation.stage123Receipt);

  const measured = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
  const mechanics = buildDevelopmentMechanicsMapV2({ measuredDev03: measured, evidenceRoot, runId, createdAt });
  const task = buildDevelopmentCohortCasesV2({ measuredDev03: measured, mechanics })
    .find((candidate) => candidate.taskId === 'DEV-03');
  if (!task) throw new Error('QWEN_DEV03_REPLAY_TASK_MISSING');
  const route = buildQwenDevelopmentModelRouteV2({
    environment: process.env,
    qwenBudgetMode: 'ASYNC_QUALITY_DIAGNOSTIC',
    diagnosticTimeoutOverrideMs: 900_000,
  });
  await mkdir(runRoot, { recursive: false });

  const stage14Receipt = await continueConnectedDevelopmentStage14V2({
    task,
    route,
    owner: buildConnectedDev03Stage4OwnerV2(measured),
    stage123Receipt: source.continuation.stage123Receipt,
  });
  const stage5Decision = decideConnectedDevelopmentStage5V2(stage14Receipt);
  if (stage5Decision.disposition !== 'PROCEED') {
    throw new Error(`QWEN_DEV03_REPLAY_STAGE5_BLOCKED:${stage5Decision.disposition}:${stage5Decision.reasonCode}:${stage14Receipt.stage4Receipt?.evaluation.diagnostics.join('|') ?? 'NO_STAGE4'}`);
  }
  const graph = stage14Receipt.stage4Receipt?.compiledArtifact;
  if (!graph) throw new Error('QWEN_DEV03_REPLAY_STAGE4_GRAPH_MISSING');
  const stage6Evidence = await executeDev03Stage6NativeProxyV2({
    graph,
    executionId: runId,
    createdAt,
    outputDir: path.join(runRoot, 'stage6'),
  });
  const stage6Evaluation = await evaluateDev03Stage6NativeProxyV2({ graph, evidence: stage6Evidence });
  if (stage6Evaluation.assessment !== 'PASS') {
    throw new Error(`QWEN_DEV03_REPLAY_STAGE6_INVALID:${stage6Evaluation.diagnostics.join('|')}`);
  }

  const material = {
    receiptVersion: 'EDITRON_OE_QWEN_DEV03_STAGE46_REPLAY_V2' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    scoreStatus: 'SUPPLEMENTAL_CONNECTED_REPLAY_NO_PROVIDER_CALL' as const,
    createdAt,
    sourceReceiptPath: sourcePath,
    sourceStage123ReceiptHash: source.continuation.stage123Receipt.receiptHash,
    stage14Receipt,
    stage5Decision,
    stage6ReceiptHash: stage6Evidence.receipt.receiptHash,
    stage6ReceiptPath: stage6Evidence.receiptPath,
    stage6Evaluation,
    providerCallCount: 0,
    stateEffects: [] as const,
  };
  const receipt = { ...material, receiptHash: hashCanonicalJsonV1(material) };
  const receiptPath = path.join(runRoot, 'qwen-dev03-stage46-replay-result.json');
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({
    runId,
    receiptPath,
    receiptHash: receipt.receiptHash,
    stage4: stage14Receipt.stage4Receipt?.evaluation.disposition,
    stage5: stage5Decision.disposition,
    stage6: stage6Evaluation.assessment,
    stage6ReceiptHash: stage6Evidence.receipt.receiptHash,
    providerCallCount: 0,
  })}\n`);
}

function verifyStage123(receipt: ConnectedDevelopmentStage123ReceiptV2): void {
  const { receiptHash, ...unsigned } = receipt;
  if (receiptHash !== hashCanonicalJsonV1(unsigned)
    || receipt.authority !== 'RESEARCH_ONLY_NO_PROJECT_MUTATION'
    || receipt.taskId !== 'DEV-03'
    || receipt.finalDisposition !== 'STAGE3_EVALUATED') {
    throw new Error('QWEN_DEV03_REPLAY_STAGE123_INVALID');
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`QWEN_DEV03_STAGE46_REPLAY_FAILED:${message.replace(/[\r\n]+/g, ' ').slice(0, 800)}\n`);
  process.exitCode = 1;
});
