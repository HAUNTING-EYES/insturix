import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { parse as parseEnv } from 'dotenv';

import { hashCanonicalJsonV1 }
  from '../../../lib/editron/research/open-ended-planner/contracts-v1';
import { STAGE25_FINAL_GENERALISATION_COHORT_V1 }
  from '../../../lib/editron/research/open-ended-planner/stage25-final-generalisation-cohort-v1';
import { preflightStage25FinalGeneralisationProvidersV1 }
  from '../../../lib/editron/research/open-ended-planner/stage25-final-generalisation-provider-preflight-v1';
import {
  STAGE25_FINAL_GENERALISATION_PROVIDER_CREDENTIAL_NAMES_V1,
  STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_FILES_V1,
  finalizeStage25FinalGeneralisationProviderSourceGateV1,
} from '../../../lib/editron/research/open-ended-planner/stage25-final-generalisation-provider-source-gate-v1';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const VITEST_CLI = require.resolve('vitest/vitest.mjs');
const VITEST_PACKAGE = require.resolve('vitest/package.json');
export const STAGE25_FINAL_PROVIDER_SOURCE_SCOPES_V1 = [
  'lib/editron', 'tests/editron', 'components/editron', 'package.json', 'pnpm-lock.yaml',
] as const;

export async function runStage25FinalProviderPreflightOperatorV1(input: {
  workspaceRoot: string;
  artifactParent: string;
  operatorId: string;
  localEnvironmentFile?: string;
  productionEnvironmentFile?: string;
  executionSuffix?: string;
}) {
  const source = await stage25FinalProviderSourceIdentityV1(input.workspaceRoot);
  if (source.relevantStatusEntries.length) fail('SOURCE_SCOPE_DIRTY');
  const suffix = input.executionSuffix ?? 'v1';
  if (!/^v[1-9]\d*$/.test(suffix)) fail('EXECUTION_SUFFIX_INVALID');
  const executionId = `stage25-final-provider-preflight-${source.commitSha.slice(0, 9)}-${suffix}`;
  const executionRoot = path.resolve(input.artifactParent, executionId);
  await mkdir(input.artifactParent, { recursive: true });
  await mkdir(executionRoot);
  const reportPath = path.join(executionRoot, 'vitest-report.json');
  const startedAt = new Date().toISOString();
  const testEnvironment: NodeJS.ProcessEnv = { ...process.env, CI: '1' };
  for (const name of STAGE25_FINAL_GENERALISATION_PROVIDER_CREDENTIAL_NAMES_V1) {
    delete testEnvironment[name];
  }
  await execFileAsync(process.execPath, [
    VITEST_CLI, 'run', ...STAGE25_FINAL_GENERALISATION_PROVIDER_TEST_FILES_V1,
    '--reporter=json', `--outputFile=${reportPath}`,
  ], { cwd: input.workspaceRoot, env: testEnvironment, windowsHide: true,
    timeout: 300_000, maxBuffer: 16 * 1024 * 1024 });
  const report = JSON.parse(await readFile(reportPath, 'utf8')) as unknown;
  const environment = await loadCredentials(input);
  const bundle = await preflightStage25FinalGeneralisationProvidersV1({
    confirmedCohortSha256: STAGE25_FINAL_GENERALISATION_COHORT_V1.cohortSha256,
    operatorId: input.operatorId, environment,
  });
  const providerBytes = jsonBytes(bundle.receipt);
  const captureBytes = jsonBytes(bundle.captures);
  const vitestPackage = JSON.parse(await readFile(VITEST_PACKAGE, 'utf8')) as {
    version?: unknown;
  };
  if (typeof vitestPackage.version !== 'string') fail('VITEST_VERSION_INVALID');
  const receipt = finalizeStage25FinalGeneralisationProviderSourceGateV1({
    source,
    toolchain: { nodeVersion: process.version, vitestVersion: vitestPackage.version },
    testRun: { startedAt, completedAt: new Date().toISOString(), report,
      runnerExitCode: 0, automaticRetryCount: 0,
      credentialNamesScrubbed: [
        ...STAGE25_FINAL_GENERALISATION_PROVIDER_CREDENTIAL_NAMES_V1,
      ] },
    providerBundle: bundle,
    providerReceiptFileSha256: sha(providerBytes),
    requestCapturesFileSha256: sha(captureBytes),
  });
  const providerPath = path.join(executionRoot, 'provider-preflight-receipt.json');
  const capturesPath = path.join(executionRoot, 'request-captures.json');
  const receiptPath = path.join(executionRoot, 'readiness-receipt.json');
  await Promise.all([
    writeFile(providerPath, providerBytes, { flag: 'wx' }),
    writeFile(capturesPath, captureBytes, { flag: 'wx' }),
    writeFile(receiptPath, jsonBytes(receipt), { flag: 'wx' }),
  ]);
  return { executionId, executionRoot, reportPath, providerPath, capturesPath,
    receiptPath, receiptSha256: receipt.receiptSha256,
    providerPreflightReceiptSha256: bundle.receipt.receiptSha256,
    requestCaptureSetSha256: bundle.receipt.requestCaptureSetSha256,
    networkCalls: bundle.receipt.networkCalls,
    initialAttemptCostUpperBoundUsd: bundle.receipt.initialAttemptCostUpperBoundUsd,
    absoluteTwoAttemptMaxSpendUsd: bundle.receipt.absoluteTwoAttemptMaxSpendUsd };
}

async function loadCredentials(input: {
  workspaceRoot: string;
  localEnvironmentFile?: string;
  productionEnvironmentFile?: string;
}) {
  const localPath = path.resolve(input.localEnvironmentFile
    ?? path.join(input.workspaceRoot, '.env.local'));
  const productionPath = path.resolve(input.productionEnvironmentFile
    ?? path.join(input.workspaceRoot, '.env.local.prod'));
  const [local, production] = await Promise.all([
    readFile(localPath).then(parseEnv), readFile(productionPath).then(parseEnv),
  ]);
  return {
    OPENAI_API_KEY: secret(local.OPENAI_API_KEY, 'LOCAL_OPENAI_API_KEY'),
    GOOGLE_GENERATIVE_AI_API_KEY: secret(
      production.GOOGLE_GENERATIVE_AI_API_KEY,
      'PRODUCTION_GOOGLE_GENERATIVE_AI_API_KEY',
    ),
  };
}
export async function stage25FinalProviderSourceIdentityV1(workspaceRoot: string) {
  const commitSha = await git(workspaceRoot, ['rev-parse', 'HEAD']);
  const treeSha = await git(workspaceRoot, ['rev-parse', 'HEAD^{tree}']);
  const relevantStatusEntries = lines(await git(workspaceRoot, [
    'status', '--porcelain=v1', '--untracked-files=all', '--',
    ...STAGE25_FINAL_PROVIDER_SOURCE_SCOPES_V1,
  ]));
  const tracked = lines(await git(workspaceRoot, [
    'ls-files', '-s', '--', ...STAGE25_FINAL_PROVIDER_SOURCE_SCOPES_V1,
  ]));
  if (!tracked.length) fail('SOURCE_SCOPE_EMPTY');
  return { commitSha, treeSha, relevantScopeSha256: hashCanonicalJsonV1(tracked),
    relevantTrackedFileCount: tracked.length, relevantStatusEntries };
}
async function git(root: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', [...args], { cwd: root,
    windowsHide: true, timeout: 30_000, maxBuffer: 12 * 1024 * 1024 });
  return result.stdout.trim();
}
function jsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function sha(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
function secret(value: string | undefined, code: string): string {
  const result = value?.trim(); if (!result) fail(`SECRET_MISSING:${code}`); return result;
}
function lines(value: string): string[] { return value ? value.split(/\r?\n/).filter(Boolean) : []; }
function fail(code: string): never { throw new Error(`STAGE25_FINAL_PROVIDER_OPERATOR_${code}`); }
async function main(): Promise<void> {
  const artifactParent = process.argv[2]; const operatorId = process.argv[3];
  if (!artifactParent || !operatorId) fail('USAGE_ARTIFACT_PARENT_AND_OPERATOR_REQUIRED');
  const result = await runStage25FinalProviderPreflightOperatorV1({
    workspaceRoot: process.cwd(), artifactParent: path.resolve(artifactParent), operatorId,
    ...(process.argv[4] ? { executionSuffix: process.argv[4] } : {}),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invoked && invoked === path.resolve(fileURLToPath(import.meta.url))) await main();
