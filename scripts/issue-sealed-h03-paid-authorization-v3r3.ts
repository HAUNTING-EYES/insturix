import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { buildSealedH03ProviderOperatorInputV3R3 }
  from '../lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-operator-input-v3r3';
import { issueSealedH03PaidAuthorizationV3R3 }
  from '../lib/editron/research/open-ended-planner/sealed-holdout-h03-paid-authorization-v3r3';

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const defaultRunnerPath = 'scripts/run-sealed-h03-provider-cohort-v3r3.ts';

async function main(): Promise<void> {
  if (process.argv.includes('--run')) {
    throw new Error('SEALED_H03_AUTHORIZATION_INFERENCE_FLAG_FORBIDDEN');
  }
  const operatorId = required('--operator-id');
  const preflightRoot = path.resolve(required('--preflight-root'));
  const runnerPath = option('--runner-path') ?? defaultRunnerPath;
  const sandboxEnvironment = {
    snapshotId: required('--snapshot-id'),
    snapshotCommit: required('--snapshot-commit'),
  } as const;
  const input = await buildSealedH03ProviderOperatorInputV3R3(repoRoot);
  const [infrastructure, h03Preflight, operatorPreflight] = await Promise.all([
    readJson(path.join(preflightRoot, 'provider-infrastructure-preflight.json')),
    readJson(path.join(preflightRoot, 'h03-provider-preflight.json')),
    readJson(path.join(preflightRoot, 'operator-preflight-receipt.json')),
  ]);
  confirm('--confirm-manifest', input.cohortManifest.manifestSha256);
  confirm('--confirm-h03-preflight', String(h03Preflight.receiptSha256));
  confirm('--confirm-operator-preflight', String(operatorPreflight.receiptSha256));
  confirm('--confirm-max-usd', '11.673');
  await assertExecutionFilesCommitted(runnerPath);
  const [executionCommitSha, runnerSourceSha256] = await Promise.all([
    headSha(), fileSha(runnerPath),
  ]);
  const approvedAt = new Date().toISOString();
  const expiresAt = new Date(Date.parse(approvedAt) + 23 * 60 * 60_000).toISOString();
  const authorization = issueSealedH03PaidAuthorizationV3R3({
    manifest: input.cohortManifest,
    providerInfrastructureReceipt: infrastructure as any,
    h03PreflightReceipt: h03Preflight as any,
    operatorPreflightReceipt: operatorPreflight,
    approval: {
      operatorId,
      approvedAt,
      expiresAt,
      confirmedManifestSha256: input.cohortManifest.manifestSha256,
      confirmedH03PreflightReceiptSha256: String(h03Preflight.receiptSha256),
      confirmedOperatorPreflightReceiptSha256: String(operatorPreflight.receiptSha256),
      confirmedAbsoluteMaxSpendUsd: 11.673,
      executionCommitSha,
      runnerSourceSha256,
      sandboxEnvironment,
    },
  });
  const outputPath = path.resolve(option('--output') ?? path.join(
    repoRoot, '.calibration-temp', 'open-ended-planner-v2',
    `sealed-h03-paid-authorization-v3r3-${stamp(approvedAt)}.json`,
  ));
  await writeFile(outputPath, `${JSON.stringify(authorization, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  process.stdout.write(`${JSON.stringify({
    mode: 'H03_V3R3_PAID_AUTHORIZATION_ISSUED_NO_INFERENCE',
    outputPath,
    authorizationSha256: authorization.authorizationSha256,
    manifestSha256: authorization.manifestSha256,
    executionCommitSha,
    runnerSourceSha256,
    sandboxEnvironment: authorization.sandboxEnvironment,
    authorizedRows: authorization.limits.authorizedRowCount,
    maximumProviderHttpRequests: authorization.limits.maximumProviderHttpRequests,
    absoluteMaxSpendUsd: authorization.limits.absoluteMaxSpendMicroUsd / 1_000_000,
    approvedAt,
    expiresAt,
    inferenceCallsMade: 0,
    projectMutationsAuthorized: 0,
  }, null, 2)}\n`);
}

async function assertExecutionFilesCommitted(runnerPath: string): Promise<void> {
  const paths = [
    'lib/editron/research/open-ended-planner/sealed-holdout-h03-paid-authorization-v3r3.ts',
    'lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-cohort-runner-v3r3.ts',
    'scripts/issue-sealed-h03-paid-authorization-v3r3.ts',
    runnerPath,
  ];
  const { stdout } = await execFileAsync('git', [
    'status', '--porcelain', '--', ...paths,
  ], { cwd: repoRoot });
  if (stdout.trim()) throw new Error('SEALED_H03_AUTHORIZATION_EXECUTION_FILES_MUST_BE_COMMITTED');
}

async function readJson(filePath: string): Promise<Record<string, unknown>> {
  const value = JSON.parse((await readFile(filePath)).toString('utf8')) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`SEALED_H03_AUTHORIZATION_JSON_INVALID:${filePath}`);
  }
  return value as Record<string, unknown>;
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
  if (!value) throw new Error(`SEALED_H03_AUTHORIZATION_OPTION_REQUIRED:${name}`);
  return value;
}
function confirm(name: string, expected: string): void {
  if (option(name) !== expected) {
    throw new Error(`SEALED_H03_AUTHORIZATION_CONFIRMATION_MISMATCH:${name}`);
  }
}
function stamp(value: string): string { return value.replace(/[-:.TZ]/g, '').slice(0, 14); }

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
