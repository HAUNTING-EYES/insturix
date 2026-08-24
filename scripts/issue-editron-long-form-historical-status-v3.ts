import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';

import { issueStage25LongFormHistoricalStatusV3 }
  from '../lib/editron/research/open-ended-planner/stage25-long-form-historical-status-v3';
import {
  buildStage25LongFormProviderCohortManifestV3,
  STAGE25_LONG_FORM_PROVIDER_COHORT_PATH_V3,
} from '../lib/editron/research/open-ended-planner/stage25-long-form-plan-provider-cohort-v3';
import { issueStage25LongFormNoSpendReadinessV3 }
  from '../lib/editron/research/open-ended-planner/stage25-long-form-no-spend-readiness-v3';

const rootDir = process.cwd();
const historicalRoot = resolve(
  rootDir,
  '.calibration-temp/open-ended-planner-v2/',
  'stage25-long-form-provider-v2-20260824-phase2-5a38d083',
);
const successorManifest = buildStage25LongFormProviderCohortManifestV3({
  contractSourceSha256: fileSha(resolve(rootDir, STAGE25_LONG_FORM_PROVIDER_COHORT_PATH_V3)),
});
const readinessReceipt = await issueStage25LongFormNoSpendReadinessV3({
  manifest: successorManifest, rootDir,
});
const eventsRoot = resolve(historicalRoot, 'durable-events');
const historicalEvents = readdirSync(eventsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => resolve(eventsRoot, entry.name, '0002-row.json'))
  .filter(existsSync)
  .sort()
  .map(readJson);
const receipt = await issueStage25LongFormHistoricalStatusV3({
  successorManifest,
  readinessReceipt,
  historicalManifest: readJson(resolve(historicalRoot, 'provider-manifest-v2.json')),
  historicalCohortReceipt: readJson(resolve(historicalRoot, 'paid-cohort-receipt-v2.json')),
  historicalEvents,
  rootDir,
});

const explicitOutput = process.argv.find((argument) => argument.startsWith('--output='))
  ?.slice('--output='.length);
const outputPath = explicitOutput ? resolve(rootDir, explicitOutput) : resolve(
  rootDir,
  '.calibration-temp/historical-benchmark-status/long-form-v3',
  `${receipt.receiptSha256}.json`,
);
const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
if (existsSync(outputPath) && readFileSync(outputPath, 'utf8') !== serialized) {
  throw new Error(`LONG_FORM_HISTORICAL_STATUS_OUTPUT_COLLISION:${outputPath}`);
}
mkdirSync(dirname(outputPath), { recursive: true });
if (!existsSync(outputPath)) writeFileSync(outputPath, serialized, 'utf8');

process.stdout.write(`${JSON.stringify({
  outputPath,
  receiptSha256: receipt.receiptSha256,
  statusReceiptSha256: receipt.statusReceipt.receiptSha256,
  sourceArtifactSetSha256: receipt.statusReceipt.sourceArtifactSetSha256,
  historicalStatusCounts: receipt.statusReceipt.counts,
  currentCompatibilityCounts: receipt.currentCompatibilityCounts,
  providerInferenceCalls: receipt.providerInferenceCalls,
  networkCalls: receipt.networkCalls,
  projectReads: receipt.projectReads,
  projectMutations: receipt.projectMutations,
  mediaWrites: receipt.mediaWrites,
}, null, 2)}\n`);

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8')) as unknown;
}
function fileSha(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
