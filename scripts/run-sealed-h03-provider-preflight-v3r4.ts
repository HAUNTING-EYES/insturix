import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { config as loadEnv, parse as parseEnv } from 'dotenv';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { hashCanonicalJsonV1 }
  from '../lib/editron/research/open-ended-planner/contracts-v1';
import { runProviderNativeNoSpendPreflightV2R }
  from '../lib/editron/research/open-ended-planner/provider-native-cohort-manifest-v2r';
import {
  buildSealedH03ProviderOperatorInputV3R4,
} from '../lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-operator-input-v3r4';
import { SEALED_H03_PROVIDER_IMPLEMENTATION_PATHS_V3R4 }
  from '../lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-cohort-v3r4';
import { runSealedH03ProviderNoInferencePreflightV3R4 }
  from '../lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-preflight-v3r4';

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const scriptPath = 'scripts/run-sealed-h03-provider-preflight-v3r4.ts';
const executionPaths = [
  ...SEALED_H03_PROVIDER_IMPLEMENTATION_PATHS_V3R4,
  'lib/editron/research/capability-census/cap2-current-truth-reissue-audit-v6.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-cohort-v3r4.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-preflight-v3r4.ts',
  'lib/editron/research/open-ended-planner/sealed-holdout-h03-provider-operator-input-v3r4.ts',
  scriptPath,
] as const;

async function main(): Promise<void> {
  if (process.argv.includes('--run') || process.argv.includes('--dispatch')) {
    throw new Error('SEALED_H03_V3R4_PREFLIGHT_INFERENCE_FLAG_FORBIDDEN');
  }
  const operatorId = required('--operator-id');
  loadEnv({ path: path.join(repoRoot, '.env.local'), override: false, quiet: true });
  await overlayProductionGoogleEnvironment(option('--production-env-file') ?? path.join(
    repoRoot, '.calibration-temp', 'vercel-sandbox-env.verify.production.local',
  ));
  await assertExecutionFilesCommitted();
  const input = await buildSealedH03ProviderOperatorInputV3R4(repoRoot);
  confirm('--confirm-manifest', input.cohortManifest.manifestSha256);
  confirm('--confirm-max-usd', input.cohortManifest.absoluteMaxSpendUsd.toString());
  const infrastructure = await runProviderNativeNoSpendPreflightV2R({
    manifest: input.providerManifest,
    environment: process.env,
  });
  const preflight = await runSealedH03ProviderNoInferencePreflightV3R4({
    manifest: input.cohortManifest,
    providerManifest: input.providerManifest,
    providerInfrastructureReceipt: infrastructure,
    sourceRequest: input.sourceRequest,
    environment: process.env,
  });
  const createdAt = new Date().toISOString();
  const material = {
    version: 'EDITRON_OE_SEALED_H03_PROVIDER_OPERATOR_PREFLIGHT_V3R4_1',
    authority: 'OPERATOR_ZERO_INFERENCE_PREFLIGHT_NO_DISPATCH_NO_PROJECT_MUTATION',
    operatorId, createdAt, implementationCommitSha: await headSha(),
    runnerSourceSha256: await fileSha(scriptPath),
    manifestSha256: input.cohortManifest.manifestSha256,
    absoluteMaxSpendUsd: input.cohortManifest.absoluteMaxSpendUsd,
    providerInfrastructureReceiptSha256: infrastructure.receiptSha256,
    h03PreflightReceiptSha256: preflight.receiptSha256,
    dispatchAssessment: preflight.dispatchAssessment,
    networkCalls: preflight.networkCalls,
    dispatchAuthorized: false, inferenceCalls: 0, projectReads: 0,
    projectMutations: 0, secretsPersisted: false, stateEffects: [] as const,
  };
  const operatorReceipt = Object.freeze({
    ...material, receiptSha256: hashCanonicalJsonV1(material),
  });
  const outputRoot = path.resolve(option('--output-root') ?? path.join(
    repoRoot, '.calibration-temp', 'open-ended-planner-v2',
    `sealed-h03-provider-v3r4-preflight-${stamp(createdAt)}`,
  ));
  await mkdir(path.dirname(outputRoot), { recursive: true });
  await mkdir(outputRoot, { recursive: false });
  await Promise.all([
    writeJson(path.join(outputRoot, 'cohort-manifest.json'), input.cohortManifest),
    writeJson(path.join(outputRoot, 'provider-route-manifest.json'), input.providerManifest),
    writeJson(path.join(outputRoot, 'provider-infrastructure-preflight.json'), infrastructure),
    writeJson(path.join(outputRoot, 'h03-provider-preflight.json'), preflight),
    writeJson(path.join(outputRoot, 'operator-preflight-receipt.json'), operatorReceipt),
  ]);
  process.stdout.write(`${JSON.stringify({
    mode: 'H03_V3R4_ZERO_INFERENCE_PREFLIGHT', outputRoot,
    manifestSha256: input.cohortManifest.manifestSha256,
    absoluteMaxSpendUsd: input.cohortManifest.absoluteMaxSpendUsd,
    infrastructureAssessment: infrastructure.infrastructureAssessment,
    dispatchAssessment: preflight.dispatchAssessment,
    providerInfrastructureReceiptSha256: infrastructure.receiptSha256,
    h03PreflightReceiptSha256: preflight.receiptSha256,
    operatorReceiptSha256: operatorReceipt.receiptSha256,
    networkCalls: preflight.networkCalls, inferenceCalls: 0, dispatchAuthorized: false,
  }, null, 2)}\n`);
}
async function overlayProductionGoogleEnvironment(filePath: string): Promise<void> {
  const parsed = parseEnv(await readFile(path.resolve(filePath)));
  for (const name of ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'VERCEL_OIDC_TOKEN'] as const) {
    const value = parsed[name]?.trim(); if (value) process.env[name] = value;
  }
}
async function assertExecutionFilesCommitted(): Promise<void> {
  const { stdout } = await execFileAsync('git', ['status', '--porcelain', '--',
    ...executionPaths], { cwd: repoRoot });
  if (stdout.trim()) throw new Error('SEALED_H03_V3R4_PREFLIGHT_EXECUTION_FILES_MUST_BE_COMMITTED');
}
async function headSha(): Promise<string> {
  return (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot })).stdout.trim();
}
async function fileSha(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(path.join(repoRoot, filePath))).digest('hex');
}
function option(name: string): string | null {
  const prefix = `${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}
function required(name: string): string {
  const value = option(name)?.trim();
  if (!value) throw new Error(`SEALED_H03_V3R4_PREFLIGHT_OPTION_REQUIRED:${name}`);
  return value;
}
function confirm(name: string, expected: string): void {
  if (option(name) !== expected) {
    throw new Error(`SEALED_H03_V3R4_PREFLIGHT_CONFIRMATION_MISMATCH:${name}`);
  }
}
function stamp(value: string): string { return value.replace(/[-:.TZ]/g, '').slice(0, 14); }
async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}
main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
