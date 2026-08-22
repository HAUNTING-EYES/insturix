import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  SEALED_HOLDOUT_COMPLETE_ZERO_INFERENCE_GATE_V2R,
  issueSealedHoldoutPaidDispatchAuthorizationV2R,
} from '../lib/editron/research/open-ended-planner/sealed-holdout-paid-dispatch-authorization-v2r';
import type { SealedHoldoutCredentialPreflightReceiptV2R }
  from '../lib/editron/research/open-ended-planner/sealed-holdout-credential-preflight-v2r';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '../lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const runnerPath = path.join(repoRoot, 'lib', 'editron', 'research',
  'open-ended-planner', 'sealed-holdout-paid-cohort-runner-v2r.ts');
const committedExecutionPaths = [
  'lib/editron/research/open-ended-planner/sealed-holdout-credential-preflight-v2r.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-paid-dispatch-authorization-v2r.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-paid-cohort-runner-v2r.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-paid-proof-adapter-v2r.ts',
  'scripts/issue-sealed-holdout-paid-dispatch-v2r.ts',
  'scripts/run-sealed-holdout-paid-cohort-v2r.ts',
] as const;

async function main(): Promise<void> {
  const operatorId = required('--operator-id');
  const credentialPath = path.resolve(option('--credential-preflight') ?? path.join(
    repoRoot, '.calibration-temp', 'open-ended-planner-v2',
    'sealed-holdout-credential-preflight-20260822015731', 'credential-preflight.json',
  ));
  const [sourceBytes, credentialBytes, runnerBytes] = await Promise.all([
    readFile(path.join(repoRoot, SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R)),
    readFile(credentialPath), readFile(runnerPath),
  ]);
  const manifest = buildSealedHoldoutCohortManifestV2R(sha256(sourceBytes));
  const credential = JSON.parse(credentialBytes.toString('utf8')) as
    SealedHoldoutCredentialPreflightReceiptV2R;
  const runnerSourceSha256 = sha256(runnerBytes);
  const implementationCommitSha = await headSha();
  await assertExecutionFilesCommitted();
  confirm('--confirm-manifest', manifest.manifestSha256);
  confirm('--confirm-credential-receipt', credential.receiptSha256);
  confirm('--confirm-capture-set', credential.requestCaptureSetSha256);
  confirm('--confirm-zero-gate-commit', SEALED_HOLDOUT_COMPLETE_ZERO_INFERENCE_GATE_V2R.commitSha);
  confirm('--confirm-implementation-commit', implementationCommitSha);
  confirm('--confirm-runner-source', runnerSourceSha256);
  confirm('--confirm-absolute-max-spend-usd', '75');
  const approvedAt = new Date().toISOString();
  const expiresAt = new Date(Date.parse(approvedAt) + 23 * 60 * 60 * 1_000).toISOString();
  const authorization = issueSealedHoldoutPaidDispatchAuthorizationV2R({
    manifest,
    credentialPreflight: credential,
    approval: {
      operatorId, approvedAt, expiresAt,
      confirmedCredentialPreflightReceiptSha256: credential.receiptSha256,
      confirmedRequestCaptureSetSha256: credential.requestCaptureSetSha256,
      zeroInferenceGate: SEALED_HOLDOUT_COMPLETE_ZERO_INFERENCE_GATE_V2R,
      maxSpendMicroUsdPerRow: 6_000_000,
      absoluteMaxCohortSpendMicroUsd: 75_000_000,
    },
  });
  const outputPath = path.resolve(option('--output') ?? path.join(
    repoRoot, '.calibration-temp', 'open-ended-planner-v2',
    `sealed-holdout-paid-authorization-${stamp(approvedAt)}.json`,
  ));
  await writeFile(outputPath, `${JSON.stringify(authorization, null, 2)}\n`, {
    encoding: 'utf8', flag: 'wx',
  });
  process.stdout.write(`${JSON.stringify({
    mode: 'PAID_DISPATCH_AUTHORIZATION_ISSUED_NO_INFERENCE', outputPath,
    authorizationSha256: authorization.authorizationSha256,
    manifestSha256: authorization.manifestSha256,
    implementationCommitSha, runnerSourceSha256,
    authorizedRows: authorization.limits.authorizedRows,
    maxSpendUsdPerRow: authorization.limits.maxSpendMicroUsdPerRow / 1_000_000,
    absoluteMaxCohortSpendUsd:
      authorization.limits.absoluteMaxCohortSpendMicroUsd / 1_000_000,
    approvedAt, expiresAt, projectMutationsAuthorized: 0,
  }, null, 2)}\n`);
}

async function assertExecutionFilesCommitted(): Promise<void> {
  const { stdout } = await execFileAsync('git', [
    'status', '--porcelain', '--', ...committedExecutionPaths,
  ], { cwd: repoRoot });
  if (stdout.trim()) throw new Error('SEALED_PAID_DISPATCH_EXECUTION_FILES_MUST_BE_COMMITTED');
}
async function headSha(): Promise<string> {
  return (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot })).stdout.trim();
}
function option(name: string): string | null {
  const prefix = `${name}=`;
  return process.argv.slice(2).find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length) ?? null;
}
function required(name: string): string {
  const value = option(name)?.trim();
  if (!value) throw new Error(`SEALED_PAID_DISPATCH_OPTION_REQUIRED:${name}`);
  return value;
}
function confirm(name: string, expected: string): void {
  if (option(name) !== expected) throw new Error(`SEALED_PAID_DISPATCH_CONFIRMATION_MISMATCH:${name}`);
}
function sha256(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
function stamp(value: string): string { return value.replace(/[-:.TZ]/g, '').slice(0, 14); }

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
