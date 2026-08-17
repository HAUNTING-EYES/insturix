import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from 'dotenv';

import { hashCanonicalJsonV1 } from '../lib/editron/research/open-ended-planner/contracts-v1';
import { executeDev01Stage6NativeProxyV2 } from '../lib/editron/research/open-ended-planner/dev01-stage6-native-proxy-executor-v2';
import { evaluateDev01Stage6NativeProxyV2 } from '../lib/editron/research/open-ended-planner/dev01-stage6-native-proxy-evaluator-v2';
import { buildDevelopmentCohortCasesV2 } from '../lib/editron/research/open-ended-planner/development-cohort-cases-v2';
import { buildDevelopmentMechanicsMapV2 } from '../lib/editron/research/open-ended-planner/development-cohort-mechanics-v2';
import { buildQwenDevelopmentModelRouteV2 } from '../lib/editron/research/open-ended-planner/development-cohort-routes-v2';
import { continueConnectedDevelopmentStage14V2 } from '../lib/editron/research/open-ended-planner/development-connected-stage14-runner-v2';
import { buildConnectedDev01Stage4OwnerV2 } from '../lib/editron/research/open-ended-planner/development-connected-stage4-owners-v2';
import { decideConnectedDevelopmentStage5V2 } from '../lib/editron/research/open-ended-planner/development-connected-stage5-gate-v2';
import type { ConnectedDevelopmentStage123ReceiptV2 } from '../lib/editron/research/open-ended-planner/development-connected-stage123-runner-v2';
import { buildCanonicalDev03MeasuredEvidenceV2 } from '../lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';

const DEFAULT_SOURCE = '.calibration-temp/open-ended-planner-v2/cohort-runs/'
  + 'qwen-continuation-20260816221238/dev-01-continuation-receipt.json';

type JsonRecord = Record<string, unknown>;

async function main(): Promise<void> {
  config({ path: '.env.local', quiet: true });
  const sourcePath = process.argv[2] ?? DEFAULT_SOURCE;
  const createdAt = new Date().toISOString();
  const runId = `qwen-dev01-stage46-${createdAt.replace(/[^0-9]/g, '').slice(0, 14)}`;
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
  if (source.taskId !== 'DEV-01') throw new Error('QWEN_DEV01_REPLAY_SOURCE_TASK_INVALID');
  verifyStage123(source.continuation.stage123Receipt);

  const measured = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
  const mechanics = buildDevelopmentMechanicsMapV2({
    measuredDev03: measured,
    evidenceRoot,
    runId,
    createdAt,
  });
  const task = buildDevelopmentCohortCasesV2({ measuredDev03: measured, mechanics })
    .find((candidate) => candidate.taskId === 'DEV-01');
  if (!task) throw new Error('QWEN_DEV01_REPLAY_TASK_MISSING');
  const route = buildQwenDevelopmentModelRouteV2({
    environment: process.env,
    qwenBudgetMode: 'ASYNC_QUALITY_DIAGNOSTIC',
    diagnosticTimeoutOverrideMs: 900_000,
  });
  await mkdir(runRoot, { recursive: false });

  const stage14Receipt = await continueConnectedDevelopmentStage14V2({
    task,
    route,
    owner: buildConnectedDev01Stage4OwnerV2(),
    stage123Receipt: source.continuation.stage123Receipt,
  });
  const stage5Decision = decideConnectedDevelopmentStage5V2(stage14Receipt);
  if (stage5Decision.disposition !== 'PROCEED') {
    throw new Error(`QWEN_DEV01_REPLAY_STAGE5_BLOCKED:${stage5Decision.disposition}:${stage5Decision.reasonCode}`);
  }
  const graph = stage14Receipt.stage4Receipt?.compiledArtifact;
  if (!graph) throw new Error('QWEN_DEV01_REPLAY_STAGE4_GRAPH_MISSING');
  const stage123Rows = source.continuation.stage123Receipt.rows;
  const referenceBlueprint = requiredArtifact(stage123Rows.find(({ stage }) => stage === 1)?.providerRun.artifact, 1);
  const editorialIntent = requiredArtifact(stage123Rows.find(({ stage }) => stage === 2)?.providerRun.artifact, 2);
  const evidenceBoundIntent = requiredArtifact(stage123Rows.find(({ stage }) => stage === 3)?.providerRun.artifact, 3);
  const compilerSource = {
    referenceBlueprint,
    editorialIntent,
    evidenceBoundIntent,
    evidencePack: task.canonical.evidencePack,
  };
  const stage6Evidence = await executeDev01Stage6NativeProxyV2({
    graph,
    source: compilerSource,
    executionId: runId,
    createdAt,
    outputDir: path.join(runRoot, 'stage6'),
  });
  const stage6Evaluation = await evaluateDev01Stage6NativeProxyV2({
    graph,
    source: compilerSource,
    evidence: stage6Evidence,
  });
  if (stage6Evaluation.assessment !== 'PASS') {
    throw new Error(`QWEN_DEV01_REPLAY_STAGE6_INVALID:${stage6Evaluation.diagnostics.join('|')}`);
  }

  const material = {
    receiptVersion: 'EDITRON_OE_QWEN_DEV01_STAGE46_REPLAY_V2' as const,
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
  const receiptPath = path.join(runRoot, 'qwen-dev01-stage46-replay-result.json');
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
    || receipt.taskId !== 'DEV-01'
    || receipt.finalDisposition !== 'STAGE3_EVALUATED') {
    throw new Error('QWEN_DEV01_REPLAY_STAGE123_INVALID');
  }
}

function requiredArtifact(value: JsonRecord | null | undefined, stage: number): JsonRecord {
  if (!value) throw new Error(`QWEN_DEV01_REPLAY_STAGE${stage}_ARTIFACT_MISSING`);
  return value;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`QWEN_DEV01_STAGE46_REPLAY_FAILED:${message.replace(/[\r\n]+/g, ' ').slice(0, 800)}\n`);
  process.exitCode = 1;
});
