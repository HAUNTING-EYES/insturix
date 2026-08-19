import { config as loadEnv } from 'dotenv';
import path from 'node:path';

import {
  prepareV2RLiveCohortV2R,
  runV2RLiveCohortV2R,
} from '../lib/editron/research/open-ended-planner/v2r-live-cohort-v2r';
import { V2R_EXPERIMENT_VERSION } from '../lib/editron/research/open-ended-planner/v2r-preregistration-manifest';

loadEnv({ path: path.resolve('.env.local'), override: false, quiet: true });

function option(name: string): string | null {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function safeTimestamp(value: string): string {
  return value.replace(/[-:.TZ]/g, '').slice(0, 14);
}

function experimentCohortPrefix(): string {
  const match = /_V(\d+)$/.exec(V2R_EXPERIMENT_VERSION);
  if (!match) throw new Error('V2R_EXPERIMENT_VERSION_COHORT_PREFIX_INVALID');
  return `v2r-v${match[1]}`;
}

async function main(): Promise<void> {
  const prepared = await prepareV2RLiveCohortV2R({ environment: process.env });
  const runRequested = process.argv.includes('--run');
  const operatorView = {
    mode: runRequested ? 'RUN_REQUESTED' : 'NO_SPEND_PREFLIGHT',
    ...prepared.preflight,
    requiredConfirmation: {
      manifestSha256: prepared.manifest.manifestSha256,
      absoluteMaxMeteredSpendUsd: prepared.preflight.absoluteMaxMeteredSpendUsd,
      unpricedRouteIds: prepared.preflight.unpricedRouteIds,
    },
  };
  process.stdout.write(`${JSON.stringify(operatorView, null, 2)}\n`);
  if (!runRequested) return;

  if (option('--confirm-manifest') !== prepared.manifest.manifestSha256) {
    throw new Error('V2R_LIVE_RUN_MANIFEST_CONFIRMATION_MISMATCH');
  }
  const confirmedMax = Number(option('--confirm-max-metered-usd'));
  if (!Number.isFinite(confirmedMax)
    || confirmedMax !== prepared.preflight.absoluteMaxMeteredSpendUsd) {
    throw new Error('V2R_LIVE_RUN_SPEND_CONFIRMATION_MISMATCH');
  }

  const createdAt = new Date().toISOString();
  const cohortId = `${experimentCohortPrefix()}-${safeTimestamp(createdAt)}`;
  const outputDir = path.resolve(
    '.calibration-temp/open-ended-planner-v2/v2r-cohorts', cohortId,
  );
  const execution = await runV2RLiveCohortV2R({
    environment: process.env, cohortId, createdAt, outputDir,
  });
  process.stdout.write(`${JSON.stringify({
    cohortId,
    outputDir,
    receiptPath: execution.receiptPath,
    receiptSha256: execution.receipt.receiptSha256,
    runDisposition: execution.receipt.runDisposition,
    stage7Disposition: execution.receipt.stage7Disposition,
    actualProviderCostUsd: execution.receipt.actualProviderCostUsd,
    providerCostCoverage: execution.receipt.providerCostCoverage,
  }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
