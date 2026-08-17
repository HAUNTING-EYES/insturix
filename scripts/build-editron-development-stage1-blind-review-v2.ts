import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildDevelopmentCohortCasesV2, type DevelopmentMechanicsMapV2 } from '../lib/editron/research/open-ended-planner/development-cohort-cases-v2';
import { DEVELOPMENT_COHORT_TASK_IDS_V2, type DevelopmentCohortReceiptV2 } from '../lib/editron/research/open-ended-planner/development-cohort-runner-v2';
import { buildCanonicalDev03MeasuredEvidenceV2 } from '../lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import { buildDevelopmentStage1BlindReviewPackV2 } from '../lib/editron/research/open-ended-planner/development-stage1-blind-review-v2';

async function main(): Promise<void> {
  const receiptPath = path.resolve(process.argv[2] ?? '');
  if (!process.argv[2] || path.extname(receiptPath).toLowerCase() !== '.json') {
    throw new Error('STAGE1_REVIEW_SOURCE_RECEIPT_PATH_REQUIRED');
  }
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8')) as DevelopmentCohortReceiptV2;
  const [audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile('.calibration-temp/open-ended-planner-v2/development-media/dev03-beats.wav'),
    readFile('lib/editron/services/media/beat-detection-service.ts'),
  ]);
  const measuredDev03 = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
  const unavailableMechanic = (taskId: typeof DEVELOPMENT_COHORT_TASK_IDS_V2[number]) => async () => {
    throw new Error(`STAGE1_REVIEW_MECHANICS_MUST_NOT_RUN:${taskId}`);
  };
  const unusedMechanics: DevelopmentMechanicsMapV2 = {
    'DEV-01': unavailableMechanic('DEV-01'),
    'DEV-02': unavailableMechanic('DEV-02'),
    'DEV-03': unavailableMechanic('DEV-03'),
    'DEV-04': unavailableMechanic('DEV-04'),
  };
  const cases = buildDevelopmentCohortCasesV2({ measuredDev03, mechanics: unusedMechanics });
  const createdAt = new Date().toISOString();
  const outputRoot = path.join(path.dirname(receiptPath), 'stage1-blind-review');
  const pack = await buildDevelopmentStage1BlindReviewPackV2({
    outputRoot, createdAt, cohortReceipt: receipt,
    stageOnePackets: cases.map(({ stageOnePacket }) => stageOnePacket),
  });
  const buildReceipt = {
    receiptVersion: 'EDITRON_OE_DEVELOPMENT_STAGE1_BLIND_REVIEW_BUILD_RECEIPT_V2',
    authority: 'RESEARCH_ONLY_NO_PROJECT_MUTATION',
    sourceCohortReceiptHash: receipt.receiptHash,
    createdAt,
    reviewStatus: pack.reviewStatus,
    publicPackHash: pack.publicPackHash,
    operatorKeyHash: pack.operatorKeyHash,
    reviewerManifestPath: pack.reviewerManifestPath,
    reviewFormTemplatePath: pack.reviewFormTemplatePath,
    operatorKeyPath: pack.operatorKeyPath,
    providerCalls: 0,
    stateEffects: [],
  };
  await writeFile(path.join(outputRoot, 'build-receipt.json'), `${JSON.stringify(buildReceipt, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify(buildReceipt)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`STAGE1_REVIEW_BUILD_FAILED:${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
