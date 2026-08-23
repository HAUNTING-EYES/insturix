import { config as loadEnv } from 'dotenv';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildCanonicalDev03MeasuredEvidenceV2 } from '../lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import {
  buildProviderNativeHandoffOrderManifestV2R,
  preflightProviderNativeHandoffOrderV2R,
  runProviderNativeHandoffOrderExperimentV2R,
} from '../lib/editron/research/open-ended-planner/provider-native-handoff-order-experiment-v2r';
import { buildV2RBenchmarkTaskRegistryV2 } from '../lib/editron/research/open-ended-planner/v2r-benchmark-task-registry';

const repoRoot = process.cwd();
loadEnv({ path: path.join(repoRoot, '.env.local'), override: false, quiet: true });
loadEnv({ path: path.join(repoRoot, '.env.local.vercel'), override: false, quiet: true });

function option(name: string): string | null {
  const prefix = `${name}=`;
  const found = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

async function main(): Promise<void> {
  const [audioBytes, analyzerSourceBytes] = await Promise.all([
    readFile(path.join(repoRoot, '.calibration-temp', 'open-ended-planner-v2', 'development-media', 'dev03-beats.wav')),
    readFile(path.join(repoRoot, 'lib', 'editron', 'services', 'media', 'beat-detection-service.ts')),
  ]);
  const measured = await buildCanonicalDev03MeasuredEvidenceV2({
    audioBytes, analyzerSourceBytes,
  });
  const registry = buildV2RBenchmarkTaskRegistryV2({ dev03MeasuredEvidence: measured });
  const manifest = buildProviderNativeHandoffOrderManifestV2R(registry);
  const preflight = await preflightProviderNativeHandoffOrderV2R({
    manifest, environment: process.env,
  });
  const repetitions = Number(option('--repetitions') ?? '3');
  if (!Number.isSafeInteger(repetitions) || repetitions < 1
    || repetitions > manifest.repetitionsPerRouteArm) {
    throw new Error('PROVIDER_NATIVE_HANDOFF_ORDER_CLI_REPETITIONS_INVALID');
  }
  const requestedMaxSpendUsd = Number((
    manifest.absoluteMaxSpendUsd * repetitions / manifest.repetitionsPerRouteArm
  ).toFixed(6));
  const runRequested = process.argv.includes('--run');
  const createdAt = new Date().toISOString();
  const artifactRoot = option('--output-root')
    ? path.resolve(option('--output-root') as string)
    : path.join(repoRoot, '.calibration-temp', 'open-ended-planner-v2',
      `provider-native-handoff-order-${runRequested ? 'run' : 'preflight'}-${stamp(createdAt)}`);
  await mkdir(artifactRoot, { recursive: false });
  await Promise.all([
    writeJson(path.join(artifactRoot, 'manifest.json'), manifest),
    writeJson(path.join(artifactRoot, 'preflight.json'), preflight),
  ]);
  process.stdout.write(`${JSON.stringify({
    mode: runRequested ? 'RUN_REQUESTED' : 'NO_SPEND_PREFLIGHT',
    artifactRoot,
    manifestSha256: manifest.manifestSha256,
    models: manifest.routes.map(({ route }) => route.model),
    arms: manifest.arms,
    repetitions,
    operatorOrderPresentedToModels: manifest.episodeOperatorOrder,
    requiredCausalOrder: manifest.requiredCausalOrder,
    requestedMaxSpendUsd,
    preflightReceiptSha256: preflight.receiptSha256,
  }, null, 2)}\n`);
  if (!runRequested) return;
  if (option('--confirm-manifest') !== manifest.manifestSha256) {
    throw new Error('PROVIDER_NATIVE_HANDOFF_ORDER_CLI_MANIFEST_CONFIRMATION_MISMATCH');
  }
  if (Number(option('--confirm-max-usd')) !== requestedMaxSpendUsd) {
    throw new Error('PROVIDER_NATIVE_HANDOFF_ORDER_CLI_SPEND_CONFIRMATION_MISMATCH');
  }
  const receipt = await runProviderNativeHandoffOrderExperimentV2R({
    manifest, environment: process.env,
    outputRoot: path.join(artifactRoot, 'experiment'), repetitions,
  });
  process.stdout.write(`${JSON.stringify({
    experimentReceiptPath: path.join(artifactRoot, 'experiment', 'experiment-receipt.json'),
    receiptSha256: receipt.receiptSha256,
    passCount: receipt.passCount,
    failCount: receipt.failCount,
  }, null, 2)}\n`);
}

function stamp(value: string): string {
  return value.replace(/[-:.TZ]/g, '').slice(0, 14);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8', flag: 'wx',
  });
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
