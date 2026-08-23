import { config as loadEnv } from 'dotenv';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildCanonicalDev03MeasuredEvidenceV2 }
  from '../lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import {
  buildProviderNativeHandoffOrderManifestV3R,
  PROVIDER_NATIVE_HANDOFF_ORDER_EVALUATOR_SOURCE_PATH_V3R,
} from '../lib/editron/research/open-ended-planner/provider-native-handoff-order-experiment-v3r';
import { createProviderNativeLiveTransportV2R }
  from '../lib/editron/research/open-ended-planner/provider-native-live-transport-v2r';
import {
  preflightProviderNativeHandoffOrderV3R,
  runProviderNativeHandoffOrderExperimentV3R,
} from '../lib/editron/research/open-ended-planner/provider-native-handoff-order-runner-v3r';
import { buildV2RBenchmarkTaskRegistryV2 }
  from '../lib/editron/research/open-ended-planner/v2r-benchmark-task-registry';

const repoRoot = process.cwd();
loadEnv({ path: path.join(repoRoot, '.env.local'), override: false, quiet: true });
loadEnv({ path: path.join(repoRoot, '.env.local.vercel'), override: false, quiet: true });

function option(name: string): string | null {
  const prefix = `${name}=`;
  const found = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

async function main(): Promise<void> {
  const [audioBytes, analyzerSourceBytes, evaluatorSourceBytes] = await Promise.all([
    readFile(path.join(repoRoot, '.calibration-temp', 'open-ended-planner-v2',
      'development-media', 'dev03-beats.wav')),
    readFile(path.join(repoRoot, 'lib', 'editron', 'services', 'media',
      'beat-detection-service.ts')),
    readFile(path.join(repoRoot, PROVIDER_NATIVE_HANDOFF_ORDER_EVALUATOR_SOURCE_PATH_V3R)),
  ]);
  const measured = await buildCanonicalDev03MeasuredEvidenceV2({
    audioBytes, analyzerSourceBytes,
  });
  const registry = buildV2RBenchmarkTaskRegistryV2({ dev03MeasuredEvidence: measured });
  const evaluatorSourceSha256 = createHash('sha256').update(evaluatorSourceBytes).digest('hex');
  const manifest = buildProviderNativeHandoffOrderManifestV3R(
    registry, evaluatorSourceSha256,
  );
  const preflight = await preflightProviderNativeHandoffOrderV3R({
    manifest, environment: process.env,
  });
  const repetitionOrdinals = selectedRepetitionOrdinals(
    manifest.repetitionsPerRouteArm,
  );
  const repetitions = repetitionOrdinals.length;
  const requestedMaxSpendUsd = Number((
    manifest.absoluteMaxSpendUsd * repetitions / manifest.repetitionsPerRouteArm
  ).toFixed(6));
  const runRequested = process.argv.includes('--run');
  const createdAt = new Date().toISOString();
  const artifactRoot = option('--output-root')
    ? path.resolve(option('--output-root') as string)
    : path.join(repoRoot, '.calibration-temp', 'open-ended-planner-v2',
      `provider-native-handoff-order-v3-${runRequested ? 'run' : 'preflight'}-${stamp(createdAt)}`);
  await mkdir(artifactRoot, { recursive: false });
  await Promise.all([
    writeJson(path.join(artifactRoot, 'manifest.json'), manifest),
    writeJson(path.join(artifactRoot, 'preflight.json'), preflight),
  ]);
  process.stdout.write(`${JSON.stringify({
    mode: runRequested ? 'RUN_REQUESTED' : 'NO_SPEND_PREFLIGHT',
    artifactRoot,
    manifestSha256: manifest.manifestSha256,
    visibilityReceiptSha256: manifest.visibilityReceipt.receiptSha256,
    models: manifest.routes.map(({ route }) => route.model),
    arms: manifest.arms,
    repetitions,
    repetitionOrdinals,
    presentationPermutations: manifest.presentationPermutations,
    requestedMaxSpendUsd,
    preflightReceiptSha256: preflight.receiptSha256,
    networkCalls: preflight.networkCalls,
  }, null, 2)}\n`);
  if (!runRequested) return;
  if (option('--confirm-manifest') !== manifest.manifestSha256) {
    throw new Error('PROVIDER_NATIVE_HANDOFF_ORDER_V3_CLI_MANIFEST_CONFIRMATION_MISMATCH');
  }
  if (Number(option('--confirm-max-usd')) !== requestedMaxSpendUsd) {
    throw new Error('PROVIDER_NATIVE_HANDOFF_ORDER_V3_CLI_SPEND_CONFIRMATION_MISMATCH');
  }
  const receipt = await runProviderNativeHandoffOrderExperimentV3R({
    manifest,
    outputRoot: path.join(artifactRoot, 'experiment'),
    repetitionOrdinals,
    createTransport: () => createProviderNativeLiveTransportV2R({
      environment: process.env,
    }),
  });
  process.stdout.write(`${JSON.stringify({
    experimentReceiptPath: path.join(artifactRoot, 'experiment',
      'experiment-receipt.json'),
    receiptSha256: receipt.receiptSha256,
    firstChoiceCorrectCount: receipt.firstChoiceCorrectCount,
    safeOutcomePassCount: receipt.safeOutcomePassCount,
    failCount: receipt.failCount,
  }, null, 2)}\n`);
}

function selectedRepetitionOrdinals(maximum: number): readonly number[] {
  const prefixOption = option('--repetitions');
  const ordinalOption = option('--repetition-ordinals');
  if (prefixOption !== null && ordinalOption !== null) {
    throw new Error(
      'PROVIDER_NATIVE_HANDOFF_ORDER_V3_CLI_REPETITION_SELECTION_AMBIGUOUS',
    );
  }
  if (ordinalOption !== null) {
    const ordinals = ordinalOption.split(',').map((value) => Number(value));
    if (!isValidOrdinalSelection(ordinals, maximum)) {
      throw new Error(
        'PROVIDER_NATIVE_HANDOFF_ORDER_V3_CLI_REPETITION_ORDINALS_INVALID',
      );
    }
    return ordinals;
  }
  const repetitions = Number(prefixOption ?? String(maximum));
  if (!Number.isSafeInteger(repetitions) || repetitions < 1
    || repetitions > maximum) {
    throw new Error('PROVIDER_NATIVE_HANDOFF_ORDER_V3_CLI_REPETITIONS_INVALID');
  }
  return Array.from({ length: repetitions }, (_, index) => index + 1);
}

function isValidOrdinalSelection(
  ordinals: readonly number[], maximum: number,
): boolean {
  return ordinals.length > 0
    && ordinals.every((ordinal) => Number.isSafeInteger(ordinal)
      && ordinal >= 1 && ordinal <= maximum)
    && ordinals.every((ordinal, index) => index === 0
      || ordinals[index - 1] < ordinal);
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
