import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { config as loadEnv, parse as parseEnv } from 'dotenv';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { materializeHoldoutMediaV2R }
  from '../lib/editron/research/open-ended-planner/holdout-media-materializer-v2r';
import { runSealedH03ProviderCohortV3R3 }
  from '../lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-cohort-runner-v3r3';
import { buildSealedH03ProviderOperatorInputV3R3 }
  from '../lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-operator-input-v3r3';
import type { SealedH03PaidAuthorizationV3R3 }
  from '../lib/editron/research/open-ended-planner/sealed-holdout-h03-paid-authorization-v3r3';

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const scriptPath = 'scripts/run-sealed-h03-provider-cohort-v3r3.ts';
const executionPaths = [
  'lib/editron/research/open-ended-planner/sealed-holdout-h03-paid-authorization-v3r3.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-operator-input-v3r3.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-row-runner-v3r3.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-cohort-runner-v3r3.ts',
  scriptPath,
] as const;

async function main(): Promise<void> {
  if (option('--execute-paid-cohort') !== 'YES_I_CONFIRM_18_H03_ROWS') {
    throw new Error('SEALED_H03_PROVIDER_COHORT_EXPLICIT_EXECUTION_CONFIRMATION_REQUIRED');
  }
  loadEnv({ path: path.join(repoRoot, '.env.local'), override: false, quiet: true });
  await overlayProductionEnvironment(option('--production-env-file') ?? path.join(
    repoRoot, '.calibration-temp', 'vercel-sandbox-env.verify.production.local',
  ));
  await assertExecutionFilesCommitted();
  const input = await buildSealedH03ProviderOperatorInputV3R3(repoRoot);
  const authorizationPath = path.resolve(required('--authorization'));
  const authorization = JSON.parse(await readFile(authorizationPath, 'utf8')) as
    SealedH03PaidAuthorizationV3R3;
  const [executionCommitSha, runnerSourceSha256] = await Promise.all([
    headSha(), fileSha(scriptPath),
  ]);
  confirm('--confirm-manifest', input.cohortManifest.manifestSha256);
  confirm('--confirm-authorization', authorization.authorizationSha256);
  confirm('--confirm-max-usd', '11.673');
  confirm('--confirm-snapshot-id', authorization.sandboxEnvironment.snapshotId);
  confirm('--confirm-snapshot-commit', authorization.sandboxEnvironment.snapshotCommit);
  // Snapshot selection is authorization-owned. Ambient env may contain an old
  // deployment value and must never redirect a paid reproducibility run.
  const sandboxEnvironment = authorization.sandboxEnvironment;
  const startedAt = new Date().toISOString();
  const outputRoot = path.resolve(option('--output-root') ?? path.join(
    repoRoot, '.calibration-temp', 'open-ended-planner-v2',
    `sealed-h03-provider-v3r3-run-${stamp(startedAt)}`,
  ));
  const mediaManifest = await materializeHoldoutMediaV2R(path.join(outputRoot, 'media'));
  const receipt = await runSealedH03ProviderCohortV3R3({
    ...input,
    authorization,
    environment: process.env,
    mediaManifest,
    outputRoot,
    executionCommitSha,
    runnerSourceSha256,
    sandboxEnvironment,
    repoRoot,
    onProgress: (event) => process.stdout.write(`${JSON.stringify({
      mode: 'H03_V3R3_ROW_PROGRESS', ...event,
    })}\n`),
  });
  process.stdout.write(`${JSON.stringify({
    mode: 'H03_V3R3_PAID_COHORT_COMPLETE',
    outputRoot,
    receiptSha256: receipt.receiptSha256,
    rowCount: receipt.rowCount,
    dispositionCounts: receipt.dispositionCounts,
    accounting: receipt.accounting,
    projectReads: receipt.projectReads,
    projectMutations: receipt.projectMutations,
  }, null, 2)}\n`);
}

async function overlayProductionEnvironment(filePath: string): Promise<void> {
  const parsed = parseEnv(await readFile(path.resolve(filePath)));
  for (const name of [
    'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'VERCEL_OIDC_TOKEN',
  ] as const) {
    const value = parsed[name]?.trim();
    if (value) process.env[name] = value;
  }
}
async function assertExecutionFilesCommitted(): Promise<void> {
  const { stdout } = await execFileAsync('git', [
    'status', '--porcelain', '--', ...executionPaths,
  ], { cwd: repoRoot });
  if (stdout.trim()) throw new Error('SEALED_H03_PROVIDER_COHORT_EXECUTION_FILES_MUST_BE_COMMITTED');
}
async function headSha(): Promise<string> {
  return (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot })).stdout.trim();
}
async function fileSha(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(path.resolve(repoRoot, filePath))).digest('hex');
}
function option(name: string): string | null {
  const prefix = `${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))
    ?.slice(prefix.length) ?? null;
}
function required(name: string): string {
  const value = option(name)?.trim();
  if (!value) throw new Error(`SEALED_H03_PROVIDER_COHORT_OPTION_REQUIRED:${name}`);
  return value;
}
function confirm(name: string, expected: string): void {
  if (option(name) !== expected) {
    throw new Error(`SEALED_H03_PROVIDER_COHORT_CONFIRMATION_MISMATCH:${name}`);
  }
}
function stamp(value: string): string { return value.replace(/[-:.TZ]/g, '').slice(0, 14); }

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
