import { readFile } from 'node:fs/promises';

import {
  buildDevelopmentCohortCasesV2,
  type DevelopmentMechanicsMapV2,
} from '@/lib/editron/research/open-ended-planner/development-cohort-cases-v2';
import type {
  DevelopmentCohortTaskIdV2,
  DevelopmentStageEvaluationV2,
} from '@/lib/editron/research/open-ended-planner/development-cohort-runner-v2';
import { buildCanonicalDev03MeasuredEvidenceV2 } from '@/lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';

type JsonRecord = Record<string, unknown>;

interface StoredReceiptV2 {
  routes: Array<{
    routeId: string;
    rows: Array<{
      taskId: DevelopmentCohortTaskIdV2;
      stage: 1 | 2 | 3;
      transportDisposition: string;
      providerRun: { artifact?: JsonRecord };
      evaluation: DevelopmentStageEvaluationV2;
    }>;
  }>;
}

const receiptPath = process.argv[2]?.trim();
if (!receiptPath) throw new Error('Usage: tsx scripts/re-evaluate-editron-development-cohort-v2.ts <receipt.json>');

const [receiptBytes, audioBytes, analyzerSourceBytes] = await Promise.all([
  readFile(receiptPath, 'utf8'),
  readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'),
  readFile('lib/editron/services/media/beat-detection-service.ts'),
]);
const receipt = JSON.parse(receiptBytes) as StoredReceiptV2;
const measuredDev03 = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
const cases = buildDevelopmentCohortCasesV2({
  measuredDev03,
  mechanics: noExecutionMechanics(),
});
const casesByTask = new Map(cases.map((task) => [task.taskId, task]));

for (const route of receipt.routes) {
  for (const row of route.rows) {
    const task = casesByTask.get(row.taskId);
    if (!task) throw new Error(`Unknown cohort task: ${row.taskId}`);
    const current = row.transportDisposition === 'ARTIFACT_ACCEPTED' && row.providerRun.artifact
      ? task.evaluateStage(row.stage, row.providerRun.artifact)
      : row.evaluation;
    process.stdout.write(`${JSON.stringify({
      routeId: route.routeId,
      taskId: row.taskId,
      stage: row.stage,
      transportDisposition: row.transportDisposition,
      storedDisposition: row.evaluation.disposition,
      currentDisposition: current.disposition,
      currentDiagnostics: current.diagnostics,
    })}\n`);
  }
}

function noExecutionMechanics(): DevelopmentMechanicsMapV2 {
  return Object.fromEntries((['DEV-01', 'DEV-02', 'DEV-03', 'DEV-04'] as const).map((taskId) => [
    taskId,
    () => Promise.reject(new Error(`Re-evaluation must not execute mechanics: ${taskId}`)),
  ])) as unknown as DevelopmentMechanicsMapV2;
}
