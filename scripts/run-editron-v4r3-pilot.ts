import { execFile } from 'node:child_process';
import { parse as parseEnv } from 'dotenv';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  SEALED_HOLDOUT_PILOT_CONFIRMATION_V4R3,
} from '../lib/editron/research/open-ended-planner/sealed-holdout-pilot-authorization-v4r3';
import {
  runSealedHoldoutPilotLiveOperatorV4R3,
} from '../lib/editron/research/open-ended-planner/sealed-holdout-pilot-live-operator-v4r3';

const execFileAsync = promisify(execFile);
const rootDir = process.cwd();

async function main(): Promise<void> {
  if (option('--confirm') !== SEALED_HOLDOUT_PILOT_CONFIRMATION_V4R3) {
    throw new Error('SEALED_V4R3_PILOT_EXACT_CONFIRMATION_REQUIRED');
  }
  const operatorId = required('--operator-id');
  await loadCredentialFile(path.join(rootDir, '.env.local'));
  await loadCredentialFile(path.join(rootDir, '.env.local.prod'));
  for (const file of options('--credential-env-file')) {
    await loadCredentialFile(path.resolve(file));
  }
  await assertExecutionFilesCommitted();
  const outputRoot = path.resolve(option('--output-root') ?? path.join(
    rootDir, '.calibration-temp', 'editron-v4r3-pilot',
    `v4r3-pilot-${stamp(new Date().toISOString())}`,
  ));
  const receipt = await runSealedHoldoutPilotLiveOperatorV4R3({
    rootDir, outputRoot, operatorId,
    executeConfirmation: SEALED_HOLDOUT_PILOT_CONFIRMATION_V4R3,
    environment: process.env,
  });
  process.stdout.write(`${JSON.stringify({
    mode: 'V4R3_ONE_NON_SCORED_PILOT_PER_HEALTHY_ROUTE',
    outputRoot, implementationCommitSha: receipt.implementationCommitSha,
    availableRouteIds: receipt.availableRouteIds,
    unavailableRouteIds: receipt.unavailableRouteIds,
    providerInferenceCalls: receipt.providerInferenceCalls,
    networkCalls: receipt.networkCalls,
    accountedCostUsd: receipt.accountedCostNanoUsd / 1_000_000_000,
    billedUsd: receipt.billedMicroUsd / 1_000_000,
    receiptSha256: receipt.receiptSha256,
    assessment: receipt.assessment,
  }, null, 2)}\n`);
}

async function loadCredentialFile(file: string): Promise<void> {
  try {
    const parsed = parseEnv(await readFile(file));
    for (const name of ['OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY',
      'GEMINI_API_KEY', 'GOOGLE_API_KEY'] as const) {
      const value = parsed[name]?.trim();
      if (value) process.env[name] = value;
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw error;
  }
}
async function assertExecutionFilesCommitted(): Promise<void> {
  const paths = [
    'lib/editron/research/open-ended-planner/sealed-holdout-pilot-live-adapter-v4r3.ts',
    'lib/editron/research/open-ended-planner/sealed-holdout-pilot-live-operator-v4r3.ts',
    'lib/editron/research/open-ended-planner/sealed-holdout-pilot-runner-v4r3.ts',
    'scripts/run-editron-v4r3-pilot.ts',
  ];
  const { stdout } = await execFileAsync('git', ['status', '--porcelain', '--', ...paths], {
    cwd: rootDir,
  });
  if (stdout.trim()) throw new Error('SEALED_V4R3_PILOT_EXECUTION_FILES_MUST_BE_COMMITTED');
}
function option(name: string): string | null {
  const prefix = `${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}
function options(name: string): string[] {
  const prefix = `${name}=`;
  return process.argv.slice(2).filter((value) => value.startsWith(prefix))
    .map((value) => value.slice(prefix.length));
}
function required(name: string): string {
  const value = option(name)?.trim();
  if (!value) throw new Error(`SEALED_V4R3_PILOT_OPTION_REQUIRED:${name}`);
  return value;
}
function stamp(value: string): string { return value.replace(/[-:.TZ]/gu, '').slice(0, 14); }

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
