import { execFile } from 'node:child_process';
import { config as loadEnv, parse as parseEnv } from 'dotenv';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  buildStage25RouteAblationProviderManifestV1,
} from '../lib/editron/research/open-ended-planner/stage25-route-ablation-provider-manifest-v1';
import {
  preflightStage25RouteAblationProvidersV1,
} from '../lib/editron/research/open-ended-planner/stage25-route-ablation-provider-preflight-v1';

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const executionPaths = [
  'lib/editron/research/open-ended-planner/stage25-route-ablation-provider-manifest-v1.ts',
  'lib/editron/research/open-ended-planner/stage25-route-ablation-provider-preflight-v1.ts',
  'scripts/run-stage25-route-ablation-v1.ts',
] as const;

async function main(): Promise<void> {
  if (required('--mode') !== 'preflight') fail('STAGE25_ROUTE_SCRIPT_MODE_INVALID');
  const operatorId = required('--operator-id');
  loadEnv({ path: path.join(repoRoot, '.env.local'), override: false, quiet: true });
  await overlayProductionGoogle(option('--production-env-file')
    ?? path.join(repoRoot, '.env.local.prod'));
  await assertExecutionFilesCommitted();
  const manifest = buildStage25RouteAblationProviderManifestV1();
  confirm('--confirm-manifest', manifest.manifestSha256);
  if (process.argv.some((value) => value.startsWith('--execute-paid-cohort='))) {
    fail('STAGE25_ROUTE_PREFLIGHT_INFERENCE_FLAG_FORBIDDEN');
  }
  const outputRoot = path.resolve(required('--output-root'));
  await mkdir(path.dirname(outputRoot), { recursive: true });
  await mkdir(outputRoot, { recursive: false });
  const result = await preflightStage25RouteAblationProvidersV1({
    manifest, confirmedManifestSha256: manifest.manifestSha256,
    operatorId, environment: process.env,
  });
  await writeJson(path.join(outputRoot, 'provider-manifest.json'), manifest);
  await writeJson(path.join(outputRoot, 'preflight-receipt.json'), result.receipt);
  await writeJson(path.join(outputRoot, 'request-captures.json'), result.requestCaptures);
  print({
    mode: 'STAGE25_ROUTE_ABLATION_ZERO_INFERENCE_PREFLIGHT_COMPLETE',
    outputRoot, providerManifestSha256: manifest.manifestSha256,
    receiptSha256: result.receipt.receiptSha256,
    requestCaptureSetSha256: result.receipt.requestCaptureSetSha256,
    rows: result.requestCaptures.length,
    networkCalls: result.receipt.networkCalls,
    initialAttemptCostUpperBoundUsd: result.receipt.initialAttemptCostUpperBoundUsd,
    absoluteTwoAttemptMaxSpendUsd: result.receipt.absoluteTwoAttemptMaxSpendUsd,
  });
}

async function overlayProductionGoogle(filePath: string): Promise<void> {
  const parsed = parseEnv(await readFile(filePath));
  const production = parsed.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!production) fail('STAGE25_ROUTE_PRODUCTION_GOOGLE_CREDENTIAL_MISSING');
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = production;
}

async function assertExecutionFilesCommitted(): Promise<void> {
  const { stdout } = await execFileAsync('git', ['status', '--porcelain', '--', ...executionPaths], {
    cwd: repoRoot, windowsHide: true,
  });
  if (stdout.trim()) fail('STAGE25_ROUTE_EXECUTION_FILES_MUST_BE_COMMITTED');
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}
function option(name: string): string | null {
  const prefix = `${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}
function required(name: string): string {
  const value = option(name)?.trim();
  if (!value) fail(`STAGE25_ROUTE_OPTION_REQUIRED:${name}`);
  return value;
}
function confirm(name: string, expected: string): void {
  if (option(name) !== expected) fail(`STAGE25_ROUTE_CONFIRMATION_MISMATCH:${name}`);
}
function print(value: unknown): void { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }
function fail(code: string): never { throw new Error(code); }

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
