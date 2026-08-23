import { createHash } from 'node:crypto';
import { config as loadEnv, parse as parseEnv } from 'dotenv';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildCanonicalDev03MeasuredEvidenceV2 } from '../lib/editron/research/open-ended-planner/dev03-measured-evidence-v2';
import {
  buildProviderNativeCohortManifestV2R,
  runProviderNativeNoSpendPreflightV2R,
} from '../lib/editron/research/open-ended-planner/provider-native-cohort-manifest-v2r';
import { runProviderNativeCohortV2R } from '../lib/editron/research/open-ended-planner/provider-native-cohort-runner-v2r';
import { buildV2RBenchmarkTaskRegistryV2 } from '../lib/editron/research/open-ended-planner/v2r-benchmark-task-registry';

const repoRoot = process.cwd();
loadEnv({ path: path.join(repoRoot, '.env.local'), override: false, quiet: true });
loadEnv({ path: path.join(repoRoot, '.env.local.vercel'), override: false, quiet: true });

function option(name: string): string | null {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function listOption(name: string): string[] | undefined {
  const value = option(name);
  if (!value) return undefined;
  const entries = value.split(',').map((entry) => entry.trim()).filter(Boolean);
  return entries.length ? entries : undefined;
}

function safeTimestamp(value: string): string {
  return value.replace(/[-:.TZ]/g, '').slice(0, 14);
}

async function sha256File(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8', flag: 'wx',
  });
}

async function main(): Promise<void> {
  await loadFreshSandboxOidc();
  const [audioBytes, analyzerSourceBytes, apiImplementationHash] = await Promise.all([
    readFile(path.join(repoRoot, '.calibration-temp', 'open-ended-planner-v2', 'development-media', 'dev03-beats.wav')),
    readFile(path.join(repoRoot, 'lib', 'editron', 'services', 'media', 'beat-detection-service.ts')),
    sha256File(path.join(repoRoot, 'lib', 'editron', 'research', 'open-ended-planner', 'generated-composition-api-v1.tsx')),
  ]);
  const measured = await buildCanonicalDev03MeasuredEvidenceV2({ audioBytes, analyzerSourceBytes });
  const registry = buildV2RBenchmarkTaskRegistryV2({ dev03MeasuredEvidence: measured });
  const manifest = buildProviderNativeCohortManifestV2R(registry);
  const preflight = await runProviderNativeNoSpendPreflightV2R({
    manifest, environment: process.env,
  });
  const runRequested = process.argv.includes('--run');
  const repetitions = Number(option('--repetitions') ?? '1');
  if (!Number.isSafeInteger(repetitions) || repetitions < 1
    || repetitions > manifest.repetitionsPerRouteCase) {
    throw new Error('PROVIDER_NATIVE_CLI_REPETITIONS_INVALID');
  }
  const requestedMaxSpendUsd = Number((
    manifest.absoluteMaxSpendUsd * repetitions / manifest.repetitionsPerRouteCase
  ).toFixed(6));
  const createdAt = new Date().toISOString();
  const requestedRoot = option('--output-root');
  const artifactRoot = requestedRoot
    ? path.resolve(requestedRoot)
    : path.join(
      repoRoot, '.calibration-temp', 'open-ended-planner-v2',
      `provider-native-v27-${runRequested ? 'run' : 'preflight'}-${safeTimestamp(createdAt)}`,
    );
  await mkdir(path.dirname(artifactRoot), { recursive: true });
  await mkdir(artifactRoot, { recursive: false });
  await writeJson(path.join(artifactRoot, 'manifest.json'), manifest);
  await writeJson(path.join(artifactRoot, 'preflight.json'), preflight);

  process.stdout.write(`${JSON.stringify({
    mode: runRequested ? 'RUN_REQUESTED' : 'NO_SPEND_PREFLIGHT',
    artifactRoot,
    manifestVersion: manifest.version,
    experimentId: manifest.experimentId,
    manifestSha256: manifest.manifestSha256,
    absoluteMaxSpendUsdForThreeRepetitions: manifest.absoluteMaxSpendUsd,
    requestedRepetitions: repetitions,
    preflightAssessment: preflight.infrastructureAssessment,
    dispatchAssessment: preflight.dispatchAssessment,
    preflightChecks: preflight.checks.length,
    preflightReceiptSha256: preflight.receiptSha256,
    requiredConfirmation: {
      manifestSha256: manifest.manifestSha256,
      requestedMaxSpendUsd,
    },
  }, null, 2)}\n`);
  if (!runRequested) return;

  if (option('--confirm-manifest') !== manifest.manifestSha256) {
    throw new Error('PROVIDER_NATIVE_CLI_MANIFEST_CONFIRMATION_MISMATCH');
  }
  const confirmedSpend = Number(option('--confirm-max-usd'));
  if (!Number.isFinite(confirmedSpend) || confirmedSpend !== requestedMaxSpendUsd) {
    throw new Error('PROVIDER_NATIVE_CLI_SPEND_CONFIRMATION_MISMATCH');
  }
  const receipt = await runProviderNativeCohortV2R({
    manifest, environment: process.env,
    outputRoot: path.join(artifactRoot, 'cohort'),
    apiImplementationHash, repetitions,
    routeIds: listOption('--route-ids'), caseIds: listOption('--case-ids'),
  });
  process.stdout.write(`${JSON.stringify({
    artifactRoot,
    cohortReceiptPath: path.join(artifactRoot, 'cohort', 'cohort-receipt.json'),
    receiptSha256: receipt.receiptSha256,
    repetitions: receipt.repetitions,
    passCount: receipt.passCount,
    failCount: receipt.failCount,
    providerInfrastructureUnverifiableCount: receipt.providerInfrastructureUnverifiableCount,
    harnessErrorCount: receipt.harnessErrorCount,
  }, null, 2)}\n`);
}

async function loadFreshSandboxOidc(): Promise<void> {
  const filePath = path.join(repoRoot, '.calibration-temp', 'vercel-sandbox-env.local');
  try {
    const parsed = parseEnv(await readFile(filePath));
    const token = parsed.VERCEL_OIDC_TOKEN?.trim();
    if (token) process.env.VERCEL_OIDC_TOKEN = token;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
