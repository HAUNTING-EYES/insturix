import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { hashCanonicalJsonV1 } from '../lib/editron/research/open-ended-planner/contracts-v1';
import { executeConnectedDev02HybridMechanicsV2 } from '../lib/editron/research/open-ended-planner/dev02-connected-hybrid-mechanics-v2';
import { buildDevelopmentCohortCasesV2 } from '../lib/editron/research/open-ended-planner/development-cohort-cases-v2';
import { buildDevelopmentMechanicsMapV2 } from '../lib/editron/research/open-ended-planner/development-cohort-mechanics-v2';
import { continueConnectedDevelopmentStage14V2 } from '../lib/editron/research/open-ended-planner/development-connected-stage14-runner-v2';
import type { ConnectedDevelopmentStage123ReceiptV2 } from '../lib/editron/research/open-ended-planner/development-connected-stage123-runner-v2';
import { buildConnectedDevelopmentStage4OwnerForTaskV2 } from '../lib/editron/research/open-ended-planner/development-connected-stage4-owners-v2';
import { decideConnectedDevelopmentStage5V2 } from '../lib/editron/research/open-ended-planner/development-connected-stage5-gate-v2';
import type { DevelopmentModelRouteV2 } from '../lib/editron/research/open-ended-planner/development-cohort-runner-v2';
import { buildCanonicalDev03MeasuredEvidenceV2 } from '../lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';

const DEFAULT_SOURCE = '.calibration-temp/open-ended-planner-v2/cohort-runs/'
  + 'qwen-dev02-stage3-20260816201735/qwen-dev02-stage3-continuation-result.json';

async function main(): Promise<void> {
  const sourcePath = process.argv[2] ?? DEFAULT_SOURCE;
  const createdAt = new Date().toISOString();
  const runId = `qwen-dev02-stage46-replay-${createdAt.replace(/[^0-9]/g, '').slice(0, 14)}`;
  const evidenceRoot = path.resolve('.calibration-temp/open-ended-planner-v2/cohort-runs');
  const runRoot = path.join(evidenceRoot, runId);
  const [sourceBytes, audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile(sourcePath, 'utf8'),
    readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'),
    readFile('lib/editron/services/media/beat-detection-service.ts'),
  ]);
  const source = JSON.parse(sourceBytes) as {
    continuation?: { stage123Receipt?: ConnectedDevelopmentStage123ReceiptV2 };
  };
  const stage123Receipt = source.continuation?.stage123Receipt;
  if (!stage123Receipt) throw new Error('QWEN_DEV02_STAGE123_SOURCE_MISSING');
  const measured = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
  const mechanics = buildDevelopmentMechanicsMapV2({ measuredDev03: measured, evidenceRoot, runId, createdAt });
  const task = buildDevelopmentCohortCasesV2({ measuredDev03: measured, mechanics })
    .find((candidate) => candidate.taskId === 'DEV-02');
  if (!task) throw new Error('QWEN_DEV02_TASK_MISSING');
  const route: DevelopmentModelRouteV2 = {
    routeId: stage123Receipt.routeId,
    claimedModelIdentity: stage123Receipt.claimedModelIdentity,
    costBasis: stage123Receipt.costBasis,
    runStage: async () => { throw new Error('QWEN_DEV02_STAGE4_REPLAY_PROVIDER_CALL_FORBIDDEN'); },
  };
  await mkdir(runRoot, { recursive: false });
  const stage14Receipt = await continueConnectedDevelopmentStage14V2({
    task,
    route,
    owner: buildConnectedDevelopmentStage4OwnerForTaskV2({ taskId: 'DEV-02', measuredDev03: measured }),
    stage123Receipt,
  });
  const stage5Decision = decideConnectedDevelopmentStage5V2(stage14Receipt);
  const compiledGraph = stage14Receipt.stage4Receipt?.compiledArtifact;
  if (stage14Receipt.stage4Receipt?.evaluation.disposition !== 'PASS'
    || stage5Decision.disposition !== 'PROCEED'
    || !compiledGraph) {
    throw new Error('QWEN_DEV02_STAGE46_NOT_AUTHORIZED');
  }
  const stage6Mechanics = await executeConnectedDev02HybridMechanicsV2({
    outputRoot: path.join(runRoot, 'stage6'),
    runId,
    createdAt,
    hybridGraph: compiledGraph,
  });
  const material = {
    receiptVersion: 'EDITRON_OE_QWEN_DEV02_STAGE46_REPLAY_RESULT_V2' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    createdAt,
    sourceReceiptPath: sourcePath,
    sourceStage123ReceiptHash: stage123Receipt.receiptHash,
    stage14Receipt,
    stage5Decision,
    stage6Mechanics,
    providerCallCount: 0 as const,
    stateEffects: [] as const,
  };
  const result = { ...material, receiptHash: hashCanonicalJsonV1(material) };
  const resultPath = path.join(runRoot, 'qwen-dev02-stage46-replay-result.json');
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({
    runId,
    resultPath,
    receiptHash: result.receiptHash,
    stage4: stage14Receipt.stage4Receipt?.evaluation.disposition ?? null,
    stage5: stage5Decision.disposition,
    selectedContinuationOperator: selectedContinuationOperator(compiledGraph),
    stage6ReceiptHash: stage6Mechanics.hybridStage6ReceiptHash,
    hybridVideoPath: stage6Mechanics.hybridVideoPath,
    providerCallCount: 0,
  })}\n`);
}

function selectedContinuationOperator(graph: unknown): unknown {
  const record = graph && typeof graph === 'object' && !Array.isArray(graph)
    ? graph as Record<string, unknown> : {};
  const nodes = Array.isArray(record.nodes) ? record.nodes : [];
  const node = nodes.find((entry) => entry && typeof entry === 'object'
    && !Array.isArray(entry)
    && (entry as Record<string, unknown>).nodeId === 'compile-resolve-native-continuation');
  return node && typeof node === 'object' ? (node as Record<string, unknown>).operatorId : null;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`QWEN_DEV02_STAGE4_REPLAY_FAILED:${message.replace(/[\r\n]+/g, ' ').slice(0, 1000)}\n`);
  process.exitCode = 1;
});
