import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from 'dotenv';

import { hashCanonicalJsonV1 } from '../lib/editron/research/open-ended-planner/contracts-v1';
import { buildDevelopmentCohortCasesV2 } from '../lib/editron/research/open-ended-planner/development-cohort-cases-v2';
import { buildDevelopmentMechanicsMapV2 } from '../lib/editron/research/open-ended-planner/development-cohort-mechanics-v2';
import { buildQwenDevelopmentModelRouteV2 } from '../lib/editron/research/open-ended-planner/development-cohort-routes-v2';
import { buildConnectedStage2ReevaluationHandoffV2 } from '../lib/editron/research/open-ended-planner/development-connected-stage1-requalification-v2';
import { continueConnectedDevelopmentStage123V2, type ConnectedDevelopmentStage123ReceiptV2 } from '../lib/editron/research/open-ended-planner/development-connected-stage123-runner-v2';
import { continueConnectedDevelopmentStage14V2 } from '../lib/editron/research/open-ended-planner/development-connected-stage14-runner-v2';
import { buildConnectedDevelopmentStage4OwnerForTaskV2 } from '../lib/editron/research/open-ended-planner/development-connected-stage4-owners-v2';
import { decideConnectedDevelopmentStage5V2 } from '../lib/editron/research/open-ended-planner/development-connected-stage5-gate-v2';
import { buildCanonicalDev03MeasuredEvidenceV2 } from '../lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';

const DEFAULT_SOURCE = '.calibration-temp/open-ended-planner-v2/cohort-runs/'
  + 'qwen-dev02-requalification-20260816195121/qwen-dev02-requalification-result.json';
const DIAGNOSTIC_TIMEOUT_MS = 900_000;

async function main(): Promise<void> {
  config({ path: '.env.local', quiet: true });
  const sourcePath = process.argv[2] ?? DEFAULT_SOURCE;
  const createdAt = new Date().toISOString();
  const runId = `qwen-dev02-stage3-${createdAt.replace(/[^0-9]/g, '').slice(0, 14)}`;
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
  const sourceReceipt = source.continuation?.stage123Receipt;
  if (!sourceReceipt) throw new Error('QWEN_DEV02_STAGE2_SOURCE_MISSING');
  const measured = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
  const mechanics = buildDevelopmentMechanicsMapV2({ measuredDev03: measured, evidenceRoot, runId, createdAt });
  const task = buildDevelopmentCohortCasesV2({ measuredDev03: measured, mechanics })
    .find((candidate) => candidate.taskId === 'DEV-02');
  if (!task) throw new Error('QWEN_DEV02_TASK_MISSING');
  const baseRoute = buildQwenDevelopmentModelRouteV2({
    environment: process.env, qwenBudgetMode: 'ASYNC_QUALITY_DIAGNOSTIC',
    diagnosticTimeoutOverrideMs: DIAGNOSTIC_TIMEOUT_MS,
  });
  await mkdir(runRoot, { recursive: false });
  let call = 0;
  const route = { ...baseRoute, runStage: async (packet: Parameters<typeof baseRoute.runStage>[0]) => {
    call += 1;
    process.stdout.write(`START QWEN DEV-02 STAGE-${packet.packet.stage} CALL-${call}\n`);
    const providerRun = await baseRoute.runStage(packet);
    await writeJson(path.join(runRoot, `provider-stage-${packet.packet.stage}-call-${call}.json`), {
      packetHash: packet.packetHash, transportHash: packet.transportHash, providerRun,
    });
    process.stdout.write(`END QWEN DEV-02 STAGE-${packet.packet.stage} CALL-${call} ${providerRun.disposition}\n`);
    return providerRun;
  } };
  const handoff = buildConnectedStage2ReevaluationHandoffV2({ task, route, sourceReceipt });
  await writeJson(path.join(runRoot, 'stage2-reevaluation-handoff.json'), handoff);
  const continuation = await continueConnectedDevelopmentStage123V2({ task, route, sourceReceipt: handoff.stage2Receipt });
  const stage14Receipt = await continueConnectedDevelopmentStage14V2({
    task, route, owner: buildConnectedDevelopmentStage4OwnerForTaskV2({ taskId: 'DEV-02', measuredDev03: measured }),
    stage123Receipt: continuation.stage123Receipt,
  });
  const stage5Decision = decideConnectedDevelopmentStage5V2(stage14Receipt);
  const material = {
    receiptVersion: 'EDITRON_OE_QWEN_DEV02_STAGE3_CONTINUATION_RESULT_V2' as const,
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION' as const,
    scoreStatus: 'SUPPLEMENTAL_EVALUATOR_CORRECTION' as const,
    createdAt, sourceReceiptPath: sourcePath, sourceReceiptHash: sourceReceipt.receiptHash,
    handoff, continuation, stage14Receipt, stage5Decision, providerCallCount: call,
    providerCostCoverage: 'TOKEN_PLAN_CREDITS_UNPRICED' as const, stateEffects: [] as const,
  };
  const result = { ...material, receiptHash: hashCanonicalJsonV1(material) };
  const resultPath = path.join(runRoot, 'qwen-dev02-stage3-continuation-result.json');
  await writeJson(resultPath, result);
  process.stdout.write(`${JSON.stringify({ runId, resultPath, receiptHash: result.receiptHash,
    stage123: continuation.stage123Receipt.finalDisposition,
    stage4: stage14Receipt.stage4Receipt?.evaluation.disposition ?? null,
    stage5: stage5Decision.disposition, providerCallCount: call })}\n`);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}
main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`QWEN_DEV02_STAGE3_FAILED:${message.replace(/[\r\n]+/g, ' ').slice(0, 1000)}\n`);
  process.exitCode = 1;
});
