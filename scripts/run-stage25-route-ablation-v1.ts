import { execFile } from 'node:child_process';
import { config as loadEnv, parse as parseEnv } from 'dotenv';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  assertStage25RouteAblationPaidAuthorizationV1,
  issueStage25RouteAblationPaidAuthorizationV1,
} from '../lib/editron/research/open-ended-planner/stage25-route-ablation-paid-authorization-v1';
import {
  buildStage25RouteAblationProviderManifestV1,
  assertStage25RouteAblationProviderManifestV1,
} from '../lib/editron/research/open-ended-planner/stage25-route-ablation-provider-manifest-v1';
import {
  assertStage25RouteAblationPreflightReceiptV1,
  preflightStage25RouteAblationProvidersV1,
  type Stage25RouteAblationRequestCaptureV1,
} from '../lib/editron/research/open-ended-planner/stage25-route-ablation-provider-preflight-v1';
import {
  runStage25RouteAblationPaidCohortV1,
  type Stage25RouteAblationPaidRowResultV1,
} from '../lib/editron/research/open-ended-planner/stage25-route-ablation-paid-runner-v1';
import { hashCanonicalJsonV1 }
  from '../lib/editron/research/open-ended-planner/contracts-v1';

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const executionPaths = [
  'lib/editron/research/open-ended-planner/stage25-route-ablation-provider-manifest-v1.ts',
  'lib/editron/research/open-ended-planner/stage25-route-ablation-provider-preflight-v1.ts',
  'lib/editron/research/open-ended-planner/stage25-route-ablation-paid-authorization-v1.ts',
  'lib/editron/research/open-ended-planner/stage25-route-ablation-paid-runner-v1.ts',
  'scripts/run-stage25-route-ablation-v1.ts',
] as const;

async function main(): Promise<void> {
  const mode = required('--mode');
  if (mode !== 'preflight' && mode !== 'execute') fail('STAGE25_ROUTE_SCRIPT_MODE_INVALID');
  const operatorId = required('--operator-id');
  loadEnv({ path: path.join(repoRoot, '.env.local'), override: false, quiet: true });
  await overlayProductionGoogle(option('--production-env-file')
    ?? path.join(repoRoot, '.env.local.prod'));
  await assertExecutionFilesCommitted();
  const manifest = buildStage25RouteAblationProviderManifestV1();
  confirm('--confirm-manifest', manifest.manifestSha256);
  if (mode === 'execute') return runPaid(manifest, operatorId);
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

async function runPaid(manifest: ReturnType<typeof buildStage25RouteAblationProviderManifestV1>,
  operatorId: string): Promise<void> {
  confirm('--execute-paid-cohort', 'YES_I_CONFIRM_24_STAGE25_ROUTE_ROWS');
  confirm('--confirm-max-spend-usd', '33.60');
  const outputRoot = path.resolve(required('--output-root'));
  const storedManifest = assertStage25RouteAblationProviderManifestV1(
    await readJson(path.join(outputRoot, 'provider-manifest.json')),
  );
  if (storedManifest.manifestSha256 !== manifest.manifestSha256) fail('STAGE25_ROUTE_STORED_MANIFEST_DRIFT');
  const preflight = assertStage25RouteAblationPreflightReceiptV1(
    await readJson(path.join(outputRoot, 'preflight-receipt.json')), manifest,
  );
  const captures = await readJson(path.join(outputRoot, 'request-captures.json')) as
    Stage25RouteAblationRequestCaptureV1[];
  confirm('--confirm-preflight', preflight.receiptSha256);
  confirm('--confirm-capture-set', preflight.requestCaptureSetSha256);
  const authorizationPath = path.join(outputRoot, 'paid-authorization.json');
  const existingAuthorization = await readOptionalJson(authorizationPath);
  const now = new Date();
  const authorization = existingAuthorization
    ? assertStage25RouteAblationPaidAuthorizationV1({
        manifest, preflight, captures, authorization: existingAuthorization, now: now.toISOString(),
      })
    : issueStage25RouteAblationPaidAuthorizationV1({
        manifest, preflight, captures,
        approval: {
          operatorId, approvedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 12 * 60 * 60 * 1_000).toISOString(),
          confirmedManifestSha256: manifest.manifestSha256,
          confirmedPreflightReceiptSha256: preflight.receiptSha256,
          confirmedRequestCaptureSetSha256: preflight.requestCaptureSetSha256,
          executeConfirmation: 'YES_I_CONFIRM_24_STAGE25_ROUTE_ROWS',
          confirmedMaxSpendUsd: '33.60',
        },
      });
  if (authorization.operatorId !== operatorId) fail('STAGE25_ROUTE_OPERATOR_ID_DRIFT');
  if (!existingAuthorization) await writeJson(authorizationPath, authorization);
  const rowsRoot = path.join(outputRoot, 'paid-rows');
  await mkdir(rowsRoot, { recursive: true });
  const completedRows = await readCompletedRows(rowsRoot);
  const result = await runStage25RouteAblationPaidCohortV1({
    manifest, preflight, captures, authorization, environment: process.env,
    completedRows,
    onRowCompleted: async (row) => {
      await writeJson(path.join(rowsRoot, `${hashCanonicalJsonV1(row.rowId).slice(0, 24)}.json`), row);
      print({ rowId: row.rowId, run: row.run.disposition,
        evaluation: row.evaluation.disposition, costUsd: row.knownProviderCostUsd });
    },
  });
  const receiptPath = path.join(outputRoot, 'paid-cohort-receipt.json');
  const existingReceipt = await readOptionalJson(receiptPath);
  if (existingReceipt && hashCanonicalJsonV1(existingReceipt) !== hashCanonicalJsonV1(result.receipt)) {
    fail('STAGE25_ROUTE_EXISTING_RECEIPT_DRIFT');
  }
  if (!existingReceipt) await writeJson(receiptPath, result.receipt);
  print({ mode: 'STAGE25_ROUTE_ABLATION_PAID_COHORT_COMPLETE', outputRoot,
    receiptSha256: result.receipt.receiptSha256, rows: result.receipt.rows,
    inferenceCalls: result.receipt.providerInferenceCalls,
    googleRepairCountTokensCalls: result.receipt.googleRepairCountTokensCalls,
    knownProviderCostUsd: result.receipt.knownProviderCostUsd,
    runDispositions: result.receipt.runDispositions,
    hiddenEvaluationDispositions: result.receipt.hiddenEvaluationDispositions });
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
async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
}
async function readOptionalJson(filePath: string): Promise<unknown | null> {
  try { return await readJson(filePath); }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}
async function readCompletedRows(root: string): Promise<Stage25RouteAblationPaidRowResultV1[]> {
  const names = (await readdir(root)).filter((name) => name.endsWith('.json')).sort();
  return Promise.all(names.map(async (name) => {
    const value = await readJson(path.join(root, name));
    return value as Stage25RouteAblationPaidRowResultV1;
  }));
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
