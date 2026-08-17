import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from 'dotenv';

import { hashCanonicalJsonV1 } from '../lib/editron/research/open-ended-planner/contracts-v1';
import { executeDev01Stage6NativeProxyV2 } from '../lib/editron/research/open-ended-planner/dev01-stage6-native-proxy-executor-v2';
import { evaluateDev01Stage6NativeProxyV2 } from '../lib/editron/research/open-ended-planner/dev01-stage6-native-proxy-evaluator-v2';
import { executeConnectedDev02HybridMechanicsV2 } from '../lib/editron/research/open-ended-planner/dev02-connected-hybrid-mechanics-v2';
import { buildDevelopmentCohortCasesV2 } from '../lib/editron/research/open-ended-planner/development-cohort-cases-v2';
import { buildDevelopmentMechanicsMapV2 } from '../lib/editron/research/open-ended-planner/development-cohort-mechanics-v2';
import type { ConnectedDevelopmentStage14ReceiptV2 } from '../lib/editron/research/open-ended-planner/development-connected-stage14-runner-v2';
import type { ConnectedProceedOrStopDecisionV2 } from '../lib/editron/research/open-ended-planner/development-connected-stage5-gate-v2';
import { buildCanonicalDev03MeasuredEvidenceV2 } from '../lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import { executeDev03Stage6NativeProxyV2 } from '../lib/editron/research/open-ended-planner/dev03-stage6-native-proxy-executor-v2';
import { evaluateDev03Stage6NativeProxyV2 } from '../lib/editron/research/open-ended-planner/dev03-stage6-native-proxy-evaluator-v2';

type TaskId = 'DEV-01' | 'DEV-02' | 'DEV-03';
type JsonRecord = Record<string, unknown>;
interface DirectBatchV2 {
  receiptVersion: 'EDITRON_OE_DIRECT_CONNECTED_CONTINUATION_BATCH_V2';
  authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION';
  routeId: string;
  claimedModelIdentity: string;
  rows: Array<{
    taskId: string;
    stage14Receipt: ConnectedDevelopmentStage14ReceiptV2;
    stage5Decision: ConnectedProceedOrStopDecisionV2;
  }>;
  receiptHash: string;
}

async function main(): Promise<void> {
  config({ path: '.env.local', quiet: true });
  config({ path: '.env.local.vercel', override: false, quiet: true });
  config({ path: '.calibration-temp/vercel-sandbox-env.local', override: true, quiet: true });
  const sourcePath = requiredArg(process.argv[2], 'source batch path');
  const taskId = parseTaskId(process.argv[3]);
  const createdAt = new Date().toISOString();
  const runId = `direct-stage6-${taskId.toLowerCase()}-${createdAt.replace(/[^0-9]/g, '').slice(0, 14)}`;
  const evidenceRoot = path.resolve('.calibration-temp/open-ended-planner-v2/cohort-runs');
  const runRoot = path.join(evidenceRoot, runId);
  const [sourceBytes, audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile(sourcePath, 'utf8'),
    readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'),
    readFile('lib/editron/services/media/beat-detection-service.ts'),
  ]);
  const source = JSON.parse(sourceBytes) as DirectBatchV2;
  verifySource(source);
  const sourceRow = source.rows.find((candidate) => candidate.taskId === taskId);
  if (!sourceRow) throw new Error(`DIRECT_STAGE6_SOURCE_TASK_MISSING:${taskId}`);
  if (sourceRow.stage14Receipt.stage4Receipt?.evaluation.disposition !== 'PASS'
    || sourceRow.stage5Decision.disposition !== 'PROCEED') {
    throw new Error(`DIRECT_STAGE6_NOT_AUTHORIZED:${taskId}:${sourceRow.stage14Receipt.stage4Receipt?.evaluation.disposition ?? 'NO_STAGE4'}:${sourceRow.stage5Decision.disposition}`);
  }
  const graph = sourceRow.stage14Receipt.stage4Receipt.compiledArtifact;
  if (!graph) throw new Error(`DIRECT_STAGE6_GRAPH_MISSING:${taskId}`);
  await mkdir(runRoot, { recursive: false });

  const execution = taskId === 'DEV-01'
    ? await executeDev01({ sourceRow, graph, runRoot, runId, createdAt, audioBytes, analyzerSourceBytes })
    : taskId === 'DEV-02'
      ? await executeDev02({ graph, runRoot, runId, createdAt })
      : await executeDev03({ graph, runRoot, runId, createdAt });
  const material = {
    receiptVersion: 'EDITRON_OE_DIRECT_STAGE6_RESULT_V2' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    createdAt,
    sourceReceiptPath: sourcePath,
    sourceReceiptHash: source.receiptHash,
    sourceStage14ReceiptHash: sourceRow.stage14Receipt.receiptHash,
    sourceStage5DecisionHash: sourceRow.stage5Decision.decisionHash,
    routeId: source.routeId,
    claimedModelIdentity: source.claimedModelIdentity,
    taskId,
    execution,
    providerCallCount: 0 as const,
    stateEffects: [] as const,
  };
  const result = { ...material, receiptHash: hashCanonicalJsonV1(material) };
  const resultPath = path.join(runRoot, 'direct-stage6-result.json');
  await writeJson(resultPath, result);
  process.stdout.write(`${JSON.stringify({
    runId,
    resultPath,
    receiptHash: result.receiptHash,
    routeId: source.routeId,
    taskId,
    assessment: 'PASS',
    providerCallCount: 0,
  })}\n`);
}

async function executeDev01(input: {
  sourceRow: DirectBatchV2['rows'][number];
  graph: JsonRecord;
  runRoot: string;
  runId: string;
  createdAt: string;
  audioBytes: Uint8Array;
  analyzerSourceBytes: Uint8Array;
}) {
  const measured = await buildCanonicalDev03MeasuredEvidenceV2({
    audioBytes: input.audioBytes,
    analyzerSourceBytes: input.analyzerSourceBytes,
  });
  const mechanics = buildDevelopmentMechanicsMapV2({
    measuredDev03: measured,
    evidenceRoot: path.dirname(input.runRoot),
    runId: input.runId,
    createdAt: input.createdAt,
  });
  const task = buildDevelopmentCohortCasesV2({ measuredDev03: measured, mechanics })
    .find((candidate) => candidate.taskId === 'DEV-01');
  if (!task) throw new Error('DIRECT_STAGE6_DEV01_TASK_MISSING');
  const rows = input.sourceRow.stage14Receipt.stage123Receipt.rows;
  const source = {
    referenceBlueprint: requiredArtifact(rows.find(({ stage }) => stage === 1)?.providerRun.artifact, 1),
    editorialIntent: requiredArtifact(rows.find(({ stage }) => stage === 2)?.providerRun.artifact, 2),
    evidenceBoundIntent: requiredArtifact(rows.find(({ stage }) => stage === 3)?.providerRun.artifact, 3),
    evidencePack: task.canonical.evidencePack,
  };
  const evidence = await executeDev01Stage6NativeProxyV2({
    graph: input.graph,
    source,
    executionId: input.runId,
    createdAt: input.createdAt,
    outputDir: path.join(input.runRoot, 'stage6'),
  });
  const evaluation = await evaluateDev01Stage6NativeProxyV2({ graph: input.graph, source, evidence });
  if (evaluation.assessment !== 'PASS') throw new Error(`DIRECT_STAGE6_DEV01_FAILED:${evaluation.diagnostics.join('|')}`);
  return { stage6ReceiptHash: evidence.receipt.receiptHash, stage6ReceiptPath: evidence.receiptPath, evaluation };
}

async function executeDev02(input: {
  graph: JsonRecord;
  runRoot: string;
  runId: string;
  createdAt: string;
}) {
  const mechanics = await executeConnectedDev02HybridMechanicsV2({
    outputRoot: path.join(input.runRoot, 'stage6'),
    runId: input.runId,
    createdAt: input.createdAt,
    hybridGraph: input.graph,
  });
  return { ...mechanics, assessment: 'PASS' as const };
}

async function executeDev03(input: {
  graph: JsonRecord;
  runRoot: string;
  runId: string;
  createdAt: string;
}) {
  const evidence = await executeDev03Stage6NativeProxyV2({
    graph: input.graph,
    executionId: input.runId,
    createdAt: input.createdAt,
    outputDir: path.join(input.runRoot, 'stage6'),
  });
  const evaluation = await evaluateDev03Stage6NativeProxyV2({ graph: input.graph, evidence });
  if (evaluation.assessment !== 'PASS') throw new Error(`DIRECT_STAGE6_DEV03_FAILED:${evaluation.diagnostics.join('|')}`);
  return { stage6ReceiptHash: evidence.receipt.receiptHash, stage6ReceiptPath: evidence.receiptPath, evaluation };
}

function verifySource(source: DirectBatchV2): void {
  const { receiptHash, ...unsigned } = source;
  if (source.receiptVersion !== 'EDITRON_OE_DIRECT_CONNECTED_CONTINUATION_BATCH_V2'
    || source.authority !== 'RESEARCH_ONLY_NO_PROJECT_MUTATION'
    || receiptHash !== hashCanonicalJsonV1(unsigned)) throw new Error('DIRECT_STAGE6_SOURCE_INVALID');
}

function requiredArtifact(value: JsonRecord | null | undefined, stage: number): JsonRecord {
  if (!value) throw new Error(`DIRECT_STAGE6_STAGE${stage}_ARTIFACT_MISSING`);
  return value;
}

function parseTaskId(value: string | undefined): TaskId {
  if (!['DEV-01', 'DEV-02', 'DEV-03'].includes(value ?? '')) {
    throw new Error('Usage: tsx scripts/execute-editron-direct-stage6-v2.ts <source-batch.json> <DEV-01|DEV-02|DEV-03>');
  }
  return value as TaskId;
}

function requiredArg(value: string | undefined, label: string): string {
  const result = value?.trim() ?? '';
  if (!result) throw new Error(`DIRECT_STAGE6_ARGUMENT_MISSING:${label}`);
  return result;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`DIRECT_STAGE6_FAILED:${message.replace(/[\r\n]+/g, ' ').slice(0, 1000)}\n`);
  process.exitCode = 1;
});
