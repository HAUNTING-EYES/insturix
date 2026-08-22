import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { config as loadEnv, parse as parseEnv } from 'dotenv';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import type { HoldoutMediaManifestV2R }
  from '../lib/editron/research/open-ended-planner/holdout-media-materializer-v2r';
import { runSealedHoldoutPaidCohortV2R }
  from '../lib/editron/research/open-ended-planner/sealed-holdout-paid-cohort-runner-v2r';
import type { SealedHoldoutPaidDispatchAuthorizationV2R }
  from '../lib/editron/research/open-ended-planner/sealed-holdout-paid-dispatch-authorization-v2r';
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

loadEnv({ path: path.join(repoRoot, '.env.local'), override: false, quiet: true });
loadEnv({ path: path.join(repoRoot, '.env.local.vercel'), override: false, quiet: true });

async function main(): Promise<void> {
  if (option('--execute-paid-cohort') !== 'YES_I_CONFIRM_96_RESEARCH_ROWS') {
    throw new Error('SEALED_PAID_COHORT_EXPLICIT_EXECUTION_CONFIRMATION_REQUIRED');
  }
  await loadCredentialEnvironment(option('--credential-env-file'));
  const authorizationPath = path.resolve(required('--authorization'));
  const credentialPath = path.resolve(required('--credential-preflight'));
  const mediaPath = path.resolve(option('--media-manifest') ?? path.join(
    repoRoot, '.calibration-temp', 'open-ended-planner-v2',
    'holdout-media-v2r-r4-20260822', 'manifest.json',
  ));
  const [sourceBytes, authorizationBytes, credentialBytes, mediaBytes, runnerBytes] =
    await Promise.all([
      readFile(path.join(repoRoot, SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R)),
      readFile(authorizationPath), readFile(credentialPath), readFile(mediaPath),
      readFile(runnerPath),
    ]);
  const manifest = buildSealedHoldoutCohortManifestV2R(sha256(sourceBytes));
  const authorization = JSON.parse(authorizationBytes.toString('utf8')) as
    SealedHoldoutPaidDispatchAuthorizationV2R;
  const credential = JSON.parse(credentialBytes.toString('utf8')) as
    SealedHoldoutCredentialPreflightReceiptV2R;
  const mediaManifest = JSON.parse(mediaBytes.toString('utf8')) as HoldoutMediaManifestV2R;
  const runnerSourceSha256 = sha256(runnerBytes);
  const implementationCommitSha = await headSha();
  await assertExecutionFilesCommitted();
  confirm('--confirm-manifest', manifest.manifestSha256);
  confirm('--confirm-authorization', authorization.authorizationSha256);
  confirm('--confirm-credential-receipt', credential.receiptSha256);
  confirm('--confirm-capture-set', credential.requestCaptureSetSha256);
  confirm('--confirm-media-manifest', mediaManifest.manifestSha256);
  confirm('--confirm-implementation-commit', implementationCommitSha);
  confirm('--confirm-runner-source', runnerSourceSha256);
  confirm('--confirm-absolute-max-spend-usd', '75');
  const outputRoot = path.resolve(option('--output-root') ?? path.join(
    repoRoot, '.calibration-temp', 'open-ended-planner-v2',
    `sealed-holdout-paid-cohort-${stamp(new Date().toISOString())}`,
  ));
  const receipt = await runSealedHoldoutPaidCohortV2R({
    manifest, credentialPreflight: credential, paidAuthorization: authorization,
    mediaManifest, outputRoot, implementationCommitSha, runnerSourceSha256,
    environment: process.env,
  });
  process.stdout.write(`${JSON.stringify({
    mode: 'PAID_SEALED_RESEARCH_COHORT', outputRoot,
    receiptSha256: receipt.receiptSha256, assessment: receipt.assessment,
    rowCount: receipt.rowCount, statusCounts: receipt.statusCounts,
    providerInferenceCalls: receipt.providerInferenceCalls,
    googleCountTokensCalls: receipt.googleCountTokensCalls,
    providerTurns: receipt.providerTurns,
    spentUsd: receipt.spentNanoUsd / 1_000_000_000,
    projectReads: receipt.projectReads, projectMutations: receipt.projectMutations,
  }, null, 2)}\n`);
}

async function loadCredentialEnvironment(filePath: string | null): Promise<void> {
  if (!filePath) return;
  const parsed = parseEnv(await readFile(path.resolve(filePath)));
  for (const name of [
    'OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY',
  ] as const) {
    const value = parsed[name]?.trim();
    if (value) process.env[name] = value;
  }
}
async function assertExecutionFilesCommitted(): Promise<void> {
  const { stdout } = await execFileAsync('git', [
    'status', '--porcelain', '--', ...committedExecutionPaths,
  ], { cwd: repoRoot });
  if (stdout.trim()) throw new Error('SEALED_PAID_COHORT_EXECUTION_FILES_MUST_BE_COMMITTED');
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
  if (!value) throw new Error(`SEALED_PAID_COHORT_OPTION_REQUIRED:${name}`);
  return value;
}
function confirm(name: string, expected: string): void {
  if (option(name) !== expected) throw new Error(`SEALED_PAID_COHORT_CONFIRMATION_MISMATCH:${name}`);
}
function sha256(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
function stamp(value: string): string { return value.replace(/[-:.TZ]/g, '').slice(0, 14); }

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
