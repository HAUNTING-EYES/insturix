import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '../lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import {
  buildSealedHoldoutGeneralisationManifestV4R2,
  SEALED_HOLDOUT_GENERALISATION_PATH_V4R2,
} from '../lib/editron/research/open-ended-planner/sealed-holdout-generalisation-cohort-v4r2';
import { issueSealedHoldoutHistoricalStatusV4R2 }
  from '../lib/editron/research/open-ended-planner/sealed-holdout-historical-status-v4r2';
import { issueSealedHoldoutNoSpendReadinessV4R2 }
  from '../lib/editron/research/open-ended-planner/sealed-holdout-no-spend-readiness-v4r2';

const rootDir = process.cwd();
const baseManifest = buildSealedHoldoutCohortManifestV2R(
  fileSha(resolve(rootDir, SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R)),
);
const successorManifest = buildSealedHoldoutGeneralisationManifestV4R2({
  contractSourceSha256: fileSha(resolve(rootDir, SEALED_HOLDOUT_GENERALISATION_PATH_V4R2)),
  baseManifest,
});
const readinessReceipt = await issueSealedHoldoutNoSpendReadinessV4R2({
  baseManifest,
  manifest: successorManifest,
  rootDir,
});
const historicalManifest = readJson(resolve(
  rootDir, '.calibration-temp/v4r-pf-05/generalisation-manifest.json',
));
const historicalCohortReceipt = readJson(resolve(
  rootDir, '.calibration-temp/v4r-run-05/cohort-receipt.json',
));
const rowsDir = resolve(rootDir, '.calibration-temp/v4r-run-05/rows');
const rows = readdirSync(rowsDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
  .map((entry) => entry.name)
  .sort()
  .map((name) => readJson(resolve(rowsDir, name)));
const receipt = await issueSealedHoldoutHistoricalStatusV4R2({
  baseManifest,
  successorManifest,
  readinessReceipt,
  historicalManifest,
  historicalCohortReceipt,
  rows,
  rootDir,
});

const explicitOutput = process.argv.find((argument) => argument.startsWith('--output='))
  ?.slice('--output='.length);
const outputPath = explicitOutput
  ? resolve(rootDir, explicitOutput)
  : resolve(
    rootDir,
    '.calibration-temp/historical-benchmark-status/v4r2',
    `${receipt.receiptSha256}.json`,
  );
const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
if (existsSync(outputPath) && readFileSync(outputPath, 'utf8') !== serialized) {
  throw new Error(`V4R_HISTORICAL_STATUS_OUTPUT_COLLISION:${outputPath}`);
}
mkdirSync(dirname(outputPath), { recursive: true });
if (!existsSync(outputPath)) writeFileSync(outputPath, serialized, 'utf8');

process.stdout.write(`${JSON.stringify({
  outputPath,
  receiptSha256: receipt.receiptSha256,
  sourceArtifactSetSha256: receipt.sourceArtifactSetSha256,
  counts: receipt.counts,
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
