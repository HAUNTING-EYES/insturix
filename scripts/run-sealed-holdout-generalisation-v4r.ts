import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { config as loadEnv, parse as parseEnv } from 'dotenv';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { hashCanonicalJsonV1 }
  from '../lib/editron/research/open-ended-planner/contracts-v1';
import { materializeHoldoutMediaV2R, type HoldoutMediaManifestV2R }
  from '../lib/editron/research/open-ended-planner/holdout-media-materializer-v2r';
import {
  buildSealedHoldoutCohortManifestV2R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R,
} from '../lib/editron/research/open-ended-planner/sealed-holdout-cohort-v2r';
import {
  buildSealedHoldoutCohortManifestV3R,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R,
} from '../lib/editron/research/open-ended-planner/sealed-holdout-cohort-v3r';
import {
  buildSealedHoldoutCohortManifestV3R2,
  SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R2,
} from '../lib/editron/research/open-ended-planner/sealed-holdout-cohort-v3r2';
import {
  buildSealedHoldoutGeneralisationManifestV4R,
  SEALED_HOLDOUT_GENERALISATION_IMPLEMENTATION_PATHS_V4R,
  SEALED_HOLDOUT_GENERALISATION_PATH_V4R,
} from '../lib/editron/research/open-ended-planner/sealed-holdout-generalisation-cohort-v4r';
import {
  assertSealedHoldoutGeneralisationPaidAuthorizationV4R,
  issueSealedHoldoutGeneralisationPaidAuthorizationV4R,
  SEALED_HOLDOUT_GENERALISATION_ZERO_INFERENCE_GATE_V4R,
  type SealedHoldoutGeneralisationPaidAuthorizationV4R,
} from '../lib/editron/research/open-ended-planner/sealed-holdout-generalisation-paid-authorization-v4r';
import {
  assertSealedHoldoutGeneralisationPreflightReceiptV4R,
  preflightSealedHoldoutGeneralisationV4R,
  type SealedHoldoutGeneralisationPreflightReceiptV4R,
  type SealedHoldoutGeneralisationRequestCaptureV4R,
} from '../lib/editron/research/open-ended-planner/sealed-holdout-generalisation-preflight-v4r';
import {
  runSealedHoldoutPaidCohortV4R,
} from '../lib/editron/research/open-ended-planner/sealed-holdout-paid-cohort-runner-v2r';

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const scriptPath = 'scripts/run-sealed-holdout-generalisation-v4r.ts';
const MAX_ROW_SPEND_MICRO_USD = 10_000_000;
const MAX_COHORT_SPEND_MICRO_USD = 75_000_000;
const executionPaths = [...new Set([
  ...SEALED_HOLDOUT_GENERALISATION_IMPLEMENTATION_PATHS_V4R,
  SEALED_HOLDOUT_GENERALISATION_PATH_V4R,
  scriptPath,
])] as const;

async function main(): Promise<void> {
  const mode = required('--mode');
  if (mode !== 'preflight' && mode !== 'execute') fail('SEALED_V4R_MODE_INVALID');
  const operatorId = required('--operator-id');
  loadEnv({ path: path.join(repoRoot, '.env.local'), override: false, quiet: true });
  await overlayProductionGoogle(option('--production-env-file')
    ?? path.join(repoRoot, '.env.local.prod'));
  await assertExecutionFilesCommitted();
  const input = await buildInput();
  confirm('--confirm-manifest', input.generalisationManifest.manifestSha256);
  if (mode === 'preflight') return runPreflight(input, operatorId);
  return runPaid(input, operatorId);
}

async function runPreflight(input: Awaited<ReturnType<typeof buildInput>>,
  operatorId: string): Promise<void> {
  if (process.argv.some((value) => value.startsWith('--execute-paid-cohort='))) {
    fail('SEALED_V4R_PREFLIGHT_INFERENCE_FLAG_FORBIDDEN');
  }
  const outputRoot = path.resolve(required('--output-root'));
  await mkdir(path.dirname(outputRoot), { recursive: true });
  await mkdir(outputRoot, { recursive: false });
  const preflight = await preflightSealedHoldoutGeneralisationV4R({
    ...input,
    authorization: {
      operatorId,
      generalisationManifestSha256: input.generalisationManifest.manifestSha256,
      permittedNetworkActions: ['MODEL_METADATA_GET', 'GOOGLE_COUNT_TOKENS'],
      inferenceCalls: 0,
    },
    environment: process.env,
  });
  const createdAt = new Date().toISOString();
  const material = {
    version: 'EDITRON_OE_STAGE25_GENERALISATION_OPERATOR_PREFLIGHT_V4R_1',
    authority: 'OPERATOR_ZERO_INFERENCE_PREFLIGHT_NO_DISPATCH_NO_PROJECT_AUTHORITY',
    operatorId, createdAt, implementationCommitSha: await headSha(),
    runnerSourceSha256: await fileSha(scriptPath),
    generalisationManifestSha256: input.generalisationManifest.manifestSha256,
    preflightReceiptSha256: preflight.receipt.receiptSha256,
    requestCaptureSetSha256: preflight.receipt.requestCaptureSetSha256,
    networkCalls: preflight.receipt.networkCalls,
    dispatchAuthorized: false, inferenceCalls: 0, projectReads: 0,
    projectMutations: 0, secretsPersisted: false, stateEffects: [] as const,
  };
  await Promise.all([
    writeJson(path.join(outputRoot, 'base-manifest.json'), input.baseManifest),
    writeJson(path.join(outputRoot, 'generalisation-manifest.json'), input.generalisationManifest),
    writeJson(path.join(outputRoot, 'request-captures.json'), preflight.requestCaptures),
    writeJson(path.join(outputRoot, 'preflight-receipt.json'), preflight.receipt),
    writeJson(path.join(outputRoot, 'operator-preflight-receipt.json'), {
      ...material, receiptSha256: hash(material),
    }),
  ]);
  print({ mode: 'V4R_ZERO_INFERENCE_PREFLIGHT_COMPLETE', outputRoot,
    manifestSha256: input.generalisationManifest.manifestSha256,
    preflightReceiptSha256: preflight.receipt.receiptSha256,
    requestCaptureSetSha256: preflight.receipt.requestCaptureSetSha256,
    networkCalls: preflight.receipt.networkCalls, inferenceCalls: 0,
    dispatchAuthorized: false });
}

async function runPaid(input: Awaited<ReturnType<typeof buildInput>>,
  operatorId: string): Promise<void> {
  confirm('--execute-paid-cohort', 'YES_I_CONFIRM_45_V4R_ROWS');
  confirm('--confirm-max-usd', '75');
  const preflightRoot = path.resolve(required('--preflight-root'));
  const outputRoot = path.resolve(required('--output-root'));
  const preflight = assertSealedHoldoutGeneralisationPreflightReceiptV4R({
    manifest: input.generalisationManifest,
    value: await readJson(path.join(preflightRoot, 'preflight-receipt.json')),
  });
  const requestCaptures = await readJson(
    path.join(preflightRoot, 'request-captures.json'),
  ) as SealedHoldoutGeneralisationRequestCaptureV4R[];
  confirm('--confirm-preflight', preflight.receiptSha256);
  confirm('--confirm-capture-set', preflight.requestCaptureSetSha256);
  await mkdir(outputRoot, { recursive: true });
  const authorization = await loadOrIssueAuthorization({
    input, preflight, operatorId, outputRoot,
  });
  const mediaManifest = await loadOrMaterializeMedia(outputRoot);
  const receipt = await runSealedHoldoutPaidCohortV4R({
    ...input, credentialPreflight: preflight, requestCaptures,
    paidAuthorization: authorization, mediaManifest, outputRoot,
    implementationCommitSha: await headSha(),
    runnerSourceSha256: await fileSha(scriptPath), environment: process.env,
  });
  print({ mode: 'V4R_PAID_COHORT_COMPLETE', outputRoot,
    receiptSha256: receipt.receiptSha256, rowCount: receipt.rowCount,
    statusCounts: receipt.statusCounts, providerInferenceCalls: receipt.providerInferenceCalls,
    providerTurns: receipt.providerTurns, googleCountTokensCalls: receipt.googleCountTokensCalls,
    spentUsd: receipt.spentNanoUsd / 1_000_000_000,
    projectReads: receipt.projectReads, projectMutations: receipt.projectMutations });
}

async function loadOrIssueAuthorization(input: {
  input: Awaited<ReturnType<typeof buildInput>>;
  preflight: Readonly<SealedHoldoutGeneralisationPreflightReceiptV4R>;
  operatorId: string; outputRoot: string;
}): Promise<Readonly<SealedHoldoutGeneralisationPaidAuthorizationV4R>> {
  const authorizationPath = path.join(input.outputRoot, 'paid-authorization.json');
  if (await exists(authorizationPath)) {
    return assertSealedHoldoutGeneralisationPaidAuthorizationV4R({
      generalisationManifest: input.input.generalisationManifest,
      baseManifest: input.input.baseManifest, preflight: input.preflight,
      authorization: await readJson(authorizationPath),
    });
  }
  const approvedAt = new Date().toISOString();
  const authorization = issueSealedHoldoutGeneralisationPaidAuthorizationV4R({
    generalisationManifest: input.input.generalisationManifest,
    baseManifest: input.input.baseManifest, preflight: input.preflight,
    approval: {
      operatorId: input.operatorId, approvedAt,
      expiresAt: new Date(Date.parse(approvedAt) + 86_340_000).toISOString(),
      confirmedGeneralisationManifestSha256: input.input.generalisationManifest.manifestSha256,
      confirmedPreflightReceiptSha256: input.preflight.receiptSha256,
      confirmedRequestCaptureSetSha256: input.preflight.requestCaptureSetSha256,
      zeroInferenceGate: SEALED_HOLDOUT_GENERALISATION_ZERO_INFERENCE_GATE_V4R,
      maxSpendMicroUsdPerRow: MAX_ROW_SPEND_MICRO_USD,
      absoluteMaxCohortSpendMicroUsd: MAX_COHORT_SPEND_MICRO_USD,
    },
  });
  await writeJson(authorizationPath, authorization);
  return authorization;
}

async function buildInput() {
  const v2 = buildSealedHoldoutCohortManifestV2R(
    await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V2R));
  const v3 = buildSealedHoldoutCohortManifestV3R({
    contractSourceSha256: await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R),
    baseManifest: v2,
  });
  const baseManifest = buildSealedHoldoutCohortManifestV3R2({
    contractSourceSha256: await fileSha(SEALED_HOLDOUT_COHORT_CONTRACT_PATH_V3R2),
    baseManifest: v3,
  });
  const implementationBindings = await Promise.all(
    SEALED_HOLDOUT_GENERALISATION_IMPLEMENTATION_PATHS_V4R.map(async (item) => ({
      path: item, sha256: await fileSha(item),
    })),
  );
  const generalisationManifest = buildSealedHoldoutGeneralisationManifestV4R({
    contractSourceSha256: await fileSha(SEALED_HOLDOUT_GENERALISATION_PATH_V4R),
    baseManifest, implementationBindings,
  });
  return { baseManifest, generalisationManifest };
}

async function loadOrMaterializeMedia(outputRoot: string): Promise<Readonly<HoldoutMediaManifestV2R>> {
  const manifestPath = path.join(outputRoot, 'media', 'manifest.json');
  if (await exists(manifestPath)) return await readJson(manifestPath) as HoldoutMediaManifestV2R;
  return materializeHoldoutMediaV2R(path.join(outputRoot, 'media'));
}
async function overlayProductionGoogle(filePath: string): Promise<void> {
  const parsed = parseEnv(await readFile(path.resolve(filePath)));
  for (const name of ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY'] as const) {
    const value = parsed[name]?.trim(); if (value) process.env[name] = value;
  }
}
async function assertExecutionFilesCommitted(): Promise<void> {
  const { stdout } = await execFileAsync('git', ['status', '--porcelain', '--', ...executionPaths],
    { cwd: repoRoot });
  if (stdout.trim()) fail('SEALED_V4R_EXECUTION_FILES_MUST_BE_COMMITTED');
}
async function headSha(): Promise<string> {
  return (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot })).stdout.trim();
}
async function fileSha(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(path.resolve(repoRoot, filePath))).digest('hex');
}
async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
}
async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}
async function exists(filePath: string): Promise<boolean> {
  try { await access(filePath); return true; } catch { return false; }
}
function option(name: string): string | null {
  const prefix = `${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}
function required(name: string): string {
  const value = option(name)?.trim(); if (!value) fail(`SEALED_V4R_OPTION_REQUIRED:${name}`);
  return value;
}
function confirm(name: string, expected: string): void {
  if (option(name) !== expected) fail(`SEALED_V4R_CONFIRMATION_MISMATCH:${name}`);
}
function hash(value: unknown): string {
  return hashCanonicalJsonV1(value);
}
function print(value: unknown): void { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }
function fail(code: string): never { throw new Error(code); }

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
