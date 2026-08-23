import { config as loadEnv } from 'dotenv';
import path from 'node:path';

import {
  REFERENCE_HOLDOUT_01_SOURCE_RELATIVE_PATH,
  buildReferenceHoldout01NativeManifestV2R,
} from '../lib/editron/research/open-ended-planner/provider-native-reference-holdout-01-v2r';
import {
  buildReferenceHoldout01NativeAuthorizationV2R,
  runReferenceHoldout01NativeVideoNoSpendPreflightV2R,
} from '../lib/editron/research/open-ended-planner/provider-native-reference-holdout-01-preflight-v2r';
import {
  runReferenceHoldout01NativeObservationV2R,
} from '../lib/editron/research/open-ended-planner/provider-native-reference-holdout-01-runner-v2r';
import type {
  ProviderNativeGoogleFlashModelV2R,
} from '../lib/editron/research/open-ended-planner/provider-native-tool-codecs-v2r';

const repoRoot = process.cwd();
loadEnv({ path: path.join(repoRoot, '.env.local'), override: false, quiet: true });
loadEnv({ path: path.join(repoRoot, '.env.local.vercel'), override: false, quiet: true });

function option(name: string): string | null {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function safeTimestamp(value: string): string {
  return value.replace(/[-:.TZ]/g, '').slice(0, 14);
}

async function main(): Promise<void> {
  const manifest = buildReferenceHoldout01NativeManifestV2R();
  const sourcePath = path.resolve(repoRoot, REFERENCE_HOLDOUT_01_SOURCE_RELATIVE_PATH);
  const providerModel = parseProviderModel(option('--model') ?? 'gemini-3.7-flash');
  const preflight = await runReferenceHoldout01NativeVideoNoSpendPreflightV2R({
    sourcePath,
    providerModel,
  });
  const runRequested = process.argv.includes('--run');
  const operatorId = option('--operator-id') ?? 'admin';
  const requiredConfirmation = {
    taskManifestSha256: manifest.manifestSha256,
    evaluatorSha256: manifest.evaluatorOnly.evaluatorSha256,
    sourceSha256: manifest.sourceBinding.bytesSha256,
    providerModel,
    sourceEgress: 'YES',
    maxInferenceCalls: 1,
  } as const;

  process.stdout.write(`${JSON.stringify({
    mode: runRequested ? 'RUN_REQUESTED' : 'NO_SPEND_PREFLIGHT',
    sourcePath,
    referenceInputManifestSha256: preflight.referenceInputManifestSha256,
    requestBytes: preflight.requestCheck.requestBytes,
    dispatchAssessment: preflight.dispatchAssessment,
    networkCalls: preflight.networkCalls,
    requiredConfirmation,
  }, null, 2)}\n`);
  if (!runRequested) return;

  assertConfirmation('--confirm-task', requiredConfirmation.taskManifestSha256);
  assertConfirmation('--confirm-evaluator', requiredConfirmation.evaluatorSha256);
  assertConfirmation('--confirm-source', requiredConfirmation.sourceSha256);
  assertConfirmation('--confirm-model', requiredConfirmation.providerModel);
  assertConfirmation('--confirm-egress', requiredConfirmation.sourceEgress);
  assertConfirmation('--confirm-one-call', 'YES');

  const approvedAt = new Date().toISOString();
  const authorization = buildReferenceHoldout01NativeAuthorizationV2R({
    operatorId,
    approvedAt,
    providerModel,
  });
  const modelLabel = providerModel === 'gemini-3.6-flash' ? 'g36' : 'g37';
  const executionId = `href01-native-${modelLabel}-${safeTimestamp(approvedAt)}`;
  const outputRoot = option('--output-root')
    ? path.resolve(option('--output-root') as string)
    : path.join(
      repoRoot,
      '.calibration-temp',
      'open-ended-planner-v2',
      `provider-native-${executionId}`,
    );
  const receipt = await runReferenceHoldout01NativeObservationV2R({
    sourcePath,
    outputRoot,
    executionId,
    authorization,
    environment: process.env,
  });
  process.stdout.write(`${JSON.stringify({
    outputRoot,
    runReceiptPath: receipt.artifacts.runReceipt,
    episodeReceiptPath: receipt.artifacts.episodeReceipt,
    transportReceiptPath: receipt.artifacts.transportReceipt,
    inferenceCalls: receipt.inferenceCalls,
    terminalDisposition: receipt.terminalDisposition,
    assessment: receipt.assessment,
    receiptSha256: receipt.receiptSha256,
  }, null, 2)}\n`);
}

function assertConfirmation(name: string, expected: string): void {
  if (option(name) !== expected) {
    throw new Error(`REFERENCE_HOLDOUT_01_NATIVE_CONFIRMATION_MISMATCH:${name}`);
  }
}

function parseProviderModel(value: string): ProviderNativeGoogleFlashModelV2R {
  if (value !== 'gemini-3.6-flash' && value !== 'gemini-3.7-flash') {
    throw new Error('REFERENCE_HOLDOUT_01_NATIVE_CLI_MODEL_UNSUPPORTED');
  }
  return value;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
