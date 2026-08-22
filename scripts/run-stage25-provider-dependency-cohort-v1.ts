import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config as loadEnv } from 'dotenv';

import {
  buildStage25ProviderDependencyCohortManifestV1,
  preflightStage25ProviderDependencyCohortV1,
  STAGE25_PROVIDER_DEPENDENCY_EVALUATOR_SOURCE_PATH_V1,
} from '../lib/editron/research/open-ended-planner/stage25-provider-dependency-cohort-v1';
import { runStage25ProviderDependencyCohortV1 }
  from '../lib/editron/research/open-ended-planner/stage25-provider-dependency-cohort-runner-v1';
import { createProviderNativeLiveTransportV2R }
  from '../lib/editron/research/open-ended-planner/provider-native-live-transport-v2r';

const repoRoot = process.cwd();
const BENCHMARK_SOURCE_PATHS = [
  'lib/editron/research/open-ended-planner/stage25-provider-dependency-cohort-v1.ts',
  'lib/editron/research/open-ended-planner/stage25-provider-dependency-cohort-runner-v1.ts',
  'lib/editron/research/open-ended-planner/stage25-provider-dependency-holdout-v1.ts',
  'lib/editron/research/open-ended-planner/stage25-provider-dependency-owner-v1.ts',
  'lib/editron/research/open-ended-planner/stage25-provider-trace-schedule-binding-v1.ts',
  'lib/editron/research/open-ended-planner/provider-native-tool-episode-v2r.ts',
  'lib/editron/research/open-ended-planner/provider-native-tool-catalog-v2r.ts',
] as const;
const GOOGLE_CREDENTIAL_NAMES = [
  'GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY',
] as const;

async function main(): Promise<void> {
  const runRequested = process.argv.includes('--run');
  const productionEnvPath = requiredOption('--google-production-env');
  loadEnv({ path: path.join(repoRoot, '.env.local'), override: false, quiet: true });
  loadProductionGoogleCredentials(path.resolve(productionEnvPath));
  assertBenchmarkSourcesAtHead();
  const sourceCommit = git(['rev-parse', 'HEAD']).trim();
  const evaluatorBytes = await readFile(path.join(
    repoRoot,
    STAGE25_PROVIDER_DEPENDENCY_EVALUATOR_SOURCE_PATH_V1,
  ));
  const evaluatorSourceSha256 = createHash('sha256')
    .update(evaluatorBytes).digest('hex');
  const manifest = buildStage25ProviderDependencyCohortManifestV1({
    sourceCommit,
    evaluatorSourceSha256,
  });
  const preflight = await preflightStage25ProviderDependencyCohortV1({
    manifest,
    environment: process.env,
  });
  const createdAt = new Date().toISOString();
  const outputRoot = option('--output-root')
    ? path.resolve(option('--output-root') as string)
    : path.join(
        repoRoot,
        '.calibration-temp',
        'open-ended-planner-v2',
        `stage25-provider-dependency-${runRequested ? 'run' : 'preflight'}-${stamp(createdAt)}`,
      );
  await mkdir(outputRoot, { recursive: false });
  await Promise.all([
    writeJson(path.join(outputRoot, 'manifest.json'), manifest),
    writeJson(path.join(outputRoot, 'preflight.json'), preflight),
  ]);
  process.stdout.write(`${JSON.stringify({
    mode: runRequested ? 'RUN_REQUESTED' : 'NO_SPEND_PREFLIGHT',
    outputRoot,
    sourceCommit,
    manifestSha256: manifest.manifestSha256,
    evaluatorSourceSha256,
    models: manifest.routes.map(({ route }) => route.model),
    rows: manifest.rowCount,
    presentationOrders: manifest.presentations.map(({ operatorOrder }) => operatorOrder),
    absoluteMaxSpendUsd: manifest.absoluteMaxSpendUsd,
    preflightReceiptSha256: preflight.receiptSha256,
    networkCalls: preflight.networkCalls,
  }, null, 2)}\n`);
  if (!runRequested) return;
  if (option('--confirm-manifest') !== manifest.manifestSha256) {
    throw new Error('STAGE25_PROVIDER_DEPENDENCY_MANIFEST_CONFIRMATION_MISMATCH');
  }
  if (Number(option('--confirm-max-usd')) !== manifest.absoluteMaxSpendUsd) {
    throw new Error('STAGE25_PROVIDER_DEPENDENCY_SPEND_CONFIRMATION_MISMATCH');
  }
  const receipt = await runStage25ProviderDependencyCohortV1({
    manifest,
    outputRoot: path.join(outputRoot, 'cohort'),
    createTransport: () => createProviderNativeLiveTransportV2R({
      environment: process.env,
    }),
  });
  process.stdout.write(`${JSON.stringify({
    cohortReceiptPath: path.join(outputRoot, 'cohort', 'cohort-receipt.json'),
    receiptSha256: receipt.receiptSha256,
    rowCount: receipt.rowCount,
    passCount: receipt.passCount,
    failCount: receipt.failCount,
    providerInfrastructureUnverifiableCount:
      receipt.providerInfrastructureUnverifiableCount,
    harnessErrorCount: receipt.harnessErrorCount,
  }, null, 2)}\n`);
}

function loadProductionGoogleCredentials(filePath: string): void {
  const production: Record<string, string> = {};
  const result = loadEnv({
    path: filePath,
    processEnv: production,
    override: true,
    quiet: true,
  });
  if (result.error) {
    throw new Error(`STAGE25_PROVIDER_DEPENDENCY_PRODUCTION_ENV_LOAD_FAILED:${filePath}`);
  }
  let loaded = false;
  for (const name of GOOGLE_CREDENTIAL_NAMES) {
    const value = production[name]?.trim();
    if (value) {
      process.env[name] = value;
      loaded = true;
    } else {
      delete process.env[name];
    }
  }
  if (!loaded) {
    throw new Error('STAGE25_PROVIDER_DEPENDENCY_PRODUCTION_GOOGLE_KEY_MISSING');
  }
}

function assertBenchmarkSourcesAtHead(): void {
  try {
    execFileSync('git', ['diff', '--quiet', 'HEAD', '--', ...BENCHMARK_SOURCE_PATHS], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
  } catch {
    throw new Error('STAGE25_PROVIDER_DEPENDENCY_BENCHMARK_SOURCE_DIRTY');
  }
}

function git(arguments_: readonly string[]): string {
  return execFileSync('git', arguments_, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function option(name: string): string | null {
  const prefix = `${name}=`;
  const found = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function requiredOption(name: string): string {
  const value = option(name)?.trim();
  if (!value) throw new Error(`STAGE25_PROVIDER_DEPENDENCY_REQUIRED_OPTION_MISSING:${name}`);
  return value;
}

function stamp(value: string): string {
  return value.replace(/[-:.TZ]/g, '').slice(0, 14);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
